-- Let a payment exist before the thing it pays for.
--
-- `payments_check` insisted on exactly one of booking_id / enrollment_id being
-- present. That was right while the booking was created first, but pay-first
-- inverts the order: the payment is the intent, and both columns are null until
-- the money clears and `convert_paid_intent` fills one in.
--
-- The rule still holds where it matters — a payment may never point at both a
-- booking and an enrolment — and an intent must declare which kind it is, so a
-- row can never be left meaning nothing.

alter table public.payments drop constraint if exists payments_check;

alter table public.payments
  add constraint payments_target_check check (
    -- Settled: attached to exactly one thing.
    ((booking_id is not null) <> (enrollment_id is not null))
    -- Or an intent, still awaiting payment, naming what it is for.
    or (booking_id is null and enrollment_id is null and intent_kind is not null)
  );
