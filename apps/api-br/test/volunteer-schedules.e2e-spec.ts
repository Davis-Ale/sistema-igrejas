import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, type Role } from "@sistema-igrejas/auth";
import { registerVolunteerRoutes } from "@sistema-igrejas/volunteers";

type Person = { id: string; churchId: string; name: string; role: string; volunteerStatus: string };
type Ministry = { id: string; churchId: string; name: string; status: "ACTIVE" | "INACTIVE"; leaderId: string };
type Account = { id: string; churchId: string; role: Role; status: "ACTIVE"; personId: string | null };
type Schedule = { id: string; churchId: string; ministryId: string; serviceDate: Date; startMinute: number; endMinute: number };
type Slot = { id: string; churchId: string; scheduleId: string; name: string };
type Assignment = { churchId: string; slotId: string; personId: string; status: "PENDING" | "CONFIRMED" | "DECLINED" };
type Block = { id: string; churchId: string; personId: string; serviceDate: Date; startMinute: number; endMinute: number };

describe("Volunteer schedules tenant, RBAC and conflicts", () => {
  let app: FastifyInstance;
  let people: Person[];
  let ministries: Ministry[];
  let members: Array<{ churchId: string; ministryId: string; personId: string }>;
  let accounts: Account[];
  let schedules: Schedule[];
  let slots: Slot[];
  let assignments: Assignment[];
  let blocks: Block[];
  let writes: jest.Mock;

  beforeEach(async () => {
    writes = jest.fn();
    people = [
      { id: "a-pastor", churchId: "a", name: "Pastor A", role: "PASTOR", volunteerStatus: "ACTIVE" },
      { id: "a-leader", churchId: "a", name: "Líder A", role: "LEADER", volunteerStatus: "ACTIVE" },
      { id: "a-other", churchId: "a", name: "Outro líder", role: "LEADER", volunteerStatus: "ACTIVE" },
      { id: "a-ana", churchId: "a", name: "Ana", role: "VOLUNTEER", volunteerStatus: "ACTIVE" },
      { id: "a-bruno", churchId: "a", name: "Bruno", role: "MEMBER", volunteerStatus: "IN_FORMATION" },
      { id: "b-pastor", churchId: "b", name: "Pastor B", role: "PASTOR", volunteerStatus: "ACTIVE" },
      { id: "b-eva", churchId: "b", name: "Eva", role: "VOLUNTEER", volunteerStatus: "ACTIVE" }
    ];
    ministries = [
      { id: "worship-a", churchId: "a", name: "Louvor", status: "ACTIVE", leaderId: "a-leader" },
      { id: "media-a", churchId: "a", name: "Mídia", status: "ACTIVE", leaderId: "a-other" },
      { id: "paused-a", churchId: "a", name: "Pausa", status: "INACTIVE", leaderId: "a-leader" },
      { id: "worship-b", churchId: "b", name: "Louvor B", status: "ACTIVE", leaderId: "b-pastor" }
    ];
    members = [
      { churchId: "a", ministryId: "worship-a", personId: "a-ana" },
      { churchId: "a", ministryId: "worship-a", personId: "a-bruno" },
      { churchId: "b", ministryId: "worship-b", personId: "b-eva" }
    ];
    accounts = [
      { id: "user-a-SUPER_ADMIN", churchId: "a", role: "SUPER_ADMIN", status: "ACTIVE", personId: "a-pastor" },
      { id: "user-a-PASTOR", churchId: "a", role: "PASTOR", status: "ACTIVE", personId: "a-pastor" },
      { id: "user-a-LEADER", churchId: "a", role: "LEADER", status: "ACTIVE", personId: "a-leader" },
      { id: "user-a-OTHER", churchId: "a", role: "LEADER", status: "ACTIVE", personId: "a-other" },
      { id: "user-a-MEMBER", churchId: "a", role: "MEMBER", status: "ACTIVE", personId: "a-bruno" },
      { id: "user-a-VOLUNTEER", churchId: "a", role: "VOLUNTEER", status: "ACTIVE", personId: "a-ana" },
      { id: "user-b-PASTOR", churchId: "b", role: "PASTOR", status: "ACTIVE", personId: "b-pastor" }
    ];
    schedules = [];
    slots = [];
    assignments = [];
    blocks = [];

    const sameDay = (left: Date, right: Date) => left.getTime() === right.getTime();
    const ministryOf = (id: string) => ministries.find((item) => item.id === id);
    const personOf = (id: string) => people.find((item) => item.id === id);
    const slotsOf = (scheduleId: string, assignmentWhere?: { personId?: string; status?: { in: string[] }; churchId?: string }) =>
      slots.filter((slot) => slot.scheduleId === scheduleId).map((slot) => ({
        ...slot,
        assignments: assignments.filter((assignment) => assignment.slotId === slot.id
          && (!assignmentWhere?.churchId || assignment.churchId === assignmentWhere.churchId)
          && (!assignmentWhere?.personId || assignment.personId === assignmentWhere.personId)
          && (!assignmentWhere?.status || assignmentWhere.status.in.includes(assignment.status)))
          .map((assignment) => ({ ...assignment, person: { name: personOf(assignment.personId)?.name } }))
      }));

    const db = {
      church: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, status: "ACTIVE", trialEndsAt: null, blockReason: null })) },
      userAccount: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => {
          const account = accounts.find((item) => item.id === where.id);
          if (!account) return null;
          const person = people.find((item) => item.id === account.personId);
          return { ...account, person: person ? { churchId: person.churchId, campusId: null, campus: null } : null };
        }),
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) => {
          const account = accounts.find((item) => item.id === where.id && item.churchId === where.churchId && item.personId);
          return account ? { personId: account.personId } : null;
        })
      },
      person: {
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) => people.find((person) => person.id === where.id && person.churchId === where.churchId) ?? null)
      },
      ministry: {
        findFirst: jest.fn(async ({ where }: { where: { id?: string; churchId: string; leaderId?: string; OR?: Array<{ leaderId?: string; members?: { some: { personId: string } } }> } }) => {
          return ministries.find((ministry) => ministry.churchId === where.churchId
            && (where.id === undefined || ministry.id === where.id)
            && (where.leaderId === undefined || ministry.leaderId === where.leaderId)
            && (!where.OR || where.OR.some((item) => item.leaderId === ministry.leaderId || members.some((member) => member.ministryId === ministry.id && member.personId === item.members?.some.personId)))) ?? null;
        })
      },
      ministryMember: {
        findFirst: jest.fn(async ({ where }: { where: { churchId: string; ministryId: string; personId: string } }) =>
          members.find((member) => member.churchId === where.churchId && member.ministryId === where.ministryId && member.personId === where.personId) ?? null)
      },
      volunteerSchedule: {
        create: jest.fn(async ({ data }: { data: Schedule }) => {
          writes();
          const schedule = { ...data, id: `schedule-${schedules.length + 1}` };
          schedules.push(schedule);
          return schedule;
        }),
        update: jest.fn(async ({ where, data }: { where: { id: string; churchId: string }; data: Partial<Schedule> }) => {
          writes();
          const schedule = schedules.find((item) => item.id === where.id && item.churchId === where.churchId);
          if (!schedule) throw new Error("missing");
          Object.assign(schedule, data);
          return schedule;
        }),
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) => {
          const schedule = schedules.find((item) => item.id === where.id && item.churchId === where.churchId);
          if (!schedule) return null;
          const ministry = ministryOf(schedule.ministryId);
          return ministry && ministry.churchId === schedule.churchId ? { ...schedule, ministry } : null;
        }),
        findMany: jest.fn(async ({ where, select }: { where: { churchId: string; serviceDate?: Date; slots?: { some: { assignments: { some: { personId: string } } } } }; select?: { slots?: { select?: { assignments?: { where?: { personId?: string; status?: { in: string[] }; churchId?: string } } } } } }) => {
          const assignmentWhere = select?.slots?.select?.assignments?.where;
          return schedules
            .filter((schedule) => schedule.churchId === where.churchId && (!where.serviceDate || sameDay(schedule.serviceDate, where.serviceDate)))
            .filter((schedule) => {
              const personId = where.slots?.some.assignments.some.personId;
              if (!personId) return true;
              return slotsOf(schedule.id).some((slot) => slot.assignments.some((assignment) => assignment.personId === personId));
            })
            .sort((left, right) => right.serviceDate.getTime() - left.serviceDate.getTime() || right.startMinute - left.startMinute)
            .map((schedule) => ({ ...schedule, ministry: ministryOf(schedule.ministryId), slots: slotsOf(schedule.id, assignmentWhere) }));
        })
      },
      volunteerScheduleSlot: {
        create: jest.fn(async ({ data }: { data: Omit<Slot, "id"> }) => {
          writes();
          if (slots.some((slot) => slot.churchId === data.churchId && slot.scheduleId === data.scheduleId && slot.name === data.name)) {
            const error = new Error("unique") as Error & { code: string };
            error.code = "P2002";
            throw error;
          }
          const slot = { ...data, id: `slot-${slots.length + 1}` };
          slots.push(slot);
          return slot;
        }),
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string; scheduleId: string } }) =>
          slots.find((slot) => slot.id === where.id && slot.churchId === where.churchId && slot.scheduleId === where.scheduleId) ?? null)
      },
      volunteerAssignment: {
        findFirst: jest.fn(async ({ where }: { where: { churchId: string; slotId: string; personId: string } }) => {
          const assignment = assignments.find((item) => item.churchId === where.churchId && item.slotId === where.slotId && item.personId === where.personId);
          return assignment ? { ...assignment, person: { name: personOf(assignment.personId)?.name } } : null;
        }),
        findMany: jest.fn(async ({ where }: { where: { churchId: string; status: { in: Assignment["status"][] }; slot: { is: { scheduleId: string } } } }) =>
          assignments.filter((item) => item.churchId === where.churchId && where.status.in.includes(item.status) && slots.some((slot) => slot.id === item.slotId && slot.scheduleId === where.slot.is.scheduleId))),
        create: jest.fn(async ({ data }: { data: Assignment }) => { writes(); assignments.push({ ...data }); return data; }),
        update: jest.fn(async ({ where, data }: { where: { churchId_slotId_personId: { churchId: string; slotId: string; personId: string } }; data: { status: Assignment["status"] } }) => {
          writes();
          const key = where.churchId_slotId_personId;
          const assignment = assignments.find((item) => item.churchId === key.churchId && item.slotId === key.slotId && item.personId === key.personId);
          if (!assignment) throw new Error("missing");
          assignment.status = data.status;
          return assignment;
        }),
        deleteMany: jest.fn(async ({ where }: { where: { churchId: string; slotId: string; personId: string } }) => {
          writes();
          const before = assignments.length;
          assignments = assignments.filter((item) => !(item.churchId === where.churchId && item.slotId === where.slotId && item.personId === where.personId));
          return { count: before - assignments.length };
        })
      },
      volunteerUnavailability: {
        findMany: jest.fn(async ({ where }: { where: { churchId: string; personId: string; serviceDate?: Date } }) =>
          blocks.filter((block) => block.churchId === where.churchId && block.personId === where.personId && (!where.serviceDate || sameDay(block.serviceDate, where.serviceDate)))),
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) => blocks.find((block) => block.id === where.id && block.churchId === where.churchId) ?? null),
        create: jest.fn(async ({ data }: { data: Omit<Block, "id"> }) => {
          writes();
          const block = { ...data, id: `block-${blocks.length + 1}` };
          blocks.push(block);
          return block;
        }),
        delete: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) => {
          writes();
          const block = blocks.find((item) => item.id === where.id && item.churchId === where.churchId);
          blocks = blocks.filter((item) => item !== block);
          return block;
        })
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db)
    };

    app = Fastify();
    await app.register(jwt, { secret: "volunteer-schedule-tests-need-32-characters" });
    await app.register(async (routes) => {
      routes.addHook("preHandler", createAuthPreHandler(db as unknown as PrismaClient));
      await registerVolunteerRoutes(routes, db as unknown as PrismaClient);
    }, { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  function send(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, role: Role | "OTHER" = "PASTOR", churchId = "a", payload?: object) {
    const userId = role === "OTHER" ? "user-a-OTHER" : `user-${churchId}-${role}`;
    const account = accounts.find((item) => item.id === userId)!;
    return app.inject({
      method,
      url: `/api${path}`,
      headers: { authorization: `Bearer ${app.jwt.sign({ userId: account.id, churchId: account.churchId, role: account.role })}` },
      ...(payload === undefined ? {} : { payload })
    });
  }

  const scale = { ministryId: "worship-a", serviceDate: "2026-11-20", startTime: "19:00", endTime: "21:00" };

  async function openScale(role: Role | "OTHER" = "LEADER") {
    const created = await send("POST", "/volunteers/schedules", role, "a", scale);
    expect(created.statusCode).toBe(201);
    const slot = await send("POST", `/volunteers/schedules/${created.json().id}/slots`, role, "a", { name: "Vocal" });
    expect(slot.statusCode).toBe(201);
    return { scheduleId: created.json().id as string, slotId: slot.json().id as string };
  }

  it("rejects anonymous callers and members before creating a schedule", async () => {
    expect((await app.inject({ method: "POST", url: "/api/volunteers/schedules", payload: scale })).statusCode).toBe(401);
    expect((await send("POST", "/volunteers/schedules", "MEMBER", "a", scale)).statusCode).toBe(403);
    expect((await send("POST", "/volunteers/schedules", "VOLUNTEER", "a", scale)).statusCode).toBe(403);
    expect(writes).not.toHaveBeenCalled();
  });

  it("keeps the schedule inside the ministry, the church and the eligible roster", async () => {
    expect((await send("POST", "/volunteers/schedules", "PASTOR", "a", { ...scale, ministryId: "worship-b" })).statusCode).toBe(404);
    expect((await send("POST", "/volunteers/schedules", "OTHER", "a", scale)).statusCode).toBe(403);
    expect((await send("POST", "/volunteers/schedules", "LEADER", "a", { ...scale, ministryId: "paused-a" })).statusCode).toBe(409);
    const opened = await openScale();
    expect((await send("POST", `/volunteers/schedules/${opened.scheduleId}/assignments`, "LEADER", "a", { slotId: opened.slotId, personId: "b-eva" })).statusCode).toBe(404);
    expect((await send("POST", `/volunteers/schedules/${opened.scheduleId}/assignments`, "LEADER", "a", { slotId: opened.slotId, personId: "a-bruno" })).statusCode).toBe(409);
    expect((await send("POST", `/volunteers/schedules/${opened.scheduleId}/assignments`, "OTHER", "a", { slotId: opened.slotId, personId: "a-ana" })).statusCode).toBe(403);
    const assigned = await send("POST", `/volunteers/schedules/${opened.scheduleId}/assignments`, "PASTOR", "a", { slotId: opened.slotId, personId: "a-ana" });
    expect(assigned.statusCode).toBe(201);
    expect(assigned.json()).toMatchObject({ personId: "a-ana", status: "PENDING" });
    const listed = await send("GET", "/volunteers/schedules", "PASTOR", "b");
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toEqual([]);
    const own = await send("GET", "/volunteers/schedules", "VOLUNTEER");
    expect(own.json()[0].slots[0].assignments[0]).toMatchObject({ name: "Ana", canConfirm: true });
    expect(schedules).toHaveLength(1);
    expect(assignments).toHaveLength(1);
  });

  it("blocks overlapping times and unavailable people, and lets a refusal free the hour", async () => {
    const first = await openScale();
    expect((await send("POST", `/volunteers/schedules/${first.scheduleId}/assignments`, "LEADER", "a", { slotId: first.slotId, personId: "a-ana" })).statusCode).toBe(201);
    const second = await send("POST", "/volunteers/schedules", "LEADER", "a", { ...scale, startTime: "20:00", endTime: "22:00" });
    const secondSlot = await send("POST", `/volunteers/schedules/${second.json().id}/slots`, "LEADER", "a", { name: "Teclado" });
    expect((await send("POST", `/volunteers/schedules/${second.json().id}/assignments`, "LEADER", "a", { slotId: secondSlot.json().id, personId: "a-ana" })).statusCode).toBe(409);
    const adjacent = await send("POST", "/volunteers/schedules", "LEADER", "a", { ...scale, startTime: "21:00", endTime: "22:00" });
    const adjacentSlot = await send("POST", `/volunteers/schedules/${adjacent.json().id}/slots`, "LEADER", "a", { name: "Baixo" });
    expect((await send("POST", `/volunteers/schedules/${adjacent.json().id}/assignments`, "LEADER", "a", { slotId: adjacentSlot.json().id, personId: "a-ana" })).statusCode).toBe(201);
    expect((await send("POST", `/volunteers/schedules/${adjacent.json().id}/slots/${adjacentSlot.json().id}/assignments/a-ana/confirmation`, "LEADER", "a", { status: "DECLINED" })).statusCode).toBe(200);

    expect((await send("POST", `/volunteers/schedules/${first.scheduleId}/slots/${first.slotId}/assignments/a-ana/confirmation`, "MEMBER", "a", { status: "CONFIRMED" })).statusCode).toBe(403);
    const refused = await send("POST", `/volunteers/schedules/${first.scheduleId}/slots/${first.slotId}/assignments/a-ana/confirmation`, "VOLUNTEER", "a", { status: "DECLINED" });
    expect(refused.statusCode).toBe(200);
    expect((await send("POST", `/volunteers/schedules/${second.json().id}/assignments`, "LEADER", "a", { slotId: secondSlot.json().id, personId: "a-ana" })).statusCode).toBe(201);

    const blocked = await send("POST", "/volunteers/unavailability", "PASTOR", "a", { personId: "a-ana", serviceDate: "2026-11-21", startTime: "18:00", endTime: "20:00" });
    expect(blocked.statusCode).toBe(201);
    const later = await send("POST", "/volunteers/schedules", "LEADER", "a", { ...scale, serviceDate: "2026-11-21", startTime: "19:00", endTime: "21:00" });
    const laterSlot = await send("POST", `/volunteers/schedules/${later.json().id}/slots`, "LEADER", "a", { name: "Vocal" });
    expect((await send("POST", `/volunteers/schedules/${later.json().id}/assignments`, "LEADER", "a", { slotId: laterSlot.json().id, personId: "a-ana" })).statusCode).toBe(409);
    expect((await send("POST", "/volunteers/unavailability", "OTHER", "a", { personId: "a-ana", serviceDate: "2026-11-22", startTime: "10:00", endTime: "11:00" })).statusCode).toBe(403);
    const held = await send("POST", "/volunteers/schedules", "LEADER", "a", { ...scale, startTime: "22:00", endTime: "23:00" });
    const heldSlot = await send("POST", `/volunteers/schedules/${held.json().id}/slots`, "LEADER", "a", { name: "Guitarra" });
    expect((await send("POST", `/volunteers/schedules/${held.json().id}/assignments`, "LEADER", "a", { slotId: heldSlot.json().id, personId: "a-ana" })).statusCode).toBe(201);
    expect((await send("PATCH", `/volunteers/schedules/${second.json().id}`, "LEADER", "a", { serviceDate: "2026-11-20", startTime: "22:30", endTime: "23:30" })).statusCode).toBe(409);
    expect(schedules.find((item) => item.id === second.json().id)?.startMinute).toBe(20 * 60);
  });
});
