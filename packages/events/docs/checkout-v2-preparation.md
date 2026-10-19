# Checkout v2 integration preparation — inactive

## Estado preparado atual — 2026-10-17, HEAD cc31472

O guard da primeira cobrança está ligado à integração v2 preparada. Os dois
módulos checkout-v2.prepared.ts fornecem createAsaasCheckoutChargeProvider, e resume
usa createFirstCheckoutCharge quando o grafo elegível ainda não possui referências
ou tentativa. STARTED/UNCERTAIN continuam bloqueados para reconciliação explícita;
nenhuma criação ocorre dentro de transação/retry. A recuperação exige o coordenador
assistido com entrega durável; sem configuração retorna 503 e rejeita chave do
operador. Nenhum buildApp/page ativo conecta esses módulos.

Os cortes 1 e 2 registraram 137/137 testes isolados, 33/33 PostgreSQL 17 descartável,
9/9 na repetição focada e 31 migrations/replay apenas no descartável. Consulte
checkout-recovery-delivery-persistence.md. Esses números não incluem o corte 3 de
frontend, documentado separadamente em checkout-v2-frontend-preparation.md.

As afirmações abaixo sobre guard desconectado, recusa de primeira cobrança e
56 testes pertencem ao recorte histórico inicial. Não descrevem o estado preparado
atual. A ativação continua pendente de corte coordenado, exclusividade das rotas,
CORS/redaction/hardening, evidência humana, semântica CARD legada e homologação real.
A adaptação do consumidor checkoutEmail já existe; não representa envio homologado.

## Evidência histórica original — preservada


Subsequent isolated cut: the first-charge guard is now implemented in
`checkout-charge.service.ts` with a separate dormant Asaas adapter. See
`checkout-charge-guard.md` for its protocol and 80 isolated tests. This prepared
integration remains unchanged and does NOT call the new guard; the first-charge
refusal below remains its current behavior until a separately authorized wiring cut.

This cut prepares code, not a rollout. Neither `apps/api-br/src/app.ts` nor
`apps/events-api/src/app.ts` imports/calls its `checkout-v2.prepared.ts` module.
No route is registered, intercepted, disabled or blocked by this preparation.
There is no environment flag to enable one server independently. The existing
public behavior, general JWT, checkInToken, webhook and financial operations stay
unchanged. The 41 earlier access/recovery tests and their services are preserved.

## Audit of both servers before editing

Both `server.ts` files call their own `buildApp`. Both builders register the same
`registerPublicEventRoutes` from `packages/events/src/public.routes.ts` and have
duplicated payment callbacks. The critical legacy entrypoints are:

| Entry | Current behavior | Prepared replacement |
| --- | --- | --- |
| POST `/public/events/:eventId/register` | Legacy creator and payment callback | Backend event/tenant resolution, strict v2 body/private header, common transactional creation |
| POST `/public/churches/:churchSlug/events/:eventSlug/register` | Contact lookup/deduplication, legacy creator and callback | The same common transactional creation/fingerprint as the ID route |
| POST `/public/churches/:churchSlug/events/:eventSlug/checkout/status` | Body checkoutToken and legacy token minting | Empty strict body, private header, scoped authorization and allowlisted response |
| Future status/resume for either event identity | No v2 consumer | Prepared strict status/resume descriptors for both identities |
| Current payment callbacks in both builders | May delete/reset references on method change; creation inside transaction | Separate read-only known-charge adapter; no delete, reset, replacement or speculative creation |
| Future administrative recovery/revocation | No connected endpoint | Prepared JWT/current SUPER_ADMIN descriptors invoking the already audited recovery service |

The legacy public registrar combines read-only event/discount/app-access routes
with unsafe checkout entries. It cannot be registered beside the prepared bundle.
During a FUTURE authorized cutover, preserve its independent read/access routes
but remove/replace all critical entries in BOTH builders. Participant app access
still uses its separate checkInToken/eligibility; general JWT is not a checkout key.

## Prepared implementation

- `checkout-v2.routes.ts` returns eight dormant Fastify route descriptors, never
  calls `app.route/register` and is not exported from the package entrypoint.
  `assertNoLegacyCheckoutRoutes` is a read-only inventory gate for future
  composition; it rejects existing register/status/resume critical paths. It is
  not called on the current builders and does not block their routes.
- Both server-specific prepared modules supply read-only Asaas GET/PIX adapters
  to the same provider-neutral integration. They do not reference the legacy
  creation, deletion/reset or payment callbacks. Simply importing/preparing the
  bundle performs no database/provider work or route registration.
