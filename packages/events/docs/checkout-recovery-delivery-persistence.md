# Recuperação assistida — corte 2, persistência de entrega (2026-10-17)

Origem: decisão explícita do usuário, diagnóstico técnico e código real. Este
corte permanece preparado/inativo. Não altera frontend, rotas ativas, cobranças,
snapshots, confirmação de pagamento ou credenciais de participante.

## Protocolo

- `recoverCheckoutAccess` recebe um callback backend opcional, exclusivamente de
  persistência no `tx` recebido. No coordenador assistido, ele grava PREPARED na
  mesma transação que o novo acesso, a auditoria e a eventual revogação anterior.
  Falha nessa preparação desfaz todos esses efeitos. Nunca fazer I/O externo nesse
  callback: a transação possui retries limitados.
- `EventCheckoutRecoveryDeliveryEvent` referencia a auditoria por
  `(churchId, operationId)`. Evento, inscrição, acesso, ação, evidência humana,
  canal e ator original são resolvidos pela auditoria existente. A política
  `ASSISTED_VERIFIED_EMAIL_V1` exige as três atestações verdadeiras no contrato
  assistido. O fingerprint adicional vincula o pedido normalizado completo,
  inclusive essas atestações, destino e referências, sem depender da chave retida.
  Ele é um digest de comparação, não uma prova criptográfica da verificação humana.
- O adapter PostgreSQL é o padrão. `deliveryStore` é uma dependência substituível
  para testes isolados; não existe fallback automático em memória na produção.
- Todas as transições usam o mesmo advisory lock de recuperação por igreja/operação,
  Serializable e retries limitados a conflitos conhecidos. O INSERT confirmado de
  DELIVERY_INTENT dá a um único chamador o direito de iniciar o envio. Repetir esse
  INSERT lógico não concede novamente esse direito.
- O POST Resend ocorre fora de transação e somente após commit do intent e
  revalidação de ator, destino, acesso e validade. A identidade de idempotência é
  derivada de igreja/evento/inscrição/acesso/operação. A mesma identidade é enviada
  como tag opaca, além da tag de operação existente.
- Sucesso grava DELIVERY_ACCEPTED com recibo. Exceção, timeout ou falha de gravação
  após o handoff tenta gravar DELIVERY_UNCERTAIN. Falha nessa gravação deixa INTENT
  durável, que continua bloqueando novo envio. Um ACCEPTED commitado com resposta
  de commit perdida nunca é rebaixado para UNCERTAIN.
- A chave privada permanece apenas temporariamente em memória. Nem eventos,
  auditoria, logs ou DTO administrativo recebem a chave ou o corpo do e-mail.
  O acesso mantém exatamente 24 horas desde sua emissão; nenhum replay renova TTL.

## Reinício e consulta

`execute` consulta o histórico durável antes de decidir reenviar. ACCEPTED ou
RECONCILED_ACCEPTED permite retornar o recibo já conhecido, com expiração e
revogação atuais do acesso. Não há reconstrução de segredo.

`inspect` é um método backend sem rota. Exige SUPER_ADMIN ACTIVE, tenant e IDs
exatos, o ator original e o pedido original compatível com o fingerprint. Retorna
somente dados administrativos e PREPARED/ACCEPTED/UNCERTAIN. A consulta histórica
não exige que pagamento e destino continuem elegíveis para uma nova entrega.

PREPARED com chave perdida exige atendimento e nova REISSUE explícita. INTENT sem
resultado, mesmo que possa ter ocorrido antes do POST efetivo, representa incerteza:
nunca autoriza novo POST. Essa escolha conservadora evita duplicação após commit
ambíguo ou crash. Não há worker, retry automático, reset ou prova de ausência.

## Reconciliação explícita

`reconcile` também permanece backend-only, sem rota. Recebe referência de recibo
conhecida pelo atendimento backend e referência opaca da evidência. Não procura por
contatos, não enumera e-mails no provider e nunca chama o sender.

O reader Resend faz somente GET por UUID conhecido, com deadline/AbortSignal.
Confere ID, destinatário único e tags únicas de operação e identidade da entrega.
Somente essa allowlist sai do adapter: a resposta externa pode conter o corpo do
e-mail e não pode ser logada, persistida ou devolvida ao administrador.
Documentação consultada: https://resend.com/docs/api-reference/emails/retrieve-email.

