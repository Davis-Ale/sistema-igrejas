import { Prisma } from "@prisma/client";
import type { EventIntegrationProvider, PrismaClient } from "@prisma/client";
import { EVENT_INTEGRATION_CATALOG } from "./integration.catalog.js";
import {
  encryptIntegrationSecret,
  isIntegrationEncryptionConfigured,
  maskSecretHint
} from "./integration.crypto.js";
import {
  pingMailchimp,
  parseMailchimpApiKey,
  verifyWhatsAppBusinessCloud,
  type IntegrationHttpClient
} from "./integration.providers.js";
import {
  CONVERSION_ID_REGEX,
  CONVERSION_LABEL_REGEX,
  MEASUREMENT_ID_REGEX,
  PIXEL_ID_REGEX,
  connectGoogleAdsSchema,
  connectGoogleAnalyticsSchema,
  connectMailchimpSchema,
  connectMetaPixelSchema,
  connectWhatsAppSchema,
  type EventIntegrationProviderName
} from "./integration.schema.js";

export type PublicIntegrationConfig = {
  measurementId: string | null;
  conversionId: string | null;
  conversionLabel: string | null;
  pixelId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  datacenter: string | null;
};

export type EventIntegrationPublicItem = {
  provider: EventIntegrationProviderName;
  name: string;
  category: "Dados" | "Automação de marketing";
  description: string;
  status: "DISCONNECTED" | "CONNECTED" | "ERROR";
  connectable: boolean;
  blockedReason: "PLATFORM_CREDENTIALS_REQUIRED" | null;
  missingRequirements: string[];
  publicConfig: PublicIntegrationConfig | null;
  secretHint: string | null;
  connectedAt: Date | null;
  lastError: string | null;
};

export type PublicEventTracking = {
  googleAnalyticsId: string | null;
  googleAdsConversionId: string | null;
  googleAdsConversionLabel: string | null;
  metaPixelId: string | null;
};

const EMPTY_TRACKING: PublicEventTracking = {
  googleAnalyticsId: null,
  googleAdsConversionId: null,
  googleAdsConversionLabel: null,
  metaPixelId: null
};

const EMPTY_PUBLIC_CONFIG: PublicIntegrationConfig = {
  measurementId: null,
  conversionId: null,
  conversionLabel: null,
  pixelId: null,
  phoneNumberId: null,
  displayPhoneNumber: null,
  datacenter: null
};

const integrationPublicSelect = {
  provider: true,
  status: true,
  publicConfig: true,
  secretHint: true,
  connectedAt: true,
  lastError: true
} as const;

function readConfigString(
  config: Prisma.JsonValue | null | undefined,
  key: keyof PublicIntegrationConfig
): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const value = (config as Record<string, unknown>)[key];

  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function toPublicConfig(
  config: Prisma.JsonValue | null | undefined
): PublicIntegrationConfig | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return null;
  }

  const publicConfig: PublicIntegrationConfig = {
    measurementId: readConfigString(config, "measurementId"),
    conversionId: readConfigString(config, "conversionId"),
    conversionLabel: readConfigString(config, "conversionLabel"),
    pixelId: readConfigString(config, "pixelId"),
    phoneNumberId: readConfigString(config, "phoneNumberId"),
    displayPhoneNumber: readConfigString(config, "displayPhoneNumber"),
    datacenter: readConfigString(config, "datacenter")
  };

  const hasValue = Object.values(publicConfig).some((value) => value !== null);

  return hasValue ? publicConfig : null;
}

function toPublicItem(
  provider: EventIntegrationProviderName,
  row?: {
    status: "DISCONNECTED" | "CONNECTED" | "ERROR";
    publicConfig: Prisma.JsonValue | null;
    secretHint: string | null;
    connectedAt: Date | null;
    lastError: string | null;
  }
): EventIntegrationPublicItem {
  const catalog = EVENT_INTEGRATION_CATALOG.find(
    (item) => item.provider === provider
  );

  if (!catalog) {
    throw new Error("INTEGRATION_PROVIDER_INVALID");
  }

  const status = row?.status ?? "DISCONNECTED";

  return {
    provider: catalog.provider,
    name: catalog.name,
    category: catalog.category,
    description: catalog.description,
    status,
    connectable: catalog.connectable,
    blockedReason: catalog.blockedReason,
    missingRequirements: catalog.missingRequirements,
    publicConfig:
      status === "CONNECTED" ? toPublicConfig(row?.publicConfig) : null,
    secretHint: status === "CONNECTED" ? (row?.secretHint ?? null) : null,
    connectedAt: status === "CONNECTED" ? (row?.connectedAt ?? null) : null,
    lastError: status === "ERROR" ? (row?.lastError ?? null) : null
  };
}

