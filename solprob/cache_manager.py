# cache_manager.py
import os
import json
import time

CACHE_DIR = "cache"

def load_cache(path, ttl=60):
    full = os.path.join(CACHE_DIR, path)
    if not os.path.exists(full):
        return None
    with open(full, "r") as f:
        data = json.load(f)
    if time.time() - data["timestamp"] > ttl:
        return None
    return data["value"]

def save_cache(path, value):
    full = os.path.join(CACHE_DIR, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w") as f:
        json.dump({"timestamp": time.time(), "value": value}, f)
