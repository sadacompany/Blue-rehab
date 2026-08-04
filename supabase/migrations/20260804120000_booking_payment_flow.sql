-- Booking + payment flow.
--
-- Closes the trust boundary flagged in docs/APP_REVIEW.md: the browser used to
-- insert `bookings` directly and supply `total` itself. Creation now happens in
-- SECURITY DEFINER functions that read the price from `services`/`courses`,
-- validate the slot, and create the matching `payments` row atomically.

-- ---------------------------------------------------------------- bookings --
alter table public.bookings
  add column if not exists slot_id uuid references public.availability_slots(id),
  add column if not exists meeting_url text,
  add column if not exists meeting_event_id text,
  add column if not exists meeting_provider text;

-- A slot can back at most one live booking.
create unique index if not exists bookings_slot_live_unique
  on public.bookings(slot_id)
  where slot_id is not null and status <> 'cancelled';

-- ------------------------------------------------------------- enrollments --
alter table public.enrollments
  add column if not exists status text not null default 'pending_payment',
  add column if not exists amount_due numeric(10,2) not null default 0 check (amount_due >= 0);

-- ---------------------------------------------------------------- payments --
alter table public.payments
  add column if not exists provider text not null default 'moyasar',
  add column if not exists provider_payment_id text,
  add column if not exists provider_invoice_id text,
  add column if not exists currency text not null default 'SAR',
  add column if not exists payment_url text,
  add column if not exists failure_reason text,
  add column if not exists paid_at timestamptz;

create index if not exists payments_provider_payment_idx
  on public.payments(provider_payment_id) where provider_payment_id is not null;
create index if not exists payments_provider_invoice_idx
  on public.payments(provider_invoice_id) where provider_invoice_id is not null;

-- ------------------------------------------------------- booking creation --
create or replace function public.create_booking_with_payment(
  p_service_id uuid,
  p_specialist_id uuid,
  p_slot_id uuid,
  p_notes text default null
)
returns table (
  booking_id uuid,
  order_number text,
  amount numeric,
  currency text,
  starts_at timestamptz,
  ends_at timestamptz,
  mode public.delivery_mode,
  status public.booking_status
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_slot public.availability_slots%rowtype;
  v_service public.services%rowtype;
  v_booking_id uuid;
  v_order text;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_service from public.services where id = p_service_id and is_active;
  if not found then
    raise exception 'SERVICE_UNAVAILABLE';
  end if;

  -- Row lock so two concurrent bookings cannot take the same slot.
  select * into v_slot from public.availability_slots where id = p_slot_id for update;
  if not found or not v_slot.is_available or v_slot.starts_at <= now() then
    raise exception 'SLOT_UNAVAILABLE';
  end if;
  if v_slot.specialist_id <> p_specialist_id then
    raise exception 'SLOT_SPECIALIST_MISMATCH';
  end if;
  if not (v_slot.mode = any (v_service.allowed_modes)) then
    raise exception 'MODE_NOT_ALLOWED';
  end if;

  update public.availability_slots set is_available = false where id = p_slot_id;

  insert into public.bookings (
    patient_id, specialist_id, service_id, slot_id, branch_id,
    starts_at, ends_at, mode, status, total, notes
  ) values (
    v_user, p_specialist_id, p_service_id, p_slot_id, v_slot.branch_id,
    v_slot.starts_at, v_slot.ends_at, v_slot.mode, 'pending_payment',
    v_service.price,                              -- authoritative price
    nullif(btrim(coalesce(p_notes, '')), '')
  )
  returning id into v_booking_id;

  v_order := 'BR-' || to_char(now(), 'YYYYMMDD') || '-'
             || upper(substr(replace(v_booking_id::text, '-', ''), 1, 10));

  insert into public.payments (order_number, user_id, booking_id, amount, status, currency, provider)
  values (v_order, v_user, v_booking_id, v_service.price, 'pending', 'SAR', 'moyasar');

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  values (
    v_user, 'in_app', 'booking_created', 'تم إنشاء حجزك',
    'حجزك بانتظار إتمام الدفع لتأكيد الموعد.',
    jsonb_build_object('booking_id', v_booking_id, 'order_number', v_order)
  );

  return query
    select v_booking_id, v_order, v_service.price, 'SAR'::text,
           v_slot.starts_at, v_slot.ends_at, v_slot.mode, 'pending_payment'::public.booking_status;
end;
$$;

-- ---------------------------------------------------- enrollment creation --
create or replace function public.create_enrollment_with_payment(p_course_id uuid)
returns table (
  enrollment_id uuid,
  order_number text,
  amount numeric,
  currency text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_course public.courses%rowtype;
  v_enrollment_id uuid;
  v_existing public.enrollments%rowtype;
  v_order text;
  v_seats integer;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  select * into v_course from public.courses where id = p_course_id and is_published;
  if not found then
    raise exception 'COURSE_UNAVAILABLE';
  end if;

  select * into v_existing from public.enrollments
   where student_id = v_user and course_id = p_course_id;
  if found then
    select order_number into v_order from public.payments
     where enrollment_id = v_existing.id order by created_at desc limit 1;
    return query select v_existing.id, v_order, v_existing.amount_due, 'SAR'::text, v_existing.status;
    return;
  end if;

  if v_course.capacity is not null then
    select count(*) into v_seats from public.enrollments
     where course_id = p_course_id and status <> 'cancelled';
    if v_seats >= v_course.capacity then
      raise exception 'COURSE_FULL';
    end if;
  end if;

  insert into public.enrollments (student_id, course_id, status, amount_due)
  values (v_user, p_course_id, 'pending_payment', v_course.price)
  returning id into v_enrollment_id;

  v_order := 'BR-C-' || to_char(now(), 'YYYYMMDD') || '-'
             || upper(substr(replace(v_enrollment_id::text, '-', ''), 1, 10));

  insert into public.payments (order_number, user_id, enrollment_id, amount, status, currency, provider)
  values (v_order, v_user, v_enrollment_id, v_course.price, 'pending', 'SAR', 'moyasar');

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  values (
    v_user, 'in_app', 'enrollment_created', 'تم تسجيلك في الدورة',
    'تسجيلك بانتظار إتمام الدفع.',
    jsonb_build_object('enrollment_id', v_enrollment_id, 'order_number', v_order)
  );

  return query select v_enrollment_id, v_order, v_course.price, 'SAR'::text, 'pending_payment'::text;
end;
$$;

revoke all on function public.create_booking_with_payment(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.create_enrollment_with_payment(uuid) from public, anon;
grant execute on function public.create_booking_with_payment(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.create_enrollment_with_payment(uuid) to authenticated;

-- Direct inserts stay closed: creation must go through the functions above so the
-- price is always server-derived. (No `for insert` policy on bookings/enrollments.)
grant select on public.payments to authenticated;

-- 20260803090000 granted patients a row-level UPDATE on their bookings, which
-- also exposed `total` and `status`. Narrow it to the meeting columns so a
-- patient can never re-price or self-confirm a booking; status transitions are
-- owned by the verified-payment path (service role) and by staff tooling.
revoke update on table public.bookings from authenticated;
grant update (meeting_url, meeting_event_id, meeting_provider, notes)
  on table public.bookings to authenticated;
