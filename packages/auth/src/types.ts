import "@fastify/jwt";
import type { FastifyRequest } from "fastify";

export type Role = "SUPER_ADMIN" | "PASTOR" | "LEADER" | "VOLUNTEER" | "MEMBER";

export type JWTPayload = {
  userId: string;
  churchId: string;
  campusId?: string;
  role: Role;
};

export type AuthUser = JWTPayload;

export type RequestWithAuth = FastifyRequest & {
  user: AuthUser;
  churchId: string;
  campusId?: string;
};

declare module "@fastify/jwt" {
  interface FastifyJWT {
    payload: JWTPayload;
    user: JWTPayload;
  }
}

declare module "fastify" {
  interface FastifyRequest {
    churchId?: string;
    campusId?: string;
  }
}
