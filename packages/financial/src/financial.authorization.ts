import type {} from "@sistema-igrejas/auth";
import type { FastifyReply, FastifyRequest } from "fastify";

export function ensureCanAccessFinancial(request: FastifyRequest): void {
  const role = request.user?.role;
  if (!role) throw new Error("USER_CONTEXT_REQUIRED");
  if (role !== "SUPER_ADMIN" && role !== "PASTOR") {
    throw new Error("FINANCIAL_ACCESS_DENIED");
  }
}

export function ensureCanReverseFinancial(request: FastifyRequest): void {
  ensureCanAccessFinancial(request);
  if (request.user?.role !== "SUPER_ADMIN") {
    throw new Error("FINANCIAL_OPERATION_DENIED");
  }
}

// Apply after authentication, including financial aliases registered by other packages.
export async function authorizeFinancialRoute(request: FastifyRequest, reply: FastifyReply) {
  const path = request.routeOptions.url?.replace(/^\/api(?=\/)/, "");
  if (!path?.startsWith("/financial/") && !path?.startsWith("/events/financial/")) return;

  const role = request.user?.role;
  if (!role || !request.churchId) {
    return reply.code(401).send({ error: "UNAUTHORIZED" });
  }
  try {
    ensureCanAccessFinancial(request);
    if (path.endsWith("/reverse") || path.endsWith("/refunds")) {
      ensureCanReverseFinancial(request);
    }
  } catch (error) {
    return reply.code(403).send({ error: (error as Error).message });
  }
}
