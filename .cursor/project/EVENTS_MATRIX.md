# EVENTS ADMIN - MATRIZ OPERACIONAL

## Extração física — auditoria 2026-10-27

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| App do Organizador — operação de recepção (item 7) | `IMPLEMENTED` | `apps/events-organizer`: eventos, QR, check-in, localizar participante, consultar inscrição e bloqueios. Sem Participante/Sympla. Sem offline/portarias. |
| App do Participante — Home/Cronograma/Credencial/Mapa/Perfil (item 6) | `IMPLEMENTED` | `apps/events-participant` contra prints de `app-participantes` e Arquitetura Viva v5. Identidade igreja/evento. Sem Sympla/ADR. Admin/checkout intactos. |
| Admin chrome — marca ADR Solutions (item 5) | `IMPLEMENTED` | Wordmark ADR Solutions em layout/home/login/shell de events-admin; descrição Plataforma de Eventos; item 9 visual standalone NÃO feito; dual-access, nav da suíte e chave de sessão intactos. |
| Backup local recuperável + migration `20261027180000` | `IMPLEMENTED` | Dump `-Fc` de `127.0.0.1:5433/sistema_igrejas` antes do deploy; colunas `description`/`location` + CHECKs no banco local. Produção não tocada. Dump fora do Git. |
| Auditoria de dependências / tenant / IA | `IMPLEMENTED` | `packages/events/docs/eventos-physical-extraction-audit.md`. Extração **não** executada. |
| Item 4 — uma implementação, dois acessos (SI + SaaS) | `IMPLEMENTED` | Contrato `product-access.ts`: handoff `web-br` e login `events-admin` no mesmo app. Sem segundo Eventos. |
| Item 4 — `events-api` sem Financeiro geral + Admin na API própria | `IMPLEMENTED` | `events-api` sem `registerFinancialRoutes`/`registerAsaasRoutes`. `events-admin` default `:3002`. Workspace Financeiro em `/api/events/financial/*`. JWT/`churchId`/checkout preservados. |
| Dev local pós-item 4 (`pnpm dev`) | `IMPLEMENTED` | Raiz sobe `api-br`, `web-br`, `events-api` e `events-admin`. Não sobe `events-participant`. |
| Separação física (repo/banco/JWT/deploy) | `MISSING` | Prisma/JWT ainda compartilhados. Extração futura deve preservar os dois acessos. |
| Futura IA de Eventos | `USER_DEFERRED` | Sem `packages/ai` e sem LLM. Assistente rule-based em `api-br`. Não implementar antes da extração. |

## Checkout v2 — HTTPS permanente da API (2026-10-27)

- Webhook Asaas: `PARTIAL`. Stack de nuvem `docker-compose.cloud.yml` (Caddy + APIs + PostgreSQL + Redis) preparado; compose padrão só PostgreSQL. Cloudflare Tunnel/trycloudflare/Railway recusados. Sem hostname/VPS autorizados, sem publicação, sem apply no Asaas.
- Integrações: hub mostra chave de cifra ausente em Mailchimp/WhatsApp. ERROR continua editável. RD/OAuth, CAPI, sync, envio e espaçamento reservado intactos.

## Checkout v2 — homologação Asaas/Resend (2026-10-20)

- Providers de homologação: `PARTIAL`. Inspect read-only e avaliador de bloqueios existem. Conta Asaas sandbox APPROVED só no `api-br`. Sem webhook habilitado, sem Resend, sem URL/remetente públicos. Runtime v2 inativo.
- Evidência: `packages/events/docs/checkout-v2-provider-homologation.md`.

## Checkout v2 — preparação operacional Redis/segurança (2026-10-20)

- Store/config operacional: `PARTIAL`. Parser comum, fingerprint idêntico nas duas APIs, overlay Redis 7 loopback 55439, init explícito do gate, inspect sem segredos. Runtime ativo continua legado; builders não importam o módulo.
- Ainda pendente para homologação/ativação: preencher env idêntico nas duas APIs, subir o overlay, init `LEGACY`, origens/limites/secret reais, Asaas/Resend, backup do principal, contenção/troca do legado. Evidência: `packages/events/docs/checkout-v2-security-operational.md`.

## Checkout v2 — corte 5 isolado (2026-10-19)

- Validação integrada preparada: `PARTIAL` quanto a runtime/produção. 39/39 PostgreSQL 17 descartável + 173/173 isolados; 31 migrations/replay só no descartável. Três corridas de webhook comprovadas/corrigidas, segurança real das duas composições preparadas, recuperação e falhas de e-mail com providers simulados.
- Nenhuma rota ativa/builder/página conectada ao v2, banco principal preservado. Gate operacional inclui ocorrência isolada de DELIVERY_UNCERTAIN sem causa identificada, Redis real/configurações, logs/SDK/ingress, origem Next, política humana e homologação externa. Evidência: packages/events/docs/checkout-v2-integrated-validation.md.

## Checkout v2 — corte 4 preparado (2026-10-19)

- Segurança/contenção: `PARTIAL`. CORS, headers, redaction e quotas/gate compartilhados implementados em composição preparada para as duas APIs; fechamento omite handlers legados e cobre seis aliases. 16 testes novos e regressão isolada 173/173; Fastify/CORS/logger reais e composição com os dois bundles v2 preparados, store simulado.
- Runtime ativo continua legado; não conectado v2 ou hardening preparado. Origem Next/scripts, store real autorizado/configurado/homologado, domínios/limites/proxy/secret, contenção/drenagem de todas as instâncias e homologação externa permanecem pendentes. Nenhum serviço ou migration aplicado, sem mudança visual de produto.
- Evidência/limites/runbook: packages/events/docs/checkout-v2-security-preparation.md. Não classificar checkout ativo como corrigido por esta preparação.

## Regra principal
Antes de qualquer novo corte de Eventos, comparar código real, regras privadas, esta matriz e **todos** os prints relevantes de `.cursor/benchmarks/events-admin/`.

Esses prints são **BASELINE FUNCIONAL OBRIGATÓRIO**, não mera referência. Fonte: `.cursor/rules/events-admin-benchmark.mdc`.

Nenhuma capacidade relevante do baseline pode desaparecer por omissão.

Classificar somente como:
`IMPLEMENTED` | `PARTIAL` | `MISSING` | `USER_DEFERRED` | `DOMAIN_BLOCKED`

É proibido o uso livre de `NOT_APPLICABLE` para capacidade presente nos benchmarks oficiais.
O Agent não pode decidir sozinho que algo do print "não se aplica".
Fora do baseline somente com decisão explícita do usuário (`USER_DEFERRED` ou `DOMAIN_BLOCKED`).
Em dúvida: parar e perguntar.

Rótulos históricos `NOT_APPLICABLE` nesta matriz ficam congelados até o pente-fino final. Não criar novos. No pente-fino, cada um deve ser reclassificado pelo usuário.

## Arquitetura de produto — Eventos standalone-ready (atualizado 2026-09-10)

Decisão explícita do usuário. Somente governança no corte de extração; sem código de produção neste passo.

- Eventos é produto com fronteira própria (**standalone-ready**), ainda na **mesma base neste momento** (monorepo, banco, autenticação JWT). Sem separação física **agora**.
- Não depender do Financeiro geral da igreja para operar Eventos.
- **Regra 2026-09-10:** extração física **logo após** os fluxos principais e contratos estáveis, **antes** do App do Participante, do App do Organizador e do pente-fino final completo. Não empurrar para o fim de todo o produto.

**Fluxos principais estáveis (mínimo para extrair):** Dashboard Geral; criação/gestão de evento; Ingressos; Descontos; Formulário; Participantes; Check-in; Financeiro do Evento; Gestão Financeira; conta de recebimento; principais operações financeiras autorizadas; página pública/checkout; Preview; API Keys; Integrações essenciais do Admin conforme escopo aprovado.

Não exigir App do Participante, App do Organizador nem pente-fino visual final para extrair.

Antes da extração, auditar o que deve ser compartilhado / extraído / desacoplado / core comum / contrato. Não duplicar tenant, autenticação, permissões, modelos, lógica financeira ou componentes sem necessidade. Extração da forma mais simples e segura; não obriga microserviços nem stack distribuída. Observabilidade deve ser considerada; stack **ainda não escolhida**.

A extração não pode reduzir isolamento multi-tenant, JWT/RBAC, segurança financeira, PII, IDOR/BOLA, auditoria nem secrets.

Depois da extração: ajustes visuais próprios de produto standalone. Não fazer neste corte.

### Dashboard Geral de Eventos — EVENTS-DASHBOARD-1 (`IMPLEMENTED` local, 2026-09-10)

Home do produto. Separada do workspace de um evento. Implementada localmente; não commitada. church-reviewer APPROVED; validação visual do usuário.

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Dashboard / Meus eventos (lista operacional) | `IMPLEMENTED` | `/dashboard/eventos` lista compacta paginada. **Não** redireciona ao workspace. Tela antiga (Cadastrar/Inscrever/Check-in) permanece proibida. |
| Criar novo evento na Dashboard Geral | `IMPLEMENTED` | Mesmo modal compartilhado e `POST /api/events` do workspace. Sem segundo formulário. |
| Gestão Financeira na navegação global | `IMPLEMENTED` | Item na nav global da Dashboard. Removido do menu do workspace. Rota `/dashboard/eventos/gestao-financeira` inalterada. |
| Configurações gerais de Eventos | `IMPLEMENTED` | Hub global `/dashboard/eventos/configuracoes`. Lê conta de recebimento, API Keys, Integrações e RBAC existentes. Cadastro/alteração permanece nas telas atuais. Sem taxa contratual, split ou credencial nova. |
| API Keys | `IMPLEMENTED` | EVENTS-ADMIN-ESSENTIALS-1. Chave da igreja, UI `/dashboard/eventos/api-keys`, consumer `/api/v1`. Criar/revogar na UI só `SUPER_ADMIN` \| `PASTOR`. |
| Integrações globais | `PARTIAL` | EVENTS-INTEGRATIONS-1. Hub + 5 conexões reais (GA, Ads, Pixel, Mailchimp ping, WhatsApp token). ERROR editável. Mailchimp/WhatsApp avisam chave de cifra ausente. RD visível e bloqueada (`connectable: false`) por falta do app OAuth da plataforma. Sem sync Mailchimp, sem envio WhatsApp, sem CAPI Meta, sem Embedded Signup. |

Não criar uma página principal diferente para cada evento. O evento individual abre a partir da lista.

### Workspace do evento

Menu do **evento atual**: Visão geral, Informações, Ingressos, Descontos, Formulário de inscrição, Participantes, Check-in, Financeiro, Aplicativo do Evento.

Gestão Financeira não pertence ao menu permanente do evento. Acessível na nav global da Dashboard Geral (EVENTS-DASHBOARD-1).

### API Keys e API pública — EVENTS-ADMIN-ESSENTIALS-1 (`IMPLEMENTED` local, 2026-09-14)

