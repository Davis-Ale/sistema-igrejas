import { z } from "zod";

export const createTrailSchema = z.object({
  name: z.string().trim().min(1, "Nome do trilho é obrigatório."),
  isVolunteerGate: z.boolean().default(false)
});

export const createTrailStageSchema = z.object({
  trailId: z.string().trim().min(1, "Trilho é obrigatório."),
  label: z.string().trim().min(1, "Nome da etapa é obrigatório."),
  order: z.number().int().min(0, "Ordem deve ser maior ou igual a zero."),
  requiresEventId: z.string().trim().min(1).optional()
});

export const completeTrailStageSchema = z.object({
  personId: z.string().trim().min(1, "Pessoa é obrigatória."),
  stageId: z.string().trim().min(1, "Etapa é obrigatória.")
});

export type CreateTrailInput = z.infer<typeof createTrailSchema>;
export type CreateTrailStageInput = z.infer<typeof createTrailStageSchema>;
export type CompleteTrailStageInput = z.infer<typeof completeTrailStageSchema>;
