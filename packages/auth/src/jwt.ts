import "@fastify/jwt";
import type { FastifyInstance } from "fastify";
import type { JWTPayload } from "./types.js";

const TOKEN_EXPIRES_IN = "8h";

export function getJwtSecret(environment: { JWT_SECRET?: string } = process.env): string {
  const secret = environment.JWT_SECRET;
  if (!secret?.trim()) {
    throw new Error("JWT_SECRET is required.");
  }
  if (secret.trim().length < 32) {
    throw new Error("JWT_SECRET must contain at least 32 characters.");
  }
  return secret;
}

export async function signToken(app: FastifyInstance, payload: JWTPayload): Promise<string> {
  return app.jwt.sign(payload, {
    expiresIn: TOKEN_EXPIRES_IN
  });
}

export async function verifyToken(app: FastifyInstance, token: string): Promise<JWTPayload> {
  return app.jwt.verify<JWTPayload>(token);
}
