"use client";

import QRCode from "react-qr-code";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  FormEvent,
  useEffect,
  useMemo,
  useState
} from "react";

type LoginSession = {
  token: string;
};

type EventSummaryOption = {
  id: string;
  title: string;
  date: string;
};

type RegistrationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "CANCELLED"
  | "CHECKED_IN";

type EventDetail = {
  id: string;
  title: string;
  slug: string;
  date: string;
  capacity: number;
  price: string | number;
  isPublic: boolean;
  isPaid: boolean;
  publicRegistrationEnabled: boolean;
  waitlistEnabled: boolean;
  church: {
    name: string;
    slug: string;
  };
  registrations: Array<{
    id: string;
    status: RegistrationStatus;
    paymentStatus: string;
    checkInToken: string;
    checkedInAt: string | null;
    waitlistedAt: string | null;
    person: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
    } | null;
    visitor: {
      id: string;
      name: string;
      phone: string;
      email: string | null;
    } | null;
    ticket: {
      id: string;
      name: string;
    } | null;
    ticketBatch: {
      id: string;
      name: string;
    } | null;
    formAnswers: Array<{
      id: string;
      value: unknown;
      field: {
        id: string;
        label: string;
        isSensitive: boolean;
        order: number;
      };
    }>;
  }>;
};

type ApiErrorResponse = {
  message?: string;
};

type EventFinancialParticipant = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
};

type EventFinancialRegistration = {
  person: EventFinancialParticipant | null;
  visitor: EventFinancialParticipant | null;
  ticket: {
    id: string;
    name: string;
  } | null;
  ticketBatch: {
    id: string;
    name: string;
  } | null;
};

type EventFinancialTransaction = {
  id: string;
  amount: string | number;
  direction: "IN" | "OUT";
  status:
    | "ACTIVE"
    | "CANCELLED"
    | "REVERSED";
  method: string;
  costCenter: string | null;
  at: string;
  cancelReason: string | null;
  asaasId: string | null;
  nfseId: string | null;
  person:
    | EventFinancialParticipant
    | null;
  eventPayment: {
    id: string;
    status: string;
    provider: string;
    providerPaymentId:
      | string
      | null;
    order: {
      registrations:
        EventFinancialRegistration[];
    };
  } | null;
};

type EventFinancialSummary = {
  income: string | number;
  expense: string | number;
};

type TicketBatch = {
  id: string;
  name: string;
  quantity: number;
  price: string | number;
  salesStart: string;
  salesEnd: string;
  isVisible: boolean;
  _count: {
    registrations: number;
  };
};

type EventTicket = {
  id: string;
  name: string;
  description: string | null;
  isFree: boolean;
  isVisible: boolean;
  batches: TicketBatch[];
  _count: {
    registrations: number;
  };
};

type EventWorkspaceClientProps = {
  eventId: string;
};

type EventWorkspaceSection =
  | "overview"
  | "information"
  | "tickets"
  | "registration-form"
  | "participants"
  | "check-in"
  | "financial"
  | "event-app";

type EventFormFieldType =
  | "TEXT"
  | "PARAGRAPH"
  | "SELECT"
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE";

type EventFormField = {
  id: string;
  label: string;
  type: EventFormFieldType;
  isRequired: boolean;
  isSensitive: boolean;
  isActive: boolean;
  order: number;
  options: Array<{
    id: string;
    label: string;
    value: string;
    order: number;
  }>;
  ticketScopes: Array<{
    ticket: {
      id: string;
      name: string;
    };
  }>;
};

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3333";

const WEB_BASE_URL =
  process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "http://localhost:3000";

const EVENTS_APP_BASE_URL =
  process.env.NEXT_PUBLIC_EVENTS_APP_BASE_URL ?? "http://localhost:3001";

function getSessionToken() {
  const storedSession = localStorage.getItem("sistema-igrejas.session");

  if (!storedSession) {
    return null;
  }

  try {
    const session = JSON.parse(storedSession) as LoginSession;

    return session.token;
  } catch {
    localStorage.removeItem("sistema-igrejas.session");
    return null;
  }
}

