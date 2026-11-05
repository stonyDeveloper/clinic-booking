# Loom script — 5 minutes

Record against the **deployed** URL, not localhost. Keep it under five minutes;
the brief says 5 min or less.

Before you hit record:

- Open the deployed page in a fresh tab at 1440px wide (full screen).
- Have a terminal open in the project folder with the smoke test ready.
- Have three files open in your editor: `lib/schema.ts`,
  `app/bookings/route.ts`, `lib/ratelimit.ts`.

---

## 0:00 — 0:30 · What it is

> "This is a clinic booking API and the page patients use. Next.js route
> handlers on Vercel, Postgres on Neon. All five levels are done."

Keep the intro short. Do not read the spec out loud.

## 0:30 — 2:00 · Demo the page

1. Land on the hero. Let the headline animation play.
2. Point at "Next available" — "this is computed from live data, not hardcoded."
3. Scroll to the schedule. Hover a row so the oxblood fill wipes up.
4. Click a row — "the row itself expands into the form, it doesn't open a modal."
5. Type a name and email, submit. Let the confirmation stamp land.
6. Say: "reference number, and the slot is now taken — the count above dropped."
7. Scroll to **Your appointments**, look up the same email, press **Cancel**.
8. Say: "cancelling frees the slot — the schedule above turns it back to open."

That last point is the one reviewers remember: state actually moves.

## 2:00 — 3:15 · Prove the hard parts

Terminal:

```bash
BASE=https://<your-app>.vercel.app KEY=<key> node scripts/smoke.mjs
```

Let it run. Talk over the output:

> "This walks every level. The one worth watching is 'simultaneous bookings' —
> twenty-five requests hit one slot at the same instant, and exactly one wins."

When it prints `58 passed, 0 failed`, move on.

Optional, if time allows — idempotency by hand:

```bash
curl -X POST https://<app>/bookings -H "X-API-Key: <key>" \
  -H "Content-Type: application/json" -H "Idempotency-Key: demo-1" \
  -d '{"slot_id":"<id>","name":"Ada","email":"ada@example.com"}'
```

Run it twice; same booking `id` both times.

## 3:15 — 4:30 · The code

**`lib/schema.ts`** — point at the partial unique index:

> "This is the whole of level 3. One confirmed booking per slot, enforced by
> the database, not by a check in application code. Two requests can't both
> win, because the second insert fails at the storage layer — and that holds
> across every serverless instance."

**`app/bookings/route.ts`** — point at the order of checks in `POST`:

> "Order matters here. API key, then idempotent replay, then the rate limiter,
> then validation. Replay comes before the limiter so a retry is never
> punished as a new attempt, and the limiter comes before validation so failed
> attempts still count."

**`lib/ratelimit.ts`**:

> "One statement inserts an attempt only if fewer than five exist in the last
> minute, so a burst can't slip past. Retry-After counts down from the oldest
> attempt in the window instead of always saying sixty."

## 4:30 — 5:00 · Decisions and next

The form asks for two biggest decisions and what's next. Say them out loud:

> "Two decisions. First: the concurrency rule lives in Postgres as a partial
> unique index rather than a lock in the app — that's what makes it true under
> serverless, where there are many instances and no shared memory. Second:
> idempotency stores the full response, not just the booking, so a retry
> replays the original 201 instead of hitting a 409 against itself."

> "Next: I'd add per-patient auth so bookings aren't looked up by email alone,
> provider-side slot management, and expiry for the idempotency keys and rate
> limit rows — they're currently only cleared by `/reset`."

---

## Notes

- If you fumble a line, keep going. A single take that's slightly rough beats a
  perfect one that's six minutes long.
- Don't apologise for the placeholder address in the footer — say "the address
  and hours are placeholders, the slots and bookings are live."
- After submitting: leave the deployment running and don't change the code
  until they contact you.
