"""
Midnight Commits - FastAPI WebSocket Bridge
Consumes from Kafka and streams to React frontend via WebSocket.
"""

# import asyncio
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from aiokafka import AIOKafkaConsumer
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Midnight Commits Backend")

# Allow React to connect
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

KAFKA_TOPIC = "midnight-commits"
KAFKA_BOOTSTRAP_SERVERS = "localhost:9092"


@app.get("/")
async def root():
    return {"status": "running", "topic": KAFKA_TOPIC}


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
