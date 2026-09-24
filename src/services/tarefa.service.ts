import { Tarefa } from "@prisma/client";
import { AppError } from "../middlewares/errorHandler";
import prisma from "../lib/prisma";
import { buscarRotinaDoUsuarioOuFalhar, recalcularProgresso } from "./rotina.service";
import { processarDesafioAdaptativo } from "./desafio.service";
import {
  AtualizarTarefaInput,
  CriarTarefaInput,
  respostaSelecionadaSchema,
} from "../schemas/tarefa.schema";
import { XP_POR_TAREFA } from "../utils/constants";
import { calcularNovoStreak } from "../utils/streak";

/** Tarefa sem `respostaCorreta` — omitida por padrão pelo client (ver lib/prisma.ts). */
type TarefaSemResposta = Omit<Tarefa, "respostaCorreta">;

type TarefaComRotina = TarefaSemResposta & { rotina: { usuarioId: string; tema: string } };

/**
 * Busca a tarefa pelo id e garante, via a rotina dona dela, que pertence ao
 * usuário autenticado (RN04 aplicado transitivamente às tarefas). 404 se não
 * existe (RN07); 403 se é de outro usuário.
 */
async function buscarTarefaDoUsuarioOuFalhar(
  usuarioId: string,
  tarefaId: string
): Promise<TarefaComRotina> {
  const tarefa = await prisma.tarefa.findUnique({
    where: { id: tarefaId },
    include: { rotina: { select: { usuarioId: true, tema: true } } },
  });

  if (!tarefa) {
    throw new AppError("Tarefa não encontrada", 404, "TAREFA_NAO_ENCONTRADA");
  }

  if (tarefa.rotina.usuarioId !== usuarioId) {
    throw new AppError("Tarefa pertence a outro usuário", 403, "TAREFA_ACESSO_NEGADA");
  }

  return tarefa;
}

/** POST /api/rotinas/:id/tarefas (RF07) — adiciona uma tarefa à rotina. */
export async function criar(
  usuarioId: string,
  rotinaId: string,
  dados: CriarTarefaInput
): Promise<TarefaSemResposta> {
  await buscarRotinaDoUsuarioOuFalhar(usuarioId, rotinaId);

  const tarefa = await prisma.tarefa.create({
    data: { rotinaId, titulo: dados.titulo, descricao: dados.descricao ?? null },
  });

  await recalcularProgresso(rotinaId);

  return tarefa;
}

/** PUT /api/tarefas/:id (RF07) — edita título/descrição da tarefa. */
export async function atualizar(
  usuarioId: string,
  tarefaId: string,
  dados: AtualizarTarefaInput
): Promise<TarefaSemResposta> {
  await buscarTarefaDoUsuarioOuFalhar(usuarioId, tarefaId);

  return prisma.tarefa.update({ where: { id: tarefaId }, data: dados });
}

/**
 * DELETE /api/tarefas/:id (RF07). RN03 — uma rotina nunca pode ficar sem
 * nenhuma tarefa: bloqueia a remoção se for a última da rotina.
 */
export async function excluir(usuarioId: string, tarefaId: string): Promise<void> {
  const tarefa = await buscarTarefaDoUsuarioOuFalhar(usuarioId, tarefaId);

  const totalNaRotina = await prisma.tarefa.count({ where: { rotinaId: tarefa.rotinaId } });

  if (totalNaRotina <= 1) {
    throw new AppError(
      "Uma rotina precisa ter ao menos uma tarefa",
      400,
      "ROTINA_SEM_TAREFA"
    );
  }

  await prisma.tarefa.delete({ where: { id: tarefaId } });
  await recalcularProgresso(tarefa.rotinaId);
}

export type TarefaPublica = TarefaSemResposta & { correta?: boolean };

/**
 * Remove `respostaCorreta` (e a relação `rotina`, usada só internamente para
 * checagem de dono) antes de devolver a tarefa ao cliente. `respostaCorreta`
 * já não vem por padrão do Prisma (omit global em lib/prisma.ts) — esta função
 * cobre o único ponto do código que a lê explicitamente (ver concluir abaixo).
 */
function paraTarefaPublica(
  tarefa: Tarefa & { rotina?: { usuarioId: string; tema: string } }
): TarefaSemResposta {
  const { respostaCorreta: _respostaCorreta, rotina: _rotina, ...resto } = tarefa;
  return resto;
}

