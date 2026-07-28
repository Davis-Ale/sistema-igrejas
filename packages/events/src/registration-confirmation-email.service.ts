import QRCode from "qrcode";
import { Resend } from "resend";

type RegistrationConfirmationEmailInput = {
  registrationId: string;
  recipientEmail: string;
  participantName: string;
  checkInToken: string;
  registrationStatus: string;
  paymentStatus: string;
  waitlistedAt: Date | string | null;
  event: {
    title: string;
    date: Date | string;
    isPaid: boolean;
    slug: string;
    publicSlug: string | null;
    churchSlug: string;
  };
};

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatDate(value: Date | string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(new Date(value));
}

function getRegistrationStatus(
  input: RegistrationConfirmationEmailInput
) {
  if (input.registrationStatus === "CHECKED_IN") {
    return "Check-in realizado";
  }

  if (input.waitlistedAt) {
    return "Lista de espera";
  }

  if (input.registrationStatus === "CONFIRMED") {
    return "Confirmada";
  }

  return "Pendente";
}

function getPaymentStatus(
  input: RegistrationConfirmationEmailInput
) {
  if (!input.event.isPaid) {
    return "Não necessário";
  }

  if (input.paymentStatus === "PAID") {
    return "Pago";
  }

  if (input.paymentStatus === "CANCELLED") {
    return "Cancelado";
  }

  return "Pendente";
}

export async function sendRegistrationConfirmationEmail(
  input: RegistrationConfirmationEmailInput
): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.error(
      "RESEND_API_KEY não configurada. E-mail de inscrição não enviado."
    );

    return false;
  }

  const resend = new Resend(apiKey);

  const appBaseUrl =
    process.env.EVENTS_APP_BASE_URL ??
    "http://localhost:3001";

  const appPath = input.event.publicSlug
    ? `/${encodeURIComponent(input.event.publicSlug)}#aplicativo`
    : `/${encodeURIComponent(input.event.churchSlug)}/${encodeURIComponent(input.event.slug)}#aplicativo`;

  const appUrl = `${appBaseUrl}${appPath}`;

  const qrCode = await QRCode.toBuffer(
    input.checkInToken,
    {
      margin: 1,
      type: "png",
      width: 320
    }
  );

  const participantName =
    escapeHtml(input.participantName);

  const eventTitle =
    escapeHtml(input.event.title);

  const registrationStatus =
    escapeHtml(getRegistrationStatus(input));

  const paymentStatus =
    escapeHtml(getPaymentStatus(input));

  const checkInToken =
    escapeHtml(input.checkInToken);

  const { error } = await resend.emails.send(
    {
      from:
        process.env.EVENTS_EMAIL_FROM ??
        "Sistema Igrejas <onboarding@resend.dev>",
      to: [input.recipientEmail],
      subject: `Inscrição - ${input.event.title}`,
      html: `
        <div style="background:#020617;padding:32px;font-family:Arial,sans-serif;color:#f8fafc">
          <div style="max-width:600px;margin:0 auto;background:#0f172a;border:1px solid #334155;border-radius:20px;padding:28px">
            <h1 style="margin:0 0 8px;color:#ffffff">${eventTitle}</h1>

            <p style="margin:0 0 24px;color:#cbd5e1">
              ${escapeHtml(formatDate(input.event.date))}
            </p>

            <h2 style="margin:0 0 8px;color:#ffffff">
              ${participantName}
            </h2>

            <p style="color:#cbd5e1">
              Inscrição: <strong style="color:#ffffff">${registrationStatus}</strong>
            </p>

            <p style="color:#cbd5e1">
              Pagamento: <strong style="color:#ffffff">${paymentStatus}</strong>
            </p>

            <div style="margin:28px 0;text-align:center">
              <img
                src="cid:event-registration-qr-code"
                alt="QR Code da inscrição"
                width="260"
                height="260"
                style="background:#ffffff;border-radius:18px;padding:12px"
              />
            </div>

            <p style="margin:0 0 8px;color:#94a3b8;font-size:13px">
              Código de check-in
            </p>

            <p style="margin:0 0 26px;color:#ffffff;font-family:monospace;font-weight:bold;word-break:break-all">
              ${checkInToken}
            </p>

            <a
              href="${appUrl}"
              style="display:block;background:#2563eb;border-radius:14px;color:#ffffff;font-weight:bold;padding:15px 20px;text-align:center;text-decoration:none"
            >
              Acessar aplicativo do evento
            </a>
          </div>
        </div>
      `,
      attachments: [
        {
          content: qrCode.toString("base64"),
          contentId: "event-registration-qr-code",
          filename: "credencial-evento.png"
        }
      ]
    },
    {
      idempotencyKey:
        `event-registration/${input.registrationId}`
    }
  );

  if (error) {
    console.error(
      "Erro ao enviar confirmação da inscrição:",
      error
    );

    return false;
  }

  return true;
}
