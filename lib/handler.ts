import { NextResponse } from "next/server";

/**
 * Last line of defence for the contract's opening line: every error response
 * looks like `{ "error": "<message>" }`.
 *
 * Handlers already return that shape for every anticipated failure. This
 * catches the unanticipated ones — a dropped database connection, a constraint
 * we did not model — so the caller still gets JSON instead of the platform's
 * HTML error page.
 */
export function guarded<A extends unknown[]>(
  handler: (...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return async (...args: A) => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("[api] unhandled error", error);
      return NextResponse.json(
        { error: "internal server error" },
        { status: 500 },
      );
    }
  };
}
