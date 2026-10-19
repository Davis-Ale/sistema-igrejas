# Checkout v2 — isolated PostgreSQL integration validation (2026-10-14; consolidated 2026-10-15)

## Corte 5 — integração isolada, 2026-10-19

Base `69481eb`: seis casos novos, três corridas de webhook reproduzidas/corrigidas,
**39/39** PostgreSQL reais e **173/173** isolados aprovados. As mesmas 31 migrations
foram aplicadas/replay somente nos descartáveis; sem banco principal ou ativação.
Protocolos, composição das duas APIs, falhas de e-mail e sinal intermitente de
recuperação em `checkout-v2-integrated-validation.md`. Os números históricos abaixo
continuam datados e não substituem essa evidência de integração.

## Consolidação atual dos cortes 1 e 2 — 2026-10-17, HEAD cc31472

- Isolados: **137/137** em dez arquivos de checkout, com credencial Asaas sintética
  exigida pelo mock, sem DATABASE_URL/DIRECT_URL da aplicação.
- PostgreSQL 17 descartável: **33/33** completos e repetição focada final **9/9**.
- **31 migrations** aplicadas exclusivamente no banco descartável; replay sem
  pendências, containers removidos e demais containers preservados.
- Prisma validate, TypeScript dos serviços/testes e ambos servidores, runner syntax
  e diff check aprovados. Sem acesso ao banco principal/5433, generate ou envio real.

O runner padrão agora inclui os 24 testes anteriores e os 9 de entrega assistida.
--recovery-delivery-only seleciona os 9 de entrega; --affected-only e
--concurrency-only preservam os recortes anteriores. Os modos são exclusivos.
Reinício foi simulado por descarte do coordenador e outro cliente Prisma; não se
alega teste de kill do processo nem homologação de provider externo.

Detalhe: checkout-recovery-delivery-persistence.md. O corte 3 do frontend tem prova
separada em checkout-v2-frontend-preparation.md e não aplica migrations ou executa
banco. Os 24/24, 101/101 e 30 migrations abaixo continuam válidos como evidência
datada de 2026-10-15, sem substituir os totais acima.

## Relatório histórico de 2026-10-14/15 — preservado


Initial authorized cut (historical): create a disposable PostgreSQL 17 environment, apply existing migrations only there, execute integration tests with synthetic data and a simulated Asaas provider. No production-service correction, schema/migration edit, route activation, existing database/volume access, seed, generate, commit or push.

## Current consolidated result (2026-10-15)

**PostgreSQL 17: 24/24 passed. Affected cases: 4/4 passed. Isolated checkout regressions: 101/101 passed.** No failed, skipped or cancelled tests in those final runs; exit codes 0. TypeScript passed for Events, events-api, api-br and the three changed test files. Runner syntax and git diff --check also passed.

The earlier results below are retained as chronological evidence, not current blockers. Their advisory-lock, 23505/40001 and timeout-test failures were addressed and revalidated in later authorized cuts. The final corrections, evidence and remaining limits are consolidated at the end of this document. No route activation or external-provider homologation is implied.

## Reproduction

From the repository root, using Git Bash:

~~~bash
node packages/events/test/run-checkout-postgres.mjs
~~~

The runner requires Docker access. It creates a UUID-labelled postgres:17-alpine container with auto-remove, a fresh uniquely named checkout_v2_test database and random ephemeral credentials. Only 127.0.0.1:55437 is published; collision fails rather than changing to the shared 5433 port. PostgreSQL data and socket storage use tmpfs; inspect rejects existing volumes/bind mounts. TCP readiness avoids the temporary initdb Unix socket server.

Before migration, it verifies the database name, dedicated migration role, PostgreSQL major version 17, empty public schema and unique cluster_name marker. The child receives an allowlisted environment and the explicit test DATABASE_URL; application env variables and credentials are not inherited. Prisma migrate deploy applies all 30 existing SQL migrations, including CHECKs and the partial index that db push would omit. A second deploy verifies no pending migrations. No seed or generate is run.

