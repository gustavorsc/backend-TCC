const mockCreate = jest.fn();
jest.mock("../../src/lib/openai", () => ({
  __esModule: true,
  default: { chat: { completions: { create: mockCreate } } },
}));

import * as iaService from "../../src/services/ia.service";
import { ChatMensagem } from "../../src/schemas/chat.schema";

const MENSAGENS: ChatMensagem[] = [{ role: "user", content: "quero estudar cálculo" }];

function respostaOpenAI(conteudo: string) {
  return { choices: [{ message: { content: conteudo } }] };
}

describe("ia.service.conversar", () => {
  afterEach(() => jest.clearAllMocks());

  it("envia system prompt + mensagens e retorna uma pergunta de complemento", async () => {
    mockCreate.mockResolvedValue(
      respostaOpenAI(JSON.stringify({ tipo: "pergunta", mensagem: "Qual seu nível?" }))
    );

    const resultado = await iaService.conversar(MENSAGENS);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        response_format: { type: "json_object" },
        messages: expect.arrayContaining([
          expect.objectContaining({ role: "system" }),
          { role: "user", content: "quero estudar cálculo" },
        ]),
      })
    );
    expect(resultado).toEqual({ tipo: "pergunta", mensagem: "Qual seu nível?" });
  });

  const TAREFA_VALIDA = {
    titulo: "Limites",
    descricao: "Resumo de estudo sobre limites de funções.",
    pergunta: "O que representa o limite de uma função?",
    opcoes: ["O valor exato em um ponto", "O comportamento perto de um ponto", "A derivada", "A integral"],
    respostaCorreta: 1,
  };

  it("retorna a rotina quando a IA devolve uma rotina válida", async () => {
    mockCreate.mockResolvedValue(
      respostaOpenAI(
        JSON.stringify({
          tipo: "rotina",
          rotina: { tema: "Cálculo I", tarefas: [TAREFA_VALIDA] },
        })
      )
    );

    const resultado = await iaService.conversar(MENSAGENS);

    expect(resultado).toMatchObject({ tipo: "rotina", rotina: { tema: "Cálculo I" } });
    if (resultado.tipo === "rotina") {
      expect(resultado.rotina.tarefas[0]).toMatchObject({
        pergunta: TAREFA_VALIDA.pergunta,
        respostaCorreta: 1,
      });
    }
  });

  it("RN10: lança 502 IA_RESPOSTA_INVALIDA quando a rotina vem sem tarefas", async () => {
    mockCreate.mockResolvedValue(
      respostaOpenAI(JSON.stringify({ tipo: "rotina", rotina: { tema: "Cálculo I", tarefas: [] } }))
    );

    await expect(iaService.conversar(MENSAGENS)).rejects.toMatchObject({
      statusCode: 502,
      code: "IA_RESPOSTA_INVALIDA",
    });
  });

  it("RN10: lança 502 quando a tarefa vem sem questão de múltipla escolha", async () => {
    mockCreate.mockResolvedValue(
      respostaOpenAI(
        JSON.stringify({
          tipo: "rotina",
          rotina: { tema: "Cálculo I", tarefas: [{ titulo: "Limites", descricao: "..." }] },
        })
      )
    );

    await expect(iaService.conversar(MENSAGENS)).rejects.toMatchObject({
      statusCode: 502,
      code: "IA_RESPOSTA_INVALIDA",
    });
  });

  it("RN10: lança 502 quando respostaCorreta aponta para uma opção inexistente", async () => {
    mockCreate.mockResolvedValue(
      respostaOpenAI(
        JSON.stringify({
          tipo: "rotina",
          rotina: { tema: "Cálculo I", tarefas: [{ ...TAREFA_VALIDA, respostaCorreta: 9 }] },
        })
      )
    );

    await expect(iaService.conversar(MENSAGENS)).rejects.toMatchObject({
      statusCode: 502,
      code: "IA_RESPOSTA_INVALIDA",
    });
  });

  it("RN10: lança 502 quando a IA não devolve JSON", async () => {
    mockCreate.mockResolvedValue(respostaOpenAI("desculpe, não entendi"));

    await expect(iaService.conversar(MENSAGENS)).rejects.toMatchObject({
      statusCode: 502,
      code: "IA_RESPOSTA_INVALIDA",
    });
  });

  it("RNF06/RNF10: traduz erro cru da OpenAI para 503 IA_INDISPONIVEL", async () => {
    mockCreate.mockRejectedValue(new Error("ECONNRESET"));

    await expect(iaService.conversar(MENSAGENS)).rejects.toMatchObject({
      statusCode: 503,
      code: "IA_INDISPONIVEL",
    });
  });
});
