import { diferencaEmDiasCivis } from "./tempo";

/**
 * RN12 — streak: mantido com ≥1 tarefa concluída por dia civil, zera sem conclusão.
 *
 * Calcula o novo streak a partir da última atividade registrada, no momento em
 * que uma tarefa é concluída. Comparação por dia civil no fuso de São Paulo
 * (ver utils/tempo.ts).
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

/**
 * RN16 — o streak está em risco quando há um streak ativo mas nenhuma tarefa
 * foi concluída ainda no dia civil corrente: mais um dia sem conclusão zera.
 */
export function streakEmRisco(
  streakAtual: number,
  ultimaAtividade: Date | null,
  agora: Date
): boolean {
  if (streakAtual <= 0 || !ultimaAtividade) {
    return false;
  }

  return diferencaEmDiasCivis(ultimaAtividade, agora) >= 1;
}
