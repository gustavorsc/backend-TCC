# CLAUDE.md — Backend

Este arquivo orienta o Claude Code no desenvolvimento do **backend**. O frontend vive em um repositório separado e ainda não existe — não assuma nada sobre ele além do contrato de API definido aqui.

## Sobre o projeto

API REST para uma aplicação de gerenciamento de rotinas de estudo com IA e gamificação. Usuário único (sem papel de professor/aluno). O backend é responsável por: regras de negócio, autenticação (verificação de tokens Firebase), persistência (PostgreSQL via Prisma) e integração com a API da OpenAI.

Toda a documentação de especificação do TCC (Requisitos, Regras de Negócio, Diagrama de Classes) já está pronta e é fonte da verdade. Não redefina requisitos ou regras de negócio sem perguntar antes.

## Stack

- Node.js + TypeScript
- Express (API REST)
- Prisma ORM + PostgreSQL
- Firebase Admin SDK (verificação de token, não gerencia login — isso é do frontend)
- OpenAI API
- Zod (validação de entrada)
- Jest (testes)

## Estrutura de pastas

```
backend/
├── CLAUDE.md
├── prisma/
│   └── schema.prisma
├── src/
│   ├── controllers/       # recebe requisição, chama service, devolve resposta
│   ├── services/          # regras de negócio — NUNCA direto no controller
│   ├── routes/
│   ├── middlewares/       # auth (Firebase), validação, tratamento de erro
│   ├── lib/                # clientes: prisma, openai, firebase-admin
│   └── utils/
├── tests/
├── .env.example
└── package.json
```

## CORS

O frontend roda em outra origem (outro repositório, outra porta/domínio). Configurar CORS liberando a origem do frontend **desde o setup inicial** (variável `FRONTEND_URL` no `.env`) — sem isso, nenhuma chamada do frontend vai funcionar quando ele for desenvolvido.

## Modelo de dados (Prisma)

Simplificado porque a autenticação é 100% Firebase — não armazenamos senha nem token de redefinição.

```prisma
datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

model Usuario {
  id              String    @id @default(uuid())
  firebaseUid     String    @unique
  nome            String
  email           String    @unique
  authProvider    String    // "password" | "google.com"
  xpTotal         Int       @default(0)
  streakAtual     Int       @default(0)
  ultimaAtividade DateTime?
  dataCriacao     DateTime  @default(now())

  rotinas         Rotina[]
  desafios        Desafio[]
}

model Rotina {
  id                String   @id @default(uuid())
  usuarioId         String
  tema              String
  descricao         String?
  nivelConhecimento String?
  tempoDisponivel   String?
  frequencia        String?
  progresso         Float    @default(0)
  dataCriacao       DateTime @default(now())

  usuario           Usuario  @relation(fields: [usuarioId], references: [id])
  tarefas           Tarefa[]
}

model Tarefa {
  id            String    @id @default(uuid())
  rotinaId      String
  titulo        String
  descricao     String?
  concluida     Boolean   @default(false)
  dataCriacao   DateTime  @default(now())
  dataConclusao DateTime?
  xpConcedido   Int       @default(0)

  rotina        Rotina    @relation(fields: [rotinaId], references: [id])
}

model Desafio {
  id          String   @id @default(uuid())
  usuarioId   String
  tema        String
  conteudo    String
  concluido   Boolean  @default(false)
  dataCriacao DateTime @default(now())

  usuario     Usuario  @relation(fields: [usuarioId], references: [id])
}

model UsoIA {
  id        String  @id @default(uuid())
  usuarioId String
  dia       String   // "YYYY-MM-DD" (UTC) — janela diária da RN15
  contagem  Int      @default(0)

  usuario   Usuario  @relation(fields: [usuarioId], references: [id])

  @@unique([usuarioId, dia])
}
```

`UsoIA` implementa o contador da RN15: uma linha por usuário/dia, `contagem` incrementada (atômica, via `upsert`) a cada chamada liberada em `POST /api/rotinas/chat`. Linhas antigas não são limpas por rotina (servem de histórico de uso da IA), mas são apagadas junto com a conta em `DELETE /api/usuarios/me` (FK `onDelete: Restrict`). `Usuario` ganhou a relação `usosIA UsoIA[]`.

Ranking não é tabela: consulta somando `Tarefa.xpConcedido` de tarefas com `dataConclusao` na semana corrente (segunda a domingo), agrupado por usuário via `Rotina.usuarioId` (RN14).

