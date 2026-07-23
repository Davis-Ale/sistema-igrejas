import type { PrismaClient } from "@prisma/client";

type CellStatusValue = "ACTIVE" | "ARCHIVED";

async function changeCellStatus(
  prisma: PrismaClient,
  churchId: string,
  cellId: string,
  status: CellStatusValue
) {
  const cell = await prisma.celula.findFirst({
    where: {
      id: cellId,
      churchId
    },
    select: {
      id: true,
      status: true,
      archivedAt: true,
      updatedAt: true
    }
  });

  if (!cell) {
    throw new Error("CELL_NOT_FOUND");
  }

  if (cell.status === status) {
    return cell;
  }

  return prisma.celula.update({
    where: {
      id: cell.id
    },
    data: {
      status,
      archivedAt: status === "ARCHIVED" ? new Date() : null
    },
    select: {
      id: true,
      status: true,
      archivedAt: true,
      updatedAt: true
    }
  });
}

export async function archiveCell(
  prisma: PrismaClient,
  churchId: string,
  cellId: string
) {
  return changeCellStatus(
    prisma,
    churchId,
    cellId,
    "ARCHIVED"
  );
}

export async function reactivateCell(
  prisma: PrismaClient,
  churchId: string,
  cellId: string
) {
  return changeCellStatus(
    prisma,
    churchId,
    cellId,
    "ACTIVE"
  );
}
