import type { Prisma, PrismaClient } from "@prisma/client";
import { resolveCurrentPlatformFeePercent } from "@sistema-igrejas/events";
import type {
  CreateTransactionInput,
  ListTransactionsQueryInput,
  TransactionControlInput,
  UpdateTransactionInput
} from "./financial.schema.js";

async function ensureRelatedRecordsBelongToChurch(
  prisma: Pick<PrismaClient, "campus" | "person" | "event">,
  churchId: string,
  input: {
    campusId?: string | null | undefined;
    personId?: string | null | undefined;
    eventId?: string | null | undefined;
  }
) {
  if (input.campusId && !await prisma.campus.findFirst({
    where: { id: input.campusId, churchId }, select: { id: true }
  })) {
    throw new Error("CAMPUS_NOT_FOUND");
  }
  const [person, event] = await Promise.all([
    input.personId
      ? prisma.person.findFirst({
          where: {
            id: input.personId,
            churchId
          },
          select: {
            id: true
          }
        })
      : Promise.resolve(null),
    input.eventId
      ? prisma.event.findFirst({
          where: {
            id: input.eventId,
            churchId
          },
          select: {
            id: true
          }
        })
      : Promise.resolve(null)
  ]);

  if (input.personId && !person) {
    throw new Error("PERSON_NOT_FOUND");
  }

  if (input.eventId && !event) {
    throw new Error("EVENT_NOT_FOUND");
  }
}

function getOppositeDirection(direction: "IN" | "OUT") {
  return direction === "IN" ? "OUT" : "IN";
}

function buildTransactionWhere(churchId: string, query: ListTransactionsQueryInput) {
  return {
    churchId,
    ...(query.type ? { type: query.type } : {}),
    ...(query.direction ? { direction: query.direction } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.method ? { method: query.method } : {}),
    ...(query.costCenter ? { costCenter: query.costCenter } : {}),
    ...(query.personId ? { personId: query.personId } : {}),
    ...(query.eventId ? { eventId: query.eventId } : {}),
    ...(query.from || query.to
      ? {
          at: {
            ...(query.from ? { gte: query.from } : {}),
            ...(query.to ? { lte: query.to } : {})
          }
        }
      : {})
  };
}

function buildPaymentStatusWhere(
  paymentStatus: ListTransactionsQueryInput["paymentStatus"]
): Prisma.TransactionWhereInput | undefined {
  if (!paymentStatus) {
    return undefined;
  }

  if (paymentStatus === "PAID") {
    return {
      status: "ACTIVE",
      eventPayment: {
        is: {
          status: "PAID"
        }
      }
    };
  }

  if (paymentStatus === "PENDING") {
    return {
      eventPayment: {
        is: {
          status: {
            in: ["PENDING", "OVERDUE"]
          }
        }
      }
    };
  }

  if (paymentStatus === "NO_CHARGE") {
    return {
      eventPayment: {
        is: null
      }
    };
  }

  if (paymentStatus === "REFUND_PENDING") {
    return {
      eventPayment: {
        is: {
          status: "REFUND_PENDING"
        }
      }
    };
  }

  if (paymentStatus === "CANCELLED") {
    return {
      status: "CANCELLED"
    };
  }

  return {
    status: "REVERSED"
  };
}

function buildSearchContains(search: string) {
  return {
    contains: search,
    mode: "insensitive" as const
  };
}

function buildRegistrationSearchWhere(
  relation: "person" | "visitor" | "ticket" | "ticketBatch",
  field: "name" | "email" | "phone",
  contains: ReturnType<typeof buildSearchContains>
): Prisma.TransactionWhereInput {
  return {
    eventPayment: {
      is: {
        order: {
          is: {
            registrations: {
              some: {
                [relation]: {
                  is: {
                    [field]: contains
                  }
                }
              }
            }
          }
        }
      }
    }
  };
}

