-- lint-ignore:create-index-concurrently
create schema if not exists ocr;

create table if not exists ocr."OcrJob" (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards."CardsCard"(id) on delete cascade,
  tenant_id uuid not null,
  requested_by uuid not null references auth."AuthUser"(id),
  status text not null,
  payload jsonb,
  result jsonb,
  error text,
  submitted_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ocr_jobs_card_id_idx on ocr."OcrJob"(card_id);
create index if not exists ocr_jobs_tenant_id_idx on ocr."OcrJob"(tenant_id);
create index if not exists ocr_jobs_status_idx on ocr."OcrJob"(status);
