"use client";

import { Building2, ChevronDown, ListOrdered, Undo2 } from "lucide-react";
import Link from "next/link";
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { CreateEventModal } from "../create-event-modal";
import {
  EventModuleChrome,
  persistSelectedEventId,
  resolveAuthorizedSelectedEventId
} from "../event-module-chrome";

type LoginSession = {
  token: string;
};

type EventListItem = {
  id: string;
  title: string;
};

type EventFinancialSummary = {
  eventSales: {
    grossAmount: string | number;
    platformFeeAmount: string | number;
    netAmount: string | number;
  };
  counts: {
    paid: number;
    pending: number;
    cancelled: number;
    reversed: number;
  };
};

type EventFinancialTransaction = {
  id: string;
  eventId: string;
  eventTitle: string;
  participantName: string;
  ticketName: string | null;
  batchName: string | null;
  paymentLabel: string;
  method: "PIX" | "CARD" | "CASH" | "BOLETO";
  amount: string | number;
  grossAmount: number | null;
  platformFeeAmount: number | null;
  netAmount: number | null;
  at: string;
};

type EventFinancialListResponse = {
  items: EventFinancialTransaction[];
  pagination: {
    page: number;
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type FinancialInstitution = {
  institutionCode: string;
  shortName: string;
  institutionName: string;
};

type EventsReceivingAccountMasked = {
  bankCode: string;
  institutionName: string | null;
  bankAccountType: "CONTA_CORRENTE" | "CONTA_POUPANCA";
  agencyMasked: string;
  accountMasked: string;
  ownerNameMasked: string;
  documentMasked: string;
  updatedAt: string;
};

type EventsReceivingAccountView = {
  configured: boolean;
  canUpdate: boolean;
  account: EventsReceivingAccountMasked | null;
};

type EventsFinancialOperation = {
  id: string;
  type: "REFUND";
  status: "REQUESTED" | "PENDING" | "CONFIRMED" | "FAILED";
  amount: number;
  eventTitle: string;
  participantName: string;
  createdAt: string;
  result: string | null;
};

type EventsFinancialOperationsResponse = {
  canCreate: boolean;
  items: EventsFinancialOperation[];
  pagination: {
    page: number;
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type RefundableEventPayment = {
  transactionId: string;
  eventTitle: string;
  participantName: string;
  amount: number;
  at: string;
};

type RefundableEventPaymentsResponse = {
  canCreate: boolean;
  items: RefundableEventPayment[];
  pagination: {
    page: number;
    currentPage: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type ReceivingAccountFormState = {
  bankCode: string;
  bankAccountType: "CONTA_CORRENTE" | "CONTA_POUPANCA";
  agency: string;
  account: string;
  accountDigit: string;
  ownerName: string;
  cpfCnpj: string;
};

type ApiErrorResponse = {
  error?: string;
  message?: string;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const PAGE_LIMIT = 50;

function isAbortError(error: unknown) {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function getLoadErrorMessage(error: unknown, fallback: string) {
  if (isAbortError(error)) {
    return null;
  }

  if (error instanceof TypeError) {
    const message = error.message.toLowerCase();

    if (
      message.includes("failed to fetch") ||
      message.includes("networkerror") ||
      message.includes("load failed")
    ) {
      return "Não foi possível conectar à API. Tente novamente.";
    }
  }

  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }

  return fallback;
}

function getSessionToken() {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return null;
  }

  try {
    const parsedSession = JSON.parse(storedSession) as LoginSession;

    return parsedSession.token;
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return null;
  }
}

function formatMoney(value: string | number) {
  const numberValue =
    typeof value === "string" ? Number(value) : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

function formatSnapshotAmount(value: number | null) {
  if (value == null) {
    return "—";
  }

  return formatMoney(value);
}

function formatDateTimeCompact(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function startOfDayIso(dateValue: string) {
  return new Date(`${dateValue}T00:00:00`).toISOString();
}

function endOfDayIso(dateValue: string) {
  return new Date(`${dateValue}T23:59:59.999`).toISOString();
}

function getMethodLabel(method: EventFinancialTransaction["method"]) {
  if (method === "PIX") {
    return "PIX";
  }

  if (method === "CARD") {
    return "Cartão";
  }

  if (method === "CASH") {
    return "Dinheiro";
  }

  if (method === "BOLETO") {
    return "Boleto";
  }

  return method;
}

function getPaymentTone(label: string): "success" | "warning" | "danger" | "muted" {
  if (label === "Pago") {
    return "success";
  }

  if (label === "Pendente" || label === "Reembolso em processamento") {
    return "warning";
  }

  if (
    label === "Cancelado" ||
    label === "Reembolsado"
  ) {
    return "danger";
  }

  return "muted";
}

function getToneStyles(tone: ReturnType<typeof getPaymentTone>) {
  if (tone === "success") {
    return {
      background: "rgba(6, 78, 59, 0.42)",
      color: "#a7f3d0"
    };
  }

  if (tone === "warning") {
    return {
      background: "rgba(120, 53, 15, 0.42)",
      color: "#fde68a"
    };
  }

  if (tone === "danger") {
    return {
      background: "rgba(127, 29, 29, 0.42)",
      color: "#fecaca"
    };
  }

  return {
    background: "rgba(15, 23, 42, 0.62)",
    color: "#cbd5e1"
  };
}

function getTicketLabel(item: EventFinancialTransaction) {
  if (item.ticketName && item.batchName) {
    return `${item.ticketName} • ${item.batchName}`;
  }

  if (item.ticketName || item.batchName) {
    return item.ticketName ?? item.batchName ?? "—";
  }

  return "—";
}

const EMPTY_RECEIVING_ACCOUNT_FORM: ReceivingAccountFormState = {
  bankCode: "",
  bankAccountType: "CONTA_CORRENTE",
  agency: "",
  account: "",
  accountDigit: "",
  ownerName: "",
  cpfCnpj: ""
};

function getBankAccountTypeLabel(
  type: EventsReceivingAccountMasked["bankAccountType"]
) {
  return type === "CONTA_POUPANCA" ? "Poupança" : "Conta corrente";
}

function getReceivingAccountClosedLabel(account: EventsReceivingAccountView | null) {
  if (!account?.configured || !account.account) {
    return "Conta não cadastrada";
  }

  const bankLabel = account.account.institutionName
    ? `${account.account.bankCode} — ${account.account.institutionName}`
    : `Banco ${account.account.bankCode}`;

  return `Conta cadastrada · ${bankLabel} · ${account.account.accountMasked}`;
}

function getRefundStatusLabel(status: EventsFinancialOperation["status"]) {
  if (status === "CONFIRMED") {
    return "Confirmado";
  }

  if (status === "PENDING" || status === "REQUESTED") {
    return "Em processamento";
  }

  return "Falhou";
}

function getOperationsClosedLabel(historyTotal: number) {
  if (historyTotal > 0) {
    return `${historyTotal.toLocaleString("pt-BR")} registros`;
  }

  return "";
}

function normalizeInstitutionQuery(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

function formatInstitutionLabel(institution: Pick<
  FinancialInstitution,
  "institutionCode" | "institutionName"
>) {
  return `${institution.institutionCode} — ${institution.institutionName}`;
}

function filterFinancialInstitutions(
  institutions: FinancialInstitution[],
  query: string
) {
  const normalizedQuery = normalizeInstitutionQuery(query);

  if (!normalizedQuery) {
    return [];
  }

  return institutions
    .map((institution) => {
      const code = normalizeInstitutionQuery(institution.institutionCode);
      const shortName = normalizeInstitutionQuery(institution.shortName);
      const name = normalizeInstitutionQuery(institution.institutionName);
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

      return { institution, rank };
    })
    .filter((match) => match.rank >= 0)
    .sort((left, right) => {
      if (left.rank !== right.rank) {
        return left.rank - right.rank;
      }

      return left.institution.institutionCode.localeCompare(
        right.institution.institutionCode
      );
    })
    .slice(0, 20)
    .map((match) => match.institution);
}

type EventFinancialManagementClientProps = {
  fromEventId?: string;
};

export function EventFinancialManagementClient({
  fromEventId: _fromEventId = ""
}: EventFinancialManagementClientProps) {
  const [events, setEvents] = useState<EventListItem[]>([]);
  const [summary, setSummary] = useState<EventFinancialSummary | null>(null);
  const [items, setItems] = useState<EventFinancialTransaction[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [eventId, setEventId] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("ALL");
  const [method, setMethod] = useState("ALL");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState("");
  const [receivingAccount, setReceivingAccount] =
    useState<EventsReceivingAccountView | null>(null);
  const [receivingAccountForm, setReceivingAccountForm] =
    useState<ReceivingAccountFormState>(EMPTY_RECEIVING_ACCOUNT_FORM);
  const [isSavingAccount, setIsSavingAccount] = useState(false);
  const [operations, setOperations] = useState<EventsFinancialOperation[]>([]);
  const [operationsTotal, setOperationsTotal] = useState(0);
  const [operationsPage, setOperationsPage] = useState(1);
  const [operationsTotalPages, setOperationsTotalPages] = useState(0);
  const [canCreateRefund, setCanCreateRefund] = useState(false);
  const [refundableItems, setRefundableItems] = useState<RefundableEventPayment[]>(
    []
  );
  const [refundableTotal, setRefundableTotal] = useState(0);
  const [refundablePage, setRefundablePage] = useState(1);
  const [refundableTotalPages, setRefundableTotalPages] = useState(0);
  const [confirmingRefundId, setConfirmingRefundId] = useState<string | null>(
    null
  );
  const [isRefunding, setIsRefunding] = useState(false);
  const [financialInstitutions, setFinancialInstitutions] = useState<
    FinancialInstitution[]
  >([]);
  const [bankQuery, setBankQuery] = useState("");
  const [isBankListOpen, setIsBankListOpen] = useState(false);
  const [bankHighlightIndex, setBankHighlightIndex] = useState(0);
  const refreshGenerationRef = useRef(0);
  const refreshAbortRef = useRef<AbortController | null>(null);
  const selectedInstitution = useMemo(
    () =>
      financialInstitutions.find(
        (institution) =>
          institution.institutionCode === receivingAccountForm.bankCode
      ) ?? null,
    [financialInstitutions, receivingAccountForm.bankCode]
  );
  const bankMatches = useMemo(
    () => filterFinancialInstitutions(financialInstitutions, bankQuery),
    [bankQuery, financialInstitutions]
  );

  const hasActiveFilters = useMemo(
    () =>
      Boolean(search) ||
      Boolean(eventId) ||
      Boolean(from) ||
      Boolean(to) ||
      paymentStatus !== "ALL" ||
      method !== "ALL",
    [eventId, from, method, paymentStatus, search, to]
  );

  function buildFilterParams(includeListFilters = true) {
    const params = new URLSearchParams();

    if (eventId) {
      params.set("eventId", eventId);
    }

    if (from) {
      params.set("from", startOfDayIso(from));
    }

    if (to) {
      params.set("to", endOfDayIso(to));
    }

    if (method !== "ALL") {
      params.set("method", method);
    }

    if (includeListFilters && search) {
      params.set("search", search);
    }

    if (includeListFilters && paymentStatus !== "ALL") {
      params.set("paymentStatus", paymentStatus);
    }

    return params;
  }

  async function loadEvents(token: string, signal: AbortSignal) {
    const response = await fetch(`${API_BASE_URL}/api/events?limit=100`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal
    });

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new Error(data.message ?? "Não foi possível carregar os eventos.");
    }

    const data = (await response.json()) as { items: EventListItem[] };
    const list = data.items ?? [];
    setEvents(list);
    setSelectedEventId((current) => {
      const nextId = resolveAuthorizedSelectedEventId(list, current);

      if (nextId) {
        persistSelectedEventId(nextId);
      }

      return nextId;
    });
  }

  async function loadFinancial(
    token: string,
    currentPage: number,
    signal: AbortSignal
  ) {
    const summaryParams = buildFilterParams(false);
    const listParams = buildFilterParams(true);
    listParams.set("page", String(currentPage));
    listParams.set("limit", String(PAGE_LIMIT));

    const [summaryResponse, listResponse] = await Promise.all([
      fetch(
        `${API_BASE_URL}/api/events/financial/summary?${summaryParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal
        }
      ),
      fetch(
        `${API_BASE_URL}/api/events/financial/transactions?${listParams.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          },
          signal
        }
      )
    ]);

    if (!summaryResponse.ok) {
      const data = (await summaryResponse.json()) as ApiErrorResponse;
      throw new Error(
        data.message ?? "Não foi possível carregar o resumo financeiro."
      );
    }

    if (!listResponse.ok) {
      const data = (await listResponse.json()) as ApiErrorResponse;
      throw new Error(
        data.message ?? "Não foi possível carregar as movimentações."
      );
    }

    const summaryData = (await summaryResponse.json()) as EventFinancialSummary;
    const listData = (await listResponse.json()) as EventFinancialListResponse;

    setSummary(summaryData);
    setItems(listData.items);
    setTotal(listData.pagination.total);
    setTotalPages(listData.pagination.totalPages);
    setPage(listData.pagination.currentPage);
  }

  async function loadReceivingAccount(token: string, signal: AbortSignal) {
    const response = await fetch(
      `${API_BASE_URL}/api/events/financial/receiving-account`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal
      }
    );

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new Error(
        data.message ?? "Não foi possível carregar a conta de recebimento."
      );
    }

    const data = (await response.json()) as EventsReceivingAccountView;
    setReceivingAccount(data);

    if (!data.configured || !data.account?.bankCode) {
      setReceivingAccountForm((current) => ({
        ...current,
        bankCode: ""
      }));
      setBankQuery("");
      return;
    }

    const savedBankCode = data.account.bankCode;

    setReceivingAccountForm((current) => ({
      ...current,
      bankCode: savedBankCode
    }));
    setBankQuery("");
  }

  async function loadOperations(
    token: string,
    currentPage: number,
    signal: AbortSignal
  ) {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", String(PAGE_LIMIT));
    params.set("type", "REFUND");

    if (eventId) {
      params.set("eventId", eventId);
    }

    const response = await fetch(
      `${API_BASE_URL}/api/events/financial/operations?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal
      }
    );

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new Error(
        data.message ?? "Não foi possível carregar os estornos."
      );
    }

    const data = (await response.json()) as EventsFinancialOperationsResponse;
    setCanCreateRefund(data.canCreate);
    setOperations(data.items);
    setOperationsTotal(data.pagination.total);
    setOperationsPage(data.pagination.currentPage);
    setOperationsTotalPages(data.pagination.totalPages);
  }

  async function loadRefundable(
    token: string,
    currentPage: number,
    signal: AbortSignal
  ) {
    const params = new URLSearchParams();
    params.set("page", String(currentPage));
    params.set("limit", String(PAGE_LIMIT));

    if (eventId) {
      params.set("eventId", eventId);
    }

    const response = await fetch(
      `${API_BASE_URL}/api/events/financial/operations/refundable?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${token}`
        },
        signal
      }
    );

    if (!response.ok) {
      const data = (await response.json()) as ApiErrorResponse;
      throw new Error(
        data.message ?? "Não foi possível carregar as cobranças estornáveis."
      );
    }

    const data = (await response.json()) as RefundableEventPaymentsResponse;
    setCanCreateRefund(data.canCreate);
    setRefundableItems(data.items);
    setRefundableTotal(data.pagination.total);
    setRefundablePage(data.pagination.currentPage);
    setRefundableTotalPages(data.pagination.totalPages);
  }

  async function refresh(currentPage = page) {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      setIsLoading(false);
      return;
    }

    refreshAbortRef.current?.abort();
    const controller = new AbortController();
    refreshAbortRef.current = controller;
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;

    setError(null);
    setIsLoading(true);

    try {
      const results = await Promise.allSettled([
        events.length === 0
          ? loadEvents(token, controller.signal)
          : Promise.resolve(),
        loadFinancial(token, currentPage, controller.signal),
        loadReceivingAccount(token, controller.signal),
        loadOperations(token, 1, controller.signal),
        loadRefundable(token, 1, controller.signal)
      ]);

      if (generation !== refreshGenerationRef.current) {
        return;
      }

      const firstFailure = results.find(
        (result): result is PromiseRejectedResult =>
          result.status === "rejected" && !isAbortError(result.reason)
      );

      if (firstFailure) {
        const message = getLoadErrorMessage(
          firstFailure.reason,
          "Não foi possível carregar a gestão financeira de eventos."
        );

        if (message) {
          setError(message);
        }
      }
    } finally {
      if (generation === refreshGenerationRef.current) {
        setIsLoading(false);
      }
    }
  }

  useEffect(() => {
    void refresh(1);

    return () => {
      refreshAbortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, from, to, paymentStatus, method, search]);

  useEffect(() => {
    const token = getSessionToken();

    if (!token) {
      return;
    }

    const controller = new AbortController();

    void fetch(`${API_BASE_URL}/api/events/financial/institutions`, {
      headers: {
        Authorization: `Bearer ${token}`
      },
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) {
          return;
        }

        const data = (await response.json()) as {
          items?: FinancialInstitution[];
        };
        setFinancialInstitutions(data.items ?? []);
      })
      .catch(() => {
        return;
      });

    return () => {
      controller.abort();
    };
  }, []);

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSearch(searchInput.trim());
    setPage(1);
  }

  function handleClearFilters() {
    setSearchInput("");
    setSearch("");
    setEventId("");
    setFrom("");
    setTo("");
    setPaymentStatus("ALL");
    setMethod("ALL");
    setPage(1);
  }

  async function handleExport() {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      const params = buildFilterParams(true);
      const response = await fetch(
        `${API_BASE_URL}/api/events/financial/export?${params.toString()}`,
        {
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;
        setError(data.message ?? "Não foi possível exportar o borderô.");
        return;
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const today = new Date().toISOString().slice(0, 10);
      link.href = objectUrl;
      link.download = `bordero-eventos-${today}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError("Não foi possível exportar o borderô.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleSaveReceivingAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    if (
      !financialInstitutions.some(
        (institution) =>
          institution.institutionCode === receivingAccountForm.bankCode
      )
    ) {
      setError("Selecione uma instituição financeira válida.");
      return;
    }

    setIsSavingAccount(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/financial/receiving-account`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(receivingAccountForm)
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;
        throw new Error(
          data.message ?? "Não foi possível salvar a conta de recebimento."
        );
      }

      const data = (await response.json()) as EventsReceivingAccountView;
      setReceivingAccount(data);
      setReceivingAccountForm({
        ...EMPTY_RECEIVING_ACCOUNT_FORM,
        bankCode: data.account?.bankCode ?? ""
      });
      setBankQuery("");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Não foi possível salvar a conta de recebimento."
      );
    } finally {
      setIsSavingAccount(false);
    }
  }

  async function handleRefund(transactionId: string) {
    const token = getSessionToken();

    if (!token) {
      setError("Sessão inválida. Entre novamente no sistema.");
      return;
    }

    setIsRefunding(true);
    setError(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/financial/operations/refunds`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            transactionId
          })
        }
      );

      if (!response.ok) {
        const data = (await response.json()) as ApiErrorResponse;
        throw new Error(data.message ?? "Não foi possível estornar a cobrança.");
      }

      setConfirmingRefundId(null);
      await refresh(page);
    } catch (refundError) {
      setError(
        refundError instanceof Error
          ? refundError.message
          : "Não foi possível estornar a cobrança."
      );
    } finally {
      setIsRefunding(false);
    }
  }

  const showingFrom =
    total === 0 ? 0 : (page - 1) * PAGE_LIMIT + 1;
  const showingTo = Math.min(page * PAGE_LIMIT, total);
  const operationsClosedLabel = getOperationsClosedLabel(operationsTotal);

  return (
    <main
      style={{
        background:
          "radial-gradient(circle at top left, rgba(37, 99, 235, 0.22), transparent 34%), linear-gradient(135deg, #020617 0%, #0f172a 50%, #111827 100%)",
        color: "#f8fafc",
        minHeight: "100vh",
        padding: "32px"
      }}
    >
      <style>{`
        .event-financial-summary-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .event-financial-count-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(4, minmax(0, 1fr));
        }
        .event-financial-filters {
          display: grid;
          gap: 14px;
        }
        .event-financial-filters-row {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(5, minmax(0, 1fr)) auto;
        }
        .event-financial-actions {
          align-items: end;
          display: flex;
          gap: 10px;
          justify-content: flex-end;
        }
        .event-financial-list-header,
        .event-financial-list-row {
          align-items: start;
          display: grid;
          gap: 12px;
          grid-template-columns: minmax(0, 1.2fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 0.9fr) minmax(0, 0.6fr) minmax(0, 0.8fr) minmax(0, 0.7fr) minmax(0, 0.8fr) minmax(0, 0.8fr);
        }
        .event-financial-list-header {
          border-bottom: 1px solid rgba(148, 163, 184, 0.16);
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          padding: 0 2px 10px;
          text-transform: uppercase;
        }
        .event-financial-list-row {
          border-bottom: 1px solid rgba(148, 163, 184, 0.1);
          padding: 14px 2px;
        }
        .event-financial-col-label {
          display: none;
        }
        .event-financial-filter-label {
          color: #94a3b8;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
        .event-financial-control {
          background: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 10px;
          color: #ffffff;
          font: inherit;
          min-width: 0;
          padding: 10px 12px;
          width: 100%;
        }
        .event-financial-combobox {
          position: relative;
        }
        .event-financial-combobox-list {
          background: #0f172a;
          border: 1px solid rgba(148, 163, 184, 0.3);
          border-radius: 10px;
          box-shadow: 0 12px 24px rgba(2, 6, 23, 0.45);
          left: 0;
          margin-top: 4px;
          max-height: 220px;
          overflow-y: auto;
          position: absolute;
          right: 0;
          z-index: 20;
        }
        .event-financial-combobox-option {
          background: transparent;
          border: 0;
          color: #e2e8f0;
          cursor: pointer;
          display: block;
          font: inherit;
          padding: 9px 12px;
          text-align: left;
          width: 100%;
        }
        .event-financial-combobox-option[data-active="true"],
        .event-financial-combobox-option:hover {
          background: rgba(37, 99, 235, 0.28);
        }
        .event-financial-combobox-empty {
          color: #94a3b8;
          font-size: 13px;
          padding: 10px 12px;
        }
        .event-financial-accordion {
          background: rgba(15, 23, 42, 0.42);
          border: 1px solid rgba(148, 163, 184, 0.16);
          border-radius: 16px;
          overflow: hidden;
        }
        .event-financial-accordion > summary {
          align-items: center;
          cursor: pointer;
          display: flex;
          gap: 12px;
          list-style: none;
          padding: 14px 16px;
        }
        .event-financial-accordion > summary::-webkit-details-marker {
          display: none;
        }
        .event-financial-accordion[open] > summary svg:last-child {
          transform: rotate(180deg);
        }
        .event-financial-accordion-body {
          border-top: 1px solid rgba(148, 163, 184, 0.12);
          display: grid;
          gap: 18px;
          padding: 18px 16px 16px;
        }
        .event-financial-account-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        @media (max-width: 980px) {
          .event-financial-summary-grid,
          .event-financial-count-grid,
          .event-financial-filters-row,
          .event-financial-account-grid {
            grid-template-columns: 1fr;
          }
          .event-financial-list-header {
            display: none;
          }
          .event-financial-list-row {
            grid-template-columns: 1fr;
          }
          .event-financial-col-label {
            color: #64748b;
            display: inline;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.04em;
            margin-right: 6px;
            text-transform: uppercase;
          }
        }
      `}</style>

      <section
        style={{
          display: "grid",
          gap: "24px",
          margin: "0 auto",
          maxWidth: "1180px"
        }}
      >
        <EventModuleChrome
          header={
            <header
              style={{
                background:
                  "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.78))",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "28px",
                padding: "28px"
              }}
            >
              <p
                style={{
                  color: "#60a5fa",
                  fontSize: "11px",
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  margin: "0 0 4px",
                  textTransform: "uppercase"
                }}
              >
                Eventos
              </p>
              <h1
                style={{
                  fontSize: "28px",
                  fontWeight: 800,
                  margin: 0
                }}
              >
                Gestão financeira de eventos
              </h1>
              <p
                style={{
                  color: "#94a3b8",
                  fontSize: "14px",
                  margin: "8px 0 0"
                }}
              >
                Movimentações de todos os eventos desta igreja.
              </p>
            </header>
          }
          events={events}
          onCreateEvent={() => setIsCreateModalOpen(true)}
          onSelectedEventIdChange={(nextEventId) => {
            persistSelectedEventId(nextEventId);
            setSelectedEventId(nextEventId);
          }}
          productActive="financial"
          selectedEventId={selectedEventId}
          variant="product"
        >
        {isLoading ? (
          <p style={{ color: "#cbd5e1", margin: 0 }}>
            Carregando gestão financeira...
          </p>
        ) : null}

        {error ? (
          <div
            style={{
              background: "rgba(127, 29, 29, 0.28)",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              borderRadius: "12px",
              color: "#fecaca",
              fontSize: "14px",
              lineHeight: 1.5,
              padding: "12px 14px"
            }}
          >
            {error}
          </div>
        ) : null}

        {!isLoading && !error && summary ? (
          <>
            <div className="event-financial-summary-grid">
              {(
                [
                  {
                    label: "Valor bruto",
                    value: formatMoney(summary.eventSales.grossAmount),
                    color: "#a7f3d0"
                  },
                  {
                    label: "Taxa da plataforma",
                    value: formatMoney(summary.eventSales.platformFeeAmount),
                    color: "#fca5a5"
                  },
                  {
                    label: "Valor líquido",
                    value: formatMoney(summary.eventSales.netAmount),
                    color: "#e2e8f0"
                  }
                ] as const
              ).map((card) => (
                <article
                  key={card.label}
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    borderRadius: "12px",
                    padding: "12px 14px"
                  }}
                >
                  <strong
                    style={{
                      color: "#94a3b8",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase"
                    }}
                  >
                    {card.label}
                  </strong>
                  <p
                    style={{
                      color: card.color,
                      fontSize: "22px",
                      fontWeight: 800,
                      letterSpacing: "-0.02em",
                      margin: "6px 0 0"
                    }}
                  >
                    {card.value}
                  </p>
                </article>
              ))}
            </div>

            <div className="event-financial-count-grid">
              {(
                [
                  { label: "Pagos", value: summary.counts.paid },
                  { label: "Pendentes", value: summary.counts.pending },
                  { label: "Cancelados", value: summary.counts.cancelled },
                  { label: "Estornados", value: summary.counts.reversed }
                ] as const
              ).map((card) => (
                <article
                  key={card.label}
                  style={{
                    background: "rgba(15, 23, 42, 0.55)",
                    border: "1px solid rgba(148, 163, 184, 0.16)",
                    borderRadius: "12px",
                    padding: "12px 14px"
                  }}
                >
                  <strong
                    style={{
                      color: "#94a3b8",
                      fontSize: "11px",
                      fontWeight: 800,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase"
                    }}
                  >
                    {card.label}
                  </strong>
                  <p
                    style={{
                      color: "#e2e8f0",
                      fontSize: "22px",
                      fontWeight: 800,
                      margin: "6px 0 0"
                    }}
                  >
                    {card.value}
                  </p>
                </article>
              ))}
            </div>
          </>
        ) : null}

        <details className="event-financial-accordion">
          <summary>
            <Building2 color="#93c5fd" size={18} />
            <span style={{ display: "grid", flex: 1, gap: "2px", minWidth: 0 }}>
              <strong style={{ fontSize: "14px", fontWeight: 800 }}>
                Conta de recebimento
              </strong>
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                {getReceivingAccountClosedLabel(receivingAccount)}
              </span>
            </span>
            <ChevronDown color="#64748b" size={18} />
          </summary>
          <div className="event-financial-accordion-body">
            {receivingAccount?.configured && receivingAccount.account ? (
              <p style={{ color: "#cbd5e1", fontSize: "13px", margin: 0 }}>
                {receivingAccount.account.institutionName
                  ? `${receivingAccount.account.bankCode} — ${receivingAccount.account.institutionName}`
                  : `Banco ${receivingAccount.account.bankCode}`}
                {" · "}
                {receivingAccount.account.ownerNameMasked}
                {" · "}
                {receivingAccount.account.documentMasked}
                {" · "}
                {getBankAccountTypeLabel(receivingAccount.account.bankAccountType)}
                {" · Agência "}
                {receivingAccount.account.agencyMasked}
              </p>
            ) : (
              <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
                Cadastre a conta da igreja que receberá o valor líquido das
                vendas de Eventos.
              </p>
            )}

            {receivingAccount && !receivingAccount.canUpdate ? (
              <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
                Você pode consultar a conta, mas não tem permissão para
                cadastrar ou alterar.
              </p>
            ) : null}

            {receivingAccount?.canUpdate ? (
              <form
                onSubmit={handleSaveReceivingAccount}
                style={{ display: "grid", gap: "14px" }}
              >
                <div className="event-financial-account-grid">
                  <label className="event-financial-filter-field" htmlFor="events-receiving-owner">
                    <span className="event-financial-filter-label">Titular</span>
                    <input
                      className="event-financial-control"
                      id="events-receiving-owner"
                      maxLength={120}
                      onChange={(event) =>
                        setReceivingAccountForm((current) => ({
                          ...current,
                          ownerName: event.target.value
                        }))
                      }
                      required
                      value={receivingAccountForm.ownerName}
                    />
                  </label>
                  <label className="event-financial-filter-field" htmlFor="events-receiving-document">
                    <span className="event-financial-filter-label">CPF ou CNPJ</span>
                    <input
                      className="event-financial-control"
                      id="events-receiving-document"
                      inputMode="numeric"
                      onChange={(event) =>
                        setReceivingAccountForm((current) => ({
                          ...current,
                          cpfCnpj: event.target.value
                        }))
                      }
                      required
                      value={receivingAccountForm.cpfCnpj}
                    />
                  </label>
                  <label className="event-financial-filter-field" htmlFor="events-receiving-type">
                    <span className="event-financial-filter-label">Tipo da conta</span>
                    <select
                      className="event-financial-control"
                      id="events-receiving-type"
                      onChange={(event) =>
                        setReceivingAccountForm((current) => ({
                          ...current,
                          bankAccountType: event.target.value as
                            | "CONTA_CORRENTE"
                            | "CONTA_POUPANCA"
                        }))
                      }
                      value={receivingAccountForm.bankAccountType}
                    >
                      <option value="CONTA_CORRENTE">Conta corrente</option>
                      <option value="CONTA_POUPANCA">Poupança</option>
                    </select>
                  </label>
                  <label className="event-financial-filter-field" htmlFor="events-receiving-bank">
                    <span className="event-financial-filter-label">Banco</span>
                    <div className="event-financial-combobox">
                      <input
                        autoComplete="off"
                        className="event-financial-control"
                        id="events-receiving-bank"
                        onBlur={() => {
                          window.setTimeout(() => {
                            setIsBankListOpen(false);
                            setBankQuery("");

                            if (selectedInstitution) {
                              return;
                            }

                            const savedCode =
                              receivingAccount?.account?.bankCode ?? "";

                            setReceivingAccountForm((current) => ({
                              ...current,
                              bankCode: savedCode
                            }));
                          }, 120);
                        }}
                        onChange={(event) => {
                          const value = event.target.value;
                          setBankQuery(value);
                          setIsBankListOpen(true);
                          setBankHighlightIndex(0);
                          setReceivingAccountForm((current) => ({
                            ...current,
                            bankCode: ""
                          }));
                        }}
                        onFocus={() => {
                          setBankQuery("");
                          setIsBankListOpen(true);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setIsBankListOpen(true);
                            setBankHighlightIndex((current) =>
                              Math.min(current + 1, Math.max(bankMatches.length - 1, 0))
                            );
                            return;
                          }

                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setBankHighlightIndex((current) => Math.max(current - 1, 0));
                            return;
                          }

                          if (event.key === "Enter" && isBankListOpen) {
                            const highlighted = bankMatches[bankHighlightIndex];

                            if (highlighted) {
                              event.preventDefault();
                              setReceivingAccountForm((current) => ({
                                ...current,
                                bankCode: highlighted.institutionCode
                              }));
                              setBankQuery("");
                              setIsBankListOpen(false);
                            }
                            return;
                          }

                          if (event.key === "Escape") {
                            setIsBankListOpen(false);
                          }
                        }}
                        placeholder="Buscar por código ou nome"
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded={isBankListOpen}
                        aria-controls="events-receiving-bank-list"
                        value={
                          isBankListOpen
                            ? bankQuery
                            : selectedInstitution
                              ? formatInstitutionLabel(selectedInstitution)
                              : ""
                        }
                      />
                      {isBankListOpen && bankQuery.trim() ? (
                        <div
                          className="event-financial-combobox-list"
                          id="events-receiving-bank-list"
                          role="listbox"
                        >
                          {bankMatches.length === 0 ? (
                            <div className="event-financial-combobox-empty">
                              Nenhuma instituição encontrada
                            </div>
                          ) : (
                            bankMatches.map((institution, index) => (
                              <button
                                className="event-financial-combobox-option"
                                data-active={index === bankHighlightIndex}
                                key={institution.institutionCode}
                                onMouseDown={(event) => {
                                  event.preventDefault();
                                  setReceivingAccountForm((current) => ({
                                    ...current,
                                    bankCode: institution.institutionCode
                                  }));
                                  setBankQuery("");
                                  setIsBankListOpen(false);
                                }}
                                role="option"
                                type="button"
                              >
                                {formatInstitutionLabel(institution)}
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                  </label>
                  <label className="event-financial-filter-field" htmlFor="events-receiving-agency">
                    <span className="event-financial-filter-label">Agência</span>
                    <input
                      className="event-financial-control"
                      id="events-receiving-agency"
                      inputMode="numeric"
                      onChange={(event) =>
                        setReceivingAccountForm((current) => ({
                          ...current,
                          agency: event.target.value.replace(/\D/g, "")
                        }))
                      }
                      required
                      value={receivingAccountForm.agency}
                    />
                  </label>
                  <label
                    className="event-financial-filter-field"
                    htmlFor="events-receiving-account"
                    style={{
                      display: "grid",
                      gap: "10px",
                      gridTemplateColumns: "minmax(0, 1fr) 88px"
                    }}
                  >
                    <span className="event-financial-filter-label" style={{ gridColumn: "1 / -1" }}>
                      Conta e dígito
                    </span>
                    <input
                      className="event-financial-control"
                      id="events-receiving-account"
                      inputMode="numeric"
                      onChange={(event) =>
                        setReceivingAccountForm((current) => ({
                          ...current,
                          account: event.target.value.replace(/\D/g, "")
                        }))
                      }
                      required
                      value={receivingAccountForm.account}
                    />
                    <input
                      aria-label="Dígito da conta"
                      className="event-financial-control"
                      id="events-receiving-digit"
                      maxLength={2}
                      onChange={(event) =>
                        setReceivingAccountForm((current) => ({
                          ...current,
                          accountDigit: event.target.value
                            .replace(/[^0-9Xx]/g, "")
                            .slice(0, 2)
                        }))
                      }
                      required
                      value={receivingAccountForm.accountDigit}
                    />
                  </label>
                </div>
                <div>
                  <button
                    disabled={isSavingAccount}
                    style={{
                      background: "#2563eb",
                      border: 0,
                      borderRadius: "10px",
                      color: "#ffffff",
                      cursor: isSavingAccount ? "not-allowed" : "pointer",
                      fontWeight: 800,
                      padding: "10px 16px"
                    }}
                    type="submit"
                  >
                    {isSavingAccount
                      ? "Salvando..."
                      : receivingAccount?.configured
                        ? "Alterar conta"
                        : "Cadastrar conta"}
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </details>

        <details className="event-financial-accordion">
          <summary>
            <Undo2 color="#93c5fd" size={18} />
            <span style={{ display: "grid", flex: 1, gap: "2px", minWidth: 0 }}>
              <strong style={{ fontSize: "14px", fontWeight: 800 }}>
                Estornos administrativos
              </strong>
              {operationsClosedLabel ? (
                <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                  {operationsClosedLabel}
                </span>
              ) : null}
            </span>
            <ChevronDown color="#64748b" size={18} />
          </summary>
          <div className="event-financial-accordion-body">
            {canCreateRefund && refundableItems.length > 0 ? (
              <div style={{ display: "grid", gap: "10px" }}>
                {refundableItems.map((item) => (
                    <div
                      key={item.transactionId}
                      style={{
                        alignItems: "center",
                        border: "1px solid rgba(148, 163, 184, 0.16)",
                        borderRadius: "12px",
                        display: "grid",
                        gap: "8px",
                        gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr) auto auto",
                        padding: "10px 12px"
                      }}
                    >
                      <span style={{ minWidth: 0 }}>
                        <strong style={{ display: "block", fontSize: "13px" }}>
                          {item.participantName}
                        </strong>
                        <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                          {item.eventTitle}
                        </span>
                      </span>
                      <span style={{ color: "#a7f3d0", fontSize: "13px", fontWeight: 800 }}>
                        {formatMoney(item.amount)}
                      </span>
                      <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                        {formatDateTimeCompact(item.at)}
                      </span>
                      {confirmingRefundId === item.transactionId ? (
                        <span style={{ display: "flex", gap: "8px" }}>
                          <button
                            disabled={isRefunding}
                            onClick={() => {
                              void handleRefund(item.transactionId);
                            }}
                            style={{
                              background: "#b91c1c",
                              border: 0,
                              borderRadius: "10px",
                              color: "#ffffff",
                              cursor: isRefunding ? "not-allowed" : "pointer",
                              fontWeight: 800,
                              padding: "8px 12px"
                            }}
                            type="button"
                          >
                            {isRefunding ? "Estornando..." : "Confirmar"}
                          </button>
                          <button
                            disabled={isRefunding}
                            onClick={() => setConfirmingRefundId(null)}
                            style={{
                              background: "transparent",
                              border: "1px solid rgba(148, 163, 184, 0.28)",
                              borderRadius: "10px",
                              color: "#e2e8f0",
                              cursor: "pointer",
                              fontWeight: 800,
                              padding: "8px 12px"
                            }}
                            type="button"
                          >
                            Cancelar
                          </button>
                        </span>
                      ) : (
                        <button
                          disabled={isRefunding}
                          onClick={() => setConfirmingRefundId(item.transactionId)}
                          style={{
                            background: "transparent",
                            border: "1px solid rgba(248, 113, 113, 0.4)",
                            borderRadius: "10px",
                            color: "#fecaca",
                            cursor: "pointer",
                            fontWeight: 800,
                            padding: "8px 12px"
                          }}
                          type="button"
                        >
                          Estornar pagamento
                        </button>
                      )}
                    </div>
                ))}
                {refundableTotal > PAGE_LIMIT ? (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: "12px"
                    }}
                  >
                    <button
                      disabled={refundablePage <= 1}
                      onClick={() => {
                        const nextPage = Math.max(1, refundablePage - 1);
                        setRefundablePage(nextPage);
                        const token = getSessionToken();
                        if (token) {
                          void loadRefundable(
                            token,
                            nextPage,
                            new AbortController().signal
                          );
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(148, 163, 184, 0.28)",
                        borderRadius: "10px",
                        color: "#e2e8f0",
                        cursor: refundablePage <= 1 ? "not-allowed" : "pointer",
                        fontWeight: 800,
                        padding: "8px 12px"
                      }}
                      type="button"
                    >
                      Anterior
                    </button>
                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                      Página {refundablePage} de {Math.max(refundableTotalPages, 1)}
                    </span>
                    <button
                      disabled={refundablePage >= refundableTotalPages}
                      onClick={() => {
                        const nextPage = refundablePage + 1;
                        setRefundablePage(nextPage);
                        const token = getSessionToken();
                        if (token) {
                          void loadRefundable(
                            token,
                            nextPage,
                            new AbortController().signal
                          );
                        }
                      }}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(148, 163, 184, 0.28)",
                        borderRadius: "10px",
                        color: "#e2e8f0",
                        cursor:
                          refundablePage >= refundableTotalPages
                            ? "not-allowed"
                            : "pointer",
                        fontWeight: 800,
                        padding: "8px 12px"
                      }}
                      type="button"
                    >
                      Próxima
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}

            {operations.length > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              {operations.map((item) => (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "12px",
                      display: "grid",
                      gap: "6px",
                      padding: "10px 12px"
                    }}
                  >
                    <span
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px"
                      }}
                    >
                      <strong style={{ fontSize: "13px" }}>
                        {item.participantName}
                      </strong>
                      <span style={{ color: "#a7f3d0", fontWeight: 800 }}>
                        {formatMoney(item.amount)}
                      </span>
                    </span>
                    <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                      {item.eventTitle} · {getRefundStatusLabel(item.status)} ·{" "}
                      {formatDateTimeCompact(item.createdAt)}
                    </span>
                  </div>
              ))}
              {operationsTotal > PAGE_LIMIT ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "12px"
                  }}
                >
                  <button
                    disabled={operationsPage <= 1}
                    onClick={() => {
                      const nextPage = Math.max(1, operationsPage - 1);
                      setOperationsPage(nextPage);
                      const token = getSessionToken();
                      if (token) {
                        void loadOperations(
                          token,
                          nextPage,
                          new AbortController().signal
                        );
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(148, 163, 184, 0.28)",
                      borderRadius: "10px",
                      color: "#e2e8f0",
                      cursor: operationsPage <= 1 ? "not-allowed" : "pointer",
                      fontWeight: 800,
                      padding: "8px 12px"
                    }}
                    type="button"
                  >
                    Anterior
                  </button>
                  <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                    Página {operationsPage} de {Math.max(operationsTotalPages, 1)}
                  </span>
                  <button
                    disabled={operationsPage >= operationsTotalPages}
                    onClick={() => {
                      const nextPage = operationsPage + 1;
                      setOperationsPage(nextPage);
                      const token = getSessionToken();
                      if (token) {
                        void loadOperations(
                          token,
                          nextPage,
                          new AbortController().signal
                        );
                      }
                    }}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(148, 163, 184, 0.28)",
                      borderRadius: "10px",
                      color: "#e2e8f0",
                      cursor:
                        operationsPage >= operationsTotalPages
                          ? "not-allowed"
                          : "pointer",
                      fontWeight: 800,
                      padding: "8px 12px"
                    }}
                    type="button"
                  >
                    Próxima
                  </button>
                </div>
              ) : null}
            </div>
            ) : null}

            {operations.length === 0 &&
            !(canCreateRefund && refundableItems.length > 0) ? (
              <p style={{ color: "#94a3b8", fontSize: "13px", margin: 0 }}>
                Nenhum estorno.
              </p>
            ) : null}
          </div>
        </details>

        <details className="event-financial-accordion">
          <summary>
            <ListOrdered color="#93c5fd" size={18} />
            <span style={{ display: "grid", flex: 1, gap: "2px", minWidth: 0 }}>
              <strong style={{ fontSize: "14px", fontWeight: 800 }}>
                Movimentações financeiras
              </strong>
              <span style={{ color: "#94a3b8", fontSize: "12px" }}>
                {total > 0
                  ? `${total.toLocaleString("pt-BR")} registros`
                  : "Busca, filtros, histórico e borderô"}
              </span>
            </span>
            <ChevronDown color="#64748b" size={18} />
          </summary>
          <div className="event-financial-accordion-body">
          <div className="event-financial-filters">
            <form
              onSubmit={handleSearch}
              style={{
                display: "grid",
                gap: "10px",
                gridTemplateColumns: "1fr auto"
              }}
            >
              <label className="event-financial-filter-field" htmlFor="event-financial-search">
                <span className="event-financial-filter-label">
                  Buscar movimentações
                </span>
                <input
                  className="event-financial-control"
                  id="event-financial-search"
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Participante, e-mail, telefone, ingresso ou evento"
                  type="search"
                  value={searchInput}
                />
              </label>
              <button
                style={{
                  alignSelf: "end",
                  background: "#2563eb",
                  border: 0,
                  borderRadius: "10px",
                  color: "#ffffff",
                  cursor: "pointer",
                  fontWeight: 800,
                  padding: "10px 16px"
                }}
                type="submit"
              >
                Pesquisar
              </button>
            </form>

            <div className="event-financial-filters-row">
              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Evento</span>
                <select
                  className="event-financial-control"
                  onChange={(event) => {
                    setEventId(event.target.value);
                    setPage(1);
                  }}
                  value={eventId}
                >
                  <option value="">Todos os eventos</option>
                  {events.map((eventItem) => (
                    <option key={eventItem.id} value={eventItem.id}>
                      {eventItem.title}
                    </option>
                  ))}
                </select>
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">De</span>
                <input
                  className="event-financial-control"
                  onChange={(event) => {
                    setFrom(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={from}
                />
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Até</span>
                <input
                  className="event-financial-control"
                  onChange={(event) => {
                    setTo(event.target.value);
                    setPage(1);
                  }}
                  type="date"
                  value={to}
                />
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Status</span>
                <select
                  className="event-financial-control"
                  onChange={(event) => {
                    setPaymentStatus(event.target.value);
                    setPage(1);
                  }}
                  value={paymentStatus}
                >
                  <option value="ALL">Todos os status</option>
                  <option value="PAID">Pago</option>
                  <option value="PENDING">Pendente</option>
                  <option value="REFUND_PENDING">
                    Reembolso em processamento
                  </option>
                  <option value="CANCELLED">Cancelado</option>
                  <option value="REFUNDED">Reembolsado</option>
                </select>
              </label>

              <label className="event-financial-filter-field">
                <span className="event-financial-filter-label">Método</span>
                <select
                  className="event-financial-control"
                  onChange={(event) => {
                    setMethod(event.target.value);
                    setPage(1);
                  }}
                  value={method}
                >
                  <option value="ALL">Todos</option>
                  <option value="PIX">PIX</option>
                  <option value="CARD">Cartão</option>
                </select>
              </label>

              <div className="event-financial-actions">
                <button
                  onClick={handleClearFilters}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    cursor: "pointer",
                    fontWeight: 800,
                    padding: "10px 14px",
                    whiteSpace: "nowrap"
                  }}
                  type="button"
                >
                  Limpar filtros
                </button>
                <button
                  disabled={isExporting}
                  onClick={() => {
                    void handleExport();
                  }}
                  style={{
                    background: "#2563eb",
                    border: 0,
                    borderRadius: "10px",
                    color: "#ffffff",
                    cursor: isExporting ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    padding: "10px 14px",
                    whiteSpace: "nowrap"
                  }}
                  type="button"
                >
                  {isExporting ? "Exportando..." : "Exportar borderô"}
                </button>
              </div>
            </div>
          </div>

          {!isLoading && !error && items.length === 0 ? (
            <p style={{ color: "#94a3b8", margin: 0 }}>
              {hasActiveFilters
                ? "Nenhuma movimentação encontrada para estes filtros."
                : "Nenhuma movimentação de eventos."}
            </p>
          ) : null}

          {!isLoading && !error && items.length > 0 ? (
            <div style={{ display: "grid", gap: 0 }}>
              <div className="event-financial-list-header">
                <span>Evento</span>
                <span>Participante / origem</span>
                <span>Ingresso / lote</span>
                <span>Pagamento / status</span>
                <span>Método</span>
                <span>Valor bruto</span>
                <span>Taxa</span>
                <span>Valor líquido</span>
                <span>Data</span>
              </div>

              {items.map((item) => {
                const tone = getPaymentTone(item.paymentLabel);

                return (
                  <div className="event-financial-list-row" key={item.id}>
                    <span>
                      <span className="event-financial-col-label">Evento</span>
                      <Link
                        href={`/dashboard/eventos/${item.eventId}`}
                        style={{
                          color: "#93c5fd",
                          fontSize: "14px",
                          fontWeight: 700,
                          textDecoration: "none"
                        }}
                      >
                        {item.eventTitle || "Evento"}
                      </Link>
                    </span>
                    <span>
                      <span className="event-financial-col-label">
                        Participante / origem
                      </span>
                      <strong
                        style={{
                          color: "#ffffff",
                          fontSize: "14px",
                          fontWeight: 700
                        }}
                      >
                        {item.participantName}
                      </strong>
                    </span>
                    <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
                      <span className="event-financial-col-label">
                        Ingresso / lote
                      </span>
                      {getTicketLabel(item)}
                    </span>
                    <span>
                      <span className="event-financial-col-label">
                        Pagamento / status
                      </span>
                      <span
                        style={{
                          borderRadius: "999px",
                          display: "inline-flex",
                          fontSize: "11px",
                          fontWeight: 800,
                          padding: "3px 8px",
                          ...getToneStyles(tone)
                        }}
                      >
                        {item.paymentLabel}
                      </span>
                    </span>
                    <span style={{ color: "#e2e8f0", fontSize: "13px" }}>
                      <span className="event-financial-col-label">Método</span>
                      {getMethodLabel(item.method)}
                    </span>
                    <span
                      style={{
                        color: "#a7f3d0",
                        fontSize: "14px",
                        fontWeight: 800
                      }}
                    >
                      <span className="event-financial-col-label">
                        Valor bruto
                      </span>
                      {formatSnapshotAmount(item.grossAmount)}
                    </span>
                    <span
                      style={{
                        color: "#fca5a5",
                        fontSize: "14px",
                        fontWeight: 800
                      }}
                    >
                      <span className="event-financial-col-label">Taxa</span>
                      {formatSnapshotAmount(item.platformFeeAmount)}
                    </span>
                    <span
                      style={{
                        color: "#e2e8f0",
                        fontSize: "14px",
                        fontWeight: 800
                      }}
                    >
                      <span className="event-financial-col-label">
                        Valor líquido
                      </span>
                      {formatSnapshotAmount(item.netAmount)}
                    </span>
                    <span style={{ color: "#cbd5e1", fontSize: "13px" }}>
                      <span className="event-financial-col-label">Data</span>
                      {formatDateTimeCompact(item.at)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : null}

          {!isLoading && !error && total > 0 ? (
            <div style={{ display: "grid", gap: "10px" }}>
              <div
                style={{
                  alignItems: "center",
                  display: "flex",
                  gap: "12px",
                  justifyContent: "space-between"
                }}
              >
                <button
                  disabled={isLoading || page <= 1}
                  onClick={() => {
                    const nextPage = Math.max(1, page - 1);
                    setPage(nextPage);
                    void refresh(nextPage);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    cursor: page <= 1 ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    padding: "10px 14px"
                  }}
                  type="button"
                >
                  Anterior
                </button>
                <span style={{ color: "#94a3b8", fontSize: "13px" }}>
                  Página {page} de {Math.max(totalPages, 1)}
                </span>
                <button
                  disabled={isLoading || page >= totalPages}
                  onClick={() => {
                    const nextPage = page + 1;
                    setPage(nextPage);
                    void refresh(nextPage);
                  }}
                  style={{
                    background: "transparent",
                    border: "1px solid rgba(148, 163, 184, 0.28)",
                    borderRadius: "10px",
                    color: "#e2e8f0",
                    cursor:
                      page >= totalPages ? "not-allowed" : "pointer",
                    fontWeight: 800,
                    padding: "10px 14px"
                  }}
                  type="button"
                >
                  Próxima
                </button>
              </div>
              <p
                style={{
                  color: "#64748b",
                  fontSize: "12px",
                  margin: 0
                }}
              >
                Mostrando {showingFrom.toLocaleString("pt-BR")}
                –
                {showingTo.toLocaleString("pt-BR")} de{" "}
                {total.toLocaleString("pt-BR")} movimentações
              </p>
            </div>
          ) : null}
          </div>
        </details>
        </EventModuleChrome>
      </section>

      <CreateEventModal
        onClose={() => setIsCreateModalOpen(false)}
        open={isCreateModalOpen}
      />
    </main>
  );
}
