ALTER TABLE "Event" ADD COLUMN "description" TEXT;
ALTER TABLE "Event" ADD COLUMN "location" TEXT;

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_description_length_check"
  CHECK ("description" IS NULL OR char_length("description") <= 2000);

ALTER TABLE "Event"
  ADD CONSTRAINT "Event_location_length_check"
  CHECK ("location" IS NULL OR char_length("location") <= 200);
