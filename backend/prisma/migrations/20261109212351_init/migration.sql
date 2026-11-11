-- CreateEnum
CREATE TYPE "GlobalRole" AS ENUM ('CANDIDATE', 'ORGANIZATION_USER', 'SYSTEM_ADMIN');

-- CreateEnum
CREATE TYPE "OrgMemberRole" AS ENUM ('OWNER', 'ADMIN', 'RECRUITER', 'VIEWER');

-- CreateEnum
CREATE TYPE "ProfileCategory" AS ENUM ('STUDENT', 'RECENT_GRADUATE', 'EXPERIENCED_PROFESSIONAL');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('IMMEDIATE', 'DATE', 'CURRENTLY_EMPLOYED', 'PART_TIME');

-- CreateEnum
CREATE TYPE "OrganizationType" AS ENUM ('CMPP', 'ASSOCIATION', 'CABINET_LIBERAL', 'ECOLE_INCLUSIVE', 'CLINIQUE_SPECIALISEE');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('PENDING', 'VERIFIED', 'REJECTED');

-- CreateEnum
CREATE TYPE "DegreeLevel" AS ENUM ('BAC_3', 'BAC_5_MASTER', 'BAC_8_DOCTORAT', 'DIPLOME_ETAT', 'DU_SPECIALISE');

-- CreateEnum
CREATE TYPE "ExperienceType" AS ENUM ('STAGE_OBSERVATION', 'STAGE_PFE', 'STAGE_CLINIQUE', 'EMPLOI_SALARIE', 'VOLONTARIAT');

-- CreateEnum
CREATE TYPE "SkillLevel" AS ENUM ('NOTIONS', 'PRATIQUANT', 'AUTONOME', 'EXPERT');

-- CreateEnum
CREATE TYPE "LanguageProficiency" AS ENUM ('NOTIONS', 'INTERMEDIAIRE', 'COURANT_PROFESSIONNEL', 'LANGUE_MATERNELLE');

-- CreateEnum
CREATE TYPE "OfferType" AS ENUM ('STAGE_OBSERVATION', 'STAGE_PFE', 'EMPLOI');

