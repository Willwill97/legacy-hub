-- Legacy Hub V12: battle reminder read tracking
create table if not exists public.battle_reminder_reads (
  member_id uuid not null references public.profiles(id) on delete cascade,
  battle_id uuid not null references public.battles(id) on delete cascade,
  reminder_type text not null check (reminder_type in ('24h','1h')),
  read_at timestamptz not null default now(),
  primary key(member_id,battle_id,reminder_type)
);
alter table public.battle_reminder_reads enable row level security;
create policy battle_reminder_reads_select on public.battle_reminder_reads for select using (member_id=auth.uid());
create policy battle_reminder_reads_insert on public.battle_reminder_reads for insert with check (member_id=auth.uid());
