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

export const updateMemberSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: z.string().trim().min(1).optional(),
  email: z.string().trim().email().nullable().optional(),
  campusId: z.string().trim().min(1).nullable().optional()
}).strict().refine(value => Object.keys(value).length > 0, "Informe ao menos um campo.");

export const linkMemberAccountSchema = z.object({ accountId: z.string().trim().min(1) }).strict();
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
