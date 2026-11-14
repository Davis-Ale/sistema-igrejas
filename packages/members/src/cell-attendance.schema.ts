import { z } from "zod";

export const cellAttendanceStatusSchema = z.enum(["PRESENT", "ABSENT"]);

export const recordCellAttendanceSchema = z
  .object({
    occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    marks: z
      .array(
        z
          .object({
            personId: z.string().trim().min(1),
            status: cellAttendanceStatusSchema
          })
          .strict()
      )
      .min(1)
      .max(300)
  })
  .strict();

export const listCellMeetingsQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(52).default(12)
  })
  .strict();

export type RecordCellAttendanceInput = z.infer<typeof recordCellAttendanceSchema>;
export type CellAttendanceStatus = z.infer<typeof cellAttendanceStatusSchema>;
