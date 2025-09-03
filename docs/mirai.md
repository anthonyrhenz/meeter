# Mirai Chat Interface

This document captures the current design and implementation details for the Mirai chat UI and its connection to the backend streaming API.

## Overview

- Component: `MiraiChat` in `frontend/src/App.tsx`
- Styles: `frontend/src/styles.css` (classes prefixed with `chat__`)
- Backend: Django Ninja router in `backend/apps/chat/api.py`
- Reference: [Meeter API OpenAPI JSON](https://meeter.ngrok.dev/api/openapi.json)

## UI / UX behavior

- Full-height layout: Mirai fills its pane; the composer is bottom-anchored.
  - Key containers use `flex: 1 1 auto` and `min-height: 0` to keep scroll localized to the messages list and avoid pushing the titlebar.
  - Relevant classes: `.app-root`, `.shell`, `.content`, `.views`, `.mirai`, `.chat`, `.chat__messages`.
- Autosizing textarea: Starts at 3 lines and grows to 7, then scrolls (manual resize disabled).
- Keyboard: Ctrl/Cmd+Enter sends when not streaming.
- Auto-scroll: Smoothly scrolls to the latest message.
- Custom scrollbars: Styled for messages and textarea.
- Mic button: Present and centered; no behavior yet (reserved for live audio/sockets).
- Streaming state: During send, shows Stop (abort) and disables new sends/shortcut.

## Data model

- Frontend message type: `ChatMessage = { id: string; role: 'user' | 'assistant' | 'system'; content: string }`.
- Valid roles (backend): `system`, `user`, `assistant`, `tool`.

## Backend API (chat)

### POST /api/chat/stream (SSE)

- Request body (`ChatRequest`):
  - `conversation_id?: number` (optional)
  - `messages: { role: string; content: string }[]` (required; non-empty strings; roles must be in the set above)
  - `model?: string` (optional; default: `"groq-llama3-8b-8192"`)
- Behavior:
  - Validates messages and optional `conversation_id`.
  - Creates a conversation if none provided; saves incoming user messages.
  - Loads full conversation history and forwards to the LiteLLM proxy using OpenAI-compatible chat-completions with `stream=true` and `stream_options.include_usage=true`.
  - Streams provider chunks back to the client as-is via SSE. An initial comment `:ok` is emitted to open the stream quickly.
  - Parses chunks best-effort to accumulate assistant content; persists a final assistant message when stream ends; may generate a short emoji-prefixed title for the conversation using `TITLE_MODEL` (falls back to selected `model`).
- Error semantics:
  - If the upstream proxy emits a known LiteLLM connection error (`litellm.APIConnectionError` in chunk), the server swallows the bad chunk and closes the stream cleanly.
  - If streaming fails before any content is emitted, server sends `data: {"message":"Failed to start stream with the provider."}` followed by `data: [DONE]`.
  - Headers include `X-Accel-Buffering: no`, `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`.
- Client notes:
  - Consume by reading lines starting with `data:` and JSON-decoding payloads.
  - End of stream indicated by `data: [DONE]`.
  - Providers may send `choices[0].delta.content` or occasionally `choices[0].message.content`. Current UI appends only `delta.content`; add a fallback to `message.content` if needed later.

### POST /api/chat/complete (non-streaming)

- Same validation/persistence, then a single upstream completion call.
- Returns the provider JSON; persists assistant content when present; may set conversation title.

## Conversations API (for future UI)

- `GET /api/chat/conversations`: list with `message_count` and timestamps (ordered by `updated_at` desc).
- `GET /api/chat/conversations/{id}`: detail with messages.
- `POST /api/chat/conversations`: create empty conversation (owner set if authenticated).
- `PATCH /api/chat/conversations/{id}`: update `title` (non-empty string).
- `DELETE /api/chat/conversations/{id}`: delete conversation.

## LiteLLM proxy integration

- Base URL selection (`_litellm_base_url`):
  - Env `LITELLM_BASE_URL` if set; if running in Docker and env points to `localhost`/`127.0.0.1`, it is overridden to `http://llm_proxy:4000`.
  - Default: `http://llm_proxy:4000` in Docker, otherwise `http://localhost:41337`.
- Auth: optional `Authorization: Bearer ${LITELLM_MASTER_KEY}` if `LITELLM_MASTER_KEY` is provided.
- Upstream path: `${base}/v1/chat/completions`.

## Frontend request details

- Path: `/api/chat/stream` (same-origin).
- Credentials: `credentials: 'include'` (session/CSRF compatible).
- Abort: `AbortController` wired to Stop button.
- SSE parsing: splits on newlines; processes `data:` lines; ignores comments; concatenates token deltas into one assistant message.

## Known gaps / follow-ups

- UI currently ignores server-emitted SSE error objects (non-delta). Consider surfacing a friendly error if the first event is an error payload.
- Add `conversation_id` handling in the UI to continue threads; load/save history.
- Optional `model` selection UI.
- Rich rendering (markdown/code), token usage display, and title display.

## References

- Backend contract: `backend/apps/chat/api.py`
- OpenAPI: [Meeter API OpenAPI JSON](https://meeter.ngrok.dev/api/openapi.json)
- Frontend code: `frontend/src/App.tsx`, `frontend/src/styles.css`
