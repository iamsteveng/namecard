-- lint-ignore:drop-index-concurrently
-- Adjust enrichment company uniqueness to allow same name across tenants.
BEGIN;

DROP INDEX IF EXISTS enrichment_company_profiles_name_idx;
CREATE UNIQUE INDEX IF NOT EXISTS enrichment_company_profiles_tenant_name_idx
  ON enrichment."EnrichmentCompanyProfile" (tenant_id, lower(name));

COMMIT;
