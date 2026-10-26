# Checkout v2 — conexão da política nos builders (2026-10-22)

Os dois `buildApp` instalam a política operacional compartilhada e a
composição exclusiva v2. O callback financeiro legado saiu das rotas
públicas. `registerClosedPublicCheckout` não é ligado: o rollback é
`CLOSED` + drenagem. Sem flag de ambiente.

## O que foi ligado

- `Fastify(security.fastifyOptions)` e `await security.install(app)` na raiz,
  antes de JWT e rotas, nas duas APIs.
- CORS passa a ser o da política (origens exatas). `origin: true` saiu dos
  builders.
- Redis runtime é desconectado no `onClose`.

## Contenção coordenada — preparada, não executada no gate de homologação

A coordenação é o gate Redis compartilhado que os dois builders já consomem.
Não há proxy/ingress extra: um `CLOSED` persistente 503 nas duas APIs. Apagar
a chave não reabre (fail-closed). `LEGACY` recusa sobrescrever `CLOSED`.

Script administrativo, só loopback, flag explícita, cliente admin (`+set`):

`node --import tsx packages/events/test/close-checkout-security-gate.mjs --close-checkout-gate`

Ativação administrativa `CLOSED → V2`, só loopback, flag explícita, mesmo fingerprint:

`node --import tsx packages/events/test/activate-checkout-security-v2-gate.mjs --activate-checkout-v2-gate`

Drenagem: `waitCheckoutPendingDrain` no `onClose` dos dois builders. Os scripts
são validados em Redis descartável (55438). Sem retorno a `LEGACY`.

## Composição exclusiva v2 — ligada nos builders e na página pública

`registerExclusiveCheckoutV2` omite os handlers legados e instala o bundle v2
já validado das duas APIs. A página pública usa `PreparedPublicEventV2`. Preview
continua sem cliente de checkout. Rollback validado: `close()` 503, drenagem,
`registerClosedPublicCheckout` recusa coexistir; o callback legado não volta.

`server.ts` e o index do pacote não importam o compositor. Sem flag, sem
`close()` do gate de homologação, sem migration no principal.

## O que este corte não faz

Migrations no principal, deploy, `close()` do gate de homologação, flag de
ativação. Sem a migration aditiva e sem `CLOSED` no gate, a admissão real
permanece impedida.
