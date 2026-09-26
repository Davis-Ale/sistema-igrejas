import type { PrismaClient } from "@prisma/client";
import type { FastifyRequest } from "fastify";
import { ensureCanAccessFinancial } from "@sistema-igrejas/financial";

type AssistantRole = "SUPER_ADMIN" | "PASTOR" | "LEADER" | "VOLUNTEER" | "MEMBER";
import type { AssistantMessageInput } from "./assistant.schema.js";

type AssistantContext = {
  membersCount?: number;
  visitorsCount?: number;
  volunteersCount?: number;
};

type CellSummary = {
  id: string;
  name: string;
  region: string;
  meetDay: string;
  meetTime: string;
  profile: string;
  leader: {
    name: string;
  };
  people: {
    id: string;
  }[];
};

type EventSummary = {
  id: string;
  title: string;
  slug: string;
  date: Date;
  capacity: number;
  price: unknown;
  isPublic: boolean;
  isPaid: boolean;
  publicRegistrationEnabled: boolean;
  registrations: {
    status: string;
    waitlistedAt: Date | null;
  }[];
};

function normalizeMessage(message: string) {
  return message
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function hasAny(message: string, terms: string[]) {
  return terms.some((term) => message.includes(term));
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  }).format(date);
}

function formatCurrency(value: unknown) {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return "valor não informado";
  }

  return new Intl.NumberFormat("pt-BR", {
    currency: "BRL",
    style: "currency"
  }).format(amount);
}

function getEventPublicLink(event: EventSummary) {
  if (!event.isPublic) return "indisponível (evento interno)";
  // Same Events frontend used by the dashboard redirect; /eventos/[eventId] is the public registration page.
  const base = (process.env.NEXT_PUBLIC_EVENTS_APP_URL ?? "http://localhost:3001").replace(/\/$/, "");
  return `${base}/eventos/${encodeURIComponent(event.id)}`;
}

type AssistantTopic = "members" | "visitors" | "cells" | "events" | "volunteers" | "financial" | "help";

function getTopic(message: string): AssistantTopic {
  // Finance takes precedence over other topics in mixed questions.
  if (hasAny(message, ["financeiro", "dizimo", "oferta", "entrada", "saida", "valor", "saldo", "receita", "despesa", "arrecad", "transac", "pagamento"])) return "financial";
  if (hasAny(message, ["membro"])) return "members";
  if (hasAny(message, ["visitante"])) return "visitors";
  if (hasAny(message, ["celula", "bairro", "regiao", "perfil"])) return "cells";
  if (hasAny(message, ["evento", "inscricao", "check-in", "checkin", "link", "pagina"])) return "events";
  if (hasAny(message, ["voluntario"])) return "volunteers";
  return "help";
}

function authorizeTopic(role: AssistantRole, topic: AssistantTopic) {
  if (topic === "financial") {
    // The shared financial guard only reads the authenticated role.
    ensureCanAccessFinancial({ user: { role } } as FastifyRequest);
  } else if (topic !== "help" && !["SUPER_ADMIN", "PASTOR", "LEADER"].includes(role)) {
    throw new Error("ASSISTANT_ACCESS_DENIED");
  }
}

async function getCells(prisma: PrismaClient, churchId: string) {
  return prisma.celula.findMany({
    orderBy: [
      {
        region: "asc"
      },
      {
        name: "asc"
      }
    ],
    select: {
      id: true,
      name: true,
      region: true,
      meetDay: true,
      meetTime: true,
      profile: true,
      leader: {
        select: {
          name: true
        }
      },
      people: {
        where: { churchId },
        select: {
          id: true
        }
      }
    },
    where: {
      churchId,
      leader: { is: { churchId } }
    }
  });
}

async function getEvents(prisma: PrismaClient, churchId: string) {
  return prisma.event.findMany({
    orderBy: {
      date: "asc"
    },
    select: {
      id: true,
      title: true,
      slug: true,
      date: true,
      capacity: true,
      price: true,
      isPublic: true,
      isPaid: true,
      publicRegistrationEnabled: true,
      registrations: {
        where: { churchId, status: { not: "CANCELLED" } },
        select: {
          status: true,
          waitlistedAt: true
        }
      }
    },
    where: {
      churchId,
      deletedAt: null
    }
  });
}

function groupCellsByRegion(cells: CellSummary[]) {
  const grouped = new Map<string, CellSummary[]>();

  for (const cell of cells) {
    const region = cell.region || "Sem região informada";
    const currentCells = grouped.get(region) ?? [];

    currentCells.push(cell);
    grouped.set(region, currentCells);
  }

  return Array.from(grouped.entries())
    .map(([region, regionCells]) => `- ${region}: ${regionCells.length} célula(s)`)
    .join("\n");
}

