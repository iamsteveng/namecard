-- lint-ignore:create-index-concurrently
create schema if not exists uploads;

create table if not exists uploads."UploadsAsset" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid references auth."AuthUser"(id) on delete set null,
  object_key text not null,
  file_name text not null,
  status text not null,
  checksum text not null,
  content_type text not null,
  size_bytes integer not null,
  presigned_url text not null,
  cdn_url text,
  expires_at timestamptz not null,
  uploaded_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists uploads_assets_tenant_id_idx on uploads."UploadsAsset"(tenant_id);
create index if not exists uploads_assets_status_idx on uploads."UploadsAsset"(status);
