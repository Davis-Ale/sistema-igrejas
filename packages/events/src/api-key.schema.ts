import { z } from "zod";

export const EVENT_API_KEY_SCOPES = [
  "events:read",
  "registrations:read",
  "participants:read"
] as const;

export const eventApiKeyScopeSchema = z.enum(EVENT_API_KEY_SCOPES);

export const createEventApiKeySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Nome da chave é obrigatório.")
    .max(80, "Nome deve ter até 80 caracteres."),
  description: z
    .string()
    .trim()
    .max(240, "Descrição deve ter até 240 caracteres.")
    .optional(),
  scopes: z
    .array(eventApiKeyScopeSchema)
    .min(1, "Informe ao menos um escopo.")
});

export const eventApiKeyIdParamsSchema = z.object({
  apiKeyId: z.string().trim().min(1, "Chave de API é obrigatória.")
});

export type EventApiKeyScope = z.infer<typeof eventApiKeyScopeSchema>;
export type CreateEventApiKeyInput = z.infer<typeof createEventApiKeySchema>;
