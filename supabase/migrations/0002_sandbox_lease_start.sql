alter table public.github_connections
  add column if not exists first_started_at timestamptz;

comment on column public.github_connections.first_started_at is
  'First time this user started a sandbox in the current billing window. Cleared on destroy.';
