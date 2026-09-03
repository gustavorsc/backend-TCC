import { AppError } from "../middlewares/errorHandler";
import openai from "../lib/openai";
import { OPENAI_MODEL } from "../utils/constants";
import { ChatMensagem, RespostaIA, respostaIASchema } from "../schemas/chat.schema";

/**
 * Instrui a IA a atuar como assistente de criação de rotina de estudos e a
 * responder SEMPRE com um JSON em um de dois formatos. O backend valida esse
 * retorno (RN10) antes de usar.
 */
const SYSTEM_PROMPT = `Você é um assistente que ajuda a montar rotinas de estudo personalizadas.

Converse em português. Faça perguntas de complemento até ter, no mínimo: tema de estudo, nível de conhecimento, tempo disponível por sessão e frequência semanal desejada. Quando tiver informação suficiente, gere a rotina.

Responda SEMPRE e SOMENTE com um objeto JSON válido, sem texto fora do JSON, em um destes dois formatos:

1) Quando ainda faltar informação:
{"tipo":"pergunta","mensagem":"<sua pergunta ao usuário>"}

2) Quando puder gerar a rotina:
{"tipo":"rotina","rotina":{"tema":"<tema>","descricao":"<resumo curto>","nivelConhecimento":"<nível>","tempoDisponivel":"<ex: 1h por dia>","frequencia":"<ex: 5x por semana>","tarefas":[{"titulo":"<título>","descricao":"<o que fazer>"}]}}

A rotina deve ter entre 1 e 50 tarefas, concretas e na ordem de execução. Não invente dados que o usuário não deu: se algo essencial faltar, pergunte.`;

/**
 * RF03/RF12 — envia a conversa para a OpenAI e devolve a resposta já validada:
 * uma pergunta de complemento ou uma rotina gerada.
 *
 * RNF06/RNF10 — a chamada tem timeout (configurado no client) e todo erro da
 * OpenAI é capturado e traduzido; nada cru vaza para o frontend.
 * RN10 — o JSON retornado é validado estruturalmente antes de ser devolvido.
 */
export async function conversar(mensagens: ChatMensagem[]): Promise<RespostaIA> {
  let conteudo: string | null | undefined;

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: SYSTEM_PROMPT }, ...mensagens],
    });
    conteudo = completion.choices[0]?.message?.content;
  } catch (err) {
    console.error("[ia.service] falha na chamada à OpenAI:", err);
    throw new AppError(
      "A IA está indisponível no momento. Tente novamente em instantes.",
      503,
      "IA_INDISPONIVEL"
    );
  }

  if (!conteudo) {
    throw new AppError("A IA não retornou uma resposta.", 502, "IA_RESPOSTA_INVALIDA");
  }

  let json: unknown;
  try {
    json = JSON.parse(conteudo);
  } catch {
    throw new AppError("A IA retornou um formato inesperado.", 502, "IA_RESPOSTA_INVALIDA");
  }

  const resultado = respostaIASchema.safeParse(json);
  if (!resultado.success) {
    console.error("[ia.service] retorno da IA fora do contrato (RN10):", resultado.error.issues);
    throw new AppError(
      "A IA retornou dados fora do formato esperado.",
      502,
      "IA_RESPOSTA_INVALIDA"
    );
  }

  return resultado.data;
}
