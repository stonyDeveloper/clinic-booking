import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Anything that is not one of the documented paths lands here, so an unknown
 * URL still answers with JSON instead of Next's HTML 404 page.
 */
function notFound() {
  return NextResponse.json({ error: "not found" }, { status: 404 });
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
export const HEAD = notFound;
