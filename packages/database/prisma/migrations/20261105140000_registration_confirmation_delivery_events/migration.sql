-- Additive only. No backfill, credential storage, actor, fingerprint or receipt.
-- Does not freeze Registration: check-in and confirmationEmailSentAt stay writable.
CREATE TYPE "EventRegistrationConfirmationDeliveryStage" AS ENUM
  ('DELIVERY_INTENT', 'DELIVERY_ACCEPTED', 'DELIVERY_UNCERTAIN');

CREATE TABLE "EventRegistrationConfirmationDeliveryEvent" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sequence" BIGSERIAL NOT NULL UNIQUE,
  "churchId" TEXT NOT NULL,
  "eventId" TEXT NOT NULL,
  "registrationId" TEXT NOT NULL,
  "stage" "EventRegistrationConfirmationDeliveryStage" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "registration_confirmation_delivery_stage_key" UNIQUE ("churchId", "eventId", "registrationId", "stage"),
  CONSTRAINT "registration_confirmation_delivery_registration_fkey" FOREIGN KEY ("churchId", "eventId", "registrationId")
    REFERENCES "Registration" ("churchId", "eventId", "id") ON DELETE RESTRICT ON UPDATE RESTRICT
);
CREATE INDEX "registration_confirmation_delivery_history_idx"
  ON "EventRegistrationConfirmationDeliveryEvent" ("churchId", "eventId", "registrationId", "sequence");

CREATE FUNCTION registration_confirmation_delivery_validate_insert() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  previous_stage "EventRegistrationConfirmationDeliveryStage";
  previous_at TIMESTAMP(3);
BEGIN
  -- Parent row lock serializes writers that bypass the application adapter.
  -- The row itself is not copied, so check-in token and e-mail stay out of this function.
  PERFORM 1 FROM "Registration"
    WHERE "churchId" = NEW."churchId" AND "eventId" = NEW."eventId" AND "id" = NEW."registrationId"
    FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'registration_confirmation_delivery_parent_required' USING ERRCODE = '23503';
  END IF;
  SELECT "stage", "createdAt" INTO previous_stage, previous_at
    FROM "EventRegistrationConfirmationDeliveryEvent"
    WHERE "churchId" = NEW."churchId" AND "eventId" = NEW."eventId" AND "registrationId" = NEW."registrationId"
    ORDER BY "sequence" DESC LIMIT 1;
  IF NOT FOUND THEN
    IF NEW."stage" <> 'DELIVERY_INTENT' THEN
      RAISE EXCEPTION 'registration_confirmation_delivery_intent_required' USING ERRCODE = '23514';
    END IF;
  ELSE
    IF NEW."createdAt" < previous_at THEN
      RAISE EXCEPTION 'registration_confirmation_delivery_order_invalid' USING ERRCODE = '23514';
    END IF;
    IF previous_stage <> 'DELIVERY_INTENT' OR NEW."stage" NOT IN ('DELIVERY_ACCEPTED', 'DELIVERY_UNCERTAIN') THEN
      RAISE EXCEPTION 'registration_confirmation_delivery_transition_invalid' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER registration_confirmation_delivery_insert
  BEFORE INSERT ON "EventRegistrationConfirmationDeliveryEvent"
  FOR EACH ROW EXECUTE FUNCTION registration_confirmation_delivery_validate_insert();

CREATE FUNCTION registration_confirmation_delivery_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'registration_confirmation_delivery_append_only' USING ERRCODE = '23514'; END; $$;
CREATE TRIGGER registration_confirmation_delivery_no_mutation
  BEFORE UPDATE OR DELETE ON "EventRegistrationConfirmationDeliveryEvent"
  FOR EACH ROW EXECUTE FUNCTION registration_confirmation_delivery_immutable();
CREATE TRIGGER registration_confirmation_delivery_no_truncate
  BEFORE TRUNCATE ON "EventRegistrationConfirmationDeliveryEvent"
  FOR EACH STATEMENT EXECUTE FUNCTION registration_confirmation_delivery_immutable();
