-- Support / contact requests.
--
-- The table was created directly in the Supabase dashboard on the original
-- project and never captured in a migration, so 20260802201000 — which adds the
-- public insert policy — referenced a relation that does not exist on a database
-- rebuilt from these files. This restores the definition the app expects
-- (client/src/lib/platform.ts `createSupportRequest`).

create table if not exists public.support_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  name text not null,
  email text,
  phone text,
  subject text not null,
  message text not null,
  status text not null default 'new' check (status in ('new','in_progress','resolved','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists support_requests_user_idx
  on public.support_requests(user_id) where user_id is not null;
create index if not exists support_requests_status_idx
  on public.support_requests(status, created_at desc);

alter table public.support_requests enable row level security;

grant insert on public.support_requests to anon, authenticated;
grant select on public.support_requests to authenticated;

-- A signed-in user can see the requests they filed. Anonymous submissions have
-- no owner and are readable only by staff tooling via the service role.
drop policy if exists "support_requests_own_read" on public.support_requests;
create policy "support_requests_own_read" on public.support_requests
  for select to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "support_requests_admin_read" on public.support_requests;
create policy "support_requests_admin_read" on public.support_requests
  for select to authenticated
  using (exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid()) and 'admin' = any(p.roles)
  ));