function buildSearchWhere(search: string): Prisma.TransactionWhereInput {
  const contains = buildSearchContains(search);

  return {
    OR: [
      { asaasId: contains },
      { costCenter: contains },
      {
        eventPayment: {
          is: {
            providerPaymentId: contains
          }
        }
      },
      {
        eventPayment: {
          is: {
            provider: contains
          }
        }
      },
      {
        person: {
          is: {
            name: contains
          }
        }
      },
      {
        person: {
          is: {
            email: contains
          }
        }
      },
      {
        person: {
          is: {
            phone: contains
          }
        }
      },
      buildRegistrationSearchWhere("person", "name", contains),
      buildRegistrationSearchWhere("person", "email", contains),
      buildRegistrationSearchWhere("person", "phone", contains),
      buildRegistrationSearchWhere("visitor", "name", contains),
      buildRegistrationSearchWhere("visitor", "email", contains),
      buildRegistrationSearchWhere("visitor", "phone", contains),
      buildRegistrationSearchWhere("ticket", "name", contains),
      buildRegistrationSearchWhere("ticketBatch", "name", contains)
    ]
  };
}

function buildListTransactionsWhere(
  churchId: string,
  query: ListTransactionsQueryInput
): Prisma.TransactionWhereInput {
  const filters: Prisma.TransactionWhereInput[] = [
    buildTransactionWhere(churchId, query)
  ];
  const paymentStatusWhere = buildPaymentStatusWhere(query.paymentStatus);

  if (paymentStatusWhere) {
    filters.push(paymentStatusWhere);
  }

  if (query.search) {
    filters.push(buildSearchWhere(query.search));
  }

  if (filters.length === 1) {
    return filters[0] ?? { churchId };
  }

  return {
    AND: filters
  };
}

