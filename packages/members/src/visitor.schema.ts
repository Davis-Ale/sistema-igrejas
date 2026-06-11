import { z } from "zod";

export const createVisitorSchema = z.object({
  campusId: z.string().trim().min(1).optional(),
  name: z.string().trim().min(1, "Nome é obrigatório."),
  phone: z.string().trim().min(1, "Telefone é obrigatório."),
  email: z.string().trim().email("E-mail inválido.").optional().or(z.literal("")),
  status: z.enum(["NEW", "CONTACTED", "INTEGRATED", "ARCHIVED"]).default("NEW"),
  firstVisitAt: z.string().trim().datetime("Data da primeira visita inválida.").optional().or(z.literal("")),
  notes: z.string().trim().optional().or(z.literal(""))
});

export type CreateVisitorInput = z.infer<typeof createVisitorSchema>;
