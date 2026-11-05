/**
 * Shared booking types and shaping.
 *
 * These live here rather than in `app/bookings/route.ts` because Next only
 * allows route modules to export HTTP handlers and a small set of config
 * values — a stray export fails the build.
 */

export type BookingRow = {
  id: string;
  slot_id: string;
  name: string;
  email: string;
  status: "confirmed" | "cancelled";
  created_at: Date | string;
};

export const BOOKING_COLUMNS = "id, slot_id, name, email, status, created_at";

/** Shapes a database row into the booking object the spec defines. */
export function presentBooking(row: BookingRow) {
  return {
    id: row.id,
    slot_id: row.slot_id,
    name: row.name,
    email: row.email,
    status: row.status,
    created_at: new Date(row.created_at).toISOString(),
  };
}
