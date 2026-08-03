-- Blue Rehab comprehensive domain schema.
-- Apply after 001_initial_schema.sql.

do $$ begin
  create type public.course_mode as enum ('onsite','remote','recorded','hybrid');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.payment_status as enum ('pending','processing','succeeded','failed','cancelled','partially_refunded','refunded');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.review_status as enum ('pending','published','rejected','hidden');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.notification_channel as enum ('in_app','sms','email','whatsapp');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.attendance_status as enum ('scheduled','present','absent','excused');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.exercise_log_status as enum ('pending','completed','skipped');
exception when duplicate_object then null; end $$;

alter type public.booking_status add value if not exists 'awaiting_approval';

alter table public.profiles
  add column if not exists updated_at timestamptz not null default now();

alter table public.specialists
  alter column profile_id drop not null,
  add column if not exists display_name text not null default 'ملف غير مكتمل',
  add column if not exists specialties text[] not null default '{}',
  add column if not exists languages text[] not null default array['العربية'],
  add column if not exists review_count integer not null default 0 check (review_count >= 0),
  add column if not exists is_demo boolean not null default false;

alter table public.services
  add column if not exists allowed_modes public.delivery_mode[] not null default array['clinic'::public.delivery_mode],
  add column if not exists is_demo boolean not null default false;

alter table public.branches
  add column if not exists is_demo boolean not null default false;

alter table public.bookings
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.courses
  add column if not exists summary text,
  add column if not exists duration_hours integer not null default 1 check (duration_hours > 0),
  add column if not exists mode public.course_mode not null default 'onsite',
  add column if not exists level text not null default 'مبتدئ',
  add column if not exists is_demo boolean not null default false,
  add column if not exists learning_outcomes text[] not null default '{}',
  add column if not exists prerequisites text[] not null default '{}',
  add column if not exists language text not null default 'العربية',
  add column if not exists certificate_available boolean not null default false;