Chave do **tenant** (`churchId`), não por evento. Hash SHA-256; one-time reveal; revoke por `revokedAt`. Scopes: `events:read`, `registrations:read`, `participants:read`.

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Admin JWT list/create/revoke | `IMPLEMENTED` | `GET/POST /api/events/api-keys`; revoke `POST /api/events/api-keys/:apiKeyId/revoke`. Create/revoke `SUPER_ADMIN` \| `PASTOR`. |
| API pública versionada | `IMPLEMENTED` | `/api/v1` com `X-Api-Key`. 4 GETs de leitura. Fora do JWT. |
| UI global API Keys | `IMPLEMENTED` | `/dashboard/eventos/api-keys` na nav do produto, depois de Gestão Financeira. |
| Rate limit da API pública | **BLOQUEIO PRÉ-PRODUÇÃO** | Não existe rate limiter no repo. Não inventar infraestrutura neste corte. |
| Sistema Igrejas como cliente futuro | Documentado | Após extração física, o Sistema Igrejas consome `/api/v1` com API Key do tenant como qualquer cliente. Sem código de extração neste corte. |

Excluir evento: visível em todo evento. Sem histórico → hard delete. Com histórico → `deletedAt` (sai das listas; financeiro/inscrições preservados).

### Integrações globais — EVENTS-INTEGRATIONS-1 (`PARTIAL` local, 2026-09-14)

Central da igreja (`churchId`), não por evento. Catálogo de 6 providers. CONECTAR só quando `connectable`.

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Hub GET/POST connect/disconnect | `IMPLEMENTED` | JWT + `churchId` do token. GET autenticado. Escrita `SUPER_ADMIN` \| `PASTOR`. |
| Google Analytics / Ads / Meta Pixel | `IMPLEMENTED` | IDs públicos; gtag/fbq só na página pública. Preview sem tracking. |
| Mailchimp conexão | `PARTIAL` | Ping real + key cifrada. Sem sync de lista/participantes. |
| WhatsApp Business Cloud conexão | `PARTIAL` | Token + phone number ID validados no Graph. Sem Embedded Signup, webhook, refresh ou envio. |
| RD Station | `PARTIAL` | Card visível, `connectable: false`, POST 409. Falta app OAuth da plataforma. |
| CAPI Meta / sync / mensagens | `MISSING` | Exigem credencial/produto ainda não fornecidos. |

Ao trocar o evento no seletor, manter a seção atual (ex.: Conferência > Financeiro → Teste 2026 > Financeiro).

## Pendências visuais identificadas (2026-09-05) — NÃO implementar neste passo

### Último corte visual — após o pente-fino final completo (decisão 2026-10-12)
- O corte visual das ações e da edição de configuração das Integrações do Admin foi aprovado pelo usuário.
- Corrigir o espaço excessivo na Gestão Financeira de Eventos, na tela global de Integrações e na tela API Keys de Eventos. O print aprovado pelo usuário é evidência do problema em API Keys.
- Os três ajustes de espaçamento ficam no **último corte visual, depois do pente-fino final completo**. Antes de modificar código, investigar a causa real no layout e nos componentes compartilhados; preservar navegação, sidebar, funcionalidades e demais telas. Não corrigir agora nem antecipar a separação física.

### Participantes
- Visual atual reprovado.
- Precisa redesign operacional.
- Filtros, listagem e status precisam melhorar.
- CSV pertence a esta área (decisão 2026-09-07). PARTICIPANTES-CSV-1: **IMPLEMENTED** localmente (endpoint seguro + botão real). Redesign operacional permanece fora.

### Financeiro do Evento
- Conferência financeira. FINANCEIRO-2 local (paginação/filtros) não commitado. Preservado.
- Copy fechada (2026-09-07): "Financeiro do evento"; subtítulo bruto/taxa/líquido/histórico; coluna "Ingresso / lote".
- FINANCEIRO-3 local: bruto/taxa/líquido via snapshot em `EventPayment`. One-shot local **aplicado** em dados de teste da Conferência 2026 (GET 100/10/90). Sem backfill de produção. One-shot local ≠ produção.
- CSV **não** pertence a esta tela (decisão 2026-09-07: CSV = Participantes).
- Conta de recebimento **não** é cadastrada aqui; é configuração global de Eventos.

### Gestão Financeira Geral de Eventos
- Área multi-evento do produto Eventos em `/dashboard/eventos/gestao-financeira`.
- Distinta do Financeiro geral da plataforma e do Financeiro de conferência do evento.
- Borderô real nesta tela. Repasse/transferência/saque sem botão. Estorno administrativo **IMPLEMENTED** em FINANCEIRO-OPERACOES-1 (bloco expansível; só SUPER_ADMIN executa).
- Item no menu do workspace era **temporário**; EVENTS-DASHBOARD-1 moveu para a nav global. Sem duplicar.
- Conta de recebimento global: **IMPLEMENTED** localmente em GESTAO-FINANCEIRA-2 (bloco expansível; entidade 1:1 da igreja).

### Formulário
- Funcionalidade aprovada.
- No pente-fino, revisar poluição visual dos "Campos pré-definidos".
- Evitar duplicação visual desnecessária entre campo disponível à esquerda e preview à direita.
- Possível solução: seção compacta/recolhível e estado "Adicionado".
- NÃO implementar agora.

## 0. Pré-visualização do evento — EVENTS-PREVIEW-1 (`IMPLEMENTED` local, 2026-09-14)

Fonte: benchmark 02 (Salvar rascunho / Pré-visualizar / Publicar Evento) + decisão de produto. Sem commit.

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Pré-visualizar rascunho com a página real | `IMPLEMENTED` | Rota autenticada `/dashboard/eventos/[eventId]/preview` reutiliza `PublicEventView` (o mesmo renderer de `/eventos/[eventId]`). |
| Draft continua privado | `IMPLEMENTED` | `GET /public/events/:eventId` exige `isPublic: true`. Preview exige JWT + `churchId` + `eventId` do tenant. |
| Preview não publica | `IMPLEMENTED` | `GET /api/events/:eventId/preview` só lê; não escreve `isPublic`. |
| Checkout real bloqueado na prévia | `IMPLEMENTED` | UI desativa inscrição/pagamento; `POST` público de draft continua 404. |
| Botão Pré-visualizar no fluxo admin | `IMPLEMENTED` | Header do workspace, Informações (ao lado de Publicar) e card de rascunho da Visão geral. Salvar informações e Publicar preservados. |
| Imagem / descrição / local na página pública | `IMPLEMENTED` | Capa existente (`EventCoverImage`) na página pública/prévia. `Event.description` e `Event.location` aditivos, editáveis em Informações. Migration `20261027180000` aplicada no PostgreSQL local 5433. |

### Página pública e checkout — reconciliação do HEAD após `fc9f861` (2026-10-12)

Os commits posteriores `d384c08` e `67e86a4` trataram Integrações. Classificação abaixo reflete o código atual, sem equivaler E2E com mocks a homologação externa.

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Evento publicado, ingresso/lote, disponibilidade, formulário e desconto | `IMPLEMENTED` | `getPublicEventById` exige `isPublic`; `createPublicRegistration` valida publicação/inscrições abertas, lote, capacidade e respostas; desconto é revalidado no backend. |
| Jornada pública e meios de pagamento | `IMPLEMENTED` | `PublicEventView` apresenta ingresso → dados → pagamento → confirmação; `createPublicRegistrationSchema` aceita PIX, CREDIT_CARD e DEBIT_CARD. PIX retorna QR/Copia e Cola; cartões preservam escolha sem receber dados do cartão no produto e seguem `invoiceUrl` do Asaas. |
| Cobrança única, retomada e confirmação | `IMPLEMENTED` | `EventOrder`/`EventPayment` ligados à `Transaction` oficial; lock e reuso de cobrança pendente; webhook com token aplica estado PAID, bloqueia regressão e repetição; credencial/app/check-in indisponíveis em PENDING. Modo de auto-confirmação de teste não funciona em produção. |
| E-mail de credencial após pagamento | `PARTIAL` | Adapter Resend gera QR anexado, usa idempotency key e `confirmationEmailSentAt`; retenta em novo webhook. Sem outbox/worker durável. UI exige e-mail, mas schema público o deixa opcional, permitindo confirmação paga sem destinatário. |
| Imagem de divulgação, descrição e local públicos | `IMPLEMENTED` | GET público da capa só se `isPublic`; DTO com `hasCoverImage`, `description` e `location`. Sem bytes no JSON. FORMULARIO-1 e taxa contratual intactos. |
| Proteção contra abuso das rotas públicas | `MISSING` | Sem rate limit em registro/status/webhook; `events-api` configura CORS com `origin: true`. Bloqueio pré-produção; não inventar infraestrutura. |
| Homologação real Asaas → webhook → credencial/e-mail | `PARTIAL` | `public-checkout.e2e-spec.ts` substitui chamadas Asaas por `fetch` simulado e mocka o envio de e-mail; teste do adapter mocka Resend. Prova real externa não registrada por esses testes. |

Próximo corte mínimo permitido: retry durável de e-mail e hardening/homologação externa em gates próprios. Não reimplementar PIX/Asaas/webhook. FORMULARIO-1 e taxa contratual permanecem adiados. Não iniciar automaticamente.

### Autorização/idempotência do checkout — corte estrutural (2026-10-13)

Decisão aprovada do usuário: acesso privado de 24h sem renovação; recuperação/reemissão humana por SUPER_ADMIN para inscrições afetadas PENDING/PAID; contato coincidente exige atendimento; tokens antigos serão invalidados na ativação coordenada, sem modificar JWT geral ou checkInToken.

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Contratos privados, escopo e validade | `PARTIAL` | Schemas v2 e 9 testes puros preparados; não consumidos por rotas. Nenhum acesso é autorizado por esses testes. |
| Persistência de acesso, e-mail local e auditoria | `PARTIAL` | Schema Prisma e migration aditiva preparados e validados offline. Migration NÃO aplicada; sem backfill. |
| Idempotência de tentativa e recuperação | `PARTIAL` | Hash/operationId únicos, FKs compostas e fingerprint preparados. Serviço, locks e prova de concorrência ainda pendentes. |
| Resultado incerto de criação de cobrança | `PARTIAL` | Modelo STARTED/SUCCEEDED/UNCERTAIN e contrato sem reinício preparados. Handler/adapter atuais ainda não usam a intenção persistente. |
| Eliminar autorização por contatos nas duas rotas/deduplicação | `MISSING` | Próximo corte de serviço; nenhum fluxo público alterado neste corte estrutural. |
| Invalidar checkoutToken antigo e coordenar ativação | `MISSING` | Não ativado. Exige contenção e coordenação de api-br/events-api antes de reabrir o fluxo seguro. |
| Recuperação administrativa em runtime | `MISSING` | Contrato SUPER_ADMIN/auditoria preparado; nenhum endpoint, tela, envio ou mecanismo de verificação ativado. |

