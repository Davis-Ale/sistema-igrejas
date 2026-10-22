import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@sistema-igrejas/database";
import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app.js";
import { config } from "dotenv";
import { sendRegistrationConfirmationEmail } from "../../../packages/events/src/registration-confirmation-email.service.js";
import { checkInRegistrationByToken } from "../../../packages/events/src/event.service.js";

jest.mock("../../../packages/events/src/registration-confirmation-email.service.js", () => ({
  sendRegistrationConfirmationEmail: jest.fn().mockResolvedValue(true)
}));

describe("Public checkout journey", () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  let churchId = "";
  let eventId = "";
  let ticketId = "";
  let batchId = "";
  let freeTicketId = "";
  let freeBatchId = "";
  let chargeCount = 0;
  let providerStatus = "PENDING";
  let providerReference = "";
  let failNextPixRequest = false;
  const providerPayments = new Map<string, { id: string; billingType: string; value: number; invoiceUrl: string }>();
  const runId = `checkout-${Date.now()}`;
  const base = `/public/churches/${runId}/events/${runId}`;
  const originalEnv = { ...process.env };

  beforeAll(async () => {
    config({ path: "../../.env" });
    process.env.JWT_SECRET = "public-checkout-test-secret-at-least-32-characters";
    process.env.EVENTS_TEST_PAYMENT_MODE = "";
    process.env.EVENTS_PAYMENT_PROVIDER = "ASAAS";
    process.env.ASAAS_ENVIRONMENT = "sandbox";
    process.env.ASAAS_API_KEY = "controlled-test-provider";
    process.env.ASAAS_WEBHOOK_TOKEN = "controlled-test-webhook";
    jest.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith("https://api-sandbox.asaas.com/v3/")) throw new Error("Unexpected external request");
      let data: unknown;
      if (url.endsWith("/customers")) data = { id: "test-customer" };
      else if (url.endsWith("/payments") && init?.method === "POST") {
        chargeCount++;
        const body = JSON.parse(String(init.body));
        providerReference = body.externalReference;
        const id = chargeCount === 1 ? "test-payment" : `test-payment-${chargeCount}`;
        const payment = { id, billingType: body.billingType, value: body.value, invoiceUrl: "https://sandbox.asaas.com/test" };
        providerPayments.set(id, payment);
        data = { ...payment, status: providerStatus };
      } else if (url.endsWith("/pixQrCode")) {
        if (failNextPixRequest) {
          failNextPixRequest = false;
          return new Response("{}", { status: 503 });
        }
        data = { encodedImage: "", payload: "controlled-pix-payload", expirationDate: "2027-01-01" };
      }
      else if (providerPayments.has(url.split("/").pop() ?? "")) data = { ...providerPayments.get(url.split("/").pop()!), status: providerStatus };
      else throw new Error("Unexpected provider request");
      return new Response(JSON.stringify(data), { status: 200 });
    });
    app = await buildApp();
    await app.ready();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }) });
    const church = await prisma.church.create({ data: { name: runId, slug: runId, plan: "TRIAL", status: "ACTIVE" } });
    churchId = church.id;
    const event = await prisma.event.create({ data: {
      churchId, title: runId, slug: runId, publicSlug: runId, date: new Date(Date.now() + 86400000),
      capacity: 100, isPaid: true, price: 50, isPublic: true, publicRegistrationEnabled: true
    } });
    eventId = event.id;
    await prisma.event.create({ data: {
      churchId, title: `${runId}-other`, slug: `${runId}-other`, date: new Date(), capacity: 10, isPublic: true
    } });
    for (const free of [false, true]) {
      const ticket = await prisma.eventTicket.create({ data: { churchId, eventId, name: free ? "Gratuito" : "Pago", isFree: free, isVisible: true } });
      const batch = await prisma.ticketBatch.create({ data: {
        churchId, eventId, ticketId: ticket.id, name: "Lote", quantity: 100, price: free ? 0 : 50,
        salesStart: new Date(Date.now() - 60000), salesEnd: new Date(Date.now() + 86400000), isVisible: true
      } });
      if (free) { freeTicketId = ticket.id; freeBatchId = batch.id; }
      else { ticketId = ticket.id; batchId = batch.id; }
    }
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    if (prisma) {
      if (churchId) {
        await prisma.registration.deleteMany({ where: { churchId } });
        await prisma.eventPayment.deleteMany({ where: { churchId } });
        await prisma.eventOrder.deleteMany({ where: { churchId } });
        await prisma.transaction.deleteMany({ where: { churchId } });
        await prisma.church.delete({ where: { id: churchId } });
      }
      await prisma.$disconnect();
    }
    if (app) await app.close();
    for (const key of ["JWT_SECRET", "EVENTS_TEST_PAYMENT_MODE", "EVENTS_PAYMENT_PROVIDER", "ASAAS_ENVIRONMENT", "ASAAS_API_KEY", "ASAAS_WEBHOOK_TOKEN"]) {
      if (originalEnv[key] === undefined) delete process.env[key]; else process.env[key] = originalEnv[key];
    }
  });

  it("registers, resumes one charge, rejects invalid webhooks, confirms and recovers an interrupted confirmation", async () => {
    const payload = { name: "Participante Teste", phone: "41999990001", email: `${runId}@example.invalid`, cpf: "52998224725", paymentMethod: "PIX", ticketId, ticketBatchId: batchId, answers: [] };
    const [created, simultaneous] = await Promise.all([
      app.inject({ method: "POST", url: `${base}/register`, payload }),
      app.inject({ method: "POST", url: `${base}/register`, payload })
    ]);
    expect(created.statusCode).toBe(201);
    const registration = created.json();
    expect(simultaneous.statusCode).toBeLessThan(300);
    expect(simultaneous.json().id).toBe(registration.id);
    expect(registration.paymentStatus).toBe("PENDING");
    expect(registration.checkInToken).toBeNull();
    expect(registration.paymentCheckout.pix.payload).toBe("controlled-pix-payload");
    expect(sendRegistrationConfirmationEmail).not.toHaveBeenCalled();
    const resumed = await app.inject({ method: "POST", url: `${base}/register`, payload });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().id).toBe(registration.id);
    expect(chargeCount).toBe(1);
    const status = () => app.inject({ method: "POST", url: `${base}/checkout/status`, payload: { checkoutToken: registration.checkoutToken } });
    expect((await status()).json().checkInToken).toBeNull();
    const invalid = await app.inject({ method: "POST", url: `${base}/checkout/status`, payload: { checkoutToken: `${registration.id}.${"0".repeat(64)}` } });
    expect(invalid.statusCode).toBe(404);
    const webhook = { event: "PAYMENT_CONFIRMED", payment: { id: "test-payment", status: "CONFIRMED", externalReference: providerReference } };
    expect((await app.inject({ method: "POST", url: "/webhooks/asaas", payload: webhook })).statusCode).toBe(401);
    const sendWebhook = () => app.inject({ method: "POST", url: "/webhooks/asaas", headers: { "asaas-access-token": "controlled-test-webhook" }, payload: webhook });
    // Simulate a crash between persisted PAID and the registration confirmation.
    const payment = await prisma.eventPayment.findFirstOrThrow({ where: { churchId, eventId } });
    await prisma.eventPayment.update({ where: { id: payment.id }, data: { status: "PAID" } });
    expect((await sendWebhook()).statusCode).toBe(200);
    providerStatus = "CONFIRMED";
    const confirmed = (await status()).json();
    expect(confirmed.paymentStatus).toBe("PAID");
    expect(confirmed.status).toBe("CONFIRMED");
    expect(confirmed.checkInToken).toEqual(expect.any(String));
    expect(confirmed.visitor).toBeUndefined();
    expect(confirmed.paymentId).toBeUndefined();
    const wrongEvent = await app.inject({ method: "POST", url: `${base}-other/checkout/status`, payload: { checkoutToken: registration.checkoutToken } });
    expect(wrongEvent.statusCode).toBe(404);
    expect(sendRegistrationConfirmationEmail).toHaveBeenCalledTimes(1);
    const latePending = await app.inject({ method: "POST", url: "/webhooks/asaas", headers: { "asaas-access-token": "controlled-test-webhook" }, payload: {
      ...webhook, event: "PAYMENT_CREATED", payment: { ...webhook.payment, status: "PENDING" }
    } });
    expect(latePending.statusCode).toBe(200);
    expect((await status()).json().paymentStatus).toBe("PAID");
    expect((await sendWebhook()).statusCode).toBe(200);
    expect(sendRegistrationConfirmationEmail).toHaveBeenCalledTimes(1);
    expect(await prisma.transaction.count({ where: { churchId, eventId } })).toBe(1);
  });

  it("confirms a free ticket in a paid event without charging or requiring CPF", async () => {
    const response = await app.inject({ method: "POST", url: `${base}/register`, payload: {
      name: "Participante Gratuito", phone: "41999990002", email: `${runId}-free@example.invalid`, ticketId: freeTicketId, ticketBatchId: freeBatchId, answers: []
    } });
    expect(response.statusCode).toBe(201);
    expect(response.json().paymentStatus).toBe("NOT_REQUIRED");
    expect(response.json().checkInToken).toEqual(expect.any(String));
    expect(chargeCount).toBe(1);
    const checkedIn = await checkInRegistrationByToken(prisma, churchId, { eventId, checkInToken: response.json().checkInToken });
    expect(checkedIn.status).toBe("CHECKED_IN");
  });

  it("never exposes a credential for a waitlisted free registration", async () => {
    await prisma.event.update({ where: { id: eventId }, data: { capacity: 1, waitlistEnabled: true } });
    const response = await app.inject({ method: "POST", url: `${base}/register`, payload: {
      name: "Lista de Espera", phone: "41999990003", email: `${runId}-waitlist@example.invalid`, ticketId: freeTicketId, ticketBatchId: freeBatchId, answers: []
    } });
    expect(response.statusCode).toBe(201);
    expect(response.json().waitlistedAt).not.toBeNull();
    expect(response.json().checkInToken).toBeNull();
  });

  it.each(["CREDIT_CARD", "DEBIT_CARD"])("keeps %s distinct and returns the secure provider checkout", async method => {
    providerStatus = "PENDING";
    await prisma.event.update({ where: { id: eventId }, data: { capacity: 100, waitlistEnabled: false } });
    const payload = { name: `Cartão ${method}`, phone: method === "CREDIT_CARD" ? "41999990004" : "41999990005",
      email: `${runId}-${method.toLowerCase()}@example.invalid`,
      cpf: "52998224725", paymentMethod: method, ticketId, ticketBatchId: batchId, answers: [] };
    const response = await app.inject({ method: "POST", url: `${base}/register`, payload });
    expect(response.statusCode).toBe(201);
    expect(response.json().paymentCheckout).toEqual({ method, redirectUrl: "https://sandbox.asaas.com/test" });
    expect(response.json().checkInToken).toBeNull();
    const resumed = await app.inject({ method: "POST", url: `${base}/register`, payload });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().paymentCheckout.method).toBe(method);
    const payment = await prisma.eventPayment.findFirstOrThrow({ where: { churchId, order: { registrations: { some: { id: response.json().id } } } }, include: { transaction: true } });
    expect(payment.transaction.method).toBe("CARD");
  });

  it("resumes the same charge after a temporary PIX QR failure", async () => {
    providerStatus = "PENDING";
    await prisma.event.update({ where: { id: eventId }, data: { capacity: 100, waitlistEnabled: false } });
    const initialChargeCount = chargeCount;
    const payload = { name: "Retry PIX", phone: "41999990006", email: `${runId}-retry-pix@example.invalid`, cpf: "52998224725",
      paymentMethod: "PIX", ticketId, ticketBatchId: batchId, answers: [] };
    failNextPixRequest = true;
    const failed = await app.inject({ method: "POST", url: `${base}/register`, payload });
    expect(failed.statusCode).toBeGreaterThanOrEqual(400);
    expect(chargeCount).toBe(initialChargeCount + 1);
    const resumed = await app.inject({ method: "POST", url: `${base}/register`, payload });
    expect(resumed.statusCode).toBe(200);
    expect(resumed.json().paymentCheckout.pix.payload).toBe("controlled-pix-payload");
    expect(chargeCount).toBe(initialChargeCount + 1);
  });
  it.each([
    { failure: "rejection", reference: "payment", phone: "41999990007" },
    { failure: "exception", reference: "payment", phone: "41999990008" },
    { failure: "rejection", reference: "registration", phone: "41999990009" },
    { failure: "exception", reference: "registration", phone: "41999990010" }
  ])("retries a failed confirmation email ($failure, $reference reference) without duplicating delivery", async ({ failure, reference, phone }) => {
    providerStatus = "PENDING";
    await prisma.event.update({ where: { id: eventId }, data: { capacity: 100, waitlistEnabled: false } });
    const sendEmail = jest.mocked(sendRegistrationConfirmationEmail);
    sendEmail.mockReset().mockResolvedValue(true);
    const initialChargeCount = chargeCount;
    const counts = async () => ({
      registrations: await prisma.registration.count({ where: { churchId, eventId } }),
      orders: await prisma.eventOrder.count({ where: { churchId, eventId } }),
      payments: await prisma.eventPayment.count({ where: { churchId, eventId } }),
      transactions: await prisma.transaction.count({ where: { churchId, eventId } })
    });
    try {
      const created = await app.inject({ method: "POST", url: base + "/register", payload: {
        name: "Retomada de e-mail", phone,
        email: runId + "-" + failure + "-" + reference + "@example.invalid", cpf: "52998224725",
        paymentMethod: "PIX", ticketId, ticketBatchId: batchId, answers: []
      } });
      expect(created.statusCode).toBe(201);
      expect(created.json().paymentStatus).toBe("PENDING");
      expect(created.json().checkInToken).toBeNull();
      expect(sendEmail).not.toHaveBeenCalled();
      const registrationId = created.json().id as string;
      const payment = await prisma.eventPayment.findFirstOrThrow({
        where: { churchId, eventId, order: { registrations: { some: { id: registrationId } } } }
      });
      const persistedCounts = await counts();
      const sendWebhook = () => app.inject({ method: "POST", url: "/webhooks/asaas",
        headers: { "asaas-access-token": "controlled-test-webhook" }, payload: {
          event: "PAYMENT_CONFIRMED", payment: {
            id: payment.providerPaymentId, status: "CONFIRMED",
            externalReference: churchId + ":" + (reference === "payment" ? payment.id : registrationId) + ":payment"
          }
        }
      });
      if (failure === "rejection") sendEmail.mockResolvedValueOnce(false);
      else sendEmail.mockRejectedValueOnce(new Error("Controlled email failure"));
      const failedDelivery = await sendWebhook();
      expect(failedDelivery.statusCode).toBe(failure === "exception" ? 500 : 200);
      const confirmed = await prisma.registration.findFirstOrThrow({ where: { id: registrationId, churchId, eventId } });
      expect(confirmed.status).toBe("CONFIRMED");
      expect(confirmed.paymentStatus).toBe("PAID");
      expect(confirmed.confirmedAt).not.toBeNull();
      expect(confirmed.confirmationEmailSentAt).toBeNull();
      expect(sendEmail).toHaveBeenCalledTimes(1);
      const latePending = await app.inject({ method: "POST", url: "/webhooks/asaas",
        headers: { "asaas-access-token": "controlled-test-webhook" }, payload: {
          event: "PAYMENT_CREATED", payment: {
            id: payment.providerPaymentId, status: "PENDING",
            externalReference: churchId + ":" + (reference === "payment" ? payment.id : registrationId) + ":payment"
          }
        }
      });
      expect(latePending.statusCode).toBe(200);
      const otherChurch = await app.inject({ method: "POST", url: "/webhooks/asaas",
        headers: { "asaas-access-token": "controlled-test-webhook" }, payload: {
          event: "PAYMENT_CONFIRMED", payment: {
            id: payment.providerPaymentId, status: "CONFIRMED",
            externalReference: churchId + "-other:" + (reference === "payment" ? payment.id : registrationId) + ":payment"
          }
        }
      });
      expect(otherChurch.statusCode).toBe(200);
      expect(sendEmail).toHaveBeenCalledTimes(1);
      // Retry only through the webhook: checkout polling must not hide this failure.
      sendEmail.mockImplementationOnce(async () => {
        // Keep the attempt in flight while the other webhook reaches the database.
        await new Promise(resolve => setTimeout(resolve, 50));
        return true;
      });
      const retries = await Promise.all([sendWebhook(), sendWebhook()]);
      expect(retries.map(response => response.statusCode)).toEqual([200, 200]);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      expect(sendEmail.mock.calls[1]![0]).toEqual(sendEmail.mock.calls[0]![0]);
      const delivered = await prisma.registration.findFirstOrThrow({ where: { id: registrationId, churchId, eventId } });
      expect(delivered.confirmationEmailSentAt).toEqual(expect.any(Date));
      // Durable deduplication must not depend on a recent provider idempotency key.
      const sentAt = new Date(Date.now() - 7 * 86400000);
      await prisma.registration.update({ where: { id: registrationId }, data: { confirmationEmailSentAt: sentAt } });
      const repeats = await Promise.all([sendWebhook(), sendWebhook()]);
      expect(repeats.map(response => response.statusCode)).toEqual([200, 200]);
      expect(sendEmail).toHaveBeenCalledTimes(2);
      const after = await prisma.registration.findFirstOrThrow({ where: { id: registrationId, churchId, eventId } });
      expect(after.confirmationEmailSentAt).toEqual(sentAt);
      expect(after.confirmedAt).toEqual(confirmed.confirmedAt);
      expect(after.checkInToken).toBe(confirmed.checkInToken);
      expect(after.paymentId).toBe(confirmed.paymentId);
      expect(await counts()).toEqual(persistedCounts);
      expect(chargeCount).toBe(initialChargeCount + 1);
    } finally {
      sendEmail.mockReset().mockResolvedValue(true);
    }
  });

});
