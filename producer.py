"""
Midnight Commits - Kafka Producer
Fetches GitHub events, geocodes users, and sends to Kafka.
"""

import datetime
import json
import os
import time

import pytz
import requests
from astral import LocationInfo
from astral.sun import sun
from dotenv import load_dotenv
from geonamescache import GeonamesCache
from geopy.geocoders import Nominatim
from kafka import KafkaProducer

load_dotenv()

# --- CONFIGURATION ---
TOPIC_NAME = "midnight-commits"
GITHUB_TOKEN = os.getenv("GITHUB_TOKEN")
HEADERS = {"Authorization": f"token {GITHUB_TOKEN}"}

# Constants
STALE_EVENT_THRESHOLD = 10000  # seconds

# --- SETUP ---
producer = KafkaProducer(
    bootstrap_servers=os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092"),
    value_serializer=lambda x: json.dumps(x).encode("utf-8"),
)

# Proper user agent required by Nominatim ToS
geolocator = Nominatim(
    user_agent="MidnightCommits/1.0 (contact@example.com)", timeout=10
)

# Cache to avoid repeated geocoding (reduces API calls)
location_cache = {}


# Simulated location class for cached results
class CachedLocation:
    def __init__(self, lat, lon):
        self.latitude = lat
        self.longitude = lon


