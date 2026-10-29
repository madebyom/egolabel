import { NextResponse } from "next/server";

/**
 * POST /api/upload
 *
 * Intended behaviour (not yet implemented):
 *   Accept a multipart video file, forward it to the Meta Files API
 *   (POST https://api.meta.ai/v1/files, purpose=user_data), and return
 *   the resulting file_id so the client can reference it in /api/wonder
 *   and /api/sam.
 *
 * Environment variable required: META_API_KEY
 */
export async function POST() {
  return NextResponse.json(
    {
      error: "not_implemented",
      message:
        "POST /api/upload is not yet implemented. " +
        "It will forward the uploaded video to the Meta Files API and return a file_id.",
    },
    { status: 501 },
  );
}
