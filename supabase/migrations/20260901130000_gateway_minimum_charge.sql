-- Refuse a price the payment gateway will not accept, before anyone pays it.
--
-- Moyasar rejects any invoice under 100 halalas: «The value must be greater
-- than or equal to 100.» The platform did not know that, so a course priced at
-- 0.99 SAR behaved like this: the catalogue offered it, the four-step
-- registration form accepted every answer, the summary showed «الإجمالي ٠٫٩٩
-- ر.س», and the gateway refused the invoice at the last press — surfacing as
-- «Unexpected server error», because an unmapped MoyasarError became a 500.
--
-- Three things were wrong with that and only one of them is the price:
--
--   1. The check existed only inside Moyasar, so the earliest the platform
--      could discover the problem was after the reader had done all the work.
--   2. The refusal named nothing the reader could act on.
--   3. Nothing stopped an administrator setting such a price in the first
--      place, and nothing told them afterwards.
--
-- This file fixes (1) and (2) for every paid path — the amount is checked where
-- the amount is decided, which is the same principle the pricing itself already
-- follows. (3) is a warning in the admin catalogue, in the same change.
--
-- Zero is untouched and stays free: a free course and an unsellable one are
-- different things, and only the second is an error.

-- The gateway's floor, named once. A function rather than a constant so the
-- three callers below cannot disagree, and so raising it is one edit if Moyasar
-- ever changes it.
create or replace function public.gateway_minimum_charge()
returns numeric
language sql
immutable
as $$ select 1.00::numeric $$;

comment on function public.gateway_minimum_charge() is
  'Smallest amount Moyasar will invoice (100 halalas). Below this, checkout fails.';

-- ------------------------------------------------------------------ quote --
--
-- Unchanged from 20260901120000 except for the floor check at the end, which is
-- what puts the message on the registration form's own summary step rather than
-- after it is submitted.
create or replace function public.onsite_registration_quote(
  p_course_id uuid,
  p_tier_key text default null,
  p_is_member boolean default false,
  p_promo_code text default null
)
returns table (
  gross_amount numeric,
  discount_amount numeric,
  net_amount numeric,
  discount_label text,
  promo_code_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_gross numeric(10, 2);
  v_discount numeric(10, 2) := 0;
  v_net numeric(10, 2);
  v_label text := null;
  v_promo_id uuid := null;
  v_has_code boolean := nullif(btrim(coalesce(p_promo_code, '')), '') is not null;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  select * into v_course from public.courses c where c.id = p_course_id and c.is_published;
  if not found then raise exception 'COURSE_UNAVAILABLE'; end if;

  if p_tier_key is null then
    v_gross := v_course.price;
    if exists (select 1 from public.course_price_tiers t where t.course_id = p_course_id) then
      raise exception 'TIER_REQUIRED';
    end if;
  else
    select t.price into v_gross from public.course_price_tiers t
     where t.course_id = p_course_id and t.key = p_tier_key;
    if not found then raise exception 'TIER_UNKNOWN'; end if;
  end if;

  if coalesce(p_is_member, false) and v_has_code then
    raise exception 'DISCOUNTS_DO_NOT_STACK';
  end if;

  if coalesce(p_is_member, false) then
    if v_course.membership_discount_percent is null then
      raise exception 'MEMBERSHIP_NOT_OFFERED';
    end if;
    v_discount := round(v_gross * v_course.membership_discount_percent / 100, 2);
    v_label := 'عضوية';
  elsif v_has_code then
    select pa.promo_code_id, pa.discount_amount, pa.net_amount
      into v_promo_id, v_discount, v_net
      from public.promo_apply(p_promo_code, 'enrollment', v_gross, v_user) pa;
    v_label := 'كود خصم';
  end if;

  v_net := round(v_gross - v_discount, 2);

  -- Above zero but under the gateway's floor: there is a fee, and it cannot be
  -- collected. Raised here so the summary step says so instead of the pay
  -- button failing. A discount that lands the total in this gap is the same
  -- problem as a price that starts there, which is why it is checked on the
  -- net rather than on the tier.
  if v_net > 0 and v_net < public.gateway_minimum_charge() then
    raise exception 'AMOUNT_BELOW_GATEWAY_MINIMUM';
  end if;

  return query select v_gross, v_discount, v_net, v_label, v_promo_id;
end;
$$;

-- ------------------------------------------------------- enrolment intent --
--
-- Unchanged from 20260901110000 except for the same floor check, placed after
-- the free path so that a genuinely free course is unaffected.
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

  v_net := v_course.price;
  if nullif(btrim(coalesce(p_promo_code, '')), '') is not null then
    if v_course.price <= 0 then raise exception 'PROMO_ON_FREE_COURSE'; end if;
    select pa.promo_code_id, pa.discount_amount, pa.net_amount
      into v_promo_id, v_discount, v_net
      from public.promo_apply(p_promo_code, 'enrollment', v_course.price, v_user) pa;
  end if;

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

  if v_net < public.gateway_minimum_charge() then
    raise exception 'AMOUNT_BELOW_GATEWAY_MINIMUM';
  end if;

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

-- --------------------------------------------------------- booking intent --
--
-- Unchanged from 20260901110000 except for the floor check, placed before the
-- slot is held so a refusal does not take a time off the calendar on its way out.
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

  v_net := v_service.price;
  if nullif(btrim(coalesce(p_promo_code, '')), '') is not null then
    select pa.promo_code_id, pa.discount_amount, pa.net_amount
      into v_promo_id, v_discount, v_net
      from public.promo_apply(p_promo_code, 'booking', v_service.price, v_user) pa;

    if v_net <= 0 then raise exception 'PROMO_COVERS_WHOLE_SESSION'; end if;
  end if;

  -- Checked before the hold below, so a session the gateway would refuse does
  -- not take a slot off the calendar for fifteen minutes on its way to failing.
  if v_net < public.gateway_minimum_charge() then
    raise exception 'AMOUNT_BELOW_GATEWAY_MINIMUM';
  end if;

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

-- ------------------------------------------------------------------ grants --

revoke all on function public.gateway_minimum_charge() from public;
grant execute on function public.gateway_minimum_charge() to anon, authenticated;
