import { z } from "zod";

export const volunteerStatusSchema = z.enum([
  "IN_FORMATION",
  "ELIGIBLE",
  "ACTIVE",
  "SUSPENDED"
]);

export const updateVolunteerStatusSchema = z.object({
  personId: z.string().trim().min(1, "Pessoa é obrigatória."),
  status: volunteerStatusSchema,
  reason: z.string().trim().min(1).optional()
});

export type VolunteerStatusInput = z.infer<typeof volunteerStatusSchema>;
export type UpdateVolunteerStatusInput = z.infer<typeof updateVolunteerStatusSchema>;
