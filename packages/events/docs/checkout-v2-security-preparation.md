# Checkout v2 — corte 4, segurança e contenção preparadas (2026-10-19)

Base: `3722754`, após o frontend preparado do corte 3. Este corte prepara uma
política comum para `api-br` e `events-api`. Nenhum `app.ts`/`server.ts` importa a
preparação, nenhuma página usa v2 e nenhuma rota de produção foi fechada. O
registrador legado mantém seu comportamento padrão; as lacunas do runtime atual
(inclusive `origin: true`) continuam até um corte autorizado de implantação.

## Composição preparada

- Cada API tem `checkout-security.prepared.ts`, com a mesma implementação comum.
  Preparar não abre conexão, lê `.env`, executa SQL, registra rotas ou faz HTTP.
- A futura composição deve criar Fastify com `security.fastifyOptions`, executar
  `await security.install(app)` **na raiz, antes das rotas**, e somente então
  registrar o restante da API. Não registrar o hook como plugin encapsulado, não
  manter o CORS antigo, não substituir serializers/redaction ou habilitar
  `trustProxy: true` por conveniência.
- Origens exatas são obrigatórias, sem wildcard/reflexão/sufixos/`null`, com HTTPS.
  HTTP em loopback exige configuração explícita de desenvolvimento. Origem
  presente e não autorizada recebe 403 antes de parsing ou trabalho de checkout.
  Clientes sem Origin continuam dependendo da autorização real do backend.
- Preflight permite o header privado, Authorization, Content-Type e X-Api-Key;
  não permite credenciais de cookies nem expõe a chave. Expõe apenas Retry-After.
- Headers preparados: nosniff, no-referrer, DENY, CSP da resposta **JSON da API**
  (`default-src 'none'; frame-ancestors 'none'; base-uri 'none'`) e Permissions-Policy.
  HSTS só no modo HTTPS. Isto não implementa CSP/hardening da página Next ou de
  scripts de terceiros na origem do frontend.
- Checkout público register/status/resume nas duas identidades e recuperação/
  revogação administrativas recebem no-store em sucesso e erro, body limit e
  admissão antes de parsing/autorização. Query strings são recusadas nesse recorte.
  Request timeout, tamanho, janela e quotas são parâmetros obrigatórios, sem
  escolher valores comerciais/de produção neste corte.

## Logs e credenciais

Header privado, authorization e API key têm redaction. Serializers de request e
response permitem apenas método/status; não gravam URL, IP, headers, params,
query ou body. Request ID é UUID gerado no servidor, sem confiar no header do
cliente. Payloads/headers estruturados e mensagens livres `msg` são removidos:
Pino pode inferir `msg` da mensagem **original** de um Error antes do serializer,
inclusive quando `err.message` já foi substituída. O teste cobre esse caminho
usando o logger real. Erros de parsing/handler de checkout têm resposta genérica,
preservando os status HTTP de autorização e os erros esperados do protocolo.

Logs permitidos são metadados estruturados seguros; isto não autoriza logar
segredos sob nomes arbitrários, em bindings ou em strings. A auditoria dos pontos
de log, do proxy/ingress e dos observadores externos continua necessária antes da
implantação. Nenhuma stack de observabilidade foi introduzida.

## Abuso e gate compartilhado

`createRedisCheckoutSecurityStore` recebe um cliente compatível com `eval` do
ioredis, **já declarado como dependência nas duas APIs**. Não cria conexão, não
adiciona pacote/serviço e não descobre endpoint. Não existe fallback em memória.
Não há Redis provisionado/configurado por este corte; o compose atual só declara
PostgreSQL. Usar esse adapter em runtime exige decisão/configuração operacional
autorizada e homologação do store compartilhado, não implantar um serviço novo
implicitamente por causa desta preparação.

Uma operação Lua verifica o gate e consome os budgets de IP e, quando há chave
canônica, da capability. As duas APIs, aliases, eventos e ações compartilham os
mesmos budgets e namespace/hash slot. Só HMACs com secret do servidor chegam às
chaves do store; não há chave de checkout, IP, CPF ou contato em claro. IP vem da
conexão, com `trustProxy: false`; headers forwarded não mudam o budget. Uma
implantação atrás de proxy precisa definir e testar a fronteira de confiança;
sem isso, a quota agrupa clientes pelo proxy e não serve como limite individual.

Estado ausente, fechado, incompatível ou falha/timeout do store resulta em 503
antes do trabalho de negócio; quota excedida retorna 429 e Retry-After. Os counters
têm TTL. As duas instâncias precisam usar o mesmo secret, origens, limites e
timeouts; o fingerprint de configuração é conferido pelo gate para impedir que
uma API com política diferente contorne a outra. Os valores numéricos dos testes
são exclusivamente sintéticos.

