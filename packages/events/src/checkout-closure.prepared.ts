import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance } from "fastify";
import { CHECKOUT_PUBLIC_PATHS } from "./checkout-security.prepared.js";
import { registerPublicEventRoutes } from "./public.routes.js";

// Future containment composition only. No current buildApp calls this registrar.
// No v2 handler, payment callback, token fallback or alternate public URL exists.
export async function registerClosedPublicCheckout(app: FastifyInstance, prisma: PrismaClient) {
  for (const url of CHECKOUT_PUBLIC_PATHS) {
    if (app.hasRoute({ method: "POST", url })) throw new Error("CHECKOUT_CLOSURE_REQUIRES_EXCLUSIVE_REPLACEMENT");
  }
  await registerPublicEventRoutes(app, prisma, undefined, "omit");
  for (const url of CHECKOUT_PUBLIC_PATHS) {
    app.post(url, async (_request, reply) => reply.header("Cache-Control", "no-store")
      .code(503).send({ error: "CHECKOUT_CLOSED", message: "Checkout temporariamente indisponível." }));
  }
}
