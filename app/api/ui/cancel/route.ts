import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Cancels a booking through the public API, key attached server-side. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { id?: string } | null;
  const id = typeof body?.id === "string" ? body.id.trim() : "";

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  const { status, body: result } = await apiFetch(
    `/bookings/${encodeURIComponent(id)}`,
    { method: "DELETE" },
  );

  return NextResponse.json(result, { status });
}