# Pre-cached common locations (lat, lon) - 120+ cities
KNOWN_LOCATIONS = {
    # USA
    "san francisco": CachedLocation(37.7749, -122.4194),
    "new york": CachedLocation(40.7128, -74.0060),
    "seattle": CachedLocation(47.6062, -122.3321),
    "austin": CachedLocation(30.2672, -97.7431),
    "denver": CachedLocation(39.7392, -104.9903),
    "los angeles": CachedLocation(34.0522, -118.2437),
    "chicago": CachedLocation(41.8781, -87.6298),
    "boston": CachedLocation(42.3601, -71.0589),
    "san diego": CachedLocation(32.7157, -117.1611),
    "portland": CachedLocation(45.5152, -122.6784),
    "miami": CachedLocation(25.7617, -80.1918),
    "atlanta": CachedLocation(33.7490, -84.3880),
    "dallas": CachedLocation(32.7767, -96.7970),
    "houston": CachedLocation(29.7604, -95.3698),
    "phoenix": CachedLocation(33.4484, -112.0740),
    "raleigh": CachedLocation(35.7796, -78.6382),
    "north carolina": CachedLocation(35.7596, -79.0193),
    "bothell": CachedLocation(47.7601, -122.2054),
    "washington": CachedLocation(47.7511, -120.7401),
    "california": CachedLocation(36.7783, -119.4179),
    "usa": CachedLocation(37.0902, -95.7129),
    "united states": CachedLocation(37.0902, -95.7129),
    "puerto rico": CachedLocation(18.2208, -66.5901),
    # Europe
    "london": CachedLocation(51.5074, -0.1278),
    "berlin": CachedLocation(52.5200, 13.4050),
    "paris": CachedLocation(48.8566, 2.3522),
    "amsterdam": CachedLocation(52.3676, 4.9041),
    "munich": CachedLocation(48.1351, 11.5820),
    "germany": CachedLocation(51.1657, 10.4515),
    "deutschland": CachedLocation(51.1657, 10.4515),
    "ukraine": CachedLocation(48.3794, 31.1656),
    "poland": CachedLocation(51.9194, 19.1451),
    "warsaw": CachedLocation(52.2297, 21.0122),
    "prague": CachedLocation(50.0755, 14.4378),
    "czech": CachedLocation(49.8175, 15.4730),
    "brno": CachedLocation(49.1951, 16.6068),
    "madrid": CachedLocation(40.4168, -3.7038),
    "barcelona": CachedLocation(41.3851, 2.1734),
    "italy": CachedLocation(41.8719, 12.5674),
    "rome": CachedLocation(41.9028, 12.4964),
    "messina": CachedLocation(38.1938, 15.5540),
    "vienna": CachedLocation(48.2082, 16.3738),
    "zurich": CachedLocation(47.3769, 8.5417),
    "stockholm": CachedLocation(59.3293, 18.0686),
    "oslo": CachedLocation(59.9139, 10.7522),
    "copenhagen": CachedLocation(55.6761, 12.5683),
    "dublin": CachedLocation(53.3498, -6.2603),
    "russia": CachedLocation(61.5240, 105.3188),
    "moscow": CachedLocation(55.7558, 37.6173),
    # Asia
    "tokyo": CachedLocation(35.6762, 139.6503),
    "japan": CachedLocation(36.2048, 138.2529),
    "bangalore": CachedLocation(12.9716, 77.5946),
    "india": CachedLocation(20.5937, 78.9629),
    "mumbai": CachedLocation(19.0760, 72.8777),
    "delhi": CachedLocation(28.7041, 77.1025),
    "pune": CachedLocation(18.5204, 73.8567),
    "hyderabad": CachedLocation(17.3850, 78.4867),
    "chennai": CachedLocation(13.0827, 80.2707),
    "moradabad": CachedLocation(28.8389, 78.7769),
    "ludhiana": CachedLocation(30.9010, 75.8573),
    "punjab": CachedLocation(31.1471, 75.3412),
    "kolkata": CachedLocation(22.5726, 88.3639),
    "singapore": CachedLocation(1.3521, 103.8198),
    "china": CachedLocation(35.8617, 104.1954),
    "beijing": CachedLocation(39.9042, 116.4074),
    "shanghai": CachedLocation(31.2304, 121.4737),
    "hong kong": CachedLocation(22.3193, 114.1694),
    "taiwan": CachedLocation(23.6978, 120.9605),
    "korea": CachedLocation(35.9078, 127.7669),
    "seoul": CachedLocation(37.5665, 126.9780),
    "thailand": CachedLocation(15.8700, 100.9925),
    "bangkok": CachedLocation(13.7563, 100.5018),
    "vietnam": CachedLocation(14.0583, 108.2772),
    "indonesia": CachedLocation(-0.7893, 113.9213),
    "jakarta": CachedLocation(-6.2088, 106.8456),
    "malaysia": CachedLocation(4.2105, 101.9758),
    "philippines": CachedLocation(12.8797, 121.7740),
    "pakistan": CachedLocation(30.3753, 69.3451),
    "saudi": CachedLocation(23.8859, 45.0792),
    "dhahran": CachedLocation(26.2361, 50.0393),
    "uae": CachedLocation(23.4241, 53.8478),
    "dubai": CachedLocation(25.2048, 55.2708),
    # Americas
    "canada": CachedLocation(56.1304, -106.3468),
    "toronto": CachedLocation(43.6532, -79.3832),
    "vancouver": CachedLocation(49.2827, -123.1207),
    "markham": CachedLocation(43.8561, -79.3370),
    "montreal": CachedLocation(45.5017, -73.5673),
    "brazil": CachedLocation(-14.2350, -51.9253),
    "sao paulo": CachedLocation(-23.5505, -46.6333),
    "mexico": CachedLocation(23.6345, -102.5528),
    "argentina": CachedLocation(-38.4161, -63.6167),
    "peru": CachedLocation(-9.1900, -75.0152),
    "chile": CachedLocation(-35.6751, -71.5430),
    "colombia": CachedLocation(4.5709, -74.2973),
    # Oceania
    "sydney": CachedLocation(-33.8688, 151.2093),
    "melbourne": CachedLocation(-37.8136, 144.9631),
    "australia": CachedLocation(-25.2744, 133.7751),
    "new zealand": CachedLocation(-40.9006, 174.8860),
    "auckland": CachedLocation(-36.8485, 174.7633),
    # Africa
    "south africa": CachedLocation(-30.5595, 22.9375),
    "johannesburg": CachedLocation(-26.2041, 28.0473),
    "cape town": CachedLocation(-33.9249, 18.4241),
    "nigeria": CachedLocation(9.0820, 8.6753),
    "lagos": CachedLocation(6.5244, 3.3792),
    "egypt": CachedLocation(26.8206, 30.8025),
    "cairo": CachedLocation(30.0444, 31.2357),
    "kenya": CachedLocation(-0.0236, 37.9062),
}


# def geocode_location(loc_str):
#     """Geocode with caching and known location fallback."""
#     if loc_str in location_cache:
#         return location_cache[loc_str]

