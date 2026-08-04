-- Specialist dashboard access.
--
-- 002_comprehensive_platform.sql created every clinical table a specialist needs
-- and gave them RLS on `treatment_plans` and `session_notes` — but nothing else.
-- A specialist could read their bookings and yet could not see the patient's
-- name, could not read the health profile behind a case, and could not write the
-- `exercises` that hang off a treatment plan they own. This closes those gaps.
--
-- Scoping rule, applied uniformly: access is granted only through
--   `public.specialists s where s.profile_id = auth.uid()`
-- so a specialist reaches a patient's data only via a record that is already
-- theirs (a booking, or a treatment plan they authored).

-- ------------------------------------------------------------- own identity --
-- `specialists_catalog_read` requires `is_verified or is_demo`, so a specialist
-- pending verification cannot read the very row that identifies them. Without
-- this they cannot resolve their own specialist_id and the dashboard is blank.
drop policy if exists "specialists_read_own" on public.specialists;
create policy "specialists_read_own" on public.specialists
  for select to authenticated
  using (profile_id = (select auth.uid()));

-- ------------------------------------------------------------ patient names --
-- Limited to patients who actually hold a booking with this specialist.
drop policy if exists "profiles_specialist_read_patients" on public.profiles;
create policy "profiles_specialist_read_patients" on public.profiles
  for select to authenticated
  using (exists (
    select 1
      from public.bookings b
      join public.specialists s on s.id = b.specialist_id
     where b.patient_id = profiles.id
       and s.profile_id = (select auth.uid())
  ));

-- ---------------------------------------------------------- health profiles --
-- Gated on the consent flag the intake form already collects. A booking alone is
-- not sufficient: the patient must have agreed to share with their specialist.
drop policy if exists "health_profile_specialist_read" on public.patient_health_profiles;
create policy "health_profile_specialist_read" on public.patient_health_profiles
  for select to authenticated
  using (
    consent_share_with_specialist
    and exists (
      select 1
        from public.bookings b
        join public.specialists s on s.id = b.specialist_id
       where b.patient_id = patient_health_profiles.user_id
         and s.profile_id = (select auth.uid())
    )
  );

-- ---------------------------------------------------------------- exercises --
-- `exercises_patient_read` let patients read published exercises but no policy
-- ever let the specialist create them, so treatment plans could not be filled in.
drop policy if exists "exercises_specialist_all" on public.exercises;
create policy "exercises_specialist_all" on public.exercises
  for all to authenticated
  using (exists (
    select 1
      from public.treatment_plans p
      join public.specialists s on s.id = p.specialist_id
     where p.id = exercises.treatment_plan_id
       and s.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1
      from public.treatment_plans p
      join public.specialists s on s.id = p.specialist_id
     where p.id = exercises.treatment_plan_id
       and s.profile_id = (select auth.uid())
  ));

-- ------------------------------------------------------------ exercise logs --
-- Read-only: adherence and pain scores are the patient's own record. The
-- specialist observes them, never edits them.
drop policy if exists "exercise_logs_specialist_read" on public.exercise_logs;
create policy "exercise_logs_specialist_read" on public.exercise_logs
  for select to authenticated
  using (exists (
    select 1
      from public.exercises e
      join public.treatment_plans p on p.id = e.treatment_plan_id
      join public.specialists s on s.id = p.specialist_id
     where e.id = exercise_logs.exercise_id
       and s.profile_id = (select auth.uid())
  ));

-- ------------------------------------------------------- availability slots --
-- A specialist owns their own calendar.
drop policy if exists "availability_specialist_all" on public.availability_slots;
create policy "availability_specialist_all" on public.availability_slots
  for all to authenticated
  using (exists (
    select 1 from public.specialists s
     where s.id = availability_slots.specialist_id
       and s.profile_id = (select auth.uid())
  ))
  with check (exists (
    select 1 from public.specialists s
     where s.id = availability_slots.specialist_id
       and s.profile_id = (select auth.uid())
  ));

-- ------------------------------------------------------ booking transitions --
-- 20260804120000 deliberately revoked UPDATE on `bookings` from `authenticated`
-- so a patient could not re-price or self-confirm. That also stopped specialists
-- marking attendance. Rather than reopening the column grant, transitions go
-- through a SECURITY DEFINER function that pins both the actor and the allowed
-- target states — consistent with how booking creation is handled.
create or replace function public.specialist_set_booking_status(
  p_booking_id uuid,
  p_status public.booking_status
)
returns public.booking_status
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.bookings%rowtype;
begin
  if (select auth.uid()) is null then
    raise exception 'AUTH_REQUIRED' using errcode = '28000';
  end if;

  -- Attendance outcomes only. Cancellation and refunds are a separate flow with
  -- money implications; confirmation belongs to the verified-payment path.
  if p_status not in ('completed', 'no_show') then
    raise exception 'STATUS_NOT_ALLOWED';
  end if;

  select b.* into v_booking
    from public.bookings b
    join public.specialists s on s.id = b.specialist_id
   where b.id = p_booking_id
     and s.profile_id = (select auth.uid())
   for update of b;

  if not found then
    raise exception 'BOOKING_NOT_FOUND';
  end if;

  -- Only a paid, confirmed session can be attended.
  if v_booking.status <> 'confirmed' then
    raise exception 'STATUS_TRANSITION_INVALID';
  end if;

  update public.bookings
     set status = p_status, updated_at = now()
   where id = p_booking_id;

  insert into public.notifications (user_id, channel, event_type, title, body, data)
  values (
    v_booking.patient_id, 'in_app', 'booking_' || p_status,
    case p_status when 'completed' then 'تم إكمال جلستك' else 'تم تسجيل عدم الحضور' end,
    case p_status
      when 'completed' then 'سجّل الأخصائي إتمام الجلسة. يمكنك الاطلاع على الخطة العلاجية من حسابك.'
      else 'لم يتم تسجيل حضورك في الموعد المحدد. تواصل معنا لإعادة الجدولة.'
    end,
    jsonb_build_object('booking_id', p_booking_id)
  );

  return p_status;
end;
$$;

revoke all on function public.specialist_set_booking_status(uuid, public.booking_status) from public, anon;
grant execute on function public.specialist_set_booking_status(uuid, public.booking_status) to authenticated;
