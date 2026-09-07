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
  createEventDiscountSchema,
  eventDiscountParamsSchema,
  updateEventDiscountSchema
} from "./discount.schema.js";
import {
  createEventDiscount,
  listEventDiscounts,
  updateEventDiscount
} from "./discount.service.js";
import { eventIdParamsSchema } from "./event.schema.js";

function getChurchId(request: FastifyRequest) {
  if (!request.churchId) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  return request.churchId;
}

async function sendDiscountError(
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
      error: "DISCOUNT_CODE_ALREADY_EXISTS",
      message: "Já existe um desconto com este código neste evento."
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
        message: "Ingresso não encontrado para este evento."
      });
      return;
    }

    if (error.message === "EVENT_DISCOUNT_NOT_FOUND") {
      await reply.code(404).send({
        error: "EVENT_DISCOUNT_NOT_FOUND",
        message: "Desconto não encontrado para este evento."
      });
      return;
    }
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export async function registerDiscountRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
) {
  app.get(
    "/events/:eventId/discounts",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params = eventIdParamsSchema.parse(request.params);

        return await listEventDiscounts(
          prisma,
          churchId,
          params.eventId
        );
      } catch (error) {
        await sendDiscountError(error, reply);
      }
    }
  );

  app.post(
    "/events/:eventId/discounts",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params = eventIdParamsSchema.parse(request.params);
        const input = createEventDiscountSchema.parse(request.body);

        const discount = await createEventDiscount(
          prisma,
          churchId,
          params.eventId,
          input
        );

        await reply.code(201).send(discount);
      } catch (error) {
        await sendDiscountError(error, reply);
      }
    }
  );

  app.patch(
    "/events/:eventId/discounts/:discountId",
    async (request, reply) => {
      try {
        const churchId = getChurchId(request);
        const params = eventDiscountParamsSchema.parse(request.params);
        const input = updateEventDiscountSchema.parse(request.body);

        const discount = await updateEventDiscount(
          prisma,
          churchId,
          params.eventId,
          params.discountId,
          input
        );

        await reply.code(200).send(discount);
      } catch (error) {
        await sendDiscountError(error, reply);
      }
    }
  );
}
