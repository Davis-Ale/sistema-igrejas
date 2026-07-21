import type { PrismaClient } from "@prisma/client";
import type {
  CreateCellInput,
  UpdateCellInput
} from "./cell.schema.js";

function buildCellLocation(input: CreateCellInput | UpdateCellInput) {
  const state = input.state ?? "";
  const city = input.city ?? "";
  const neighborhood = input.neighborhood ?? "";
  const region =
    input.region ??
    [neighborhood, city && state ? city + "/" + state : city || state]
      .filter(Boolean)
      .join(" - ");

  return {
    city,
    neighborhood,
    region,
    state
  };
}

async function ensureLeaderBelongsToChurch(
  prisma: PrismaClient,
  churchId: string,
  leaderId: string
): Promise<void> {
  const leader = await prisma.person.findFirst({
    where: {
      id: leaderId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!leader) {
    throw new Error("LEADER_NOT_FOUND");
  }
}

export async function createCell(
  prisma: PrismaClient,
  churchId: string,
  input: CreateCellInput
) {
  await ensureLeaderBelongsToChurch(prisma, churchId, input.leaderId);

  const location = buildCellLocation(input);

  return prisma.celula.create({
    data: {
      churchId,
      campusId: input.campusId ?? null,
      leaderId: input.leaderId,
      name: input.name ?? input.profile,
      ...location,
      meetDay: input.meetDay,
      meetTime: input.meetTime,
      profile: input.profile
    }
  });
}

export async function updateCell(
  prisma: PrismaClient,
  churchId: string,
  cellId: string,
  input: UpdateCellInput
) {
  const cell = await prisma.celula.findFirst({
    where: {
      id: cellId,
      churchId
    },
    select: {
      id: true
    }
  });

  if (!cell) {
    throw new Error("CELL_NOT_FOUND");
  }

  await ensureLeaderBelongsToChurch(prisma, churchId, input.leaderId);

  const location = buildCellLocation(input);

  return prisma.celula.update({
    where: {
      id: cell.id
    },
    data: {
      campusId: input.campusId ?? null,
      leaderId: input.leaderId,
      name: input.name ?? input.profile,
      ...location,
      meetDay: input.meetDay,
      meetTime: input.meetTime,
      profile: input.profile
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
