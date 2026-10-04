create table if not exists public.sandbox_rate_limits (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  request_times timestamptz[] not null default '{}',
  primary key (user_id, action)
);

alter table public.sandbox_rate_limits enable row level security;
revoke all on table public.sandbox_rate_limits from anon, authenticated;

-- Lock the quota row so requests across server instances share one sliding window.
create or replace function public.consume_sandbox_rate_limit(
  p_user_id uuid, p_action text, p_limit integer, p_window_ms integer
) returns boolean
language plpgsql security definer set search_path = ''
as $$
declare
  stamps timestamptz[];
  recent timestamptz[];
  current_time_value timestamptz;
begin
  if p_limit < 1 or p_limit > 1000 or p_window_ms < 1 or p_window_ms > 86400000
     or p_action not in ('start', 'destroy', 'pause', 'extend', 'clone', 'pr', 'terminal') then
    raise exception 'Invalid sandbox quota parameters';
  end if;

  insert into public.sandbox_rate_limits(user_id, action)
    values (p_user_id, p_action) on conflict do nothing;
  select request_times into stamps from public.sandbox_rate_limits
    where user_id = p_user_id and action = p_action for update;
  current_time_value := clock_timestamp();
  select coalesce(array_agg(stamp), '{}'::timestamptz[]) into recent
    from unnest(stamps) stamp
    where stamp > current_time_value - p_window_ms * interval '1 millisecond';
  if cardinality(recent) >= p_limit then return false; end if;
  update public.sandbox_rate_limits
    set request_times = array_append(recent, current_time_value)
    where user_id = p_user_id and action = p_action;
  return true;
end;
$$;

revoke all on function public.consume_sandbox_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.consume_sandbox_rate_limit(uuid, text, integer, integer)
  to service_role;
