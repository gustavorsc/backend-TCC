/**
 * Cálculo de "dia civil" no fuso do público-alvo do projeto (America/Sao_Paulo).
 *
 * O Brasil não adota mais horário de verão desde 2019, então o offset é fixo
 * em UTC−03:00 — não precisamos de biblioteca de timezone. Timestamps são
 * gravados em UTC no banco; estas funções traduzem um instante para o dia/semana
 * civil como a pessoa vê no relógio dela.
 */
const OFFSET_SAO_PAULO_MS = 3 * 60 * 60 * 1000;
const MS_POR_DIA = 24 * 60 * 60 * 1000;

/** Relógio de parede em São Paulo para um instante (lido via componentes UTC). */
function paraHorarioLocal(instante: Date): Date {
  return new Date(instante.getTime() - OFFSET_SAO_PAULO_MS);
}

/** Dia civil em São Paulo no formato "YYYY-MM-DD" (janela diária da RN15). */
export function diaCivil(instante: Date): string {
  return paraHorarioLocal(instante).toISOString().slice(0, 10);
}

/** Meia-noite do dia civil de São Paulo, como nº de dias — base para comparar dias. */
function inicioDoDiaLocalMs(instante: Date): number {
  const local = paraHorarioLocal(instante);
  return Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
}

/**
 * Diferença em dias civis (São Paulo) entre dois instantes. 0 = mesmo dia,
 * 1 = dia seguinte, negativo se `para` for antes de `de`.
 */
export function diferencaEmDiasCivis(de: Date, para: Date): number {
  return Math.round((inicioDoDiaLocalMs(para) - inicioDoDiaLocalMs(de)) / MS_POR_DIA);
}

/**
 * RN14 — limites da semana corrente (segunda 00:00 a domingo 23:59:59.999),
 * no fuso de São Paulo, devolvidos como instantes UTC para filtrar `dataConclusao`.
 */
export function limitesDaSemanaAtual(agora: Date): { inicio: Date; fim: Date } {
  const local = paraHorarioLocal(agora);
  const diaDaSemana = local.getUTCDay(); // 0 = domingo, 1 = segunda, ..., 6 = sábado
  const diasDesdeSegunda = diaDaSemana === 0 ? 6 : diaDaSemana - 1;

  const segundaLocalMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() - diasDesdeSegunda
  );

  const inicio = new Date(segundaLocalMs + OFFSET_SAO_PAULO_MS);
  const fim = new Date(segundaLocalMs + OFFSET_SAO_PAULO_MS + 7 * MS_POR_DIA - 1);

  return { inicio, fim };
}
