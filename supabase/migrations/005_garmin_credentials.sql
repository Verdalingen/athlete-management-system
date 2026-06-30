-- Migration 005: Per-user Garmin credentials stored via Supabase Vault
-- Vault encrypts secrets at rest using pgsodium (built-in on all Supabase projects).

create table if not exists garmin_credentials (
  user_id      uuid references auth.users primary key,
  garmin_email text not null,
  secret_id    uuid not null,   -- references vault.secrets
  connected_at timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table garmin_credentials enable row level security;

create policy "users manage own garmin credentials"
  on garmin_credentials for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.garmin_credentials to authenticated;
grant select, insert, update, delete on public.garmin_credentials to service_role;

-- ── RPC: store or update credentials ────────────────────────────────────────
-- Runs as security definer so it can write to vault.secrets, which is
-- otherwise only accessible to service_role.
create or replace function store_garmin_credentials(
  p_user_id uuid,
  p_email   text,
  p_password text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_secret_id uuid;
  v_secret_id          uuid;
begin
  select secret_id into v_existing_secret_id
  from garmin_credentials
  where user_id = p_user_id;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_password);
    update garmin_credentials
    set garmin_email = p_email, updated_at = now()
    where user_id = p_user_id;
  else
    v_secret_id := vault.create_secret(
      p_password,
      'garmin_pw_' || p_user_id::text,
      'Garmin Connect password for user ' || p_user_id::text
    );
    insert into garmin_credentials (user_id, garmin_email, secret_id)
    values (p_user_id, p_email, v_secret_id);
  end if;
end;
$$;

-- ── RPC: read credentials (service_role only) ────────────────────────────────
create or replace function get_garmin_credentials(p_user_id uuid)
returns table(garmin_email text, garmin_password text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select gc.garmin_email, ds.decrypted_secret::text
  from garmin_credentials gc
  join vault.decrypted_secrets ds on ds.id = gc.secret_id
  where gc.user_id = p_user_id;
end;
$$;

-- ── RPC: delete credentials ──────────────────────────────────────────────────
create or replace function delete_garmin_credentials(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  select secret_id into v_secret_id
  from garmin_credentials
  where user_id = p_user_id;

  if v_secret_id is not null then
    delete from garmin_credentials where user_id = p_user_id;
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;
