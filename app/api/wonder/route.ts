import { NextResponse } from "next/server";

/**
 * POST /api/wonder
 *
 * Intended behaviour (not yet implemented):
 *   Accept a JSON body { file_id: string, prompt?: string }, call
 *   muse-wonder-1.0 via the Meta Responses API
 *   (POST https://api.meta.ai/v1/responses) with reasoning.effort="low",
 *   and stream back a JSON array of steps visible in the video.
 *
 * Environment variable required: META_API_KEY
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "POST /api/wonder is not yet implemented. " +
        "It will call muse-wonder-1.0 with reasoning_effort=low and return a JSON array of video steps.",
    },
    { status: 501 },
  );
}
