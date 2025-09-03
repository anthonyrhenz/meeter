from __future__ import annotations

import json
import os
import asyncio
import queue
import threading
from typing import Iterator, List, Optional
from datetime import datetime

import requests
from asgiref.sync import sync_to_async
from django.db import transaction
from django.db.models import Count
from django.http import StreamingHttpResponse
from ninja import Router, Schema

from .models import Conversation, Message


router = Router()


class MessageIn(Schema):
    role: str
    content: str


class ChatRequest(Schema):
    conversation_id: Optional[int] = None
    messages: List[MessageIn]
    model: Optional[str] = None  # proxy model alias; fallback to env


class ErrorOut(Schema):
    message: str


_VALID_ROLES = {"system", "user", "assistant", "tool"}


def _validate_messages(payload: ChatRequest) -> Optional[str]:
    if not payload.messages:
        return "messages must be a non-empty list"
    for i, m in enumerate(payload.messages):
        if not m.role or m.role not in _VALID_ROLES:
            return f"messages[{i}].role must be one of: system,user,assistant,tool"
        if not isinstance(m.content, str) or not m.content.strip():
            return f"messages[{i}].content must be a non-empty string"
    return None


def _running_in_docker() -> bool:
    try:
        return os.path.exists("/.dockerenv")
    except Exception:
        return False


def _litellm_base_url() -> str:
    # Prefer explicit env, unless it's localhost while in Docker
    env_url = os.getenv("LITELLM_BASE_URL")
    if env_url:
        if _running_in_docker() and ("localhost" in env_url or "127.0.0.1" in env_url):
            return "http://llm_proxy:4000"
        return env_url
    return "http://llm_proxy:4000" if _running_in_docker() else "http://localhost:41337"


def _litellm_api_key() -> str:
    # Using master key if configured for proxy auth; optional
    return os.getenv("LITELLM_MASTER_KEY", "")


def _proxy_stream_chat_sync(model: str, messages: list[dict]) -> Iterator[bytes]:
    url = f"{_litellm_base_url().rstrip('/')}/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if _litellm_api_key():
        headers["Authorization"] = f"Bearer {_litellm_api_key()}"

    payload = {
        "model": model,
        "messages": messages,
        "stream": True,
        "stream_options": {"include_usage": True},
    }

    with requests.post(url, headers=headers, json=payload, stream=True, timeout=None) as resp:
        resp.raise_for_status()
        for chunk in resp.iter_content(chunk_size=None):
            if not chunk:
                continue
            yield chunk


@sync_to_async(thread_sensitive=True)
def _load_history_payload(conversation_id: int) -> list[dict]:
    return list(
        Message.objects.filter(conversation_id=conversation_id)
        .order_by("created_at")
        .values("role", "content")
    )


async def _maybe_set_title(conversation_id: int, last_user: str, assistant_text: str) -> None:
    @sync_to_async(thread_sensitive=True)
    def _needs_title() -> bool:
        conv = Conversation.objects.get(pk=conversation_id)
        return not bool(conv.title)

    try:
        if not await _needs_title():
            return
    except Conversation.DoesNotExist:
        return

    model = "groq-llama3-8b"

    title_model = os.getenv("TITLE_MODEL", model)
    sys_prompt = (
        "You are a helpful assistant that generates short conversation titles. "
        "Create a concise title (max 5 words) that starts with an emoji and summarizes the user's question and assistant's answer. "
        "Return ONLY the title text."
    )
    msgs = [
        {"role": "system", "content": sys_prompt},
        {"role": "user", "content": last_user[:1000] if last_user else ""},
        {"role": "assistant",
            "content": assistant_text[:1000] if assistant_text else ""},
    ]

    url = f"{_litellm_base_url().rstrip('/')}/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if _litellm_api_key():
        headers["Authorization"] = f"Bearer {_litellm_api_key()}"
    payload = {"model": title_model, "messages": msgs}

    try:
        resp = await asyncio.to_thread(requests.post, url, headers=headers, json=payload, timeout=30)
        resp.raise_for_status()
        data = resp.json() or {}
        choice0 = (data or {}).get("choices", [{}])[0]
        msg = choice0.get("message") or {}
        title = (msg.get("content") or choice0.get("text") or "").strip()
    except Exception:
        title = ""

    if not title:
        return

    @sync_to_async(thread_sensitive=True)
    def _save_title() -> None:
        Conversation.objects.filter(pk=conversation_id).update(title=title)

    await _save_title()


