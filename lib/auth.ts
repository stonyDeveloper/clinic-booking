import { timingSafeEqual } from "node:crypto";
import { fail } from "./http";

function sameSecret(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Every route starts here. Returns a 401 response when the caller should be
 * turned away, or null when the request may proceed.
 */
export function checkApiKey(req: Request): Response | null {
  const expected = process.env.API_KEY;
  if (!expected) {
    // Fail loudly rather than silently accepting everything.
    return fail("server misconfigured: API_KEY is not set", 500);
  }

  const given = req.headers.get("x-api-key");
  if (!given || !sameSecret(given, expected)) {
    return fail("missing or invalid API key", 401);
  }

  return null;
}
