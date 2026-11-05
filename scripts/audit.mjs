/**
 * Full contract audit against a running instance.
 *
 *   node scripts/audit.mjs
 *   BASE=https://x.vercel.app KEY=... node scripts/audit.mjs
 *
 * Unlike smoke.mjs (which is a quick regression run), this walks the written
 * spec requirement by requirement and prints the evidence for each.
 */

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
const KEY = process.env.KEY ?? "dev-local-key-7c1f0a2b";

const results = [];
let section = "";

function heading(name) {
  section = name;
  console.log(`\n${name}`);
}

function check(name, pass, evidence = "") {
  results.push({ section, name, pass });
  const mark = pass ? "  ok  " : "  FAIL";
  console.log(`${mark}  ${name}${evidence ? `  — ${evidence}` : ""}`);
}

async function call(method, path, { body, raw, key = KEY, headers = {} } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(key ? { "X-API-Key": key } : {}),
      ...(body !== undefined || raw !== undefined
        ? { "Content-Type": "application/json" }
        : {}),
      ...headers,
    },
    body: raw !== undefined ? raw : body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {
    status: res.status,
    body: json,
    raw: text,
    type: res.headers.get("content-type") ?? "",
    headers: res.headers,
  };
}

/** The contract: every error is exactly { "error": "<non-empty string>" }. */
function isErrorShape(res) {
  if (!res.body || typeof res.body !== "object") return false;
  const keys = Object.keys(res.body);
  return keys.length === 1 && keys[0] === "error" && typeof res.body.error === "string" && res.body.error.length > 0;
}

function isJson(res) {
  return res.type.includes("application/json");
}

const FUTURE = (h) => new Date(Date.UTC(2030, 0, 10, h, 0, 0)).toISOString();

