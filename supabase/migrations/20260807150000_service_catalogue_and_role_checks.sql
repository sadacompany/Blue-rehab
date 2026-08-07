-- Who may define what is sold, and who may teach.
--
-- Three gaps, all found by probing the live database with real accounts rather
-- than reading the policies:
--
-- 1. `services` had only a SELECT policy, so every write was refused — nobody
--    could add a consultation type, not even an administrator. Defining what the
--    clinic sells required direct database access.
-- 2. `courses_trainer_all` checked only `trainer_id = auth.uid()`. It never
--    checked the person actually holds the `trainer` role, so anyone signed in
--    could create a course naming themselves as its instructor, and publish it.
--    That quietly bypasses the approval flow: someone rejected as a trainer
--    could still teach.
-- 3. A specialist had no way to say which services they actually offer, so the
--    booking screen paired every specialist with every service.

-- ------------------------------------------------------------ role helper --
create or replace function public.has_role(p_role public.user_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and p_role = any(p.roles)
  );
$$;

revoke all on function public.has_role(public.user_role) from public, anon;
grant execute on function public.has_role(public.user_role) to authenticated;

-- --------------------------------------------------------------- services --
-- Pricing stays administrative. The amount charged is server-derived from this
-- table, so whoever writes it decides what patients pay — that is not a
-- provider-level privilege.
drop policy if exists "services_admin_all" on public.services;
create policy "services_admin_all" on public.services
  for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

grant insert, update, delete on public.services to authenticated;

-- ---------------------------------------------------------------- courses --
-- Same ownership rule as before, plus the role the approval flow grants.
drop policy if exists "courses_trainer_all" on public.courses;
create policy "courses_trainer_all" on public.courses
  for all to authenticated
  using (trainer_id = (select auth.uid()) and public.has_role('trainer'))
  with check (trainer_id = (select auth.uid()) and public.has_role('trainer'));

-- ------------------------------------------------- what a specialist offers --
create table if not exists public.specialist_services (
  specialist_id uuid not null references public.specialists(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (specialist_id, service_id)
);

alter table public.specialist_services enable row level security;
grant select on public.specialist_services to anon, authenticated;
grant insert, delete on public.specialist_services to authenticated;

-- Public, because the booking screen needs it to pair the two lists.
drop policy if exists "specialist_services_public_read" on public.specialist_services;
create policy "specialist_services_public_read" on public.specialist_services
  for select to anon, authenticated using (true);

drop policy if exists "specialist_services_own_write" on public.specialist_services;
create policy "specialist_services_own_write" on public.specialist_services
  for all to authenticated
  using (exists (
    select 1 from public.specialists s
     where s.id = specialist_services.specialist_id and s.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.specialists s
     where s.id = specialist_services.specialist_id and s.profile_id = (select auth.uid())
  ));

drop policy if exists "specialist_services_admin_write" on public.specialist_services;
create policy "specialist_services_admin_write" on public.specialist_services
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- A specialist with no rows here offers everything. That keeps every existing
-- specialist bookable rather than making them all disappear from the booking
-- screen the moment this table exists, and means the list is opt-in narrowing
-- rather than a setup step nobody knew they had to complete.
comment on table public.specialist_services is
  'Services a specialist offers. No rows for a specialist means: all services.';

-- Booking must respect the choice once it is made.
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
  v_has_list boolean;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode = '28000'; end if;

  perform public.release_expired_reservations();

  select * into v_service from public.services s where s.id = p_service_id and s.is_active;
  if not found then raise exception 'SERVICE_UNAVAILABLE'; end if;

  -- Honour the specialist's own list, when they have set one.
  select exists (select 1 from public.specialist_services ss where ss.specialist_id = p_specialist_id)
    into v_has_list;
  if v_has_list and not exists (
    select 1 from public.specialist_services ss
     where ss.specialist_id = p_specialist_id and ss.service_id = p_service_id
  ) then
    raise exception 'SERVICE_NOT_OFFERED';
  end if;

  select * into v_slot from public.availability_slots where id = p_slot_id for update;
  if not found or not v_slot.is_available or v_slot.starts_at <= now() then
    raise exception 'SLOT_UNAVAILABLE';
  end if;
  if v_slot.specialist_id <> p_specialist_id then raise exception 'SLOT_SPECIALIST_MISMATCH'; end if;
  if not (v_slot.mode = any (v_service.allowed_modes)) then raise exception 'MODE_NOT_ALLOWED'; end if;

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

revoke all on function public.create_booking_intent(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.create_booking_intent(uuid, uuid, uuid, text) to authenticated;
