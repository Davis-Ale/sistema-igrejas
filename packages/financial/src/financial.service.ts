import type { PrismaClient } from "@prisma/client";
import type {
  CreateTransactionInput,
  ListTransactionsQueryInput,
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
      id: true
    }
  });

  if (!transaction) {
    throw new Error("TRANSACTION_NOT_FOUND");
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

export async function listTransactions(
  prisma: PrismaClient,
  churchId: string,
  query: ListTransactionsQueryInput
) {
  return prisma.transaction.findMany({
    where: {
      churchId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.direction ? { direction: query.direction } : {}),
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
    churchId,
    ...(query.type ? { type: query.type } : {}),
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
