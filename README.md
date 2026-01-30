# Midnight Commits 🌙

Real-time visualization of global GitHub commits on a 3D globe with day/night rendering.

## Folder Structure

```
MidnightCommits/
├── producer.py          # Kafka producer - fetches GitHub events
├── backend.py           # FastAPI WebSocket bridge
├── docker-compose.yml   # Kafka + Zookeeper
├── midnight-commit-ui/  # React frontend
└── .env                 # Secrets (GITHUB_TOKEN)
```

## Quick Start (4 Terminals)

### Terminal 1: Infrastructure
```bash
docker-compose up
```

### Terminal 2: Backend (WebSocket Bridge)
```bash
uv run python backend.py
```
→ Should show: `Uvicorn running on http://0.0.0.0:8000`

### Terminal 3: Frontend
```bash
cd midnight-commit-ui
npm start
```
→ Opens http://localhost:3000

### Terminal 4: Producer (Data Source)
```bash
uv run python producer.py
```
→ Should show: `🚀 Producer starting...`

## What You Should See

When `producer.py` prints `☀️ Sent: username...`, the React globe should instantly show a new point!

- **Gold dots** = Day commits
- **Cyan dots** = Night commits