Próximo corte técnico: serviço transacional comum de autorização/idempotência, somente após nova autorização. Preservar Registration/Order/Payment/Transaction, referências e snapshots; sem substituição automática de cobrança/método. Prova real de constraints/locks depende de ambiente isolado autorizado.

### Segundo corte transacional autorizado — 2026-10-14

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Serviço comum de tentativa/acesso/idempotência | `PARTIAL` | `checkout-access.service.ts`: hash, fingerprint HMAC normalizado, escopo, 24h absolutas, locks chave/evento/inscrição, Serializable e retries limitados. Isolado de entrypoint/rotas. |
| Atomicidade da criação e proteção contra contatos coincidentes no serviço | `PARTIAL` | Factory interna obrigatória usa a mesma transação; gravação de e-mail local/acesso atômica. Contatos causam atendimento, nunca autorização. Adapter do domínio de nova venda será necessário na integração futura; o criador legado não é compatível. |
| Protocolo de concorrência/rollback/retries | `PARTIAL` | 14 testes de serviço + 9 contratos passaram com double transacional. Não prova PostgreSQL real nem o domínio de venda financeira. Ambiente isolado autorizado ainda necessário. |
| Ativação segura nas duas APIs e rejeição de tokens antigos em runtime | `MISSING` | Rotas atuais preservadas, nenhuma migration aplicada. Contenção/integração/ativação continuam em corte próprio. |

TypeScript de events, events-api e api-br e diff check passaram. Schema/migration e demais diffs locais preservados; sem dados reais ou commit/push. Recuperação administrativa e proteção da chamada ao provider não foram antecipadas.

### Recuperação administrativa isolada autorizada — 2026-10-14

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Serviço RECOVER/REISSUE/REVOKE por SUPER_ADMIN | `PARTIAL` | Contexto backend + conta ACTIVE revalidada, tenant/evento/inscrição PUBLIC e relações conferidos. Verificação humana/referências e auditoria persistente na mesma transação. Sem rotas/entrega ativadas. |
| Destinatário específico e contatos compartilhados | `PARTIAL` | RECOVER preenche checkoutEmail apenas se não houver destino efetivo; preserva e-mail existente, Person/Visitor e outras inscrições. REISSUE não troca destino. Consumidores existentes de envio não alterados. |
| Reemissão/revogação e idempotência administrativa | `PARTIAL` | Chave nova/hash/24h; reemissão revoga grant anterior atomicamente; UUID/fingerprint/locks/retries limitados; replay não restaura acesso nem revoga reemissão posterior. Valores/status/referências/snapshots financeiros preservados. |
| Prova isolada e gates reais | `PARTIAL` | 41 testes: 23 anteriores + 18 recuperação, TypeScript fonte/testes. Double não prova PostgreSQL nem verificação/entrega reais. Política operacional e ambiente isolado continuam gates de ativação. |

Schema/migration/diffs anteriores preservados. Sem dados reais, migration aplicada, rotas conectadas, providers, commit/push ou avanço para proteção da criação de cobrança.

### Integração v2 preparada e inativa — 2026-10-14

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Integração das duas rotas públicas/status/resume/admin | `PARTIAL` | Oito descritores Fastify v2 estritos, header privado, JWT/current SUPER_ADMIN, DTO seguro, adapters preparados nos dois servidores. Nenhum buildApp importa/registra o bundle. |
| Factory transacional de nova venda | `PARTIAL` | Domínio existente reutilizado na mesma tx do acesso; sem dedup por contatos/auto-confirmação no v2; Order/Payment/Transaction e snapshots únicos. Wrapper legado preservado. |
| Retomada conhecida e proteção do handler preparado | `PARTIAL` | GET/QR somente após autorização e conferência de grafo/valor/método/referências; revalidação pós-provider. Nova cobrança recusada até guard durável; STARTED/UNCERTAIN ou CARD legado sem semântica exigem reconciliação. |
| Exclusividade de ativação e bloqueios reais | `PARTIAL` | Gate de inventário/protocolo dos dois servidores documentados. Sem flag ou contenção atual. Guard de criação, consumidor checkoutEmail, evidência/canal humano e prova PostgreSQL/externa ainda pendentes. |
| Prova isolada | `PARTIAL` | 56 testes: 41 anteriores + 15 integração. Prisma/provider simulados; TypeScript fonte/testes. Não prova runtime real, PostgreSQL ou provider. |

Regras/diff real/servidores auditados antes da edição. Schema/migration e alterações locais preservados; sem ativar/bloquear rotas, dados reais, migration aplicada, teste destrutivo, commit/push ou avanço de corte.

### Guard durável isolado da primeira cobrança — 2026-10-14

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Intent antes do POST e single owner | `PARTIAL` | EventCheckoutChargeAttempt STARTED commitado antes do adapter; autorização v2, grafo/método/totais/destino scoped, locks/uniquidade/retries DB limitados. Nenhum POST em tx/retry; módulo não conectado. |
| Timeout/resultado incerto/crash | `PARTIAL` | UNCERTAIN ou STARTED durável bloqueiam novos POSTs; commit ambíguo e resposta tardia não reemitem/resetam; AbortSignal/deadline e chave estável em adapter isolado. Sem prova externa. |
| Integridade/reconciliação | `PARTIAL` | Referências e SUCCEEDED atômicos; nenhum ledger/status/valor/snapshot substituído. Reconciliação explícita GET-only verifica referência/escopo/valor/método e conclui o mesmo intent. Sem reset/reinício por ausência. |
| Prova e gates remanescentes | `PARTIAL` | 80 testes: 56 anteriores + 24 guard/adapter; TypeScript events/fonte/testes, financial e ambos servidores; diff check. Double/fetch simulado não provam PostgreSQL, processos reais ou idempotência Asaas. Integração preparada continua inativa e sem ligar o guard. |

Schema/migration, builders, serviços anteriores e integração preparados preservados; nenhum dado/provider real, rota conectada/ativada, worker, teste destrutivo, commit/push ou avanço de corte. Sem ID externo conhecido validável, a intenção continua bloqueada até reconciliação segura; demais gates de ativação seguem documentados.

## Capacidades obrigatórias confirmadas pelo usuário

- Pré-visualização do evento (rascunho → pré-visualizar → publicar, sem expor draft). **EVENTS-PREVIEW-1** `IMPLEMENTED` localmente.
- API keys reais, com lifecycle seguro. Sem token fake.
- Integrações reais equivalentes ao baseline (WhatsApp Business Cloud, Google Ads, Google Analytics, Meta/Facebook Pixel, Mailchimp, RD Station). CONECTAR não pode ser fake. **EVENTS-INTEGRATIONS-1** `PARTIAL`: hub + 5 conexões reais; RD bloqueada sem OAuth da plataforma; sem sync/mensagem/CAPI/Embedded Signup.

### Destinatário local da confirmação — corte de 2026-10-14

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Consumir checkoutEmail por inscrição | `IMPLEMENTED` | Consumidor compartilhado das quatro confirmações prioriza destino local válido; sem sobrescrever Person/Visitor ou outras inscrições. Null/branco/coluna ausente preserva fallback legado; local inválido não redireciona credencial. |
| Elegibilidade, isolamento e marker | `IMPLEMENTED` | Mesmo row lock e releitura CONFIRMED/PAID, sem waitlist; PENDING bloqueado. churchId/eventId/registrationId e contatos/evento conferidos; grava somente confirmationEmailSentAt após sucesso e não substitui marker existente. |
| Idempotência e prova de envio | `PARTIAL` | Chave Resend anterior preservada. 95 testes isolados com doubles/fetch simulado e TypeScript passaram; não provam locks PostgreSQL ou entrega real. Sem worker/outbox. Jest complementar bloqueado por EPERM/realpath; teste Node/tsx do adapter passou. |
| Ativação v2 | `PARTIAL` | Nada conectado/ativado. Schema/migration/contratos/rotas preservados. Gate de destinatário resolvido em código; demais gates históricos mantidos. |

### PostgreSQL descartável — validação autorizada de 2026-10-14

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Ambiente/execução isolada | `IMPLEMENTED` | PostgreSQL 17 em loopback:55437, tmpfs, UUID/cluster marker, URLs próprias e runtime sem DDL. 30 migrations aplicadas apenas ali e replay sem pendências; container removido e outros containers preservados. |
| Constraints, locks e integridade financeira selecionada | `IMPLEMENTED` | 14 testes reais aprovados: checks/FKs/índice parcial/uniqueness/auditoria, row/advisory locks, 55P03/40001, fábrica PIX/CARD 100/10/90, rollback e confirmação local concorrente com marker/PENDING. |
| Serviços v2 e cobrança completa em PostgreSQL | `PARTIAL` | 10 casos falharam: Prisma não desserializa retorno void de pg_advisory_xact_lock usado em $queryRaw. Cobrança/timeout/retry/reconciliação/PIX não comprovados após esse bloqueio. Serviços intactos; correção e reteste exigem corte autorizado. |
| Homologação/ativação | `PARTIAL` | Asaas simulado, fetch proibido, rotas inativas. CARD legado sem método comprovado continua bloqueado; nenhum dado atual, schema/migration/contrato ou volume existente modificado. |

### Correção restrita do void nos locks de acesso — 2026-10-14

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Compatibilidade Prisma 7.8 dos locks de acesso | `IMPLEMENTED` | Quatro ::text em checkout-access.service.ts; mesma função/chave/ordem/lock transacional. Criação/replay/concorrência e recuperação reais passaram. |
| Prova PostgreSQL atual | `PARTIAL` | 19/24 passaram no container PostgreSQL 17 descartável; 30 migrations/replay e isolamento preservados. Container removido. 95/95 regressão e TypeScript fonte/tests/ambos servidores passaram. |
| PIX/cobrança/timeout/retry/reconciliação | `PARTIAL` | Cinco falhas remanescentes: retorno void no advisory lock financeiro de checkout-charge.service.ts:73. Zero POSTs no teste concorrente; fluxo externo ainda não validado. Arquivo não alterado por estar fora da correção restrita solicitada. |

## Sequência operacional vigente

