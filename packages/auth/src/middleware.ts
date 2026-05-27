import "@fastify/jwt";
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

export async function authPreHandler(request: FastifyRequest, reply: FastifyReply): Promise<void> {
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
      await reply.code(401).send({
        error: "INVALID_TOKEN",
        message: "Token de autenticação inválido."
      });
      return;
    }

    request.user = payload;
    request.churchId = payload.churchId;

    if (payload.campusId) {
      request.campusId = payload.campusId;
    }
  } catch {
    await reply.code(401).send({
      error: "INVALID_TOKEN",
      message: "Token de autenticação inválido ou expirado."
    });
  }
}