O gate `events:checkout-security:{checkout}:gate` só admite
`LEGACY:<policyFingerprint>` exatamente correspondente. Não há criação/abertura
automática desse valor pelo código: numa eventual implantação da proteção sobre
o legado, a inicialização seria ato administrativo explícito e revisado. O método
`close()` grava `CLOSED`, sem TTL; não existe método de reopen ou estado v2.
Missing/flush nunca abre checkout. Resta validar ACL/TLS, persistência, latência,
capacidade e failover: restaurar um snapshot antigo com LEGACY não pode ser
tratado como fechamento durável. Gate distribuído não substitui contenção no
ingress e retirada dos processos antigos.

## Fechamento coordenado, sem ativar v2

`registerClosedPublicCheckout` é uma composição futura alternativa ao registrador
legado. Usa `registerPublicEventRoutes(..., undefined, "omit")`, que não registra
os três handlers legados. Instala seis respostas 503, cobrindo register, status e
resume tanto por ID quanto por slugs. Não existe callback financeiro, fallback por
contatos/token ou handler v2 nessas respostas. Coexistência com qualquer rota
crítica existente é rejeitada antes do registro. Leituras públicas, desconto e
acesso do participante permanecem registrados com suas regras próprias.

Sequência operacional preparada, **não executada**:

1. Manter as entradas críticas fechadas no ingress das **duas** APIs, incluindo
   aliases e instâncias antigas. O código atual ainda não consulta o novo gate;
   portanto um rolling deploy parcial não oferece coordenação segura.
2. Onde a política compartilhada já estiver instalada e homologada, executar
   `close()` no store comum e confirmar 503 em ambos os servidores. Remover ou
   drenar também qualquer instância que ainda não tenha essa política.
3. Aguardar `pendingRequests() === 0` em **todas** as instâncias instrumentadas e
   a drenagem real dos demais processos. Requisições admitidas antes do fechamento
   podem concluir; fechar o gate não cancela nem desfaz cobrança em andamento.
   Pending não diminui enquanto um handler ainda executa. Trabalho desacoplado/
   providers e resultados financeiros incertos exigem conferência adicional.
4. Substituir em ambos os builders a chamada completa ao registrador legado e
   seu callback financeiro pela composição fechada. Verificar inventário,
   rejeição de checkoutToken/chave antiga/capability nas seis entradas e
   preservação de JWT, webhook, check-in e acesso elegível do participante.
5. Manter frontend sem v2 e checkout fechado. Aplicação de migrations, implantação
   do v2 e abertura futura exigem outro corte coordenado e todos os gates já
   documentados. Rollback mantém contenção/composição fechada; não restaura o
   callback legado nem inicializa LEGACY para reabrir o checkout.

Não há toggle por variável de ambiente que feche/reabra/ative uma API sozinha.
A preparação não altera webhook, JWT geral, financeiro, recuperação humana,
semântica CARD legada, banco ou migrations.

## Validação e limites

- **16/16** testes novos e **173/173** na regressão isolada total (157 anteriores).
  Fastify.inject, CORS e logger reais; Prisma/provider proibidos na composição
  fechada; store/fetch simulados. Cobertura: origens, preflight, headers, quotas
  entre APIs/IPs/aliases, spoof de forwarded IP, indisponibilidade/deadline,
  fingerprint divergente, fechamento/drenagem, body limit, erros, logs,
  preservação de JWT, composição com os dois bundles v2 reais preparados e ausência
  de ativação. CORS/quota não substituem a validação da chave no backend.
- O teste do adapter verifica argumentos/validação de retorno e o contrato Lua;
  **não** executa Redis/Lua real nem prova failover/persistência distribuída.
- TypeScript `--noEmit --incremental false` aprovado em packages/events,
  events-api, api-br e events-admin; novas fontes de teste também verificadas
  com os aliases e tipos JWT reais. Diff check aprovado.
- Nenhum banco, migration, Prisma generate, provider, navegador, servidor de
  desenvolvimento ou serviço novo foi acessado/iniciado.
- Runner: o comando isolado do corte 3 mais
  `packages/events/test/checkout-security.test.ts`, com
  `TSX_TSCONFIG_PATH=apps/events-api/tsconfig.json`, credencial Asaas sintética
  `isolated-checkout-test-key`, sandbox e sem DATABASE_URL/DIRECT_URL no processo.

Bloqueios para implantação/ativação: origens/domínios e limites reais aprovados;
store compartilhado autorizado/configurado e homologado; secret e fronteira do
proxy; contenção/drenagem de todas as instâncias; auditoria dos logs/ingress;
hardening da origem Next/scripts; migrations autorizadas, evidência humana,
semântica CARD legada e homologação externa. Nenhum desses gates foi declarado
resolvido apenas por compilar ou pelos doubles.

Continuação operacional inativa (Redis compartilhado local, parser comum, init
explícito do gate, sem builders): `checkout-v2-security-operational.md`.
