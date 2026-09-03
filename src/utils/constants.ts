/** RN11 — XP concedido por tarefa concluída (ajustável). */
export const XP_POR_TAREFA = 10;

/** RN15 — limite de chamadas à IA por usuário por dia civil (UTC) (ajustável). */
export const IA_LIMITE_DIARIO = 10;

/** Modelo da OpenAI usado no chat de geração de rotina (sobrescrevível via OPENAI_MODEL). */
export const OPENAI_MODEL = process.env.OPENAI_MODEL ?? "gpt-4o-mini";

/** RNF06/RNF10 — timeout (ms) de qualquer chamada à OpenAI. */
export const OPENAI_TIMEOUT_MS = 30_000;
