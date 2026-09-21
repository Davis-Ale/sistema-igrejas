import { z } from "zod";
import { MAX_MAP_IMAGE_BASE64 } from "./participant-map-image.js";

const optionalText = (max: number) =>
  z.union([
    z.string().trim().min(1).max(max),
    z.literal(""),
    z.null()
  ]).optional();

const registrationIdsSchema = z
  .array(z.string().trim().min(1))
  .max(500)
  .transform((values) => Array.from(new Set(values)))
  .default([]);

const sessionFields = {
  title: z.string().trim().min(1).max(160),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  type: optionalText(80),
  facilitator: optionalText(120),
  location: optionalText(160),
  details: optionalText(2000),
  isPublished: z.boolean(),
  registrationIds: registrationIdsSchema
};

export const eventParticipantAppParamsSchema = z.object({
  eventId: z.string().trim().min(1)
});

export const eventParticipantAppSessionParamsSchema = z.object({
  eventId: z.string().trim().min(1),
  sessionId: z.string().trim().min(1)
});

export const createEventAppSessionSchema = z
  .object(sessionFields)
  .refine((input) => input.endsAt > input.startsAt, {
    message: "O término deve ser posterior ao início.",
    path: ["endsAt"]
  });

export const updateEventAppSessionSchema = z
  .object({
    title: sessionFields.title.optional(),
    startsAt: sessionFields.startsAt.optional(),
    endsAt: sessionFields.endsAt.optional(),
    type: sessionFields.type,
    facilitator: sessionFields.facilitator,
    location: sessionFields.location,
    details: sessionFields.details,
    isPublished: sessionFields.isPublished.optional(),
    registrationIds: registrationIdsSchema.optional()
  })
  .refine((input) => Object.keys(input).length > 0, {
    message: "Informe ao menos um campo para atualizar."
  });

const httpsUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => new URL(value).protocol === "https:", {
    message: "A URL da planta deve usar HTTPS."
  });

export const updateEventAppMapSchema = z.object({
  imageUrl: z.union([httpsUrlSchema, z.literal(""), z.null()]).optional(),
  image: z.object({
    mimeType: z.enum(["image/png", "image/jpeg"]),
    dataBase64: z.string().min(1).max(MAX_MAP_IMAGE_BASE64)
  }).optional(),
  points: z.array(
    z.object({
      id: z.string().trim().min(1).optional(),
      name: z.string().trim().min(1).max(100),
      location: z.string().trim().min(1).max(200),
      sortOrder: z.coerce.number().int().min(0).max(10000),
      isVisible: z.boolean()
    })
  ).max(100)
});

export type CreateEventAppSessionInput = z.infer<
  typeof createEventAppSessionSchema
>;
export type UpdateEventAppSessionInput = z.infer<
  typeof updateEventAppSessionSchema
>;
export type UpdateEventAppMapInput = z.infer<
  typeof updateEventAppMapSchema
>;