Services/tests use an explicit checkout_runtime URL, never DATABASE_URL/dotenv/buildApp. The runtime role is not superuser and cannot create databases, roles or public tables. URL guards reject missing URL, shared database/5433, remote hosts, wrong role, query overrides and incorrect database identity. Before fixtures, the suite verifies the marker/version/user again. fetch is forbidden, the payment provider is an in-memory simulator and confirmation delivery is a callback. No Asaas/Resend request or real credential is used.

Finally, ownership/name/UUID label are verified before stopping only the created container ID. Auto-remove destroys its tmpfs data. Final inventory comparison verifies that other container IDs/names are preserved, including on test failure. No Docker volume deletion, Compose mutation or existing-container stop is used.

## Initial validation result (historical)

Disposable database: checkout_v2_test_4f0dc3975e84407d815009fa905e9262 at 127.0.0.1:55437. It no longer exists; the container was removed. All 30 migrations applied successfully; replay: no pending migrations. Toolchain: Prisma/client/adapter-pg 7.8.0 and pg 8.23.0. Node test runner: **24 tests, 14 pass, 10 fail, 0 skipped**, exit code 1. These are new real-database tests, not a rerun/replacement of the prior 95 simulated tests.

Passed:
- Migration ledger, CHECKs and partial unique index existence; runtime privilege restrictions and URL guards.
- Hash/source/24h TTL/revocation/email checks; tenant/event composite foreign keys; credential and single-unrevoked uniqueness including an expired grant.
- Charge intent uniqueness and state/reference checks; persistent recovery audit role/evidence/access ownership and operation UUID uniqueness.
- Independent PostgreSQL row/advisory lock contention, SQLSTATE 55P03 lock timeout, release on rollback, and actual Serializable stale-write rejection with SQLSTATE 40001.
- Sale factory financial invariants for PIX, credit and debit: official PIX/CARD, one linked graph, 100 gross / 10 fee / 90 net; no provider references or confirmation markers fabricated.
- Rollback of Visitor/Registration/Order/Payment/Transaction on a CHECK violation; two connections contend for one durable intent without changing the financial graph.
- Shared confirmation consumer: PENDING suppresses delivery; simultaneous confirmed attempts deliver once and persist one marker with the local checkoutEmail under real row locks.

Failures at that stage (subsequently resolved):
1. Attempt creation/replay.
2. Concurrent independent Prisma clients creating the same attempt.
3. Durable PIX intent/POST/reference completion/retry.
4. Concurrent first-charge single owner.
5. Provider timeout/UNCERTAIN/restart/reconciliation.
6. PIX resume/QR/PENDING DTO.
7. Credit/debit semantic intent preservation through charge creation.
8. Expected legacy CARD reconciliation error.
9. Expected scope/revocation authorization errors.
10. Administrative recovery/replay.

The direct failures have the same root blocker: Prisma $queryRaw cannot deserialize PostgreSQL's void return from SELECT pg_advisory_xact_lock(...). The error is a PrismaClientKnownRequestError with raw query code N/A and message Failed to deserialize column of type void. Reproduced at checkout-access.service.ts lockAttempt line 95 and lockRecovery line 253. Remaining failed assertions are consequences of interruption at this boundary, not ten independently proven financial defects. The concurrent charge test observes zero simulated POSTs. No claim is made that service idempotency/retries, external timeout, charge reference completion, or full PIX flow passed PostgreSQL validation.

The same query shape existed in the isolated charge service. Its downstream behavior still needed retesting after an authorized correction at that stage. The subsequent correction preserved the same transaction-scoped lock and order while avoiding a returned void column; the initial validation cut deliberately left production services unchanged. No schema/contract/backfill or historical CARD reclassification was justified by this finding. The later correction and successful retest are consolidated below.

The pg driver also emitted a deprecation warning about overlapping client.query calls through the current Prisma adapter. This did not fail the independent passing cases; it is recorded, not assigned an unproven integrity impact.

## Runner corrections during this cut

