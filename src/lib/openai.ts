import OpenAI from "openai";

/**
 * Client da OpenAI. As chamadas que o usam devem sempre definir timeout
 * e serem envolvidas em try/catch (RNF06, RNF10) — ver services que o consomem.
 */
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
