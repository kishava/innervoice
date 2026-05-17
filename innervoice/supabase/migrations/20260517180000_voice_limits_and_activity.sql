-- Activity tracking for inactive voice cleanup (1 week)
alter table public.profiles
  add column if not exists last_active_at timestamptz not null default now();

update public.profiles
set last_active_at = coalesce(created_at, now())
where last_active_at is null;

-- Enforce max 2 voices per user at the database level
create or replace function public.enforce_user_voice_limit()
returns trigger
language plpgsql
as $$
declare
  voice_count integer;
begin
  select count(*)::integer
  into voice_count
  from public.user_voices
  where user_id = new.user_id;

  if voice_count >= 2 then
    raise exception 'Voice limit reached (maximum 2 per account)'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists user_voices_limit_trigger on public.user_voices;
create trigger user_voices_limit_trigger
before insert on public.user_voices
for each row
execute function public.enforce_user_voice_limit();
