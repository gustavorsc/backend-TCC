import request from "supertest";

const mockVerifyIdToken = jest.fn();
jest.mock("../../src/lib/firebase-admin", () => ({
  __esModule: true,
  default: { auth: () => ({ verifyIdToken: mockVerifyIdToken }) },
}));

const mockCreateCompletion = jest.fn();
jest.mock("../../src/lib/openai", () => ({
  __esModule: true,
  default: { chat: { completions: { create: mockCreateCompletion } } },
}));

jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    usuario: { findUnique: jest.fn(), create: jest.fn() },
    usoIA: { upsert: jest.fn() },
    rotina: { create: jest.fn() },
  },
}));

import prisma from "../../src/lib/prisma";
import app from "../../src/app";
import { IA_LIMITE_DIARIO } from "../../src/utils/constants";

const USUARIO = {
  id: "usuario-1",
  firebaseUid: "firebase-uid-1",
  nome: "Ana",
  email: "ana@example.com",
  authProvider: "password",
  xpTotal: 0,
  streakAtual: 0,
  ultimaAtividade: null,
  dataCriacao: new Date("2026-01-01T00:00:00Z"),
};

const CHAT_BODY = { mensagens: [{ role: "user", content: "quero estudar cálculo" }] };

function completion(conteudo: string) {
  return { choices: [{ message: { content: conteudo } }] };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({
    uid: USUARIO.firebaseUid,
    email: USUARIO.email,
    name: USUARIO.nome,
    firebase: { sign_in_provider: "password" },
  });
  (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(USUARIO);
  (prisma.usoIA.upsert as jest.Mock).mockResolvedValue({ contagem: 1 });
});

describe("POST /api/rotinas/chat", () => {
  it("retorna 401 sem token", async () => {
    const response = await request(app).post("/api/rotinas/chat").send(CHAT_BODY);
    expect(response.status).toBe(401);
  });

  it("retorna 400 quando a última mensagem não é do usuário", async () => {
    const response = await request(app)
      .post("/api/rotinas/chat")
      .set("Authorization", "Bearer token-valido")
      .send({ mensagens: [{ role: "assistant", content: "oi" }] });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDACAO");
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it("RN15: retorna 429 e não chama a OpenAI quando o limite diário foi atingido", async () => {
    (prisma.usoIA.upsert as jest.Mock).mockResolvedValue({ contagem: IA_LIMITE_DIARIO + 1 });

    const response = await request(app)
      .post("/api/rotinas/chat")
      .set("Authorization", "Bearer token-valido")
      .send(CHAT_BODY);

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe("LIMITE_IA_DIARIO");
    expect(mockCreateCompletion).not.toHaveBeenCalled();
  });

  it("retorna 200 com a pergunta de complemento e as chamadas restantes", async () => {
    mockCreateCompletion.mockResolvedValue(
      completion(JSON.stringify({ tipo: "pergunta", mensagem: "Qual seu nível?" }))
    );

    const response = await request(app)
      .post("/api/rotinas/chat")
      .set("Authorization", "Bearer token-valido")
      .send(CHAT_BODY);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      tipo: "pergunta",
      mensagem: "Qual seu nível?",
      chamadasRestantes: IA_LIMITE_DIARIO - 1,
    });
    expect(prisma.rotina.create).not.toHaveBeenCalled();
  });

  it("RF03/RN03: persiste a rotina gerada com as tarefas e retorna 201", async () => {
    mockCreateCompletion.mockResolvedValue(
      completion(
        JSON.stringify({
          tipo: "rotina",
          rotina: {
            tema: "Cálculo I",
            descricao: "Rotina inicial",
            tarefas: [
              { titulo: "Limites", descricao: "Estudar limites" },
              { titulo: "Derivadas", descricao: null },
            ],
          },
        })
      )
    );
    (prisma.rotina.create as jest.Mock).mockResolvedValue({
      id: "rotina-1",
      usuarioId: USUARIO.id,
      tema: "Cálculo I",
      tarefas: [{ id: "t1", titulo: "Limites" }],
    });

    const response = await request(app)
      .post("/api/rotinas/chat")
      .set("Authorization", "Bearer token-valido")
      .send(CHAT_BODY);

    expect(response.status).toBe(201);
    expect(response.body.tipo).toBe("rotina");
    expect(response.body.rotina.id).toBe("rotina-1");
    expect(prisma.rotina.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          usuarioId: USUARIO.id,
          tema: "Cálculo I",
          tarefas: {
            create: [
              { titulo: "Limites", descricao: "Estudar limites" },
              { titulo: "Derivadas", descricao: null },
            ],
          },
        }),
      })
    );
  });

  it("RN10: retorna 502 quando a IA devolve estrutura inválida", async () => {
    mockCreateCompletion.mockResolvedValue(
      completion(JSON.stringify({ tipo: "rotina", rotina: { tema: "X", tarefas: [] } }))
    );

    const response = await request(app)
      .post("/api/rotinas/chat")
      .set("Authorization", "Bearer token-valido")
      .send(CHAT_BODY);

    expect(response.status).toBe(502);
    expect(response.body.error.code).toBe("IA_RESPOSTA_INVALIDA");
    expect(prisma.rotina.create).not.toHaveBeenCalled();
  });
});
