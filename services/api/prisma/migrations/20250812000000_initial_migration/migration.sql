-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('PENDING', 'PROCESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "EnrichmentStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "email" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "cognito_user_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "status" "CardStatus" NOT NULL DEFAULT 'PENDING',
    "original_image_url" TEXT,
    "processed_image_url" TEXT,
    "thumbnail_url" TEXT,
    "ocr_confidence" DOUBLE PRECISION,
    "first_name" TEXT,
    "last_name" TEXT,
    "title" TEXT,
    "company" TEXT,
    "department" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "mobile" TEXT,
    "website" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "tags" TEXT[],
    "raw_ocr_data" JSONB,
    "processed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" TEXT NOT NULL,
    "domain" TEXT,
    "website" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "size" TEXT,
    "founded_year" INTEGER,
    "headquarters" TEXT,
    "logo_url" TEXT,
    "linkedin_url" TEXT,
    "twitter_url" TEXT,
    "facebook_url" TEXT,
    "crunchbase_url" TEXT,
    "enrichment_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "user_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3),
    "location" TEXT,
    "attendees" TEXT[],
    "event_data" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_enrichments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "company_id" UUID NOT NULL,
    "source" TEXT NOT NULL,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "confidence_score" DOUBLE PRECISION,
    "data" JSONB,
    "error_message" TEXT,
    "enriched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_enrichments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "card_id" UUID NOT NULL,
    "company_id" UUID,
    "status" "EnrichmentStatus" NOT NULL DEFAULT 'PENDING',
    "enriched_fields" TEXT[],
    "confidence_score" DOUBLE PRECISION,
    "error_message" TEXT,
    "enriched_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_enrichments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_cognito_user_id_key" ON "users"("cognito_user_id");

-- CreateIndex
CREATE INDEX "cards_user_id_idx" ON "cards"("user_id");

-- CreateIndex
CREATE INDEX "cards_status_idx" ON "cards"("status");

-- CreateIndex
CREATE INDEX "cards_company_idx" ON "cards"("company");

-- CreateIndex
CREATE INDEX "cards_email_idx" ON "cards"("email");

-- CreateIndex
CREATE INDEX "cards_phone_idx" ON "cards"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "companies_domain_key" ON "companies"("domain");

-- CreateIndex
CREATE INDEX "companies_name_idx" ON "companies"("name");

-- CreateIndex
CREATE INDEX "companies_industry_idx" ON "companies"("industry");

-- CreateIndex
CREATE INDEX "calendar_events_user_id_idx" ON "calendar_events"("user_id");

-- CreateIndex
CREATE INDEX "calendar_events_start_date_idx" ON "calendar_events"("start_date");

-- CreateIndex
CREATE INDEX "company_enrichments_company_id_idx" ON "company_enrichments"("company_id");

-- CreateIndex
CREATE INDEX "company_enrichments_source_idx" ON "company_enrichments"("source");

-- CreateIndex
CREATE INDEX "company_enrichments_status_idx" ON "company_enrichments"("status");

-- CreateIndex
CREATE INDEX "card_enrichments_card_id_idx" ON "card_enrichments"("card_id");

-- CreateIndex
CREATE INDEX "card_enrichments_status_idx" ON "card_enrichments"("status");

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_enrichments" ADD CONSTRAINT "company_enrichments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_enrichments" ADD CONSTRAINT "card_enrichments_card_id_fkey" FOREIGN KEY ("card_id") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_enrichments" ADD CONSTRAINT "card_enrichments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;