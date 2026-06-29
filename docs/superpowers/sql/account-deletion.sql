-- In-app account deletion (Apple Guideline 5.1.1(v)).
-- Soft-delete: disables the caller's account immediately and records a purge
-- request. The login gate in mobile AuthContext bounces disabled accounts, so
-- the user can never sign back in -> effectively deleted from their side.
-- ponytail: soft-delete + admin purge. Swap to a service-role hard delete of
-- auth.users if regulators require full erasure on a fixed SLA.

create table if not exists account_deletion_requests (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  organisation_id uuid,
  email           text,
  requested_at    timestamptz not null default now()
);

create or replace function request_account_deletion()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not authenticated'; end if;

  update public.users set disabled = true where id = uid;

  insert into account_deletion_requests (user_id, organisation_id, email)
  select id, organisation_id, email from public.users where id = uid;
end;
$$;

-- Only a logged-in user can delete their own account; the function reads
-- auth.uid() itself, so it cannot be aimed at anyone else.
revoke all on function request_account_deletion() from public;
grant execute on function request_account_deletion() to authenticated;
