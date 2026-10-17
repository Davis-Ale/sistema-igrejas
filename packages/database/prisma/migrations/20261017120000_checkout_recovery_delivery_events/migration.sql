-- Additive only. No backfill, live route activation or credential storage.
CREATE TYPE "EventCheckoutRecoveryDeliveryStage" AS ENUM
  ('PREPARED', 'DELIVERY_INTENT', 'DELIVERY_ACCEPTED', 'DELIVERY_UNCERTAIN', 'DELIVERY_RECONCILED_ACCEPTED');

CREATE TABLE "EventCheckoutRecoveryDeliveryEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" BIGSERIAL NOT NULL UNIQUE,
  "churchId" TEXT NOT NULL,
  "operationId" UUID NOT NULL,
  "stage" "EventCheckoutRecoveryDeliveryStage" NOT NULL,
  "requestFingerprint" VARCHAR(64) NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "receiptReference" VARCHAR(120),
  "evidenceReference" VARCHAR(120),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "checkout_delivery_operation_stage_key" UNIQUE ("churchId", "operationId", "stage"),
  CONSTRAINT "checkout_delivery_recovery_fkey" FOREIGN KEY ("churchId", "operationId")
    REFERENCES "EventCheckoutRecoveryAudit" ("churchId", "operationId") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "checkout_delivery_actor_fkey" FOREIGN KEY ("churchId", "actorUserId")
    REFERENCES "UserAccount" ("churchId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "checkout_delivery_fingerprint_check" CHECK ("requestFingerprint" ~ '^[a-f0-9]{64}$'),
  CONSTRAINT "checkout_delivery_reference_check" CHECK (
    ("receiptReference" IS NULL OR ("receiptReference" ~ '^[A-Za-z][A-Za-z0-9_-]{2,119}$' AND "receiptReference" !~ '^(ec2_|sik_)')) AND
    ("evidenceReference" IS NULL OR ("evidenceReference" ~ '^[A-Za-z][A-Za-z0-9_-]{2,119}$' AND "evidenceReference" !~ '^(ec2_|sik_)'))),
  CONSTRAINT "checkout_delivery_receipt_check" CHECK (
    ("stage" IN ('PREPARED', 'DELIVERY_INTENT') AND "receiptReference" IS NULL AND "evidenceReference" IS NULL) OR
    ("stage" = 'DELIVERY_ACCEPTED' AND "receiptReference" IS NOT NULL AND "evidenceReference" IS NULL) OR
    ("stage" = 'DELIVERY_UNCERTAIN' AND "evidenceReference" IS NULL) OR
    ("stage" = 'DELIVERY_RECONCILED_ACCEPTED' AND "receiptReference" IS NOT NULL AND "evidenceReference" IS NOT NULL))
);
CREATE INDEX "checkout_delivery_history_idx" ON "EventCheckoutRecoveryDeliveryEvent" ("churchId", "operationId", "sequence");

CREATE FUNCTION checkout_delivery_validate_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent "EventCheckoutRecoveryAudit"%ROWTYPE;
previous "EventCheckoutRecoveryDeliveryEvent"%ROWTYPE;
BEGIN
  -- Parent row lock serializes even writers that bypass the application adapter.
  SELECT * INTO parent FROM "EventCheckoutRecoveryAudit"
    WHERE "churchId" = NEW."churchId" AND "operationId" = NEW."operationId" FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'checkout_delivery_parent_required' USING ERRCODE = '23503'; END IF;
  IF parent."action" NOT IN ('RECOVER', 'REISSUE') OR parent."verificationMethod" <> 'ASSISTED_VERIFIED_EMAIL_V1'
    OR parent."actorUserId" <> NEW."actorUserId" THEN
    RAISE EXCEPTION 'checkout_delivery_parent_invalid' USING ERRCODE = '23514';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "UserAccount" WHERE "churchId" = NEW."churchId" AND "id" = NEW."actorUserId"
    AND "role" = 'SUPER_ADMIN' AND "status" = 'ACTIVE') THEN
    RAISE EXCEPTION 'checkout_delivery_actor_invalid' USING ERRCODE = '23514';
  END IF;
  SELECT * INTO previous FROM "EventCheckoutRecoveryDeliveryEvent"
    WHERE "churchId" = NEW."churchId" AND "operationId" = NEW."operationId" ORDER BY "sequence" DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW."stage" <> 'PREPARED' THEN RAISE EXCEPTION 'checkout_delivery_preparation_required' USING ERRCODE = '23514'; END IF;
  ELSE
    IF previous."requestFingerprint" <> NEW."requestFingerprint" OR NEW."createdAt" < previous."createdAt" THEN
      RAISE EXCEPTION 'checkout_delivery_binding_invalid' USING ERRCODE = '23514';
    END IF;
    IF NOT ((previous."stage" = 'PREPARED' AND NEW."stage" = 'DELIVERY_INTENT') OR
      (previous."stage" = 'DELIVERY_INTENT' AND NEW."stage" IN ('DELIVERY_ACCEPTED', 'DELIVERY_UNCERTAIN', 'DELIVERY_RECONCILED_ACCEPTED')) OR
      (previous."stage" = 'DELIVERY_UNCERTAIN' AND NEW."stage" = 'DELIVERY_RECONCILED_ACCEPTED')) THEN
      RAISE EXCEPTION 'checkout_delivery_transition_invalid' USING ERRCODE = '23514';
    END IF;
    IF previous."receiptReference" IS NOT NULL AND NEW."receiptReference" IS DISTINCT FROM previous."receiptReference" THEN
      RAISE EXCEPTION 'checkout_delivery_receipt_conflict' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER checkout_delivery_insert BEFORE INSERT ON "EventCheckoutRecoveryDeliveryEvent"
  FOR EACH ROW EXECUTE FUNCTION checkout_delivery_validate_insert();

CREATE FUNCTION checkout_delivery_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'checkout_delivery_append_only' USING ERRCODE = '23514'; END; $$;
CREATE TRIGGER checkout_delivery_no_mutation BEFORE UPDATE OR DELETE ON "EventCheckoutRecoveryDeliveryEvent"
  FOR EACH ROW EXECUTE FUNCTION checkout_delivery_immutable();
CREATE TRIGGER checkout_delivery_no_truncate BEFORE TRUNCATE ON "EventCheckoutRecoveryDeliveryEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION checkout_delivery_immutable();

-- A linked event must not acquire another scope/access/actor by editing its parent.
-- Existing recovery rows without delivery history retain their prior behavior.
CREATE FUNCTION checkout_delivery_parent_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM "EventCheckoutRecoveryDeliveryEvent"
    WHERE "churchId" = OLD."churchId" AND "operationId" = OLD."operationId") THEN
    RAISE EXCEPTION 'checkout_delivery_parent_append_only' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER checkout_delivery_parent_no_update BEFORE UPDATE ON "EventCheckoutRecoveryAudit"
  FOR EACH ROW EXECUTE FUNCTION checkout_delivery_parent_immutable();
