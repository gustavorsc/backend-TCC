import OpenAI from "openai";
import { OPENAI_TIMEOUT_MS } from "../utils/constants";

if (!process.env.OPENAI_API_KEY) {
  console.warn(
    "[openai] OPENAI_API_KEY não definida no .env — o chat de geração de rotina vai falhar com 503."
  );
}

/**
 * Client da OpenAI. Timeout obrigatório (RNF06, RNF10) já configurado aqui, de
 * forma que toda chamada herda o limite — os services ainda devem envolver as
 * chamadas em try/catch e nunca propagar o erro cru (ver ia.service).
 *
 * Sem a chave configurada o client ainda é instanciado (placeholder), mas
 * qualquer chamada real falha e é traduzida para 503 em ia.service.
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY ?? "OPENAI_API_KEY_NAO_CONFIGURADA",
  timeout: OPENAI_TIMEOUT_MS,
  maxRetries: 1,
});

export default openai;
