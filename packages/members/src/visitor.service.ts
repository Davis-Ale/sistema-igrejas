import type { PrismaClient } from "@prisma/client";
import type { CreateVisitorInput } from "./visitor.schema.js";

export async function listVisitors(prisma: PrismaClient, churchId: string) {
  return prisma.visitor.findMany({
    where: {
      churchId
    },
    select: {
      id: true,
      campusId: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      firstVisitAt: true,
      notes: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      createdAt: "desc"
    }
  });
}

export async function createVisitor(
  prisma: PrismaClient,
  churchId: string,
  input: CreateVisitorInput
) {
  return prisma.visitor.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      name: input.name,
      phone: input.phone,
      email: input.email?.trim() ? input.email : null,
      status: input.status,
      firstVisitAt: input.firstVisitAt ? new Date(input.firstVisitAt) : null,
      notes: input.notes?.trim() ? input.notes : null
    },
    select: {
      id: true,
      campusId: true,
      name: true,
      phone: true,
      email: true,
      status: true,
      firstVisitAt: true,
      notes: true,
      createdAt: true,
      updatedAt: true
    }
  });
}
