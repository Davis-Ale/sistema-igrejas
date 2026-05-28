import type { PrismaClient } from "@prisma/client";
import type { CreateCellInput } from "./cell.schema.js";

export async function createCell(
  prisma: PrismaClient,
  churchId: string,
  input: CreateCellInput
) {
  const leader = await prisma.person.findFirst({
    where: {
      id: input.leaderId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!leader) {
    throw new Error("LEADER_NOT_FOUND");
  }

  return prisma.celula.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      leaderId: input.leaderId,
      name: input.name,
      region: input.region,
      meetDay: input.meetDay
    }
  });
}

export async function listCells(prisma: PrismaClient, churchId: string) {
  return prisma.celula.findMany({
    where: {
      churchId
    },
    include: {
      leader: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      },
      people: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          role: true,
          volunteerStatus: true
        },
        orderBy: {
          name: "asc"
        }
      }
    },
    orderBy: {
      name: "asc"
    }
  });
}

export async function getCellById(
  prisma: PrismaClient,
  churchId: string,
  cellId: string
) {
  const cell = await prisma.celula.findFirst({
    where: {
      id: cellId,
      churchId
    },
    include: {
      leader: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true
        }
      },
      people: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
          role: true,
          volunteerStatus: true
        },
        orderBy: {
          name: "asc"
        }
      },
      memberships: {
        where: {
          removedAt: null
        },
        include: {
          person: {
            select: {
              id: true,
              name: true,
              phone: true,
              email: true,
              role: true,
              volunteerStatus: true
            }
          },
          approver: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!cell) {
    throw new Error("CELL_NOT_FOUND");
  }

  return cell;
}
