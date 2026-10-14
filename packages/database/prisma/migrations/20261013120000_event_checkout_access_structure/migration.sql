-- STRUCTURAL CUT ONLY: not applied; no backfill or legacy access conversion.
-- All data operations and route activation require subsequent authorized cuts.
-- CreateEnum
CREATE TYPE "EventCheckoutAccessSource" AS ENUM ('PUBLIC_ATTEMPT', 'ADMIN_RECOVERY');

-- CreateEnum
CREATE TYPE "EventCheckoutPaymentMethod" AS ENUM ('PIX', 'CREDIT_CARD', 'DEBIT_CARD');

-- CreateEnum
CREATE TYPE "EventCheckoutRecoveryAction" AS ENUM ('RECOVER', 'REISSUE', 'REVOKE');

-- CreateEnum
CREATE TYPE "EventCheckoutChargeAttemptState" AS ENUM ('STARTED', 'SUCCEEDED', 'UNCERTAIN');

-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "checkoutEmail" VARCHAR(254);

-- CreateTable
CREATE TABLE "EventCheckoutAccess" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "credentialHash" VARCHAR(64) NOT NULL,
    "source" "EventCheckoutAccessSource" NOT NULL,
    "requestFingerprint" VARCHAR(64),
    "requestedPaymentMethod" "EventCheckoutPaymentMethod",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "EventCheckoutAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCheckoutRecoveryAudit" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "accessId" TEXT NOT NULL,
    "operationId" UUID NOT NULL,
    "requestFingerprint" VARCHAR(64) NOT NULL,
    "action" "EventCheckoutRecoveryAction" NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" "Role" NOT NULL,
    "ownershipVerified" BOOLEAN,
    "verificationMethod" VARCHAR(120),
    "evidenceReference" VARCHAR(160),
    "verifiedChannelReference" VARCHAR(160),
    "reason" VARCHAR(160),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCheckoutRecoveryAudit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCheckoutChargeAttempt" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "eventPaymentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "requestedMethod" "EventCheckoutPaymentMethod" NOT NULL,
    "state" "EventCheckoutChargeAttemptState" NOT NULL DEFAULT 'STARTED',
    "providerPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCheckoutChargeAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventCheckoutAccess_credentialHash_key" ON "EventCheckoutAccess"("credentialHash");

