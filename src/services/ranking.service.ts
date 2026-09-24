import prisma from "../lib/prisma";
import { limitesDaSemanaAtual } from "../utils/tempo";

export interface PosicaoRanking {
  usuarioId: string;
  nome: string;
  xpSemana: number;
}

/**
 * GET /api/ranking (RN14) — soma o XP registrado em `HistoricoXP` na semana
 * corrente (segunda a domingo, fuso de São Paulo), agrupado por usuário,
 * ordenado do maior para o menor.
 *
 * Ranking não é uma tabela própria com posições — é sempre recalculado, mas a
 * partir de `HistoricoXP` (registro permanente gravado junto do XP), não de
 * `Tarefa`: excluir uma rotina/tarefa depois de concluída não some com a
 * contribuição dela pro ranking da semana (só `Usuario.xpTotal` era
 * permanente antes; agora o ranking semanal também é).
 */
export async function obterRankingSemanal(agora: Date = new Date()): Promise<PosicaoRanking[]> {
  const { inicio, fim } = limitesDaSemanaAtual(agora);

  const registrosDaSemana = await prisma.historicoXP.findMany({
    where: { dataCriacao: { gte: inicio, lte: fim } },
    select: {
      xp: true,
      usuario: { select: { id: true, nome: true } },
    },
  });

  const xpPorUsuario = new Map<string, PosicaoRanking>();

  for (const registro of registrosDaSemana) {
    const { id: usuarioId, nome } = registro.usuario;
    const posicaoAtual = xpPorUsuario.get(usuarioId) ?? { usuarioId, nome, xpSemana: 0 };
    posicaoAtual.xpSemana += registro.xp;
    xpPorUsuario.set(usuarioId, posicaoAtual);
  }

  return [...xpPorUsuario.values()].sort((a, b) => b.xpSemana - a.xpSemana);
}
