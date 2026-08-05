-- CreateEnum
CREATE TYPE "EventFormFieldType" AS ENUM ('TEXT', 'PARAGRAPH', 'SELECT', 'SINGLE_CHOICE', 'MULTIPLE_CHOICE');

-- CreateTable
CREATE TABLE "EventFormField" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "EventFormFieldType" NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "isSensitive" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventFormField_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFormFieldOption" (
    "id" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventFormFieldOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventFormFieldTicket" (
    "fieldId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,

    CONSTRAINT "EventFormFieldTicket_pkey" PRIMARY KEY ("fieldId","ticketId")
);

-- CreateTable
CREATE TABLE "EventFormAnswer" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "registrationId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventFormAnswer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventFormField_churchId_idx" ON "EventFormField"("churchId");

-- CreateIndex
CREATE INDEX "EventFormField_churchId_eventId_idx" ON "EventFormField"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "EventFormField_churchId_eventId_isActive_idx" ON "EventFormField"("churchId", "eventId", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "EventFormField_eventId_order_key" ON "EventFormField"("eventId", "order");

-- CreateIndex
CREATE INDEX "EventFormFieldOption_fieldId_idx" ON "EventFormFieldOption"("fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFormFieldOption_fieldId_value_key" ON "EventFormFieldOption"("fieldId", "value");

-- CreateIndex
CREATE UNIQUE INDEX "EventFormFieldOption_fieldId_order_key" ON "EventFormFieldOption"("fieldId", "order");

-- CreateIndex
CREATE INDEX "EventFormFieldTicket_ticketId_idx" ON "EventFormFieldTicket"("ticketId");

-- CreateIndex
CREATE INDEX "EventFormAnswer_churchId_idx" ON "EventFormAnswer"("churchId");

-- CreateIndex
CREATE INDEX "EventFormAnswer_churchId_eventId_idx" ON "EventFormAnswer"("churchId", "eventId");

-- CreateIndex
CREATE INDEX "EventFormAnswer_churchId_registrationId_idx" ON "EventFormAnswer"("churchId", "registrationId");

-- CreateIndex
CREATE INDEX "EventFormAnswer_churchId_fieldId_idx" ON "EventFormAnswer"("churchId", "fieldId");

-- CreateIndex
CREATE UNIQUE INDEX "EventFormAnswer_registrationId_fieldId_key" ON "EventFormAnswer"("registrationId", "fieldId");

-- AddForeignKey
ALTER TABLE "EventFormField" ADD CONSTRAINT "EventFormField_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormField" ADD CONSTRAINT "EventFormField_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormFieldOption" ADD CONSTRAINT "EventFormFieldOption_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EventFormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormFieldTicket" ADD CONSTRAINT "EventFormFieldTicket_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EventFormField"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormFieldTicket" ADD CONSTRAINT "EventFormFieldTicket_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "EventTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormAnswer" ADD CONSTRAINT "EventFormAnswer_churchId_fkey" FOREIGN KEY ("churchId") REFERENCES "Church"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormAnswer" ADD CONSTRAINT "EventFormAnswer_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormAnswer" ADD CONSTRAINT "EventFormAnswer_registrationId_fkey" FOREIGN KEY ("registrationId") REFERENCES "Registration"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventFormAnswer" ADD CONSTRAINT "EventFormAnswer_fieldId_fkey" FOREIGN KEY ("fieldId") REFERENCES "EventFormField"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
