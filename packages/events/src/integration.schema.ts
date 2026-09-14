import { z } from "zod";

export const EVENT_INTEGRATION_PROVIDER_SLUGS = [
  "google-analytics",
  "google-ads",
  "meta-pixel",
  "whatsapp-business-cloud",
  "mailchimp",
  "rd-station"
] as const;

export type EventIntegrationProviderSlug =
  (typeof EVENT_INTEGRATION_PROVIDER_SLUGS)[number];

export const EVENT_INTEGRATION_PROVIDERS = [
  "GOOGLE_ANALYTICS",
  "GOOGLE_ADS",
  "META_PIXEL",
  "WHATSAPP_BUSINESS_CLOUD",
  "MAILCHIMP",
  "RD_STATION"
] as const;

export type EventIntegrationProviderName =
  (typeof EVENT_INTEGRATION_PROVIDERS)[number];

export const PROVIDER_SLUG_TO_ENUM: Record<
  EventIntegrationProviderSlug,
  EventIntegrationProviderName
> = {
  "google-analytics": "GOOGLE_ANALYTICS",
  "google-ads": "GOOGLE_ADS",
  "meta-pixel": "META_PIXEL",
  "whatsapp-business-cloud": "WHATSAPP_BUSINESS_CLOUD",
  mailchimp: "MAILCHIMP",
  "rd-station": "RD_STATION"
};

export const MEASUREMENT_ID_REGEX = /^G-[A-Z0-9]+$/;
export const CONVERSION_ID_REGEX = /^AW-\d+$/;
export const CONVERSION_LABEL_REGEX = /^[A-Za-z0-9_-]+$/;
export const PIXEL_ID_REGEX = /^\d{5,20}$/;
export const MAILCHIMP_API_KEY_REGEX = /^([0-9a-f]+)-([a-z]{2}\d+)$/i;
export const PHONE_NUMBER_ID_REGEX = /^\d{5,20}$/;

export const eventIntegrationProviderParamsSchema = z.object({
  provider: z.enum(EVENT_INTEGRATION_PROVIDER_SLUGS)
});

export const connectGoogleAnalyticsSchema = z.object({
  measurementId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(MEASUREMENT_ID_REGEX, "Informe um Measurement ID GA4 válido.")
});

export const connectGoogleAdsSchema = z.object({
  conversionId: z
    .string()
    .trim()
    .toUpperCase()
    .regex(CONVERSION_ID_REGEX, "Informe um Conversion ID válido (AW-)."),
  conversionLabel: z
    .string()
    .trim()
    .regex(
      CONVERSION_LABEL_REGEX,
      "Informe o rótulo de conversão (apenas letras, números, _ ou -)."
    )
    .min(1, "Informe o rótulo de conversão.")
    .max(80, "Rótulo de conversão deve ter até 80 caracteres.")
});

export const connectMetaPixelSchema = z.object({
  pixelId: z
    .string()
    .trim()
    .regex(PIXEL_ID_REGEX, "Informe um Pixel ID numérico válido.")
});

export const connectMailchimpSchema = z.object({
  apiKey: z
    .string()
    .trim()
    .regex(
      MAILCHIMP_API_KEY_REGEX,
      "Informe uma API key do Mailchimp no formato correto."
    )
});

export const connectWhatsAppSchema = z.object({
  accessToken: z
    .string()
    .trim()
    .min(20, "Informe o token de acesso da WhatsApp Business Cloud.")
    .max(4096, "Token de acesso inválido."),
  phoneNumberId: z
    .string()
    .trim()
    .regex(PHONE_NUMBER_ID_REGEX, "Informe o Phone Number ID numérico.")
});

export type ConnectGoogleAnalyticsInput = z.infer<
  typeof connectGoogleAnalyticsSchema
>;
export type ConnectGoogleAdsInput = z.infer<typeof connectGoogleAdsSchema>;
export type ConnectMetaPixelInput = z.infer<typeof connectMetaPixelSchema>;
export type ConnectMailchimpInput = z.infer<typeof connectMailchimpSchema>;
export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;
