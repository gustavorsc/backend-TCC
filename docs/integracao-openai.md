# Integração com a OpenAI

Toda a integração está em `services/ia.service.ts`. Cliente em `lib/openai.ts`.
Requisitos relacionados: RF03, RF12, RN10, RN15, RNF06, RNF10.

## Cliente (`lib/openai.ts`)

```ts
new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "OPENAI_API_KEY_NAO_CONFIGURADA",
  timeout: 30_000,   // OPENAI_TIMEOUT_MS
  maxRetries: 1,
})
```

- **Timeout de 30s** herdado por toda chamada (RNF06/RNF10).
- Sem a chave, o cliente ainda é instanciado (placeholder) — qualquer chamada real
  falha e é traduzida para `503`. O servidor loga um aviso no boot.
- Modelo: `OPENAI_MODEL` (default `gpt-4o-mini`).

## Helper comum: `pedirJSON`

As duas chamadas usam o mesmo pipeline:

```
1. openai.chat.completions.create({ model, response_format: { type: "json_object" }, messages })
2. pega choices[0].message.content
      vazio            → 502 IA_RESPOSTA_INVALIDA
3. JSON.parse(content)
      não é JSON       → 502 IA_RESPOSTA_INVALIDA
4. schema.safeParse(json)   (Zod — RN10)
      fora do contrato → 502 IA_RESPOSTA_INVALIDA  (issues logadas no servidor)
5. retorna o dado tipado

Qualquer exceção da OpenAI no passo 1 (timeout, rede, 4xx/5xx, quota)
  → capturada, logada, e devolvida como 503 IA_INDISPONIVEL.
```

Erro cru da OpenAI **nunca** chega ao frontend.

---

## Fluxo 1 — Chat de geração de rotina

Rota: `POST /api/rotinas/chat` · Orquestração: `rotina.service.processarChat` · **Conta na RN15.**

### Sequência

```
processarChat(usuarioId, mensagens):
  1. reservarChamadaIA(usuarioId)          # RN15 — incrementa UsoIA; 429 se passar de 10/dia
  2. ia.service.conversar(mensagens)       # chama a OpenAI, valida (RN10)
  3a. resposta.tipo === "pergunta"  → devolve { tipo:"pergunta", mensagem, chamadasRestantes }   → HTTP 200
  3b. resposta.tipo === "rotina"    → persiste Rotina + Tarefas do usuário
                                      devolve { tipo:"rotina", rotina, chamadasRestantes }       → HTTP 201
```

O limite é **reservado antes** da chamada à OpenAI (passo 1). Se a chamada falhar
depois, aquela unidade do dia já foi consumida — decisão deliberada (RN15 diz
"checar antes de gastar").

### `system` prompt (resumido)

> Assistente que monta rotinas de estudo personalizadas. Conversa em português.
> Pede complementos até ter no mínimo: tema, nível, tempo por sessão, frequência.
> Responde **sempre e somente** com um JSON, em um de dois formatos.

### Formato que a IA deve devolver (`respostaIASchema`)

Pergunta de complemento:
```json
{ "tipo": "pergunta", "mensagem": "texto da pergunta" }
```

Rotina pronta:
```json
{
  "tipo": "rotina",
  "rotina": {
    "tema": "string (obrigatório, não vazio)",
    "descricao": "string | null | ausente",
    "nivelConhecimento": "string | null | ausente",
    "tempoDisponivel": "string | null | ausente",
    "frequencia": "string | null | ausente",
    "tarefas": [
      {
        "titulo": "string (obrigatório)",
        "descricao": "string (obrigatório) — resumo de estudo em 2-4 frases, não o título repetido",
        "pergunta": "string (obrigatório) — questão de múltipla escolha sobre o conteúdo da tarefa",
        "opcoes": ["string", "... (2 a 6 opções)"],
        "respostaCorreta": "número (obrigatório) — índice 0-based da opção certa em opcoes"
      }
    ]
  }
}
```

Validação (RN10 / RN03 / RN20):

