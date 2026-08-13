-- AlterTable
ALTER TABLE "Registration" ADD COLUMN     "orderId" TEXT;

-- CreateTable
CREATE TABLE "EventOrder" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventPayment" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerPaymentId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "amount" DECIMAL(12,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventOrder_churchId_idx" ON "EventOrder"("churchId");

-- CreateIndex
CREATE INDEX "EventOrder_churchId_eventId_idx" ON "EventOrder"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "EventOrder_churchId_status_idx" ON "EventOrder"("churchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "EventPayment_transactionId_key" ON "EventPayment"("transactionId");

-- CreateIndex
CREATE INDEX "EventPayment_churchId_idx" ON "EventPayment"("churchId");

-- CreateIndex
CREATE INDEX "EventPayment_churchId_eventId_idx" ON "EventPayment"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "EventPayment_churchId_orderId_idx" ON "EventPayment"("churchId", "orderId");

-- CreateIndex
CREATE INDEX "EventPayment_churchId_status_idx" ON "EventPayment"("churchId", "status");

-- CreateIndex
CREATE INDEX "EventPayment_churchId_provider_idx" ON "EventPayment"("churchId", "provider");

-- CreateIndex
CREATE INDEX "EventPayment_churchId_providerPaymentId_idx" ON "EventPayment"("churchId", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "EventPayment_provider_providerPaymentId_key" ON "EventPayment"("provider", "providerPaymentId");

-- CreateIndex
CREATE INDEX "Registration_churchId_orderId_idx" ON "Registration"("churchId", "orderId");

-- AddForeignKey
ALTER TABLE "Registration" ADD CONSTRAINT "Registration_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EventOrder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventOrder" ADD CONSTRAINT "EventOrder_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "EventOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "Transaction"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
