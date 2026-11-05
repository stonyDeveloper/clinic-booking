/**
 * The database schema.
 *
 * Two design rules drive it:
 *
 * 1. Slot times are stored twice: `*_text` keeps the exact string the client
 *    sent, so responses echo it back byte-for-byte, and `*_at` is the parsed
 *    timestamp used for ordering and "has this slot started?" checks.
 *
 * 2. The rule "one confirmed booking per slot" lives in the database as a
 *    partial unique index, not in application code. Two requests arriving at
 *    the same moment cannot both win, because the second INSERT fails at the
 *    storage layer.
 */
export const SCHEMA: string[] = [
  `create table if not exists slots (
    id          text primary key,
    provider    text not null,
    start_text  text not null,
    end_text    text not null,
    start_at    timestamptz not null,
    end_at      timestamptz not null
  )`,

  `create table if not exists bookings (
    id          text primary key,
    seq         bigserial,
    slot_id     text not null,
    name        text not null,
    email       text not null,
    status      text not null check (status in ('confirmed', 'cancelled')),
    created_at  timestamptz not null default now()
  )`,

  // Databases created before `seq` existed need the column added; bigserial
  // backfills existing rows and keeps counting from there.
  `alter table bookings add column if not exists seq bigserial`,

  `create unique index if not exists bookings_seq on bookings (seq)`,

  // The whole of Level 3. Cancelled bookings drop out of the index, so a
  // cancelled slot immediately becomes bookable again.
  `create unique index if not exists bookings_one_confirmed_per_slot
     on bookings (slot_id) where status = 'confirmed'`,

  // Supports "my bookings, oldest first" without a sort.
  `create index if not exists bookings_email_created
     on bookings (email, created_at asc, id asc)`,

  // Level 4: one row per Idempotency-Key, holding the exact response we sent
  // so a retry can be replayed verbatim.
  `create table if not exists idempotency_keys (
    key           text primary key,
    request_hash  text not null,
    status_code   integer,
    response_body text,
    created_at    timestamptz not null default now()
  )`,

  // Level 5: one row per booking attempt, so the sliding window survives
  // restarts and is shared by every instance.
  `create table if not exists booking_attempts (
    id          bigserial primary key,
    email       text not null,
    created_at  timestamptz not null default now()
  )`,

  `create index if not exists booking_attempts_email_time
     on booking_attempts (email, created_at desc)`,
];
