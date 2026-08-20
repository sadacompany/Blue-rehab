-- Enforce telehealth consent server-side, not just in the browser.
--
-- 20260820130000_telehealth_consent.sql built `consent_records` as a
-- genuinely tamper-proof audit table — proven today against the live database
-- by attempting to rewrite consent_text, backdate granted_at, and un-withdraw
-- a test row, all three rejected by the immutability trigger. But nothing
-- required the record to exist before a remote session could be booked and
-- paid for. `recordTelehealthConsent()` runs client-side, right before
-- `createBookingDraft()` (BookingFlowConnected.tsx) — a well-behaved browser
-- session always writes one, but a direct call to `create_booking_intent`
-- (any HTTP client, not just the browser) skips it entirely. The record this
-- feature produces is unforgeable once written; whether it gets written at
-- all was still resting on client cooperation. That is the same trust
-- boundary 20260807110000_pay_before_booking.sql closed for pricing — the
-- browser proposed, the database decided — applied here to consent.
--
-- The check belongs inside `create_booking_intent`, not a trigger on
-- `bookings`: under pay-first there is no `bookings` row until
-- `convert_paid_intent`, by which point the slot is already held and the
-- payment already captured — asking then would mean refunding a successful
-- charge over a compliance gate that was knowable up front. `v_slot.mode`
-- here comes from `availability_slots`, not from client input, so this cannot
-- be bypassed by asking for a clinic slot and claiming it is remote.
create or replace function public.create_booking_intent(
  p_service_id uuid,
  p_specialist_id uuid,
  p_slot_id uuid,
  p_notes text default null
)
returns table (
  order_number text,
  amount numeric,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  mode public.delivery_mode,
  reserved_until timestamptz
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
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  perform public.release_expired_reservations();

  select * into v_service from public.services s where s.id = p_service_id and s.is_active;
  if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;

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

  -- Hold it, without creating anything the patient would see as a booking.
  update public.availability_slots set is_available = false where id = p_slot_id;

  v_until := now() + public.reservation_window();
  v_order := 'BR-' || to_char(now(), 'YYYYMMDD') || '-'
             || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));

  insert into public.payments (
    order_number, user_id, amount, status, currency, provider,
    intent_kind, intent_service_id, intent_specialist_id, intent_slot_id, intent_mode, intent_notes,
    reserved_until
  ) values (
    v_order, v_user, v_service.price, 'pending', 'SAR', 'moyasar',
    'booking', p_service_id, p_specialist_id, p_slot_id, v_slot.mode,
    nullif(btrim(coalesce(p_notes, '')), ''), v_until
  );

  return query select v_order, v_service.price, 'SAR'::text,
                      v_slot.starts_at, v_slot.ends_at, v_slot.mode, v_until;
end;
$$;
