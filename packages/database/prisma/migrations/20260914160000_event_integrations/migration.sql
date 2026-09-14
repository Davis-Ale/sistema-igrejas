-- CreateEnum
CREATE TYPE "EventIntegrationProvider" AS ENUM (
  'GOOGLE_ANALYTICS',
  'GOOGLE_ADS',
  'META_PIXEL',
  'WHATSAPP_BUSINESS_CLOUD',
  'MAILCHIMP',
  'RD_STATION'
);

-- CreateEnum
CREATE TYPE "EventIntegrationStatus" AS ENUM (
  'DISCONNECTED',
  'CONNECTED',
  'ERROR'
);

-- CreateTable
CREATE TABLE "EventIntegration" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "provider" "EventIntegrationProvider" NOT NULL,
    "status" "EventIntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "publicConfig" JSONB,
    "encryptedSecrets" TEXT,
    "secretHint" TEXT,
    "lastError" TEXT,
    "connectedAt" TIMESTAMP(3),
    "disconnectedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventIntegration_churchId_provider_key" ON "EventIntegration"("churchId", "provider");

-- CreateIndex
CREATE INDEX "EventIntegration_churchId_idx" ON "EventIntegration"("churchId");

-- AddForeignKey
ALTER TABLE "EventIntegration" ADD CONSTRAINT "EventIntegration_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;
