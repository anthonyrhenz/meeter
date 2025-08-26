## Mirai — Realtime Knowledge Overlay

### One‑liner

A realtime meeting copilot that listens to system audio, understands what’s on your screen, and surfaces concise, actionable context from your knowledgebase across any app — with a smart‑glasses API and a voice agent (Mirai).

### What it does (human terms)

- Captures your computer’s audio (Zoom, Teams, Meet, etc.) and transcribes it live with speaker labels
- Optionally screen‑records and uses a small vision model (e.g., MiniCPM‑V 4.5) to recognize what’s on screen
- Shows a small, movable overlay that presents bite‑sized, relevant notes, definitions, links, and next steps
- Uses a knowledgebase with RAG and fast reasoning (Groq via LiteLLM; GPT‑OSS‑120B/20B depending on complexity) to decide what to show
- Updates your knowledgebase automatically during/after the call, with light user confirmation when needed
- Exposes an API so a pair of smart glasses can receive the same “overlay” in real life
- Adds a voice chatbot, Mirai, so you can talk to your notes and calls like a personal secretary

### Who it’s for

- People who live in meetings: sales, success, support, product, research, ops
- Anyone who wants the right context at the right time without tab‑hunting

### Experience principles

- Low‑friction, low‑latency, low‑cognitive‑load
- Private by default; user‑controlled data retention
- “Show, don’t overwhelm”: terse, trustworthy, linked to sources
- Feels native; overlay is unobtrusive, movable, and keyboard‑driven

### Success criteria (v1)

- P95 speech→overlay latency ≤ 1.0s local, ≤ 1.5s with cloud LLM
- Accurate diarization and stable speaker labels over a meeting
- Overlay updates are incremental (token‑streamed) and never block the UI thread
- Knowledgebase updates require explicit user accept/undo; full audit trail

### Product capabilities (MVP)

- Realtime STT with diarization from system audio output
- Optional screen recording and low‑FPS visual understanding for context tagging
- RAG over personal/team knowledge; fast reasoning via Groq (through LiteLLM proxy)
- Movable overlay with “context cards” (short summaries, definitions, snippets, links)
- Lightweight editing: accept/modify a suggestion, file a follow‑up, tag owners
- Knowledgebase write‑backs: meeting summary, action items, updated glossary
- Smart‑glasses API: subscribe to overlay stream and push minimal UI hints
- Voice agent (Mirai): conversational interface to your notes/knowledge/calls

### Tech stack (locked‑in choices from brief)

- Backend: Python (Django + Ninja). Realtime via Django Channels (WebSockets/SSE)
- Model routing: LiteLLM proxy → Groq for fast inference (GPT‑OSS‑20B/120B)
- Containerization: Docker (Compose for dev)
- Frontend (desktop): React + TypeScript in Tauri
- Styling/UX: Keep it snappy; use CSS View Transitions and Speculation Rules where they add value

### Architecture overview

- Desktop app (Tauri)
  - Captures system audio (WASAPI loopback on Windows; CoreAudio + virtual device on macOS; PulseAudio/PipeWire monitor on Linux)
  - Optional screen capture (getDisplayMedia for window/screen; or Tauri plugin for native capture)
  - Sends audio frames and low‑FPS screenshots to backend via WebSocket(s)
  - Renders the overlay UI on top of all windows; supports global hotkeys
- Backend (Django + Ninja + Channels)
  - STT pipeline: VAD → segmenter → streaming ASR → diarization/labeling
  - Visual context: downsampled frames → MiniCPM‑V 4.5 → tags/entities/caption
  - Retrieval: vector search over knowledgebase → context packer → reasoning LLM
  - Orchestration: LiteLLM picks Groq model based on complexity/latency budget
  - Streaming results back to client for overlay as they are ready
- Storage
  - Postgres + pgvector for document chunks, embeddings, metadata, events
  - Object storage (local disk in dev; S3‑compatible in prod) for recordings/frames
  - Redis for queues (Celery) and pub/sub fan‑out to clients

### Realtime pipeline (proposed)

1. Audio capture: 16kHz mono PCM frames (20–40 ms) + VAD
2. ASR: faster‑whisper/WhisperX in streaming mode; partial tokens stream as they appear
3. Diarization: overlap‑capable diarizer (e.g., pyannote) aligning to ASR segments
4. Screen context: 0.25–1 FPS frames → MiniCPM‑V 4.5 → on‑screen entities/intent tags
5. Context assembly: last N transcript seconds + current tags → retrieval
6. Retrieval: pgvector ANN search (top‑k) + recency/authority re‑rank
7. Reasoning: LiteLLM→Groq (20B fast path; escalate to 120B on demand)
8. Streaming output: token‑stream to overlay as “context cards” with source attributions

