# Checkout v2 público — corte 3 preparado e inativo (2026-10-17)

Base conferida: HEAD `cc31472`. Origem: contrato v2 existente, código real e decisão
explícita de preparar o frontend mantendo visual, PIX, crédito e débito. Não há
flag de ativação, página nova, alteração de rota ativa, banco ou migration.

## Composição

`PreparedPublicEventV2` é um wrapper sem consumidor em páginas. Ele fornece a
factory opcional `prepareCheckoutV2` ao mesmo `PublicEventView`. O componente
compartilhado mantém o JSX, estilos, ingresso/lote, desconto, formulário, QR PIX,
Copia e Cola e redirecionamento de crédito/débito existentes. Somente a composição
preparada recebe controles de consulta/retomada e mensagens de segurança.

As páginas atuais continuam chamando `PublicEventView` sem a factory: envio,
armazenamento, polling e token legados seguem o caminho anterior. O efeito de
polling legado é explicitamente ignorado quando a factory v2 existe. Preview não
cria cliente, chave ou requisição de checkout. Nenhum módulo de API foi alterado.

No wrapper preparado, o componente não injeta os SDKs de tracking da página. Isso
evita introduzir esses scripts no fluxo que retém a chave privada. Não remove
scripts anteriormente carregados pelo mesmo documento/origem e não substitui o
hardening de scripts/CSP exigido antes de ativação. O tracking legado permanece.

## Protocolo e chave

- Uma chave `ec2_` canônica de 256 bits é gerada via Web Crypto antes do primeiro
  POST. Ela vai exclusivamente no header `x-event-checkout-key`; nunca em URL,
  body, HTML, resposta administrativa, erro, log, QR, tracking ou token legado.
- O armazenamento é exclusivo de `sessionStorage`, por evento + igreja/slug. Antes
  do envio, a gravação/leitura é confirmada. Bloqueio, corrupção ou quota falham
  sem enviar. Não há fallback para localStorage, cookies, contatos ou checkoutToken.
- Somente chave, versão, prazo, ID de inscrição e bloqueio de reconciliação são
  retidos. CPF, nome, e-mail, respostas e objetos de pagamento não são gravados.
  O payload imutável da tentativa fica em memória até a inscrição ser identificada,
  para permitir retry explícito com a mesma chave após resposta perdida.
- `register` envia allowlist de dados de inscrição. Não aceita preço, provider,
  referência financeira ou chave do chamador como autorização. Cliques concorrentes
  equivalentes compartilham a requisição; alteração do payload é bloqueada.
- `status` envia `{}`. `resume` envia apenas `{cpf?}`, sem método/contatos/IDs
  arbitrários. A seleção PIX/CREDIT_CARD/DEBIT_CARD pertence ao registro original;
  o frontend nunca troca método durante a retomada.
- Registro e criação de cobrança são operações distintas. O clique original pode
  executar register e, após resposta válida e elegível, uma resume explícita com o
  CPF transitório. Polling e recarga fazem somente status; nunca register/resume.
- Requisições usam no-store, credentials omit, redirect error, no-referrer e
  AbortSignal/deadline. O timeout também limita transportes que ignorem o signal;
  respostas tardias ou de instâncias descartadas não restauram o checkout.
- O DTO é validado contra evento/igreja/inscrição e reconstruído por allowlist.
  QR/app/checkInToken dependem da elegibilidade e do token recebido do backend.
  Um PENDING, cancelado ou waitlisted nunca recebe credencial por inferência local.
  Cartões exigem URL HTTPS sem credenciais/segredo do checkout; não há coleta de
  número de cartão ou CVV neste cliente.

## Expiração, revogação e perda de resposta

A validade é absoluta de 24 horas no servidor. Antes da resposta, o cliente usa
um teto conservador de 24 horas desde a primeira tentativa. `expiresAt` recebido
no registro pode somente encurtar esse teto; status/reload/retry não renovam prazo.
O deadline também limita requisições em andamento. O servidor continua sendo a
autoridade de expiração/revogação em todos os requests.

Após expiração ou 401/403/404, o cliente descarta chave e checkout e mantém uma
marca não secreta de bloqueio no escopo da aba. Não gera outra chave nem cria outra
inscrição para contornar a negativa. O contrato responde CHECKOUT_ACCESS_DENIED
para chave inválida, expirada ou revogada: não há motivo específico de revogação
no DTO, portanto a mensagem não inventa essa distinção.

Após resposta de registro perdida, a mesma instância permite retry explícito
somente do payload original. Depois de recarregar, sem esse payload em memória,
faz-se apenas status com a chave retida. Sem confirmação de acesso, encaminhar ao
atendimento; não procurar inscrição por contato nem repetir com chave nova.

