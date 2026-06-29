import { Role, type PrismaClient } from "@prisma/client";
import type { CreateVisitorInput, ListVisitorsQueryInput } from "./visitor.schema.js";

const visitorSelect = {
  id: true,
  name: true,
  phone: true,
  email: true,
  role: true,
  volunteerStatus: true,
  campusId: true,
  createdAt: true,
  updatedAt: true
} as const;

export async function listVisitors(
  prisma: PrismaClient,
  churchId: string,
  query: ListVisitorsQueryInput
) {
  const search = query.search?.trim();

  return prisma.person.findMany({
    where: {
      churchId,
      role: Role.VISITOR,
      ...(search
        ? {
            OR: [
              {
                name: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                phone: {
                  contains: search,
                  mode: "insensitive"
                }
              },
              {
                email: {
                  contains: search,
                  mode: "insensitive"
                }
              }
            ]
          }
        : {})
    },
    orderBy: {
      name: "asc"
    },
    select: visitorSelect
  });
}

export async function createVisitor(
  prisma: PrismaClient,
  churchId: string,
  input: CreateVisitorInput
) {
  return prisma.person.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      role: Role.VISITOR
    },
    select: visitorSelect
  });
}
