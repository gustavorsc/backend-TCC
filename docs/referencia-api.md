# Referência da API

Contrato completo de cada rota. `base URL` = origem do backend (ex.: `http://localhost:3000` em desenvolvimento).

Convenções:

- Todas as rotas `/api/**` exigem `Authorization: Bearer <ID token Firebase>`.
- Corpo e resposta em `application/json`.
- Erros seguem sempre `{ "error": { "message": string, "code": string } }`.
- Datas em ISO 8601 UTC (ex.: `"2026-09-08T13:45:00.000Z"`).

Índice: [Saúde](#saúde) · [Usuário](#usuário) · [Rotinas](#rotinas) · [Tarefas](#tarefas) · [Desafios](#desafios) · [Ranking](#ranking) · [Tabela de erros](#tabela-de-erros)

---

## Saúde

### `GET /health`

Sem autenticação. Para monitoramento/deploy.

**200**
```json
{ "status": "ok" }
```

---

## Usuário

### `GET /api/usuarios/me`

Perfil do usuário autenticado. (RF01, RF02)

**200**
```json
{
  "id": "b3f1c2d4-...",
  "nome": "Ana",
  "email": "ana@example.com",
  "xpTotal": 120,
  "streakAtual": 4,
  "ultimaAtividade": "2026-09-08T12:00:00.000Z",
  "dataCriacao": "2026-08-01T09:30:00.000Z"
}
```

`firebaseUid` e `authProvider` **não** são expostos.

---

### `GET /api/usuarios/me/progresso`

XP, streak, risco de streak (RN16) e progresso de cada rotina. (RF09, RF10, RN16)

**200**
```json
{
  "xpTotal": 120,
  "streakAtual": 4,
  "streakEmRisco": false,
  "rotinas": [
    { "id": "rot-1", "tema": "Cálculo I", "progresso": 40 },
    { "id": "rot-2", "tema": "Inglês", "progresso": 100 }
  ]
}
```

- `streakEmRisco`: `true` quando `streakAtual > 0` **e** a última atividade não foi hoje (dia civil de São Paulo). O frontend usa isso para exibir o aviso da RN16.
- `progresso`: inteiro de 0 a 100 (% de tarefas concluídas da rotina).
- `rotinas` ordenadas da mais recente para a mais antiga.

---

### `DELETE /api/usuarios/me`

Exclui a conta e todos os dados pessoais. (RNF02 — LGPD)

Apaga, em transação: tarefas → rotinas → desafios → contadores `UsoIA` → o próprio `Usuario`.
Depois tenta remover o usuário no Firebase Auth (best-effort; se falhar, não impede a exclusão dos dados).

**204** — sem corpo.

O frontend deve, em seguida, deslogar do Firebase.

---

## Rotinas

### `POST /api/rotinas/chat`

Conversa com a IA para gerar a rotina de estudos. (RF03, RF12, RN10, RN15)

O backend **não guarda histórico** — o frontend envia toda a conversa a cada requisição.

**Request**
```json
{
  "mensagens": [
    { "role": "user", "content": "quero estudar cálculo, sou iniciante" },
    { "role": "assistant", "content": "Quanto tempo por dia você tem?" },
    { "role": "user", "content": "1 hora, 5 dias por semana" }
  ]
}
```

Regras do corpo (`chatSchema`):

| Campo | Regra |
|---|---|
| `mensagens` | array, 1 a 40 itens |
| `mensagens[].role` | `"user"` ou `"assistant"` (o `system` é montado no backend) |
| `mensagens[].content` | string, 1 a 2000 caracteres |
| última mensagem | precisa ser `role: "user"` |

**200 — a IA quer mais informação**
```json
{
  "tipo": "pergunta",
  "mensagem": "Qual seu nível atual em cálculo: nunca estudou, ou já viu limites?",
  "chamadasRestantes": 7
}
```

**201 — rotina gerada e já persistida**
```json
{
  "tipo": "rotina",
  "rotina": {
    "id": "rot-9",
    "usuarioId": "b3f1c2d4-...",
    "tema": "Cálculo I",
    "descricao": "Rotina introdutória de 4 semanas",
    "nivelConhecimento": "iniciante",
    "tempoDisponivel": "1h por dia",
    "frequencia": "5x por semana",
    "progresso": 0,
    "dataCriacao": "2026-09-08T13:00:00.000Z",
    "tarefas": [
      {
        "id": "tar-40",
        "rotinaId": "rot-9",
        "titulo": "Revisar funções e gráficos",
        "descricao": "Resumo de estudo em 2-4 frases, com conteúdo de verdade — não é só o título repetido.",
        "concluida": false,
        "dataCriacao": "2026-09-08T13:00:00.000Z",
        "dataConclusao": null,
        "xpConcedido": 0,
        "pergunta": "Qual das opções abaixo é uma função crescente?",
        "opcoes": ["y = -x", "y = x²  (x<0)", "y = x", "y = -x²"]
      }
    ]
  },
  "chamadasRestantes": 6
}
```

- `chamadasRestantes`: quantas chamadas à IA ainda restam **hoje** para esse usuário (limite `IA_LIMITE_DIARIO = 10`, RN15). Vai de 9 a 0.
- Quando `tipo: "rotina"`, a rotina **já está salva** — não há passo de confirmação. `GET /api/rotinas` passa a listá-la.
- A rotina gerada sempre tem ≥ 1 tarefa (RN03, garantido na validação).
- **RN20 — cada tarefa é um card de estudo:** `descricao` é um resumo de verdade (não repete o título) e vem sempre com `pergunta` + `opcoes` (múltipla escolha). **A resposta certa nunca aparece em nenhuma resposta da API** — nem aqui, nem em `GET /api/rotinas/:id`. Ver `PATCH /api/tarefas/:id/concluir`.

**Erros específicos**

| HTTP | code | Quando |
|---|---|---|
| 400 | `VALIDACAO` | corpo fora do `chatSchema` |
| 429 | `LIMITE_IA_DIARIO` | 10ª chamada do dia já usada — checado **antes** de chamar a OpenAI |
| 502 | `IA_RESPOSTA_INVALIDA` | a IA respondeu algo fora do contrato (RN10) |
| 503 | `IA_INDISPONIVEL` | falha/timeout na OpenAI |

Ver [integracao-openai.md](integracao-openai.md) para o formato interno esperado da IA.

---

### `GET /api/rotinas`

Lista as rotinas do usuário autenticado, mais recentes primeiro. (RF04, RN04)

**200**
```json
[
  {
    "id": "rot-9",
    "usuarioId": "b3f1c2d4-...",
    "tema": "Cálculo I",
    "descricao": "Rotina introdutória de 4 semanas",
    "nivelConhecimento": "iniciante",
    "tempoDisponivel": "1h por dia",
    "frequencia": "5x por semana",
    "progresso": 0,
    "dataCriacao": "2026-09-08T13:00:00.000Z",
    "_count": { "tarefas": 12 }
  }
]
```

`_count.tarefas` = total de tarefas da rotina (útil para a listagem sem carregar as tarefas).

---

### `GET /api/rotinas/:id`

Detalhe de uma rotina com todas as tarefas. (RF04, RN04)

**200** — objeto `Rotina` (mesmos campos acima, sem `_count`) + `tarefas: Tarefa[]`.

**Erros:** `404 ROTINA_NAO_ENCONTRADA` · `403 ROTINA_ACESSO_NEGADO` (rotina de outro usuário).

---

### `PUT /api/rotinas/:id`

Edita a rotina. (RF05, RN05)

**Request** (`atualizarRotinaSchema`) — pelo menos um campo, todos opcionais:
```json
{
  "tema": "Cálculo I e II",
  "descricao": "Ampliado para 8 semanas",
  "nivelConhecimento": "intermediário",
  "tempoDisponivel": "1h30 por dia",
  "frequencia": "6x por semana"
}
```

- Campos aceitam `string` ou `null` (exceto `tema`, que se enviado não pode ser vazio).
- Campos **não** aceitos: `progresso`, `dataCriacao`, `usuarioId`, `tarefas` (corpo com chave desconhecida → `400 VALIDACAO`).
- Corpo `{}` → `400 VALIDACAO` ("Envie ao menos um campo para atualizar").

**200** — objeto `Rotina` atualizado.

**Erros:** `400 VALIDACAO` · `404 ROTINA_NAO_ENCONTRADA` · `403 ROTINA_ACESSO_NEGADO`.

---

### `DELETE /api/rotinas/:id`

Exclui a rotina e todas as suas tarefas (transação). (RF06, RN06)

A confirmação com o usuário (RN06) é responsabilidade do frontend.

**204** — sem corpo.

**Erros:** `404 ROTINA_NAO_ENCONTRADA` · `403 ROTINA_ACESSO_NEGADO`.

---

### `POST /api/rotinas/:id/tarefas`

Adiciona uma tarefa à rotina e recalcula o progresso. (RF07, RN03)

**Request** (`criarTarefaSchema`):
```json
{ "titulo": "Resolver a lista 3", "descricao": "Exercícios 1 a 20" }
```

| Campo | Regra |
|---|---|
| `titulo` | string, obrigatório, mínimo 1 caractere |
| `descricao` | string ou `null`, opcional |

**201** — objeto `Tarefa` criado.

**Erros:** `400 VALIDACAO` · `404 ROTINA_NAO_ENCONTRADA` · `403 ROTINA_ACESSO_NEGADO`.

---

## Tarefas

Objeto `Tarefa`:
```json
{
  "id": "tar-40",
  "rotinaId": "rot-9",
  "titulo": "Revisar funções",
  "descricao": "Resumo de estudo — o suficiente para responder a pergunta abaixo.",
  "concluida": false,
  "dataCriacao": "2026-09-08T13:00:00.000Z",
  "dataConclusao": null,
  "xpConcedido": 0,
  "pergunta": "Qual das opções é uma função crescente?",
  "opcoes": ["y = -x", "y = x²", "y = x", "y = -x²"]
}
```

`pergunta`/`opcoes` só existem em tarefas geradas pela IA (RN20). Tarefas criadas manualmente
(`POST /rotinas/:id/tarefas`) não têm questão: `pergunta` vem `null`, `opcoes` vem `[]`.
Não existe campo `respostaCorreta` na resposta — a API nunca a expõe (ver `PATCH .../concluir`).

### `PUT /api/tarefas/:id`

Edita `titulo` / `descricao`. (RF07)

**Request** (`atualizarTarefaSchema`) — ao menos um campo:
```json
{ "titulo": "Revisar funções e limites", "descricao": null }
```

Campos `concluida`, `dataConclusao`, `xpConcedido` **não** são editáveis aqui (só via `PATCH .../concluir`).

**200** — `Tarefa` atualizada.

**Erros:** `400 VALIDACAO` · `404 TAREFA_NAO_ENCONTRADA` · `403 TAREFA_ACESSO_NEGADA`.

---

### `DELETE /api/tarefas/:id`

Remove a tarefa e recalcula o progresso da rotina. (RF07, RN03)

**Não permite** remover a **última** tarefa de uma rotina → `400 ROTINA_SEM_TAREFA` ("Uma rotina precisa ter ao menos uma tarefa").

**204** — sem corpo.

**Erros:** `400 ROTINA_SEM_TAREFA` · `404 TAREFA_NAO_ENCONTRADA` · `403 TAREFA_ACESSO_NEGADA`.

---

### `PATCH /api/tarefas/:id/concluir`

Conclui a tarefa e dispara a gamificação. (RF08, RN07–RN13, RN20)

**Request** — corpo opcional:
```json
{ "respostaSelecionada": 2 }
```

- **Tarefa sem `pergunta`** (criada manualmente): corpo é ignorado, conclui direto — igual ao comportamento antigo.
- **Tarefa com `pergunta`** (gerada pela IA): `respostaSelecionada` (índice em `opcoes`, 0-based) é **obrigatório**.
  - Sem `respostaSelecionada` → `400 RESPOSTA_OBRIGATORIA`.
  - Resposta **errada** → **não conclui**, `200` com `{ "concluida": false, "correta": false, ... }`. Sem penalidade, sem limite de tentativas — pode chamar de novo com outro índice.
  - Resposta **certa** → conclui normalmente, `200` com `{ "concluida": true, "correta": true, "xpConcedido": 10, ... }`.

Efeitos ao concluir (resposta certa, ou tarefa sem pergunta, ainda não concluída):

1. `concluida = true`, `dataConclusao = agora`, `xpConcedido = 10`.
2. `usuario.xpTotal += 10`; `streakAtual` recalculado; `ultimaAtividade = agora`.
3. `progresso` da rotina recalculado.
4. **Após o commit:** checa a condição do desafio adaptativo (RN13) — best-effort.

**Idempotente:** concluir uma tarefa já concluída retorna a tarefa como está (sem `correta`), **sem** repetir XP/streak — mesmo se vier `respostaSelecionada` no corpo.

**200** — objeto `Tarefa` **sem** `respostaCorreta`, mais `correta` (só presente quando a tarefa tinha pergunta: `true` se concluiu por ter acertado, `false` se errou).

**Erros:** `400 RESPOSTA_OBRIGATORIA` (tarefa com pergunta, sem `respostaSelecionada`) · `400 VALIDACAO` (`respostaSelecionada` num formato inválido) · `404 TAREFA_NAO_ENCONTRADA` · `403 TAREFA_ACESSO_NEGADA`.

> A conclusão **nunca** falha por causa da IA: se a geração do desafio adaptativo der erro, ela é apenas registrada no log do servidor e a tarefa é concluída normalmente.

---

## Desafios

Objeto `Desafio`:
```json
{
  "id": "des-3",
  "usuarioId": "b3f1c2d4-...",
  "tema": "Cálculo I",
  "conteudo": "Retomada de Cálculo I\n\nObjetivo: ...\n1. ...\n2. ...",
  "concluido": false,
  "dataCriacao": "2026-09-08T14:00:00.000Z"
}
```

`conteudo` é um texto gerado pela IA: primeira linha = título, depois o corpo com os passos.

### `GET /api/desafios`

Lista os desafios do usuário, mais recentes primeiro. (RN13)

**200** — `Desafio[]`.

### `PATCH /api/desafios/:id/concluir`

Marca um desafio como concluído. Idempotente. (RN13)

Sem corpo.

**200** — `Desafio` (com `concluido: true`).

**Erros:** `404 DESAFIO_NAO_ENCONTRADO` · `403 DESAFIO_ACESSO_NEGADO`.

---

## Ranking

### `GET /api/ranking`

Ranking semanal de **todos** os usuários. (RN14)

Soma o `xpConcedido` das tarefas concluídas na **semana corrente** (segunda a domingo, fuso de São Paulo), agrupado por usuário, do maior para o menor.

**200**
```json
[
  { "usuarioId": "u1", "nome": "Ana", "xpSemana": 90 },
  { "usuarioId": "u2", "nome": "Bruno", "xpSemana": 50 }
]
```

- Usuários sem tarefas concluídas na semana **não aparecem** na lista.
- A lista reinicia toda segunda-feira (00:00 em São Paulo).

---

## Tabela de erros

| HTTP | `code` | Origem |
|---|---|---|
| 400 | `VALIDACAO` | corpo reprovado por um schema Zod |
| 400 | `ROTINA_SEM_TAREFA` | tentativa de remover a última tarefa da rotina (RN03) |
| 400 | `RESPOSTA_OBRIGATORIA` | concluir tarefa com pergunta sem enviar `respostaSelecionada` (RN20) |
| 401 | `NAO_AUTENTICADO` | token ausente, malformado, inválido ou expirado |
| 403 | `ROTINA_ACESSO_NEGADO` | rotina pertence a outro usuário |
| 403 | `TAREFA_ACESSO_NEGADA` | tarefa pertence a outro usuário |
| 403 | `DESAFIO_ACESSO_NEGADO` | desafio pertence a outro usuário |
| 404 | `ROTINA_NAO_ENCONTRADA` | id de rotina inexistente |
| 404 | `TAREFA_NAO_ENCONTRADA` | id de tarefa inexistente |
| 404 | `DESAFIO_NAO_ENCONTRADO` | id de desafio inexistente |
| 429 | `LIMITE_IA_DIARIO` | limite de 10 chamadas de IA/dia atingido (RN15) |
| 502 | `IA_RESPOSTA_INVALIDA` | retorno da IA fora do contrato (RN10) |
| 503 | `IA_INDISPONIVEL` | erro/timeout na OpenAI |
| 500 | `ERRO_INTERNO` | exceção não prevista (nada interno vaza no corpo) |

---

## Exemplos com `curl`

```bash
TOKEN="<ID token do Firebase>"
BASE="http://localhost:3000"

# Perfil
curl -s "$BASE/api/usuarios/me" -H "Authorization: Bearer $TOKEN"

# Progresso (com streakEmRisco)
curl -s "$BASE/api/usuarios/me/progresso" -H "Authorization: Bearer $TOKEN"

# Chat de rotina
curl -s -X POST "$BASE/api/rotinas/chat" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"mensagens":[{"role":"user","content":"quero estudar inglês, nível básico, 30min por dia, 4x na semana"}]}'

# Listar rotinas
curl -s "$BASE/api/rotinas" -H "Authorization: Bearer $TOKEN"

# Concluir tarefa
curl -s -X PATCH "$BASE/api/tarefas/tar-40/concluir" -H "Authorization: Bearer $TOKEN"

# Ranking
curl -s "$BASE/api/ranking" -H "Authorization: Bearer $TOKEN"
```
