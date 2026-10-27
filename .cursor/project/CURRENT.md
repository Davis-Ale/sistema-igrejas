# CURRENT STATE

## EXTRAÇÃO FÍSICA — AUDITORIA 2026-10-27 (NÃO SEPARAR)

- Backup recuperável do PostgreSQL local `127.0.0.1:5433/sistema_igrejas` **antes** da migration: `.cursor/tmp/backups/sistema_igrejas-5433-20261027-144054.dump` (`pg_dump -Fc`, 44 TABLE DATA). Fora do Git. Produção não tocada.
- `prisma migrate deploy` aplicou só `20261027180000_event_public_description_location` nesse banco. `Event.description` / `Event.location` + CHECKs presentes.
- Auditoria objetiva: `packages/events/docs/eventos-physical-extraction-audit.md`. Domínio em `packages/events`; Admin ainda fala com `api-br :3333`; `events-api` ainda monta Financeiro geral + Asaas; Prisma/JWT/`Transaction` compartilhados. Sem `packages/ai`; assistente rule-based em `api-br` consulta `prisma.event`.
- **Não extraído.** IA não bloqueia. Apps, pente-fino e observabilidade (stack não escolhida) não entram agora.
- Diffs alheios preservados (Gestão Financeira client, next-env, dumps, tmp).

## PÁGINA PÚBLICA — IMAGEM, DESCRIÇÃO E LOCAL (2026-10-27)

- Reutiliza `EventCoverImage` e o editor de capa. GET público `/public/events/:eventId/cover` só para evento publicado. Descrição e local: colunas aditivas em `Event`, editáveis em Informações, exibidas na página pública e na prévia.
- FORMULARIO-1, taxa contratual, RD/CAPI/sync/WhatsApp e espaçamento reservado intactos. Diffs alheios preservados.

## ADMIN — CONFIGURAÇÕES GERAIS DE EVENTOS (2026-10-27)

- Tela global `/dashboard/eventos/configuracoes` na nav do produto, depois de Integrações. Lê conta de recebimento, API Keys e Integrações já existentes; escrita continua nas telas atuais. RBAC: LEADER vê; `SUPER_ADMIN` | `PASTOR` alteram nas telas de origem. Sem taxa contratual, split, RD/CAPI ou espaçamento.
- Diffs alheios preservados.

## ADMIN — PERMISSÕES, LOTES, FORMULÁRIO E CONFIGURAÇÕES (2026-10-27)

- API Keys: criar/revogar só `SUPER_ADMIN` | `PASTOR` na UI, alinhado ao hub de Integrações. LEADER continua lendo a lista.
- Formulário: overlay passa `isActive`; recusa escopo de ingresso vazio; lista lotes do ingresso no seletor. Sem RD/OAuth/CAPI/espaçamento.
- Diffs alheios preservados.

## SaaS — STACK DE NUVEM PERMANENTE (2026-10-27)

- `docker-compose.cloud.yml`: Caddy HTTPS + `api-br` + `events-api` + PostgreSQL 17 + Redis 7 no mesmo compose, sem porta pública de banco/Redis e sem `host.docker.internal`. Compose padrão local intacto.
- Recusados Railway, Cloudflare Tunnel e trycloudflare. Redis interno `checkout-redis` classificado `REDIS_INTERNAL`. Sem publicação, sem `up` e sem apply de webhook.
- Diffs alheios, regras e backups preservados.

## CHECKOUT V2 — HTTPS PERMANENTE DA API (2026-10-27)

- Overlay Caddy `docker-compose.api-https.yml` na frente do `api-br` existente (`:3333`). Compose padrão permanece só PostgreSQL. Recusados Cloudflare Tunnel, trycloudflare e Railway.
- `ASAAS_WEBHOOK_PUBLIC_URL` só admite `HTTPS_PUBLIC`. Overlay não sobe sem `API_PUBLIC_HOST` e `CADDY_ACME_EMAIL` autorizados. Sem publicação, sem Let's Encrypt real, sem apply de webhook Asaas.
- Integrações: hub passa a mostrar a falta da chave de cifra em Mailchimp/WhatsApp. RD/OAuth, CAPI, sync, envio e espaçamento reservado intactos.
- Diffs alheios preservados.

## CHECKOUT V2 — HOMOLOGAÇÃO LOCAL CONTIDA (2026-10-26)

- Backup recuperável confirmado. Gate 55439 persistido `CLOSED` (`reopened: false`). APIs estavam paradas: drain ocioso. Migrations `20261013` e `20261017` aplicadas no PostgreSQL 5433; tabelas/coluna presentes. Sem reopen LEGACY.
- api-br e events-api health 200; register público 503 `CHECKOUT_CLOSED` nas duas; GET do evento 200; frontend `/eventos/:id` 200. Sem cobrança Asaas. Diffs alheios e backups intactos.
- Bloqueio restante da jornada paga: o gate `CLOSED` impede nova admissão e não pode ser reaberto para LEGACY.

## CHECKOUT V2 — TROCA EXCLUSIVA LIGADA (2026-10-26)

- As duas APIs usam `registerExclusiveCheckoutV2` + bundle preparado. Página pública usa `PreparedPublicEventV2`. Preview sem cliente. Callback financeiro legado saiu das rotas públicas. Sem flag.
- Rollback validado: `CLOSED` 503 + drenagem; `registerClosedPublicCheckout` recusa coexistir; o legado não volta. Gate de homologação 55439 **não** foi fechado. Migration aditiva **não** aplicada no principal.
- Impedimento de ativação: sem `CLOSED` no gate compartilhado e sem a migration `20261013120000_event_checkout_access_structure` no banco 5433, a admissão real não pode ser ligada.
- Diffs alheios preservados. Evidência: `packages/events/docs/checkout-v2-security-builder-connection.md`.

## CHECKOUT V2 — HOMOLOGAÇÃO ASAAS/RESEND PREPARADA (2026-10-20)

- Base `6852e15`. Avaliador de prontidão sem segredos; inspect `--provider-readonly` autorizado (GET conta/webhooks/domínios). Builders e rotas ativas intactos; v2 inativo.
- Asaas sandbox do `api-br`: conta APPROVED; `events-api` sem chave/token; zero webhooks habilitados; token local não casa com webhook ativo. Resend sem chave/remetente/URL do participante nas duas APIs.
- Não houve cobrança, e-mail, migration no principal nem deploy. Diffs locais alheios preservados. Evidência: `packages/events/docs/checkout-v2-provider-homologation.md`.

## CHECKOUT V2 — PREPARAÇÃO OPERACIONAL REDIS/SEGURANÇA (2026-10-20)

- Base `9624314`. Parser/config operacional compartilhado e wrappers inativos nas duas APIs; Redis 7 overlay em `127.0.0.1:55439` com ACL `checkout_runtime` sem `+set`, AOF always e senhas obrigatórias. Compose padrão permanece só PostgreSQL.
- Init do gate `LEGACY:<fingerprint>` é ato explícito, só loopback, recusa `CLOSED`/fingerprint divergente. Sem reopen, sem flag, sem import em `app.ts`/`server.ts`. Checkout v2 continua inativo.
- Inspect passou a reportar presença das chaves de segurança sem valores. Nenhuma origem/limite/secret de produção foi escolhido. Volume local do overlay ≠ backup/restore.
- Validação: testes isolados do parser/fingerprint/builders + Redis descartável 55438 para os wrappers operacionais; `docker compose -f docker-compose.checkout-redis.yml config` com senhas sintéticas. Sem banco principal, migration, provider real, browser ou deploy.
- Diffs locais alheios preservados. Evidência: `packages/events/docs/checkout-v2-security-operational.md`.

## CHECKOUT V2 — CORTE 5, INTEGRAÇÃO ISOLADA (2026-10-19)

- Base `69481eb`. PostgreSQL 17 descartável/tmpfs/loopback:55437, runtime sem DDL e credenciais/marker exclusivos; mesmas 31 migrations/replay somente ali, containers removidos e inventário dos demais preservado. Nenhum acesso ao banco principal/5433, generate, seed ou provider real.
- Seis testes novos: corridas OVERDUE/PAID nos dois consumidores, confirmedAt concorrente, exceção/rollback do marcador de e-mail, retries CAS limitados, composição das duas APIs preparadas com JWT/Prisma/Asaas/Resend simulados nos três métodos. Cobrança única, recuperação/replay/chave revogada, webhook duplicado, credencial pós-PAID e financeiro preservados.
- Três falhas reproduzidas no código anterior. Corrigidos somente CAS transacional do status/referência e confirmação PENDING/PAID condicional; e-mail continua no consumidor compartilhado fora da tx financeira. Limite três tentativas; consumidor novo exige contagem estrutural 5 no teste antigo.
- Execução completa 39/39 PostgreSQL, 173/173 isolados, TypeScript events/events-api/api-br/events-admin + fontes de testes e diff check aprovados. Evidência/limites: packages/events/docs/checkout-v2-integrated-validation.md.
- Dois recortes posteriores dos seis novos casos aprovados; seleção final --integrated-only 6/6 sem skips/cancelamentos. Runner preserva modos anteriores e não inclui arquivo vazio no novo recorte. Nenhuma nova reprodução de UNCERTAIN nesses recortes.
- Houve uma ocorrência intermediária isolada de recuperação DELIVERY_UNCERTAIN, bloqueada com segurança; causa não identificada, sem correção especulativa ou reenvio. Diagnóstico seguro adicionado ao teste; homologação operacional continua gate. Store Redis, proxy/origens/limites, SDK/logs reais e evidência humana não homologados.
- Rotas/páginas/builders ativos permanecem sem v2; nenhuma ativação ou implantação. Diffs locais alheios preservados; arquivos privados fora do Git.

