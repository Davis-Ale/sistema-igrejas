import "dotenv/config";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createAuthPreHandler,
  registerAuthRoutes,
  requireRole
} from "@sistema-igrejas/auth";
import { PrismaClient } from "@sistema-igrejas/database";
import {
  applyEventPaymentProviderStatus,
  applyRegistrationPaymentStatus,
  attachEventPaymentProviderId,
  getEventRegistrationPaymentCheckout,
  registerEventApiKeyRoutes,
  registerEventRoutes,
  registerPublicEventRoutes,
  registerRegistrationFormRoutes,
  registerTicketRoutes
} from "@sistema-igrejas/events";
import {
  createAsaasChargeForExistingTransaction,
  registerAsaasRoutes,
  registerAsaasWebhookRoutes,
  registerFinancialRoutes
} from "@sistema-igrejas/financial";
import {
  registerCellDeleteRoutes,
  registerCellListRoutes,
  registerCellLocationRoutes,
  registerCellRoutes,
  registerCellStatusRoutes,
  registerMemberRoutes,
  registerVisitorRoutes
} from "@sistema-igrejas/members";
import { registerTrailRoutes } from "@sistema-igrejas/trail";
import { registerVolunteerRoutes } from "@sistema-igrejas/volunteers";
import Fastify, {
  type FastifyInstance
} from "fastify";
import { registerAssistantRoutes } from "./assistant/assistant.routes.js";

export async function buildApp(): Promise<FastifyInstance> {
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

  const jwtSecret =
    process.env.JWT_SECRET ?? "dev-secret-change-me";

  await app.register(cors, {
    origin: true,
    methods: [
      "GET",
      "POST",
      "PATCH",
      "PUT",
      "DELETE",
      "OPTIONS"
    ],
    allowedHeaders: [
      "Authorization",
      "Content-Type"
    ]
  });

  await app.register(jwt, {
    secret: jwtSecret
  });

  app.addHook("onClose", async () => {
    await prisma.$disconnect();
  });

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      service: "api-br"
    };
  });

  await registerAuthRoutes(app, prisma);

  await registerPublicEventRoutes(
    app,
    prisma,
    async (
      registrationId,
      paymentRequest
    ) => {
      const checkout =
        await getEventRegistrationPaymentCheckout(
          prisma,
          registrationId
        );

      if (
        !checkout ||
        checkout.provider === "TEST"
      ) {
        return null;
      }

      if (checkout.provider !== "ASAAS") {
        throw new Error(
          "EVENT_PAYMENT_PROVIDER_UNSUPPORTED"
        );
      }

      const cpf =
        paymentRequest.cpf
          ?.replace(/\D/g, "") ?? "";

      if (cpf.length !== 11) {
        throw new Error(
          "PAYMENT_CUSTOMER_CPF_REQUIRED"
        );
      }

      const paymentMethod =
        paymentRequest.paymentMethod;

      const billingType =
        paymentMethod === "PIX"
          ? "PIX" as const
          : "CREDIT_CARD" as const;

      try {
        const charge =
          await createAsaasChargeForExistingTransaction(
            prisma,
            checkout.churchId,
            {
              transactionId:
                checkout.transactionId,
              referenceId:
                checkout.paymentId,
              billingType,
              customer: {
                ...checkout.customer,
                cpfCnpj: cpf
              },
              description:
                `Inscrição - ${checkout.eventTitle}`,
              dueDate:
                new Date()
                  .toISOString()
                  .slice(0, 10),
              value: checkout.amount
            }
          );

        await attachEventPaymentProviderId(
          prisma,
          checkout.churchId,
          checkout.paymentId,
          charge.paymentId
        );

        if (
          charge.payment.status ===
          "RECEIVED"
        ) {
          const paymentApplied =
            await applyEventPaymentProviderStatus(
              prisma,
              checkout.churchId,
              {
                eventPaymentId:
                  checkout.paymentId,
                providerPaymentId:
                  charge.paymentId,
                paymentStatus: "PAID"
              }
            );

          if (!paymentApplied) {
            throw new Error(
              "EVENT_PAYMENT_PROVIDER_STATUS_NOT_APPLIED"
            );
          }

          return null;
        }

        const actualBillingType =
          charge.payment.billingType;

        if (
          actualBillingType === "PIX"
        ) {
          if (!charge.pixQrCode) {
            throw new Error(
              "EVENT_PIX_QR_CODE_NOT_AVAILABLE"
            );
          }

          return {
            method: "PIX" as const,
            pix: {
              encodedImage:
                charge.pixQrCode
                  .encodedImage,
              payload:
                charge.pixQrCode.payload,
              expirationDate:
                charge.pixQrCode
                  .expirationDate
            }
          };
        }

        if (!charge.invoiceUrl) {
          throw new Error(
            "EVENT_PAYMENT_INVOICE_URL_NOT_AVAILABLE"
          );
        }

        const cardMethod =
          paymentMethod ===
          "DEBIT_CARD"
            ? "DEBIT_CARD" as const
            : "CREDIT_CARD" as const;

        return {
          method: cardMethod,
          redirectUrl:
            charge.invoiceUrl
        };
      } catch (error) {
        if (
          error instanceof Error &&
          error.message ===
            "PAYMENT_METHOD_ALREADY_SELECTED"
        ) {
          throw error;
        }

        app.log.error(
          {
            err: error,
            registrationId,
            eventPaymentId:
              checkout.paymentId
          },
          "Event payment checkout failed"
        );

        throw new Error(
          "PAYMENT_CHECKOUT_FAILED"
        );
      }
    }
  );

  await registerAsaasWebhookRoutes(
    app,
    prisma,
    async ({
      churchId,
      paymentId,
      referenceId,
      status
    }) => {
      const handledStructuredPayment =
        await applyEventPaymentProviderStatus(
          prisma,
          churchId,
          {
            eventPaymentId: referenceId,
            providerPaymentId: paymentId,
            paymentStatus: status
          }
        );

      /*
        Compatibilidade temporária com referências
        anteriores ao EventPayment estruturado.
      */
      if (!handledStructuredPayment) {
        await applyRegistrationPaymentStatus(
          prisma,
          churchId,
          {
            registrationId: referenceId,
            paymentId,
            paymentStatus: status
          }
        );
      }
    }
  );

  await app.register(
    async (protectedRoutes) => {
      protectedRoutes.addHook(
        "preHandler",
        createAuthPreHandler(prisma)
      );

      await registerAssistantRoutes(protectedRoutes, prisma);
      await registerEventRoutes(protectedRoutes, prisma);
  await registerEventApiKeyRoutes(protectedRoutes, prisma);
      await registerTicketRoutes(protectedRoutes, prisma);
      await registerRegistrationFormRoutes(
        protectedRoutes,
        prisma
      );
      await registerFinancialRoutes(protectedRoutes, prisma);
      await registerAsaasRoutes(protectedRoutes, prisma);
      await registerCellListRoutes(protectedRoutes, prisma);
      await registerCellRoutes(protectedRoutes, prisma);
      await registerCellStatusRoutes(protectedRoutes, prisma);
      await registerCellDeleteRoutes(
        protectedRoutes,
        prisma,
        requireRole(["SUPER_ADMIN"])
      );
      await registerCellLocationRoutes(protectedRoutes, prisma);
      await registerMemberRoutes(protectedRoutes, prisma);
      await registerVisitorRoutes(protectedRoutes, prisma);
      await registerTrailRoutes(protectedRoutes, prisma);
      await registerVolunteerRoutes(protectedRoutes, prisma);
    },
    {
      prefix: "/api"
    }
  );

  return app;
}
