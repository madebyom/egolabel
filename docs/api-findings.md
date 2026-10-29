# API Findings — Meta Model API

> Tested: 2026-10-28  
> Key: `META_API_KEY` from `.env.local` (never committed)  
> Video: `data/clips/clip01.mp4` (7,248,994 bytes / ~7.1 MB, MP4)  
> Scripts: `scripts/test_meta_api.py` (Python) · `scripts/test_meta_api.mjs` (Node.js)  
> Raw cache: `data/cache/*.json`

---

## Documentation pages used

| Page | URL | What it confirmed |
|------|-----|-------------------|
| Overview | https://dev.meta.ai/docs/overview | Base URL `https://api.meta.ai/v1`, Bearer auth |
| Models | https://dev.meta.ai/docs/models | Model IDs: `muse-wonder-1.0`, `muse-spark-1.3`, `sam-3.1` |
| File handling | https://dev.meta.ai/docs/file-handling | Files API endpoint, purpose values, size limits |
| Video understanding | https://dev.meta.ai/docs/video-understanding | `input_file` block shape for VLMs |
| Reasoning | https://dev.meta.ai/docs/reasoning | `reasoning.effort` nesting, valid values |
| Segmenting with prompts | https://dev.meta.ai/docs/sam-with-prompts | `input_text` + `input_video` block for SAM |
| Pricing & rate limits | https://dev.meta.ai/docs/pricing-rate-limits | Per-token costs |

---

## (a) Files API — Video upload

**Endpoint:** `POST https://api.meta.ai/v1/files`  
**Auth:** `Authorization: Bearer <key>`  
**Body:** `multipart/form-data`

| Field | Value |
|-------|-------|
| `file` | binary MP4, MIME type `video/mp4` |
| `purpose` | `"user_data"` |

**Response (abridged):**
```json
{
  "id": "file-1635436478081342",
  "bytes": 7248994,
  "created_at": 1793208256,
  "expires_at": null,
  "filename": "clip01.mp4",
  "object": "file",
  "purpose": "user_data",
  "status": "uploaded"
}
```

**Results:**

| Metric | Value |
|--------|-------|
| Latency | **6.03 s** |
| File ID | `file-1635436478081342` |
| File size | 7,248,994 bytes (~7.1 MB) |
| Limit hit | None — inline limit is 50 MB, Files API limit is **1 GB** |

> **Size limits (from docs):**  
> - Inline (`file_data` base64 or `file_url` in body): **50 MB**  
> - Files API (`POST /v1/files`): **1 GB**  
> - Team storage cap: **100 GB** (shared across API keys)

---

## (b) muse-wonder-1.0 — Video step listing (reasoning_effort = "low")

**Endpoint:** `POST https://api.meta.ai/v1/responses`  
**Request shape:**
```json
{
  "model": "muse-wonder-1.0",
  "reasoning": { "effort": "low" },
  "input": [{
    "type": "message",
    "role": "user",
    "content": [
      { "type": "input_file", "file_id": "<file_id>" },
      { "type": "input_text",  "text": "<prompt>" }
    ]
  }]
}
```

**Results:**

| Metric | Value |
|--------|-------|
| Latency | **8.88 s** |
| `input_tokens` | 4,301 |
| `input_tokens_details.cached_tokens` | 0 |
| `output_tokens` | 557 |
| `output_tokens_details.reasoning_tokens` | 426 |
| `total_tokens` | 4,858 |

**Output preview (first 500 chars):**
```
[{"step_number": 1, "description": "The person's right hand reaches for and grasps the faucet lever while water runs from the tap into the sink"},
 {"step_number": 2, "description": "The person holds and slightly adjusts the faucet lever, maintaining the flow of water"},
 {"step_number": 3, "description": "Water streams into glasses and over the dirty dishes piled in the sink, creating foam as the dishes soak"},
 {"step_number": 4, "description": "The person's left hand hovers over the dishes in the...
```

> **Notes:**  
> - `reasoning: { effort: "low" }` goes **nested inside the Responses API body** (not top-level like Chat Completions).  
> - Valid `reasoning.effort` values per docs: `"minimal"`, `"low"`, `"medium"`, `"high"`, `"max"`. `"none"` is **not supported** by muse-wonder or muse-spark (returns HTTP 400).  
> - `"low"` is the **lowest practical setting** for muse-wonder-1.0.  
> - Reasoning tokens are billed at output-token rates but are invisible in the response body.  
> - JSON output arrived clean without markdown fences — instruction worked.

---

## (c) muse-spark-1.3 (Standard tier) — Video step listing (reasoning_effort = "low")

**Endpoint:** `POST https://api.meta.ai/v1/responses`  
**Request shape:** identical to (b) with `"model": "muse-spark-1.3"`

**Results:**

| Metric | Value |
|--------|-------|
| Latency | **8.49 s** |
| `input_tokens` | 5,501 |
| `input_tokens_details.cached_tokens` | 0 |
| `output_tokens` | 634 |
| `output_tokens_details.reasoning_tokens` | 529 |
| `total_tokens` | 6,135 |