Notes:

- The vision path is low‑frequency and optional; the app stays useful with audio‑only
- The RAG step must be idempotent and incremental; no “big batch” pauses

### Knowledgebase (initial)

- Sources: files, URLs, notes, calendars, tickets, CRM, wiki (via simple connectors)
- Ingestion: chunking, embedding (LiteLLM‑routed), metadata enrichment, access control
- Storage: Postgres tables with pgvector for embeddings; soft‑delete and versions
- Write‑backs: meeting summaries, action items, glossary deltas, tagged references

### Data model (draft)

- sessions: id, started_at, ended_at, title, participants (JSON), app, created_by
- transcript_segments: id, session_id, t_start_ms, t_end_ms, speaker, text, tokens
- diarization_events: id, session_id, t_start_ms, t_end_ms, speaker, confidence
- screen_frames: id, session_id, ts_ms, storage_uri, tags (JSON), caption
- context_cards: id, session_id, ts_ms, title, body_md, sources (JSON), actions (JSON)
- kb_documents: id, title, source, url, owner, created_at, updated_at
- kb_chunks: id, document_id, chunk_idx, text, embedding (vector), metadata (JSON)
- audit_events: id, session_id, actor, action, payload (JSON), created_at

### API surface (draft)

- Realtime
  - WS /ws/ingest/audio — PCM frames (+room/app hints). Returns interim/final tokens
  - WS /ws/overlay — streams context_cards for active session
- REST
  - POST /api/sessions — start/stop, metadata
  - GET /api/sessions/{id}/transcript — paged transcript
  - GET /api/sessions/{id}/cards — generated cards
  - POST /api/kb/documents — ingest; supports file/URL
  - GET /api/kb/search — query with filters
  - POST /api/kb/writebacks — summaries/action items/glossary updates
- Smart‑glasses
  - WS /ws/glasses — subscribe to minimal overlay stream
  - GET /api/glasses/prompts — concise hints (text/icons), low bandwidth

### Desktop UI (React + Tauri)

- Always‑on‑top, draggable overlay; resizable; dark/light; global hotkeys
- “Context cards” layout with progressive disclosure (expand to details)
- Token‑streamed updates; optimistic actions (tag, accept, create task)
- Animations via CSS View Transitions; prefetch likely views via Speculation Rules

### Mirai — the voice agent

- Live push‑to‑talk or wake‑word; STT → RAG+reason → TTS
- Can answer “what did I miss?”, “summarize the last 5 minutes”, “define X”,
  “draft follow‑up”, “log action item for Y”, “explain what’s on screen”
- Memory is session‑scoped by default; can pin to long‑term with confirmation

### Privacy & security

- On‑device by default for capture and STT; cloud LLM is opt‑in per workspace
- Clearly labeled recording indicators; one‑click pause; automatic redaction options
- Access controls for KB; audit trail for read/write events
- No secrets in logs; signed URLs for artifacts; encryption at rest for recordings

### Performance targets (dev → prod tuning)

- Audio→token partials begin < 300 ms; final segments < 1.0 s P95 (local)
- Vision tagging at 0.25–1 FPS; budget ≤ 50 ms per frame on capable GPU/remote
- RAG end‑to‑end (retrieve→card) target < 700 ms P95 for short prompts

### Milestones

1. Skeleton: Docker Compose, Django+Ninja, Channels, Tauri shell, basic overlay
2. Realtime STT: audio capture, VAD, streaming ASR, diarization, transcript view
3. Overlay UX: context cards, keyboard control, streaming UI, polish
4. RAG: ingestion→embeddings→search; Groq via LiteLLM; card generation
5. Vision: low‑FPS screen understanding (MiniCPM‑V 4.5) → tags/captions
6. Smart‑glasses API: WS stream + minimal UI hints
7. Mirai agent: voice loop (STT→LLM→TTS), session memory, actions
8. Hardening: privacy controls, rate limits, observability, packaging

### Open questions

- On‑device vs cloud for diarization and vision; model/device matrix
- GPU optionality in dev/prod (fall back paths and feature flags)
- Supported meeting apps and OS‑level capture prerequisites
- Knowledge connectors to prioritize for v1
- Wake‑word vs push‑to‑talk for Mirai

### Links

- Dev environment: https://anthonydev.ngrok.dev/

---

Last updated: 2025-08-25
