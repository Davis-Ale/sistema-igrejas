-- AlterTable
ALTER TABLE "Church" ADD COLUMN "platformFeePercent" DECIMAL(5,2);

-- CreateTable
CREATE TABLE "EventDiscount" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "finalPrice" DECIMAL(12,2) NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventDiscount_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "EventPayment" ADD COLUMN "platformFeePercent" DECIMAL(5,2);
ALTER TABLE "EventPayment" ADD COLUMN "platformFeeAmount" DECIMAL(12,2);
ALTER TABLE "EventPayment" ADD COLUMN "netAmount" DECIMAL(12,2);
ALTER TABLE "EventPayment" ADD COLUMN "discountId" TEXT;
ALTER TABLE "EventPayment" ADD COLUMN "discountCode" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "EventDiscount_eventId_code_key" ON "EventDiscount"("eventId", "code");

-- CreateIndex
CREATE INDEX "EventDiscount_churchId_eventId_idx" ON "EventDiscount"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "EventDiscount_churchId_ticketId_idx" ON "EventDiscount"("churchId", "ticketId");

-- CreateIndex
CREATE INDEX "EventPayment_discountId_idx" ON "EventPayment"("discountId");

-- AddForeignKey
ALTER TABLE "EventDiscount" ADD CONSTRAINT "EventDiscount_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDiscount" ADD CONSTRAINT "EventDiscount_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventDiscount" ADD CONSTRAINT "EventDiscount_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventPayment" ADD CONSTRAINT "EventPayment_discountId_fkey" FOREIGN KEY ("discountId") REFERENCES "EventDiscount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
