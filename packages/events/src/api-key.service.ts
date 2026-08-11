import { randomBytes, createHash } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { CreateEventApiKeyInput } from "./api-key.schema.js";

const KEY_PREFIX_LENGTH = 8;

function generateApiKey() {
  const secret = randomBytes(32).toString("hex");
  const token = `sik_${secret}`;
  const keyPrefix = token.slice(0, KEY_PREFIX_LENGTH);
  const keyHash = createHash("sha256").update(token).digest("hex");

  return { token, keyPrefix, keyHash };
}

async function requireEvent(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!event) {
    throw new Error("EVENT_NOT_FOUND");
  }
}

export async function listEventApiKeys(
  prisma: PrismaClient,
  churchId: string,
  eventId: string
) {
  await requireEvent(prisma, churchId, eventId);

  return prisma.eventApiKey.findMany({
    where: {
      churchId,
      eventId
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function createEventApiKey(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  input: CreateEventApiKeyInput
) {
  await requireEvent(prisma, churchId, eventId);

  const { token, keyPrefix, keyHash } = generateApiKey();

  const apiKey = await prisma.eventApiKey.create({
    data: {
      churchId,
      eventId,
      name: input.name,
      keyPrefix,
      keyHash
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true
    }
  });

  return {
    ...apiKey,
    token
  };
}

export async function revokeEventApiKey(
  prisma: PrismaClient,
  churchId: string,
  eventId: string,
  apiKeyId: string
) {
  const apiKey = await prisma.eventApiKey.findFirst({
    where: {
      id: apiKeyId,
      churchId,
      eventId
    },
    select: {
      id: true,
      revokedAt: true
    }
  });

  if (!apiKey) {
    throw new Error("EVENT_API_KEY_NOT_FOUND");
  }

  if (apiKey.revokedAt) {
    throw new Error("EVENT_API_KEY_ALREADY_REVOKED");
  }

  return prisma.eventApiKey.update({
    where: {
      id: apiKeyId
    },
    data: {
      revokedAt: new Date()
    },
    select: {
      id: true,
      name: true,
      keyPrefix: true,
      createdAt: true,
      revokedAt: true,
      lastUsedAt: true
    }
  });
}