function createSlug(title: string) {
  return title
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)+/g, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "full",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatDateTimeCompact(value: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatMoney(value: string | number) {
  const numberValue =
    typeof value === "string" ? Number(value) : value;

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(Number.isFinite(numberValue) ? numberValue : 0);
}

type TicketBatchSaleStatus =
  | "Esgotado"
  | "Não iniciado"
  | "Encerrado"
  | "À venda";

function getTicketBatchSaleStatus(
  quantity: number,
  salesStart: string,
  salesEnd: string,
  sold: number,
  now = new Date()
): TicketBatchSaleStatus {
  if (sold >= quantity) {
    return "Esgotado";
  }

  if (now < new Date(salesStart)) {
    return "Não iniciado";
  }

  if (now > new Date(salesEnd)) {
    return "Encerrado";
  }

  return "À venda";
}

function getTicketRowIdentity(
  ticketName: string,
  batchName: string | null,
  eventTitle: string | null | undefined
) {
  const name = ticketName.trim();
  const title = eventTitle?.trim() ?? "";
  const typeLabel =
    name &&
    title &&
    name.toLocaleLowerCase("pt-BR") ===
      title.toLocaleLowerCase("pt-BR")
      ? "Ingresso"
      : name || "Ingresso";
  return batchName
    ? `${typeLabel} - ${batchName}`
    : typeLabel;
}

const TICKET_LIST_COLUMNS =
  "minmax(0, 2.2fr) minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1fr) 76px";

function getTicketBatchSoldPercent(
  sold: number,
  quantity: number
) {
  if (quantity <= 0) {
    return 0;
  }

  return Math.min((sold / quantity) * 100, 100);
}

function formFieldTypeNeedsOptions(
  type: EventFormFieldType
) {
  return (
    type === "SELECT" ||
    type === "SINGLE_CHOICE" ||
    type === "MULTIPLE_CHOICE"
  );
}

function EventFormPreviewControl({
  field,
  value,
  onChange
}: {
  field: EventFormField;
  value: string | string[];
  onChange: (next: string | string[]) => void;
}) {
  const controlStyle = {
    borderRadius: "10px",
    padding: "12px"
  };
  const stringValue =
    typeof value === "string" ? value : "";
  const multiValue = Array.isArray(value) ? value : [];

  if (field.type === "PARAGRAPH") {
    return (
      <textarea
        onChange={(changeEvent) =>
          onChange(changeEvent.target.value)
        }
        rows={3}
        style={controlStyle}
        value={stringValue}
      />
    );
  }

  if (field.type === "SELECT") {
    return (
      <select
        onChange={(changeEvent) =>
          onChange(changeEvent.target.value)
        }
        style={controlStyle}
        value={stringValue}
      >
        <option value="">Selecione...</option>
        {field.options.map((option) => (
          <option
            key={option.id}
            value={option.value}
          >
            {option.label}
          </option>
        ))}
      </select>
    );
  }

  if (field.type === "SINGLE_CHOICE") {
    return (
      <div>
        {field.options.map((option) => (
          <label
            key={option.id}
            style={{
              display: "block",
              margin: "8px 0"
            }}
          >
            <input
              checked={stringValue === option.value}
              name={`preview-${field.id}`}
              onChange={() => onChange(option.value)}
              type="radio"
              value={option.value}
            />{" "}
            {option.label}
          </label>
        ))}
      </div>
    );
  }

  if (field.type === "MULTIPLE_CHOICE") {
    return (
      <div>
        {field.options.map((option) => {
          const isChecked = multiValue.includes(
            option.value
          );

          return (
            <label
              key={option.id}
              style={{
                display: "block",
                margin: "8px 0"
              }}
            >
              <input
                checked={isChecked}
                onChange={() => {
                  if (isChecked) {
                    onChange(
                      multiValue.filter(
                        (entry) => entry !== option.value
                      )
                    );
                    return;
                  }

                  onChange([...multiValue, option.value]);
                }}
                type="checkbox"
                value={option.value}
              />{" "}
              {option.label}
            </label>
          );
        })}
      </div>
    );
  }

  return (
    <input
      onChange={(changeEvent) =>
        onChange(changeEvent.target.value)
      }
      style={controlStyle}
      value={stringValue}
    />
  );
}

export function EventWorkspaceClient({
  eventId
}: EventWorkspaceClientProps) {
  const router = useRouter();

  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditingInformation, setIsEditingInformation] =
    useState(false);
  const [isSavingInformation, setIsSavingInformation] =
    useState(false);
  const [
    isUpdatingPublicationState,
    setIsUpdatingPublicationState
  ] = useState(false);
  const [informationMessage, setInformationMessage] =
    useState<string | null>(null);
  const [tickets, setTickets] = useState<EventTicket[]>([]);
  const [isLoadingTickets, setIsLoadingTickets] =
    useState(true);
  const [isCreatingTicket, setIsCreatingTicket] =
    useState(false);
  const [isCreatingBatch, setIsCreatingBatch] =
    useState(false);
  const [ticketMessage, setTicketMessage] =
    useState<string | null>(null);
  const [ticketError, setTicketError] =
    useState<string | null>(null);
  const [selectedTicketId, setSelectedTicketId] =
    useState("");
  const [ticketIsFree, setTicketIsFree] =
    useState(true);
  const [editingTicketId, setEditingTicketId] =
    useState<string | null>(null);
  const [editingTicketName, setEditingTicketName] =
    useState("");
  const [
    editingTicketDescription,
    setEditingTicketDescription
  ] = useState("");
  const [editingTicketIsFree, setEditingTicketIsFree] =
    useState(true);
  const [
    editingTicketIsVisible,
    setEditingTicketIsVisible
  ] = useState(true);
  const [isSavingTicket, setIsSavingTicket] =
    useState(false);
  const [editingBatchId, setEditingBatchId] =
    useState<string | null>(null);
  const [editingBatchName, setEditingBatchName] =
    useState("");
  const [
    editingBatchQuantity,
    setEditingBatchQuantity
  ] = useState("");
  const [editingBatchPrice, setEditingBatchPrice] =
    useState("");
  const [
    editingBatchSalesStart,
    setEditingBatchSalesStart
  ] = useState("");
  const [
    editingBatchSalesEnd,
    setEditingBatchSalesEnd
  ] = useState("");
  const [
    editingBatchIsVisible,
    setEditingBatchIsVisible
  ] = useState(true);
  const [isSavingBatch, setIsSavingBatch] =
    useState(false);
  const [ticketSearch, setTicketSearch] = useState("");
  const [isCreateTicketOpen, setIsCreateTicketOpen] =
    useState(false);
  const [isCreateBatchOpen, setIsCreateBatchOpen] =
    useState(false);
  const [activeSection, setActiveSection] =
    useState<EventWorkspaceSection>("overview");
  const [formFields, setFormFields] =
    useState<EventFormField[]>([]);
  const [previewBaseValues, setPreviewBaseValues] =
    useState({
      name: "",
      phone: "",
      email: "",
      cpf: ""
    });
  const [previewFieldValues, setPreviewFieldValues] =
    useState<Record<string, string | string[]>>({});
  const [isLoadingFormFields, setIsLoadingFormFields] =
    useState(true);
  const [isSavingFormFieldOverlay, setIsSavingFormFieldOverlay] =
    useState(false);
  const [formFieldMessage, setFormFieldMessage] =
    useState<string | null>(null);
  const [
    isFormFieldOverlayOpen,
    setIsFormFieldOverlayOpen
  ] = useState(false);
  const [
    editingFormFieldId,
    setEditingFormFieldId
  ] = useState<string | null>(null);
  const [
    overlayFormFieldType,
    setOverlayFormFieldType
  ] = useState<EventFormFieldType>("TEXT");
  const [overlayFormFieldLabel, setOverlayFormFieldLabel] =
    useState("");
  const [
    overlayFormFieldRequired,
    setOverlayFormFieldRequired
  ] = useState(false);
  const [
    overlayFormFieldSensitive,
    setOverlayFormFieldSensitive
  ] = useState(false);
  const [
    overlayTicketScopeEnabled,
    setOverlayTicketScopeEnabled
  ] = useState(false);
  const [overlayTicketIds, setOverlayTicketIds] = useState<
    string[]
  >([]);
  const [overlayFieldOptions, setOverlayFieldOptions] =
    useState("");
  const [participantSearch, setParticipantSearch] =
    useState("");
  const [
    participantSearchInput,
    setParticipantSearchInput
  ] = useState("");
  const [participantStatus, setParticipantStatus] =
    useState("ALL");
  const [participantPayment, setParticipantPayment] =
    useState("ALL");
  const [participantTicket, setParticipantTicket] =
    useState("ALL");
  const [checkInCode, setCheckInCode] =
    useState("");
  const [checkInSearch, setCheckInSearch] =
    useState("");
  const [
    checkInSearchInput,
    setCheckInSearchInput
  ] = useState("");
  const [isCheckingIn, setIsCheckingIn] =
    useState(false);
  const [checkInMessage, setCheckInMessage] =
    useState<string | null>(null);
  const [
    financialTransactions,
    setFinancialTransactions
  ] = useState<EventFinancialTransaction[]>([]);
  const [financialSummary, setFinancialSummary] =
    useState<EventFinancialSummary | null>(null);
  const [isLoadingFinancial, setIsLoadingFinancial] =
    useState(false);
  const [
    financialSearchInput,
    setFinancialSearchInput
  ] = useState("");
  const [
    financialSearch,
    setFinancialSearch
  ] = useState("");
  const [
    financialMethodFilter,
    setFinancialMethodFilter
  ] = useState("ALL");
  const [
    financialStatusFilter,
    setFinancialStatusFilter
  ] = useState("ALL");
  const [eventsList, setEventsList] = useState<
    EventSummaryOption[]
  >([]);
  const [isCreateModalOpen, setIsCreateModalOpen] =
    useState(false);
  const [isCreatingEvent, setIsCreatingEvent] =
    useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createDate, setCreateDate] = useState("");
  const [createCapacity, setCreateCapacity] =
    useState("50");
  const [createPrice, setCreatePrice] = useState("0");
  const [createIsPublic, setCreateIsPublic] =
    useState(false);
  const [
    createPublicRegistrationEnabled,
    setCreatePublicRegistrationEnabled
  ] = useState(false);
  const [
    createWaitlistEnabled,
    setCreateWaitlistEnabled
  ] = useState(true);
  const [createError, setCreateError] = useState<
    string | null
  >(null);
  const [isDuplicateModalOpen, setIsDuplicateModalOpen] =
    useState(false);
  const [isDuplicatingEvent, setIsDuplicatingEvent] =
    useState(false);
  const [duplicateTitle, setDuplicateTitle] =
    useState("");
  const [duplicateSlug, setDuplicateSlug] = useState("");
  const [duplicateDate, setDuplicateDate] = useState("");
  const [
    duplicateSlugTouched,
    setDuplicateSlugTouched
  ] = useState(false);
  const [duplicateError, setDuplicateError] = useState<
    string | null
  >(null);

  const statistics = useMemo(() => {
    const registrations = event?.registrations ?? [];

    return {
      active: registrations.filter(
        (registration) => registration.status !== "CANCELLED"
      ).length,
      checkedIn: registrations.filter(
        (registration) => registration.status === "CHECKED_IN"
      ).length,
      pendingPayments: registrations.filter(
        (registration) =>
          registration.paymentStatus === "PENDING" ||
          registration.paymentStatus === "WAITING_PAYMENT"
      ).length,
      waitlisted: registrations.filter(
        (registration) => registration.waitlistedAt
      ).length
    };
  }, [event]);

  useEffect(() => {
    async function loadEvent() {
      const token = getSessionToken();

      if (!token) {
        router.replace("/login");
        return;
      }

      setError(null);
      setIsLoading(true);

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/events/${eventId}`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          const data = await response.json() as ApiErrorResponse;

          setError(
            data.message ?? "Não foi possível carregar este evento."
          );
          return;
        }

        const data = await response.json() as EventDetail;

        setEvent(data);
      } catch {
        setError("Não foi possível carregar este evento agora.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadEvent();
  }, [eventId, router]);

  useEffect(() => {
    async function loadEventsList() {
      const token = getSessionToken();

      if (!token) {
        return;
      }

      try {
        const response = await fetch(
          `${API_BASE_URL}/api/events`,
          {
            cache: "no-store",
            headers: {
              Authorization: `Bearer ${token}`
            }
          }
        );

        if (!response.ok) {
          return;
        }

        const data =
          (await response.json()) as EventSummaryOption[];

        setEventsList(data);
      } catch {
      }
    }

    void loadEventsList();
  }, []);

  async function loadTickets() {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsLoadingTickets(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/tickets`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json() as
        | EventTicket[]
        | ApiErrorResponse;

      if (!response.ok) {
        setTicketError(
          !Array.isArray(data) && data.message
            ? data.message
            : "Não foi possível carregar os ingressos."
        );
        return;
      }

      const loadedTickets = data as EventTicket[];

      setTickets(loadedTickets);
      setSelectedTicketId((current) =>
        current || loadedTickets[0]?.id || ""
      );
    } catch {
      setTicketError(
        "Não foi possível carregar os ingressos agora."
      );
    } finally {
      setIsLoadingTickets(false);
    }
  }

  useEffect(() => {
    void loadTickets();
  }, [eventId]);

  async function loadFormFields() {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setIsLoadingFormFields(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/form-fields`,
        {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${token}`
          }
        }
      );

      const data = await response.json() as
        | EventFormField[]
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          !Array.isArray(data) && data.message
            ? data.message
            : "Não foi possível carregar o formulário."
        );
        return;
      }

      setFormFields(data as EventFormField[]);
    } catch {
      setError(
        "Não foi possível carregar o formulário agora."
      );
    } finally {
      setIsLoadingFormFields(false);
    }
  }

  useEffect(() => {
    void loadFormFields();
  }, [eventId]);

  useEffect(() => {
    const validFieldIds = new Set(
      formFields.map((field) => field.id)
    );

    setPreviewFieldValues((current) => {
      let hasOrphan = false;
      const next: Record<string, string | string[]> = {};

      for (const [fieldId, fieldValue] of Object.entries(
        current
      )) {
        if (validFieldIds.has(fieldId)) {
          next[fieldId] = fieldValue;
        } else {
          hasOrphan = true;
        }
      }

      return hasOrphan ? next : current;
    });
  }, [formFields]);

  async function handleCreateTicket(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const salesStart = String(
      formData.get("salesStart") ?? ""
    );
    const salesEnd = String(
      formData.get("salesEnd") ?? ""
    );

    setTicketError(null);
    setTicketMessage(null);

    if (
      !salesStart ||
      !salesEnd ||
      new Date(salesEnd) <= new Date(salesStart)
    ) {
      setTicketError(
        "O término das vendas deve ser posterior ao início."
      );
      return;
    }

    const isVisible =
      formData.get("ticketVisible") === "on";

    setIsCreatingTicket(true);

    try {
      const ticketResponse = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/tickets`,
        {
          body: JSON.stringify({
            name: String(
              formData.get("ticketName") ?? ""
            ).trim(),
            description:
              String(
                formData.get("ticketDescription") ?? ""
              ).trim() || undefined,
            isFree: ticketIsFree,
            isVisible
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const ticketData = await ticketResponse.json() as
        | EventTicket
        | ApiErrorResponse;

      if (!ticketResponse.ok) {
        setTicketError(
          "message" in ticketData && ticketData.message
            ? ticketData.message
            : "Não foi possível criar o ingresso."
        );
        return;
      }

      const createdTicket = ticketData as EventTicket;

      setSelectedTicketId(createdTicket.id);

      const batchResponse = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/ticket-batches`,
        {
          body: JSON.stringify({
            ticketId: createdTicket.id,
            name: String(
              formData.get("batchName") ?? ""
            ).trim(),
            quantity: Number(
              formData.get("batchQuantity")
            ),
            price: ticketIsFree
              ? 0
              : Number(formData.get("batchPrice")),
            salesStart,
            salesEnd,
            isVisible
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const batchFailureMessage = batchResponse.ok
        ? null
        : ((await batchResponse
            .json()
            .catch(() => null)) as
            | ApiErrorResponse
            | null)?.message ??
          "não foi possível criar o lote.";

      await loadTickets();

      if (batchFailureMessage) {
        setTicketError(
          `O ingresso "${createdTicket.name}" foi criado, mas o lote não: ${batchFailureMessage} Use "Adicionar lote" para cadastrar o lote deste ingresso.`
        );
        setIsCreateTicketOpen(false);
        return;
      }

      setTicketMessage("Ingresso e lote criados.");
      form.reset();
      setIsCreateTicketOpen(false);
    } catch {
      setTicketError(
        "Não foi possível criar o ingresso agora."
      );
    } finally {
      setIsCreatingTicket(false);
    }
  }

  async function handleCreateBatch(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const form = formEvent.currentTarget;
    const formData = new FormData(form);
    const selectedTicket = tickets.find(
      (ticket) => ticket.id === selectedTicketId
    );
    const salesStart = String(
      formData.get("salesStart") ?? ""
    );
    const salesEnd = String(
      formData.get("salesEnd") ?? ""
    );

    if (!selectedTicket) {
      setTicketError("Selecione um ingresso.");
      return;
    }

    setTicketError(null);
    setTicketMessage(null);

    if (
      !salesStart ||
      !salesEnd ||
      new Date(salesEnd) <= new Date(salesStart)
    ) {
      setTicketError(
        "O término das vendas deve ser posterior ao início."
      );
      return;
    }

    setIsCreatingBatch(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/ticket-batches`,
        {
          body: JSON.stringify({
            ticketId: selectedTicket.id,
            name: String(
              formData.get("batchName") ?? ""
            ).trim(),
            quantity: Number(
              formData.get("batchQuantity")
            ),
            price: selectedTicket.isFree
              ? 0
              : Number(formData.get("batchPrice")),
            salesStart,
            salesEnd,
            isVisible:
              formData.get("batchVisible") === "on"
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = await response.json() as
        | TicketBatch
        | ApiErrorResponse;

      if (!response.ok) {
        setTicketError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível criar o lote."
        );
        return;
      }

      const createdBatch = data as TicketBatch;

      setTickets((current) =>
        current.map((ticket) =>
          ticket.id === selectedTicket.id
            ? {
                ...ticket,
                batches: [
                  ...ticket.batches,
                  createdBatch
                ]
              }
            : ticket
        )
      );
      setTicketMessage("Lote criado.");
      form.reset();
      setIsCreateBatchOpen(false);
    } catch {
      setTicketError(
        "Não foi possível criar o lote agora."
      );
    } finally {
      setIsCreatingBatch(false);
    }
  }

  async function handleUpdateTicket() {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return false;
    }

    if (!editingTicketId) {
      return false;
    }

    setTicketError(null);
    setTicketMessage(null);
    setIsSavingTicket(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/tickets/${editingTicketId}`,
        {
          body: JSON.stringify({
            name: editingTicketName.trim(),
            description:
              editingTicketDescription.trim(),
            isFree: editingTicketIsFree,
            isVisible: editingTicketIsVisible
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventTicket
        | ApiErrorResponse;

      if (!response.ok) {
        setTicketError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível atualizar o ingresso."
        );
        return false;
      }

      return true;
    } catch {
      setTicketError(
        "Não foi possível atualizar o ingresso agora."
      );
      return false;
    } finally {
      setIsSavingTicket(false);
    }
  }

  async function handleUpdateBatch() {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return false;
    }

    if (!editingBatchId) {
      return false;
    }

    setTicketError(null);
    setTicketMessage(null);
    setIsSavingBatch(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/ticket-batches/${editingBatchId}`,
        {
          body: JSON.stringify({
            name: editingBatchName.trim(),
            quantity: Number(editingBatchQuantity),
            price: editingTicketIsFree
              ? 0
              : Number(editingBatchPrice),
            salesStart: editingBatchSalesStart,
            salesEnd: editingBatchSalesEnd,
            isVisible: editingBatchIsVisible
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | TicketBatch
        | ApiErrorResponse;

      if (!response.ok) {
        setTicketError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível atualizar o lote."
        );
        return false;
      }

      return true;
    } catch {
      setTicketError(
        "Não foi possível atualizar o lote agora."
      );
      return false;
    } finally {
      setIsSavingBatch(false);
    }
  }

  function closeTicketEditor() {
    setEditingTicketId(null);
    setEditingBatchId(null);
  }

  function closeTicketDialog() {
    setIsCreateTicketOpen(false);
    setIsCreateBatchOpen(false);
    setTicketIsFree(true);
    setTicketError(null);
    closeTicketEditor();
  }

  async function handleSaveTicketRow(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const sold = editingBatch?._count.registrations ?? 0;
    const nextQuantity = Number(editingBatchQuantity);
    const nextPrice = editingTicketIsFree
      ? 0
      : Number(editingBatchPrice);

    if (editingBatch) {
      if (
        !Number.isInteger(nextQuantity) ||
        nextQuantity < 1 ||
        nextQuantity < sold
      ) {
        setTicketError(
          nextQuantity < sold
            ? "A quantidade não pode ser menor que as unidades já vendidas."
            : "Informe uma quantidade válida."
        );
        return;
      }

      if (
        !editingBatchSalesStart ||
        !editingBatchSalesEnd ||
        new Date(editingBatchSalesEnd) <=
          new Date(editingBatchSalesStart)
      ) {
        setTicketError(
          "O término das vendas deve ser posterior ao início."
        );
        return;
      }

      if (
        !editingTicketIsFree &&
        (!Number.isFinite(nextPrice) || nextPrice < 0)
      ) {
        setTicketError("Informe um valor válido.");
        return;
      }
    }

    const shouldUpdateTicket =
      editingTicket !== null &&
      (editingTicketName.trim() !== editingTicket.name ||
        editingTicketDescription.trim() !==
          (editingTicket.description ?? "").trim() ||
        editingTicketIsFree !== editingTicket.isFree ||
        editingTicketIsVisible !==
          editingTicket.isVisible);
    const shouldUpdateBatch =
      editingBatch !== null &&
      (editingBatchName.trim() !== editingBatch.name ||
        nextQuantity !== editingBatch.quantity ||
        nextPrice !== Number(editingBatch.price) ||
        editingBatchSalesStart !==
          formatDateTimeLocal(editingBatch.salesStart) ||
        editingBatchSalesEnd !==
          formatDateTimeLocal(editingBatch.salesEnd) ||
        editingBatchIsVisible !== editingBatch.isVisible);

    if (!shouldUpdateTicket && !shouldUpdateBatch) {
      closeTicketEditor();
      return;
    }

    if (
      shouldUpdateTicket &&
      !(await handleUpdateTicket())
    ) {
      return;
    }

    if (
      shouldUpdateBatch &&
      !(await handleUpdateBatch())
    ) {
      if (shouldUpdateTicket) {
        await loadTickets();
      }
      return;
    }

    await loadTickets();
    setTicketMessage(
      shouldUpdateTicket && shouldUpdateBatch
        ? "Ingresso e lote atualizados."
        : shouldUpdateTicket
          ? "Ingresso atualizado."
          : "Lote atualizado."
    );
    closeTicketEditor();
  }

  function closeFormFieldOverlay() {
    setIsFormFieldOverlayOpen(false);
    setEditingFormFieldId(null);
  }

  function openCreateFormFieldOverlay(
    type: EventFormFieldType
  ) {
    setEditingFormFieldId(null);
    setOverlayFormFieldType(type);
    setOverlayFormFieldLabel("");
    setOverlayFormFieldRequired(false);
    setOverlayFormFieldSensitive(false);
    setOverlayTicketScopeEnabled(false);
    setOverlayTicketIds([]);
    setOverlayFieldOptions("");
    setIsFormFieldOverlayOpen(true);
  }

  function openEditFormFieldOverlay(field: EventFormField) {
    const ticketIds = field.ticketScopes.map(
      (scope) => scope.ticket.id
    );
    setEditingFormFieldId(field.id);
    setOverlayFormFieldType(field.type);
    setOverlayFormFieldLabel(field.label);
    setOverlayFormFieldRequired(field.isRequired);
    setOverlayFormFieldSensitive(field.isSensitive);
    setOverlayTicketScopeEnabled(ticketIds.length > 0);
    setOverlayTicketIds(ticketIds);
    setOverlayFieldOptions(
      field.options
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((option) => option.label)
        .join("\n")
    );
    setIsFormFieldOverlayOpen(true);
  }

  async function handleSaveFormFieldOverlay(
    formEvent: FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const options = overlayFieldOptions
      .split("\n")
      .map((option) => option.trim())
      .filter(Boolean)
      .map((option) => ({
        label: option,
        value: option
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/(^-|-$)/g, "")
      }));

    setError(null);
    setFormFieldMessage(null);
    setIsSavingFormFieldOverlay(true);

    try {
      const isEditing = editingFormFieldId !== null;
      const payload = {
        isRequired: overlayFormFieldRequired,
        isSensitive: overlayFormFieldSensitive,
        label: overlayFormFieldLabel.trim(),
        options: formFieldTypeNeedsOptions(
          overlayFormFieldType
        )
          ? options
          : [],
        ticketIds: overlayTicketScopeEnabled
          ? overlayTicketIds
          : [],
        type: overlayFormFieldType
      };
      const requestPayload = isEditing
        ? payload
        : {
            ...payload,
            isActive: true
          };
      const response = await fetch(
        isEditing
          ? `${API_BASE_URL}/api/events/${eventId}/form-fields/${editingFormFieldId}`
          : `${API_BASE_URL}/api/events/${eventId}/form-fields`,
        {
          body: JSON.stringify(requestPayload),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: isEditing ? "PATCH" : "POST"
        }
      );

      const data = await response.json() as
        | EventFormField
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : isEditing
              ? "Não foi possível atualizar o campo."
              : "Não foi possível criar o campo."
        );
        return;
      }

      if (isEditing) {
        setFormFields((current) =>
          current.map((field) =>
            field.id === editingFormFieldId
              ? (data as EventFormField)
              : field
          )
        );
        setFormFieldMessage("Campo atualizado.");
      } else {
        setFormFields((current) => [
          ...current,
          data as EventFormField
        ]);
        setFormFieldMessage("Campo criado.");
      }
      closeFormFieldOverlay();
    } catch {
      setError(
        editingFormFieldId
          ? "Não foi possível atualizar o campo agora."
          : "Não foi possível criar o campo agora."
      );
    } finally {
      setIsSavingFormFieldOverlay(false);
    }
  }

  async function handleToggleFormField(
    field: EventFormField
  ) {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setError(null);
    setFormFieldMessage(null);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/form-fields/${field.id}`,
        {
          body: JSON.stringify({
            isActive: !field.isActive
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventFormField
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível atualizar o campo."
        );
        return;
      }

      setFormFields((current) =>
        current.map((currentField) =>
          currentField.id === field.id
            ? data as EventFormField
            : currentField
        )
      );
    } catch {
      setError(
        "Não foi possível atualizar o campo agora."
      );
    }
  }

  async function handleMoveFormField(
    fieldId: string,
    direction: -1 | 1
  ) {
    const currentIndex = formFields.findIndex(
      (field) => field.id === fieldId
    );
    const targetIndex = currentIndex + direction;

    if (
      currentIndex < 0 ||
      targetIndex < 0 ||
      targetIndex >= formFields.length
    ) {
      return;
    }

    const reordered = [...formFields];
    const [field] = reordered.splice(currentIndex, 1);

    if (!field) {
      return;
    }

    reordered.splice(targetIndex, 0, field);

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${eventId}/form-fields-order`,
        {
          body: JSON.stringify({
            fieldIds: reordered.map(
              (currentField) => currentField.id
            )
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventFormField[]
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          !Array.isArray(data) && data.message
            ? data.message
            : "Não foi possível alterar a ordem."
        );
        return;
      }

      setFormFields(data as EventFormField[]);
    } catch {
      setError(
        "Não foi possível alterar a ordem agora."
      );
    }
  }

  const normalizeEventSearch = (
    value: string
  ) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase()
      .replace(/\s+/g, " ");

  const getRegistrationStatusLabel = (
    status: string
  ) => {
    const labels: Record<string, string> = {
      PENDING: "Pendente",
      CONFIRMED: "Confirmada",
      CHECKED_IN: "Presente",
      CANCELLED: "Cancelada"
    };

    return labels[status] ?? status;
  };

  const getPaymentStatusLabel = (
    status: string
  ) => {
    const labels: Record<string, string> = {
      PAID: "Pago",
      PENDING: "Pendente",
      WAITING_PAYMENT: "Aguardando pagamento",
      NOT_REQUIRED: "Não necessário",
      CANCELLED: "Cancelado",
      REFUNDED: "Reembolsado"
    };

    return labels[status] ?? status;
  };

  const filteredParticipants =
    event?.registrations.filter((registration) => {
      const participant =
        registration.person ?? registration.visitor;

      if (!participant) {
        return false;
      }

      const search =
        normalizeEventSearch(
          participantSearch
        );

      const matchesSearch =
        !search ||
        [
          participant.name,
          participant.phone,
          participant.email ?? "",
          registration.checkInToken
        ].some((value) =>
          normalizeEventSearch(
            value
          ).includes(search)
        );

      const matchesStatus =
        participantStatus === "ALL" ||
        registration.status === participantStatus;

      const matchesPayment =
        participantPayment === "ALL" ||
        registration.paymentStatus ===
          participantPayment;

      const matchesTicket =
        participantTicket === "ALL" ||
        registration.ticket?.id ===
          participantTicket;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPayment &&
        matchesTicket
      );
    }) ?? [];

  async function handleCheckInByCode(
    formEvent: React.FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();
    const code = checkInCode.trim();

    if (!token) {
      router.replace("/login");
      return;
    }

    if (!code) {
      setError("Informe o código de check-in.");
      return;
    }

    setError(null);
    setCheckInMessage(null);
    setIsCheckingIn(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/registrations/check-in-token`,
        {
          body: JSON.stringify({
            eventId,
            checkInToken: code
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = await response.json() as
        | EventDetail["registrations"][number]
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível realizar o check-in."
        );
        return;
      }

      const updatedRegistration =
        data as EventDetail["registrations"][number];

      setEvent((current) =>
        current
          ? {
              ...current,
              registrations:
                current.registrations.map(
                  (registration) =>
                    registration.id ===
                    updatedRegistration.id
                      ? {
                          ...registration,
                          ...updatedRegistration
                        }
                      : registration
                )
            }
          : current
      );
      setCheckInCode("");
      setCheckInMessage("Check-in realizado.");
    } catch {
      setError(
        "Não foi possível realizar o check-in agora."
      );
    } finally {
      setIsCheckingIn(false);
    }
  }

  async function handleParticipantCheckIn(
    registrationId: string
  ) {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setError(null);
    setCheckInMessage(null);
    setIsCheckingIn(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/registrations/status`,
        {
          body: JSON.stringify({
            registrationId,
            status: "CHECKED_IN"
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = await response.json() as
        | EventDetail["registrations"][number]
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível realizar o check-in."
        );
        return;
      }

      const updatedRegistration =
        data as EventDetail["registrations"][number];

      setEvent((current) =>
        current
          ? {
              ...current,
              registrations:
                current.registrations.map(
                  (registration) =>
                    registration.id ===
                    updatedRegistration.id
                      ? {
                          ...registration,
                          ...updatedRegistration
                        }
                      : registration
                )
            }
          : current
      );
      setCheckInMessage("Check-in realizado.");
    } catch {
      setError(
        "Não foi possível realizar o check-in agora."
      );
    } finally {
      setIsCheckingIn(false);
    }
  }

  const checkInParticipants =
    event?.registrations.filter((registration) => {
      const participant =
        registration.person ?? registration.visitor;

      if (!participant) {
        return false;
      }

      const search =
        normalizeEventSearch(
          checkInSearch
        );

      return (
        !search ||
        [
          participant.name,
          participant.phone,
          participant.email ?? "",
          registration.checkInToken
        ].some((value) =>
          normalizeEventSearch(
            value
          ).includes(search)
        )
      );
    }) ?? [];

  function normalizeFinancialSearch(
    value: string
  ) {
    return value
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  }

  function getEventFinancialRegistrations(
    transaction:
      EventFinancialTransaction
  ) {
    return (
      transaction.eventPayment
        ?.order.registrations ??
      []
    );
  }

  function getEventFinancialParticipants(
    transaction:
      EventFinancialTransaction
  ) {
    const participants =
      getEventFinancialRegistrations(
        transaction
      )
        .map(
          (registration) =>
            registration.person ??
            registration.visitor
        )
        .filter(
          (
            participant
          ): participant is
            EventFinancialParticipant =>
            Boolean(participant)
        );

    if (
      participants.length === 0 &&
      transaction.person
    ) {
      return [
        transaction.person
      ];
    }

    return participants;
  }

  function getEventFinancialMethodLabel(
    method: string
  ) {
    if (method === "PIX") {
      return "PIX";
    }

    if (method === "CARD") {
      return "Cartão";
    }

    return method;
  }

  function getEventPaymentStatusLabel(
    status: string | null
  ) {
    if (status === "PAID") {
      return "Pago";
    }

    if (status === "PENDING") {
      return "Pendente";
    }

    if (status === "OVERDUE") {
      return "Vencido";
    }

    if (
      status ===
      "REFUND_PENDING"
    ) {
      return "Reembolso em processamento";
    }

    if (status === "CANCELLED") {
      return "Cancelado";
    }

    return "Sem pagamento";
  }

  function getTransactionStatusLabel(
    status:
      EventFinancialTransaction["status"]
  ) {
    if (status === "ACTIVE") {
      return "Ativa";
    }

    if (status === "CANCELLED") {
      return "Cancelada";
    }

    return "Estornada";
  }

  const filteredFinancialTransactions =
    financialTransactions.filter(
      (transaction) => {
        const search =
          normalizeFinancialSearch(
            financialSearch
          );

        const registrations =
          getEventFinancialRegistrations(
            transaction
          );

        const participants =
          getEventFinancialParticipants(
            transaction
          );

        const paymentStatus =
          transaction.eventPayment
            ?.status ?? null;

        const searchableValues = [
          transaction.asaasId,
          transaction.eventPayment
            ?.providerPaymentId,
          transaction.eventPayment
            ?.provider,
          transaction.costCenter,
          getEventFinancialMethodLabel(
            transaction.method
          ),
          getEventPaymentStatusLabel(
            paymentStatus
          ),
          getTransactionStatusLabel(
            transaction.status
          ),
          ...participants.flatMap(
            (participant) => [
              participant.name,
              participant.email,
              participant.phone
            ]
          ),
          ...registrations.flatMap(
            (registration) => [
              registration.ticket?.name,
              registration.ticketBatch
                ?.name
            ]
          )
        ];

        const matchesSearch =
          !search ||
          searchableValues.some(
            (value) =>
              value &&
              normalizeFinancialSearch(
                String(value)
              ).includes(search)
          );

        const matchesMethod =
          financialMethodFilter ===
            "ALL" ||
          transaction.method ===
            financialMethodFilter;

        let matchesStatus = true;

        if (
          financialStatusFilter ===
          "PAID"
        ) {
          matchesStatus =
            paymentStatus === "PAID" &&
            transaction.status ===
              "ACTIVE";
        }

        if (
          financialStatusFilter ===
          "PENDING"
        ) {
          matchesStatus =
            paymentStatus ===
              "PENDING" ||
            paymentStatus ===
              "OVERDUE";
        }

        if (
          financialStatusFilter ===
          "REFUND_PENDING"
        ) {
          matchesStatus =
            paymentStatus ===
              "REFUND_PENDING";
        }

        if (
          financialStatusFilter ===
          "CANCELLED"
        ) {
          matchesStatus =
            transaction.status ===
              "CANCELLED";
        }

        if (
          financialStatusFilter ===
          "REFUNDED"
        ) {
          matchesStatus =
            transaction.status ===
              "REVERSED";
        }

        return (
          matchesSearch &&
          matchesMethod &&
          matchesStatus
        );
      }
    );

  async function loadEventFinancial() {
    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setError(null);
    setIsLoadingFinancial(true);

    try {
      const query =
        new URLSearchParams({
          eventId
        }).toString();

      const [summaryResponse, transactionsResponse] =
        await Promise.all([
          fetch(
            `${API_BASE_URL}/api/financial/summary?${query}`,
            {
              cache: "no-store",
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          ),
          fetch(
            `${API_BASE_URL}/api/financial/transactions?${query}`,
            {
              cache: "no-store",
              headers: {
                Authorization: `Bearer ${token}`
              }
            }
          )
        ]);

      if (
        !summaryResponse.ok ||
        !transactionsResponse.ok
      ) {
        const failedResponse =
          !summaryResponse.ok
            ? summaryResponse
            : transactionsResponse;

        const data =
          await failedResponse.json() as
            ApiErrorResponse;

        setError(
          data.message ??
            "Não foi possível carregar o financeiro."
        );
        return;
      }

      setFinancialSummary(
        await summaryResponse.json() as
          EventFinancialSummary
      );

      setFinancialTransactions(
        await transactionsResponse.json() as
          EventFinancialTransaction[]
      );
    } catch {
      setError(
        "Não foi possível carregar o financeiro agora."
      );
    } finally {
      setIsLoadingFinancial(false);
    }
  }

  useEffect(() => {
    if (
      activeSection === "financial" ||
      activeSection === "overview"
    ) {
      void loadEventFinancial();
    }
  }, [activeSection, eventId]);

  const publicRegistrationUrl = event
    ? `${WEB_BASE_URL}/eventos/${event.id}?returnTo=${encodeURIComponent(`/dashboard/eventos/${event.id}`)}`
    : "#";

  const eventAppUrl = event
    ? `${EVENTS_APP_BASE_URL}/${encodeURIComponent(event.church.slug)}/${encodeURIComponent(event.slug)}`
    : "#";

  function formatDateTimeLocal(value: string) {
    const date = new Date(value);
    const timezoneOffset = date.getTimezoneOffset() * 60_000;

    return new Date(date.getTime() - timezoneOffset)
      .toISOString()
      .slice(0, 16);
  }

  function openCreateEventModal() {
    setCreateTitle("");
    setCreateDate("");
    setCreateCapacity("50");
    setCreatePrice("0");
    setCreateIsPublic(false);
    setCreatePublicRegistrationEnabled(false);
    setCreateWaitlistEnabled(true);
    setCreateError(null);
    setIsCreateModalOpen(true);
  }

  function closeCreateEventModal() {
    if (isCreatingEvent) {
      return;
    }

    setIsCreateModalOpen(false);
    setCreateError(null);
  }

  function openDuplicateEventModal() {
    if (!event) {
      return;
    }

    const nextTitle = `Cópia de ${event.title}`;

    setDuplicateTitle(nextTitle);
    setDuplicateSlug(createSlug(nextTitle));
    setDuplicateDate(formatDateTimeLocal(event.date));
    setDuplicateSlugTouched(false);
    setDuplicateError(null);
    setIsDuplicateModalOpen(true);
  }

  function closeDuplicateEventModal() {
    if (isDuplicatingEvent) {
      return;
    }

    setIsDuplicateModalOpen(false);
    setDuplicateError(null);
  }

  async function handleCreateEvent(
    formEvent: FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const slug = createSlug(createTitle);

    if (!slug) {
      setCreateError(
        "Informe um título válido para gerar o slug do evento."
      );
      return;
    }

    setCreateError(null);
    setIsCreatingEvent(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events`,
        {
          body: JSON.stringify({
            capacity: Number(createCapacity),
            date: new Date(createDate).toISOString(),
            isPaid: Number(createPrice) > 0,
            isPublic: createIsPublic,
            price: Number(createPrice),
            publicRegistrationEnabled:
              createPublicRegistrationEnabled,
            slug,
            title: createTitle,
            waitlistEnabled: createWaitlistEnabled
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = (await response.json()) as
        | { id: string }
        | ApiErrorResponse;

      if (!response.ok) {
        setCreateError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível cadastrar o evento."
        );
        return;
      }

      if (!("id" in data) || !data.id) {
        setCreateError(
          "Não foi possível cadastrar o evento."
        );
        return;
      }

      setIsCreateModalOpen(false);
      router.push(`/dashboard/eventos/${data.id}`);
    } catch {
      setCreateError(
        "Não foi possível cadastrar o evento agora."
      );
    } finally {
      setIsCreatingEvent(false);
    }
  }

  async function handleDuplicateEvent(
    formEvent: FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    if (!event) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const title = duplicateTitle.trim();
    const slug = duplicateSlug.trim();

    if (!title || !slug || !duplicateDate) {
      setDuplicateError(
        "Preencha título, slug e data para duplicar o evento."
      );
      return;
    }

    setDuplicateError(null);
    setIsDuplicatingEvent(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${event.id}/duplicate`,
        {
          body: JSON.stringify({
            date: new Date(duplicateDate).toISOString(),
            slug,
            title
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "POST"
        }
      );

      const data = (await response.json()) as
        | { id: string }
        | ApiErrorResponse;

      if (!response.ok) {
        setDuplicateError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível duplicar o evento."
        );
        return;
      }

      if (!("id" in data) || !data.id) {
        setDuplicateError(
          "Não foi possível duplicar o evento."
        );
        return;
      }

      setIsDuplicateModalOpen(false);
      router.push(`/dashboard/eventos/${data.id}`);
    } catch {
      setDuplicateError(
        "Não foi possível duplicar o evento agora."
      );
    } finally {
      setIsDuplicatingEvent(false);
    }
  }

  async function handleSaveInformation(
    formEvent: FormEvent<HTMLFormElement>
  ) {
    formEvent.preventDefault();

    if (!event) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    const formData = new FormData(formEvent.currentTarget);
    const title = String(formData.get("title") ?? "").trim();
    const slug = String(formData.get("slug") ?? "").trim();
    const date = String(formData.get("date") ?? "");
    const capacity = Number(formData.get("capacity"));
    const price = Number(formData.get("price"));

    setError(null);
    setInformationMessage(null);
    setIsSavingInformation(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${event.id}`,
        {
          body: JSON.stringify({
            title,
            slug,
            date,
            capacity,
            price,
            isPaid: price > 0,
            waitlistEnabled:
              formData.get("waitlistEnabled") === "on"
          }),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventDetail
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível atualizar o evento."
        );
        return;
      }

      const updatedEvent = data as EventDetail;

      setEvent((current) =>
        current
          ? {
              ...current,
              ...updatedEvent
            }
          : current
      );
      setInformationMessage(
        "Informações do evento atualizadas."
      );
      setIsEditingInformation(false);
    } catch {
      setError(
        "Não foi possível atualizar o evento agora."
      );
    } finally {
      setIsSavingInformation(false);
    }
  }

  async function handleUpdatePublicationState(
    payload:
      | { isPublic: boolean }
      | { publicRegistrationEnabled: boolean }
  ) {
    if (!event || isUpdatingPublicationState) {
      return;
    }

    const token = getSessionToken();

    if (!token) {
      router.replace("/login");
      return;
    }

    setError(null);
    setInformationMessage(null);
    setIsUpdatingPublicationState(true);

    try {
      const response = await fetch(
        `${API_BASE_URL}/api/events/${event.id}`,
        {
          body: JSON.stringify(payload),
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          method: "PATCH"
        }
      );

      const data = await response.json() as
        | EventDetail
        | ApiErrorResponse;

      if (!response.ok) {
        setError(
          "message" in data && data.message
            ? data.message
            : "Não foi possível atualizar o evento."
        );
        return;
      }

      const updatedEvent = data as EventDetail;

      setEvent((current) =>
        current
          ? {
              ...current,
              ...updatedEvent
            }
          : current
      );
    } catch {
      setError(
        "Não foi possível atualizar o evento agora."
      );
    } finally {
      setIsUpdatingPublicationState(false);
    }
  }

  const editingTicket =
    tickets.find((ticket) => ticket.id === editingTicketId) ??
    null;
  const editingBatch =
    tickets
      .flatMap((ticket) => ticket.batches)
      .find((batch) => batch.id === editingBatchId) ??
    null;

  const isTicketDialogOpen =
    isCreateTicketOpen ||
    isCreateBatchOpen ||
    editingTicket !== null ||
    editingBatch !== null;

  const ticketRows = tickets.flatMap((ticket) =>
    ticket.batches.length > 0
      ? ticket.batches.map((batch) => ({
          batch: batch as TicketBatch | null,
          key: `${ticket.id}:${batch.id}`,
          ticket
        }))
      : [
          {
            batch: null as TicketBatch | null,
            key: ticket.id,
            ticket
          }
        ]
  );

  const normalizedTicketSearch = ticketSearch
    .trim()
    .toLowerCase();

  const visibleTicketRows = normalizedTicketSearch
    ? ticketRows.filter(
        (row) =>
          row.ticket.name
            .toLowerCase()
            .includes(normalizedTicketSearch) ||
          (row.batch?.name
            .toLowerCase()
            .includes(normalizedTicketSearch) ??
            false)
      )
    : ticketRows;

  const customFieldActions: Array<{
    label: string;
    type: EventFormFieldType;
  }> = [
    { label: "Lista", type: "SELECT" },
    {
      label: "Múltipla escolha",
      type: "SINGLE_CHOICE"
    },
    {
      label: "Vários valores",
      type: "MULTIPLE_CHOICE"
    },
    { label: "Texto", type: "TEXT" },
    { label: "Parágrafo", type: "PARAGRAPH" }
  ];
  const formFieldsOrdered = formFields
    .slice()
    .sort((a, b) => a.order - b.order);
  const overlayLabelCharsLeft = Math.max(
    0,
    150 - overlayFormFieldLabel.length
  );

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
      <section
        style={{
          display: "grid",
          gap: "24px",
          margin: "0 auto",
          maxWidth: "1180px"
        }}
      >
        <Link
          href="/dashboard"
          style={{
            color: "#93c5fd",
            fontSize: "14px",
            fontWeight: 800,
            textDecoration: "none"
          }}
        >
          Voltar ao painel
        </Link>

        {isLoading ? (
          <p style={{ color: "#cbd5e1", margin: 0 }}>
            Carregando evento...
          </p>
        ) : null}

        {error ? (
          <section
            style={{
              background: "rgba(127, 29, 29, 0.32)",
              border: "1px solid rgba(248, 113, 113, 0.28)",
              borderRadius: "22px",
              padding: "22px"
            }}
          >
            <h1
              style={{
                color: "#ffffff",
                fontSize: "26px",
                margin: "0 0 8px"
              }}
            >
              Evento indisponível
            </h1>

            <p
              style={{
                color: "#fecaca",
                lineHeight: 1.6,
                margin: 0
              }}
            >
              {error}
            </p>
          </section>
        ) : null}

        {event ? (
          <>
            <header
              style={{
                alignItems: "flex-start",
                background:
                  "linear-gradient(135deg, rgba(15, 23, 42, 0.9), rgba(30, 41, 59, 0.78))",
                border: "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "28px",
                display: "flex",
                flexWrap: "wrap",
                gap: "20px",
                justifyContent: "space-between",
                padding: "28px"
              }}
            >
              <div>
                <p
                  style={{
                    color: "#60a5fa",
                    fontSize: "13px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    margin: "0 0 10px",
                    textTransform: "uppercase"
                  }}
                >
                  {event.church.name}
                </p>

                <label
                  style={{
                    color: "#94a3b8",
                    display: "grid",
                    fontSize: "12px",
                    fontWeight: 800,
                    gap: "8px",
                    marginBottom: "14px",
                    maxWidth: "420px"
                  }}
                >
                  Evento

                  <select
                    onChange={(changeEvent) => {
                      const nextEventId =
                        changeEvent.target.value;

                      if (
                        nextEventId &&
                        nextEventId !== event.id
                      ) {
                        router.push(
                          `/dashboard/eventos/${nextEventId}`
                        );
                      }
                    }}
                    style={{
                      background: "#0f172a",
                      border:
                        "1px solid rgba(148, 163, 184, 0.3)",
                      borderRadius: "12px",
                      color: "#ffffff",
                      font: "inherit",
                      fontSize: "14px",
                      fontWeight: 700,
                      padding: "11px 12px"
                    }}
                    value={event.id}
                  >
                    {(eventsList.length > 0
                      ? eventsList
                      : [
                          {
                            date: event.date,
                            id: event.id,
                            title: event.title
                          }
                        ]
                    ).map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </label>

                <h1
                  style={{
                    color: "#ffffff",
                    fontSize: "34px",
                    letterSpacing: "-0.04em",
                    margin: "0 0 10px"
                  }}
                >
                  {event.title}
                </h1>

                <p
                  style={{
                    color: "#cbd5e1",
                    lineHeight: 1.6,
                    margin: 0
                  }}
                >
                  {formatDate(event.date)}
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "10px"
                }}
              >
                <a
                  href={publicRegistrationUrl}
                  rel="noreferrer"
                  style={{
                    background: "rgba(15, 23, 42, 0.68)",
                    border: "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "14px",
                    color: "#e2e8f0",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "12px 16px",
                    textDecoration: "none"
                  }}
                  target="_blank"
                >
                  Página de inscrição
                </a>

                <a
                  href={eventAppUrl}
                  rel="noreferrer"
                  style={{
                    background: "#2563eb",
                    borderRadius: "14px",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "12px 16px",
                    textDecoration: "none"
                  }}
                  target="_blank"
                >
                  Abrir aplicativo
                </a>
              </div>
            </header>

            <div
              style={{
                alignItems: "start",
                display: "grid",
                gap: "24px",
                gridTemplateColumns:
                  "minmax(210px, 250px) minmax(0, 1fr)"
              }}
            >
              <nav
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border:
                    "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  display: "grid",
                  gap: "8px",
                  padding: "12px",
                  position: "sticky",
                  top: "24px"
                }}
              >
                <button
                  onClick={() =>
                    setActiveSection("overview")
                  }
                  style={{
                    background:
                      activeSection === "overview"
                        ? "#2563eb"
                        : "transparent",
                    border: 0,
                    borderRadius: "12px",
                    color:
                      activeSection === "overview"
                        ? "#ffffff"
                        : "#cbd5e1",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "12px 14px",
                    textAlign: "left"
                  }}
                  type="button"
                >
                  Visão geral
                </button>

                <button
                  onClick={openCreateEventModal}
                  style={{
                    background:
                      "rgba(37, 99, 235, 0.12)",
                    border:
                      "1px dashed rgba(96, 165, 250, 0.45)",
                    borderRadius: "12px",
                    color: "#93c5fd",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "12px 14px",
                    textAlign: "left"
                  }}
                  type="button"
                >
                  + Criar evento
                </button>

                {[
                  ["information", "Informações"],
                  ["tickets", "Ingressos"],
                  ["registration-form", "Formulário de inscrição"],
                  ["participants", "Participantes"],
                  ["check-in", "Check-in"],
                  ["financial", "Financeiro"],
                  ["event-app", "Aplicativo do Evento"]
                ].map(([section, label]) => (
                  <button
                    key={section}
                    onClick={() =>
                      setActiveSection(
                        section as EventWorkspaceSection
                      )
                    }
                    style={{
                      background:
                        activeSection === section
                          ? "#2563eb"
                          : "transparent",
                      border: 0,
                      borderRadius: "12px",
                      color:
                        activeSection === section
                          ? "#ffffff"
                          : "#cbd5e1",
                      cursor: "pointer",
                      fontSize: "14px",
                      fontWeight: 900,
                      padding: "12px 14px",
                      textAlign: "left"
                    }}
                    type="button"
                  >
                    {label}
                  </button>
                ))}
              </nav>

              <div
                style={{
                  display: "grid",
                  gap: "20px",
                  minWidth: 0
                }}
              >
            {activeSection === "overview" ? (
              <section
                id="visao-geral"
                style={{
                  display: "grid",
                  gap: "20px"
                }}
              >
                <header
                  style={{
                    alignItems: "flex-start",
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "16px",
                    justifyContent: "space-between"
                  }}
                >
                  <div>
                    <p
                      style={{
                        color: "#60a5fa",
                        fontSize: "13px",
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        margin: "0 0 8px",
                        textTransform: "uppercase"
                      }}
                    >
                      Visão geral
                    </p>

                    <h2
                      style={{
                        color: "#ffffff",
                        fontSize: "26px",
                        margin: 0
                      }}
                    >
                      Resumo operacional do evento
                    </h2>

                    <p
                      style={{
                        color: "#94a3b8",
                        lineHeight: 1.6,
                        margin: "8px 0 0",
                        maxWidth: "680px"
                      }}
                    >
                      Acompanhe publicação, inscrições, ingressos,
                      check-in e financeiro em uma única visão.
                    </p>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px"
                    }}
                  >
                    <span
                      style={{
                        background: event.isPublic
                          ? "rgba(34, 197, 94, 0.14)"
                          : "rgba(245, 158, 11, 0.14)",
                        border: event.isPublic
                          ? "1px solid rgba(34, 197, 94, 0.3)"
                          : "1px solid rgba(245, 158, 11, 0.3)",
                        borderRadius: "999px",
                        color: event.isPublic
                          ? "#86efac"
                          : "#fcd34d",
                        fontSize: "13px",
                        fontWeight: 900,
                        padding: "8px 12px"
                      }}
                    >
                      {event.isPublic ? "Publicado" : "Rascunho"}
                    </span>

                    <span
                      style={{
                        background: event.publicRegistrationEnabled
                          ? "rgba(59, 130, 246, 0.14)"
                          : "rgba(148, 163, 184, 0.12)",
                        border: event.publicRegistrationEnabled
                          ? "1px solid rgba(59, 130, 246, 0.3)"
                          : "1px solid rgba(148, 163, 184, 0.22)",
                        borderRadius: "999px",
                        color: event.publicRegistrationEnabled
                          ? "#93c5fd"
                          : "#cbd5e1",
                        fontSize: "13px",
                        fontWeight: 900,
                        padding: "8px 12px"
                      }}
                    >
                      {event.publicRegistrationEnabled
                        ? "Inscrições abertas"
                        : "Inscrições fechadas"}
                    </span>
                  </div>
                </header>

                <div
                  style={{
                    display: "grid",
                    gap: "14px",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(160px, 1fr))"
                  }}
                >
                  {[
                    {
                      label: "Inscrições",
                      value:
                        statistics.active + "/" + event.capacity
                    },
                    {
                      label: "Check-ins",
                      value: String(statistics.checkedIn)
                    },
                    {
                      label: "Lista de espera",
                      value: String(statistics.waitlisted)
                    },
                    {
                      label: "Ingressos",
                      value: String(tickets.length)
                    },
                    {
                      label: "Valor",
                      value: event.isPaid
                        ? formatMoney(event.price)
                        : "Gratuito"
                    },
                    {
                      label: "Entradas",
                      value: isLoadingFinancial
                        ? "..."
                        : financialSummary
                          ? formatMoney(financialSummary.income)
                          : "—"
                    },
                    {
                      label: "Saldo",
                      value: isLoadingFinancial
                        ? "..."
                        : financialSummary
                          ? formatMoney(
                              Number(financialSummary.income) -
                                Number(financialSummary.expense)
                            )
                          : "—"
                    }
                  ].map((item) => (
                    <article
                      key={item.label}
                      style={{
                        background: "rgba(15, 23, 42, 0.82)",
                        border:
                          "1px solid rgba(148, 163, 184, 0.18)",
                        borderRadius: "20px",
                        minWidth: 0,
                        padding: "20px"
                      }}
                    >
                      <strong
                        style={{
                          color: "#94a3b8",
                          fontSize: "13px"
                        }}
                      >
                        {item.label}
                      </strong>

                      <p
                        style={{
                          color: "#ffffff",
                          fontSize: "24px",
                          fontWeight: 900,
                          margin: "10px 0 0",
                          overflowWrap: "anywhere"
                        }}
                      >
                        {item.value}
                      </p>
                    </article>
                  ))}
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "18px",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(300px, 1fr))"
                  }}
                >
                  <article
                    style={{
                      background: "rgba(15, 23, 42, 0.82)",
                      border:
                        "1px solid rgba(148, 163, 184, 0.18)",
                      borderRadius: "24px",
                      display: "grid",
                      gap: "18px",
                      padding: "22px"
                    }}
                  >
                    <div>
                      <strong
                        style={{
                          color: "#ffffff",
                          fontSize: "18px"
                        }}
                      >
                        Página pública do evento
                      </strong>

                      <p
                        style={{
                          color: "#94a3b8",
                          lineHeight: 1.6,
                          margin: "6px 0 0"
                        }}
                      >
                        Link e QR Code para divulgação da página
                        pública.
                      </p>
                    </div>

                    {event.isPublic ? (
                      <div
                        style={{
                          alignItems: "center",
                          display: "flex",
                          flexWrap: "wrap",
                          gap: "18px"
                        }}
                      >
                        <div
                          style={{
                            background: "#ffffff",
                            borderRadius: "16px",
                            display: "grid",
                            padding: "12px",
                            placeItems: "center"
                          }}
                        >
                          <QRCode
                            size={112}
                            value={publicRegistrationUrl}
                          />
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gap: "10px",
                            minWidth: 0
                          }}
                        >
                          <span
                            style={{
                              color: "#cbd5e1",
                              fontSize: "13px",
                              overflowWrap: "anywhere"
                            }}
                          >
                            {publicRegistrationUrl}
                          </span>

                          <a
                            href={publicRegistrationUrl}
                            rel="noreferrer"
                            style={{
                              color: "#93c5fd",
                              fontWeight: 900,
                              textDecoration: "none"
                            }}
                            target="_blank"
                          >
                            Abrir página pública
                          </a>
                        </div>
                      </div>
                    ) : (
                      <p
                        style={{
                          background:
                            "rgba(245, 158, 11, 0.10)",
                          border:
                            "1px solid rgba(245, 158, 11, 0.22)",
                          borderRadius: "14px",
                          color: "#fde68a",
                          lineHeight: 1.6,
                          margin: 0,
                          padding: "14px"
                        }}
                      >
                        O evento está em rascunho. Publique-o para
                        disponibilizar a página e o QR Code.
                      </p>
                    )}
                  </article>

                  <article
                    style={{
                      background: "rgba(15, 23, 42, 0.82)",
                      border:
                        "1px solid rgba(148, 163, 184, 0.18)",
                      borderRadius: "24px",
                      display: "grid",
                      gap: "14px",
                      padding: "22px"
                    }}
                  >
                    <strong
                      style={{
                        color: "#ffffff",
                        fontSize: "18px"
                      }}
                    >
                      Status operacional
                    </strong>

                    {[
                      [
                        "Publicação",
                        event.isPublic
                          ? "Publicado"
                          : "Rascunho"
                      ],
                      [
                        "Inscrições públicas",
                        event.publicRegistrationEnabled
                          ? "Abertas"
                          : "Fechadas"
                      ],
                      [
                        "Ingressos configurados",
                        String(tickets.length)
                      ],
                      [
                        "Participantes ativos",
                        String(statistics.active)
                      ],
                      [
                        "Credenciados",
                        String(statistics.checkedIn)
                      ]
                    ].map(([label, value]) => (
                      <div
                        key={label}
                        style={{
                          alignItems: "center",
                          borderBottom:
                            "1px solid rgba(148, 163, 184, 0.12)",
                          display: "flex",
                          gap: "16px",
                          justifyContent: "space-between",
                          paddingBottom: "12px"
                        }}
                      >
                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "14px"
                          }}
                        >
                          {label}
                        </span>

                        <strong
                          style={{
                            color: "#ffffff",
                            fontSize: "14px",
                            textAlign: "right"
                          }}
                        >
                          {value}
                        </strong>
                      </div>
                    ))}
                  </article>
                </div>
              </section>
            ) : null}

            {activeSection === "information" ? (
              <section
              id="informacoes"
              style={{
                background: "rgba(15, 23, 42, 0.82)",
                border:
                  "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "26px",
                display: "grid",
                gap: "22px",
                padding: "26px"
              }}
            >
              <header
                style={{
                  alignItems: "center",
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "16px",
                  justifyContent: "space-between"
                }}
              >
                <div>
                  <p
                    style={{
                      color: "#60a5fa",
                      fontSize: "13px",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      margin: "0 0 8px",
                      textTransform: "uppercase"
                    }}
                  >
                    Informações do evento
                  </p>

                  <h2
                    style={{
                      color: "#ffffff",
                      fontSize: "24px",
                      margin: 0
                    }}
                  >
                    Dados principais e publicação
                  </h2>
                </div>

                {!isEditingInformation ? (
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px"
                    }}
                  >
                    <button
                      onClick={openDuplicateEventModal}
                      style={{
                        background:
                          "rgba(15, 23, 42, 0.68)",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        fontWeight: 900,
                        padding: "11px 16px"
                      }}
                      type="button"
                    >
                      Duplicar evento
                    </button>

                    <button
                      onClick={() => {
                        setError(null);
                        setInformationMessage(null);
                        setIsEditingInformation(true);
                      }}
                      style={{
                        background: "#2563eb",
                        border: 0,
                        borderRadius: "12px",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontWeight: 900,
                        padding: "11px 16px"
                      }}
                      type="button"
                    >
                      Editar informações
                    </button>
                  </div>
                ) : null}
              </header>

              {informationMessage ? (
                <p
                  style={{
                    background: "rgba(5, 150, 105, 0.16)",
                    border:
                      "1px solid rgba(52, 211, 153, 0.26)",
                    borderRadius: "14px",
                    color: "#a7f3d0",
                    margin: 0,
                    padding: "14px"
                  }}
                >
                  {informationMessage}
                </p>
              ) : null}

              {isEditingInformation ? (
                <form
                  onSubmit={handleSaveInformation}
                  style={{
                    display: "grid",
                    gap: "18px"
                  }}
                >
                  <div
                    style={{
                      display: "grid",
                      gap: "16px",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(240px, 1fr))"
                    }}
                  >
                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Nome do evento

                      <input
                        defaultValue={event.title}
                        name="title"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Endereço da página

                      <input
                        defaultValue={event.slug}
                        name="slug"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Data e horário

                      <input
                        defaultValue={formatDateTimeLocal(
                          event.date
                        )}
                        name="date"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                        type="datetime-local"
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Capacidade

                      <input
                        defaultValue={event.capacity}
                        min="1"
                        name="capacity"
                        required
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                        type="number"
                      />
                    </label>

                    <label
                      style={{
                        color: "#e2e8f0",
                        display: "grid",
                        fontWeight: 800,
                        gap: "8px"
                      }}
                    >
                      Valor

                      <input
                        defaultValue={Number(event.price)}
                        min="0"
                        name="price"
                        required
                        step="0.01"
                        style={{
                          background: "#0f172a",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#ffffff",
                          padding: "12px"
                        }}
                        type="number"
                      />
                    </label>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gap: "12px"
                    }}
                  >
                    <label
                      style={{
                        alignItems: "center",
                        color: "#e2e8f0",
                        display: "flex",
                        gap: "10px"
                      }}
                    >
                      <input
                        defaultChecked={event.waitlistEnabled}
                        name="waitlistEnabled"
                        type="checkbox"
                      />
                      Lista de espera habilitada
                    </label>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px"
                    }}
                  >
                    <button
                      disabled={isSavingInformation}
                      style={{
                        background: "#2563eb",
                        border: 0,
                        borderRadius: "12px",
                        color: "#ffffff",
                        cursor: "pointer",
                        fontWeight: 900,
                        padding: "12px 18px"
                      }}
                      type="submit"
                    >
                      {isSavingInformation
                        ? "Salvando..."
                        : "Salvar informações"}
                    </button>

                    <button
                      disabled={isSavingInformation}
                      onClick={() =>
                        setIsEditingInformation(false)
                      }
                      style={{
                        background: "transparent",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#e2e8f0",
                        cursor: "pointer",
                        fontWeight: 900,
                        padding: "12px 18px"
                      }}
                      type="button"
                    >
                      Cancelar
                    </button>
                  </div>
                </form>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gap: "22px"
                  }}
                >
                <div
                  style={{
                    display: "grid",
                    gap: "14px",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(210px, 1fr))"
                  }}
                >
                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Data e horário
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {formatDate(event.date)}
                    </p>
                  </article>

                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Capacidade
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {event.capacity}
                    </p>
                  </article>

                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Valor
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {event.isPaid
                        ? formatMoney(event.price)
                        : "Gratuito"}
                    </p>
                  </article>

                  <article>
                    <strong style={{ color: "#94a3b8" }}>
                      Publicação
                    </strong>
                    <p style={{ marginBottom: 0 }}>
                      {event.isPublic
                        ? "Publicado"
                        : "Rascunho"}
                    </p>
                  </article>
                </div>

                <div
                  style={{
                    display: "grid",
                    gap: "14px",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(210px, 1fr))"
                  }}
                >
                  <article
                    style={{
                      display: "grid",
                      gap: "12px"
                    }}
                  >
                    <strong style={{ color: "#94a3b8" }}>
                      Publicação
                    </strong>
                    <p style={{ margin: 0 }}>
                      Status:{" "}
                      {event.isPublic
                        ? "Publicado"
                        : "Rascunho"}
                    </p>
                    {event.isPublic ? (
                      <button
                        disabled={isUpdatingPublicationState}
                        onClick={() =>
                          void handleUpdatePublicationState({
                            isPublic: false
                          })
                        }
                        style={{
                          background:
                            "rgba(15, 23, 42, 0.68)",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "12px",
                          color: "#e2e8f0",
                          cursor: isUpdatingPublicationState
                            ? "not-allowed"
                            : "pointer",
                          fontWeight: 900,
                          justifySelf: "start",
                          opacity: isUpdatingPublicationState
                            ? 0.72
                            : 1,
                          padding: "11px 16px"
                        }}
                        type="button"
                      >
                        Despublicar evento
                      </button>
                    ) : (
                      <button
                        disabled={isUpdatingPublicationState}
                        onClick={() =>
                          void handleUpdatePublicationState({
                            isPublic: true
                          })
                        }
                        style={{
                          background: "#2563eb",
                          border: 0,
                          borderRadius: "12px",
                          color: "#ffffff",
                          cursor: isUpdatingPublicationState
                            ? "not-allowed"
                            : "pointer",
                          fontWeight: 900,
                          justifySelf: "start",
                          opacity: isUpdatingPublicationState
                            ? 0.72
                            : 1,
                          padding: "11px 16px"
                        }}
                        type="button"
                      >
                        Publicar evento
                      </button>
                    )}
                  </article>

                  <article
                    style={{
                      display: "grid",
                      gap: "12px"
                    }}
                  >
                    <strong style={{ color: "#94a3b8" }}>
                      Inscrições públicas
                    </strong>
                    <p style={{ margin: 0 }}>
                      Status:{" "}
                      {event.publicRegistrationEnabled
                        ? "Abertas"
                        : "Fechadas"}
                    </p>
                    {event.isPublic ? (
                      event.publicRegistrationEnabled ? (
                        <button
                          disabled={isUpdatingPublicationState}
                          onClick={() =>
                            void handleUpdatePublicationState({
                              publicRegistrationEnabled: false
                            })
                          }
                          style={{
                            background:
                              "rgba(15, 23, 42, 0.68)",
                            border:
                              "1px solid rgba(148, 163, 184, 0.3)",
                            borderRadius: "12px",
                            color: "#e2e8f0",
                            cursor: isUpdatingPublicationState
                              ? "not-allowed"
                              : "pointer",
                            fontWeight: 900,
                            justifySelf: "start",
                            opacity: isUpdatingPublicationState
                              ? 0.72
                              : 1,
                            padding: "11px 16px"
                          }}
                          type="button"
                        >
                          Fechar inscrições
                        </button>
                      ) : (
                        <button
                          disabled={isUpdatingPublicationState}
                          onClick={() =>
                            void handleUpdatePublicationState({
                              publicRegistrationEnabled: true
                            })
                          }
                          style={{
                            background: "#2563eb",
                            border: 0,
                            borderRadius: "12px",
                            color: "#ffffff",
                            cursor: isUpdatingPublicationState
                              ? "not-allowed"
                              : "pointer",
                            fontWeight: 900,
                            justifySelf: "start",
                            opacity: isUpdatingPublicationState
                              ? 0.72
                              : 1,
                            padding: "11px 16px"
                          }}
                          type="button"
                        >
                          Abrir inscrições
                        </button>
                      )
                    ) : null}
                  </article>
                </div>
                </div>
              )}
            </section>

            ) : null}

            {activeSection === "tickets" ? (
              <>
              <section
                id="ingressos"
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border:
                    "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  display: "grid",
                  gap: "22px",
                  padding: "24px"
                }}
              >
                <header
                  style={{
                    display: "grid",
                    gap: "18px"
                  }}
                >
                  <div>
                    <p
                      style={{
                        color: "#60a5fa",
                        fontSize: "13px",
                        fontWeight: 900,
                        letterSpacing: "0.08em",
                        margin: "0 0 8px",
                        textTransform: "uppercase"
                      }}
                    >
                      Ingressos
                    </p>
                    <h2
                      style={{
                        color: "#ffffff",
                        fontSize: "24px",
                        margin: 0
                      }}
                    >
                      Gerenciar ingressos
                    </h2>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gap: "10px",
                      justifyItems: "start"
                    }}
                  >
                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: "14px",
                        margin: 0
                      }}
                    >
                      O que você deseja criar?
                    </p>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px"
                      }}
                    >
                      {(
                        [
                          {
                            isFree: false,
                            label: "Ingresso pago"
                          },
                          {
                            isFree: true,
                            label: "Ingresso gratuito"
                          }
                        ] as const
                      ).map((action) => (
                        <button
                          key={action.label}
                          onClick={() => {
                            setIsCreateTicketOpen(true);
                            setIsCreateBatchOpen(false);
                            setEditingTicketId(null);
                            setEditingBatchId(null);
                            setTicketIsFree(action.isFree);
                            setTicketMessage(null);
                            setTicketError(null);
                          }}
                          style={{
                            background: action.isFree
                              ? "transparent"
                              : "#2563eb",
                            border: action.isFree
                              ? "1px solid rgba(96, 165, 250, 0.45)"
                              : "1px solid #2563eb",
                            borderRadius: "10px",
                            color: action.isFree
                              ? "#93c5fd"
                              : "#ffffff",
                            flexShrink: 0,
                            fontWeight: 900,
                            padding: "8px 12px",
                            whiteSpace: "nowrap"
                          }}
                          type="button"
                        >
                          + {action.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </header>

                {ticketMessage ? (
                  <p
                    style={{
                      background: "rgba(5, 150, 105, 0.16)",
                      border:
                        "1px solid rgba(52, 211, 153, 0.26)",
                      borderRadius: "12px",
                      color: "#a7f3d0",
                      margin: 0,
                      padding: "12px"
                    }}
                  >
                    {ticketMessage}
                  </p>
                ) : null}

                {ticketError && !isTicketDialogOpen ? (
                  <p
                    style={{
                      background: "rgba(127, 29, 29, 0.32)",
                      border:
                        "1px solid rgba(248, 113, 113, 0.28)",
                      borderRadius: "12px",
                      color: "#fecaca",
                      fontSize: "13px",
                      lineHeight: 1.5,
                      margin: 0,
                      padding: "12px"
                    }}
                  >
                    {ticketError}
                  </p>
                ) : null}

                {isLoadingTickets ? (
                  <p>Carregando ingressos...</p>
                ) : null}

                {!isLoadingTickets &&
                tickets.length === 0 ? (
                  <p>
                    Nenhum ingresso cadastrado neste evento.
                  </p>
                ) : null}

                {tickets.length > 0 ? (
                  <div
                    style={{
                      display: "grid",
                      gap: "6px",
                      maxWidth: "360px"
                    }}
                  >
                    <label
                      htmlFor="ticket-search"
                      style={{
                        color: "#cbd5e1",
                        fontSize: "13px",
                        fontWeight: 700
                      }}
                    >
                      Buscar ingressos
                    </label>
                    <input
                      id="ticket-search"
                      onChange={(searchEvent) =>
                        setTicketSearch(
                          searchEvent.target.value
                        )
                      }
                      placeholder="Buscar..."
                      style={{
                        background: "#0f172a",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#ffffff",
                        font: "inherit",
                        padding: "11px 14px",
                        width: "100%"
                      }}
                      type="search"
                      value={ticketSearch}
                    />
                  </div>
                ) : null}

                {tickets.length > 0 ? (
                  <div>
                    <div
                      style={{
                        alignItems: "end",
                        borderBottom:
                          "1px solid rgba(148, 163, 184, 0.22)",
                        color: "#94a3b8",
                        display: "grid",
                        fontSize: "12px",
                        fontWeight: 900,
                        gap: "12px",
                        gridTemplateColumns:
                          TICKET_LIST_COLUMNS,
                        lineHeight: 1.3,
                        padding: "0 0 10px"
                      }}
                    >
                      {[
                        "Tipo",
                        "Vendidos/total",
                        "Valor a receber",
                        "Taxa",
                        "Valor do comprador",
                        "Visibilidade do ingresso"
                      ].map((columnLabel) => (
                        <span
                          key={columnLabel}
                          style={{
                            minWidth: 0,
                            overflowWrap: "anywhere"
                          }}
                        >
                          {columnLabel}
                        </span>
                      ))}
                      <span style={{ minWidth: 0 }} />
                    </div>

                    {visibleTicketRows.length === 0 ? (
                      <p
                        style={{
                          color: "#94a3b8",
                          fontSize: "13px",
                          margin: "14px 0 0"
                        }}
                      >
                        Nenhum ingresso encontrado para
                        esta busca.
                      </p>
                    ) : null}

                    {visibleTicketRows.map((row) => {
                      const sold = row.batch
                        ? row.batch._count.registrations
                        : 0;
                      const available = row.batch
                        ? Math.max(
                            row.batch.quantity - sold,
                            0
                          )
                        : 0;
                      const soldPercent = row.batch
                        ? getTicketBatchSoldPercent(
                            sold,
                            row.batch.quantity
                          )
                        : 0;
                      const saleStatus = row.batch
                        ? getTicketBatchSaleStatus(
                            row.batch.quantity,
                            row.batch.salesStart,
                            row.batch.salesEnd,
                            sold
                          )
                        : null;

                      return (
                      <div
                        key={row.key}
                        style={{
                          alignItems: "center",
                          borderBottom:
                            "1px solid rgba(148, 163, 184, 0.14)",
                          display: "grid",
                          gap: "12px",
                          gridTemplateColumns:
                            TICKET_LIST_COLUMNS,
                          padding: "12px 0"
                        }}
                      >
                        <span
                          style={{
                            display: "grid",
                            gap: "4px",
                            justifyItems: "start",
                            minWidth: 0
                          }}
                        >
                          <span
                            style={{
                              color: "#ffffff",
                              fontSize: "14px",
                              fontWeight: 700,
                              lineHeight: 1.35,
                              minWidth: 0,
                              overflowWrap: "anywhere"
                            }}
                          >
                            {getTicketRowIdentity(
                              row.ticket.name,
                              row.batch?.name ?? null,
                              event?.title
                            )}
                          </span>
                          {saleStatus ? (
                            <span
                              style={{
                                background:
                                  saleStatus === "À venda"
                                    ? "rgba(59, 130, 246, 0.14)"
                                    : "rgba(148, 163, 184, 0.12)",
                                border:
                                  saleStatus === "À venda"
                                    ? "1px solid rgba(59, 130, 246, 0.3)"
                                    : "1px solid rgba(148, 163, 184, 0.22)",
                                borderRadius: "999px",
                                color:
                                  saleStatus === "À venda"
                                    ? "#93c5fd"
                                    : "#cbd5e1",
                                fontSize: "11px",
                                fontWeight: 900,
                                justifySelf: "start",
                                lineHeight: 1.3,
                                padding: "2px 8px",
                                whiteSpace: "nowrap"
                              }}
                            >
                              {saleStatus}
                            </span>
                          ) : null}
                        </span>
                        <span
                          style={{
                            display: "grid",
                            gap: "4px",
                            minWidth: 0
                          }}
                        >
                          {row.batch ? (
                            <>
                              <span
                                style={{
                                  display: "block",
                                  minWidth: 0,
                                  position: "relative",
                                  width: "100%"
                                }}
                              >
                                <span
                                  style={{
                                    background:
                                      "rgba(148, 163, 184, 0.18)",
                                    borderRadius: "999px",
                                    display: "block",
                                    height: "18px",
                                    minWidth: 0,
                                    width: "100%"
                                  }}
                                >
                                  <span
                                    style={{
                                      background: "#38bdf8",
                                      borderRadius: "999px",
                                      display: "block",
                                      height: "100%",
                                      width: `${soldPercent}%`
                                    }}
                                  />
                                </span>
                                <span
                                  style={{
                                    alignItems: "center",
                                    color: "#f8fafc",
                                    display: "flex",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                    inset: 0,
                                    justifyContent:
                                      "space-between",
                                    padding: "0 8px",
                                    position: "absolute"
                                  }}
                                >
                                  <span>{sold}</span>
                                  <span>
                                    {row.batch.quantity}
                                  </span>
                                </span>
                              </span>
                              <span
                                style={{
                                  color: "#94a3b8",
                                  fontSize: "11px",
                                  lineHeight: 1.3,
                                  minWidth: 0,
                                  overflowWrap: "anywhere"
                                }}
                              >
                                {available} disponíveis
                              </span>
                            </>
                          ) : (
                            <span
                              style={{
                                color: "#cbd5e1",
                                fontSize: "13px",
                                lineHeight: 1.35
                              }}
                            >
                              —
                            </span>
                          )}
                        </span>
                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "13px",
                            minWidth: 0,
                            overflowWrap: "anywhere"
                          }}
                          title="Valor líquido do organizador não existe no domínio atual."
                        >
                          —
                        </span>
                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "13px",
                            minWidth: 0,
                            overflowWrap: "anywhere"
                          }}
                          title="Taxa não existe no domínio atual."
                        >
                          —
                        </span>
                        <span
                          style={{
                            color: "#cbd5e1",
                            fontSize: "13px",
                            minWidth: 0,
                            overflowWrap: "anywhere"
                          }}
                        >
                          {row.batch
                            ? formatMoney(row.batch.price)
                            : "—"}
                        </span>
                        <span
                          style={{
                            color: "#94a3b8",
                            fontSize: "13px",
                            minWidth: 0,
                            overflowWrap: "anywhere"
                          }}
                        >
                          {(
                            row.batch
                              ? row.batch.isVisible
                              : row.ticket.isVisible
                          )
                            ? "Visível"
                            : "Oculto"}
                        </span>
                        <button
                          onClick={() => {
                            setEditingTicketId(
                              row.ticket.id
                            );
                            setEditingTicketName(
                              row.ticket.name
                            );
                            setEditingTicketDescription(
                              row.ticket.description ?? ""
                            );
                            setEditingTicketIsFree(
                              row.ticket.isFree
                            );
                            setEditingTicketIsVisible(
                              row.ticket.isVisible
                            );
                            setEditingBatchId(
                              row.batch?.id ?? null
                            );
                            setEditingBatchName(
                              row.batch?.name ?? ""
                            );
                            setEditingBatchQuantity(
                              row.batch
                                ? String(row.batch.quantity)
                                : ""
                            );
                            setEditingBatchPrice(
                              row.batch
                                ? String(row.batch.price)
                                : ""
                            );
                            setEditingBatchSalesStart(
                              row.batch
                                ? formatDateTimeLocal(
                                    row.batch.salesStart
                                  )
                                : ""
                            );
                            setEditingBatchSalesEnd(
                              row.batch
                                ? formatDateTimeLocal(
                                    row.batch.salesEnd
                                  )
                                : ""
                            );
                            setEditingBatchIsVisible(
                              row.batch?.isVisible ?? true
                            );
                            setIsCreateTicketOpen(false);
                            setIsCreateBatchOpen(false);
                            setTicketMessage(null);
                            setTicketError(null);
                          }}
                          style={{
                            background: "transparent",
                            border:
                              "1px solid rgba(148, 163, 184, 0.3)",
                            borderRadius: "10px",
                            color: "#e2e8f0",
                            fontSize: "12px",
                            fontWeight: 900,
                            justifySelf: "end",
                            padding: "7px 10px",
                            whiteSpace: "nowrap"
                          }}
                          type="button"
                        >
                          Editar
                        </button>
                      </div>
                      );
                    })}
                  </div>
                ) : null}

                <button
                  disabled={tickets.length === 0}
                  onClick={() => {
                    setIsCreateBatchOpen(true);
                    setIsCreateTicketOpen(false);
                    setEditingTicketId(null);
                    setEditingBatchId(null);
                    setTicketMessage(null);
                    setTicketError(null);
                  }}
                  style={{
                    background: "transparent",
                    border: 0,
                    color: "#94a3b8",
                    cursor:
                      tickets.length === 0
                        ? "not-allowed"
                        : "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                    justifySelf: "start",
                    opacity:
                      tickets.length === 0 ? 0.5 : 1,
                    padding: "2px 0",
                    textDecoration: "underline",
                    whiteSpace: "nowrap"
                  }}
                  title="Adicionar um novo lote a um ingresso já existente"
                  type="button"
                >
                  Adicionar lote
                </button>
              </section>

                {isTicketDialogOpen ? (
                  <div
                    onClick={closeTicketDialog}
                    style={{
                      alignItems: "center",
                      background: "rgba(2, 6, 23, 0.72)",
                      display: "flex",
                      inset: 0,
                      justifyContent: "center",
                      padding: "24px",
                      position: "fixed",
                      zIndex: 60
                    }}
                  >
                    <div
                      onClick={(clickEvent) =>
                        clickEvent.stopPropagation()
                      }
                      style={{
                        background:
                          "linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.96))",
                        border:
                          "1px solid rgba(148, 163, 184, 0.22)",
                        borderRadius: "28px",
                        boxShadow:
                          "0 28px 90px rgba(2, 6, 23, 0.48)",
                        display: "grid",
                        gap: "20px",
                        maxHeight: "calc(100vh - 48px)",
                        maxWidth: "760px",
                        overflow: "auto",
                        padding: "28px",
                        width: "100%"
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "flex-end"
                        }}
                      >
                        <button
                          aria-label="Fechar"
                          onClick={closeTicketDialog}
                          style={{
                            background: "transparent",
                            border:
                              "1px solid rgba(148, 163, 184, 0.3)",
                            borderRadius: "999px",
                            color: "#e2e8f0",
                            fontSize: "16px",
                            fontWeight: 900,
                            height: "32px",
                            lineHeight: 1,
                            width: "32px"
                          }}
                          type="button"
                        >
                          ×
                        </button>
                      </div>

                      {ticketError ? (
                        <p
                          style={{
                            background:
                              "rgba(127, 29, 29, 0.32)",
                            border:
                              "1px solid rgba(248, 113, 113, 0.28)",
                            borderRadius: "12px",
                            color: "#fecaca",
                            fontSize: "13px",
                            lineHeight: 1.5,
                            margin: 0,
                            padding: "12px"
                          }}
                        >
                          {ticketError}
                        </p>
                      ) : null}

                      {isCreateTicketOpen ? (
                        <form
                          onSubmit={handleCreateTicket}
                          style={{
                            display: "grid",
                            gap: "18px"
                          }}
                        >
                          <h2
                            style={{
                              color: "#ffffff",
                              fontSize: "24px",
                              letterSpacing: "-0.03em",
                              margin: 0
                            }}
                          >
                            {ticketIsFree
                              ? "Criar ingresso gratuito"
                              : "Criar ingresso pago"}
                          </h2>

                          <div
                            style={{
                              display: "grid",
                              gap: "12px"
                            }}
                          >
                            <p
                              style={{
                                color: "#60a5fa",
                                fontSize: "12px",
                                fontWeight: 900,
                                letterSpacing: "0.08em",
                                margin: 0,
                                textTransform: "uppercase"
                              }}
                            >
                              Sobre o ingresso
                            </p>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-ticket-name"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Título do ingresso
                              </label>
                              <input
                                id="create-ticket-name"
                                maxLength={80}
                                name="ticketName"
                                placeholder="Ingresso"
                                required
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-ticket-description"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Descrição
                              </label>
                              <textarea
                                id="create-ticket-description"
                                maxLength={500}
                                name="ticketDescription"
                                rows={3}
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: "10px",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(180px, 1fr))"
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="create-batch-quantity"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Quantidade
                                </label>
                                <input
                                  id="create-batch-quantity"
                                  min="1"
                                  name="batchQuantity"
                                  required
                                  step="1"
                                  style={{
                                    background: "#0f172a",
                                    border:
                                      "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "12px",
                                    color: "#ffffff",
                                    font: "inherit",
                                    padding: "13px 14px"
                                  }}
                                  type="number"
                                />
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="create-batch-price"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Valor do participante
                                </label>
                                {ticketIsFree ? (
                                  <input
                                    defaultValue="Grátis"
                                    disabled
                                    id="create-batch-price"
                                    style={{
                                      background:
                                        "rgba(148, 163, 184, 0.12)",
                                      border:
                                        "1px solid rgba(148, 163, 184, 0.22)",
                                      borderRadius: "12px",
                                      color: "#94a3b8",
                                      font: "inherit",
                                      padding: "13px 14px"
                                    }}
                                  />
                                ) : (
                                  <input
                                    id="create-batch-price"
                                    min="0"
                                    name="batchPrice"
                                    required
                                    step="0.01"
                                    style={{
                                      background: "#0f172a",
                                      border:
                                        "1px solid rgba(148, 163, 184, 0.3)",
                                      borderRadius: "12px",
                                      color: "#ffffff",
                                      font: "inherit",
                                      padding: "13px 14px"
                                    }}
                                    type="number"
                                  />
                                )}
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gap: "12px"
                            }}
                          >
                            <p
                              style={{
                                color: "#60a5fa",
                                fontSize: "12px",
                                fontWeight: 900,
                                letterSpacing: "0.08em",
                                margin: 0,
                                textTransform: "uppercase"
                              }}
                            >
                              Quando o ingresso será
                              vendido
                            </p>

                            <div
                              style={{
                                display: "grid",
                                gap: "10px",
                                gridTemplateColumns:
                                  "repeat(auto-fit, minmax(220px, 1fr))"
                              }}
                            >
                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="create-batch-sales-start"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Data e hora de início
                                </label>
                                <input
                                  id="create-batch-sales-start"
                                  name="salesStart"
                                  required
                                  style={{
                                    background: "#0f172a",
                                    border:
                                      "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "12px",
                                    color: "#ffffff",
                                    font: "inherit",
                                    padding: "13px 14px"
                                  }}
                                  type="datetime-local"
                                />
                              </div>

                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="create-batch-sales-end"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Data e hora de término
                                </label>
                                <input
                                  id="create-batch-sales-end"
                                  name="salesEnd"
                                  required
                                  style={{
                                    background: "#0f172a",
                                    border:
                                      "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "12px",
                                    color: "#ffffff",
                                    font: "inherit",
                                    padding: "13px 14px"
                                  }}
                                  type="datetime-local"
                                />
                              </div>
                            </div>
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gap: "12px"
                            }}
                          >
                            <p
                              style={{
                                color: "#60a5fa",
                                fontSize: "12px",
                                fontWeight: 900,
                                letterSpacing: "0.08em",
                                margin: 0,
                                textTransform: "uppercase"
                              }}
                            >
                              Nome do lote
                            </p>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-batch-name"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Nome do lote
                              </label>
                              <input
                                defaultValue="Primeiro lote"
                                id="create-batch-name"
                                maxLength={80}
                                name="batchName"
                                required
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>
                          </div>

                          <label
                            htmlFor="create-ticket-visible"
                            style={{
                              alignItems: "center",
                              color: "#e2e8f0",
                              display: "flex",
                              gap: "8px"
                            }}
                          >
                            <input
                              defaultChecked
                              id="create-ticket-visible"
                              name="ticketVisible"
                              type="checkbox"
                            />{" "}
                            Visibilidade do ingresso
                          </label>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px"
                            }}
                          >
                            <button
                              disabled={isCreatingTicket}
                              onClick={closeTicketDialog}
                              style={{
                                background: "transparent",
                                border:
                                  "1px solid rgba(148, 163, 184, 0.3)",
                                borderRadius: "10px",
                                color: "#e2e8f0",
                                fontWeight: 900,
                                padding: "10px 12px"
                              }}
                              type="button"
                            >
                              Cancelar
                            </button>
                            <button
                              disabled={isCreatingTicket}
                              style={{
                                background: "#2563eb",
                                border: 0,
                                borderRadius: "10px",
                                color: "#ffffff",
                                fontWeight: 900,
                                padding: "10px 12px"
                              }}
                              type="submit"
                            >
                              {isCreatingTicket
                                ? "Salvando..."
                                : "Salvar"}
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {isCreateBatchOpen ? (
                        <form
                          onSubmit={handleCreateBatch}
                          style={{
                            display: "grid",
                            gap: "12px"
                          }}
                        >
                          <h2
                            style={{
                              color: "#ffffff",
                              fontSize: "24px",
                              letterSpacing: "-0.03em",
                              margin: 0
                            }}
                          >
                            Adicionar lote
                          </h2>

                          <div
                            style={{
                              display: "grid",
                              gap: "10px",
                              gridTemplateColumns:
                                "repeat(auto-fit, minmax(180px, 1fr))"
                            }}
                          >
                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-batch-ticket"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Ingresso
                              </label>
                              <select
                                id="create-batch-ticket"
                                onChange={(event) =>
                                  setSelectedTicketId(
                                    event.target.value
                                  )
                                }
                                required
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                                value={selectedTicketId}
                              >
                                <option value="">
                                  Selecione o ingresso
                                </option>
                                {tickets.map((ticket) => (
                                  <option
                                    key={ticket.id}
                                    value={ticket.id}
                                  >
                                    {ticket.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-batch-only-name"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Nome do lote
                              </label>
                              <input
                                id="create-batch-only-name"
                                name="batchName"
                                required
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-batch-only-quantity"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Quantidade
                              </label>
                              <input
                                id="create-batch-only-quantity"
                                min="1"
                                name="batchQuantity"
                                required
                                type="number"
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-batch-only-price"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Valor do participante
                              </label>
                              <input
                                disabled={
                                  tickets.find(
                                    (ticket) =>
                                      ticket.id ===
                                      selectedTicketId
                                  )?.isFree ?? true
                                }
                                id="create-batch-only-price"
                                min="0"
                                name="batchPrice"
                                required
                                step="0.01"
                                type="number"
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-batch-only-sales-start"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Data e hora de início das
                                vendas
                              </label>
                              <input
                                id="create-batch-only-sales-start"
                                name="salesStart"
                                required
                                type="datetime-local"
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>

                            <div
                              style={{
                                display: "grid",
                                gap: "6px"
                              }}
                            >
                              <label
                                htmlFor="create-batch-only-sales-end"
                                style={{
                                  color: "#cbd5e1",
                                  fontSize: "13px",
                                  fontWeight: 700
                                }}
                              >
                                Data e hora de término das
                                vendas
                              </label>
                              <input
                                id="create-batch-only-sales-end"
                                name="salesEnd"
                                required
                                type="datetime-local"
                                style={{
                                  background: "#0f172a",
                                  border:
                                    "1px solid rgba(148, 163, 184, 0.3)",
                                  borderRadius: "12px",
                                  color: "#ffffff",
                                  font: "inherit",
                                  padding: "13px 14px"
                                }}
                              />
                            </div>
                          </div>

                          <label
                            style={{
                              alignItems: "center",
                              color: "#e2e8f0",
                              display: "flex",
                              gap: "8px"
                            }}
                          >
                            <input
                              defaultChecked
                              name="batchVisible"
                              type="checkbox"
                            />{" "}
                            Lote visível
                          </label>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px"
                            }}
                          >
                            <button
                              onClick={() =>
                                setIsCreateBatchOpen(false)
                              }
                              style={{
                                background: "transparent",
                                border:
                                  "1px solid rgba(148, 163, 184, 0.3)",
                                borderRadius: "10px",
                                color: "#e2e8f0",
                                fontWeight: 900,
                                padding: "10px 12px"
                              }}
                              type="button"
                            >
                              Cancelar
                            </button>
                            <button
                              disabled={
                                isCreatingBatch ||
                                !selectedTicketId
                              }
                              style={{
                                background: "#2563eb",
                                border: 0,
                                borderRadius: "10px",
                                color: "#ffffff",
                                fontWeight: 900,
                                padding: "10px 12px"
                              }}
                              type="submit"
                            >
                              {isCreatingBatch
                                ? "Criando..."
                                : "Criar lote"}
                            </button>
                          </div>
                        </form>
                      ) : null}

                      {(editingTicket || editingBatch) &&
                      !isCreateTicketOpen &&
                      !isCreateBatchOpen ? (
                        <form
                          onSubmit={handleSaveTicketRow}
                          style={{
                            display: "grid",
                            gap: "20px"
                          }}
                        >
                          <h2
                            style={{
                              color: "#ffffff",
                              fontSize: "24px",
                              letterSpacing: "-0.03em",
                              margin: 0
                            }}
                          >
                            {editingTicket
                              ? editingTicketIsFree
                                ? "Editar ingresso gratuito"
                                : "Editar ingresso pago"
                              : "Editar lote"}
                          </h2>

                          <div
                            style={{
                              display: "grid",
                              gap: "12px"
                            }}
                          >
                            <p
                              style={{
                                color: "#60a5fa",
                                fontSize: "12px",
                                fontWeight: 900,
                                letterSpacing: "0.08em",
                                margin: 0,
                                textTransform: "uppercase"
                              }}
                            >
                              Sobre o ingresso
                            </p>

                            {editingTicket ? (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="edit-ticket-name"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Título do ingresso
                                </label>
                                <input
                                  id="edit-ticket-name"
                                  maxLength={80}
                                  onChange={(event) =>
                                    setEditingTicketName(
                                      event.target.value
                                    )
                                  }
                                  required
                                  style={{
                                    background: "#0f172a",
                                    border:
                                      "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "12px",
                                    color: "#ffffff",
                                    font: "inherit",
                                    padding: "13px 14px"
                                  }}
                                  value={editingTicketName}
                                />
                              </div>
                            ) : null}

                            {editingTicket ? (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="edit-ticket-description"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Descrição
                                </label>
                                <textarea
                                  id="edit-ticket-description"
                                  maxLength={500}
                                  onChange={(event) =>
                                    setEditingTicketDescription(
                                      event.target.value
                                    )
                                  }
                                  rows={3}
                                  style={{
                                    background: "#0f172a",
                                    border:
                                      "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "12px",
                                    color: "#ffffff",
                                    font: "inherit",
                                    padding: "13px 14px"
                                  }}
                                  value={
                                    editingTicketDescription
                                  }
                                />
                              </div>
                            ) : null}

                            {editingTicket ? (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="edit-ticket-type"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Tipo
                                </label>
                                <select
                                  id="edit-ticket-type"
                                  onChange={(event) =>
                                    setEditingTicketIsFree(
                                      event.target.value ===
                                        "free"
                                    )
                                  }
                                  style={{
                                    background: "#0f172a",
                                    border:
                                      "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "12px",
                                    color: "#ffffff",
                                    font: "inherit",
                                    padding: "13px 14px"
                                  }}
                                  value={
                                    editingTicketIsFree
                                      ? "free"
                                      : "paid"
                                  }
                                >
                                  <option value="paid">
                                    Pago
                                  </option>
                                  <option value="free">
                                    Gratuito
                                  </option>
                                </select>
                              </div>
                            ) : null}

                            {editingBatch ? (
                              <div
                                style={{
                                  display: "grid",
                                  gap: "10px",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(180px, 1fr))"
                                }}
                              >
                                <div
                                  style={{
                                    display: "grid",
                                    gap: "6px"
                                  }}
                                >
                                  <label
                                    htmlFor="edit-batch-quantity"
                                    style={{
                                      color: "#cbd5e1",
                                      fontSize: "13px",
                                      fontWeight: 700
                                    }}
                                  >
                                    Quantidade
                                  </label>
                                  <input
                                    id="edit-batch-quantity"
                                    min={Math.max(
                                      editingBatch._count
                                        .registrations,
                                      1
                                    )}
                                    onChange={(event) =>
                                      setEditingBatchQuantity(
                                        event.target.value
                                      )
                                    }
                                    required
                                    step="1"
                                    style={{
                                      background: "#0f172a",
                                      border:
                                        "1px solid rgba(148, 163, 184, 0.3)",
                                      borderRadius: "12px",
                                      color: "#ffffff",
                                      font: "inherit",
                                      padding: "13px 14px"
                                    }}
                                    type="number"
                                    value={
                                      editingBatchQuantity
                                    }
                                  />
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gap: "6px"
                                  }}
                                >
                                  <label
                                    htmlFor="edit-batch-price"
                                    style={{
                                      color: "#cbd5e1",
                                      fontSize: "13px",
                                      fontWeight: 700
                                    }}
                                  >
                                    Valor do participante
                                  </label>
                                  {editingTicketIsFree ? (
                                    <input
                                      disabled
                                      id="edit-batch-price"
                                      style={{
                                        background:
                                          "rgba(148, 163, 184, 0.12)",
                                        border:
                                          "1px solid rgba(148, 163, 184, 0.22)",
                                        borderRadius: "12px",
                                        color: "#94a3b8",
                                        font: "inherit",
                                        padding: "13px 14px"
                                      }}
                                      value="Grátis"
                                    />
                                  ) : (
                                    <input
                                      id="edit-batch-price"
                                      min="0"
                                      onChange={(event) =>
                                        setEditingBatchPrice(
                                          event.target.value
                                        )
                                      }
                                      required
                                      step="0.01"
                                      style={{
                                        background:
                                          "#0f172a",
                                        border:
                                          "1px solid rgba(148, 163, 184, 0.3)",
                                        borderRadius: "12px",
                                        color: "#ffffff",
                                        font: "inherit",
                                        padding: "13px 14px"
                                      }}
                                      type="number"
                                      value={
                                        editingBatchPrice
                                      }
                                    />
                                  )}
                                </div>
                              </div>
                            ) : null}
                          </div>

                          {editingBatch ? (
                            <div
                              style={{
                                display: "grid",
                                gap: "12px"
                              }}
                            >
                              <p
                                style={{
                                  color: "#60a5fa",
                                  fontSize: "12px",
                                  fontWeight: 900,
                                  letterSpacing: "0.08em",
                                  margin: 0,
                                  textTransform: "uppercase"
                                }}
                              >
                                Quando o ingresso será
                                vendido
                              </p>

                              <div
                                style={{
                                  display: "grid",
                                  gap: "10px",
                                  gridTemplateColumns:
                                    "repeat(auto-fit, minmax(220px, 1fr))"
                                }}
                              >
                                <div
                                  style={{
                                    display: "grid",
                                    gap: "6px"
                                  }}
                                >
                                  <label
                                    htmlFor="edit-batch-sales-start"
                                    style={{
                                      color: "#cbd5e1",
                                      fontSize: "13px",
                                      fontWeight: 700
                                    }}
                                  >
                                    Data e hora de início
                                  </label>
                                  <input
                                    id="edit-batch-sales-start"
                                    onChange={(event) =>
                                      setEditingBatchSalesStart(
                                        event.target.value
                                      )
                                    }
                                    required
                                    style={{
                                      background: "#0f172a",
                                      border:
                                        "1px solid rgba(148, 163, 184, 0.3)",
                                      borderRadius: "12px",
                                      color: "#ffffff",
                                      font: "inherit",
                                      padding: "13px 14px"
                                    }}
                                    type="datetime-local"
                                    value={
                                      editingBatchSalesStart
                                    }
                                  />
                                </div>

                                <div
                                  style={{
                                    display: "grid",
                                    gap: "6px"
                                  }}
                                >
                                  <label
                                    htmlFor="edit-batch-sales-end"
                                    style={{
                                      color: "#cbd5e1",
                                      fontSize: "13px",
                                      fontWeight: 700
                                    }}
                                  >
                                    Data e hora de término
                                  </label>
                                  <input
                                    id="edit-batch-sales-end"
                                    onChange={(event) =>
                                      setEditingBatchSalesEnd(
                                        event.target.value
                                      )
                                    }
                                    required
                                    style={{
                                      background: "#0f172a",
                                      border:
                                        "1px solid rgba(148, 163, 184, 0.3)",
                                      borderRadius: "12px",
                                      color: "#ffffff",
                                      font: "inherit",
                                      padding: "13px 14px"
                                    }}
                                    type="datetime-local"
                                    value={
                                      editingBatchSalesEnd
                                    }
                                  />
                                </div>
                              </div>
                            </div>
                          ) : null}

                          {editingBatch ? (
                            <div
                              style={{
                                display: "grid",
                                gap: "12px"
                              }}
                            >
                              <p
                                style={{
                                  color: "#60a5fa",
                                  fontSize: "12px",
                                  fontWeight: 900,
                                  letterSpacing: "0.08em",
                                  margin: 0,
                                  textTransform: "uppercase"
                                }}
                              >
                                Nome do lote
                              </p>

                              <div
                                style={{
                                  display: "grid",
                                  gap: "6px"
                                }}
                              >
                                <label
                                  htmlFor="edit-batch-name"
                                  style={{
                                    color: "#cbd5e1",
                                    fontSize: "13px",
                                    fontWeight: 700
                                  }}
                                >
                                  Nome do lote
                                </label>
                                <input
                                  id="edit-batch-name"
                                  maxLength={80}
                                  onChange={(event) =>
                                    setEditingBatchName(
                                      event.target.value
                                    )
                                  }
                                  required
                                  style={{
                                    background: "#0f172a",
                                    border:
                                      "1px solid rgba(148, 163, 184, 0.3)",
                                    borderRadius: "12px",
                                    color: "#ffffff",
                                    font: "inherit",
                                    padding: "13px 14px"
                                  }}
                                  value={editingBatchName}
                                />
                              </div>
                            </div>
                          ) : null}

                          <div
                            style={{
                              display: "grid",
                              gap: "10px"
                            }}
                          >
                            <p
                              style={{
                                color: "#60a5fa",
                                fontSize: "12px",
                                fontWeight: 900,
                                letterSpacing: "0.08em",
                                margin: 0,
                                textTransform: "uppercase"
                              }}
                            >
                              Visibilidade
                            </p>

                            {editingTicket ? (
                              <label
                                htmlFor="edit-ticket-visible"
                                style={{
                                  alignItems: "center",
                                  color: "#e2e8f0",
                                  display: "flex",
                                  gap: "8px"
                                }}
                              >
                                <input
                                  checked={
                                    editingTicketIsVisible
                                  }
                                  id="edit-ticket-visible"
                                  onChange={(event) =>
                                    setEditingTicketIsVisible(
                                      event.target.checked
                                    )
                                  }
                                  type="checkbox"
                                />{" "}
                                Visibilidade do ingresso
                              </label>
                            ) : null}

                            {editingBatch ? (
                              <label
                                htmlFor="edit-batch-visible"
                                style={{
                                  alignItems: "center",
                                  color: "#e2e8f0",
                                  display: "flex",
                                  gap: "8px"
                                }}
                              >
                                <input
                                  checked={
                                    editingBatchIsVisible
                                  }
                                  id="edit-batch-visible"
                                  onChange={(event) =>
                                    setEditingBatchIsVisible(
                                      event.target.checked
                                    )
                                  }
                                  type="checkbox"
                                />{" "}
                                Visibilidade do lote
                              </label>
                            ) : null}
                          </div>

                          <div
                            style={{
                              display: "grid",
                              gap: "4px"
                            }}
                          >
                            <p
                              style={{
                                color: "#94a3b8",
                                fontSize: "12px",
                                margin: 0
                              }}
                            >
                              Vendidos
                            </p>
                            <p
                              style={{
                                color: "#e2e8f0",
                                fontSize: "14px",
                                fontWeight: 700,
                                margin: 0
                              }}
                            >
                              {String(
                                editingBatch
                                  ? editingBatch._count
                                      .registrations
                                  : editingTicket?._count
                                      .registrations ?? 0
                              )}
                            </p>
                          </div>

                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px"
                            }}
                          >
                            <button
                              disabled={
                                isSavingTicket ||
                                isSavingBatch
                              }
                              onClick={closeTicketEditor}
                              style={{
                                background: "transparent",
                                border:
                                  "1px solid rgba(148, 163, 184, 0.3)",
                                borderRadius: "10px",
                                color: "#e2e8f0",
                                fontWeight: 900,
                                padding: "10px 12px"
                              }}
                              type="button"
                            >
                              Cancelar
                            </button>
                            <button
                              disabled={
                                isSavingTicket ||
                                isSavingBatch
                              }
                              style={{
                                background: "#2563eb",
                                border: 0,
                                borderRadius: "10px",
                                color: "#ffffff",
                                fontWeight: 900,
                                padding: "10px 12px"
                              }}
                              type="submit"
                            >
                              {isSavingTicket ||
                              isSavingBatch
                                ? "Salvando..."
                                : "Salvar"}
                            </button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </>
            ) : null}

            {activeSection === "registration-form" ? (
              <section
                style={{
                  background: "rgba(15, 23, 42, 0.82)",
                  border:
                    "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "20px",
                  display: "grid",
                  gap: "22px",
                  padding: "24px"
                }}
              >
                <header>
                  <p
                    style={{
                      color: "#60a5fa",
                      fontSize: "13px",
                      fontWeight: 900,
                      letterSpacing: "0.08em",
                      margin: "0 0 8px",
                      textTransform: "uppercase"
                    }}
                  >
                    FORMULÁRIO DE INSCRIÇÃO
                  </p>
                  <h2
                    style={{
                      color: "#ffffff",
                      fontSize: "24px",
                      margin: 0
                    }}
                  >
                    Campos do participante
                  </h2>
                </header>

                {formFieldMessage ? (
                  <p
                    style={{
                      background: "rgba(5, 150, 105, 0.16)",
                      border:
                        "1px solid rgba(52, 211, 153, 0.26)",
                      borderRadius: "12px",
                      color: "#a7f3d0",
                      margin: 0,
                      padding: "12px"
                    }}
                  >
                    {formFieldMessage}
                  </p>
                ) : null}

                <div
                  style={{
                    display: "grid",
                    gap: "18px",
                    gridTemplateColumns:
                      "minmax(240px, 0.9fr) minmax(0, 1.4fr)"
                  }}
                >
                  <article
                    style={{
                      border:
                        "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "16px",
                      display: "grid",
                      gap: "12px",
                      padding: "18px"
                    }}
                  >
                    <h3 style={{ margin: 0 }}>
                      Adicionar ao formulário
                    </h3>

                    <h4
                      style={{
                        color: "#cbd5e1",
                        fontSize: "14px",
                        margin: "4px 0 0"
                      }}
                    >
                      Campos pré-definidos
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px"
                      }}
                    >
                      {[
                        "Nome completo",
                        "Telefone",
                        "E-mail",
                        ...(event?.isPaid
                          ? ["CPF"]
                          : [])
                      ].map((baseLabel) => (
                        <span
                          key={baseLabel}
                          style={{
                            background:
                              "rgba(15, 23, 42, 0.68)",
                            border:
                              "1px solid rgba(148, 163, 184, 0.22)",
                            borderRadius: "999px",
                            color: "#e2e8f0",
                            fontSize: "13px",
                            fontWeight: 600,
                            padding: "8px 12px"
                          }}
                        >
                          {baseLabel}
                        </span>
                      ))}
                    </div>

                    <h4
                      style={{
                        color: "#cbd5e1",
                        fontSize: "14px",
                        margin: "8px 0 0"
                      }}
                    >
                      Campos personalizáveis
                    </h4>
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: "8px"
                      }}
                    >
                      {customFieldActions.map((action) => (
                        <button
                          key={action.type}
                          onClick={() =>
                            openCreateFormFieldOverlay(
                              action.type
                            )
                          }
                          style={{
                            background:
                              "rgba(15, 23, 42, 0.68)",
                            border:
                              "1px solid rgba(148, 163, 184, 0.22)",
                            borderRadius: "999px",
                            color: "#e2e8f0",
                            cursor: "pointer",
                            fontSize: "13px",
                            fontWeight: 700,
                            padding: "8px 12px"
                          }}
                          type="button"
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </article>

                  <article
                    style={{
                      border:
                        "1px solid rgba(148, 163, 184, 0.16)",
                      borderRadius: "16px",
                      display: "grid",
                      gap: "16px",
                      padding: "18px"
                    }}
                  >
                    <h3 style={{ margin: 0 }}>
                      Dados do participante
                    </h3>
                    {[
                      {
                        id: "base-name",
                        isRequired: true,
                        key: "name" as const,
                        label: "Nome completo"
                      },
                      {
                        id: "base-phone",
                        isRequired: true,
                        key: "phone" as const,
                        label: "Telefone"
                      },
                      {
                        id: "base-email",
                        isRequired: true,
                        key: "email" as const,
                        label: "E-mail"
                      },
                      ...(event?.isPaid
                        ? [
                            {
                              id: "base-cpf",
                              isRequired: true,
                              key: "cpf" as const,
                              label: "CPF"
                            }
                          ]
                        : [])
                    ].map((baseField) => (
                      <div
                        key={baseField.id}
                        style={{
                          display: "grid",
                          gap: "8px"
                        }}
                      >
                        <div
                          style={{
                            alignItems: "center",
                            display: "flex",
                            gap: "8px",
                            justifyContent: "space-between"
                          }}
                        >
                          <strong
                            style={{
                              color: "#f8fafc",
                              fontSize: "14px"
                            }}
                          >
                            {baseField.label}
                          </strong>
                          {baseField.isRequired ? (
                            <span
                              style={{
                                color: "#f59e0b",
                                fontSize: "12px",
                                fontWeight: 800
                              }}
                            >
                              Obrigatório
                            </span>
                          ) : null}
                        </div>
                        <input
                          onChange={(changeEvent) =>
                            setPreviewBaseValues(
                              (current) => ({
                                ...current,
                                [baseField.key]:
                                  changeEvent.target.value
                              })
                            )
                          }
                          style={{
                            background:
                              "rgba(15, 23, 42, 0.72)",
                            border:
                              "1px solid rgba(148, 163, 184, 0.28)",
                            borderRadius: "10px",
                            color: "#e2e8f0",
                            padding: "12px"
                          }}
                          value={
                            previewBaseValues[baseField.key]
                          }
                        />
                      </div>
                    ))}

                    {formFieldsOrdered.map((field, index) => (
                      <div
                        key={field.id}
                        style={{
                          borderBottom:
                            "1px solid rgba(148, 163, 184, 0.14)",
                          display: "grid",
                          gap: "10px",
                          opacity: field.isActive ? 1 : 0.6,
                          paddingBottom: "16px"
                        }}
                      >
                        <div
                          style={{
                            alignItems: "center",
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "8px",
                            justifyContent: "space-between"
                          }}
                        >
                          <div
                            style={{
                              alignItems: "center",
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "8px"
                            }}
                          >
                            <strong
                              style={{
                                color: "#f8fafc",
                                fontSize: "14px"
                              }}
                            >
                              {field.label}
                              {field.isRequired ? (
                                <span
                                  style={{
                                    color: "#f59e0b",
                                    marginLeft: "4px"
                                  }}
                                >
                                  *
                                </span>
                              ) : null}
                            </strong>
                            {field.isRequired ? (
                              <span
                                style={{
                                  color: "#f59e0b",
                                  fontSize: "12px",
                                  fontWeight: 800
                                }}
                              >
                                Obrigatório
                              </span>
                            ) : null}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "6px"
                            }}
                          >
                            <button
                              onClick={() =>
                                openEditFormFieldOverlay(field)
                              }
                              style={{
                                background: "transparent",
                                border:
                                  "1px solid rgba(148, 163, 184, 0.28)",
                                borderRadius: "8px",
                                color: "#cbd5e1",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: 700,
                                padding: "6px 10px"
                              }}
                              type="button"
                            >
                              Editar
                            </button>
                            <button
                              onClick={() =>
                                void handleToggleFormField(
                                  field
                                )
                              }
                              style={{
                                background: "transparent",
                                border:
                                  "1px solid rgba(148, 163, 184, 0.28)",
                                borderRadius: "8px",
                                color: "#cbd5e1",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: 700,
                                padding: "6px 10px"
                              }}
                              type="button"
                            >
                              {field.isActive
                                ? "Desativar"
                                : "Ativar"}
                            </button>
                            <button
                              disabled={index === 0}
                              onClick={() =>
                                void handleMoveFormField(
                                  field.id,
                                  -1
                                )
                              }
                              style={{
                                background: "transparent",
                                border:
                                  "1px solid rgba(148, 163, 184, 0.28)",
                                borderRadius: "8px",
                                color: "#cbd5e1",
                                cursor:
                                  index === 0
                                    ? "not-allowed"
                                    : "pointer",
                                fontSize: "12px",
                                fontWeight: 700,
                                opacity:
                                  index === 0 ? 0.45 : 1,
                                padding: "6px 10px"
                              }}
                              type="button"
                            >
                              Subir
                            </button>
                            <button
                              disabled={
                                index ===
                                formFieldsOrdered.length - 1
                              }
                              onClick={() =>
                                void handleMoveFormField(
                                  field.id,
                                  1
                                )
                              }
                              style={{
                                background: "transparent",
                                border:
                                  "1px solid rgba(148, 163, 184, 0.28)",
                                borderRadius: "8px",
                                color: "#cbd5e1",
                                cursor:
                                  index ===
                                  formFieldsOrdered.length - 1
                                    ? "not-allowed"
                                    : "pointer",
                                fontSize: "12px",
                                fontWeight: 700,
                                opacity:
                                  index ===
                                  formFieldsOrdered.length - 1
                                    ? 0.45
                                    : 1,
                                padding: "6px 10px"
                              }}
                              type="button"
                            >
                              Descer
                            </button>
                          </div>
                        </div>

                        <EventFormPreviewControl
                          field={field}
                          onChange={(nextValue) =>
                            setPreviewFieldValues(
                              (current) => ({
                                ...current,
                                [field.id]: nextValue
                              })
                            )
                          }
                          value={
                            previewFieldValues[field.id] ??
                            (field.type === "MULTIPLE_CHOICE"
                              ? []
                              : "")
                          }
                        />
                      </div>
                    ))}
                  </article>
                </div>

                {isFormFieldOverlayOpen ? (
                <form
                  onSubmit={handleSaveFormFieldOverlay}
                  style={{
                    background: "rgba(2, 6, 23, 0.72)",
                    inset: 0,
                    position: "fixed",
                    zIndex: 70,
                    alignItems: "center",
                    display: "grid",
                    justifyItems: "center",
                    padding: "24px"
                  }}
                >
                  <section
                    onClick={(clickEvent) =>
                      clickEvent.stopPropagation()
                    }
                    style={{
                      background:
                        "linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.96))",
                      border:
                        "1px solid rgba(148, 163, 184, 0.22)",
                      borderRadius: "20px",
                      display: "grid",
                      gap: "14px",
                      maxWidth: "620px",
                      padding: "22px",
                      width: "100%"
                    }}
                  >
                    <div
                      style={{
                        alignItems: "center",
                        display: "flex",
                        justifyContent: "space-between"
                      }}
                    >
                      <h3
                        style={{
                          color: "#f8fafc",
                          margin: 0
                        }}
                      >
                        {editingFormFieldId
                          ? "Editar campo"
                          : "Adicionar campo"}
                      </h3>
                      <button
                        aria-label="Fechar"
                        onClick={closeFormFieldOverlay}
                        style={{
                          background: "transparent",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "999px",
                          color: "#e2e8f0",
                          cursor: "pointer",
                          fontSize: "16px",
                          fontWeight: 900,
                          height: "32px",
                          lineHeight: 1,
                          width: "32px"
                        }}
                        type="button"
                      >
                        ×
                      </button>
                    </div>

                    <label
                      style={{
                        color: "#94a3b8",
                        display: "grid",
                        fontSize: "13px",
                        fontWeight: 600,
                        gap: "8px"
                      }}
                    >
                      Título do campo / Pergunta
                      <input
                        maxLength={150}
                        onChange={(changeEvent) =>
                          setOverlayFormFieldLabel(
                            changeEvent.target.value
                          )
                        }
                        required
                        style={{
                          background:
                            "rgba(15, 23, 42, 0.72)",
                          border:
                            "1px solid rgba(148, 163, 184, 0.28)",
                          borderRadius: "10px",
                          color: "#e2e8f0",
                          fontSize: "14px",
                          padding: "12px"
                        }}
                        type="text"
                        value={overlayFormFieldLabel}
                      />
                    </label>
                    <p
                      style={{
                        color: "#94a3b8",
                        fontSize: "12px",
                        margin: 0,
                        textAlign: "right"
                      }}
                    >
                      {overlayLabelCharsLeft} caracteres restantes
                    </p>

                    {formFieldTypeNeedsOptions(
                      overlayFormFieldType
                    ) ? (
                    <label
                      style={{
                        color: "#94a3b8",
                        display: "grid",
                        fontSize: "13px",
                        fontWeight: 600,
                        gap: "8px"
                      }}
                    >
                      Opções
                      <textarea
                        onChange={(changeEvent) =>
                          setOverlayFieldOptions(
                            changeEvent.target.value
                          )
                        }
                        rows={4}
                        style={{
                          background:
                            "rgba(15, 23, 42, 0.72)",
                          border:
                            "1px solid rgba(148, 163, 184, 0.28)",
                          borderRadius: "10px",
                          color: "#e2e8f0",
                          fontSize: "14px",
                          padding: "12px"
                        }}
                        value={overlayFieldOptions}
                      />
                    </label>
                  ) : null}

                    <label
                      style={{
                        alignItems: "center",
                        color: "#e2e8f0",
                        display: "flex",
                        fontSize: "14px",
                        gap: "8px"
                      }}
                    >
                      <input
                        checked={overlayFormFieldRequired}
                        onChange={(changeEvent) =>
                          setOverlayFormFieldRequired(
                            changeEvent.target.checked
                          )
                        }
                        type="checkbox"
                      />
                      Campo de preenchimento obrigatório
                    </label>

                    <label
                      style={{
                        alignItems: "center",
                        color: "#e2e8f0",
                        display: "flex",
                        fontSize: "14px",
                        gap: "8px"
                      }}
                    >
                      <input
                        checked={overlayTicketScopeEnabled}
                        onChange={(changeEvent) => {
                          const checked =
                            changeEvent.target.checked;
                          setOverlayTicketScopeEnabled(checked);
                          if (!checked) {
                            setOverlayTicketIds([]);
                          }
                        }}
                        type="checkbox"
                      />
                      Mostrar este campo para tipos específicos de ingressos
                    </label>

                    {overlayTicketScopeEnabled ? (
                      <fieldset
                        style={{
                          border:
                            "1px solid rgba(148, 163, 184, 0.24)",
                          borderRadius: "12px",
                          margin: 0,
                          padding: "12px"
                        }}
                      >
                        <legend
                          style={{
                            color: "#94a3b8",
                            fontSize: "13px",
                            fontWeight: 600,
                            padding: "0 6px"
                          }}
                        >
                          Ingressos
                        </legend>
                        {tickets.length === 0 ? (
                          <p
                            style={{
                              color: "#cbd5e1",
                              margin: 0
                            }}
                          >
                            Sem ingressos cadastrados.
                          </p>
                        ) : (
                          tickets.map((ticket) => (
                            <label
                              key={ticket.id}
                              style={{
                                color: "#e2e8f0",
                                display: "block",
                                fontSize: "14px",
                                margin: "8px 0"
                              }}
                            >
                              <input
                                checked={overlayTicketIds.includes(
                                  ticket.id
                                )}
                                onChange={(changeEvent) => {
                                  setOverlayTicketIds(
                                    (current) =>
                                      changeEvent.target
                                        .checked
                                        ? [
                                            ...current,
                                            ticket.id
                                          ]
                                        : current.filter(
                                            (id) =>
                                              id !== ticket.id
                                          )
                                  );
                                }}
                                type="checkbox"
                              />{" "}
                              {ticket.name}
                            </label>
                          ))
                        )}
                      </fieldset>
                    ) : null}

                    <label
                      style={{
                        alignItems: "center",
                        color: "#e2e8f0",
                        display: "flex",
                        fontSize: "14px",
                        gap: "8px"
                      }}
                    >
                      <input
                        checked={overlayFormFieldSensitive}
                        onChange={(changeEvent) =>
                          setOverlayFormFieldSensitive(
                            changeEvent.target.checked
                          )
                        }
                        type="checkbox"
                      />
                      Tratar resposta como dado sensível
                    </label>
                    <div
                      style={{
                        alignItems: "flex-start",
                        border:
                          "1px solid rgba(148, 163, 184, 0.22)",
                        borderRadius: "10px",
                        display: "flex",
                        gap: "10px",
                        padding: "12px"
                      }}
                    >
                      <span
                        aria-hidden="true"
                        style={{
                          alignItems: "center",
                          border:
                            "1px solid rgba(148, 163, 184, 0.35)",
                          borderRadius: "999px",
                          color: "#94a3b8",
                          display: "inline-flex",
                          flexShrink: 0,
                          fontSize: "12px",
                          fontStyle: "italic",
                          fontWeight: 800,
                          height: "20px",
                          justifyContent: "center",
                          lineHeight: 1,
                          width: "20px"
                        }}
                      >
                        i
                      </span>
                      <p
                        style={{
                          color: "#94a3b8",
                          fontSize: "13px",
                          lineHeight: 1.45,
                          margin: 0
                        }}
                      >
                        A resposta deste campo será tratada como dado protegido no painel.
                      </p>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "8px",
                        justifyContent: "flex-end",
                        marginTop: "4px"
                      }}
                    >
                      <button
                        onClick={closeFormFieldOverlay}
                        style={{
                          background: "transparent",
                          border:
                            "1px solid rgba(148, 163, 184, 0.3)",
                          borderRadius: "10px",
                          color: "#e2e8f0",
                          cursor: "pointer",
                          fontWeight: 800,
                          padding: "10px 14px"
                        }}
                        type="button"
                      >
                        Cancelar
                      </button>
                      <button
                        disabled={isSavingFormFieldOverlay}
                        style={{
                          background: "#2563eb",
                          border: 0,
                          borderRadius: "10px",
                          color: "#ffffff",
                          cursor: isSavingFormFieldOverlay
                            ? "not-allowed"
                            : "pointer",
                          fontWeight: 800,
                          opacity: isSavingFormFieldOverlay
                            ? 0.7
                            : 1,
                          padding: "10px 14px"
                        }}
                        type="submit"
                      >
                        {isSavingFormFieldOverlay
                          ? "Salvando..."
                          : editingFormFieldId
                            ? "Salvar"
                            : "Adicionar"}
                      </button>
                    </div>
                  </section>
                </form>
                ) : null}

                {isLoadingFormFields ? (
                  <p>Carregando campos...</p>
                ) : null}

                {!isLoadingFormFields &&
                formFields.length === 0 ? (
                  <p>Nenhum campo personalizado configurado.</p>
                ) : null}
              </section>
            ) : null}

