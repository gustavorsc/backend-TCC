import { Desafio } from "@prisma/client";
import { AppError } from "../middlewares/errorHandler";
import prisma from "../lib/prisma";
import { gerarDesafioAdaptativo } from "./ia.service";

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
 * RN13 — condição do desafio adaptativo: 3+ tarefas do mesmo tema ainda não
 * concluídas e criadas há 14+ dias, e nenhum desafio em aberto para esse tema.
 * Retorna quantas tarefas estão atrasadas quando deve gerar; 0 caso contrário.
 */
async function avaliarCondicao(usuarioId: string, tema: string): Promise<number> {
  const limite = new Date(Date.now() - QUATORZE_DIAS_EM_MS);

  const tarefasAtrasadas = await prisma.tarefa.count({
    where: {
      concluida: false,
      dataCriacao: { lte: limite },
      rotina: { usuarioId, tema },
    },
  });

  if (tarefasAtrasadas < 3) {
    return 0;
  }

  const desafioEmAberto = await prisma.desafio.findFirst({
    where: { usuarioId, tema, concluido: false },
  });

  return desafioEmAberto ? 0 : tarefasAtrasadas;
}

/**
 * RN13 — verifica a condição do desafio adaptativo e, se atendida, pede o
 * conteúdo à IA (RN10) e persiste o desafio.
 *
 * Roda como efeito colateral de concluir uma tarefa (ver tarefa.service), mas
 * FORA da transação: envolve uma chamada de rede à OpenAI, que não pode segurar
 * a transação aberta nem fazer a conclusão da tarefa falhar. Best-effort — se a
 * IA falhar, o desafio simplesmente não é criado desta vez e a condição volta a
 * ser checada na próxima conclusão de tarefa do mesmo tema.
 */
export async function processarDesafioAdaptativo(
  usuarioId: string,
  tema: string
): Promise<void> {
  try {
    const tarefasAtrasadas = await avaliarCondicao(usuarioId, tema);
    if (tarefasAtrasadas === 0) {
      return;
    }

    const { titulo, conteudo } = await gerarDesafioAdaptativo(tema, tarefasAtrasadas);

    await prisma.desafio.create({
      data: { usuarioId, tema, conteudo: `${titulo}\n\n${conteudo}` },
    });
  } catch (err) {
    console.error(
      `[desafio.service] falha ao gerar desafio adaptativo (usuário ${usuarioId}, tema "${tema}"):`,
      err
    );
  }
}
