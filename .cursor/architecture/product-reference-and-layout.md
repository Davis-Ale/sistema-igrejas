# Arquitetura de experiencias, referencias e layout

## 1. Superficies do produto

### Admin Web
- Administracao completa do Sistema Igrejas.
- Configuracao de eventos, ingressos, lotes, formularios, participantes, financeiro, equipes, comunicacao e demais operacoes.
- Futuramente deve compartilhar um layout global consistente com os demais modulos do sistema.

### Produto Eventos (standalone-ready)
- Eventos e um produto com fronteira propria, ainda executado **neste momento** no Sistema Igrejas / monorepo atual.
- Nao separar repositorio, banco, deploy ou autenticacao neste corte.
- Deve ser desenvolvido desde ja com contratos claros, acoplamento minimo ao sistema geral e reuso apenas do core realmente compartilhado (JWT, churchId, Transaction oficial, pagamentos).
- Nao depende do Financeiro geral da igreja para operar.
- **Decisao 2026-09-10:** a extracao fisica acontece **logo apos** os fluxos principais e contratos estaveis, **antes** do App do Participante, do App do Organizador e do pente-fino final. Nao empurrar para o fim de todo o produto. Nao exigir esses apps nem o pente-fino visual final para separar.
- Objetivo da extracao: aplicacao, dashboard, navegacao, identidade visual, configuracao e deploy proprios; dominio isolado; baixo acoplamento; venda standalone.
- Antes da extracao, auditar o que deve ser compartilhado, extraido, desacoplado, mantido como core comum ou convertido em contrato/API. Nao duplicar tenant, autenticacao, permissoes, modelos, logica financeira ou componentes sem necessidade arquitetural real.
- A extracao nao obriga arquitetura distribuida complexa. Modular primeiro. Distribuido quando houver beneficio real. Forma mais simples e segura compativel com o dominio. Sem microservicos, Kafka, Kubernetes, service mesh, novos bancos, novas clouds ou brokers adicionais sem autorizacao.
- Depois da extracao fisica, Eventos passa por ajustes visuais proprios de produto standalone (entrada, dashboard, navegacao, identidade coerente, remocao de elementos que o facam parecer apenas um modulo interno do Sistema Igrejas). Nao fazer esses ajustes neste corte de governanca.
- A extracao nao pode reduzir isolamento multi-tenant, JWT/RBAC, seguranca financeira, PII, IDOR/BOLA, auditoria nem secrets.
- Evitar dependencias diretas desnecessarias de paginas do sistema geral, do Financeiro geral, de regras de outros modulos, ou de UI que so funcione dentro da dashboard geral da igreja.

### App do Participante
- Implementado sobre apps/events-pwa.
- Nao e baseado nas telas do Sympla enviadas para administracao.
- Usa como referencia os outros prints especificos enviados pelo usuario.
- Estrutura prevista: Home, Inscricao, Cronograma, Credencial, Mapa e Perfil.
- Conteudo administrativo nasce no painel e e consumido pelo app pela mesma API/fonte de dados.
- QR de credencial somente depois da elegibilidade.
- Credencial deve tambem chegar por e-mail ao participante depois da confirmacao.
- Entra **depois** da extracao fisica de Eventos e dos ajustes visuais do produto standalone. Nao expandir agora.

### App do Organizador / Igreja
- Experiencia futura separada do participante.
- Foco operacional mobile durante eventos.
- Funcoes previstas: eventos, vendas, participantes, scanner QR, check-in manual, check-in offline, sincronizacao, portarias, colaboradores/equipes, financeiro resumido, alertas e operacoes do evento.
- Pode usar Sympla Organizador e outros produtos maduros como benchmark funcional.
- Identidade e arquitetura permanecem proprias.
- Entra **depois** do App do Participante, ainda **antes** do pente-fino final completo. Sem arquitetura e sem codigo agora.

## 1.A Informacao architecture do produto Eventos (2026-09-07)

### Dashboard Geral de Eventos — EVENTS-DASHBOARD-1
Home do produto standalone Eventos. Separada do workspace de um evento especifico.

Estrutura:

- Dashboard / Meus eventos (`/dashboard/eventos`)
- Criar novo evento
- Gestao Financeira (`/dashboard/eventos/gestao-financeira`)
- API Keys (`/dashboard/eventos/api-keys`)
- Integracoes (`/dashboard/eventos/integracoes`)
- Configuracoes gerais (`/dashboard/eventos/configuracoes`)

Na Dashboard Geral, os eventos da igreja aparecem em lista operacional (um abaixo do outro). Cada item abre/gerencia aquele evento. Nao criar uma pagina principal diferente para cada evento. O evento individual e aberto a partir da lista.

`/dashboard/eventos` **nao** redireciona automaticamente para um evento. A tela antiga (Cadastrar evento / Inscrever participante / Eventos cadastrados / Check-in) continua proibida.

### Workspace do evento
Ao abrir um evento especifico, o usuario entra no workspace daquele evento.

