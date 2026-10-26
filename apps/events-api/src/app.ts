import "dotenv/config";
import jwt from "@fastify/jwt";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  createAuthPreHandler,
  getJwtSecret,
  registerAuthRoutes,
} from "@sistema-igrejas/auth";
import { PrismaClient } from "@sistema-igrejas/database";
import {
  applyEventPaymentProviderStatus,
  applyRegistrationPaymentStatus,
  registerDiscountRoutes,
  registerEventApiKeyRoutes,
  registerEventIntegrationRoutes,
  registerEventFinancialRoutes,
  registerEventParticipantAppRoutes,
  registerEventRoutes,
  registerPublicParticipantAppRoutes,
  registerPublicEventsApiV1Routes,
  registerRegistrationFormRoutes,
  registerTicketRoutes,
  syncEventsFinancialRefundFromProvider
} from "@sistema-igrejas/events";
import {
  AsaasClientError,
  authorizeFinancialRoute,
  deleteAsaasPayment,
  finalizeProviderTransactionCancellation,
  finalizeProviderTransactionReversal,
  getAsaasPayment,
  refundAsaasPayment,
  registerAsaasRoutes,
  registerAsaasWebhookRoutes,
  registerFinancialRoutes
} from "@sistema-igrejas/financial";
import Fastify, {
  type FastifyInstance
} from "fastify";
import { prepareEventsApiCheckoutSecurityOperational, waitCheckoutPendingDrain } from "./checkout-security.operational.js";
import { prepareEventsApiCheckoutV2 } from "./checkout-v2.prepared.js";
import { registerExclusiveCheckoutV2 } from "../../../packages/events/src/checkout-v2.cutover.prepared.js";

