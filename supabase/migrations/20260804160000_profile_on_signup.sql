-- Create a `profiles` row for every new auth user.
--
-- This trigger existed only in the original project's dashboard and was never
-- captured in a migration, so a database rebuilt from these files accepted
-- signups but never created the matching profile. Every downstream failure
-- followed from that: the portal showed no profile, and
-- `create_booking_with_payment` violated `bookings.patient_id -> profiles(id)`,
-- so booking failed after a successful login.
--
-- SECURITY DEFINER because the inserting role is `supabase_auth_admin`, which
-- has no rights on `public.profiles`.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, roles)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''), 'مستخدم بلو'),
    nullif(btrim(coalesce(new.raw_user_meta_data ->> 'phone', new.phone, '')), ''),
    case new.raw_user_meta_data ->> 'account_type'
      when 'student'    then array['student']::public.user_role[]
      when 'specialist' then array['specialist']::public.user_role[]
      else                   array['patient']::public.user_role[]
    end
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Backfill anyone who signed up before the trigger existed.
insert into public.profiles (id, full_name, phone, roles)
select
  u.id,
  coalesce(nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''), 'مستخدم بلو'),
  nullif(btrim(coalesce(u.raw_user_meta_data ->> 'phone', u.phone, '')), ''),
  array['patient']::public.user_role[]
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id);
