import type { PrismaClient } from "@prisma/client";
import type {
  CreateTransactionInput,
  ListTransactionsQueryInput
} from "./financial.schema.js";

export async function createTransaction(
  prisma: PrismaClient,
  churchId: string,
  input: CreateTransactionInput
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