Menu do evento atual:

- Visao geral
- Informacoes
- Ingressos
- Descontos
- Formulario de inscricao
- Participantes
- Check-in
- Financeiro
- Aplicativo do Evento

Gestao Financeira nao pertence ao menu permanente do evento. Acessivel na navegacao global da Dashboard Geral. Descontos permanece no evento individual (Ingressos / Descontos / Formulario), inclusive para preco especial no mesmo ingresso sem novo lote.

Ao trocar o evento no seletor, manter a secao atual do workspace.

### Gestao Financeira — global
Capacidade global do produto Eventos. Consolida todos os eventos autorizados do tenant.

Acessivel na navegacao global da Dashboard Geral (Meus eventos / Criar evento / Gestao Financeira / API Keys / Integracoes / Configuracoes gerais). Nao duplicar no menu do workspace.

Financeiro dentro de um evento continua simples: valor bruto, taxa da plataforma, valor liquido e historico daquele evento. Nao e Gestao Financeira Geral. Nao e local principal para repasse, transferencia ou cadastro geral da conta da igreja.

### Conta de recebimento
Pertence a configuracao financeira global de Eventos (Gestao Financeira → Conta de recebimento, ou Configuracoes gerais → Financeiro / Conta de recebimento). Nao cadastrar conta bancaria separada por evento como regra padrao. Override por evento somente com decisao futura explicita.

### Exportacoes
- CSV = Participantes. Nao colocar CSV no Financeiro do Evento.
- Bordero = Gestao Financeira Geral de Eventos.

## 2. Papel das referencias

### Sympla / Admin de Eventos
- Os screenshots em `.cursor/benchmarks/events-admin/` sao BASELINE FUNCIONAL OBRIGATORIO do Admin de Eventos.
- Nao sao mera referencia nem inspiracao opcional.
- Toda capacidade funcional relevante visivel nos prints deve existir no Sistema Igrejas.
- Nao copiar marca, textos, identidade, codigo ou pixel a pixel.
- Adaptar ao dominio de igrejas, manter identidade propria e, quando fizer sentido, melhorar UX, seguranca, performance e confiabilidade.
- Fonte operacional: `.cursor/rules/events-admin-benchmark.mdc`.
- O Agent nao pode classificar sozinho uma capacidade desses prints como NOT_APPLICABLE.

### Prints do App do Participante
- Benchmark separado: `.cursor/benchmarks/app-participantes/`.
- Nao e benchmark Sympla.
- Nao misturar as duas fontes.
- Devem orientar estrutura, navegacao e experiencia do participante.

## 3. Layout como regra arquitetural

- UX e layout fazem parte da definicao de pronto.
- Toda tela nova deve nascer integrada ao padrao visual do produto.
- Manter navegacao previsivel, hierarquia, estados claros, responsividade e consistencia entre modulos.
- Evitar telas intermediarias desnecessarias, duplicacao de navegacao e telas tecnicamente funcionais mas visualmente inacabadas.
- Eventos deve respeitar suas referencias aprovadas.
- A Dashboard Geral de Eventos e a home do produto Eventos — nao a tela antiga de entrada operacional, nem o workspace de um evento.
- O Sistema Igrejas inteiro recebera posteriormente uma consolidacao visual global, sem abandonar qualidade durante o desenvolvimento atual.

## 4. Fonte unica de dominio

- Admin Web, App do Participante e futuro App do Organizador usam a mesma API e os mesmos dominios.
- Nao duplicar Event, Registration, EventOrder, EventPayment, Transaction ou identidade de participante para cada aplicativo.
- Toda operacao respeita churchId e, em Eventos, eventId.
- Enquanto Eventos permanecer no monorepo, reutilizar o core compartilhado sem acoplar o produto ao Financeiro geral da igreja nem a paginas que so existam na dashboard geral da igreja.

## 5. Criterio de completude

- Antes de considerar Eventos/Admin zerado, executar pente-fino print por print de TODOS os arquivos de `.cursor/benchmarks/events-admin/` e registrar cobertura explicita na matriz. Esse pente-fino **final completo** acontece **depois** da extracao fisica, dos ajustes visuais e dos apps. Fechar gaps principais do Admin (minimo de extracao) acontece **antes** da separacao.
- Nao aceitar conclusao generica do tipo "esta equivalente".
- Antes de considerar App do Participante completo, criar matriz dos prints de `.cursor/benchmarks/app-participantes/` x apps/events-pwa.
- Antes de considerar layout global completo, revisar todos os modulos do Sistema Igrejas contra o design aprovado.
- Classificar explicitamente: IMPLEMENTED, PARTIAL, MISSING, USER_DEFERRED ou DOMAIN_BLOCKED.
- USER_DEFERRED e DOMAIN_BLOCKED exigem decisao explicita do usuario. O Agent nao decide sozinho que um item do baseline "nao se aplica".
- Funcionalidade critica exige validacao E2E e prova de runtime.
- Seguranca prevalece sobre copia de comportamento do produto de referencia.

