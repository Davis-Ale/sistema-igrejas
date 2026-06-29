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

export const createMemberSchema = z.object({
  name: z.string().trim().min(1, "Nome é obrigatório."),
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  email: optionalTextSchema,
  campusId: optionalTextSchema
});

export const listMembersQuerySchema = z.object({
  search: optionalTextSchema
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
export type ListMembersQueryInput = z.infer<typeof listMembersQuerySchema>;