/**
 * PATCH /api/tarefas/:id/concluir (RF08, RN07–RN13, RN20). Idempotente: concluir
 * uma tarefa já concluída simplesmente a retorna, sem repetir XP/streak (RN09).
 *
 * RN20 (nova) — tarefas geradas pela IA trazem uma questão de múltipla escolha
 * (RN10 garante a estrutura). Concluir exige acertar `respostaSelecionada`
 * (índice em `opcoes`); errar não penaliza nada — só não conclui, e dá pra
 * tentar de novo sem limite. Tarefas criadas manualmente (sem `pergunta`)
 * continuam concluindo direto, sem resposta. `respostaCorreta` nunca é
 * devolvida ao cliente — é lida aqui só para conferir a resposta enviada.
 *
 * XP, streak e progresso são atualizados numa transação interativa (o streak
 * depende do estado atual do usuário lido dentro da operação). A checagem do
 * desafio adaptativo (RN13) roda DEPOIS do commit, fora da transação, porque
 * envolve uma chamada à OpenAI — ver processarDesafioAdaptativo.
 */
export async function concluir(
  usuarioId: string,
  tarefaId: string,
  respostaSelecionadaBruta?: unknown
): Promise<TarefaPublica> {
  let respostaSelecionada: number | undefined;
  if (respostaSelecionadaBruta !== undefined) {
    const resultado = respostaSelecionadaSchema.safeParse(respostaSelecionadaBruta);
    if (!resultado.success) {
      throw new AppError("respostaSelecionada precisa ser um índice válido", 400, "VALIDACAO");
    }
    respostaSelecionada = resultado.data;
  }

  const { tarefa, temaParaDesafio, correta } = await prisma.$transaction(async (tx) => {
    const tarefa = await tx.tarefa.findUnique({
      where: { id: tarefaId },
      include: { rotina: { select: { usuarioId: true, tema: true } } },
      omit: { respostaCorreta: false }, // precisa do valor real pra conferir a resposta
    });

    if (!tarefa) {
      throw new AppError("Tarefa não encontrada", 404, "TAREFA_NAO_ENCONTRADA");
    }

    if (tarefa.rotina.usuarioId !== usuarioId) {
      throw new AppError("Tarefa pertence a outro usuário", 403, "TAREFA_ACESSO_NEGADA");
    }

    if (tarefa.concluida) {
      return { tarefa, temaParaDesafio: null as string | null, correta: undefined as boolean | undefined };
    }

    if (tarefa.pergunta) {
      if (respostaSelecionada === undefined) {
        throw new AppError(
          "Selecione uma resposta para concluir esta tarefa",
          400,
          "RESPOSTA_OBRIGATORIA"
        );
      }
      if (respostaSelecionada !== tarefa.respostaCorreta) {
        return { tarefa, temaParaDesafio: null as string | null, correta: false };
      }
    }

    const usuario = await tx.usuario.findUniqueOrThrow({ where: { id: usuarioId } });
    const agora = new Date();

    const tarefaConcluida = await tx.tarefa.update({
      where: { id: tarefaId },
      data: { concluida: true, dataConclusao: agora, xpConcedido: XP_POR_TAREFA },
    });

    const novoStreak = calcularNovoStreak(usuario.streakAtual, usuario.ultimaAtividade, agora);

    await tx.usuario.update({
      where: { id: usuarioId },
      data: {
        xpTotal: { increment: XP_POR_TAREFA },
        streakAtual: novoStreak,
        ultimaAtividade: agora,
      },
    });

    // RN14 — registro independente do XP, para o ranking semanal sobreviver a
    // uma exclusão posterior da rotina/tarefa (ver ranking.service.ts).
    await tx.historicoXP.create({ data: { usuarioId, xp: XP_POR_TAREFA } });

    await recalcularProgresso(tarefa.rotinaId, tx);

    return {
      tarefa: tarefaConcluida,
      temaParaDesafio: tarefa.rotina.tema,
      correta: tarefa.pergunta ? true : undefined,
    };
  });

  if (temaParaDesafio) {
    await processarDesafioAdaptativo(usuarioId, temaParaDesafio);
  }

  const tarefaPublica = paraTarefaPublica(tarefa);
  return correta === undefined ? tarefaPublica : { ...tarefaPublica, correta };
}
