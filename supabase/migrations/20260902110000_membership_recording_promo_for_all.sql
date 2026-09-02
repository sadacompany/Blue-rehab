-- Membership becomes a recorded fact, and a promotion code becomes the one
-- discount everyone can use.
--
-- The onsite registration form (20260901120000, repriced by 20260901130000)
-- treated membership and a promo code as mutually exclusive: a member got an
-- automatic `membership_discount_percent` and was refused a code
-- (DISCOUNTS_DO_NOT_STACK), a non-member got the code. There is no membership
-- system yet — verification, benefits, the discount rate itself are all still
-- to be built — so a membership number is, for now, only a claim recorded
-- against the registration for later review.
--
-- This recreates the pricing authority accordingly: `p_is_member` no longer
-- changes the price (it stays in the signature because the intent function
-- passes it and stores the member flag and number on the registration), and a
-- promotion code now applies whether or not the attendee is a member.
--
-- Based on the 20260901130000 body, not the original: the gateway-minimum floor
-- introduced there is preserved exactly, and the parameter defaults are kept
-- identical (`create or replace` cannot remove them, and changing p_tier_key's
-- default would break the callers that omit it).
--
-- MEMBERSHIP_NOT_OFFERED and DISCOUNTS_DO_NOT_STACK are no longer raised from
-- here. `courses.membership_discount_percent` is deliberately left in place,
-- unread, so the rate an administrator already configured survives until the
-- membership system is built and can use it again.

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

  -- Membership is recorded, not priced: `p_is_member` no longer moves the
  -- figure, and no longer excludes a code. The promotion code is the discount,
  -- and it applies to members and non-members alike.
  if v_has_code then
    select pa.promo_code_id, pa.discount_amount, pa.net_amount
      into v_promo_id, v_discount, v_net
      from public.promo_apply(p_promo_code, 'enrollment', v_gross, v_user) pa;
    v_label := 'كود خصم';
  end if;

  v_net := round(v_gross - v_discount, 2);

  -- Unchanged from 20260901130000: above zero but under the gateway's floor
  -- there is a fee that cannot be collected, and the summary step must say so
  -- rather than the pay button failing.
  if v_net > 0 and v_net < public.gateway_minimum_charge() then
    raise exception 'AMOUNT_BELOW_GATEWAY_MINIMUM';
  end if;

  return query select v_gross, v_discount, v_net, v_label, v_promo_id;
end;
$$;

-- ------------------------------------------- membership number is optional --
--
-- A membership number is a claim recorded for later review, so it can no longer
-- be the thing that blocks a registration. Two places still demanded it:
--
--   1. `course_registration_member_numbered`, a table CHECK that rejected any
--      member row without a number.
--   2. `create_onsite_registration_intent`, which raised
--      MEMBERSHIP_NUMBER_REQUIRED before pricing.
--
-- The constraint is dropped outright. The function is rewritten in place by
-- removing exactly that one guard from its current definition, rather than
-- restating a hundred lines of seat-counting and payment-intent logic here and
-- risking drift from what is actually deployed.

alter table public.course_registrations
  drop constraint if exists course_registration_member_numbered;

do $do$
declare
  v_def text;
  v_guard text := '  if coalesce(p_is_member, false)
     and nullif(btrim(coalesce(p_membership_number, '''')), '''') is null then
    raise exception ''MEMBERSHIP_NUMBER_REQUIRED'';
  end if;
';
begin
  select pg_get_functiondef(p.oid) into v_def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'create_onsite_registration_intent';

  if v_def is null then
    raise exception 'create_onsite_registration_intent not found';
  end if;

  if position(v_guard in v_def) = 0 then
    raise exception 'MEMBERSHIP_NUMBER_REQUIRED guard not found — definition changed, review by hand';
  end if;

  v_def := replace(v_def, v_guard, '');
  execute v_def;
end
$do$;
