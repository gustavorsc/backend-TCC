# Estado do backend — para o desenvolvimento do frontend

_Atualizado em 24/09/2026 · branch `main` · o backend roda em outro repositório e o frontend consome esta API._

> **Mudança de contrato nesta atualização (RN20):** tarefas geradas pela IA agora vêm
> com `pergunta`/`opcoes`, e `PATCH /api/tarefas/:id/concluir` passa a esperar
> `{ respostaSelecionada }` no corpo para essas tarefas. Ver a seção
> [O fluxo de conclusão de tarefa](#o-fluxo-de-conclusão-de-tarefa-rn20) abaixo — é a parte que muda a tela de rotina que você já tem rodando.

## Situação em uma frase

O backend está **completo em contrato, regras de negócio e IA** (16 rotas, RN01–RN16 + RN20).
Roda localmente. Os dois fluxos de IA já foram validados com o modelo real e com
persistência real no banco, incluindo o novo card de estudo com questão (RN20).
Só falta deploy, se/quando for necessário.

## Prontidão por área

| Área | Estado | Observação |
|---|---|---|
| Autenticação (token Firebase) | ✅ pronto | backend só **verifica** o token; login/cadastro/reset são do frontend + Firebase |
| Usuário (`/me`, `/me/progresso`, excluir conta) | ✅ pronto e testado | `streakEmRisco` incluído (RN16) |
| Rotinas — CRUD (`GET`/`PUT`/`DELETE`, adicionar tarefa) | ✅ pronto e testado | |
| Tarefas — editar, remover, **concluir** (XP/streak/progresso) | ✅ pronto e testado | conclusão é idempotente; exige questão certa quando a tarefa tem `pergunta` (RN20) |
| Desafios — listar, concluir | ✅ pronto e testado | criação é automática (RN13) |
| Ranking semanal | ✅ pronto e testado | corrigido em 24/09: agora sobrevive à exclusão de rotina/tarefa (antes o XP delas sumia do ranking) |
| `POST /api/rotinas/chat` (gerar rotina com IA) | ✅ pronto e testado com OpenAI real | validado com modelo real + persistência real (23/09) |
| Desafio adaptativo gerado por IA (RN13) | ✅ pronto e testado com OpenAI real | roda em background ao concluir tarefa |
| Deploy / URL pública | ❌ ainda não | por enquanto só `localhost` |

**Para o frontend:** dá pra desenvolver contra **todas as rotas agora**, IA incluída.

## Como conectar

### Base URL

- Desenvolvimento: `http://localhost:3000` (porta configurável via `PORT`).
- Produção: a definir.

### Autenticação

Toda rota `/api/**` exige o header:

```
Authorization: Bearer <ID token do Firebase>
```

Fluxo:

1. Frontend faz login no Firebase (e-mail/senha ou Google) e pega o **ID token**.
2. Manda o token no header em toda requisição.
3. Backend valida com o Firebase Admin SDK.
   - Token ausente/inválido/expirado → `401` com `code: "NAO_AUTENTICADO"`.
4. No primeiro acesso de um usuário, o backend **cria o registro local automaticamente** — o frontend não chama nenhuma rota de "registrar".

O token do Firebase expira em ~1h; o frontend precisa renovar (SDK do Firebase faz isso) e repetir a requisição em caso de `401`.

Não há rota de editar perfil (`PUT /me`) — nome e e-mail vêm do Firebase.

### CORS

O backend libera **apenas** a origem definida em `FRONTEND_URL` no `.env` dele. Ao
subir o frontend numa porta/domínio, avisar para ajustar essa variável (ex.:
`http://localhost:5173` para Vite).

### Formato de resposta

- Sucesso: o corpo é o recurso (ou lista) em JSON. `204` sem corpo em exclusões.
- Erro: **sempre**
  ```json
  { "error": { "message": "texto legível", "code": "CODIGO" } }
  ```
- Datas: ISO 8601 UTC (ex.: `"2026-09-09T13:45:00.000Z"`).

## Rotas disponíveis (resumo)

Contrato completo, com todos os campos e exemplos: [`referencia-api.md`](referencia-api.md).

| Método | Rota | Resumo |
|---|---|---|
| `GET` | `/health` | `{ "status": "ok" }`, sem auth |
| `GET` | `/api/usuarios/me` | perfil: `id, nome, email, xpTotal, streakAtual, ultimaAtividade, dataCriacao` |
| `GET` | `/api/usuarios/me/progresso` | `{ xpTotal, streakAtual, streakEmRisco, rotinas: [{ id, tema, progresso }] }` |
| `DELETE` | `/api/usuarios/me` | exclui conta e dados (LGPD) → `204` |
| `GET` | `/api/ranking` | `[{ usuarioId, nome, xpSemana }]`, do maior para o menor, semana atual |
| `POST` | `/api/rotinas/chat` | conversa com a IA → pergunta de complemento (`200`) ou rotina criada (`201`) |
| `GET` | `/api/rotinas` | rotinas do usuário, cada uma com `_count.tarefas` |
| `GET` | `/api/rotinas/:id` | rotina + `tarefas[]` |
| `PUT` | `/api/rotinas/:id` | edita `tema, descricao, nivelConhecimento, tempoDisponivel, frequencia` |
| `DELETE` | `/api/rotinas/:id` | exclui rotina + tarefas → `204` |
| `POST` | `/api/rotinas/:id/tarefas` | adiciona tarefa → `201` |
| `PUT` | `/api/tarefas/:id` | edita `titulo, descricao` |
| `DELETE` | `/api/tarefas/:id` | remove tarefa (não a última da rotina) → `204` |
| `PATCH` | `/api/tarefas/:id/concluir` | conclui: +10 XP, streak, progresso, checa desafio. Corpo `{ respostaSelecionada? }` — obrigatório quando a tarefa tem `pergunta` (RN20) |
| `GET` | `/api/desafios` | desafios do usuário |
| `PATCH` | `/api/desafios/:id/concluir` | marca desafio como concluído |

### O fluxo de chat em detalhe

**Request** — o frontend guarda a conversa e manda **toda ela** a cada chamada (o backend não guarda histórico):

```json
POST /api/rotinas/chat
{ "mensagens": [ { "role": "user", "content": "..." }, { "role": "assistant", "content": "..." } ] }
```
Regras: 1–40 mensagens, `content` de 1–2000 chars, a última tem que ser `role: "user"`.

**Resposta `200` — a IA quer mais informação:**
```json
{ "tipo": "pergunta", "mensagem": "Qual seu nível atual?", "chamadasRestantes": 7 }
```

**Resposta `201` — rotina gerada e já salva:**
```json
{
  "tipo": "rotina",
  "rotina": {
    "id": "...", "tema": "...",
    "tarefas": [
      {
        "id": "...",
        "titulo": "Introdução à tabuada do 2",
        "descricao": "A tabuada do 2 é a multiplicação de um número por 2. Ex: 2x1=2, 2x2=4...",
        "pergunta": "Qual é o resultado de 2 x 3?",
        "opcoes": ["5", "6", "7", "8"],
        "concluida": false, "xpConcedido": 0
      }
    ]
  },
  "chamadasRestantes": 6
}
```

- A rotina retornada **já está persistida** — não há passo de "confirmar". `GET /api/rotinas` já a lista.
- `chamadasRestantes` = quantas chamadas de IA restam **hoje** (limite de 10/dia por usuário). Ao chegar a 0, a próxima retorna `429 LIMITE_IA_DIARIO`.
- Cada tarefa vem com `descricao` (resumo de estudo de verdade) + `pergunta`/`opcoes` (múltipla escolha) — **não** vem a resposta certa. Ver seção abaixo.

### O fluxo de conclusão de tarefa (RN20)

Tarefa gerada pela IA tem `pergunta` preenchida → a tela de "concluir" precisa virar
um card de pergunta (como na sua screenshot: mostrar o resumo, depois `opcoes` como
alternativas clicáveis) em vez de um clique direto. Tarefa sem `pergunta` (criada à
mão pelo usuário) continua sendo um clique simples.

```
PATCH /api/tarefas/:id/concluir
{ "respostaSelecionada": 1 }   // índice da opção escolhida em "opcoes", 0-based
```

| Situação | Resposta |
|---|---|
| Tarefa sem `pergunta` | corpo é ignorado, conclui direto (`200`, `concluida: true`) — igual ao fluxo antigo |
| Tarefa com `pergunta`, sem enviar `respostaSelecionada` | `400 RESPOSTA_OBRIGATORIA` |
| Tarefa com `pergunta`, resposta **errada** | `200 { "concluida": false, "correta": false, ... }` — **sem** XP, **sem** penalidade. Deixe o usuário tentar de novo (sem limite) |
| Tarefa com `pergunta`, resposta **certa** | `200 { "concluida": true, "correta": true, "xpConcedido": 10, ... }` |

`respostaCorreta` **nunca** aparece em nenhuma resposta da API (nem na geração, nem no
`GET`, nem numa tentativa errada) — o frontend não tem como "descobrir" a resposta
antes de acertar. Se quiser mostrar feedback de erro, use o `correta: false` da própria
resposta, não tente comparar client-side.

## Comportamentos que o frontend precisa saber

| Comportamento | Detalhe |
|---|---|
| **Tarefa vira quiz (RN20)** | tarefa com `pergunta` só conclui acertando `respostaSelecionada`. Sem limite de tentativas, sem penalidade em errar. |
| **Confirmação de exclusão (RN06)** | o backend **não** confirma nada — se `DELETE` for chamado, ele apaga. A tela de "tem certeza?" é responsabilidade do frontend. |
| **Aviso de streak (RN16)** | `GET /api/usuarios/me/progresso` traz `streakEmRisco: true/false`. `true` = tem streak ativo e nenhuma tarefa concluída hoje. O frontend decide como/quando notificar. |
| **Limite de IA (RN15)** | toda resposta do chat traz `chamadasRestantes`. Mostrar ao usuário e tratar o `429`. Reseta na virada do dia (horário de Brasília). |
| **Conclusão idempotente** | concluir uma tarefa já concluída retorna `200` com a tarefa, sem erro e sem somar XP de novo. |
| **Desafio adaptativo é assíncrono** | ele é criado em background quando o usuário conclui uma tarefa que atende à condição (RN13). Não vem na resposta do `concluir` — aparece na próxima chamada a `GET /api/desafios`. |
| **XP fixo** | 10 por tarefa concluída. `xpSemana` no ranking é sempre múltiplo de 10. |
| **Progresso** | inteiro 0–100 (% de tarefas concluídas da rotina), recalculado automaticamente. |
| **"Hoje" / semana** | calculados no fuso de São Paulo (UTC−3 fixo), não no fuso do navegador. |

## Códigos de erro (o que o frontend trata)

| HTTP | `code` | Situação |
|---|---|---|
| 400 | `VALIDACAO` | corpo inválido |
| 400 | `ROTINA_SEM_TAREFA` | tentou remover a última tarefa da rotina |
| 400 | `RESPOSTA_OBRIGATORIA` | tarefa tem pergunta e o `respostaSelecionada` não veio no corpo (RN20) |
| 401 | `NAO_AUTENTICADO` | token ausente/inválido/expirado → renovar token ou mandar pro login |
| 403 | `ROTINA_ACESSO_NEGADO` / `TAREFA_ACESSO_NEGADA` / `DESAFIO_ACESSO_NEGADO` | recurso de outro usuário |
| 404 | `ROTINA_NAO_ENCONTRADA` / `TAREFA_NAO_ENCONTRADA` / `DESAFIO_NAO_ENCONTRADO` | id inexistente |
| 429 | `LIMITE_IA_DIARIO` | limite de 10 chamadas de IA no dia |
| 502 | `IA_RESPOSTA_INVALIDA` | a IA respondeu fora do formato (raro; tentar de novo) |
| 503 | `IA_INDISPONIVEL` | OpenAI fora do ar / sem saldo → mensagem "tente mais tarde" |
| 500 | `ERRO_INTERNO` | erro inesperado |

## Rodar o backend localmente para desenvolver contra ele

No repositório do backend:

```bash
npm install
cp .env.example .env      # preencher: Supabase, Firebase, OPENAI_API_KEY, FRONTEND_URL
npx prisma migrate dev    # aplica o schema no banco
npm run dev               # http://localhost:3000
```

`GET http://localhost:3000/health` deve responder `{ "status": "ok" }`.

Para chamar rotas autenticadas em teste manual (Insomnia/Postman), é preciso um ID
token do Firebase — obtido pelo próprio frontend depois do login, ou pela API REST
de autenticação do Firebase.

## Pendências do backend

1. Deploy / URL pública (se for necessário — hoje só roda em `localhost`).

Nenhuma pendência técnica ou de contrato. Os fluxos de IA já foram validados com o modelo real.

## Documentação completa

Tudo em [`docs/`](README.md):

- [`visao-geral.md`](visao-geral.md) — o que o backend faz, ponta a ponta
- [`referencia-api.md`](referencia-api.md) — contrato de cada rota, campo a campo
- [`autenticacao.md`](autenticacao.md) — fluxo do token Firebase
- [`regras-de-negocio.md`](regras-de-negocio.md) — RN01–RN19
- [`gamificacao.md`](gamificacao.md) — XP, streak, ranking, desafios
- [`integracao-openai.md`](integracao-openai.md) — os fluxos de IA
- [`modelo-de-dados.md`](modelo-de-dados.md) — schema Prisma
