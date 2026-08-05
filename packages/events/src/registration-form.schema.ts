import { z } from "zod";

export const eventFormFieldTypeSchema = z.enum([
  "TEXT",
  "PARAGRAPH",
  "SELECT",
  "SINGLE_CHOICE",
  "MULTIPLE_CHOICE"
]);

const fieldOptionSchema = z.object({
  label: z.string().trim().min(1).max(100),
  value: z.string().trim().min(1).max(100)
});

export const createEventFormFieldSchema = z
  .object({
    label: z.string().trim().min(1).max(150),
    type: eventFormFieldTypeSchema,
    isRequired: z.boolean().default(false),
    isSensitive: z.boolean().default(false),
    isActive: z.boolean().default(true),
    ticketIds: z.array(z.string().trim().min(1)).default([]),
    options: z.array(fieldOptionSchema).default([])
  })
  .superRefine((input, context) => {
    const acceptsOptions = [
      "SELECT",
      "SINGLE_CHOICE",
      "MULTIPLE_CHOICE"
    ].includes(input.type);

    if (acceptsOptions && input.options.length === 0) {
      context.addIssue({
        code: "custom",
        message: "Informe ao menos uma opção.",
        path: ["options"]
      });
    }

    if (!acceptsOptions && input.options.length > 0) {
      context.addIssue({
        code: "custom",
        message: "Este tipo de campo não aceita opções.",
        path: ["options"]
      });
    }
  });

export const updateEventFormFieldSchema =
  createEventFormFieldSchema
    .partial()
    .refine(
      (input) => Object.keys(input).length > 0,
      {
        message: "Informe ao menos um campo."
      }
    );

export const reorderEventFormFieldsSchema = z.object({
  fieldIds: z
    .array(z.string().trim().min(1))
    .min(1)
});

export type CreateEventFormFieldInput = z.infer<
  typeof createEventFormFieldSchema
>;

export type UpdateEventFormFieldInput = z.infer<
  typeof updateEventFormFieldSchema
>;

export type ReorderEventFormFieldsInput = z.infer<
  typeof reorderEventFormFieldsSchema
>;
