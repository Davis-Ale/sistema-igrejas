import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email("E-mail inválido."),
  password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres.")
});

export type LoginInput = z.infer<typeof loginSchema>;
