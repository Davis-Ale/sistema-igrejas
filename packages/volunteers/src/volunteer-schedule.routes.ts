import type {} from "@sistema-igrejas/auth";
import { requireRole, type Role } from "@sistema-igrejas/auth";
import { resolveTenantActorPersonId } from "@sistema-igrejas/database";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import {
  assignVolunteerSchema,
  confirmAssignmentSchema,
  createRecurrenceSchema,
  createScheduleSchema,
  createSlotSchema,
  substituteAssignmentSchema,
  listUnavailabilityQuerySchema,
  unavailabilitySchema,
  updateScheduleSchema
} from "./volunteer-schedule.schema.js";
import {
  addScheduleSlot,
  assignVolunteer,
  confirmVolunteerAssignment,
  createRecurringVolunteerSchedules,
  createVolunteerSchedule,
  createVolunteerUnavailability,
  deleteVolunteerUnavailability,
  listVolunteerSchedules,
  listVolunteerUnavailability,
  removeVolunteerAssignment,
  substituteVolunteerAssignment,
  updateVolunteerSchedule
} from "./volunteer-schedule.service.js";

const read = { preHandler: requireRole(["SUPER_ADMIN", "PASTOR", "LEADER", "MEMBER", "VOLUNTEER"]) };
const manage = { preHandler: requireRole(["SUPER_ADMIN", "PASTOR", "LEADER"]) };

function churchIdOf(request: FastifyRequest): string {
  if (!request.churchId || request.user?.churchId !== request.churchId) throw new Error("CHURCH_CONTEXT_REQUIRED");
  return request.churchId;
}

function userIdOf(request: FastifyRequest): string {
  if (!request.user?.userId) throw new Error("USER_CONTEXT_REQUIRED");
  return request.user.userId;
}

function roleOf(request: FastifyRequest): Role {
  if (!request.user?.role) throw new Error("USER_CONTEXT_REQUIRED");
  return request.user.role;
}

async function sendError(error: unknown, reply: FastifyReply): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({ error: "VALIDATION_ERROR", message: "Dados inválidos." });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && (error.code === "P2002" || error.code === "P2034")) {
    await reply.code(409).send({ error: "SCHEDULE_CONFLICT", message: "A escala foi alterada. Atualize os dados e tente novamente." });
    return;
  }
  const code = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
  if (code === "CHURCH_CONTEXT_REQUIRED" || code === "USER_CONTEXT_REQUIRED") {
    await reply.code(401).send({ error: "UNAUTHORIZED", message: "Contexto de autenticação obrigatório." });
    return;
  }
  if (code === "SCHEDULE_DATE_INVALID" || code === "SCHEDULE_TIME_INVALID") {
    await reply.code(400).send({ error: code, message: "Data ou horário inválido." });
    return;
  }
  if (["MINISTRY_NOT_FOUND", "SCHEDULE_NOT_FOUND", "SLOT_NOT_FOUND", "ASSIGNMENT_NOT_FOUND", "PERSON_NOT_FOUND", "ACTOR_NOT_FOUND", "UNAVAILABILITY_NOT_FOUND"].includes(code)) {
    await reply.code(404).send({ error: code, message: "Registro não encontrado nesta igreja." });
    return;
  }
  if (code === "SCHEDULE_FORBIDDEN" || code === "VOLUNTEER_AVAILABILITY_FORBIDDEN") {
    await reply.code(403).send({ error: code, message: "Sem permissão para esta escala." });
    return;
  }
  if (code === "MINISTRY_INACTIVE") {
    await reply.code(409).send({ error: code, message: "Ministério inativo." });
    return;
  }
  if (code === "VOLUNTEER_NOT_ELIGIBLE") {
    await reply.code(409).send({ error: code, message: "Somente voluntário elegível ou ativo entra na escala." });
    return;
  }
  if (code === "VOLUNTEER_NOT_ON_MINISTRY") {
    await reply.code(409).send({ error: code, message: "A pessoa não está neste ministério." });
    return;
  }
  if (code === "VOLUNTEER_ALREADY_ASSIGNED") {
    await reply.code(409).send({ error: code, message: "Esta pessoa já está nesta função." });
    return;
  }
  if (code === "SCHEDULE_CONFLICT") {
    await reply.code(409).send({ error: code, message: "Horário em conflito com outra escala." });
    return;
  }
  if (code === "VOLUNTEER_UNAVAILABLE") {
    await reply.code(409).send({ error: code, message: "A pessoa está indisponível neste horário." });
    return;
  }
  if (code === "SUBSTITUTION_NOT_OPEN") {
    await reply.code(409).send({ error: code, message: "Só uma designação pendente ou confirmada pode ser substituída." });
    return;
  }
  if (code === "SUBSTITUTION_SAME_PERSON") {
    await reply.code(409).send({ error: code, message: "Escolha outra pessoa." });
    return;
  }
  if (code === "SUBSTITUTION_CLOSED") {
    await reply.code(409).send({ error: code, message: "Esta designação já foi substituída." });
    return;
  }
  await reply.code(500).send({ error: "INTERNAL_SERVER_ERROR", message: "Erro interno." });
}

