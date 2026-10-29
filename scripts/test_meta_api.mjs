#!/usr/bin/env node
/**
 * test_meta_api.mjs — EgoLabel hackathon: smoke-test the Meta Model API.
 *
 * Steps:
 *   (a) Upload data/clips/clip01.mp4 to the Files API
 *   (b) Ask muse-wonder-1.0  to list steps in the video as JSON (reasoning_effort = "low")
 *   (c) Ask muse-spark (Standard-tier) the same question      (reasoning_effort = "low")
 *   (d) Ask sam-3.1 to segment the phrase "hand" in the same video
 *
 * Prints for each call: latency, usage fields, first 500 chars of output.
 * Saves raw responses to data/cache/.
 *
 * Docs used:
 *   https://dev.meta.ai/docs/file-handling        — Files API upload
 *   https://dev.meta.ai/docs/video-understanding  — Responses API video block
 *   https://dev.meta.ai/docs/reasoning            — reasoning_effort nesting
 *   https://dev.meta.ai/docs/sam-with-prompts     — SAM input_video + input_text
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
// FormData and Blob are globals in Node 18+ (no import needed)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const CLIP = path.join(ROOT, "data", "clips", "clip01.mp4");
const CACHE = path.join(ROOT, "data", "cache");
fs.mkdirSync(CACHE, { recursive: true });

const BASE_URL = "https://api.meta.ai/v1";

// Load .env.local
function loadEnv(filePath) {
  const env = {};
  fs.readFileSync(filePath, "utf8")
    .split("\n")
    .forEach((line) => {
      line = line.trim();
      if (!line || line.startsWith("#")) return;
      const idx = line.indexOf("=");
      if (idx === -1) return;
      env[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
    });
  return env;
}

const env = loadEnv(ENV_FILE);
const API_KEY = env["META_API_KEY"] ?? "";
if (!API_KEY) {
  console.error("META_API_KEY not found in .env.local");
  process.exit(1);
}

const HEADERS = { Authorization: `Bearer ${API_KEY}` };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function saveCache(name, data) {
  const p = path.join(CACHE, `${name}.json`);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  console.log(`  [cache] saved → ${path.relative(ROOT, p)}`);
}

function printResult(label, latencyMs, usage, outputText) {
  console.log("\n" + "=".repeat(60));
  console.log(`  Model  : ${label}`);
  console.log(`  Latency: ${(latencyMs / 1000).toFixed(2)}s`);
  console.log(`  Usage  : ${JSON.stringify(usage, null, 4)}`);
  console.log(`  Output (first 500 chars):\n    ${JSON.stringify(outputText.slice(0, 500))}`);
  console.log("=".repeat(60) + "\n");
}

async function post(endpoint, bodyOrForm, extraHeaders = {}) {
  const url = `${BASE_URL}${endpoint}`;
  const isForm = bodyOrForm instanceof FormData;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      ...HEADERS,
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...extraHeaders,
    },
    body: isForm ? bodyOrForm : JSON.stringify(bodyOrForm),
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`HTTP ${resp.status} ${resp.statusText}: ${txt}`);
  }
  return resp.json();
}

function extractOutput(responseJson) {
  let text = "";
  for (const item of responseJson.output ?? []) {
    for (const block of item.content ?? []) {
      if (block.type === "output_text") text += block.text ?? "";
    }
  }
  return text;
}

const PROMPT =
  'List every distinct step visible in this video as a JSON array. ' +
  'Each element should have keys "step_number" (int) and "description" (string). ' +
  "Return only valid JSON, no markdown fences.";

// ---------------------------------------------------------------------------
// (a) Upload clip to Files API
// ---------------------------------------------------------------------------
console.log("\n[a] Uploading video to Files API …");
const t0a = performance.now();

const form = new FormData();
const videoBytes = fs.readFileSync(CLIP);
const videoBlob = new Blob([videoBytes], { type: "video/mp4" });
form.append("file", videoBlob, path.basename(CLIP));
form.append("purpose", "user_data");

const uploadJson = await post("/files", form);
const uploadLatency = performance.now() - t0a;
saveCache("upload_response_node", uploadJson);

const FILE_ID =
  uploadJson.id ?? uploadJson.file_id ?? uploadJson.file?.id;
console.log(`  File ID : ${FILE_ID}`);
console.log(`  Latency : ${(uploadLatency / 1000).toFixed(2)}s`);
console.log(`  Response: ${JSON.stringify(uploadJson, null, 2).slice(0, 400)}`);

if (!FILE_ID) {
  console.error("Could not extract file_id. See data/cache/upload_response_node.json");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// (b) muse-wonder-1.0 — reasoning_effort = "low"
// ---------------------------------------------------------------------------
console.log("\n[b] Calling muse-wonder-1.0 (reasoning_effort=low) …");
const wonderBody = {
  model: "muse-wonder-1.0",
  reasoning: { effort: "low" },
  input: [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_file", file_id: FILE_ID },
        { type: "input_text", text: PROMPT },
      ],
    },
  ],
};
const t0b = performance.now();
const wonderJson = await post("/responses", wonderBody);
const wonderLatency = performance.now() - t0b;
saveCache("muse_wonder_response_node", wonderJson);
printResult(
  "muse-wonder-1.0",
  wonderLatency,
  wonderJson.usage ?? {},
  extractOutput(wonderJson)
);

// ---------------------------------------------------------------------------
// (c) muse-spark-1.3 (Standard-tier) — reasoning_effort = "low"
// ---------------------------------------------------------------------------
console.log("\n[c] Calling muse-spark-1.3 (Standard, reasoning_effort=low) …");
const sparkBody = {
  model: "muse-spark-1.3",
  reasoning: { effort: "low" },
  input: [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_file", file_id: FILE_ID },
        { type: "input_text", text: PROMPT },
      ],
    },
  ],
};
const t0c = performance.now();
const sparkJson = await post("/responses", sparkBody);
const sparkLatency = performance.now() - t0c;
saveCache("muse_spark_response_node", sparkJson);
printResult(
  "muse-spark-1.3 (Standard)",
  sparkLatency,
  sparkJson.usage ?? {},
  extractOutput(sparkJson)
);

// ---------------------------------------------------------------------------
// (d) sam-3.1 — segment "hand"
// ---------------------------------------------------------------------------
console.log("\n[d] Calling sam-3.1 (segment 'hand') …");
const samBody = {
  model: "sam-3.1",
  stream: false,
  input: [
    {
      type: "message",
      role: "user",
      content: [
        { type: "input_text", text: "hand" },
        { type: "input_video", file_id: FILE_ID },
      ],
    },
  ],
};
const t0d = performance.now();
const samJson = await post("/responses", samBody);
const samLatency = performance.now() - t0d;
saveCache("sam_response_node", samJson);
printResult("sam-3.1", samLatency, samJson.usage ?? {}, extractOutput(samJson));

console.log("\n✅ All calls complete. Raw responses in data/cache/");
