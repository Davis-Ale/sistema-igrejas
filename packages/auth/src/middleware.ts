import "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import type { FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { JWTPayload } from "./types.js";

const tokenPayloadSchema = z.object({
  userId: z.string().trim().min(1),
  churchId: z.string().trim().min(1),
  role: z.enum(["SUPER_ADMIN", "PASTOR", "LEADER", "VOLUNTEER", "MEMBER"]),
  campusId: z.string().trim().min(1).optional()
});

function getBearerToken(request: FastifyRequest): string | null {
  const authorization = request.headers.authorization;

  if (!authorization) {
    return null;
  }

  const [scheme, token, extra] = authorization.split(" ");

  if (scheme !== "Bearer" || !token || extra !== undefined) {
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

    let payload: z.infer<typeof tokenPayloadSchema>;
    try {
      payload = tokenPayloadSchema.parse(await request.server.jwt.verify(token));
    } catch {
      await sendInvalidToken(reply);
      return;
    }

    try {
      const account = await prisma.userAccount.findUnique({
        where: { id: payload.userId },
        select: {
          id: true, churchId: true, status: true, role: true,
          person: { select: { churchId: true, campusId: true, campus: { select: { churchId: true } } } }
        }
      });

      if (!account || account.churchId !== payload.churchId) {
        await sendInvalidToken(reply);
        return;
      }
      if (account.status !== "ACTIVE") {
        await reply.code(403).send({ error: "ACCOUNT_DISABLED", message: "Conta de usuário desativada." });
        return;
      }
      const currentRole = tokenPayloadSchema.shape.role.safeParse(account.role);
      if (!currentRole.success) {
        await sendInvalidToken(reply);
        return;
      }
      if (account.person && (account.person.churchId !== account.churchId ||
        (account.person.campus && account.person.campus.churchId !== account.churchId))) {
        await sendInvalidToken(reply);
        return;
      }

      // Operation guards must use current account permissions, never stale JWT claims.
      const currentUser: JWTPayload = {
        userId: account.id, churchId: account.churchId, role: currentRole.data,
        ...(account.person?.campusId ? { campusId: account.person.campusId } : {})
      };
      const canAccessSystem = await ensureChurchCanAccessSystem(prisma, currentUser, reply);

      if (!canAccessSystem) {
        return;
      }

      request.user = currentUser;
      request.churchId = currentUser.churchId;
      delete request.campusId;
      if (currentUser.campusId) {
        request.campusId = currentUser.campusId;
      }
    } catch {
      await reply.code(503).send({ error: "AUTH_UNAVAILABLE", message: "Não foi possível validar o acesso." });
    }
  };
}