1. Financeiro do Evento — **concluído** (FINANCEIRO-2 + FINANCEIRO-3 + DESCONTOS-1; copy fechada; one-shot local Conferência 2026 GET 100/10/90)
2. CSV de Participantes — **concluído** (`7093da2` + PARTICIPANTES-CSV-1 local)
3. Dashboard Geral de Eventos — **em andamento** (EVENTS-DASHBOARD-1 local; aguardando validação visual)
4. reorganizar Gestão Financeira na navegação global — **feito neste Dashboard**
5. conta de recebimento da igreja — **feito em GESTAO-FINANCEIRA-2** (cadastro global)
6. operações financeiras: estorno administrativo **feito em FINANCEIRO-OPERACOES-1**; split/subconta/repasse/transferência/saque = **BLOQUEIO PRÉ-PRODUÇÃO**
7. fechar gaps principais do Admin (Preview **feito em EVENTS-PREVIEW-1**; API Keys **feito em EVENTS-ADMIN-ESSENTIALS-1**; Configurações gerais **feito neste corte**; Integrações essenciais **PARTIAL em EVENTS-INTEGRATIONS-1**; página pública/checkout **IMPLEMENTED no fluxo principal em `fc9f861`, com pendências e prova externa ainda abertas**, conforme reconciliação acima)
8. **SEPARAR EVENTOS DO SISTEMA GERAL** — uma implementação, dois acessos (handoff Sistema Igrejas + SaaS Eventos). Não desligar integração. Não duplicar.
9. ajustes visuais do produto standalone
10. App do Participante (fonte: `.cursor/benchmarks/app-participantes/` — NÃO é Sympla)
11. App do Organizador
12. pente-fino final completo (TODOS os 16 benchmarks oficiais)

A numeração pode evoluir. A regra de extração (passo 8 logo após fluxos principais estáveis) não. Plano operacional, não arquitetura rígida.

Histórico já encerrado nesta linha: CHECKIN-2 (`0dc71eb`); governança benchmark; PARTICIPANTES-2.

## App Organizador — item 7 (2026-10-29)

Separado do App do Participante. Operação da equipe em `apps/events-organizer`: selecionar evento, localizar participante, validar credencial, check-in, consultar inscrição e bloqueios; QR/scanner quando o navegador autoriza câmera.

Offline, portarias, equipes, vendas e financeiro resumido continuam fora deste corte. Sem prints do Participante e sem Sympla.

## 1. Criação e configuração de evento
- Criar novo evento como ação do módulo Eventos.
- Informações básicas.
- Nome/título.
- Slug.
- Data e horário.
- Imagem.
- Categoria.
- Capacidade.
- Valor/configuração existente.
- Rascunho/publicação.
- Inscrições abertas/fechadas separadas da publicação.
- Estados e ações coerentes.
- Continuidade do fluxo após criação.
- Excluir evento (EVENTS-ADMIN-ESSENTIALS-1): ação no rodapé de Informações de **qualquer** evento. Sem histórico: hard delete. Com histórico: `deletedAt` + sai das listas; `Registration`/`EventPayment`/`Transaction`/auditoria preservados. RBAC `SUPER_ADMIN` | `PASTOR`. Confirmação com nome + checkbox.

## 2. Duplicação de evento
- Ação administrativa do evento atual.
- Não misturar com Página de inscrição ou App do Participante.
- Novo id, título, slug e data/hora.
- Nova cópia nasce rascunho.
- Reaproveitar somente configuração permitida.
- Copiar tickets, lotes e formulário com IDs novos.
- Nunca copiar Registration, FormAnswer, Order, Payment, Transaction, check-in, participantes ou histórico financeiro.
- Não copiar API keys automaticamente.

## 3. Ingressos
- Criar ingresso pago.
- Criar ingresso gratuito.
- Nome e descrição.
- Quantidade.
- Preço.
- Período/janela de vendas.
- Visibilidade.
- Lotes.
- Disponibilidade.
- Regras comerciais aprovadas.
- Cortesia e transferência permanecem gap enquanto não fechadas.

## 4. Formulário de inscrição
- Campos padrão e personalizados.
- Opções.
- Obrigatoriedade.
- Escopo por ingresso (overlay recusa seleção vazia; lista lotes do ingresso).
- `isActive` no overlay de criar/editar, sem reabrir FORMULARIO-1.
- Consentimento.
- Governança de dados sensíveis.

## 5. Visão geral / Dashboard do evento
- Estado do evento.
- Publicação.
- Estado das inscrições.
- Inscrições.
- Check-ins.
- Lista de espera.
- Ingressos.
- Valor.
- Entradas e saldo.
- Página pública e QR.
- Pendências e ações operacionais claras.

## 6. Participantes
- Lista operacional.
- Busca.
- Filtros.
- Status.
- Ingresso/lote.
- Detalhe e histórico.
- Reenvio autorizado.
- Transferência.
- Cancelamento.
- Refund/reembolso conectado ao fluxo financeiro correto.
- **Exportar CSV** pertence a Participantes (decisão 2026-09-07). Não colocar CSV no Financeiro do Evento. PARTICIPANTES-CSV-1: `IMPLEMENTED` localmente (`GET /api/events/:eventId/registrations/export`, stream autenticado, filtros da listagem, botão real). Sem importação neste corte.

## 7. Check-in
- Token/QR.
- Busca manual.
- Busca por nome, e-mail, telefone e token.
- Bloqueio de PENDING.
- Bloqueio de duplicidade.
- Scanner, portarias, offline e multi-dispositivo permanecem fases posteriores conforme roadmap.

## 8. Pagamentos
- PIX.
- Crédito.
- Débito na experiência.
- CARD como método financeiro quando aplicável.
- Retomada idempotente.
- Troca de método.
- Confirmação real.
- Webhook.
- Falhas.
- Refund/reversões.
- Uma cobrança = uma única Transaction oficial.
- PENDING nunca libera credencial/app/e-mail final/check-in.

## 9. Financeiro

Fonte oficial da decisão: usuário (2026-09-05) + `.cursor/rules/financial-security-and-routing.mdc`.
A taxa de 10% é decisão do Sistema Igrejas, **não** do benchmark.

Transaction permanece a fonte oficial da movimentação. Eventos, Financeiro do Evento e Gestão Financeira de Eventos consomem a mesma verdade, sem duplicar cobrança.

O Financeiro geral da plataforma (`/dashboard/financeiro`, dízimo/oferta) é **outro produto**. A Gestão Financeira de Eventos pertence ao bounded context Eventos. O produto Eventos **não** depende do Financeiro geral da igreja para operar.

Dashboard Geral de Eventos (home standalone-ready) é EVENTS-DASHBOARD-1 (`IMPLEMENTED` local). Gestão Financeira é capacidade **global** na nav da Dashboard; **não** no menu do workspace.

### 9.A Financeiro do Evento (conferência)

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Copy da tela (título, subtítulo, coluna) | `IMPLEMENTED` | 2026-09-07: h2 "Financeiro do evento"; subtítulo bruto/taxa/líquido/histórico deste evento; header e label "Ingresso / lote". |
| Histórico simples (origem, ingresso, status, método, valor, data) | `IMPLEMENTED` | FINANCEIRO-2 local lista e pagina as 6 colunas. Coluna "Ingresso / lote". Sem detalhe técnico na UI principal. |
| Paginação/filtros backend | `IMPLEMENTED` | Local; page/limit default 50 max 100; search; paymentStatus; method. Não commitado. Não regredir. |
| Entradas / Saídas / Saldo | `PARTIAL` | Substituídos no Financeiro do evento pelos 3 cards. Visão geral ainda usa income/expense. |
| Valor bruto | `IMPLEMENTED` | `eventSales.grossAmount` soma `EventPayment.amount` PAID com snapshot. One-shot local 2026-09-07 na Conferência 2026: GET 100. PENDING e órfãs fora. One-shot local ≠ produção. |
| Taxa da plataforma (10% padrão + override por tenant) | `IMPLEMENTED` | Default em `PLATFORM_FEE_PERCENT_DEFAULT` + `computeEventPlatformFeeSnapshot`. Override `Church.platformFeePercent` sem tela. Snapshot em `EventPayment`. GET Conferência 10 após one-shot local. |
| Valor líquido | `IMPLEMENTED` | `eventSales.netAmount` a partir do snapshot. GET Conferência 90 após one-shot local. |
| Snapshot histórico da taxa aplicada | `IMPLEMENTED` | `EventPayment.platformFeePercent` / `platformFeeAmount` / `netAmount`. Imutável após a cobrança. Sem backfill de produção. One-shot local pontual em dados de teste. |
| Exportar CSV nesta tela | `USER_DEFERRED` | Decisão 2026-09-07: CSV = Participantes. **Não** colocar CSV no Financeiro do Evento. |
| Conta de recebimento nesta tela | `USER_DEFERRED` | Decisão 2026-09-07: conta é **global** de Eventos, não cadastro por evento como padrão. |
| Transferir / sacar / editar valor / lançar no evento | `USER_DEFERRED` | Usuário definiu: essas ações **não** pertencem a esta tela. |

### 9.B Gestão Financeira Geral de Eventos

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Área multi-evento no produto Eventos | `IMPLEMENTED` | `/dashboard/eventos/gestao-financeira`. Distinta de `/dashboard/financeiro`. Item na **nav global** da Dashboard Geral (EVENTS-DASHBOARD-1). |
| Histórico de todos os eventos do tenant | `IMPLEMENTED` | `GET /api/events/financial/transactions` pagina Transactions `type=EVENT` do `churchId`. |
| Bruto / taxa / líquido consolidados | `PARTIAL` | `eventSales` só soma snapshot PAID + Tx ACTIVE. Vendas sem snapshot ficam de fora. |
| Colunas snapshot da lista | `IMPLEMENTED` | Item expõe `grossAmount`/`platformFeeAmount`/`netAmount`; sem snapshot os três são `null` e a UI/CSV ficam vazios. |
| Pagamentos / pendências / cancelamentos / estornos | `IMPLEMENTED` | Contagens + filtro. Estorno administrativo real no bloco próprio (FINANCEIRO-OPERACOES-1). Repasse/saque sem botão. |
| Repasses / transferências | `DOMAIN_BLOCKED` | **BLOQUEIO PRÉ-PRODUÇÃO.** Sem split/subconta. Cobranças caem na conta Asaas da `ASAAS_API_KEY` (sandbox ADR). `EventsReceivingAccount` não usa `providerAccountId`. Transferir da conta compartilhada misturaria saldo de tenants. Sem botão. Corte específico após arquitetura Asaas por igreja. |
| Estorno administrativo | `IMPLEMENTED` | FINANCEIRO-OPERACOES-1. `refundAsaasPayment` real (POST Asaas `/refund`) para cobrança PAID + ASAAS. JWT + `churchId`. Execução só `SUPER_ADMIN`. Idempotência + auditoria. Webhook sincroniza. Snapshot intocado. Bloco expansível na Gestão Financeira. Cancelamento interno PENDING ≠ estorno. |
| Exportar borderô | `IMPLEMENTED` | `GET /api/events/financial/export` streama CSV autenticado. Snapshot null = células vazias. Borderô pertence **somente** a esta área. |
| Conta de recebimento global de Eventos | `IMPLEMENTED` | `EventsReceivingAccount` 1:1 por `churchId`. Gestão Financeira → bloco expansível. GET mascarado; PUT SUPER_ADMIN/PASTOR. **Não** usa `Campus.asaasAccountId`. Sem subconta/split Asaas neste corte. |
| Privilégio específico para operação sensível | `PARTIAL` | Consulta JWT + `churchId`. Escrita da conta: `SUPER_ADMIN` \| `PASTOR`. Estorno administrativo: só `SUPER_ADMIN`. Sem aba Privilégios. Sem Role nova. Repasse/saque continuam sem botão. |

