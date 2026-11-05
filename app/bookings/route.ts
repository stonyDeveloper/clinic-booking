import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { checkApiKey } from "@/lib/auth";
import { BOOKING_COLUMNS, presentBooking, type BookingRow } from "@/lib/bookings";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import { getDb } from "@/lib/db";
import { fail, json, readJson } from "@/lib/http";
import { guarded } from "@/lib/handler";
import { hashBody } from "@/lib/idempotency";
import { methodNotAllowed } from "@/lib/methods";
import { checkAndRecord } from "@/lib/ratelimit";
import { parseBookingInput } from "@/lib/validate";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type IdempotencyRow = {
  request_hash: string;
  status_code: number | null;
  response_body: string | null;
};

/**
 * POST /bookings — levels 1 to 5.
 *
 * The order of checks is deliberate:
 *   1. price of entry — the API key
 *   2. idempotent replay, before anything that consumes state
 *   3. the rate limiter, before anything that can fail, so failures count
 *   4. validation, slot existence, slot start time
 *   5. the insert, where the database decides who wins the race
 */
export const POST = guarded(async function POST(req: Request) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const body = await readJson(req);
  if (body === undefined) return fail("body must be valid JSON", 400);

  const db = await getDb();
  const idempotencyKey = req.headers.get("idempotency-key");
  const requestHash = idempotencyKey ? hashBody(body) : "";

  // Every response we produce is recorded against the key, so a retry replays
  // the original status and booking id instead of repeating the work.
  const respond = async (
    status: number,
    payload: unknown,
    headers?: Record<string, string>,
  ) => {
    if (idempotencyKey) {
      await db.query(
        "update idempotency_keys set status_code = $2, response_body = $3 where key = $1",
        [idempotencyKey, status, JSON.stringify(payload)],
      );
    }
    return NextResponse.json(payload, { status, headers });
  };

  /** Returns a response when this key has already been seen, otherwise null. */
  const replay = async (): Promise<NextResponse | null> => {
    if (!idempotencyKey) return null;

    const [row] = await db.query<IdempotencyRow>(
      "select request_hash, status_code, response_body from idempotency_keys where key = $1",
      [idempotencyKey],
    );
    if (!row) return null;

    if (row.request_hash !== requestHash) {
      return NextResponse.json(
        { error: "idempotency key reused with a different body" },
        { status: 422 },
      );
    }

    if (row.status_code === null || row.response_body === null) {
      return NextResponse.json(
        { error: "a request with this idempotency key is still being processed" },
        { status: 409 },
      );
    }

    return new NextResponse(row.response_body, {
      status: row.status_code,
      headers: {
        "content-type": "application/json",
        "idempotent-replay": "true",
      },
    });
  };

  const alreadySeen = await replay();
  if (alreadySeen) return alreadySeen;

  if (idempotencyKey) {
    // Claim the key. If another instance claimed it first, `replay` will either
    // find the finished response or report that it is still in flight.
    const claimed = await db.query(
      `insert into idempotency_keys (key, request_hash) values ($1, $2)
       on conflict (key) do nothing
       returning key`,
      [idempotencyKey, requestHash],
    );

    if (claimed.length === 0) {
      const raced = await replay();
      if (raced) return raced;
      return fail("a request with this idempotency key is still being processed", 409);
    }
  }

  try {
    const raw = (body ?? {}) as Record<string, unknown>;
    const rawEmail =
      typeof raw.email === "string" ? raw.email.trim().toLowerCase() : "";

    // Level 5, before validation: a request that fails still spends an attempt.
    if (rawEmail) {
      const limit = await checkAndRecord(db, rawEmail);
      if (!limit.allowed) {
        return await respond(
          429,
          { error: "too many booking attempts for this email" },
          { "Retry-After": String(limit.retryAfter) },
        );
      }
    }

    const parsed = parseBookingInput(body);
    if (!parsed.ok) return await respond(400, { error: parsed.error });

    const { slot_id: slotId, name, email } = parsed.value;

    const [slot] = await db.query<{ start_at: Date | string }>(
      "select start_at from slots where id = $1",
      [slotId],
    );
    if (!slot) return await respond(404, { error: "slot not found" });

    if (new Date(slot.start_at).getTime() <= Date.now()) {
      return await respond(400, { error: "slot has already started" });
    }

    const rows = await db.query<BookingRow>(
      `insert into bookings (id, slot_id, name, email, status, created_at)
       values ($1, $2, $3, $4, 'confirmed', now())
       on conflict (slot_id) where status = 'confirmed' do nothing
       returning ${BOOKING_COLUMNS}`,
      [randomUUID(), slotId, name, email],
    );

    if (rows.length === 0) return await respond(409, { error: "slot is already booked" });

    return await respond(201, presentBooking(rows[0]));
  } catch (error) {
    // Never leave a claimed key pointing at a request that died.
    if (idempotencyKey) {
      await db
        .query("delete from idempotency_keys where key = $1", [idempotencyKey])
        .catch(() => undefined);
    }
    throw error;
  }
});

/**
 * GET /bookings — a person's bookings, oldest first, cursor paginated.
 */
export const GET = guarded(async function GET(req: Request) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const url = new URL(req.url);
  const email = (url.searchParams.get("email") ?? "").trim().toLowerCase();
  if (!email) return fail("email is required", 400);

  const limitParam = url.searchParams.get("limit");
  const limit = limitParam === null ? 10 : Number(limitParam);
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) {
    return fail("limit must be an integer between 1 and 50", 400);
  }

  const cursorParam = url.searchParams.get("cursor");
  const after = cursorParam ? decodeCursor(cursorParam) : null;
  if (cursorParam && after === null) return fail("invalid cursor", 400);

  const db = await getDb();

  // Fetch one extra row to know whether another page exists without a count.
  const rows = await db.query<BookingRow & { seq: string }>(
    `select seq, ${BOOKING_COLUMNS}
       from bookings
      where email = $1
        and ($2::bigint is null or seq > $2::bigint)
      order by seq asc
      limit $3`,
    [email, after === null ? null : after.toString(), limit + 1],
  );

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const next_cursor = hasMore ? encodeCursor(page[page.length - 1].seq) : null;

  return json({ bookings: page.map(presentBooking), next_cursor });
});

export function PUT() {
  return methodNotAllowed(["GET", "POST"]);
}

export function PATCH() {
  return methodNotAllowed(["GET", "POST"]);
}

export function DELETE() {
  return methodNotAllowed(["GET", "POST"]);
}
