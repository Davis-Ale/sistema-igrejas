import type { PrismaClient } from "@prisma/client";
import type {
  AddPersonToCellInput,
  RemovePersonFromCellInput
} from "./cell.schema.js";

export async function addPersonToCell(
  prisma: PrismaClient,
  churchId: string,
  approvedBy: string,
  input: AddPersonToCellInput
) {
  const [person, cell] = await Promise.all([
    prisma.person.findFirst({
      where: {
        id: input.personId,
        churchId
      },
      select: {
        id: true
      }
    }),
    prisma.celula.findFirst({
      where: {
        id: input.groupId,
        churchId,
        leader: { churchId }
      },
      select: {
        id: true
      }
    })
  ]);

  if (!person) {
    throw new Error("PERSON_NOT_FOUND");
  }

  if (!cell) {
    throw new Error("CELL_NOT_FOUND");
  }

  if (!await prisma.person.findFirst({
    where: { id: approvedBy, churchId }, select: { id: true }
  })) throw new Error("APPROVER_NOT_FOUND");

  return prisma.$transaction(async (tx) => {
    const membership = await tx.membership.create({
      data: {
        churchId,
        personId: input.personId,
        groupId: input.groupId,
        canVolunteer: input.canVolunteer,
        approvedBy
      }
    });

    await tx.person.update({
      where: {
        id: input.personId,
        churchId
      },
      data: {
        celulaId: input.groupId
      }
    });

    return membership;
  });
}

export async function removePersonFromCell(
  prisma: PrismaClient,
  churchId: string,
  input: RemovePersonFromCellInput
) {
  const membership = await prisma.membership.findFirst({
    where: {
      churchId,
      personId: input.personId,
      groupId: input.groupId,
      person: { churchId },
      celula: { churchId },
      removedAt: null
    },
    select: {
      id: true
    }
  });

  if (!membership) {
    throw new Error("MEMBERSHIP_NOT_FOUND");
  }

  return prisma.$transaction(async (tx) => {
    const removedMembership = await tx.membership.update({
      where: {
        id: membership.id,
        churchId
      },
      data: {
        removedAt: new Date(),
        removalNote: input.removalNote ?? null
      }
    });

    await tx.person.update({
      where: {
        id: input.personId,
        churchId
      },
      data: {
        celulaId: null
      }
    });

    return removedMembership;
  });
}
