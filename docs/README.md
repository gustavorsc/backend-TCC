# Documentação — Backend TCC

API REST para uma aplicação de gerenciamento de rotinas de estudo com IA e gamificação.
Usuário único (sem papel de professor/aluno). O frontend vive em um repositório separado
e consome esta API.

> Fonte da verdade sobre convenções e regras: `../CLAUDE.md`.
> Este diretório detalha o comportamento observável do backend para apoiar o
> desenvolvimento do frontend e a escrita da documentação do TCC.

## Índice

| Documento | Conteúdo |
|---|---|
| [para-o-frontend.md](para-o-frontend.md) | **Estado atual do backend para quem vai desenvolver o frontend** — prontidão por área, como conectar, o que já dá para integrar. |
| [visao-geral.md](visao-geral.md) | O que o backend faz, de ponta a ponta. Comece por aqui. |
| [autenticacao.md](autenticacao.md) | Fluxo de token Firebase, `authMiddleware`, criação de usuário no primeiro login. |
| [referencia-api.md](referencia-api.md) | Contrato completo de cada rota: método, corpo, resposta, erros, exemplos. |
| [regras-de-negocio.md](regras-de-negocio.md) | RN01–RN19: o que cada regra exige e onde está implementada. |
| [modelo-de-dados.md](modelo-de-dados.md) | Schema Prisma, relações, migrations, o ranking que não é tabela. |
| [gamificacao.md](gamificacao.md) | XP, streak, progresso, ranking semanal, desafio adaptativo. |
| [integracao-openai.md](integracao-openai.md) | Os dois fluxos de IA, prompts, validação do retorno, limite diário. |
| [configuracao.md](configuracao.md) | Variáveis de ambiente, Supabase, scripts, como rodar e testar. |

## Resumo em 30 segundos

- **Stack:** Node.js + TypeScript + Express + Prisma + PostgreSQL (Supabase) + Firebase Admin SDK + OpenAI + Zod + Jest.
- **Autenticação:** o backend **não faz login** — só verifica tokens que o frontend obtém do Firebase.
- **16 rotas** sob `/api` (todas autenticadas) + `GET /health` (aberta).
- **Regras de negócio RN01–RN16 + RN20** implementadas; RN17–RN19 são do Firebase.
- **RN20 (nova):** tarefas geradas pela IA são um card de estudo — resumo + questão de múltipla escolha. Concluir exige acertar a questão (sem penalidade em errar).
- **IA:** gera a rotina de estudos via chat (`POST /api/rotinas/chat`) e gera o conteúdo do desafio adaptativo. Limite de 10 chamadas/dia por usuário no fluxo de chat.
- **Fuso:** todo "dia civil" (streak, limite diário de IA, semana do ranking) é calculado em `America/Sao_Paulo` (UTC−3 fixo).
- **Formato de erro:** sempre `{ "error": { "message": "...", "code": "..." } }`.
- **Pendência:** nenhuma pendência técnica conhecida. Os dois fluxos de IA (chat de rotina e desafio adaptativo) foram validados com o modelo real e persistência real (23/09/2026). Falta só deploy, se for necessário.
