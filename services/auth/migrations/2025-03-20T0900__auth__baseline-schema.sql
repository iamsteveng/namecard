-- lint-ignore:create-index-concurrently
create extension if not exists "pgcrypto";

create schema if not exists auth;

do $$
begin
  if not exists (
    select 1 from pg_type where typname = 'uuid'
  ) then
    raise exception 'uuid type not available';
  end if;
end$$;

create table if not exists auth."AuthUser" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  email text not null,
  password_hash text not null,
  name text,
  avatar_url text,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists auth_users_email_ci_idx on auth."AuthUser" (lower(email));

create table if not exists auth."AuthSession" (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth."AuthUser"(id) on delete cascade,
  access_token_hash text not null unique,
  refresh_token_hash text not null unique,
  issued_at timestamptz not null default now(),
  access_token_expires_at timestamptz not null,
  refresh_token_expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists auth_sessions_user_id_idx on auth."AuthSession"(user_id);
create index if not exists auth_sessions_access_hash_idx on auth."AuthSession"(access_token_hash);
create index if not exists auth_sessions_refresh_hash_idx on auth."AuthSession"(refresh_token_hash);
