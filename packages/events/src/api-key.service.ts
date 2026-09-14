import { createHash, randomBytes } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import type { FastifyBaseLogger } from "fastify";
import type {
  CreateEventApiKeyInput,
  EventApiKeyScope
} from "./api-key.schema.js";

const KEY_PREFIX_LENGTH = 8;

const apiKeyPublicSelect = {
  id: true,
  name: true,
  description: true,
  keyPrefix: true,
  scopes: true,
  createdAt: true,
  revokedAt: true,
  lastUsedAt: true
} as const;

function generateApiKey() {
  const secret = randomBytes(32).toString("hex");
  const token = `sik_${secret}`;
  const keyPrefix = token.slice(0, KEY_PREFIX_LENGTH);
  const keyHash = createHash("sha256").update(token).digest("hex");

  return { token, keyPrefix, keyHash };
}

export function hashEventApiKeyToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeDescription(description: string | undefined) {
  const trimmed = description?.trim() ?? "";

  if (!trimmed) {
    return null;
  }

  return trimmed;
}

export async function listEventApiKeys(
  prisma: PrismaClient,
  churchId: string
) {
  return prisma.eventApiKey.findMany({
    where: {
      churchId
    },
    select: apiKeyPublicSelect,
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function createEventApiKey(
  prisma: PrismaClient,
  churchId: string,
  input: CreateEventApiKeyInput
) {
  const { token, keyPrefix, keyHash } = generateApiKey();

  const apiKey = await prisma.eventApiKey.create({
    data: {
      churchId,
      name: input.name,
      description: normalizeDescription(input.description),
      keyPrefix,
      keyHash,
      scopes: input.scopes
    },
    select: apiKeyPublicSelect
  });

  return {
    ...apiKey,
    token
  };
}

export async function revokeEventApiKey(
  prisma: PrismaClient,
  churchId: string,
  apiKeyId: string
) {
  const apiKey = await prisma.eventApiKey.findFirst({
    where: {
      id: apiKeyId,
      churchId
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
      id: apiKey.id
    },
    data: {
      revokedAt: new Date()
    },
    select: apiKeyPublicSelect
  });
}

export async function authenticateEventApiKey(
  prisma: PrismaClient,
  headerValue: string | string[] | undefined,
  requiredScope: EventApiKeyScope,
  logger?: FastifyBaseLogger
) {
  if (typeof headerValue !== "string" || !headerValue.trim()) {
    throw new Error("API_KEY_INVALID");
  }

  const keyHash = hashEventApiKeyToken(headerValue.trim());
  const apiKey = await prisma.eventApiKey.findUnique({
    where: {
      keyHash
    },
    select: {
      id: true,
      churchId: true,
      scopes: true,
      revokedAt: true
    }
  });

  if (!apiKey || apiKey.revokedAt) {
    throw new Error("API_KEY_INVALID");
  }

  if (!apiKey.scopes.includes(requiredScope)) {
    throw new Error("API_KEY_SCOPE_DENIED");
  }

  try {
    await prisma.eventApiKey.update({
      where: {
        id: apiKey.id
      },
      data: {
        lastUsedAt: new Date()
      }
    });
  } catch (error) {
    logger?.warn(
      {
        err: error,
        apiKeyId: apiKey.id
      },
      "Failed to update API key lastUsedAt"
    );
  }

  return {
    churchId: apiKey.churchId,
    apiKeyId: apiKey.id,
    scopes: apiKey.scopes
  };
}
