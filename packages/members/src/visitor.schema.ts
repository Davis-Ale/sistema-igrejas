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

export const createVisitorSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  email: optionalTextSchema,
  campusId: optionalTextSchema
});

export const listVisitorsQuerySchema = z.object({
  search: optionalTextSchema
});

export type CreateVisitorInput = z.infer<typeof createVisitorSchema>;
export type ListVisitorsQueryInput = z.infer<typeof listVisitorsQuerySchema>;
