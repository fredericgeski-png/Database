# 🚀 Kinetic Integrity Monitor

> Self-hostable AI agent safety & observability — lighter than LangSmith, sharper than Langfuse.

[![License: MIT](https://img.shields.io/badge/License-MIT-cyan.svg)](LICENSE)

---

## ✨ Features

- **Kinetic Entropy Engine** — Shannon + loop penalty + tool variance + drift scoring
- **Real-time Dashboard** — live entropy gauges, per-agent charts, waste-prevented counter
- **Auto Kill-Switch** — terminates agents that breach entropy threshold (default 0.85)
- **Telemetry Feed** — paginated event log, recent-first, filterable by type/agent
- **Webhooks** — instant notifications to Slack, Discord, or any HTTP endpoint
- **SDK Wrappers** — Python (CrewAI / LangChain), Node.js, Go
- **PWA** — installable to home screen, offline-capable
- **Self-hosted** — one `docker compose up` and you're live

---

## ⚡ Quick Start

```bash
# 1. Clone
git clone https://github.com/your-org/kinetic.git
cd kinetic

# 2. Configure
cp .env.example .env
# Edit .env — set JWT_SECRET and POSTGRES_PASSWORD

# 3. Launch (API + Postgres)
docker compose up -d

# 4. Open
open http://localhost:3000/health   # → { "status": "healthy" }
```

**Single command:**
```bash
JWT_SECRET=$(openssl rand -hex 64) POSTGRES_PASSWORD=$(openssl rand -hex 32) docker compose up -d
```

---

## 🔑 Required Environment Variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_URL` | ✅ | PostgreSQL connection string |
| `JWT_SECRET` | ✅ | ≥64-char random string (`openssl rand -hex 64`) |
| `PORT` | optional | Server port (default: `3000`) |
| `FRONTEND_URL` | optional | CORS origin (default: `http://localhost:3001`) |
| `NODE_ENV` | optional | `production` / `development` |

---

## 📡 API Reference

### Calculate Entropy
```http
POST /api/v1/calculate-entropy
Authorization: Bearer <token>
Content-Type: application/json

{
  "agent_id": "uuid",
  "metrics": {
    "token_usage": { "prompt_tokens": 500, "completion_tokens": 150, "total_tokens": 650 },
    "execution_time": { "average_ms": 1200, "p95_ms": 2100, "p99_ms": 3000 },
    "loop_count": 3,
    "tool_calls": { "total": 8, "by_tool": { "web_search": 5, "calculator": 3 } }
  }
}
```

### Kill Switch
```http
POST /api/v1/kill-switch/activate
{ "reason": "High entropy detected" }
```

### Telemetry (paginated)
```http
GET /api/v1/telemetry?page=1&limit=50&event_type=entropy_calculated
```

---

## 🐍 Python SDK

```bash
pip install kinetic-monitor
```

```python
from kinetic.monitor import KineticMonitor

monitor = KineticMonitor(api_key="knt_...", agent_id="uuid")

# LangChain
executor = AgentExecutor(agent=..., callbacks=[monitor.langchain_callback()])

# CrewAI
task = Task(..., callback=monitor.crewai_task_callback())

# Any function
@monitor.wrap_agent
def my_agent(input): ...
```

## 🟨 Node.js SDK

```bash
npm install @kinetic/monitor
```

```typescript
import { KineticMonitor } from '@kinetic/monitor';

const monitor = new KineticMonitor({ apiKey: 'knt_...', agentId: 'uuid' });
const run = monitor.wrapAgent(async (input) => { /* agent logic */ });
```

## 🐹 Go SDK

```go
monitor := kinetic.New(kinetic.Config{APIKey: "knt_...", AgentID: "uuid"})
result, err := monitor.WrapFunc(ctx, func() error {
    monitor.TrackLLM(450, 120)
    monitor.TrackTool("search")
    return nil
})
```

---

## 💰 Pricing

| Plan | Price | Agents | Features |
|---|---|---|---|
| Free | $0/mo | 5 | Basic dashboard, entropy monitoring |
| **Pro** | **$299/mo** | **Unlimited** | Advanced analytics, webhooks, auto kill-switch, priority support |

[**→ Upgrade to Pro**](https://fredericgeski.selar.com/727l48e1z1)

---

## 🐳 Docker

```bash
# Build image (target <250 MB via multi-stage)
docker build -t kinetic .

# Run with compose (includes Postgres)
docker compose up -d

# View logs
docker compose logs -f kinetic-api

# Stop
docker compose down
```

---

## 📱 PWA (Mobile App)

Add the following to your Next.js `_document.tsx`:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#06b6d4" />
```

Register service worker in `_app.tsx`:
```typescript
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js');
}
```

Users can then **Add to Home Screen** for a native app experience.

---

## 🔔 Webhooks

Configure webhooks in your dashboard → Settings → Webhooks.

Payload format:
```json
{
  "event": "agent.killswitch.triggered",
  "data": { "agent_id": "...", "entropy_score": 0.91 },
  "timestamp": "2025-01-01T00:00:00Z",
  "source": "kinetic"
}
```

Events: `entropy_calculated` · `kill_switch_activated` · `kill_switch_auto_triggered` · `kill_switch_reset`

---

MIT License · Built with ❤️ for the agentic AI era
