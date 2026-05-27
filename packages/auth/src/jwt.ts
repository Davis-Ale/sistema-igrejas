import "@fastify/jwt";
import type { FastifyInstance } from "fastify";
import type { JWTPayload } from "./types.js";

const TOKEN_EXPIRES_IN = "8h";

export async function signToken(app: FastifyInstance, payload: JWTPayload): Promise<string> {
  return app.jwt.sign(payload, {
    expiresIn: TOKEN_EXPIRES_IN
  });
}

export async function verifyToken(app: FastifyInstance, token: string): Promise<JWTPayload> {
  return app.jwt.verify<JWTPayload>(token);
}
