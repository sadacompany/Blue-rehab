-- Initial schema.
--
-- Statements are guarded so the file can be replayed against a database that
-- already has some of these objects. The original used bare `create type` /
-- `create policy`, which aborted the whole run on re-apply and made it
-- impossible to rebuild an environment from the migration files
-- (docs/APP_REVIEW.md finding #4). Definitions are unchanged.

create extension if not exists "pgcrypto";

do $$
begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'user_role') then
    create type public.user_role as enum ('patient','student','specialist','trainer','receptionist','admin');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'booking_status') then
    create type public.booking_status as enum ('draft','pending_payment','confirmed','rescheduled','cancelled','completed','no_show','refunded');
  end if;
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid = t.typnamespace
                  where n.nspname = 'public' and t.typname = 'delivery_mode') then
    create type public.delivery_mode as enum ('remote','clinic');
  end if;
end $$;

create table if not exists public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null,phone text,avatar_url text,roles user_role[] not null default '{}',created_at timestamptz not null default now());
create table if not exists public.specialists(id uuid primary key default gen_random_uuid(),profile_id uuid unique not null references public.profiles(id),title text not null,bio text,years_experience int not null default 0,is_verified boolean not null default false,rating numeric(2,1) not null default 0,created_at timestamptz not null default now());
create table if not exists public.services(id uuid primary key default gen_random_uuid(),name text not null,description text,duration_minutes int not null check(duration_minutes>0),price numeric(10,2) not null check(price>=0),is_active boolean not null default true);
create table if not exists public.branches(id uuid primary key default gen_random_uuid(),name text not null,city text not null,address text,latitude numeric,longitude numeric,is_active boolean not null default true);
create table if not exists public.bookings(id uuid primary key default gen_random_uuid(),patient_id uuid not null references public.profiles(id),specialist_id uuid not null references public.specialists(id),service_id uuid not null references public.services(id),branch_id uuid references public.branches(id),starts_at timestamptz not null,ends_at timestamptz,mode delivery_mode not null,status booking_status not null default 'draft',total numeric(10,2),created_at timestamptz not null default now());
create table if not exists public.courses(id uuid primary key default gen_random_uuid(),title text not null,slug text unique not null,description text,trainer_id uuid references public.profiles(id),starts_at timestamptz,ends_at timestamptz,capacity int,price numeric(10,2) not null default 0,is_published boolean not null default false,created_at timestamptz not null default now());
create table if not exists public.enrollments(id uuid primary key default gen_random_uuid(),student_id uuid not null references public.profiles(id),course_id uuid not null references public.courses(id),progress int not null default 0 check(progress between 0 and 100),completed_at timestamptz,created_at timestamptz not null default now(),unique(student_id,course_id));

alter table public.profiles enable row level security;
alter table public.specialists enable row level security;
alter table public.bookings enable row level security;
alter table public.courses enable row level security;
alter table public.enrollments enable row level security;

drop policy if exists "own profile" on public.profiles;
create policy "own profile" on public.profiles for select using(auth.uid()=id);
drop policy if exists "public verified specialists" on public.specialists;
create policy "public verified specialists" on public.specialists for select using(is_verified=true);
drop policy if exists "patient reads own bookings" on public.bookings;
create policy "patient reads own bookings" on public.bookings for select using(auth.uid()=patient_id);
drop policy if exists "public published courses" on public.courses;
create policy "public published courses" on public.courses for select using(is_published=true);
drop policy if exists "student reads own enrollments" on public.enrollments;
create policy "student reads own enrollments" on public.enrollments for select using(auth.uid()=student_id);