The initial inspection assumed tmpfs would appear in Mounts; Docker reports the --tmpfs entries in HostConfig.Tmpfs. That attempt stopped before migration. The owned container was identified, verified and removed. Another attempt hit Connection terminated unexpectedly during initial startup; readiness was changed to TCP (not the temporary Unix-socket init server). That container was also removed. The final complete run above is after both runner corrections.

## Initial validation limits and preservation (historical)

TypeScript passed for events source and the new PostgreSQL test; node --check passed for the runner. git diff --check passed. The prior tracked diff is byte-identical, so existing production/schema/migration/frontend changes are preserved. Only this suite, runner and documentation/governance notes were added/edited. The 95 prior tests were not rerun because production source was not changed.

Real PostgreSQL locks/constraints and selected financial invariants now have evidence. Actual Asaas idempotency/delivery remains outside this simulated-provider cut. Legacy CARD without a reliable semantic method stays blocked, without reclassification or replacement. Both v2 route bundles remain inactive. Runtime service fixes and any further activation remain a separately authorized cut.

## Authorized access-lock compatibility correction (2026-10-14; historical stage)

Only checkout-access.service.ts was changed: the four existing SELECT pg_advisory_xact_lock(hashtextextended(..., 0)) calls now cast their discarded result to text. The transaction-scoped function, hash inputs/seed, lock order, isolation, retries, credentials and all financial behavior remain unchanged. No process/memory lock replacement, schema/contract/migration edit or charge-service change.

Reexecuted the same 24 PostgreSQL tests in checkout_v2_test_f51f0c43fe8b401e81eebca5dfce0de6 on 127.0.0.1:55437 with PostgreSQL 17, tmpfs and explicit guarded URLs. All 30 migrations applied; replay had no pending migrations. Result: **19 passed, 5 failed, 0 skipped**, exit code 1. Container removed; other container inventory preserved. The five recovered cases are actual attempt/replay, concurrent same-key creation, legacy CARD semantic blocking, scope/revocation denial and SUPER_ADMIN recovery/replay. Those cases now pass with the real Prisma client/adapter.

The remaining failures are durable PIX create/retry, concurrent charge owner, external timeout/UNCERTAIN/reconciliation, PIX resume/QR and semantic card-charge preservation. Each is interrupted at checkout-charge.service.ts:73: its own SELECT pg_advisory_xact_lock still returns void through queryRaw. This blocker is now directly reproduced after access authorization succeeds, instead of inferred from source. Charge concurrency observed zero simulated POSTs. No successful external timeout/reconciliation/charge retry validation is claimed; those test bodies do not get past the financial advisory-lock boundary. The requested correction was explicitly limited to checkout-access.service.ts, so the charge service was preserved.

The 95 existing isolated protocol/contract tests were rerun after this production-source change: 95/95 passed. TypeScript source/tests and both API consumers passed, as did git diff --check. No shared database (5433), provider request, historical charge reclassification, route activation or commit/push. Further charge-lock correction and another isolated run were pending authorization at the end of that phase; they were subsequently authorized and completed as recorded below.

## Final corrections and investigation (2026-10-15)

### Advisory locks — real Prisma compatibility failure

The charge service received the same discarded-result ::text cast already validated in the access service. PostgreSQL's void result could not be deserialized through queryRaw. Only the returned column type changed: pg_advisory_xact_lock, hashtextextended inputs/seed, transaction scope, lock order, Serializable isolation and uniqueness remained intact. No process-local replacement lock or constraint weakening was introduced. The void blocker is resolved.

### 23505 and 40001 — real error-handling failures

The installed Prisma pg adapter exposes raw SQL errors as P2010 with meta.driverAdapterError.cause.originalCode/originalMessage; the previous code expected meta.code/message. Charge handling was corrected for its known 23505 constraints. The later investigation reproduced a P2010/40001 escaping the access service, which still read only the older format.

Access now recognizes both formats for serialization/deadlock and the already scoped unique-conflict allowlist. Constraint names must match the known name, either directly or quoted in the database message; unrelated or similar names and unexpected errors are propagated. The existing maximum of three transaction attempts and rollback behavior remain unchanged.

