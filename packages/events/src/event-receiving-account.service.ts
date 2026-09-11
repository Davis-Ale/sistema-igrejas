import type { Prisma, PrismaClient } from "@prisma/client";
import type { UpsertEventsReceivingAccountInput } from "./event-receiving-account.schema.js";
import { findFinancialInstitution } from "./financial-institutions.catalog.js";

export type EventsReceivingAccountActor = {
  userId: string;
  role: string;
};

export type EventsReceivingAccountMasked = {
  bankCode: string;
  institutionName: string | null;
  bankAccountType: "CONTA_CORRENTE" | "CONTA_POUPANCA";
  agencyMasked: string;
  accountMasked: string;
  ownerNameMasked: string;
  documentMasked: string;
  updatedAt: string;
};

export type EventsReceivingAccountView = {
  configured: boolean;
  canUpdate: boolean;
  account: EventsReceivingAccountMasked | null;
};

type StoredReceivingAccount = {
  bankCode: string;
  bankAccountType: string;
  agency: string;
  accountNumber: string;
  ownerName: string;
  holderDocument: string;
  updatedAt: Date;
};

export function canUpdateEventsReceivingAccount(role: string | undefined) {
  return role === "SUPER_ADMIN" || role === "PASTOR";
}

function maskAgency(agency: string) {
  if (agency.length <= 1) {
    return "*";
  }

  return `${"*".repeat(agency.length - 1)}${agency.slice(-1)}`;
}

function maskAccountNumber(accountNumber: string) {
  const lastDigits = accountNumber.slice(-4);

  return `****${lastDigits}`;
}

function maskOwnerName(ownerName: string) {
  const parts = ownerName.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) {
    return "—";
  }

  if (parts.length === 1) {
    return parts[0] ?? "—";
  }

  const firstName = parts[0] ?? "";
  const lastInitial = parts[parts.length - 1]?.charAt(0) ?? "";

  return `${firstName} ${lastInitial}.`.trim();
}

function maskDocument(digits: string) {
  if (digits.length === 11) {
    return `***.***.***-${digits.slice(-2)}`;
  }

  if (digits.length === 14) {
    return `**.***.***/****-${digits.slice(-2)}`;
  }

  return "****";
}

function toMaskedAccount(
  row: StoredReceivingAccount
): EventsReceivingAccountMasked {
  return {
    bankCode: row.bankCode,
    institutionName:
      findFinancialInstitution(row.bankCode)?.institutionName ?? null,
    bankAccountType:
      row.bankAccountType === "CONTA_POUPANCA"
        ? "CONTA_POUPANCA"
        : "CONTA_CORRENTE",
    agencyMasked: maskAgency(row.agency),
    accountMasked: maskAccountNumber(row.accountNumber),
    ownerNameMasked: maskOwnerName(row.ownerName),
    documentMasked: maskDocument(row.holderDocument),
    updatedAt: row.updatedAt.toISOString()
  };
}

function buildMaskedSnapshot(account: EventsReceivingAccountMasked) {
  return {
    bankCode: account.bankCode,
    institutionName: account.institutionName,
    bankAccountType: account.bankAccountType,
    agencyMasked: account.agencyMasked,
    accountMasked: account.accountMasked,
    ownerNameMasked: account.ownerNameMasked,
    documentMasked: account.documentMasked
  };
}

export async function getEventsReceivingAccount(
  prisma: PrismaClient,
  churchId: string,
  role: string | undefined
): Promise<EventsReceivingAccountView> {
  const canUpdate = canUpdateEventsReceivingAccount(role);
  const row = await prisma.eventsReceivingAccount.findUnique({
    where: {
      churchId
    },
    select: {
      bankCode: true,
      bankAccountType: true,
      agency: true,
      accountNumber: true,
      ownerName: true,
      holderDocument: true,
      updatedAt: true
    }
  });

  if (!row) {
    return {
      configured: false,
      canUpdate,
      account: null
    };
  }

  return {
    configured: true,
    canUpdate,
    account: toMaskedAccount(row)
  };
}

export async function upsertEventsReceivingAccount(
  prisma: PrismaClient,
  churchId: string,
  actor: EventsReceivingAccountActor,
  input: UpsertEventsReceivingAccountInput
): Promise<EventsReceivingAccountView> {
  if (!canUpdateEventsReceivingAccount(actor.role)) {
    throw new Error("FINANCIAL_ACCESS_DENIED");
  }

  const church = await prisma.church.findFirst({
    where: {
      id: churchId
    },
    select: {
      id: true
    }
  });

  if (!church) {
    throw new Error("CHURCH_CONTEXT_REQUIRED");
  }

  const accountDigit = input.accountDigit.toUpperCase();
  const existing = await prisma.eventsReceivingAccount.findUnique({
    where: {
      churchId
    },
    select: {
      id: true
    }
  });

  const saved = await prisma.$transaction(async (transaction) => {
    const row = await transaction.eventsReceivingAccount.upsert({
      where: {
        churchId
      },
      update: {
        provider: "ASAAS",
        bankCode: input.bankCode,
        bankAccountType: input.bankAccountType,
        agency: input.agency,
        accountNumber: input.account,
        accountDigit,
        ownerName: input.ownerName,
        holderDocument: input.cpfCnpj,
        updatedByUserId: actor.userId
      },
      create: {
        churchId,
        provider: "ASAAS",
        bankCode: input.bankCode,
        bankAccountType: input.bankAccountType,
        agency: input.agency,
        accountNumber: input.account,
        accountDigit,
        ownerName: input.ownerName,
        holderDocument: input.cpfCnpj,
        createdByUserId: actor.userId,
        updatedByUserId: actor.userId
      },
      select: {
        id: true,
        bankCode: true,
        bankAccountType: true,
        agency: true,
        accountNumber: true,
        ownerName: true,
        holderDocument: true,
        updatedAt: true
      }
    });

    const masked = toMaskedAccount(row);

    await transaction.eventsReceivingAccountAudit.create({
      data: {
        churchId,
        receivingAccountId: row.id,
        action: existing ? "UPDATED" : "CREATED",
        actorUserId: actor.userId,
        actorRole: actor.role,
        maskedSnapshot: buildMaskedSnapshot(
          masked
        ) as Prisma.InputJsonValue
      }
    });

    return masked;
  });

  return {
    configured: true,
    canUpdate: true,
    account: saved
  };
}