- `tipo` tem que ser exatamente `"pergunta"` ou `"rotina"`.
- Em `rotina`: `tema` não vazio; `tarefas` entre **1 e 50** itens.
- Em cada tarefa: `titulo` e `descricao` não vazios; `pergunta` não vazia; `opcoes` com 2 a 6 itens não vazios; `respostaCorreta` precisa ser um índice válido dentro de `opcoes` (senão falha a validação mesmo que o resto esteja certo).
- Qualquer desvio → `502 IA_RESPOSTA_INVALIDA` e nada é persistido.

### Persistência da rotina

Feita numa única operação (`prisma.rotina.create` com `tarefas.create` aninhado).
`progresso` começa em 0. A rotina volta na resposta já com `id` e `tarefas` — **sem**
`respostaCorreta` (RN20): o client Prisma omite esse campo por padrão em toda consulta
(`omit` global em `lib/prisma.ts`), então nem essa resposta nem nenhum `GET` a expõem.

---

## Fluxo 2 — Desafio adaptativo (RN13)

Função: `ia.service.gerarDesafioAdaptativo` · Chamada por: `desafio.service.processarDesafioAdaptativo` · **NÃO conta na RN15.**

### Quando roda

Efeito colateral de `PATCH /api/tarefas/:id/concluir`, **depois** do commit da
transação, quando a condição da RN13 é atendida (ver [gamificacao.md](gamificacao.md#desafio-adaptativo-rn13)).

### `system` prompt (resumido)

> Cria desafios adaptativos de retomada. Dado um tema com tarefas atrasadas, gera
> **um** desafio curto e prático: um objetivo claro + 3 a 5 passos para uma sessão
> de estudo. Responde **sempre e somente** com JSON.

`user` message: `Tema: <tema>. Tarefas atrasadas há mais de 14 dias: <n>.`

### Formato que a IA deve devolver (`desafioGeradoSchema`)

```json
{
  "titulo": "string (1 a 200 caracteres)",
  "conteudo": "string (20 a 4000 caracteres)"
}
```

Persistido como um `Desafio` com `conteudo = "<titulo>\n\n<conteudo>"`.

### Resiliência

`processarDesafioAdaptativo` envolve tudo em `try/catch`: erro de IA, de validação
ou de banco é **apenas logado**. A conclusão da tarefa (que já respondeu ao cliente)
nunca é afetada. Sem desafio duplicado enquanto houver um em aberto para o tema.

---

## RN15 — limite diário (`services/usoIA.service.ts`)

```ts
reservarChamadaIA(usuarioId, agora = new Date()):
  dia = diaCivil(agora)                      // "YYYY-MM-DD" em São Paulo
  registro = prisma.usoIA.upsert({           // incremento atômico
    where:  { usuarioId_dia: { usuarioId, dia } },
    create: { usuarioId, dia, contagem: 1 },
    update: { contagem: { increment: 1 } },
  })
  if (registro.contagem > IA_LIMITE_DIARIO)  // 10
     throw AppError(429, "LIMITE_IA_DIARIO")
  return { chamadasRestantes: max(0, IA_LIMITE_DIARIO - registro.contagem) }
```

- Limite: `IA_LIMITE_DIARIO = 10` (`utils/constants.ts`).
- O contador pode passar de 10 se o usuário insistir após ser bloqueado (cada
  tentativa ainda incrementa) — isso não libera nada e zera no dia seguinte.
- Janela diária no fuso de São Paulo, não UTC.

---

## Resumo dos códigos de erro da IA

| HTTP | code | Significado |
|---|---|---|
| 429 | `LIMITE_IA_DIARIO` | 10 chamadas de chat já usadas hoje (só Fluxo 1) |
| 502 | `IA_RESPOSTA_INVALIDA` | retorno vazio, não-JSON, ou fora do schema (RN10) |
| 503 | `IA_INDISPONIVEL` | timeout ou erro na OpenAI |

No Fluxo 2, esses erros não chegam ao cliente — viram log e o desafio não é criado.

---

## Configuração

```
OPENAI_API_KEY=       # obrigatória para os fluxos de IA
OPENAI_MODEL=         # opcional, default gpt-4o-mini
```

Sem a chave: `POST /api/rotinas/chat` responde `503 IA_INDISPONIVEL`; a geração de
desafio falha silenciosamente (log). O resto da API funciona normalmente.
