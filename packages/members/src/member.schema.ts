import { z } from "zod";

export const createMemberSchema = z.object({
  campusId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "Nome é obrigatório."),
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  role: z.enum(["PASTOR", "LEADER", "VOLUNTEER", "MEMBER"]).default("MEMBER")
});

export type CreateMemberInput = z.infer<typeof createMemberSchema>;
