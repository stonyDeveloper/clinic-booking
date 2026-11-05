import { checkApiKey } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { guarded } from "@/lib/handler";
import { methodNotAllowed } from "@/lib/methods";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SlotInput = {
  id?: unknown;
  provider?: unknown;
  start?: unknown;
  end?: unknown;
};

/**
 * POST /reset — the grader's clean slate.
 *
 * Drops every booking, replaces the slot set wholesale (past slots included,
 * deliberately), and clears the per-request state that would otherwise make a
 * second test run behave differently from the first.
 */
export const POST = guarded(async function POST(req: Request) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await readJson(req);
  if (body === undefined) return fail("body must be valid JSON", 400);

  const slots = (body as { slots?: unknown } | null)?.slots;
  if (!Array.isArray(slots)) return fail("slots must be an array", 400);

  const rows: [string, string, string, string, string, string][] = [];

  for (const raw of slots as SlotInput[]) {
    const id = typeof raw?.id === "string" ? raw.id.trim() : "";
    const provider = typeof raw?.provider === "string" ? raw.provider.trim() : "";
    const start = typeof raw?.start === "string" ? raw.start : "";
    const end = typeof raw?.end === "string" ? raw.end : "";

    if (!id || !provider || !start || !end) {
      return fail("each slot needs a non-empty id, provider, start and end", 400);
    }

    const startAt = new Date(start);
    const endAt = new Date(end);
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      return fail(`slot ${id} has an invalid start or end`, 400);
    }

    rows.push([id, provider, start, end, startAt.toISOString(), endAt.toISOString()]);
  }

  if (new Set(rows.map((row) => row[0])).size !== rows.length) {
    return fail("slot ids must be unique", 400);
  }

  const db = await getDb();

  await db.query("delete from bookings");
  await db.query("delete from slots");
  await db.query("delete from idempotency_keys");
  await db.query("delete from booking_attempts");

  if (rows.length > 0) {
    await db.query(
      `insert into slots (id, provider, start_text, end_text, start_at, end_at)
       select * from unnest(
         $1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::timestamptz[]
       )`,
      [
        rows.map((r) => r[0]),
        rows.map((r) => r[1]),
        rows.map((r) => r[2]),
        rows.map((r) => r[3]),
        rows.map((r) => r[4]),
        rows.map((r) => r[5]),
      ],
    );
  }

  return json({ reset: true, slots: rows.length });
});

export function GET() {
  return methodNotAllowed(["POST"]);
}

export function PUT() {
  return methodNotAllowed(["POST"]);
}

export function PATCH() {
  return methodNotAllowed(["POST"]);
}

export function DELETE() {
  return methodNotAllowed(["POST"]);
}
