import type { FastifyReply, FastifyRequest } from "fastify";

export const AUTH_LOGIN_IP_RATE_LIMIT = {
  name: "auth-login",
  limit: 10,
  windowMs: 60_000
} as const;

export const ASAAS_WEBHOOK_IP_RATE_LIMIT = {
  name: "webhooks-asaas",
  limit: 60,
  windowMs: 60_000
} as const;

export function createFixedWindowIpRateLimit(options: {
  name: string;
  limit: number;
  windowMs: number;
}) {
  const hits = new Map<string, { count: number; resetAt: number }>();

  return async function ipRateLimitPreHandler(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const now = Date.now();
    const key = `${options.name}:${request.ip || "unknown"}`;
    let bucket = hits.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + options.windowMs };
      hits.set(key, bucket);
    }

    bucket.count += 1;

    if (bucket.count > options.limit) {
      const retryAfter = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      await reply.header("Retry-After", String(retryAfter)).code(429).send({
        error: "RATE_LIMITED",
        message: "Muitas tentativas. Tente novamente em instantes."
      });
    }
  };
}
