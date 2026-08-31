import request from "supertest";

const mockVerifyIdToken = jest.fn();
jest.mock("../../src/lib/firebase-admin", () => ({
  __esModule: true,
  default: { auth: () => ({ verifyIdToken: mockVerifyIdToken }) },
}));

jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    usuario: { findUnique: jest.fn(), create: jest.fn() },
    rotina: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), delete: jest.fn() },
    tarefa: { deleteMany: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import prisma from "../../src/lib/prisma";
import app from "../../src/app";

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

const ROTINA = {
  id: "rotina-1",
  usuarioId: USUARIO.id,
  tema: "Matemática",
  descricao: null,
  nivelConhecimento: null,
  tempoDisponivel: null,
  frequencia: null,
  progresso: 0,
  dataCriacao: new Date("2026-08-01T00:00:00Z"),
};

beforeEach(() => {
  jest.clearAllMocks();
  mockVerifyIdToken.mockResolvedValue({
    uid: USUARIO.firebaseUid,
    email: USUARIO.email,
    name: USUARIO.nome,
    firebase: { sign_in_provider: "password" },
  });
  (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(USUARIO);
});

describe("GET /api/rotinas", () => {
  it("retorna 401 sem token de autenticação", async () => {
    const response = await request(app).get("/api/rotinas");

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { message: "Token de autenticação ausente", code: "NAO_AUTENTICADO" },
    });
  });

  it("retorna as rotinas do usuário autenticado", async () => {
    (prisma.rotina.findMany as jest.Mock).mockResolvedValue([ROTINA]);

    const response = await request(app)
      .get("/api/rotinas")
      .set("Authorization", "Bearer token-valido");

    expect(response.status).toBe(200);
    expect(response.body).toHaveLength(1);
    expect(response.body[0].id).toBe(ROTINA.id);
  });
});

describe("GET /api/rotinas/:id", () => {
  it("retorna 404 no formato padrão de erro quando a rotina não existe", async () => {
    (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(null);

    const response = await request(app)
      .get("/api/rotinas/inexistente")
      .set("Authorization", "Bearer token-valido");

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      error: { message: "Rotina não encontrada", code: "ROTINA_NAO_ENCONTRADA" },
    });
  });

  it("retorna 403 quando a rotina é de outro usuário", async () => {
    (prisma.rotina.findUnique as jest.Mock).mockResolvedValue({
      ...ROTINA,
      usuarioId: "outro-usuario",
    });

    const response = await request(app)
      .get(`/api/rotinas/${ROTINA.id}`)
      .set("Authorization", "Bearer token-valido");

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("ROTINA_ACESSO_NEGADO");
  });
});

describe("PUT /api/rotinas/:id", () => {
  it("retorna 400 quando o corpo não tem nenhum campo editável", async () => {
    const response = await request(app)
      .put(`/api/rotinas/${ROTINA.id}`)
      .set("Authorization", "Bearer token-valido")
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("VALIDACAO");
    expect(prisma.rotina.findUnique).not.toHaveBeenCalled();
  });

  it("atualiza a rotina com um corpo válido", async () => {
    (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(ROTINA);
    (prisma.rotina.update as jest.Mock).mockResolvedValue({ ...ROTINA, tema: "Física" });

    const response = await request(app)
      .put(`/api/rotinas/${ROTINA.id}`)
      .set("Authorization", "Bearer token-valido")
      .send({ tema: "Física" });

    expect(response.status).toBe(200);
    expect(response.body.tema).toBe("Física");
  });
});
