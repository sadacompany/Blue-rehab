-- Pay before the booking exists.
--
-- Until now `create_booking_with_payment` inserted a real booking in
-- `pending_payment` and only then sent the patient to the payment page. The
-- client's objection is fair: the screen announced «تم حجز الجلسة» before any
-- money moved, and an abandoned checkout left a booking behind.
--
-- The payment row now doubles as the intent. It carries what the patient asked
-- for, the amount frozen at request time, and a short hold on the slot; the
-- booking itself is only created once the payment is verified.
--
-- Why hold the slot at all, when the point is to charge first: without a hold,
-- two patients can pay for the same time within the same minute and the loser
-- has to be refunded. The hold makes that outcome rare instead of routine. It is
-- not a booking — nothing appears in anyone's account and the slot frees itself
-- if checkout is abandoned.

alter table public.payments
  add column if not exists intent_kind text check (intent_kind in ('booking','enrollment')),
  add column if not exists intent_service_id uuid references public.services(id),
  add column if not exists intent_specialist_id uuid references public.specialists(id),
  add column if not exists intent_slot_id uuid references public.availability_slots(id),
  add column if not exists intent_mode public.delivery_mode,
  add column if not exists intent_notes text,
  add column if not exists intent_course_id uuid references public.courses(id),
  add column if not exists reserved_until timestamptz;

create index if not exists payments_reservation_idx
  on public.payments(reserved_until)
  where reserved_until is not null and status in ('pending','processing');

-- How long a patient has to finish at the gateway before the time is offered to
-- someone else. Long enough for a card and a 3-D Secure step, short enough that
-- an abandoned attempt does not block the slot for the afternoon.
create or replace function public.reservation_window()
returns interval language sql immutable as $$ select interval '15 minutes' $$;

-- ------------------------------------------------------------ housekeeping --
-- Frees slots whose hold lapsed. Called at the start of every intent creation,
-- so the calendar self-heals without needing a scheduled job.
create or replace function public.release_expired_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare v_count integer := 0;
begin
  with lapsed as (
    select id, intent_slot_id
      from public.payments
     where status in ('pending','processing')
       and reserved_until is not null
       and reserved_until < now()
       and booking_id is null
     for update skip locked
  ), freed as (
    update public.availability_slots s
       set is_available = true
      from lapsed
     where s.id = lapsed.intent_slot_id
       and not exists (select 1 from public.bookings b
                        where b.slot_id = s.id and b.status <> 'cancelled')
    returning s.id
  )
  update public.payments p
     set status = 'cancelled', reserved_until = null, updated_at = now()
    from lapsed
   where p.id = lapsed.id;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- --------------------------------------------------------- booking intent --
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

-- ------------------------------------------------------ enrolment intent ---
create or replace function public.create_enrollment_intent(p_course_id uuid)
returns table (order_number text, amount numeric, currency text, course_title text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := (select auth.uid());
  v_course public.courses%rowtype;
  v_order text;
  v_seats integer;
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

  -- Reuse an unpaid attempt rather than minting a second order for the same seat.
  select p.order_number into v_order from public.payments p
   where p.user_id = v_user and p.intent_course_id = p_course_id
     and p.status in ('pending','processing') and p.enrollment_id is null
   order by p.created_at desc limit 1;

  if v_order is null then
    v_order := 'BR-C-' || to_char(now(), 'YYYYMMDD') || '-'
               || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10));
    insert into public.payments (
      order_number, user_id, amount, status, currency, provider, intent_kind, intent_course_id
    ) values (
      v_order, v_user, v_course.price, 'pending', 'SAR', 'moyasar', 'enrollment', p_course_id
    );
  end if;

  return query select v_order, v_course.price, 'SAR'::text, v_course.title;
end;
$$;

-- -------------------------------------------------------------- conversion --
-- Turns a verified payment into the thing that was paid for. Runs as the service
-- role from the API only after the amount has been re-read from the gateway.
--
-- Returns 'created' | 'already' | 'slot_taken'. The caller refunds on
-- 'slot_taken': the patient's money must not sit against a time somebody else
-- holds.
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

    return 'created';
  end if;

  raise exception 'INTENT_KIND_UNKNOWN';
end;
$$;

-- Release the hold when an attempt fails or is refunded.
create or replace function public.release_intent(p_order_number text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_pay public.payments%rowtype;
begin
  select * into v_pay from public.payments where order_number = p_order_number;
  if not found or v_pay.intent_slot_id is null then return; end if;

  update public.availability_slots s set is_available = true
   where s.id = v_pay.intent_slot_id
     and not exists (select 1 from public.bookings b
                      where b.slot_id = s.id and b.status <> 'cancelled');

  update public.payments set reserved_until = null, updated_at = now() where id = v_pay.id;
end;
$$;

revoke all on function public.create_booking_intent(uuid, uuid, uuid, text) from public, anon;
revoke all on function public.create_enrollment_intent(uuid) from public, anon;
revoke all on function public.convert_paid_intent(text) from public, anon, authenticated;
revoke all on function public.release_intent(text) from public, anon, authenticated;
revoke all on function public.release_expired_reservations() from public, anon;

grant execute on function public.create_booking_intent(uuid, uuid, uuid, text) to authenticated;
grant execute on function public.create_enrollment_intent(uuid) to authenticated;
grant execute on function public.release_expired_reservations() to authenticated;
-- Conversion and release stay service-role only: they are the step that turns
-- money into an appointment, and nothing holding a user JWT may reach them.
