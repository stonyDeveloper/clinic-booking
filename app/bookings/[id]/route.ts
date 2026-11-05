import { checkApiKey } from "@/lib/auth";
import { BOOKING_COLUMNS, presentBooking, type BookingRow } from "@/lib/bookings";
import { getDb } from "@/lib/db";
import { guarded } from "@/lib/handler";
import { fail, json } from "@/lib/http";
import { methodNotAllowed } from "@/lib/methods";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /bookings/{id} */
export const GET = guarded(async function GET(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = await getDb();

  const rows = await db.query<BookingRow>(
    `select ${BOOKING_COLUMNS} from bookings where id = $1`,
    [id],
  );

  if (rows.length === 0) return fail("booking not found", 404);
  return json(presentBooking(rows[0]));
});

/**
 * DELETE /bookings/{id} — cancel.
 *
 * The update is conditional on `status = 'confirmed'`, so two simultaneous
 * cancels cannot both "succeed": the second matches no row and falls through
 * to the 409. Cancelling also frees the slot, because the partial unique index
 * only covers confirmed rows.
 */
export const DELETE = guarded(async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const { id } = await ctx.params;
  const db = await getDb();

  const updated = await db.query<BookingRow>(
    `update bookings
        set status = 'cancelled'
      where id = $1 and status = 'confirmed'
      returning ${BOOKING_COLUMNS}`,
    [id],
  );

  if (updated.length > 0) return json(presentBooking(updated[0]));

  const existing = await db.query<BookingRow>(
    `select ${BOOKING_COLUMNS} from bookings where id = $1`,
    [id],
  );

  if (existing.length === 0) return fail("booking not found", 404);
  return fail("booking is already cancelled", 409);
});

export function POST() {
  return methodNotAllowed(["GET", "DELETE"]);
}

export function PUT() {
  return methodNotAllowed(["GET", "DELETE"]);
}

export function PATCH() {
  return methodNotAllowed(["GET", "DELETE"]);
}
