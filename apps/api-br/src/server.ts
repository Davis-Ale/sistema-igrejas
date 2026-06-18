import "dotenv/config";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import { createAuthPreHandler, registerAuthRoutes } from "@sistema-igrejas/auth";
import { PrismaClient } from "@sistema-igrejas/database";
import { registerEventRoutes, registerPublicEventRoutes } from "@sistema-igrejas/events";
import { registerFinancialRoutes } from "@sistema-igrejas/financial";
import { registerCellRoutes, registerMemberRoutes, registerVisitorRoutes } from "@sistema-igrejas/members";
import { registerTrailRoutes } from "@sistema-igrejas/trail";
import { registerVolunteerRoutes } from "@sistema-igrejas/volunteers";
import Fastify from "fastify";

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

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";

await app.register(cors, {
  allowedHeaders: [
    "Authorization",
    "Content-Type"
  ],
  methods: [
    "GET",
    "POST",
    "PATCH",
    "PUT",
    "DELETE",
    "OPTIONS"
  ],
  origin: true
});

await app.register(jwt, {
  secret: jwtSecret
});

app.get("/health", async () => {
  await prisma.$queryRaw`SELECT 1`;

  return {
    status: "ok",
    service: "api-br"
  };
});

await registerAuthRoutes(app, prisma);
await registerPublicEventRoutes(app, prisma);

await app.register(
  async (protectedRoutes) => {
    protectedRoutes.addHook("preHandler", createAuthPreHandler(prisma));

    await registerEventRoutes(protectedRoutes, prisma);
    await registerFinancialRoutes(protectedRoutes, prisma);
    await registerCellRoutes(protectedRoutes, prisma);
    await registerMemberRoutes(protectedRoutes, prisma);
    await registerVisitorRoutes(protectedRoutes, prisma);
    await registerTrailRoutes(protectedRoutes, prisma);
    await registerVolunteerRoutes(protectedRoutes, prisma);
  },
  {
    prefix: "/api"
  }
);

async function start(): Promise<void> {
  try {
    await app.listen({
      port,
      host
    });
  } catch (error) {
    app.log.error(error);
    await prisma.$disconnect();
    process.exit(1);
  }
}

process.on("SIGINT", async () => {
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
});

process.on("SIGTERM", async () => {
  await prisma.$disconnect();
  await app.close();
  process.exit(0);
});

await start();
