-- BigBlueButton classroom metadata. No access is granted to browser roles.
create table if not exists public.bbb_classroom_sessions (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null references public.schools(id),
  class_group_id uuid not null,
  teacher_id uuid not null,
  title text not null check (length(trim(title)) between 1 and 200),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled')),
  meeting_id text not null unique,
  recordings_published boolean not null default false,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at),
  unique (school_id,id),
  foreign key (school_id, class_group_id) references public.class_groups(school_id, id),
  foreign key (school_id, teacher_id) references public.teachers(school_id, id)
);
create index if not exists bbb_classroom_sessions_schedule_idx
  on public.bbb_classroom_sessions (school_id, starts_at desc);

create table if not exists public.bbb_classroom_participation (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  session_id uuid not null,
  participant_user_id uuid not null,
  joined_at timestamptz not null,
  left_at timestamptz,
  attendance_approved boolean not null default false,
  foreign key (school_id,session_id) references public.bbb_classroom_sessions(school_id,id) on delete cascade,
  check (left_at is null or left_at >= joined_at)
);
create index if not exists bbb_classroom_participation_session_idx
  on public.bbb_classroom_participation (school_id,session_id);

create table if not exists public.bbb_classroom_recordings (
  id uuid primary key default gen_random_uuid(),
  school_id uuid not null,
  session_id uuid not null,
  recording_id text not null,
  published boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (school_id,session_id) references public.bbb_classroom_sessions(school_id,id) on delete cascade,
  unique (school_id,recording_id)
);

alter table public.bbb_classroom_sessions enable row level security;
alter table public.bbb_classroom_sessions force row level security;
alter table public.bbb_classroom_participation enable row level security;
alter table public.bbb_classroom_participation force row level security;
alter table public.bbb_classroom_recordings enable row level security;
alter table public.bbb_classroom_recordings force row level security;
revoke all on public.bbb_classroom_sessions from anon, authenticated;
revoke all on public.bbb_classroom_participation from anon, authenticated;
revoke all on public.bbb_classroom_recordings from anon, authenticated;
-- No permissive RLS policies. Only trusted server orchestration may operate.
