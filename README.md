# 🎤 meeter [WIP]

organism live — Mirai overlays realtime, context‑aware knowledge while you meet

## 🌐 Project Overview

This project uses gpt-oss-20b/120b for performing realtime intelligent decision making in functional environments using a combination of ultra low latency inference and an AI-driven architecture.

Mirai is a desktop overlay that listens to your system audio, transcribes meetings with diarization, optionally understands low‑FPS screen context, and surfaces concise, actionable "context cards" from your knowledgebase. It routes fast reasoning through Groq (via LiteLLM) using gpt-oss‑20b/120b, can update your knowledgebase with summaries and action items, exposes a stream for smart glasses, and includes a voice agent (Mirai) for conversational control.

Key capabilities:

- Realtime STT with speaker labels from system audio (Zoom, Teams, Meet, etc.)
- Optional screen recording + MiniCPM‑V 4.5 for on‑screen tags/entities
- RAG over your personal/team knowledge with fast LLM routing (LiteLLM → Groq)
- Movable always‑on‑top overlay showing terse, source‑linked context cards
- Knowledgebase write‑backs (summaries, action items, glossary updates)
- Smart‑glasses API to mirror the overlay in real life
- Mirai voice agent: "what did I miss?", "summarize last 5 minutes", and more

See the full product/technical spec in `docs/Idea.md`.

## 🏆 Submission Categories

> 🏁 Best Overall ;)  
> 🏁 Weirdest Hardware  
> 🏁 Most Useful Fine‑Tune  

Built with gpt-oss-20b and gpt-oss-120b weights from [Hugging Face](https://huggingface.co/openai/gpt-oss-120b) running on [groq](https://groq.com/)'s LPU hardware. Fine tuned with data-set from [TBD]. WIP!

## 📹 Demo Video Link

⏯️ **[Youtube Link](https://www.youtube.com/@anthonyrhenz)**

## 🚀 Quickstart

0. Download Repo

```bash
git clone https://github.com/anthonyrhenz/meeter.git
cp .env.example .env
```

1. Create and fill env vars

```bash
cp .env.example .env
# Edit .env and set at least:
# DJANGO_SECRET_KEY=...
# DEBUG=1
# DATABASE_URL=postgresql://user:pass@postgres:5432/mirai
# REDIS_URL=redis://redis:6379/0
# LITELLM_BASE_URL=http://litellm:4000
# GROQ_API_KEY=...
```

2. Start services

```bash
docker compose up --build
```

3. Open the desktop app (Tauri) once the backend is healthy, then start a session to see the overlay stream.

We'll eventually set up a sample knowledgebase and test database

## 🏗️ Development

Same as above, but ensure your environment is set up with debug enabled, and hot reload is on.

- Backend: Django + Ninja with hot reload
- Frontend: React + TypeScript (Tauri), overlay runs always‑on‑top
- Models: routed through LiteLLM to Groq; pick 20B vs 120B by latency/complexity

Useful during dev:

```bash
docker compose up --build -V # clears the frontend volume for a full rebuild
docker compose up --build -d # frees up your terminal
```

## 🔌 Endpoints (draft)

- WS /ws/ingest/audio — PCM frames → interim/final transcript tokens with diarization
- WS /ws/overlay — stream context cards to the overlay
- REST /api/sessions, /api/kb/documents, /api/kb/search, /api/kb/writebacks
- WS /ws/glasses — minimal overlay stream for smart glasses

For details, see `docs/Idea.md`.

## 🗺️ Roadmap (MVP milestones)

- [x] Skeleton: Docker Compose, Django+Ninja+Channels, Tauri shell, health checks
- [ ] Realtime STT: audio capture, VAD, streaming ASR, diarization, transcript view
- [ ] Overlay UX: context cards, keyboard control, streaming UI, polish
- [ ] RAG: ingestion → embeddings → search; Groq via LiteLLM; card generation
- [ ] Fine Tuning: Optimise models for our specific use-case to minimise multishot requirement
- [ ] Vision: low‑FPS screen understanding (MiniCPM‑V 4.5) → tags/captions
- [ ] Smart‑glasses API: WS stream + minimal UI hints
- [ ] Mirai agent: voice loop (STT→LLM→TTS), session memory, actions
- [ ] Hardening: privacy controls, rate limits, observability, packaging

## ⚖️ Licensing and Usage

All rights reserved. This project is proprietary and may not be used, modified, distributed, or reproduced without explicit permission from the author, except for testing, evaluation, and use by OpenAI sponsors, administrators, and judges as per hackathon rules. gpt-oss components comply with Apache 2.0 - see /licenses for details.