## Reconciliação

CHECKOUT_PAYMENT_RECONCILIATION_REQUIRED, CHECKOUT_ASSISTANCE_REQUIRED e falha de
transporte/timeout na retomada mantêm bloqueio durável da sessão, removem dados de
pagamento apresentados e solicitam atendimento. Não há rota pública de
reconciliação, reset, cancelamento/substituição ou nova cobrança automática.

Status pode continuar sendo consultado. PENDING sozinho não comprova resolução
do intent e não libera nova resume. Confirmação real pode liberar a credencial
fornecida pelo backend; um novo acesso após atendimento requer o fluxo verificado
aprovado. Este corte não cria formulário público de recuperação, importação por
URL/fragmento ou transferência de credencial entre eventos.

## Arquivos

- `apps/events-admin/app/eventos/_components/public-checkout-v2.client.ts`
- `apps/events-admin/app/eventos/_components/use-prepared-checkout-v2.ts`
- `apps/events-admin/app/eventos/_components/public-event-v2.prepared.tsx`
- `apps/events-admin/app/eventos/_components/public-event-view.tsx`
- `apps/events-admin/test/public-checkout-v2.test.ts`

Foram atualizados `checkout-v2-preparation.md`, `checkout-charge-guard.md` e
`checkout-postgres-validation.md`, mantendo os relatórios originais e acrescentando
consolidação dos cortes 1/2. Os resultados 137/137, 33/33, 9/9 e 31 migrations são
daquela validação; não representam nova execução de banco neste corte.

## Gates para ativação

Continuam pendentes: substituição coordenada e exclusiva dos dois servidores e da
página pública, aplicação autorizada das migrations, CORS/header/redaction,
hardening de origem/scripts e homologação real. A coexistência ativa de protocolos
no mesmo endpoint não é autorizada por esta preparação. A recuperação humana,
canal verificado e reconciliação operacional não são automatizadas pelo frontend.

Não foi aberto browser, iniciado servidor, chamado provider ou acessado banco.
Validação visual/runtime e integração com endpoints efetivamente v2 permanecem
para corte autorizado. O teste de frontend usa fetch/storage simulados e os
schemas reais de request para verificar compatibilidade do protocolo.

## Resultado técnico do corte 3 — revalidado em 2026-10-19

- **20/20** testes novos de frontend; regressão conjunta **157/157** (137 anteriores
  + 20 novos), sem falhas/skips/cancelamentos, somente fetch/storage simulados.
- TypeScript --noEmit --incremental false aprovado em events-admin, packages/events,
  events-api e api-br; diff check aprovado. Sem build que pudesse consultar APIs.
- Testes incluem paridade dos bodies com schemas reais, PIX/crédito/débito, escopo,
  concorrência, resposta perdida, recarga, prazo/revogação, reconciliação, timeout
  com transporte ignorando signal, descarte de respostas tardias e ausência de ativação.
- Revisão final corrigiu a classificação de timeout/DTO inválido na retomada:
  falha genérica após resume também exige reconciliação durável. O novo teste
  verifica timeout com transporte ignorando AbortSignal, resposta tardia e
  bloqueio de outro resume inclusive após recarga.
- Não foram repetidos os testes PostgreSQL: 33/33 continua sendo a evidência dos
  cortes 1/2. Nenhuma operação de banco, migration, deploy ou pagamento neste corte.

Runner: `node --import tsx --test` com o arquivo de frontend e os dez arquivos
isolados de checkout já utilizados nos cortes 1/2 (excluídos os dois PostgreSQL).
Usar `TSX_TSCONFIG_PATH=apps/events-api/tsconfig.json` para aliases do monorepo,
`ASAAS_API_KEY=isolated-checkout-test-key` e `ASAAS_ENVIRONMENT=sandbox`, exigidos
pelo transporte simulado. Remover DATABASE_URL/DIRECT_URL do processo; não carregar
`.env`. O shell Bash disponibilizado pelo executor falhou na inicialização WSL;
as validações foram concluídas em PowerShell com Node/pnpm instalados.

Rejeição definitiva VALIDATION_ERROR/400 permite correção manual dos dados com a
mesma chave e somente na instância que recebeu a rejeição. Enquanto a correção
estiver pendente, não há polling automático de um grant inexistente. Isso não
se aplica a timeout, erro de transporte ou commit ambíguo; o pedido original
permanece imutável nesses casos. Nenhum payload/CPF é persistido para a correção.
