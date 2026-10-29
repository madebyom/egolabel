#!/usr/bin/env python3
"""
test_meta_api.py — EgoLabel hackathon: smoke-test the Meta Model API.

Steps:
  (a) Upload data/clips/clip01.mp4 to the Files API
  (b) Ask muse-wonder-1.0  to list steps in the video as JSON (reasoning_effort = "low")
  (c) Ask muse-spark (Standard-tier) the same question (reasoning_effort = "low")
  (d) Ask sam-3.1 to segment the phrase "hand" in the same video

Prints for each call: latency, usage fields, first 500 chars of output.
Saves raw responses to data/cache/.

Docs used:
  https://dev.meta.ai/docs/file-handling        — Files API upload
  https://dev.meta.ai/docs/video-understanding  — Responses API video block
  https://dev.meta.ai/docs/reasoning            — reasoning_effort nesting
  https://dev.meta.ai/docs/sam-with-prompts     — SAM input_video + input_text
"""

import json
import os
import sys
import time
from pathlib import Path

import requests  # pip install requests

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env.local"
CLIP = ROOT / "data" / "clips" / "clip01.mp4"
CACHE = ROOT / "data" / "cache"
CACHE.mkdir(parents=True, exist_ok=True)

BASE_URL = "https://api.meta.ai/v1"

# Load API key from .env.local
def load_env(path: Path) -> dict:
    env = {}
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        k, _, v = line.partition("=")
        env[k.strip()] = v.strip()
    return env

env = load_env(ENV_FILE)
API_KEY = env.get("META_API_KEY", "")
if not API_KEY:
    sys.exit("META_API_KEY not found in .env.local")

HEADERS = {"Authorization": f"Bearer {API_KEY}"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def save_cache(name: str, data: dict):
    path = CACHE / f"{name}.json"
    path.write_text(json.dumps(data, indent=2))
    print(f"  [cache] saved -> {path.relative_to(ROOT)}")


def print_result(label: str, latency: float, usage: dict, output_text: str):
    print(f"\n{'='*60}")
    print(f"  Model  : {label}")
    print(f"  Latency: {latency:.2f}s")
    print(f"  Usage  : {json.dumps(usage, indent=4)}")
    print(f"  Output (first 500 chars):\n    {output_text[:500]!r}")
    print(f"{'='*60}\n")


# ---------------------------------------------------------------------------
# (a) Upload clip to Files API
# ---------------------------------------------------------------------------
print("\n[a] Uploading video to Files API …")
t0 = time.perf_counter()
with open(CLIP, "rb") as f:
    upload_resp = requests.post(
        f"{BASE_URL}/files",
        headers=HEADERS,
        files={
            "file": (CLIP.name, f, "video/mp4"),
        },
        data={"purpose": "user_data"},
        timeout=120,
    )
upload_latency = time.perf_counter() - t0

upload_resp.raise_for_status()
upload_json = upload_resp.json()
save_cache("upload_response", upload_json)

FILE_ID = upload_json.get("id") or upload_json.get("file_id") or upload_json.get("file", {}).get("id")
print(f"  File ID : {FILE_ID}")
print(f"  Latency : {upload_latency:.2f}s")
print(f"  Response: {json.dumps(upload_json, indent=2)[:400]}")

if not FILE_ID:
    sys.exit("Could not extract file_id from upload response. See data/cache/upload_response.json")

PROMPT = (
    "List every distinct step visible in this video as a JSON array. "
    'Each element should have keys "step_number" (int) and "description" (string). '
    "Return only valid JSON, no markdown fences."
)

# ---------------------------------------------------------------------------
# (b) muse-wonder-1.0 — reasoning_effort = "low"
# ---------------------------------------------------------------------------
print("\n[b] Calling muse-wonder-1.0 (reasoning_effort=low) …")
wonder_body = {
    "model": "muse-wonder-1.0",
    "reasoning": {"effort": "low"},
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "input_file",
                    "file_id": FILE_ID,
                },
                {
                    "type": "input_text",
                    "text": PROMPT,
                },
            ],
        }
    ],
}
t0 = time.perf_counter()
wonder_resp = requests.post(
    f"{BASE_URL}/responses",
    headers={**HEADERS, "Content-Type": "application/json"},
    json=wonder_body,
    timeout=300,
)
wonder_latency = time.perf_counter() - t0
wonder_resp.raise_for_status()
wonder_json = wonder_resp.json()
save_cache("muse_wonder_response", wonder_json)

wonder_usage = wonder_json.get("usage", {})
wonder_output = ""
for item in wonder_json.get("output", []):
    for block in item.get("content", []):
        if block.get("type") == "output_text":
            wonder_output += block.get("text", "")
print_result("muse-wonder-1.0", wonder_latency, wonder_usage, wonder_output)

# ---------------------------------------------------------------------------
# (c) muse-spark (Standard-tier) — reasoning_effort = "low"
# ---------------------------------------------------------------------------
print("\n[c] Calling muse-spark-1.3 (Standard, reasoning_effort=low) …")
spark_body = {
    "model": "muse-spark-1.3",
    "reasoning": {"effort": "low"},
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "input_file",
                    "file_id": FILE_ID,
                },
                {
                    "type": "input_text",
                    "text": PROMPT,
                },
            ],
        }
    ],
}
t0 = time.perf_counter()
spark_resp = requests.post(
    f"{BASE_URL}/responses",
    headers={**HEADERS, "Content-Type": "application/json"},
    json=spark_body,
    timeout=300,
)
spark_latency = time.perf_counter() - t0
spark_resp.raise_for_status()
spark_json = spark_resp.json()
save_cache("muse_spark_response", spark_json)

spark_usage = spark_json.get("usage", {})
spark_output = ""
for item in spark_json.get("output", []):
    for block in item.get("content", []):
        if block.get("type") == "output_text":
            spark_output += block.get("text", "")
print_result("muse-spark-1.3 (Standard)", spark_latency, spark_usage, spark_output)

# ---------------------------------------------------------------------------
# (d) sam-3.1 — segment "hand" in the video
# ---------------------------------------------------------------------------
print("\n[d] Calling sam-3.1 (segment 'hand') …")
sam_body = {
    "model": "sam-3.1",
    "stream": False,
    "input": [
        {
            "type": "message",
            "role": "user",
            "content": [
                {
                    "type": "input_text",
                    "text": "hand",
                },
                {
                    "type": "input_video",
                    "file_id": FILE_ID,
                },
            ],
        }
    ],
}
t0 = time.perf_counter()
sam_resp = requests.post(
    f"{BASE_URL}/responses",
    headers={**HEADERS, "Content-Type": "application/json"},
    json=sam_body,
    timeout=300,
)
sam_latency = time.perf_counter() - t0
sam_resp.raise_for_status()
sam_json = sam_resp.json()
save_cache("sam_response", sam_json)

sam_usage = sam_json.get("usage", {})
sam_output = ""
for item in sam_json.get("output", []):
    for block in item.get("content", []):
        if block.get("type") == "output_text":
            sam_output += block.get("text", "")
print_result("sam-3.1", sam_latency, sam_usage, sam_output)

print("\n✅ All calls complete. Raw responses in data/cache/")
