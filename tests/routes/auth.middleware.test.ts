import request from "supertest";
import { Prisma } from "@prisma/client";

const mockVerifyIdToken = jest.fn();
jest.mock("../../src/lib/firebase-admin", () => ({
  __esModule: true,
  default: { auth: () => ({ verifyIdToken: mockVerifyIdToken }) },
}));

jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    usuario: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    rotina: { findMany: jest.fn() },
  },
}));

import prisma from "../../src/lib/prisma";
import app from "../../src/app";

const UID = "firebase-uid-1";
const USUARIO = {
  id: "usuario-1",
  firebaseUid: UID,
  nome: "Ana",
  email: "ana@example.com",
  authProvider: "password",
  xpTotal: 0,
  streakAtual: 0,
  ultimaAtividade: null,
  dataCriacao: new Date("2026-01-01T00:00:00Z"),
};

const conflitoUnico = () =>
  new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "5.20.0",
  });

function autenticar(overrides: Record<string, unknown> = {}) {
  mockVerifyIdToken.mockResolvedValue({
    uid: UID,
    email: USUARIO.email,
    name: USUARIO.nome,
    firebase: { sign_in_provider: "password" },
    ...overrides,
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  (prisma.rotina.findMany as jest.Mock).mockResolvedValue([]);
});

const chamar = () =>
  request(app).get("/api/rotinas").set("Authorization", "Bearer token-valido");

describe("authMiddleware — primeiro acesso", () => {
  it("cria o Usuario local quando não existe", async () => {
    autenticar();
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValueOnce(null);
    (prisma.usuario.create as jest.Mock).mockResolvedValue(USUARIO);

    const res = await chamar();

    expect(res.status).toBe(200);
    expect(prisma.usuario.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ firebaseUid: UID, nome: "Ana" }),
      })
    );
  });

  it("não retorna 500 quando duas requisições concorrentes tentam criar (P2002)", async () => {
    autenticar();
    (prisma.usuario.findUnique as jest.Mock)
      .mockResolvedValueOnce(null) // 1ª busca: ainda não existe
      .mockResolvedValueOnce(USUARIO); // após o P2002: a concorrente já criou
    (prisma.usuario.create as jest.Mock).mockRejectedValue(conflitoUnico());

    const res = await chamar();

    expect(res.status).toBe(200);
    expect(prisma.usuario.findUnique).toHaveBeenCalledTimes(2);
  });

  it("propaga o erro se o create falhar por algo que não é conflito único", async () => {
    autenticar();
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.usuario.create as jest.Mock).mockRejectedValue(new Error("db down"));

    const res = await chamar();

    expect(res.status).toBe(500);
  });
});

describe("authMiddleware — reconciliação de nome/email", () => {
  it("atualiza o nome local quando o token traz um nome diferente", async () => {
    autenticar({ name: "Ana Souza" });
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue({
      ...USUARIO,
      nome: "ana@example.com", // nasceu com o e-mail (cadastro por e-mail)
    });
    (prisma.usuario.update as jest.Mock).mockResolvedValue({ ...USUARIO, nome: "Ana Souza" });

    const res = await chamar();

    expect(res.status).toBe(200);
    expect(prisma.usuario.update).toHaveBeenCalledWith({
      where: { id: USUARIO.id },
      data: { nome: "Ana Souza" },
    });
  });

  it("não chama update quando token e registro já batem", async () => {
    autenticar();
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(USUARIO);

    const res = await chamar();

    expect(res.status).toBe(200);
    expect(prisma.usuario.update).not.toHaveBeenCalled();
  });

  it("mantém o registro atual se o update de e-mail colidir (P2002)", async () => {
    autenticar({ email: "novo@example.com" });
    (prisma.usuario.findUnique as jest.Mock).mockResolvedValue(USUARIO);
    (prisma.usuario.update as jest.Mock).mockRejectedValue(conflitoUnico());

    const res = await chamar();

    expect(res.status).toBe(200);
  });
});
