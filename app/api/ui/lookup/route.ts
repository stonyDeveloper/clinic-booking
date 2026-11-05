import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Same-origin lookup of a person's bookings, key added server-side. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const email = url.searchParams.get("email") ?? "";
  const cursor = url.searchParams.get("cursor");

  const query = new URLSearchParams({ email });
  if (cursor) query.set("cursor", cursor);
  query.set("limit", "5");

  const { status, body } = await apiFetch(`/bookings?${query.toString()}`);
  return NextResponse.json(body, { status });
}