## CHECKOUT V2 — CORTE 4, SEGURANÇA/CONTENÇÃO PREPARADAS (2026-10-19)

- Base `3722754`. Política comum e wrappers sem consumidor em app.ts/server.ts nas duas APIs: CORS exato, headers, logger sem segredo/PII/URL/mensagem livre, budgets IP/capability compartilhados e gate fechado por padrão na ausência/incompatibilidade de estado. Sem flag de ativação v2.
- Adapter do ioredis já declarado nas APIs, sem conexão/provisionamento/dependência nova. Store compartilhado real ainda depende de escolha/configuração operacional autorizada; compose permanece só PostgreSQL. Quotas/secret/origens/proxy reais não foram inventados.
- Composição futura fechada omite handlers/callback legado e responde 503 em seis aliases register/status/resume. Chamada padrão do registrador preservada. close compartilhado bloqueia novas admissões, contador conserva handlers em andamento até fim; runbook exige contenção externa/drain de todos os processos antigos e rollback fechado.
- 16 testes novos; regressão isolada 173/173 aprovada, com Fastify/CORS/logger reais, composição com os dois bundles v2 preparados e store/fetch simulados. Redis/Lua/persistência/failover reais não executados. Documento de continuidade: packages/events/docs/checkout-v2-security-preparation.md.
- TypeScript --noEmit --incremental false aprovado em events/events-api/api-br/events-admin e fontes novas de teste com os tipos JWT reais; diff check aprovado. Aprovado como preparação inativa, sem equivaler homologação/ativação.
- Sem banco, migrations, generate, providers reais, browser, novos serviços ou ativação. Diffs locais alheios preservados; arquivos privados continuam fora do Git.

## CHECKOUT V2 — CORTE 3, FRONTEND PÚBLICO PREPARADO (2026-10-17)

- HEAD real de partida `cc31472`, contendo os cortes 1/2. Preparado wrapper sem consumidor em páginas e factory opcional no PublicEventView; composição padrão e protocolo legado preservados. Sem flag de ativação.
- Cliente browser com Web Crypto 256 bits, header privado, sessão por evento/igreja, teto absoluto sem renovação, descarte/bloqueio após expiração/negativa, register/status/resume separados e allowlist de DTO. Não persiste CPF/contatos/respostas/pagamentos, não usa token legado ou contato para autorização.
- Polling/reload somente status. Pagamento novo/retomada apenas por ação explícita; resultado incerto exige conferência e não reinicia cobrança. PIX/crédito/débito e JSX/estilos existentes preservados; controles preparados somente no wrapper v2, preview sem cliente.
- Atualizados os três documentos históricos do guard/integração/PostgreSQL, mantendo relatórios e acrescentando consolidação atual dos cortes 1/2. Protocolo/limites/arquivos em packages/events/docs/checkout-v2-frontend-preparation.md.
- Validação: 19/19 novos, 156/156 regressão isolada total, TypeScript events-admin/events/events-api/api-br e diff check. PostgreSQL NÃO executado neste corte; 33/33 e migrations são evidência anterior, não nova operação.
- Sem banco/migrations/rotas ativas/deploy/providers reais/commit/push; alterações locais alheias preservadas. Runtime/browser, origem/scripts/CORS e ativação coordenada permanecem gates.


## CHECKOUT — RECUPERAÇÃO ASSISTIDA, CORTE 2 DURÁVEL (2026-10-17)

- Estado real de código conferido: HEAD `071e935`, com diffs locais anteriores preservados. Cabeçalhos históricos abaixo não substituem Git/código.
- Nova migration aditiva `20261017120000_checkout_recovery_delivery_events` e tabela append-only vinculada à auditoria. PREPARED na transação de emissão/revogação; INTENT commitado antes do POST; ACCEPTED/UNCERTAIN e reconciliação explícita por GET. Sem chave privada em persistência/logs/DTO administrativo, sem novo envio automático após intenção incerta, TTL absoluto de 24h e financeiro preservados.
- PostgreSQL é o store padrão; locks por igreja/operação, fingerprint imutável e unicidade por estágio. Triggers recusam UPDATE/DELETE/TRUNCATE dos eventos e alteração da auditoria pai vinculada. Métodos backend inspect/reconcile sem novas rotas.
- Validação: 137/137 testes isolados; PostgreSQL 17 descartável 33/33 completos e 9/9 focados finais; 31 migrations aplicadas/replay sem pendências SOMENTE no descartável. Containers de teste removidos e inventário dos demais preservado. Prisma validate, TypeScript fonte/testes e ambos servidores, runner syntax e diff check passaram.
- Prova de reinício por descarte do coordenador e cliente Prisma independente; não houve kill de processo ou envio real. Resend GET validado com fetch simulado.
- Sem acesso ao banco principal/5433, sem migrations nele, sem frontend/rotas ativas/commit/push. Nenhum Prisma generate. Evidência humana operacional, remetente/secret, prazos e homologação/ativação continuam pendentes de autorização/configuração; transferência de atendimento a outro SUPER_ADMIN não foi autorizada.
- Protocolo, arquivos e limites: `packages/events/docs/checkout-recovery-delivery-persistence.md`.


## Repository
- Branch: master
- HEAD de código: `17c12d3` — feat(events): add administrative refunds
- CHECKIN-2 e PARTICIPANTES-2: **ENCERRADOS**
- PARTICIPANTES-CSV-1: **no HEAD** (`71eb523`).
- FINANCEIRO-2/3 + DESCONTOS-1 + Gestão Financeira Geral: **no HEAD** (anteriores a `71eb523`). Preservados neste corte.
- Financeiro do evento (copy 2026-09-07): **fechada** — h2 "Financeiro do evento"; subtítulo bruto/taxa/líquido/histórico; coluna "Ingresso / lote".
- One-shot local de snapshot **aplicado** (2026-09-07) somente em `igreja-local` / Conferência 2026, após SELECT. GET `/api/financial/summary?eventId=` → eventSales 100/10/90. PENDING e lançamentos internos fora dos cards. One-shot local ≠ produção. Sem backfill automático.
- EVENTS-DASHBOARD-1: **no HEAD** (`586bba0`).
- GESTAO-FINANCEIRA-2: **no HEAD** (`f190456`).
- FINANCEIRO-OPERACOES-1: **ENCERRADO** no HEAD (`17c12d3`). Estorno administrativo real. Split/subconta/repasse/transferência/saque = **BLOQUEIO PRÉ-PRODUÇÃO**.
- `apps/web-br/next-env.d.ts` pode aparecer sujo pelo watcher Next e não pertence a este passo.

## PÁGINA PÚBLICA E CHECKOUT — RECONCILIAÇÃO DO CÓDIGO (2026-10-12)

`fc9f861` implementou o fluxo público de checkout e confirmação; `d384c08` e `67e86a4` alteraram somente Integrações. Esta reconciliação é leitura do código, não homologação externa nem autorização para reimplementar o fluxo.

- **IMPLEMENTED no código:** página pública apenas de evento publicado; ingresso/lote visível, disponibilidade, formulário ativo e desconto revalidado no backend; jornada ingresso → dados → pagamento → confirmação; PIX com QR/Copia e Cola e crédito/débito distintos na UI, com redirecionamento seguro ao Asaas; cobrança vinculada a `EventOrder`/`EventPayment`/`Transaction` oficial; retomada de cobrança pendente e proteção contra clique/requisição repetidos; webhook Asaas com token, sincronização de pagamento e bloqueio de credencial/app/check-in enquanto PENDING. O modo de auto-confirmação de teste é desativado em produção.
- **PARTIAL:** confirmação por e-mail tem adapter Resend, QR anexado, chave de idempotência e marcador `confirmationEmailSentAt`; tentativa após PAID e retentativa em webhook repetido. Não há outbox/worker de retry durável. O formulário exige e-mail, mas `createPublicRegistrationSchema` aceita e-mail ausente; uma chamada direta pode confirmar inscrição paga sem destinatário para a credencial.
- **IMPLEMENTED na página pública:** imagem de divulgação via `EventCoverImage` + GET público; descrição e local em `Event` (migration aditiva) e na tela Informações.
- **BLOQUEIOS DE PROVA/PRÉ-PRODUÇÃO:** os E2E de `public-checkout` usam Asaas simulado e o teste de e-mail usa Resend simulado. Não comprovam PIX/cartões, webhook e entrega de e-mail reais ponta a ponta. Rotas públicas críticas não têm rate limit; CORS do `events-api` usa `origin: true`. Homologação externa e hardening exigem corte próprio e condições de ambiente/infraestrutura, sem inventá-las agora.
- **Próximo corte mínimo permitido:** retry durável de e-mail e hardening/homologação externa seguem gates próprios. FORMULARIO-1 e taxa contratual permanecem adiados. Não iniciar automaticamente.

## CHECKOUT — CORTE ESTRUTURAL DE AUTORIZAÇÃO (2026-10-13)

