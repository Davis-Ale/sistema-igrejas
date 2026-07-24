import type { Prisma, PrismaClient } from "@prisma/client";
import type { ListCellsQuery } from "./cell.schema.js";

export async function listPaginatedCells(
  prisma: PrismaClient,
  churchId: string,
  query: ListCellsQuery
) {
  const where: Prisma.CelulaWhereInput = {
    churchId,
    ...(query.status === "ALL"
      ? {}
      : {
          status: query.status
        }),
    ...(query.neighborhood
      ? {
          neighborhood: {
            contains: query.neighborhood,
            mode: "insensitive"
          }
        }
      : {}),
    ...(query.profile
      ? {
          profile: {
            equals: query.profile,
            mode: "insensitive"
          }
        }
      : {}),
    ...(query.leader
      ? {
          leader: {
            is: {
              name: {
                contains: query.leader,
                mode: "insensitive"
              }
            }
          }
        }
      : {})
  };

  const skip = (query.page - 1) * query.pageSize;

  const [cells, total] = await prisma.$transaction([
    prisma.celula.findMany({
      where,
      select: {
        id: true,
        churchId: true,
        campusId: true,
        leaderId: true,
        name: true,
        region: true,
        state: true,
        city: true,
        neighborhood: true,
        meetDay: true,
        meetTime: true,
        profile: true,
        status: true,
        archivedAt: true,
        createdAt: true,
        updatedAt: true,
        leader: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true
          }
        },
        _count: {
          select: {
            people: true
          }
        }
      },
      orderBy: [
        {
          neighborhood: "asc"
        },
        {
          profile: "asc"
        },
        {
          name: "asc"
        }
      ],
      skip,
      take: query.pageSize
    }),
    prisma.celula.count({
      where
    })
  ]);

  return {
    items: cells.map(({ _count, ...cell }) => ({
      ...cell,
      memberCount: _count.people
    })),
    pagination: {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize)
    }
  };
}
