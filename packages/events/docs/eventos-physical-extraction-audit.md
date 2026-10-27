# Auditoria arquitetural — extração física de Eventos

Data: 2026-10-27.
Escopo: evidência objetiva do código atual. **Não separar** neste corte.

A extração prevista é de **produto** (aplicação, dashboard, navegação, identidade, configuração e deploy próprios), na forma mais simples compatível com o domínio. Não obriga microserviços, Kafka, Kubernetes, service mesh, novo banco ou nova cloud.

## Decisão deste corte

Eventos permanece standalone-ready **no monorepo atual**, com o mesmo PostgreSQL e o mesmo JWT. Nenhuma rota, pacote, deploy ou schema foi extraído.

## Backup e migration local (pré-requisito deste corte)

- Banco autorizado: `localhost` / `127.0.0.1:5433`, database `sistema_igrejas`. Produção não foi tocada.
- Dump recuperável **antes** da migration: `.cursor/tmp/backups/sistema_igrejas-5433-20261027-144054.dump` (custom `-Fc`, 217408 bytes, 44 TABLE DATA). Fora do Git.
- Restore local: copiar o dump para o container `sistema_igrejas_postgres` e `pg_restore --clean --if-exists` no database `sistema_igrejas`. Depois reaplicar pendências, se houver.
- `prisma migrate deploy` aplicou só `20261027180000_event_public_description_location` nesse banco. `_prisma_migrations` registra a linha; `Event.description` e `Event.location` existem com CHECKs de comprimento.

## Inventário de fronteira

| Peça | Papel atual | Extraível agora? |
| --- | --- | --- |
| `packages/events` | Domínio Eventos (rotas, checkout, ingressos, form, financeiro do evento, API Keys, integrações do produto) | Domínio sim; ainda acoplado a Prisma compartilhado, JWT/`requireRole` e `ensureCampusBelongsToChurch` |
| `apps/events-admin` | Admin Web do produto (porta 3001) | UI sim; **runtime aponta para `api-br :3333`**, não para `events-api :3002` |
| `apps/events-api` | Processo :3002 com Eventos + auth JWT + **Financeiro geral da igreja** + Asaas | Não é processo puro de Eventos |
| `apps/api-br` | Monólito da igreja: Eventos + membros + trilhos + voluntários + ministérios + financeiro + assistente | Hospeda o Admin de Eventos hoje |
| `apps/web-br` | Handoff iframe para `NEXT_PUBLIC_EVENTS_APP_URL` (default `:3001`) | Já não duplica o produto |
| `apps/events-participant` | PWA; default `EVENTS_API_BASE_URL` `:3002` | Fora da sequência até depois da extração |
| `apps/events-organizer` | App do organizador; default `:3002` em development | Fora da sequência |
| `packages/database` | Schema Prisma único (Church, Campus, Person, Visitor, UserAccount, Transaction, Event*) | Core comum; não duplicar agora |
| `packages/auth` | JWT / RBAC | Core comum a preservar |
| `packages/financial` | Transaction oficial + adapter Asaas + `authorizeFinancialRoute` | Eventos consome; Asaas não é domínio |

`packages/events/package.json` declara prisma, fastify, qrcode, resend, sharp e zod. **Não** declara `@sistema-igrejas/auth` nem `@sistema-igrejas/database`, embora o código importe os dois via workspace. **Não** importa `@sistema-igrejas/financial`.

## Dependências reais

### Prisma compartilhado (bloqueio de banco próprio, não de produto)

Entidades Eventos no schema único: `Event`, `EventCoverImage`, `EventApp*`, `EventTicket`/`TicketBatch`, `EventForm*`, `EventApiKey`, `EventIntegration`, `EventOrder`, `EventDiscount`, `EventPayment`, `EventCheckout*`, `EventsReceivingAccount*`, `EventsFinancialOperation*`, `Registration`.

Acoplamentos **fora** do bounded context Eventos:

