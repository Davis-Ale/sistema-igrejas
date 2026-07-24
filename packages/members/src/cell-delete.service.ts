import type { PrismaClient } from "@prisma/client";

export async function deleteCellSafely(
  prisma: PrismaClient,
  churchId: string,
  cellId: string
) {
  return prisma.$transaction(async (transaction) => {
    const cell = await transaction.celula.findFirst({
      where: {
        id: cellId,
        churchId
      },
      select: {
        id: true,
        _count: {
          select: {
            people: true,
            memberships: true
          }
        }
      }
    });

    if (!cell) {
      throw new Error("CELL_NOT_FOUND");
    }

    if (
      cell._count.people > 0 ||
      cell._count.memberships > 0
    ) {
      throw new Error("CELL_HAS_HISTORY");
    }

    await transaction.celula.delete({
      where: {
        id: cell.id
      }
    });

    return {
      id: cell.id,
      deleted: true
    };
  });
}