{activeSection === "participants" ? (
  <section
    style={{
      background: "rgba(15, 23, 42, 0.82)",
      border: "1px solid rgba(148, 163, 184, 0.18)",
      borderRadius: "20px",
      display: "grid",
      gap: "18px",
      padding: "24px"
    }}
  >
    <header>
      <p
        style={{
          color: "#60a5fa",
          fontSize: "13px",
          fontWeight: 900,
          margin: "0 0 6px",
          textTransform: "uppercase"
        }}
      >
        Participantes
      </p>

      <h2 style={{ margin: 0 }}>
        Inscrições do evento
      </h2>

      <p
        style={{
          color: "#94a3b8",
          margin: "8px 0 0"
        }}
      >
        Pesquise participantes e refine pelos filtros disponíveis.
      </p>
    </header>

    <div
      style={{
        display: "grid",
        gap: "10px",
        gridTemplateColumns:
          "minmax(220px, 2fr) repeat(3, minmax(145px, 1fr))"
      }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setParticipantSearch(
            participantSearchInput.trim()
          );
        }}
        style={{
          display: "grid",
          gap: "8px",
          gridTemplateColumns:
            "minmax(140px, 1fr) auto"
        }}
      >
        <input
          onChange={(event) =>
            setParticipantSearchInput(
              event.target.value
            )
          }
          placeholder="Nome, e-mail, telefone ou código"
          style={{
            borderRadius: "10px",
            padding: "11px 12px"
          }}
          value={participantSearchInput}
        />

        <button
          style={{
            background: "#2563eb",
            border: 0,
            borderRadius: "10px",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 900,
            padding: "11px 16px"
          }}
          type="submit"
        >
          Pesquisar
        </button>
      </form>

      <select
        onChange={(event) =>
          setParticipantStatus(event.target.value)
        }
        style={{
          borderRadius: "10px",
          padding: "11px 12px"
        }}
        value={participantStatus}
      >
        <option value="ALL">
          Todas as inscrições
        </option>
        <option value="PENDING">Pendentes</option>
        <option value="CONFIRMED">Confirmadas</option>
        <option value="CHECKED_IN">
          Check-in realizado
        </option>
        <option value="CANCELLED">Canceladas</option>
      </select>

      <select
        onChange={(event) =>
          setParticipantPayment(event.target.value)
        }
        style={{
          borderRadius: "10px",
          padding: "11px 12px"
        }}
        value={participantPayment}
      >
        <option value="ALL">
          Todos os pagamentos
        </option>
        <option value="PAID">Pago</option>
        <option value="PENDING">Pendente</option>
        <option value="NOT_REQUIRED">
          Não necessário
        </option>
        <option value="CANCELLED">Cancelado</option>
      </select>

      <select
        onChange={(event) =>
          setParticipantTicket(event.target.value)
        }
        style={{
          borderRadius: "10px",
          padding: "11px 12px"
        }}
        value={participantTicket}
      >
        <option value="ALL">
          Todos os ingressos
        </option>
        {tickets.map((ticket) => (
          <option
            key={ticket.id}
            value={ticket.id}
          >
            {ticket.name}
          </option>
        ))}
      </select>
    </div>

    <p
      style={{
        color: "#94a3b8",
        margin: 0
      }}
    >
      {filteredParticipants.length} participante(s)
    </p>

    <div
      style={{
        display: "grid",
        gap: "10px"
      }}
    >
      {filteredParticipants.length === 0 ? (
        <p
          style={{
            color: "#94a3b8",
            margin: 0
          }}
        >
          Nenhum participante encontrado.
        </p>
      ) : null}

      {filteredParticipants.map((registration) => {
        const participant =
          registration.person ??
          registration.visitor;

        if (!participant) {
          return null;
        }

        return (
          <details
            key={registration.id}
            style={{
              border:
                "1px solid rgba(148, 163, 184, 0.18)",
              borderRadius: "12px",
              padding: "14px 16px"
            }}
          >
            <summary
              style={{
                cursor: "pointer",
                display: "grid",
                gap: "10px",
                gridTemplateColumns:
                  "minmax(180px, 2fr) repeat(3, minmax(110px, 1fr))",
                listStyle: "none"
              }}
            >
              <strong>{participant.name}</strong>
              <span>
                {registration.ticket?.name ??
                  "Sem ingresso"}
              </span>
              <span>
                {getRegistrationStatusLabel(
                  registration.status
                )}
              </span>

              <span>
                {getPaymentStatusLabel(
                  registration.paymentStatus
                )}
              </span>
            </summary>

            <div
              style={{
                display: "grid",
                gap: "8px",
                marginTop: "14px"
              }}
            >
              <span>{participant.email ?? "Sem e-mail"}</span>
              <span>{participant.phone}</span>
              <span>
                Lote:{" "}
                {registration.ticketBatch?.name ??
                  "Não informado"}
              </span>
              <span>
                Código: {registration.checkInToken}
              </span>

              {registration.formAnswers.map(
                (answer) => (
                  <div key={answer.id}>
                    <strong>
                      {answer.field.label}
                    </strong>
                    <p style={{ margin: "4px 0 0" }}>
                      {answer.field.isSensitive
                        ? "Dado protegido"
                        : Array.isArray(answer.value)
                          ? answer.value.join(", ")
                          : String(answer.value)}
                    </p>
                  </div>
                )
              )}
            </div>
          </details>
        );
      })}
    </div>
  </section>
) : null}

