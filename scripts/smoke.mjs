/**
 * End-to-end smoke test against a running instance.
 *
 *   node scripts/smoke.mjs                          # local dev
 *   BASE=https://x.vercel.app KEY=... node scripts/smoke.mjs
 *
 * Exercises the contract level by level and prints a pass/fail summary.
 */

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const KEY = process.env.KEY ?? "dev-local-key-7c1f0a2b";

let passed = 0;
const failures = [];

function check(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, { body, raw, key = KEY, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(key ? { "X-API-Key": key } : {}),
      ...(body !== undefined || raw !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, body: json, raw: text, headers: res.headers };
}

const FUTURE = (h) => new Date(Date.UTC(2030, 0, 10, h, 0, 0)).toISOString();
const PAST = "2020-01-01T09:00:00Z";

async function main() {
  console.log(`\ntarget: ${BASE}\n`);

  console.log("level 2 — authentication");
  check("no key is rejected", (await call("GET", "/slots", { key: null })).status === 401);
  check("wrong key is rejected", (await call("GET", "/slots", { key: "nope" })).status === 401);

  const unauthenticated = await call("GET", "/slots", { key: null });
  check(
    "401 body is exactly { error }",
    JSON.stringify(Object.keys(unauthenticated.body ?? {})) === '["error"]',
    unauthenticated.raw.slice(0, 60),
  );

  console.log("\ncontract — every error is JSON");
  const unknownRoute = await call("GET", "/nope");
  check(
    "unknown route is a JSON 404",
    unknownRoute.status === 404 && typeof unknownRoute.body?.error === "string",
    unknownRoute.raw.slice(0, 60),
  );
  const wrongMethod = await call("DELETE", "/slots");
  check(
    "wrong method is a JSON 405",
    wrongMethod.status === 405 && typeof wrongMethod.body?.error === "string",
    `${wrongMethod.status} ${wrongMethod.raw.slice(0, 40)}`,
  );

  console.log("\nlevel 1 — reset and list");
  const reset = await call("POST", "/reset", {
    body: {
      slots: [
        { id: "s1", provider: "Dr Ade", start: FUTURE(9), end: FUTURE(10) },
        { id: "s2", provider: "Dr Bello", start: FUTURE(11), end: FUTURE(12) },
        { id: "s3", provider: "Dr Ade", start: FUTURE(13), end: FUTURE(14) },
        { id: "old", provider: "Dr Ade", start: PAST, end: PAST },
      ],
    },
  });
  check("reset succeeds", reset.status === 200, `got ${reset.status}`);

  const listed = await call("GET", "/slots");
  check("slots listed", listed.status === 200 && listed.body?.slots?.length === 4);
  check(
    "sorted earliest first",
    listed.body?.slots?.map((s) => s.id).join(",") === "old,s1,s2,s3",
    listed.body?.slots?.map((s) => s.id).join(","),
  );
  check("slots start available", listed.body?.slots?.every((s) => s.available === true));
  check(
    "times echoed verbatim",
    listed.body?.slots?.[1]?.start === FUTURE(9),
    listed.body?.slots?.[1]?.start,
  );

  const filtered = await call("GET", "/slots?provider=Dr%20Ade");
  // s1, s3 and the past slot all belong to Dr Ade; s2 is Dr Bello.
  check("provider filter works", filtered.body?.slots?.length === 3, String(filtered.body?.slots?.length));
  check("provider filter is exact", (await call("GET", "/slots?provider=Dr%20Ad")).body?.slots?.length === 0);

  console.log("\nlevel 1 — book and look up");
  const booked = await call("POST", "/bookings", {
    body: { slot_id: "s1", name: "  Ada Obi  ", email: "  Ada@Example.COM " },
  });
  check("booking returns 201", booked.status === 201, `got ${booked.status}`);
  check("status is confirmed", booked.body?.status === "confirmed");
  check("name trimmed", booked.body?.name === "Ada Obi", booked.body?.name);
  check("email lowercased", booked.body?.email === "ada@example.com", booked.body?.email);
  check("has id and created_at", Boolean(booked.body?.id) && Boolean(booked.body?.created_at));

  const fetched = await call("GET", `/bookings/${booked.body?.id}`);
  check("booking can be fetched", fetched.status === 200 && fetched.body?.id === booked.body?.id);
  check("unknown booking is 404", (await call("GET", "/bookings/does-not-exist")).status === 404);

  const after = await call("GET", "/slots");
  check(
    "booked slot is unavailable",
    after.body?.slots?.find((s) => s.id === "s1")?.available === false,
  );
  check(
    "other slots stay available",
    after.body?.slots?.find((s) => s.id === "s2")?.available === true,
  );

  console.log("\nlevel 2 — validation");
  check("unknown slot is 404", (await call("POST", "/bookings", { body: { slot_id: "nope", name: "A", email: "a@b.co" } })).status === 404);
  check("started slot is 400", (await call("POST", "/bookings", { body: { slot_id: "old", name: "A", email: "a@b.co" } })).status === 400);
  check("missing email is 400", (await call("POST", "/bookings", { body: { slot_id: "s2", name: "A" } })).status === 400);
  check("empty name is 400", (await call("POST", "/bookings", { body: { slot_id: "s2", name: "   ", email: "a@b.co" } })).status === 400);
  check("malformed email is 400", (await call("POST", "/bookings", { body: { slot_id: "s2", name: "A", email: "not-an-email" } })).status === 400);
  check("email without a dot is 400", (await call("POST", "/bookings", { body: { slot_id: "s2", name: "A", email: "a@b" } })).status === 400);
  check("email with a space is 400", (await call("POST", "/bookings", { body: { slot_id: "s2", name: "A", email: "a b@c.com" } })).status === 400);
  check("malformed JSON is 400", (await call("POST", "/bookings", { body: undefined, headers: { "Content-Type": "application/json" }, raw: "{" })).status === 400);

  console.log("\nlevel 3 — no double booking");
  const clash = await call("POST", "/bookings", { body: { slot_id: "s1", name: "Bea", email: "bea@example.com" } });
  check("second booking is 409", clash.status === 409, `got ${clash.status}`);

  console.log("\nlevel 3 — cancel");
  const toCancel = await call("POST", "/bookings", {
    body: { slot_id: "s2", name: "Cara", email: "cara@example.com" },
  });
  check("booked a slot to cancel", toCancel.status === 201, `got ${toCancel.status}`);

  const cancelled = await call("DELETE", `/bookings/${toCancel.body?.id}`);
  check("cancel returns 200", cancelled.status === 200, `got ${cancelled.status}`);
  check("status becomes cancelled", cancelled.body?.status === "cancelled");
  check("cancelling twice is 409", (await call("DELETE", `/bookings/${toCancel.body?.id}`)).status === 409);
  check("cancelling an unknown booking is 404", (await call("DELETE", "/bookings/nope")).status === 404);

  const afterCancel = await call("GET", "/slots");
  check(
    "cancelled slot is available again",
    afterCancel.body?.slots?.find((s) => s.id === "s2")?.available === true,
  );
  check(
    "cancelled booking still reads back as cancelled",
    (await call("GET", `/bookings/${toCancel.body?.id}`)).body?.status === "cancelled",
  );

  const rebook = await call("POST", "/bookings", {
    body: { slot_id: "s2", name: "Dee", email: "dee@example.com" },
  });
  check("slot can be rebooked after cancellation", rebook.status === 201, `got ${rebook.status}`);

  console.log("\nlevel 3 — simultaneous bookings");
  await call("POST", "/reset", {
    body: { slots: [{ id: "race", provider: "Dr Race", start: FUTURE(15), end: FUTURE(16) }] },
  });
  const burst = await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      call("POST", "/bookings", {
        body: { slot_id: "race", name: `Racer ${i}`, email: `racer${i}@example.com` },
      }),
    ),
  );
  const created = burst.filter((r) => r.status === 201);
  const conflicted = burst.filter((r) => r.status === 409);
  check("exactly one booking wins", created.length === 1, `${created.length} created`);
  check("everyone else gets 409", conflicted.length === 24, `${conflicted.length} conflicts`);
  check(
    "the slot ends up unavailable",
    (await call("GET", "/slots")).body?.slots?.[0]?.available === false,
  );

  console.log("\nlevel 4 — idempotency");
  await call("POST", "/reset", {
    body: { slots: [{ id: "i1", provider: "Dr Ida", start: FUTURE(9), end: FUTURE(10) }] },
  });
  const idemKey = crypto.randomUUID();
  const bodyOnce = { slot_id: "i1", name: "Ida", email: "ida@example.com" };

  const idemFirst = await call("POST", "/bookings", {
    body: bodyOnce,
    headers: { "Idempotency-Key": idemKey },
  });
  check("first request books", idemFirst.status === 201, `got ${idemFirst.status}`);

  const idemReplay = await call("POST", "/bookings", {
    body: bodyOnce,
    headers: { "Idempotency-Key": idemKey },
  });
  check("replay returns 201, not 409", idemReplay.status === 201, `got ${idemReplay.status}`);
  check("replay returns the same booking id", idemReplay.body?.id === idemFirst.body?.id);

  const idemConflict = await call("POST", "/bookings", {
    body: { ...bodyOnce, name: "Someone Else" },
    headers: { "Idempotency-Key": idemKey },
  });
  check("same key with a different body is 422", idemConflict.status === 422, `got ${idemConflict.status}`);

  // The replay must not have created a second booking.
  const idemList = await call("GET", "/bookings?email=ida@example.com");
  check("only one booking exists for that key", idemList.body?.bookings?.length === 1);

  console.log("\nlevel 4 — paging");
  const pagingSlots = Array.from({ length: 5 }, (_, i) => ({
    id: `p${i}`,
    provider: "Dr Page",
    start: FUTURE(9 + i),
    end: FUTURE(10 + i),
  }));
  await call("POST", "/reset", { body: { slots: pagingSlots } });

  for (let i = 0; i < 5; i += 1) {
    const created = await call("POST", "/bookings", {
      body: { slot_id: `p${i}`, name: `Pager ${i}`, email: "pager@example.com" },
    });
    if (created.status !== 201) console.log("   setup booking failed:", created.status, created.raw);
  }

  const page1 = await call("GET", "/bookings?email=pager@example.com&limit=2");
  check("page 1 has 2 bookings", page1.body?.bookings?.length === 2, `got ${page1.body?.bookings?.length}`);
  check("page 1 hands back a cursor", typeof page1.body?.next_cursor === "string");
  check("oldest first", page1.body?.bookings?.[0]?.slot_id === "p0", page1.body?.bookings?.[0]?.slot_id);

  const page2 = await call(
    "GET",
    `/bookings?email=pager@example.com&limit=2&cursor=${encodeURIComponent(page1.body?.next_cursor)}`,
  );
  check("page 2 has 2 bookings", page2.body?.bookings?.length === 2, `got ${page2.body?.bookings?.length}`);

  const page3 = await call(
    "GET",
    `/bookings?email=PAGER@example.com&limit=2&cursor=${encodeURIComponent(page2.body?.next_cursor)}`,
  );
  check("page 3 has 1 booking", page3.body?.bookings?.length === 1, `got ${page3.body?.bookings?.length}`);
  check("last page has a null cursor", page3.body?.next_cursor === null);
  check("email match ignores case", page3.status === 200);

  check("limit 0 is 400", (await call("GET", "/bookings?email=pager@example.com&limit=0")).status === 400);
  check("limit 51 is 400", (await call("GET", "/bookings?email=pager@example.com&limit=51")).status === 400);
  check("limit abc is 400", (await call("GET", "/bookings?email=pager@example.com&limit=abc")).status === 400);
  check("missing email is 400", (await call("GET", "/bookings")).status === 400);

  console.log("\nlevel 5 — rate limit");
  const spam = [];
  for (let i = 0; i < 6; i += 1) {
    spam.push(
      await call("POST", "/bookings", {
        body: { slot_id: "nope", name: "Spam", email: "spam@example.com" },
      }),
    );
  }
  check("first five attempts are rejected on merit (404)", spam.slice(0, 5).every((r) => r.status === 404), spam.map((r) => r.status).join(","));
  check("sixth attempt is 429", spam[5].status === 429, `got ${spam[5].status}`);

  const retryAfter = Number(spam[5].headers.get("retry-after"));
  check(
    "Retry-After is whole seconds within the window",
    Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 60,
    String(retryAfter),
  );

  const otherEmail = await call("POST", "/bookings", {
    body: { slot_id: "nope", name: "Other", email: "other@example.com" },
  });
  check("a different email is unaffected", otherEmail.status === 404, `got ${otherEmail.status}`);

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log(`failed: ${failures.join(", ")}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
