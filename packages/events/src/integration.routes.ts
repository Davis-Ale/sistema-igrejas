import { requireRole } from "@sistema-igrejas/auth";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import {
  PROVIDER_SLUG_TO_ENUM,
  eventIntegrationProviderParamsSchema
} from "./integration.schema.js";
import {
  connectEventIntegration,
  disconnectEventIntegration,
  listEventIntegrations
} from "./integration.service.js";

function getChurchId(request: FastifyRequest): string {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendIntegrationError(
  error: unknown,
  reply: FastifyReply
): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message:
        error.issues[0]?.message ??
        "Os dados enviados são inválidos."
    });
    return;
  }

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    await reply.code(409).send({
      error: "INTEGRATION_ALREADY_EXISTS",
      message: "Esta integração já está cadastrada para a igreja."
    });
    return;
  }

  if (error instanceof Error) {
    if (error.message === "CHURCH_CONTEXT_REQUIRED") {
      await reply.code(401).send({
        error: "UNAUTHORIZED",
        message: "Autenticação obrigatória."
      });
      return;
    }

    if (error.message === "INTEGRATION_NOT_CONNECTABLE") {
      await reply.code(409).send({
        error: "INTEGRATION_NOT_CONNECTABLE",
        message:
          "Esta integração ainda não pode ser conectada. Falta o aplicativo OAuth RD Station da plataforma."
      });
      return;
    }

    if (error.message === "INTEGRATION_PROVIDER_REJECTED") {
      await reply.code(400).send({
        error: "INTEGRATION_PROVIDER_REJECTED",
        message:
          "O provedor recusou as credenciais. Nada foi salvo."
      });
      return;
    }

    if (error.message === "INTEGRATION_ENCRYPTION_NOT_CONFIGURED") {
      await reply.code(503).send({
        error: "INTEGRATION_ENCRYPTION_NOT_CONFIGURED",
        message:
          "A conexão com este provedor não está disponível no momento."
      });
      return;
    }

    if (error.message === "INTEGRATION_PROVIDER_INVALID") {
      await reply.code(400).send({
        error: "INTEGRATION_PROVIDER_INVALID",
        message: "Integração inválida."
      });
      return;
    }

    if (error.message === "VALIDATION_ERROR") {
      await reply.code(400).send({
        error: "VALIDATION_ERROR",
        message: "Os dados enviados são inválidos."
      });
      return;
    }
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerEventIntegrationRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get("/events/integrations", async (request, reply) => {
    try {
      const churchId = getChurchId(request);

      return await listEventIntegrations(prisma, churchId);
    } catch (error) {
      await sendIntegrationError(error, reply);
    }
  });

  app.post(
    "/events/integrations/:provider/connect",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params = eventIntegrationProviderParamsSchema.parse(
          request.params
        );
        const provider = PROVIDER_SLUG_TO_ENUM[params.provider];
        const item = await connectEventIntegration(
          prisma,
          churchId,
          provider,
          request.body
        );

        await reply.code(200).send(item);
      } catch (error) {
        await sendIntegrationError(error, reply);
      }
    }
  );

  app.post(
    "/events/integrations/:provider/disconnect",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params = eventIntegrationProviderParamsSchema.parse(
          request.params
        );
        const provider = PROVIDER_SLUG_TO_ENUM[params.provider];
        const item = await disconnectEventIntegration(
          prisma,
          churchId,
          provider
        );

        await reply.code(200).send(item);
      } catch (error) {
        await sendIntegrationError(error, reply);
      }
    }
  );
}
