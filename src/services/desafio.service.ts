import { Desafio, Prisma } from "@prisma/client";
import { AppError } from "../middlewares/errorHandler";
import prisma from "../lib/prisma";

const QUATORZE_DIAS_EM_MS = 14 * 24 * 60 * 60 * 1000;

/** GET /api/desafios (RN13) — lista os desafios do usuário autenticado. */
export function listarPorUsuario(usuarioId: string) {
  return prisma.desafio.findMany({
    where: { usuarioId },
    orderBy: { dataCriacao: "desc" },
  });
}

/** PATCH /api/desafios/:id/concluir (RN13) — marca um desafio como concluído. */
export async function concluir(usuarioId: string, desafioId: string): Promise<Desafio> {
  const desafio = await prisma.desafio.findUnique({ where: { id: desafioId } });

  if (!desafio) {
    throw new AppError("Desafio não encontrado", 404, "DESAFIO_NAO_ENCONTRADO");
  }

  if (desafio.usuarioId !== usuarioId) {
    throw new AppError("Desafio pertence a outro usuário", 403, "DESAFIO_ACESSO_NEGADO");
  }

  if (desafio.concluido) {
    return desafio;
  }

  return prisma.desafio.update({ where: { id: desafioId }, data: { concluido: true } });
}

/**
 * RN13 — desafio adaptativo: quando o usuário tem 3+ tarefas do mesmo tema
 * ainda não concluídas e criadas há 14+ dias, gera um desafio para esse tema
 * (se ainda não houver um em aberto). Chamada como efeito colateral de
 * concluir uma tarefa (ver tarefa.service), dentro da mesma transação.
 */
export async function verificarDesafioAdaptativo(
  usuarioId: string,
  tema: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<void> {
  const limite = new Date(Date.now() - QUATORZE_DIAS_EM_MS);

  const tarefasAtrasadas = await client.tarefa.count({
    where: {
      concluida: false,
      dataCriacao: { lte: limite },
      rotina: { usuarioId, tema },
    },
  });

  if (tarefasAtrasadas < 3) {
    return;
  }

  const desafioEmAberto = await client.desafio.findFirst({
    where: { usuarioId, tema, concluido: false },
  });

  if (desafioEmAberto) {
    return;
  }

  await client.desafio.create({
    data: {
      usuarioId,
      tema,
      conteudo: `Você tem ${tarefasAtrasadas} tarefas de "${tema}" atrasadas há mais de 14 dias. Que tal um desafio para retomar o ritmo?`,
    },
  });
}
