import prisma from "../lib/prisma";
import { limitesDaSemanaAtual } from "../utils/semana";

export interface PosicaoRanking {
  usuarioId: string;
  nome: string;
  xpSemana: number;
}

/**
 * GET /api/ranking (RN14) — soma o xpConcedido das tarefas concluídas na
 * semana corrente (segunda a domingo), agrupado por usuário via
 * Rotina.usuarioId, ordenado do maior para o menor XP.
 *
 * Ranking não é uma tabela própria — é sempre calculado em cima de Tarefa.
 */
export async function obterRankingSemanal(agora: Date = new Date()): Promise<PosicaoRanking[]> {
  const { inicio, fim } = limitesDaSemanaAtual(agora);

  const tarefasDaSemana = await prisma.tarefa.findMany({
    where: { dataConclusao: { gte: inicio, lte: fim } },
    select: {
      xpConcedido: true,
      rotina: { select: { usuario: { select: { id: true, nome: true } } } },
    },
  });

  const xpPorUsuario = new Map<string, PosicaoRanking>();

  for (const tarefa of tarefasDaSemana) {
    const { id: usuarioId, nome } = tarefa.rotina.usuario;
    const posicaoAtual = xpPorUsuario.get(usuarioId) ?? { usuarioId, nome, xpSemana: 0 };
    posicaoAtual.xpSemana += tarefa.xpConcedido;
    xpPorUsuario.set(usuarioId, posicaoAtual);
  }

  return [...xpPorUsuario.values()].sort((a, b) => b.xpSemana - a.xpSemana);
}