const transactionListInclude = {
  person: {
    select: {
      id: true,
      name: true,
      phone: true,
      email: true
    }
  },
  event: {
    select: {
      id: true,
      title: true,
      slug: true,
      date: true
    }
  },
  eventPayment: {
    select: {
      id: true,
      status: true,
      provider: true,
      providerPaymentId: true,
      order: {
        select: {
          registrations: {
            select: {
              person: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              },
              visitor: {
                select: {
                  id: true,
                  name: true,
                  phone: true,
                  email: true
                }
              },
              ticket: {
                select: {
                  id: true,
                  name: true
                }
              },
              ticketBatch: {
                select: {
                  id: true,
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

const transactionListOrderBy = [
  { at: "desc" as const },
  { id: "desc" as const }
];

export async function createTransaction(
  prisma: PrismaClient,
  churchId: string,
  input: CreateTransactionInput
) {
  if (input.asaasId) throw new Error("PAYMENT_PROVIDER_REFERENCE_READ_ONLY");
  await ensureRelatedRecordsBelongToChurch(prisma, churchId, input);

  return prisma.transaction.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      cnpj: input.cnpj ?? null,
      personId: input.personId ?? null,
      eventId: input.eventId ?? null,
      type: input.type,
      direction: input.direction,
      amount: input.amount,
      method: input.method,
      costCenter: input.costCenter,
      asaasId: input.asaasId ?? null,
      nfseId: input.nfseId ?? null,
      at: input.at ?? new Date()
    }
  });
}

export async function updateTransaction(
  prisma: PrismaClient,
  churchId: string,
  transactionId: string,
  input: UpdateTransactionInput
) {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      churchId
    },
    select: {
      id: true,
      status: true,
      asaasId: true,
      eventPayment: { select: { id: true } }
    }
  });

  if (!transaction) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  if (transaction.status !== "ACTIVE") {
    throw new Error("TRANSACTION_NOT_ACTIVE");
  }

  if (transaction.asaasId || transaction.eventPayment) {
    throw new Error("PAYMENT_PROVIDER_TRANSACTION_LOCKED");
  }
  if (input.asaasId) throw new Error("PAYMENT_PROVIDER_REFERENCE_READ_ONLY");

  await ensureRelatedRecordsBelongToChurch(prisma, churchId, input);

  return prisma.transaction.update({
    where: {
      id: transactionId,
      churchId,
      status: "ACTIVE",
      asaasId: null,
      eventPayment: { is: null }
    },
    data: {
      ...(input.campusId !== undefined ? { campusId: input.campusId } : {}),
      ...(input.cnpj !== undefined ? { cnpj: input.cnpj } : {}),
      ...(input.personId !== undefined ? { personId: input.personId } : {}),
      ...(input.eventId !== undefined ? { eventId: input.eventId } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.direction !== undefined ? { direction: input.direction } : {}),
      ...(input.amount !== undefined ? { amount: input.amount } : {}),
      ...(input.method !== undefined ? { method: input.method } : {}),
      ...(input.costCenter !== undefined ? { costCenter: input.costCenter } : {}),
      ...(input.asaasId !== undefined ? { asaasId: input.asaasId } : {}),
      ...(input.nfseId !== undefined ? { nfseId: input.nfseId } : {}),
      ...(input.at !== undefined ? { at: input.at } : {})
    },
    include: {
      person: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      },
      event: {
        select: {
          id: true,
          title: true,
          slug: true,
          date: true
        }
      }
    }
  });
}

export async function cancelTransaction(
  prisma: PrismaClient,
  churchId: string,
  transactionId: string,
  userId: string,
  input: TransactionControlInput
) {
  const transaction = await prisma.transaction.findFirst({
    where: {
      id: transactionId,
      churchId
    },
    select: {
      id: true,
      status: true,
      asaasId: true,
      eventPayment: { select: { id: true } }
    }
  });

  if (!transaction) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  if (transaction.status !== "ACTIVE") {
    throw new Error("TRANSACTION_NOT_ACTIVE");
  }

  // Provider charges must use the authorized reversal flow, which checks provider status.
  if (transaction.asaasId || transaction.eventPayment) {
    throw new Error("PAYMENT_PROVIDER_TRANSACTION_LOCKED");
  }

  return prisma.transaction.update({
    where: {
      id: transactionId,
      churchId,
      status: "ACTIVE",
      asaasId: null,
      eventPayment: { is: null }
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelledByUserId: userId,
      cancelReason: input.reason
    }
  });
}

export type TransactionReversalMode =
  | "CANCEL"
  | "PENDING"
  | "REVERSE";

export type TransactionReversalProviderHandler = (
  input: {
    churchId: string;
    transactionId: string;
    asaasId: string | null;
    eventId: string | null;
    reason: string;
  }
) => Promise<TransactionReversalMode>;

export async function finalizeProviderTransactionCancellation(
  prisma: PrismaClient,
  churchId: string,
  transactionId: string
) {
  const transaction =
    await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        churchId
      }
    });

  if (!transaction) {
    throw new Error(
      "TRANSACTION_NOT_FOUND"
    );
  }

  if (
    transaction.status === "CANCELLED" ||
    transaction.status === "REVERSED"
  ) {
    return transaction;
  }

  if (transaction.status !== "ACTIVE") {
    throw new Error(
      "TRANSACTION_NOT_ACTIVE"
    );
  }

  return prisma.transaction.update({
    where: {
      id: transaction.id,
      churchId
    },
    data: {
      status: "CANCELLED",
      cancelledAt: new Date(),
      cancelReason:
        transaction.cancelReason ??
        "Pagamento cancelado pelo provedor."
    }
  });
}

