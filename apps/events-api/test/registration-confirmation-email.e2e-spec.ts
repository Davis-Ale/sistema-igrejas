import { Resend } from "resend";
import QRCode from "qrcode";
import { sendRegistrationConfirmationEmail } from "../../../packages/events/src/registration-confirmation-email.service.js";

jest.mock("resend", () => ({ Resend: jest.fn() }));
jest.mock("qrcode", () => ({
  __esModule: true,
  default: { toBuffer: jest.fn().mockResolvedValue(Buffer.from("test-qr")) }
}));

describe("Registration confirmation email adapter (mocked transport)", () => {
  const send = jest.fn();
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalAppUrl = process.env.EVENTS_APP_BASE_URL;
  const input = {
    registrationId: "test-registration",
    recipientEmail: "participant@example.invalid",
    participantName: "Participante <Teste>",
    checkInToken: "test-credential-token",
    registrationStatus: "CONFIRMED",
    paymentStatus: "PAID",
    waitlistedAt: null,
    event: {
      title: "Evento <Teste>", date: "2026-10-10T12:00:00Z", isPaid: true,
      slug: "test-event", publicSlug: "test-public-event", churchSlug: "test-church"
    }
  };

  beforeEach(() => {
    process.env.RESEND_API_KEY = "controlled-test-key";
    process.env.EVENTS_APP_BASE_URL = "https://participant.example.invalid";
    send.mockReset().mockResolvedValue({ data: { id: "test-email" }, error: null });
    jest.mocked(Resend).mockImplementation(() => ({ emails: { send } }) as unknown as Resend);
  });

  afterAll(() => {
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalAppUrl === undefined) delete process.env.EVENTS_APP_BASE_URL;
    else process.env.EVENTS_APP_BASE_URL = originalAppUrl;
  });

  it("sends the credential attachment, escaped content and participant access with a stable idempotency key", async () => {
    expect(await sendRegistrationConfirmationEmail(input)).toBe(true);
    expect(QRCode.toBuffer).toHaveBeenCalledWith(input.checkInToken, expect.any(Object));
    const [message, options] = send.mock.calls[0]!;
    expect(message.to).toEqual([input.recipientEmail]);
    expect(message.html).toContain("Participante &lt;Teste&gt;");
    expect(message.html).toContain("Evento &lt;Teste&gt;");
    expect(message.html).toContain("Pagamento: <strong style=\"color:#ffffff\">Pago</strong>");
    expect(message.html).toContain("https://participant.example.invalid/test-public-event#aplicativo?checkInToken=test-credential-token");
    expect(message.attachments).toEqual([expect.objectContaining({
      filename: "credencial-evento.png", contentId: "event-registration-qr-code",
      content: Buffer.from("test-qr").toString("base64")
    })]);
    expect(options).toEqual({ idempotencyKey: "event-registration/test-registration" });
    await sendRegistrationConfirmationEmail(input);
    expect(send.mock.calls[1]![1]).toEqual(options);
  });

  it("reports provider rejection without claiming delivery", async () => {
    send.mockResolvedValue({ error: { name: "test_error", message: "Controlled rejection" } });
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sendRegistrationConfirmationEmail(input)).toBe(false);
    } finally { log.mockRestore(); }
  });

  it("does not call the provider when the API key is missing", async () => {
    delete process.env.RESEND_API_KEY;
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await sendRegistrationConfirmationEmail(input)).toBe(false);
      expect(send).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
});
