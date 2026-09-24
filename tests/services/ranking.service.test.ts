jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    historicoXP: { findMany: jest.fn() },
  },
}));

import prisma from "../../src/lib/prisma";
import * as rankingService from "../../src/services/ranking.service";

const AGORA = new Date("2026-09-02T12:00:00Z"); // quarta-feira

describe("ranking.service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("filtra registros de XP da semana corrente", async () => {
    (prisma.historicoXP.findMany as jest.Mock).mockResolvedValue([]);

    await rankingService.obterRankingSemanal(AGORA);

    expect(prisma.historicoXP.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dataCriacao: {
            // Semana seg–dom no fuso de São Paulo (UTC−3): 31/08 00:00 a 06/09 23:59:59.999 locais.
            gte: new Date("2026-08-31T03:00:00.000Z"),
            lte: new Date("2026-09-07T02:59:59.999Z"),
          },
        },
      })
    );
  });

  it("agrupa o XP por usuário e ordena do maior para o menor", async () => {
    (prisma.historicoXP.findMany as jest.Mock).mockResolvedValue([
      { xp: 10, usuario: { id: "u1", nome: "Ana" } },
      { xp: 10, usuario: { id: "u2", nome: "Bia" } },
      { xp: 10, usuario: { id: "u1", nome: "Ana" } },
    ]);

    const ranking = await rankingService.obterRankingSemanal(AGORA);

    expect(ranking).toEqual([
      { usuarioId: "u1", nome: "Ana", xpSemana: 20 },
      { usuarioId: "u2", nome: "Bia", xpSemana: 10 },
    ]);
  });

  it("retorna lista vazia quando ninguém pontuou na semana", async () => {
    (prisma.historicoXP.findMany as jest.Mock).mockResolvedValue([]);

    const ranking = await rankingService.obterRankingSemanal(AGORA);

    expect(ranking).toEqual([]);
  });

  it("RN14: sobrevive à exclusão da rotina/tarefa que gerou o XP (não depende de Tarefa)", async () => {
    // O próprio mock de prisma não expõe `tarefa` aqui de propósito: se o
    // service tentasse ler de lá, o teste quebraria por "tarefa is not a
    // function" — a garantia de que o ranking não depende mais de Tarefa.
    (prisma.historicoXP.findMany as jest.Mock).mockResolvedValue([
      { xp: 10, usuario: { id: "u1", nome: "Ana" } },
    ]);

    const ranking = await rankingService.obterRankingSemanal(AGORA);

    expect(ranking).toEqual([{ usuarioId: "u1", nome: "Ana", xpSemana: 10 }]);
  });
});