Após conferir o resultado externo e revalidar o ator, a operação acrescenta
DELIVERY_RECONCILED_ACCEPTED com recibo, evidência, ator e data. Preserva os eventos
anteriores e repetições não criam outro evento. Referência conflitante, correlação
ausente/duplicada, destinatário divergente, timeout ou recibo desconhecido mantém o
bloqueio. Sem referência conhecida, a operação continua pendente de atendimento.

ACCEPTED significa aceitação pelo provider, inclusive na reconciliação. Não afirma
entrega final, leitura ou ausência de bounce. Nenhum desses sinais autoriza reenvio
automático. Entregas antigas sem a nova tag de identidade não são reconciliadas
por inferência.

## Garantias SQL e limites

Migration nova `20261017120000_checkout_recovery_delivery_events`, aditiva, sem
backfill. Não modificar a migration estrutural anterior.

- FKs de operação/ator; unicidade de operação/estágio; hashes e referências restritas.
- Trigger valida parent, política, ator, ordenação temporal, fingerprint, recibo e
  transições. Lock da linha pai também serializa inserções SQL diretas.
- UPDATE, DELETE e TRUNCATE da tabela de eventos são recusados por triggers.
- A auditoria pai com eventos vinculados não pode ser alterada; sem esses eventos,
  o comportamento anterior da auditoria não é modificado.
- Superuser/DDL pode remover essas proteções: a aplicação deve manter o privilégio
  de runtime limitado. Isso não substitui a política de acesso e backup do deploy.

## Validação e decisões pendentes

O runner existente ganhou `--recovery-delivery-only`; sem essa opção executa também
a regressão PostgreSQL anterior. Ele exige PostgreSQL 17, banco com UUID/marker,
porta 55437 em loopback e tmpfs; cria usuário runtime sem DDL/superuser, aplica e
reaplica migrations apenas ali e remove exclusivamente seu container verificado.
Não usa DATABASE_URL da aplicação nem a porta 5433. Fetch externo fica bloqueado.

Os testes cobrem rollback de preparação, intent visível antes do envio, clientes
Prisma independentes, um único dono, commits ambíguos, timeout/resposta tardia,
recriação do coordenador sem memória, consulta, reconciliação e constraints SQL.
Reinício é simulado por descarte do coordenador e uso de outro cliente Prisma;
não se afirma teste de kill do processo ou entrega externa real.

Permanecem para aprovação/configuração: critérios e repositório operacional das
evidências humanas, remetente/secret Resend, prazos explícitos de memória e envio,
homologação externa e ativação coordenada. A consulta/reconciliação mantém o mesmo
ator original; transferência de atendimento para outro SUPER_ADMIN requer decisão
de permissão própria. Não foi implementada política de reset ou reenvio por ausência.

## Resultado e arquivos do corte

- Isolados: **137/137** em dez arquivos de checkout, com chave Asaas sintética
  explícita exigida pelo mock e sem DATABASE_URL/DIRECT_URL. Nenhum envio real.
- PostgreSQL 17 descartável: **33/33** completos; execução final focada **9/9**.
  31 migrations aplicadas e segundo deploy sem pendências. Containers removidos.
- Prisma validate, TypeScript fonte/testes/ambos servidores, runner syntax e diff
  check aprovados. Não foi executado Prisma generate.

Arquivos de produção/estrutura:
- `packages/database/prisma/schema.prisma`
- `packages/database/prisma/migrations/20261017120000_checkout_recovery_delivery_events/migration.sql`
- `packages/events/src/checkout-access.service.ts`
- `packages/events/src/checkout-assisted-recovery.service.ts`
- `packages/events/src/checkout-recovery-delivery.store.ts`
- `packages/events/src/checkout-recovery-delivery.identity.ts`
- `packages/events/src/checkout-recovery-email.service.ts`

Testes/runner:
- `packages/events/test/checkout-assisted-recovery.test.ts`
- `packages/events/test/checkout-recovery-email.test.ts`
- `packages/events/test/checkout-recovery-delivery.postgres.test.ts`
- `packages/events/test/checkout-postgres.integration.test.ts` (inventário 31 migrations)
- `packages/events/test/run-checkout-postgres.mjs`

Continuidade: este documento, `checkout-assisted-recovery.md`,
`.cursor/project/CURRENT.md` e `.cursor/project/EVENTS_MATRIX.md`.
