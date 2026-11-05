import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The browser never sees the API key. It posts here, and this route forwards
 * to the real endpoint with the key attached — carrying the caller's
 * Idempotency-Key through untouched so retries stay retries.
 */
export async function POST(req: Request) {
  const body = await req.text();
  const idempotencyKey = req.headers.get("idempotency-key");

  const { status, body: result } = await apiFetch(
    "/bookings",
    { method: "POST", body },
    idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {},
  );

  return NextResponse.json(result, { status });
}