create table if not exists public.treatment_plans (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references public.profiles(id) on delete cascade,
  specialist_id uuid not null references public.specialists(id),
  diagnosis_summary text,
  goals text[] not null default '{}',
  proposed_sessions integer check (proposed_sessions > 0),
  duration_weeks integer check (duration_weeks > 0),
  safety_instructions text,
  precautions text,
  progress_indicators text[] not null default '{}',
  review_at timestamptz,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  treatment_plan_id uuid not null references public.treatment_plans(id) on delete cascade,
  name text not null,
  description text,
  media_url text,
  repetitions text,
  schedule_text text,
  safety_instructions text,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.patient_health_profiles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  gender text,
  birth_date date,
  city text,
  emergency_contact jsonb,
  complaint text,
  affected_region text,
  symptoms_started_on date,
  pain_level smallint check (pain_level between 0 and 10),
  previous_injuries text,
  previous_surgeries text,
  chronic_conditions text,
  current_medications text,
  treatment_goal text,
  consent_privacy boolean not null default false,
  consent_share_with_specialist boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.availability_slots (
  id uuid primary key default gen_random_uuid(),
  specialist_id uuid not null references public.specialists(id) on delete cascade,
  branch_id uuid references public.branches(id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  mode public.delivery_mode not null,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table if not exists public.session_notes (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null unique references public.bookings(id) on delete cascade,
  specialist_id uuid not null references public.specialists(id),
  assessment text,
  interventions text,
  response text,
  recommendations text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  patient_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_for date not null,
  status public.exercise_log_status not null default 'pending',
  pain_before smallint check (pain_before between 0 and 10),
  pain_after smallint check (pain_after between 0 and 10),
  note text,
  media_path text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (exercise_id, patient_id, scheduled_for)
);

create table if not exists public.course_modules (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  title text not null,
  summary text,
  position integer not null,
  available_at timestamptz,
  created_at timestamptz not null default now(),
  unique (course_id, position)
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  module_id uuid not null references public.course_modules(id) on delete cascade,
  title text not null,
  content_type text not null check (content_type in ('video','pdf','presentation','link','quiz','assignment','text')),
  content_url text,
  duration_minutes integer check (duration_minutes > 0),
  position integer not null,
  is_preview boolean not null default false,
  requires_previous boolean not null default false,
  available_at timestamptz,
  created_at timestamptz not null default now(),
  unique (module_id, position)
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references public.course_lessons(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  progress smallint not null default 0 check (progress between 0 and 100),
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (lesson_id, student_id)
);

create table if not exists public.attendance_records (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null references public.enrollments(id) on delete cascade,
  session_title text not null,
  starts_at timestamptz not null,
  status public.attendance_status not null default 'scheduled',
  checked_in_at timestamptz,
  note text,
  created_at timestamptz not null default now()
);

create table if not exists public.certificates (
  id uuid primary key default gen_random_uuid(),
  enrollment_id uuid not null unique references public.enrollments(id) on delete cascade,
  certificate_number text not null unique,
  file_path text,
  issued_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique,
  user_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  enrollment_id uuid references public.enrollments(id),
  amount numeric(10,2) not null check (amount >= 0),
  discount numeric(10,2) not null default 0 check (discount >= 0),
  tax numeric(10,2) not null default 0 check (tax >= 0),
  fees numeric(10,2) not null default 0 check (fees >= 0),
  status public.payment_status not null default 'pending',
  gateway_reference text,
  refunded_amount numeric(10,2) not null default 0 check (refunded_amount >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((booking_id is not null) <> (enrollment_id is not null)),
  check (refunded_amount <= amount + tax + fees - discount)
);

create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id),
  booking_id uuid references public.bookings(id),
  enrollment_id uuid references public.enrollments(id),
  specialist_id uuid references public.specialists(id),
  course_id uuid references public.courses(id),
  rating smallint not null check (rating between 1 and 5),
  dimensions jsonb not null default '{}',
  comment text,
  response text,
  status public.review_status not null default 'pending',
  created_at timestamptz not null default now(),
  published_at timestamptz,
  check ((booking_id is not null) <> (enrollment_id is not null))
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  channel public.notification_channel not null default 'in_app',
  event_type text not null,
  title text not null,
  body text not null,
  data jsonb not null default '{}',
  read_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.medical_files (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  storage_path text not null unique,
  file_name text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes > 0),
  category text not null default 'report',
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id text,
  old_values jsonb,
  new_values jsonb,
  created_at timestamptz not null default now()
);

create index if not exists bookings_patient_starts_idx on public.bookings(patient_id, starts_at desc);
create index if not exists bookings_specialist_starts_idx on public.bookings(specialist_id, starts_at desc);
create index if not exists bookings_status_idx on public.bookings(status);
create index if not exists availability_specialist_time_idx on public.availability_slots(specialist_id, starts_at) where is_available;
create index if not exists treatment_plans_patient_idx on public.treatment_plans(patient_id);
create index if not exists treatment_plans_specialist_idx on public.treatment_plans(specialist_id);
create index if not exists exercises_plan_idx on public.exercises(treatment_plan_id, position);
create index if not exists exercise_logs_patient_date_idx on public.exercise_logs(patient_id, scheduled_for desc);
create index if not exists exercise_logs_exercise_idx on public.exercise_logs(exercise_id);
create index if not exists course_lessons_module_order_idx on public.course_lessons(module_id, position);
create index if not exists lesson_progress_student_idx on public.lesson_progress(student_id);
create index if not exists attendance_enrollment_idx on public.attendance_records(enrollment_id);
create index if not exists payments_user_date_idx on public.payments(user_id, created_at desc);
create index if not exists payments_booking_idx on public.payments(booking_id) where booking_id is not null;
create index if not exists payments_enrollment_idx on public.payments(enrollment_id) where enrollment_id is not null;
create index if not exists reviews_user_idx on public.reviews(user_id);
create index if not exists reviews_specialist_published_idx on public.reviews(specialist_id, published_at desc) where status = 'published';
create index if not exists reviews_course_published_idx on public.reviews(course_id, published_at desc) where status = 'published';
create index if not exists notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists medical_files_owner_idx on public.medical_files(owner_id);
create index if not exists audit_logs_actor_date_idx on public.audit_logs(actor_id, created_at desc);

alter table public.services enable row level security;
alter table public.branches enable row level security;
alter table public.treatment_plans enable row level security;
alter table public.exercises enable row level security;
alter table public.patient_health_profiles enable row level security;
alter table public.availability_slots enable row level security;
alter table public.session_notes enable row level security;
alter table public.exercise_logs enable row level security;
alter table public.course_modules enable row level security;
alter table public.course_lessons enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.attendance_records enable row level security;
alter table public.certificates enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.notifications enable row level security;
alter table public.medical_files enable row level security;
alter table public.audit_logs enable row level security;

drop policy if exists "own profile" on public.profiles;
drop policy if exists "profiles_read_own" on public.profiles;
create policy "profiles_read_own" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "public verified specialists" on public.specialists;
drop policy if exists "specialists_catalog_read" on public.specialists;
create policy "specialists_catalog_read" on public.specialists for select to anon, authenticated using (is_verified or is_demo);
drop policy if exists "active_services_public" on public.services;
create policy "active_services_public" on public.services for select to anon, authenticated using (is_active);
drop policy if exists "active_branches_public" on public.branches;
create policy "active_branches_public" on public.branches for select to anon, authenticated using (is_active);

drop policy if exists "patient reads own bookings" on public.bookings;
create policy "bookings_patient_read" on public.bookings for select to authenticated using ((select auth.uid()) = patient_id);
create policy "bookings_specialist_read" on public.bookings for select to authenticated using (exists (select 1 from public.specialists s where s.id = bookings.specialist_id and s.profile_id = (select auth.uid())));

drop policy if exists "public published courses" on public.courses;
create policy "published_courses_public" on public.courses for select to anon, authenticated using (is_published);
drop policy if exists "student reads own enrollments" on public.enrollments;
create policy "enrollments_student_read" on public.enrollments for select to authenticated using ((select auth.uid()) = student_id);

create policy "health_profile_own_all" on public.patient_health_profiles for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "availability_public_read" on public.availability_slots for select to anon, authenticated using (is_available and starts_at > now());
create policy "treatment_plans_patient_read" on public.treatment_plans for select to authenticated using ((select auth.uid()) = patient_id);
create policy "treatment_plans_specialist_all" on public.treatment_plans for all to authenticated using (exists (select 1 from public.specialists s where s.id = treatment_plans.specialist_id and s.profile_id = (select auth.uid()))) with check (exists (select 1 from public.specialists s where s.id = treatment_plans.specialist_id and s.profile_id = (select auth.uid())));
create policy "exercises_patient_read" on public.exercises for select to authenticated using (exists (select 1 from public.treatment_plans p where p.id = exercises.treatment_plan_id and p.patient_id = (select auth.uid()) and p.is_published));
create policy "exercise_logs_patient_all" on public.exercise_logs for all to authenticated using ((select auth.uid()) = patient_id) with check ((select auth.uid()) = patient_id);
create policy "session_notes_patient_read" on public.session_notes for select to authenticated using (exists (select 1 from public.bookings b where b.id = session_notes.booking_id and b.patient_id = (select auth.uid())));
create policy "session_notes_specialist_all" on public.session_notes for all to authenticated using (exists (select 1 from public.specialists s where s.id = session_notes.specialist_id and s.profile_id = (select auth.uid()))) with check (exists (select 1 from public.specialists s where s.id = session_notes.specialist_id and s.profile_id = (select auth.uid())));

create policy "published_modules_read" on public.course_modules for select to anon, authenticated using (exists (select 1 from public.courses c where c.id = course_modules.course_id and c.is_published));
create policy "preview_lessons_read" on public.course_lessons for select to anon using (is_preview and exists (select 1 from public.course_modules m join public.courses c on c.id = m.course_id where m.id = course_lessons.module_id and c.is_published));
create policy "course_lessons_authenticated_read" on public.course_lessons for select to authenticated using (exists (select 1 from public.course_modules m join public.enrollments e on e.course_id = m.course_id where m.id = course_lessons.module_id and e.student_id = (select auth.uid())));
create policy "lesson_progress_own_all" on public.lesson_progress for all to authenticated using ((select auth.uid()) = student_id) with check ((select auth.uid()) = student_id);
create policy "attendance_student_read" on public.attendance_records for select to authenticated using (exists (select 1 from public.enrollments e where e.id = attendance_records.enrollment_id and e.student_id = (select auth.uid())));
create policy "certificates_student_read" on public.certificates for select to authenticated using (exists (select 1 from public.enrollments e where e.id = certificates.enrollment_id and e.student_id = (select auth.uid())));
create policy "payments_own_read" on public.payments for select to authenticated using ((select auth.uid()) = user_id);
create policy "reviews_published_read" on public.reviews for select to anon, authenticated using (status = 'published');
create policy "reviews_own_insert" on public.reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "notifications_own_read" on public.notifications for select to authenticated using ((select auth.uid()) = user_id);
create policy "notifications_own_update" on public.notifications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "medical_files_owner_all" on public.medical_files for all to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy "audit_logs_admin_read" on public.audit_logs for select to authenticated using (exists (select 1 from public.profiles p where p.id = (select auth.uid()) and 'admin' = any(p.roles)));

grant usage on schema public to anon, authenticated;
grant select on public.services, public.branches, public.specialists, public.courses, public.course_modules, public.course_lessons, public.availability_slots, public.reviews to anon, authenticated;
grant select on public.profiles, public.bookings, public.enrollments, public.treatment_plans, public.exercises, public.patient_health_profiles, public.session_notes, public.exercise_logs, public.lesson_progress, public.attendance_records, public.certificates, public.payments, public.notifications, public.medical_files, public.audit_logs to authenticated;
grant insert, update on public.patient_health_profiles, public.exercise_logs, public.lesson_progress to authenticated;
grant insert on public.reviews to authenticated;
grant update (read_at) on public.notifications to authenticated;
revoke update on table public.profiles from authenticated;
grant update (full_name, phone, avatar_url, updated_at) on table public.profiles to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('medical-files', 'medical-files', false, 20971520, array['application/pdf','image/jpeg','image/png','image/webp']),
  ('course-materials', 'course-materials', false, 52428800, array['application/pdf','image/jpeg','image/png','video/mp4','application/vnd.ms-powerpoint','application/vnd.openxmlformats-officedocument.presentationml.presentation'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy "medical_storage_owner_read" on storage.objects for select to authenticated using (bucket_id = 'medical-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "medical_storage_owner_insert" on storage.objects for insert to authenticated with check (bucket_id = 'medical-files' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "medical_storage_owner_delete" on storage.objects for delete to authenticated using (bucket_id = 'medical-files' and (storage.foldername(name))[1] = (select auth.uid())::text);

insert into public.services (name, description, duration_minutes, price, allowed_modes, is_active, is_demo)
select * from (values
  ('جلسة متابعة عن بُعد','مراجعة الالتزام والتغير في الأعراض وأداء التمارين، مع تعديل التعليمات عندما تسمح طبيعة الحالة بالمتابعة المرئية.',30,150.00,array['remote'::public.delivery_mode],true,true),
  ('جلسة علاج طبيعي','تنفيذ التدخلات المحددة في الخطة، وتسجيل الاستجابة، وتحديث التمارين والتعليمات وفق نتائج الجلسة.',45,200.00,array['clinic'::public.delivery_mode],true,true),
  ('جلسة تشخيص أولية','مراجعة التاريخ الصحي والأعراض، وفحص الحركة والوظيفة ضمن نطاق العلاج الطبيعي، ثم توثيق الانطباع السريري والخطوات المقترحة.',60,250.00,array['clinic'::public.delivery_mode,'remote'::public.delivery_mode],true,true)
) as seed(name, description, duration_minutes, price, allowed_modes, is_active, is_demo)
where not exists (select 1 from public.services);

insert into public.specialists (display_name, title, bio, years_experience, specialties, languages, is_verified, rating, review_count, is_demo)
select * from (values
  ('ملف تجريبي — التأهيل الرياضي','أخصائية إصابات رياضية وتأهيل','نموذج لملف مقدم خدمة في تقييم إصابات النشاط الحركي وبناء التدرج التأهيلي. لا يمثل مختصاً منشوراً.',0,array['إصابات رياضية','تأهيل الركبة'],array['العربية'],false,0,0,true),
  ('ملف تجريبي — العظام والمفاصل','أخصائي تأهيل العظام والمفاصل','نموذج لملف مقدم خدمة في برامج ما بعد الإجراءات الجراحية وحالات العظام والمفاصل. لا يمثل مختصاً منشوراً.',0,array['العظام','المفاصل'],array['العربية'],false,0,0,true),
  ('ملف تجريبي — التأهيل العصبي','أخصائية علاج طبيعي عصبي','نموذج لملف مقدم خدمة في التأهيل العصبي الوظيفي. لا يمثل مختصاً منشوراً.',0,array['التأهيل العصبي'],array['العربية'],false,0,0,true)
) as seed(display_name, title, bio, years_experience, specialties, languages, is_verified, rating, review_count, is_demo)
where not exists (select 1 from public.specialists);

insert into public.courses (title, slug, summary, description, duration_hours, capacity, price, mode, level, is_published, is_demo, learning_outcomes, prerequisites, language, certificate_available)
values
  ('التأهيل المتقدم لإصابات الركبة','advanced-knee-rehab','تطبيقات عملية لتقييم وتأهيل إصابات الركبة.','برنامج تطبيقي يشرح بناء مسار تأهيلي متدرج لإصابات الركبة، من قراءة مؤشرات الفحص إلى اختيار الجرعة التدريبية ومراجعة معايير العودة للنشاط.',12,24,690,'onsite','متوسط',true,true,array['تمييز مراحل التأهيل بعد إصابات الركبة','بناء تدرج آمن للتمارين','متابعة مؤشرات العودة للنشاط'],array['طالب أو ممارس في تخصص صحي ذي صلة'],'العربية',true),
  ('أساسيات العلاج اليدوي السريري','clinical-manual-therapy','مدخل عملي آمن لمهارات العلاج اليدوي.','مدخل منظم إلى التفكير السريري المصاحب للتقنيات اليدوية، مع التركيز على الفحص واختيار التدخل وقياس الاستجابة وحدود الممارسة الآمنة.',16,20,850,'hybrid','مبتدئ',true,true,array['فهم مبادئ الفحص السريري','تطبيق تقنيات يدوية أساسية ضمن نطاق الممارسة','توثيق الاستجابة السريرية'],array['طالب أو ممارس في تخصص صحي ذي صلة'],'العربية',true),
  ('قراءة وتحليل الحركة الوظيفية','functional-movement-analysis','أسس الملاحظة والتحليل وصناعة القرار السريري.','برنامج يربط الملاحظة المنظمة باختبارات الحركة الوظيفية، ويحوّل النتائج إلى فرضيات قابلة للفحص وخطة متابعة موثقة.',8,30,420,'remote','متقدم',true,true,array['ملاحظة أنماط الحركة','ربط الملاحظة بالاختبار الوظيفي','صياغة خطة قياس قابلة للمتابعة'],array['طالب أو ممارس في تخصص صحي ذي صلة'],'العربية',true)
on conflict (slug) do update set summary = excluded.summary, description = excluded.description, learning_outcomes = excluded.learning_outcomes, prerequisites = excluded.prerequisites, is_demo = true;

insert into public.branches (name, city, address, is_active, is_demo)
select 'فرع تجريبي — يحدد قبل الإطلاق','الرياض',null,true,true
where not exists (select 1 from public.branches);

insert into public.course_modules (course_id, title, summary, position)
select c.id, seed.title, seed.summary, seed.position
from public.courses c
cross join (values
  ('التقييم وبناء خط الأساس','جمع المعلومات وترتيب مؤشرات الفحص قبل اختيار التدخل.',1),
  ('اختيار التدرج والجرعة','تحويل الهدف إلى تدرج يمكن قياسه وتعديله.',2),
  ('التوثيق والمراجعة','قياس الاستجابة وتوثيق سبب الاستمرار أو التعديل.',3)
) as seed(title, summary, position)
where c.slug = 'advanced-knee-rehab'
on conflict (course_id, position) do update set title = excluded.title, summary = excluded.summary;