### 9.C Cupons de desconto

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Ferramenta de cupons no Admin de Eventos | `PARTIAL` | `EventDiscount` + menu Descontos do **evento individual** + CRUD GET/POST/PATCH. Preço final absoluto. Sem DELETE. **Não** mover para Gestão Financeira. |
| Integração real no checkout | `PARTIAL` | Validate público + `discountCode` no register. Backend revalida. Sem política avançada. |
| Regras (percentual/fixo, validade, limites, escopo, cumulatividade) | `USER_DEFERRED` | Usuário ainda não definiu. Mínimo entregue: código + `finalPrice` + ticket + ativo/inativo. |

Não usar `NOT_APPLICABLE` nestas capacidades.

## 10. Analytics
- Resumo operacional.
- Evolução de vendas e inscrições.
- Indicadores por período.
- Indicadores por estado/status.
- Séries temporais.

### 10.A EVENTOS-ADMIN-FINAL-1 — núcleo benchmark 08 (2026-09-04)

Fonte: benchmarks 07 (KPIs overview), 08 (evolução + filtros + confirmados/pendentes/cancelados), 13 (listagem/entrada).
Código: `packages/events/src/event.{service,schema,routes}.ts`,
`apps/web-br/.../event-workspace-client.tsx` (Visão Geral),
`apps/web-br/.../eventos/page.tsx` (Dashboard Geral / Meus eventos).

| Item | Classificação | Justificativa |
| --- | --- | --- |
| KPIs overview (inscrições/check-ins/lista/ingressos/valor/entradas/saldo) | IMPLEMENTED | Já em `getEventById.registrationStats` + financeiro overview (HEAD 4607c13+). |
| Série temporal diária de inscrições | IMPLEMENTED | `GET /events/:eventId/analytics` agrega por dia (`createdAt`, timezone America/Sao_Paulo). Sem PII. |
| Confirmados / pendentes / cancelados | IMPLEMENTED | Totals: CONFIRMED+CHECKED_IN / PENDING / CANCELLED. |
| Filtro por período | IMPLEMENTED | Query `from`/`to` + presets UI (todo período, 7d, 30d, custom). |
| Filtro por tipo de ingresso | IMPLEMENTED | Query `ticketId` validado com `churchId`+`eventId`. |
| Filtro gratuito/pago | IMPLEMENTED | Query `pricing` via `EventTicket.isFree`. |
| Canal de venda (Sympla) | NOT_APPLICABLE | Domínio não possui canais de venda multi-canal. `registrationSource` (ADMIN/PUBLIC) não equivale; não inventado. |
| Visualizações da página / compartilhar social / seguro | MISSING / NOT_APPLICABLE neste núcleo | Fora do núcleo obrigatório do corte; sem telemetria de pageviews no domínio. |
| Gráfico | IMPLEMENTED | CSS próprio (barras); sem dependência nova (projeto sem lib de chart). |
| listEvents paginado (Dashboard Geral) | IMPLEMENTED | Envelope `{ items, pagination }`; search título/slug; default 50 max 100; `date desc`; `churchId` do JWT; slim + `registrationCount`. Sem PII. EVENTS-DASHBOARD-1. |

### 10.B listEvents hardening (mesmo corte)

- ANTES: include de todas as `registrations` com `checkInToken`, person/visitor (nome/telefone/e-mail).
- DEPOIS: select de campos do evento + trailStage + `registrationCount`.
- Entrada `/dashboard/eventos`: Dashboard Geral (Meus eventos). Sem redirect ao workspace. Sem members/visitors/PII. Empty state só criar evento (modal).


## 11. API e integrações
- API keys quando aprovadas.
- Governança.
- Consumer middleware.
- Fronteiras de acesso.
- Adapters.
- Analytics, WhatsApp, ads, pixel, CRM/e-mail somente conforme escopo aprovado.

## 12. Conteúdo / Aplicativo do Evento
- Esta área administrativa publica conteúdo para o App do Participante.
- Não confundir com o próprio App do Participante.
- Programação — `IMPLEMENTED` localmente em PARTICIPANT-APP: CRUD mínimo, publicação, sessões vinculadas a inscrições e isolamento por `churchId` + `eventId`.
- Mapa — `IMPLEMENTED` localmente em PARTICIPANT-APP: URL HTTPS da planta + pontos úteis configuráveis/visíveis; sem upload/storage inventado.
- Materiais.
- Avisos.
- Certificados quando entrarem no corte.

### PARTICIPANT-APP (item 6, 2026-10-29)

Home, Cronograma, Credencial, Mapa e Perfil alinhados aos prints de `.cursor/benchmarks/app-participantes/` e à Arquitetura Viva v5. Sem Sympla. Identidade igreja/evento.

| Capacidade | Classe | Justificativa |
| --- | --- | --- |
| Home / Inscrição | `IMPLEMENTED` | Herói com igreja, data/local/contagem, participante, instalar, próxima sessão, demais sessões, resumo, atalhos e card do evento. Sem formulário de inscrição. |
| Cronograma | `IMPLEMENTED` | Busca, Todos/Meus, dias, timeline, horário, tipo, facilitador, local e detalhes com dados publicados. |
| Credencial | `IMPLEMENTED` | QR/checkInToken real, código textual, status e ingresso; backend bloqueia PENDING, CANCELLED e lista de espera. |
| Mapa | `IMPLEMENTED` | Planta por URL HTTPS e pontos úteis reais configurados no Admin. Estado vazio sem conteúdo fake. |
| Perfil | `IMPLEMENTED` | Nome, papel/status, ingresso, e-mail/telefone, credencial e evento. CPF omitido porque não é persistido. |
| Navegação inferior | `IMPLEMENTED` | Home, Cronograma, Credencial central, Mapa e Perfil. |
| Instalação PWA | `IMPLEMENTED` | Manifesto por `publicSlug`, prompt real no Chromium e orientação iOS; token não entra no manifesto/start URL. |
| Recuperação e encerramento | `IMPLEMENTED` | Token recebido no fragmento, removido após captura, mantido em `sessionStorage` e apagado ao encerrar acesso. |

## Experiências separadas
- Admin Web: gestão e operação.
- Página pública: descoberta, inscrição, dados, pagamento e confirmação.
- App do Participante: pós-inscrição; Home, Cronograma, Credencial, Mapa e Perfil. Entra **depois** da extração física e dos ajustes visuais do produto standalone.
- App Organizador: operação móvel da equipe; separado do App do Participante; entra **depois** do App do Participante. Sem arquitetura e sem código agora.
- Página de inscrição nunca recebe ação administrativa de duplicação.
- Abrir aplicativo representa o App do Participante e não deve ser usado como referência de ação administrativa.

## Gate de fechamento de Eventos/Admin
- Fechar **gaps principais** do Admin (mínimo de extração) **antes** da separação física.
- O pente-fino **final completo** (TODOS os screenshots de `.cursor/benchmarks/events-admin/`, cobertura print por print) acontece **depois** da extração, dos ajustes visuais e dos apps.
- Não declarar Eventos/Admin zerado com conclusão genérica de equivalência.
- Não declarar fechado com gaps críticos sem classificação explícita (`USER_DEFERRED` / `DOMAIN_BLOCKED` exigem decisão do usuário).
- Layout e função devem evoluir juntos.
- Mudança visual exige prévia antes da edição.
- Segurança prevalece sobre equivalência de benchmark.


## Backlog obrigatório — edição administrativa e correção de cadastro

- [x] Permitir correção de ingresso existente, incluindo nome e descrição, respeitando integridade. (2026-09-02: todas as configs reais de EventTicket)
- [x] Permitir correção de lote existente quando o domínio permitir. (2026-09-02: todas as configs reais de TicketBatch)
- [x] Definir regras de edição quando já existirem inscrições, vendas ou pagamentos. (quantidade >= vendidos; isFree true zera price dos lotes; histórico financeiro intocado)
- [x] Não bloquear correção simples de erro de digitação sem motivo de domínio.
- [ ] Não definir política de edição financeira/histórica sem auditoria e aprovação explícita. (preço futuro de novas vendas é editável; Transaction/Payment/Order existentes NÃO são reescritos)

## INGRESSOS-2 — mapeamento benchmark x código real (2026-09-02)

Fonte de comparação: `.cursor/benchmarks/events-admin/15-gerenciar-ingressos.jpeg` (lista),
`.cursor/benchmarks/events-admin/16-editar-ingresso-gratuito.jpeg` (edição),
`.cursor/benchmarks/events-admin/11-...(12)(1).jpeg` (padrão de identidade "Ingresso - Primeiro Lote").
Código real: `apps/web-br/app/dashboard/eventos/[eventId]/event-workspace-client.tsx`,
`packages/events/src/ticket.{routes,schema,service}.ts`,
`packages/database/prisma/schema.prisma` (EventTicket, TicketBatch).

### D1. Matriz da LISTA (benchmark 15)

| Item do benchmark | Classificação | Justificativa no código real |
| --- | --- | --- |
| Tipo/Nome | IMPLEMENTED | Coluna "Ingresso" com identidade `${ticket.name} - ${batch.name}` a partir de `ticketRows`; ingresso sem lote exibe só o nome do ingresso. |
| Vendidos/total | PARTIAL | Exibe `batch._count.registrations / batch.quantity` (contagem já exclui CANCELLED em `listEventTickets`). Sem barra de progresso do benchmark. Linha de ingresso sem lote exibe em dash, pois não existe total no domínio. |
| Valor a receber | MISSING — GAP de domínio | Não existe valor líquido em `EventTicket`/`TicketBatch`. Nenhum cálculo/estimativa foi criado. Coluna deliberadamente não adicionada. |
| Taxa | MISSING — GAP de domínio | Não existe campo de fee/taxa no schema. Nenhum cálculo foi derivado. Coluna deliberadamente não adicionada. |
| Valor do comprador | MISSING — GAP de domínio | Depende de taxa inexistente. Coluna deliberadamente não adicionada. A única coluna de valor é "Valor" = `TicketBatch.price` via `formatMoney`. |
| Visibilidade | PARTIAL | Coluna "Visibilidade" em leitura ("Visível"/"Oculto") a partir de `batch.isVisible` ou `ticket.isVisible`. Toggle inline do benchmark não implementado (sem escopo aprovado de edição de visibilidade). |
| Editar | IMPLEMENTED | Ação "Editar" por linha abre o editor sob demanda com `PATCH /events/:eventId/tickets/:ticketId` e `PATCH /events/:eventId/ticket-batches/:batchId`. |

Extras existentes fora do benchmark 15 e mantidos: coluna "Período" (janela real de `salesStart`/`salesEnd`),
busca de ingressos exibida somente quando `tickets.length > 0`, estado vazio de busca
("Nenhum ingresso encontrado para esta busca."), ações compactas "Criar ingresso"/"Criar lote" no topo.
"Criar lote" fica desabilitado quando `tickets.length === 0`, pois lote exige ingresso existente.

