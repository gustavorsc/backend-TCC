# Visão geral — o que o backend faz

Documento único e abrangente do comportamento do backend. Serve de base para o
frontend e para a documentação do TCC.

## 1. Propósito

O backend é uma **API REST** responsável por:

- **Regras de negócio** da aplicação (rotinas, tarefas, XP, streak, ranking, desafios).
- **Autenticação** por verificação de token Firebase (não gerencia login/cadastro/senha — isso é do frontend + Firebase).
- **Persistência** em PostgreSQL via Prisma.
- **Integração com a OpenAI** para gerar rotinas de estudo e o conteúdo dos desafios adaptativos.

Não há papéis (professor/aluno): todo usuário autenticado tem o mesmo tipo de acesso, sempre restrito aos próprios dados.

## 2. Stack e arquitetura

| Camada | Papel |
|---|---|
| `routes/` | Define as rotas e aplica middlewares de validação. |
| `middlewares/` | `authMiddleware` (token Firebase), `validateBody` (Zod), `errorHandler`. |
| `controllers/` | Recebe a requisição, chama o service, devolve a resposta HTTP. Sem regra de negócio. |
| `services/` | Toda a regra de negócio. Nunca acessa `req`/`res`. |
| `schemas/` | Schemas Zod de entrada e do retorno da IA. |
| `lib/` | Clients: `prisma`, `openai`, `firebase-admin`. |
| `utils/` | `tempo` (fuso), `streak`, `constants`, `validate`. |

Fluxo de uma requisição autenticada:

```
Request
  → CORS
  → express.json()
  → authMiddleware            (401 se o token falhar)
  → validateBody (Zod)        (400 se o corpo falhar) — só nas rotas com corpo
  → controller → service → Prisma / OpenAI
  → controller → Response

Qualquer erro lançado no caminho cai no errorHandler,
que responde { "error": { "message", "code" } }.
```

## 3. Autenticação (resumo)

1. O frontend faz login no Firebase e obtém um ID token.
2. Toda requisição a `/api/*` manda `Authorization: Bearer <token>`.
3. `authMiddleware` valida o token com o Firebase Admin SDK. Inválido/ausente → `401 NAO_AUTENTICADO`.
4. Busca o `Usuario` local por `firebaseUid`. Se não existir (primeiro acesso), **cria** — não é erro.
5. Anexa o usuário em `req.usuario` para os controllers.

`GET /health` é a única rota fora desse fluxo.

Detalhes em [autenticacao.md](autenticacao.md).

## 4. O que cada recurso faz

### Usuário (`/api/usuarios`)

- **`GET /me`** — perfil do usuário autenticado: `id`, `nome`, `email`, `xpTotal`, `streakAtual`, `ultimaAtividade`, `dataCriacao`. Nunca expõe `firebaseUid`.
- **`GET /me/progresso`** — `xpTotal`, `streakAtual`, `streakEmRisco` (RN16) e a lista de rotinas com seu `progresso` (%).
- **`DELETE /me`** — exclui a conta e todos os dados pessoais (tarefas, rotinas, desafios, contadores de uso da IA) e tenta remover o usuário no Firebase Auth (best-effort). Atende à LGPD (RNF02).

### Rotinas (`/api/rotinas`)

- **`POST /chat`** — o coração da geração de rotina. O frontend manda a conversa (`mensagens[]`); a IA responde com uma **pergunta de complemento** (`200`) ou com a **rotina pronta** (`201`), que já é persistida como `Rotina` + `Tarefas` do usuário. Ver [integracao-openai.md](integracao-openai.md).
- **`GET /`** — lista as rotinas do usuário, cada uma com a contagem de tarefas (`_count.tarefas`).
- **`GET /:id`** — detalhe de uma rotina com todas as suas tarefas.
- **`PUT /:id`** — edita campos da rotina (`tema`, `descricao`, `nivelConhecimento`, `tempoDisponivel`, `frequencia`). `progresso` não é editável — é recalculado.
- **`DELETE /:id`** — apaga a rotina e suas tarefas (em transação).
- **`POST /:id/tarefas`** — adiciona uma tarefa à rotina e recalcula o progresso.

Uma rotina **pertence a um único usuário** (RN04). Acessar rotina de outro usuário → `403`.

### Tarefas (`/api/tarefas`)

- **`PUT /:id`** — edita `titulo` / `descricao`.
- **`DELETE /:id`** — remove a tarefa, **exceto** se for a última da rotina (RN03 → `400 ROTINA_SEM_TAREFA`). Recalcula o progresso.
- **`PATCH /:id/concluir`** — marca a tarefa como concluída e dispara os efeitos de gamificação:
  - **RN20:** tarefa gerada pela IA tem uma questão de múltipla escolha (`pergunta`/`opcoes`) — exige `respostaSelecionada` correta no corpo pra concluir; errar não conclui nem penaliza (tentativas ilimitadas). Tarefa criada manualmente não tem questão e conclui direto;
  - concede **+10 XP** (uma única vez — idempotente);
  - atualiza o **streak** (dia civil de São Paulo);
  - recalcula o **progresso** da rotina;
  - **depois do commit**, checa a condição do **desafio adaptativo** (RN13) — best-effort, sem quebrar a conclusão se a IA falhar.

### Desafios (`/api/desafios`)

- **`GET /`** — lista os desafios do usuário (mais recentes primeiro).
- **`PATCH /:id/concluir`** — marca um desafio como concluído (idempotente).

Desafios são criados automaticamente pelo sistema (RN13), nunca pelo usuário.

### Ranking (`/api/ranking`)

- **`GET /`** — ranking **semanal** de todos os usuários: soma do XP das tarefas concluídas na semana corrente (segunda a domingo, fuso de São Paulo), do maior para o menor. Não é uma tabela — é calculado on-the-fly.

