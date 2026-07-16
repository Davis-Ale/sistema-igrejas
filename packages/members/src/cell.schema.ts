import { z } from "zod";

const optionalTextSchema = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return value;
    }

    const trimmedValue = value.trim();

    return trimmedValue.length > 0 ? trimmedValue : undefined;
  },
  z.string().optional()
);

export const createCellSchema = z
  .object({
    campusId: optionalTextSchema,
    leaderId: z.string().trim().min(1, "Líder é obrigatório."),
    name: optionalTextSchema,
    region: optionalTextSchema,
    state: optionalTextSchema,
    city: optionalTextSchema,
    neighborhood: optionalTextSchema,
    meetDay: z.string().trim().min(1, "Dia de encontro é obrigatório."),
    meetTime: z.string().trim().min(1, "Horário é obrigatório."),
    profile: z.string().trim().min(1, "Tipo ou perfil da célula é obrigatório.")
  })
  .superRefine((input, context) => {
    const hasStructuredLocation =
      Boolean(input.state) &&
      Boolean(input.city) &&
      Boolean(input.neighborhood);

    if (!input.region && !hasStructuredLocation) {
      context.addIssue({
        code: "custom",
        message: "Informe UF, cidade e bairro.",
        path: ["neighborhood"]
      });
    }
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