{activeSection === "check-in" ? (
  <section
    style={{
      background: "rgba(15, 23, 42, 0.82)",
      border:
        "1px solid rgba(148, 163, 184, 0.18)",
      borderRadius: "20px",
      display: "grid",
      gap: "18px",
      padding: "24px"
    }}
  >
    <header>
      <p
        style={{
          color: "#60a5fa",
          fontSize: "13px",
          fontWeight: 900,
          margin: "0 0 6px",
          textTransform: "uppercase"
        }}
      >
        Check-in
      </p>

      <h2 style={{ margin: 0 }}>
        Credenciamento
      </h2>

      <p
        style={{
          color: "#94a3b8",
          margin: "8px 0 0"
        }}
      >
        Use a credencial para o check-in ou pesquise o participante manualmente.
      </p>
    </header>

    {checkInMessage ? (
      <p
        style={{
          background: "rgba(5, 150, 105, 0.16)",
          border:
            "1px solid rgba(52, 211, 153, 0.26)",
          borderRadius: "12px",
          color: "#a7f3d0",
          margin: 0,
          padding: "12px"
        }}
      >
        {checkInMessage}
      </p>
    ) : null}

    <div>
      <strong
        style={{
          display: "block",
          marginBottom: "8px"
        }}
      >
        Check-in por credencial
      </strong>

      <form
      onSubmit={handleCheckInByCode}
      style={{
        display: "grid",
        gap: "10px",
        gridTemplateColumns:
          "minmax(220px, 1fr) auto"
      }}
    >
      <input
        onChange={(event) =>
          setCheckInCode(event.target.value)
        }
        placeholder="Código da credencial"
        style={{
          borderRadius: "10px",
          padding: "12px"
        }}
        value={checkInCode}
      />

      <button
        disabled={isCheckingIn}
        style={{
          background: "#2563eb",
          border: 0,
          borderRadius: "10px",
          color: "#ffffff",
          fontWeight: 900,
          padding: "12px 18px"
        }}
        type="submit"
      >
        {isCheckingIn
          ? "Validando..."
          : "Fazer check-in"}
      </button>
    </form>
    </div>

    <div>
      <strong
        style={{
          display: "block",
          marginBottom: "8px"
        }}
      >
        Busca manual
      </strong>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setCheckInSearch(
            checkInSearchInput.trim()
          );
        }}
        style={{
          display: "grid",
          gap: "10px",
          gridTemplateColumns:
            "minmax(220px, 1fr) auto"
        }}
      >
        <input
          onChange={(event) =>
            setCheckInSearchInput(
              event.target.value
            )
          }
          placeholder="Nome, e-mail, telefone ou código"
          style={{
            borderRadius: "10px",
            padding: "12px"
          }}
          value={checkInSearchInput}
        />

        <button
          style={{
            background: "#2563eb",
            border: 0,
            borderRadius: "10px",
            color: "#ffffff",
            cursor: "pointer",
            fontWeight: 900,
            padding: "12px 18px"
          }}
          type="submit"
        >
          Pesquisar
        </button>
      </form>
    </div>

    <div
      style={{
        display: "grid",
        gap: "8px"
      }}
    >
      {checkInParticipants.length === 0 ? (
        <p
          style={{
            color: "#94a3b8",
            margin: 0
          }}
        >
          Nenhum participante encontrado.
        </p>
      ) : null}

      {checkInParticipants.map(
        (registration) => {
          const participant =
            registration.person ??
            registration.visitor;

          if (!participant) {
            return null;
          }

          const checkedIn =
            registration.status ===
            "CHECKED_IN";

          return (
            <div
              key={registration.id}
              style={{
                alignItems: "center",
                border:
                  "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "12px",
                display: "grid",
                gap: "12px",
                gridTemplateColumns:
                  "minmax(180px, 2fr) minmax(130px, 1fr) auto",
                padding: "13px 15px"
              }}
            >
              <div>
                <strong>
                  {participant.name}
                </strong>

                <p
                  style={{
                    color: "#94a3b8",
                    margin: "4px 0 0"
                  }}
                >
                  {registration.ticket?.name ??
                    "Sem ingresso"}
                  {registration.ticketBatch
                    ?.name
                    ? " - " + registration.ticketBatch.name
                    : ""}
                </p>
              </div>

              <span>
                {checkedIn
                  ? "Presente"
                  : "Pendente"}
              </span>

              <button
                disabled={
                  checkedIn ||
                  isCheckingIn
                }
                onClick={() =>
                  void handleParticipantCheckIn(
                    registration.id
                  )
                }
                style={{
                  background: checkedIn
                    ? "rgba(5, 150, 105, 0.2)"
                    : "#2563eb",
                  border: 0,
                  borderRadius: "9px",
                  color: checkedIn
                    ? "#a7f3d0"
                    : "#ffffff",
                  fontWeight: 900,
                  padding: "10px 14px"
                }}
                type="button"
              >
                {checkedIn
                  ? "Check-in realizado"
                  : "Fazer check-in"}
              </button>
            </div>
          );
        }
      )}
    </div>
  </section>
) : null}

