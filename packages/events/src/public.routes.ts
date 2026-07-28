import type {
  PrismaClient
} from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply
} from "fastify";
import {
  ZodError,
  z
} from "zod";
import {
  createPublicRegistrationSchema
} from "./event.schema.js";
import {
  createPublicRegistration,
  getPublicEventById
} from "./event.service.js";
import {
  createPublicRegistrationBySlugs,
  getPublicEventByPublicSlug,
  getPublicEventBySlugs,
  getPublicRegistrationByTokenBySlugs
} from "./public.service.js";

const publicRegistrationAccessSchema = z.object({
  checkInToken: z.string().trim().min(10)
});

async function sendPublicRouteError(
  error: unknown,
  reply: FastifyReply
): Promise<void> {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message: "Os dados enviados são inválidos."
    });
    return;
  }

  if (!(error instanceof Error)) {
    await reply.code(500).send({
      error: "INTERNAL_SERVER_ERROR",
      message: "Erro interno."
    });
    return;
  }

  if (error.message === "PUBLIC_EVENT_NOT_FOUND") {
    await reply.code(404).send({
      error: "PUBLIC_EVENT_NOT_FOUND",
      message: "Evento público não encontrado."
    });
    return;
  }

  if (
    error.message ===
    "PUBLIC_REGISTRATION_NOT_FOUND"
  ) {
    await reply.code(404).send({
      error: "PUBLIC_REGISTRATION_NOT_FOUND",
      message: "Credencial não encontrada."
    });
    return;
  }

  if (
    error.message ===
    "PUBLIC_REGISTRATION_DISABLED"
  ) {
    await reply.code(409).send({
      error: "PUBLIC_REGISTRATION_DISABLED",
      message:
        "As inscrições públicas deste evento estão encerradas."
    });
    return;
  }

  if (error.message === "EVENT_CAPACITY_REACHED") {
    await reply.code(409).send({
      error: "EVENT_CAPACITY_REACHED",
      message:
        "As vagas deste evento foram preenchidas."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerPublicEventRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): Promise<void> {
  app.get(
    "/public/event-pages/:publicSlug",
    async (request, reply) => {
      try {
        const params = request.params as {
          publicSlug: string;
        };

        return await getPublicEventByPublicSlug(
          prisma,
          params.publicSlug
        );
      } catch (error) {
        await sendPublicRouteError(error, reply);
      }
    }
  );

  app.get(
    "/public/churches/:churchSlug/events/:eventSlug",
    async (request, reply) => {
      try {
        const params = request.params as {
          churchSlug: string;
          eventSlug: string;
        };

        return await getPublicEventBySlugs(
          prisma,
          params.churchSlug,
          params.eventSlug
        );
      } catch (error) {
        await sendPublicRouteError(error, reply);
      }
    }
  );

  app.post(
    "/public/churches/:churchSlug/events/:eventSlug/register",
    async (request, reply) => {
      try {
        const params = request.params as {
          churchSlug: string;
          eventSlug: string;
        };

        const input =
          createPublicRegistrationSchema.parse(
            request.body
          );

        const registration =
          await createPublicRegistrationBySlugs(
            prisma,
            params.churchSlug,
            params.eventSlug,
            input
          );

        await reply
          .code(
            registration.wasExisting
              ? 200
              : 201
          )
          .send(registration);
      } catch (error) {
        await sendPublicRouteError(error, reply);
      }
    }
  );

  app.post(
    "/public/churches/:churchSlug/events/:eventSlug/access",
    async (request, reply) => {
      try {
        const params = request.params as {
          churchSlug: string;
          eventSlug: string;
        };

        const input =
          publicRegistrationAccessSchema.parse(
            request.body
          );

        return await getPublicRegistrationByTokenBySlugs(
          prisma,
          params.churchSlug,
          params.eventSlug,
          input.checkInToken
        );
      } catch (error) {
        await sendPublicRouteError(error, reply);
      }
    }
  );

  app.get(
    "/public/events/:eventId",
    async (request, reply) => {
      try {
        const params = request.params as {
          eventId: string;
        };

        return await getPublicEventById(
          prisma,
          params.eventId
        );
      } catch (error) {
        await sendPublicRouteError(error, reply);
      }
    }
  );

  app.post(
    "/public/events/:eventId/register",
    async (request, reply) => {
      try {
        const params = request.params as {
          eventId: string;
        };

        const input =
          createPublicRegistrationSchema.parse(
            request.body
          );

        const registration =
          await createPublicRegistration(
            prisma,
            params.eventId,
            input
          );

        await reply
          .code(201)
          .send(registration);
      } catch (error) {
        await sendPublicRouteError(error, reply);
      }
    }
  );
}
