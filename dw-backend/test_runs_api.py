"""Quick test of the new runs API endpoints."""
import urllib.request
import json
import time

BASE = "http://localhost:8004"

def test(url, label):
    try:
        r = urllib.request.urlopen(f"{BASE}{url}", timeout=10)
        d = json.loads(r.read())
        print(f"OK: {label} -> {json.dumps(d)[:200]}")
        return True
    except Exception as e:
        print(f"FAIL: {label} -> {e}")
        return False

# Wait for server
for i in range(10):
    try:
        urllib.request.urlopen(f"{BASE}/health", timeout=2)
        break
    except:
        print(f"Waiting for server... ({i+1})")
        time.sleep(2)

test("/api/runs", "Global Runs List")
test("/api/runs/stats?days=7", "Run Stats")
test("/health", "Health Check")
