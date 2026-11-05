import { createHash } from "node:crypto";

/**
 * "The same body" is compared semantically, not byte-for-byte: key order and
 * whitespace do not make a different request. Arrays keep their order.
 */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonical((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function hashBody(body: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify(canonical(body)))
    .digest("hex");
}
