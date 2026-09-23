import { requireRole } from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, FastifyReply } from "fastify";
import { ZodError, z } from "zod";
import { linkMemberAccountSchema, updateMemberSchema } from "./member.schema.js";
import { convertVisitorToMember, deleteManagedPerson, getManagedPerson, linkMemberAccount, updateManagedPerson } from "./person-management.service.js";

const paramsSchema = z.object({ id: z.string().trim().min(1) });
export const readPeople = { preHandler: requireRole(["SUPER_ADMIN", "PASTOR", "LEADER"]) };
export const managePeople = { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) };

async function sendError(error: unknown, reply: FastifyReply) {
  if (error instanceof ZodError) return reply.code(400).send({ error: "VALIDATION_ERROR", message: "Dados inválidos." });
  const message = error instanceof Error ? error.message : "INTERNAL_SERVER_ERROR";
  if (["PERSON_NOT_FOUND", "CAMPUS_NOT_FOUND", "ACCOUNT_NOT_FOUND"].includes(message)) {
    return reply.code(404).send({ error: message, message: "Registro não encontrado nesta igreja." });
  }
  if (["PERSON_HAS_LINKS", "PERSON_RELATION_CONFLICT", "ACCOUNT_LINK_CONFLICT"].includes(message) ||
      (typeof error === "object" && error !== null && "code" in error && ["P2002", "P2003", "P2025", "P2034"].includes(String(error.code)))) {
    return reply.code(409).send({ error: "PERSON_CONFLICT", message: "A operação conflita com vínculos existentes. Atualize os dados antes de tentar novamente." });
  }
  return reply.code(500).send({ error: "INTERNAL_SERVER_ERROR", message: "Erro interno." });
}

export function registerPersonManagementRoutes(app: FastifyInstance, db: PrismaClient, resource: "members" | "visitors") {
  const role = resource === "members" ? "MEMBER" : "VISITOR";
  for (const method of ["GET", "PATCH", "PUT", "DELETE"] as const) {
    app.route({ method, url: `/${resource}/:id`, ...(method === "GET" ? readPeople : managePeople), handler: async (request, reply) => {
      try {
        const { id } = paramsSchema.parse(request.params);
        const churchId = request.churchId!;
        if (method === "GET") return await getManagedPerson(db, churchId, id, role);
        if (method === "DELETE") return await deleteManagedPerson(db, churchId, id, role);
        return await updateManagedPerson(db, churchId, id, role, updateMemberSchema.parse(request.body));
      } catch (error) { return sendError(error, reply); }
    } });
  }
  if (resource === "visitors") {
    app.post("/visitors/:id/convert", managePeople, async (request, reply) => {
      try {
        const { id } = paramsSchema.parse(request.params);
        z.object({}).strict().parse(request.body ?? {});
        return await convertVisitorToMember(db, request.churchId!, id);
      } catch (error) { return sendError(error, reply); }
    });
  } else {
    app.put("/members/:id/account", managePeople, async (request, reply) => {
      try {
        const { id } = paramsSchema.parse(request.params);
        const { accountId } = linkMemberAccountSchema.parse(request.body);
        return await linkMemberAccount(db, request.churchId!, id, accountId);
      } catch (error) { return sendError(error, reply); }
    });
  }
}
