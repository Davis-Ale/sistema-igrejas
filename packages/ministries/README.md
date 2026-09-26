# Ministries

Módulo de ministérios do Sistema Igrejas. A tela fica em `/dashboard/ministerios` e usa a sessão existente. Não altera papéis, pessoas ou regras de outros módulos.

## Permissões

- `SUPER_ADMIN`, `PASTOR`, `LEADER`: consultar ministérios e pessoas disponíveis.
- `SUPER_ADMIN`, `PASTOR`: criar, editar, excluir, vincular e desvincular pessoas.
- `MEMBER`, `VOLUNTEER`: sem acesso administrativo ao módulo.

O `churchId` é obtido exclusivamente da autenticação. IDs inexistentes e IDs de outra igreja retornam 404. O corpo não aceita `churchId` ou campos desconhecidos. O líder pode ser qualquer pessoa cadastrada na mesma igreja. Integrantes devem ter papel `MEMBER` ou `VOLUNTEER`; um vínculo existente pode ser removido mesmo se o papel mudar depois.

## API

Todas as rotas exigem Bearer token e usam o prefixo `/api`:

| Método | Rota | Operação |
| --- | --- | --- |
| GET | `/ministries` | Listar ministérios com responsável e equipe |
| GET | `/ministries/people` | Listar somente id, nome e papel das pessoas da igreja |
| GET | `/ministries/:id` | Consultar um ministério |
| POST | `/ministries` | Criar |
| PATCH | `/ministries/:id` | Atualizar campos enviados |
| DELETE | `/ministries/:id` | Excluir o ministério e seus vínculos, preservando pessoas |
| POST | `/ministries/:id/members` | Vincular `{ "personId": "..." }`, sem duplicatas |
| DELETE | `/ministries/:id/members/:personId` | Desvincular uma pessoa |

Cadastro: `name` (1–120 caracteres), `description` (até 4000, padrão vazio), `status` (`ACTIVE` ou `INACTIVE`, padrão `ACTIVE`) e `leaderId` obrigatório. Atualizações parciais preservam os campos omitidos. Erros de entrada retornam 400, de permissão 403 e de conflito 409.

## Banco e execução

A migration `20260926120000_add_ministries` cria as tabelas e as chaves compostas que impedem vínculos entre igrejas também no PostgreSQL. Ela precisa ser aplicada no ambiente de destino pelo fluxo habitual de migrations antes de usar o módulo. Gere o Prisma Client após atualizar o schema:

```sh
pnpm --filter @sistema-igrejas/database generate
```

Os testes de integração aplicam as migrations em um schema aleatório `ministries_test_*`, criam duas igrejas e removem somente esse schema ao terminar. Não aplicam migrations no schema principal. A conexão usa `MINISTRIES_TEST_DATABASE_URL`, ou `DATABASE_URL` se aquela não estiver definida.

```sh
pnpm --filter api-br test:e2e --runTestsByPath test/ministries-security.e2e-spec.ts
pnpm --filter api-br test:e2e --runTestsByPath test/ministries.e2e-spec.ts
pnpm --filter api-br lint
```

O frontend usa `NEXT_PUBLIC_API_URL` (com `/api`) ou `NEXT_PUBLIC_API_BASE_URL` com `/api` acrescentado, seguindo as configurações já usadas pelo projeto.