export async function finalizeProviderTransactionReversal(
  prisma: PrismaClient,
  churchId: string,
  transactionId: string
) {
  return prisma.$transaction(
    async (tx) => {
      const transaction =
        await tx.transaction.findFirst({
          where: {
            id: transactionId,
            churchId
          }
        });

      if (!transaction) {
        throw new Error(
          "TRANSACTION_NOT_FOUND"
        );
      }

      if (
        transaction.status === "REVERSED" &&
        transaction.reversalTransactionId
      ) {
        const reversalTransaction =
          await tx.transaction.findUnique({
            where: {
              id:
                transaction.reversalTransactionId,
              churchId
            }
          });

        return {
          originalTransaction:
            transaction,
          reversalTransaction
        };
      }

      if (
        transaction.status !== "ACTIVE"
      ) {
        throw new Error(
          "TRANSACTION_NOT_ACTIVE"
        );
      }

      await ensureRelatedRecordsBelongToChurch(tx, churchId, transaction);

      const claimed =
        await tx.transaction.updateMany({
          where: {
            id: transaction.id,
            churchId,
            status: "ACTIVE"
          },
          data: {
            status: "REVERSED",
            cancelledAt: new Date(),
            cancelReason:
              transaction.cancelReason ??
              "Estorno confirmado pelo provedor."
          }
        });

      if (claimed.count !== 1) {
        const current =
          await tx.transaction.findUnique({
            where: {
              id: transaction.id,
              churchId
            }
          });

        if (
          current?.status === "REVERSED" &&
          current.reversalTransactionId
        ) {
          const reversalTransaction =
            await tx.transaction.findUnique({
              where: {
                id:
                  current.reversalTransactionId,
                churchId
              }
            });

          return {
            originalTransaction:
              current,
            reversalTransaction
          };
        }

        throw new Error(
          "TRANSACTION_NOT_ACTIVE"
        );
      }

      const reversalTransaction =
        await tx.transaction.create({
          data: {
            churchId:
              transaction.churchId,
            campusId:
              transaction.campusId,
            cnpj:
              transaction.cnpj,
            personId:
              transaction.personId,
            eventId:
              transaction.eventId,
            type:
              transaction.type,
            direction:
              getOppositeDirection(
                transaction.direction
              ),
            amount:
              transaction.amount,
            method:
              transaction.method,
            costCenter:
              transaction.costCenter,
            cancelReason:
              `Estorno: ${transaction.cancelReason ?? "confirmado pelo provedor"}`,
            at: new Date()
          }
        });

      const originalTransaction =
        await tx.transaction.update({
          where: {
            id: transaction.id,
            churchId
          },
          data: {
            reversalTransactionId:
              reversalTransaction.id
          }
        });

      return {
        originalTransaction,
        reversalTransaction
      };
    }
  );
}

export async function reverseTransaction(
  prisma: PrismaClient,
  churchId: string,
  transactionId: string,
  userId: string,
  input: TransactionControlInput,
  providerHandler?:
    TransactionReversalProviderHandler
) {
  const transaction =
    await prisma.transaction.findFirst({
      where: {
        id: transactionId,
        churchId
      },
      include: { eventPayment: { select: { churchId: true, providerPaymentId: true } } }
    });

  if (!transaction) {
    throw new Error(
      "TRANSACTION_NOT_FOUND"
    );
  }

  if (transaction.status !== "ACTIVE") {
    throw new Error(
      "TRANSACTION_NOT_ACTIVE"
    );
  }

  await ensureRelatedRecordsBelongToChurch(prisma, churchId, transaction);
  if (transaction.eventPayment && (
    transaction.eventPayment.churchId !== churchId ||
    !transaction.asaasId ||
    transaction.eventPayment.providerPaymentId !== transaction.asaasId
  )) throw new Error("PAYMENT_PROVIDER_REVERSAL_FAILED");
  if (transaction.asaasId && !providerHandler) {
    throw new Error("PAYMENT_PROVIDER_REVERSAL_FAILED");
  }

  const mode =
    providerHandler
      ? await providerHandler({
          churchId,
          transactionId:
            transaction.id,
          asaasId:
            transaction.asaasId,
          eventId:
            transaction.eventId,
          reason:
            input.reason
        })
      : "REVERSE";

  if (mode === "CANCEL") {
    const originalTransaction =
      await prisma.transaction.update({
        where: {
          id: transaction.id,
          churchId
        },
        data: {
          status: "CANCELLED",
          cancelledAt: new Date(),
          cancelledByUserId:
            userId,
          cancelReason:
            input.reason
        }
      });

    return {
      originalTransaction,
      reversalTransaction: null,
      providerPending: false
    };
  }

  await prisma.transaction.update({
    where: {
      id: transaction.id,
      churchId
    },
    data: {
      cancelledByUserId:
        userId,
      cancelReason:
        input.reason
    }
  });

  if (mode === "PENDING") {
    const originalTransaction =
      await prisma.transaction.findUnique({
        where: {
          id: transaction.id,
          churchId
        }
      });

    return {
      originalTransaction,
      reversalTransaction: null,
      providerPending: true
    };
  }

  const result =
    await finalizeProviderTransactionReversal(
      prisma,
      churchId,
      transaction.id
    );

  return {
    ...result,
    providerPending: false
  };
}

