# Session handoff — Blue Rehab

Written for a Claude Code session picking this project up fresh (e.g. a local
Remote Control session taking over from a cloud session). Read this first, then
`docs/APP_REVIEW.md`.

Last updated: 2026-08-04

---

## 0. TL;DR — what to do first

```bash
bash scripts/verify-setup.sh     # shows exactly what is still unconfigured
```

Two things block the payment flow, and **both need the owner's credentials**:

1. The migration `supabase/migrations/20260804120000_booking_payment_flow.sql`
   has **not been applied** to the live database.
2. Moyasar keys + `SUPABASE_SERVICE_ROLE_KEY` are **not set** in Netlify.

Everything else is merged and CI-green on `main`.

---

## 1. What this project is

Arabic (RTL) platform for physiotherapy sessions and rehab training courses.
Requirements live in a PRD/SRS the owner supplied (not committed); the coverage
analysis against it is `docs/APP_REVIEW.md`.

**Stack:** React 19 + Vite + TS · Express (local API) · Netlify Functions
(production API) · Supabase (Postgres + Auth + Storage + RLS).

**Layout:**
```
client/          React app
server/src/      runtime-api.ts is the single source of API behaviour
netlify/         thin adapter over server/src/runtime-api.ts — do NOT fork logic here
supabase/        migrations
scripts/         verify-setup.sh
docs/            this file + the ones listed in §7
```

---

## 2. State as of this handoff

| | Status |
|---|---|
| PR #1 — brand/design system, Google Meet | ✅ merged |
| PR #2 — server-priced bookings, Moyasar, mock OTP, auto Meet | ✅ merged (`9a80aff`) |
| PR #3 — setup guide + verify script | 🟡 open, CI green, branch `claude/repo-push-permissions-9ay6av` |
| Migration applied to live DB | ❌ **not yet** |
| Netlify env vars set | ❌ **not yet** |

`npm run build` and `npm run lint` both pass (2 pre-existing react-hooks warnings).

---

## 3. Decisions already made — don't relitigate

- **Payments: Moyasar**, using **hosted invoices** (not the inline card form) so
  card data never touches the app. PRD §14.1.
- **Video: Google Meet** via the **free** Google Calendar API + an OAuth refresh
  token. No Google Workspace purchase. The owner was explicit about zero cost.
- **Invitations must cost nothing**: email comes free from Calendar
  (`sendUpdates=all`); WhatsApp is a `wa.me` share link, *not* the Business API.
- **Pricing is server-derived.** Never let the client send an amount. Creation
  goes through SQL `SECURITY DEFINER` functions.
- **Netlify function must stay a thin adapter.** It previously duplicated the
  booking logic; that was removed deliberately to stop security-critical drift.

---

## 4. The security model (understand before touching payments)

The original code let the browser insert `bookings` and set `total` itself. That
is fixed, and the fix is load-bearing:

1. `create_booking_with_payment(...)` — `SECURITY DEFINER`. Reads price from
   `services`, locks the slot `FOR UPDATE`, inserts booking + `payments` row
   atomically, raises typed errors (`SLOT_UNAVAILABLE`, `MODE_NOT_ALLOWED`, …).
2. Direct `INSERT` on `bookings`/`enrollments` is **not** granted. Creation must
   go through the functions.
3. Patient `UPDATE` on `bookings` is column-scoped to
   `(meeting_url, meeting_event_id, meeting_provider, notes)`. It previously
   covered the whole row, including `total` and `status`.
4. `POST /api/payments/verify` re-reads the payment **from Moyasar with the
   secret key** and compares the amount to our own `payments.amount`. Callback
   query params are never trusted. Mismatch ⇒ refuse + flag `amount_mismatch`.
5. Writing a verified result needs `SUPABASE_SERVICE_ROLE_KEY`, so the payer
   cannot mark their own payment succeeded. If the key is absent the API
   honestly reports `persisted: false` rather than faking success.

**If you change payment code, preserve all five.**

---

## 5. The two blocked steps

### 5.1 Apply the migration

Needs DDL rights — the publishable/anon key cannot do it (verified: PostgREST
returns `PGRST202` and exposes no DDL path).

```bash
supabase link --project-ref <ref> && supabase db push
```
or paste `supabase/migrations/20260804120000_booking_payment_flow.sql` into the
Supabase SQL editor. It is idempotent (`if not exists` / `create or replace`).

