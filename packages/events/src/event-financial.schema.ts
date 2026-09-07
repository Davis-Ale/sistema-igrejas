import { z } from "zod";

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
};

export const eventFinancialMethodSchema = z.enum([
  "PIX",
  "CARD",
  "CASH",
  "BOLETO"
]);

export const eventFinancialPaymentStatusSchema = z.enum([
  "PAID",
  "PENDING",
  "NO_CHARGE",
  "REFUND_PENDING",
  "CANCELLED",
  "REFUNDED"
]);

const eventFinancialFilterFields = {
  eventId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  method: eventFinancialMethodSchema.optional(),
  search: z.preprocess(
    emptyToUndefined,
    z.string().trim().max(120).optional()
  ),
  paymentStatus: eventFinancialPaymentStatusSchema.optional()
};

export const eventFinancialSummaryQuerySchema = z.object(
  eventFinancialFilterFields
);

export const eventFinancialListQuerySchema = z.object({
  ...eventFinancialFilterFields,
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const eventFinancialExportQuerySchema = eventFinancialListQuerySchema.omit({
  page: true,
  limit: true
});

export type EventFinancialSummaryQueryInput = z.infer<
  typeof eventFinancialSummaryQuerySchema
>;
export type EventFinancialListQueryInput = z.infer<
  typeof eventFinancialListQuerySchema
>;
export type EventFinancialExportQueryInput = z.infer<
  typeof eventFinancialExportQuerySchema
>;
