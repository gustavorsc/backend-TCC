import { Tarefa } from "@prisma/client";
import { AppError } from "../middlewares/errorHandler";
import prisma from "../lib/prisma";
import { buscarRotinaDoUsuarioOuFalhar, recalcularProgresso } from "./rotina.service";
import { AtualizarTarefaInput, CriarTarefaInput } from "../schemas/tarefa.schema";
import { XP_POR_TAREFA } from "../utils/constants";
import { calcularNovoStreak } from "../utils/streak";

type TarefaComRotina = Tarefa & { rotina: { usuarioId: string; tema: string } };

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
): Promise<Tarefa> {
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
): Promise<Tarefa> {
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

/**
 * PATCH /api/tarefas/:id/concluir (RF08, RN07–RN12). Idempotente: concluir uma
 * tarefa já concluída simplesmente a retorna, sem repetir XP/streak (RN09 — XP
 * só é concedido na conclusão, uma única vez).
 *
 * Executado numa transação interativa porque o cálculo do streak depende do
 * estado atual do usuário lido dentro da própria operação.
 *
 * RN13 (desafio adaptativo — 3 tarefas do mesmo tema atrasadas em 14 dias)
 * ainda não está implementada aqui: o schema de Tarefa não tem uma data de
 * criação/vencimento própria para definir "atrasada", só a da Rotina. Fica
 * pendente até essa definição ser confirmada.
 */
export async function concluir(usuarioId: string, tarefaId: string): Promise<Tarefa> {
  return prisma.$transaction(async (tx) => {
    const tarefa = await tx.tarefa.findUnique({
      where: { id: tarefaId },
      include: { rotina: { select: { usuarioId: true } } },
    });

    if (!tarefa) {
      throw new AppError("Tarefa não encontrada", 404, "TAREFA_NAO_ENCONTRADA");
    }

    if (tarefa.rotina.usuarioId !== usuarioId) {
      throw new AppError("Tarefa pertence a outro usuário", 403, "TAREFA_ACESSO_NEGADA");
    }

    if (tarefa.concluida) {
      return tarefa;
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

    await recalcularProgresso(tarefa.rotinaId, tx);

    return tarefaConcluida;
  });
}
