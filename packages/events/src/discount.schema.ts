import { z } from "zod";

const discountCodePattern = /^[A-Z0-9_-]+$/;

export const discountCodeSchema = z
  .string()
  .trim()
  .min(3, "Código deve ter entre 3 e 32 caracteres.")
  .max(32, "Código deve ter entre 3 e 32 caracteres.")
  .transform((value) => value.toUpperCase())
  .refine(
    (value) => discountCodePattern.test(value),
    "Código deve conter apenas letras, números, hífen ou sublinhado."
  );

export const createEventDiscountSchema = z.object({
  ticketId: z.string().trim().min(1, "Ingresso é obrigatório."),
  code: discountCodeSchema,
  finalPrice: z.coerce
    .number()
    .positive("Preço final deve ser maior que zero."),
  isActive: z.boolean().optional()
});

export const updateEventDiscountSchema = z
  .object({
    ticketId: z.string().trim().min(1, "Ingresso é obrigatório.").optional(),
    code: discountCodeSchema.optional(),
    finalPrice: z.coerce
      .number()
      .positive("Preço final deve ser maior que zero.")
      .optional(),
    isActive: z.boolean().optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

export const validatePublicDiscountSchema = z.object({
  code: z.string().trim().min(1).max(32),
  ticketId: z.string().trim().min(1, "Ingresso é obrigatório."),
  ticketBatchId: z.string().trim().min(1, "Lote é obrigatório.")
});

export const eventDiscountParamsSchema = z.object({
  eventId: z.string().trim().min(1, "Evento é obrigatório."),
  discountId: z.string().trim().min(1, "Desconto é obrigatório.")
});

export type CreateEventDiscountInput = z.infer<
  typeof createEventDiscountSchema
>;
export type UpdateEventDiscountInput = z.infer<
  typeof updateEventDiscountSchema
>;
export type ValidatePublicDiscountInput = z.infer<
  typeof validatePublicDiscountSchema
>;
