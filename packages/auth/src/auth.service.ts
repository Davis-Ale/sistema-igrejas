import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { comparePassword } from "./password.js";
import { signToken } from "./jwt.js";
import type { JWTPayload, Role } from "./types.js";
import type { LoginInput } from "./auth.schema.js";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function loginWithEmailAndPassword(
  app: FastifyInstance,
  prisma: PrismaClient,
  input: LoginInput
) {
  const email = normalizeEmail(input.email);

  const account = await prisma.userAccount.findUnique({
    where: {
      email
    },
    include: {
      church: {
        select: {
          id: true,
          name: true,
          slug: true,
          plan: true,
          status: true,
          trialStartedAt: true,
          trialEndsAt: true,
          blockedAt: true,
          blockReason: true
        }
      },
      person: {
        select: {
          id: true,
          name: true,
          email: true,
          campusId: true
        }
      }
    }
  });

  if (!account) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (account.status !== "ACTIVE") {
    throw new Error("ACCOUNT_DISABLED");
  }

  const passwordMatches = await comparePassword(input.password, account.passwordHash);

  if (!passwordMatches) {
    throw new Error("INVALID_CREDENTIALS");
  }

  await prisma.userAccount.update({
    where: {
      id: account.id
    },
    data: {
      lastLoginAt: new Date()
    }
  });

  let payload: JWTPayload = {
    userId: account.id,
    churchId: account.churchId,
    role: account.role as Role
  };

  if (account.person?.campusId) {
    payload = {
      ...payload,
      campusId: account.person.campusId
    };
  }

  const token = await signToken(app, payload);

  return {
    token,
    user: {
      id: account.id,
      email: account.email,
      role: account.role,
      status: account.status,
      person: account.person
    },
    church: account.church
  };
}
