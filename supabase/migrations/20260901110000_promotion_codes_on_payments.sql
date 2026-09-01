-- Let a promotion code change what is charged — and only here.
--
-- 20260901100000 built the codes and the ledger. This file is the only place a
-- code is allowed to affect money, and it does so inside the two functions that
-- already own pricing. The shape of the trust boundary is unchanged from
-- 20260807110000_pay_before_booking.sql: the browser names a service, a slot or
-- a course, and now also names a code; the database reads the price, decides
-- the discount, and writes both figures. `p_promo_code` is a `text` that is
-- looked up — there is no argument anywhere in this file through which an
-- amount, a percentage or a total can be supplied.
--
-- `payments.amount` keeps its existing meaning: what the customer is actually
-- charged, which is what `verifyPayment` re-reads from Moyasar and compares
-- against. The discount is recorded beside it in `payments.discount` (a column
-- that has existed unused since 002), so the gross is always recoverable as
-- amount + discount and no past payment changes meaning.

alter table public.payments
  add column if not exists promo_code_id uuid references public.promo_codes(id);

create index if not exists payments_promo_code_idx
  on public.payments(promo_code_id)
  where promo_code_id is not null;

-- ------------------------------------------------------- what a code is worth --
--
-- The single place a percentage becomes an amount. Both intent functions call
-- it and neither reimplements it, so a rule added here — a new state, a new
-- eligibility test — cannot be enforced for courses and forgotten for bookings.
--
-- It is granted to nobody. Its callers are `security definer` functions, which
-- execute as the owner and so may call it; a direct PostgREST call cannot.
-- That matters more than it looks: a customer able to call this freely could
-- enumerate live codes by trying strings and reading which error comes back.
--
-- `p_gross` is not client input. Every caller passes a figure it has just read
-- from `services.price`, `courses.price` or a price tier — see each call site.
create or replace function public.promo_apply(
  p_code text,
  p_kind text,
  p_gross numeric,
  p_user uuid
)
returns table (promo_code_id uuid, discount_amount numeric, net_amount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_code public.promo_codes%rowtype;
  v_uses integer;
  v_state text;
  v_discount numeric(10, 2);
begin
  select * into v_code from public.promo_codes c
   where c.code = upper(btrim(coalesce(p_code, '')));
  if not found then raise exception 'PROMO_NOT_FOUND'; end if;

  select count(*)::integer into v_uses
    from public.promo_code_redemptions r where r.promo_code_id = v_code.id;

  v_state := public.promo_code_state(
    v_code.is_paused, v_code.starts_at, v_code.ends_at, v_code.usage_limit, v_uses);

  -- Distinct errors rather than one refusal, because the four reasons call for
  -- four different things from the customer: wait, come back, stop trying, or
  -- check the spelling. Each is translated in client/src/lib/promotions.ts.
  if v_state = 'paused'    then raise exception 'PROMO_PAUSED'; end if;
  if v_state = 'expired'   then raise exception 'PROMO_EXPIRED'; end if;
  if v_state = 'scheduled' then raise exception 'PROMO_SCHEDULED'; end if;
  if v_state = 'exhausted' then raise exception 'PROMO_EXHAUSTED'; end if;

  -- The ceiling above is the campaign's; this is the person's. Checked here so
  -- that a second attempt is refused at the point of pricing rather than
  -- discovered by the unique index after the money has moved.
  if exists (
    select 1 from public.promo_code_redemptions r
     where r.promo_code_id = v_code.id and r.user_id = p_user
  ) then
    raise exception 'PROMO_ALREADY_USED';
  end if;

  v_discount := round(coalesce(p_gross, 0) * v_code.discount_percent / 100, 2);
  if v_discount > p_gross then v_discount := p_gross; end if;

  return query select v_code.id, v_discount, round(p_gross - v_discount, 2);
end;
$$;

-- ---------------------------------------------------------- enrolment intent --
--
-- Replaces the one-argument version from 20260818100000_free_course_enrollment
-- verbatim, with the code lookup added. `create or replace` cannot do this —
-- a different argument list makes a second function rather than a new body, and
-- the old one would go on being chosen for every single-argument call. So the
-- old signature is dropped, which also drops its grants; they are restored at
-- the foot of this file.
drop function if exists public.create_enrollment_intent(uuid);

create or replace function public.create_enrollment_intent(
  p_course_id uuid,
  p_promo_code text default null
)
returns table (order_number text, amount numeric, currency text, course_title text, discount numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_order text;
  v_seats integer;
  v_enrollment_id uuid;
  v_promo_id uuid;
  v_discount numeric(10, 2) := 0;
  v_net numeric(10, 2);
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select * into v_course from public.courses c where c.id = p_course_id and c.is_published;
  if not found then raise exception 'COURSE_UNAVAILABLE'; end if;

  if exists (select 1 from public.enrollments e
              where e.student_id = v_user and e.course_id = p_course_id and e.status <> 'cancelled') then
    raise exception 'ALREADY_ENROLLED';
  end if;

  if v_course.capacity is not null then
    select count(*) into v_seats from public.enrollments e
     where e.course_id = p_course_id and e.status <> 'cancelled';
    if v_seats >= v_course.capacity then raise exception 'COURSE_FULL'; end if;
  end if;

  -- The gross handed to promo_apply() is `courses.price`, read two statements
  -- ago from the row this function locked — never anything the caller sent.
  v_net := v_course.price;
  if nullif(btrim(coalesce(p_promo_code, '')), '') is not null then
    if v_course.price <= 0 then raise exception 'PROMO_ON_FREE_COURSE'; end if;
    select pa.promo_code_id, pa.discount_amount, pa.net_amount
      into v_promo_id, v_discount, v_net
      from public.promo_apply(p_promo_code, 'enrollment', v_course.price, v_user) pa;
  end if;

  -- Free outright, or made free by the code. Both take the path
  -- 20260818100000 opened: no payments row, no gateway, seat active at once.
  -- A code that brings the price to zero is still a code that was used, so the
  -- redemption is recorded here — the only place outside convert_paid_intent
  -- that writes one, because this is the only sale with no payment to settle.
  if v_net <= 0 then
    insert into public.enrollments (student_id, course_id, status, amount_due)
    values (v_user, p_course_id, 'active', 0)
    returning id into v_enrollment_id;

    if v_promo_id is not null then
      insert into public.promo_code_redemptions (
        promo_code_id, payment_id, user_id, order_number, kind,
        gross_amount, discount_amount, net_amount
      ) values (
        v_promo_id, null, v_user, null, 'enrollment',
        v_course.price, v_discount, 0
      ) on conflict do nothing;
    end if;

    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (v_user, 'in_app', 'enrollment_confirmed', 'تم تسجيلك في الدورة',
            case when v_promo_id is null
                 then 'الدورة مجانية، وتسجيلك مُفعَّل مباشرة.'
                 else 'غطّى كود الخصم رسوم الدورة بالكامل، وتسجيلك مُفعَّل مباشرة.' end,
            jsonb_build_object('enrollment_id', v_enrollment_id, 'course_id', p_course_id));

    return query select null::text, 0::numeric, 'SAR'::text, v_course.title, v_discount;
    return;
  end if;

  -- Reuse an unpaid attempt rather than minting a second order for the same
  -- seat — but only one carrying the same code, since the amount is frozen on
  -- the payment row and reusing an order priced without the code (or with a
  -- different one) would charge the wrong figure.
  select p.order_number into v_order from public.payments p
   where p.user_id = v_user and p.intent_course_id = p_course_id
     and p.status in ('pending','processing') and p.enrollment_id is null
     and p.promo_code_id is not distinct from v_promo_id
   order by p.created_at desc limit 1;

  if v_order is null then
    v_order := 'BR-C-' || to_char(now(), 'YYYYMMDD') || '-'
               || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.payments (
      order_number, user_id, amount, discount, promo_code_id,
      status, currency, provider, intent_kind, intent_course_id
    ) values (
      v_order, v_user, v_net, v_discount, v_promo_id,
      'pending', 'SAR', 'moyasar', 'enrollment', p_course_id
    );
  end if;

  return query select v_order, v_net, 'SAR'::text, v_course.title, v_discount;
end;
$$;

-- ------------------------------------------------------------ booking intent --
--
-- Replaces the four-argument version from
-- 20260820160000_enforce_telehealth_consent_server_side.sql. Everything that
-- file established is carried over unchanged and in the same order — the
-- consent gate in particular still runs before the slot is held, for exactly
-- the reason stated there. The only additions are the code lookup and the two
-- new columns on the insert.
drop function if exists public.create_booking_intent(uuid, uuid, uuid, text);

create or replace function public.create_booking_intent(
  p_service_id uuid,
  p_specialist_id uuid,
  p_slot_id uuid,
  p_notes text default null,
  p_promo_code text default null
)
returns table (
  order_number text,
  amount numeric,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  mode public.delivery_mode,
  reserved_until timestamptz,
  discount numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_slot public.availability_slots%rowtype;
  v_service public.services%rowtype;
  v_order text;
  v_until timestamptz;
  v_promo_id uuid;
  v_discount numeric(10, 2) := 0;
  v_net numeric(10, 2);
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.release_expired_reservations();

  select * into v_service from public.services s where s.id = p_service_id and s.is_active;
  if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;

  -- Carried from 20260824100000_service_coming_soon: a service marked «قريباً»
  -- is visible but closed, and a disabled button in the browser is not
  -- enforcement.
  if v_service.is_coming_soon then raise exception 'SERVICE_COMING_SOON'; end if;

  select * into v_slot from public.availability_slots where id = p_slot_id for update;
  if not found or not v_slot.is_available or v_slot.starts_at <= now() then
    raise exception 'SLOT_UNAVAILABLE';
  end if;
  if v_slot.specialist_id <> p_specialist_id then raise exception 'SLOT_SPECIALIST_MISMATCH'; end if;
  if not (v_slot.mode = any (v_service.allowed_modes)) then raise exception 'MODE_NOT_ALLOWED'; end if;

  -- NHIC Governing Rules of Telehealth §3.1.17: consent recorded before any
  -- telehealth activity. A withdrawn consent does not count — the patient
  -- must re-consent, the same as if none was ever given.
  if v_slot.mode = 'remote' and not exists (
    select 1 from public.consent_records
    where user_id = v_user and purpose = 'telehealth_session' and withdrawn_at is null
  ) then
    raise exception 'TELEHEALTH_CONSENT_REQUIRED';
  end if;

  -- Gross is `services.price`, read from the locked row above.
  v_net := v_service.price;
  if nullif(btrim(coalesce(p_promo_code, '')), '') is not null then
    select pa.promo_code_id, pa.discount_amount, pa.net_amount
      into v_promo_id, v_discount, v_net
      from public.promo_apply(p_promo_code, 'booking', v_service.price, v_user) pa;

    -- A session reduced to nothing has no payment to verify, and the whole
    -- booking path — hold, gateway, convert_paid_intent — is built on there
    -- being one. Rather than invent a second, unverified way to create an
    -- appointment, refuse the combination and say so. This is an administrator
    -- configuring a 100% code, not a patient doing anything wrong.
    if v_net <= 0 then raise exception 'PROMO_COVERS_WHOLE_SESSION'; end if;
  end if;

  -- Hold it, without creating anything the patient would see as a booking.
  update public.availability_slots set is_available = false where id = p_slot_id;

  v_until := now() + public.reservation_window();
  v_order := 'BR-' || to_char(now(), 'YYYYMMDD') || '-'
             || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.payments (
    order_number, user_id, amount, discount, promo_code_id, status, currency, provider,
    intent_kind, intent_service_id, intent_specialist_id, intent_slot_id, intent_mode, intent_notes,
    reserved_until
  ) values (
    v_order, v_user, v_net, v_discount, v_promo_id, 'pending', 'SAR', 'moyasar',
    'booking', p_service_id, p_specialist_id, p_slot_id, v_slot.mode,
    nullif(btrim(coalesce(p_notes, '')), ''), v_until
  );

  return query select v_order, v_net, 'SAR'::text,
                      v_slot.starts_at, v_slot.ends_at, v_slot.mode, v_until, v_discount;
end;
$$;

-- ---------------------------------------------------------------- settlement --

-- Everything that must happen once a payment has become the thing it paid for.
--
-- Two reasons this is a function and not four more lines inside each branch of
-- convert_paid_intent(). The near one: the booking branch and the enrolment
-- branch would otherwise carry their own copy and drift. The far one, which
-- matters more — convert_paid_intent() is the most security-critical function
-- in the schema, and every feature that needs to react to a settled payment
-- would otherwise have to restate it in full just to add a line. This is the
-- seam those features extend instead, so the body above stays reviewable as
-- the one thing it is.
--
-- Takes the whole payment row: the gross is reconstructed from the two columns
-- frozen at intent time, so a later edit to the code's percentage cannot
-- rewrite what this sale was.
create or replace function public.after_intent_settled(
  p_pay public.payments,
  p_kind text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_pay.promo_code_id is null then return; end if;

  insert into public.promo_code_redemptions (
    promo_code_id, payment_id, user_id, order_number, kind,
    gross_amount, discount_amount, net_amount
  ) values (
    p_pay.promo_code_id, p_pay.id, p_pay.user_id, p_pay.order_number, p_kind,
    round(p_pay.amount + coalesce(p_pay.discount, 0), 2), coalesce(p_pay.discount, 0), p_pay.amount
  )
  on conflict do nothing;
end;
$$;

-- convert_paid_intent() as 20260807110000 wrote it, plus the ledger entry. The
-- redemption is written here and not at intent time because a campaign's
-- ceiling counts sales, not attempts: an abandoned checkout that had a code
-- typed into it must leave the campaign exactly as it found it.
--
-- The insert cannot be allowed to fail the settlement it is recording. Both
-- unique rules on the ledger (one row per payment, one redemption per person
-- per code) are already enforced upstream — but if a race ever slipped a
-- second one through, aborting here would leave a verified payment with no
-- booking against it, which is far worse than a campaign tally short by one.
-- `on conflict do nothing` chooses the tolerable failure.
create or replace function public.convert_paid_intent(p_order_number text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pay public.payments%rowtype;
  v_booking_id uuid;
  v_enrollment_id uuid;
  v_slot public.availability_slots%rowtype;
begin
  select * into v_pay from public.payments where order_number = p_order_number for update;
  if not found then raise exception 'PAYMENT_NOT_FOUND'; end if;
  if v_pay.booking_id is not null or v_pay.enrollment_id is not null then
    return 'already';
  end if;

  if v_pay.intent_kind = 'booking' then
    select * into v_slot from public.availability_slots where id = v_pay.intent_slot_id for update;

    -- Someone else's booking already owns this time.
    if exists (select 1 from public.bookings b
                where b.slot_id = v_pay.intent_slot_id and b.status <> 'cancelled') then
      return 'slot_taken';
    end if;
    if not found or v_slot.starts_at <= now() then
      return 'slot_taken';
    end if;

    insert into public.bookings (
      patient_id, specialist_id, service_id, slot_id, branch_id,
      starts_at, ends_at, mode, status, total, notes
    ) values (
      v_pay.user_id, v_pay.intent_specialist_id, v_pay.intent_service_id, v_pay.intent_slot_id,
      v_slot.branch_id, v_slot.starts_at, v_slot.ends_at, v_slot.mode,
      'confirmed', v_pay.amount, v_pay.intent_notes
    ) returning id into v_booking_id;

    update public.availability_slots set is_available = false where id = v_pay.intent_slot_id;
    update public.payments
       set booking_id = v_booking_id, reserved_until = null, updated_at = now()
     where id = v_pay.id;

    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (v_pay.user_id, 'in_app', 'booking_confirmed', 'تم تأكيد حجزك',
            'استلمنا الدفع وحُجز موعدك.',
            jsonb_build_object('booking_id', v_booking_id, 'order_number', p_order_number));

    perform public.after_intent_settled(v_pay, 'booking');
    return 'created';
  end if;

  if v_pay.intent_kind = 'enrollment' then
    select id into v_enrollment_id from public.enrollments
     where student_id = v_pay.user_id and course_id = v_pay.intent_course_id;

    if v_enrollment_id is null then
      insert into public.enrollments (student_id, course_id, status, amount_due)
      values (v_pay.user_id, v_pay.intent_course_id, 'active', v_pay.amount)
      returning id into v_enrollment_id;
    else
      update public.enrollments set status = 'active' where id = v_enrollment_id;
    end if;

    update public.payments set enrollment_id = v_enrollment_id, updated_at = now() where id = v_pay.id;

    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (v_pay.user_id, 'in_app', 'enrollment_confirmed', 'تم تأكيد تسجيلك',
            'استلمنا الدفع وفُعِّل تسجيلك في الدورة.',
            jsonb_build_object('enrollment_id', v_enrollment_id, 'order_number', p_order_number));

    perform public.after_intent_settled(v_pay, 'enrollment');
    return 'created';
  end if;

  raise exception 'INTENT_KIND_UNKNOWN';
end;
$$;

-- ------------------------------------------------------------------- grants --
--
-- Restored for the two dropped signatures, and withheld from everything that
-- exists only to be called from inside another security-definer function.

revoke all on function public.promo_apply(text, text, numeric, uuid) from public, anon, authenticated;
revoke all on function public.after_intent_settled(public.payments, text) from public, anon, authenticated;
revoke all on function public.convert_paid_intent(text) from public, anon, authenticated;

revoke all on function public.create_enrollment_intent(uuid, text) from public, anon;
revoke all on function public.create_booking_intent(uuid, uuid, uuid, text, text) from public, anon;

grant execute on function public.create_enrollment_intent(uuid, text) to authenticated;
grant execute on function public.create_booking_intent(uuid, uuid, uuid, text, text) to authenticated;
