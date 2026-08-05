import type {} from "@sistema-igrejas/auth";
import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  FastifyInstance,
  FastifyReply,
  FastifyRequest
} from "fastify";
import { ZodError } from "zod";
import {
  createEventTicketSchema,
  createTicketBatchSchema
} from "./ticket.schema.js";
import {
  createEventTicket,
  createTicketBatch,
  listEventTickets
} from "./ticket.service.js";

function getChurchId(request: FastifyRequest) {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendTicketError(
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

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002"
  ) {
    await reply.code(409).send({
      error: "DUPLICATE_TICKET_DATA",
      message:
        "Já existe um ingresso ou lote com este nome."
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

    if (error.message === "EVENT_NOT_FOUND") {
      await reply.code(404).send({
        error: "EVENT_NOT_FOUND",
        message: "Evento não encontrado."
      });
      return;
    }

    if (error.message === "EVENT_TICKET_NOT_FOUND") {
      await reply.code(404).send({
        error: "EVENT_TICKET_NOT_FOUND",
        message:
          "Ingresso não encontrado para este evento."
      });
      return;
    }

    if (
      error.message === "FREE_TICKET_PRICE_NOT_ZERO"
    ) {
      await reply.code(400).send({
        error: "FREE_TICKET_PRICE_NOT_ZERO",
        message:
          "Um ingresso gratuito não pode possuir preço."
      });
      return;
    }
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerTicketRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
) {
  app.get(
    "/events/:eventId/tickets",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const { eventId } = request.params as {
          eventId: string;
        };

        return await listEventTickets(
          prisma,
          churchId,
          eventId
        );
      } catch (error) {
        await sendTicketError(error, reply);
      }
    }
  );

  app.post(
    "/events/:eventId/tickets",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const { eventId } = request.params as {
          eventId: string;
        };
        const input =
          createEventTicketSchema.parse(request.body);

        const ticket = await createEventTicket(
          prisma,
          churchId,
          eventId,
          input
        );

        await reply.code(201).send(ticket);
      } catch (error) {
        await sendTicketError(error, reply);
      }
    }
  );

  app.post(
    "/events/:eventId/ticket-batches",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const { eventId } = request.params as {
          eventId: string;
        };
        const input =
          createTicketBatchSchema.parse(request.body);

        const batch = await createTicketBatch(
          prisma,
          churchId,
          eventId,
          input
        );

        await reply.code(201).send(batch);
      } catch (error) {
        await sendTicketError(error, reply);
      }
    }
  );
}
