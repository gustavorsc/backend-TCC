/**
 * RN12 — streak: mantido com ≥1 tarefa concluída por dia civil, zera sem conclusão.
 *
 * Calcula o novo streak a partir da última atividade registrada, no momento em
 * que uma tarefa é concluída. Comparação por dia civil em UTC (independente do
 * fuso do servidor).
 *
 * - Sem atividade anterior: começa em 1.
 * - Mesmo dia civil da última atividade: streak inalterado (mínimo 1) — a
 *   conclusão de hoje já contava, novas conclusões no mesmo dia não somam de novo.
 * - Dia civil seguinte ao da última atividade: streak + 1.
 * - Mais de um dia sem conclusão: streak zera e recomeça em 1 com a conclusão de hoje.
 */
export function calcularNovoStreak(
  streakAtual: number,
  ultimaAtividade: Date | null,
  agora: Date
): number {
  if (!ultimaAtividade) {
    return 1;
  }

  const diasDeDiferenca = diferencaEmDiasCivis(ultimaAtividade, agora);

  if (diasDeDiferenca === 0) {
    return Math.max(streakAtual, 1);
  }

  if (diasDeDiferenca === 1) {
    return streakAtual + 1;
  }

  return 1;
}

function diferencaEmDiasCivis(de: Date, para: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  const inicioDe = Date.UTC(de.getUTCFullYear(), de.getUTCMonth(), de.getUTCDate());
  const inicioPara = Date.UTC(para.getUTCFullYear(), para.getUTCMonth(), para.getUTCDate());

  return Math.round((inicioPara - inicioDe) / MS_POR_DIA);
}
