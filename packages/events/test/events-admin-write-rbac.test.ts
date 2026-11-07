import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import jwt from "@fastify/jwt";
import { createAuthPreHandler } from "@sistema-igrejas/auth";
import { registerDiscountRoutes } from "../src/discount.routes.ts";
import { registerEventRoutes } from "../src/event.routes.ts";
import { registerRegistrationFormRoutes } from "../src/registration-form.routes.ts";

const churchA = "church-a";
const churchB = "church-b";
const eventA = "event-a";
const ticketA = "ticket-a";
const discountA = "discount-a";
const fieldA = "field-a";
const personA = "person-a";
const registrationA = "registration-a";
const checkInToken = "check-in-token-a";

const accounts = {
  pastor: {
    id: "user-pastor",
    churchId: churchA,
    status: "ACTIVE",
    role: "PASTOR",
    person: null
  },
  leader: {
    id: "user-leader",
    churchId: churchA,
    status: "ACTIVE",
    role: "LEADER",
    person: null
  },
  other: {
    id: "user-other",
    churchId: churchB,
    status: "ACTIVE",
    role: "SUPER_ADMIN",
    person: null
  }
} as const;

const createEventPayload = {
  title: "Novo evento",
  slug: "novo-evento",
  date: "2026-11-20T20:00:00.000Z",
  capacity: 100
};

const writeRoutes = [
  {
    method: "POST" as const,
    url: "/api/events",
    payload: createEventPayload,
    crossTenantError: null
  },
  {
    method: "POST" as const,
    url: `/api/events/${eventA}/duplicate`,
    payload: {
      title: "Copia",
      slug: "copia",
      date: "2026-12-01T20:00:00.000Z"
    },
    crossTenantError: "EVENT_NOT_FOUND"
  },
  {
    method: "GET" as const,
    url: `/api/events/${eventA}/registrations/export`,
    payload: undefined,
    crossTenantError: "EVENT_NOT_FOUND"
  },
  {
    method: "PATCH" as const,
    url: `/api/events/${eventA}`,
    payload: {
      title: "Evento atualizado"
    },
    crossTenantError: "EVENT_NOT_FOUND"
  },
  {
    method: "POST" as const,
    url: "/api/events/registrations",
    payload: {
      eventId: eventA,
      personId: personA
    },
    crossTenantError: "EVENT_NOT_FOUND"
  },
  {
    method: "POST" as const,
    url: "/api/events/registrations/status",
    payload: {
      registrationId: registrationA,
      eventId: eventA,
      status: "CANCELLED"
    },
    crossTenantError: "REGISTRATION_NOT_FOUND"
  },
  {
    method: "POST" as const,
    url: "/api/events/registrations/check-in-token",
    payload: {
      eventId: eventA,
      checkInToken
    },
    crossTenantError: "REGISTRATION_NOT_FOUND"
  },
  {
    method: "POST" as const,
    url: `/api/events/${eventA}/discounts`,
    payload: {
      ticketId: ticketA,
      code: "DESC10",
      finalPrice: 10
    },
    crossTenantError: "EVENT_NOT_FOUND"
  },
  {
    method: "PATCH" as const,
    url: `/api/events/${eventA}/discounts/${discountA}`,
    payload: {
      isActive: false
    },
    crossTenantError: "EVENT_DISCOUNT_NOT_FOUND"
  },
  {
    method: "POST" as const,
    url: `/api/events/${eventA}/form-fields`,
    payload: {
      label: "Campo",
      type: "TEXT"
    },
    crossTenantError: "EVENT_NOT_FOUND"
  },
  {
    method: "PATCH" as const,
    url: `/api/events/${eventA}/form-fields/${fieldA}`,
    payload: {
      label: "Campo atualizado"
    },
    crossTenantError: "EVENT_FORM_FIELD_NOT_FOUND"
  },
  {
    method: "PATCH" as const,
    url: `/api/events/${eventA}/form-fields-order`,
    payload: {
      fieldIds: [fieldA]
    },
    crossTenantError: "EVENT_NOT_FOUND"
  }
];