{activeSection === "financial" ? (
  <section
    style={{
      background: "rgba(15, 23, 42, 0.82)",
      border: "1px solid rgba(148, 163, 184, 0.18)",
      borderRadius: "20px",
      display: "grid",
      gap: "18px",
      padding: "24px"
    }}
  >
    <header>
      <p
        style={{
          color: "#60a5fa",
          fontSize: "13px",
          fontWeight: 900,
          margin: "0 0 6px",
          textTransform: "uppercase"
        }}
      >
        Financeiro
      </p>

      <h2 style={{ margin: 0 }}>
        Movimentações do evento
      </h2>

      <p
        style={{
          color: "#94a3b8",
          margin: "8px 0 0"
        }}
      >
        Acompanhe vendas, participantes,
        métodos e status dos pagamentos.
      </p>
    </header>

    {isLoadingFinancial ? (
      <p>Carregando financeiro...</p>
    ) : null}

    {!isLoadingFinancial &&
    financialSummary ? (
      <div
        style={{
          display: "grid",
          gap: "10px",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(160px, 1fr))"
        }}
      >
        <article
          style={{
            border:
              "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: "12px",
            padding: "14px"
          }}
        >
          <strong
            style={{
              color: "#94a3b8"
            }}
          >
            Entradas
          </strong>
          <p
            style={{
              fontSize: "20px",
              fontWeight: 900,
              margin: "6px 0 0"
            }}
          >
            {formatMoney(
              financialSummary.income
            )}
          </p>
        </article>

        <article
          style={{
            border:
              "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: "12px",
            padding: "14px"
          }}
        >
          <strong
            style={{
              color: "#94a3b8"
            }}
          >
            Saídas
          </strong>
          <p
            style={{
              fontSize: "20px",
              fontWeight: 900,
              margin: "6px 0 0"
            }}
          >
            {formatMoney(
              financialSummary.expense
            )}
          </p>
        </article>

        <article
          style={{
            border:
              "1px solid rgba(148, 163, 184, 0.18)",
            borderRadius: "12px",
            padding: "14px"
          }}
        >
          <strong
            style={{
              color: "#94a3b8"
            }}
          >
            Saldo
          </strong>
          <p
            style={{
              fontSize: "20px",
              fontWeight: 900,
              margin: "6px 0 0"
            }}
          >
            {formatMoney(
              Number(
                financialSummary.income
              ) -
                Number(
                  financialSummary.expense
                )
            )}
          </p>
        </article>
      </div>
    ) : null}

    <form
      onSubmit={(formEvent) => {
        formEvent.preventDefault();

        setFinancialSearch(
          financialSearchInput.trim()
        );
      }}
      style={{
        alignItems: "end",
        display: "grid",
        gap: "14px",
        gridTemplateColumns:
          "minmax(300px, 2.2fr) minmax(180px, 0.9fr) minmax(210px, 1fr) 132px",
        width: "100%"
      }}
    >
      <label
        style={{
          display: "grid",
          gap: "7px",
          minWidth: 0
        }}
      >
        <span
          style={{
            color: "#94a3b8",
            fontSize: "12px",
            fontWeight: 800
          }}
        >
          Pesquisar movimentações
        </span>

        <input
          onChange={(event) =>
            setFinancialSearchInput(
              event.target.value
            )
          }
          placeholder="Participante, e-mail, telefone, ingresso ou cobrança"
          style={{
            boxSizing: "border-box",
            fontSize: "14px",
            minHeight: "46px",
            padding: "0 14px",
            width: "100%"
          }}
          type="search"
          value={financialSearchInput}
        />
      </label>

      <label
        style={{
          display: "grid",
          gap: "7px",
          minWidth: 0
        }}
      >
        <span
          style={{
            color: "#94a3b8",
            fontSize: "12px",
            fontWeight: 800
          }}
        >
          Método
        </span>

        <select
          onChange={(event) =>
            setFinancialMethodFilter(
              event.target.value
            )
          }
          style={{
            boxSizing: "border-box",
            fontSize: "14px",
            minHeight: "46px",
            padding: "0 12px",
            width: "100%"
          }}
          value={financialMethodFilter}
        >
          <option value="ALL">
            Todos os métodos
          </option>
          <option value="PIX">
            PIX
          </option>
          <option value="CARD">
            Cartão
          </option>
        </select>
      </label>

      <label
        style={{
          display: "grid",
          gap: "7px",
          minWidth: 0
        }}
      >
        <span
          style={{
            color: "#94a3b8",
            fontSize: "12px",
            fontWeight: 800
          }}
        >
          Status
        </span>

        <select
          onChange={(event) =>
            setFinancialStatusFilter(
              event.target.value
            )
          }
          style={{
            boxSizing: "border-box",
            fontSize: "14px",
            minHeight: "46px",
            padding: "0 12px",
            width: "100%"
          }}
          value={financialStatusFilter}
        >
          <option value="ALL">
            Todos os status
          </option>
          <option value="PAID">
            Pago
          </option>
          <option value="PENDING">
            Pendente
          </option>
          <option value="REFUND_PENDING">
            Reembolso em processamento
          </option>
          <option value="CANCELLED">
            Cancelado
          </option>
          <option value="REFUNDED">
            Reembolsado
          </option>
        </select>
      </label>

      <button
        style={{
          alignSelf: "end",
          minHeight: "46px",
          minWidth: "132px",
          padding: "0 18px",
          whiteSpace: "nowrap",
          width: "132px"
        }}
        type="submit"
      >
        Pesquisar
      </button>
    </form>

    {!isLoadingFinancial &&
    filteredFinancialTransactions.length ===
      0 ? (
      <p>
        Nenhuma movimentação encontrada.
      </p>
    ) : null}

    <div
      style={{
        display: "grid",
        gap: "10px"
      }}
    >
      {filteredFinancialTransactions.map(
        (transaction) => {
          const registrations =
            getEventFinancialRegistrations(
              transaction
            );

          const participants =
            getEventFinancialParticipants(
              transaction
            );

          const participantNames =
            participants.length > 0
              ? participants
                  .map(
                    (participant) =>
                      participant.name
                  )
                  .join(", ")
              : "Sem participante vinculado";

          const tickets =
            registrations
              .map((registration) => {
                const ticket =
                  registration.ticket
                    ?.name;

                const batch =
                  registration.ticketBatch
                    ?.name;

                if (
                  ticket &&
                  batch
                ) {
                  return (
                    ticket +
                    " • " +
                    batch
                  );
                }

                return (
                  ticket ??
                  batch ??
                  null
                );
              })
              .filter(
                (
                  value
                ): value is string =>
                  Boolean(value)
              );

          const paymentStatus =
            transaction.eventPayment
              ?.status ?? null;

          const provider =
            transaction.eventPayment
              ?.provider ??
            (transaction.asaasId
              ? "ASAAS"
              : null);

          const providerPaymentId =
            transaction.eventPayment
              ?.providerPaymentId ??
            transaction.asaasId;

          return (
            <article
              key={transaction.id}
              style={{
                border:
                  "1px solid rgba(148, 163, 184, 0.18)",
                borderRadius: "14px",
                display: "grid",
                gap: "12px",
                padding: "16px"
              }}
            >
              <div
                style={{
                  alignItems: "start",
                  display: "grid",
                  gap: "12px",
                  gridTemplateColumns:
                    "minmax(180px, 1.5fr) minmax(150px, 1fr) minmax(110px, 0.7fr) minmax(120px, 0.8fr)"
                }}
              >
                <div>
                  <strong>
                    {participantNames}
                  </strong>
                  <p
                    style={{
                      color:
                        "#94a3b8",
                      margin:
                        "5px 0 0"
                    }}
                  >
                    {tickets.length > 0
                      ? tickets.join(
                          ", "
                        )
                      : "Sem ingresso vinculado"}
                  </p>
                </div>

                <div>
                  <span
                    style={{
                      color:
                        "#94a3b8",
                      display:
                        "block",
                      fontSize:
                        "12px"
                    }}
                  >
                    Pagamento
                  </span>
                  <strong>
                    {getEventPaymentStatusLabel(
                      paymentStatus
                    )}
                  </strong>
                </div>

                <div>
                  <span
                    style={{
                      color:
                        "#94a3b8",
                      display:
                        "block",
                      fontSize:
                        "12px"
                    }}
                  >
                    Método
                  </span>
                  <strong>
                    {getEventFinancialMethodLabel(
                      transaction.method
                    )}
                  </strong>
                </div>

                <div
                  style={{
                    textAlign:
                      "right"
                  }}
                >
                  <strong
                    style={{
                      color:
                        transaction.direction ===
                        "IN"
                          ? "#a7f3d0"
                          : "#fca5a5",
                      fontSize:
                        "18px"
                    }}
                  >
                    {transaction.direction ===
                    "IN"
                      ? "+"
                      : "-"}
                    {formatMoney(
                      transaction.amount
                    )}
                  </strong>
                </div>
              </div>

              <div
                style={{
                  borderTop:
                    "1px solid rgba(148, 163, 184, 0.12)",
                  color:
                    "#94a3b8",
                  display:
                    "grid",
                  fontSize:
                    "12px",
                  gap:
                    "8px",
                  gridTemplateColumns:
                    "repeat(auto-fit, minmax(150px, 1fr))",
                  paddingTop:
                    "10px"
                }}
              >
                <span>
                  Financeiro:{" "}
                  <strong
                    style={{
                      color:
                        "#e2e8f0"
                    }}
                  >
                    {getTransactionStatusLabel(
                      transaction.status
                    )}
                  </strong>
                </span>

                <span>
                  Provider:{" "}
                  <strong
                    style={{
                      color:
                        "#e2e8f0"
                    }}
                  >
                    {provider ??
                      "Interno"}
                  </strong>
                </span>

                <span
                  title={
                    providerPaymentId ??
                    ""
                  }
                >
                  Cobrança:{" "}
                  <strong
                    style={{
                      color:
                        "#e2e8f0"
                    }}
                  >
                    {providerPaymentId ??
                      "Sem ID externo"}
                  </strong>
                </span>

                <span>
                  Data:{" "}
                  <strong
                    style={{
                      color:
                        "#e2e8f0"
                    }}
                  >
                    {formatDate(
                      transaction.at
                    )}
                  </strong>
                </span>
              </div>
            </article>
          );
        }
      )}
    </div>
  </section>
) : null}

