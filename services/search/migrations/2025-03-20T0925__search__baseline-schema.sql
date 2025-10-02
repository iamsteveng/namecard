-- lint-ignore:create-index-concurrently
create schema if not exists search;

create table if not exists search."SearchQueryLog" (
  id bigserial primary key,
  tenant_id uuid,
  user_id uuid,
  query text,
  latency_ms integer not null,
  result_count integer not null,
  executed_at timestamptz not null default now()
);

create index if not exists search_query_logs_tenant_idx on search."SearchQueryLog"(tenant_id);
create index if not exists search_query_logs_user_idx on search."SearchQueryLog"(user_id);
create index if not exists search_query_logs_executed_idx on search."SearchQueryLog"(executed_at desc);
create index if not exists search_query_logs_query_idx on search."SearchQueryLog" using gin (to_tsvector('simple', coalesce(query, '')));
