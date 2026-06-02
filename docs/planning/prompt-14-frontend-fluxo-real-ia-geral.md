# Prompt 14 — Frontend, fluxo real de uso e IA geral do sistema

## Objetivo

Preparar o frontend real do Sistema Igrejas, com login funcional, sessão do usuário, dashboard inicial e base de navegação interna para uso real do sistema.

Este prompt também registra a IA como uma camada geral do produto, para uso operacional e administrativo em todo o sistema.

A IA não deve ser tratada como recurso ligado principalmente ao ensino. Ensino pode usar IA no futuro, mas a IA principal do produto deve apoiar o sistema inteiro.

## Status atual

- Login conectado à API real.
- Sessão salva no navegador.
- Redirecionamento após login para `/dashboard`.
- Dashboard lendo a igreja logada.
- Textos técnicos removidos da interface.
- Plano interno `DEMO` removido da interface.
- Linguagem do período de teste ajustada para cliente.

## Regras deste prompt

- Não criar módulos fora da ordem planejada.
- Não criar dados falsos de membros, visitantes, células, eventos ou financeiro.
- Não inventar nomes, textos ou funcionalidades sem aprovação.
- Cada alteração deve ser feita em micro-passos.
- Depois de cada alteração, rodar build/teste necessário.
- Depois de cada passo aprovado, fazer commit convencional.
- O usuário envia a saída do terminal e a próxima ação só acontece após revisão.

## Tarefas do Prompt 14

### 1. Fluxo inicial do frontend

- [x] Criar base inicial do Next em `apps/web-br`.
- [x] Criar tela de login.
- [x] Conectar login ao `POST /auth/login`.
- [x] Salvar sessão no navegador.
- [x] Redirecionar login para `/dashboard`.
- [x] Criar dashboard inicial.
- [x] Ler sessão no dashboard.
- [x] Mostrar igreja logada no dashboard.
- [x] Remover textos técnicos da interface.
- [x] Ajustar linguagem do período de teste.

### 2. Layout interno básico

- [ ] Criar estrutura visual básica do painel interno.
- [ ] Criar área principal do painel.
- [ ] Criar navegação interna simples.
- [ ] Preparar espaço futuro para módulos reais.
- [ ] Não implementar telas completas antes da aprovação.

### 3. IA geral do sistema

A IA deve ser uma camada geral do Sistema Igrejas.

Ela deve apoiar o uso operacional e administrativo do sistema inteiro, consultando dados reais cadastrados pela igreja logada, respeitando tenant, perfil e permissões.

A IA não deve ser planejada como recurso exclusivo de ensino, cursos ou aulas.

Ensino pode usar IA no futuro, mas a IA principal do produto deve apoiar o sistema completo.

Dados que a IA poderá usar futuramente, conforme módulos e permissões:

- membros;
- visitantes;
- células;
- eventos;
- trilhos;
- voluntários;
- financeiro;
- frequência;
- cadastros e movimentações internas.

Exemplos de uso futuro da IA geral:

- identificar membros sem célula;
- resumir a situação da igreja na semana;
- apontar células que cresceram ou reduziram;
- ajudar o pastor a entender frequência e engajamento;
- sugerir acompanhamentos pastorais ou administrativos;
- ajudar a montar comunicados com base nos dados do sistema;
- responder perguntas operacionais sobre dados cadastrados;
- apoiar decisões de gestão com informações do próprio sistema.

Tarefas futuras da IA geral:

- [ ] Planejar entrada da IA no painel como recurso geral.
- [ ] Definir quais dados a IA poderá consultar inicialmente.
- [ ] Definir limites de permissão por perfil de usuário.
- [ ] Definir regras de privacidade e segurança dos dados.
- [ ] Criar endpoint futuro para consultas assistidas por IA.
- [ ] Criar interface futura para conversa/consulta com IA.
- [ ] Garantir que a IA use dados reais do tenant da igreja logada.
- [ ] Evitar que a IA acesse dados de outra igreja.
- [ ] Não implementar IA antes da base do painel e dos módulos principais estarem minimamente organizados.

## Observação importante

A IA é parte estratégica do produto, mas deve entrar de forma organizada.

Primeiro o sistema precisa ter fluxo real, autenticação, painel e dados cadastrados.

Depois a IA será conectada como camada inteligente sobre os dados do próprio sistema.
