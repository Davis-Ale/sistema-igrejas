import { z } from "zod";

export const createEventApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome da chave é obrigatório.")
    .max(80, "Nome deve ter até 80 caracteres.")
});

export type CreateEventApiKeyInput = z.infer<
  typeof createEventApiKeySchema
>;
