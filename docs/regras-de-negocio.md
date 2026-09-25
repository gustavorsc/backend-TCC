# Regras de negócio

Como cada RN da especificação do TCC é atendida pelo backend. As RN são fonte da
verdade — não redefinir sem alinhamento.

| RN | Enunciado | Como o backend cumpre | Onde |
|---|---|---|---|
| **RN01** | E-mail único | `Usuario.email` é `@unique` no schema; a unicidade real do cadastro é garantida pelo Firebase (o backend só reflete). | `prisma/schema.prisma` |
| **RN02** | Acesso restrito a autenticados | `authMiddleware` protege todas as rotas `/api/**`; só `/health` fica aberta. | `middlewares/auth.middleware.ts`, `app.ts` |
| **RN03** | Rotina sempre com ≥ 1 tarefa | `DELETE /api/tarefas/:id` recusa remover a última tarefa (`400 ROTINA_SEM_TAREFA`); a rotina gerada pela IA é validada com `tarefas` mínimo 1. | `services/tarefa.service.ts`, `schemas/chat.schema.ts` |
| **RN04** | Rotina pertence a um único usuário | Toda operação sobre rotina/tarefa passa por `buscarRotinaDoUsuarioOuFalhar` / `buscarTarefaDoUsuarioOuFalhar`: `404` se não existe, `403` se é de outro usuário. Rotina criada pelo chat recebe `usuarioId` do token. | `services/rotina.service.ts`, `services/tarefa.service.ts` |
| **RN05** | Alterações salvas imediatamente | `PUT /api/rotinas/:id` e `PUT /api/tarefas/:id` persistem na hora com `prisma.update`. Não há rascunho/staging. | `services/rotina.service.ts`, `services/tarefa.service.ts` |
| **RN06** | Exclusão de rotina exige confirmação | O backend **executa** a exclusão quando chamado; a confirmação com o usuário é do frontend (o backend não tem como impor UI). | — |
| **RN07** | Só conclui tarefa existente | `PATCH /api/tarefas/:id/concluir` lança `404 TAREFA_NAO_ENCONTRADA` se o id não existe. | `services/tarefa.service.ts` |
| **RN08** | Progresso recalculado automaticamente | `recalcularProgresso(rotinaId)` roda após criar, remover ou concluir tarefa: `round(concluídas / total * 100)`. | `services/rotina.service.ts` |
| **RN09** | XP só após conclusão | XP é gravado apenas em `concluir`, dentro da transação. Concluir tarefa já concluída é idempotente — não repete XP nem streak. | `services/tarefa.service.ts` |
| **RN10** | Validar estrutura do retorno da IA antes de salvar/exibir | `ia.service.pedirJSON` faz `JSON.parse` + validação Zod (`respostaIASchema`, `desafioGeradoSchema`) antes de qualquer persistência. Falha → `502 IA_RESPOSTA_INVALIDA`. | `services/ia.service.ts`, `schemas/` |
| **RN11** | XP = 10 por tarefa (ajustável) | Constante `XP_POR_TAREFA = 10`. | `utils/constants.ts` |
| **RN12** | Streak: mantido com ≥ 1 tarefa/dia civil, zera sem conclusão | `calcularNovoStreak`: sem atividade → 1; mesmo dia civil → inalterado; dia seguinte → +1; mais de um dia → zera e recomeça em 1. Dia civil no fuso de São Paulo. | `utils/streak.ts`, `utils/tempo.ts` |
| **RN13** | Desafio adaptativo | Condição: 3+ tarefas do mesmo tema **não concluídas** e criadas há **14+ dias**, e **nenhum** desafio em aberto para o tema. Atendida → `ia.service.gerarDesafioAdaptativo` produz o conteúdo (validado, RN10) e o desafio é persistido. Roda **após** o commit de `concluir`, **fora da transação**, best-effort. **Não** conta na RN15. | `services/desafio.service.ts`, `services/tarefa.service.ts`, `services/ia.service.ts` |
| **RN14** | Ranking semanal (seg–dom) | `obterRankingSemanal`: soma `HistoricoXP.xp` com `dataCriacao` na semana corrente (fuso de São Paulo), agrupado por usuário, ordenado desc. Não é tabela de posições, mas depende de `HistoricoXP` — registro permanente gravado junto com o XP em `tarefa.service.concluir`, que **sobrevive** à exclusão da rotina/tarefa que o gerou (ao contrário da versão anterior, que somava direto de `Tarefa` e perdia o XP nesse caso). | `services/ranking.service.ts`, `services/tarefa.service.ts`, `utils/tempo.ts` |
| **RN15** | Limite de chamadas à IA por usuário/período | **10 por dia civil** (`IA_LIMITE_DIARIO`). `reservarChamadaIA` incrementa `UsoIA` (upsert atômico) e lança `429 LIMITE_IA_DIARIO` **antes** de chamar a OpenAI. Só o fluxo de chat conta; a geração de desafio não. | `services/usoIA.service.ts`, `services/rotina.service.ts` |
| **RN16** | Notificar risco de quebra de streak | `GET /api/usuarios/me/progresso` devolve `streakEmRisco` (bool): `true` quando `streakAtual > 0` e a última atividade não foi hoje. O frontend decide como notificar. | `services/usuario.service.ts`, `utils/streak.ts` |
| **RN17–RN19** | Validade / uso único / não revelação de e-mail no reset de senha | Fora do backend — o fluxo de redefinição de senha é 100% do Firebase Authentication. | — |

## Detalhes que valem para o frontend

### RN12 / RN16 — "dia civil"

"Hoje" e "ontem" são calculados no fuso de São Paulo (UTC−3 fixo), não no fuso do
servidor nem em UTC. Uma tarefa concluída às 23h em São Paulo conta para aquele
dia; às 00h30 já é o dia seguinte.

### RN13 — quando um desafio aparece

O desafio adaptativo só é criado **como efeito de concluir alguma tarefa** — não há
job agendado. Se o usuário tem tarefas atrasadas mas nunca conclui nada, nenhum
desafio é gerado. Ao concluir uma tarefa de um tema com 3+ atrasadas há 14+ dias,
o desafio é criado logo depois (assíncrono à resposta HTTP, que já retornou a
tarefa). O frontend descobre o novo desafio na próxima chamada a `GET /api/desafios`.

### RN15 — feedback de limite

Toda resposta de `POST /api/rotinas/chat` traz `chamadasRestantes`. Ao chegar a 0,
a próxima chamada retorna `429 LIMITE_IA_DIARIO`. O contador zera na virada do dia
civil de São Paulo.
