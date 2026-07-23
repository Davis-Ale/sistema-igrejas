import "dotenv/config";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createAuthPreHandler,
  registerAuthRoutes
} from "@sistema-igrejas/auth";
import { PrismaClient } from "@sistema-igrejas/database";
import { registerEventRoutes } from "@sistema-igrejas/events";
import { registerFinancialRoutes } from "@sistema-igrejas/financial";
import {
  registerCellListRoutes,
  registerCellLocationRoutes,
  registerCellRoutes,
  registerCellStatusRoutes,
  registerMemberRoutes,
  registerVisitorRoutes
} from "@sistema-igrejas/members";
import { registerTrailRoutes } from "@sistema-igrejas/trail";
import { registerVolunteerRoutes } from "@sistema-igrejas/volunteers";
import Fastify, {
  type FastifyInstance
} from "fastify";
import { registerAssistantRoutes } from "./assistant/assistant.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: true
  });

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl
  });

  const prisma = new PrismaClient({
    adapter
  });

  const jwtSecret =
    process.env.JWT_SECRET ?? "dev-secret-change-me";

  await app.register(cors, {
    origin: true,
    methods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Authorization",
      "Content-Type"
    ]
  });

  await app.register(jwt, {
    secret: jwtSecret
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      service: "api-br"
    };
  });

  await registerAuthRoutes(app, prisma);

  await app.register(
    async (protectedRoutes) => {
      protectedRoutes.addHook(
        "preHandler",
        createAuthPreHandler(prisma)
      );

      await registerAssistantRoutes(protectedRoutes, prisma);
      await registerEventRoutes(protectedRoutes, prisma);
      await registerFinancialRoutes(protectedRoutes, prisma);
      await registerCellListRoutes(protectedRoutes, prisma);
      await registerCellRoutes(protectedRoutes, prisma);
      await registerCellStatusRoutes(protectedRoutes, prisma);
      await registerCellLocationRoutes(protectedRoutes, prisma);
      await registerMemberRoutes(protectedRoutes, prisma);
      await registerVisitorRoutes(protectedRoutes, prisma);
      await registerTrailRoutes(protectedRoutes, prisma);
      await registerVolunteerRoutes(protectedRoutes, prisma);
    },
    {
      prefix: "/api"
    }
  );

  return app;
}