- Decisão aprovada: credencial privada com validade absoluta de 24 horas, sem renovação; nenhuma autorização por nome/telefone/e-mail ou checkoutToken antigo; contatos coincidentes exigem atendimento.
- Recuperação/reemissão de inscrições públicas afetadas com paymentStatus PENDING ou PAID somente por SUPER_ADMIN, após verificação humana, auditoria persistente e entrega pelo canal verificado. Não alterar estado financeiro.
- **Preparado localmente, sem ativação:** contratos v2 separados em `packages/events/src/checkout-access.schema.ts`; `Registration.checkoutEmail` nullable; `EventCheckoutAccess`, `EventCheckoutRecoveryAudit` e `EventCheckoutChargeAttempt`; migration aditiva `20261013120000_event_checkout_access_structure` NÃO aplicada.
- Contratos incluem escopo churchId/eventId/registrationId, expiração/revogação, fingerprint da tentativa, recuperação/reemissão e transições sem reinício automático de cobrança incerta. Migration inclui FKs compostas, unicidade e CHECKs; sem backfill ou DML histórico.
- Validação estrutural: Prisma validate com URL fictícia; SQL gerado por diff entre schemas locais; TypeScript de packages/events; 9 testes puros de contrato; git diff --check. Sem PrismaClient, banco real, Asaas/Resend ou E2E compartilhado.
- **A correção de segurança ainda NÃO está ativa:** rotas públicas, token antigo, handlers de pagamento e frontend permanecem sem mudança neste corte. Os testes não provam concorrência no banco nem autorização em runtime.
- Próximo corte depende de nova autorização: serviço transacional comum de tentativa/acesso/idempotência, com testes isolados, sem ativação. Recuperação administrativa e proteção de cobrança seguem cortes próprios. Não aplicar migration nem invalidar tokens até a ativação coordenada dos dois servidores.
- Contrato e sequência técnica: `packages/events/docs/checkout-access-structure.md`. Preservados os demais diffs locais; sem commit/push.

## CHECKOUT — SEGUNDO CORTE TRANSACIONAL (2026-10-14)

- Conferido código/diff real: o serviço comum ainda não existia; contratos v2 e estrutura Prisma local foram reutilizados.
- Novo `packages/events/src/checkout-access.service.ts`, isolado de entrypoint/rotas: geração criptográfica de 256 bits, hash SHA-256, fingerprint HMAC do payload normalizado, validade absoluta de 24h, autorização churchId/eventId/registrationId e rejeição de chave antiga/expirada/revogada.
- `createCheckoutAttempt` serializa chave global → evento → inscrição; retry equivalente precede validação de nova venda e mantém expiração. Contatos coincidentes somente retornam necessidade de atendimento; não entregam identidade/acesso. Serializable e retries limitados a falhas de serialização/deadlock e conflito único específico da chave.
- A criação de inscrição e grafo financeiro usa factory interna obrigatória na MESMA transação; e-mail local/acesso são atômicos com suas escritas. Factory deve validar nova venda e não deduplicar por contatos, chamar providers/e-mail ou abrir transação própria. Adaptar o criador legado a esse contrato pertence à futura integração; não foi conectado neste corte.
- Serviço não modifica estado financeiro, referências, método, valores ou snapshots; não implementa recuperação administrativa nem guard de criação de cobrança. Esses cortes continuam separados.
- Validações: 14 testes isolados de serviço + 9 de contrato passaram; TypeScript de packages/events, apps/events-api e apps/api-br passou; diff check passou. Double transacional prova protocolo/rollback/retries/chamadas concorrentes, NÃO locks/constraints/isolamento reais do PostgreSQL nem o domínio financeiro de vendas.
- Sem edição de schema/migration, Prisma generate, aplicação de migration, conexão com banco/dados reais, alteração de rotas, commit/push. Diffs locais anteriores preservados. Client Prisma anterior exige SQL parametrizado para as tabelas preparadas.
- **Segurança ainda NÃO ativada:** contatos e checkoutToken antigo nas rotas existentes permanecem para ativação coordenada em corte autorizado. Prova real de concorrência requer ambiente PostgreSQL isolado autorizado; recuperação ainda exige política operacional de evidência humana.

## CHECKOUT — RECUPERAÇÃO ADMINISTRATIVA ISOLADA (2026-10-14)

- Serviço anterior reutilizado, sem refazer cortes: `recoverCheckoutAccess` / `revokeCheckoutAccess` em `checkout-access.service.ts`, ainda fora de entrypoint/rotas.
- Contexto de ator/tenant somente do backend autenticado; SUPER_ADMIN ACTIVE revalidado no banco com SHARE lock. Evento/inscrição PUBLIC/contatos relacionados conferidos no churchId/eventId correto. Nome/telefone/e-mail/token antigo não localizam nem autorizam recuperação.
- RECOVER/REISSUE novos somente para paymentStatus PENDING/PAID, com verificação humana registrada. RECOVER preenche checkoutEmail apenas quando não há destino efetivo; não sobrescreve e-mail local/de contato nem altera Person/Visitor compartilhados. REISSUE não aceita e-mail. Nenhum consumidor de envio existente foi modificado/ativado.
- Chave nova retida pelo caller antes do pedido; só hash persistido; ADMIN_RECOVERY com 24h absolutas. RECOVER não substitui grant não revogado; exige REISSUE explícito. REISSUE revoga grants anteriores e cria acesso/auditoria na mesma transação; REVOKE registra razão sem alterar estado financeiro/participante.
- Auditoria persistente append-only, operationId único por igreja, fingerprint HMAC vinculado a ator/escopo/ação/payload/chave e retries limitados. Replay nunca renova/restaura acesso e revogação repetida não afeta uma reemissão posterior. Falha da auditoria desfaz e-mail/acesso/revogação.
- Preservados IDs, relações, métodos/fingerprints anteriores, valores, snapshots, referências externas, checkInToken, status e confirmationEmailSentAt. Nenhuma cobrança, confirmação ou envio nasce da recuperação.
- 41 testes isolados passaram: 23 anteriores + 18 de recuperação. TypeScript de events, events-api, api-br e testes passou; diff check passou. Protocolo com double transacional não comprova locks/constraints PostgreSQL, verificação humana ou entrega real.
- Gates de ativação mantidos: política operacional de evidência humana e entrega pelo canal verificado ainda pendentes; prova de concorrência exige ambiente PostgreSQL isolado autorizado. Rotas públicas atuais continuam sem a correção ativa; nenhuma rota deste serviço conectada.
- Schema/migration e alterações locais anteriores preservados; sem aplicação de migration, acesso a dados reais, Prisma generate, commit/push ou avanço para proteção da chamada ao provider.

## CHECKOUT — PREPARAÇÃO DE INTEGRAÇÃO INATIVA (2026-10-14)

- Antes de editar, auditados server.ts/buildApp de api-br/events-api: ambos registram o mesmo public.routes.ts e duplicam callbacks que podem excluir/resetar cobrança. Legacy register deduplica por contatos e status aceita/minta checkoutToken. Não pode coexistir com v2 na ativação.
- `checkout-v2.routes.ts` prepara oito descritores Fastify para as duas identidades públicas (register/status/resume) e operação administrativa recovery/revocation com JWT/current SUPER_ADMIN. Não registra nada; nenhum buildApp/entrypoint importa o bundle. Sem flag de ambiente/ativação ou bloqueio atual. Gate de inventário rejeita caminhos críticos antigos na composição futura.
- `checkout-v2.integration.ts`: header privado único, escopo resolvido do evento/acesso, schemas v2 estritos, no-store, DTO por allowlist e checkInToken somente após elegibilidade existente. Status/resume não aceitam contatos/token antigo/método/IDs/valores arbitrários; register não minta checkoutToken.
- Factory de venda reutiliza o fluxo existente dentro da transação do acesso, sem dedup por contatos ou auto-confirmação; uma Order/Payment/Transaction oficial e snapshots preservados. Wrapper legado mantém comportamento. Discount service passa a aceitar apenas os delegates necessários para uso do mesmo tx. Serviços anteriores de acesso/recuperação e seus 41 testes preservados.
- Ambos `checkout-v2.prepared.ts` usam a integração comum com adapters Asaas somente GET/QR. Retomada conhecida confere grafo/referências/método/valor e revalida autorização/estado após leitura externa. Nenhuma chamada a criar/excluir/resetar cobrança, alteração de status/envio ou método substituído.
- **BLOQUEIOS COMPROVADOS PARA ATIVAÇÃO:** adapter atual não consome EventCheckoutChargeAttempt durável e cria cobrança externa dentro de tx; nova cobrança recusada explicitamente no caminho preparado. CARD legado pode não ter semântica crédito/débito persistida: reconciliação obrigatória. Consumidor de e-mail atual ignora checkoutEmail: precisa adaptação antes da ativação. Política de evidência/canal humano e prova PostgreSQL/externa continuam gates.
- 56 testes isolados passaram: 41 anteriores + 15 integração (Fastify.inject com Prisma/provider simulados). TypeScript de events, events-api, api-br e testes passou; diff check passou. Nenhum buildApp/PrismaClient/banco real/provider foi executado pelos testes.
- Protocolo futuro exclusivo nos dois servidores, CORS/redaction do header preparados em constantes e gates documentados em `packages/events/docs/checkout-v2-preparation.md`. Nenhuma etapa de contenção/drenagem/migration/ativação foi executada. Schema/migration, tokens gerais, webhook e diffs locais anteriores preservados; sem dados reais, commit/push ou avanço de corte.

## CHECKOUT — GUARD DURÁVEL DA PRIMEIRA COBRANÇA (2026-10-14)

