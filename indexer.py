"""
Midnight Commits - Kafka Indexer
Consumes from Kafka and saves to PostgreSQL.
"""

import os
import json
import psycopg2
from kafka import KafkaConsumer
from dotenv import load_dotenv

load_dotenv()


def get_db_connection():
    """Create a PostgreSQL database connection."""
    return psycopg2.connect(
        host=os.getenv("DB_HOST", "localhost"),
        port=os.getenv("DB_PORT", "5432"),
        database=os.getenv("DB_NAME", "midnight_db"),
        user=os.getenv("DB_USER", "admin"),
        password=os.getenv("DB_PASS", "password123"),
    )


def main():
    print("💾 Indexer Started - Consuming from Kafka...")

    consumer = KafkaConsumer(
        "midnight-commits",
        bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
        value_deserializer=lambda x: json.loads(x.decode("utf-8")),
        auto_offset_reset="earliest",
        group_id="indexer-group",
    )

    conn = get_db_connection()
    cursor = conn.cursor()

    # Ensure table exists
    print("🛠️ Checking DB Schema...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS commits (
            id BIGINT PRIMARY KEY,
            github_user VARCHAR(255),
            repo_name VARCHAR(255),
            city VARCHAR(255),
            latitude FLOAT,
            longitude FLOAT,
            status VARCHAR(50),
            message_length INT,
            is_panic BOOLEAN,
            committed_at TIMESTAMP,
            event_type VARCHAR(50),
            ref_type VARCHAR(50),
            description TEXT
        );
    """)
    conn.commit()
    print("✅ Table 'commits' ready.")

    try:
        for msg in consumer:
            data = msg.value

            try:
                cursor.execute(
                    """
                    INSERT INTO commits 
                    (id, github_user, repo_name, city, latitude, longitude, 
                     status, message_length, is_panic, committed_at,
                     event_type, ref_type, description)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    ON CONFLICT (id) DO NOTHING
                """,
                    (
                        data.get("id"),
                        data.get("user"),
                        data.get("repo"),
                        data.get("city"),
                        data.get("lat"),
                        data.get("lon"),
                        data.get("status"),
                        data.get("message_length", 0),
                        data.get("is_panic", False),
                        data.get("timestamp"),
                        data.get("type", "PushEvent"),
                        data.get("ref_type"),
                        data.get("description", ""),
                    ),
                )
                conn.commit()
                print(f"💾 Indexed: {data.get('user')} from {data.get('city')}")

            except Exception as e:
                print(f"❌ DB Insert Error: {e}")
                conn.rollback()

    except KeyboardInterrupt:
        print("\n🛑 Indexer stopped.")
    finally:
        cursor.close()
        conn.close()
        consumer.close()


if __name__ == "__main__":
    main()
