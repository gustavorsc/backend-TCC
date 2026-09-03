import { Usuario } from "@prisma/client";

jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    tarefa: { deleteMany: jest.fn() },
    rotina: { deleteMany: jest.fn(), findMany: jest.fn() },
    desafio: { deleteMany: jest.fn() },
    usoIA: { deleteMany: jest.fn() },
    usuario: { delete: jest.fn() },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

const mockDeleteUser = jest.fn();
jest.mock("../../src/lib/firebase-admin", () => ({
  __esModule: true,
  default: { auth: () => ({ deleteUser: mockDeleteUser }) },
}));

import prisma from "../../src/lib/prisma";
import * as usuarioService from "../../src/services/usuario.service";

function usuarioFixture(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: "usuario-1",
    firebaseUid: "firebase-uid-1",
    nome: "Ana",
    email: "ana@example.com",
    authProvider: "password",
    xpTotal: 120,
    streakAtual: 3,
    ultimaAtividade: new Date("2026-08-30T00:00:00Z"),
    dataCriacao: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("usuario.service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("buscarPerfil", () => {
    it("não vaza o firebaseUid no perfil público", () => {
      const perfil = usuarioService.buscarPerfil(usuarioFixture());

      expect(perfil).not.toHaveProperty("firebaseUid");
      expect(perfil).toMatchObject({ id: "usuario-1", nome: "Ana", xpTotal: 120, streakAtual: 3 });
    });
  });

  describe("excluirConta", () => {
    it("apaga tarefas, rotinas, desafios e o usuário numa transação", async () => {
      mockDeleteUser.mockResolvedValue(undefined);
      const usuario = usuarioFixture();

      await usuarioService.excluirConta(usuario);

      expect(prisma.tarefa.deleteMany).toHaveBeenCalledWith({
        where: { rotina: { usuarioId: usuario.id } },
      });
      expect(prisma.rotina.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: usuario.id } });
      expect(prisma.desafio.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: usuario.id } });
      expect(prisma.usoIA.deleteMany).toHaveBeenCalledWith({ where: { usuarioId: usuario.id } });
      expect(prisma.usuario.delete).toHaveBeenCalledWith({ where: { id: usuario.id } });
      expect(mockDeleteUser).toHaveBeenCalledWith(usuario.firebaseUid);
    });

    it("não propaga erro se a exclusão no Firebase falhar (melhor esforço)", async () => {
      mockDeleteUser.mockRejectedValue(new Error("firebase indisponível"));

      await expect(usuarioService.excluirConta(usuarioFixture())).resolves.toBeUndefined();
    });
  });

  describe("buscarProgresso", () => {
    it("retorna xpTotal, streakAtual e o progresso de cada rotina do usuário", async () => {
      const usuario = usuarioFixture();
      (prisma.rotina.findMany as jest.Mock).mockResolvedValue([
        { id: "rotina-1", tema: "Matemática", progresso: 50 },
      ]);

      const progresso = await usuarioService.buscarProgresso(usuario);

      expect(prisma.rotina.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: usuario.id } })
      );
      expect(progresso).toEqual({
        xpTotal: usuario.xpTotal,
        streakAtual: usuario.streakAtual,
        rotinas: [{ id: "rotina-1", tema: "Matemática", progresso: 50 }],
      });
    });
  });
});
