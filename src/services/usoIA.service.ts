import { AppError } from "../middlewares/errorHandler";
import prisma from "../lib/prisma";
import { IA_LIMITE_DIARIO } from "../utils/constants";

/** Dia civil em UTC no formato "YYYY-MM-DD" — mesma convenção de calendário do streak/ranking. */
export function diaUTC(agora: Date = new Date()): string {
  return agora.toISOString().slice(0, 10);
}

/**
 * RN15 — reserva uma chamada à IA para o usuário no dia corrente, ANTES de
 * gastar a requisição à OpenAI. Incrementa o contador de forma atômica e, se
 * o total ultrapassar o limite diário, lança 429 sem liberar a chamada.
 *
 * O contador pode passar do limite quando o usuário insiste após ser bloqueado
 * (cada tentativa ainda incrementa) — isso não libera nada e zera no dia seguinte.
 *
 * Retorna quantas chamadas ainda restam no dia (nunca negativo), para o
 * frontend exibir ao usuário.
 */
export async function reservarChamadaIA(
  usuarioId: string,
  agora: Date = new Date()
): Promise<{ chamadasRestantes: number }> {
  const dia = diaUTC(agora);

  const registro = await prisma.usoIA.upsert({
    where: { usuarioId_dia: { usuarioId, dia } },
    create: { usuarioId, dia, contagem: 1 },
    update: { contagem: { increment: 1 } },
  });

  if (registro.contagem > IA_LIMITE_DIARIO) {
    throw new AppError(
      `Limite de ${IA_LIMITE_DIARIO} chamadas à IA por dia atingido. Tente novamente amanhã.`,
      429,
      "LIMITE_IA_DIARIO"
    );
  }

  return { chamadasRestantes: Math.max(0, IA_LIMITE_DIARIO - registro.contagem) };
}
