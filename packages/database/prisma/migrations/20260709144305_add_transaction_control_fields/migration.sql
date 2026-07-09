-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'REVERSED');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'VISITOR';

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledByUserId" TEXT,
ADD COLUMN     "reversalTransactionId" TEXT,
ADD COLUMN     "status" "TxStatus" NOT NULL DEFAULT 'ACTIVE';

-- CreateIndex
CREATE INDEX "Transaction_churchId_status_idx" ON "Transaction"("churchId", "status");

-- CreateIndex
CREATE INDEX "Transaction_churchId_cancelledByUserId_idx" ON "Transaction"("churchId", "cancelledByUserId");

-- CreateIndex
CREATE INDEX "Transaction_churchId_reversalTransactionId_idx" ON "Transaction"("churchId", "reversalTransactionId");