#     # Check known locations first (case-insensitive partial match)
#     loc_lower = loc_str.lower()
#     for key, coords in KNOWN_LOCATIONS.items():
#         if key in loc_lower or loc_lower in key:
#             location_cache[loc_str] = coords
#             return coords

#     # Try Nominatim as fallback (skip for now due to rate limits)
#     print(f"⏭️ Skipping unknown location: {loc_str}")
#     location_cache[loc_str] = None
#     return None


gc = GeonamesCache()
cities = gc.get_cities()  # 24K+ cities with coordinates


def geocode_location(loc_str):
    try:
        loc_lower = loc_str.lower()
        for city_id, city in cities.items():
            if city["name"].lower() in loc_lower:
                return CachedLocation(city["latitude"], city["longitude"])
        print(f"⏭️ Skipping unknown location: {loc_str}")
        return None
    except:
        print(f"❌ Failed to geocode location: {loc_str}")
        return None


def get_day_night_status(lat, lon, event_time_utc):
    """Determine if it's day or night at the given location."""
    try:
        city = LocationInfo("Unknown", "Region", "UTC", lat, lon)
        s = sun(city.observer, date=event_time_utc)
        if event_time_utc.tzinfo is None:
            event_time_utc = pytz.utc.localize(event_time_utc)

        if s["sunrise"] < event_time_utc < s["sunset"]:
            return "DAY"
        else:
            return "NIGHT"
    except:
        print(f"❌ Failed to determine day/night status for {lat}, {lon}")
        return "UNKNOWN"


def get_user_location(username):
    """Fetch user's location from GitHub profile."""
    try:
        resp = requests.get(f"https://api.github.com/users/{username}", headers=HEADERS)
        result = resp.json().get("location")
        if resp.status_code == 200 and result:
            return result
        else:
            print(f"⏭️ Skipping unknown location: {username}")
            return None
    except:
        print(f"❌ Failed to fetch location for {username}")
        return None


def main():
    print(f"🚀 Producer starting... pushing to topic: {TOPIC_NAME}")

    while True:
        try:
            # 1. Fetch Events
            resp = requests.get("https://api.github.com/events", headers=HEADERS)
            events = resp.json()
            print(f"📡 Fetched {len(events)} events")

            for event in events:
                if event["type"] == "PushEvent":
                    # Freshness filter: drop events older than 5 minutes
                    created_at = datetime.datetime.strptime(
                        event["created_at"], "%Y-%m-%dT%H:%M:%SZ"
                    )
                    created_at = created_at.replace(tzinfo=datetime.timezone.utc)
                    now = datetime.datetime.now(datetime.timezone.utc)
                    age = (now - created_at).total_seconds()

                    # if age > 300:  # 5 minutes
                    if age > STALE_EVENT_THRESHOLD:  # 10000 seconds
                        print(f"🗑️ Dropped stale event ({int(age)}s old)")
                        continue

                    username = event["actor"]["login"]
                    repo_name = event["repo"]["name"]
                    loc_str = get_user_location(username)

                    if loc_str:
                        location = geocode_location(loc_str)
                        if location:
                            status = get_day_night_status(
                                location.latitude, location.longitude, created_at
                            )

                            # Extract commit message info
                            commits = event["payload"].get("commits", [])
                            commit_msg = commits[0]["message"] if commits else ""
                            message_length = len(commit_msg)
                            is_panic = any(
                                word in commit_msg.lower()
                                for word in [
                                    "fix",
                                    "bug",
                                    "urgent",
                                    "hotfix",
                                    "critical",
                                    "broken",
                                ]
                            )

                            payload = {
                                "user": username,
                                "repo": repo_name,
                                "lat": location.latitude,
                                "lon": location.longitude,
                                "status": status,
                                "city": loc_str,
                                "message_length": message_length,
                                "is_panic": is_panic,
                                "timestamp": event["created_at"],
                            }

                            producer.send(TOPIC_NAME, value=payload)
                            emoji = (
                                "🔥" if is_panic else ("☀️" if status == "DAY" else "🌙")
                            )
                            print(
                                f"{emoji} Sent: {username} in {loc_str} ({repo_name})"
                            )

            producer.flush()
            print("💤 Sleeping 5s before next fetch...")
            time.sleep(5)

        except Exception as e:
            print(f"❌ Error: {e}")
            time.sleep(5)


if __name__ == "__main__":
    main()