## 6. Modelo arquitetural vigente (2026-09-09)

Decisao explicita do usuario. Complementa `.cursor/rules/system-general.mdc`.

### Principios
- Modular primeiro. Distribuido quando houver beneficio real.
- Observabilidade sera uma camada transversal do produto, mas sua tecnologia sera escolhida posteriormente pelo usuario.
- Nao fazer overengineering. Nao criar infraestrutura preventiva sem necessidade comprovada.

### SOLID
Aplicar principios SOLID quando melhorarem separacao de responsabilidades, manutencao, testabilidade, extensibilidade, baixo acoplamento e clareza dos contratos entre modulos.

SOLID nao significa criar abstracoes desnecessarias. Evitar interfaces sem necessidade real, camadas artificiais, abstracao prematura e complexidade apenas para seguir padrao teorico. A arquitetura deve continuar pragmatica.

### Monolito modular
O sistema permanece, neste momento, como **monolito modular**.

Nao migrar agora para arquitetura distribuida completa. Nao transformar o projeto automaticamente em microservicos.

Os dominios devem continuar fortemente separados e com contratos claros. Exemplos:

- Core / Tenant
- Auth / Security
- Eventos
- Financeiro
- CRM
- Operacoes
- IA
- Integracoes

Eventos permanece standalone-ready neste monolito **neste momento**: fronteira clara, baixo acoplamento, dominio proprio, Dashboard Geral propria, Gestao Financeira propria, navegacao propria. A extracao fisica acontece **logo apos** os fluxos principais estaveis, **antes** dos apps finais e do pente-fino final (decisao 2026-09-10). Nao deve exigir reescrever todo o dominio. Nao duplicar core sem necessidade. A extracao nao obriga arquitetura distribuida complexa.

### Arquitetura distribuida — futura, nao padrao atual
Arquitetura distribuida faz sentido para a evolucao futura deste produto. Nao deve ser adotada por padrao agora. Somente quando existir beneficio tecnico ou de negocio comprovado. A decisao final pertence ao usuario.

Possiveis motivos futuros (nenhum autoriza automaticamente uma migracao): necessidade de escala independente; picos elevados de Eventos; isolamento operacional; workers independentes; integracoes externas; notificacoes; processamento de IA; filas; necessidade de resiliencia; produto Eventos separado; necessidade de deploy independente.

Componentes candidatos futuros (possibilidades, **nao** implementacao aprovada): produto Eventos; workers assincronos; notificacoes; integracoes externas; processamento de IA; determinadas operacoes financeiras, se houver necessidade real. Nao criar essa **separacao distribuida** agora.

A extracao fisica de Eventos (decisao 2026-09-10) e extracao de **produto**, da forma mais simples e segura compativel com o dominio. **Nao** obriga microsservicos nem arquitetura distribuida complexa.

Nao introduzir automaticamente Kafka, RabbitMQ, Kubernetes, service mesh, novos brokers, novos bancos, microsservicos, novas clouds ou infraestrutura distribuida. Tecnologia ja existente no stack so continua no escopo ja autorizado. Novas tecnologias exigem autorizacao explicita do usuario.

## 7. Observabilidade futura (2026-09-09)

Observabilidade e considerada importante e devera fazer parte da arquitetura do produto.

**A stack de observabilidade ainda nao foi escolhida.** Nao implementar agora uma solucao especifica. Nao escolher silenciosamente OpenTelemetry, Sentry, Grafana, Prometheus, Loki, Datadog, New Relic, Elastic ou outra plataforma.

Diretriz (nao implementacao neste corte): a arquitetura deve ficar preparada para suportar futuramente logs estruturados, requestId, correlationId, tracing, metricas, duracao de requisicoes, status das operacoes, error tracking, health checks, dashboards, alertas e auditoria de acoes sensiveis.

Quando implementada, deve ser possivel correlacionar operacoes com contexto seguro: requestId, correlationId, churchId, eventId, dominio/servico, operacao, status, duracao. Sempre respeitando seguranca e privacidade.

Quanto mais distribuida a arquitetura se tornar, mais critica sera a observabilidade. Antes de aumentar significativamente a distribuicao, o projeto devera possuir observabilidade suficiente para rastrear operacoes entre componentes. Exemplo conceitual: request → inscricao → desconto → pagamento → webhook → financeiro → integracao/notificacao.

A futura extracao fisica de Eventos deve **considerar** observabilidade, mas nenhuma tecnologia deve ser escolhida automaticamente. **A stack ainda nao foi escolhida.**

Quando o usuario definir a tecnologia: atualizar estas regras e a arquitetura; definir padrao de instrumentacao, logs, metricas, tracing, retencao, ambientes e alertas; revisar LGPD/PII e custos; so entao implementar. Nenhuma escolha anterior deve ser assumida como definitiva.

Detalhes de PII, logs e auditoria funcional: `.cursor/rules/security-hardening.mdc`.
