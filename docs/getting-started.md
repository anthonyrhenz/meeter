## Getting Started (Dev)

This repo is a fast, single-origin dev setup:

- Backend: Django 5 + Ninja API + Channels (Redis)
- DB: Postgres (pgvector, optional pgvectorscale)
- Frontend: React + Vite + Tauri v2 (desktop shell optional during web dev)
- Infra: Nginx (proxies `/api` and `/ws`), Docker Compose orchestrates all services
- LLM: LiteLLM reverse proxy → Groq (config in `litellm_config.yaml`)
- Analytics (optional): PostHog ready on the frontend

See the product/tech spec in `docs/Idea.md`. High-level repo map is in `README.md`.

### Prerequisites

- Docker + Docker Compose
- Node.js 20 (only if you run the frontend locally outside Docker)
- Optional (Tauri desktop shell):
  - Rust toolchain (stable) and platform build tools
  - `@tauri-apps/cli` (installed via npm as a dev dep already)

### One-time setup

1. Copy env and edit as needed

```bash
cp .env.example .env
# Update DB_USER/DB_PASSWORD, keys, and hosts if needed
```

2. Start the stack

```bash
docker compose up --build -V
```

3. Run migrations (if not auto-applied)

```bash
docker compose exec backend python manage.py migrate
```

4. Check health

```bash
curl http://localhost/api/health
# {"status":"ok"}
```

### What runs where (dev)

- `nginx`: single origin at `http://localhost/`
  - `/` → Vite dev server through Nginx
  - `/api/*` → Django Ninja
  - `/ws/*` → Django Channels
- `backend`: Django ASGI app (Uvicorn reload)
- `redis`: Channels layer and Celery broker
- `db`: Postgres with `vector` extension, tries `pgvectorscale` if available
- `llm_proxy`: LiteLLM on `http://localhost:4000`
- `frontend`: Vite dev server (proxied via Nginx), React app

### Environment variables (quick refs)

- Django: `DJANGO_SECRET_KEY`, `DJANGO_ALLOWED_HOSTS`, `DEBUG`, `CSRF_TRUSTED_ORIGINS`, `CORS_ALLOWED_ORIGINS`
- DB: `DB_*` (or `DATABASE_URL`)
- Channels/Redis: `CHANNELS_REDIS_URL`
- Celery: `CELERY_BROKER_URL`, `CELERY_RESULT_BACKEND`
- LiteLLM: `LITELLM_MASTER_KEY`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY`
- Frontend: `VITE_API_SAME_HOST=true` for single origin; set `VITE_API_URL` only if cross-origin

### Common dev commands

```bash
# View logs
docker compose logs -f backend
docker compose logs -f nginx

# Open a shell in backend
docker compose exec backend bash

# Create a Django superuser
docker compose exec backend python manage.py createsuperuser

# Rebuild everything (including frontend node_modules)
docker compose up --build -V
```

### Where to put code

- Backend
  - Django project: `backend/meeter_platform/`
  - Add your Django apps under: `backend/apps/`
  - API routes live in `meeter_platform/urls.py` via Ninja (under `/api`)
  - WebSockets routes live in `meeter_platform/routing.py` (under `/ws`)
- Frontend
  - React app: `frontend/src/`
  - Vite config: `frontend/vite.config.ts`
  - Tauri shell: `frontend/src-tauri/` (optional during web-only dev)
- Infra
  - Nginx: `nginx/nginx.conf`, `nginx/sites-available/meeter-dev.conf`
  - LiteLLM models: `litellm_config.yaml`
  - Postgres init: `postgres/init/00-extensions.sql`

### Add an API endpoint (example)

In `backend/meeter_platform/urls.py`, add a handler:

```python
from ninja import NinjaAPI

api = NinjaAPI(title="Meeter API", version="0.1.0")

@api.get("/hello", auth=None)
def hello(request, name: str = "world"):
    return {"message": f"hello {name}"}
```

Visit `http://localhost/api/hello?name=dev`.

### Add a WebSocket consumer (example)

`backend/meeter_platform/ws_consumers.py` already includes an `EchoConsumer`:

```python
from channels.generic.websocket import AsyncWebsocketConsumer
import json

class EchoConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()

    async def receive(self, text_data=None, bytes_data=None):
        if text_data is not None:
            await self.send(text_data=json.dumps({"echo": text_data}))
```

Connect to `ws://localhost/ws/echo/` from the browser console:

```js
const ws = new WebSocket("ws://localhost/ws/echo/");
ws.onmessage = (e) => console.log(e.data);
ws.onopen = () => ws.send("ping");
```

### Frontend notes

- In dev, Vite runs inside Docker and is proxied via Nginx — just open `http://localhost/`
- PostHog is auto-initialized if `VITE_PUBLIC_POSTHOG_KEY` is set
- To run Tauri locally (optional desktop shell): ensure Rust + build tools, then run from `frontend/`

```bash
npm run tauri
```

### LLM routing (LiteLLM)

- Configure models/keys in `litellm_config.yaml`
- The proxy runs at `http://localhost:4000`
- Backend can use this endpoint for RAG/LLM calls; frontend should not call it directly

### Kanban-style setup steps

- [ ] Clone repo and copy `.env`
- [ ] Start Docker Compose and confirm Nginx at `http://localhost/`
- [ ] Run DB migrations and hit `/api/health`
- [ ] Verify WebSocket echo at `/ws/echo/`
- [ ] Configure LiteLLM keys and test a sample call from backend
- [ ] Start frontend (already proxied) and confirm UI loads
- [ ] Optional: run Tauri desktop shell locally
- [ ] Create a feature branch and start building

### Troubleshooting

- 502/404 at root: check `nginx` and `frontend` logs; ensure Vite is running
- `/api` unreachable: confirm `backend` logs; migrations completed; env hosts/CSRF set
- WebSockets fail: check Nginx `/ws` upgrade headers and `CHANNELS_REDIS_URL`
- DB extensions: ensure the image is `pgvector/pgvector:pg16`; `vector` should be available
