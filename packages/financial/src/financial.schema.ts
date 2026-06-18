import { z } from "zod";

export const txTypeSchema = z.enum([
  "TITHE",
  "OFFERING",
  "EVENT",
  "EXPENSE",
  "OTHER"
]);

export const txDirectionSchema = z.enum([
  "IN",
  "OUT"
]);

export const payMethodSchema = z.enum([
  "PIX",
  "CARD",
  "CASH",
  "BOLETO"
]);

export const createTransactionSchema = z.object({
  campusId: z.string().trim().min(1).optional(),
  cnpj: z.string().trim().min(1).optional(),
  personId: z.string().trim().min(1).optional(),
  eventId: z.string().trim().min(1).optional(),
  type: txTypeSchema,
  direction: txDirectionSchema,
  amount: z.coerce.number().positive("Valor deve ser maior que zero."),
  method: payMethodSchema,
  costCenter: z.string().trim().min(1, "Centro de custo é obrigatório."),
  asaasId: z.string().trim().min(1).optional(),
  nfseId: z.string().trim().min(1).optional(),
  at: z.coerce.date().optional()
});

export const updateTransactionSchema = createTransactionSchema.partial();

export const listTransactionsQuerySchema = z.object({
  type: txTypeSchema.optional(),
  direction: txDirectionSchema.optional(),
  method: payMethodSchema.optional(),
  costCenter: z.string().trim().min(1).optional(),
  personId: z.string().trim().min(1).optional(),
  eventId: z.string().trim().min(1).optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional()
});

export const transactionParamsSchema = z.object({
  transactionId: z.string().trim().min(1)
});

export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
export type UpdateTransactionInput = z.infer<typeof updateTransactionSchema>;
export type ListTransactionsQueryInput = z.infer<typeof listTransactionsQuerySchema>;
