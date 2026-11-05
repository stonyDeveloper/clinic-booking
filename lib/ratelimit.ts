import type { Db } from "./db";

export const WINDOW_SECONDS = 60;
export const MAX_ATTEMPTS = 5;

/**
 * Level 5: at most five attempts per email per minute, failures included.
 *
 * The whole check is one statement. It inserts an attempt row only when fewer
 * than five exist inside the window, so a burst cannot slip past by having
 * every request read the same count and then all insert.
 */
export async function checkAndRecord(
  db: Db,
  email: string,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const inserted = await db.query<{ id: string }>(
    `insert into booking_attempts (email)
     select $1
      where (
        select count(*) from booking_attempts
         where email = $1
           and created_at > now() - interval '${WINDOW_SECONDS} seconds'
      ) < ${MAX_ATTEMPTS}
     returning id`,
    [email],
  );

  if (inserted.length > 0) return { allowed: true, retryAfter: 0 };

  // The oldest attempt in the window is the one that has to age out before
  // this email can try again, so Retry-After counts down from there.
  const [row] = await db.query<{ retry_after: number }>(
    `select greatest(
              1,
              ceil(extract(epoch from (min(created_at) + interval '${WINDOW_SECONDS} seconds' - now())))
            )::int as retry_after
       from booking_attempts
      where email = $1
        and created_at > now() - interval '${WINDOW_SECONDS} seconds'`,
    [email],
  );

  return { allowed: false, retryAfter: row?.retry_after ?? WINDOW_SECONDS };
}
