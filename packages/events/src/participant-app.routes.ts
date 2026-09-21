import { requireRole } from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError, z } from "zod";
import {
  createEventAppSessionSchema,
  eventParticipantAppParamsSchema,
  eventParticipantAppSessionParamsSchema,
  updateEventAppMapSchema,
  updateEventAppSessionSchema
} from "./participant-app.schema.js";
import {
  createEventAppSession,
  deleteEventAppSession,
  getEventParticipantAppAdmin,
  getEventAppMapImage,
  getParticipantAppMapImage,
  getPublicParticipantAppEvent,
  getParticipantAppAccessByPublicSlug,
  updateEventAppMap,
  updateEventAppSession
} from "./participant-app.service.js";

const participantAppAccessSchema = z.object({
  checkInToken: z.string().trim().min(10).max(200)
});

const publicSlugParamsSchema = z.object({
  publicSlug: z.string().trim().min(1).max(200)
});

function getChurchId(request: FastifyRequest) {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendParticipantAppError(
  error: unknown,
  reply: FastifyReply
) {
  if (error instanceof ZodError) {
    await reply.code(400).send({
      error: "VALIDATION_ERROR",
      message:
        error.issues[0]?.message ??
        "Os dados enviados são inválidos."
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

  const knownErrors: Record<
    string,
    {
      status: number;
      code: string;
      message: string;
    }
  > = {
    CHURCH_CONTEXT_REQUIRED: {
      status: 401,
      code: "UNAUTHORIZED",
      message: "Contexto de autenticação obrigatório."
    },
    EVENT_NOT_FOUND: {
      status: 404,
      code: "EVENT_NOT_FOUND",
      message: "Evento não encontrado."
    },
    EVENT_APP_MAP_IMAGE_INVALID: {
      status: 400, code: "EVENT_APP_MAP_IMAGE_INVALID",
      message: "Selecione uma imagem JPG ou PNG válida, de até 5 MB e 16 megapixels."
    },
    EVENT_APP_MAP_IMAGE_NOT_FOUND: {
      status: 404, code: "EVENT_APP_MAP_IMAGE_NOT_FOUND",
      message: "A planta do evento ainda não foi publicada."
    },
    EVENT_APP_SESSION_NOT_FOUND: {
      status: 404,
      code: "EVENT_APP_SESSION_NOT_FOUND",
      message: "Sessão não encontrada."
    },
    EVENT_APP_REGISTRATION_INVALID: {
      status: 400,
      code: "EVENT_APP_REGISTRATION_INVALID",
      message:
        "Uma inscrição selecionada não pertence a este evento ou não está elegível."
    },
    EVENT_APP_SESSION_TIME_INVALID: {
      status: 400,
      code: "EVENT_APP_SESSION_TIME_INVALID",
      message: "O término deve ser posterior ao início."
    },
    PUBLIC_REGISTRATION_NOT_FOUND: {
      status: 404,
      code: "PUBLIC_REGISTRATION_NOT_FOUND",
      message: "Credencial não encontrada."
    },
    PUBLIC_EVENT_NOT_FOUND: {
      status: 404,
      code: "PUBLIC_EVENT_NOT_FOUND",
      message: "Evento público não encontrado."
    },
    PAYMENT_REQUIRED: {
      status: 403,
      code: "PAYMENT_REQUIRED",
      message: "O pagamento ainda não foi confirmado."
    },
    PARTICIPANT_APP_ACCESS_DENIED: {
      status: 403,
      code: "PARTICIPANT_APP_ACCESS_DENIED",
      message: "Esta inscrição não pode acessar o aplicativo."
    }
  };

  const knownError = knownErrors[error.message];

  if (knownError) {
    await reply.code(knownError.status).send({
      error: knownError.code,
      message: knownError.message
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerPublicParticipantAppRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
) {
  app.post("/public/event-pages/:publicSlug/map-image", async (request, reply) => {
    try {
      const params = publicSlugParamsSchema.parse(request.params);
      const input = participantAppAccessSchema.parse(request.body);
      const image = await getParticipantAppMapImage(prisma, params.publicSlug, input.checkInToken);
      return sendMapImage(reply, image);
    } catch (error) {
      await sendParticipantAppError(error, reply);
    }
  });
  app.get(
    "/public/event-pages/:publicSlug/app",
    async (request, reply) => {
      try {
        const params = publicSlugParamsSchema.parse(request.params);
        const event = await getPublicParticipantAppEvent(
          prisma,
          params.publicSlug
        );

        reply.header("Cache-Control", "no-store");
        return event;
      } catch (error) {
        await sendParticipantAppError(error, reply);
      }
    }
  );

  app.post(
    "/public/event-pages/:publicSlug/access",
    async (request, reply) => {
      try {
        const params = publicSlugParamsSchema.parse(request.params);
        const input = participantAppAccessSchema.parse(request.body);

        const access = await getParticipantAppAccessByPublicSlug(
          prisma,
          params.publicSlug,
          input.checkInToken
        );

        reply.header("Cache-Control", "no-store");
        return access;
      } catch (error) {
        await sendParticipantAppError(error, reply);
      }
    }
  );
}

export async function registerEventParticipantAppRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
) {
  app.get("/events/:eventId/participant-app/map/image", async (request, reply) => {
    try {
      const params = eventParticipantAppParamsSchema.parse(request.params);
      const image = await getEventAppMapImage(prisma, getChurchId(request), params.eventId);
      return sendMapImage(reply, image);
    } catch (error) {
      await sendParticipantAppError(error, reply);
    }
  });
  app.get(
    "/events/:eventId/participant-app",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params =
          eventParticipantAppParamsSchema.parse(request.params);

        return await getEventParticipantAppAdmin(
          prisma,
          churchId,
          params.eventId
        );
      } catch (error) {
        await sendParticipantAppError(error, reply);
      }
    }
  );

  app.post(
    "/events/:eventId/participant-app/sessions",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params =
          eventParticipantAppParamsSchema.parse(request.params);
        const input =
          createEventAppSessionSchema.parse(request.body);

        const session = await createEventAppSession(
          prisma,
          churchId,
          params.eventId,
          input
        );

        await reply.code(201).send(session);
      } catch (error) {
        await sendParticipantAppError(error, reply);
      }
    }
  );

  app.patch(
    "/events/:eventId/participant-app/sessions/:sessionId",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params =
          eventParticipantAppSessionParamsSchema.parse(request.params);
        const input =
          updateEventAppSessionSchema.parse(request.body);

        return await updateEventAppSession(
          prisma,
          churchId,
          params.eventId,
          params.sessionId,
          input
        );
      } catch (error) {
        await sendParticipantAppError(error, reply);
      }
    }
  );

  app.delete(
    "/events/:eventId/participant-app/sessions/:sessionId",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]) },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params =
          eventParticipantAppSessionParamsSchema.parse(request.params);

        await deleteEventAppSession(
          prisma,
          churchId,
          params.eventId,
          params.sessionId
        );

        await reply.code(204).send();
      } catch (error) {
        await sendParticipantAppError(error, reply);
      }
    }
  );

  app.put(
    "/events/:eventId/participant-app/map",
    { preHandler: requireRole(["SUPER_ADMIN", "PASTOR"]), bodyLimit: 7 * 1024 * 1024 },
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params =
          eventParticipantAppParamsSchema.parse(request.params);
        const input = updateEventAppMapSchema.parse(request.body);

        return await updateEventAppMap(
          prisma,
          churchId,
          params.eventId,
          input
        );
      } catch (error) {
        await sendParticipantAppError(error, reply);
      }
    }
  );
}

function sendMapImage(reply: FastifyReply, image: { data: Uint8Array; contentType: string }) {
  return reply
    .header("Cache-Control", "private, no-store")
    .header("X-Content-Type-Options", "nosniff")
    .header("Content-Security-Policy", "default-src 'none'; sandbox")
    .header("Content-Disposition", `inline; filename="planta.${image.contentType === "image/png" ? "png" : "jpg"}"`)
    .type(image.contentType)
    .send(Buffer.from(image.data));
}
