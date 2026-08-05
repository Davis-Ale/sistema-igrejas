import type {} from "@sistema-igrejas/auth";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import {
  createEventFormFieldSchema,
  reorderEventFormFieldsSchema,
  updateEventFormFieldSchema
} from "./registration-form.schema.js";
import {
  createEventFormField,
  listEventFormFields,
  reorderEventFormFields,
  updateEventFormField
} from "./registration-form.service.js";

function getChurchId(request: FastifyRequest) {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendFormError(
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

  if (error instanceof Error) {
    const errors: Record<
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
        message: "Autenticação obrigatória."
      },
      EVENT_NOT_FOUND: {
        status: 404,
        code: "EVENT_NOT_FOUND",
        message: "Evento não encontrado."
      },
      EVENT_TICKET_NOT_FOUND: {
        status: 404,
        code: "EVENT_TICKET_NOT_FOUND",
        message:
          "Ingresso não encontrado para este evento."
      },
      EVENT_FORM_FIELD_NOT_FOUND: {
        status: 404,
        code: "EVENT_FORM_FIELD_NOT_FOUND",
        message:
          "Campo não encontrado para este evento."
      }
    };

    const routeError = errors[error.message];

    if (routeError) {
      await reply.code(routeError.status).send({
        error: routeError.code,
        message: routeError.message
      });
      return;
    }
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerRegistrationFormRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
) {
  app.get(
    "/events/:eventId/form-fields",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const { eventId } = request.params as {
          eventId: string;
        };

        return await listEventFormFields(
          prisma,
          churchId,
          eventId
        );
      } catch (error) {
        await sendFormError(error, reply);
      }
    }
  );

  app.post(
    "/events/:eventId/form-fields",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const { eventId } = request.params as {
          eventId: string;
        };
        const input =
          createEventFormFieldSchema.parse(request.body);

        const field = await createEventFormField(
          prisma,
          churchId,
          eventId,
          input
        );

        await reply.code(201).send(field);
      } catch (error) {
        await sendFormError(error, reply);
      }
    }
  );

  app.patch(
    "/events/:eventId/form-fields/:fieldId",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const { eventId, fieldId } =
          request.params as {
            eventId: string;
            fieldId: string;
          };
        const input =
          updateEventFormFieldSchema.parse(request.body);

        return await updateEventFormField(
          prisma,
          churchId,
          eventId,
          fieldId,
          input
        );
      } catch (error) {
        await sendFormError(error, reply);
      }
    }
  );

  app.patch(
    "/events/:eventId/form-fields-order",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const { eventId } = request.params as {
          eventId: string;
        };
        const input =
          reorderEventFormFieldsSchema.parse(
            request.body
          );

        return await reorderEventFormFields(
          prisma,
          churchId,
          eventId,
          input
        );
      } catch (error) {
        await sendFormError(error, reply);
      }
    }
  );
}