- Corte exclusivo, isolado: `checkout-charge.service.ts` e adapter stateless `asaas-checkout-charge.provider.ts`, fora de entrypoints/rotas/buildApp/módulos preparados. Serviços e 56 testes anteriores preservados; o caminho preparado ainda recusa nova cobrança até ligação autorizada em corte próprio.
- Reutilizados os contratos v2 e EventCheckoutChargeAttempt existente. Autorização privada comum + original PUBLIC_ATTEMPT/método semântico + grafo churchId/eventId/Registration/Order/EventPayment/Transaction, origem/totais/estado/contatos/destino revalidados. Sem autorização por contatos/token antigo, ausência histórica inferida ou troca de método/ledger.
- STARTED com referência NULL persistido/commitado antes de qualquer POST externo; locks de chave/evento/inscrição e mutex/rows financeiros, unicidade por payment/transaction e retries DB limitados. Somente o owner da inserção confirmada executa o adapter; nenhum POST em callback de tx/retry.
- Adapter envia chave de idempotência estável e AbortSignal; timeout default 30s. Transporte Asaas ganhou apenas signal opcional, preservando chamadas existentes sem signal. Resultado válido liga referências oficiais e SUCCEEDED atomicamente no mesmo intent, conferindo quantidade de linhas; sem alterar status/valores/snapshots/IDs locais, contatos, checkInToken ou marcador de e-mail.
- Timeout/falha pós-intenção/recibo inconsistente → UNCERTAIN; falha ao marcá-lo mantém STARTED durável bloqueado. Commit ambíguo não emite novamente nem rebaixa SUCCEEDED. Resposta tardia não reinicia/conclui silenciosamente. Referência validada conhecida é preservada como evidência mínima, sem CPF/segredos/resposta bruta/logs de provider.
- Reconciliação isolada explícita: credencial privada válida, intent existente e ID conhecido de evidência backend; GET verifica ID/referência externa/valor/método, depois conclui o mesmo intent sem POST. Nenhuma rota, worker, política nova de permissão ou reinício por prova de ausência adicionado.
- 80 testes isolados passaram: 56 anteriores + 24 guard/adapter. TypeScript de events/fonte/testes, financial, events-api e api-br passou; diff check passou. Double prova protocolo/rollback/chamadas concorrentes/retries/timeouts/commit ambíguo, NÃO PostgreSQL/processos reais ou idempotência Asaas externa. Fetch simulado; sem banco/provider/dados reais/teste destrutivo.
- Bloqueios reais/gates: sem referência externa válida estabelecida, STARTED/UNCERTAIN continuam bloqueados; não há política de reset/reemissão por ausência neste contrato. Prova PostgreSQL/Asaas exige ambiente isolado autorizado. Ligação ao caminho preparado, consumidor checkoutEmail, semântica CARD legada e evidência/canal humano permanecem para cortes autorizados próprios.
- Schema/migration e conteúdos da integração/buildApp foram comparados com o início do corte e preservados. Sem migration aplicada, ativação/conexão de rotas, dados reais, commit/push ou avanço de etapa. Protocolo detalhado em `packages/events/docs/checkout-charge-guard.md`.

## CHECKOUT — DESTINATÁRIO LOCAL DA CONFIRMAÇÃO (2026-10-14)

- Corte exclusivo após os 80 testes: consumidor compartilhado extraído de event.service.ts para registration-confirmation-delivery.service.ts, reutilizado pelas quatro chamadas existentes. Nenhuma rota v2 conectada/ativada, contrato modificado ou cobrança criada.
- checkoutEmail específico da inscrição tem precedência sobre Person/Visitor compartilhados. Ausência/null/branco mantém o fallback legado no mesmo tenant; valor local não vazio e inválido bloqueia envio, sem redirecionar a credencial ao contato. Nome/contatos/e-mail não autorizam acesso ou retomada.
- Mantidos lock FOR UPDATE churchId/eventId/registrationId, releitura de elegibilidade CONFIRMED + PAID sem waitlist, bloqueio de PENDING/NOT_REQUIRED e marker confirmationEmailSentAt. Relações de evento/contatos conferidas no tenant. Somente o marcador é gravado após sucesso; marcador existente, contatos, outras inscrições, checkInToken e financeiro preservados.
- Leitura parametrizada to_jsonb(r)->>'checkoutEmail' sob o mesmo lock funciona sem referência SQL direta à coluna nova; o client Prisma antigo não exige generate. Migration preparada permanece NÃO aplicada. Prova física dessa compatibilidade/locks PostgreSQL ainda requer ambiente isolado autorizado.
- Adapter Resend e idempotency key event-registration/registrationId preservados. Falha de envio/commit não marca; retry explícito mantém payload/destino/key. Sem outbox, worker, retry automático ou garantia nova de entrega exatamente uma vez.
- Validação: 95 testes isolados (80 anteriores + 15 destinatário/concorrência/retry/isolamento/adapter com fetch simulado); TypeScript events, ambos servidores e fonte/testes; diff check. Jest complementar do adapter esbarrou em EPERM/realpath do temporário; cobertura do fluxo/adapter validada pelo runner Node/tsx sem rede, PrismaClient ou dados reais.
- Gates remanescentes: prova PostgreSQL/entrega Resend real, ligação do guard à integração inativa, semântica CARD legada, política de evidência/canal humano e ativação coordenada em corte autorizado. O gate de consumidor checkoutEmail está resolvido no código, sem equivaler homologação externa.
- Sem schema/migration/rotas/buildApp/contratos alterados, dados reais, commit/push ou avanço de etapa. Diffs locais anteriores preservados. Detalhe: packages/events/docs/checkout-confirmation-recipient.md.

## CHECKOUT — VALIDAÇÃO POSTGRESQL ISOLADA (2026-10-14)

- Autorizado criar/executar ambiente descartável: runner packages/events/test/run-checkout-postgres.mjs + checkout-postgres.integration.test.ts. PostgreSQL 17 em 127.0.0.1:55437, UUID/cluster marker, tmpfs, credenciais efêmeras próprias, runtime sem DDL/superuser, URL explícita sem fallback ao banco sistema_igrejas/5433. Sem seed/generate/buildApp ou providers reais; apenas fixtures sintéticas.
- Prisma migrate deploy aplicou as 30 migrations existentes SOMENTE no banco descartável; segundo deploy sem pendências. Container removido ao final; inventário dos demais containers preservado. Nenhuma configuração/volume/banco atual tocado.
- Resultado final real: 24 testes, 14 aprovados, 10 falhos, 0 skipped. Aprovados constraints/FKs/TTL/índice parcial/uniqueness/auditoria, locks/conexões/lock timeout 55P03, Serializable 40001, fábrica financeira PIX/CARD 100/10/90, rollback do grafo, disputa de intenção e confirmação local/PENDING/marker concorrente.
- BLOQUEIO COMPROVADO: $queryRaw de SELECT pg_advisory_xact_lock retorna void, não desserializável pelo Prisma instalado. Falha em lockAttempt (checkout-access.service.ts:95) e lockRecovery (:253), antes de cobrança simulada; demais falhas decorrem desse limite. Idempotência do serviço, timeout/UNCERTAIN, reconciliação e retomada PIX ainda NÃO validados com sucesso no PostgreSQL. Não confundir 14 testes de infraestrutura/integridade aprovados com fluxo v2 completo.
- Serviços de produção intactos: não corrigidos os locks neste corte de validação, não reclassificado CARD legado, não ativadas rotas, não alterados contratos/schema/migrations, sem commit/push. 95 testes anteriores preservados e não rerodados. TypeScript da fonte/tests, syntax check runner e diff check passaram; diff rastreado anterior idêntico.
- Runner corrigiu inspeção de HostConfig.Tmpfs e readiness TCP; tentativas descartáveis anteriores também removidas. Detalhe/provas/pendências: packages/events/docs/checkout-postgres-validation.md. Próximo corte depende de autorização para correção mínima dos locks e repetição dos casos bloqueados, sem avanço de ativação.

## CHECKOUT — CORREÇÃO VOID NOS LOCKS DE ACESSO (2026-10-14)

- Escopo autorizado restrito a checkout-access.service.ts: ::text no retorno descartado das quatro chamadas pg_advisory_xact_lock. Função/lock transacional, chaves/hash seed, ordem, Serializable, retries e financeiro preservados. Nenhuma solução de lock alternativa.
- Mesmos 24 testes reexecutados somente em PostgreSQL 17 descartável/loopback:55437/tmpfs/URL guardada: **19 passaram, 5 falharam**, 0 skipped. 30 migrations aplicadas SOMENTE ali e replay sem pendências; container removido e outros containers preservados.
- Passaram agora criação/replay real, concorrência/idempotência de tentativa entre clientes Prisma, CARD legado bloqueado sem método, escopo/revogação e recuperação SUPER_ADMIN/replay. Os 14 aprovados anteriores também passaram.
- BLOQUEIO COMPROVADO REMANESCENTE: checkout-charge.service.ts:73 ainda consulta retorno void sem cast no mutex financeiro. Falham PIX create/retry, owner concorrente, timeout externo/UNCERTAIN/reconciliação, QR e método semântico da cobrança; interrupção ANTES do POST simulado. Esses fluxos ainda não estão aprovados no PostgreSQL. Arquivo mantido intacto pelo escopo restrito solicitado.
- Regressão 95/95 isolados e TypeScript fonte/tests/events-api/api-br passaram; diff check. Alteração de código somente quatro casts no serviço de acesso; docs/governança atualizadas. Contratos/schema/migrations/outros serviços/rotas/banco atual/diffs anteriores preservados; sem commit/push. Continuidade/provas em packages/events/docs/checkout-postgres-validation.md.

## PENDÊNCIA VISUAL APROVADA — GESTÃO FINANCEIRA, INTEGRAÇÕES E API KEYS (2026-10-12)

- O usuário aprovou o corte visual das ações e da edição de configuração das Integrações do Admin.
- Corrigir o espaço excessivo na Gestão Financeira de Eventos, na tela global de Integrações e na tela API Keys de Eventos **juntos no último corte visual, após o pente-fino final completo**. O print aprovado pelo usuário evidencia o problema em API Keys.
- Na execução futura, investigar a causa real no layout e nos componentes compartilhados antes de modificar código; preservar navegação, sidebar, funcionalidades e demais telas.
- Não corrigir esses espaçamentos agora, não antecipar o pente-fino nem alterar a sequência de fechamento dos gaps essenciais do Admin antes da separação física.

## PARTICIPANT-APP — ESTE PASSO (2026-09-16)

Implementação local, sem commit/push. `church-reviewer`: **APPROVED**; aguardando validação visual do usuário.

