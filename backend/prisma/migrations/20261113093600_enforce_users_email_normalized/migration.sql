-- Normalise les e-mails existants (trim + lowercase)
UPDATE "users" SET "email" = LOWER(BTRIM("email")) WHERE "email" <> LOWER(BTRIM("email"));

-- Index unique insensible a la casse et aux espaces peripheriques
CREATE UNIQUE INDEX "users_email_lower_key" ON "users" (LOWER(BTRIM("email")));

-- Contrainte CHECK garantissant que tout e-mail stocke dans users est normalise
ALTER TABLE "users" ADD CONSTRAINT "users_email_normalized_chk" CHECK ("email" = LOWER(BTRIM("email")) AND LENGTH("email") >= 3);
