-- A free course enrols directly — no payment step to send anyone through.
--
-- create_enrollment_intent() always created a `payments` row and handed the
-- client an order number to check out, even at a price of zero. The booking
-- page then sent the visitor straight to the Moyasar-hosted page for a 0 SAR
-- charge, which is friction a free course should never impose.
--
-- The free path skips payments entirely and inserts the enrollment as
-- 'active' immediately — the same status convert_paid_intent() sets once a
-- real payment clears, so course-content access (loadLessonAccess reads
-- exactly this column) works identically either way. The function still
-- returns its four columns; order_number is null when there was nothing to
-- pay, which is what the client checks to skip the checkout redirect.

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
  v_enrollment_id uuid;
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

  if v_course.price <= 0 then
    insert into public.enrollments (student_id, course_id, status, amount_due)
    values (v_user, p_course_id, 'active', 0)
    returning id into v_enrollment_id;

    insert into public.notifications (user_id, channel, event_type, title, body, data)
    values (v_user, 'in_app', 'enrollment_confirmed', 'تم تسجيلك في الدورة',
            'الدورة مجانية، وتسجيلك مُفعَّل مباشرة.',
            jsonb_build_object('enrollment_id', v_enrollment_id, 'course_id', p_course_id));

    return query select null::text, 0::numeric, 'SAR'::text, v_course.title;
    return;
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

revoke all on function public.create_enrollment_intent(uuid) from public, anon;
grant execute on function public.create_enrollment_intent(uuid) to authenticated;
