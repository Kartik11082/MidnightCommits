import requests
import time
import json
from geopy.geocoders import Nominatim
from astral.sun import sun
from astral import LocationInfo
import datetime
import pytz
import os
import csv
from kafka import KafkaProducer

# load env
from dotenv import load_dotenv

load_dotenv()

# CONFIGURATION
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {"Authorization": f"token {GITHUB_TOKEN}"}
geolocator = Nominatim(user_agent="midnight_commit_bot_v1")

# Kafka Configuration
KAFKA_BROKER = os.getenv("KAFKA_BROKER", "localhost:9092")
KAFKA_TOPIC = "commit-stream"


def get_kafka_producer():
    """
    Initialize and return a Kafka producer.
    Returns None if Kafka is not available.
    """
    try:
        producer = KafkaProducer(
            bootstrap_servers=[KAFKA_BROKER],
            value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            api_version=(0, 10, 1),
        )
        print(f"✅ Connected to Kafka at {KAFKA_BROKER}")
        return producer
    except Exception as e:
        print(f"⚠️ Kafka not available: {e}. Running in CSV-only mode.")
        return None


# CSV output file path
CSV_OUTPUT_PATH = os.path.join(os.path.dirname(__file__), "github_events_data.csv")

# CSV Headers for all the data we collect
CSV_HEADERS = [
    "event_id",
    "event_type",
    "created_at",
    "actor_login",
    "actor_id",
    "actor_avatar_url",
    "repo_id",
    "repo_name",
    "repo_url",
    "location_string",
    "latitude",
    "longitude",
    "day_night_status",
    "commit_count",
    "commit_messages",
    "commit_shas",
    "ref",
    "ref_type",
    "is_distinct_commit",
    "hour_of_day_utc",
    "day_of_week",
    "is_weekend",
]


def get_day_night_status(lat, lon, event_time_utc):
    """
    Determines if it is Day or Night at a specific Lat/Lon
    at a specific UTC time.
    """
    try:
        # Create an astral location object
        city = LocationInfo("Unknown", "Region", "UTC", lat, lon)

        # Calculate sun info for that specific date
        s = sun(city.observer, date=event_time_utc)

        # Check if event_time is between sunrise and sunset
        # We must ensure event_time_utc is timezone aware
        if event_time_utc.tzinfo is None:
            event_time_utc = pytz.utc.localize(event_time_utc)

        if s["sunrise"] < event_time_utc < s["sunset"]:
            return "DAY"
        else:
            return "NIGHT"
    except Exception as e:
        return "UNKNOWN"


def get_user_info(username):
    """
    Fetches the user profile to find their location and additional info.
    Returns a dict with user details.
    """
    url = f"https://api.github.com/users/{username}"
    try:
        resp = requests.get(url, headers=HEADERS)
        if resp.status_code == 200:
            data = resp.json()
            return {
                "location": data.get("location"),
                "name": data.get("name"),
                "company": data.get("company"),
                "bio": data.get("bio"),
                "public_repos": data.get("public_repos"),
                "followers": data.get("followers"),
                "following": data.get("following"),
                "created_at": data.get("created_at"),
            }
    except:
        pass
    return None


def extract_event_data(event, location_str, lat, lon, status, event_time):
    """
    Extracts all available data from a GitHub event into a flat dictionary.
    """
    payload = event.get("payload", {})
    commits = payload.get("commits", [])

    # Extract commit info
    commit_count = len(commits)
    commit_messages = " | ".join(
        [c.get("message", "").replace("\n", " ")[:100] for c in commits]
    )
    commit_shas = ",".join([c.get("sha", "")[:7] for c in commits])
    distinct_commits = sum(1 for c in commits if c.get("distinct", False))

    # Time-based features
    hour_of_day = event_time.hour
    day_of_week = event_time.strftime("%A")
    is_weekend = day_of_week in ["Saturday", "Sunday"]

    return {
        "event_id": event.get("id"),
        "event_type": event.get("type"),
        "created_at": event.get("created_at"),
        "actor_login": event.get("actor", {}).get("login"),
        "actor_id": event.get("actor", {}).get("id"),
        "actor_avatar_url": event.get("actor", {}).get("avatar_url"),
        "repo_id": event.get("repo", {}).get("id"),
        "repo_name": event.get("repo", {}).get("name"),
        "repo_url": f"https://github.com/{event.get('repo', {}).get('name')}",
        "location_string": location_str,
        "latitude": lat,
        "longitude": lon,
        "day_night_status": status,
        "commit_count": commit_count,
        "commit_messages": commit_messages,
        "commit_shas": commit_shas,
        "ref": payload.get("ref"),
        "ref_type": payload.get("ref_type"),
        "is_distinct_commit": distinct_commits,
        "hour_of_day_utc": hour_of_day,
        "day_of_week": day_of_week,
        "is_weekend": is_weekend,
    }


