# Configuração e execução

## Pré-requisitos

- Node.js (versão compatível com as libs do `package.json` — `@types/node` 22, TS 5.6).
- Acesso ao projeto Supabase (PostgreSQL) e ao projeto Firebase.
- Chave da API da OpenAI (para os fluxos de IA).

## Variáveis de ambiente (`.env`)

Copiar de `.env.example`:

```
DATABASE_URL=        # Supabase — Transaction Pooler (porta 6543, com ?pgbouncer=true). Usada em runtime.
DIRECT_URL=          # Supabase — conexão direta (porta 5432). Usada só pelo Prisma CLI (migrations).
FRONTEND_URL=        # origem exata do frontend, para o CORS (ex.: http://localhost:5173)
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=   # com \n literais — o backend converte para quebras de linha reais
OPENAI_API_KEY=
OPENAI_MODEL=           # opcional, default gpt-4o-mini
PORT=3000               # opcional, default 3000
```

### Onde achar cada valor

| Variável | Origem |
|---|---|
| `DATABASE_URL`, `DIRECT_URL` | Supabase → Project Settings → Connect → aba ORM → Prisma |
| `FIREBASE_*` | Firebase Console → Project Settings → Service accounts → Generate new private key |
| `OPENAI_API_KEY` | platform.openai.com → API keys |
| `FRONTEND_URL` | a URL onde o frontend roda |

### Comportamento com variáveis faltando

| Faltando | Efeito |
|---|---|
| `FRONTEND_URL` | aviso no boot; requisições do navegador barradas pelo CORS |
| `FIREBASE_*` | aviso no boot; servidor sobe (para `/health`), mas toda rota autenticada falha no token |
| `OPENAI_API_KEY` | aviso no boot; `POST /api/rotinas/chat` → `503`; geração de desafio falha em silêncio |
| `DATABASE_URL` | Prisma não conecta; rotas que tocam o banco falham com `500` |

## Banco de dados (Supabase)

Duas connection strings porque o app usa o pooler em runtime, mas o Prisma CLI
precisa de conexão direta para migrations:

- `DATABASE_URL` → Transaction Pooler, porta **6543**, com `?pgbouncer=true`.
- `DIRECT_URL` → conexão direta, porta **5432**.

O `datasource` do `schema.prisma` já referencia as duas (`url` + `directUrl`).

### Migrations

```bash
npx prisma migrate dev --name <nome>   # cria e aplica (usa DIRECT_URL)
npx prisma generate                    # regenera o client (roda junto com migrate dev)
```

Ao alterar `schema.prisma`, atualizar também a seção de modelo de dados do `../CLAUDE.md`.

## Scripts npm

| Script | O que faz |
|---|---|
| `npm run dev` | sobe o servidor com reload (`ts-node-dev`, `src/server.ts`) |
| `npm run build` | compila TypeScript para `dist/` (`tsc`) |
| `npm start` | roda o build (`node dist/server.js`) |
| `npm test` | roda os testes (Jest) |
| `npm run prisma:generate` | `prisma generate` |
| `npm run prisma:migrate` | `prisma migrate dev` |

## Rodar localmente

```bash
npm install
cp .env.example .env      # e preencher os valores
npx prisma migrate dev    # aplica as migrations no banco
npm run dev               # http://localhost:3000
curl http://localhost:3000/health   # {"status":"ok"}
```

## CORS

`app.ts` configura `cors({ origin: process.env.FRONTEND_URL, credentials: true })`.
Só a origem em `FRONTEND_URL` é liberada. Se o frontend mudar de porta/domínio,
atualizar a variável.

## Estrutura de pastas

```
src/
├── app.ts                # monta o Express (CORS, json, rotas, errorHandler)
├── server.ts             # carrega .env e sobe o servidor
├── routes/               # definição das rotas + validateBody
├── middlewares/          # authMiddleware, validateBody, errorHandler
├── controllers/          # req → service → res
├── services/             # regra de negócio
├── schemas/              # Zod: entrada e retorno da IA
├── lib/                  # prisma, openai, firebase-admin
└── utils/                # tempo (fuso), streak, constants, validate
prisma/
├── schema.prisma
└── migrations/
tests/                    # espelha src/ (services, routes, utils)
docs/                     # esta documentação
```

## Testes

- **Framework:** Jest + `ts-jest` (`jest.config.js`, preset `ts-jest`, `clearMocks: true`).
- **Cobertura atual:** 67 testes / 12 suítes.
- **Como mockam:**
  - `lib/prisma` é substituído por um objeto de `jest.fn()` por suíte;
  - `lib/openai` e/ou `services/ia.service` são mockados nos testes que tocam IA;
  - `lib/firebase-admin` é mockado nos testes de rota (`supertest`) para simular `verifyIdToken`.
- **O que é testado:** services (rotina, tarefa, desafio, ranking, usuário, usoIA, ia), utils (`tempo`, `streak`), e os endpoints principais de ponta a ponta (`health`, rotinas, chat).
- **Tipagem:** `npx tsc --noEmit` (sem emitir; `strict` ligado, `noUnusedLocals`, `noUnusedParameters`).

```bash
npm test                     # tudo
npx jest tests/services       # um diretório
npx jest rotina.chat          # por nome
npx tsc --noEmit              # só checagem de tipos
```

## Deploy

Ainda não definido. Pontos a considerar quando for definir:

- Rodar `npm run build` e servir `dist/`.
- `prisma migrate deploy` (não `dev`) no pipeline, usando `DIRECT_URL`.
- Setar todas as variáveis de ambiente no provedor.
- `FRONTEND_URL` apontando para o domínio de produção do frontend.
- Healthcheck em `GET /health`.
