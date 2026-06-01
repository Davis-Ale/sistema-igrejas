-- CreateTable
CREATE TABLE "TrialSignup" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "churchId" TEXT,
    "status" "TrialStatus" NOT NULL DEFAULT 'ACTIVE',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endsAt" TIMESTAMP(3),
    "convertedAt" TIMESTAMP(3),
    "blockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrialSignup_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TrialSignup_email_key" ON "TrialSignup"("email");

-- CreateIndex
CREATE INDEX "TrialSignup_churchId_idx" ON "TrialSignup"("churchId");

-- CreateIndex
CREATE INDEX "TrialSignup_email_idx" ON "TrialSignup"("email");

-- CreateIndex
CREATE INDEX "TrialSignup_status_idx" ON "TrialSignup"("status");

-- AddForeignKey
ALTER TABLE "TrialSignup" ADD CONSTRAINT "TrialSignup_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE SET NULL ON UPDATE CASCADE;
