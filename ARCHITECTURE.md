# Midnight Commits - Architecture

## Overview

Real-time visualization of GitHub commits around the world, showing who's coding during day vs. night.

## Data Flow

```
GitHub API → producer.py → Kafka → backend.py → React (WebSocket)
                              ↓
                        indexer.py → PostgreSQL → backend.py → React (REST)
```

## Components

| Component | File | Purpose |
|-----------|------|---------|
| **Producer** | `producer.py` | Fetches GitHub events, geocodes locations, sends to Kafka |
| **Indexer** | `indexer.py` | Consumes Kafka, saves to PostgreSQL |
| **Backend** | `backend.py` | FastAPI: WebSocket stream + REST API |
| **Frontend** | `midnight-commit-ui/` | React globe + dashboard |

## API Endpoints

| Endpoint | Method | Returns |
|----------|--------|---------|
| `/ws` | WebSocket | Real-time commit stream |
| `/stats/leaderboard` | GET | Top 5 cities |
| `/stats/panic` | GET | Panic vs normal stats |
| `/stats/hourly` | GET | Commits by hour |
| `/stats/total` | GET | Total counts |

## Database Schema

```sql
CREATE TABLE commits (
    id SERIAL PRIMARY KEY,
    github_user VARCHAR(255),
    repo_name VARCHAR(255),
    city VARCHAR(255),
    latitude DOUBLE PRECISION,
    longitude DOUBLE PRECISION,
    status VARCHAR(50),      -- DAY/NIGHT
    message_length INT,
    is_panic BOOLEAN,
    committed_at TIMESTAMP
);
```

## Running Locally

```bash
# 1. Infrastructure
docker-compose up -d

# 2. Producer (GitHub → Kafka)
uv run python producer.py

# 3. Indexer (Kafka → PostgreSQL)
uv run python indexer.py

# 4. Backend (API server)
uv run python backend.py

# 5. Frontend
cd midnight-commit-ui && npm start
```

## Environment Variables

```env
GITHUB_TOKEN=your_token
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
DB_HOST=localhost
DB_PORT=5432
DB_NAME=midnight_db
DB_USER=admin
DB_PASS=password123
```