## Autenticação (fluxo do backend)

O backend **não faz login** — só verifica tokens que o frontend já obteve do Firebase.

1. Middleware `authMiddleware` lê o header `Authorization: Bearer <token>`.
2. Usa o Firebase Admin SDK (`admin.auth().verifyIdToken(token)`) para validar. Token inválido/expirado → `401`.
3. Se válido, busca o `Usuario` local por `firebaseUid`. Se não existir ainda, cria (primeiro login) — não retornar erro nesse caso.
4. Anexa o `Usuario` à requisição (`req.usuario`) para os controllers usarem.
5. Todas as rotas abaixo, exceto `/health`, passam por esse middleware.

## Contrato da API (rotas planejadas)

Mantenha esta seção atualizada conforme as rotas forem implementadas — é a fonte da verdade para quando o frontend for desenvolvido.

| Método | Rota | Descrição | RF/RN relacionado |
|---|---|---|---|
| GET | `/health` | Healthcheck, sem auth | — |
| GET | `/api/usuarios/me` | Perfil do usuário autenticado (XP, streak) | RF01, RF02 |
| DELETE | `/api/usuarios/me` | Exclui conta e dados pessoais | RNF02 (LGPD) |
| GET | `/api/usuarios/me/progresso` | XP total, streak, `streakEmRisco` (RN16), progresso das rotinas | RF09, RF10, RN16 |
| GET | `/api/ranking` | Ranking semanal (todos os usuários) | RN14 |
| POST | `/api/rotinas/chat` | Envia a conversa (`{ mensagens: [{ role, content }] }`, sem histórico no backend); resposta `200 {tipo:"pergunta", mensagem, chamadasRestantes}` OU `201 {tipo:"rotina", rotina, chamadasRestantes}` (rotina + tarefas já persistidas). `429` se estourar RN15, `502 IA_RESPOSTA_INVALIDA` se o retorno da IA falhar na validação (RN10), `503 IA_INDISPONIVEL` se a OpenAI falhar | RF03, RF12, RN10, RN15 |
| GET | `/api/rotinas` | Lista rotinas do usuário autenticado | RF04, RN04 |
| GET | `/api/rotinas/:id` | Detalhe da rotina com tarefas | RF04, RN04 |
| PUT | `/api/rotinas/:id` | Edita rotina | RF05, RN05 |
| DELETE | `/api/rotinas/:id` | Exclui rotina | RF06, RN06 |
| POST | `/api/rotinas/:id/tarefas` | Adiciona tarefa à rotina | RF07, RN03 |
| PUT | `/api/tarefas/:id` | Edita tarefa | RF07 |
| DELETE | `/api/tarefas/:id` | Remove tarefa | RF07, RN03 (não deixar rotina sem tarefa) |
| PATCH | `/api/tarefas/:id/concluir` | Conclui tarefa: dispara XP, progresso, streak, checagem de desafio adaptativo | RF08, RN07–RN13 |
| GET | `/api/desafios` | Lista desafios do usuário | RN13 |
| PATCH | `/api/desafios/:id/concluir` | Marca desafio como concluído | RN13 |

## Formato padrão de resposta de erro

```json
{ "error": { "message": "Descrição legível do erro", "code": "ROTINA_NAO_ENCONTRADA" } }
```

Nunca vazar stack trace ou detalhes internos na resposta. Códigos HTTP: `400` validação, `401` não autenticado, `403` não autorizado (ex.: rotina de outro usuário), `404` não encontrado, `500` erro interno.

## Regras de negócio — respeitar sempre

RN01 e-mail único · RN02 acesso restrito a autenticados · RN03 rotina sempre com ≥1 tarefa · RN04 rotina pertence a 1 usuário · RN05 alterações salvas imediatamente · RN06 exclusão de rotina exige confirmação (no frontend; backend não decide isso) · RN07 só conclui tarefa existente · RN08 progresso recalculado automaticamente · RN09 XP só após conclusão · RN10 validar estrutura do retorno da IA antes de salvar/exibir · RN11 XP = 10 por tarefa (ajustável) · RN12 streak: mantido com ≥1 tarefa/dia civil, zera sem conclusão · RN13 desafio adaptativo: 3 tarefas do mesmo tema atrasadas em 14 dias (atrasada = `Tarefa.dataCriacao` há 14+ dias e ainda não concluída) — **o conteúdo do desafio é gerado pela IA** (`ia.service.gerarDesafioAdaptativo`, validado por Zod, RN10); a checagem roda como efeito colateral best-effort de concluir tarefa, **fora da transação** (`desafio.service.processarDesafioAdaptativo`), e **não conta no limite da RN15** · RN14 ranking semanal (seg–dom) · RN15 limite de chamadas à IA por usuário/período — **10 por dia civil**, contador em `UsoIA` (`IA_LIMITE_DIARIO` em `utils/constants.ts`), checado/reservado antes de chamar a OpenAI; estouro → `429 LIMITE_IA_DIARIO` · RN16 notificar risco de quebra de streak — backend expõe `streakEmRisco` (bool) em `GET /api/usuarios/me/progresso`; `true` quando `streakAtual > 0` e a última atividade não foi hoje (`utils/streak.streakEmRisco`) · RN17–RN19 validade/uso único/não revelação de e-mail no reset — **responsabilidade do Firebase**, não implementar aqui.

