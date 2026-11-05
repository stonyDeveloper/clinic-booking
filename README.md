# Morrow — clinic booking

A booking API for a small clinic, and the page patients use to book with it.
Built to the [Koya Cohort 4 Task 1 contract](https://koyaacademy.com/assessment-api);
all five levels are implemented and covered by an automated audit.

Morrow is a fictional practice — the name, address and opening hours are
placeholders. The slots and bookings are real rows in Postgres, served by the API.

## What it does

- **Level 1** — replace the slot set, list availability, book a slot, read a booking back.
- **Level 2** — every request needs an API key. Names and emails are trimmed, emails are
  validated and stored lower-case, and slots that have already started are refused.
- **Level 3** — a slot holds at most one confirmed booking, enforced by Postgres so it
  holds under simultaneous requests. Bookings can be cancelled, which frees the slot.
- **Level 4** — a retried booking carrying the same `Idempotency-Key` returns the original
  response instead of booking twice. A person's bookings page with an opaque cursor.
- **Level 5** — five booking attempts per email per minute, failed attempts included,
  then `429` with a `Retry-After` header.

## The contract

| Method | Path | Purpose | Level |
| --- | --- | --- | --- |
| `POST` | `/reset` | Delete every booking and replace the slot set | 1 |
| `GET` | `/slots?provider=` | Every slot, earliest first, with availability | 1 |
| `POST` | `/bookings` | Book a slot | 1–5 |
| `GET` | `/bookings/{id}` | Read one booking | 1 |
| `DELETE` | `/bookings/{id}` | Cancel a booking | 3 |
| `GET` | `/bookings?email=&limit=&cursor=` | A person's bookings, oldest first | 4 |

Every response is JSON. Every error is exactly `{"error": "<message>"}` — including
unknown URLs (`404`) and unsupported methods (`405`). Every request must carry
`X-API-Key`; a missing or wrong key returns `401`. Slot and booking times are ISO 8601
strings and are echoed back exactly as they were supplied.

```bash
curl "https://your-app.vercel.app/slots?provider=Dr%20Ade" \
  -H "X-API-Key: $API_KEY"
```

```bash
curl -X POST "https://your-app.vercel.app/bookings" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: 5f0c1a2e-8b7d-4e21-9a3c-1d2e3f4a5b6c" \
  -d '{"slot_id":"s1","name":"Ada Obi","email":"ada@example.com"}'
```

## Running it

```bash
cp .env.example .env.local     # set API_KEY; DATABASE_URL is optional locally
npm install
npm run dev
```

`DATABASE_URL` points at Postgres — Neon in production. Leave it unset and the app runs
on an embedded Postgres (PGlite) under `.data/`, seeding a week of appointments, so the
project starts with no database to install.

## Design decisions

**The database owns the double-booking rule.** Bookings are guarded by a partial unique
index rather than a check in application code:

```sql
create unique index bookings_one_confirmed_per_slot
  on bookings (slot_id) where status = 'confirmed';
```

The insert is `on conflict ... do nothing`, so when requests arrive together Postgres
picks one winner and the other gets an empty result, which becomes a `409`. An
application-level check would race: two requests can both read "available" before either
writes. Cancelling sets `status = 'cancelled'`, which drops the row out of the index and
makes the slot bookable again.

**Idempotency stores the whole response.** A key is claimed with an insert, the work is
done, and the exact status and body are written back. A retry finds that row and replays
it — same `201`, same booking `id`. Storing only the booking would still let a retry
collide with its own first request and return `409`.

**Cursors are a sequence, not a timestamp.** The first implementation encoded
`created_at`, which loses precision: Postgres keeps microseconds and JavaScript keeps
milliseconds, so a cursor pointed *before* the row it came from and that row appeared on
the next page twice. Paging now sorts on a `bigserial` and cannot skip or repeat.

**The page never holds the API key.** It is server-rendered: the server calls
`GET /slots` with the key and sends the browser only HTML. Form submissions post to a
same-origin route that attaches the key before forwarding to `POST /bookings`.

## The page

An editorial clinic schedule — bone paper, ink, one oxblood accent, hairlines instead of
cards, Instrument Serif for display and JetBrains Mono for every time.

The next available appointment is computed from live data. Slot rows fill on hover; the
clicked row expands in place into the booking form and then into the confirmation, with a
stamped reference and an `.ics` download. "Your appointments" looks bookings up by email,
pages through them and cancels. Scroll reveals, a trailing cursor dot and smooth scrolling
all collapse to plain fades under `prefers-reduced-motion`.

## Testing

| Command | What it covers |
| --- | --- |
| `npm run audit` | 71 checks that walk the specification requirement by requirement |
| `npm run smoke` | 61-check regression run for everyday changes |
| `npm run flow` | Headless-browser walkthrough of the page, saving screenshots to `shots/` |

Each accepts `BASE` and `KEY` to run against a deployment:

```bash
BASE=https://your-app.vercel.app KEY=... npm run audit
```

The checks include a 25-way simultaneous booking race, an idempotent replay, three pages
of cursor paging and a six-attempt rate-limit burst.

## Deploying

See [DEPLOY.md](./DEPLOY.md) for the Vercel and Neon checklist, and
[LOOM.md](./LOOM.md) for the recorded walkthrough script.

## Project layout

```
app/            route handlers for the API, and the page itself
app/api/ui/     same-origin proxies used by the page
components/     the page's UI and motion
lib/            schema, database access, validation, idempotency, rate limiting
scripts/        audit, smoke and browser checks
```

## Trade-offs

- `/reset` also clears idempotency keys and rate-limit counters. The spec only names
  bookings and slots; without this, a second test run inherits the first run's limiter
  and fails spuriously.
- The default page size of 10 is unobservable in practice: the rate limiter allows only
  five bookings per email per minute, so no person can have ten bookings to page through.
  The endpoint honours the documented default regardless.
- Neon's free tier suspends compute when idle. The first request after a quiet period
  takes about a second; the data is never lost.