function belongsToChurchA(where: { churchId?: string; id?: string }) {
  return where.churchId === churchA && where.id === eventA;
}

async function harness() {
  const writes: Array<{ op: string; churchId: string }> = [];
  const prisma = {
    userAccount: {
      async findUnique({ where }: { where: { id: string } }) {
        return Object.values(accounts).find((account) => account.id === where.id) ?? null;
      }
    },
    church: {
      async findUnique() {
        return {
          id: churchA,
          status: "ACTIVE",
          trialEndsAt: null,
          blockReason: null
        };
      }
    },
    event: {
      async count() {
        return 0;
      },
      async findMany() {
        return [];
      },
      async findFirst({
        where
      }: {
        where: { churchId?: string; id?: string };
      }) {
        if (!belongsToChurchA(where)) {
          return null;
        }

        return {
          id: eventA,
          churchId: churchA,
          slug: "evento-a",
          campusId: null,
          trailStageId: null,
          isPublic: false,
          publicRegistrationEnabled: false,
          waitlistEnabled: true,
          isPaid: false,
          capacity: 100,
          price: 0,
          date: new Date("2026-11-20T20:00:00.000Z"),
          description: null,
          location: null,
          registrations: [],
          ticketTypes: [],
          formFields: [],
          discounts: [],
          coverImage: null
        };
      },
      async create({ data }: { data: { churchId: string } }) {
        writes.push({ op: "createEvent", churchId: data.churchId });
        return {
          ...data,
          id: "event-new"
        };
      },
      async update({ data }: { data: Record<string, unknown> }) {
        writes.push({ op: "updateEvent", churchId: churchA });
        return {
          id: eventA,
          churchId: churchA,
          ...data
        };
      }
    },
    eventTicket: {
      async findFirst({
        where
      }: {
        where: { churchId: string; eventId: string; id?: string };
      }) {
        return where.churchId === churchA &&
          where.eventId === eventA &&
          (!where.id || where.id === ticketA)
          ? { id: ticketA }
          : null;
      },
      async count() {
        return 0;
      }
    },
    eventDiscount: {
      async findMany() {
        return [];
      },
      async findFirst({
        where
      }: {
        where: { churchId: string; eventId: string; id?: string };
      }) {
        return where.churchId === churchA &&
          where.eventId === eventA &&
          (!where.id || where.id === discountA)
          ? { id: discountA }
          : null;
      },
      async create({ data }: { data: { churchId: string } }) {
        writes.push({ op: "createDiscount", churchId: data.churchId });
        return {
          ...data,
          id: "discount-new",
          ticket: {
            id: ticketA,
            name: "Ingresso"
          }
        };
      },
      async update() {
        writes.push({ op: "updateDiscount", churchId: churchA });
        return {
          id: discountA,
          ticket: {
            id: ticketA,
            name: "Ingresso"
          }
        };
      }
    },
    eventFormField: {
      async findMany({
        where
      }: {
        where?: { churchId?: string; eventId?: string; id?: { in?: string[] } };
      } = {}) {
        if (where?.id?.in?.includes(fieldA) && where.churchId === churchA) {
          return [{ id: fieldA }];
        }

        return [];
      },
      async findFirst({
        where
      }: {
        where: { churchId?: string; eventId?: string; id?: string };
      }) {
        if (where.id === fieldA && where.churchId === churchA && where.eventId === eventA) {
          return { id: fieldA, order: 1 };
        }

        return null;
      },
      async create({ data }: { data: { churchId: string } }) {
        writes.push({ op: "createFormField", churchId: data.churchId });
        return {
          ...data,
          id: "field-new",
          options: [],
          ticketScopes: []
        };
      },
      async update() {
        writes.push({ op: "updateFormField", churchId: churchA });
        return {
          id: fieldA,
          options: [],
          ticketScopes: []
        };
      }
    },
    eventFormFieldOption: {
      async deleteMany() {
        return { count: 0 };
      }
    },
    eventFormFieldTicket: {
      async deleteMany() {
        return { count: 0 };
      }
    },
    person: {
      async findFirst({
        where
      }: {
        where: { churchId: string; id: string };
      }) {
        return where.churchId === churchA && where.id === personA
          ? { id: personA }
          : null;
      }
    },
    visitor: {
      async findFirst() {
        return null;
      }
    },
    eventPayment: {
      async findFirst() {
        return null;
      }
    },
    registration: {
      async findFirst({
        where
      }: {
        where: {
          churchId?: string;
          eventId?: string;
          id?: string;
          checkInToken?: string;
        };
      }) {
        if (where.churchId !== churchA || where.eventId !== eventA) {
          return null;
        }

        if (where.id && where.id !== registrationA) {
          return null;
        }

        if (where.checkInToken && where.checkInToken !== checkInToken) {
          return null;
        }

        return {
          id: registrationA,
          status: "CONFIRMED",
          paymentId: null,
          paymentStatus: "NOT_REQUIRED",
          waitlistedAt: null,
          person: {
            id: personA,
            name: "Pessoa",
            phone: "11999999999",
            email: "pessoa@example.com"
          },
          visitor: null,
          event: {
            id: eventA,
            title: "Evento A",
            slug: "evento-a",
            publicSlug: null,
            date: new Date("2026-11-20T20:00:00.000Z"),
            price: 0,
            isPaid: false,
            church: {
              slug: "igreja-a"
            }
          }
        };
      },
      async findMany() {
        return [];
      },
      async create({ data }: { data: { churchId: string } }) {
        writes.push({ op: "createRegistration", churchId: data.churchId });
        return {
          ...data,
          id: "registration-new"
        };
      },
      async update() {
        writes.push({ op: "updateRegistration", churchId: churchA });
        return {
          id: registrationA,
          status: "CHECKED_IN",
          paymentStatus: "NOT_REQUIRED",
          person: {
            id: personA,
            name: "Pessoa",
            phone: "11999999999",
            email: "pessoa@example.com"
          },
          visitor: null,
          event: {
            id: eventA,
            title: "Evento A",
            slug: "evento-a",
            publicSlug: null,
            date: new Date("2026-11-20T20:00:00.000Z"),
            price: 0,
            isPaid: false,
            church: {
              slug: "igreja-a"
            }
          }
        };
      }
    },
    async $queryRaw() {
      return [];
    },
    async $transaction(arg: unknown) {
      if (typeof arg === "function") {
        return (arg as (client: typeof prisma) => Promise<unknown>)(prisma);
      }

      return Promise.all(arg as Promise<unknown>[]);
    }
  };

  const app = Fastify();
  await app.register(jwt, { secret: "events-admin-write-rbac-test-secret" });
  await app.register(
    async (instance) => {
      instance.addHook("preHandler", createAuthPreHandler(prisma as unknown as PrismaClient));
      await registerEventRoutes(instance, prisma as unknown as PrismaClient);
      await registerDiscountRoutes(instance, prisma as unknown as PrismaClient);
      await registerRegistrationFormRoutes(instance, prisma as unknown as PrismaClient);
    },
    { prefix: "/api" }
  );
  await app.ready();

  return {
    app,
    writes,
    token(account: (typeof accounts)[keyof typeof accounts]) {
      return app.jwt.sign({
        userId: account.id,
        churchId: account.churchId,
        role: account.role
      });
    }
  };
}