- App real em `apps/events-participant`, acessível por `/<publicSlug>#aplicativo`.
- Home, Cronograma, Credencial, Mapa e Perfil com bottom navigation persistente; benchmark exclusivo de `.cursor/benchmarks/app-participantes/` (não Sympla).
- Formulário antigo de inscrição removido. Checkout e nova inscrição permanecem na página pública.
- Credencial/checkInToken somente após elegibilidade validada no backend. Token em `sessionStorage`; fragmento de recuperação é removido após captura; ação Encerrar acesso limpa a sessão.
- Cronograma e mapa possuem persistência própria mínima, configuração na seção Admin “Aplicativo do Evento” e conteúdo público somente quando publicado/visível.
- “Meus” usa associação real entre sessão e inscrição. Sem conteúdo demonstrativo.
- Mapa usa URL HTTPS; nenhum upload/storage ou dependência nova.
- CPF continua não persistido e, portanto, omitido.
- Manifesto PWA por `publicSlug`, com entrada no evento sem token; instalação Chromium real e orientação iOS.
- Migration `20260916153000_event_participant_app_content` aplicada no banco local.
- Validação: TSC `events-participant` e `events-api`; unitários 4/4; manifesto 2/2; API/DB 8/8; página/API/manifesto de `conferencia2026` retornaram HTTP 200.
- URL para validação visual: `http://localhost:3003/conferencia2026#aplicativo`.

## EVENTS-INTEGRATIONS-1 — ESTE PASSO (2026-09-14)

Central de Integrações reais do produto Eventos. Sem commit/push neste passo.

O que ficou **REAL** neste corte:
- Hub global `/dashboard/eventos/integracoes` (nav do produto, depois de API Keys). 6 cards do catálogo com estado real.
- `EventIntegration` por `churchId` + provider. JWT + `churchId` do token. GET autenticado do tenant. Connect/disconnect: `SUPER_ADMIN` | `PASTOR`. LEADER vê a lista; escrita 403.
- **GOOGLE_ANALYTICS** — Measurement ID GA4 (`G-…`) persistido em `publicConfig`. Sem secret. gtag na página pública (não no preview).
- **GOOGLE_ADS** — Conversion ID `AW-` + label. gtag/conversion na página pública.
- **META_PIXEL** — Pixel ID numérico. fbq PageView na página pública; CompleteRegistration só após inscrição confirmada e ID validado. Sem Conversions API (CAPI).
- **MAILCHIMP** — API key `{hex}-{dc}` validada no ping real `GET /3.0/ping`. 200 → CONNECTED e key cifrada (AES-256-GCM). Frontend nunca recebe a key (só `secretHint`). **Sem sync de lista/participantes.**
- **WHATSAPP_BUSINESS_CLOUD** — access token + phone number ID validados no Graph (`display_phone_number`). Token cifrado. **Sem Embedded Signup, webhook, refresh ou envio de mensagens.**
- **RD_STATION** — card visível, `connectable: false`, sem botão Conectar. POST connect → 409 `INTEGRATION_NOT_CONNECTABLE`.

O que **falta de credencial/produto** (não inventado):
- Aplicativo OAuth RD Station da plataforma (`client_id`, `client_secret`, redirect URI).
- Meta App da plataforma para Embedded Signup / webhook (`APP_ID`, `APP_SECRET`, verify token).
- Sincronização Mailchimp de participantes/listas.
- Envio de mensagens WhatsApp.
- Meta Conversions API (token CAPI).

Chave de cifra: `EVENTS_INTEGRATIONS_ENCRYPTION_KEY` (64 hex). Ausente/inválida → 503 nos providers com secret (Mailchimp, WhatsApp). GA/Ads/Pixel não dependem dela.

## EVENTS-ADMIN-ESSENTIALS-1 — PASSO ANTERIOR (2026-09-14)

Excluir evento (visível em todo evento) + API Keys da igreja + API pública `/api/v1`. Sem commit/push neste passo.

### Fase 1 — Excluir evento
- Ação **Excluir evento** no rodapé de Informações de **qualquer** evento autorizado. Não some por ter inscrição, pagamento ou histórico.
- Confirmação: modal com nome, consequência, checkbox obrigatório. Sem clique único.
- Evento **sem** histórico operacional/financeiro: hard delete da configuração (tickets, lotes, formulário, descontos).
- Evento **com** `Registration`, `EventOrder`, `EventPayment`, `Transaction.eventId` ou `EventsFinancialOperation`: não apaga esses dados. Marca `deletedAt`, `isPublic=false`, fecha inscrições, zera `publicSlug`. Sai de Meus eventos, do seletor e do workspace (GET 404).
- `DELETE /api/events/:eventId` — JWT + `churchId` do token. RBAC escrita: `SUPER_ADMIN` | `PASTOR`. 204 em ambos os modos. 404 `EVENT_NOT_FOUND` (inexistente, já excluído ou outro tenant). 401 sem JWT. 403 LEADER.
- Sucesso: limpa o seletor se era o evento atual e volta a `/dashboard/eventos`. Workspace com eventId removido redireciona à Dashboard. API keys da igreja não são apagadas.

### Fase 2 — API Keys tenant + `/api/v1`
- `EventApiKey` passou a ser da igreja (`churchId`), sem `eventId`. Hash SHA-256 de `sik_${randomBytes(32).hex}`; one-time reveal no POST; revoke via `revokedAt`.
- Scopes allowlist: `events:read`, `registrations:read`, `participants:read`. Sem financial/refunds/write/admin.
- Admin JWT: `GET/POST /api/events/api-keys`, `POST /api/events/api-keys/:apiKeyId/revoke`. GET: JWT do tenant. POST create/revoke: `SUPER_ADMIN` | `PASTOR`.
- Consumer `/api/v1` fora do JWT. Header `X-Api-Key`. 401 `API_KEY_INVALID` (ausente/errada/revogada). 403 `API_KEY_SCOPE_DENIED`. Logger Fastify com redact de `authorization` e `x-api-key`.
- Somente leitura: `GET /api/v1/events`, `GET /api/v1/events/:eventId`, `GET /api/v1/events/:eventId/registrations`, `GET /api/v1/events/:eventId/participants`. DTOs sem `checkInToken`, CPF, payments, provider IDs, formAnswers.
- UI global `/dashboard/eventos/api-keys` na nav do produto (depois de Gestão Financeira).
- **BLOQUEIO PRÉ-PRODUÇÃO:** rate limit da API pública **não existe** no repo e **não** foi inventado neste corte.
- Arquitetura futura (sem código de extração): quando Eventos for separado, o Sistema Igrejas consome `/api/v1` com API Key do tenant como qualquer cliente.

## EVENTS-PREVIEW-1 — PASSO ANTERIOR (2026-09-14)

Pré-visualização real e segura do evento, sem publicar rascunho. Sem commit/push neste passo.

Implementado neste corte:
- `GET /api/events/:eventId/preview` autenticado (JWT + `churchId` do token + `eventId` no tenant). Devolve o mesmo DTO da página pública (título, data, ingressos visíveis, lotes, formulário ativo, igreja). Não altera `isPublic` nem `publicRegistrationEnabled`.
- Página pública `/eventos/[eventId]` (`GET /public/events/:eventId`) continua exigindo `isPublic: true`. Anônimo e outro tenant não veem draft.
- Renderer público extraído para `PublicEventView` e reutilizado na rota autenticada `/dashboard/eventos/[eventId]/preview` (nova aba). Banner discreto "Pré-visualização". `noindex`.
- Inscrição/pagamento desativados na prévia (frontend). Draft continua recusado no `POST` público de register.
- Botão **Pré-visualizar** no workspace (header, Informações junto de Publicar, card de rascunho da Visão geral). Não remove Página de inscrição, Publicar, Salvar informações nem a nav existente.
- Preview lê o estado persistido. Alterações não salvas no formulário de Informações não vão para a prévia; nova aba não desmonta o editor.
- Sem imagem/descrição/local no domínio; a prévia mostra os campos reais da página pública atual. Sem versionamento.

church-reviewer: **APPROVED**. Validação visual final do usuário. Sem commit/push neste passo.

## FINANCEIRO-OPERACOES-1 — PASSO ANTERIOR (2026-09-11)

Auditoria do domínio financeiro real + Asaas. Sem commit/push neste passo.

Operação real implementada:
- Estorno administrativo de cobrança **PAID** no Asaas (`POST /payments/{id}/refund`), no produto Eventos.
- Endpoints: `GET /api/events/financial/operations`, `GET /api/events/financial/operations/refundable`, `POST /api/events/financial/operations/refunds`.
- JWT + `churchId` do token. Execução só `SUPER_ADMIN` (não amplia PASTOR). LEADER/PASTOR consultam histórico, não estornam.
- Valor só do backend (`EventPayment.amount`). Body aceita apenas `transactionId`.
- Idempotência: unique `(churchId, type, eventPaymentId)` + claim `PAID → REFUND_PENDING` + header `Asaas-Idempotency-Key`.
- Auditoria funcional em `EventsFinancialOperation` + `EventsFinancialOperationAudit` (sem secrets/dados bancários).
- Webhook `PAYMENT_REFUNDED` / `PAYMENT_REFUND_IN_PROGRESS` existente sincroniza a operação; não conclui só pelo 200 inicial.
- Snapshot `platformFeePercent` / `platformFeeAmount` / `netAmount` **não** é reescrito.
- UI: terceiro bloco expansível **Estornos administrativos** na Gestão Financeira. Sem botão de repasse/transferência/saque.

**BLOQUEIO PRÉ-PRODUÇÃO** (não implementar neste corte; corte específico depois da arquitetura Asaas por igreja):
- split, subconta, `providerAccountId`;
- saldo isolado por igreja;
- repasse / transferência / saque.

A conta de recebimento cadastrada **não** basta para mover dinheiro: cobranças caem na conta Asaas da `ASAAS_API_KEY` (sandbox ADR), sem split/subconta.

