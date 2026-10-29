import { NextResponse } from "next/server";

/**
 * POST /api/sam
 *
 * Intended behaviour (not yet implemented):
 *   Accept a JSON body { file_id: string, phrase: string }, call
 *   sam-3.1 via the Meta Responses API
 *   (POST https://api.meta.ai/v1/responses) with an input_video block,
 *   and stream back the raw segmentation token output (boxes + masks).
 *
 * Environment variable required: META_API_KEY
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "POST /api/sam is not yet implemented. " +
        "It will call sam-3.1 to segment a named phrase in the uploaded video and return boxes + masks.",
    },
    { status: 501 },
  );
}
