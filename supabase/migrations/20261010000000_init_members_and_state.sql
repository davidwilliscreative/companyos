-- Who may sign in, and with which role. Managed by executives in Settings.
create table public.members (
  email text primary key check (email = lower(email)),
  role text not null check (role in ('executive','finance','account_owner','admin')),
  display_name text,
  added_by text,
  created_at timestamptz not null default now()
);
alter table public.members enable row level security;
-- A signed-in person can see only their own membership row.
create policy "members: read own row" on public.members
  for select to authenticated
  using (email = lower(auth.jwt() ->> 'email'));

-- Demo edits (actions, reviews, scenarios, imports). Server-only: no policies, so the
-- browser keys can't read or write it; the server uses the secret key.
create table public.app_state (
  id text primary key,
  state jsonb not null,
  version integer not null default 0,
  updated_at timestamptz not null default now()
);
alter table public.app_state enable row level security;
insert into public.app_state (id, state) values ('demo', '{"version":1,"orgs":{},"audit":[]}');

-- The first executive. Add everyone else from Settings → People with access.
insert into public.members (email, role, display_name, added_by)
values ('david@davidwilliscreative.com', 'executive', 'Dave', 'setup');