async function main() {
  console.log(`auditing ${BASE}`);

  // ---------------------------------------------------------------- contract
  heading("Contract — JSON everywhere, one error shape");

  const unauth = await call("GET", "/slots", { key: null });
  check("401 body is exactly { error }", isErrorShape(unauth) && unauth.status === 401, JSON.stringify(unauth.body));

  const unknown = await call("GET", "/nope");
  check("unknown route → JSON 404", isJson(unknown) && unknown.status === 404 && isErrorShape(unknown), JSON.stringify(unknown.body));

  const badMethod = await call("DELETE", "/slots");
  check("unsupported method → JSON 405", isJson(badMethod) && badMethod.status === 405 && isErrorShape(badMethod), JSON.stringify(badMethod.body));

  // ------------------------------------------------------------------- auth
  heading("Level 2 — every request needs X-API-Key");

  const endpoints = [
    ["POST", "/reset", { body: { slots: [] } }],
    ["GET", "/slots"],
    ["POST", "/bookings", { body: { slot_id: "x", name: "A", email: "a@b.co" } }],
    ["GET", "/bookings?email=a@b.co"],
    ["GET", "/bookings/anything"],
    ["DELETE", "/bookings/anything"],
  ];

  for (const [method, path, extra] of endpoints) {
    const missing = await call(method, path, { ...extra, key: null });
    const wrong = await call(method, path, { ...extra, key: "definitely-wrong" });
    check(
      `${method} ${path.split("?")[0]} → 401 without a key and with a wrong key`,
      missing.status === 401 && wrong.status === 401 && isErrorShape(missing) && isErrorShape(wrong),
      `${missing.status}/${wrong.status}`,
    );
  }

  // ----------------------------------------------------------- level 1 reset
  heading("Level 1 — POST /reset");

  const past = "2020-01-01T09:00:00Z";
  const reset = await call("POST", "/reset", {
    body: {
      slots: [
        { id: "s1", provider: "Dr Ade", start: FUTURE(9), end: FUTURE(10) },
        { id: "s2", provider: "Dr Bello", start: FUTURE(11), end: FUTURE(12) },
        { id: "old", provider: "Dr Ade", start: past, end: past },
      ],
    },
  });
  check("reset succeeds with 200", reset.status === 200, String(reset.status));

  let listed = await call("GET", "/slots");
  check("all three slots are returned", listed.body?.slots?.length === 3, `${listed.body?.slots?.length}`);
  check(
    "past slots are kept, as the spec requires",
    listed.body?.slots?.some((s) => s.id === "old"),
    listed.body?.slots?.map((s) => s.id).join(","),
  );

  const beforeReset = await call("POST", "/bookings", { body: { slot_id: "s2", name: "Ada", email: "ada@example.com" } });
  check("a booking exists before the second reset", beforeReset.status === 201, String(beforeReset.status));

  await call("POST", "/reset", {
    body: { slots: [{ id: "n1", provider: "Dr Ada", start: FUTURE(9), end: FUTURE(10) }] },
  });
  const goneBooking = await call("GET", `/bookings/${beforeReset.body?.id}`);
  check("reset deletes every booking", goneBooking.status === 404, String(goneBooking.status));

  // -------------------------------------------------------- level 1 listing
  heading("Level 1 — GET /slots");

  await call("POST", "/reset", {
    body: {
      slots: [
        { id: "z1", provider: "Dr Zed", start: "2030-01-10T10:00:00Z", end: "2030-01-10T10:30:00Z" },
        { id: "z2", provider: "Dr Zed", start: "2030-01-10T09:00:00-02:00", end: "2030-01-10T09:30:00-02:00" },
        { id: "z3", provider: "Dr Zed", start: "2030-01-10T12:00:00+03:00", end: "2030-01-10T12:30:00+03:00" },
        { id: "other", provider: "Dr Other", start: FUTURE(13), end: FUTURE(14) },
        { id: "old", provider: "Dr Zed", start: past, end: past },
      ],
    },
  });

  listed = await call("GET", "/slots");
  const order = listed.body?.slots?.map((s) => s.id).join(",");
  // z3 is 09:00Z, z1 is 10:00Z, z2 is 11:00Z — a string sort would give z2,z1,z3.
  check("slots are ordered by instant, not by string", order === "old,z3,z1,z2,other", order);
  check(
    "times are echoed verbatim",
    listed.body?.slots?.find((s) => s.id === "z2")?.start === "2030-01-10T09:00:00-02:00",
    listed.body?.slots?.find((s) => s.id === "z2")?.start,
  );

  const filtered = await call("GET", "/slots?provider=Dr%20Other");
  check("provider filter is an exact match", filtered.body?.slots?.length === 1 && filtered.body?.slots[0].id === "other");

  const partial = await call("GET", "/slots?provider=Dr%20Oth");
  check("provider filter does not do prefix matching", partial.body?.slots?.length === 0, `${partial.body?.slots?.length}`);

  // -------------------------------------------------------- level 1 booking
  heading("Level 1 — POST /bookings, GET /bookings/{id}");

  const booked = await call("POST", "/bookings", {
    body: { slot_id: "z1", name: "  Ada Obi  ", email: "  Ada@Example.COM " },
  });
  check("booking returns 201", booked.status === 201, String(booked.status));
  check("status is confirmed", booked.body?.status === "confirmed");

  const fields = Object.keys(booked.body ?? {}).sort().join(",");
  check(
    "booking has exactly the six spec fields",
    fields === "created_at,email,id,name,slot_id,status",
    fields,
  );
  check("name is trimmed", booked.body?.name === "Ada Obi", booked.body?.name);
  check("email is trimmed and lower-cased", booked.body?.email === "ada@example.com", booked.body?.email);
  check("created_at is an ISO timestamp", !Number.isNaN(Date.parse(booked.body?.created_at)), booked.body?.created_at);

  const fetched = await call("GET", `/bookings/${booked.body?.id}`);
  check("the booking can be read back", fetched.status === 200 && fetched.body?.id === booked.body?.id);

  const unknownBooking = await call("GET", "/bookings/nope");
  check("unknown booking id → 404 { error }", unknownBooking.status === 404 && isErrorShape(unknownBooking));

  // ------------------------------------------------------- level 2 validity
  heading("Level 2 — validation, normalisation, slot state");

  const cases = [
    ["missing slot_id", { name: "A", email: "v1@b.co" }],
    ["missing name", { slot_id: "z1", email: "v2@b.co" }],
    ["missing email", { slot_id: "z1", name: "A" }],
    ["empty name", { slot_id: "z1", name: "   ", email: "v3@b.co" }],
    ["empty email", { slot_id: "z1", name: "A", email: "  " }],
    ["email without @", { slot_id: "z1", name: "A", email: "not-an-email" }],
    ["email without a dot", { slot_id: "z1", name: "A", email: "v4@b" }],
    ["email with a space", { slot_id: "z1", name: "A", email: "v 5@c.com" }],
  ];

  for (const [label, body] of cases) {
    const res = await call("POST", "/bookings", { body });
    check(`${label} → 400 { error }`, res.status === 400 && isErrorShape(res), `${res.status} ${JSON.stringify(res.body)}`);
  }

  const badJson = await call("POST", "/bookings", { raw: "{", headers: { "Content-Type": "application/json" } });
  check("malformed JSON → 400 { error }", badJson.status === 400 && isErrorShape(badJson), `${badJson.status}`);

  const unknownSlot = await call("POST", "/bookings", { body: { slot_id: "nope", name: "A", email: "u1@b.co" } });
  check("unknown slot → 404 { error }", unknownSlot.status === 404 && isErrorShape(unknownSlot));

  const started = await call("POST", "/bookings", { body: { slot_id: "old", name: "A", email: "u2@b.co" } });
  check("slot that already started → 400 { error }", started.status === 400 && isErrorShape(started), `${started.status}`);

  const availability = await call("GET", "/slots");
  check(
    "booked slot reports available:false, others true",
    availability.body?.slots?.find((s) => s.id === "z1")?.available === false &&
      availability.body?.slots?.find((s) => s.id === "z2")?.available === true,
  );

  // ----------------------------------------------------- level 3 behaviour
  heading("Level 3 — one confirmed booking per slot, cancel");

  const clash = await call("POST", "/bookings", { body: { slot_id: "z1", name: "Bea", email: "bea@example.com" } });
  check("second booking on the same slot → 409 { error }", clash.status === 409 && isErrorShape(clash));

  await call("POST", "/reset", {
    body: { slots: [{ id: "race", provider: "Dr Race", start: FUTURE(15), end: FUTURE(16) }] },
  });
  const burst = await Promise.all(
    Array.from({ length: 25 }, (_, i) =>
      call("POST", "/bookings", { body: { slot_id: "race", name: `R${i}`, email: `r${i}@example.com` } }),
    ),
  );
  const wins = burst.filter((r) => r.status === 201).length;
  const conflicts = burst.filter((r) => r.status === 409).length;
  const others = burst.length - wins - conflicts;
  check("25 simultaneous requests → exactly one 201", wins === 1, `${wins} wins`);
  check("the other 24 → 409", conflicts === 24, `${conflicts} conflicts, ${others} other`);

  const cancelTarget = burst.find((r) => r.status === 201)?.body;
  const cancelled = await call("DELETE", `/bookings/${cancelTarget?.id}`);
  check("cancel returns 200 with status cancelled", cancelled.status === 200 && cancelled.body?.status === "cancelled");
  check("cancel repeated → 409 { error }", (await call("DELETE", `/bookings/${cancelTarget?.id}`)).status === 409);
  check("cancel unknown → 404 { error }", (await call("DELETE", "/bookings/nope")).status === 404);

  const reopened = await call("GET", "/slots");
  check("cancelling frees the slot", reopened.body?.slots?.[0]?.available === true);

  const rebooked = await call("POST", "/bookings", { body: { slot_id: "race", name: "Dee", email: "dee@example.com" } });
  check("a freed slot can be booked again", rebooked.status === 201, String(rebooked.status));

  // ------------------------------------------------------ level 4 idempotency
  heading("Level 4 — Idempotency-Key");

  await call("POST", "/reset", {
    body: { slots: [{ id: "i1", provider: "Dr Ida", start: FUTURE(9), end: FUTURE(10) }] },
  });

  const key = `audit-${Date.now()}`;
  const payload = { slot_id: "i1", name: "Ida", email: "ida@example.com" };
  const first = await call("POST", "/bookings", { body: payload, headers: { "Idempotency-Key": key } });
  const replay = await call("POST", "/bookings", { body: payload, headers: { "Idempotency-Key": key } });
  check("first request creates a booking", first.status === 201);
  check("replay returns 201, not 409", replay.status === 201, String(replay.status));
  check("replay returns the same booking id", replay.body?.id === first.body?.id);

  const afterReplay = await call("GET", "/bookings?email=ida@example.com");
  check("replay created no second booking", afterReplay.body?.bookings?.length === 1, `${afterReplay.body?.bookings?.length}`);

  const different = await call("POST", "/bookings", {
    body: { ...payload, name: "Someone Else" },
    headers: { "Idempotency-Key": key },
  });
  check("same key, different body → 422 { error }", different.status === 422 && isErrorShape(different), String(different.status));

  // ---------------------------------------------------------- level 4 paging
  heading("Level 4 — GET /bookings paging");

  await call("POST", "/reset", {
    body: {
      slots: Array.from({ length: 5 }, (_, i) => ({
        id: `p${i}`,
        provider: "Dr Page",
        start: FUTURE(9 + i),
        end: FUTURE(10 + i),
      })),
    },
  });

  for (let i = 0; i < 5; i += 1) {
    await call("POST", "/bookings", { body: { slot_id: `p${i}`, name: `P${i}`, email: "pager@example.com" } });
  }

  const defaults = await call("GET", "/bookings?email=pager@example.com");
  check("default limit returns the bookings without error", defaults.status === 200, `${defaults.body?.bookings?.length} rows`);
  check("oldest first", defaults.body?.bookings?.[0]?.slot_id === "p0", defaults.body?.bookings?.[0]?.slot_id);

  const page1 = await call("GET", "/bookings?email=pager@example.com&limit=2");
  const page2 = await call("GET", `/bookings?email=pager@example.com&limit=2&cursor=${encodeURIComponent(page1.body?.next_cursor)}`);
  const page3 = await call("GET", `/bookings?email=PAGER@example.com&limit=2&cursor=${encodeURIComponent(page2.body?.next_cursor)}`);
  check("page sizes are 2, 2, 1", page1.body?.bookings?.length === 2 && page2.body?.bookings?.length === 2 && page3.body?.bookings?.length === 1, `${page1.body?.bookings?.length},${page2.body?.bookings?.length},${page3.body?.bookings?.length}`);
  check("next_cursor is null on the last page", page3.body?.next_cursor === null);
  check("email match ignores case", page3.status === 200 && page3.body?.bookings?.length === 1);
  check("no booking appears twice across pages", new Set([...page1.body.bookings, ...page2.body.bookings, ...page3.body.bookings].map((b) => b.id)).size === 5);

  for (const bad of ["0", "51", "-1", "abc", "1.5"]) {
    const res = await call("GET", `/bookings?email=pager@example.com&limit=${bad}`);
    check(`limit=${bad} → 400 { error }`, res.status === 400 && isErrorShape(res), String(res.status));
  }

  check("limit=1 is accepted", (await call("GET", "/bookings?email=pager@example.com&limit=1")).status === 200);
  check("limit=50 is accepted", (await call("GET", "/bookings?email=pager@example.com&limit=50")).status === 200);

  const noEmail = await call("GET", "/bookings");
  check("missing email → 400 { error }", noEmail.status === 400 && isErrorShape(noEmail));

  const badCursor = await call("GET", "/bookings?email=pager@example.com&cursor=not-a-cursor");
  check("invalid cursor → 400 { error }", badCursor.status === 400 && isErrorShape(badCursor), String(badCursor.status));

  // ----------------------------------------------------- level 5 rate limit
  heading("Level 5 — five attempts per email per minute");

  await call("POST", "/reset", {
    body: { slots: [{ id: "rl", provider: "Dr Limit", start: FUTURE(9), end: FUTURE(10) }] },
  });

  const attempts = [];
  for (let i = 0; i < 6; i += 1) {
    attempts.push(await call("POST", "/bookings", { body: { slot_id: "missing-slot", name: "S", email: "limit@example.com" } }));
  }
  check(
    "failed attempts still count (five 404s)",
    attempts.slice(0, 5).every((r) => r.status === 404),
    attempts.map((r) => r.status).join(","),
  );
  check("sixth attempt → 429 { error }", attempts[5].status === 429 && isErrorShape(attempts[5]), String(attempts[5].status));

  const retryAfter = Number(attempts[5].headers.get("retry-after"));
  check("429 carries Retry-After in whole seconds", Number.isInteger(retryAfter) && retryAfter > 0 && retryAfter <= 60, String(retryAfter));

  const unaffected = await call("POST", "/bookings", { body: { slot_id: "missing-slot", name: "S", email: "other@example.com" } });
  check("another email is not limited", unaffected.status === 404, String(unaffected.status));

  const cleared = await call("POST", "/reset", { body: { slots: [] } });
  check("reset clears the limiter", cleared.status === 200);

  // ------------------------------------------------------------------ report
  const failed = results.filter((r) => !r.pass);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  if (failed.length > 0) {
    console.log("\nfailures:");
    for (const f of failed) console.log(`  - [${f.section}] ${f.name}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
