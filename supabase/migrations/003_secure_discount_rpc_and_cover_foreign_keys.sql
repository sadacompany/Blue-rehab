-- Keep discount application behind the trusted server boundary and cover the
-- foreign keys reported by Supabase database advisors.
--
-- Every object touched here (`apply_payment_discount`, `payment_webhook_events`,
-- `attendance_records.course_session_id`) was created directly in the Supabase
-- dashboard and never captured in a migration file — see docs/APP_REVIEW.md
-- finding #4. On a database rebuilt from these files alone, none of them exist
-- and the original unguarded statements aborted the whole migration run.
--
-- Each block is therefore conditional: it hardens the object where it exists and
-- is a no-op where it does not, so this file is safe on both the legacy project
-- and a fresh one. Once the missing objects are captured in a real migration,
-- these guards become permanently true and can be dropped.

do $$
begin
  if to_regprocedure('public.apply_payment_discount(uuid, text)') is not null then
    execute 'revoke execute on function public.apply_payment_discount(uuid, text) from public, anon, authenticated';
    execute 'grant execute on function public.apply_payment_discount(uuid, text) to service_role';
  else
    raise notice 'apply_payment_discount() absent — discount hardening skipped';
  end if;
end $$;

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'attendance_records'
       and column_name = 'course_session_id'
  ) then
    execute 'create index if not exists attendance_records_course_session_idx
               on public.attendance_records(course_session_id)
               where course_session_id is not null';
  else
    raise notice 'attendance_records.course_session_id absent — index skipped';
  end if;
end $$;

do $$
begin
  if to_regclass('public.payment_webhook_events') is not null then
    execute 'create index if not exists payment_webhook_events_payment_idx
               on public.payment_webhook_events(payment_id)
               where payment_id is not null';
  else
    raise notice 'payment_webhook_events absent — index skipped';
  end if;
end $$;
