# Modelo de dados

ORM: Prisma. Banco: PostgreSQL (Supabase, região São Paulo). Schema em `prisma/schema.prisma`.

A autenticação é 100% Firebase, então **não há** senha, hash nem token de reset no
banco. O elo com o Firebase é o `firebaseUid`.

## Diagrama de relações

```
Usuario ──1:N──► Rotina ──1:N──► Tarefa
   │
   ├──1:N──► Desafio
   │
   └──1:N──► UsoIA        (contador da RN15; @@unique([usuarioId, dia]))
```

## Entidades

### Usuario

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` uuid | PK |
| `firebaseUid` | `String` | **único** — elo com o Firebase |
| `nome` | `String` | vem do token no 1º acesso |
| `email` | `String` | **único** (RN01) |
| `authProvider` | `String` | `"password"`, `"google.com"`, ... |
| `xpTotal` | `Int` = 0 | soma acumulada de XP (RN11) |
| `streakAtual` | `Int` = 0 | dias consecutivos com conclusão (RN12) |
| `ultimaAtividade` | `DateTime?` | instante da última conclusão de tarefa |
| `dataCriacao` | `DateTime` = now() | |

### Rotina

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` uuid | PK |
| `usuarioId` | `String` | FK → Usuario (RN04) |
| `tema` | `String` | obrigatório |
| `descricao` | `String?` | |
| `nivelConhecimento` | `String?` | contexto informado no chat |
| `tempoDisponivel` | `String?` | ex.: `"1h por dia"` |
| `frequencia` | `String?` | ex.: `"5x por semana"` |
| `progresso` | `Float` = 0 | 0–100, recalculado (RN08) |
| `dataCriacao` | `DateTime` = now() | |

### Tarefa

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` uuid | PK |
| `rotinaId` | `String` | FK → Rotina |
| `titulo` | `String` | obrigatório |
| `descricao` | `String?` | |
| `concluida` | `Boolean` = false | |
| `dataCriacao` | `DateTime` = now() | usada na condição do desafio adaptativo (RN13) |
| `dataConclusao` | `DateTime?` | preenchida ao concluir; usada no ranking (RN14) |
| `xpConcedido` | `Int` = 0 | vira 10 ao concluir (RN09, RN11) |
| `pergunta` | `String?` | questão de múltipla escolha gerada pela IA (RN20); `null` em tarefas criadas manualmente |
| `opcoes` | `String[]` = `[]` | alternativas da questão |
| `respostaCorreta` | `Int?` | índice (0-based) da opção certa em `opcoes`. **Nunca sai em nenhuma resposta da API** — `omit` global no client Prisma (`lib/prisma.ts`); só `tarefa.service.concluir` a lê, explicitamente, pra conferir a resposta enviada |

### Desafio

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` uuid | PK |
| `usuarioId` | `String` | FK → Usuario |
| `tema` | `String` | tema das tarefas atrasadas |
| `conteudo` | `String` | texto gerado pela IA: 1ª linha título, depois o corpo |
| `concluido` | `Boolean` = false | |
| `dataCriacao` | `DateTime` = now() | |

### UsoIA

Contador da RN15 — uma linha por usuário por dia.

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` uuid | PK |
| `usuarioId` | `String` | FK → Usuario |
| `dia` | `String` | `"YYYY-MM-DD"` no fuso de São Paulo |
| `contagem` | `Int` = 0 | incrementada a cada chamada de chat liberada |
| | | `@@unique([usuarioId, dia])` |

Incrementada via `upsert` atômico **antes** de chamar a OpenAI. Linhas antigas não
são limpas (servem de histórico de uso). São apagadas junto com a conta em
`DELETE /api/usuarios/me`.

## Ranking não é tabela

`GET /api/ranking` calcula na hora: `Tarefa` com `dataConclusao` na semana corrente
→ `xpConcedido` somado por usuário (via `Rotina.usuarioId`) → ordenado desc. Não há
entidade `Ranking` nem cache.

## Regras de exclusão (foreign keys)

Não há `onDelete: Cascade`. As exclusões são feitas explicitamente em transação,
na ordem certa:

- **`DELETE /api/rotinas/:id`**: `tarefas` da rotina → `rotina`.
- **`DELETE /api/usuarios/me`**: `tarefas` (via rotinas do usuário) → `rotinas` → `desafios` → `usosIA` → `usuario`.

## Migrations

Em `prisma/migrations/`, aplicadas na Supabase:

| Migration | Conteúdo |
|---|---|
| `20260902181806_init` | `Usuario`, `Rotina`, `Tarefa`, `Desafio` |
| `20260902183752_add_tarefa_data_criacao` | `Tarefa.dataCriacao` (base da condição do desafio adaptativo) |
| `20260903182503_add_uso_ia` | tabela `UsoIA` + relação em `Usuario` |
| `20260924174624_add_tarefa_questao` | `Tarefa.pergunta`/`opcoes`/`respostaCorreta` (RN20) |

Fluxo: editar `schema.prisma` → `npx prisma migrate dev --name <nome>` (usa `DIRECT_URL`).
Ao mudar o schema, atualizar também a seção de modelo de dados do `../CLAUDE.md`.