async function persistConnected(
  prisma: PrismaClient,
  churchId: string,
  provider: EventIntegrationProvider,
  publicConfig: Prisma.InputJsonObject,
  encryptedSecrets: string | null,
  secretHint: string | null
) {
  const now = new Date();

  return prisma.eventIntegration.upsert({
    where: {
      churchId_provider: {
        churchId,
        provider
      }
    },
    create: {
      churchId,
      provider,
      status: "CONNECTED",
      publicConfig,
      encryptedSecrets,
      secretHint,
      lastError: null,
      connectedAt: now,
      disconnectedAt: null
    },
    update: {
      status: "CONNECTED",
      publicConfig,
      encryptedSecrets,
      secretHint,
      lastError: null,
      connectedAt: now,
      disconnectedAt: null
    },
    select: integrationPublicSelect
  });
}

export async function listEventIntegrations(
  prisma: PrismaClient,
  churchId: string
): Promise<EventIntegrationPublicItem[]> {
  const rows = await prisma.eventIntegration.findMany({
    where: {
      churchId
    },
    select: integrationPublicSelect
  });

  const byProvider = new Map(
    rows.map((row) => [row.provider as EventIntegrationProviderName, row])
  );

  return EVENT_INTEGRATION_CATALOG.map((item) =>
    toPublicItem(item.provider, byProvider.get(item.provider))
  );
}

export async function connectEventIntegration(
  prisma: PrismaClient,
  churchId: string,
  provider: EventIntegrationProviderName,
  body: unknown,
  http?: IntegrationHttpClient
): Promise<EventIntegrationPublicItem> {
  if (provider === "RD_STATION") {
    throw new Error("INTEGRATION_NOT_CONNECTABLE");
  }

  if (provider === "GOOGLE_ANALYTICS") {
    const input = connectGoogleAnalyticsSchema.parse(body);
    const row = await persistConnected(
      prisma,
      churchId,
      provider,
      { measurementId: input.measurementId },
      null,
      null
    );

    return toPublicItem(provider, row);
  }

  if (provider === "GOOGLE_ADS") {
    const input = connectGoogleAdsSchema.parse(body);
    const row = await persistConnected(
      prisma,
      churchId,
      provider,
      {
        conversionId: input.conversionId,
        conversionLabel: input.conversionLabel
      },
      null,
      null
    );

    return toPublicItem(provider, row);
  }

  if (provider === "META_PIXEL") {
    const input = connectMetaPixelSchema.parse(body);
    const row = await persistConnected(
      prisma,
      churchId,
      provider,
      { pixelId: input.pixelId },
      null,
      null
    );

    return toPublicItem(provider, row);
  }

  if (provider === "MAILCHIMP") {
    const input = connectMailchimpSchema.parse(body);
    const parsed = parseMailchimpApiKey(input.apiKey);

    if (!parsed) {
      throw new Error("VALIDATION_ERROR");
    }

    if (!isIntegrationEncryptionConfigured()) {
      throw new Error("INTEGRATION_ENCRYPTION_NOT_CONFIGURED");
    }

    let accepted = false;

    try {
      accepted = await pingMailchimp(
        parsed.apiKey,
        parsed.datacenter,
        http
      );
    } catch {
      throw new Error("INTEGRATION_PROVIDER_REJECTED");
    }

    if (!accepted) {
      throw new Error("INTEGRATION_PROVIDER_REJECTED");
    }

    const row = await persistConnected(
      prisma,
      churchId,
      provider,
      { datacenter: parsed.datacenter },
      encryptIntegrationSecret(parsed.apiKey),
      maskSecretHint(parsed.apiKey)
    );

    return toPublicItem(provider, row);
  }

  if (provider === "WHATSAPP_BUSINESS_CLOUD") {
    const input = connectWhatsAppSchema.parse(body);

    if (!isIntegrationEncryptionConfigured()) {
      throw new Error("INTEGRATION_ENCRYPTION_NOT_CONFIGURED");
    }

    let verified: { displayPhoneNumber: string | null } | null = null;

    try {
      verified = await verifyWhatsAppBusinessCloud(
        input.accessToken,
        input.phoneNumberId,
        http
      );
    } catch {
      throw new Error("INTEGRATION_PROVIDER_REJECTED");
    }

    if (!verified) {
      throw new Error("INTEGRATION_PROVIDER_REJECTED");
    }

    const row = await persistConnected(
      prisma,
      churchId,
      provider,
      {
        phoneNumberId: input.phoneNumberId,
        ...(verified.displayPhoneNumber
          ? { displayPhoneNumber: verified.displayPhoneNumber }
          : {})
      },
      encryptIntegrationSecret(input.accessToken),
      maskSecretHint(input.accessToken)
    );

    return toPublicItem(provider, row);
  }

  throw new Error("INTEGRATION_PROVIDER_INVALID");
}

