-- Add trigger functions for auto-updating search vectors on INSERT/UPDATE

-- Create trigger function for cards table
-- Combines all searchable text fields into a single tsvector using 'english' configuration
CREATE OR REPLACE FUNCTION cards_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.first_name, '') || ' ' || COALESCE(NEW.last_name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.company, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.department, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.email, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.phone, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.mobile, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.address, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.website, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.notes, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger function for companies table
-- Combines all searchable company fields including enrichment data
CREATE OR REPLACE FUNCTION companies_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := 
    setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW.industry, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
    setweight(to_tsvector('english', COALESCE(NEW.headquarters, '')), 'C') ||
    setweight(to_tsvector('english', COALESCE(NEW.website, '')), 'D') ||
    setweight(to_tsvector('english', COALESCE(NEW.size, '')), 'D');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers to automatically update search vectors
CREATE TRIGGER cards_search_vector_trigger 
  BEFORE INSERT OR UPDATE ON "cards" 
  FOR EACH ROW EXECUTE PROCEDURE cards_search_vector_update();

CREATE TRIGGER companies_search_vector_trigger 
  BEFORE INSERT OR UPDATE ON "companies" 
  FOR EACH ROW EXECUTE PROCEDURE companies_search_vector_update();

-- Initial population of search vectors for existing data
-- Update all existing cards with search vectors
UPDATE "cards" SET search_vector = 
  setweight(to_tsvector('english', COALESCE(first_name, '') || ' ' || COALESCE(last_name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(title, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(company, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(department, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(email, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(phone, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(mobile, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(address, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(website, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(notes, '')), 'C')
WHERE search_vector IS NULL;

-- Update all existing companies with search vectors
UPDATE "companies" SET search_vector = 
  setweight(to_tsvector('english', COALESCE(name, '')), 'A') ||
  setweight(to_tsvector('english', COALESCE(industry, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(description, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(headquarters, '')), 'C') ||
  setweight(to_tsvector('english', COALESCE(website, '')), 'D') ||
  setweight(to_tsvector('english', COALESCE(size, '')), 'D')
WHERE search_vector IS NULL;

-- Add comments for documentation
COMMENT ON FUNCTION cards_search_vector_update() IS 'Auto-updates search vector for cards on INSERT/UPDATE with weighted relevance';
COMMENT ON FUNCTION companies_search_vector_update() IS 'Auto-updates search vector for companies on INSERT/UPDATE with weighted relevance';
COMMENT ON TRIGGER cards_search_vector_trigger ON "cards" IS 'Automatically maintains search vector when card data changes';
COMMENT ON TRIGGER companies_search_vector_trigger ON "companies" IS 'Automatically maintains search vector when company data changes';