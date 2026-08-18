-- Legacy Hub V11: announcements + notification read tracking
alter table public.announcements add column if not exists category text not null default 'general';
alter table public.announcements add column if not exists published_at timestamptz not null default now();
alter table public.announcements add column if not exists expires_at timestamptz;

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements(id) on delete cascade,
  member_id uuid not null references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, member_id)
);
alter table public.announcement_reads enable row level security;

-- Policies are installed in the connected Supabase project by ChatGPT.
