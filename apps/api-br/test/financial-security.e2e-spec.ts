import Fastify, { type FastifyInstance } from "fastify";
import jwt from "@fastify/jwt";
import type { PrismaClient } from "@prisma/client";
import { createAuthPreHandler, type JWTPayload } from "@sistema-igrejas/auth";
import { registerEventFinancialRoutes } from "@sistema-igrejas/events";
import {
  authorizeFinancialRoute, registerFinancialRoutes, registerAsaasRoutes,
  reverseTransaction, createAsaasChargeForExistingTransaction, type TransactionReversalMode
} from "@sistema-igrejas/financial";

// Real HTTP handlers and authentication; deterministic tenant-aware persistence double.
describe("Financial security", () => {
  let app: FastifyInstance;
  let db: PrismaClient;
  let rows: any[];
  let provider: jest.Mock;
  let writes: jest.Mock;
  const input = { type: "OTHER", direction: "IN", amount: 100, method: "CASH", costCenter: "GENERAL" };
  const matches = (row: any, where: any): boolean =>
    Object.entries(where).every(([key, value]) => key === "AND"
      ? (value as any[]).every(part => matches(row, part))
      : value && typeof value === "object" && "is" in value
        ? row[key] == (value as any).is : row[key] === value);

  beforeEach(async () => {
    rows = ["a", "b"].flatMap(churchId => [
      { ...input, id: `manual-${churchId}`, churchId, status: "ACTIVE", asaasId: null },
      { ...input, id: `charge-${churchId}`, churchId, status: "ACTIVE", asaasId: `pay-${churchId}` }
    ]);
    writes = jest.fn();
    const related = (kind: string) => ({ findFirst: jest.fn(async ({ where }) =>
      ["a", "b"].map(churchId => ({ id: `${kind}-${churchId}`, churchId })).find(row => matches(row, where)) ?? null) });
    const transaction = {
      findFirst: jest.fn(async ({ where }) => rows.find(row => matches(row, where)) ?? null),
      findUnique: jest.fn(async ({ where }) => rows.find(row => matches(row, where)) ?? null),
      findMany: jest.fn(async ({ where }) => rows.filter(row => matches(row, where))),
      create: jest.fn(async ({ data }) => {
        writes(data);
        const row = { id: `new-${rows.length}`, status: "ACTIVE", ...data };
        rows.push(row);
        return row;
      }),
      update: jest.fn(async ({ where, data }) => {
        const row = rows.find(row => matches(row, where));
        if (!row) throw new Error("MISSING_ROW");
        writes(data);
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }) => {
        const selected = rows.filter(row => matches(row, where));
        selected.forEach(row => { writes(data); Object.assign(row, data); });
        return { count: selected.length };
      })
    };
    db = {
      transaction, campus: related("campus"), person: related("person"), event: related("event"),
      church: { findUnique: jest.fn(async ({ where }) => ({ id: where.id, status: "ACTIVE" })) },
      eventPayment: { findFirst: jest.fn(async ({ where }) => ["a", "b"].map(churchId => ({
        id: `payment-${churchId}`, churchId, transactionId: `charge-${churchId}`,
        provider: "ASAAS", providerPaymentId: `pay-${churchId}`, status: "PAID", amount: 100,
        transaction: rows.find(row => row.id === `charge-${churchId}`)
      })).find(row => matches(row, where)) ?? null) },
      $transaction: async (fn: any) => fn(db)
    } as unknown as PrismaClient;
    provider = jest.fn(async (): Promise<TransactionReversalMode> => "REVERSE");
    app = Fastify();
    await app.register(jwt, { secret: "financial-security-test-secret" });
    await app.register(async routes => {
      routes.addHook("preHandler", createAuthPreHandler(db));
      routes.addHook("preHandler", authorizeFinancialRoute);
      await registerFinancialRoutes(routes, db, provider);
      await registerAsaasRoutes(routes, db);
      await registerEventFinancialRoutes(routes, db, {
        refundProvider: provider,
        applyCancelledStatus: async () => true,
        finalizeReversal: async () => {}
      });
    }, { prefix: "/api" });
    await app.ready();
  });

  afterEach(async () => { jest.restoreAllMocks(); await app.close(); });

  function headers(role = "SUPER_ADMIN", churchId = "a") {
    return { authorization: `Bearer ${app.jwt.sign({ userId: `user-${churchId}`, churchId, role: role as JWTPayload["role"] })}` };
  }

  it.each(["LEADER", "VOLUNTEER", "MEMBER", "VISITOR"])("denies %s on all financial aliases before reading or writing", async role => {
    for (const path of [
      "financial/transactions", "financial/summary", "events/financial/transactions",
      "events/financial/summary", "events/financial/export", "events/financial/receiving-account",
      "events/financial/operations", "events/financial/operations/refundable"
    ]) {
      const response = await app.inject({ url: `/api/${path}`, headers: headers(role) });
      expect(response.statusCode).toBe(403);
    }
    for (const [method, path] of [
      ["POST", "financial/transactions"], ["PATCH", "financial/transactions/manual-a"],
      ["POST", "financial/transactions/manual-a/cancel"], ["POST", "financial/transactions/manual-a/reverse"],
      ["POST", "financial/asaas/charges"], ["POST", "events/financial/operations/refunds"],
      ["PUT", "events/financial/receiving-account"]
    ] as const) {
      expect((await app.inject({ method, url: `/api/${path}`, headers: headers(role), payload: {} })).statusCode).toBe(403);
    }
    expect(db.transaction.findMany).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it.each(["SUPER_ADMIN", "PASTOR"])("isolates reads and mutations for %s across two churches", async role => {
    for (const churchId of ["a", "b"]) {
      const response = await app.inject({ url: "/api/financial/transactions", headers: headers(role, churchId) });
      expect(response.statusCode).toBe(200);
      expect(response.json().map((row: any) => row.churchId)).toEqual([churchId, churchId]);
      const foreign = churchId === "a" ? "b" : "a";
      for (const [method, suffix, payload] of [
        ["PATCH", "", { amount: 2 }], ["POST", "/cancel", { reason: "test cancellation" }]
      ] as const) {
        expect((await app.inject({ method, url: `/api/financial/transactions/manual-${foreign}${suffix}`,
          headers: headers(role, churchId), payload })).statusCode).toBe(404);
      }
    }
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["campusId", "personId", "eventId"])("rejects foreign %s on create and update", async field => {
    const value = `${field.replace("Id", "")}-b`;
    for (const method of ["POST", "PATCH"] as const) {
      const response = await app.inject({ method, url: `/api/financial/transactions${method === "PATCH" ? "/manual-a" : ""}`,
        headers: headers("PASTOR"), payload: { ...input, [field]: value } });
      expect(response.statusCode).toBe(404);
    }
    expect(writes).not.toHaveBeenCalled();
  });

  it("preserves valid manual creation, editing and cancellation", async () => {
    const created = await app.inject({ method: "POST", url: "/api/financial/transactions", headers: headers("PASTOR"),
      payload: { ...input, campusId: "campus-a", personId: "person-a", eventId: "event-a" } });
    expect(created.statusCode).toBe(201);
    const path = `/api/financial/transactions/${created.json().id}`;
    expect((await app.inject({ method: "PATCH", url: path, headers: headers("PASTOR"), payload: { amount: 50 } })).statusCode).toBe(200);
    const cancelled = await app.inject({ method: "POST", url: `${path}/cancel`, headers: headers("PASTOR"), payload: { reason: "duplicate entry" } });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json()).toMatchObject({ amount: 50, status: "CANCELLED", churchId: "a" });
  });

  it("denies pastor refunds through either equivalent route", async () => {
    for (const path of ["financial/transactions/charge-a/reverse", "events/financial/operations/refunds"]) {
      const response = await app.inject({ method: "POST", url: `/api/${path}`, headers: headers("PASTOR"), payload: { reason: "refund request" } });
      expect(response.statusCode).toBe(403);
      expect(response.json().error).toBe("FINANCIAL_OPERATION_DENIED");
    }
    expect(provider).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });

  it("rejects cross-church reversal IDs before provider calls", async () => {
    for (const [path, payload] of [
      ["financial/transactions/charge-b/reverse", { reason: "refund request" }],
      ["events/financial/operations/refunds", { transactionId: "charge-b" }]
    ] as const) {
      const response = await app.inject({ method: "POST", url: `/api/${path}`, headers: headers(), payload });
      expect(response.statusCode).toBe(404);
    }
    expect(provider).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["PASTOR", "SUPER_ADMIN"])("blocks local provider edits/cancellation for %s", async role => {
    for (const [method, suffix, payload] of [
      ["PATCH", "", { amount: 1 }], ["PATCH", "", { asaasId: "pay-b" }],
      ["POST", "/cancel", { reason: "refund bypass" }]
    ] as const) {
      expect((await app.inject({ method, url: `/api/financial/transactions/charge-a${suffix}`, headers: headers(role), payload })).statusCode).toBe(409);
    }
    expect(writes).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("rejects forged provider IDs on manual create and edit", async () => {
    for (const method of ["POST", "PATCH"] as const) {
      expect((await app.inject({ method, url: `/api/financial/transactions${method === "PATCH" ? "/manual-a" : ""}`,
        headers: headers(), payload: { ...input, asaasId: "pay-b" } })).statusCode).toBe(409);
    }
    expect(writes).not.toHaveBeenCalled();
  });

  it.each([
    { churchId: "b", providerPaymentId: "pay-a" },
    { churchId: "a", providerPaymentId: "pay-b" }
  ])("rejects inconsistent related payment ownership before provider calls: %j", async eventPayment => {
    rows.find(row => row.id === "charge-a").eventPayment = eventPayment;
    const response = await app.inject({ method: "POST", url: "/api/financial/transactions/charge-a/reverse", headers: headers(), payload: { reason: "test refund" } });
    expect(response.statusCode).toBe(502);
    expect(provider).not.toHaveBeenCalled();
    expect(writes).not.toHaveBeenCalled();
  });

  it("blocks local cancellation of linked payments even without an Asaas ID", async () => {
    rows.find(row => row.id === "manual-a").eventPayment = { churchId: "a", providerPaymentId: null };
    const response = await app.inject({ method: "POST", url: "/api/financial/transactions/manual-a/cancel", headers: headers("PASTOR"), payload: { reason: "bypass attempt" } });
    expect(response.statusCode).toBe(409);
    expect(writes).not.toHaveBeenCalled();
  });

  it("preserves server-created provider bindings and rejects another church's transaction", async () => {
    const originalKey = process.env.ASAAS_API_KEY;
    process.env.ASAAS_API_KEY = "test-key";
    const fetchMock = jest.spyOn(global, "fetch").mockImplementation(async (url) => {
      const isCustomer = String(url).endsWith("/customers");
      return new Response(JSON.stringify(isCustomer ? { id: "customer-a" } : {
        id: "new-pay-a", billingType: "CREDIT_CARD", status: "PENDING"
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    try {
      const charge = { transactionId: "manual-b", referenceId: "reference-a", billingType: "CREDIT_CARD" as const,
        customer: { name: "Test" }, dueDate: "2026-10-01", value: 100 };
      await expect(createAsaasChargeForExistingTransaction(db, "a", charge)).rejects.toThrow("TRANSACTION_NOT_FOUND");
      expect(fetchMock).not.toHaveBeenCalled();
      await createAsaasChargeForExistingTransaction(db, "a", { ...charge, transactionId: "manual-a" });
      expect(rows.find(row => row.id === "manual-a")).toMatchObject({ asaasId: "new-pay-a", method: "CARD" });
      expect(rows.find(row => row.id === "manual-b").asaasId).toBeNull();
    } finally {
      if (originalKey === undefined) delete process.env.ASAAS_API_KEY;
      else process.env.ASAAS_API_KEY = originalKey;
    }
  });

  it("fails closed when the provider is unavailable or rejects reversal", async () => {
    await expect(reverseTransaction(db, "a", "charge-a", "user-a", { reason: "test refund" })).rejects.toThrow("PAYMENT_PROVIDER_REVERSAL_FAILED");
    provider.mockRejectedValue(new Error("PAYMENT_PROVIDER_REVERSAL_FAILED"));
    const response = await app.inject({ method: "POST", url: "/api/financial/transactions/charge-a/reverse", headers: headers(), payload: { reason: "test refund" } });
    expect(response.statusCode).toBe(502);
    expect(rows.find(row => row.id === "charge-a").status).toBe("ACTIVE");
    expect(writes).not.toHaveBeenCalled();
  });

  it.each(["CANCEL", "PENDING", "REVERSE"] as const)("preserves provider %s semantics", async mode => {
    provider.mockResolvedValue(mode);
    const response = await app.inject({ method: "POST", url: "/api/financial/transactions/charge-a/reverse", headers: headers(), payload: { reason: "test refund" } });
    expect(response.statusCode).toBe(200);
    expect(provider).toHaveBeenCalledWith(expect.objectContaining({ churchId: "a", transactionId: "charge-a", asaasId: "pay-a" }));
    expect(response.json().originalTransaction.status).toBe(mode === "CANCEL" ? "CANCELLED" : mode === "REVERSE" ? "REVERSED" : "ACTIVE");
    expect(response.json().providerPending).toBe(mode === "PENDING");
    if (mode === "REVERSE") expect(response.json().reversalTransaction).toMatchObject({ churchId: "a", direction: "OUT", amount: 100 });
    expect(rows.find(row => row.id === "charge-b").status).toBe("ACTIVE");
  });
});
