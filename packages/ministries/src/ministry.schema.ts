import { z } from "zod";

const id = z.string().trim().min(1).max(100);
export const ministryParamsSchema = z.object({ id });
export const ministryMemberParamsSchema = z.object({ id, personId: id });
export const ministryMemberSchema = z.object({ personId: id }).strict();

const ministryFields = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(4000),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  leaderId: id
}).strict();

export const createMinistrySchema = ministryFields.extend({
  description: ministryFields.shape.description.default(""),
  status: ministryFields.shape.status.default("ACTIVE")
});

export const updateMinistrySchema = ministryFields.partial().refine(
  input => Object.values(input).some(value => value !== undefined),
  "Informe ao menos um campo."
);

export type CreateMinistryInput = z.infer<typeof createMinistrySchema>;
export type UpdateMinistryInput = z.infer<typeof updateMinistrySchema>;
