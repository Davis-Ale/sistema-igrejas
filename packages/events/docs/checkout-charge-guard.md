# First-charge durable guard — inactive cut

## Estado preparado atual — 2026-10-17, HEAD cc31472

O guard permanece fora de buildApp/rotas ativas, mas já é consumido pela integração
checkout-v2.integration.ts preparada e pelos dois módulos checkout-v2.prepared.ts.
Isso resolve a antiga pendência de ligação do guard, sem ativar o checkout v2.
A criação continua com STARTED commitado, single owner, adapter fora da transação,
revalidação e preservação do histórico financeiro. Reconciliação de cobrança é
interna e por referência conhecida; não há rota pública de reconciliação.

Os cortes 1 e 2 foram validados com 137/137 isolados e 33/33 PostgreSQL 17 descartável
(mais repetição focada 9/9), com 31 migrations apenas nesse ambiente. Resultados,
limites de reinício e gates operacionais estão em checkout-recovery-delivery-persistence.md.
O consumidor checkoutEmail também já está implementado. Homologação externa,
semântica CARD legada e ativação coordenada permanecem gates.

A descrição abaixo de integração desconectada e os 56/80 testes são evidências do
corte original, preservadas como histórico; não são bloqueios nem totais atuais.
O corte 3 de frontend não altera o guard e tem evidência própria em
checkout-v2-frontend-preparation.md.

## Evidência histórica original — preservada


`checkout-charge.service.ts` adds an isolated guard over the prepared
EventCheckoutChargeAttempt structure. It is not exported by the package entrypoint
and is not called by routes, buildApp, the prepared integration or a worker.
`asaas-checkout-charge.provider.ts` is a separate stateless, dormant adapter.
No schema/migration, rollout, real data, provider request, commit or push was run.
The existing 56 tests/services/prepared route behavior are preserved.

## Protocol

1. Validate the existing strict resume body (ephemeral CPF only) and private
   credential with the common authorization service. Resolve registration from
   that capability, never contacts or old tokens. Under Serializable isolation,
   acquire its key/event/registration locks, then the official transaction's
   existing event-charge mutex and financial row locks.
2. Re-read the scoped Registration/Order/EventPayment/Transaction graph, verify
   links/tenant/event/type/direction/equal amounts, original semantic method and
   related contact ownership. A genuine PUBLIC_ATTEMPT record is required; absence
   of legacy provider references never proves that a historical POST was not sent.
   New issuance also requires a current non-deleted event, pending eligible graph,
   the local registration destination, validated CPF/name and representable amount.
3. Existing consistent references/SUCCEEDED are reused without POST or fabricated
   history. STARTED/UNCERTAIN, method/reference disagreement or ineligible/corrupt
   bindings fail closed. Otherwise insert the unique payment/transaction-bound
   STARTED row with immutable semantic method and NULL provider reference. Commit
   it BEFORE calling the provider; an ambiguous claim commit makes NO POST.
4. Only that successful insert's caller invokes the stateless provider outside all
   database transactions/retry callbacks. Derive a stable idempotency key from the
   scoped persisted attempt/financial tuple and retain the established external
   reference churchId:eventPaymentId:payment. The Asaas adapter sends the existing
   Asaas-Idempotency-Key header and the same AbortSignal to customer/payment POSTs.
   It stops between POSTs when aborted. Credit/debit remain distinct in the guard;
   Asaas uses the approved CREDIT_CARD technical billing type for either.
5. Validate known result ID, external reference, exact value and technical method.
   In a fresh database-only transaction, lock/re-read the same graph/attempt,
   confirm original tuple/amount/method and no conflicting/external-reference reuse,
   then atomically attach Transaction.asaasId, EventPayment.providerPaymentId and
   SUCCEEDED/reference on the SAME intent. All three writes must affect one row.
   No new Registration/Order/Payment/Transaction, status promotion, monetary/fee/
   discount snapshot, participant token, shared contact or sent-email marker write.
6. Timeout, malformed/mismatched receipt or post-intent failure records UNCERTAIN
   with a validated known reference when available. If that write cannot complete,
   durable STARTED still blocks creation. A committed SUCCEEDED is never downgraded
   by an ambiguous finish response. Late results do not silently complete/reset or
   start another attempt. Abort is NOT proof that the external POST did not occur.
7. Reconcile explicitly using the same scoped private capability and an existing
   intent, with a known provider ID from trusted backend evidence. GET only; validate
   exact ID/reference/value/method, reread bindings and finish the same attempt
   atomically. No automatic reconciliation, public body accepting provider IDs,
   worker, admin permission policy or retry/restart by absence was added here.

## Retry and timeout boundaries

- Database-only serialization/deadlock failures have at most two retries. Claim
  additionally retries only the prepared payment/transaction intent uniqueness
  constraints after a stale snapshot, bounded to three claim attempts. Unrelated
  constraints and ambiguous database timeouts do not retry automatically.
- External customer/payment POSTs never occur in a retry callback. A completed
  first charge reuses the committed result even without CPF on a later request.
- The guard's external deadline defaults to 30 seconds. AbortSignal is passed
  through an optional AsaasRequestOptions field; existing callers without signal
  keep their prior behavior. Timeout/lost responses/crash after intent commit are
  always blocked until verified reconciliation, including failure before the
  payment POST when absence cannot be established safely by this protocol.
- Only a validated known provider ID may be retained as financial evidence.
  Provider error bodies, API/private keys, CPF/customer data and responses are
  neither persisted in the intent nor logged/rethrown as error causes.
- Completion preserves known financial evidence after capability expiry/revocation
  during the POST. Its internal receipt grants no checkout/participant eligibility;
  a future caller must retain the prepared response reauthorization/allowlist.

## Proven limits / remaining gates

The isolated transaction double checks ordering, single-owner behavior, rollback,
ambiguous commits, concurrent callers, timeout/late results, bounded retries and
metadata-based reconciliation. It does NOT prove PostgreSQL constraints/SSI/locks,
cross-process behavior, Asaas honoring idempotency headers or external delivery.
Those proofs require an authorized isolated database/provider environment.

There is intentionally no automatic proof-of-absence/reset/reissue path. If no
known matching provider ID can be established, the intent stays blocked. Conflicting
references/amounts/methods require a separate approved operational resolution.

The prepared route integration still refuses first-charge creation: this cut does
not connect the guard to it. Neither the current unsafe legacy charge callback nor
the stateless adapter may coexist with a v2 activation that bypasses this guard.
Exclusive cutover on BOTH servers, local checkoutEmail consumer adaptation, legacy
CARD semantics and human evidence/channel policy remain the prior activation gates.
No new worker, webhook/cancellation/refund, UI or activation stage was introduced.

## Validation

80 isolated tests passed: 56 prior tests plus 24 guard/adapter tests. Fastify,
Prisma and provider activity are simulated; fetch is mocked in the transport test.
No buildApp, real PrismaClient, database, network provider or destructive test runs.
TypeScript passed for events/guard/test sources, financial, events-api and api-br;
diff check passed. Schema/migration and existing inactive integration were
compared against the beginning-of-cut contents and preserved.
