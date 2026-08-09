-- The CV upload policy could never pass.
--
-- `training_cv_insert` checked the folder against `training_applications`, but
-- that table has row level security and the anonymous role has no read policy on
-- it — deliberately, since the register is administration's alone. So the
-- `exists (...)` inside the storage policy always evaluated false and every
-- upload was refused with "new row violates row-level security policy".
--
-- The check has to run with the privilege to see the row it is checking, which
-- is what SECURITY DEFINER is for. The function answers one narrow question and
-- returns a boolean, so it leaks nothing: given a folder name, may something be
-- written into it right now?

create or replace function public.training_folder_open(p_folder text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- The folder name comes from a storage path and is not necessarily a uuid.
  begin
    v_id := p_folder::uuid;
  exception when others then
    return false;
  end;

  return exists (
    select 1 from public.training_applications t
     where t.id = v_id
       and t.created_at > now() - interval '1 hour'
  );
end;
$$;

revoke all on function public.training_folder_open(text) from public;
grant execute on function public.training_folder_open(text) to anon, authenticated;

drop policy if exists "training_cv_insert" on storage.objects;
create policy "training_cv_insert" on storage.objects
  for insert to anon, authenticated
  with check (
    bucket_id = 'training-cv'
    and public.training_folder_open((storage.foldername(name))[1])
  );
