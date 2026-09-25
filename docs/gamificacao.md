# Gamificação

XP, streak, progresso, ranking e desafio adaptativo. Todos os cálculos de "dia" e
"semana" usam o fuso **America/Sao_Paulo** (UTC−3 fixo).

## XP (RN09, RN11)

- **+10 XP** por tarefa concluída (`XP_POR_TAREFA` em `utils/constants.ts`).
- Concedido **uma única vez**, no momento da conclusão, dentro da transação de `PATCH /api/tarefas/:id/concluir`.
- Concluir uma tarefa já concluída é **idempotente**: retorna a tarefa sem somar XP de novo.
- `Tarefa.xpConcedido` guarda quanto aquela tarefa rendeu (fica 10 após concluída). `Usuario.xpTotal` acumula.

## Streak (RN12)

Dias consecutivos em que o usuário concluiu ao menos uma tarefa. Recalculado a cada
conclusão, comparando o **dia civil** da `ultimaAtividade` com o de agora
(`calcularNovoStreak` em `utils/streak.ts`):

| Situação | Novo streak |
|---|---|
| Nunca teve atividade (`ultimaAtividade = null`) | `1` |
| Conclusão no **mesmo dia civil** da última | inalterado (mínimo 1) |
| Conclusão no **dia civil seguinte** | `streakAtual + 1` |
| Passou **mais de um dia** sem concluir | `1` (zerou e recomeçou) |

Exemplos (horário de São Paulo):

- Última atividade 08/09 20:00, nova conclusão 08/09 23:00 → mesmo dia → streak igual.
- Última 08/09 20:00, nova 09/09 07:00 → dia seguinte → +1.
- Última 06/09 20:00, nova 09/09 07:00 → pulou o 07 e o 08 → volta a 1.

> Não há job que zera o streak à meia-noite. O streak "velho" continua gravado até
> a próxima conclusão, quando é recalculado. Por isso o valor "ao vivo" de risco é
> exposto separadamente (RN16).

## streakEmRisco (RN16)

Campo booleano em `GET /api/usuarios/me/progresso` (`streakEmRisco` em `utils/streak.ts`):

```
streakEmRisco = streakAtual > 0
             && ultimaAtividade != null
             && diferencaEmDiasCivis(ultimaAtividade, agora) >= 1
```

Ou seja: **há um streak para perder** e **ainda não houve conclusão hoje**. Mais um
dia sem concluir nada e o streak zera. O frontend usa isso para o lembrete da RN16.

## Progresso da rotina (RN08)

`progresso = round(tarefasConcluidas / tarefasTotais * 100)`, inteiro de 0 a 100.
Recalculado e persistido (`recalcularProgresso`) sempre que uma tarefa da rotina é:

- criada (`POST /api/rotinas/:id/tarefas`),
- removida (`DELETE /api/tarefas/:id`),
- concluída (`PATCH /api/tarefas/:id/concluir`).

Rotina sem tarefas → `progresso = 0` (mas RN03 impede esse estado por remoção).

## Ranking semanal (RN14)

`GET /api/ranking`:

1. `limitesDaSemanaAtual(agora)` → segunda 00:00 e domingo 23:59:59.999 no fuso de São Paulo, como instantes UTC.
2. Busca `HistoricoXP` com `dataCriacao` nesse intervalo.
3. Soma `xp` por usuário.
4. Ordena do maior para o menor XP da semana.

- Quem não pontuou na semana **não aparece**.
- Zera toda segunda-feira (00:00 São Paulo).
- Como XP por tarefa é fixo (10), `xpSemana` é sempre múltiplo de 10 = `10 × tarefas concluídas na semana`.
- **Sobrevive à exclusão de rotina/tarefa:** `HistoricoXP` é gravado quando a tarefa é concluída e nunca é apagado por causa disso — só junto com a conta inteira (`DELETE /api/usuarios/me`). Excluir uma rotina depois de concluída não tira o XP dela do ranking daquela semana (era assim que já funcionava `Usuario.xpTotal`; até 24/09/2026 o ranking semanal era a exceção — calculava direto em cima de `Tarefa`, então "sumia" nesse cenário. Corrigido.).

## Desafio adaptativo (RN13)

### Condição (`desafio.service.avaliarCondicao`)

Todas verdadeiras:

1. O usuário tem **≥ 3 tarefas** com `concluida = false` **e** `dataCriacao` há **14+ dias**, **do mesmo `tema`** (via `Rotina.tema`).
2. **Não** existe `Desafio` em aberto (`concluido = false`) para esse usuário e tema.

### Disparo

Roda como **efeito colateral de concluir uma tarefa** (`PATCH /api/tarefas/:id/concluir`),
**depois** que a transação de XP/streak/progresso commitou — nunca dentro dela, porque
envolve uma chamada de rede à OpenAI.

### Geração e persistência

1. `ia.service.gerarDesafioAdaptativo(tema, qtdAtrasadas)` pede à IA um desafio de retomada.
2. Retorno validado por Zod (`desafioGeradoSchema`: `{ titulo, conteudo }`) — RN10.
3. Persiste `Desafio` com `conteudo = "<titulo>\n\n<conteudo>"`.

### Garantias

- **Best-effort:** se a IA falhar (timeout, erro, retorno inválido), o erro é só logado — **a conclusão da tarefa não falha** e nenhum desafio é criado nessa vez. A condição volta a ser checada na próxima conclusão de tarefa do mesmo tema.
- **Não conta na RN15:** o usuário não pediu essa chamada; contá-la penalizaria quem usa mais o app.
- **Sem duplicata:** enquanto houver um desafio em aberto para o tema, nenhum novo é criado.

### Ciclo de vida

`GET /api/desafios` lista · `PATCH /api/desafios/:id/concluir` marca como concluído
(idempotente). Concluir libera a criação de um novo desafio para aquele tema se a
condição voltar a ser atendida.
