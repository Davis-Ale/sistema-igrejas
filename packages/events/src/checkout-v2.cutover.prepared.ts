import type { PrismaClient } from "@prisma/client";
import type { FastifyInstance, RouteOptions } from "fastify";
import { CHECKOUT_PUBLIC_PATHS } from "./checkout-security.prepared.js";
import { assertNoLegacyCheckoutRoutes } from "./checkout-v2.routes.js";
import { registerPublicEventRoutes } from "./public.routes.js";

function publicCheckoutPosts(routes: RouteOptions[]) {
  return routes.filter((route) => {
    const methods = Array.isArray(route.method) ? route.method : [route.method];
    return methods.includes("POST") && typeof route.url === "string"
      && (CHECKOUT_PUBLIC_PATHS as readonly string[]).includes(route.url);
  });
}

// Exclusive composition for BOTH APIs. No env flag. Rollback is CLOSED + drain,
// never the legacy payment callback. Gate close and the additive migration stay
// authorized operational steps before admitting live checkout.
export async function registerExclusiveCheckoutV2(
  app: FastifyInstance,
  prisma: PrismaClient,
  routes: RouteOptions[]
) {
  if (publicCheckoutPosts(routes).length !== CHECKOUT_PUBLIC_PATHS.length) {
    throw new Error("CHECKOUT_V2_CUTOVER_INCOMPLETE");
  }
  for (const url of CHECKOUT_PUBLIC_PATHS) {
    if (app.hasRoute({ method: "POST", url })) throw new Error("CHECKOUT_V2_REQUIRES_EXCLUSIVE_REPLACEMENT");
  }
  await registerPublicEventRoutes(app, prisma, undefined, "omit");
  assertNoLegacyCheckoutRoutes(app);
  for (const route of routes) app.route(route);
}
