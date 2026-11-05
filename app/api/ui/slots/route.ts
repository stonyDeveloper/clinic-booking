import { NextResponse } from "next/server";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Same-origin read of the public slot list, with the key added server-side. */
export async function GET() {
  const { status, body } = await apiFetch("/slots");
  return NextResponse.json(body, { status });
}
