import { Prisma, type PrismaClient } from "@prisma/client";
import type { Role } from "@sistema-igrejas/auth";
import type {
  AssignVolunteerInput,
  ConfirmAssignmentInput,
  CreateScheduleInput,
  CreateSlotInput,
  UnavailabilityInput,
  UpdateScheduleInput
} from "./volunteer-schedule.schema.js";

type Store = Prisma.TransactionClient;
const isolated = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };
const openStatuses = ["PENDING", "CONFIRMED"] as const;

function calendarDate(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) throw new Error("SCHEDULE_DATE_INVALID");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error("SCHEDULE_DATE_INVALID");
  }
  return date;
}

function minuteOf(value: string): number {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) throw new Error("SCHEDULE_TIME_INVALID");
  return Number(match[1]) * 60 + Number(match[2]);
}

function clockOf(minute: number): string {
  return `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function windowOf(input: { serviceDate: string; startTime: string; endTime: string }) {
  const startMinute = minuteOf(input.startTime);
  const endMinute = minuteOf(input.endTime);
  if (endMinute <= startMinute) throw new Error("SCHEDULE_TIME_INVALID");
  return { serviceDate: calendarDate(input.serviceDate), startMinute, endMinute };
}

function overlaps(start: number, end: number, otherStart: number, otherEnd: number): boolean {
  return start < otherEnd && otherStart < end;
}

function canManage(role: Role, actorId: string, leaderId: string): boolean {
  if (role === "SUPER_ADMIN" || role === "PASTOR") return true;
  return role === "LEADER" && actorId === leaderId;
}

async function requireActor(db: Store, churchId: string, actorId: string) {
  const actor = await db.person.findFirst({ where: { id: actorId, churchId }, select: { id: true } });
  if (!actor) throw new Error("ACTOR_NOT_FOUND");
  return actor;
}

async function requireMinistry(db: Store, churchId: string, ministryId: string) {
  const ministry = await db.ministry.findFirst({
    where: { id: ministryId, churchId, leader: { is: { churchId } } },
    select: { id: true, status: true, leaderId: true, name: true }
  });
  if (!ministry) throw new Error("MINISTRY_NOT_FOUND");
  return ministry;
}

async function requireSchedule(db: Store, churchId: string, scheduleId: string) {
  const schedule = await db.volunteerSchedule.findFirst({
    where: { id: scheduleId, churchId, ministry: { is: { churchId } } },
    select: {
      id: true,
      ministryId: true,
      serviceDate: true,
      startMinute: true,
      endMinute: true,
      ministry: { select: { leaderId: true, status: true, name: true } }
    }
  });
  if (!schedule) throw new Error("SCHEDULE_NOT_FOUND");
  return schedule;
}

function assertManager(role: Role, actorId: string, leaderId: string) {
  if (!canManage(role, actorId, leaderId)) throw new Error("SCHEDULE_FORBIDDEN");
}

async function assertAvailable(
  db: Store,
  churchId: string,
  personId: string,
  serviceDate: Date,
  startMinute: number,
  endMinute: number,
  ignoreScheduleId?: string
) {
  const schedules = await db.volunteerSchedule.findMany({
    where: { churchId, serviceDate },
    select: {
      id: true,
      startMinute: true,
      endMinute: true,
      slots: {
        select: {
          assignments: {
            where: { churchId, personId, status: { in: [...openStatuses] } },
            select: { personId: true }
          }
        }
      }
    }
  });
  for (const schedule of schedules) {
    if (schedule.id === ignoreScheduleId) continue;
    const occupies = schedule.slots.some((slot) => slot.assignments.length > 0);
    if (occupies && overlaps(startMinute, endMinute, schedule.startMinute, schedule.endMinute)) {
      throw new Error("SCHEDULE_CONFLICT");
    }
  }
  const blocks = await db.volunteerUnavailability.findMany({
    where: { churchId, personId, serviceDate },
    select: { startMinute: true, endMinute: true }
  });
  if (blocks.some((block) => overlaps(startMinute, endMinute, block.startMinute, block.endMinute))) {
    throw new Error("VOLUNTEER_UNAVAILABLE");
  }
}

async function assertOnMinistry(db: Store, churchId: string, ministryId: string, leaderId: string, personId: string) {
  if (personId === leaderId) return;
  const member = await db.ministryMember.findFirst({
    where: { churchId, ministryId, personId, person: { is: { churchId } } },
    select: { personId: true }
  });
  if (!member) throw new Error("VOLUNTEER_NOT_ON_MINISTRY");
}

async function requireEligible(db: Store, churchId: string, personId: string) {
  const person = await db.person.findFirst({
    where: { id: personId, churchId },
    select: { id: true, name: true, role: true, volunteerStatus: true }
  });
  if (!person) throw new Error("PERSON_NOT_FOUND");
  if (person.role === "VISITOR" || (person.volunteerStatus !== "ELIGIBLE" && person.volunteerStatus !== "ACTIVE")) {
    throw new Error("VOLUNTEER_NOT_ELIGIBLE");
  }
  return person;
}

async function assertCanRecordAvailability(db: Store, churchId: string, role: Role, actorId: string, personId: string) {
  if (role === "SUPER_ADMIN" || role === "PASTOR" || actorId === personId) return;
  if (role === "LEADER") {
    const ministry = await db.ministry.findFirst({
      where: {
        churchId,
        leaderId: actorId,
        OR: [{ leaderId: personId }, { members: { some: { churchId, personId } } }]
      },
      select: { id: true }
    });
    if (ministry) return;
  }
  throw new Error("VOLUNTEER_AVAILABILITY_FORBIDDEN");
}

function present(schedule: {
  id: string;
  serviceDate: Date;
  startMinute: number;
  endMinute: number;
  ministryId: string;
  ministry: { name: string };
}, slots: Array<{ id: string; name: string; assignments: Array<{ personId: string; status: "PENDING" | "CONFIRMED" | "DECLINED"; person: { name: string } }> }>, role: Role, actorId: string, leaderId: string) {
  return {
    id: schedule.id,
    ministryId: schedule.ministryId,
    ministryName: schedule.ministry.name,
    serviceDate: formatDate(schedule.serviceDate),
    startTime: clockOf(schedule.startMinute),
    endTime: clockOf(schedule.endMinute),
    slots: slots.map((slot) => ({
      id: slot.id,
      name: slot.name,
      assignments: slot.assignments.map((assignment) => ({
        personId: assignment.personId,
        name: assignment.person.name,
        status: assignment.status,
        canConfirm: assignment.status === "PENDING" && (canManage(role, actorId, leaderId) || actorId === assignment.personId)
      }))
    }))
  };
}

export async function listVolunteerSchedules(prisma: PrismaClient, churchId: string, actorId: string, role: Role) {
  return prisma.$transaction(async (tx) => {
    await requireActor(tx, churchId, actorId);
    const ownOnly = role === "MEMBER" || role === "VOLUNTEER";
    const schedules = await tx.volunteerSchedule.findMany({
      where: {
        churchId,
        ministry: { is: { churchId } },
        ...(ownOnly ? { slots: { some: { assignments: { some: { churchId, personId: actorId } } } } } : {})
      },
      orderBy: [{ serviceDate: "desc" }, { startMinute: "desc" }],
      take: 60,
      select: {
        id: true,
        ministryId: true,
        serviceDate: true,
        startMinute: true,
        endMinute: true,
        ministry: { select: { name: true, leaderId: true } },
        slots: {
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            assignments: {
              where: { churchId, person: { is: { churchId } } },
              select: { personId: true, status: true, person: { select: { name: true } } }
            }
          }
        }
      }
    });
    return schedules.map((schedule) => present(schedule, schedule.slots, role, actorId, schedule.ministry.leaderId));
  }, isolated);
}

export async function createVolunteerSchedule(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  input: CreateScheduleInput
) {
  const window = windowOf(input);
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const ministry = await requireMinistry(tx, churchId, input.ministryId);
    if (ministry.status !== "ACTIVE") throw new Error("MINISTRY_INACTIVE");
    assertManager(role, actor.id, ministry.leaderId);
    const schedule = await tx.volunteerSchedule.create({
      data: { churchId, ministryId: ministry.id, ...window },
      select: { id: true, ministryId: true, serviceDate: true, startMinute: true, endMinute: true }
    });
    return present({ ...schedule, ministry: { name: ministry.name } }, [], role, actor.id, ministry.leaderId);
  }, isolated);
}

export async function updateVolunteerSchedule(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  scheduleId: string,
  input: UpdateScheduleInput
) {
  const window = windowOf(input);
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const schedule = await requireSchedule(tx, churchId, scheduleId);
    if (schedule.ministry.status !== "ACTIVE") throw new Error("MINISTRY_INACTIVE");
    assertManager(role, actor.id, schedule.ministry.leaderId);
    const assigned = await tx.volunteerAssignment.findMany({
      where: { churchId, status: { in: [...openStatuses] }, slot: { is: { churchId, scheduleId: schedule.id } } },
      select: { personId: true }
    });
    for (const personId of new Set(assigned.map((row) => row.personId))) {
      await assertAvailable(tx, churchId, personId, window.serviceDate, window.startMinute, window.endMinute, schedule.id);
    }
    const updated = await tx.volunteerSchedule.update({
      where: { id: schedule.id, churchId },
      data: window,
      select: { id: true, ministryId: true, serviceDate: true, startMinute: true, endMinute: true }
    });
    return present({ ...updated, ministry: { name: schedule.ministry.name } }, [], role, actor.id, schedule.ministry.leaderId);
  }, isolated);
}

export async function addScheduleSlot(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  scheduleId: string,
  input: CreateSlotInput
) {
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const schedule = await requireSchedule(tx, churchId, scheduleId);
    assertManager(role, actor.id, schedule.ministry.leaderId);
    const slot = await tx.volunteerScheduleSlot.create({
      data: { churchId, scheduleId: schedule.id, name: input.name },
      select: { id: true, name: true }
    });
    return { scheduleId: schedule.id, ...slot };
  }, isolated);
}

export async function assignVolunteer(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  scheduleId: string,
  input: AssignVolunteerInput
) {
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const schedule = await requireSchedule(tx, churchId, scheduleId);
    if (schedule.ministry.status !== "ACTIVE") throw new Error("MINISTRY_INACTIVE");
    assertManager(role, actor.id, schedule.ministry.leaderId);
    const slot = await tx.volunteerScheduleSlot.findFirst({
      where: { id: input.slotId, churchId, scheduleId: schedule.id },
      select: { id: true, name: true }
    });
    if (!slot) throw new Error("SLOT_NOT_FOUND");
    const person = await requireEligible(tx, churchId, input.personId);
    await assertOnMinistry(tx, churchId, schedule.ministryId, schedule.ministry.leaderId, person.id);
    const existing = await tx.volunteerAssignment.findFirst({
      where: { churchId, slotId: slot.id, personId: person.id },
      select: { status: true }
    });
    if (existing && existing.status !== "DECLINED") throw new Error("VOLUNTEER_ALREADY_ASSIGNED");
    await assertAvailable(tx, churchId, person.id, schedule.serviceDate, schedule.startMinute, schedule.endMinute);
    if (existing) {
      await tx.volunteerAssignment.update({
        where: { churchId_slotId_personId: { churchId, slotId: slot.id, personId: person.id } },
        data: { status: "PENDING" }
      });
    } else {
      await tx.volunteerAssignment.create({
        data: { churchId, slotId: slot.id, personId: person.id, status: "PENDING" }
      });
    }
    return { scheduleId: schedule.id, slotId: slot.id, personId: person.id, name: person.name, status: "PENDING" as const };
  }, isolated);
}

export async function removeVolunteerAssignment(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  scheduleId: string,
  slotId: string,
  personId: string
) {
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const schedule = await requireSchedule(tx, churchId, scheduleId);
    assertManager(role, actor.id, schedule.ministry.leaderId);
    const removed = await tx.volunteerAssignment.deleteMany({
      where: { churchId, slotId, personId, slot: { is: { churchId, scheduleId: schedule.id } } }
    });
    if (!removed.count) throw new Error("ASSIGNMENT_NOT_FOUND");
    return { scheduleId: schedule.id, slotId, personId, deleted: true };
  }, isolated);
}

export async function confirmVolunteerAssignment(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  scheduleId: string,
  slotId: string,
  personId: string,
  input: ConfirmAssignmentInput
) {
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const schedule = await requireSchedule(tx, churchId, scheduleId);
    const assignment = await tx.volunteerAssignment.findFirst({
      where: { churchId, slotId, personId, person: { is: { churchId } }, slot: { is: { churchId, scheduleId: schedule.id } } },
      select: { status: true, person: { select: { name: true } } }
    });
    if (!assignment) throw new Error("ASSIGNMENT_NOT_FOUND");
    if (!canManage(role, actor.id, schedule.ministry.leaderId) && actor.id !== personId) {
      throw new Error("SCHEDULE_FORBIDDEN");
    }
    if (input.status === "CONFIRMED" && assignment.status !== "CONFIRMED") {
      await assertAvailable(tx, churchId, personId, schedule.serviceDate, schedule.startMinute, schedule.endMinute, schedule.id);
    }
    if (assignment.status !== input.status) {
      await tx.volunteerAssignment.update({
        where: { churchId_slotId_personId: { churchId, slotId, personId } },
        data: { status: input.status }
      });
    }
    return { scheduleId: schedule.id, slotId, personId, name: assignment.person.name, status: input.status };
  }, isolated);
}

export async function listVolunteerUnavailability(prisma: PrismaClient, churchId: string, actorId: string, role: Role, personId?: string) {
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const targetId = personId ?? actor.id;
    await assertCanRecordAvailability(tx, churchId, role, actor.id, targetId);
    const rows = await tx.volunteerUnavailability.findMany({
      where: { churchId, personId: targetId, person: { is: { churchId } } },
      orderBy: [{ serviceDate: "desc" }, { startMinute: "asc" }],
      take: 60,
      select: { id: true, personId: true, serviceDate: true, startMinute: true, endMinute: true }
    });
    return rows.map((row) => ({
      id: row.id,
      personId: row.personId,
      serviceDate: formatDate(row.serviceDate),
      startTime: clockOf(row.startMinute),
      endTime: clockOf(row.endMinute)
    }));
  }, isolated);
}

export async function createVolunteerUnavailability(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  input: UnavailabilityInput
) {
  const window = windowOf(input);
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const targetId = input.personId ?? actor.id;
    await assertCanRecordAvailability(tx, churchId, role, actor.id, targetId);
    const person = await tx.person.findFirst({ where: { id: targetId, churchId }, select: { id: true } });
    if (!person) throw new Error("PERSON_NOT_FOUND");
    const schedules = await tx.volunteerSchedule.findMany({
      where: { churchId, serviceDate: window.serviceDate },
      select: {
        startMinute: true,
        endMinute: true,
        slots: { select: { assignments: { where: { churchId, personId: person.id, status: { in: [...openStatuses] } }, select: { personId: true } } } }
      }
    });
    if (schedules.some((schedule) => schedule.slots.some((slot) => slot.assignments.length > 0) && overlaps(window.startMinute, window.endMinute, schedule.startMinute, schedule.endMinute))) {
      throw new Error("SCHEDULE_CONFLICT");
    }
    const created = await tx.volunteerUnavailability.create({
      data: { churchId, personId: person.id, ...window },
      select: { id: true, personId: true, serviceDate: true, startMinute: true, endMinute: true }
    });
    return {
      id: created.id,
      personId: created.personId,
      serviceDate: formatDate(created.serviceDate),
      startTime: clockOf(created.startMinute),
      endTime: clockOf(created.endMinute)
    };
  }, isolated);
}

export async function deleteVolunteerUnavailability(
  prisma: PrismaClient,
  churchId: string,
  actorId: string,
  role: Role,
  unavailabilityId: string
) {
  return prisma.$transaction(async (tx) => {
    const actor = await requireActor(tx, churchId, actorId);
    const row = await tx.volunteerUnavailability.findFirst({
      where: { id: unavailabilityId, churchId, person: { is: { churchId } } },
      select: { id: true, personId: true }
    });
    if (!row) throw new Error("UNAVAILABILITY_NOT_FOUND");
    await assertCanRecordAvailability(tx, churchId, role, actor.id, row.personId);
    await tx.volunteerUnavailability.delete({ where: { id: row.id, churchId } });
    return { id: row.id, deleted: true };
  }, isolated);
}
