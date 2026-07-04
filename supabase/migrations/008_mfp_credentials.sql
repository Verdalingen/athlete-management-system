-- Migration 008: Per-user MyFitnessPal credentials stored via Supabase Vault

create table if not exists mfp_credentials (
  user_id      uuid references auth.users primary key,
  mfp_username text not null,
  secret_id    uuid not null,   -- references vault.secrets
  connected_at timestamptz default now(),
  updated_at   timestamptz default now()
);

alter table mfp_credentials enable row level security;

create policy "users manage own mfp credentials"
  on mfp_credentials for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update, delete on public.mfp_credentials to authenticated;
grant select, insert, update, delete on public.mfp_credentials to service_role;

-- ── RPC: store or update credentials ────────────────────────────────────────
create or replace function store_mfp_credentials(
  p_user_id  uuid,
  p_username text,
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
  from mfp_credentials
  where user_id = p_user_id;

  if v_existing_secret_id is not null then
    perform vault.update_secret(v_existing_secret_id, p_password);
    update mfp_credentials
    set mfp_username = p_username, updated_at = now()
    where user_id = p_user_id;
  else
    v_secret_id := vault.create_secret(
      p_password,
      'mfp_pw_' || p_user_id::text,
      'MyFitnessPal password for user ' || p_user_id::text
    );
    insert into mfp_credentials (user_id, mfp_username, secret_id)
    values (p_user_id, p_username, v_secret_id);
  end if;
end;
$$;

-- ── RPC: read credentials (service_role only) ────────────────────────────────
create or replace function get_mfp_credentials(p_user_id uuid)
returns table(mfp_username text, mfp_password text)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select mc.mfp_username, ds.decrypted_secret::text
  from mfp_credentials mc
  join vault.decrypted_secrets ds on ds.id = mc.secret_id
  where mc.user_id = p_user_id;
end;
$$;

-- ── RPC: delete credentials ──────────────────────────────────────────────────
create or replace function delete_mfp_credentials(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  select secret_id into v_secret_id
  from mfp_credentials
  where user_id = p_user_id;

  if v_secret_id is not null then
    delete from mfp_credentials where user_id = p_user_id;
    delete from vault.secrets where id = v_secret_id;
  end if;
end;
$$;
