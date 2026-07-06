import type { PrismaClient } from "@prisma/client";

type AssistantRole = "SUPER_ADMIN" | "PASTOR" | "LEADER" | "VOLUNTEER" | "MEMBER";
import type { AssistantMessageInput } from "./assistant.schema.js";

type AssistantContext = {
  membersCount: number;
  visitorsCount: number;
  cellsCount: number;
  eventsCount: number;
  volunteersCount: number;
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
    id: string;
    status: string;
    paymentStatus: string;
    checkedInAt: Date | null;
  }[];
};

const WEB_BASE_URL = process.env.WEB_BASE_URL ?? "http://localhost:3000";

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

function getEventPublicLink(eventId: string) {
  return `/eventos/`;
}

function canViewFinancialSummary(role: AssistantRole) {
  return role === "SUPER_ADMIN" || role === "PASTOR";
}

async function getFinancialSummary(prisma: PrismaClient, churchId: string) {
  const [income, expenses, totalTransactions] = await Promise.all([
    prisma.transaction.aggregate({
      _sum: {
        amount: true
      },
      where: {
        churchId,
        direction: "IN"
      }
    }),
    prisma.transaction.aggregate({
      _sum: {
        amount: true
      },
      where: {
        churchId,
        direction: "OUT"
      }
    }),
    prisma.transaction.count({
      where: {
        churchId
      }
    })
  ]);

  const incomeTotal = Number(income._sum.amount ?? 0);
  const expenseTotal = Number(expenses._sum.amount ?? 0);

  return {
    balance: incomeTotal - expenseTotal,
    expenseTotal,
    incomeTotal,
    totalTransactions
  };
}

async function getAssistantContext(
  prisma: PrismaClient,
  churchId: string
): Promise<AssistantContext> {
  const [membersCount, visitorsCount, cellsCount, eventsCount, volunteersCount] =
    await Promise.all([
      prisma.person.count({
        where: {
          churchId,
          role: "MEMBER"
        }
      }),
      prisma.visitor.count({
        where: {
          churchId
        }
      }),
      prisma.celula.count({
        where: {
          churchId
        }
      }),
      prisma.event.count({
        where: {
          churchId
        }
      }),
      prisma.person.count({
        where: {
          churchId,
          role: "VOLUNTEER"
        }
      })
    ]);

  return {
    membersCount,
    visitorsCount,
    cellsCount,
    eventsCount,
    volunteersCount
  };
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
        select: {
          id: true
        }
      }
    },
    where: {
      churchId
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
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          checkedInAt: true
        }
      }
    },
    where: {
      churchId
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
      const checkedInCount = event.registrations.filter((registration) => registration.checkedInAt).length;
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
        `  Capacidade: ${event.capacity}. Inscritos: ${registrationsCount}. Check-ins: ${checkedInCount}.`,
        `  Link público: ${getEventPublicLink(event.id)}`
      ].join("\n");
    })
    .join("\n\n");
}

async function buildLocalAssistantAnswer(
  prisma: PrismaClient,
  churchId: string,
  userRole: AssistantRole,
  input: AssistantMessageInput,
  context: AssistantContext
) {
  const message = normalizeMessage(input.message);

  if (hasAny(message, ["membro", "membros"])) {
    return [
      `Hoje existem ${context.membersCount} membro(s) cadastrados no sistema.`,
      "Esse número considera pessoas com papel MEMBER na igreja atual."
    ].join("\n");
  }

  if (hasAny(message, ["visitante", "visitantes"])) {
    return [
      `Hoje existem ${context.visitorsCount} visitante(s) cadastrados.`,
      "Esse total vem do cadastro real de visitantes da igreja atual."
    ].join("\n");
  }

  if (hasAny(message, ["celula", "celulas", "célula", "células", "bairro", "regiao", "região", "perfil"])) {
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

  if (hasAny(message, ["evento", "eventos", "inscricao", "inscrição", "check-in", "checkin", "link", "pagina", "página"])) {
    const events = await getEvents(prisma, churchId);

    return buildEventAnswer(events, message);
  }

  if (hasAny(message, ["voluntario", "voluntarios", "voluntário", "voluntários"])) {
    return [
      `Hoje existem ${context.volunteersCount} voluntário(s) cadastrados.`,
      "Esse número considera pessoas com papel VOLUNTEER na igreja atual."
    ].join("\n");
  }

  if (hasAny(message, ["financeiro", "dizimo", "dízimo", "oferta", "entrada", "saida", "saída", "valor", "valores"])) {
    return [
      "O módulo financeiro envolve valores e precisa respeitar permissão de acesso.",
      "Neste corte, eu ainda não vou exibir relatório financeiro pelo assistente.",
      "O caminho correto é liberar esse tipo de resposta apenas para usuários com permissão financeira."
    ].join("\n");
  }

  return [
    "Posso consultar dados reais do sistema e responder sobre membros, visitantes, células, eventos, trilho e voluntários.",
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
  const context = await getAssistantContext(prisma, churchId);

  return {
    answer: await buildLocalAssistantAnswer(prisma, churchId, userRole, input, context),
    context,
    safety: {
      canExecuteBusinessRules: false,
      canAccessExternalSystemsDirectly: false
    }
  };
}
