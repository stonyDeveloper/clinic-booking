import { NextResponse } from "next/server";

/**
 * The spec says every error response is `{ "error": "<message>" }`. Next's
 * default 405 carries an empty body, so each route declares its unused methods
 * explicitly and answers in the agreed shape.
 */
export function methodNotAllowed(allowed: string[]) {
  return NextResponse.json(
    { error: "method not allowed" },
    { status: 405, headers: { Allow: allowed.join(", ") } },
  );
}
