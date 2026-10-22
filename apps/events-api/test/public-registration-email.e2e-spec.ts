import type { PrismaClient } from "@prisma/client";
import Fastify from "fastify";
import { createPublicRegistrationSchema } from "../../../packages/events/src/event.schema.js";
import { registerPublicEventRoutes } from "../../../packages/events/src/public.routes.js";

describe("Public registration email contract", () => {
  const base = {
    name: "Participante Teste",
    phone: "41999990001",
    ticketId: "ticket-test",
    ticketBatchId: "batch-test",
    answers: [{ fieldId: "custom-field", value: "resposta" }]
  };

  it.each([
    "/public/churches/igreja/events/evento/register",
    "/public/events/evento/register"
  ])("rejects missing and blank email before accessing persistence at %s", async (url) => {
    const app = Fastify();
    await registerPublicEventRoutes(app, {} as PrismaClient);
    try {
      for (const email of [undefined, "", "   "]) {
        const payload = email === undefined ? base : { ...base, email };
        const response = await app.inject({ method: "POST", url, payload });
        expect(response.statusCode).toBe(400);
        expect(response.json().error).toBe("VALIDATION_ERROR");
      }
    } finally {
      await app.close();
    }
  });

  it.each([
    { label: "free", paymentMethod: "PIX", cpf: undefined },
    { label: "paid", paymentMethod: "CREDIT_CARD", cpf: "52998224725" },
    { label: "pending payment resume", paymentMethod: "PIX", cpf: "52998224725" }
  ])("keeps the $label payload and custom answers valid with email", ({ paymentMethod, cpf }) => {
    const payload = {
      ...base,
      email: "  participante@example.com  ",
      paymentMethod,
      ...(cpf ? { cpf } : {})
    };
    const first = createPublicRegistrationSchema.parse(payload);
    const retry = createPublicRegistrationSchema.parse(payload);
    expect(first.email).toBe("participante@example.com");
    expect(retry).toEqual(first);
    expect(first.answers).toEqual(base.answers);
  });
});