function groupCellsByProfile(cells: CellSummary[]) {
  const grouped = new Map<string, CellSummary[]>();

  for (const cell of cells) {
    const profile = cell.profile || "Sem perfil informado";
    const currentCells = grouped.get(profile) ?? [];

    currentCells.push(cell);
    grouped.set(profile, currentCells);
  }

  return Array.from(grouped.entries())
    .map(([profile, profileCells]) => `- ${profile}: ${profileCells.length} célula(s)`)
    .join("\n");
}

function findCellsMentionedInMessage(message: string, cells: CellSummary[]) {
  return cells.filter((cell) => {
    const region = normalizeMessage(cell.region);
    const profile = normalizeMessage(cell.profile);
    const name = normalizeMessage(cell.name);

    return (
      Boolean(region && message.includes(region)) ||
      Boolean(profile && message.includes(profile)) ||
      Boolean(name && message.includes(name))
    );
  });
}

function buildCellList(cells: CellSummary[]) {
  return cells
    .slice(0, 8)
    .map((cell) => {
      const profile = cell.profile ? `Perfil: ${cell.profile}. ` : "";
      const meetTime = cell.meetTime ? ` às ${cell.meetTime}` : "";

      return `- ${cell.name}: ${cell.region}. ${profile}Encontro: ${cell.meetDay}${meetTime}. Líder: ${cell.leader.name}. Pessoas vinculadas: ${cell.people.length}.`;
    })
    .join("\n");
}

function findEventsMentionedInMessage(message: string, events: EventSummary[]) {
  return events.filter((event) => {
    const title = normalizeMessage(event.title);
    const slug = normalizeMessage(event.slug);

    return (
      Boolean(title && message.includes(title)) ||
      Boolean(slug && message.includes(slug))
    );
  });
}

function buildEventAnswer(events: EventSummary[], message: string) {
  const selectedEvents = findEventsMentionedInMessage(message, events);
  const eventsToShow = selectedEvents.length > 0 ? selectedEvents : events.slice(0, 5);

  if (events.length === 0) {
    return "Ainda não existe nenhum evento cadastrado.";
  }

  if (hasAny(message, ["descricao", "descrição"])) {
    return [
      "Hoje o cadastro de eventos ainda não possui um campo de descrição no banco.",
      "Consigo consultar os dados disponíveis do evento: título, data, capacidade, valor, status público, inscrições e link público.",
      "",
      buildEventList(eventsToShow)
    ].join("\n");
  }

  if (hasAny(message, ["link", "pagina", "página", "inscricao", "inscrição"])) {
    return [
      selectedEvents.length > 0
        ? "Encontrei o evento solicitado:"
        : "Não identifiquei um nome exato de evento na pergunta. Estes são os eventos disponíveis:",
      "",
      buildEventList(eventsToShow)
    ].join("\n");
  }

  return [
    `Hoje existem ${events.length} evento(s) cadastrado(s).`,
    "",
    buildEventList(eventsToShow)
  ].join("\n");
}

function buildEventList(events: EventSummary[]) {
  return events
    .map((event) => {
      const registrationsCount = event.registrations.length;
      const checkedInCount = event.registrations.filter((registration) => registration.status === "CHECKED_IN").length;
      const confirmedCount = event.registrations.filter((registration) => registration.status === "CONFIRMED" && !registration.waitlistedAt).length;
      const waitingCount = event.registrations.filter((registration) => registration.waitlistedAt && registration.status !== "CHECKED_IN").length;
      const pendingCount = event.registrations.filter((registration) => registration.status === "PENDING" && !registration.waitlistedAt).length;
      const publicStatus = event.isPublic ? "público" : "interno";
      const registrationStatus = event.publicRegistrationEnabled
        ? "inscrição pública habilitada"
        : "inscrição pública desabilitada";
      const paymentStatus = event.isPaid
        ? `pago (${formatCurrency(event.price)})`
        : "gratuito";

      return [
        `- ${event.title}`,
        `  Data: ${formatDate(event.date)}.`,
        `  Evento ${publicStatus}, ${paymentStatus}, ${registrationStatus}.`,
        `  Capacidade: ${event.capacity}. Inscritos ativos: ${registrationsCount}. Confirmados: ${confirmedCount}. Pendentes: ${pendingCount}. Lista de espera: ${waitingCount}. Check-ins: ${checkedInCount}.`,
        `  Link público: ${getEventPublicLink(event)}`
      ].join("\n");
    })
    .join("\n\n");
}

