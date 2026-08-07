-- Give existing accounts a phone identity before real SMS sign-in is enabled.
--
-- Every account was created by the mock OTP path, which keys the user on a
-- synthetic email (`p<digits>@otp.blue-rehab.local`) and leaves `auth.users.phone`
-- null. Supabase resolves a phone sign-in by matching that column, so switching
-- VITE_AUTH_MODE to `sms` without this would not have signed anyone in — it
-- would have created a *second*, empty account for the same person. The
-- administrator would have lost their role, and every existing booking, payment
-- and treatment plan would have stayed attached to an account nobody could reach.
--
-- Copies the number the profile already holds, and marks it confirmed: these
-- users demonstrably control the number, having signed in with it already.
-- Rows whose profile phone is not a valid Saudi E.164 number are skipped —
-- testing produced a couple with free text in the field.

-- GoTrue stores the number WITHOUT the leading '+' and normalises incoming
-- sign-in requests the same way, so a value copied straight from `profiles`
-- (which keeps the '+') never matches and the lookup silently falls through to
-- "signups not allowed".
update auth.users u
   set phone = ltrim(p.phone, '+'),
       phone_confirmed_at = coalesce(u.phone_confirmed_at, now()),
       updated_at = now()
  from public.profiles p
 where p.id = u.id
   and (u.phone is null or u.phone like '+%')
   and p.phone ~ '^\+9665[0-9]{8}$'
   -- Never collide with a number some other account already claims.
   and not exists (
     select 1 from auth.users other
      where other.phone = ltrim(p.phone, '+') and other.id <> u.id
   );

-- `handle_new_user` reads the phone from signup metadata, which real SMS signup
-- does not supply — the number lives on the auth row itself. Fall back to it so
-- a profile created by phone sign-in is not left without a number.
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
