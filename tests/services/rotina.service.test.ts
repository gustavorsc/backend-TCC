import { Rotina } from "@prisma/client";
import { AppError } from "../../src/middlewares/errorHandler";

jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    rotina: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    tarefa: {
      deleteMany: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.all(ops)),
  },
}));

import prisma from "../../src/lib/prisma";
import * as rotinaService from "../../src/services/rotina.service";

const USUARIO_ID = "usuario-1";
const OUTRO_USUARIO_ID = "usuario-2";
const ROTINA_ID = "rotina-1";

function rotinaFixture(overrides: Partial<Rotina> = {}): Rotina {
  return {
    id: ROTINA_ID,
    usuarioId: USUARIO_ID,
    tema: "Matemática",
    descricao: null,
    nivelConhecimento: null,
    tempoDisponivel: null,
    frequencia: null,
    progresso: 0,
    dataCriacao: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("rotina.service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("listarPorUsuario", () => {
    it("lista rotinas filtrando pelo usuário autenticado", async () => {
      (prisma.rotina.findMany as jest.Mock).mockResolvedValue([rotinaFixture()]);

      const resultado = await rotinaService.listarPorUsuario(USUARIO_ID);

      expect(prisma.rotina.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: USUARIO_ID } })
      );
      expect(resultado).toHaveLength(1);
    });
  });

  describe("buscarDetalhe", () => {
    it("lança 404 quando a rotina não existe", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(rotinaService.buscarDetalhe(USUARIO_ID, ROTINA_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: "ROTINA_NAO_ENCONTRADA",
      } satisfies Partial<AppError>);
    });

    it("lança 403 quando a rotina pertence a outro usuário", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(
        rotinaFixture({ usuarioId: OUTRO_USUARIO_ID })
      );

      await expect(rotinaService.buscarDetalhe(USUARIO_ID, ROTINA_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: "ROTINA_ACESSO_NEGADO",
      } satisfies Partial<AppError>);
    });

    it("retorna a rotina com as tarefas quando pertence ao usuário", async () => {
      (prisma.rotina.findUnique as jest.Mock)
        .mockResolvedValueOnce(rotinaFixture())
        .mockResolvedValueOnce({ ...rotinaFixture(), tarefas: [] });

      const resultado = await rotinaService.buscarDetalhe(USUARIO_ID, ROTINA_ID);

      expect(resultado).toMatchObject({ id: ROTINA_ID, tarefas: [] });
    });
  });

  describe("atualizar", () => {
    it("lança 403 sem chamar update quando a rotina é de outro usuário", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(
        rotinaFixture({ usuarioId: OUTRO_USUARIO_ID })
      );

      await expect(
        rotinaService.atualizar(USUARIO_ID, ROTINA_ID, { tema: "Física" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.rotina.update).not.toHaveBeenCalled();
    });

    it("atualiza a rotina quando pertence ao usuário", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(rotinaFixture());
      (prisma.rotina.update as jest.Mock).mockResolvedValue(rotinaFixture({ tema: "Física" }));

      const resultado = await rotinaService.atualizar(USUARIO_ID, ROTINA_ID, { tema: "Física" });

      expect(prisma.rotina.update).toHaveBeenCalledWith({
        where: { id: ROTINA_ID },
        data: { tema: "Física" },
      });
      expect(resultado.tema).toBe("Física");
    });
  });

  describe("excluir", () => {
    it("lança 404 sem excluir quando a rotina não existe", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(rotinaService.excluir(USUARIO_ID, ROTINA_ID)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("apaga as tarefas e a rotina numa transação quando pertence ao usuário", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(rotinaFixture());

      await rotinaService.excluir(USUARIO_ID, ROTINA_ID);

      expect(prisma.tarefa.deleteMany).toHaveBeenCalledWith({ where: { rotinaId: ROTINA_ID } });
      expect(prisma.rotina.delete).toHaveBeenCalledWith({ where: { id: ROTINA_ID } });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});
