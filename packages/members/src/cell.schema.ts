import { z } from "zod";

export const createCellSchema = z.object({
  campusId: z.string().trim().min(1).optional(),
  leaderId: z.string().trim().min(1, "Líder é obrigatório."),
  name: z.string().trim().min(1, "Nome da célula é obrigatório."),
  region: z.string().trim().min(1, "Região é obrigatória."),
  meetDay: z.string().trim().min(1, "Dia de encontro é obrigatório."),
  meetTime: z.string().trim().min(1, "Horário é obrigatório."),
  profile: z.string().trim().min(1, "Tipo ou perfil da célula é obrigatório.")
});

export const addPersonToCellSchema = z.object({
  personId: z.string().trim().min(1, "Pessoa é obrigatória."),
  groupId: z.string().trim().min(1, "Célula é obrigatória."),
  canVolunteer: z.boolean().default(false)
});

export const removePersonFromCellSchema = z.object({
  personId: z.string().trim().min(1, "Pessoa é obrigatória."),
  groupId: z.string().trim().min(1, "Célula é obrigatória."),
  removalNote: z.string().trim().min(1).optional()
});

export type CreateCellInput = z.infer<typeof createCellSchema>;
export type AddPersonToCellInput = z.infer<typeof addPersonToCellSchema>;
export type RemovePersonFromCellInput = z.infer<typeof removePersonFromCellSchema>;
