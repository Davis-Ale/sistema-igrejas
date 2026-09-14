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

export const eventsFinancialOperationTypeSchema = z.enum(["REFUND"]);

export const eventsFinancialOperationStatusSchema = z.enum([
  "REQUESTED",
  "PENDING",
  "CONFIRMED",
  "FAILED"
]);

export const listEventsFinancialOperationsQuerySchema = z.object({
  type: eventsFinancialOperationTypeSchema.optional(),
  status: eventsFinancialOperationStatusSchema.optional(),
  eventId: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const listRefundableEventPaymentsQuerySchema = z.object({
  eventId: z.preprocess(emptyToUndefined, z.string().trim().min(1).optional()),
  page: z.coerce.number().int().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional()
});

export const createEventsFinancialRefundSchema = z.object({
  transactionId: z.string().trim().min(1, "Informe a movimentação a estornar.")
});

export type ListEventsFinancialOperationsQueryInput = z.infer<
  typeof listEventsFinancialOperationsQuerySchema
>;
export type ListRefundableEventPaymentsQueryInput = z.infer<
  typeof listRefundableEventPaymentsQuerySchema
>;
export type CreateEventsFinancialRefundInput = z.infer<
  typeof createEventsFinancialRefundSchema
>;