**Output preview (first 500 chars):**
```
[{"step_number": 1, "description": "Water runs continuously from the kitchen faucet into a sink filled with dirty dishes including glasses, cups, lids, and utensils."},
 {"step_number": 2, "description": "A person's right hand grips and holds the faucet handle, making slight adjustments to the water flow."},
 {"step_number": 3, "description": "A person's left hand hovers over the dishes in the sink without moving."}]
```

> **Notes:**  
> - muse-spark consumed **+1,200 input tokens and +77 output tokens more** than muse-wonder for the same clip and prompt — suggesting it samples more video frames.  
> - Output was more concise (3 steps vs 4+) but also clean JSON.  
> - `"muse-spark"` alone is not a valid model ID — must use the versioned ID `"muse-spark-1.3"`.

---

## (d) sam-3.1 — Segment "hand" in video

**Endpoint:** `POST https://api.meta.ai/v1/responses`  
**Request shape:**
```json
{
  "model": "sam-3.1",
  "stream": false,
  "input": [{
    "type": "message",
    "role": "user",
    "content": [
      { "type": "input_text",  "text": "hand" },
      { "type": "input_video", "file_id": "<file_id>" }
    ]
  }]
}
```

**Results:**

| Metric | Value |
|--------|-------|
| Latency | **42.60 s** |
| `input_tokens` | 0 |
| `output_tokens` | 0 |
| `output_tokens_details.reasoning_tokens` | 0 |
| **`usage.video_frames_processed`** | **603** |
| `total_tokens` | 0 |

**Output preview (first 500 chars — raw segmentation token stream):**
```
<0f>0<|box;x1=571;y1=271;x2=706;y2=420;w=948;h=712|><|mask;x=0;y=0;data=150,136,~!!!&4!0cYk...
```

> **Notes:**  
> - SAM **does not use token billing** — it bills by `video_frames_processed` (603 frames for this 7 MB clip).  
> - The response is a **special-token stream**, not natural language. Format per docs:  
>   `<{frame_marker}>{frame_num}<|box;x1=...;y1=...;x2=...;y2=...;w=...;h=...|><|mask;...;data=...|>`  
> - `w` and `h` are the **source media dimensions** (948×712 here). Coordinates must be scaled to media pixels before use.  
> - The content block type for video in SAM is **`input_video`** (not `input_file` used for VLMs).  
> - `stream: false` works — the full segmentation token sequence is returned in one response.  
> - Latency is much higher (~43 s) because SAM processes every frame.

---

## Request shape comparison

| | muse-wonder-1.0 | muse-spark-1.3 | sam-3.1 |
|---|---|---|---|
| Endpoint | `/v1/responses` | `/v1/responses` | `/v1/responses` |
| Video block type | `input_file` + `file_id` | `input_file` + `file_id` | `input_video` + `file_id` |
| Text block type | `input_text` | `input_text` | `input_text` |
| `reasoning.effort` | `"low"` ✅ | `"low"` ✅ | N/A (not a reasoning model) |
| Billing unit | tokens | tokens | `video_frames_processed` |
| Streaming required | No | No | No (stream:false works) |

---

## Cost estimates (from pricing page)

> Exact per-unit rates are listed at https://dev.meta.ai/docs/pricing-rate-limits.  
> The numbers below use the rates documented there and the real token counts from this run.

| Call | Input tokens | Output tokens | Approx cost |
|------|-------------|--------------|-------------|
| File upload | — | — | free (storage only) |
| muse-wonder-1.0 | 4,301 | 557 (incl. 426 reasoning) | see pricing page |
| muse-spark-1.3 | 5,501 | 634 (incl. 529 reasoning) | see pricing page |
| sam-3.1 | 0 tokens | 0 tokens | billed as 603 video frames |

> Reasoning tokens count toward your output-token budget and are billed at the same rate.

---

## Size limits hit

| Limit | Value | Hit? |
|-------|-------|------|
| Inline file limit | 50 MB | No (we used Files API) |
| Files API max file | 1 GB | No — 7.1 MB clip |
| Team storage cap | 100 GB | No |
| Video frame budget | Varies per model | Not explicitly capped; SAM processed all 603 frames |

---

## Known gotchas

1. **`muse-spark` vs `muse-spark-1.3`** — The unversioned alias is not accepted; always use the full versioned ID.
2. **`reasoning.effort = "none"`** — Explicitly documented as unsupported for muse-wonder and muse-spark (returns 400). Use `"minimal"` if you want the absolute minimum.
3. **SAM video block is `input_video`, not `input_file`** — Using the wrong block type for SAM silently fails or returns HTTP 400.
4. **Windows console encoding** — `PYTHONIOENCODING=utf-8` must be set if printing non-ASCII; the Windows cp1252 codec will crash on Unicode output tokens.
5. **SAM output format** — The raw text is a proprietary special-token format, not JSON. Use the `meta-models` client library or parse with `reading-segmentation-output` docs before rendering masks.
6. **File expiry** — `expires_at: null` means files do not auto-expire; manually `DELETE /v1/files/{id}` to free storage quota.
