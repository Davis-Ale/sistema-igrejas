import { z } from "zod";
import { findFinancialInstitution } from "./financial-institutions.catalog.js";

const emptyToUndefined = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  return trimmed;
};

function onlyDigits(value: string) {
  return value.replace(/\D/g, "");
}

export const eventsReceivingBankAccountTypeSchema = z.enum([
  "CONTA_CORRENTE",
  "CONTA_POUPANCA"
]);

export const upsertEventsReceivingAccountSchema = z.object({
  bankCode: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .min(1, "Selecione uma instituição financeira válida.")
      .max(3, "Selecione uma instituição financeira válida.")
      .refine((code) => Boolean(findFinancialInstitution(code)), {
        message: "Selecione uma instituição financeira válida."
      })
  ),
  bankAccountType: eventsReceivingBankAccountTypeSchema,
  agency: z.preprocess(emptyToUndefined, z.string().trim().regex(/^\d{1,6}$/, "Informe a agência.")),
  account: z.preprocess(
    emptyToUndefined,
    z.string().trim().regex(/^\d{1,12}$/, "Informe o número da conta.")
  ),
  accountDigit: z.preprocess(
    emptyToUndefined,
    z
      .string()
      .trim()
      .regex(/^[0-9Xx]{1,2}$/, "Informe o dígito da conta.")
  ),
  ownerName: z.preprocess(
    emptyToUndefined,
    z.string().trim().min(3, "Informe o nome do titular.").max(120)
  ),
  cpfCnpj: z.preprocess((value) => {
    if (typeof value !== "string") {
      return value;
    }

    const digits = onlyDigits(value);

    if (!digits) {
      return undefined;
    }

    return digits;
  }, z.string().regex(/^\d{11}$|^\d{14}$/, "Informe um CPF ou CNPJ válido."))
});

export type UpsertEventsReceivingAccountInput = z.infer<
  typeof upsertEventsReceivingAccountSchema
>;