-- CreateEnum
CREATE TYPE "ApplicationStatus" AS ENUM ('INVITED', 'INVITATION_DECLINED', 'INVITATION_EXPIRED', 'SUBMITTED', 'REVIEWING', 'INTERVIEW_PROPOSED', 'INTERVIEW_CONFIRMED', 'INTERVIEW_RESCHEDULE_REQUESTED', 'OFFER_EXTENDED', 'HIRED', 'REJECTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "ApplicationOrigin" AS ENUM ('DIRECT_APPLY', 'CENTER_INVITATION');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('IN_PERSON', 'VIDEO_CALL');

-- CreateEnum
CREATE TYPE "ReportReason" AS ENUM ('SUSPICIOUS_OFFER', 'DISCRIMINATORY_CONTENT', 'MEDICAL_DATA_REQUEST', 'ABUSIVE_BEHAVIOR');

-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('PENDING', 'INVESTIGATING', 'RESOLVED', 'DISMISSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "global_role" "GlobalRole" NOT NULL DEFAULT 'CANDIDATE',
    "preferred_locale" VARCHAR(5) NOT NULL DEFAULT 'fr',
    "is_email_verified" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_profiles" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "first_name" VARCHAR(100) NOT NULL,
    "last_name" VARCHAR(100) NOT NULL,
    "phone" VARCHAR(30),
    "profile_category" "ProfileCategory" NOT NULL,
    "primary_specialty_id" UUID NOT NULL,
    "region_code" VARCHAR(10) NOT NULL,
    "city_name" VARCHAR(100) NOT NULL,
    "mobility_radius_km" INTEGER NOT NULL DEFAULT 0,
    "open_to_relocation" BOOLEAN NOT NULL DEFAULT false,
    "availability_status" "AvailabilityStatus" NOT NULL,
    "available_from" DATE,
    "target_contract_types" TEXT[],
    "bio" TEXT,
    "cv_storage_path" VARCHAR(500),
    "is_anonymized_in_pool" BOOLEAN NOT NULL DEFAULT true,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "profile_completion_percentage" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "candidate_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organizations" (
    "id" UUID NOT NULL,
    "legal_name" VARCHAR(255) NOT NULL,
    "trade_name" VARCHAR(255) NOT NULL,
    "organization_type" "OrganizationType" NOT NULL,
    "identifier_ice" VARCHAR(15),
    "official_registration_number" VARCHAR(100),
    "website" VARCHAR(255),
    "phone" VARCHAR(50) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "region_code" VARCHAR(10) NOT NULL,
    "city_name" VARCHAR(100) NOT NULL,
    "address_line" TEXT NOT NULL,
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'PENDING',
    "verified_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "organization_members" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "OrgMemberRole" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "organization_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_specialties" (
    "id" UUID NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "title_fr" VARCHAR(150) NOT NULL,
    "title_ar" VARCHAR(150) NOT NULL,
    "title_en" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_specialties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ref_skills" (
    "id" UUID NOT NULL,
    "category" VARCHAR(50) NOT NULL,
    "parent_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "title_fr" VARCHAR(150) NOT NULL,
    "title_ar" VARCHAR(150) NOT NULL,
    "title_en" VARCHAR(150) NOT NULL,
    "is_verified_eligible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ref_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_education" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "degree_level" "DegreeLevel" NOT NULL,
    "degree_title" VARCHAR(200) NOT NULL,
    "institution_name" VARCHAR(200) NOT NULL,
    "specialty_id" UUID NOT NULL,
    "start_year" INTEGER NOT NULL,
    "end_year" INTEGER,
    "is_currently_enrolled" BOOLEAN NOT NULL DEFAULT false,
    "is_diploma_verified" BOOLEAN NOT NULL DEFAULT false,
    "diploma_document_path" VARCHAR(500),

    CONSTRAINT "candidate_education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_experience" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "experience_type" "ExperienceType" NOT NULL,
    "organization_name" VARCHAR(200) NOT NULL,
    "position_title" VARCHAR(200) NOT NULL,
    "target_audience" VARCHAR(50),
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "is_current" BOOLEAN NOT NULL DEFAULT false,
    "total_months" INTEGER NOT NULL,
    "description" TEXT,

    CONSTRAINT "candidate_experience_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_skills" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "level" "SkillLevel" NOT NULL,
    "is_verified" BOOLEAN NOT NULL DEFAULT false,
    "verification_source" VARCHAR(100),

    CONSTRAINT "candidate_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_languages" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "language_code" VARCHAR(20) NOT NULL,
    "proficiency_level" "LanguageProficiency" NOT NULL,

    CONSTRAINT "candidate_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_certifications" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "issuing_organization" VARCHAR(200) NOT NULL,
    "issue_date" DATE NOT NULL,
    "credential_id" VARCHAR(100),
    "document_path" VARCHAR(500),
    "is_verified" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "candidate_certifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_offers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "author_member_id" UUID NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "offer_type" "OfferType" NOT NULL,
    "contract_sub_type" VARCHAR(30) NOT NULL,
    "required_degree_level" "DegreeLevel" NOT NULL,
    "target_specialty_id" UUID NOT NULL,
    "region_code" VARCHAR(10) NOT NULL,
    "city_name" VARCHAR(100) NOT NULL,
    "min_experience_months" INTEGER NOT NULL DEFAULT 0,
    "is_experience_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "start_date" DATE NOT NULL,
    "duration_months" INTEGER,
    "remuneration_stipend" VARCHAR(100),
    "description" TEXT NOT NULL,
    "status" VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
    "published_at" TIMESTAMP(3),
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_required_skills" (
    "id" UUID NOT NULL,
    "job_offer_id" UUID NOT NULL,
    "skill_id" UUID NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT false,
    "min_required_level" "SkillLevel" NOT NULL,
    "weight" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "job_required_skills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_required_languages" (
    "id" UUID NOT NULL,
    "job_offer_id" UUID NOT NULL,
    "language_code" VARCHAR(20) NOT NULL,
    "min_proficiency_level" "LanguageProficiency" NOT NULL,
    "is_mandatory" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "job_required_languages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "applications" (
    "id" UUID NOT NULL,
    "job_offer_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "origin" "ApplicationOrigin" NOT NULL,
    "current_status" "ApplicationStatus" NOT NULL,
    "initial_match_score" DECIMAL(5,2),
    "invitation_sent_at" TIMESTAMP(3),
    "invitation_expires_at" TIMESTAMP(3),
    "interview_date" TIMESTAMP(3),
    "interview_mode" "InterviewMode",
    "interview_location_or_link" TEXT,
    "interview_reschedule_count" INTEGER NOT NULL DEFAULT 0,
    "hiring_offer_details" TEXT,
    "hiring_offer_deadline" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_history" (
    "id" UUID NOT NULL,
    "application_id" UUID NOT NULL,
    "from_status" "ApplicationStatus",
    "to_status" "ApplicationStatus" NOT NULL,
    "changed_by_user_id" UUID NOT NULL,
    "comment" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "matching_config" (
    "id" UUID NOT NULL,
    "offer_type" "OfferType" NOT NULL,
    "weight_formation" DECIMAL(4,2) NOT NULL,
    "weight_skills" DECIMAL(4,2) NOT NULL,
    "weight_experience" DECIMAL(4,2) NOT NULL,
    "weight_location" DECIMAL(4,2) NOT NULL,
    "weight_languages" DECIMAL(4,2) NOT NULL,
    "weight_availability" DECIMAL(4,2) NOT NULL,
    "algo_version" VARCHAR(20) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "matching_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "match_results" (
    "id" UUID NOT NULL,
    "job_offer_id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "total_score" DECIMAL(5,2) NOT NULL,
    "score_formation" DECIMAL(5,2) NOT NULL,
    "score_skills" DECIMAL(5,2) NOT NULL,
    "score_experience" DECIMAL(5,2) NOT NULL,
    "score_location" DECIMAL(5,2) NOT NULL,
    "score_languages" DECIMAL(5,2) NOT NULL,
    "score_availability" DECIMAL(5,2) NOT NULL,
    "explanations" JSONB NOT NULL,
    "mandatory_criteria_satisfied" BOOLEAN NOT NULL,
    "algo_version" VARCHAR(20) NOT NULL,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_offers" (
    "id" UUID NOT NULL,
    "candidate_id" UUID NOT NULL,
    "job_offer_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_offers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" VARCHAR(50) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "message" TEXT NOT NULL,
    "link_url" VARCHAR(255),
    "is_read" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consents" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "consent_type" VARCHAR(50) NOT NULL,
    "version" VARCHAR(20) NOT NULL,
    "has_consented" BOOLEAN NOT NULL,
    "ip_address" VARCHAR(45) NOT NULL,
    "user_agent" TEXT NOT NULL,
    "consented_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "details" JSONB,
    "ip_address" VARCHAR(45) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reports" (
    "id" UUID NOT NULL,
    "reporter_user_id" UUID NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" UUID NOT NULL,
    "reason" "ReportReason" NOT NULL,
    "description" TEXT NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_profiles_user_id_key" ON "candidate_profiles"("user_id");

-- CreateIndex
CREATE INDEX "candidate_profiles_region_code_idx" ON "candidate_profiles"("region_code");

-- CreateIndex
CREATE INDEX "candidate_profiles_city_name_idx" ON "candidate_profiles"("city_name");

-- CreateIndex
CREATE UNIQUE INDEX "organizations_identifier_ice_key" ON "organizations"("identifier_ice");

-- CreateIndex
CREATE INDEX "organizations_region_code_idx" ON "organizations"("region_code");

-- CreateIndex
CREATE INDEX "organizations_city_name_idx" ON "organizations"("city_name");

-- CreateIndex
CREATE UNIQUE INDEX "organization_members_organization_id_user_id_key" ON "organization_members"("organization_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "ref_specialties_code_key" ON "ref_specialties"("code");

-- CreateIndex
CREATE UNIQUE INDEX "ref_skills_code_key" ON "ref_skills"("code");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_skills_candidate_id_skill_id_key" ON "candidate_skills"("candidate_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_languages_candidate_id_language_code_key" ON "candidate_languages"("candidate_id", "language_code");

-- CreateIndex
CREATE INDEX "job_offers_offer_type_idx" ON "job_offers"("offer_type");

-- CreateIndex
CREATE INDEX "job_offers_region_code_idx" ON "job_offers"("region_code");

-- CreateIndex
CREATE INDEX "job_offers_city_name_idx" ON "job_offers"("city_name");

-- CreateIndex
CREATE UNIQUE INDEX "job_required_skills_job_offer_id_skill_id_key" ON "job_required_skills"("job_offer_id", "skill_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_required_languages_job_offer_id_language_code_key" ON "job_required_languages"("job_offer_id", "language_code");

-- CreateIndex
CREATE INDEX "applications_current_status_idx" ON "applications"("current_status");

-- CreateIndex
CREATE UNIQUE INDEX "applications_job_offer_id_candidate_id_key" ON "applications"("job_offer_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "matching_config_offer_type_key" ON "matching_config"("offer_type");

-- CreateIndex
CREATE INDEX "match_results_total_score_idx" ON "match_results"("total_score");

-- CreateIndex
CREATE UNIQUE INDEX "match_results_job_offer_id_candidate_id_key" ON "match_results"("job_offer_id", "candidate_id");

-- CreateIndex
CREATE UNIQUE INDEX "saved_offers_candidate_id_job_offer_id_key" ON "saved_offers"("candidate_id", "job_offer_id");

-- CreateIndex
CREATE INDEX "notifications_user_id_idx" ON "notifications"("user_id");

-- CreateIndex
CREATE INDEX "notifications_is_read_idx" ON "notifications"("is_read");

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_profiles" ADD CONSTRAINT "candidate_profiles_primary_specialty_id_fkey" FOREIGN KEY ("primary_specialty_id") REFERENCES "ref_specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "organization_members" ADD CONSTRAINT "organization_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ref_specialties" ADD CONSTRAINT "ref_specialties_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ref_specialties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ref_skills" ADD CONSTRAINT "ref_skills_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "ref_skills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_education" ADD CONSTRAINT "candidate_education_specialty_id_fkey" FOREIGN KEY ("specialty_id") REFERENCES "ref_specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_experience" ADD CONSTRAINT "candidate_experience_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_skills" ADD CONSTRAINT "candidate_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "ref_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_languages" ADD CONSTRAINT "candidate_languages_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_certifications" ADD CONSTRAINT "candidate_certifications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_author_member_id_fkey" FOREIGN KEY ("author_member_id") REFERENCES "organization_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_offers" ADD CONSTRAINT "job_offers_target_specialty_id_fkey" FOREIGN KEY ("target_specialty_id") REFERENCES "ref_specialties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_required_skills" ADD CONSTRAINT "job_required_skills_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_required_skills" ADD CONSTRAINT "job_required_skills_skill_id_fkey" FOREIGN KEY ("skill_id") REFERENCES "ref_skills"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_required_languages" ADD CONSTRAINT "job_required_languages_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "applications" ADD CONSTRAINT "applications_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_history" ADD CONSTRAINT "application_history_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_history" ADD CONSTRAINT "application_history_changed_by_user_id_fkey" FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "match_results" ADD CONSTRAINT "match_results_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_offers" ADD CONSTRAINT "saved_offers_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidate_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_offers" ADD CONSTRAINT "saved_offers_job_offer_id_fkey" FOREIGN KEY ("job_offer_id") REFERENCES "job_offers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consents" ADD CONSTRAINT "consents_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_fkey" FOREIGN KEY ("reporter_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_report_job_offer" FOREIGN KEY ("target_id") REFERENCES "job_offers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reports" ADD CONSTRAINT "fk_report_organization" FOREIGN KEY ("target_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
