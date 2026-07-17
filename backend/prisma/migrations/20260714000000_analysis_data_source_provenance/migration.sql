-- Data-source provenance on every analysis (Scope v2 §4.8 auditability, extended for SIMAH).
-- Records which source supplied each user figure the engine consumed: "manual" (chatbot) or
-- "simah" (bureau-verified). Existing rows default to "manual" — they predate SIMAH, and every
-- analysis before this migration was computed from self-declared figures.
ALTER TABLE "analyses" ADD COLUMN "commitments_source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "analyses" ADD COLUMN "salary_source" TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE "analyses" ADD COLUMN "simah_reference_id" TEXT;
ALTER TABLE "analyses" ADD COLUMN "credit_score" INTEGER;
