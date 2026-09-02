import { Desafio } from "@prisma/client";

jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    desafio: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
  },
}));

import prisma from "../../src/lib/prisma";
import * as desafioService from "../../src/services/desafio.service";

const USUARIO_ID = "usuario-1";
const DESAFIO_ID = "desafio-1";

function desafioFixture(overrides: Partial<Desafio> = {}): Desafio {
  return {
    id: DESAFIO_ID,
    usuarioId: USUARIO_ID,
    tema: "Matemática",
    conteudo: "Desafio de exemplo",
    concluido: false,
    dataCriacao: new Date("2026-08-01T00:00:00Z"),
    ...overrides,
  };
}

describe("desafio.service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("listarPorUsuario", () => {
    it("filtra pelo usuário autenticado", async () => {
      (prisma.desafio.findMany as jest.Mock).mockResolvedValue([desafioFixture()]);

      const resultado = await desafioService.listarPorUsuario(USUARIO_ID);

      expect(prisma.desafio.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { usuarioId: USUARIO_ID } })
      );
      expect(resultado).toHaveLength(1);
    });
  });

  describe("concluir", () => {
    it("lança 404 quando o desafio não existe", async () => {
      (prisma.desafio.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(desafioService.concluir(USUARIO_ID, DESAFIO_ID)).rejects.toMatchObject({
        statusCode: 404,
        code: "DESAFIO_NAO_ENCONTRADO",
      });
    });

    it("lança 403 quando o desafio é de outro usuário", async () => {
      (prisma.desafio.findUnique as jest.Mock).mockResolvedValue(
        desafioFixture({ usuarioId: "outro-usuario" })
      );

      await expect(desafioService.concluir(USUARIO_ID, DESAFIO_ID)).rejects.toMatchObject({
        statusCode: 403,
        code: "DESAFIO_ACESSO_NEGADO",
      });
    });

    it("marca o desafio como concluído", async () => {
      (prisma.desafio.findUnique as jest.Mock).mockResolvedValue(desafioFixture());
      (prisma.desafio.update as jest.Mock).mockResolvedValue(desafioFixture({ concluido: true }));

      const resultado = await desafioService.concluir(USUARIO_ID, DESAFIO_ID);

      expect(prisma.desafio.update).toHaveBeenCalledWith({
        where: { id: DESAFIO_ID },
        data: { concluido: true },
      });
      expect(resultado.concluido).toBe(true);
    });
  });
});
