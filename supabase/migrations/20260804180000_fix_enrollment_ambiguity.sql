-- Fix `create_enrollment_with_payment`: course enrolment never worked.
--
-- The function declares OUT parameters named `status`, `order_number`,
-- `enrollment_id` and `amount`. Inside the body, unqualified references to the
-- same-named *columns* are ambiguous, and PostgreSQL raises
--   42702: column reference "status" is ambiguous
-- The first such reference sits in the capacity check, so any course with a
-- non-null `capacity` — which every seeded course has — failed with a 500 the
-- moment a student pressed enrol. Bookings were unaffected because that
-- function's OUT names happen never to collide with an unqualified column.
--
-- Fixed by aliasing every table and qualifying the column references. Behaviour
-- and the returned column names are unchanged, so the client needs no edit.

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

  select * into v_course
    from public.courses c
   where c.id = p_course_id and c.is_published;
  if not found then
    raise exception 'COURSE_UNAVAILABLE';
  end if;

  -- Already enrolled: return the existing record rather than duplicating.
  select * into v_existing
    from public.enrollments e
   where e.student_id = v_user and e.course_id = p_course_id;
  if found then
    select p.order_number into v_order
      from public.payments p
     where p.enrollment_id = v_existing.id
     order by p.created_at desc
     limit 1;
    return query
      select v_existing.id, v_order, v_existing.amount_due, 'SAR'::text, v_existing.status;
    return;
  end if;

  if v_course.capacity is not null then
    select count(*) into v_seats
      from public.enrollments e
     where e.course_id = p_course_id and e.status <> 'cancelled';
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

  return query
    select v_enrollment_id, v_order, v_course.price, 'SAR'::text, 'pending_payment'::text;
end;
$$;

revoke all on function public.create_enrollment_with_payment(uuid) from public, anon;
grant execute on function public.create_enrollment_with_payment(uuid) to authenticated;
