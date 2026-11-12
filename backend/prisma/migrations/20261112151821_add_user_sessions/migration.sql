-- CreateEnum
CREATE TYPE "SessionRevocationReason" AS ENUM ('ROTATED', 'USER_LOGOUT', 'LOGOUT_ALL', 'REUSE_DETECTED', 'ADMIN_REVOKED');

-- CreateTable
CREATE TABLE "user_sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "replaced_by_session_id" UUID,
    "ip_address" VARCHAR(45),
    "user_agent" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "revocation_reason" "SessionRevocationReason",
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_token_hash_key" ON "user_sessions"("token_hash");

-- CreateIndex
CREATE UNIQUE INDEX "user_sessions_replaced_by_session_id_key" ON "user_sessions"("replaced_by_session_id");

-- CreateIndex (supporte la verification SQL que le successeur appartient au meme user_id)
CREATE UNIQUE INDEX "user_sessions_id_user_id_key" ON "user_sessions"("id", "user_id");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_idx" ON "user_sessions"("user_id");

-- CreateIndex
CREATE INDEX "user_sessions_expires_at_idx" ON "user_sessions"("expires_at");

-- CreateIndex
CREATE INDEX "user_sessions_user_id_revoked_at_idx" ON "user_sessions"("user_id", "revoked_at");

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_replaced_by_session_id_fkey" FOREIGN KEY ("replaced_by_session_id") REFERENCES "user_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint (D1 : interdiction stricte de stocker un jeton non hache SHA-256 hex 64 car.)
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_token_hash_sha256_chk" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');

-- AddCheckConstraint (Invariant 1 : une session ne peut pas se remplacer elle-meme)
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_no_self_replace_chk" CHECK ("replaced_by_session_id" IS NULL OR "replaced_by_session_id" <> "id");

-- AddCheckConstraint (coherence revocation : revoked_at et revocation_reason vont toujours ensemble, et toute session remplacee est obligatoirement revoquee ROTATED)
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_revocation_consistency_chk" CHECK (
    (("revoked_at" IS NULL AND "revocation_reason" IS NULL) OR ("revoked_at" IS NOT NULL AND "revocation_reason" IS NOT NULL))
    AND ("replaced_by_session_id" IS NULL OR ("revoked_at" IS NOT NULL AND "revocation_reason" IS NOT NULL))
);

-- Trigger d'integrite des invariants de session (Invariants 3, 4 et 5 au niveau PostgreSQL)
CREATE OR REPLACE FUNCTION enforce_user_session_invariants()
RETURNS TRIGGER AS $$
DECLARE
    successor_user_id UUID;
BEGIN
    -- Invariant : user_id, token_hash et created_at sont immuables apres creation
    IF TG_OP = 'UPDATE' THEN
        IF NEW.user_id <> OLD.user_id OR NEW.token_hash <> OLD.token_hash THEN
            RAISE EXCEPTION 'user_sessions_immutable_identity_violation: user_id and token_hash cannot be modified';
        END IF;

        -- Invariant 4 : une session revoquee ne peut JAMAIS etre reactivee
        IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS NULL THEN
            RAISE EXCEPTION 'user_sessions_cannot_reactivate_revoked: a revoked session cannot be reactivated';
        END IF;

        -- Invariant 2 : une session qui a deja un successeur ne peut pas changer de successeur (sauf mise a NULL sur suppression)
        IF OLD.replaced_by_session_id IS NOT NULL AND NEW.replaced_by_session_id IS NOT NULL AND NEW.replaced_by_session_id <> OLD.replaced_by_session_id THEN
            RAISE EXCEPTION 'user_sessions_single_successor_violation: session successor cannot be reassigned';
        END IF;

        -- Invariant 5 : une session deja expiree ne peut pas recevoir un successeur de rotation
        IF OLD.replaced_by_session_id IS NULL AND NEW.replaced_by_session_id IS NOT NULL AND OLD.expires_at <= CURRENT_TIMESTAMP THEN
            RAISE EXCEPTION 'user_sessions_expired_cannot_rotate: an expired session cannot be rotated';
        END IF;
    END IF;

    -- Invariant 3 : le successeur doit obligatoirement appartenir au meme utilisateur
    IF NEW.replaced_by_session_id IS NOT NULL THEN
        SELECT user_id INTO successor_user_id FROM "user_sessions" WHERE id = NEW.replaced_by_session_id;
        IF successor_user_id IS NULL OR successor_user_id <> NEW.user_id THEN
            RAISE EXCEPTION 'user_sessions_cross_user_rotation_violation: successor session must belong to the same user';
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_enforce_user_session_invariants
BEFORE INSERT OR UPDATE ON "user_sessions"
FOR EACH ROW EXECUTE FUNCTION enforce_user_session_invariants();
