"""
Midnight Commits - FastAPI WebSocket Bridge
Consumes from Kafka and streams to React frontend via WebSocket.
Also provides REST API for dashboard statistics.
"""

import os
import json
import psycopg2
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from aiokafka import AIOKafkaConsumer
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

app = FastAPI(title="Midnight Commits Backend")

# Allow React to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

KAFKA_TOPIC = "midnight-commits"
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")


# --- Database Connection ---
def get_db_connection():
    """Create a PostgreSQL database connection."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME", "midnight_db"),
        user=os.getenv("DB_USER", "admin"),
        password=os.getenv("DB_PASS", "password123"),
    )


# --- REST API Endpoints ---
@app.get("/")
async def root():
    return {"status": "running", "topic": KAFKA_TOPIC}


@app.get("/stats/leaderboard")
def get_leaderboard():
    """Get top 5 cities by commit count."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT city, COUNT(*) as count 
            FROM commits 
            WHERE city IS NOT NULL
            GROUP BY city 
            ORDER BY count DESC 
            LIMIT 5
        """)
        rows = cur.fetchall()
        conn.close()
        return [{"city": r[0], "count": r[1]} for r in rows]
    except Exception as e:
        return {"error": str(e)}


@app.get("/stats/panic")
def get_panic_stats():
    """Compare average message length of panic vs normal commits."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                is_panic, 
                COUNT(*) as count,
                ROUND(AVG(message_length)::numeric, 1) as avg_length
            FROM commits 
            GROUP BY is_panic
        """)
        rows = cur.fetchall()
        conn.close()
        return [
            {"is_panic": r[0], "count": r[1], "avg_length": float(r[2]) if r[2] else 0}
            for r in rows
        ]
    except Exception as e:
        return {"error": str(e)}


@app.get("/stats/hourly")
def get_hourly_activity():
    """Get commit activity by hour."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                EXTRACT(HOUR FROM committed_at) as hour,
                COUNT(*) as count
            FROM commits 
            GROUP BY hour 
            ORDER BY hour
        """)
        rows = cur.fetchall()
        conn.close()
        return [{"hour": int(r[0]), "count": r[1]} for r in rows]
    except Exception as e:
        return {"error": str(e)}


@app.get("/stats/total")
def get_total_stats():
    """Get total commit statistics."""
    try:
        conn = get_db_connection()
        cur = conn.cursor()
        cur.execute("""
            SELECT 
                COUNT(*) as total,
                COUNT(DISTINCT github_user) as unique_users,
                COUNT(DISTINCT city) as unique_cities,
                SUM(CASE WHEN is_panic THEN 1 ELSE 0 END) as panic_commits
            FROM commits
        """)
        row = cur.fetchone()
        conn.close()
        return {
            "total_commits": row[0],
            "unique_users": row[1],
            "unique_cities": row[2],
            "panic_commits": row[3],
        }
    except Exception as e:
        return {"error": str(e)}


# --- WebSocket Endpoint ---
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("🔌 WebSocket client connected")

    consumer = AIOKafkaConsumer(
        KAFKA_TOPIC,
        bootstrap_servers=KAFKA_BOOTSTRAP_SERVERS,
        value_deserializer=lambda x: json.loads(x.decode("utf-8")),
        auto_offset_reset="latest",
    )

    await consumer.start()
    print(f"📡 Consuming from Kafka topic: {KAFKA_TOPIC}")

    try:
        async for msg in consumer:
            print(f"➡️ Forwarding: {msg.value.get('user', 'unknown')}")
            await websocket.send_json(msg.value)
    except WebSocketDisconnect:
        print("🔌 WebSocket client disconnected")
    except Exception as e:
        print(f"❌ Error: {e}")
    finally:
        await consumer.stop()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
