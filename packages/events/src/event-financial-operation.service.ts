import type { Prisma, PrismaClient } from "@prisma/client";
import type {
  CreateEventsFinancialRefundInput,
  ListEventsFinancialOperationsQueryInput,
  ListRefundableEventPaymentsQueryInput
} from "./event-financial-operation.schema.js";

const OPERATION_TYPE_REFUND = "REFUND";
const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 50;

export type EventsFinancialOperationActor = {
  userId: string;
  role: string;
};

export type EventPaymentRefundProviderResult = {
  providerReference: string;
  status: "REFUNDED" | "PENDING";
};

export type EventPaymentRefundProviderHandler = (input: {
  churchId: string;
  eventPaymentId: string;
  providerPaymentId: string;
}) => Promise<EventPaymentRefundProviderResult>;

export type EventsFinancialOperationView = {
  id: string;
  type: "REFUND";
  status: "REQUESTED" | "PENDING" | "CONFIRMED" | "FAILED";
  amount: number;
  eventTitle: string;
  participantName: string;
  createdAt: string;
  result: string | null;
};

export type EventsFinancialOperationsList = {
  canCreate: boolean;
  items: EventsFinancialOperationView[];
  pagination: {
    page: number;
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

export type RefundableEventPaymentView = {
  transactionId: string;
  eventTitle: string;
  participantName: string;
  amount: number;
  at: string;
};

export type RefundableEventPaymentsList = {
  canCreate: boolean;
  items: RefundableEventPaymentView[];
  pagination: {
    page: number;
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

const operationListSelect = {
  id: true,
  type: true,
  status: true,
  amount: true,
  result: true,
  createdAt: true,
  eventPayment: {
    select: {
      event: {
        select: {
          title: true
        }
      },
      order: {
        select: {
          registrations: {
            select: {
              person: {
                select: {
                  name: true
                }
              },
              visitor: {
                select: {
                  name: true
                }
              }
            }
          }
        }
      }
    }
  }
} as const;

function toAmount(value: Prisma.Decimal | number) {
  return Number(value);
}

function getParticipantName(input: {
  person: { name: string } | null;
  visitor: { name: string } | null;
} | undefined) {
  return input?.person?.name ?? input?.visitor?.name ?? "Participante";
}

export function canExecuteEventsFinancialOperation(role: string | undefined) {
  return role === "SUPER_ADMIN";
}

function mapOperationView(row: {
  id: string;
  type: string;
  status: string;
  amount: Prisma.Decimal;
  result: string | null;
  createdAt: Date;
  eventPayment: {
    event: {
      title: string;
    };
    order: {
      registrations: Array<{
        person: { name: string } | null;
        visitor: { name: string } | null;
      }>;
    };
  };
}): EventsFinancialOperationView {
  return {
    id: row.id,
    type: "REFUND",
    status: row.status as EventsFinancialOperationView["status"],
    amount: toAmount(row.amount),
    eventTitle: row.eventPayment.event.title,
    participantName: getParticipantName(row.eventPayment.order.registrations[0]),
    createdAt: row.createdAt.toISOString(),
    result: row.result
  };
}

async function appendOperationAudit(
  prisma: Prisma.TransactionClient | PrismaClient,
  input: {
    churchId: string;
    operationId: string;
    action: string;
    actorUserId: string;
    actorRole: string;
    status: string;
    amount: Prisma.Decimal;
    providerReference: string | null;
    result: string | null;
  }
) {
  await prisma.eventsFinancialOperationAudit.create({
    data: {
      churchId: input.churchId,
      operationId: input.operationId,
      action: input.action,
      actorUserId: input.actorUserId,
      actorRole: input.actorRole,
      status: input.status,
      amount: input.amount,
      providerReference: input.providerReference,
      result: input.result
    }
  });
}

async function loadOperationView(
  prisma: PrismaClient,
  churchId: string,
  operationId: string
): Promise<EventsFinancialOperationView> {
  const row = await prisma.eventsFinancialOperation.findFirst({
    where: {
      id: operationId,
      churchId
    },
    select: operationListSelect
  });

  if (!row) {
    throw new Error("EVENT_PAYMENT_NOT_FOUND");
  }

  return mapOperationView(row);
}

async function revertRefundClaim(
  prisma: PrismaClient,
  churchId: string,
  payment: {
    id: string;
    orderId: string;
  }
) {
  await prisma.$transaction([
    prisma.eventPayment.updateMany({
      where: {
        id: payment.id,
        churchId,
        status: "REFUND_PENDING"
      },
      data: {
        status: "PAID"
      }
    }),
    prisma.eventOrder.updateMany({
      where: {
        id: payment.orderId,
        churchId,
        status: "REFUND_PENDING"
      },
      data: {
        status: "PAID"
      }
    }),
    prisma.registration.updateMany({
      where: {
        churchId,
        orderId: payment.orderId,
        paymentStatus: "REFUND_PENDING"
      },
      data: {
        paymentStatus: "PAID"
      }
    })
  ]);
}

export async function listEventsFinancialOperations(
  prisma: PrismaClient,
  churchId: string,
  role: string | undefined,
  query: ListEventsFinancialOperationsQueryInput
): Promise<EventsFinancialOperationsList> {
  const page = query.page ?? DEFAULT_PAGE;
  const limit = query.limit ?? DEFAULT_LIMIT;
  const type = query.type ?? OPERATION_TYPE_REFUND;
  const where: Prisma.EventsFinancialOperationWhereInput = {
    churchId,
    type,
    ...(query.status ? { status: query.status } : {}),
    ...(query.eventId
      ? {
          eventPayment: {
            is: {
              churchId,
              eventId: query.eventId
            }
          }
        }
      : {})
  };

  const [total, items] = await Promise.all([
    prisma.eventsFinancialOperation.count({ where }),
    prisma.eventsFinancialOperation.findMany({
      where,
      select: operationListSelect,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return {
    canCreate: canExecuteEventsFinancialOperation(role),
    items: items.map(mapOperationView),
    pagination: {
      page,
      currentPage: page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
}

export async function listRefundableEventPayments(
  prisma: PrismaClient,
  churchId: string,
  role: string | undefined,
  query: ListRefundableEventPaymentsQueryInput
): Promise<RefundableEventPaymentsList> {
  const page = query.page ?? DEFAULT_PAGE;
  const limit = query.limit ?? DEFAULT_LIMIT;
  const where: Prisma.EventPaymentWhereInput = {
    churchId,
    provider: "ASAAS",
    status: "PAID",
    providerPaymentId: {
      not: null
    },
    amount: {
      gt: 0
    },
    ...(query.eventId ? { eventId: query.eventId } : {}),
    transaction: {
      is: {
        churchId,
        type: "EVENT",
        status: "ACTIVE"
      }
    }
  };

  const select = {
    amount: true,
    createdAt: true,
    transactionId: true,
    event: {
      select: {
        title: true
      }
    },
    order: {
      select: {
        registrations: {
          select: {
            person: {
              select: {
                name: true
              }
            },
            visitor: {
              select: {
                name: true
              }
            }
          }
        }
      }
    }
  } as const;

  const [total, items] = await Promise.all([
    prisma.eventPayment.count({ where }),
    prisma.eventPayment.findMany({
      where,
      select,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: (page - 1) * limit,
      take: limit
    })
  ]);

  return {
    canCreate: canExecuteEventsFinancialOperation(role),
    items: items.map((row) => ({
      transactionId: row.transactionId,
      eventTitle: row.event.title,
      participantName: getParticipantName(row.order.registrations[0]),
      amount: toAmount(row.amount),
      at: row.createdAt.toISOString()
    })),
    pagination: {
      page,
      currentPage: page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
}

export async function createEventsFinancialRefund(
  prisma: PrismaClient,
  churchId: string,
  actor: EventsFinancialOperationActor,
  input: CreateEventsFinancialRefundInput,
  refundProvider: EventPaymentRefundProviderHandler,
  reversal: {
    applyCancelledStatus: (input: {
      eventPaymentId: string;
      providerPaymentId: string;
    }) => Promise<boolean>;
    finalizeReversal: (transactionId: string) => Promise<void>;
  }
): Promise<EventsFinancialOperationView> {
  if (!canExecuteEventsFinancialOperation(actor.role)) {
    throw new Error("FINANCIAL_OPERATION_DENIED");
  }

  const payment = await prisma.eventPayment.findFirst({
    where: {
      churchId,
      transactionId: input.transactionId
    },
    select: {
      id: true,
      orderId: true,
      transactionId: true,
      provider: true,
      providerPaymentId: true,
      status: true,
      amount: true,
      platformFeePercent: true,
      platformFeeAmount: true,
      netAmount: true,
      transaction: {
        select: {
          id: true,
          status: true,
          amount: true
        }
      }
    }
  });

  if (!payment) {
    throw new Error("EVENT_PAYMENT_NOT_FOUND");
  }

  const existing = await prisma.eventsFinancialOperation.findFirst({
    where: {
      churchId,
      type: OPERATION_TYPE_REFUND,
      eventPaymentId: payment.id
    },
    select: {
      id: true,
      status: true,
      providerReference: true
    }
  });

  if (
    existing &&
    (existing.status === "CONFIRMED" ||
      (existing.status === "PENDING" && existing.providerReference))
  ) {
    return loadOperationView(prisma, churchId, existing.id);
  }

  const amount = toAmount(payment.amount);
  const hasProviderCharge =
    payment.provider === "ASAAS" &&
    Boolean(payment.providerPaymentId) &&
    payment.transaction.status === "ACTIVE" &&
    amount > 0;
  const canResumeClaimedRefund =
    hasProviderCharge &&
    payment.status === "REFUND_PENDING" &&
    Boolean(existing) &&
    (existing?.status === "REQUESTED" ||
      existing?.status === "FAILED" ||
      (existing?.status === "PENDING" && !existing.providerReference));

  if (!canResumeClaimedRefund) {
    if (!hasProviderCharge || payment.status !== "PAID") {
      throw new Error("EVENT_PAYMENT_NOT_REFUNDABLE");
    }

    const claimed = await prisma.eventPayment.updateMany({
      where: {
        id: payment.id,
        churchId,
        status: "PAID",
        provider: "ASAAS"
      },
      data: {
        status: "REFUND_PENDING"
      }
    });

    if (claimed.count !== 1) {
      const current = await prisma.eventsFinancialOperation.findFirst({
        where: {
          churchId,
          type: OPERATION_TYPE_REFUND,
          eventPaymentId: payment.id
        },
        select: {
          id: true,
          status: true,
          providerReference: true
        }
      });

      const refreshedPayment = await prisma.eventPayment.findFirst({
        where: {
          id: payment.id,
          churchId
        },
        select: {
          status: true,
          providerPaymentId: true
        }
      });

      if (
        current &&
        (current.status === "CONFIRMED" ||
          (current.status === "PENDING" && current.providerReference))
      ) {
        return loadOperationView(prisma, churchId, current.id);
      }

      const canResumeAfterRace =
        refreshedPayment?.status === "REFUND_PENDING" &&
        Boolean(refreshedPayment.providerPaymentId) &&
        current &&
        (current.status === "REQUESTED" ||
          current.status === "FAILED" ||
          (current.status === "PENDING" && !current.providerReference));

      if (!canResumeAfterRace) {
        throw new Error("EVENT_PAYMENT_NOT_REFUNDABLE");
      }
    } else {
      await prisma.$transaction([
        prisma.eventOrder.updateMany({
          where: {
            id: payment.orderId,
            churchId
          },
          data: {
            status: "REFUND_PENDING"
          }
        }),
        prisma.registration.updateMany({
          where: {
            churchId,
            orderId: payment.orderId
          },
          data: {
            paymentStatus: "REFUND_PENDING"
          }
        })
      ]);
    }
  }

  if (!payment.providerPaymentId) {
    throw new Error("EVENT_PAYMENT_NOT_REFUNDABLE");
  }

  let operationId = existing?.id ?? null;

  if (operationId) {
    await prisma.eventsFinancialOperation.update({
      where: {
        id: operationId
      },
      data: {
        status: "REQUESTED",
        actorUserId: actor.userId,
        actorRole: actor.role,
        result: null,
        providerReference: existing?.providerReference ?? null
      }
    });
  } else {
    try {
      const created = await prisma.eventsFinancialOperation.create({
        data: {
          churchId,
          type: OPERATION_TYPE_REFUND,
          status: "REQUESTED",
          eventPaymentId: payment.id,
          transactionId: payment.transactionId,
          amount: payment.amount,
          currency: "BRL",
          provider: "ASAAS",
          actorUserId: actor.userId,
          actorRole: actor.role
        },
        select: {
          id: true
        }
      });
      operationId = created.id;
    } catch (error) {
      const duplicate =
        error instanceof Error &&
        "code" in error &&
        (error as { code?: string }).code === "P2002";

      if (!duplicate) {
        await revertRefundClaim(prisma, churchId, payment);
        throw error;
      }

      const raced = await prisma.eventsFinancialOperation.findFirst({
        where: {
          churchId,
          type: OPERATION_TYPE_REFUND,
          eventPaymentId: payment.id
        },
        select: {
          id: true,
          status: true,
          providerReference: true
        }
      });

      if (
        raced &&
        (raced.status === "CONFIRMED" ||
          (raced.status === "PENDING" && raced.providerReference))
      ) {
        return loadOperationView(prisma, churchId, raced.id);
      }

      operationId = raced?.id ?? null;
    }
  }

  if (!operationId) {
    await revertRefundClaim(prisma, churchId, payment);
    throw new Error("EVENT_PAYMENT_NOT_REFUNDABLE");
  }

  await appendOperationAudit(prisma, {
    churchId,
    operationId,
    action: "REFUND_REQUESTED",
    actorUserId: actor.userId,
    actorRole: actor.role,
    status: "REQUESTED",
    amount: payment.amount,
    providerReference: null,
    result: null
  });

  let providerSucceeded = false;

  try {
    const providerResult = await refundProvider({
      churchId,
      eventPaymentId: payment.id,
      providerPaymentId: payment.providerPaymentId
    });
    providerSucceeded = true;

    if (providerResult.status === "REFUNDED") {
      const applied = await reversal.applyCancelledStatus({
        eventPaymentId: payment.id,
        providerPaymentId: payment.providerPaymentId
      });

      if (!applied) {
        throw new Error("PAYMENT_PROVIDER_REVERSAL_FAILED");
      }

      await reversal.finalizeReversal(payment.transactionId);

      await prisma.eventsFinancialOperation.update({
        where: {
          id: operationId
        },
        data: {
          status: "CONFIRMED",
          providerReference: providerResult.providerReference,
          result: "CONFIRMED"
        }
      });

      await appendOperationAudit(prisma, {
        churchId,
        operationId,
        action: "REFUND_CONFIRMED",
        actorUserId: actor.userId,
        actorRole: actor.role,
        status: "CONFIRMED",
        amount: payment.amount,
        providerReference: providerResult.providerReference,
        result: "CONFIRMED"
      });

      return loadOperationView(prisma, churchId, operationId);
    }

    await prisma.eventsFinancialOperation.update({
      where: {
        id: operationId
      },
      data: {
        status: "PENDING",
        providerReference: providerResult.providerReference,
        result: "PENDING"
      }
    });

    await appendOperationAudit(prisma, {
      churchId,
      operationId,
      action: "REFUND_PENDING",
      actorUserId: actor.userId,
      actorRole: actor.role,
      status: "PENDING",
      amount: payment.amount,
      providerReference: providerResult.providerReference,
      result: "PENDING"
    });

    return loadOperationView(prisma, churchId, operationId);
  } catch (error) {
    if (providerSucceeded) {
      await prisma.eventsFinancialOperation.update({
        where: {
          id: operationId
        },
        data: {
          status: "PENDING",
          result: "PENDING"
        }
      });

      await appendOperationAudit(prisma, {
        churchId,
        operationId,
        action: "REFUND_PENDING",
        actorUserId: actor.userId,
        actorRole: actor.role,
        status: "PENDING",
        amount: payment.amount,
        providerReference: payment.providerPaymentId,
        result: "PENDING"
      });
    } else {
      await prisma.eventsFinancialOperation.update({
        where: {
          id: operationId
        },
        data: {
          status: "FAILED",
          result: "PROVIDER_ERROR"
        }
      });

      await appendOperationAudit(prisma, {
        churchId,
        operationId,
        action: "REFUND_FAILED",
        actorUserId: actor.userId,
        actorRole: actor.role,
        status: "FAILED",
        amount: payment.amount,
        providerReference: null,
        result: "PROVIDER_ERROR"
      });

      await revertRefundClaim(prisma, churchId, payment);
    }

    if (
      error instanceof Error &&
      (error.message === "PAYMENT_PROVIDER_REVERSAL_FAILED" ||
        error.message === "PAYMENT_PROVIDER_REVERSAL_UNSUPPORTED_STATUS")
    ) {
      throw error;
    }

    throw new Error("PAYMENT_PROVIDER_REVERSAL_FAILED");
  }
}

export async function syncEventsFinancialRefundFromProvider(
  prisma: PrismaClient,
  churchId: string,
  input: {
    eventPaymentId: string;
    providerPaymentId: string;
    paymentStatus: "PENDING" | "PAID" | "CANCELLED" | "OVERDUE" | "REFUND_PENDING";
  }
) {
  const operation = await prisma.eventsFinancialOperation.findFirst({
    where: {
      churchId,
      type: OPERATION_TYPE_REFUND,
      eventPaymentId: input.eventPaymentId
    },
    select: {
      id: true,
      status: true,
      amount: true,
      actorUserId: true,
      actorRole: true
    }
  });

  if (!operation) {
    return;
  }

  if (input.paymentStatus === "REFUND_PENDING") {
    if (operation.status === "CONFIRMED") {
      return;
    }

    if (operation.status === "PENDING") {
      return;
    }

    await prisma.eventsFinancialOperation.update({
      where: {
        id: operation.id
      },
      data: {
        status: "PENDING",
        providerReference: input.providerPaymentId,
        result: "PENDING"
      }
    });

    await appendOperationAudit(prisma, {
      churchId,
      operationId: operation.id,
      action: "REFUND_PENDING",
      actorUserId: operation.actorUserId,
      actorRole: operation.actorRole,
      status: "PENDING",
      amount: operation.amount,
      providerReference: input.providerPaymentId,
      result: "PENDING"
    });
    return;
  }

  if (input.paymentStatus !== "CANCELLED") {
    return;
  }

  if (operation.status === "CONFIRMED") {
    return;
  }

  await prisma.eventsFinancialOperation.update({
    where: {
      id: operation.id
    },
    data: {
      status: "CONFIRMED",
      providerReference: input.providerPaymentId,
      result: "CONFIRMED"
    }
  });

  await appendOperationAudit(prisma, {
    churchId,
    operationId: operation.id,
    action: "REFUND_CONFIRMED",
    actorUserId: operation.actorUserId,
    actorRole: operation.actorRole,
    status: "CONFIRMED",
    amount: operation.amount,
    providerReference: input.providerPaymentId,
    result: "CONFIRMED"
  });
}
