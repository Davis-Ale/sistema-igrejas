import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { prepareCheckoutSecurity, type CheckoutSecurityConfig, type CheckoutSecurityStore } from "../../../packages/events/src/checkout-security.prepared.js";
export { registerClosedPublicCheckout } from "../../../packages/events/src/checkout-closure.prepared.js";

// Not imported by app.ts/server.ts. No environment flag activates this bundle.
export function prepareApiBrCheckoutSecurity(config: CheckoutSecurityConfig, store: CheckoutSecurityStore) {
  const security = prepareCheckoutSecurity(config, store);
  return { ...security, async install(app: FastifyInstance) {
    security.install(app);
    await app.register(cors, security.corsOptions);
  } };
}
