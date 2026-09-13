create table if not exists public.sandbox_mutation_locks (
  user_id uuid primary key references auth.users(id) on delete cascade,
  holder text not null,
  expires_at timestamptz not null
);

alter table public.sandbox_mutation_locks enable row level security;

comment on table public.sandbox_mutation_locks is
  'Cross-isolate sandbox mutation leases. Access is restricted to the Supabase service role.';

revoke all on table public.sandbox_mutation_locks from anon, authenticated;
