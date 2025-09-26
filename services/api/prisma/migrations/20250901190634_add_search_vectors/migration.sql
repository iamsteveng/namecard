-- Add search_vector columns to cards and companies tables for PostgreSQL full-text search

-- Add search_vector column to cards table
ALTER TABLE "cards" ADD COLUMN "search_vector" tsvector;

-- Add search_vector column to companies table  
ALTER TABLE "companies" ADD COLUMN "search_vector" tsvector;

-- Create GIN indexes for fast full-text search performance
CREATE INDEX "cards_search_vector_idx" ON "cards" USING gin("search_vector");
CREATE INDEX "companies_search_vector_idx" ON "companies" USING gin("search_vector");

-- Add comments for documentation
COMMENT ON COLUMN "cards"."search_vector" IS 'Full-text search vector combining all searchable card fields';
COMMENT ON COLUMN "companies"."search_vector" IS 'Full-text search vector combining all searchable company fields';
COMMENT ON INDEX "cards_search_vector_idx" IS 'GIN index for fast full-text search on cards';
COMMENT ON INDEX "companies_search_vector_idx" IS 'GIN index for fast full-text search on companies';