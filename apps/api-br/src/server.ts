import "dotenv/config";
import { buildApp } from "./app.js";

const port = Number(process.env.PORT ?? 3333);
const host = process.env.HOST ?? "0.0.0.0";

const app = await buildApp();

async function start(): Promise<void> {
  try {
    await app.listen({
      port,
      host
    });
  } catch (error) {
    app.log.error(error);
    await app.close();
    process.exitCode = 1;
  }
}

async function shutdown(): Promise<void> {
  await app.close();
}

process.once("SIGINT", shutdown);
process.once("SIGTERM", shutdown);

await start();