- `Event.churchId` → `Church`; `Event.campusId` → `Campus`; `Event.trailStageId` → `TrailStage` (CRM/trilhos).
- `Registration.personId` / `visitorId` → `Person` / `Visitor` (`onDelete: Cascade`).
- `EventPayment` → uma `Transaction` oficial (`type=EVENT`). `Transaction` também serve o Financeiro geral da igreja.
- `Church.platformFeePercent` (override contratual) mora em Church, não em tabela de Eventos.
- `EventsReceivingAccount` é global do produto Eventos por `churchId`, não por evento.

Separar banco agora duplicaria Church/User/Transaction ou quebraria FKs. A extração de produto **pode** manter o banco compartilhado.

### Autenticação

O mesmo JWT (`packages/auth`) autentica `api-br` e `events-api`. `packages/events` usa `requireRole` / `createAuthPreHandler`. Extração de produto deve **reutilizar** esse core, não inventar Firebase nem segunda sessão.

### Composição dos servidores

- `apps/api-br/src/app.ts` registra Eventos **e** membros, trilhos, voluntários, ministérios, financeiro da igreja, Asaas e assistente.
- `apps/events-api/src/app.ts` registra Eventos, checkout v2, participant app público, `registerAuthRoutes`, `registerFinancialRoutes` (Financeiro geral), rotas Asaas e `authorizeFinancialRoute` em `/financial/` e `/events/financial/`.
- `events-api` **não** monta membros/trilhos/assistente. Ainda monta o Financeiro geral da igreja.

### Frontend

O Admin (`events-admin`) usa `NEXT_PUBLIC_API_BASE_URL` com default `http://localhost:3333` (`api-br`). Extração de processo falha se o Admin continuar falando com o monólito da igreja.

`web-br` `/dashboard/eventos` já é handoff, não uma segunda implementação.

## Isolamento multi-tenant

Controles observados no domínio Eventos:

- `Event.churchId` indexado; `@@unique([churchId, slug])`.
- Operações administrativas leem `churchId` do JWT, não do body do cliente.
- `campusId` e `trailStageId` são revalidados no tenant (`ensureCampusBelongsToChurch`; `trailStage` com `churchId` e `trail.churchId`).
- `personId` / `visitorId` na inscrição manual são buscados com `churchId` antes do write.
- `Registration` tem `@@unique([churchId, eventId, id])`.
- Capa pública: `publicEventCoverWhere` exige `isPublic: true` e `deletedAt: null`.
- API Keys e Integrações são scoped por `churchId`.
- Conta de recebimento e Gestão Financeira usam `churchId` do token; rotas `/events/financial` passam por `authorizeFinancialRoute`.

Riscos se a extração relaxar esses controles (reprovar):

- apontar o Admin para `events-api` sem o mesmo JWT/`churchId`;
- copiar Person/Visitor sem filtro de tenant;
- expor `Transaction` de outro `churchId`;
- rota pública enumerando eventos não publicados;
- CORS `origin: true` em `events-api` (já é gap pré-produção, independente da extração).

Isolamento atual **não** depende do Financeiro geral da igreja para operar Eventos. Depende do registro `Transaction` compartilhado e do JWT.

## Futura IA

Evidência no código:

- Não existe `packages/ai`. Não há dependência OpenAI/Anthropic/LLM no produto Eventos.
- O assistente vive em `apps/api-br/src/assistant/assistant.service.ts`. É **rule-based**: classifica tópico e consulta Prisma (`person`, `visitor`, `event`, voluntários). `safety.canExecuteBusinessRules` e `canAccessExternalSystemsDirectly` são `false`.
- `getEvents` filtra `churchId` + `deletedAt: null`, mas **não** lê `description`/`location` (stale após a migration local).
- Observabilidade: stack **não escolhida**. Não implementar OpenTelemetry/Sentry/Grafana/etc. neste corte.

