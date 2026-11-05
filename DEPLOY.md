# Deploy

Everything is built and tested locally. These are the exact steps to put it
online.

## 1. Push the repo

Create an empty **public** repo on GitHub (no README, no .gitignore), then:

```bash
cd C:\Users\DELL\Desktop\Code\koya\clinic-booking
git remote add origin https://github.com/<your-username>/clinic-booking.git
git push -u origin main
```

`.env.local` is gitignored, so the database password is not in the repo.

## 2. Create the Vercel project

1. <https://vercel.com/new> → **Import Git Repository** → pick the repo
2. Framework preset: **Next.js** (detected automatically)
3. Before clicking Deploy, open **Environment Variables** and add:

| Name | Value |
| --- | --- |
| `DATABASE_URL` | the pooled Neon string from `.env.local` |
| `API_KEY` | the key you are submitting — kept out of the repo on purpose |

Do **not** set `APP_URL` — the app derives its own origin from the incoming
request, so it works on the production URL and on preview URLs alike.

4. **Deploy**

`vercel.json` pins functions to `lhr1` (London) so they sit next to the Neon
database in `eu-west-2`.

## 3. Verify the deployment

```bash
cd C:\Users\DELL\Desktop\Code\koya\clinic-booking
$env:BASE = "https://<your-app>.vercel.app"
$env:KEY  = "<the key you set in Vercel>"
node scripts/smoke.mjs
```

Expect `58 passed, 0 failed`. This runs the whole contract against the live
deployment, including a 25-way simultaneous booking race.

## 4. Load the page once

Open `https://<your-app>.vercel.app`. The first visit seeds a week of
appointments (only when the slot table is empty), so the demo has something to
show. The grader's `POST /reset` replaces them with its own slots.

## 5. Fill in the assessment form

| Field | Value |
| --- | --- |
| API base URL | `https://<your-app>.vercel.app` |
| API key | the same value you set as `API_KEY` |
| Web page URL | `https://<your-app>.vercel.app` |
| GitHub repo | your public repo URL |
| Loom | see `LOOM.md` |

## If something goes wrong

- **500 on every API call** — `API_KEY` or `DATABASE_URL` missing in Vercel.
  Check Project → Settings → Environment Variables, then redeploy (env changes
  need a new deployment).
- **401 on every API call** — the key you send does not match `API_KEY` exactly.
- **Slow first request** — Neon scales to zero when idle; the first query after
  a quiet period takes about a second.
