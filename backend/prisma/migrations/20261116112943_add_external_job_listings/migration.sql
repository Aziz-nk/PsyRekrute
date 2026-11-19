-- CreateEnum
CREATE TYPE "ExternalJobStatus" AS ENUM ('PENDING_REVIEW', 'PUBLISHED', 'REJECTED', 'EXPIRED');

-- CreateTable
CREATE TABLE "external_job_listings" (
    "id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "organization_name" VARCHAR(255) NOT NULL,
    "description_summary" TEXT NOT NULL,
    "city_name" VARCHAR(100),
    "region_code" VARCHAR(10),
    "contract_type" VARCHAR(50),
    "category" VARCHAR(100),
    "publication_date" TIMESTAMP(3),
    "expiration_date" TIMESTAMP(3),
    "source_name" VARCHAR(100) NOT NULL,
    "source_url" VARCHAR(1000) NOT NULL,
    "original_application_url" VARCHAR(1000),
    "application_instructions" TEXT,
    "discovered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_checked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "ExternalJobStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "content_hash" VARCHAR(64) NOT NULL,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by_user_id" UUID,
    "rejection_reason" VARCHAR(255),

    CONSTRAINT "external_job_listings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "external_job_listings_source_url_key" ON "external_job_listings"("source_url");

-- CreateIndex
CREATE UNIQUE INDEX "external_job_listings_content_hash_key" ON "external_job_listings"("content_hash");

-- CreateIndex
CREATE INDEX "external_job_listings_status_idx" ON "external_job_listings"("status");

-- CreateIndex
CREATE INDEX "external_job_listings_city_name_idx" ON "external_job_listings"("city_name");

-- CreateIndex
CREATE INDEX "external_job_listings_category_idx" ON "external_job_listings"("category");

-- CreateIndex
CREATE INDEX "external_job_listings_discovered_at_idx" ON "external_job_listings"("discovered_at");

-- AddForeignKey
ALTER TABLE "external_job_listings" ADD CONSTRAINT "external_job_listings_reviewed_by_user_id_fkey" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
