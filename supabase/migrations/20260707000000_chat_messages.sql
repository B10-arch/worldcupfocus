-- Team chat for the Watch page. Idempotent — safe to run more than once.

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  display_name text,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_created_at_idx
  on public.chat_messages (created_at);

alter table public.chat_messages enable row level security;

-- Every signed-in member can read the whole chat.
drop policy if exists "chat_read" on public.chat_messages;
create policy "chat_read" on public.chat_messages
  for select to authenticated using (true);

-- A member can only post as themselves.
drop policy if exists "chat_insert_own" on public.chat_messages;
create policy "chat_insert_own" on public.chat_messages
  for insert to authenticated with check (auth.uid() = user_id);

-- A member can delete their own messages.
drop policy if exists "chat_delete_own" on public.chat_messages;
create policy "chat_delete_own" on public.chat_messages
  for delete to authenticated using (auth.uid() = user_id);

-- Optional: turn on Supabase Realtime for the table (ignored if unavailable).
do $$
begin
  alter publication supabase_realtime add table public.chat_messages;
exception when others then null;
end $$;
