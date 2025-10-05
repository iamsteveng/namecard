-- lint-ignore:create-index-concurrently
create schema if not exists enrichment;

create table if not exists enrichment."EnrichmentCompanyProfile" (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  industry text,
  size text,
  headquarters text,
  website text,
  description text,
  logo_url text,
  last_updated timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists enrichment_company_profiles_name_idx
  on enrichment."EnrichmentCompanyProfile"(lower(name));

create table if not exists enrichment."EnrichmentRecord" (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references cards."CardsCard"(id) on delete cascade,
  company_id uuid references enrichment."EnrichmentCompanyProfile"(id) on delete set null,
  tenant_id uuid not null,
  status text not null,
  requested_by uuid not null references auth."AuthUser"(id),
  score double precision,
  summary text,
  companies jsonb,
  insights jsonb,
  error text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists enrichment_records_card_id_idx on enrichment."EnrichmentRecord"(card_id);
create index if not exists enrichment_records_company_id_idx on enrichment."EnrichmentRecord"(company_id);
create index if not exists enrichment_records_status_idx on enrichment."EnrichmentRecord"(status);

create table if not exists enrichment."EnrichmentNewsArticle" (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references enrichment."EnrichmentCompanyProfile"(id) on delete cascade,
  title text not null,
  summary text,
  url text,
  published_date date,
  source text,
  created_at timestamptz not null default now()
);

create index if not exists enrichment_news_articles_company_id_idx on enrichment."EnrichmentNewsArticle"(company_id);
create index if not exists enrichment_news_articles_published_idx on enrichment."EnrichmentNewsArticle"(published_date);