export async function listTransactions(
  prisma: PrismaClient,
  churchId: string,
  query: ListTransactionsQueryInput
) {
  const where = buildListTransactionsWhere(churchId, query);

  if (query.page == null) {
    return prisma.transaction.findMany({
      where,
      include: transactionListInclude,
      orderBy: transactionListOrderBy
    });
  }

  const limit = query.limit ?? 50;
  const skip = (query.page - 1) * limit;

  const [total, items] = await Promise.all([
    prisma.transaction.count({
      where
    }),
    prisma.transaction.findMany({
      where,
      include: transactionListInclude,
      orderBy: transactionListOrderBy,
      take: limit,
      skip
    })
  ]);

  return {
    items,
    pagination: {
      page: query.page,
      currentPage: query.page,
      limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / limit)
    }
  };
}

export async function getFinancialSummary(
  prisma: PrismaClient,
  churchId: string,
  query: ListTransactionsQueryInput
) {
  const summaryFilters: Prisma.TransactionWhereInput[] = [
    buildTransactionWhere(churchId, query),
    {
      status: query.status ?? {
        not: "CANCELLED"
      }
    }
  ];

  if (query.eventId) {
    summaryFilters.push({
      OR: [
        {
          eventPayment: {
            is: null
          }
        },
        {
          eventPayment: {
            is: {
              status: "PAID"
            }
          }
        }
      ]
    });
  }

  const where: Prisma.TransactionWhereInput = {
    AND: summaryFilters
  };

  const [income, expense, eventSales, church] = await Promise.all([
    prisma.transaction.aggregate({
      where: {
        ...where,
        direction: "IN"
      },
      _sum: {
        amount: true
      }
    }),
    prisma.transaction.aggregate({
      where: {
        ...where,
        direction: "OUT"
      },
      _sum: {
        amount: true
      }
    }),
    query.eventId
      ? prisma.eventPayment.aggregate({
          where: {
            churchId,
            eventId: query.eventId,
            status: "PAID",
            platformFeePercent: {
              not: null
            },
            transaction: {
              is: {
                status: "ACTIVE"
              }
            }
          },
          _sum: {
            amount: true,
            platformFeeAmount: true,
            netAmount: true
          }
        })
      : Promise.resolve(null),
    query.eventId
      ? prisma.church.findFirst({
          where: {
            id: churchId
          },
          select: {
            platformFeePercent: true
          }
        })
      : Promise.resolve(null)
  ]);

  return {
    income: income._sum.amount ?? 0,
    expense: expense._sum.amount ?? 0,
    ...(eventSales
      ? {
          eventSales: {
            grossAmount: eventSales._sum.amount ?? 0,
            platformFeeAmount:
              eventSales._sum.platformFeeAmount ?? 0,
            netAmount: eventSales._sum.netAmount ?? 0,
            currentPlatformFeePercent:
              resolveCurrentPlatformFeePercent(
                church?.platformFeePercent
              )
          }
        }
      : {})
  };
}
