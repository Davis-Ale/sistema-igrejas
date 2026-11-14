import type {} from "@sistema-igrejas/auth";
import { requireRole, type Role } from "@sistema-igrejas/auth";
import { resolveTenantActorPersonId } from "@sistema-igrejas/database";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import {
  listCellMeetingsQuerySchema,
  recordCellAttendanceSchema
} from "./cell-attendance.schema.js";
import { listCellMeetings, recordCellAttendance } from "./cell-attendance.service.js";

const supervise = {
  preHandler: requireRole(["SUPER_ADMIN", "PASTOR", "LEADER"])
};

function churchIdOf(request: FastifyRequest): string {
  if (!request.churchId || request.user?.churchId !== request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }
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
  if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
    await reply.code(409).send({
      error: "CELL_ATTENDANCE_CONFLICT",
      message: "A frequência deste encontro foi alterada. Atualize os dados e tente novamente."
    });
    return;
  }
  const code = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
  if (code === "CHURCH_CONTEXT_REQUIRED" || code === "USER_CONTEXT_REQUIRED") {
    await reply.code(401).send({ error: "UNAUTHORIZED", message: "Contexto de autenticação obrigatório." });
    return;
  }
  if (code === "ATTENDANCE_DATE_INVALID" || code === "ATTENDANCE_DATE_IN_FUTURE") {
    await reply.code(400).send({
      error: code,
      message: code === "ATTENDANCE_DATE_IN_FUTURE"
        ? "A data do encontro não pode ser futura."
        : "Data do encontro inválida."
    });
    return;
  }
  if (code === "CELL_NOT_FOUND" || code === "ACTOR_NOT_FOUND") {
    await reply.code(404).send({ error: code, message: "Registro não encontrado nesta igreja." });
    return;
  }
  if (code === "CELL_ATTENDANCE_FORBIDDEN") {
    await reply.code(403).send({
      error: code,
      message: "Somente o líder desta célula, o pastor ou o super administrador registram a frequência."
    });
    return;
  }
  if (code === "CELL_ARCHIVED") {
    await reply.code(409).send({ error: code, message: "Célula arquivada não recebe frequência." });
    return;
  }
  if (code === "CELL_HAS_NO_MEMBERS") {
    await reply.code(409).send({ error: code, message: "Esta célula não tem membros vinculados." });
    return;
  }
  if (code === "ATTENDANCE_ROSTER_MISMATCH") {
    await reply.code(409).send({
      error: code,
      message: "A lista enviada não corresponde aos membros atuais da célula."
    });
    return;
  }
  await reply.code(500).send({ error: "INTERNAL_SERVER_ERROR", message: "Erro interno." });
}

export async function registerCellAttendanceRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/cells/:cellId/meetings", supervise, async (request, reply) => {
    try {
      const churchId = churchIdOf(request);
      const { cellId } = request.params as { cellId: string };
      const query = listCellMeetingsQuerySchema.parse(request.query ?? {});
      const actorPersonId = await resolveTenantActorPersonId(prisma, churchId, userIdOf(request));
      return await listCellMeetings(prisma, churchId, actorPersonId, roleOf(request), cellId, query.limit);
    } catch (error) {
      await sendError(error, reply);
    }
  });

  app.post("/cells/:cellId/meetings", supervise, async (request, reply) => {
    try {
      const churchId = churchIdOf(request);
      const { cellId } = request.params as { cellId: string };
      const input = recordCellAttendanceSchema.parse(request.body);
      const actorPersonId = await resolveTenantActorPersonId(prisma, churchId, userIdOf(request));
      const meeting = await recordCellAttendance(
        prisma,
        churchId,
        actorPersonId,
        roleOf(request),
        cellId,
        input
      );
      await reply.code(200).send(meeting);
    } catch (error) {
      await sendError(error, reply);
    }
  });
}
