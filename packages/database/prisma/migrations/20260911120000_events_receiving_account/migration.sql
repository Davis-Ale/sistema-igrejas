-- CreateTable
CREATE TABLE "EventsReceivingAccount" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'ASAAS',
    "providerAccountId" TEXT,
    "bankCode" TEXT NOT NULL,
    "bankAccountType" TEXT NOT NULL,
    "agency" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountDigit" TEXT NOT NULL,
    "ownerName" TEXT NOT NULL,
    "holderDocument" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "updatedByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventsReceivingAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventsReceivingAccountAudit" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "receivingAccountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "maskedSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventsReceivingAccountAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventsReceivingAccount_churchId_key" ON "EventsReceivingAccount"("churchId");

-- CreateIndex
CREATE INDEX "EventsReceivingAccount_churchId_idx" ON "EventsReceivingAccount"("churchId");

-- CreateIndex
CREATE INDEX "EventsReceivingAccountAudit_churchId_createdAt_idx" ON "EventsReceivingAccountAudit"("churchId", "createdAt");

-- CreateIndex
CREATE INDEX "EventsReceivingAccountAudit_receivingAccountId_idx" ON "EventsReceivingAccountAudit"("receivingAccountId");

-- AddForeignKey
ALTER TABLE "EventsReceivingAccount" ADD CONSTRAINT "EventsReceivingAccount_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventsReceivingAccountAudit" ADD CONSTRAINT "EventsReceivingAccountAudit_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventsReceivingAccountAudit" ADD CONSTRAINT "EventsReceivingAccountAudit_receivingAccountId_fkey" FOREIGN KEY ("receivingAccountId") REFERENCES "EventsReceivingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
