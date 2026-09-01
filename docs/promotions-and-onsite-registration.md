# Promotion codes, and registering for a course in a room

Two features that arrived together and share one boundary: both change what a
customer is charged, and neither lets the browser decide by how much.

**Applied to the live database on 2026-09-01** — all three migrations, verified
against production. See [§5](#5-applying-this) for what was run and how it was
checked.

---

## 1. What was built

### 1.1 Discount and marketer codes

One table, `promo_codes`, distinguished by `kind`:

| | `discount` | `marketer` |
|---|---|---|
| Purpose | a campaign — «خصم ٢٠٪ هذا الأسبوع» | attribution — whose link brought this sale |
| `marketer_name` | not used | **required** |
| `discount_percent` | must be > 0 | may be **0** — the code can be pure tracking |

Each code carries an optional window (`starts_at` / `ends_at`), an optional
ceiling (`usage_limit`, null = unlimited), a suspension switch (`is_paused`)
and an `internal_note` that customers never see.

**Status is derived, never stored** — `promo_code_state()` computes it from the
window, the ceiling and the switch, in this precedence:

```
paused  →  expired  →  scheduled  →  exhausted  →  active
```

A stored status goes stale the minute a window closes with nobody looking, and
would need a scheduled job to stay honest.

### 1.2 Promotion URLs

A promotion link is `?ref=CODE` on **any** page — `/`, a course, the specialist
directory — so a campaign can point at whatever it is actually promoting.

`RouteChange.tsx` notices the parameter on every navigation and does two
things: remembers the code in `sessionStorage` (so checkout prefills it), and
counts the arrival through `record_promo_visit()`.

The counter answers nothing — not whether the code exists, not what it is
worth. A counter that reported "no such code" would be a code oracle open to
the whole internet. A wrong code is discovered where it is applied, against a
real order.

`visitor_key` is a random per-browser value in `localStorage`. Its only job is
to stop one person refreshing twenty times from reading as twenty people. It is
not derived from the device or the person and identifies nobody, which is why
it needs no entry in the privacy page's data inventory.

### 1.3 What a code is worth

`promo_apply(code, kind, gross, user)` is the single place a percentage becomes
an amount. It is granted to **nobody** — its callers are `security definer`
functions that execute as the owner. A direct PostgREST call cannot reach it,
which matters: a customer able to call it freely could enumerate live codes by
trying strings and reading which error came back.

Six distinct refusals, because the six situations ask different things of the
person holding the code:

| Error | Meaning |
|---|---|
| `PROMO_NOT_FOUND` | check the spelling |
| `PROMO_PAUSED` | suspended right now |
| `PROMO_EXPIRED` | window has closed |
| `PROMO_SCHEDULED` | window has not opened |
| `PROMO_EXHAUSTED` | ceiling reached |
| `PROMO_ALREADY_USED` | this person has used it before |

Wording lives in `client/src/lib/promotions.ts` and, for the API paths, in
`BOOKING_ERRORS` in `server/src/runtime-api.ts`.

### 1.4 The ledger

`promo_code_redemptions` gets one row per code **actually used**, written by
`convert_paid_intent()` once the money has cleared — not when the code was
typed. A campaign ceiling counts sales, not attempts: an abandoned checkout
that had a code in it leaves the campaign exactly as it found it.

Gross, discount and net are frozen at the moment of sale. Recomputing them
later from `discount_percent` would misreport every past sale the day somebody
edits the percentage.

Two unique rules: one row per payment, and **one redemption per person per
code**. Without the second, a single customer can drain a hundred-use campaign
alone — the failure mode every public discount link has.

### 1.5 Commission — deliberately absent

The ledger records everything a commission would be computed from. No rate is
stored and no payable is calculated, because the rate has not been decided.
Adding it later is a column and a multiplication over data already being kept.

The admin panel therefore shows **زيارات · مبيعات · قيمة الخصم · المحصّل** and
no commission column. A column of zeroes would be a claim.

### 1.6 In-person course registration

Courses with `mode = 'onsite'` or `'hybrid'` no longer enrol on a button. The
course page hands over to `/courses/:slug/register`, a four-step form:

1. **المعلومات الشخصية** — الاسم الثلاثي، الجوال، البريد، جهة العمل، المسمى الوظيفي، سنوات الخبرة
2. **خبرتك وأهدافك** — مستوى المعرفة (1–5)، حضور دورة مشابهة، الأهداف، المحاور، سؤال مفتوح
3. **الفئة والعضوية** — فئة الرسوم، العضوية ورقمها، أو كود خصم
4. **المراجعة والدفع** — الملخص والإجمالي، ثم مُيسّر

This mirrors the Google Form the client had been running, with two deliberate
departures:

**Bank transfer and a photographed receipt are not carried over.** The form
asked attendees to transfer to an IBAN and upload the slip, with an
administrator matching slips to names by hand. The platform has a gateway and a
settlement path, so registration ends at Moyasar. The seat is created by
`convert_paid_intent()` on a verified payment — the same guarantee the receipt
was a manual approximation of.

**Membership is claimed, then checked.** The form takes «نعم» for the 30% member
rate and promises «سيتم التحقق من العضوية قبل تأكيد التسجيل». That promise is
kept as a record: the discount applies immediately so nobody is made to wait to
pay, the number is stored, and the registration carries an unverified flag an
administrator clears from **الدورات الحضورية**. Withdrawing a verification
deliberately does not reprice anything — the attendee has already paid, and
choosing between charging the difference, honouring the rate and cancelling the
seat is a person's decision, not a database function's.

### 1.7 Fee bands

`course_price_tiers` — «300 ريال للمختصّين / 250 لطلبة الامتياز». The original
form never asked which one you were; it printed both figures and trusted you to
transfer the right amount, which is a reconciliation problem wearing a pricing
model's clothes.

The attendee names a **key**; the price is read from the table. A course with no
tiers falls back to `courses.price`, so nothing about existing online courses
changes.

A tier that somebody has registered under cannot be deleted — the registration
names it by key, and the roster would lose the ability to say what anyone signed
up as (`TIER_IN_USE`).

### 1.8 Discounts do not stack

Membership and a promotion code are mutually exclusive
(`DISCOUNTS_DO_NOT_STACK`). Refused rather than silently resolved: an attendee
told «تم تطبيق خصمين» and charged for one — or charged 51% off when both were
30% and they expected 60% — has been misled either way. The code box is not
even rendered once membership is claimed.

---

## 2. The security position

Unchanged from `20260807110000_pay_before_booking.sql`, extended to discounts.

1. **The browser never sends an amount, a percentage or a total.** It sends a
   code — a string. There is no argument anywhere in these migrations through
   which a figure can be supplied.
2. Every function that touches money is `security definer` and re-derives the
   gross itself from `services.price`, `courses.price` or `course_price_tiers`.
3. `payments.amount` keeps its meaning: **what the customer is charged**, which
   is what `verifyPayment` re-reads from Moyasar and compares against. The
   discount sits beside it in `payments.discount`, so the gross is always
   recoverable as `amount + discount` and no past payment changes meaning.
4. `promo_codes` has **no insert or update policy for anybody**. Writes go
   through `admin_create_promo_code` / `admin_update_promo_code`, so an
   administrator holding a PostgREST client still cannot create a code without
   the audit entry that goes with it.
5. Customers cannot read `promo_codes` at all. A code's percentage, ceiling and
   remaining uses are campaign information. You learn what a code is worth by
   applying it to your own order.
6. A code cannot be renamed after creation. It has been printed and shared, and
   every redemption names it by id — a rename would silently re-attribute
   history. Pause it and make another.

### 2.1 The settlement seam

`convert_paid_intent()` is the most security-critical function in the schema.
Rather than have every new feature restate it in full to add a line,
`after_intent_settled(payment, kind)` is the seam features extend. Migration
`…110000` defines it (promotion ledger); `…120000` replaces it (ledger +
confirm registration). The body of `convert_paid_intent()` stays reviewable as
the one thing it is.

The ledger insert uses `on conflict do nothing` on purpose: it must never be
able to fail the settlement it is recording. A campaign tally short by one is
tolerable; a verified payment with no booking against it is not.

---

## 3. Where things are

| Path | What |
|---|---|
| `supabase/migrations/20260901100000_promotion_codes.sql` | codes, ledger, visits, admin RPCs |
| `supabase/migrations/20260901110000_promotion_codes_on_payments.sql` | `promo_apply`, both intent functions, settlement seam |
| `supabase/migrations/20260901120000_onsite_course_registration.sql` | tiers, registrations, quote, roster, membership |
| `client/src/lib/promotions.ts` | codes, links, `?ref=` capture, error wording |
| `client/src/lib/registration.ts` | questions, tiers, quote, submit, roster |
| `client/src/components/AdminPromotions.tsx` | the code panel — أكواد الخصم |
| `client/src/components/AdminOnsiteCourses.tsx` | tiers, roster, membership checks |
| `client/src/components/OnsiteRegistrationFlow.tsx` | the four-step form |
| `client/src/styles/promotions.css` | styles for both screens |

---

## 4. Setting up the shoulder course

The course that prompted this — *The Painful Shoulder: Clinical Assessment and
Rehabilitation*, 11/7/2026, مركز الطبابة بجدة, 20 seats.

1. **الخدمات والدورات** → create/edit the course. Set طريقة التقديم to
   **حضوري**, السعة to `20`, تاريخ البدء to the course date.
2. Set the venue and the member rate (no admin field yet — see §6):
   ```sql
   update public.courses
      set venue = 'مركز الطبابة بجدة',
          membership_discount_percent = 30
    where slug = '<the-slug>';
   ```
3. **الدورات الحضورية** → **فئات الأسعار**, add two:

   | المعرّف | الاسم الظاهر | السعر |
   |---|---|---|
   | `specialist` | مختصّون | 300 |
   | `intern` | طلبة الامتياز | 250 |

4. Publish. `/courses/<slug>` now shows **التسجيل في الدورة** pointing at the
   four-step form.
5. Registrations, their answers and any membership claims appear under
   **الدورات الحضورية → كشف المسجّلين**.

---

## 5. Applying this — done

Run on 2026-09-01 against `jmgfabzsgrukrzpnuhux`:

```bash
npx supabase db push
npx supabase gen types typescript --linked > client/src/lib/database.types.ts
```

All three migrations applied cleanly, and `database.types.ts` was regenerated
from the result — so the tables are now statically checked wherever
`typedSupabase` reads them.

Verified against production afterwards, not assumed:

| Check | Result |
|---|---|
| `promo_codes`, `promo_code_redemptions`, `promo_code_visits` | exist, HTTP 200 |
| `course_price_tiers`, `course_registrations` | exist, HTTP 200 |
| `courses.venue` / `.capacity` / `.membership_discount_percent` | present |
| `record_promo_visit` as anon | `204` — callable, as intended |
| `onsite_registration_quote` as anon | `42501` — refused, as intended |
| `create_onsite_registration_intent` as anon | `42501` — refused, as intended |
| `admin_promo_codes` as anon | `42501` — refused, as intended |

> Note for whoever reads this next: the CLI **is** logged in and the project
> **is** linked. `docs/HANDOFF.md` said migrations were blocked on the owner's
> credentials; that was true on 2026-08-04 and has not been true for a while.
> Check `npx supabase migration list --linked` before believing any claim in
> the docs about what is or is not applied.

### 5.1 Why the deploy order did not matter

The new columns on `courses` (`venue`, `capacity`, `membership_discount_percent`)
are read **only** by `client/src/lib/registration.ts`, on the registration page.

They were briefly added to the shared `/catalog` and `/courses/:slug` queries
and then taken back out on purpose: PostgREST fails a query outright on an
unknown column rather than omitting it, so a deploy that reached production
before the migration did would have taken down the landing page and every
course card. Read from the one screen that needs them, a missing migration
costs exactly that screen.

The migration is equally safe to land ahead of the code, which is the order it
actually happened in. The two replaced functions gained arguments that all
carry defaults, so a four-argument `create_booking_intent` call and a
one-argument `create_enrollment_intent` call — which is what the deployed
frontend makes — still resolve and still behave identically. The site kept
working unchanged between the migration and the deploy.

---

## 6. Known gaps

- **Venue and member rate have no admin field.** Both are set with the SQL in
  §4.2. They belong in the course editor in `AdminCatalogue.tsx`; that editor
  works from a fixed field list and adding two more is a contained change.
- **Commission is not implemented** — §1.5. The data to compute it is being
  recorded from day one.
- **Seat holding for registrations is approximate.** Capacity counts settled
  enrolments plus registrations still inside `reservation_window()` (15
  minutes). It is not the hard slot lock bookings get. For a 20-seat course
  this makes an oversell unlikely rather than impossible.
- **No promotion code box in the booking flow.** The database, the API and the
  error wording all support a code on a session booking; only
  `BookingFlowConnected.tsx` has no field for one yet. Courses have it.
- **The schema is live; the user journeys are not yet walked end to end.** The
  migrations applied cleanly and every object and grant was verified against
  production (§5), and `npm run build` / `npm run lint` pass against the
  regenerated types. What has *not* happened is a real registration paid with a
  real test card, or a real code redeemed — both need a signed-in account and a
  published onsite course. Do that once before the shoulder course opens.
