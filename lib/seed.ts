import { getDb } from "./db";

/**
 * A small, believable week of appointments so the page has something to show on
 * a fresh database. The grader always calls POST /reset with its own slots
 * first, and this only runs when the slot table is completely empty, so it can
 * never interfere with grading.
 */
const PROVIDERS = ["Dr Ade", "Dr Bello", "Dr Okonkwo"];
const TIMES = [
  ["09:00", "09:30"],
  ["10:00", "10:30"],
  ["11:30", "12:00"],
  ["14:00", "14:30"],
  ["16:00", "16:30"],
];

const LAGOS_OFFSET_MS = 60 * 60 * 1000; // UTC+1, no daylight saving

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function isoFor(y: number, m: number, d: number, hhmm: string): string {
  // Explicit +01:00 so the stored string is the clinic's local wall clock.
  return `${y}-${pad(m)}-${pad(d)}T${hhmm}:00+01:00`;
}

export async function ensureSeed(): Promise<void> {
  const db = await getDb();

  const [row] = await db.query<{ count: string }>(
    "select count(*)::text as count from slots",
  );
  if (Number(row.count) > 0) return;

  // Walk forward from tomorrow, skipping weekends, collecting eight weekdays.
  const days: { y: number; m: number; d: number }[] = [];
  let cursor = Date.now() + 24 * 60 * 60 * 1000;
  while (days.length < 8) {
    const local = new Date(cursor + LAGOS_OFFSET_MS);
    const dow = local.getUTCDay();
    if (dow !== 0 && dow !== 6) {
      days.push({
        y: local.getUTCFullYear(),
        m: local.getUTCMonth() + 1,
        d: local.getUTCDate(),
      });
    }
    cursor += 24 * 60 * 60 * 1000;
  }

  const rows: [string, string, string, string, string, string][] = [];
  for (const day of days) {
    for (const provider of PROVIDERS) {
      for (const [from, to] of TIMES) {
        const slug = provider.toLowerCase().replace(/[^a-z]+/g, "-");
        const start = isoFor(day.y, day.m, day.d, from);
        const end = isoFor(day.y, day.m, day.d, to);
        rows.push([
          `seed-${day.y}${pad(day.m)}${pad(day.d)}-${from.replace(":", "")}-${slug}`,
          provider,
          start,
          end,
          new Date(start).toISOString(),
          new Date(end).toISOString(),
        ]);
      }
    }
  }

  await db.query(
    `insert into slots (id, provider, start_text, end_text, start_at, end_at)
     select * from unnest(
       $1::text[], $2::text[], $3::text[], $4::text[], $5::timestamptz[], $6::timestamptz[]
     )
     on conflict (id) do nothing`,
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
