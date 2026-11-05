import { checkApiKey } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { guarded } from "@/lib/handler";
import { json } from "@/lib/http";
import { methodNotAllowed } from "@/lib/methods";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type SlotRow = {
  id: string;
  provider: string;
  start: string;
  end: string;
  available: boolean;
};

/**
 * GET /slots — every slot, earliest first, with a live availability flag.
 *
 * `available` is computed from bookings at read time rather than stored on the
 * slot, so it cannot drift out of sync with the booking table.
 */
export const GET = guarded(async function GET(req: Request) {
  const denied = checkApiKey(req);
  if (denied) return denied;

  const provider = new URL(req.url).searchParams.get("provider");
  const db = await getDb();

  const slots = await db.query<SlotRow>(
    `select s.id,
            s.provider,
            s.start_text as start,
            s.end_text   as end,
            not exists (
              select 1 from bookings b
              where b.slot_id = s.id and b.status = 'confirmed'
            ) as available
       from slots s
      where ($1::text is null or s.provider = $1::text)
      order by s.start_at asc, s.id asc`,
    [provider],
  );

  return json({ slots });
});

export function POST() {
  return methodNotAllowed(["GET"]);
}

export function PUT() {
  return methodNotAllowed(["GET"]);
}

export function PATCH() {
  return methodNotAllowed(["GET"]);
}

export function DELETE() {
  return methodNotAllowed(["GET"]);
}
