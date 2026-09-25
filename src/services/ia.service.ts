import { ZodTypeAny, z } from "zod";
import { AppError } from "../middlewares/errorHandler";
import openai from "../lib/openai";
import { OPENAI_MODEL } from "../utils/constants";
import { ChatMensagem, RespostaIA, respostaIASchema } from "../schemas/chat.schema";
import { DesafioGerado, desafioGeradoSchema } from "../schemas/desafio.schema";

type MensagemOpenAI = { role: "system" | "user" | "assistant"; content: string };

/**
 * Chama a OpenAI pedindo JSON, valida o retorno com o schema dado (RN10) e
 * devolve o dado tipado.
 *
 * RNF06/RNF10 — timeout vem do client; todo erro da OpenAI vira 503 e nada cru
 * chega ao frontend. Retorno vazio, não-JSON ou fora do schema vira 502.
 */
async function pedirJSON<T extends ZodTypeAny>(
  mensagens: MensagemOpenAI[],
  schema: T,
  contexto: string
): Promise<z.infer<T>> {
  let conteudo: string | null | undefined;

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      messages: mensagens,
    });
    conteudo = completion.choices[0]?.message?.content;
  } catch (err) {
    console.error(`[ia.service] falha na chamada à OpenAI (${contexto}):`, err);
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

  const resultado = schema.safeParse(json);
  if (!resultado.success) {
    console.error(
      `[ia.service] retorno da IA fora do contrato (RN10, ${contexto}):`,
      resultado.error.issues
    );
    throw new AppError(
      "A IA retornou dados fora do formato esperado.",
      502,
      "IA_RESPOSTA_INVALIDA"
    );
  }

  return resultado.data;
}

const SYSTEM_PROMPT_CHAT = `Você é um assistente que ajuda a montar rotinas de estudo personalizadas.

Converse em português. Faça perguntas de complemento até ter, no mínimo: tema de estudo, nível de conhecimento, tempo disponível por sessão e frequência semanal desejada. Quando tiver informação suficiente, gere a rotina.

Responda SEMPRE e SOMENTE com um objeto JSON válido, sem texto fora do JSON, em um destes dois formatos:

1) Quando ainda faltar informação:
{"tipo":"pergunta","mensagem":"<sua pergunta ao usuário>"}

2) Quando puder gerar a rotina:
{"tipo":"rotina","rotina":{"tema":"<tema>","descricao":"<resumo curto>","nivelConhecimento":"<nível>","tempoDisponivel":"<ex: 1h por dia>","frequencia":"<ex: 5x por semana>","tarefas":[{"titulo":"<título>","descricao":"<o que fazer>"}]}}

A rotina deve ter entre 1 e 50 tarefas, concretas e na ordem de execução. Não invente dados que o usuário não deu: se algo essencial faltar, pergunte.`;

/**
 * RF03/RF12 — envia a conversa para a OpenAI e devolve a resposta já validada
 * (RN10): uma pergunta de complemento ou uma rotina gerada.
 */
export function conversar(mensagens: ChatMensagem[]): Promise<RespostaIA> {
  return pedirJSON(
    [{ role: "system", content: SYSTEM_PROMPT_CHAT }, ...mensagens],
    respostaIASchema,
    "chat"
  );
}

const SYSTEM_PROMPT_DESAFIO = `Você cria desafios adaptativos de retomada de estudos.

O usuário acumulou tarefas atrasadas de um tema e precisa de um empurrão para voltar ao ritmo. Gere UM desafio curto, motivador e prático para esse tema: um objetivo claro e 3 a 5 passos concretos que caibam em uma sessão de estudo.

Responda SEMPRE e SOMENTE com um objeto JSON válido, sem texto fora do JSON:
{"titulo":"<título curto do desafio>","conteudo":"<descrição do objetivo e a lista de passos, em texto corrido ou com marcadores>"}

Escreva em português.`;

/**
 * RN13 — gera o conteúdo do desafio adaptativo para um tema via IA, já validado
 * estruturalmente (RN10). Chamada como efeito colateral (best-effort) de concluir
 * uma tarefa — ver desafio.service. NÃO conta no limite da RN15: o usuário não
 * solicitou a chamada.
 */
export async function gerarDesafioAdaptativo(
  tema: string,
  tarefasAtrasadas: number
): Promise<DesafioGerado> {
  return pedirJSON(
    [
      { role: "system", content: SYSTEM_PROMPT_DESAFIO },
      {
        role: "user",
        content: `Tema: ${tema}. Tarefas atrasadas há mais de 14 dias: ${tarefasAtrasadas}.`,
      },
    ],
    desafioGeradoSchema,
    "desafio"
  );
}
