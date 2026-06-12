import { z } from "zod";

export const registrationStatusSchema = z.enum([
  "PENDING",
  "CONFIRMED",
  "CANCELLED",
  "CHECKED_IN"
]);

export const createEventSchema = z.object({
  campusId: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1, "Título é obrigatório."),
  slug: z.string().trim().min(1, "Slug é obrigatório."),
  date: z.coerce.date(),
  capacity: z.coerce.number().int().positive("Capacidade deve ser maior que zero."),
  price: z.coerce.number().min(0, "Preço não pode ser negativo.").default(0),
  isPublic: z.boolean().default(false),
  isPaid: z.boolean().default(false),
  publicRegistrationEnabled: z.boolean().default(false),
  waitlistEnabled: z.boolean().default(true),
  trailStageId: z.string().trim().min(1).optional()
});

export const createRegistrationSchema = z
  .object({
    eventId: z.string().trim().min(1, "Evento é obrigatório."),
    personId: z.string().trim().min(1, "Pessoa é obrigatória.").optional(),
    visitorId: z.string().trim().min(1, "Visitante é obrigatório.").optional(),
    paymentId: z.string().trim().min(1).optional()
  })
  .refine((input) => Boolean(input.personId) !== Boolean(input.visitorId), {
    message: "Informe membro ou visitante, mas não ambos."
  });

export const createPublicRegistrationSchema = z.object({
  name: z.string().trim().min(2, "Nome é obrigatório."),
  phone: z.string().trim().min(8, "Telefone é obrigatório."),
  email: z.string().trim().email("E-mail inválido.").optional()
});

export const updateRegistrationStatusSchema = z.object({
  registrationId: z.string().trim().min(1, "Inscrição é obrigatória."),
  status: registrationStatusSchema,
  paymentId: z.string().trim().min(1).optional()
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;
export type CreatePublicRegistrationInput = z.infer<typeof createPublicRegistrationSchema>;
export type UpdateRegistrationStatusInput = z.infer<typeof updateRegistrationStatusSchema>;