Charge handling returns CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED when known serialization/deadlock retries in access are exhausted, without restarting that retry budget. Its existing bounded retry for charge-specific unique conflicts remains. No provider POST occurs inside a transaction/retry: only the owner of the committed STARTED intent may POST. STARTED/UNCERTAIN cannot reset or automatically reissue. Tests verify one intent, one simulated POST, atomic matching references and financial preservation. The previously exposed 23505/40001 failures are resolved in the final runs.

### Timeout/abort — observation race in the test

The timeout mock awaited a SQL query before registering its abort listener. If the 100ms deadline fired during that await, the signal was already aborted and the late listener missed the event. Production already called controller.abort() on deadline; existing service tests verified signal.aborted. A controlled diagnostic confirmed an aborted signal with one early-listener event and zero late-listener events.

The mock now captures the signal and registers its listener immediately, without a database probe inside the external-provider deadline. It asserts both signal.aborted and the observed event. The dedicated PIX intent test continues to verify committed STARTED visibility before the POST. The external timeout remains 100ms in the PostgreSQL test; no production deadline was changed. UNCERTAIN persistence, restart/retry blocking, rejected mismatched evidence and matching GET-only reconciliation all passed, with no second POST or financial rewrite.

### Two 5-second transaction expirations — not reproduced

In the earlier 20/24 run, concurrent attempt creation expired after 6459ms against Prisma's default 5000ms transaction budget. The recovery case expired at the sale() fixture commit after 5809ms, before recovery itself ran. These messages prove budget overruns, not a recovery defect or duplicate charge.

Neither expiration reproduced in the fresh-database investigation before functional corrections: concurrent attempt creation passed in 1600.9871ms and recovery in 353.371ms. Both passed again in the focused and full final runs. Transaction timeouts remain at the original 5 seconds; no timeout increase, factory change, lock relaxation or infrastructure change was justified. **The historical cause of the slow execution remains undetermined.** No claim is made that a physical environment cause was identified or repaired.

## Final execution evidence and preservation

The runner's --affected-only mode selects the four pending cases; the default mode still executes all 24. --concurrency-only remains available for the charge case. All use the same guarded isolated environment and cleanup checks described above.

| Execution | Disposable PostgreSQL 17 database | Result |
| --- | --- | --- |
| Investigation before functional corrections | checkout_v2_test_d08e763e3d34493bb1341655e8a7307d | 3/4 passed; reproduced P2010/40001 |
| Four affected cases after corrections | checkout_v2_test_861fdd03652a410e9ac1aa0dbc80e620 | **4/4 passed**, exit 0 |
| Complete suite after corrections | checkout_v2_test_709343af47854b9f97cd7fa8860ded95 | **24/24 passed**, exit 0; 14958.9264ms |

All three used 127.0.0.1:55437, tmpfs, unique database/cluster markers, ephemeral credentials and restricted runtime roles. All 30 existing migrations applied only there; replay found no pending migrations. Each container was removed, with other-container inventory preservation confirmed. Port 5433 and the current database were not accessed; no existing volume was modified.

Two new regression checks failed before the functional correction (38/40) and passed afterward (40/40). The final seven-file isolated checkout regression suite passed **101/101**, with simulated providers and DATABASE_URL/DIRECT_URL removed. TypeScript passed for packages/events, apps/events-api, apps/api-br and the changed access-service, charge-service and PostgreSQL test files. node --check for the runner and git diff --check passed.

Evidence artifacts retained with the validation report: pg-four-before-fix.log, pg-four-after-fix.log, pg-full-after-four-fix.log, checkout-regression-before-four-fix.log, checkout-regression-after-four-fix.log and checkout-101-after-four-fix.log. These are execution artifacts outside the repository; no real credentials or provider requests were used. Existing local changes were preserved. No schema/migration edit, route activation, commit or push was performed.

There is no remaining blocker in the executed suite. The pg overlapping-query deprecation warning persists, without a demonstrated causal link to the historical failures. Historical 5s slowness remains unexplained. Real Asaas idempotency/delivery, Resend delivery and coordinated route activation remain outside this simulated-provider validation; legacy CARD without reliable semantic evidence still requires reconciliation, without invented reclassification or replacement.
