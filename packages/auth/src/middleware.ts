import "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { JWTPayload } from "./types.js";

function getBearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token] = authorization.split(" ");

  if (scheme !== "Bearer" || !token) {
    return null;
  }

  return token;
}

async function sendInvalidToken(reply: FastifyReply): Promise<void> {
  await reply.code(401).send({
    error: "INVALID_TOKEN",
    message: "Token de autenticação inválido ou expirado."
  });
}

async function ensureChurchCanAccessSystem(
  prisma: PrismaClient,
  payload: JWTPayload,
  reply: FastifyReply
): Promise<boolean> {
  if (payload.role === "SUPER_ADMIN") {
    return true;
  }

  const church = await prisma.church.findUnique({
    where: {
      id: payload.churchId
    },
    select: {
      id: true,
      status: true,
      trialEndsAt: true,
      blockReason: true
    }
  });

  if (!church) {
    await reply.code(403).send({
      error: "CHURCH_NOT_FOUND",
      message: "Igreja não encontrada."
    });
    return false;
  }

  if (church.status === "BLOCKED" || church.status === "CANCELLED") {
    await reply.code(403).send({
      error: "CHURCH_BLOCKED",
      message: church.blockReason ?? "Acesso da igreja bloqueado."
    });
    return false;
  }

  if (church.status === "TRIAL" && church.trialEndsAt && church.trialEndsAt < new Date()) {
    await prisma.church.update({
      where: {
        id: church.id
      },
      data: {
        status: "BLOCKED",
        blockedAt: new Date(),
        blockReason: "Período de teste expirado."
      }
    });

    await reply.code(403).send({
      error: "TRIAL_EXPIRED",
      message: "O período de teste da igreja expirou."
    });
    return false;
  }

  return true;
}

export function createAuthPreHandler(prisma: PrismaClient) {
  return async function authPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const token = getBearerToken(request);

    if (!token) {
      await reply.code(401).send({
        error: "UNAUTHORIZED",
        message: "Token de autenticação obrigatório."
      });
      return;
    }

    try {
      const payload = await request.server.jwt.verify<JWTPayload>(token);

      if (!payload.userId || !payload.churchId || !payload.role) {
        await sendInvalidToken(reply);
        return;
      }

      const canAccessSystem = await ensureChurchCanAccessSystem(prisma, payload, reply);

      if (!canAccessSystem) {
        return;
      }

      request.user = payload;
      request.churchId = payload.churchId;

      if (payload.campusId) {
        request.campusId = payload.campusId;
      }
    } catch {
      await sendInvalidToken(reply);
    }
  };
}
