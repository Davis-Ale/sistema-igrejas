import { z } from "zod";

export const listCitiesQuerySchema = z.object({
  state: z
    .string()
    .trim()
    .regex(/^[A-Za-z]{2}$/, "UF inválida.")
    .transform((value) => value.toUpperCase())
});

export const postalCodeParamsSchema = z.object({
  postalCode: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .pipe(z.string().regex(/^\d{8}$/, "CEP inválido."))
});

export type ListCitiesQueryInput = z.infer<typeof listCitiesQuerySchema>;
export type PostalCodeParamsInput = z.infer<typeof postalCodeParamsSchema>;
