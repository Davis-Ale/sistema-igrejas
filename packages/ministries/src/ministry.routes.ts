import { requireRole } from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { ZodError } from "zod";
import { createMinistrySchema, updateMinistrySchema, ministryParamsSchema, ministryMemberParamsSchema, ministryMemberSchema } from "./ministry.schema.js";
import { listMinistries, getMinistry, listMinistryPeople, createMinistry, updateMinistry, deleteMinistry, addMinistryMember, removeMinistryMember } from "./ministry.service.js";

const read = { preHandler: requireRole(["SUPER_ADMIN", "PASTOR", "LEADER"]) };
const manage = { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) };

function churchId(request: FastifyRequest) {
  if (!request.churchId || request.user?.churchId !== request.churchId) throw new Error("CHURCH_CONTEXT_REQUIRED");
  return request.churchId;
}

async function sendError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Dados inválidos. Confira os campos do ministério." });
  const code = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
  if (code === "CHURCH_CONTEXT_REQUIRED") return reply.code(401).send({ error: "UNAUTHORIZED", message: "Autenticação obrigatória." });
  if (["MINISTRY_NOT_FOUND", "MINISTRY_PERSON_NOT_FOUND", "MINISTRY_MEMBERSHIP_NOT_FOUND"].includes(code)) {
    return reply.code(404).send({ error: code, message: "Registro não encontrado nesta igreja." });
  }
  if (code === "MINISTRY_MEMBER_ROLE_INVALID") return reply.code(409).send({ error: code, message: "Somente membros e voluntários podem ser vinculados." });
  if (typeof error === "object" && error !== null && "code" in error && ["P2002", "P2003", "P2025", "P2034"].includes(String(error.code))) {
    return reply.code(409).send({ error: "MINISTRY_CONFLICT", message: "Os vínculos foram alterados. Atualize os dados e tente novamente." });
  }
  return reply.code(500).send({ error: "INTERNAL_SERVER_ERROR", message: "Não foi possível concluir a operação." });
}

export async function registerMinistryRoutes(app: FastifyInstance, db: PrismaClient) {
  app.get("/ministries", read, async (request, reply) => {
    try { return await listMinistries(db, churchId(request)); } catch (error) { return sendError(error, reply); }
  });
  app.get("/ministries/people", read, async (request, reply) => {
    try { return await listMinistryPeople(db, churchId(request)); } catch (error) { return sendError(error, reply); }
  });
  app.post("/ministries", manage, async (request, reply) => {
    try { return reply.code(201).send(await createMinistry(db, churchId(request), createMinistrySchema.parse(request.body))); }
    catch (error) { return sendError(error, reply); }
  });
  for (const method of ["GET", "PATCH", "DELETE"] as const) {
    app.route({ method, url: "/ministries/:id", ...(method === "GET" ? read : manage), handler: async (request, reply) => {
      try {
        const tenant = churchId(request);
        const { id } = ministryParamsSchema.parse(request.params);
        if (method === "GET") return await getMinistry(db, tenant, id);
        if (method === "DELETE") return await deleteMinistry(db, tenant, id);
        return await updateMinistry(db, tenant, id, updateMinistrySchema.parse(request.body));
      } catch (error) { return sendError(error, reply); }
    } });
  }
  app.post("/ministries/:id/members", manage, async (request, reply) => {
    try {
      const tenant = churchId(request);
      const { id } = ministryParamsSchema.parse(request.params);
      const { personId } = ministryMemberSchema.parse(request.body);
      return await addMinistryMember(db, tenant, id, personId);
    } catch (error) { return sendError(error, reply); }
  });
  app.delete("/ministries/:id/members/:personId", manage, async (request, reply) => {
    try {
      const tenant = churchId(request);
      const { id, personId } = ministryMemberParamsSchema.parse(request.params);
      return await removeMinistryMember(db, tenant, id, personId);
    } catch (error) { return sendError(error, reply); }
  });
}
