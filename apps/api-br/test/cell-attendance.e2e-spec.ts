import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, type Role } from "@sistema-igrejas/auth";
import { registerCellAttendanceRoutes, registerCellRoutes, todayInBrazil } from "@sistema-igrejas/members";

type Person = { id: string; churchId: string; name: string; celulaId: string | null };
type Cell = { id: string; churchId: string; leaderId: string; status: "ACTIVE" | "ARCHIVED"; name: string };
type Account = { id: string; churchId: string; role: Role; status: "ACTIVE"; personId: string | null };
type Meeting = { id: string; churchId: string; cellId: string; occurredOn: Date; recordedBy: string };
type Mark = { churchId: string; meetingId: string; personId: string; status: "PRESENT" | "ABSENT" };

describe("Cell attendance tenant, RBAC and roster regression", () => {
  let app: FastifyInstance;
  let people: Person[];
  let cells: Cell[];
  let accounts: Account[];
  let meetings: Meeting[];
  let marks: Mark[];
  let memberships: Array<{ id: string; personId: string; groupId: string }>;
  let writes: jest.Mock;
  let cellReads: jest.Mock;
  let listArgs: { include?: Record<string, unknown> } | undefined;

  function shiftDate(days: number): string {
    const [year, month, day] = todayInBrazil().split("-").map(Number);
    const date = new Date(Date.UTC(year!, month! - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  }

  beforeEach(async () => {
    writes = jest.fn();
    cellReads = jest.fn();
    listArgs = undefined;
    people = [
      { id: "a-pastor", churchId: "a", name: "Pastor A", celulaId: null },
      { id: "a-leader", churchId: "a", name: "Líder A", celulaId: null },
      { id: "a-other-leader", churchId: "a", name: "Outro líder", celulaId: null },
      { id: "a-ana", churchId: "a", name: "Ana", celulaId: "cell-a" },
      { id: "a-bruno", churchId: "a", name: "Bruno", celulaId: "cell-a" },
      { id: "a-carla", churchId: "a", name: "Carla", celulaId: "cell-a2" },
      { id: "a-archived-member", churchId: "a", name: "Davi", celulaId: "cell-archived" },
      { id: "b-pastor", churchId: "b", name: "Pastor B", celulaId: null },
      { id: "b-member", churchId: "b", name: "Eva", celulaId: "cell-b" }
    ];
    cells = [
      { id: "cell-a", churchId: "a", leaderId: "a-leader", status: "ACTIVE", name: "Célula A" },
      { id: "cell-a2", churchId: "a", leaderId: "a-other-leader", status: "ACTIVE", name: "Célula A2" },
      { id: "cell-empty", churchId: "a", leaderId: "a-leader", status: "ACTIVE", name: "Vazia" },
      { id: "cell-archived", churchId: "a", leaderId: "a-leader", status: "ARCHIVED", name: "Arquivada" },
      { id: "cell-b", churchId: "b", leaderId: "b-pastor", status: "ACTIVE", name: "Célula B" }
    ];
    accounts = [
      { id: "user-a-SUPER_ADMIN", churchId: "a", role: "SUPER_ADMIN", status: "ACTIVE", personId: "a-pastor" },
      { id: "user-a-PASTOR", churchId: "a", role: "PASTOR", status: "ACTIVE", personId: "a-pastor" },
      { id: "user-a-LEADER", churchId: "a", role: "LEADER", status: "ACTIVE", personId: "a-leader" },
      { id: "user-a-OTHER", churchId: "a", role: "LEADER", status: "ACTIVE", personId: "a-other-leader" },
      { id: "user-a-MEMBER", churchId: "a", role: "MEMBER", status: "ACTIVE", personId: "a-ana" },
      { id: "user-a-VOLUNTEER", churchId: "a", role: "VOLUNTEER", status: "ACTIVE", personId: "a-bruno" },
      { id: "user-a-ORPHAN", churchId: "a", role: "SUPER_ADMIN", status: "ACTIVE", personId: null },
      { id: "user-b-PASTOR", churchId: "b", role: "PASTOR", status: "ACTIVE", personId: "b-pastor" }
    ];
    meetings = [];
    marks = [];
    memberships = [
      { id: "mem-ana", personId: "a-ana", groupId: "cell-a" },
      { id: "mem-bruno", personId: "a-bruno", groupId: "cell-a" }
    ];

    const sameDay = (left: Date, right: Date) => left.getTime() === right.getTime();
    const db = {
      church: {
        findUnique: jest.fn(async ({ where }: { where: { id: string } }) => ({ id: where.id, status: "ACTIVE", trialEndsAt: null, blockReason: null }))
      },
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
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) =>
          people.find((person) => person.id === where.id && person.churchId === where.churchId) ?? null),
        findMany: jest.fn(async ({ where }: { where: { churchId: string; celulaId: string } }) =>
          people
            .filter((person) => person.churchId === where.churchId && person.celulaId === where.celulaId)
            .sort((left, right) => left.name.localeCompare(right.name, "pt-BR"))
            .map((person) => ({ id: person.id, name: person.name }))),
        update: jest.fn(async () => { throw new Error("PERSON_MUTATED"); })
      },
      membership: {
        update: jest.fn(async () => { throw new Error("MEMBERSHIP_MUTATED"); }),
        create: jest.fn(async () => { throw new Error("MEMBERSHIP_MUTATED"); })
      },
      celula: {
        findFirst: jest.fn(async ({ where }: { where: { id: string; churchId: string } }) => {
          cellReads();
          const cell = cells.find((item) => item.id === where.id && item.churchId === where.churchId);
          if (!cell) return null;
          const leader = people.find((person) => person.id === cell.leaderId && person.churchId === where.churchId);
          return leader ? { id: cell.id, status: cell.status, leaderId: cell.leaderId } : null;
        }),
        findMany: jest.fn(async (args: { where: { churchId: string; status: string }; include?: Record<string, unknown> }) => {
          listArgs = args;
          return cells
            .filter((cell) => cell.churchId === args.where.churchId && cell.status === args.where.status)
            .map((cell) => ({
              ...cell,
              leader: people.find((person) => person.id === cell.leaderId),
              people: people.filter((person) => person.celulaId === cell.id)
            }));
        })
      },
      cellMeeting: {
        upsert: jest.fn(async ({ where, create, update }: { where: { churchId_cellId_occurredOn: { churchId: string; cellId: string; occurredOn: Date } }; create: Meeting; update: { recordedBy: string } }) => {
          writes();
          const key = where.churchId_cellId_occurredOn;
          const existing = meetings.find((meeting) => meeting.churchId === key.churchId && meeting.cellId === key.cellId && sameDay(meeting.occurredOn, key.occurredOn));
          if (existing) {
            existing.recordedBy = update.recordedBy;
            return existing;
          }
          const meeting = { id: `meeting-${meetings.length + 1}`, churchId: create.churchId, cellId: create.cellId, occurredOn: create.occurredOn, recordedBy: create.recordedBy };
          meetings.push(meeting);
          return meeting;
        }),
        findMany: jest.fn(async ({ where, take }: { where: { churchId: string; cellId: string }; take: number }) =>
          meetings
            .filter((meeting) => meeting.churchId === where.churchId && meeting.cellId === where.cellId)
            .sort((left, right) => right.occurredOn.getTime() - left.occurredOn.getTime())
            .slice(0, take)
            .map((meeting) => ({
              ...meeting,
              marks: marks
                .filter((mark) => mark.meetingId === meeting.id && mark.churchId === meeting.churchId)
                .map((mark) => ({
                  personId: mark.personId,
                  status: mark.status,
                  person: { name: people.find((person) => person.id === mark.personId)?.name }
                }))
            })))
      },
      cellAttendance: {
        deleteMany: jest.fn(async ({ where }: { where: { churchId: string; meetingId: string } }) => {
          writes();
          const before = marks.length;
          marks = marks.filter((mark) => !(mark.churchId === where.churchId && mark.meetingId === where.meetingId));
          return { count: before - marks.length };
        }),
        createMany: jest.fn(async ({ data }: { data: Mark[] }) => {
          writes();
          marks.push(...data);
          return { count: data.length };
        })
      },
      $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback(db)
    };

    app = Fastify();
    await app.register(jwt, { secret: "cell-attendance-tests-need-at-least-32-chars" });
    await app.register(async (routes) => {
      routes.addHook("preHandler", createAuthPreHandler(db as unknown as PrismaClient));
      await registerCellRoutes(routes, db as unknown as PrismaClient);
      await registerCellAttendanceRoutes(routes, db as unknown as PrismaClient);
    }, { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => { await app.close(); });

  function send(method: "GET" | "POST", suffix: string, role: Role | "OTHER" | "ORPHAN" = "PASTOR", churchId = "a", payload?: object, query = "") {
    const userId = role === "OTHER" ? "user-a-OTHER" : role === "ORPHAN" ? "user-a-ORPHAN" : `user-${churchId}-${role}`;
    const account = accounts.find((item) => item.id === userId)!;
    return app.inject({
      method,
      url: `/api/cells${suffix}${query}`,
      headers: { authorization: `Bearer ${app.jwt.sign({ userId: account.id, churchId: account.churchId, role: account.role })}` },
      ...(payload === undefined ? {} : { payload })
    });
  }

  const roster = (date: string, statuses: Array<"PRESENT" | "ABSENT"> = ["PRESENT", "ABSENT"]) => ({
    occurredOn: date,
    marks: [
      { personId: "a-bruno", status: statuses[1] },
      { personId: "a-ana", status: statuses[0] }
    ]
  });

  it("rejects anonymous and non-supervisors before reading the cell", async () => {
    expect((await app.inject({ method: "POST", url: "/api/cells/cell-a/meetings", payload: roster(shiftDate(-1)) })).statusCode).toBe(401);
    for (const role of ["MEMBER", "VOLUNTEER"] as const) {
      expect((await send("GET", "/cell-a/meetings", role)).statusCode).toBe(403);
      expect((await send("POST", "/cell-a/meetings", role, "a", roster(shiftDate(-1)))).statusCode).toBe(403);
    }
    expect(cellReads).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(meetings).toHaveLength(0);
  });

  it("lets the cell leader, pastor and super admin record and replace the same day", async () => {
    const date = shiftDate(-2);
    for (const role of ["LEADER", "PASTOR", "SUPER_ADMIN"] as const) {
      const response = await send("POST", "/cell-a/meetings", role, "a", roster(date, role === "LEADER" ? ["PRESENT", "PRESENT"] : ["ABSENT", "PRESENT"]));
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        cellId: "cell-a",
        occurredOn: date,
        presentCount: role === "LEADER" ? 2 : 1,
        absentCount: role === "LEADER" ? 0 : 1,
        marks: [
          { personId: "a-ana", name: "Ana", status: role === "LEADER" ? "PRESENT" : "ABSENT" },
          { personId: "a-bruno", name: "Bruno", status: "PRESENT" }
        ]
      });
    }
    expect(meetings).toHaveLength(1);
    expect(marks.map((mark) => mark.status)).toEqual(["PRESENT", "ABSENT"]);
    expect(people.find((person) => person.id === "a-ana")?.celulaId).toBe("cell-a");
    expect(memberships).toEqual([
      { id: "mem-ana", personId: "a-ana", groupId: "cell-a" },
      { id: "mem-bruno", personId: "a-bruno", groupId: "cell-a" }
    ]);

    const listed = await send("GET", "/cell-a/meetings", "LEADER");
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0].marks.map((mark: { name: string }) => mark.name)).toEqual(["Ana", "Bruno"]);
  });

  it("keeps another leader, another church and a bad roster from writing", async () => {
    const date = shiftDate(-1);
    expect((await send("POST", "/cell-a/meetings", "OTHER", "a", roster(date))).statusCode).toBe(403);
    expect((await send("GET", "/cell-a/meetings", "OTHER")).statusCode).toBe(403);
    expect((await send("POST", "/cell-b/meetings", "PASTOR", "a", { occurredOn: date, marks: [{ personId: "b-member", status: "PRESENT" }] })).statusCode).toBe(404);
    expect((await send("GET", "/cell-b/meetings", "PASTOR", "a")).statusCode).toBe(404);
    expect((await send("POST", "/cell-b/meetings", "PASTOR", "b", { occurredOn: date, marks: [{ personId: "a-ana", status: "PRESENT" }] })).statusCode).toBe(409);
    expect((await send("POST", "/cell-a/meetings", "LEADER", "a", { occurredOn: date, marks: [{ personId: "a-ana", status: "PRESENT" }] })).statusCode).toBe(409);
    expect((await send("POST", "/cell-a/meetings", "LEADER", "a", { occurredOn: date, marks: [{ personId: "a-ana", status: "PRESENT" }, { personId: "a-ana", status: "ABSENT" }] })).statusCode).toBe(409);
    expect((await send("POST", "/cell-a/meetings", "LEADER", "a", { occurredOn: date, marks: [{ personId: "a-ana", status: "PRESENT" }, { personId: "a-carla", status: "ABSENT" }] })).statusCode).toBe(409);
    expect((await send("POST", "/cell-empty/meetings", "LEADER", "a", roster(date))).statusCode).toBe(409);
    expect((await send("POST", "/cell-archived/meetings", "LEADER", "a", { occurredOn: date, marks: [{ personId: "a-archived-member", status: "PRESENT" }] })).statusCode).toBe(409);
    expect((await send("POST", "/cell-a/meetings", "LEADER", "a", { ...roster(shiftDate(3)), churchId: "b" })).statusCode).toBe(400);
    expect((await send("POST", "/cell-a/meetings", "LEADER", "a", roster(shiftDate(3)))).statusCode).toBe(400);
    expect((await send("POST", "/cell-a/meetings", "LEADER", "a", roster("2026-02-31"))).statusCode).toBe(400);
    expect((await send("POST", "/cell-a/meetings", "ORPHAN", "a", roster(date))).statusCode).toBe(404);
    expect(meetings).toHaveLength(0);
    expect(marks).toHaveLength(0);
  });

  it("returns the newest meetings up to the requested limit and preserves the cell list", async () => {
    expect((await send("POST", "/cell-a/meetings", "PASTOR", "a", roster(shiftDate(-5)))).statusCode).toBe(200);
    expect((await send("POST", "/cell-a/meetings", "PASTOR", "a", roster(shiftDate(-1), ["ABSENT", "ABSENT"]))).statusCode).toBe(200);
    const listed = await send("GET", "/cell-a/meetings?limit=1", "PASTOR");
    expect(listed.statusCode).toBe(200);
    expect(listed.json()).toHaveLength(1);
    expect(listed.json()[0]).toMatchObject({ occurredOn: shiftDate(-1), presentCount: 0, absentCount: 2 });

    const cellsResponse = await send("GET", "", "PASTOR");
    expect(cellsResponse.statusCode).toBe(200);
    expect(listArgs?.include).not.toHaveProperty("meetings");
    expect(cellsResponse.json().every((cell: { meetings?: unknown }) => cell.meetings === undefined)).toBe(true);
    expect(cellsResponse.json().map((cell: { id: string }) => cell.id)).toEqual(expect.arrayContaining(["cell-a", "cell-a2", "cell-empty"]));
    expect(cellsResponse.json().map((cell: { id: string }) => cell.id)).not.toContain("cell-b");
  });
});
