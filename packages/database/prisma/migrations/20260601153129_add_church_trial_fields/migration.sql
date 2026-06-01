-- CreateEnum
CREATE TYPE "ChurchStatus" AS ENUM ('TRIAL', 'ACTIVE', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TrialStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CONVERTED', 'BLOCKED');

-- AlterTable
ALTER TABLE "Church" ADD COLUMN     "blockReason" TEXT,
ADD COLUMN     "blockedAt" TIMESTAMP(3),
ADD COLUMN     "status" "ChurchStatus" NOT NULL DEFAULT 'TRIAL',
ADD COLUMN     "subscriptionEndsAt" TIMESTAMP(3),
ADD COLUMN     "subscriptionStartedAt" TIMESTAMP(3),
ADD COLUMN     "trialEndsAt" TIMESTAMP(3),
ADD COLUMN     "trialStartedAt" TIMESTAMP(3);