Avaliação:

- A IA geral da igreja permanece independente do produto Eventos (decisão 2026-10-12).
- Extração física **não** deve esperar IA.
- IA de Eventos **não** deve ser implementada antes da extração.
- Depois da extração, o assistente da igreja não pode continuar sendo dono de `prisma.event` se Eventos for processo/produto separado: passar a consumir contrato/API de Eventos, com o mesmo `churchId`.
- Qualquer LLM, worker de IA ou stack de observabilidade exige autorização explícita do usuário **depois** da escolha da tecnologia e da atualização das regras.

## O que as regras já dispensam para extrair

Não exigir: App do Participante, App do Organizador, pente-fino visual final, espaçamento reservado, taxa contratual na UI, split/subconta.

Mínimo de fluxos estáveis (ainda com gaps): Dashboard Geral, criação/gestão, Ingressos, Descontos, Formulário, Participantes, Check-in, Financeiro do Evento, Gestão Financeira, conta de recebimento, página pública/checkout, Preview, API Keys, Integrações essenciais.

## Bloqueios reais para extração física agora

Não extraído. Bloqueios objetivos:

1. **Admin fala com `api-br :3333`.** Trocar o processo sem retarget do frontend deixa o produto Eventos no monólito da igreja.
2. **`events-api` ainda monta o Financeiro geral** (`registerFinancialRoutes`, Asaas geral). Extrair o binário atual levaria o Financeiro da igreja junto.
3. **Schema Prisma único** com FKs para Person, Visitor, Campus, TrailStage, Church e Transaction. Primeira extração deve manter o banco; split de schema é corte posterior.
4. **Integrações essenciais PARTIAL** (RD/OAuth, CAPI, sync, envio). Gap de Admin, não de domínio.
5. **Checkout pago homologado incompleto:** gate `CLOSED`, hostname/VPS/webhook Asaas HTTPS não publicados, Resend incompleto. Extração de produto não resolve cobrança.
6. **FORMULARIO-1** (pergunta de arquivo) continua `MISSING`.
7. **CORS aberto e ausência de rate limit** nas rotas públicas: bloqueio pré-produção, independente da extração.
8. **Dependências workspace não declaradas** em `packages/events` (`auth`, `database`): extração de pacote quebraria o resolve se o monorepo deixar de hoistar.

Não são bloqueios de extração: apps, pente-fino, IA, observabilidade.

## Caminho mais simples quando o usuário autorizar (não executar agora)

1. Manter monorepo **ou** extrair apps/packages de Eventos **sem** novo banco.
2. Preservar JWT/`packages/auth`, `churchId`, Transaction única, Asaas só como adapter.
3. Desmontar `registerFinancialRoutes` (Financeiro geral) de `events-api`; manter só financeiro de Eventos + webhook da cobrança de evento.
4. Apontar `events-admin` para o processo Eventos, não para `api-br`.
5. Manter `web-br` como handoff.
6. Deixar o assistente em `api-br` até haver contrato HTTP de Eventos; não criar pacote de IA.
7. Auditar Person/Visitor na inscrição: snapshot no Registration vs FK viva — decidir no corte de extração, sem duplicar identidade agora.
8. Não reduzir RBAC, IDOR, PII, auditoria nem proteção de secrets.

## Veredito

| Pergunta | Resposta |
| --- | --- |
| O domínio Eventos já tem fronteira de pacote? | Sim (`packages/events`). |
| O produto já tem Admin e API próprios? | Admin sim; API `events-api` existe mas não é o runtime do Admin e ainda carrega Financeiro geral. |
| Pode separar repositório/banco/JWT neste corte? | Não. |
| Isolamento multi-tenant no domínio atual é suficiente para extrair produto sem novo banco? | Sim, se JWT/`churchId`/FKs forem preservados. |
| A futura IA bloqueia a extração? | Não. |
| Extraído neste corte? | Não. |