@router.post("/stream", response={200: None, 400: ErrorOut, 404: ErrorOut})
async def chat_stream(request, body: ChatRequest):
    model = body.model or "groq-gpt-oss-20b"

    # Validate messages
    msg_err = _validate_messages(body)
    if msg_err:
        return 400, {"message": msg_err}

    # If existing conversation specified, ensure it exists
    if body.conversation_id:
        exists = await sync_to_async(Conversation.objects.filter(pk=body.conversation_id).exists, thread_sensitive=True)()
        if not exists:
            return 404, {"message": "Conversation not found"}

    # Persist incoming user messages and create conversation if needed (sync ORM)
    @transaction.atomic
    def _save_messages() -> int:
        conversation: Conversation
        if body.conversation_id:
            conversation = Conversation.objects.select_for_update().get(pk=body.conversation_id)
        else:
            conversation = Conversation.objects.create(
                owner=request.user if request.user.is_authenticated else None)
        for m in body.messages:
            Message.objects.create(
                conversation=conversation, role=m.role, content=m.content)
        return conversation.id

    conversation_id = await sync_to_async(_save_messages, thread_sensitive=True)()

    # Load full conversation history after persisting user messages
    messages_payload = await _load_history_payload(conversation_id)

    # Find last user text for potential title generation
    last_user_text = ""
    for m in reversed(messages_payload):
        if m.get("role") == "user":
            last_user_text = m.get("content", "")
            break

    async def event_stream():
        q: "queue.Queue[object]" = queue.Queue(maxsize=100)
        assistant_parts: list[str] = []
        emitted_any = False

        def producer():
            parse_buf = ""
            saw_done = False
            try:
                for chunk in _proxy_stream_chat_sync(model, messages_payload):
                    # Decode to check for the LiteLLM error chunk before forwarding.
                    is_error_chunk = False
                    try:
                        # The error chunk looks like: data: {"error": {"message": "litellm.APIConnectionError..."}}
                        text_chunk = chunk.decode("utf-8")
                        if '"error"' in text_chunk and "litellm.APIConnectionError" in text_chunk:
                            is_error_chunk = True
                    except Exception:
                        # Not a valid UTF-8 string, so not our specific error JSON.
                        pass

                    if is_error_chunk:
                        # Don't forward this chunk to the client.
                        # Break the loop; the finally block will close the stream cleanly.
                        break

                    # Pass-through valid chunks to client
                    q.put(chunk)

                    # Best-effort parse SSE to accumulate assistant content
                    try:
                        text = chunk.decode("utf-8", errors="ignore")
                    except Exception:
                        text = ""
                    if text:
                        parse_buf_local = parse_buf + text
                        lines = parse_buf_local.split("\n")
                        # Keep the last partial line (no trailing newline)
                        parse_buf_local_tail = ""
                        if not parse_buf_local.endswith("\n"):
                            parse_buf_local_tail = lines.pop() if lines else parse_buf_local
                        for line in lines:
                            if line.startswith("data:"):
                                payload = line[len("data:"):].strip()
                                if payload == "[DONE]":
                                    saw_done = True
                                elif payload:
                                    try:
                                        obj = json.loads(payload)
                                        # OpenAI-style delta
                                        delta = obj.get("choices", [{}])[
                                            0].get("delta", {})
                                        content_piece = delta.get("content")
                                        if content_piece:
                                            assistant_parts.append(
                                                content_piece)
                                        # Some providers send message.content directly
                                        msg = obj.get("choices", [{}])[
                                            0].get("message", {})
                                        if not content_piece and isinstance(msg, dict):
                                            cp = msg.get("content")
                                            if cp:
                                                assistant_parts.append(cp)
                                    except Exception:
                                        # Ignore parse errors; stream to client continues
                                        pass
                        # Update buffer tail
                        parse_buf = parse_buf_local_tail
                    # Stop early if we saw end-of-stream sentinel in parsed lines
                    if saw_done:
                        break
            except requests.HTTPError as http_err:  # Upstream returned non-2xx before any chunks
                # Try to forward a structured error SSE event to client
                try:
                    resp = getattr(http_err, "response", None)
                    status_code = getattr(resp, "status_code", None)
                    err_obj: dict
                    if resp is not None:
                        try:
                            err_json = resp.json() or {}
                        except Exception:
                            err_json = {}
                        # Normalize into a consistent error shape
                        if isinstance(err_json, dict) and err_json.get("error"):
                            err_obj = {"error": err_json.get("error")}
                        else:
                            err_obj = {"error": {"message": (resp.text or "Upstream provider error")[
                                :500], "status": status_code}}
                    else:
                        err_obj = {"error": {"message": str(
                            http_err)[:500] or "Upstream provider error"}}
                    q.put(f"data: {json.dumps(err_obj)}\n\n".encode("utf-8"))
                    q.put(b"data: [DONE]\n\n")
                except Exception as _:
                    # Fallback to generic exception path
                    q.put(http_err)
            except Exception as exc:  # noqa: BLE001
                q.put(exc)
            finally:
                q.put(None)

        t = threading.Thread(target=producer, daemon=True)
        t.start()

        # Send initial comment to open the SSE stream promptly
        yield b":ok\n\n"
        # Send initial meta event with conversation id so clients can capture it early
        try:
            meta_payload = json.dumps(
                {"meta": {"conversation_id": conversation_id}})
            yield f"data: {meta_payload}\n\n".encode("utf-8")
        except Exception:
            # Ignore failures to serialize meta; streaming continues
            pass

        while True:
            item = await asyncio.to_thread(q.get)
            if item is None:
                # Persist assistant content at end of stream
                if assistant_parts:
                    assistant_text = "".join(assistant_parts)

                    def _save_assistant() -> None:
                        Message.objects.create(
                            conversation_id=conversation_id,
                            role="assistant",
                            content=assistant_text,
                        )

                    await sync_to_async(_save_assistant, thread_sensitive=True)()
                    await _maybe_set_title(conversation_id, last_user_text, assistant_text)
                break
            if isinstance(item, Exception):
                # If content was already sent, swallow and end; if not, emit a clean error then close.
                if not emitted_any:
                    err_payload = json.dumps(
                        {"message": "Failed to start stream with the provider."})
                    yield f"data: {err_payload}\n\n".encode("utf-8")
                yield b"data: [DONE]\n\n"
                break
            emitted_any = True
            yield item

    response = StreamingHttpResponse(
        event_stream(), content_type="text/event-stream; charset=utf-8")
    response["Cache-Control"] = "no-cache, no-transform"
    response["Connection"] = "keep-alive"
    # Nginx: disable proxy buffering for this response
    response["X-Accel-Buffering"] = "no"
    # Expose the conversation id for the client to persist
    try:
        response["X-Conversation-Id"] = str(conversation_id)
    except Exception:
        pass
    return response


