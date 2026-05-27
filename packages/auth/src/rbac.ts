import type { FastifyReply, FastifyRequest } from "fastify";
import type { Role } from "./types.js";

export function requireRole(allowedRoles: Role[]) {
  return async function rolePreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const role = request.user?.role;

    if (!role || !allowedRoles.includes(role)) {
      await reply.code(403).send({
        error: "FORBIDDEN",
        message: "Você não tem permissão para executar esta ação."
      });
    }
  };
}

export function canAccessChurch(request: FastifyRequest, churchId: string): boolean {
  return request.user?.role === "SUPER_ADMIN" || request.churchId === churchId;
}

export function canAccessCampus(request: FastifyRequest, campusId?: string | null): boolean {
  if (request.user?.role === "SUPER_ADMIN") {
    return true;
  }

  if (!campusId) {
    return true;
  }

  return request.campusId === campusId;
}
