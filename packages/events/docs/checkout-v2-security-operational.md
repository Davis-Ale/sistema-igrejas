# Checkout v2 — preparação operacional Redis/segurança (2026-10-20)

Base: `9624314`. Este corte prepara o store Redis compartilhado e o contrato
de configuração das duas APIs. Nenhum `app.ts`/`server.ts` importa o módulo.
Checkout v2 permanece inativo. Nenhuma migration no banco principal, nenhum
deploy e nenhum valor comercial de produção foi escolhido.

## O que foi reutilizado

- `createRedisCheckoutSecurityStore`, Lua de consume/close, `prepareCheckoutSecurity`
  e os wrappers `prepareApiBrCheckoutSecurity` / `prepareEventsApiCheckoutSecurity`.
- ioredis já declarado em `api-br` e `events-api`. Nenhuma dependência nova.
- O compose padrão continua só PostgreSQL.

## Artefatos

- `packages/events/src/checkout-security.operational.ts` — parser, classificação
  da URL, fingerprint idêntico ao da política preparada, init explícito do gate.
- Wrappers inativos em `apps/api-br` e `apps/events-api` (`checkout-security.operational.ts`).
- Overlay local `docker-compose.checkout-redis.yml`: Redis 7, `127.0.0.1:55439`,
  AOF `always`, ACL `checkout_runtime` sem `+set`, senhas obrigatórias via env.
- Init administrativo:
  `node --import tsx --tsconfig tsconfig.base.json packages/events/test/init-checkout-security-gate.mjs --initialize-legacy-gate`
  Só loopback; recusa `CLOSED`/`V2` e fingerprint divergente; não reabre gate.
- Ativação administrativa `CLOSED → V2`:
  `node --import tsx packages/events/test/activate-checkout-security-v2-gate.mjs --activate-checkout-v2-gate`
  Só loopback; recusa missing/`LEGACY`/fingerprint divergente; não volta a `LEGACY`.

## Contrato de env (sem defaults)

Todas as chaves são obrigatórias para `loadCheckoutSecurityOperational`:

`REDIS_URL`, `CHECKOUT_SECURITY_ORIGINS`, `CHECKOUT_SECURITY_BUCKET_SECRET` (≥32),
limites numéricos positivos, `CHECKOUT_SECURITY_ALLOW_LOCAL_HTTP` e
`CHECKOUT_SECURITY_HTTPS_ONLY` (`true`/`false`). `REDIS_URL` exige usuário
`checkout_runtime`, path `/0`, sem query/hash. Loopback aceita `redis://`;
fora de loopback exige `rediss://`. `CHECKOUT_REDIS_ADMIN_URL` é só do init
(`user default`, loopback).

As duas APIs devem receber o mesmo conjunto. Fingerprint divergente continua
fail-closed (503). Inspect reporta apenas presença/classificação.

## Como subir o Redis local (não é deploy)

```
CHECKOUT_REDIS_PASSWORD=... CHECKOUT_REDIS_RUNTIME_PASSWORD=... \
  docker compose -f docker-compose.checkout-redis.yml up -d
```

URL runtime: `redis://checkout_runtime:<runtime>@127.0.0.1:55439/0`.  
URL admin: `redis://default:<admin>@127.0.0.1:55439/0`.

O volume local `checkout_redis_data` não é política de backup. Restaurar um
snapshot antigo com `LEGACY:` não vale como fechamento durável.

## O que este corte não faz

Não liga builders, não fecha o checkout legado, não aplica migration, não
homologa Asaas/Resend, não escolhe origens/limites/secret de produção, não
endurece Next/scripts e não autoriza contenção/ativação do v2.

Conexão posterior da política nos builders, com legado preservado:
`checkout-v2-security-builder-connection.md`.
