create table if not exists public.user_voices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  elevenlabs_voice_id text not null,
  name text not null,
  created_at timestamptz not null default now(),
  constraint user_voices_name_len check (char_length(trim(name)) > 0)
);

create unique index if not exists user_voices_user_elevenlabs_idx
  on public.user_voices (user_id, elevenlabs_voice_id);

create index if not exists user_voices_user_created_idx
  on public.user_voices (user_id, created_at desc);

alter table public.user_voices enable row level security;

drop policy if exists "user_voices own rows" on public.user_voices;
create policy "user_voices own rows"
on public.user_voices
for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Backfill existing single voice from profiles
insert into public.user_voices (user_id, elevenlabs_voice_id, name)
select p.id, p.voice_id, 'My future self'
from public.profiles p
where p.voice_id is not null
  and not exists (
    select 1
    from public.user_voices uv
    where uv.user_id = p.id and uv.elevenlabs_voice_id = p.voice_id
  );
