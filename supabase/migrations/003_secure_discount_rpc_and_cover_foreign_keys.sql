-- Keep discount application behind the trusted server boundary and cover the
-- foreign keys reported by Supabase database advisors.

revoke execute on function public.apply_payment_discount(uuid, text)
from public, anon, authenticated;

grant execute on function public.apply_payment_discount(uuid, text)
to service_role;

create index if not exists attendance_records_course_session_idx
  on public.attendance_records(course_session_id)
  where course_session_id is not null;

create index if not exists payment_webhook_events_payment_idx
  on public.payment_webhook_events(payment_id)
  where payment_id is not null;
