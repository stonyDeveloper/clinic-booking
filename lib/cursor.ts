/**
 * Opaque cursors for `GET /bookings`.
 *
 * The cursor is a booking's `seq` — a monotonic counter, not a timestamp.
 * Timestamps looked tempting, but Postgres stores microseconds while
 * `toISOString()` truncates to milliseconds, so a cursor could point *before*
 * the row it came from and hand that row out twice. A sequence has no such
 * precision gap.
 *
 * Keyset rather than offset, so rows created between pages cannot shift the
 * window.
 */

export function encodeCursor(seq: number | string | bigint): string {
  return Buffer.from(String(seq), "utf8").toString("base64url");
}

export function decodeCursor(cursor: string): bigint | null {
  try {
    const decoded = Buffer.from(cursor, "base64url").toString("utf8");
    if (!/^\d+$/.test(decoded)) return null;
    return BigInt(decoded);
  } catch {
    return null;
  }
}