## GESTAO-FINANCEIRA-2 — PASSO ANTERIOR (2026-09-11)

Central financeira global de Eventos em `/dashboard/eventos/gestao-financeira`. Sem commit/push neste passo.

Implementado neste corte:
- Resumo sempre visível: Valor bruto, Taxa da plataforma, Valor líquido, Pagos, Pendentes, Cancelados, Estornados.
- Três blocos expansíveis (fechados por padrão): Conta de recebimento; Estornos administrativos (FINANCEIRO-OPERACOES-1); Movimentações financeiras. Sem tela gigante.
- Conta de recebimento **global da igreja** para Eventos (`EventsReceivingAccount`, 1:1 `churchId`). **Não** usa `Campus.asaasAccountId`. **Não** é conta por evento.
- Campos persistidos = o que o Asaas exige para transferência futura (bank.code, ownerName, cpfCnpj, agency, account, accountDigit, bankAccountType). Sem chamar Asaas neste corte (split/subconta/saque continuam gap).
- GET mascarado; PUT cadastra/altera. JWT + `churchId` do token. Escrita só `SUPER_ADMIN` | `PASTOR` (mesmo gate financeiro existente). LEADER visualiza, não altera. Auditoria funcional em `EventsReceivingAccountAudit` (snapshot mascarado).
- Lista/resumo/borderô exigem `EventPayment` do mesmo `churchId`. Transaction `type=EVENT` sem cobrança real (lançamento interno / Sem cobrança) **não** aparece. Registros **não** são apagados.
- Borderô existente preservado (stream, UTF-8 BOM, filtros, snapshots, churchId).
- Navegação global e do workspace **não** alterada.

Ainda pendente (próximos cortes):
- split / subconta Asaas / `providerAccountId`;
- repasse, transferência, saque;
- Role/capability dedicada além do gate `SUPER_ADMIN` do estorno;
- Configurações gerais de Eventos.

## EVENTS-DASHBOARD-1 — ESTE PASSO (2026-09-10)

Home do produto Eventos. Separada do workspace de um evento específico. Sem commit/push neste passo.

Implementado neste corte:
- `/dashboard/eventos` é a Dashboard Geral (Meus eventos). **Não** redireciona para o primeiro evento. Sem flash da tela antiga (Cadastrar / Inscrever / Check-in).
- Lista operacional compacta (Status, Evento, Quando, Inscrições, Gerenciar), busca por título/slug no backend, paginação `page`/`limit` default 50 max 100, ordem default `date desc`.
- `GET /api/events` devolve envelope `{ items, pagination }`. `churchId` só do JWT. Select slim + `registrationCount`. Sem PII / `registrations[]` / `checkInToken`.
- Criar evento reutiliza o modal único e o `POST /api/events` existente. Sem segundo formulário.
- Nav global do produto: Meus eventos · Criar evento · Gestão Financeira. Sem Configurações / Integrações / API (ainda sem função real).
- Gestão Financeira **movida** para a nav global (`/dashboard/eventos/gestao-financeira`). Removida do menu do workspace. Cálculos, borderô e `/financial/*` **não** alterados.
- Workspace `[eventId]` preservado. Voltar: **Meus eventos** → `/dashboard/eventos`. Trocar evento no seletor mantém `section`.

church-reviewer: **APPROVED**. Validação visual final do usuário. Sem commit/push neste passo.

## GOVERNANÇA 2026-09-10 — prioridade de separação física de Eventos

Decisão explícita do usuário. Este passo foi **somente governança**. Sem código de produção, schema, migration, dependência, infraestrutura, extração física, novo repositório, novo deploy, commit ou push.

Fontes canônicas: `.cursor/rules/system-general.mdc` (arquitetura e extração), `.cursor/architecture/product-reference-and-layout.md`, `.cursor/project/EVENTS_MATRIX.md`, `.cursor/rules/security-hardening.mdc`.

### Decisão
Eventos será vendido separadamente. A separação física **não** fica para um futuro distante.

**Regra:** assim que os fluxos principais e os contratos do domínio estiverem estáveis, Eventos **deve** ser separado do Sistema Igrejas. Isso acontece **antes** do App do Participante, **antes** do App do Organizador e **antes** do pente-fino final completo.

Não empurrar a extração para depois de todo o produto estar concluído.

Não separar neste corte. Continua no monorepo / mesma base / JWT **neste momento**.

### Fluxos principais estáveis (mínimo para extrair)
Dashboard Geral de Eventos; criação/gestão de evento; Ingressos; Descontos; Formulário; Participantes; Check-in; Financeiro do Evento; Gestão Financeira; conta de recebimento; principais operações financeiras autorizadas; página pública/checkout; Preview; API Keys; Integrações essenciais do Admin conforme escopo aprovado.

Não exigir, para extrair: App do Participante finalizado; App do Organizador finalizado; pente-fino visual final.

### Objetivo da extração
Produto independente: aplicação, dashboard, navegação, identidade visual, configuração e deploy próprios; domínio isolado; baixo acoplamento; venda standalone.

Não duplicar core sem necessidade. Antes da extração, auditar o que deve ser compartilhado, extraído, desacoplado, mantido como core comum ou convertido em contrato/API. Não duplicar tenant, autenticação, permissões, modelos, lógica financeira ou componentes sem necessidade arquitetural real.

A extração **não** obriga microserviços, Kafka, Kubernetes, service mesh, novos bancos, novas clouds ou brokers adicionais. *Modular primeiro. Distribuído quando houver benefício real.* Extração da forma mais simples e segura compatível com o domínio.

Depois da extração: ajustes visuais próprios de produto standalone (entrada, dashboard, navegação, identidade, remoção de aparência de módulo interno). Não fazer agora.

A extração **não** pode reduzir isolamento multi-tenant, JWT/RBAC, segurança financeira, PII, IDOR/BOLA, auditoria nem secrets.

Stack de observabilidade **ainda não definida**. Considerar observabilidade na extração futura; não escolher tecnologia automaticamente.

### Sequência de produto atual (2026-09-10)

A numeração pode evoluir conforme novos cortes. A regra de extração não.

1. Financeiro do Evento — **concluído**
2. CSV de Participantes — **concluído**
3. Dashboard Geral de Eventos — **em andamento** (EVENTS-DASHBOARD-1 local)
4. reorganizar Gestão Financeira na navegação global — **feito neste Dashboard** (nav global; não duplicar no workspace)
5. conta de recebimento da igreja — **feito em GESTAO-FINANCEIRA-2** (cadastro global)
6. operações financeiras: estorno administrativo **feito em FINANCEIRO-OPERACOES-1**; split/subconta/repasse/transferência/saque = **BLOQUEIO PRÉ-PRODUÇÃO**
7. fechar gaps principais do Admin (Preview, API Keys e Configurações gerais feitos; restam Integrações essenciais PARTIAL e checkout/página pública conforme escopo)
8. **SEPARAR EVENTOS DO SISTEMA GERAL**
9. ajustes visuais do produto standalone
10. App do Participante
11. App do Organizador
12. pente-fino final completo

## GOVERNANÇA 2026-09-09 — SOLID, observabilidade e arquitetura distribuída

Decisão explícita do usuário. Este passo foi **somente governança**. Sem código de produção, schema, migration, dependência, infraestrutura, microserviço, commit ou push.

Fontes canônicas: `.cursor/rules/system-general.mdc` (arquitetura), `.cursor/architecture/product-reference-and-layout.md`, `.cursor/rules/security-hardening.mdc` (observabilidade/PII/auditoria).

### Princípios
- **Modular primeiro. Distribuído quando houver benefício real.**
- **Observabilidade será uma camada transversal do produto, mas sua tecnologia será escolhida posteriormente pelo usuário.**
- Não fazer overengineering. Não criar infraestrutura preventiva sem necessidade comprovada.

### SOLID
Aplicar SOLID quando melhorar separação de responsabilidades, manutenção, testabilidade, extensibilidade, baixo acoplamento e clareza de contratos. **Não** criar interfaces, camadas artificiais ou abstração prematura só para seguir o padrão teórico. Arquitetura pragmática.

### Arquitetura atual
O sistema permanece **monólito modular**. Não migrar agora para arquitetura distribuída completa. Não transformar automaticamente em microserviços. Domínios continuam fortemente separados (Core/Tenant, Auth/Security, Eventos, Financeiro, CRM, Operações, IA, Integrações).

### Arquitetura distribuída — futura
Faz sentido para evolução futura, **não** como padrão atual. Somente com benefício técnico ou de negócio comprovado **e** autorização explícita do usuário. Motivos possíveis (nenhum autoriza migração automática): escala independente, picos de Eventos, isolamento operacional, workers, integrações, notificações, IA, filas, resiliência, produto Eventos separado, deploy independente.

Candidatos futuros (não implementação aprovada): produto Eventos, workers assíncronos, notificações, integrações externas, processamento de IA, determinadas operações financeiras se houver necessidade real. **Não criar essa separação distribuída agora.** A extração física de Eventos (2026-09-10) é extração de produto, não migração automática para microserviços.

Não introduzir automaticamente Kafka, RabbitMQ, Kubernetes, service mesh, novos brokers, novos bancos, microsserviços, novas clouds ou infra distribuída. Tecnologias já existentes (ex.: BullMQ, se já houver no stack) só no escopo já autorizado. Novas tecnologias exigem autorização explícita.

### Eventos
Permanece vendável à parte, **standalone-ready** no monorepo atual **neste momento**. Fronteira clara, baixo acoplamento, domínio/navegação/Gestão Financeira/Dashboard Geral próprios. Extração física **logo após** os fluxos principais estáveis — **antes** dos apps finais e do pente-fino final. Detalhe vigente: GOVERNANÇA 2026-09-10. A extração não deve exigir reescrever o domínio.

