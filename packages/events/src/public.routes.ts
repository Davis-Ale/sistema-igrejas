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

  const publicErrors: Record<
    string,
    {
      status: number;
      code: string;
      message: string;
    }
  > = {
    EVENT_TICKET_NOT_FOUND: {
      status: 404,
      code: "EVENT_TICKET_NOT_FOUND",
      message: "Ingresso não encontrado."
    },
    TICKET_BATCH_NOT_FOUND: {
      status: 404,
      code: "TICKET_BATCH_NOT_FOUND",
      message: "Lote não encontrado."
    },
    TICKET_BATCH_NOT_AVAILABLE: {
      status: 409,
      code: "TICKET_BATCH_NOT_AVAILABLE",
      message: "Este lote não está disponível para venda."
    },
    TICKET_BATCH_SOLD_OUT: {
      status: 409,
      code: "TICKET_BATCH_SOLD_OUT",
      message: "As vagas deste lote foram preenchidas."
    },
    REQUIRED_FORM_ANSWER_MISSING: {
      status: 400,
      code: "REQUIRED_FORM_ANSWER_MISSING",
      message: "Preencha todos os campos obrigatórios."
    },
    INVALID_FORM_ANSWER: {
      status: 400,
      code: "INVALID_FORM_ANSWER",
      message: "Uma ou mais respostas são inválidas."
    }
  };

  const publicError = publicErrors[error.message];

  if (publicError) {
    await reply.code(publicError.status).send({
      error: publicError.code,
      message: publicError.message
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

  if (
    error.message ===
    "PAYMENT_CUSTOMER_CPF_REQUIRED"
  ) {
    await reply.code(400).send({
      error:
        "PAYMENT_CUSTOMER_CPF_REQUIRED",
      message:
        "Informe um CPF válido para continuar com o pagamento."
    });
    return;
  }

  if (
    error.message ===
    "PAYMENT_METHOD_ALREADY_SELECTED"
  ) {
    await reply.code(409).send({
      error:
        "PAYMENT_METHOD_ALREADY_SELECTED",
      message:
        "Esta cobrança já foi iniciada com outra forma de pagamento."
    });
    return;
  }

  if (
    error.message ===
    "PAYMENT_CHECKOUT_FAILED"
  ) {
    await reply.code(502).send({
      error: "PAYMENT_CHECKOUT_FAILED",
      message:
        "Não foi possível iniciar o pagamento agora."
    });
    return;
  }

  await reply.code(500).send({
    error: "INTERNAL_SERVER_ERROR",
    message: "Erro interno."
  });
}

export type PublicRegistrationPaymentMethod =
  | "PIX"
  | "CREDIT_CARD"
  | "DEBIT_CARD";

export type PublicRegistrationPaymentCheckout =
  | {
      method: "PIX";
      pix: {
        encodedImage: string;
        payload: string;
        expirationDate: string;
      };
    }
  | {
      method:
        | "CREDIT_CARD"
        | "DEBIT_CARD";
      redirectUrl: string;
    };

export type PublicRegistrationPaymentRequest = {
  cpf?: string;
  paymentMethod: PublicRegistrationPaymentMethod;
};

export type PublicRegistrationPaymentHandler = (
  registrationId: string,
  paymentRequest: PublicRegistrationPaymentRequest
) => Promise<
  PublicRegistrationPaymentCheckout | null
>;

function buildPublicRegistrationResponse<
  T extends {
    checkInToken: string;
    paymentStatus: string;
    event: {
      isPaid: boolean;
    };
  }
>(
  registration: T,
  paymentCheckout:
    PublicRegistrationPaymentCheckout | null
) {
  const canAccessParticipantArea =
    !registration.event.isPaid ||
    registration.paymentStatus === "PAID";

  return {
    ...registration,
    checkInToken:
      canAccessParticipantArea
        ? registration.checkInToken
        : null,
    ...(paymentCheckout
      ? { paymentCheckout }
      : {})
  };
}

export async function registerPublicEventRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  onRegistrationPaymentPending?: PublicRegistrationPaymentHandler
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

        const paymentCheckout =
          registration.paymentId &&
          registration.paymentStatus === "PENDING" &&
          onRegistrationPaymentPending
            ? await onRegistrationPaymentPending(
                registration.id,
                {
                  ...(input.cpf ? { cpf: input.cpf } : {}),
                  paymentMethod:
                    input.paymentMethod
                }
              )
            : null;

        await reply
          .code(
            registration.wasExisting
              ? 200
              : 201
          )
          .send(
            buildPublicRegistrationResponse(
              registration,
              paymentCheckout
            )
          );
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

        const registration =
          await getPublicRegistrationByTokenBySlugs(
            prisma,
            params.churchSlug,
            params.eventSlug,
            input.checkInToken
          );

        if (
          registration.event.isPaid &&
          registration.paymentStatus !== "PAID"
        ) {
          await reply.code(403).send({
            error: "PAYMENT_REQUIRED",
            message:
              "O pagamento ainda não foi confirmado."
          });
          return;
        }

        return registration;
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

        const publicEvent =
          await getPublicEventById(
            prisma,
            params.eventId
          );

        const eventChurch =
          await prisma.event.findUnique({
            where: {
              id: params.eventId
            },
            select: {
              church: {
                select: {
                  name: true,
                  slug: true
                }
              }
            }
          });

        if (!eventChurch) {
          throw new Error(
            "EVENT_NOT_FOUND"
          );
        }

        return {
          ...publicEvent,
          church: eventChurch.church
        };
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

        const paymentCheckout =
          registration.paymentId &&
          registration.paymentStatus === "PENDING" &&
          onRegistrationPaymentPending
            ? await onRegistrationPaymentPending(
                registration.id,
                {
                  ...(input.cpf ? { cpf: input.cpf } : {}),
                  paymentMethod:
                    input.paymentMethod
                }
              )
            : null;

        await reply
          .code(201)
          .send(
            buildPublicRegistrationResponse(
              registration,
              paymentCheckout
            )
          );
      } catch (error) {
        await sendPublicRouteError(error, reply);
      }
    }
  );
}
