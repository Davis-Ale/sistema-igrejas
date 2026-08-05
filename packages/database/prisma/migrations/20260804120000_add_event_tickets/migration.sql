CREATE TABLE "EventTicket" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isFree" BOOLEAN NOT NULL DEFAULT true,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TicketBatch" (
    "id" TEXT NOT NULL,
    "churchId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "ticketId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "salesStart" TIMESTAMP(3) NOT NULL,
    "salesEnd" TIMESTAMP(3) NOT NULL,
    "isVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TicketBatch_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Registration"
ADD COLUMN "ticketId" TEXT,
ADD COLUMN "ticketBatchId" TEXT;

CREATE UNIQUE INDEX "EventTicket_eventId_name_key"
ON "EventTicket"("eventId", "name");

CREATE INDEX "EventTicket_churchId_idx"
ON "EventTicket"("churchId");

CREATE INDEX "EventTicket_churchId_eventId_idx"
ON "EventTicket"("churchId", "eventId");

CREATE INDEX "EventTicket_churchId_isVisible_idx"
ON "EventTicket"("churchId", "isVisible");

CREATE UNIQUE INDEX "TicketBatch_ticketId_name_key"
ON "TicketBatch"("ticketId", "name");

CREATE INDEX "TicketBatch_churchId_idx"
ON "TicketBatch"("churchId");

CREATE INDEX "TicketBatch_churchId_eventId_idx"
ON "TicketBatch"("churchId", "eventId");

CREATE INDEX "TicketBatch_churchId_ticketId_idx"
ON "TicketBatch"("churchId", "ticketId");

CREATE INDEX "TicketBatch_churchId_salesStart_salesEnd_idx"
ON "TicketBatch"("churchId", "salesStart", "salesEnd");

CREATE INDEX "TicketBatch_churchId_isVisible_idx"
ON "TicketBatch"("churchId", "isVisible");

CREATE INDEX "Registration_churchId_ticketId_idx"
ON "Registration"("churchId", "ticketId");

CREATE INDEX "Registration_churchId_ticketBatchId_idx"
ON "Registration"("churchId", "ticketBatchId");

ALTER TABLE "EventTicket"
ADD CONSTRAINT "EventTicket_churchId_fkey"
FOREIGN KEY ("churchId")
REFERENCES "Church"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "EventTicket"
ADD CONSTRAINT "EventTicket_eventId_fkey"
FOREIGN KEY ("eventId")
REFERENCES "Event"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "TicketBatch"
ADD CONSTRAINT "TicketBatch_churchId_fkey"
FOREIGN KEY ("churchId")
REFERENCES "Church"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "TicketBatch"
ADD CONSTRAINT "TicketBatch_eventId_fkey"
FOREIGN KEY ("eventId")
REFERENCES "Event"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "TicketBatch"
ADD CONSTRAINT "TicketBatch_ticketId_fkey"
FOREIGN KEY ("ticketId")
REFERENCES "EventTicket"("id")
ON DELETE CASCADE
ON UPDATE CASCADE;

ALTER TABLE "Registration"
ADD CONSTRAINT "Registration_ticketId_fkey"
FOREIGN KEY ("ticketId")
REFERENCES "EventTicket"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;

ALTER TABLE "Registration"
ADD CONSTRAINT "Registration_ticketBatchId_fkey"
FOREIGN KEY ("ticketBatchId")
REFERENCES "TicketBatch"("id")
ON DELETE RESTRICT
ON UPDATE CASCADE;