**Dia civil / fuso:** todo cálculo de "dia civil" e de semana (streak RN12, contador diário RN15, semana do ranking RN14) usa o fuso **America/Sao_Paulo** (UTC−3 fixo — Brasil sem horário de verão), centralizado em `utils/tempo.ts` (`diaCivil`, `diferencaEmDiasCivis`, `limitesDaSemanaAtual`).

## Integração com a OpenAI — pontos de atenção (RNF06, RNF10)

Duas chamadas à IA, ambas em `services/ia.service.ts` (helper comum `pedirJSON`: chama a OpenAI pedindo JSON, faz `JSON.parse`, valida com um schema Zod):

1. **Chat de rotina** — `POST /api/rotinas/chat`, orquestrado em `services/rotina.service.ts` (`processarChat`); limite RN15 em `services/usoIA.service.ts`.
2. **Desafio adaptativo (RN13)** — `gerarDesafioAdaptativo`, chamado por `desafio.service.processarDesafioAdaptativo` como efeito colateral best-effort de concluir tarefa. **Não passa pelo limite da RN15.**

Modelo em `OPENAI_MODEL` (default `gpt-4o-mini`).

- Timeout de 30s configurado no client (`lib/openai.ts`, `OPENAI_TIMEOUT_MS`) — toda chamada herda.
- `ia.service` captura qualquer erro da OpenAI e devolve `503 IA_INDISPONIVEL`; nunca propaga erro cru.
- Retorno da IA (`response_format: json_object`) validado com Zod antes de persistir (`respostaIASchema` em `schemas/chat.schema.ts`, `desafioGeradoSchema` em `schemas/desafio.schema.ts`) — rotina precisa de ≥1 tarefa (RN03); falha → `502 IA_RESPOSTA_INVALIDA` (RN10).
- RN15: `reservarChamadaIA` incrementa `UsoIA` e falha com `429` **antes** de chamar a OpenAI. Limite em `IA_LIMITE_DIARIO` (`utils/constants.ts`).
- Concluir tarefa nunca falha por causa da IA: `processarDesafioAdaptativo` roda fora da transação e engole erros (loga e segue).

## Convenções de código

- Regra de negócio SEMPRE na camada `services`, nunca no controller
- TypeScript estrito, evitar `any`
- Validação de entrada com Zod antes de chegar ao service
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`

## Banco de dados (Supabase)

O PostgreSQL roda na Supabase (região São Paulo), não localmente. Isso exige **duas** variáveis de conexão, não uma:

- `DATABASE_URL` — connection string do **Transaction Pooler** (porta 6543, com `?pgbouncer=true`), usada pela aplicação em runtime.
- `DIRECT_URL` — connection string **direta** (porta 5432), usada apenas pelo Prisma CLI para rodar migrations.

Ambas ficam em Project Settings > Connect > aba ORM > Prisma, no painel da Supabase. O datasource do `schema.prisma` já reflete isso acima (`url` + `directUrl`).

## Variáveis de ambiente (.env)

```
DATABASE_URL=
DIRECT_URL=
FRONTEND_URL=
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=
OPENAI_API_KEY=
OPENAI_MODEL=        # opcional, default gpt-4o-mini
```

## O que NUNCA fazer sem perguntar antes

- Alterar valor de uma Regra de Negócio (RN) já aprovada
- Armazenar senha ou token de redefinição próprios (é do Firebase)
- Expor rota sem passar pelo `authMiddleware` (exceto `/health`)
- Mudar a estrutura das tabelas sem atualizar esta seção do CLAUDE.md junto
