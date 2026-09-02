/**
 * RN14 — limites da semana corrente (segunda a domingo) usada no ranking.
 * Calendário em UTC, mesma convenção usada no cálculo de streak (ver utils/streak.ts).
 */
export function limitesDaSemanaAtual(agora: Date): { inicio: Date; fim: Date } {
  const diaDaSemana = agora.getUTCDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diasDesdeSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;

  const inicio = new Date(
    Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate() - diasDesdeSegunda)
  );

  const fim = new Date(
    Date.UTC(
      inicio.getUTCFullYear(),
      inicio.getUTCMonth(),
      inicio.getUTCDate() + 6,
      23,
      59,
      59,
      999
    )
  );

  return { inicio, fim };
}
