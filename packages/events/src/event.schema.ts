import { z } from "zod";

function isValidCpf(value: string) {
  const cpf = value.replace(/\D/g, "");

  if (
    cpf.length !== 11 ||
    /^(\d)\1{10}$/.test(cpf)
  ) {
    return false;
  }

  function calculateDigit(length: number) {
    let total = 0;

    for (let index = 0; index < length; index += 1) {
      total +=
        Number(cpf[index]) *
        (length + 1 - index);
    }

    const remainder = (total * 10) % 11;

    return remainder === 10
      ? 0
      : remainder;
  }

  return (
    calculateDigit(9) === Number(cpf[9]) &&
    calculateDigit(10) === Number(cpf[10])
  );
}

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

export const updateEventSchema = z
  .object({
    title: z.string().trim().min(1, "Título é obrigatório.").optional(),
    slug: z.string().trim().min(1, "Slug é obrigatório.").optional(),
    date: z.coerce.date().optional(),
    capacity: z
      .coerce.number()
      .int()
      .positive("Capacidade deve ser maior que zero.")
      .optional(),
    price: z
      .coerce.number()
      .min(0, "Preço não pode ser negativo.")
      .optional(),
    isPublic: z.boolean().optional(),
    isPaid: z.boolean().optional(),
    publicRegistrationEnabled: z.boolean().optional(),
    waitlistEnabled: z.boolean().optional()
  })
  .refine(
    (input) => Object.keys(input).length > 0,
    {
      message: "Informe ao menos um campo para atualizar."
    }
  );

export const duplicateEventSchema = z.object({
  title: z.string().trim().min(1, "Título é obrigatório."),
  slug: z.string().trim().min(1, "Slug é obrigatório."),
  date: z.coerce.date()
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
  email: z.string().trim().email("E-mail inválido.").optional(),
  cpf: z
    .string()
    .trim()
    .refine(
      (value) => isValidCpf(value),
      "CPF inválido."
    )
    .optional(),
  paymentMethod: z
    .enum([
      "PIX",
      "CREDIT_CARD",
      "DEBIT_CARD"
    ])
    .default("PIX"),
  ticketId: z.string().trim().min(1, "Ingresso é obrigatório."),
  ticketBatchId: z.string().trim().min(1, "Lote é obrigatório."),
  answers: z
    .array(
      z.object({
        fieldId: z.string().trim().min(1),
        value: z.union([
          z.string(),
          z.array(z.string())
        ])
      })
    )
    .default([])
});

export const updateRegistrationStatusSchema = z.object({
  registrationId: z.string().trim().min(1, "Inscrição é obrigatória."),
  eventId: z.string().trim().min(1, "Evento é obrigatório."),
  status: registrationStatusSchema,
  paymentId: z.string().trim().min(1).optional()
});

export const checkInByTokenSchema = z.object({
  eventId: z.string().trim().min(1, "Evento é obrigatório."),
  checkInToken: z.string().trim().min(1, "Código de check-in é obrigatório.")
});

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed || trimmed === "ALL") {
    return undefined;
  }

  return trimmed;
};

export const listEventRegistrationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  search: z.preprocess(
    emptyToUndefined,
    z.string().max(120).optional()
  ),
  status: z.preprocess(
    emptyToUndefined,
    registrationStatusSchema.optional()
  ),
  paymentStatus: z.preprocess(
    emptyToUndefined,
    z
      .enum(["PAID", "PENDING", "NOT_REQUIRED", "CANCELLED"])
      .optional()
  ),
  ticketId: z.preprocess(
    emptyToUndefined,
    z.string().min(1).optional()
  )
});

export const eventIdParamsSchema = z.object({
  eventId: z.string().trim().min(1, "Evento é obrigatório.")
});

export type CreateEventInput = z.infer<typeof createEventSchema>;
export type DuplicateEventInput = z.infer<typeof duplicateEventSchema>;
export type UpdateEventInput = z.infer<typeof updateEventSchema>;
export type CreateRegistrationInput = z.infer<typeof createRegistrationSchema>;
export type CreatePublicRegistrationInput = z.infer<typeof createPublicRegistrationSchema>;
export type UpdateRegistrationStatusInput = z.infer<typeof updateRegistrationStatusSchema>;
export type CheckInByTokenInput = z.infer<typeof checkInByTokenSchema>;
export type ListEventRegistrationsQuery = z.infer<
  typeof listEventRegistrationsQuerySchema
>;
