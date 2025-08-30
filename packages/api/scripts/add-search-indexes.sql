-- Add GIN indexes for full-text search on cards table
CREATE INDEX IF NOT EXISTS cards_search_gin_idx ON cards USING gin(
  to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(title, '') || ' ' ||
    coalesce(company, '') || ' ' ||
    coalesce(email, '') || ' ' ||
    coalesce(phone, '') || ' ' ||
    coalesce(website, '') || ' ' ||
    coalesce(address, '') || ' ' ||
    coalesce(notes, '') || ' ' ||
    array_to_string(tags, ' ')
  )
);

-- Add GIN indexes for full-text search on companies table
CREATE INDEX IF NOT EXISTS companies_search_gin_idx ON companies USING gin(
  to_tsvector('english',
    coalesce(name, '') || ' ' ||
    coalesce(industry, '') || ' ' ||
    coalesce(description, '') || ' ' ||
    coalesce(location, '') || ' ' ||
    coalesce(website, '') || ' ' ||
    array_to_string(keywords, ' ') || ' ' ||
    array_to_string(technologies, ' ')
  )
);

-- Additional performance indexes for common query patterns
CREATE INDEX IF NOT EXISTS cards_user_id_created_at_idx ON cards(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS cards_user_id_name_idx ON cards(user_id, name) WHERE name IS NOT NULL;
CREATE INDEX IF NOT EXISTS cards_user_id_company_idx ON cards(user_id, company) WHERE company IS NOT NULL;

-- Companies performance indexes  
CREATE INDEX IF NOT EXISTS companies_domain_idx ON companies(domain) WHERE domain IS NOT NULL;