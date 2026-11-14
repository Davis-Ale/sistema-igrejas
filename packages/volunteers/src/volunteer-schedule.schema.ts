import { z } from "zod";

const id = z.string().trim().min(1).max(100);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const scheduleWindowSchema = z
  .object({
    serviceDate: day,
    startTime: clock,
    endTime: clock
  })
  .strict();

export const createScheduleSchema = scheduleWindowSchema.extend({
  ministryId: id
});

export const updateScheduleSchema = scheduleWindowSchema;

export const createSlotSchema = z
  .object({
    name: z.string().trim().min(1).max(80)
  })
  .strict();

export const assignVolunteerSchema = z
  .object({
    slotId: id,
    personId: id
  })
  .strict();

export const confirmAssignmentSchema = z
  .object({
    status: z.enum(["CONFIRMED", "DECLINED"])
  })
  .strict();

export const unavailabilitySchema = z
  .object({
    personId: id.optional(),
    serviceDate: day,
    startTime: clock,
    endTime: clock
  })
  .strict();

export const listUnavailabilityQuerySchema = z
  .object({
    personId: id.optional()
  })
  .strict();

export type CreateScheduleInput = z.infer<typeof createScheduleSchema>;
export type UpdateScheduleInput = z.infer<typeof updateScheduleSchema>;
export type CreateSlotInput = z.infer<typeof createSlotSchema>;
export type AssignVolunteerInput = z.infer<typeof assignVolunteerSchema>;
export type ConfirmAssignmentInput = z.infer<typeof confirmAssignmentSchema>;
export type UnavailabilityInput = z.infer<typeof unavailabilitySchema>;
