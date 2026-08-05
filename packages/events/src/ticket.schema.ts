import { z } from "zod";

export const createEventTicketSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome do ingresso é obrigatório.")
    .max(80, "Nome do ingresso deve ter até 80 caracteres."),
  description: z
    .string()
    .trim()
    .max(500, "Descrição deve ter até 500 caracteres.")
    .optional(),
  isFree: z.boolean(),
  isVisible: z.boolean().default(true)
});

export const createTicketBatchSchema = z
  .object({
    ticketId: z.string().trim().min(1, "Ingresso é obrigatório."),
    name: z
      .string()
      .trim()
      .min(1, "Nome do lote é obrigatório.")
      .max(80, "Nome do lote deve ter até 80 caracteres."),
    quantity: z.coerce
      .number()
      .int()
      .positive("Quantidade deve ser maior que zero."),
    price: z.coerce
      .number()
      .min(0, "Preço não pode ser negativo."),
    salesStart: z.coerce.date(),
    salesEnd: z.coerce.date(),
    isVisible: z.boolean().default(true)
  })
  .refine(
    (input) => input.salesEnd > input.salesStart,
    {
      message:
        "O término das vendas deve ser posterior ao início.",
      path: ["salesEnd"]
    }
  );

export type CreateEventTicketInput = z.infer<
  typeof createEventTicketSchema
>;

export type CreateTicketBatchInput = z.infer<
  typeof createTicketBatchSchema
>;