### D2. Matriz da EDIÇÃO (benchmark 16)

| Item do benchmark | Classificação | Justificativa no código real |
| --- | --- | --- |
| Título | IMPLEMENTED | `editingTicketName` editável com `<label htmlFor="edit-ticket-name">` "Título do ingresso", `maxLength={80}` alinhado a `updateEventTicketSchema`. Título do modal usa `editingTicket.isFree` → "Editar ingresso gratuito"/"Editar ingresso pago". Descrição também editável (`edit-ticket-description`, `maxLength={500}`) e nome do lote (`edit-batch-name`, `maxLength={80}`). |
| Quantidade | PARTIAL | `TicketBatch.quantity` exibido como par rótulo/valor de leitura. Edição não liberada neste corte (impacto de disponibilidade/consumo, ver `admin-entity-editability.mdc`). |
| Valor | PARTIAL | `TicketBatch.price` exibido em leitura via `formatMoney`. Edição não liberada (impacto financeiro/histórico não auditado). |
| Período de venda | PARTIAL | `salesStart`/`salesEnd` exibidos em leitura. Edição não liberada. |
| Venda por data/lote | NOT_APPLICABLE | O domínio não possui alternância "Por data" x "Por lote": lote é entidade obrigatória (`TicketBatch` sempre carrega janela de venda). Não existe modo "por data" sem lote. |
| Público permitido | MISSING — GAP de domínio | Não existe campo de audiência/restrição a convidados em `EventTicket`/`TicketBatch`. Nenhum controle criado. |
| Mínimo/máximo por compra | MISSING — GAP de domínio | Não existem campos de mín/máx por compra no schema. Nenhum controle criado. |
| Visibilidade | PARTIAL | `isVisible` exibido em leitura no editor. Toggle do benchmark não implementado. |

Nenhum dado de leitura do editor usa `<input>` (nem `disabled`); todos são pares rótulo/valor,
para não sugerir editabilidade inexistente.

### D3. GAPs de domínio (sem schema, não implementáveis sem migration aprovada)

- fee/taxa da plataforma por ingresso ou lote;
- valor líquido a receber pelo organizador;
- valor do comprador (bruto com taxa);
- quantidade mínima e máxima por compra;
- público restrito a convidados / audiência do ingresso.

Nenhum desses valores foi calculado, estimado ou derivado. Migration e schema não foram alterados.

### D4. Deltas de benchmark deliberadamente NÃO implementados neste corte

- barra de progresso de "Vendidos/total" (benchmark 15);
- botões separados "Ingresso pago" e "Ingresso gratuito" (hoje há um único "Criar ingresso" com seletor de tipo);
- "Grupo de ingressos" e "Produtos" (não aprovados pelo usuário; não pertencem ao domínio atual);
- toggle de visibilidade inline na lista e no editor.

Os filtros de relatório da Visão Geral (benchmarks 07/08: período, tipo, gratuito/pago)
foram implementados em EVENTOS-ADMIN-FINAL-1; canal de venda permanece NOT_APPLICABLE.

Registrados para não desaparecerem por omissão.

### D5. Conflito de regra — RESOLVIDO (EVENTOS-ADMIN-FINAL-1, 2026-09-04)

- `.cursor/rules/events-ticket-lot-layout.mdc` foi atualizado para refletir a decisão explícita
  do usuário: listagem plana/compacta (benchmark 15), sem card por lote.
- A redação antiga de card por lote permanece apenas como histórico superseded na própria regra.

### D6. GAP de autorização (RBAC)

- As rotas de escrita de ingresso e lote (`POST /events/:eventId/tickets`, `POST /events/:eventId/tickets/:ticketId/batches`, `PATCH /events/:eventId/tickets/:ticketId`, `PATCH /events/:eventId/ticket-batches/:batchId`) estão registradas dentro do escopo `protectedRoutes` com `createAuthPreHandler` e isoladas por `churchId` + `eventId`.
- Não existe `requireRole` específico nessas rotas.
- Condição pré-existente e consistente entre create e update; não foi alterada neste corte.
- Registrado como GAP de RBAC a ser tratado no hardening de autorização antes de produção.

### D7. Capacidades removidas por omissão e RESTAURADAS por decisão do usuário (2026-09-02)

O reviewer independente REPROVOU o corte INGRESSOS-2 porque duas capacidades existentes em
`f487a49` ("feat(events): improve ticket operational overview") desapareceram da tela quando o
card por lote foi removido. Ambas eram conteúdo obrigatório do lote segundo
`.cursor/rules/events-ticket-lot-layout.mdc` ("estado operacional" e "disponíveis").
O usuário decidiu explicitamente restaurá-las dentro do layout de linhas compactas vigente,
sem retorno ao card.

| Capacidade | Estado em f487a49 | Situação após remoção do card | Classificação atual | Forma aprovada pelo usuário |
| --- | --- | --- | --- | --- |
| Estado operacional do lote | Presente (badge no cabeçalho do card do lote) | Removida por omissão | IMPLEMENTED | Badge compacto (11px, `borderRadius: 999px`) como SEGUNDA LINHA da coluna "Ingresso" (Tipo/Nome), somente quando existe lote. Sem coluna nova e sem card. |
| Disponíveis | Presente (texto do card do lote) | Removida por omissão | IMPLEMENTED | Segunda linha da coluna "Vendidos/total" com rótulo "disponíveis" (11px, cor discreta), somente quando existe lote. Sem coluna nova. |

Detalhes técnicos da restauração:

- `TicketBatchSaleStatus` e `getTicketBatchSaleStatus` foram restaurados no escopo de módulo de
  `event-workspace-client.tsx`, junto de `formatDateTimeCompact`/`TICKET_LIST_COLUMNS`, com a
  lógica IDÊNTICA à de `f487a49`: Esgotado → Não iniciado → Encerrado → À venda, nessa ordem.
- Disponíveis usa o mesmo cálculo de `f487a49`: `Math.max(batch.quantity - sold, 0)` com
  `sold = batch._count.registrations`.
- Destaque visual apenas para "À venda" (azul); demais estados em tom neutro, reaproveitando a
  intenção de cor de `f487a49` com `fontSize`/`padding` compactos de linha de tabela.
- Linha de ingresso sem lote NÃO recebe badge nem disponíveis; permanece com em dash.
- `TICKET_LIST_COLUMNS` rebalanceado para acomodar "disponíveis" na coluna Vendidos/total:
  `minmax(0, 2.4fr) minmax(0, 1.2fr) minmax(0, 1.1fr) minmax(0, 1fr) minmax(0, 1.8fr) 76px`.
  Todos os tracks flexíveis mantêm mínimo ZERO; só "Editar" é fixa (76px). Nenhuma scrollbar
  horizontal, media query, `overflowX` ou `min-content` foi introduzida.
- Cabeçalho de colunas inalterado (Ingresso, Vendidos/total, Valor, Visibilidade, Período, ação).
- Card pai do ingresso, card por lote, descrição solta e "Pago · Visível" solto continuam
  AUSENTES, conforme reprovação anterior do usuário.

A reprovação do reviewer sobre a perda dessas duas capacidades está endereçada.
O corte segue aguardando validação visual do usuário.

## D8. INGRESSOS-2 — RECONSTRUÇÃO da área Gerenciar Ingressos (2026-09-02)

O usuário REPROVOU a versão anterior por ser apenas uma compactação da estrutura antiga.
Esta seção documenta a reconstrução da área segundo a lógica funcional do benchmark 15
(`.cursor/benchmarks/events-admin/15-gerenciar-ingressos.jpeg`) e do benchmark 16
(`.cursor/benchmarks/events-admin/16-editar-ingresso-gratuito.jpeg`).
Corte 100% frontend em `apps/web-br/app/dashboard/eventos/[eventId]/event-workspace-client.tsx`,
orquestrando apenas endpoints já existentes. Backend, schema, migrations, Financeiro geral e
`apps/events-pwa` não foram alterados.

### D8.1 Matriz coluna por coluna — benchmark 15 x implementação

| Coluna do benchmark 15 | Classificação | Implementação e fonte do dado |
| --- | --- | --- |
| Tipo | IMPLEMENTED | `${ticket.name} - ${batch.name}` a partir de `ticketRows`; ingresso sem lote exibe só `ticket.name`. Segunda linha com o estado operacional do lote. |
| Vendidos/total | IMPLEMENTED | `sold = batch._count.registrations` à esquerda, `batch.quantity` à direita, barra horizontal de progresso (altura 5px, `borderRadius: 999px`) e terceira linha "N disponíveis". Linha sem lote exibe em dash. |
| Valor a receber | MISSING — GAP de domínio | Coluna EXISTE na tabela e exibe em dash em todas as linhas. Não há valor líquido em `EventTicket`, `TicketBatch`, `EventOrder`, `EventPayment` ou `Transaction`. Nenhum cálculo foi criado. |
| Taxa | MISSING — GAP de domínio | Coluna EXISTE na tabela e exibe em dash em todas as linhas. Não existe campo de fee/taxa em nenhuma entidade do domínio. Nenhum percentual ou constante foi introduzido. |
| Valor do comprador | IMPLEMENTED | `formatMoney(batch.price)` — dado real. Ver auditoria em D8.5. Linha sem lote exibe em dash. |
| Visibilidade do ingresso | PARTIAL | Leitura "Visível"/"Oculto" a partir de `batch.isVisible` ou `ticket.isVisible`. Toggle do benchmark não implementado (ver D8.4). |
| Ação de edição | IMPLEMENTED | Coluna fixa de 76px no fim da linha, abre edição em modal sob demanda. Nada expandido na página. |
| Período de venda | REMOVIDA da tabela, PRESERVADA na edição | Coluna "Período" saiu da visão principal por fidelidade ao benchmark 15. `salesStart`/`salesEnd` continuam visíveis como leitura no modal de edição ("Período de venda"). Informação NÃO foi perdida. |
| Busca de ingressos | IMPLEMENTED | "Buscar ingressos" com `<label htmlFor="ticket-search">` e placeholder "Buscar...", filtrando `visibleTicketRows` por nome do ingresso e nome do lote. Estado vazio "Nenhum ingresso encontrado para esta busca." preservado. |

Cabeçalho em sentence case, conforme benchmark 15: `textTransform: "uppercase"` e `letterSpacing`
foram REMOVIDOS do cabeçalho da tabela de ingressos. `alignItems: "end"` e `overflowWrap: "anywhere"`
mantidos para permitir quebra de linha dos rótulos longos.

### D8.2 Grid da listagem — conta de largura

`TICKET_LIST_COLUMNS` passou a ser:
`minmax(0, 2.2fr) minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 1.1fr) minmax(0, 1fr) 76px`

Largura útil real considerada: 856px.
856 − 76 (coluna de ação fixa) − 72 (6 gaps de 12px) = 708px distribuídos entre os `fr`.
Σfr = 2,2 + 1,5 + 1 + 0,8 + 1,1 + 1 = 7,6 → 1fr = 708 / 7,6 = 93,2px.