test("event admin writes reuse SUPER_ADMIN|PASTOR; GET stays readable", async () => {
  const eventSource = await readFile(
    new URL("../src/event.routes.ts", import.meta.url),
    "utf8"
  );
  const discountSource = await readFile(
    new URL("../src/discount.routes.ts", import.meta.url),
    "utf8"
  );
  const formSource = await readFile(
    new URL("../src/registration-form.routes.ts", import.meta.url),
    "utf8"
  );

  assert.match(eventSource, /app\.get\(\s*"\/events",\s*async/);
  assert.match(
    eventSource,
    /app\.get\(\s*"\/events\/:eventId\/registrations",\s*async/
  );
  assert.match(
    eventSource,
    /app\.post\(\s*"\/events",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    eventSource,
    /app\.post\(\s*"\/events\/:eventId\/duplicate",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    eventSource,
    /app\.get\(\s*"\/events\/:eventId\/registrations\/export",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    eventSource,
    /app\.patch\(\s*"\/events\/:eventId",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    eventSource,
    /app\.post\(\s*"\/events\/registrations",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    eventSource,
    /app\.post\(\s*"\/events\/registrations\/status",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    eventSource,
    /app\.post\(\s*"\/events\/registrations\/check-in-token",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );

  assert.match(
    discountSource,
    /app\.get\(\s*"\/events\/:eventId\/discounts",\s*async/
  );
  assert.match(
    discountSource,
    /app\.post\(\s*"\/events\/:eventId\/discounts",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    discountSource,
    /app\.patch\(\s*"\/events\/:eventId\/discounts\/:discountId",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );

  assert.match(
    formSource,
    /app\.get\(\s*"\/events\/:eventId\/form-fields",\s*async/
  );
  assert.match(
    formSource,
    /app\.post\(\s*"\/events\/:eventId\/form-fields",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    formSource,
    /app\.patch\(\s*"\/events\/:eventId\/form-fields\/:fieldId",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
  assert.match(
    formSource,
    /app\.patch\(\s*"\/events\/:eventId\/form-fields-order",\s*\{\s*preHandler: requireRole\(\["SUPER_ADMIN", "PASTOR"\]\)/
  );
});

test("LEADER is denied event admin writes and cannot mutate another church", async () => {
  const h = await harness();

  try {
    const readable = [
      await h.app.inject({
        method: "GET",
        url: "/api/events",
        headers: { authorization: `Bearer ${h.token(accounts.leader)}` }
      }),
      await h.app.inject({
        method: "GET",
        url: `/api/events/${eventA}/discounts`,
        headers: { authorization: `Bearer ${h.token(accounts.leader)}` }
      }),
      await h.app.inject({
        method: "GET",
        url: `/api/events/${eventA}/form-fields`,
        headers: { authorization: `Bearer ${h.token(accounts.leader)}` }
      })
    ];

    for (const response of readable) {
      assert.equal(response.statusCode, 200);
    }

    for (const route of writeRoutes) {
      const denied = await h.app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
        headers: { authorization: `Bearer ${h.token(accounts.leader)}` }
      });
      assert.equal(denied.statusCode, 403);
      assert.equal(denied.json().error, "FORBIDDEN");
    }

    assert.equal(h.writes.length, 0);
  } finally {
    await h.app.close();
  }
});

test("event admin writes stay isolated by churchId from the token", async () => {
  const h = await harness();

  try {
    const unauthorized = await h.app.inject({
      method: "POST",
      url: "/api/events",
      payload: createEventPayload
    });
    assert.equal(unauthorized.statusCode, 401);

    for (const route of writeRoutes) {
      if (!route.crossTenantError) {
        continue;
      }

      const crossTenant = await h.app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
        headers: { authorization: `Bearer ${h.token(accounts.other)}` }
      });
      assert.equal(crossTenant.statusCode, 404);
      assert.equal(crossTenant.json().error, route.crossTenantError);
    }

    assert.equal(h.writes.length, 0);

    for (const route of writeRoutes) {
      const allowed = await h.app.inject({
        method: route.method,
        url: route.url,
        payload: route.payload,
        headers: { authorization: `Bearer ${h.token(accounts.pastor)}` }
      });
      assert.equal(
        allowed.statusCode === 200 || allowed.statusCode === 201,
        true,
        `${route.method} ${route.url} => ${allowed.statusCode} ${allowed.body}`
      );
    }

    assert.equal(h.writes.length > 0, true);
    assert.equal(
      h.writes.every((write) => write.churchId === churchA),
      true
    );
  } finally {
    await h.app.close();
  }
});
