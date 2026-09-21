CREATE TABLE "EventAppMapImage" (
    "eventId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "contentType" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "EventAppMapImage_pkey" PRIMARY KEY ("eventId"),
    CONSTRAINT "EventAppMapImage_contentType_check" CHECK ("contentType" IN ('image/png', 'image/jpeg')),
    CONSTRAINT "EventAppMapImage_size_check" CHECK (octet_length("data") BETWEEN 1 AND 5242880)
);
ALTER TABLE "EventAppMapImage" ADD CONSTRAINT "EventAppMapImage_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;
