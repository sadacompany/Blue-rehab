-- "قريباً" — an admin can close a service to new bookings without deleting it.
--
-- `is_active = false` already exists, but it does the opposite of what was
-- asked for: it removes the service from the catalogue entirely, so a
-- visitor who remembers "in-clinic sessions" sees no trace it ever existed.
-- The request was to keep the service visible — so people know it is coming
-- back — while making it un-bookable in the meantime. That is a second,
-- independent flag, not a rename of the first: a service can be temporarily
-- closed (is_coming_soon) without being deleted (is_active), and the two
-- states must stay distinguishable from each other.
alter table public.services
  add column if not exists is_coming_soon boolean not null default false;

-- `create_booking_intent` (20260820160000) is the one place a service's
-- availability for booking is actually decided — the browser proposes, the
-- database decides, same rule as everywhere else pricing or availability
-- is at stake. Recreated here with one added clause so a coming-soon
-- service is refused the same way an inactive one already is: the client
-- disabling the option is a courtesy, not the enforcement.
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

  select * into v_service from public.services s
   where s.id = p_service_id and s.is_active and not s.is_coming_soon;
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

-- No new grant needed: `services_admin_all` (20260807150000) already scopes
-- every write on this table — insert, update, delete alike — to
-- `is_admin()`, and `is_coming_soon` is just another column under that same
-- row policy. The existing admin service editor already calls
-- `supabase.from("services").update(...)`; this column rides along with it.
