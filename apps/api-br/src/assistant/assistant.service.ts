import type { PrismaClient } from "@prisma/client";
import type { AssistantMessageInput } from "./assistant.schema.js";

type AssistantContext = {
  membersCount: number;
  visitorsCount: number;
  cellsCount: number;
  eventsCount: number;
  volunteersCount: number;
};

function normalizeMessage(message: string) {
  return message.trim().toLowerCase();
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

function buildLocalAssistantAnswer(
  input: AssistantMessageInput,
  context: AssistantContext
) {
  const message = normalizeMessage(input.message);

  if (message.includes("membro") || message.includes("membros")) {
    return `Hoje existem ${context.membersCount} membros cadastrados. Para cadastrar ou buscar membros, use o menu Membros.`;
  }

  if (message.includes("visitante") || message.includes("visitantes")) {
    return `Hoje existem ${context.visitorsCount} visitantes cadastrados. Para acompanhar novos contatos, use o menu Visitantes.`;
  }

  if (message.includes("célula") || message.includes("celula") || message.includes("células") || message.includes("celulas")) {
    return `Hoje existem ${context.cellsCount} células cadastradas. Para buscar por bairro/região ou vincular membros, use o menu Células.`;
  }

  if (message.includes("evento") || message.includes("eventos")) {
    return `Hoje existem ${context.eventsCount} eventos cadastrados. Para inscrições, check-in e página pública, use o menu Eventos.`;
  }

  if (message.includes("voluntário") || message.includes("voluntario") || message.includes("voluntários") || message.includes("voluntarios")) {
    return `Hoje existem ${context.volunteersCount} voluntários cadastrados. Para atualizar status e acompanhar formação, use o menu Voluntários.`;
  }

  if (message.includes("financeiro") || message.includes("dízimo") || message.includes("dizimo") || message.includes("oferta")) {
    return "O financeiro já está conectado à API. Use o menu Financeiro para lançar entradas, saídas, métodos de pagamento e acompanhar o resumo.";
  }

  return "Posso ajudar com membros, visitantes, células, eventos, trilho, voluntários e financeiro. Não executo alterações sozinho; apenas oriento com base nos dados do sistema.";
}

export async function answerAssistantMessage(
  prisma: PrismaClient,
  churchId: string,
  input: AssistantMessageInput
) {
  const context = await getAssistantContext(prisma, churchId);

  return {
    answer: buildLocalAssistantAnswer(input, context),
    context,
    safety: {
      canExecuteBusinessRules: false,
      canAccessExternalSystemsDirectly: false
    }
  };
}
