# Checkout v2 — conexão da política nos builders (2026-10-22)

Os dois `buildApp` instalam a política operacional compartilhada sobre o
checkout legado. `registerPublicEventRoutes` e o callback financeiro
permanecem. Nenhum builder importa `checkout-v2.prepared` nem
`registerClosedPublicCheckout`.

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

Drenagem: `waitCheckoutPendingDrain` no `onClose` dos dois builders. Este corte
valida o script e a drenagem em Redis descartável (55438). **Não** executa o
fechamento em 55439, **não** troca rotas e **não** ativa v2.

## O que este corte não faz

Migrations no principal, deploy, `close()` do gate, `registerClosedPublicCheckout`,
frontend v2, flag de ativação.
