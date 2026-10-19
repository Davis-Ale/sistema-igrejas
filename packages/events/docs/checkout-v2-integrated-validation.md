# Checkout v2 — corte 5, integração isolada (2026-10-19)

Base: `69481eb`. Validação dos cortes preparados, sem ligar os builders ou páginas
ativos. Nenhum `buildApp`, `.env` da aplicação, banco principal, seed, generate,
provider externo ou navegador foi executado nos testes.

## Ambiente e evidência

Foi reutilizado `run-checkout-postgres.mjs`: PostgreSQL 17 em container descartável,
127.0.0.1:55437, banco/credenciais/cluster marker próprios por execução, tmpfs e
runtime sem superuser/DDL. A conexão do teste exige URL explícita, papel, porta,
UUID, versão e marker corretos e rejeita DATABASE_URL/DIRECT_URL herdadas. O runner
mantém apenas um conjunto permitido de variáveis no subprocesso. A configuração
Prisma de migration recebe exclusivamente a URL do descartável.

As **31 migrations existentes** foram aplicadas e o replay não encontrou
pendências, exclusivamente no descartável. Não foi criada/alterada migration ou
schema. Todos os containers deste corte foram removidos após verificar ID/nome/
label/montagens/porta; o inventário dos demais containers permaneceu igual.

O Docker estava parado e foi iniciado para a execução autorizada. Não foram
consultados os bancos de outros containers ou o banco principal em 5433.

## Falhas reproduzidas antes da correção

1. Uma leitura OVERDUE antiga, pausada antes de escrever, conseguiu rebaixar um
   pagamento já confirmado como PAID em outra conexão Prisma. O resultado indevido
   atingiu EventPayment, EventOrder e Registration. Reproduzido nos dois consumidores:
   `applyEventPaymentProviderStatus` e `applyRegistrationPaymentStatus`.
2. Dois callbacks PAID, com leitura controlada da inscrição, regravaram
   `confirmedAt` depois da primeira confirmação commitada.

Os três testes falharam no código anterior em PostgreSQL real. Não foram corrigidos
problemas por hipótese nem alteradas as regras de transição comercial.

## Correção delimitada

O estado e a referência de provider lidos são condições da escrita de EventPayment.
O compare-and-swap e as atualizações de Order/Registration usam a mesma transação.
Se outro callback venceu, o consumidor relê e reaplica as regras já existentes de
regressão de status. O limite é de três tentativas; esgotamento falha com conflito,
sem loop infinito ou repetição de chamada externa.

Confirmação de webhook só altera atomicamente inscrições que ainda estejam
PENDING, PAID e sem espera. `confirmedAt` pertence à primeira confirmação e não é
regravado por leitura antiga. O consumidor compartilhado de e-mail continua fora
da transação de pagamento, com lock/releitura da inscrição, destinatário local e
idempotência já existentes. O helper novo é o quinto consumidor explícito; a
asserção estrutural anterior de quatro consumidores foi atualizada.

Não houve mudança em cobrança, provider, contratos públicos, autorização, tokens,
recuperação assistida, financeiro de venda ou política de reenvio. O caminho de
inscrição histórica sem EventPayment não foi convertido ao v2 por este corte.

## Casos novos

Seis testes PostgreSQL adicionais:

- Corrida OVERDUE/PAID nos dois consumidores, em clientes independentes, com ordem
  controlada e conservação da referência/cobrança original.
- Confirmação concorrente sem regravar a primeira data.
- Exceção do sender e rollback real da transação do marcador após aceite simulado:
  pagamento permanece commitado, retry recebe o mesmo destinatário/payload e o
  marcador posterior impede novo envio. O mock deduplica aceite por inscrição;
  isto não é prova de entrega ou deduplicação real do provider.
- Contenção forçada do compare-and-swap: três tentativas, conflito e nenhum
  registro financeiro alterado.
