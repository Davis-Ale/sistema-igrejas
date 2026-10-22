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

## Contenção preparada, não executada

Script administrativo, só loopback, flag explícita:

`node --import tsx packages/events/test/close-checkout-security-gate.mjs --close-checkout-gate`

Usa o cliente admin (`+set`) porque o ACL `checkout_runtime` não tem `+set`.
Este corte **não** executa o script, **não** troca as rotas pela composição
fechada e **não** ativa v2.

## O que este corte não faz

Migrations no principal, deploy, `close()` do gate, `registerClosedPublicCheckout`,
frontend v2, flag de ativação.
