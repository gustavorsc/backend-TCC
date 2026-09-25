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
   ├──1:N──► UsoIA         (contador da RN15; @@unique([usuarioId, dia]))
   │
   └──1:N──► HistoricoXP   (registro permanente de XP; base do ranking, RN14)
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

### HistoricoXP

Registro permanente de cada concessão de XP — base do ranking semanal (RN14).

| Campo | Tipo | Notas |
|---|---|---|
| `id` | `String` uuid | PK |
| `usuarioId` | `String` | FK → Usuario |
| `xp` | `Int` | quantidade concedida (hoje sempre `XP_POR_TAREFA` = 10) |
| `dataCriacao` | `DateTime` = now() | usada pra filtrar a semana corrente no ranking (índice) |

Gravada dentro da mesma transação que incrementa `Usuario.xpTotal`
(`tarefa.service.concluir`) — nunca criada, editada ou apagada em nenhum outro
lugar. **Diferente de `Tarefa`, nunca é removida quando uma rotina é excluída** —
é por isso que existe: pra desacoplar o ranking semanal do ciclo de vida da
`Tarefa`/`Rotina`. Apagada junto com a conta em `DELETE /api/usuarios/me`.

## Ranking não é tabela (de posições) — mas depende de HistoricoXP

`GET /api/ranking` calcula na hora: soma `HistoricoXP.xp` com `dataCriacao` na
semana corrente, por usuário, ordenado desc. Não há entidade `Ranking` nem cache
— mas ao contrário da versão anterior (que somava direto de `Tarefa`), agora **não
depende mais de `Tarefa` existir**: apagar uma rotina/tarefa depois de concluída
não tira o XP dela do ranking daquela semana, só como `Usuario.xpTotal` (o total
permanente) já não era afetado.

## Regras de exclusão (foreign keys)

Não há `onDelete: Cascade`. As exclusões são feitas explicitamente em transação,
na ordem certa:

- **`DELETE /api/rotinas/:id`**: `tarefas` da rotina → `rotina`. **Não** apaga `HistoricoXP` — de propósito (ver acima).
- **`DELETE /api/usuarios/me`**: `tarefas` (via rotinas do usuário) → `rotinas` → `desafios` → `usosIA` → `historicoXP` → `usuario`.

## Migrations

Em `prisma/migrations/`, aplicadas na Supabase:

| Migration | Conteúdo |
|---|---|
| `20260902181806_init` | `Usuario`, `Rotina`, `Tarefa`, `Desafio` |
| `20260902183752_add_tarefa_data_criacao` | `Tarefa.dataCriacao` (base da condição do desafio adaptativo) |
| `20260903182503_add_uso_ia` | tabela `UsoIA` + relação em `Usuario` |
| `20260924174624_add_tarefa_questao` | `Tarefa.pergunta`/`opcoes`/`respostaCorreta` (RN20) |
| `20260924182456_add_historico_xp` | tabela `HistoricoXP` — desacopla o ranking semanal (RN14) da `Tarefa` |

Fluxo: editar `schema.prisma` → `npx prisma migrate dev --name <nome>` (usa `DIRECT_URL`).
Ao mudar o schema, atualizar também a seção de modelo de dados do `../CLAUDE.md`.