### Observabilidade
Importante e fará parte da arquitetura. **A stack ainda não foi escolhida.** Não implementar nem escolher silenciosamente OpenTelemetry, Sentry, Grafana, Prometheus, Loki, Datadog, New Relic, Elastic ou outra plataforma.

Diretriz futura (não implementação): logs estruturados, requestId, correlationId, tracing, métricas, duração, status, error tracking, health checks, dashboards, alertas, auditoria de ações sensíveis. Contexto seguro: requestId, correlationId, churchId, eventId, domínio/serviço, operação, status, duração. Sem senha, JWT, refresh token, API keys, secrets, dados bancários, cartão, credenciais, PII desnecessária ou payload sensível completo.

Logs técnicos ≠ trilhas de auditoria funcional. Operações sensíveis (conta de recebimento, taxa contratual, repasse, transferência, saque, estorno administrativo, permissões, ações administrativas críticas) exigirão auditoria própria.

Quanto mais distribuída a arquitetura, mais crítica a observabilidade. Antes de aumentar a distribuição, haver observabilidade suficiente para correlacionar ponta a ponta (request → inscrição → desconto → pagamento → webhook → financeiro → integração/notificação).

Quando o usuário escolher a stack: atualizar regras e arquitetura → padrão de instrumentação → logs/métricas/tracing → retenção → LGPD/PII → ambientes → alertas → custos → só então implementar.

## GOVERNANÇA 2026-09-07 — Eventos standalone-ready

Decisão explícita do usuário. Este passo foi **somente governança**. Sem código de produção, schema, migration, commit ou push.

### Arquitetura
- Eventos permanece **neste momento** no Sistema Igrejas / monorepo atual.
- **Não** separar repositório, banco, deploy ou autenticação neste corte de 2026-09-07 (nem neste corte de 2026-09-10).
- Eventos deve ser desenvolvido desde já como **produto com fronteira própria**, preparado para ser vendido e executado em separado (**standalone-ready**).
- Evitar acoplamento desnecessário ao sistema geral.
- Preservar contratos claros.
- Reutilizar apenas core realmente compartilhado (JWT, churchId, Transaction oficial, pagamentos).
- Manter domínio, navegação e funcionalidades de Eventos coerentes entre si.
- **Não** depender do Financeiro geral da igreja (`/dashboard/financeiro`) para operar o produto Eventos.

### Timing da extração — SUPERSEDED em 2026-09-10
O texto original deste corte dizia: não iniciar extração física agora; separar somente depois da estabilização **e** autorização explícita.

**Vigente (2026-09-10):** não separar neste momento; **separar logo após** os fluxos principais e contratos estáveis, **antes** dos apps finais e do pente-fino final. Não empurrar para o fim de todo o produto. Detalhe: GOVERNANÇA 2026-09-10.

### Dashboard Geral de Eventos — EVENTS-DASHBOARD-1 (2026-09-10)
Home do produto standalone Eventos. Separada do workspace de um evento específico. Implementada **localmente** neste corte; não commitada.

Estrutura:

- Dashboard / Meus eventos — `/dashboard/eventos` (lista operacional; **não** redireciona ao workspace)
- Criar novo evento — mesmo modal / `POST /api/events`
- Gestão Financeira — nav global `/dashboard/eventos/gestao-financeira`
- Configurações gerais — `/dashboard/eventos/configuracoes` (hub dos dados já existentes)
- futuras Integrações / API — ainda `MISSING`; **sem** botão morto

Na Dashboard Geral, os eventos da igreja aparecem em **lista operacional** (um abaixo do outro). Cada item abre/gerencia aquele evento. Não criar uma página principal diferente para cada evento. O evento individual abre a partir da lista.

A tela antiga (Cadastrar evento / Inscrever participante / Eventos cadastrados / Check-in) continua **proibida**. O redirect automático ao primeiro evento foi **removido**.

### Workspace do evento
Ao abrir um evento específico, o usuário entra no workspace daquele evento.

Menu do evento (capacidades ligadas ao **evento atual**):

- Visão geral
- Informações
- Ingressos
- Descontos
- Formulário de inscrição
- Participantes
- Check-in
- Financeiro
- Aplicativo do Evento

Gestão Financeira **não** pertence permanentemente a este menu.

### Gestão Financeira — global (EVENTS-DASHBOARD-1)
Capacidade **global do produto Eventos**. Consolida todos os eventos autorizados do tenant.

Acessível na navegação global da Dashboard Geral. **Não** pertence ao menu permanente do evento individual. Não duplicar as duas versões.

### Financeiro do evento
Continua simples: Valor bruto, Taxa da plataforma, Valor líquido e histórico daquele evento.

Não é Gestão Financeira Geral. Não é local principal para repasse, transferência ou cadastro geral da conta da igreja.

### Conta de recebimento — global
A conta de recebimento da igreja pertence à configuração financeira **global** de Eventos.

Local conceitual: Gestão Financeira → Conta de recebimento, **ou** Configurações gerais de Eventos → Financeiro / Conta de recebimento, conforme melhor arquitetura da futura Dashboard Geral.

**Não** cadastrar conta bancária separada por evento como regra padrão. A igreja cadastra sua conta de recebimento para o produto Eventos. Override por evento somente com decisão futura explícita do usuário.

Cadastro e alteração são ações sensíveis: JWT, RBAC, churchId, IDOR/BOLA, auditoria, mascaramento, proteção de PII, nenhuma credencial bancária exposta, autorização forte para alteração.

### Descontos
Capacidade do **evento individual**. Menu: Ingressos, Descontos, Formulário de inscrição. Serve inclusive para preço especial no mesmo ingresso sem obrigar novo lote. **Não** mover para Gestão Financeira.

### Navegação entre eventos
Ao trocar o evento no seletor, **manter a seção atual** do workspace (ex.: Conferência > Financeiro → Teste 2026 > Financeiro). Trocar evento não deve jogar automaticamente para Visão geral.

Retorno do workspace: **Meus eventos** → `/dashboard/eventos` (Dashboard Geral). Sair do produto (home/GF): **Voltar ao painel** → `/dashboard`.

### Exportações
- **CSV** = Participantes. Não colocar CSV no Financeiro do Evento.
- **Borderô** = Gestão Financeira Geral de Eventos.

### Extração futura — SUPERSEDED em 2026-09-10
Texto original: avaliar extração quando Eventos estiver funcionalmente estabilizado.

**Vigente:** extração **logo após** fluxos principais estáveis, **antes** de App do Participante, App do Organizador e pente-fino final. A arquitetura atual deve facilitar essa extração sem reescrever o domínio inteiro.

Evitar dependências diretas desnecessárias de: páginas do sistema geral; Financeiro geral; regras específicas de outros módulos; UI que só funcione dentro da dashboard geral da igreja.

## GESTÃO FINANCEIRA GERAL DE EVENTOS — ESTE PASSO (2026-09-05)

Fonte complementar: `.cursor/rules/financial-security-and-routing.mdc` e `.cursor/rules/events-navigation.mdc`.

Implementado neste corte:
- rota `/dashboard/eventos/gestao-financeira` no produto Eventos, fora do evento individual;
- item **Gestão Financeira** na nav global da Dashboard Geral (EVENTS-DASHBOARD-1); removido do menu do workspace;
- `GET /api/events/financial/summary|transactions|export` com JWT + `churchId`, sem `ensureCanAccessFinancial`; `from` da URL não vai para a API;
- cards bruto/taxa/líquido só com snapshot PAID; lista com `grossAmount`/`platformFeeAmount`/`netAmount` (null sem snapshot);
- histórico multi-evento paginado (50/100) e borderô CSV streamado no backend;
- FINANCEIRO-2/3 e DESCONTOS-1 preservados. Sidebar do painel sem atalho próprio desta área.

Ainda pendente (próximos cortes):
- Configurações gerais de Eventos;
- split, repasse, transferência, saque;
- privilégio específico para operação que movimenta dinheiro;
- regras avançadas de cupom;
- tela administrativa do override contratual.

CSV no Financeiro do Evento **não** entra mais como pendência desta tela (decisão 2026-09-07).

## PARTICIPANTES-CSV-1 — ESTE PASSO (2026-09-10)

Exportação CSV **real** de participantes do evento atual. Não é borderô. Não é Financeiro.

Implementado neste corte (local, não commitado):
- `GET /api/events/:eventId/registrations/export` autenticado (JWT + `churchId` do token + `eventId` validado no tenant);
- filtros backend iguais à listagem (`search`, `status`, `paymentStatus`, `ticketId`); `page`/`limit` ignorados;
- stream no backend (cursor 200), UTF-8 BOM, delimitador `;`, CSV injection (`= + - @`);
- colunas: 9 fixas + todas as `EventFormField` daquele `eventId` (label real, `order` asc, respostas por `fieldId`). Campo `isSensitive` **entra como coluna** e a célula de valor permanece vazia (valor não é lido). Sem lista global de perguntas.
- CPF **não** entra como coluna; valores de campos `isSensitive` não são lidos nem escritos no CSV (coluna do formulário permanece).
- botão **Exportar CSV** na tela de Participantes (não fake). Redesign visual da lista permanece fora.
- Download: JWT permanece no header `Authorization` (nunca na URL). Em Chromium, `showSaveFilePicker` abre no clique e o `ReadableStream` da resposta é gravado no disco em chunks, sem `blob()` completo. Sem File System Access API (Firefox/Safari), o fallback seguro continua `blob()` — o modelo JWT Bearer **não** permite `<a href>` direto no endpoint.

church-reviewer: **APPROVED**. Validação visual final do usuário. Sem commit/push neste passo.

