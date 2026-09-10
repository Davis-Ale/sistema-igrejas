export const CSV_UTF8_BOM = "\uFEFF";
export const CSV_DELIMITER = ";";
export const CSV_TIME_ZONE = "America/Sao_Paulo";

const FORMULA_INJECTION_PREFIX = /^[=+\-@\t\r]/;

export function neutralizeCsvFormula(value: string) {
  if (FORMULA_INJECTION_PREFIX.test(value)) {
    return `'${value}`;
  }

  return value;
}

export function csvCell(value: string) {
  const safe = neutralizeCsvFormula(value);
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvLine(values: readonly string[]) {
  return values.map((value) => csvCell(value)).join(CSV_DELIMITER);
}

export function formatCsvDateTime(date: Date) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: CSV_TIME_ZONE,
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("day")}/${read("month")}/${read("year")} ${read("hour")}:${read("minute")}`;
}

export function formatCsvFilenameDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CSV_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(date);

  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return `${read("year")}-${read("month")}-${read("day")}`;
}

export function sanitizeCsvFilenamePart(value: string) {
  const sanitized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);

  return sanitized || "evento";
}
