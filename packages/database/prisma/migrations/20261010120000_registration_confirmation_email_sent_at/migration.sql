-- Delivery is recorded only after the confirmation email provider accepts it.
ALTER TABLE "Registration" ADD COLUMN "confirmationEmailSentAt" TIMESTAMP(3);
