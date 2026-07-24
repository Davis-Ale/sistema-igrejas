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

const cellDataSchema = z
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

export const createCellSchema = cellDataSchema;
export const updateCellSchema = cellDataSchema;

export const listCellsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ACTIVE"),
  neighborhood: optionalTextSchema,
  profile: optionalTextSchema,
  leader: optionalTextSchema
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
export type UpdateCellInput = z.infer<typeof updateCellSchema>;
export type ListCellsQuery = z.infer<typeof listCellsQuerySchema>;
export type AddPersonToCellInput = z.infer<typeof addPersonToCellSchema>;
export type RemovePersonFromCellInput = z.infer<
  typeof removePersonFromCellSchema
>;
