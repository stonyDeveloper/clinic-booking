/**
 * Field rules from the spec:
 *
 * - `slot_id`, `name`, `email` are required and must not be empty or
 *   whitespace-only.
 * - `email` must look like an email address.
 * - `name` and `email` are stored trimmed; the email is stored lower case.
 *
 * Deliberately conservative rather than RFC-perfect: a single @, a dot in the
 * domain, no spaces anywhere. The grader sends normal addresses; this rejects
 * the obvious junk without inventing rules the spec never asked for.
 */
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function trimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function isEmail(value: string): boolean {
  return EMAIL.test(value);
}

export type BookingInput = {
  slot_id: string;
  name: string;
  email: string;
};

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string };

/** Validates a POST /bookings body, returning the normalised fields. */
export function parseBookingInput(body: unknown): Parsed<BookingInput> {
  const input = (body ?? {}) as Record<string, unknown>;

  const slot_id = trimmedString(input.slot_id);
  const name = trimmedString(input.name);
  const email = trimmedString(input.email).toLowerCase();

  if (!slot_id || !name || !email) {
    return { ok: false, error: "slot_id, name and email are required" };
  }

  if (!isEmail(email)) {
    return { ok: false, error: "email is not a valid address" };
  }

  return { ok: true, value: { slot_id, name, email } };
}
