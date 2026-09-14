-- CreateTable
CREATE TABLE "EventsFinancialOperation" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "eventPaymentId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'BRL',
    "provider" TEXT NOT NULL DEFAULT 'ASAAS',
    "providerReference" TEXT,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventsFinancialOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventsFinancialOperationAudit" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "actorRole" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "providerReference" TEXT,
    "result" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventsFinancialOperationAudit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "EventsFinancialOperation_churchId_type_eventPaymentId_key" ON "EventsFinancialOperation"("churchId", "type", "eventPaymentId");

-- CreateIndex
CREATE INDEX "EventsFinancialOperation_churchId_createdAt_idx" ON "EventsFinancialOperation"("churchId", "createdAt");

-- CreateIndex
CREATE INDEX "EventsFinancialOperation_churchId_status_idx" ON "EventsFinancialOperation"("churchId", "status");

-- CreateIndex
CREATE INDEX "EventsFinancialOperation_churchId_transactionId_idx" ON "EventsFinancialOperation"("churchId", "transactionId");

-- CreateIndex
CREATE INDEX "EventsFinancialOperation_eventPaymentId_idx" ON "EventsFinancialOperation"("eventPaymentId");

-- CreateIndex
CREATE INDEX "EventsFinancialOperationAudit_churchId_createdAt_idx" ON "EventsFinancialOperationAudit"("churchId", "createdAt");

-- CreateIndex
CREATE INDEX "EventsFinancialOperationAudit_operationId_idx" ON "EventsFinancialOperationAudit"("operationId");

-- AddForeignKey
ALTER TABLE "EventsFinancialOperation" ADD CONSTRAINT "EventsFinancialOperation_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventsFinancialOperation" ADD CONSTRAINT "EventsFinancialOperation_eventPaymentId_fkey" FOREIGN KEY ("eventPaymentId") REFERENCES "EventPayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventsFinancialOperationAudit" ADD CONSTRAINT "EventsFinancialOperationAudit_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventsFinancialOperationAudit" ADD CONSTRAINT "EventsFinancialOperationAudit_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "EventsFinancialOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
