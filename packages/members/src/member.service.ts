import { Role, type PrismaClient } from "@prisma/client";
import type { CreateMemberInput, ListMembersQueryInput } from "./member.schema.js";

const memberSelect = {
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

export async function listMembers(
  prisma: PrismaClient,
  churchId: string,
  query: ListMembersQueryInput
) {
  const search = query.search?.trim();

  return prisma.person.findMany({
    where: {
      churchId,
      role: Role.MEMBER,
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
    select: memberSelect
  });
}

export async function createMember(
  prisma: PrismaClient,
  churchId: string,
  input: CreateMemberInput
) {
  return prisma.person.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      name: input.name,
      phone: input.phone,
      email: input.email ?? null,
      role: Role.MEMBER
    },
    select: memberSelect
  });
}