export async function buildApp(): Promise<FastifyInstance> {
  const jwtSecret = getJwtSecret();
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required.");
  }

  const security = prepareEventsApiCheckoutSecurityOperational();
  const app = Fastify(security.fastifyOptions);
  await security.install(app);

  const adapter = new PrismaPg({
    connectionString: databaseUrl
  });

  const prisma = new PrismaClient({
    adapter
  });

  await app.register(jwt, {
    secret: jwtSecret
  });

  app.addHook("onClose", async () => {
    const timeoutMs = security.fastifyOptions.requestTimeout;
    if (typeof timeoutMs !== "number") {
      throw new Error("CHECKOUT_SECURITY_CONFIGURATION_INVALID");
    }
    await waitCheckoutPendingDrain(security.pendingRequests, timeoutMs);
    await prisma.$disconnect();
    security.redis.disconnect();
  });

  app.get("/health", async () => {
    await prisma.$queryRaw`SELECT 1`;

    return {
      status: "ok",
      service: "events-api"
    };
  });

  await registerAuthRoutes(app, prisma);

  await registerExclusiveCheckoutV2(app, prisma, prepareEventsApiCheckoutV2(prisma));

  await registerPublicParticipantAppRoutes(
    app,
    prisma
  );

  await registerAsaasWebhookRoutes(
    app,
    prisma,
    async ({
      churchId,
      paymentId,
      providerEvent,
      referenceId,
      status
    }) => {
      const previousPayment =
        await prisma.eventPayment.findFirst({
          where: {
            id: referenceId,
            churchId
          },
          select: {
            id: true,
            status: true,
            transactionId: true
          }
        });

      const providerTransaction =
        await prisma.transaction.findFirst({
          where: {
            churchId,
            asaasId: paymentId
          },
          select: {
            id: true,
            status: true
          }
        });

      const handledStructuredPayment =
        await applyEventPaymentProviderStatus(
          prisma,
          churchId,
          {
            eventPaymentId:
              referenceId,
            providerPaymentId:
              paymentId,
            paymentStatus:
              status
          }
        );

      if (
        status === "CANCELLED" &&
        providerTransaction?.status ===
          "ACTIVE"
      ) {
        const shouldReverse =
          providerEvent ===
            "PAYMENT_REFUNDED" ||
          previousPayment?.status ===
            "PAID" ||
          previousPayment?.status ===
            "REFUND_PENDING";

        const shouldCancel =
          providerEvent ===
            "PAYMENT_DELETED" ||
          previousPayment?.status ===
            "PENDING" ||
          previousPayment?.status ===
            "OVERDUE";

        if (shouldReverse) {
          await finalizeProviderTransactionReversal(
            prisma,
            churchId,
            providerTransaction.id
          );
        } else if (shouldCancel) {
          await finalizeProviderTransactionCancellation(
            prisma,
            churchId,
            providerTransaction.id
          );
        }
      }

      await syncEventsFinancialRefundFromProvider(
        prisma,
        churchId,
        {
          eventPaymentId: referenceId,
          providerPaymentId: paymentId,
          paymentStatus: status
        }
      );

      if (!handledStructuredPayment) {
        await applyRegistrationPaymentStatus(
          prisma,
          churchId,
          {
            registrationId:
              referenceId,
            paymentId,
            paymentStatus:
              status
          }
        );
      }
    }
  );

  await app.register(
    async (publicApiV1) => {
      await registerPublicEventsApiV1Routes(publicApiV1, prisma);
    },
    {
      prefix: "/api/v1"
    }
  );

  await app.register(
    async (protectedRoutes) => {
      protectedRoutes.addHook(
        "preHandler",
        createAuthPreHandler(prisma)
      );
      protectedRoutes.addHook("preHandler", authorizeFinancialRoute);
      await registerEventApiKeyRoutes(protectedRoutes, prisma);
      await registerEventIntegrationRoutes(protectedRoutes, prisma);
      await registerEventParticipantAppRoutes(protectedRoutes, prisma);
      await registerEventRoutes(protectedRoutes, prisma);
      await registerEventFinancialRoutes(protectedRoutes, prisma, {
        refundProvider: async ({
          churchId,
          eventPaymentId,
          providerPaymentId
        }) => {
          try {
            const refunded = await refundAsaasPayment(
              providerPaymentId,
              "Estorno administrativo de Eventos",
              undefined,
              `events-refund:${churchId}:${eventPaymentId}`
            );
            const refreshed = await getAsaasPayment(providerPaymentId);
            const providerReference = refunded.id || providerPaymentId;

            if (refreshed.status === "REFUNDED") {
              return {
                providerReference,
                status: "REFUNDED" as const
              };
            }

            return {
              providerReference,
              status: "PENDING" as const
            };
          } catch (error) {
            if (error instanceof AsaasClientError) {
              try {
                const existing = await getAsaasPayment(providerPaymentId);

                if (existing.status === "REFUNDED") {
                  return {
                    providerReference: providerPaymentId,
                    status: "REFUNDED" as const
                  };
                }
              } catch {
                throw new Error("PAYMENT_PROVIDER_REVERSAL_FAILED");
              }
            }

            throw new Error("PAYMENT_PROVIDER_REVERSAL_FAILED");
          }
        },
        applyCancelledStatus: async ({
          churchId,
          eventPaymentId,
          providerPaymentId
        }) =>
          applyEventPaymentProviderStatus(prisma, churchId, {
            eventPaymentId,
            providerPaymentId,
            paymentStatus: "CANCELLED"
          }),
        finalizeReversal: async (churchId, transactionId) => {
          await finalizeProviderTransactionReversal(
            prisma,
            churchId,
            transactionId
          );
        }
      });
      await registerTicketRoutes(protectedRoutes, prisma);
      await registerDiscountRoutes(protectedRoutes, prisma);
      await registerRegistrationFormRoutes(
        protectedRoutes,
        prisma
      );
      await registerFinancialRoutes(
        protectedRoutes,
        prisma,
        async ({
          churchId,
          transactionId,
          asaasId,
          reason
        }) => {
          if (!asaasId) {
            return "REVERSE";
          }

          try {
            const transaction =
              await prisma.transaction.findFirst({
                where: {
                  id:
                    transactionId,
                  churchId
                },
                select: {
                  eventPayment: {
                    select: {
                      id: true,
                      provider: true,
                      providerPaymentId: true,
                      status: true
                    }
                  }
                }
              });

            const eventPayment =
              transaction?.eventPayment ??
              null;

            if (
              eventPayment &&
              (
                eventPayment.provider !==
                  "ASAAS" ||
                (
                  eventPayment.providerPaymentId &&
                  eventPayment.providerPaymentId !==
                    asaasId
                )
              )
            ) {
              throw new Error(
                "PAYMENT_PROVIDER_REVERSAL_FAILED"
              );
            }

            const payment =
              await getAsaasPayment(
                asaasId
              );

            const applyEventStatus =
              async (
                paymentStatus:
                  | "CANCELLED"
                  | "REFUND_PENDING"
              ) => {
                if (!eventPayment) {
                  return;
                }

                const applied =
                  await applyEventPaymentProviderStatus(
                    prisma,
                    churchId,
                    {
                      eventPaymentId:
                        eventPayment.id,
                      providerPaymentId:
                        asaasId,
                      paymentStatus
                    }
                  );

                if (!applied) {
                  throw new Error(
                    "PAYMENT_PROVIDER_REVERSAL_FAILED"
                  );
                }
              };

            if (
              payment.status === "PENDING" ||
              payment.status === "OVERDUE"
            ) {
              await deleteAsaasPayment(
                asaasId
              );

              await applyEventStatus(
                "CANCELLED"
              );

              return "CANCEL";
            }

            if (
              payment.status === "CANCELLED"
            ) {
              await applyEventStatus(
                "CANCELLED"
              );

              return "CANCEL";
            }

            if (
              payment.status === "REFUNDED"
            ) {
              await applyEventStatus(
                "CANCELLED"
              );

              return "REVERSE";
            }

            if (
              payment.status === "RECEIVED" ||
              payment.status === "CONFIRMED"
            ) {
              await refundAsaasPayment(
                asaasId,
                reason
              );

              const refreshedPayment =
                await getAsaasPayment(
                  asaasId
                );

              if (
                refreshedPayment.status ===
                  "REFUNDED"
              ) {
                await applyEventStatus(
                  "CANCELLED"
                );

                return "REVERSE";
              }

              await applyEventStatus(
                "REFUND_PENDING"
              );

              return "PENDING";
            }

            throw new Error(
              "PAYMENT_PROVIDER_REVERSAL_UNSUPPORTED_STATUS"
            );
          } catch (error) {
            if (
              error instanceof Error &&
              error.message ===
                "PAYMENT_PROVIDER_REVERSAL_UNSUPPORTED_STATUS"
            ) {
              throw error;
            }

            app.log.error(
              {
                err: error,
                churchId,
                transactionId,
                asaasId
              },
              "Payment provider reversal failed"
            );

            throw new Error(
              "PAYMENT_PROVIDER_REVERSAL_FAILED"
            );
          }
        }
      );
      await registerAsaasRoutes(protectedRoutes, prisma);
    },
    {
      prefix: "/api"
    }
  );

  return app;
}
