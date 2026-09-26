import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, type JWTPayload } from "@sistema-igrejas/auth";
import { registerAssistantRoutes } from "../src/assistant/assistant.routes.js";

// Real routes/authentication with tenant-aware persistence, including corrupt relations.
describe("Assistant security", () => {
  let app: FastifyInstance;
  let db: PrismaClient;
  let reads: jest.Mock[];
  let accounts: any[];
  const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, value]) => {
    if (value && typeof value === "object") {
      if ("is" in value) return matches(row[key], (value as any).is);
      if ("not" in value) return row[key] !== (value as any).not;
    }
    return row[key] === value;
  });
  const project = (row: any, select: any): any => Object.fromEntries(Object.entries(select).map(([key, spec]) => {
    if (spec === true) return [key, row[key]];
    const relation = spec as any;
    return [key, Array.isArray(row[key])
      ? row[key].filter((item: any) => matches(item, relation.where)).map((item: any) => project(item, relation.select))
      : project(row[key], relation.select)];
  }));

  beforeEach(async () => {
    reads = [];
    const count = (rows: any[]) => {
      const fn = jest.fn(async ({ where }) => rows.filter(row => matches(row, where)).length);
      reads.push(fn);
      return fn;
    };
    const findMany = (rows: any[]) => {
      const fn = jest.fn(async ({ where, select }) => rows.filter(row => matches(row, where)).map(row => project(row, select)));
      reads.push(fn);
      return fn;
    };
    const roles = ["SUPER_ADMIN", "PASTOR", "LEADER", "VOLUNTEER", "MEMBER"];
    accounts = ["a", "b"].flatMap(churchId => roles.map(role => ({ id: `${churchId}-${role}`, churchId, role, status: "ACTIVE", person: null })));
    const people = ["a", "b"].flatMap(churchId => ["MEMBER", "VOLUNTEER"].flatMap(role => Array.from({ length: churchId === "a" ? 1 : 2 }, (_, i) => ({ id: `${churchId}-${role}-${i}`, churchId, role }))));
    const events = ["a", "b"].flatMap(churchId => {
      const foreign = churchId === "a" ? "b" : "a";
      const registrations = ["CONFIRMED", "PENDING", "CHECKED_IN", "CANCELLED"].map(status => ({ id: status, churchId, status, paymentStatus: "PAID", checkedInAt: new Date(), waitlistedAt: null }));
      registrations.push({ ...registrations[1]!, id: "waitlist", waitlistedAt: new Date() } as any);
      registrations.push({ ...registrations[0]!, id: "foreign", churchId: foreign });
      const event = { id: `event-${churchId}`, churchId, title: `Evento ${churchId}`, slug: `evento-${churchId}`, publicSlug: `publico ${churchId}`, church: { id: churchId, slug: `igreja-${churchId}` }, date: new Date("2026-01-01"), capacity: 20, price: 0, isPublic: true, isPaid: false, publicRegistrationEnabled: true, deletedAt: null, registrations };
      return [event, { ...event, id: `deleted-${churchId}`, title: "REMOVIDO", deletedAt: new Date() }, { ...event, id: `legacy-${churchId}`, title: `Legado ${churchId}`, publicSlug: null }, { ...event, id: `internal-${churchId}`, title: "Interno", isPublic: false }];
    });
    const cells = ["a", "b"].flatMap(churchId => {
      const foreign = churchId === "a" ? "b" : "a";
      const cell = { id: churchId, churchId, name: `Célula ${churchId}`, region: "Centro", profile: "Família", meetDay: "Sábado", meetTime: "18:00", leader: { churchId, name: `Líder ${churchId}` }, people: [{ id: "local", churchId }, { id: "foreign", churchId: foreign }] };
      return [cell, { ...cell, id: `bad-${churchId}`, leader: { churchId: foreign, name: "LÍDER ESTRANGEIRO" } }];
    });
    db = {
      userAccount: { findUnique: jest.fn(async ({ where }) => accounts.find(account => account.id === where.id) ?? null) },
      church: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, status: "ACTIVE" })) },
      person: { count: count(people) }, visitor: { count: count(people) },
      celula: { findMany: findMany(cells) }, event: { findMany: findMany(events) },
      transaction: { aggregate: jest.fn(() => { throw new Error("Unexpected financial read"); }) }
    } as unknown as PrismaClient;
    app = Fastify();
    await app.register(jwt, { secret: "assistant-security-test-secret" });
    await app.register(async routes => {
      routes.addHook("preHandler", createAuthPreHandler(db));
      await registerAssistantRoutes(routes, db);
    }, { prefix: "/api" });
    await app.ready();
  });
  afterEach(async () => { await app.close(); });

  function ask(message: string, role = "PASTOR", churchId = "a", extra = {}) {
    return app.inject({ method: "POST", url: "/api/assistant/messages", headers: {
      authorization: `Bearer ${app.jwt.sign({ userId: `${churchId}-${role}`, churchId, role: role as JWTPayload["role"] })}`
    }, payload: { message, ...extra } });
  }
  function expectNoReads() { reads.forEach(read => expect(read).not.toHaveBeenCalled()); }

  it.each(["MEMBER", "VOLUNTEER"])("denies %s before any domain query", async role => {
    for (const church of ["a", "b"]) for (const message of ["membros", "visitantes", "células", "eventos", "voluntários"]) {
      expect((await ask(message, role, church)).statusCode).toBe(403);
    }
    expectNoReads();
  });
  it.each(["SUPER_ADMIN", "PASTOR", "LEADER"])("isolates authorized reads for %s and ignores client church/role", async role => {
    for (const churchId of ["a", "b"]) {
      const result = await ask("membros", role, churchId, { churchId: churchId === "a" ? "b" : "a", userRole: "SUPER_ADMIN" });
      expect(result.statusCode).toBe(200);
      expect(result.json().context).toEqual({ membersCount: churchId === "a" ? 1 : 2 });
      expect(result.json().safety.canExecuteBusinessRules).toBe(false);
    }
    expect(reads.slice(1).every(read => read.mock.calls.length === 0)).toBe(true);
  });
  it.each(["a", "b"])("filters nested cell relations for church %s", async churchId => {
    const response = await ask("células no bairro Centro", "LEADER", churchId);
    expect(response.statusCode).toBe(200);
    expect(response.json().context).toEqual({});
    expect(response.json().answer).toContain(`Líder ${churchId}`);
    expect(response.json().answer).not.toContain(`Líder ${churchId === "a" ? "b" : "a"}`);
    expect(response.json().answer).toContain("Pessoas vinculadas: 1");
    expect(response.json().answer).not.toContain("ESTRANGEIRO");
    expect(db.person.count).not.toHaveBeenCalled();
  });
  it.each(["SUPER_ADMIN", "PASTOR", "LEADER"])("returns only the requested count for %s", async role => {
    for (const churchId of ["a", "b"]) {
      const visitors = await ask("visitantes", role, churchId);
      expect(visitors.statusCode).toBe(200);
      expect(visitors.json().context).toEqual({ visitorsCount: churchId === "a" ? 2 : 4 });
      const volunteers = await ask("voluntários", role, churchId);
      expect(volunteers.statusCode).toBe(200);
      expect(volunteers.json().context).toEqual({ volunteersCount: churchId === "a" ? 1 : 2 });
    }
    expect(db.celula.findMany).not.toHaveBeenCalled();
    expect(db.event.findMany).not.toHaveBeenCalled();
  });
  it.each(["a", "b"])("filters events/registrations and builds real public links for church %s", async churchId => {
    const response = await ask("eventos", "PASTOR", churchId);
    expect(response.statusCode).toBe(200);
    const { answer, context } = response.json();
    expect(context).toEqual({});
    expect(answer).not.toContain("REMOVIDO");
    expect(answer).not.toContain(`Evento ${churchId === "a" ? "b" : "a"}`);
    expect(answer).toContain("Inscritos ativos: 4. Confirmados: 1. Pendentes: 1. Lista de espera: 1. Check-ins: 1.");
    expect(answer).toContain(`/eventos/event-${churchId}`);
    expect(answer).toContain(`/eventos/legacy-${churchId}`);
    expect(answer).not.toContain(`/eventos/internal-${churchId}`);
    expect(answer).toContain("indisponível (evento interno)");
    expect(db.person.count).not.toHaveBeenCalled();
  });
  it.each(["LEADER", "MEMBER", "VOLUNTEER"])("uses financial authorization for %s including mixed questions", async role => {
    for (const churchId of ["a", "b"]) for (const message of ["financeiro", "membros e saldo", "eventos e valores"]) {
      const response = await ask(message, role, churchId);
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("FINANCIAL_ACCESS_DENIED");
    }
    expectNoReads();
    expect(db.transaction.aggregate).not.toHaveBeenCalled();
  });
  it.each(["SUPER_ADMIN", "PASTOR"])("keeps financial reports disabled for authorized %s", async role => {
    for (const churchId of ["a", "b"]) {
      const response = await ask("financeiro", role, churchId);
      expect(response.statusCode).toBe(200);
      expect(response.json().context).toEqual({});
      expect(response.json().answer).toContain("não vou exibir relatório");
    }
    expectNoReads();
    expect(db.transaction.aggregate).not.toHaveBeenCalled();
  });
  it.each(["", "   ", "x".repeat(2001), 42, null, undefined])("returns 400 for invalid input %#", async message => {
    const response = await ask(message as string);
    expect(response.statusCode).toBe(400);
    expectNoReads();
  });
  it("returns help without querying or disclosing context", async () => {
    const response = await ask("olá", "MEMBER");
    expect(response.statusCode).toBe(200);
    expect(response.json().context).toEqual({});
    expectNoReads();
  });
  it("rejects missing authentication and forged tenant claims", async () => {
    expect((await app.inject({ method: "POST", url: "/api/assistant/messages", payload: { message: "membros" } })).statusCode).toBe(401);
    const token = app.jwt.sign({ userId: "a-PASTOR", churchId: "b", role: "PASTOR" });
    expect((await app.inject({ method: "POST", url: "/api/assistant/messages", headers: { authorization: `Bearer ${token}` }, payload: { message: "membros" } })).statusCode).toBe(401);
    expectNoReads();
  });
  it("uses current account permissions instead of a stale token", async () => {
    accounts.find(account => account.id === "a-PASTOR").role = "MEMBER";
    expect((await ask("membros", "PASTOR")).statusCode).toBe(403);
    expectNoReads();
  });
});