@router.post("/complete", response={200: dict, 400: ErrorOut, 404: ErrorOut, 502: ErrorOut})
async def chat_complete(request, body: ChatRequest):
    model = body.model or "groq-gpt-oss-20b"

    # Validate messages
    msg_err = _validate_messages(body)
    if msg_err:
        return 400, {"message": msg_err}

    # Ensure conversation exists if id provided
    if body.conversation_id:
        exists = await sync_to_async(Conversation.objects.filter(pk=body.conversation_id).exists, thread_sensitive=True)()
        if not exists:
            return 404, {"message": "Conversation not found"}

    @transaction.atomic
    def _save_user_messages() -> int:
        conversation: Conversation
        if body.conversation_id:
            conversation = Conversation.objects.select_for_update().get(pk=body.conversation_id)
        else:
            conversation = Conversation.objects.create(
                owner=request.user if request.user.is_authenticated else None)
        for m in body.messages:
            Message.objects.create(
                conversation=conversation, role=m.role, content=m.content)
        return conversation.id

    conversation_id = await sync_to_async(_save_user_messages, thread_sensitive=True)()

    # Load full history after saving user messages
    messages_payload = await _load_history_payload(conversation_id)

    # Last user text for title generation
    last_user_text = ""
    for m in reversed(messages_payload):
        if m.get("role") == "user":
            last_user_text = m.get("content", "")
            break

    url = f"{_litellm_base_url().rstrip('/')}/v1/chat/completions"
    headers = {"Content-Type": "application/json"}
    if _litellm_api_key():
        headers["Authorization"] = f"Bearer {_litellm_api_key()}"
    payload = {"model": model, "messages": messages_payload}

    try:
        resp = await asyncio.to_thread(
            requests.post, url, headers=headers, json=payload, timeout=None
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return 502, {"message": "Upstream provider error"}

    # Extract assistant content and persist
    content = None
    try:
        choice0 = (data or {}).get("choices", [{}])[0]
        msg = choice0.get("message") or {}
        content = msg.get("content") or choice0.get("text")
    except Exception:
        content = None
    if content:
        @sync_to_async(thread_sensitive=True)
        def _save_assistant_complete() -> None:
            Message.objects.create(
                conversation_id=conversation_id,
                role="assistant",
                content=content,
            )

        await _save_assistant_complete()
        await _maybe_set_title(conversation_id, last_user_text, content)

    # Include conversation id in the returned JSON for clients of non-streaming endpoint
    try:
        if isinstance(data, dict):
            data.setdefault("conversation_id", conversation_id)
    except Exception:
        pass
    return data


# --------- Conversation CRUD for React frontend ---------
class ConversationOut(Schema):
    id: int
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    message_count: int


class ConversationUpdateIn(Schema):
    title: Optional[str] = None


@router.get("/conversations", response=List[ConversationOut])
async def list_conversations(request):
    @sync_to_async(thread_sensitive=True)
    def _list():
        qs = (
            Conversation.objects.all()
            .annotate(message_count=Count("messages"))
            .order_by("-updated_at")
            .values("id", "title", "created_at", "updated_at", "message_count")
        )
        return list(qs)

    return await _list()


class MessageOut(Schema):
    role: str
    content: str
    created_at: datetime


class ConversationDetailOut(Schema):
    id: int
    title: Optional[str]
    created_at: datetime
    updated_at: datetime
    messages: List[MessageOut]


@router.get("/conversations/{conversation_id}", response={200: ConversationDetailOut, 404: ErrorOut})
async def get_conversation(request, conversation_id: int):
    @sync_to_async(thread_sensitive=True)
    def _detail():
        try:
            conv = Conversation.objects.get(pk=conversation_id)
        except Conversation.DoesNotExist:
            return None
        msgs = list(
            Message.objects.filter(conversation_id=conversation_id)
            .order_by("created_at")
            .values("role", "content", "created_at")
        )
        return {
            "id": conv.id,
            "title": conv.title,
            "created_at": conv.created_at,
            "updated_at": conv.updated_at,
            "messages": msgs,
        }

    data = await _detail()
    if data is None:
        return 404, {"message": "Conversation not found"}
    return data


@router.post("/conversations", response=ConversationOut)
async def create_conversation(request):
    @sync_to_async(thread_sensitive=True)
    def _create():
        conv = Conversation.objects.create(
            owner=request.user if request.user.is_authenticated else None
        )
        return {
            "id": conv.id,
            "title": conv.title,
            "created_at": conv.created_at,
            "updated_at": conv.updated_at,
            "message_count": 0,
        }

    return await _create()


@router.patch("/conversations/{conversation_id}", response={200: ConversationOut, 400: ErrorOut, 404: ErrorOut})
async def update_conversation(request, conversation_id: int, payload: ConversationUpdateIn):
    if payload.title is None or not isinstance(payload.title, str) or not payload.title.strip():
        return 400, {"message": "title must be a non-empty string"}

    @sync_to_async(thread_sensitive=True)
    def _update():
        if not Conversation.objects.filter(pk=conversation_id).exists():
            return None
        Conversation.objects.filter(pk=conversation_id).update(
            title=payload.title.strip())
        conv = (
            Conversation.objects.annotate(message_count=Count("messages"))
            .values("id", "title", "created_at", "updated_at", "message_count")
            .get(pk=conversation_id)
        )
        return conv

    data = await _update()
    if data is None:
        return 404, {"message": "Conversation not found"}
    return data


@router.delete("/conversations/{conversation_id}", response={204: None, 404: ErrorOut})
async def delete_conversation(request, conversation_id: int):
    @sync_to_async(thread_sensitive=True)
    def _delete() -> bool:
        deleted, _ = Conversation.objects.filter(pk=conversation_id).delete()
        return bool(deleted)

    ok = await _delete()
    if not ok:
        return 404, {"message": "Conversation not found"}
    return 204, None