{activeSection === "event-app" ? (
              <section
              id="aplicativo-do-evento"
              style={{
                background:
                  "linear-gradient(135deg, rgba(30, 64, 175, 0.28), rgba(15, 23, 42, 0.86))",
                border: "1px solid rgba(96, 165, 250, 0.26)",
                borderRadius: "26px",
                display: "grid",
                gap: "18px",
                padding: "26px"
              }}
            >
              <div>
                <p
                  style={{
                    color: "#60a5fa",
                    fontSize: "13px",
                    fontWeight: 900,
                    letterSpacing: "0.08em",
                    margin: "0 0 8px",
                    textTransform: "uppercase"
                  }}
                >
                  Dentro deste evento
                </p>

                <h2
                  style={{
                    color: "#ffffff",
                    fontSize: "26px",
                    margin: "0 0 10px"
                  }}
                >
                  Aplicativo do Evento
                </h2>

                <p
                  style={{
                    color: "#cbd5e1",
                    lineHeight: 1.7,
                    margin: 0,
                    maxWidth: "760px"
                  }}
                >
                  Área do participante com credencial, QR Code,
                  programação, avisos, materiais e demais informações
                  deste evento.
                </p>
              </div>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px"
                }}
              >
                <a
                  href={eventAppUrl}
                  rel="noreferrer"
                  style={{
                    background: "#2563eb",
                    borderRadius: "14px",
                    color: "#ffffff",
                    fontSize: "14px",
                    fontWeight: 900,
                    padding: "13px 18px",
                    textDecoration: "none"
                  }}
                  target="_blank"
                >
                  Visualizar aplicativo
                </a>

                <code
                  style={{
                    background: "rgba(2, 6, 23, 0.5)",
                    border: "1px solid rgba(148, 163, 184, 0.18)",
                    borderRadius: "14px",
                    color: "#bfdbfe",
                    fontSize: "13px",
                    padding: "13px 16px",
                    wordBreak: "break-all"
                  }}
                >
                  /{event.church.slug}/{event.slug}
                </code>
              </div>
              </section>
            ) : null}
              </div>
            </div>
          </>
        ) : null}
      </section>

      {isCreateModalOpen ? (
        <div
          onClick={closeCreateEventModal}
          style={{
            alignItems: "center",
            background: "rgba(2, 6, 23, 0.72)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "24px",
            position: "fixed",
            zIndex: 60
          }}
        >
          <div
            onClick={(clickEvent) =>
              clickEvent.stopPropagation()
            }
            style={{
              background:
                "linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.96))",
              border:
                "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: "28px",
              boxShadow:
                "0 28px 90px rgba(2, 6, 23, 0.48)",
              display: "grid",
              gap: "28px",
              maxHeight: "calc(100vh - 48px)",
              maxWidth: "760px",
              overflow: "auto",
              padding: "36px",
              width: "100%"
            }}
          >
            <header
              style={{
                display: "grid",
                gap: "8px"
              }}
            >
              <p
                style={{
                  color: "#60a5fa",
                  fontSize: "13px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  margin: 0,
                  textTransform: "uppercase"
                }}
              >
                Módulo Eventos
              </p>

              <h2
                style={{
                  color: "#ffffff",
                  fontSize: "28px",
                  letterSpacing: "-0.03em",
                  margin: 0
                }}
              >
                Criar evento
              </h2>

              <p
                style={{
                  color: "#94a3b8",
                  lineHeight: 1.6,
                  margin: 0
                }}
              >
                Cadastre um novo evento com os dados
                principais e a configuração de publicação.
              </p>
            </header>

            {createError ? (
              <p
                style={{
                  background: "rgba(127, 29, 29, 0.32)",
                  border:
                    "1px solid rgba(248, 113, 113, 0.28)",
                  borderRadius: "14px",
                  color: "#fecaca",
                  margin: 0,
                  padding: "14px"
                }}
              >
                {createError}
              </p>
            ) : null}

            <form
              onSubmit={handleCreateEvent}
              style={{
                display: "grid",
                gap: "28px"
              }}
            >
              <section
                style={{
                  background: "rgba(15, 23, 42, 0.72)",
                  border:
                    "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "22px",
                  display: "grid",
                  gap: "18px",
                  padding: "24px"
                }}
              >
                <h3
                  style={{
                    color: "#ffffff",
                    fontSize: "18px",
                    margin: 0
                  }}
                >
                  Dados principais
                </h3>

                <div
                  style={{
                    display: "grid",
                    gap: "16px",
                    gridTemplateColumns:
                      "repeat(auto-fit, minmax(240px, 1fr))"
                  }}
                >
                  <label
                    style={{
                      color: "#e2e8f0",
                      display: "grid",
                      fontWeight: 800,
                      gap: "8px"
                    }}
                  >
                    Título

                    <input
                      onChange={(changeEvent) =>
                        setCreateTitle(
                          changeEvent.target.value
                        )
                      }
                      required
                      style={{
                        background: "#0f172a",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#ffffff",
                        font: "inherit",
                        padding: "13px 14px"
                      }}
                      type="text"
                      value={createTitle}
                    />
                  </label>

                  <label
                    style={{
                      color: "#e2e8f0",
                      display: "grid",
                      fontWeight: 800,
                      gap: "8px"
                    }}
                  >
                    Data e hora

                    <input
                      onChange={(changeEvent) =>
                        setCreateDate(
                          changeEvent.target.value
                        )
                      }
                      required
                      style={{
                        background: "#0f172a",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#ffffff",
                        font: "inherit",
                        padding: "13px 14px"
                      }}
                      type="datetime-local"
                      value={createDate}
                    />
                  </label>

                  <label
                    style={{
                      color: "#e2e8f0",
                      display: "grid",
                      fontWeight: 800,
                      gap: "8px"
                    }}
                  >
                    Capacidade

                    <input
                      min="1"
                      onChange={(changeEvent) =>
                        setCreateCapacity(
                          changeEvent.target.value
                        )
                      }
                      required
                      style={{
                        background: "#0f172a",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#ffffff",
                        font: "inherit",
                        padding: "13px 14px"
                      }}
                      type="number"
                      value={createCapacity}
                    />
                  </label>

                  <label
                    style={{
                      color: "#e2e8f0",
                      display: "grid",
                      fontWeight: 800,
                      gap: "8px"
                    }}
                  >
                    Valor

                    <input
                      min="0"
                      onChange={(changeEvent) =>
                        setCreatePrice(
                          changeEvent.target.value
                        )
                      }
                      required
                      step="0.01"
                      style={{
                        background: "#0f172a",
                        border:
                          "1px solid rgba(148, 163, 184, 0.3)",
                        borderRadius: "12px",
                        color: "#ffffff",
                        font: "inherit",
                        padding: "13px 14px"
                      }}
                      type="number"
                      value={createPrice}
                    />
                  </label>
                </div>
              </section>

              <section
                style={{
                  background: "rgba(15, 23, 42, 0.72)",
                  border:
                    "1px solid rgba(148, 163, 184, 0.18)",
                  borderRadius: "22px",
                  display: "grid",
                  gap: "18px",
                  padding: "24px"
                }}
              >
                <h3
                  style={{
                    color: "#ffffff",
                    fontSize: "18px",
                    margin: 0
                  }}
                >
                  Publicação
                </h3>

                <label
                  style={{
                    alignItems: "center",
                    color: "#e2e8f0",
                    display: "flex",
                    fontWeight: 800,
                    gap: "10px"
                  }}
                >
                  <input
                    checked={createIsPublic}
                    onChange={(changeEvent) => {
                      const checked =
                        changeEvent.target.checked;

                      setCreateIsPublic(checked);

                      if (!checked) {
                        setCreatePublicRegistrationEnabled(
                          false
                        );
                      }
                    }}
                    type="checkbox"
                  />
                  Evento público
                </label>

                <label
                  style={{
                    alignItems: "center",
                    color: "#e2e8f0",
                    display: "flex",
                    fontWeight: 800,
                    gap: "10px"
                  }}
                >
                  <input
                    checked={createPublicRegistrationEnabled}
                    onChange={(changeEvent) =>
                      setCreatePublicRegistrationEnabled(
                        changeEvent.target.checked
                      )
                    }
                    type="checkbox"
                  />
                  Inscrições públicas abertas
                </label>

                <label
                  style={{
                    alignItems: "center",
                    color: "#e2e8f0",
                    display: "flex",
                    fontWeight: 800,
                    gap: "10px"
                  }}
                >
                  <input
                    checked={createWaitlistEnabled}
                    onChange={(changeEvent) =>
                      setCreateWaitlistEnabled(
                        changeEvent.target.checked
                      )
                    }
                    type="checkbox"
                  />
                  Lista de espera habilitada
                </label>
              </section>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  justifyContent: "flex-end"
                }}
              >
                <button
                  disabled={isCreatingEvent}
                  onClick={closeCreateEventModal}
                  style={{
                    background:
                      "rgba(15, 23, 42, 0.68)",
                    border:
                      "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#e2e8f0",
                    cursor: isCreatingEvent
                      ? "not-allowed"
                      : "pointer",
                    fontWeight: 900,
                    opacity: isCreatingEvent ? 0.72 : 1,
                    padding: "12px 18px"
                  }}
                  type="button"
                >
                  Cancelar
                </button>

                <button
                  disabled={isCreatingEvent}
                  style={{
                    background: "#2563eb",
                    border: 0,
                    borderRadius: "12px",
                    color: "#ffffff",
                    cursor: isCreatingEvent
                      ? "not-allowed"
                      : "pointer",
                    fontWeight: 900,
                    opacity: isCreatingEvent ? 0.72 : 1,
                    padding: "12px 18px"
                  }}
                  type="submit"
                >
                  {isCreatingEvent
                    ? "Criando..."
                    : "Criar evento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {isDuplicateModalOpen && event ? (
        <div
          onClick={closeDuplicateEventModal}
          style={{
            alignItems: "center",
            background: "rgba(2, 6, 23, 0.72)",
            display: "flex",
            inset: 0,
            justifyContent: "center",
            padding: "24px",
            position: "fixed",
            zIndex: 60
          }}
        >
          <div
            onClick={(clickEvent) =>
              clickEvent.stopPropagation()
            }
            style={{
              background:
                "linear-gradient(135deg, rgba(15, 23, 42, 0.98), rgba(30, 41, 59, 0.96))",
              border:
                "1px solid rgba(148, 163, 184, 0.22)",
              borderRadius: "28px",
              boxShadow:
                "0 28px 90px rgba(2, 6, 23, 0.48)",
              display: "grid",
              gap: "28px",
              maxHeight: "calc(100vh - 48px)",
              maxWidth: "640px",
              overflow: "auto",
              padding: "36px",
              width: "100%"
            }}
          >
            <header
              style={{
                display: "grid",
                gap: "8px"
              }}
            >
              <p
                style={{
                  color: "#60a5fa",
                  fontSize: "13px",
                  fontWeight: 900,
                  letterSpacing: "0.08em",
                  margin: 0,
                  textTransform: "uppercase"
                }}
              >
                Informações
              </p>

              <h2
                style={{
                  color: "#ffffff",
                  fontSize: "28px",
                  letterSpacing: "-0.03em",
                  margin: 0
                }}
              >
                Duplicar evento
              </h2>

              <p
                style={{
                  color: "#94a3b8",
                  lineHeight: 1.6,
                  margin: 0
                }}
              >
                Crie uma cópia administrativa do evento
                atual com novo título, slug e data.
              </p>
            </header>

            {duplicateError ? (
              <p
                style={{
                  background: "rgba(127, 29, 29, 0.32)",
                  border:
                    "1px solid rgba(248, 113, 113, 0.28)",
                  borderRadius: "14px",
                  color: "#fecaca",
                  margin: 0,
                  padding: "14px"
                }}
              >
                {duplicateError}
              </p>
            ) : null}

            <form
              onSubmit={handleDuplicateEvent}
              style={{
                display: "grid",
                gap: "18px"
              }}
            >
              <label
                style={{
                  color: "#e2e8f0",
                  display: "grid",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Título

                <input
                  onChange={(changeEvent) => {
                    const nextTitle =
                      changeEvent.target.value;

                    setDuplicateTitle(nextTitle);

                    if (!duplicateSlugTouched) {
                      setDuplicateSlug(
                        createSlug(nextTitle)
                      );
                    }
                  }}
                  required
                  style={{
                    background: "#0f172a",
                    border:
                      "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="text"
                  value={duplicateTitle}
                />
              </label>

              <label
                style={{
                  color: "#e2e8f0",
                  display: "grid",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Slug

                <input
                  onChange={(changeEvent) => {
                    setDuplicateSlugTouched(true);
                    setDuplicateSlug(
                      changeEvent.target.value
                    );
                  }}
                  required
                  style={{
                    background: "#0f172a",
                    border:
                      "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="text"
                  value={duplicateSlug}
                />
              </label>

              <label
                style={{
                  color: "#e2e8f0",
                  display: "grid",
                  fontWeight: 800,
                  gap: "8px"
                }}
              >
                Data e hora

                <input
                  onChange={(changeEvent) =>
                    setDuplicateDate(
                      changeEvent.target.value
                    )
                  }
                  required
                  style={{
                    background: "#0f172a",
                    border:
                      "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#ffffff",
                    font: "inherit",
                    padding: "13px 14px"
                  }}
                  type="datetime-local"
                  value={duplicateDate}
                />
              </label>

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "12px",
                  justifyContent: "flex-end",
                  marginTop: "8px"
                }}
              >
                <button
                  disabled={isDuplicatingEvent}
                  onClick={closeDuplicateEventModal}
                  style={{
                    background:
                      "rgba(15, 23, 42, 0.68)",
                    border:
                      "1px solid rgba(148, 163, 184, 0.3)",
                    borderRadius: "12px",
                    color: "#e2e8f0",
                    cursor: isDuplicatingEvent
                      ? "not-allowed"
                      : "pointer",
                    fontWeight: 900,
                    opacity: isDuplicatingEvent
                      ? 0.72
                      : 1,
                    padding: "12px 18px"
                  }}
                  type="button"
                >
                  Cancelar
                </button>

                <button
                  disabled={isDuplicatingEvent}
                  style={{
                    background: "#2563eb",
                    border: 0,
                    borderRadius: "12px",
                    color: "#ffffff",
                    cursor: isDuplicatingEvent
                      ? "not-allowed"
                      : "pointer",
                    fontWeight: 900,
                    opacity: isDuplicatingEvent
                      ? 0.72
                      : 1,
                    padding: "12px 18px"
                  }}
                  type="submit"
                >
                  {isDuplicatingEvent
                    ? "Duplicando..."
                    : "Duplicar evento"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}