export async function disconnectEventIntegration(
  prisma: PrismaClient,
  churchId: string,
  provider: EventIntegrationProviderName
): Promise<EventIntegrationPublicItem> {
  const existing = await prisma.eventIntegration.findUnique({
    where: {
      churchId_provider: {
        churchId,
        provider
      }
    },
    select: {
      id: true
    }
  });

  if (!existing) {
    return toPublicItem(provider);
  }

  const row = await prisma.eventIntegration.update({
    where: {
      id: existing.id
    },
    data: {
      status: "DISCONNECTED",
      publicConfig: Prisma.DbNull,
      encryptedSecrets: null,
      secretHint: null,
      lastError: null,
      disconnectedAt: new Date()
    },
    select: integrationPublicSelect
  });

  return toPublicItem(provider, row);
}

export async function getPublicEventTracking(
  prisma: PrismaClient,
  eventId: string
): Promise<PublicEventTracking> {
  const event = await prisma.event.findFirst({
    where: {
      id: eventId
    },
    select: {
      churchId: true
    }
  });

  if (!event) {
    return { ...EMPTY_TRACKING };
  }

  const rows = await prisma.eventIntegration.findMany({
    where: {
      churchId: event.churchId,
      status: "CONNECTED",
      provider: {
        in: ["GOOGLE_ANALYTICS", "GOOGLE_ADS", "META_PIXEL"]
      }
    },
    select: {
      provider: true,
      publicConfig: true
    }
  });

  const tracking = { ...EMPTY_TRACKING };

  for (const row of rows) {
    const config = toPublicConfig(row.publicConfig) ?? EMPTY_PUBLIC_CONFIG;

    if (row.provider === "GOOGLE_ANALYTICS") {
      const measurementId = config.measurementId;

      tracking.googleAnalyticsId =
        measurementId && MEASUREMENT_ID_REGEX.test(measurementId)
          ? measurementId
          : null;
    }

    if (row.provider === "GOOGLE_ADS") {
      const conversionId = config.conversionId;
      const conversionLabel = config.conversionLabel;

      tracking.googleAdsConversionId =
        conversionId && CONVERSION_ID_REGEX.test(conversionId)
          ? conversionId
          : null;
      tracking.googleAdsConversionLabel =
        conversionLabel && CONVERSION_LABEL_REGEX.test(conversionLabel)
          ? conversionLabel
          : null;
    }

    if (row.provider === "META_PIXEL") {
      const pixelId = config.pixelId;

      tracking.metaPixelId =
        pixelId && PIXEL_ID_REGEX.test(pixelId) ? pixelId : null;
    }
  }

  return tracking;
}

export async function attachPublicEventTracking<T extends { id: string }>(
  prisma: PrismaClient,
  event: T
) {
  const tracking = await getPublicEventTracking(prisma, event.id);

  return {
    ...event,
    tracking
  };
}