def write_to_csv(data_rows, append=True):
    """
    Writes the collected data to a CSV file.
    """
    file_exists = os.path.exists(CSV_OUTPUT_PATH)
    mode = "a" if append and file_exists else "w"

    with open(CSV_OUTPUT_PATH, mode, newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_HEADERS)

        # Write header if new file or overwriting
        if mode == "w" or not file_exists:
            writer.writeheader()

        for row in data_rows:
            writer.writerow(row)

    print(f"✅ Wrote {len(data_rows)} rows to {CSV_OUTPUT_PATH}")


def run_experiment(max_events=10, append_csv=True, use_kafka=True):
    """
    Main experiment runner that fetches GitHub events and extracts data.

    Args:
        max_events: Maximum number of successful events to process
        append_csv: Whether to append to existing CSV or overwrite
        use_kafka: Whether to stream events to Kafka
    """
    print("--- Starting Data Harvest Experiment ---")

    # Initialize Kafka producer if enabled
    producer = get_kafka_producer() if use_kafka else None

    # 1. Fetch the Firehose (Global Events)
    events_url = "https://api.github.com/events"
    resp = requests.get(events_url, headers=HEADERS)
    events = resp.json()

    print(f"📡 Fetched {len(events)} events. Filtering for PushEvents...")

    collected_data = []
    count = 0

    for event in events:
        if event["type"] == "PushEvent":
            actor = event["actor"]["login"]

            # 2. Get User Location
            user_info = get_user_info(actor)
            location_str = user_info.get("location") if user_info else None

            if location_str:
                # 3. Geocode to Lat/Lon
                try:
                    loc = geolocator.geocode(location_str, timeout=10)

                    if loc:
                        # 4. Determine Day/Night
                        event_time = datetime.datetime.strptime(
                            event["created_at"], "%Y-%m-%dT%H:%M:%SZ"
                        )
                        status = get_day_night_status(
                            loc.latitude, loc.longitude, event_time
                        )

                        # 5. Extract all event data
                        event_data = extract_event_data(
                            event,
                            location_str,
                            loc.latitude,
                            loc.longitude,
                            status,
                            event_time,
                        )
                        collected_data.append(event_data)

                        # Send to Kafka if available
                        if producer:
                            producer.send(KAFKA_TOPIC, value=event_data)
                            print(f"📡 Sent to Kafka: {KAFKA_TOPIC}")

                        # Print summary
                        emoji = "☀️" if status == "DAY" else "🌙"
                        print(
                            f"{emoji} User: {actor} | Loc: {location_str} | Status: {status}"
                        )
                        print(
                            f"   📦 Repo: {event_data['repo_name']} | Commits: {event_data['commit_count']}"
                        )

                        count += 1

                        if count >= max_events:
                            break
                except Exception as e:
                    print(f"❌ Geocoding error for {actor}: {e}")

            # Sleep briefly to avoid hitting Geopy limits immediately
            time.sleep(0.5)

    # Flush Kafka producer if used
    if producer:
        producer.flush()
        print("✅ Kafka messages flushed")

    # Write collected data to CSV
    if collected_data:
        write_to_csv(collected_data, append=append_csv)
    else:
        print("⚠️ No data collected to write to CSV")

    print(f"\n--- Experiment Complete: Processed {count} events ---")
    return collected_data


if __name__ == "__main__":
    # Run with default settings (10 events, append to CSV)
    run_experiment(max_events=10, append_csv=False)
