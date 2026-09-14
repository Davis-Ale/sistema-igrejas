import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const KEY_HEX_LENGTH = 64;
const IV_LENGTH = 12;
const PREFIX = "v1";

function getEncryptionKey(): Buffer {
  const raw = process.env.EVENTS_INTEGRATIONS_ENCRYPTION_KEY?.trim() ?? "";

  if (!/^[0-9a-fA-F]{64}$/.test(raw) || raw.length !== KEY_HEX_LENGTH) {
    throw new Error("INTEGRATION_ENCRYPTION_NOT_CONFIGURED");
  }

  return Buffer.from(raw, "hex");
}

export function isIntegrationEncryptionConfigured(): boolean {
  try {
    getEncryptionKey();
    return true;
  } catch {
    return false;
  }
}

export function encryptIntegrationSecret(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString("base64"),
    tag.toString("base64"),
    encrypted.toString("base64")
  ].join(":");
}

export function decryptIntegrationSecret(payload: string): string {
  const key = getEncryptionKey();
  const parts = payload.split(":");

  if (parts.length !== 4 || parts[0] !== PREFIX) {
    throw new Error("INTEGRATION_ENCRYPTION_NOT_CONFIGURED");
  }

  const iv = Buffer.from(parts[1] ?? "", "base64");
  const tag = Buffer.from(parts[2] ?? "", "base64");
  const encrypted = Buffer.from(parts[3] ?? "", "base64");

  if (!iv.length || !tag.length || !encrypted.length) {
    throw new Error("INTEGRATION_ENCRYPTION_NOT_CONFIGURED");
  }

  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([
    decipher.update(encrypted),
    decipher.final()
  ]).toString("utf8");
}

export function maskSecretHint(secret: string): string {
  const trimmed = secret.trim();
  const lastFour = trimmed.slice(-4);

  if (!lastFour) {
    return "••••";
  }

  return `••••${lastFour}`;
}