| Coluna | Track | Largura resultante |
| --- | --- | --- |
| Tipo | 2,2fr | 205px |
| Vendidos/total | 1,5fr | 140px |
| Valor a receber | 1fr | 93px |
| Taxa | 0,8fr | 75px |
| Valor do comprador | 1,1fr | 102px |
| Visibilidade do ingresso | 1fr | 93px |
| Ação (edição) | fixo | 76px |

Soma: 205 + 140 + 93 + 75 + 102 + 93 + 76 = 784px, + 72px de gaps = 856px.
Todos os tracks flexíveis mantêm mínimo ZERO; somente a ação é fixa.
"R$ 1.234,56" a 13px ocupa aproximadamente 82px e cabe nos 102px da coluna Valor do comprador.
Nenhuma media query, `matchMedia`, `innerWidth`, `overflowX`, `overflow-x` ou `min-content`.
A barra de progresso usa `width: 100%` do track com `minWidth: 0`, sem largura fixa em px.

### D8.3 Matriz ação por ação do topo — benchmark 15

| Ação do benchmark | Classificação | Implementação |
| --- | --- | --- |
| Ingresso pago | IMPLEMENTED | Ação principal. Abre o modal único de criação com `ticketIsFree = false`. Título "Criar ingresso pago". |
| Ingresso gratuito | IMPLEMENTED | Ação principal. Abre o MESMO modal com `ticketIsFree = true`. Título "Criar ingresso gratuito". |
| Grupo de ingressos | NOT_APPLICABLE | Não aprovado pelo usuário e sem entidade correspondente no domínio. Não adicionado. |
| Produtos | NOT_APPLICABLE | Não aprovado pelo usuário e fora do domínio de Eventos. Não adicionado. |
| Criação de lote adicional | IMPLEMENTED — desvio justificado (ver D8.6) | Ação SECUNDÁRIA "Adicionar lote", botão de texto discreto abaixo das duas ações principais, desabilitado quando `tickets.length === 0`. |

O seletor de tipo dentro do modal ("Gratuito"/"Pago") foi REMOVIDO. O tipo passa a ser determinado
exclusivamente pelo botão clicado. "Criar ingresso" e "Criar lote" deixaram de ser ações principais.
A frase "O que você deseja criar?" do benchmark 15 NÃO foi replicada porque as ações vivem no header
da seção do workspace, e não em um bloco centralizado; registrado como divergência deliberada de
apresentação, sem perda de capacidade.

### D8.4 Matriz do modal de criação — benchmark 16 x implementação

Fluxo único de frontend que cria o ingresso E seu primeiro lote usando os endpoints atuais.

| Campo do benchmark 16 | Classificação | Campo real e destino |
| --- | --- | --- |
| Título do ingresso | IMPLEMENTED | `create-ticket-name` → `EventTicket.name`, `maxLength={80}` alinhado a `createEventTicketSchema`. |
| Quantidade | IMPLEMENTED | `create-batch-quantity` → `TicketBatch.quantity`, `type="number"`, `min="1"`, `step="1"`. |
| Valor do participante | IMPLEMENTED | `create-batch-price` → `TicketBatch.price`. No fluxo GRATUITO o campo é renderizado `disabled` exibindo "Grátis" e o envio usa `price: 0`, evitando `FREE_TICKET_PRICE_NOT_ZERO`. No fluxo PAGO é numérico obrigatório com `step="0.01"` e `min="0"`. |
| Data de início / Hora de início | IMPLEMENTED | Um único `datetime-local` `create-batch-sales-start` → `salesStart`, com rótulo explícito "Data e hora de início das vendas". Forma autorizada pelo usuário. |
| Data de término / Hora de término | IMPLEMENTED | Um único `datetime-local` `create-batch-sales-end` → `salesEnd`, rótulo "Data e hora de término das vendas". |
| Visibilidade do ingresso | IMPLEMENTED | `create-ticket-visible` aplica o mesmo `isVisible` ao ticket E ao lote. |
| Nome do lote | IMPLEMENTED | `create-batch-name` → `TicketBatch.name`. Campo real, visível e obrigatório, pré-preenchido com "Primeiro lote" e editável. Nenhum nome é inventado silenciosamente. |
| Descrição do ingresso | IMPLEMENTED | `create-ticket-description` → `EventTicket.description`, opcional, `maxLength={500}`. Capacidade já existente, preservada. |
| Por data x Por lote | NOT_APPLICABLE | No domínio, `TicketBatch` é sempre obrigatório e o fluxo de criação já cria o primeiro lote. Não existe modo "por data" sem lote. |
| Quem pode comprar (todo o público x restrito a convidados) | MISSING — GAP de domínio | Não existe campo de audiência/restrição em `EventTicket` ou `TicketBatch`. Nenhum controle criado. |
| Quantidade permitida por compra (mínima/máxima) | MISSING — GAP de domínio | Não existem campos de mín/máx por compra no schema. Nenhum controle criado. |

Todos os campos usam `<label htmlFor>` + `id`. O modal mantém botão de fechar (X), Cancelar e Salvar,
no mesmo padrão do modal de edição.

Escopo de EDIÇÃO inalterado neste corte: Ingresso = `name` e `description`; Lote = `name`.
Preço, quantidade, período, visibilidade, gratuito/pago e DELETE continuam NÃO habilitados.
O modal de edição preserva os pares rótulo/valor de leitura (Tipo, Visibilidade, Vendidos,
Quantidade, Valor, Período de venda).

### D8.5 Auditoria financeira — resultado vinculante

- `TicketBatch.price` É o valor cobrado do comprador. CONFIRMADO em `packages/events/src/event.service.ts`:
  o fluxo público de inscrição chama `createEventRegistrationPayment` com `amount: batch.price`
  (linha 1139). Por isso a coluna "Valor do comprador" exibe dado real via `formatMoney(batch.price)`.
- TAXA não existe no domínio. `EventOrder` possui apenas `totalAmount`, `EventPayment` apenas `amount`,
  `Transaction` apenas `amount`. Não há campo de fee, netValue, líquido, comissão ou split em
  `EventTicket` nem `TicketBatch`. → GAP.
- VALOR A RECEBER não existe. Seria o líquido (comprador menos taxa) e depende da taxa inexistente. → GAP.
- É PROIBIDO exibir `price` como "Valor a receber": isso afirmaria taxa zero, regra de negócio
  inexistente e contrária à direção de split/taxa de plataforma registrada em `system-general.mdc`
  e `events-checkout-payment.mdc`.
- Nenhuma aritmética, percentual, subtração, constante de taxa ou "R$ 0,00" fabricado foi introduzido.
  As duas colunas exibem em dash em TODAS as linhas.

### D8.6 Desvio justificado — criação de lote como ação secundária

O benchmark 15 não possui uma ação separada de criação de lote, porque no benchmark o lote não é
entidade própria da mesma forma. No nosso domínio `TicketBatch` É entidade própria e um `EventTicket`
pode possuir VÁRIOS lotes. O fluxo de criação de ingresso cria apenas o PRIMEIRO lote.

Remover a criação de lote independente eliminaria a capacidade de cadastrar um segundo lote para um
ingresso existente — exatamente o tipo de perda por omissão que já causou reprovação anterior do
reviewer (ver D7). Decisão: manter a capacidade como ação SECUNDÁRIA e visualmente subordinada
("Adicionar lote", botão de texto discreto, desabilitado quando `tickets.length === 0`), nunca como
botão principal ao lado das duas ações de ingresso.

Classificação: desvio deliberado e justificado do benchmark, necessário pelo domínio real.

### D8.7 Achado de DADO — título do evento na coluna Tipo (SUPERSEDED por D8.10)

Registro histórico da primeira reconstrução: o texto "Conferencia 2026 II - primeiro lote" na coluna
Tipo vinha de `${ticket.name} - ${batch.name}` porque o `EventTicket.name` cadastrado era o título
do evento. A orientação original era NÃO aplicar heurística de limpeza e tratar como correção de dado.

O usuário REPROVOU essa orientação em 2026-09-02. A identificação operacional desta tela agora segue
D8.10: igualdade completa `ticket.name === event.title` (case-insensitive) substitui o rótulo
exibido por "Ingresso". D8.7 permanece apenas como histórico; a decisão vigente é D8.10.

### D8.8 GAPs consolidados deste corte

- Taxa da plataforma por ingresso/lote — sem schema. Coluna presente exibindo em dash.
- Valor a receber (líquido do organizador) — sem schema, depende da taxa. Coluna presente exibindo em dash.
- Toggle de visibilidade do ingresso na lista — o backend de update NÃO aceita `isVisible`
  (`updateEventTicketSchema` só aceita `name` e `description`; `updateTicketBatchSchema` só `name`).
  Alterar visibilidade não está no escopo aprovado. Mantido como LEITURA.
- "Quem pode comprar" (todo o público x restrito a convidados) — sem schema.
- Quantidade mínima/máxima por compra — sem schema.
- GAP de RBAC de D6 permanece válido e não foi alterado.

Nenhum desses itens foi calculado, estimado, derivado ou inventado como UI.

### D8.9 Capacidades preservadas (verificação anti-omissão)

- Estado operacional do lote: `getTicketBatchSaleStatus` preservado com lógica IDÊNTICA à de `f487a49`
  (Esgotado → Não iniciado → Encerrado → À venda, nessa ordem), como badge compacto na SEGUNDA LINHA
  da coluna Tipo. Sem coluna nova.
- "N disponíveis": preservado como `Math.max(batch.quantity - sold, 0)` dentro da coluna Vendidos/total.
- Criação de lote adicional: preservada (D8.6).
- Período de venda: preservado como leitura no modal de edição (D8.1).
- Descrição do ingresso: preservada na criação e na edição.
- Busca e estado vazio de busca: preservados.

### D8.10 DECISÃO EXPLÍCITA — reconstrução pela lógica do benchmark e identidade operacional (2026-09-02)

O usuário REPROVOU a versão compactada da área ("Você apenas compactou a estrutura antiga.") e
determinou reconstrução pela LÓGICA FUNCIONAL dos benchmarks 15 e 16, não mais uma variação da
tela anterior. Esta seção substitui D8.7 e atualiza D8.1/D8.3/D8.4/D8.6 no que divergir.

#### Identidade da coluna Tipo (substitui D8.7)

DECISÃO EXPLÍCITA DO USUÁRIO: nesta tela, a identificação operacional deve equivaler a
"Ingresso - primeiro lote" / "Ingresso - segundo lote" quando o nome cadastrado do ticket for
igual ao título do evento. Helper `getTicketRowIdentity(ticketName, batchName, eventTitle)`:

- compara `ticketName.trim()` com `event?.title?.trim()` via `toLocaleLowerCase("pt-BR")`;
- SOMENTE substitui por "Ingresso" quando forem IGUAIS (igualdade completa);
- NÃO faz strip de prefixo, NÃO usa regex, NÃO corta substring;
- se o ticket tiver nome próprio diferente do evento (ex. "VIP"), exibe "VIP - primeiro lote";
- ingresso sem lote exibe só o `typeLabel`;
- NÃO altera `ticket.name` no backend nem no estado;
- a busca continua filtrando `ticket.name` e `batch.name` reais, não o rótulo exibido.

#### Título e ações do topo (atualiza D8.3)

| Item | Estado após esta decisão |
| --- | --- |
| h2 | "Gerenciar ingressos" (antes "Ingressos e lotes") |
| Eyebrow | "Ingressos" |
| "O que você deseja criar?" | IMPLEMENTADO acima dos dois botões principais (fonte: benchmark 15). A divergência deliberada registrada em D8.3 foi REVERTIDA. |
| Ingresso pago / Ingresso gratuito | Únicas ações principais |
| Grupo de ingressos / Produtos | NOT_APPLICABLE (inalterado) |
| Adicionar lote | Saiu do header. Link de texto discreto DEPOIS da tabela, desabilitado se `tickets.length === 0`. Capacidade PRESERVADA (D8.6 continua válido quanto ao desvio de domínio; muda só o posicionamento). |

#### Vendidos/total (atualiza D8.1)

Barra é o indicador principal. Números sold (esquerda) e total (direita) INTEGRADOS à barra
(overlay com flex space-between no mesmo bloco). "N disponíveis" abaixo. Sem linha "0/500" solta
acima da barra. `sold = batch._count.registrations`, `total = batch.quantity`. Sem inventar.

#### Modal de criação (atualiza D8.4)

Seções concentradas ingresso + venda, alinhadas ao benchmark 16, sem inventar campos:

1. Sobre o ingresso — Título (`EventTicket.name`, `placeholder="Ingresso"`, SEM pré-preencher com o título do evento), Descrição opcional, Quantidade (`TicketBatch.quantity`), Valor do participante (`TicketBatch.price`; gratuito: disabled "Grátis", envia 0).
2. Quando o ingresso será vendido — datetime-local `salesStart` / `salesEnd`.
3. Nome do lote — campo REAL obrigatório (`TicketBatch.name`), defaultValue "Primeiro lote", editável. NÃO é seção-produto "Primeiro lote". Nenhum nome inventado no submit.
4. Visibilidade — checkbox aplica ticket + lote.

NÃO adicionados: por data/por lote, quem pode comprar, mín/máx por compra (GAPs). Tipo continua
vindo do botão clicado. Orquestração POST ticket → POST batch e `isCreatingTicket` inalterados.

#### Financeiro, edição, listagem e conflitos (inalterados)

- Valor a receber e Taxa: "—" (GAP). Valor do comprador: `formatMoney(batch.price)` (D8.5).
- Edição: SUPERSEDED por D9 (2026-09-02). Todas as configs reais de ticket/lote passaram a ser editáveis.
- Colunas: Tipo, Vendidos/total, Valor a receber, Taxa, Valor do comprador, Visibilidade do ingresso, Editar (76px). Sem coluna Período na tabela.
- `events-ticket-lot-layout.mdc` continua exigindo card por lote; o usuário determinou listagem plana do benchmark 15. A regra NÃO foi editada (D5).
- FORMULARIO-1 permanece PENDENTE e intacto.

## D9. INGRESSOS-2 — edição de TODAS as configs reais (2026-09-02)

DECISÃO EXPLÍCITA DO USUÁRIO: o limite name/description (ingresso) e name (lote) foi REVOGADO.
Todas as configurações administrativas REAIS persistidas devem ser editáveis.
Dados derivados/históricos (vendidos, taxa, valor a receber, Transaction) continuam somente leitura.

Campos persistidos editáveis:
- EventTicket: `name`, `description`, `isFree`, `isVisible`
- TicketBatch: `name`, `quantity`, `price`, `salesStart`, `salesEnd`, `isVisible`

NÃO existem no domínio e NÃO foram inventados: audience, mín/máx por compra, modo por data/por lote, fee, valor líquido.

### D9.1 Matriz da EDIÇÃO (benchmark 16) — vigente

| Item do benchmark | Classificação | Justificativa no código real |
| --- | --- | --- |
| Título | IMPLEMENTED | `editingTicketName` → `EventTicket.name`, `maxLength={80}`. Título do modal segue `editingTicketIsFree`. Descrição editável (`maxLength={500}`). |
| Quantidade | IMPLEMENTED | `editingBatchQuantity` → `TicketBatch.quantity`. `min` = vendidos do lote (`_count.registrations`). Backend recusa `quantity < sold` (`QUANTITY_BELOW_SOLD`). |
| Valor | IMPLEMENTED | `editingBatchPrice` → `TicketBatch.price`. Gratuito: disabled "Grátis", envia 0. Pago: number editável. |
| Período de venda | IMPLEMENTED | `datetime-local` `salesStart`/`salesEnd`. `salesEnd > salesStart` no frontend e no backend (`SALES_WINDOW_INVALID` se só um lado vier e a janela efetiva for inválida). |
| Tipo pago/gratuito | IMPLEMENTED | Select controlado por `editingTicketIsFree` → `EventTicket.isFree`. `isFree === true` zera `price` de todos os lotes daquele ticket. `isFree === false` não inventa preços. |
| Visibilidade | IMPLEMENTED | Checkbox do ingresso (`EventTicket.isVisible`) e, se houver lote, checkbox do lote (`TicketBatch.isVisible`). Toggle inline da lista permanece fora deste corte. |
| Por data/lote | NOT_APPLICABLE | Sem modo "por data" sem lote. `TicketBatch` sempre carrega a janela. |
| Público permitido | MISSING — GAP de domínio | Sem campo de audiência. Nenhum controle criado. |
| Mínimo/máximo por compra | MISSING — GAP de domínio | Sem campos de mín/máx. Nenhum controle criado. |
| Vendidos | SOMENTE LEITURA | Número derivado de `_count.registrations` (status != CANCELLED). Sem input. |

### D9.2 Integridade

- Quantidade >= unidades já vendidas (`Registration.status != CANCELLED`), mesma regra de `listEventTickets`.
- `isFree === true` zera `TicketBatch.price` de todos os lotes do ticket (`where { churchId, eventId, ticketId }`). Consistência de CONFIGURAÇÃO, igual a `FREE_TICKET_PRICE_NOT_ZERO` na criação.
- `isFree === false` NÃO inventa preços nos lotes.
- Janela: se só `salesStart` ou só `salesEnd` vier, compara com o valor persistido; `salesEnd` efetivo deve ser > `salesStart` efetivo.
- Update usa o `id` resolvido pelo `findFirst` (`churchId` + `eventId` + id), nunca o cru do cliente.
- Registration, EventOrder, EventPayment e Transaction NÃO são escritos. Histórico financeiro intocado.
- Sem DELETE. Sem migration. Sem endpoint novo.

### D9.3 Ordem de persistência no frontend

- Gratuito → pago: PATCH ticket (`isFree false`) depois PATCH batch com o preço informado.
- Pago → gratuito: PATCH ticket (`isFree true`, backend zera preços) depois PATCH batch com `price` 0 e demais campos.
- Após sucesso: `loadTickets()` para não dessincronizar `_count`. Modal fecha. Mensagem de sucesso. Erro exibe `message` da API.
- Dirty check em todos os campos editáveis; se nada mudou, só fecha.

D2, D8.4 e D8.10 ficam como histórico do corte anterior no que divergirem desta decisão.
FORMULARIO-1 permanece PENDENTE e intacto.

## Decisão sobre IA — 2026-10-12
- A IA do Sistema Igrejas geral permanece independente do produto Eventos.
- Avaliar a futura IA de Eventos durante a auditoria de arquitetura anterior à separação física.
- Não implementar IA de Eventos antes da separação.
- Após a separação, implementar somente funcionalidades de IA expressamente aprovadas pelo usuário.
- Preservar a sequência operacional vigente, sem antecipar etapas.

### Recuperação assistida do checkout v2 — corte 2 durável (2026-10-17)

Origem: decisão explícita do usuário + diagnóstico + código real. Código preparado e inativo.

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Preparação atômica e trilha de entrega PostgreSQL | `IMPLEMENTED` no código/ambiente isolado | Nova tabela vinculada à auditoria; PREPARED/INTENT/ACCEPTED/UNCERTAIN/RECONCILED_ACCEPTED; triggers append-only. Não aplicada ao banco principal. |
| Serialização, idempotência e consulta após perda de memória | `IMPLEMENTED` no código/ambiente isolado | Locks por igreja/operação, fingerprint e unicidade; recibo durável sem recriar chave. INTENT sem desfecho bloqueia envio. |
| Reconciliação sem reenvio | `IMPLEMENTED` no código/ambiente isolado | GET por recibo conhecido; confere ID/destino/tags; evento com ator/data/evidência. Sem recibo/correlação não conclui. |
| Prova técnica | `IMPLEMENTED` | 137/137 isolados; PostgreSQL 17 descartável 33/33 completos + 9/9 focados finais; Prisma/TypeScript/checks aprovados. Reinício por novo coordenador/cliente, sem kill do processo. |
| Atendimento humano, envio Resend e ativação reais | `PARTIAL` | Nenhuma rota ativa modificada. Exigem critérios/evidências operacionais, remetente/secret, prazos, homologação e ativação coordenada. |

Detalhe e arquivos: `packages/events/docs/checkout-recovery-delivery-persistence.md`. Diffs locais anteriores preservados; sem banco 5433, envio real, frontend, commit ou push.

### Checkout v2 — corte 3 frontend preparado (2026-10-17)

Origem: decisão explícita do usuário, contrato v2 e código real em cc31472.

| Capacidade | Classe | Evidência / limite |
| --- | --- | --- |
| Cliente público v2 register/status/resume | `PARTIAL` | Implementado e testado, sem consumidor em páginas ativas; Web Crypto/header privado/escopo/DTO seguro. |
| Expiração, revogação e reconciliação | `PARTIAL` | Teto absoluto e bloqueios sem chave nova/reenvio automático; servidor autoriza cada request. Não há público de reconciliação/recuperação. |
| PIX, crédito e débito / apresentação atual | `PARTIAL` | Reuso de PublicEventView com factory opcional; legado padrão preservado. Runtime/visual preparado não homologado. |
| Prova isolada do corte 3 | `IMPLEMENTED` | 19/19 novos e 156/156 totais; TypeScript frontend/domínio/ambos servidores. Sem browser, banco ou pagamentos reais. |
| Ativação coordenada | `MISSING` | Nenhuma página/rota ativa conectada; depende de autorização, migrations/hardening/homologação em corte próprio. |

Documentação: packages/events/docs/checkout-v2-frontend-preparation.md. Resultados 33/33 PostgreSQL dos cortes anteriores preservados, sem nova execução de banco.
