import "dotenv/config";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import Fastify from "fastify";
import { PrismaClient } from "@sistema-igrejas/database";

const app = Fastify({
  logger: true
});

const prisma = new PrismaClient();

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";
const jwtSecret = process.env.JWT_SECRET ?? "dev-secret-change-me";

await app.register(cors, {
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
