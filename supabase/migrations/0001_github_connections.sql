create table if not exists public.github_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  github_user_id bigint not null,
  github_login text not null,
  github_name text,
  github_email text,
  github_avatar_url text not null,
  github_html_url text not null,
  encrypted_access_token text not null,
  granted_scope text not null default '',
  token_type text not null default 'bearer',
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.github_connections enable row level security;

comment on table public.github_connections is
  'Server-only GitHub OAuth connections. Access is restricted to the Supabase service role.';

revoke all on table public.github_connections from anon, authenticated;
