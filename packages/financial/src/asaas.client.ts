export type AsaasEnvironment = "sandbox" | "production";

export type AsaasClientConfig = {
  apiKey?: string;
  environment?: string;
};

export type AsaasRequestOptions = {
  body?: unknown;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
};

export class AsaasClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly responseBody: string
  ) {
    super(message);
    this.name = "AsaasClientError";
  }
}

function getAsaasEnvironment(environment?: string): AsaasEnvironment {
  if (environment === "production") {
    return "production";
  }

  return "sandbox";
}

function getAsaasBaseUrl(environment: AsaasEnvironment): string {
  if (environment === "production") {
    return "https://api.asaas.com/v3";
  }

  return "https://api-sandbox.asaas.com/v3";
}

export function createAsaasClient(config: AsaasClientConfig = {}) {
  const apiKey = config.apiKey ?? process.env.ASAAS_API_KEY;
  const environment = getAsaasEnvironment(
    config.environment ?? process.env.ASAAS_ENVIRONMENT
  );
  const baseUrl = getAsaasBaseUrl(environment);

  async function request<TResponse>(options: AsaasRequestOptions): Promise<TResponse> {
    if (!apiKey) {
      throw new Error("ASAAS_API_KEY_REQUIRED");
    }

    const normalizedPath = options.path.startsWith("/")
      ? options.path
      : `/${options.path}`;

    const requestInit: RequestInit = {
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "SistemaIgrejas/0.1.0",
        access_token: apiKey
      },
      method: options.method ?? "GET"
    };

    if (options.body) {
      requestInit.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${baseUrl}${normalizedPath}`, requestInit);

    const responseBody = await response.text();

    if (!response.ok) {
      throw new AsaasClientError(
        `Asaas request failed with status ${response.status}.`,
        response.status,
        responseBody
      );
    }

    if (!responseBody) {
      return {} as TResponse;
    }

    return JSON.parse(responseBody) as TResponse;
  }

  return {
    environment,
    request
  };
}