-- CreateIndex
CREATE INDEX "EventCheckoutAccess_churchId_eventId_registrationId_idx" ON "EventCheckoutAccess"("churchId", "eventId", "registrationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCheckoutAccess_churchId_eventId_registrationId_id_key" ON "EventCheckoutAccess"("churchId", "eventId", "registrationId", "id");

-- CreateIndex
CREATE INDEX "EventCheckoutRecoveryAudit_churchId_eventId_registrationId__idx" ON "EventCheckoutRecoveryAudit"("churchId", "eventId", "registrationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventCheckoutRecoveryAudit_churchId_operationId_key" ON "EventCheckoutRecoveryAudit"("churchId", "operationId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCheckoutChargeAttempt_eventPaymentId_key" ON "EventCheckoutChargeAttempt"("eventPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventCheckoutChargeAttempt_transactionId_key" ON "EventCheckoutChargeAttempt"("transactionId");

-- CreateIndex
CREATE INDEX "EventCheckoutChargeAttempt_churchId_eventId_idx" ON "EventCheckoutChargeAttempt"("churchId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "checkout_charge_payment_scope_key" ON "EventCheckoutChargeAttempt"("churchId", "eventId", "eventPaymentId", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "Registration_churchId_eventId_id_key" ON "Registration"("churchId", "eventId", "id");

-- CreateIndex
CREATE UNIQUE INDEX "EventPayment_churchId_eventId_id_transactionId_key" ON "EventPayment"("churchId", "eventId", "id", "transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "UserAccount_churchId_id_key" ON "UserAccount"("churchId", "id");

-- AddForeignKey
ALTER TABLE "EventCheckoutAccess" ADD CONSTRAINT "EventCheckoutAccess_churchId_eventId_registrationId_fkey" FOREIGN KEY ("churchId", "eventId", "registrationId") REFERENCES "Registration"("churchId", "eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCheckoutRecoveryAudit" ADD CONSTRAINT "checkout_recovery_registration_fkey" FOREIGN KEY ("churchId", "eventId", "registrationId") REFERENCES "Registration"("churchId", "eventId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCheckoutRecoveryAudit" ADD CONSTRAINT "checkout_recovery_access_fkey" FOREIGN KEY ("churchId", "eventId", "registrationId", "accessId") REFERENCES "EventCheckoutAccess"("churchId", "eventId", "registrationId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCheckoutRecoveryAudit" ADD CONSTRAINT "EventCheckoutRecoveryAudit_churchId_actorUserId_fkey" FOREIGN KEY ("churchId", "actorUserId") REFERENCES "UserAccount"("churchId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventCheckoutChargeAttempt" ADD CONSTRAINT "EventCheckoutChargeAttempt_churchId_eventId_eventPaymentId_fkey" FOREIGN KEY ("churchId", "eventId", "eventPaymentId", "transactionId") REFERENCES "EventPayment"("churchId", "eventId", "id", "transactionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prisma does not represent these CHECK constraints or the partial unique index.
-- Keep this SQL when preparing later migrations; do not infer any legacy grant.
ALTER TABLE "Registration" ADD CONSTRAINT "checkout_email_nonblank_check"
    CHECK ("checkoutEmail" IS NULL OR length(btrim("checkoutEmail")) > 0);

ALTER TABLE "EventCheckoutAccess" ADD CONSTRAINT "checkout_access_hash_check"
    CHECK ("credentialHash" ~ '^[a-f0-9]{64}$');
ALTER TABLE "EventCheckoutAccess" ADD CONSTRAINT "checkout_access_ttl_check"
    CHECK ("expiresAt" = "createdAt" + INTERVAL '24 hours');
ALTER TABLE "EventCheckoutAccess" ADD CONSTRAINT "checkout_access_revocation_check"
    CHECK ("revokedAt" IS NULL OR "revokedAt" >= "createdAt");
ALTER TABLE "EventCheckoutAccess" ADD CONSTRAINT "checkout_access_source_check"
    CHECK (
        ("source" = 'PUBLIC_ATTEMPT'
            AND "requestFingerprint" IS NOT NULL
            AND "requestFingerprint" ~ '^[a-f0-9]{64}$'
            AND "requestedPaymentMethod" IS NOT NULL)
        OR
        ("source" = 'ADMIN_RECOVERY'
            AND "requestFingerprint" IS NULL
            AND "requestedPaymentMethod" IS NULL)
    );
-- Expiry never renews itself. Reissue must revoke an expired grant explicitly.
CREATE UNIQUE INDEX "checkout_access_one_unrevoked_key"
    ON "EventCheckoutAccess"("churchId", "eventId", "registrationId")
    WHERE "revokedAt" IS NULL;

ALTER TABLE "EventCheckoutRecoveryAudit" ADD CONSTRAINT "checkout_recovery_actor_check"
    CHECK ("actorRole" = 'SUPER_ADMIN');
ALTER TABLE "EventCheckoutRecoveryAudit" ADD CONSTRAINT "checkout_recovery_hash_check"
    CHECK ("requestFingerprint" ~ '^[a-f0-9]{64}$');
ALTER TABLE "EventCheckoutRecoveryAudit" ADD CONSTRAINT "checkout_recovery_evidence_check"
    CHECK (
        ("action" IN ('RECOVER', 'REISSUE')
            AND "ownershipVerified" IS TRUE
            AND "verificationMethod" IS NOT NULL AND length(btrim("verificationMethod")) >= 3
            AND "evidenceReference" IS NOT NULL AND length(btrim("evidenceReference")) >= 3
            AND "verifiedChannelReference" IS NOT NULL AND length(btrim("verifiedChannelReference")) >= 3
            AND "reason" IS NULL)
        OR
        ("action" = 'REVOKE'
            AND "ownershipVerified" IS NULL
            AND "verificationMethod" IS NULL
            AND "evidenceReference" IS NULL
            AND "verifiedChannelReference" IS NULL
            AND "reason" IS NOT NULL AND length(btrim("reason")) >= 3)
    );

ALTER TABLE "EventCheckoutChargeAttempt" ADD CONSTRAINT "checkout_charge_reference_check"
    CHECK (
        ("state" = 'STARTED' AND "providerPaymentId" IS NULL)
        OR ("state" = 'UNCERTAIN' AND ("providerPaymentId" IS NULL OR length(btrim("providerPaymentId")) > 0))
        OR ("state" = 'SUCCEEDED' AND "providerPaymentId" IS NOT NULL AND length(btrim("providerPaymentId")) > 0)
    );
