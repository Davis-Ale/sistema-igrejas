import type { PrismaClient } from "@prisma/client";
import type {
  CreateTransactionInput,
  ListTransactionsQueryInput,
  TransactionControlInput,
  UpdateTransactionInput
} from "./financial.schema.js";

async function ensureRelatedRecordsBelongToChurch(
  prisma: PrismaClient,
  churchId: string,
  input: {
    personId?: string | undefined;
    eventId?: string | undefined;
  }
) {
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

export async function createTransaction(
  prisma: PrismaClient,
  churchId: string,
  input: CreateTransactionInput
) {
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
      status: true
    }
  });

  if (!transaction) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  if (transaction.status !== "ACTIVE") {
    throw new Error("TRANSACTION_NOT_ACTIVE");
  }

  await ensureRelatedRecordsBelongToChurch(prisma, churchId, input);

  return prisma.transaction.update({
    where: {
      id: transactionId
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
      status: true
    }
  });

  if (!transaction) {
    throw new Error("TRANSACTION_NOT_FOUND");
  }

  if (transaction.status !== "ACTIVE") {
    throw new Error("TRANSACTION_NOT_ACTIVE");
  }

  return prisma.transaction.update({
    where: {
      id: transactionId
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
      id: transaction.id
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
                transaction.reversalTransactionId
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
              id: transaction.id
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
                  current.reversalTransactionId
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
            id: transaction.id
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
      }
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
          id: transaction.id
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
      id: transaction.id
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
          id: transaction.id
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
  return prisma.transaction.findMany({
    where: buildTransactionWhere(churchId, query),
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
    },
    orderBy: {
      at: "desc"
    }
  });
}

export async function getFinancialSummary(
  prisma: PrismaClient,
  churchId: string,
  query: ListTransactionsQueryInput
) {
  const where = {
    ...buildTransactionWhere(churchId, query),
    status: query.status ?? {
      not: "CANCELLED" as const
    }
  };

  const [income, expense] = await Promise.all([
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
    })
  ]);

  return {
    income: income._sum.amount ?? 0,
    expense: expense._sum.amount ?? 0
  };
}