- The private header is the only checkout capability. No contacts, old tokens,
  caller-provided tenant, registration/payment IDs, price or payment method are
  accepted for status/resume. Event/tenant comes from the persisted public route;
  registration comes from the bound access. All responses have no-store and an
  explicit allowlist. Pending/cancelled/waitlisted responses never expose the
  participant token; eligible paid/free records retain the existing eligibility.
- The v2 registration factory reuses the existing sale validation/persistence
  flow inside the SAME access transaction. It skips legacy contact deduplication
  and test auto-confirmation; the common service handles key retries and contact
  assistance. It creates one official Order/Payment/Transaction graph, preserving
  discount/fee snapshots. New v2 financial methods are PIX or CARD while access
  preserves credit/debit semantics. Legacy calls retain the original behavior.
  `resolveApplicableEventDiscount` accepts the two delegates it needs, allowing
  the existing discount logic to run within this same transaction.
- Registration returns the persisted state and original absolute expiry without
  minting checkoutToken or calling a provider. Payment has a dedicated resume
  path, so adding CPF does not rewrite the immutable registration fingerprint.
- Known-charge resume validates tenant/event/registration/order/payment/official
  transaction links, equal totals, immutable semantic method and matching known
  provider references. It reauthorizes and rechecks state/binding after external
  GET/QR. Provider confirmation alone neither writes financial status nor grants
  participant eligibility; the existing authenticated webhook remains responsible.
- Admin descriptors own their JWT preHandler, require the current middleware
  SUPER_ADMIN/tenant, and pass only that backend context plus scoped params to
  recovery/revocation. No body actor/tenant override; existing persistent audit,
  fresh-key retention, email rules, human attestation and safe replay are reused.

## Proven blockers / boundaries

1. **New charge creation is not prepared.** The current financial adapter invokes
   provider creation inside a transaction and does not consume the durable
   EventCheckoutChargeAttempt STARTED/SUCCEEDED/UNCERTAIN protocol. An uncertain
   external result cannot safely be retried by adapting that callback. The dormant
   integration refuses first-charge creation with
   CHECKOUT_CHARGE_CREATION_NOT_PREPARED, and refuses STARTED/UNCERTAIN or reference
   disagreements with CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED. It fabricates no
   historical intent, resets nothing, and adds no new provider mechanism in this cut.
2. **Legacy CARD semantics may be unavailable.** Transaction.method CARD does not
   identify credit versus debit. Missing persisted access/attempt semantics fail
   closed rather than selecting a method. Known legacy PIX is unambiguous and can
   be read only when both official provider references agree.
3. **Local email consumer implemented in the subsequent isolated cut.** See
   checkout-confirmation-recipient.md: the shared consumer now prioritizes local
   checkoutEmail while preserving eligibility and the sent
   marker under the existing lock. Actual PostgreSQL/transport proof remains
   pending before activation; no prepared/public route is connected by that cut.
4. **Operational human evidence/channel delivery remains undefined** as already
   documented. The prepared operation records attestation; it is not automated
   proof or actual delivery. Do not activate admin recovery without that policy.
5. Migration remains unapplied and the client represents the old schema. New-table
   integration queries are typed, parameterized SQL. No schema/migration change or
   generation is necessary for this preparation. PostgreSQL constraints/locks,
   external provider behavior, delivery and cross-process cutover remain unproved
   by the isolated protocol doubles; an authorized isolated environment is needed.

## Future exclusive activation gate — not executed

Obtain a separate authorized activation cut. Close the affected public entries on
BOTH servers, drain old requests, apply the reviewed migration only when authorized,
complete the proven blockers and coordinated v2 clients/handlers, configure both
loggers to redact the private header and both CORS policies to permit that header
(`CHECKOUT_V2_LOG_REDACTIONS` / `CHECKOUT_V2_ALLOWED_HEADERS` are prepared constants,
not current configuration changes), and replace the legacy critical registrations.
Verify the inventory gate on BOTH compositions and rejection of legacy tokens and
negative authorization paths before reopening. Do not register alternate v2 URLs
while old authorization remains reachable, accept dual credentials or fall back
after v2 failure. Keep webhooks/check-in/general JWT operating. Rollback keeps the
affected checkout closed, never restores unsafe fallback. No step was run here.

## Isolated validation

56 tests passed: the 41 previous tests plus 15 integration tests. New checks cover
both route identities and cross-route key retry, old-token/contact rejection,
scoped response eligibility, JWT/current-role admin binding, known-charge reads,
reconciliation/refusal paths, provider-read races, shared transaction/financial
snapshots, legacy deduplication parity and physically inactive production builders.
Fastify.inject uses fake Prisma/provider objects and a test-only JWT secret; no
buildApp, PrismaClient, network provider or real/destructive database test is run.
TypeScript passed for events, events-api, api-br and the isolated test sources;
diff check passed.
