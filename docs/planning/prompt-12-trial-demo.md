# Prompt 12 — Trial/demo profissional e bloqueio automático

## Objetivo

Permitir que uma igreja/pastor teste o sistema por aproximadamente 15 dias com um tenant próprio, login real e módulos disponíveis para avaliação.

Depois do período de teste, o acesso deve ser bloqueado automaticamente, salvo se a igreja contratar uma assinatura.

## Regras principais

- Cada igreja em teste deve ter seu próprio tenant no banco.
- Cada pastor/igreja deve acessar com e-mail e senha.
- O trial deve durar aproximadamente 15 dias.
- O mesmo e-mail não deve conseguir iniciar trial várias vezes.
- Após o vencimento, a igreja deve ser bloqueada automaticamente.
- O bloqueio deve impedir uso das rotas protegidas da API.
- A estrutura deve preparar o caminho para assinatura/pagamento depois.

## Estrutura planejada no banco

### Church

Campos futuros planejados:

- status
- trialStartedAt
- trialEndsAt
- subscriptionStartedAt
- subscriptionEndsAt
- blockedAt
- blockReason

### TrialSignup

Modelo futuro planejado para controle antifraude:

- email
- churchId
- status
- startedAt
- endsAt
- convertedAt
- blockedAt

## Status possíveis da igreja

- TRIAL
- ACTIVE
- BLOCKED
- CANCELLED

## Status possíveis do trial

- ACTIVE
- EXPIRED
- CONVERTED
- BLOCKED

## Estratégia de implementação

1. Alterar schema Prisma com campos de trial e status.
2. Criar migration.
3. Atualizar seed de desenvolvimento.
4. Criar serviço para verificar se a igreja está ativa.
5. Bloquear rotas protegidas quando o trial estiver vencido.
6. Criar fluxo futuro de cadastro de trial.
7. Preparar integração futura com pagamento/assinatura.

## Observação

Este prompt não cria ainda o frontend do trial. Primeiro será criada a base segura no backend e banco.
