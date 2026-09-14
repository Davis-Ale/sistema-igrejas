import type { EventIntegrationProviderName } from "./integration.schema.js";

export type IntegrationCategory = "Dados" | "Automação de marketing";

export type IntegrationBlockedReason = "PLATFORM_CREDENTIALS_REQUIRED";

export type IntegrationCatalogItem = {
  provider: EventIntegrationProviderName;
  name: string;
  category: IntegrationCategory;
  description: string;
  connectable: boolean;
  blockedReason: IntegrationBlockedReason | null;
  missingRequirements: string[];
};

export const EVENT_INTEGRATION_CATALOG: IntegrationCatalogItem[] = [
  {
    provider: "GOOGLE_ANALYTICS",
    name: "Google Analytics",
    category: "Dados",
    description:
      "Acompanhe as visitas da página pública dos eventos com o Google Analytics 4.",
    connectable: true,
    blockedReason: null,
    missingRequirements: []
  },
  {
    provider: "WHATSAPP_BUSINESS_CLOUD",
    name: "WhatsApp Business Cloud",
    category: "Dados",
    description:
      "Conecte a conta WhatsApp Business Cloud da igreja. O envio de mensagens fica para um passo seguinte.",
    connectable: true,
    blockedReason: null,
    missingRequirements: []
  },
  {
    provider: "GOOGLE_ADS",
    name: "Google Ads",
    category: "Dados",
    description:
      "Registre conversões da página pública com o identificador de conversão do Google Ads.",
    connectable: true,
    blockedReason: null,
    missingRequirements: []
  },
  {
    provider: "META_PIXEL",
    name: "Pixel da Meta",
    category: "Dados",
    description:
      "Meça visualizações da página pública e inscrições confirmadas com o pixel da Meta.",
    connectable: true,
    blockedReason: null,
    missingRequirements: []
  },
  {
    provider: "RD_STATION",
    name: "RD Station",
    category: "Automação de marketing",
    description:
      "A conexão com o RD Station depende do aplicativo OAuth da plataforma, ainda não configurado neste ambiente.",
    connectable: false,
    blockedReason: "PLATFORM_CREDENTIALS_REQUIRED",
    missingRequirements: [
      "Aplicativo OAuth RD Station da plataforma (client_id, client_secret e URI de redirecionamento)"
    ]
  },
  {
    provider: "MAILCHIMP",
    name: "Mailchimp",
    category: "Automação de marketing",
    description:
      "Conecte a conta Mailchimp da igreja. A sincronização de participantes e listas fica para o próximo passo.",
    connectable: true,
    blockedReason: null,
    missingRequirements: []
  }
];
