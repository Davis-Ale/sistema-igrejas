import { MAILCHIMP_API_KEY_REGEX } from "./integration.schema.js";

export type IntegrationHttpClient = (
  input: string,
  init?: RequestInit
) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 8000;

function defaultHttp(
  input: string,
  init?: RequestInit
): Promise<Response> {
  return globalThis.fetch(input, init);
}

export function parseMailchimpApiKey(apiKey: string) {
  const match = MAILCHIMP_API_KEY_REGEX.exec(apiKey.trim());
  const hex = match?.[1];
  const datacenter = match?.[2];

  if (!hex || !datacenter) {
    return null;
  }

  return {
    apiKey: apiKey.trim(),
    datacenter: datacenter.toLowerCase()
  };
}

export async function pingMailchimp(
  apiKey: string,
  datacenter: string,
  http: IntegrationHttpClient = defaultHttp
): Promise<boolean> {
  const response = await http(
    `https://${datacenter}.api.mailchimp.com/3.0/ping`,
    {
      method: "GET",
      headers: {
        Authorization: `apikey ${apiKey}`
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }
  );

  return response.status === 200;
}

export async function verifyWhatsAppBusinessCloud(
  accessToken: string,
  phoneNumberId: string,
  http: IntegrationHttpClient = defaultHttp
): Promise<{ displayPhoneNumber: string | null } | null> {
  const url = new URL(
    `https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}`
  );
  url.searchParams.set("fields", "display_phone_number,verified_name");
  url.searchParams.set("access_token", accessToken);

  const response = await http(url.toString(), {
    method: "GET",
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });

  if (response.status !== 200) {
    return null;
  }

  try {
    const body = (await response.json()) as {
      display_phone_number?: unknown;
    };

    return {
      displayPhoneNumber:
        typeof body.display_phone_number === "string" &&
        body.display_phone_number.trim()
          ? body.display_phone_number.trim()
          : null
    };
  } catch {
    return null;
  }
}
