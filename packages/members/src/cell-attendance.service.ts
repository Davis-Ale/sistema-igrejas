import { Prisma, type PrismaClient } from "@prisma/client";
import type { Role } from "@sistema-igrejas/auth";
import type { RecordCellAttendanceInput } from "./cell-attendance.schema.js";

type Store = Prisma.TransactionClient | PrismaClient;

function calendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("ATTENDANCE_DATE_INVALID");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    throw new Error("ATTENDANCE_DATE_INVALID");
  }
  return date;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function todayInBrazil(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

function assertCanSupervise(role: Role, actorId: string, leaderId: string): void {
  if (role === "SUPER_ADMIN" || role === "PASTOR") return;
  if (role === "LEADER" && actorId === leaderId) return;
  throw new Error("CELL_ATTENDANCE_FORBIDDEN");
}

async function loadCell(db: Store, churchId: string, cellId: string) {
  const cell = await db.celula.findFirst({
    where: { id: cellId, churchId, leader: { churchId } },
    select: { id: true, status: true, leaderId: true }
  });
  if (!cell) throw new Error("CELL_NOT_FOUND");
  return cell;
}

async function loadActor(db: Store, churchId: string, actorPersonId: string) {
  const actor = await db.person.findFirst({
    where: { id: actorPersonId, churchId },
    select: { id: true }
  });
  if (!actor) throw new Error("ACTOR_NOT_FOUND");
  return actor;
}

function sameRoster(expected: string[], received: string[]): boolean {
  if (expected.length !== received.length) return false;
  const unique = new Set(received);
  if (unique.size !== received.length) return false;
  return expected.every((id) => unique.has(id));
}

export async function recordCellAttendance(
  prisma: PrismaClient,
  churchId: string,
  actorPersonId: string,
  role: Role,
  cellId: string,
  input: RecordCellAttendanceInput
) {
  const occurredOn = calendarDate(input.occurredOn);
  if (input.occurredOn > todayInBrazil()) {
    throw new Error("ATTENDANCE_DATE_IN_FUTURE");
  }

  return prisma.$transaction(async (tx) => {
    const cell = await loadCell(tx, churchId, cellId);
    if (cell.status !== "ACTIVE") throw new Error("CELL_ARCHIVED");
    const actor = await loadActor(tx, churchId, actorPersonId);
    assertCanSupervise(role, actor.id, cell.leaderId);

    const roster = await tx.person.findMany({
      where: {
        churchId,
        celulaId: cell.id,
        celula: { churchId, id: cell.id }
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
    if (roster.length === 0) throw new Error("CELL_HAS_NO_MEMBERS");
    if (!sameRoster(roster.map((person) => person.id), input.marks.map((mark) => mark.personId))) {
      throw new Error("ATTENDANCE_ROSTER_MISMATCH");
    }

    const meeting = await tx.cellMeeting.upsert({
      where: {
        churchId_cellId_occurredOn: { churchId, cellId: cell.id, occurredOn }
      },
      create: { churchId, cellId: cell.id, occurredOn, recordedBy: actor.id },
      update: { recordedBy: actor.id },
      select: { id: true, cellId: true, occurredOn: true, recordedBy: true }
    });

    await tx.cellAttendance.deleteMany({
      where: { churchId, meetingId: meeting.id }
    });
    await tx.cellAttendance.createMany({
      data: input.marks.map((mark) => ({
        churchId,
        meetingId: meeting.id,
        personId: mark.personId,
        status: mark.status
      }))
    });

    const statusByPerson = new Map(input.marks.map((mark) => [mark.personId, mark.status]));
    const marks = roster.map((person) => ({
      personId: person.id,
      name: person.name,
      status: statusByPerson.get(person.id)!
    }));

    return {
      id: meeting.id,
      cellId: meeting.cellId,
      occurredOn: formatDate(meeting.occurredOn),
      recordedBy: meeting.recordedBy,
      presentCount: marks.filter((mark) => mark.status === "PRESENT").length,
      absentCount: marks.filter((mark) => mark.status === "ABSENT").length,
      marks
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function listCellMeetings(
  prisma: PrismaClient,
  churchId: string,
  actorPersonId: string,
  role: Role,
  cellId: string,
  limit: number
) {
  return prisma.$transaction(async (tx) => {
    const cell = await loadCell(tx, churchId, cellId);
    const actor = await loadActor(tx, churchId, actorPersonId);
    assertCanSupervise(role, actor.id, cell.leaderId);

    const meetings = await tx.cellMeeting.findMany({
      where: { churchId, cellId: cell.id, cell: { churchId, id: cell.id } },
      orderBy: { occurredOn: "desc" },
      take: limit,
      select: {
        id: true,
        cellId: true,
        occurredOn: true,
        recordedBy: true,
        marks: {
          where: { churchId, person: { churchId } },
          select: {
            personId: true,
            status: true,
            person: { select: { name: true } }
          }
        }
      }
    });

    return meetings.map((meeting) => {
      const marks = [...meeting.marks]
        .map((mark) => ({
          personId: mark.personId,
          name: mark.person.name,
          status: mark.status
        }))
        .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"));
      return {
        id: meeting.id,
        cellId: meeting.cellId,
        occurredOn: formatDate(meeting.occurredOn),
        recordedBy: meeting.recordedBy,
        presentCount: marks.filter((mark) => mark.status === "PRESENT").length,
        absentCount: marks.filter((mark) => mark.status === "ABSENT").length,
        marks
      };
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