async function buildLocalAssistantAnswer(
  prisma: PrismaClient,
  churchId: string,
  topic: AssistantTopic,
  input: AssistantMessageInput,
  context: AssistantContext
) {
  const message = normalizeMessage(input.message);

  if (topic === "members") {
    return [
      `Hoje existem ${context.membersCount} membro(s) cadastrados no sistema.`,
      "Esse número considera pessoas com papel MEMBER na igreja atual."
    ].join("\n");
  }

  if (topic === "visitors") {
    return [
      `Hoje existem ${context.visitorsCount} visitante(s) cadastrados.`,
      "Esse total vem do cadastro real de visitantes da igreja atual."
    ].join("\n");
  }

  if (topic === "cells") {
    const cells = await getCells(prisma, churchId);
    const matchedCells = findCellsMentionedInMessage(message, cells);

    if (cells.length === 0) {
      return "Ainda não existe nenhuma célula cadastrada.";
    }


    if (hasAny(message, ["bairro", "regiao", "região"])) {
      if (matchedCells.length > 0) {
        return [
          `Encontrei ${matchedCells.length} célula(s) relacionada(s) ao bairro/região informado:`,
          "",
          buildCellList(matchedCells)
        ].join("\n");
      }

      return [
        `Hoje existem ${cells.length} célula(s) cadastrada(s).`,
        "",
        "Distribuição por região/bairro:",
        groupCellsByRegion(cells)
      ].join("\n");
    }

    if (hasAny(message, ["perfil", "mulher", "mulheres", "homem", "homens", "adolescente", "adolescentes", "familia", "família", "senior", "sênior", "idoso", "idosos", "melhor idade"])) {
      if (matchedCells.length > 0) {
        return [
          `Encontrei ${matchedCells.length} célula(s) relacionada(s) ao perfil informado:`,
          "",
          buildCellList(matchedCells)
        ].join("\n");
      }

      return [
        `Hoje existem ${cells.length} célula(s) cadastrada(s).`,
        "",
        "Distribuição por perfil:",
        groupCellsByProfile(cells)
      ].join("\n");
    }

    return [
      `Hoje existem ${cells.length} célula(s) cadastrada(s).`,
      "",
      "Por região/bairro:",
      groupCellsByRegion(cells),
      "",
      "Por perfil:",
      groupCellsByProfile(cells)
    ].join("\n");
  }

  if (topic === "events") {
    const events = await getEvents(prisma, churchId);

    return buildEventAnswer(events, message);
  }

  if (topic === "volunteers") {
    return [
      `Hoje existem ${context.volunteersCount} voluntário(s) cadastrados.`,
      "Esse número considera pessoas com papel VOLUNTEER na igreja atual."
    ].join("\n");
  }

  if (topic === "financial") {
    return [
      "O módulo financeiro envolve valores e precisa respeitar permissão de acesso.",
      "Neste corte, eu ainda não vou exibir relatório financeiro pelo assistente.",
      "O caminho correto é liberar esse tipo de resposta apenas para usuários com permissão financeira."
    ].join("\n");
  }

  return [
    "Posso consultar dados reais do sistema e responder sobre membros, visitantes, células, eventos e voluntários, conforme sua permissão.",
    "Também posso orientar sobre financeiro, mas relatórios com valores precisam de controle de permissão antes de serem exibidos aqui.",
    "Eu não altero banco, não cadastro nada sozinho e não executo ações administrativas."
  ].join("\n");
}

export async function answerAssistantMessage(
  prisma: PrismaClient,
  churchId: string,
  userRole: AssistantRole,
  input: AssistantMessageInput
) {
  if (!churchId) throw new Error("CHURCH_CONTEXT_REQUIRED");
  const topic = getTopic(normalizeMessage(input.message));
  authorizeTopic(userRole, topic);
  const context: AssistantContext = {};
  if (topic === "members") context.membersCount = await prisma.person.count({ where: { churchId, role: "MEMBER" } });
  if (topic === "visitors") context.visitorsCount = await prisma.visitor.count({ where: { churchId } });
  if (topic === "volunteers") context.volunteersCount = await prisma.person.count({ where: { churchId, role: "VOLUNTEER" } });

  return {
    answer: await buildLocalAssistantAnswer(prisma, churchId, topic, input, context),
    context,
    safety: {
      canExecuteBusinessRules: false,
      canAccessExternalSystemsDirectly: false
    }
  };
}
