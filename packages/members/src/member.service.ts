import type { PrismaClient } from "@prisma/client";
import type { CreateMemberInput } from "./member.schema.js";

export async function listMembers(prisma: PrismaClient, churchId: string) {
  return prisma.person.findMany({
    where: {
      churchId
    },
    select: {
      id: true,
      campusId: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      volunteerStatus: true,
      createdAt: true,
      updatedAt: true
    },
    orderBy: {
      name: "asc"
    }
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
      email: input.email?.trim() ? input.email : null,
      role: input.role
    },
    select: {
      id: true,
      campusId: true,
      name: true,
      phone: true,
      email: true,
      role: true,
      volunteerStatus: true,
      createdAt: true,
      updatedAt: true
    }
  });
}
