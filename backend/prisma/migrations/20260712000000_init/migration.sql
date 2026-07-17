-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "auth_provider_kind" AS ENUM ('email_otp', 'nafath');

-- CreateEnum
CREATE TYPE "otp_purpose" AS ENUM ('login');

-- CreateEnum
CREATE TYPE "financial_input_source" AS ENUM ('chatbot', 'form');

-- CreateEnum
CREATE TYPE "economic_indicator_kind" AS ENUM ('cpi');

-- CreateEnum
CREATE TYPE "risk_tier_kind" AS ENUM ('safe', 'caution', 'high');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified_at" TIMESTAMP(3),
    "auth_provider" "auth_provider_kind" NOT NULL DEFAULT 'email_otp',
    "nafath_id" TEXT,
    "pdpl_consent_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otp_codes" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "code_hash" TEXT NOT NULL,
    "purpose" "otp_purpose" NOT NULL DEFAULT 'login',
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "otp_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "refresh_token_hash" TEXT NOT NULL,
    "user_agent" TEXT,
    "ip" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_inputs" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "goal" TEXT NOT NULL,
    "financing_amount" DECIMAL(12,2) NOT NULL,
    "term_years" INTEGER NOT NULL,
    "gross_salary" DECIMAL(12,2) NOT NULL,
    "additional_income" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "existing_commitments" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "monthly_expenses" DECIMAL(12,2) NOT NULL,
    "family_status" TEXT NOT NULL,
    "savings" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "employment_sector" TEXT NOT NULL,
    "tenure_years" INTEGER NOT NULL,
    "source" "financial_input_source" NOT NULL DEFAULT 'chatbot',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_inputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analyses" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "financial_input_id" UUID NOT NULL,
    "rule_version" TEXT NOT NULL,
    "inflation_value" DECIMAL(6,4) NOT NULL,
    "inflation_source" TEXT NOT NULL,
    "inflation_as_of" TEXT NOT NULL,
    "salary_growth_assumption" DECIMAL(6,4) NOT NULL,
    "apr_assumption" DECIMAL(6,4) NOT NULL,
    "requested_dbr" DECIMAL(6,4) NOT NULL,
    "overall_risk" "risk_tier_kind" NOT NULL,
    "result_json" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "analyses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "analysis_years" (
    "id" UUID NOT NULL,
    "analysis_id" UUID NOT NULL,
    "scenario" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "installment" DECIMAL(12,2) NOT NULL,
    "remaining_monthly" DECIMAL(12,2) NOT NULL,
    "remaining_debt" DECIMAL(12,2) NOT NULL,
    "dbr" DECIMAL(6,4) NOT NULL,
    "risk_tier" "risk_tier_kind" NOT NULL,

    CONSTRAINT "analysis_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chat_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "transcript_json" JSONB NOT NULL DEFAULT '[]',
    "extracted_json" JSONB NOT NULL DEFAULT '{}',
    "complete" BOOLEAN NOT NULL DEFAULT false,
    "extracted_input_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "description" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "economic_data_cache" (
    "id" UUID NOT NULL,
    "indicator" "economic_indicator_kind" NOT NULL,
    "value" DECIMAL(6,4) NOT NULL,
    "period" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "economic_data_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_nafath_id_key" ON "users"("nafath_id");

-- CreateIndex
CREATE INDEX "otp_codes_user_id_purpose_consumed_at_idx" ON "otp_codes"("user_id", "purpose", "consumed_at");

-- CreateIndex
CREATE INDEX "otp_codes_expires_at_idx" ON "otp_codes"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_refresh_token_hash_key" ON "sessions"("refresh_token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_revoked_at_idx" ON "sessions"("user_id", "revoked_at");

-- CreateIndex
CREATE INDEX "financial_inputs_user_id_created_at_idx" ON "financial_inputs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "analyses_user_id_created_at_idx" ON "analyses"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "analysis_years_analysis_id_idx" ON "analysis_years"("analysis_id");

-- CreateIndex
CREATE UNIQUE INDEX "analysis_years_analysis_id_scenario_year_key" ON "analysis_years"("analysis_id", "scenario", "year");

-- CreateIndex
CREATE INDEX "chat_sessions_user_id_created_at_idx" ON "chat_sessions"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "economic_data_cache_indicator_period_idx" ON "economic_data_cache"("indicator", "period" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "economic_data_cache_indicator_period_key" ON "economic_data_cache"("indicator", "period");

-- AddForeignKey
ALTER TABLE "otp_codes" ADD CONSTRAINT "otp_codes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_inputs" ADD CONSTRAINT "financial_inputs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analyses" ADD CONSTRAINT "analyses_financial_input_id_fkey" FOREIGN KEY ("financial_input_id") REFERENCES "financial_inputs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "analysis_years" ADD CONSTRAINT "analysis_years_analysis_id_fkey" FOREIGN KEY ("analysis_id") REFERENCES "analyses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_sessions" ADD CONSTRAINT "chat_sessions_extracted_input_id_fkey" FOREIGN KEY ("extracted_input_id") REFERENCES "financial_inputs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