- Composição integrada das duas APIs, repetida para PIX, CREDIT_CARD e DEBIT_CARD:
  política de segurança real + JWT + descritores v2 reais + Prisma/PostgreSQL reais
  + adapters Asaas/Resend com fetch inteiramente simulado.

Na composição integrada, registro/replay pelas duas identidades cria uma única
inscrição/grafo; resume concorrente faz um POST de customer e um de pagamento;
retry retoma a cobrança conhecida. Recuperação SUPER_ADMIN persiste entrega/audit,
replay pela outra API não envia novamente, revoga a chave anterior e a nova chave
não libera credencial enquanto PENDING. Webhook sem autenticação é recusado.

O primeiro e-mail de confirmação recebe rejeição simulada 503: PAID/CONFIRMED são
preservados e o marcador permanece vazio. Webhooks autenticados simultâneos pelas
duas APIs geram um aceite e um marcador com a mesma chave de idempotência, sem
segunda cobrança ou alteração da Transaction oficial. Status só libera o token
fornecido pelo backend após a confirmação; no-store/nosniff permanecem presentes.

O callback de webhook do harness usa o registrador Asaas e os consumidores de
Eventos reais. Ele não instancia o builder de produção nem homologa as demais
operações de cancelamento/refund ou módulos da aplicação inteira.

## Resultados

- Linha de base anterior: **33/33** PostgreSQL aprovados antes de acrescentar casos.
- Após reproduzir e corrigir as três corridas: execução completa **39/39**, sem
  falhas/skips/cancelamentos; **173/173** isolados, incluindo os 16 de segurança.
- Os seis casos novos passaram em duas rodadas focadas posteriores; a última
  seleção executou **6/6**, sem skips/cancelamentos ou a ocorrência UNCERTAIN.
- TypeScript `--noEmit --incremental false` aprovado em events, events-api, api-br,
  events-admin e fontes de testes PostgreSQL/segurança; diff check aprovado.
- Prisma deploy/replay: **31 migrations** existentes somente no descartável.

Runner completo: `node packages/events/test/run-checkout-postgres.mjs`.
O novo `--integrated-only` seleciona só os seis casos deste corte, preservando os
modos anteriores e suas restrições de escopo exclusivo. Os testes isolados usam
o comando do corte 4 com TSX_TSCONFIG_PATH explícito e credencial Asaas sintética,
sem URL de banco ou ambiente da aplicação.

## Sinais e bloqueios preservados

Uma execução intermediária recebeu 409 CHECKOUT_RECOVERY_DELIVERY_UNCERTAIN após
a tentativa de handoff assistido, com bloqueio seguro. Não foi reaberto o fluxo
nem mascarada a resposta com retry/reenvio automático. A causa dessa ocorrência
isolada não foi identificada; foi acrescentada captura somente de código,
SQLSTATE e nome de constraint para uma eventual reprodução, sem chave/PII. A
execução completa posterior e as duas repetições focadas passaram;
não se afirma ausência de falhas operacionais por causa de uma execução verde.

O pg instalado emite aviso de depreciação sobre queries concorrentes de um client
interno do adapter. Não houve falha decorrente desse aviso e não foi trocado driver
ou reescrito trabalho pronto para silenciá-lo. As rejeições Resend são sintéticas;
o SDK em ambiente não production imprime seu erro simulado, sem dados reais.

Continuam pendentes: investigação/observação operacional do sinal UNCERTAIN,
store Redis real/ACL/TLS/persistência/failover e limites/proxy/origens de produção,
auditoria de logs inclusive SDKs/ingress, hardening Next/scripts, política/evidência
humana e homologação externa. Store de abuso é simulado no harness; os testes não
provam Lua/Redis distribuído ou comportamento de providers reais.

V2 e segurança preparada permanecem desconectados dos builders ativos. Nenhuma
rota ativa foi ligada/fechada, nenhuma chave de produção foi emitida e nenhuma migration
foi aplicada no banco principal. O corte é validação/correção de concorrência,
não autorização de rollout.