## FINANCEIRO-3 + DESCONTOS-1 — PASSO ANTERIOR (2026-09-05)

Fonte complementar: `.cursor/rules/financial-security-and-routing.mdc` e `.cursor/rules/events-admin-benchmark.mdc`.

Implementado neste corte:
- taxa padrão da plataforma `10.00` em `packages/events/src/platform-fee.ts` (nunca na UI);
- override contratual `Church.platformFeePercent` (nullable; sem tela neste corte);
- snapshot imutável em `EventPayment` (`platformFeePercent`, `platformFeeAmount`, `netAmount`);
- cards do evento: Valor bruto / Taxa da plataforma / Valor líquido via `eventSales`;
- `EventDiscount` (código + `finalPrice` absoluto + ticket + ativo/inativo);
- checkout público com validação backend do código;
- FINANCEIRO-2 (paginação/filtros) preservado.

Ainda pendente daquele corte, atualizado em 2026-09-10:
- CSV de Participantes — **fechado neste corte** (PARTICIPANTES-CSV-1 local; não CSV no Financeiro do Evento);
- conta de recebimento **global** de Eventos — **fechado em GESTAO-FINANCEIRA-2** (cadastro/máscara/RBAC; split/saque continuam gap);
- regras avançadas de cupom (%, validade, limites, cumulatividade);
- tela administrativa do override contratual.

A taxa de **10%** é decisão do Sistema Igrejas, não do benchmark. Não hardcodar na UI.

## Sequência operacional vigente

Não é arquitetura rígida. É o plano atual (decisão 2026-09-10). A numeração pode evoluir; a regra de extração não.

1. Financeiro do Evento — **concluído** (FINANCEIRO-2/3 + DESCONTOS-1; copy fechada; one-shot local Conferência 2026 GET 100/10/90)
2. CSV de Participantes — **concluído** (PARTICIPANTES-CSV-1 local; PARTICIPANTES-2 em `7093da2`)
3. Dashboard Geral de Eventos — **em andamento** (EVENTS-DASHBOARD-1 local; aguardando validação visual)
4. reorganizar Gestão Financeira na navegação global — **feito neste Dashboard** (nav global; removida do workspace)
5. conta de recebimento da igreja — **feito em GESTAO-FINANCEIRA-2** (cadastro global)
6. operações financeiras: estorno administrativo **feito em FINANCEIRO-OPERACOES-1**; split/subconta/repasse/transferência/saque = **BLOQUEIO PRÉ-PRODUÇÃO**
7. fechar gaps principais do Admin (Preview **feito em EVENTS-PREVIEW-1**; API Keys **feito em EVENTS-ADMIN-ESSENTIALS-1**; Configurações gerais **feitas neste corte**; restam Integrações essenciais PARTIAL, página pública/checkout conforme escopo aprovado)
8. **SEPARAR EVENTOS DO SISTEMA GERAL**
9. ajustes visuais do produto standalone
10. App do Participante
11. App do Organizador
12. pente-fino final completo (Admin/Eventos contra TODOS os benchmarks)

Histórico imediato já encerrado nesta linha: CHECKIN-2 (`0dc71eb`); governança benchmark; PARTICIPANTES-2 (`7093da2`).

## Eventos como produto standalone-ready
Eventos permanece extraível e vendável à parte, na **mesma base neste momento**. Gestão Financeira de Eventos pertence a esse produto. Sem separar repositório, banco, deploy ou autenticação **agora**. Extração física **logo após** os fluxos principais estáveis, **antes** dos apps finais e do pente-fino final (GOVERNANÇA 2026-09-10).

## Capacidades obrigatórias (não opcionais)

1. Pré-visualização do evento: rascunho → pré-visualizar → publicar, sem expor draft indevidamente.
2. API keys reais: criação, revelação segura, não persistir segredo completo na UI, revogação, escopo, multi-tenant. Sem token fake. Arquitetura auditada antes de implementar.
3. Integrações reais equivalentes ao baseline (WhatsApp Business Cloud, Google Ads, Google Analytics, Meta/Facebook Pixel, Mailchimp, RD Station). CONECTAR não pode ser fake. OAuth/segredo/webhook/migration/infra nova exige parar e pedir autorização. Secrets nunca no frontend.

## Pendências visuais já identificadas (NÃO implementar neste passo)

### Participantes
- Visual atual reprovado.
- Precisa redesign operacional.
- Filtros, listagem e status precisam melhorar.
- CSV pertence a esta área (decisão 2026-09-07). PARTICIPANTES-CSV-1: endpoint seguro + botão real **implementados localmente**. Redesign operacional permanece fora deste corte.

### Financeiro do Evento
- Conferência financeira, não caixa operacional.
- Copy **fechada** (2026-09-07): título "Financeiro do evento"; subtítulo "Valor bruto, taxa da plataforma, valor líquido e histórico deste evento."; coluna "Ingresso / lote".
- FINANCEIRO-2 local: paginação/filtros backend, labels Sem cobrança / Lançamento interno. Preservado.
- FINANCEIRO-3 local: cards Valor bruto / Taxa da plataforma / Valor líquido via snapshot em `EventPayment`.
- One-shot local de snapshot **aplicado** (2026-09-07) após SELECT em `igreja-local`: 1 PAID R$100 e 1 PENDING R$100 da Conferência 2026, church.platformFeePercent NULL → 10%. Cards: 100/10/90. PENDING e 10 Transactions órfãs não entram nos cards. One-shot local ≠ produção. Sem backfill de produção.
- CSV **não** pertence a esta tela.
- Conta de recebimento **não** é cadastrada aqui; é configuração global de Eventos.
- Detalhes técnicos não devem dominar a UI.

### Gestão Financeira Geral de Eventos
- Área multi-evento do produto Eventos em `/dashboard/eventos/gestao-financeira`.
- Distinta do `/dashboard/financeiro` da plataforma (dízimo/oferta) e do Financeiro de conferência do evento.
- Borderô real implementado nesta tela. Repasse, transferência e saque continuam sem botão. Estorno administrativo operacional em FINANCEIRO-OPERACOES-1.
- Item na nav global da Dashboard Geral (EVENTS-DASHBOARD-1). Removido do menu do workspace.
- Conta de recebimento global: **IMPLEMENTED** localmente em GESTAO-FINANCEIRA-2.

### Formulário
- Funcionalidade aprovada.
- No pente-fino, revisar poluição visual dos "Campos pré-definidos".
- Evitar duplicação visual desnecessária entre campo disponível à esquerda e preview à direita.
- Possível solução: seção compacta/recolhível e estado "Adicionado".
- NÃO implementar agora.

## App Organizador — depois da extração

Aplicativo operacional da equipe/organizador, separado do App do Participante.

Objetivo previsto: selecionar evento, localizar participante, validar credencial, check-in, consultar inscrição e bloqueios relevantes; QR/scanner somente quando autorizado.

Entra **depois** da separação física de Eventos, dos ajustes visuais do produto standalone e do App do Participante (sequência 2026-09-10). Não exige o pente-fino final completo antes de existir.

NÃO criar arquitetura agora. NÃO criar código agora.

## App do Participante
- Benchmark separado: `.cursor/benchmarks/app-participantes/`
- Não é benchmark Sympla.
- Não expandir agora.
- Entra **depois** da extração física e dos ajustes visuais do produto standalone, **antes** do App do Organizador e do pente-fino final completo.

## Pente-fino
O pente-fino **final completo** (abrir TODOS os prints de `.cursor/benchmarks/events-admin/` e registrar cobertura print por print na matriz) acontece **depois** da extração, dos ajustes visuais e dos apps. Conclusão genérica de equivalência é inválida.

Fechar **gaps principais** do Admin (Preview, API Keys, Configurações gerais e conteúdo público imagem/descrição/local feitos; restam Integrações essenciais PARTIAL, FORMULARIO-1, checkout homologado) acontece **antes** da separação física. Auditoria de extração **feita em 2026-10-27**; extração **não** executada. O pente-fino final não bloqueia a extração.

## Processo obrigatório — Eventos
Antes de propor ou implementar qualquer tela/fluxo de Eventos: `events-admin-benchmark.mdc`, `events-admin-mandatory-process.mdc`, CURRENT.md, EVENTS_MATRIX.md, Arquitetura Viva v5, product-reference-and-layout.md, prints da área, código real.

## Estado operacional
- Criar evento é ação do módulo Eventos. Destino: Dashboard Geral (modal compartilhado) e também o workspace; um único `POST /api/events`.
- Duplicar evento é ação administrativa do evento atual, em Informações.
- Página de inscrição é superfície pública.
- Abrir aplicativo refere-se ao App do Participante.
- Segurança (`security-hardening.mdc`) prevalece sobre equivalência de benchmark.

## Cortes recentes já fechados (referência)
- 7093da2 feat(events): improve participant management experience  ← PARTICIPANTES-2
- 0dc71eb feat(events): improve check-in experience  ← CHECKIN-2
- 4607c13 feat(events): optimize event overview
- 8dacd8b feat(events): improve ticket management workflow
- f487a49 feat(events): improve ticket operational overview
- 114ed06 feat(events): add publication and registration actions
- 9d10ed7 feat(events): add event creation and workspace navigation
- 070ea6d feat(events): add event duplication workflow

## Decisão sobre IA — 2026-10-12
- A IA do Sistema Igrejas geral permanece independente do produto Eventos.
- Auditoria de extração 2026-10-27 avaliou a IA: assistente rule-based em `api-br`, sem pacote/LLM; não bloqueia a extração; não implementar IA de Eventos antes da separação.
- Após a separação, o assistente da igreja deve consumir contrato/API de Eventos em vez de `prisma.event` direto. Somente funcionalidades de IA expressamente aprovadas pelo usuário.
- Preservar a sequência operacional vigente, sem antecipar etapas.