### Saúde

- **`GET /health`** — `{ "status": "ok" }`, sem autenticação. Para monitoramento/deploy.

## 5. Gamificação (resumo)

| Mecânica | Regra |
|---|---|
| **XP** | +10 por tarefa concluída (`XP_POR_TAREFA`), só na primeira conclusão (RN09, RN11). |
| **Streak** | Mantido com ≥ 1 tarefa concluída por dia civil; +1 no dia seguinte; zera após um dia sem conclusão (RN12). |
| **streakEmRisco** | `true` quando há streak ativo e nenhuma conclusão ainda hoje (RN16). |
| **Progresso** | `% de tarefas concluídas` da rotina, recalculado a cada criação/remoção/conclusão de tarefa (RN08). |
| **Ranking** | XP da semana corrente por usuário (RN14). |
| **Desafio adaptativo** | 3+ tarefas do mesmo tema atrasadas há 14+ dias e sem desafio em aberto → o sistema pede um desafio à IA e o persiste (RN13). |

Detalhes e exemplos de cálculo em [gamificacao.md](gamificacao.md).

## 6. Integração com a IA (resumo)

Duas chamadas à OpenAI, ambas em `services/ia.service.ts`:

1. **Chat de rotina** (`POST /api/rotinas/chat`) — conta no limite de **10 chamadas/dia por usuário** (RN15). Estouro → `429 LIMITE_IA_DIARIO`.
2. **Desafio adaptativo** (RN13) — efeito colateral de concluir tarefa, best-effort, **não** conta no limite.

Ambas:
- pedem resposta em JSON (`response_format: json_object`);
- têm timeout de 30s;
- validam o retorno com Zod **antes de persistir** (RN10) → falha estrutural = `502 IA_RESPOSTA_INVALIDA`;
- qualquer erro da OpenAI vira `503 IA_INDISPONIVEL` (nunca vaza erro cru).

Detalhes, prompts e formatos em [integracao-openai.md](integracao-openai.md).

## 7. Formato de resposta e erros

Sucesso: o corpo é o recurso (ou lista) em JSON. Códigos: `200` (ok), `201` (criado), `204` (sem conteúdo, em `DELETE`).

Erro: **sempre**

```json
{ "error": { "message": "Descrição legível", "code": "CODIGO_DE_NEGOCIO" } }
```

| HTTP | Quando | `code` (exemplos) |
|---|---|---|
| 400 | Validação de entrada, ou regra de negócio simples | `VALIDACAO`, `ROTINA_SEM_TAREFA`, `RESPOSTA_OBRIGATORIA` |
| 401 | Token ausente/inválido | `NAO_AUTENTICADO` |
| 403 | Recurso de outro usuário | `ROTINA_ACESSO_NEGADO`, `TAREFA_ACESSO_NEGADA`, `DESAFIO_ACESSO_NEGADO` |
| 404 | Recurso inexistente | `ROTINA_NAO_ENCONTRADA`, `TAREFA_NAO_ENCONTRADA`, `DESAFIO_NAO_ENCONTRADO` |
| 429 | Limite diário de IA | `LIMITE_IA_DIARIO` |
| 502 | Retorno da IA fora do contrato (RN10) | `IA_RESPOSTA_INVALIDA` |
| 503 | OpenAI indisponível | `IA_INDISPONIVEL` |
| 500 | Erro interno não previsto | `ERRO_INTERNO` |

Stack trace e detalhes internos nunca aparecem na resposta.

## 8. Fuso horário

Brasil não adota horário de verão desde 2019, então o backend trata **America/Sao_Paulo** como **UTC−3 fixo**. Centralizado em `utils/tempo.ts`:

- `diaCivil(instante)` → `"YYYY-MM-DD"` no horário de São Paulo (janela diária da RN15).
- `diferencaEmDiasCivis(a, b)` → diferença em dias civis locais (base do streak).
- `limitesDaSemanaAtual(agora)` → início (segunda 00:00) e fim (domingo 23:59:59.999) da semana local, como instantes UTC (para filtrar `dataConclusao`).

Timestamps são gravados em UTC no banco; a tradução para "dia civil" acontece só no cálculo.

## 9. Modelo de dados (resumo)

`Usuario` 1—N `Rotina` 1—N `Tarefa` · `Usuario` 1—N `Desafio` · `Usuario` 1—N `UsoIA`.

- `Usuario`: `firebaseUid` (único), `nome`, `email` (único), `authProvider`, `xpTotal`, `streakAtual`, `ultimaAtividade`.
- `Rotina`: `tema` + campos de contexto (`nivelConhecimento`, `tempoDisponivel`, `frequencia`), `progresso` (0–100).
- `Tarefa`: `titulo`, `descricao`, `concluida`, `dataCriacao`, `dataConclusao`, `xpConcedido`.
- `Desafio`: `tema`, `conteudo` (gerado pela IA), `concluido`.
- `UsoIA`: `usuarioId` + `dia` (únicos juntos), `contagem` — contador da RN15.

Ranking não tem tabela. Detalhes em [modelo-de-dados.md](modelo-de-dados.md).

## 10. Testes

`npm test` (Jest + ts-jest). 67 testes / 12 suítes. Cobrem services (com Prisma e OpenAI
mockados), utils de tempo/streak e os endpoints principais via `supertest`.
`npx tsc --noEmit` valida a tipagem. Detalhes em [configuracao.md](configuracao.md#testes).

## 11. O que ainda falta

- Configurar `OPENAI_API_KEY` (e opcionalmente `OPENAI_MODEL`) no `.env`.
- Testar os dois fluxos de IA de ponta a ponta com a chave real.
- Deploy/hospedagem (fora do escopo definido até aqui).
