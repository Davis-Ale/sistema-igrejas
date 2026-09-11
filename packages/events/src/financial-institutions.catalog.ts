import {
  FINANCIAL_INSTITUTIONS_CATALOG_DATA,
  FINANCIAL_INSTITUTIONS_CATALOG_SOURCE as catalogSource
} from "./data/bcb-str-participants.js";

export type FinancialInstitution = {
  institutionCode: string;
  shortName: string;
  institutionName: string;
};

export const FINANCIAL_INSTITUTIONS_CATALOG_SOURCE = catalogSource;

export const FINANCIAL_INSTITUTIONS: readonly FinancialInstitution[] =
  FINANCIAL_INSTITUTIONS_CATALOG_DATA;

const institutionsByCode = new Map(
  FINANCIAL_INSTITUTIONS.map((institution) => [
    institution.institutionCode,
    institution
  ])
);

function normalizeSearchText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

export function formatFinancialInstitutionLabel(
  institution: FinancialInstitution
) {
  return `${institution.institutionCode} — ${institution.institutionName}`;
}

export function findFinancialInstitution(institutionCode: string) {
  const code = institutionCode.trim();

  if (!code || code.length > 3) {
    return undefined;
  }

  return institutionsByCode.get(code);
}

export function searchFinancialInstitutions(query: string, limit = 20) {
  const normalizedQuery = normalizeSearchText(query);

  if (!normalizedQuery) {
    return [];
  }

  const matches: Array<{
    institution: FinancialInstitution;
    rank: number;
  }> = [];

  for (const institution of FINANCIAL_INSTITUTIONS) {
    const code = normalizeSearchText(institution.institutionCode);
    const shortName = normalizeSearchText(institution.shortName);
    const name = normalizeSearchText(institution.institutionName);

    let rank = -1;

    if (code === normalizedQuery) {
      rank = 0;
    } else if (code.startsWith(normalizedQuery)) {
      rank = 1;
    } else if (
      shortName.startsWith(normalizedQuery) ||
      name.startsWith(normalizedQuery)
    ) {
      rank = 2;
    } else if (
      shortName.includes(normalizedQuery) ||
      name.includes(normalizedQuery)
    ) {
      rank = 3;
    }

    if (rank >= 0) {
      matches.push({ institution, rank });
    }
  }

  return matches
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.institution.institutionCode.localeCompare(
        right.institution.institutionCode
      );
    })
    .slice(0, Math.max(1, Math.min(limit, 50)))
    .map((match) => match.institution);
}

export function listFinancialInstitutions() {
  return FINANCIAL_INSTITUTIONS;
}
