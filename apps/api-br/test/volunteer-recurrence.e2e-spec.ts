import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, type Role } from "@sistema-igrejas/auth";
import { registerVolunteerRoutes } from "@sistema-igrejas/volunteers";

type Person = { id: string; churchId: string; name: string; role: string; volunteerStatus: string };
type Ministry = { id: string; churchId: string; name: string; status: "ACTIVE" | "INACTIVE"; leaderId: string };
type Account = { id: string; churchId: string; role: Role; status: "ACTIVE"; personId: string | null };
type Schedule = { id: string; churchId: string; ministryId: string; seriesId?: string | null; serviceDate: Date; startMinute: number; endMinute: number };
type Slot = { id: string; churchId: string; scheduleId: string; name: string };
type Assignment = { churchId: string; slotId: string; personId: string; status: "PENDING" | "CONFIRMED" | "DECLINED" | "REPLACED" };
type Series = { id: string; churchId: string; ministryId: string; occurrenceCount: number; anchorDate: Date };
type Substitution = { id: string; churchId: string; slotId: string; fromPersonId: string; toPersonId: string; actorPersonId: string; createdAt: Date };
type Block = { id: string; churchId: string; personId: string; serviceDate: Date; startMinute: number; endMinute: number };

describe("Volunteer recurrence and substitution", () => {
  let app: FastifyInstance;
  let people: Person[];
  let ministries: Ministry[];
  let members: Array<{ churchId: string; ministryId: string; personId: string }>;
  let accounts: Account[];
  let schedules: Schedule[];
  let slots: Slot[];
  let assignments: Assignment[];
  let series: Series[];
  let substitutions: Substitution[];
  let blocks: Block[];
  let writes: jest.Mock;

  beforeEach(async () => {
    writes = jest.fn();
    people = [
      { id: "a-pastor", churchId: "a", name: "Pastor A", role: "PASTOR", volunteerStatus: "ACTIVE" },
      { id: "a-leader", churchId: "a", name: "Líder A", role: "LEADER", volunteerStatus: "ACTIVE" },
      { id: "a-other", churchId: "a", name: "Outro líder", role: "LEADER", volunteerStatus: "ACTIVE" },
      { id: "a-ana", churchId: "a", name: "Ana", role: "VOLUNTEER", volunteerStatus: "ACTIVE" },
      { id: "a-carla", churchId: "a", name: "Carla", role: "VOLUNTEER", volunteerStatus: "ELIGIBLE" },
      { id: "a-bruno", churchId: "a", name: "Bruno", role: "MEMBER", volunteerStatus: "IN_FORMATION" },
      { id: "b-pastor", churchId: "b", name: "Pastor B", role: "PASTOR", volunteerStatus: "ACTIVE" },
      { id: "b-eva", churchId: "b", name: "Eva", role: "VOLUNTEER", volunteerStatus: "ACTIVE" }
    ];
    ministries = [
      { id: "worship-a", churchId: "a", name: "Louvor", status: "ACTIVE", leaderId: "a-leader" },
      { id: "media-a", churchId: "a", name: "Mídia", status: "ACTIVE", leaderId: "a-other" },
      { id: "worship-b", churchId: "b", name: "Louvor B", status: "ACTIVE", leaderId: "b-pastor" }
    ];
    members = [
      { churchId: "a", ministryId: "worship-a", personId: "a-ana" },
      { churchId: "a", ministryId: "worship-a", personId: "a-carla" },
      { churchId: "a", ministryId: "worship-a", personId: "a-bruno" },
      { churchId: "b", ministryId: "worship-b", personId: "b-eva" }
    ];
    accounts = [
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
    series = [];
    substitutions = [];
    blocks = [];

    const sameDay = (left: Date, right: Date) => left.getTime() === right.getTime();
    const personOf = (id: string) => people.find((item) => item.id === id);
    const ministryOf = (id: string) => ministries.find((item) => item.id === id);
    const slotsOf = (scheduleId: string, assignmentWhere?: { personId?: string; status?: { in: string[] }; churchId?: string }) =>
      slots.filter((slot) => slot.scheduleId === scheduleId).map((slot) => ({
        ...slot,
        assignments: assignments.filter((assignment) => assignment.slotId === slot.id
          && (!assignmentWhere?.churchId || assignment.churchId === assignmentWhere.churchId)
          && (!assignmentWhere?.personId || assignment.personId === assignmentWhere.personId)
          && (!assignmentWhere?.status || assignmentWhere.status.in.includes(assignment.status)))
          .map((assignment) => ({ ...assignment, person: { name: personOf(assignment.personId)?.name } })),
        substitutions: substitutions.filter((item) => item.slotId === slot.id).map((item) => ({
          ...item,
          fromPerson: { name: personOf(item.fromPersonId)?.name },
          toPerson: { name: personOf(item.toPersonId)?.name }
        }))
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
      volunteerScheduleSeries: {
        create: jest.fn(async ({ data }: { data: Omit<Series, "id"> }) => {
          writes();
          const created = { ...data, id: `series-${series.length + 1}` };
          series.push(created);
          return created;
        })
      },
      volunteerSchedule: {
        create: jest.fn(async ({ data }: { data: Omit<Schedule, "id"> }) => {
          writes();
          const schedule = { ...data, id: `schedule-${schedules.length + 1}` };
          schedules.push(schedule);
          return schedule;
        }),
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) => {
          const schedule = schedules.find((item) => item.id === where.id && item.churchId === where.churchId);
          if (!schedule) return null;
          const ministry = ministryOf(schedule.ministryId);
          return ministry && ministry.churchId === schedule.churchId ? { ...schedule, ministry } : null;
        }),
        findMany: jest.fn(async ({ where, select }: { where: { churchId: string; serviceDate?: Date; slots?: { some: { assignments: { some: { personId: string } } } } }; select?: { slots?: { select?: { assignments?: { where?: { personId?: string; status?: { in: Assignment["status"][] }; churchId?: string } } } } } }) => {
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
        findMany: jest.fn(async () => []),
        create: jest.fn(async ({ data }: { data: Assignment }) => { writes(); assignments.push({ ...data }); return data; }),
        update: jest.fn(async ({ where, data }: { where: { churchId_slotId_personId: { churchId: string; slotId: string; personId: string } }; data: { status: Assignment["status"] } }) => {
          writes();
          const key = where.churchId_slotId_personId;
          const assignment = assignments.find((item) => item.churchId === key.churchId && item.slotId === key.slotId && item.personId === key.personId);
          if (!assignment) throw new Error("missing");
          assignment.status = data.status;
          return assignment;
        })
      },
      volunteerSubstitution: {
        create: jest.fn(async ({ data }: { data: Omit<Substitution, "id" | "createdAt"> }) => {
          writes();
          const created = { ...data, id: `substitution-${substitutions.length + 1}`, createdAt: new Date("2026-11-14T12:00:00.000Z") };
          substitutions.push(created);
          return created;
        })
      },
      volunteerUnavailability: {
        findMany: jest.fn(async ({ where }: { where: { churchId: string; personId: string; serviceDate?: Date } }) =>
          blocks.filter((block) => block.churchId === where.churchId && block.personId === where.personId && (!where.serviceDate || sameDay(block.serviceDate, where.serviceDate)))),
        create: jest.fn(async ({ data }: { data: Omit<Block, "id"> }) => {
          writes();
          const block = { ...data, id: `block-${blocks.length + 1}` };
          blocks.push(block);
          return block;
        })
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
        const saved = {
          schedules: schedules.map((item) => ({ ...item })),
          slots: slots.map((item) => ({ ...item })),
          assignments: assignments.map((item) => ({ ...item })),
          series: series.map((item) => ({ ...item })),
          substitutions: substitutions.map((item) => ({ ...item })),
          blocks: blocks.map((item) => ({ ...item }))
        };
        try {
          return await callback(db);
        } catch (error) {
          schedules = saved.schedules;
          slots = saved.slots;
          assignments = saved.assignments;
          series = saved.series;
          substitutions = saved.substitutions;
          blocks = saved.blocks;
          throw error;
        }
      }
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

  const recurrence = {
    ministryId: "worship-a",
    serviceDate: "2026-11-20",
    startTime: "19:00",
    endTime: "21:00",
    weeks: 3,
    slotName: "Vocal",
    personId: "a-ana"
  };

  it("rejects recurrence outside the ministry, the church and the week limit", async () => {
    expect((await send("POST", "/volunteers/schedules/recurrence", "MEMBER", "a", recurrence)).statusCode).toBe(403);
    expect((await send("POST", "/volunteers/schedules/recurrence", "OTHER", "a", recurrence)).statusCode).toBe(403);
    expect((await send("POST", "/volunteers/schedules/recurrence", "PASTOR", "a", { ...recurrence, ministryId: "worship-b" })).statusCode).toBe(404);
    expect((await send("POST", "/volunteers/schedules/recurrence", "LEADER", "a", { ...recurrence, personId: "b-eva" })).statusCode).toBe(404);
    expect((await send("POST", "/volunteers/schedules/recurrence", "LEADER", "a", { ...recurrence, personId: "a-bruno" })).statusCode).toBe(409);
    expect((await send("POST", "/volunteers/schedules/recurrence", "LEADER", "a", { ...recurrence, weeks: 1 })).statusCode).toBe(400);
    expect((await send("POST", "/volunteers/schedules/recurrence", "LEADER", "a", { ...recurrence, weeks: 13 })).statusCode).toBe(400);
    expect(series).toHaveLength(0);
    expect(schedules).toHaveLength(0);
  });

  it("creates one weekly occurrence per date and keeps a conflict from writing any of them", async () => {
    const created = await send("POST", "/volunteers/schedules/recurrence", "LEADER", "a", recurrence);
    expect(created.statusCode).toBe(201);
    expect(created.json().weeks).toBe(3);
    expect(created.json().schedules.map((item: { serviceDate: string }) => item.serviceDate)).toEqual(["2026-11-20", "2026-11-27", "2026-12-04"]);
    expect(new Set(schedules.map((item) => item.seriesId))).toEqual(new Set([series[0]?.id]));
    expect(assignments.every((item) => item.status === "PENDING" && item.personId === "a-ana")).toBe(true);
    const hidden = await send("GET", "/volunteers/schedules", "PASTOR", "b");
    expect(hidden.json()).toEqual([]);
    const own = await send("GET", "/volunteers/schedules", "VOLUNTEER");
    expect(own.json()).toHaveLength(3);
    expect(own.json()[0].slots[0].assignments[0]).toMatchObject({ name: "Ana", canConfirm: true, canSubstitute: false });

    const blocked = await send("POST", "/volunteers/unavailability", "PASTOR", "a", { personId: "a-ana", serviceDate: "2026-12-11", startTime: "18:00", endTime: "20:00" });
    expect(blocked.statusCode).toBe(201);
    const before = schedules.length;
    const conflict = await send("POST", "/volunteers/schedules/recurrence", "LEADER", "a", { ...recurrence, serviceDate: "2026-11-27", startTime: "20:00", endTime: "22:00" });
    expect(conflict.statusCode).toBe(409);
    expect(schedules).toHaveLength(before);
    expect(series).toHaveLength(1);
    const unavailable = await send("POST", "/volunteers/schedules/recurrence", "PASTOR", "a", { ...recurrence, serviceDate: "2026-12-11" });
    expect(unavailable.statusCode).toBe(409);
    expect(series).toHaveLength(1);
  });

  it("replaces only an open assignment and keeps the previous person in the history", async () => {
    const created = await send("POST", "/volunteers/schedules/recurrence", "LEADER", "a", { ...recurrence, weeks: 2 });
    const first = created.json().schedules[0];
    const held = await send("POST", "/volunteers/schedules", "LEADER", "a", { ministryId: "worship-a", serviceDate: "2026-11-20", startTime: "18:00", endTime: "20:00" });
    const heldSlot = await send("POST", `/volunteers/schedules/${held.json().id}/slots`, "LEADER", "a", { name: "Teclado" });
    expect((await send("POST", `/volunteers/schedules/${held.json().id}/assignments`, "LEADER", "a", { slotId: heldSlot.json().id, personId: "a-carla" })).statusCode).toBe(201);
    const path = `/volunteers/schedules/${first.id}/slots/${first.slots[0].id}/assignments/a-ana/substitution`;
    expect((await send("POST", path, "MEMBER", "a", { personId: "a-carla" })).statusCode).toBe(403);
    expect((await send("POST", path, "OTHER", "a", { personId: "a-carla" })).statusCode).toBe(403);
    expect((await send("POST", path, "PASTOR", "b", { personId: "b-eva" })).statusCode).toBe(404);
    expect((await send("POST", path, "LEADER", "a", { personId: "a-ana" })).statusCode).toBe(409);
    expect((await send("POST", path, "LEADER", "a", { personId: "a-carla" })).statusCode).toBe(409);
    expect(assignments.find((item) => item.personId === "a-ana")?.status).toBe("PENDING");
    expect(substitutions).toHaveLength(0);
    expect((await send("POST", `/volunteers/schedules/${held.json().id}/slots/${heldSlot.json().id}/assignments/a-carla/confirmation`, "LEADER", "a", { status: "DECLINED" })).statusCode).toBe(200);
    const replaced = await send("POST", path, "LEADER", "a", { personId: "a-carla" });
    expect(replaced.statusCode).toBe(201);
    expect(replaced.json()).toMatchObject({ fromPersonId: "a-ana", toPersonId: "a-carla", status: "PENDING" });
    expect(assignments.find((item) => item.personId === "a-ana" && item.slotId === first.slots[0].id)?.status).toBe("REPLACED");
    expect(assignments.find((item) => item.personId === "a-carla" && item.slotId === first.slots[0].id)?.status).toBe("PENDING");
    expect((await send("POST", `/volunteers/schedules/${first.id}/slots/${first.slots[0].id}/assignments/a-ana/confirmation`, "PASTOR", "a", { status: "CONFIRMED" })).statusCode).toBe(409);
    const listed = await send("GET", "/volunteers/schedules", "PASTOR");
    const row = listed.json().find((item: { id: string }) => item.id === first.id);
    expect(row.slots[0].substitutions).toEqual([expect.objectContaining({ fromName: "Ana", toName: "Carla" })]);
    expect(row.slots[0].assignments.find((item: { personId: string }) => item.personId === "a-carla")).toMatchObject({ canSubstitute: true, canConfirm: true });
    expect((await send("POST", `/volunteers/schedules/${first.id}/slots/${first.slots[0].id}/assignments/a-carla/confirmation`, "LEADER", "a", { status: "DECLINED" })).statusCode).toBe(200);
    expect((await send("POST", `/volunteers/schedules/${first.id}/slots/${first.slots[0].id}/assignments/a-carla/substitution`, "LEADER", "a", { personId: "a-ana" })).statusCode).toBe(409);
    expect(substitutions).toHaveLength(1);
  });
});
