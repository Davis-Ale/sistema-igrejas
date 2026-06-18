import { z } from "zod";

export const asaasBillingTypeSchema = z.enum([
  "BOLETO",
  "PIX",
  "CREDIT_CARD"
]);

export const createAsaasChargeSchema = z.object({
  billingType: asaasBillingTypeSchema,
  customer: z.object({
    cpfCnpj: z.string().trim().min(1).optional(),
    email: z.string().trim().email().optional(),
    mobilePhone: z.string().trim().min(1).optional(),
    name: z.string().trim().min(1, "Nome do cliente é obrigatório.")
  }),
  description: z.string().trim().min(1).optional(),
  dueDate: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de vencimento deve usar YYYY-MM-DD."),
  externalReference: z.string().trim().min(1, "Referência externa é obrigatória."),
  value: z.coerce.number().positive("Valor deve ser maior que zero.")
});

export type CreateAsaasChargeInput = z.infer<typeof createAsaasChargeSchema>;