⚠️ **Gotcha:** the unique index `bookings_slot_live_unique` fails if existing
rows share a `slot_id`. Check first:
```sql
select slot_id, count(*) from public.bookings
 where slot_id is not null and status <> 'cancelled'
 group by slot_id having count(*) > 1;
```

### 5.2 Set Netlify environment variables

`netlify env:set <KEY> <VALUE>` or the Netlify UI. **Never** in `netlify.toml`.

| Variable | Notes |
|---|---|
| `MOYASAR_SECRET_KEY` | must be `sk_test_…` for testing |
| `MOYASAR_PUBLISHABLE_KEY` | `pk_test_…` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `PUBLIC_SITE_URL` | production origin, builds the payment callback URL |
| `VITE_AUTH_MODE` | `mock` for now |

🔴 **The owner pasted LIVE Moyasar keys (`sk_live_…`) into a chat transcript.**
They must be rotated. Do not reuse them; do not ask for keys in chat — have the
owner set them in the environment, or read them from their local Netlify/Moyasar
config.

---

## 6. Landmines

- **Migration files have drifted from the live DB.** Queries read
  `course_modules.description` / `sort_order` and `course_lessons.lesson_type`,
  but the migrations define `summary` / `position` / `content_type`. The live DB
  is the one that works — changes were applied outside the migration files.
  Fix with `supabase db pull` before trusting `supabase/migrations` to rebuild
  an environment from scratch.
- **Mock OTP is not a security boundary.** Credentials derive from the phone
  number, so anyone knowing a number can sign in as that user. Fine for demos,
  must be off (`VITE_AUTH_MODE=sms`) before real patient data.
- **Mock OTP needs email confirmation disabled** in Supabase Auth, or the
  session will not open after signup.
- **Payment confirmation depends on the user returning to the browser.** No
  webhook yet. If they close the tab after paying, the payment sits in
  `processing` until they revisit. A Moyasar webhook is the proper fix.
- **Never commit secrets.** `.env` is gitignored; `.env.example` documents names
  with empty values.

---

## 7. Where things are

| Path | What |
|---|---|
| `docs/SETUP.md` | The two remaining steps, copy-paste |
| `docs/APP_REVIEW.md` | PRD coverage matrix + open findings |
| `docs/payments-moyasar.md` | Payment design, endpoints, test cards |
| `docs/otp-mock.md` | OTP mock design + security warning |
| `docs/google-meet.md` | Meet setup + auto-scheduling + invites |
| `docs/BRAND.md` | Brand colours/fonts (tokens verified against the guide) |
| `server/src/runtime-api.ts` | All API behaviour |
| `server/src/moyasar.ts` | Gateway client |
| `client/src/lib/auth.ts` | OTP (mock + sms) |
| `client/src/lib/invites.ts` | WhatsApp + `.ics` |
| `scripts/verify-setup.sh` | Environment status |

---

## 8. Verifying the whole flow once unblocked

```bash
npm install && npm run dev
bash scripts/verify-setup.sh      # expect checks 1–3 ✓
```

Then in the browser: `/login` → the displayed static code → `/booking` →
complete the steps → **ادفع** → Moyasar test card `4111111111111111`, any future
expiry, any CVC → returns to `/payment/callback` → booking should read
`confirmed` and appear in `/portal`.

Failure card: `4000000000000002` — the slot should be released again.

---

## 9. Suggested next work

The database is far ahead of the UI. Highest impact, in order — all have tables
and RLS policies already in place, so this is UI + API work only:

1. **Specialist dashboard** — appointments, cases, diagnosis, treatment plan,
   exercises (PRD §11, §8.6). Biggest blocker to the platform being usable.
2. **Patient treatment plan + exercise logging** (§8.7, §8.8).
3. **Cancel / reschedule / refund** — `refundPayment()` already exists in
   `moyasar.ts`, unused (§13.3, §13.4).
4. **Reviews** (§12), **admin dashboard** (§17).
5. Moyasar webhook; real SMS OTP.

---

## 10. Working agreements from the owner

- Arabic UI, RTL, mobile-first.
- Zero-cost integrations wherever possible — this constraint drove both the
  Google Meet and the WhatsApp/`.ics` choices.
- Owner develops on branch `claude/repo-push-permissions-9ay6av`, opens PRs as
  drafts, and merges them.
- Do not commit secrets, ever.
