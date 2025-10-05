-- lint-ignore:create-index-concurrently
create schema if not exists cards;

create table if not exists cards."CardsCard" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references auth."AuthUser"(id) on delete cascade,
  original_image_url text not null,
  processed_image_url text,
  extracted_text text,
  confidence double precision,
  name text,
  title text,
  company text,
  email text,
  phone text,
  address text,
  website text,
  notes text,
  tags text[] not null default '{}',
  scan_date date,
  last_enrichment_date timestamptz,
  ocr_job_id uuid,
  enrichment_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists cards_cards_user_id_idx on cards."CardsCard"(user_id);
create index if not exists cards_cards_tenant_id_idx on cards."CardsCard"(tenant_id);
create index if not exists cards_cards_company_idx on cards."CardsCard"(lower(company));
create index if not exists cards_cards_name_idx on cards."CardsCard"(lower(name));
create index if not exists cards_cards_email_idx on cards."CardsCard"(lower(email));
create index if not exists cards_cards_tags_idx on cards."CardsCard" using gin(tags);

create table if not exists cards."CardsCardActivity" (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards."CardsCard"(id) on delete cascade,
  activity_type text not null,
  detail jsonb,
  occurred_at timestamptz not null default now()
);

create index if not exists cards_card_activity_card_id_idx on cards."CardsCardActivity"(card_id);
create index if not exists cards_card_activity_type_idx on cards."CardsCardActivity"(activity_type);
