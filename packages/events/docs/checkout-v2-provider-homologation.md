# Checkout v2 — preparação de homologação Asaas/Resend (2026-10-20)

Base: `6852e15`. Este corte classifica a prontidão de Asaas e Resend sem
criar cobrança, sem enviar e-mail e sem ligar o checkout v2. Builders ativos
permanecem intactos.

## Como verificar

```
node --import tsx packages/events/test/inspect-checkout-operational.mjs
node --import tsx packages/events/test/inspect-checkout-operational.mjs --provider-readonly
```

`--provider-readonly` só faz GET em `myAccount/status`, `webhooks` e
`/domains`. O relatório e o bloco `homologation` não incluem secrets, URLs de
webhook, e-mails nem corpos de provider.

Webhook Asaas sandbox exige HTTPS fixo em `ASAAS_WEBHOOK_PUBLIC_URL`
(`https://…/webhooks/asaas`). Infra compatível: overlay Caddy
`docker-compose.api-https.yml` na frente do `api-br` existente (`:3333`),
Let’s Encrypt, hostname público já pertencente ao operador. Cloudflare
Tunnel, trycloudflare e Railway são recusados. O overlay não sobe no
compose padrão e não publica sem `API_PUBLIC_HOST` autorizado. Aplicação no Asaas:

`node --import tsx packages/events/test/apply-checkout-asaas-webhook.mjs --apply-asaas-sandbox-webhook`

Não cria túnel, não publica hostname e não corre sem URL autorizada.

## Contrato reutilizado

- Asaas: `createAsaasClient`, webhook `POST /webhooks/asaas` nas duas APIs,
  adapter de cobrança v2 ainda inativo.
- Resend: confirmação existente e `createCheckoutRecoveryResendSender`.
  Recuperação assistida exige remetente e-mail nu; confirmação aceita o mesmo
  valor. Sem `EVENTS_EMAIL_FROM` / `EVENTS_APP_BASE_URL` o caminho ativo cai
  em defaults de desenvolvimento (`onboarding@resend.dev` e `localhost:3003`).

As duas APIs precisam da mesma chave/ambiente/token Asaas e do mesmo
Resend/remetente/URL do participante.

## O que este corte não faz

Não cadastra webhook no Asaas, não cria domínio no Resend, não escreve `.env`
real, não cobra, não envia e-mail, não aplica migration e não ativa v2.
