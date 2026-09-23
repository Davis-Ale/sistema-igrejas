import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, requireRole, signToken } from "@sistema-igrejas/auth";
import {
  registerMemberRoutes, registerVisitorRoutes, registerCellRoutes,
  registerCellDeleteRoutes, registerCellStatusRoutes, addPersonToCell
} from "@sistema-igrejas/members";
import { registerTrailRoutes, completeTrailStage } from "@sistema-igrejas/trail";
import { registerVolunteerRoutes } from "@sistema-igrejas/volunteers";
import { registerEventRoutes } from "@sistema-igrejas/events";

type Row = Record<string, any>;
type HTTPMethods = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

// Real routes and JWT authentication. The persistence double evaluates tenant
// predicates and relation filters against two independent sets of records.
describe("General tenant isolation", () => {
  let app: FastifyInstance;
  let db: PrismaClient;
  let records: Record<string, Row[]>;
  let writes: jest.Mock;
  let headers: Record<string, { authorization: string }>;

  const cellInput = { name: "Group", leaderId: "actor-a", campusId: "campus-a", region: "Centro", meetDay: "Monday", meetTime: "19:00", profile: "Adults" };
  const eventInput = { title: "Event", slug: "event-new", date: "2027-01-10T10:00:00Z", capacity: 20, campusId: "campus-a", trailStageId: "stage-a" };

  beforeEach(async () => {
    records = Object.fromEntries([
      "church", "userAccount", "campus", "person", "visitor", "celula", "membership", "trail", "trailStage",
      "trailProgress", "volunteerLog", "event", "registration", "eventPayment", "eventOrder", "transaction",
      "eventsFinancialOperation", "eventFormAnswer", "eventFormFieldTicket", "eventFormFieldOption", "eventFormField",
      "eventDiscount", "ticketBatch", "eventTicket"
    ].map(model => [model, []]));
    for (const churchId of ["a", "b"]) {
      records.church!.push({ id: churchId, status: "ACTIVE", name: churchId, slug: churchId });
      records.campus!.push({ id: `campus-${churchId}`, churchId });
      records.userAccount!.push({ id: `account-${churchId}`, personId: `actor-${churchId}`, churchId, role: "SUPER_ADMIN", status: "ACTIVE" });
      for (const [name, role] of [["actor", "PASTOR"], ["member", "MEMBER"], ["volunteer", "VOLUNTEER"], ["visitor", "VISITOR"]]) {
        records.person!.push({ id: `${name}-${churchId}`, churchId, name: `${name} ${churchId}`, role, phone: "123456789", campusId: `campus-${churchId}`, celulaId: null, trailStageId: null });
      }
      records.celula!.push({ id: `cell-${churchId}`, churchId, ...cellInput, leaderId: `actor-${churchId}`, campusId: `campus-${churchId}`, status: "ACTIVE" });
      records.trail!.push({ id: `trail-${churchId}`, churchId, name: `Trail ${churchId}`, isVolunteerGate: true });
      records.trailStage!.push({ id: `stage-${churchId}`, churchId, trailId: `trail-${churchId}`, label: `Stage ${churchId}`, order: 0, requiresEventId: null });
      records.event!.push({ id: `event-${churchId}`, churchId, ...eventInput, slug: `event-${churchId}`, campusId: `campus-${churchId}`, trailStageId: `stage-${churchId}`, deletedAt: null, isPaid: false, isPublic: false, waitlistEnabled: true, publicRegistrationEnabled: false });
      records.eventPayment!.push({ id: `payment-${churchId}`, churchId, eventId: `event-${churchId}` });
    }

    const relations: Record<string, Record<string, [string, string, string]>> = {
      userAccount: { person: ["person", "personId", "id"] },
      person: { campus: ["campus", "campusId", "id"], celula: ["celula", "celulaId", "id"], trailStage: ["trailStage", "trailStageId", "id"] },
      celula: { leader: ["person", "leaderId", "id"], people: ["person", "id", "celulaId"], memberships: ["membership", "id", "groupId"] },
      membership: { person: ["person", "personId", "id"], celula: ["celula", "groupId", "id"], approver: ["person", "approvedBy", "id"] },
      trail: { stages: ["trailStage", "id", "trailId"] },
      trailStage: { trail: ["trail", "trailId", "id"] },
      trailProgress: { person: ["person", "personId", "id"], stage: ["trailStage", "stageId", "id"], approver: ["person", "approvedBy", "id"] },
      volunteerLog: { person: ["person", "personId", "id"], changer: ["person", "changedBy", "id"] },
      event: { church: ["church", "churchId", "id"], trailStage: ["trailStage", "trailStageId", "id"], registrations: ["registration", "id", "eventId"] }
    };
    const linked = (model: string, row: Row, key: string) => {
      const [target, local, foreign] = relations[model]![key]!;
      return { target, many: foreign !== "id", rows: records[target]!.filter(other => row[local] != null && other[foreign] === row[local]) };
    };
    function matches(model: string, row: Row, where: Row = {}): boolean {
      return Object.entries(where).every(([key, value]) => {
        if (value === undefined) return true;
        if (key === "AND") return (Array.isArray(value) ? value : [value]).every(part => matches(model, row, part));
        if (key === "OR") return value.some((part: Row) => matches(model, row, part));
        if (key === "personId_stageId") return matches(model, row, value);
        if (relations[model]?.[key]) {
          const relation = linked(model, row, key);
          const predicate = value.is ?? value;
          return relation.rows.some(other => matches(relation.target, other, predicate));
        }
        if (value && typeof value === "object") {
          if ("not" in value) return row[key] !== value.not;
          if ("in" in value) return value.in.includes(row[key]);
        }
        return row[key] === value;
      });
    }
    function project(model: string, row: Row, args: Row): Row {
      const result: Row = args.select ? {} : { ...row };
      for (const [key, settings] of Object.entries(args.select ?? args.include ?? {})) {
        if (!settings) continue;
        if (key === "_count") {
          result[key] = Object.fromEntries(Object.entries((settings as Row).select).map(([relation, options]) => {
            const data = linked(model, row, relation);
            return [relation, data.rows.filter(other => matches(data.target, other, (options as Row).where)).length];
          }));
        } else if (relations[model]?.[key]) {
          const data = linked(model, row, key);
          const options = settings === true ? {} : settings as Row;
          const selected = data.rows.filter(other => matches(data.target, other, options.where)).map(other => project(data.target, other, options));
          result[key] = data.many ? selected : selected[0] ?? null;
        } else result[key] = row[key];
      }
      return result;
    }
    writes = jest.fn();
    const client: Row = {};
    for (const model of Object.keys(records)) {
      client[model] = {
        findFirst: jest.fn(async (args: Row) => {
          const row = records[model]!.find(row => matches(model, row, args.where));
          return row ? project(model, row, args) : null;
        }),
        findUnique: jest.fn(async (args: Row) => client[model].findFirst(args)),
        findMany: jest.fn(async (args: Row) => records[model]!.filter(row => matches(model, row, args.where)).map(row => project(model, row, args))),
        count: jest.fn(async (args: Row) => records[model]!.filter(row => matches(model, row, args.where)).length),
        create: jest.fn(async (args: Row) => {
          writes(model, "create", args);
          const row = { id: `created-${model}-${records[model]!.length}`, removedAt: null, status: "ACTIVE", ...args.data };
          records[model]!.push(row);
          return project(model, row, args);
        }),
        update: jest.fn(async (args: Row) => {
          const row = records[model]!.find(row => matches(model, row, args.where));
          if (!row) throw new Error("ROW_NOT_FOUND");
          writes(model, "update", args);
          Object.assign(row, args.data);
          return project(model, row, args);
        }),
        delete: jest.fn(async (args: Row) => {
          const row = records[model]!.find(row => matches(model, row, args.where));
          if (!row) throw new Error("ROW_NOT_FOUND");
          writes(model, "delete", args);
          records[model] = records[model]!.filter(other => other !== row);
          return row;
        }),
        deleteMany: jest.fn(async (args: Row) => {
          const selected = records[model]!.filter(row => matches(model, row, args.where));
          writes(model, "deleteMany", args);
          records[model] = records[model]!.filter(row => !selected.includes(row));
          return { count: selected.length };
        }),
        upsert: jest.fn(async (args: Row) => {
          const exists = records[model]!.some(row => matches(model, row, args.where));
          return exists ? client[model].update({ where: args.where, data: args.update }) : client[model].create({ data: args.create });
        })
      };
    }
    client.$transaction = async (fn: any) => typeof fn === "function" ? fn(client) : Promise.all(fn);
    client.$queryRaw = async (_strings: TemplateStringsArray, id: string, churchId: string) => records.event!.filter(row => row.id === id && row.churchId === churchId);
    db = client as PrismaClient;
    app = Fastify();
    await app.register(jwt, { secret: "tenant-tests-only-02d8e1814610474fba2c" });
    await app.register(async routes => {
      routes.addHook("preHandler", createAuthPreHandler(db));
      await registerMemberRoutes(routes, db);
      await registerVisitorRoutes(routes, db);
      await registerCellRoutes(routes, db);
      await registerCellStatusRoutes(routes, db);
      await registerCellDeleteRoutes(routes, db, requireRole(["SUPER_ADMIN"]));
      await registerTrailRoutes(routes, db);
      await registerVolunteerRoutes(routes, db);
      await registerEventRoutes(routes, db);
    }, { prefix: "/api" });
    await app.ready();
    headers = {};
    for (const churchId of ["a", "b"]) headers[churchId] = { authorization: `Bearer ${await signToken(app, { userId: `account-${churchId}`, churchId, role: "SUPER_ADMIN" })}` };
  });

  afterEach(async () => { await app.close(); });

  const send = (method: HTTPMethods, path: string, payload?: Row, churchId = "a") => app.inject({
    method, url: `/api${path}`, headers: headers[churchId]!, ...(payload ? { payload } : {})
  });

  it.each(["members", "visitors"])("rejects foreign campus when creating %s", async resource => {
    const result = await send("POST", `/${resource}`, { name: "Test", phone: "11999999999", campusId: "campus-b" });
    expect(result.statusCode).toBe(404);
    expect(result.json().error).toBe("CAMPUS_NOT_FOUND");
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["campusId", "leaderId"])("rejects foreign %s on group creation and editing", async key => {
    const input = { ...cellInput, [key]: key === "campusId" ? "campus-b" : "actor-b" };
    expect((await send("POST", "/cells", input)).statusCode).toBe(404);
    expect((await send("PUT", "/cells/cell-a", input)).statusCode).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["campusId", "trailStageId"])("rejects foreign %s on event creation", async key => {
    const result = await send("POST", "/events", { ...eventInput, [key]: key === "campusId" ? "campus-b" : "stage-b" });
    expect(result.statusCode).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["trailId", "requiresEventId"])("rejects foreign %s on stage creation", async key => {
    const input = { trailId: "trail-a", requiresEventId: "event-a", label: "Stage", order: 1, [key]: key === "trailId" ? "trail-b" : "event-b" };
    expect((await send("POST", "/trails/stages", input)).statusCode).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["personId", "stageId"])("rejects foreign %s on progress completion", async key => {
    expect((await send("POST", "/trails/progress/complete", { personId: "member-a", stageId: "stage-a", [key]: key === "personId" ? "member-b" : "stage-b" })).statusCode).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["personId", "groupId"])("rejects foreign %s on membership create and removal", async key => {
    const input = { personId: "member-a", groupId: "cell-a", [key]: key === "personId" ? "member-b" : "cell-b" };
    expect((await send("POST", "/cells/members", input)).statusCode).toBe(404);
    expect((await send("POST", "/cells/members/remove", input)).statusCode).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });

  it("rejects cross-tenant approvers even in direct service calls", async () => {
    await expect(addPersonToCell(db, "a", "actor-b", { personId: "member-a", groupId: "cell-a", canVolunteer: false })).rejects.toThrow("APPROVER_NOT_FOUND");
    await expect(completeTrailStage(db, "a", "actor-b", { personId: "member-a", stageId: "stage-a" })).rejects.toThrow("APPROVER_NOT_FOUND");
    expect(writes).not.toHaveBeenCalled();
  });

  it("rejects foreign registration references, including payment and event", async () => {
    for (const input of [
      { eventId: "event-b", personId: "member-a" }, { eventId: "event-a", personId: "member-b" },
      { eventId: "event-a", personId: "member-a", paymentId: "payment-b" }
    ]) expect((await send("POST", "/events/registrations", input)).statusCode).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });

  it("isolates object reads, edits, deletions and status changes in both directions", async () => {
    for (const churchId of ["a", "b"]) {
      const foreign = churchId === "a" ? "b" : "a";
      for (const [method, path, input] of [
        ["GET", `/cells/cell-${foreign}`], ["PUT", `/cells/cell-${foreign}`, cellInput],
        ["DELETE", `/cells/cell-${foreign}`], ["PATCH", `/cells/cell-${foreign}/archive`],
        ["GET", `/events/event-${foreign}`], ["PATCH", `/events/event-${foreign}`, { title: "changed" }],
        ["DELETE", `/events/event-${foreign}`],
        ["POST", `/events/event-${foreign}/duplicate`, { title: "Copy", slug: "copy", date: eventInput.date }],
        ["POST", "/volunteers/status", { personId: `volunteer-${foreign}`, status: "ACTIVE" }]
      ] as Array<[HTTPMethods, string, Row?]>) {
        expect((await send(method, path, input, churchId)).statusCode).toBe(404);
      }
    }
    expect(writes).not.toHaveBeenCalled();
  });

  it("isolates list reads and foreign progress IDs", async () => {
    for (const churchId of ["a", "b"]) {
      const foreign = churchId === "a" ? "b" : "a";
      for (const path of ["members", "visitors", "cells", "trails", "volunteers"]) {
        const result = await send("GET", `/${path}`, undefined, churchId);
        expect(result.statusCode).toBe(200);
        expect(result.json().length).toBeGreaterThan(0);
        expect(JSON.stringify(result.json())).not.toContain(`-${foreign}`);
      }
      for (const path of [`trails/trail-${foreign}/stages`, `trails/progress/member-${foreign}`, `volunteers/volunteer-${foreign}/logs`]) {
        expect((await send("GET", `/${path}`, undefined, churchId)).json()).toEqual([]);
      }
    }
  });

  it("hides legacy cross-tenant nested relations", async () => {
    records.trailStage!.push({ id: "foreign-linked-stage", churchId: "b", trailId: "trail-a" });
    records.person!.find(row => row.id === "member-b")!.celulaId = "cell-a";
    records.trailProgress!.push({ id: "bad-progress", churchId: "a", personId: "member-a", stageId: "stage-b", approvedBy: "actor-a" });
    records.volunteerLog!.push({ id: "bad-log", churchId: "a", personId: "volunteer-a", changedBy: "actor-b" });
    expect(JSON.stringify((await send("GET", "/trails")).json())).not.toContain("foreign-linked-stage");
    expect((await send("GET", "/cells/cell-a")).json().people).toEqual([]);
    expect((await send("GET", "/trails/progress/member-a")).json()).toEqual([]);
    expect((await send("GET", "/volunteers/volunteer-a/logs")).json()).toEqual([]);
  });

  it("rejects an event's inconsistent legacy stage on read, edit and duplication", async () => {
    records.event!.find(row => row.id === "event-a")!.trailStageId = "stage-b";
    expect((await send("GET", "/events/event-a")).statusCode).toBe(404);
    expect((await send("PATCH", "/events/event-a", { title: "changed" })).statusCode).toBe(404);
    expect((await send("POST", "/events/event-a/duplicate", { title: "Copy", slug: "copy", date: eventInput.date })).statusCode).toBe(404);
    expect(writes).not.toHaveBeenCalled();
  });

  it("preserves valid same-tenant campus, event and stage references", async () => {
    for (const resource of ["members", "visitors"]) {
      expect((await send("POST", `/${resource}`, { name: "Valid", phone: "11999999999", campusId: "campus-a" })).statusCode).toBe(201);
    }
    expect((await send("POST", "/events", eventInput)).statusCode).toBe(201);
    expect((await send("POST", "/trails/stages", { trailId: "trail-a", requiresEventId: "event-a", label: "Valid", order: 1 })).statusCode).toBe(201);
    expect((await send("GET", "/events/event-a")).statusCode).toBe(200);
    expect((await send("POST", "/events/registrations", { eventId: "event-a", personId: "member-a", paymentId: "payment-a" })).statusCode).toBe(201);
  });

  it("preserves same-tenant approvals, volunteer eligibility and status history", async () => {
    const membership = await send("POST", "/cells/members", { personId: "member-a", groupId: "cell-a" });
    expect(membership.statusCode).toBe(201);
    expect(membership.json().approvedBy).toBe("actor-a");
    const progress = await send("POST", "/trails/progress/complete", { personId: "member-a", stageId: "stage-a" });
    expect(progress.statusCode).toBe(200);
    expect(progress.json().approvedBy).toBe("actor-a");
    expect(records.person!.find(row => row.id === "member-a")!.volunteerStatus).toBe("ELIGIBLE");
    expect((await send("POST", "/cells/members/remove", { personId: "member-a", groupId: "cell-a" })).statusCode).toBe(200);
    const status = await send("POST", "/volunteers/status", { personId: "volunteer-a", status: "ACTIVE" });
    expect(status.statusCode).toBe(200);
    expect(status.json().log.changedBy).toBe("actor-a");
  });

  it("preserves own group editing/deletion and the history deletion restriction", async () => {
    expect((await send("PUT", "/cells/cell-a", { ...cellInput, name: "Edited" })).statusCode).toBe(200);
    expect((await send("PATCH", "/cells/cell-a/archive")).statusCode).toBe(200);
    expect((await send("PATCH", "/cells/cell-a/reactivate")).statusCode).toBe(200);
    await send("POST", "/cells/members", { personId: "member-a", groupId: "cell-a" });
    expect((await send("DELETE", "/cells/cell-a")).statusCode).toBe(409);
    expect((await send("DELETE", "/cells/cell-b", undefined, "b")).statusCode).toBe(200);
    expect(records.celula!.map(row => row.id)).toEqual(["cell-a"]);
  });

  it("preserves scoped event editing/deletion and archiving when history exists", async () => {
    expect((await send("PATCH", "/events/event-a", { title: "Edited" })).statusCode).toBe(200);
    // Existing payment history must continue to archive instead of deleting.
    expect((await send("DELETE", "/events/event-a")).statusCode).toBe(204);
    expect(records.event!.find(row => row.id === "event-a")!.deletedAt).toBeInstanceOf(Date);
    records.eventPayment = [];
    expect((await send("DELETE", "/events/event-b", undefined, "b")).statusCode).toBe(204);
    expect(records.event!.some(row => row.id === "event-b")).toBe(false);
  });
});