export async function registerVolunteerScheduleRoutes(app: FastifyInstance, prisma: PrismaClient): Promise<void> {
  async function actor(request: FastifyRequest) {
    return resolveTenantActorPersonId(prisma, churchIdOf(request), userIdOf(request));
  }

  app.get("/volunteers/schedules", read, async (request, reply) => {
    try {
      return await listVolunteerSchedules(prisma, churchIdOf(request), await actor(request), roleOf(request));
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/volunteers/schedules/recurrence", manage, async (request, reply) => {
    try {
      const series = await createRecurringVolunteerSchedules(prisma, churchIdOf(request), await actor(request), roleOf(request), createRecurrenceSchema.parse(request.body));
      await reply.code(201).send(series);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/volunteers/schedules", manage, async (request, reply) => {
    try {
      const schedule = await createVolunteerSchedule(prisma, churchIdOf(request), await actor(request), roleOf(request), createScheduleSchema.parse(request.body));
      await reply.code(201).send(schedule);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.patch("/volunteers/schedules/:scheduleId", manage, async (request, reply) => {
    try {
      const { scheduleId } = request.params as { scheduleId: string };
      return await updateVolunteerSchedule(prisma, churchIdOf(request), await actor(request), roleOf(request), scheduleId, updateScheduleSchema.parse(request.body));
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/volunteers/schedules/:scheduleId/slots", manage, async (request, reply) => {
    try {
      const { scheduleId } = request.params as { scheduleId: string };
      const slot = await addScheduleSlot(prisma, churchIdOf(request), await actor(request), roleOf(request), scheduleId, createSlotSchema.parse(request.body));
      await reply.code(201).send(slot);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/volunteers/schedules/:scheduleId/assignments", manage, async (request, reply) => {
    try {
      const { scheduleId } = request.params as { scheduleId: string };
      const assignment = await assignVolunteer(prisma, churchIdOf(request), await actor(request), roleOf(request), scheduleId, assignVolunteerSchema.parse(request.body));
      await reply.code(201).send(assignment);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.delete("/volunteers/schedules/:scheduleId/slots/:slotId/assignments/:personId", manage, async (request, reply) => {
    try {
      const params = request.params as { scheduleId: string; slotId: string; personId: string };
      return await removeVolunteerAssignment(prisma, churchIdOf(request), await actor(request), roleOf(request), params.scheduleId, params.slotId, params.personId);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/volunteers/schedules/:scheduleId/slots/:slotId/assignments/:personId/substitution", manage, async (request, reply) => {
    try {
      const params = request.params as { scheduleId: string; slotId: string; personId: string };
      const substitution = await substituteVolunteerAssignment(
        prisma,
        churchIdOf(request),
        await actor(request),
        roleOf(request),
        params.scheduleId,
        params.slotId,
        params.personId,
        substituteAssignmentSchema.parse(request.body)
      );
      await reply.code(201).send(substitution);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/volunteers/schedules/:scheduleId/slots/:slotId/assignments/:personId/confirmation", read, async (request, reply) => {
    try {
      const params = request.params as { scheduleId: string; slotId: string; personId: string };
      return await confirmVolunteerAssignment(
        prisma,
        churchIdOf(request),
        await actor(request),
        roleOf(request),
        params.scheduleId,
        params.slotId,
        params.personId,
        confirmAssignmentSchema.parse(request.body)
      );
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.get("/volunteers/unavailability", read, async (request, reply) => {
    try {
      const query = listUnavailabilityQuerySchema.parse(request.query ?? {});
      return await listVolunteerUnavailability(prisma, churchIdOf(request), await actor(request), roleOf(request), query.personId);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/volunteers/unavailability", read, async (request, reply) => {
    try {
      const created = await createVolunteerUnavailability(prisma, churchIdOf(request), await actor(request), roleOf(request), unavailabilitySchema.parse(request.body));
      await reply.code(201).send(created);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.delete("/volunteers/unavailability/:unavailabilityId", read, async (request, reply) => {
    try {
      const { unavailabilityId } = request.params as { unavailabilityId: string };
      return await deleteVolunteerUnavailability(prisma, churchIdOf(request), await actor(request), roleOf(request), unavailabilityId);
    } catch (error) {
      await sendError(error, reply);
    }
  });
}
