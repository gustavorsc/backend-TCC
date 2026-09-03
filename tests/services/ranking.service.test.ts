jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: {
    tarefa: { findMany: jest.fn() },
  },
}));

import prisma from "../../src/lib/prisma";
import * as rankingService from "../../src/services/ranking.service";

const AGORA = new Date("2026-09-02T12:00:00Z"); // quarta-feira

describe("ranking.service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it("filtra tarefas concluídas na semana corrente", async () => {
    (prisma.tarefa.findMany as jest.Mock).mockResolvedValue([]);

    await rankingService.obterRankingSemanal(AGORA);

    expect(prisma.tarefa.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          dataConclusao: {
            // Semana seg–dom no fuso de São Paulo (UTC−3): 31/08 00:00 a 06/09 23:59:59.999 locais.
            gte: new Date("2026-08-31T03:00:00.000Z"),
            lte: new Date("2026-09-07T02:59:59.999Z"),
          },
        },
      })
    );
  });

  it("agrupa o XP por usuário e ordena do maior para o menor", async () => {
    (prisma.tarefa.findMany as jest.Mock).mockResolvedValue([
      { xpConcedido: 10, rotina: { usuario: { id: "u1", nome: "Ana" } } },
      { xpConcedido: 10, rotina: { usuario: { id: "u2", nome: "Bia" } } },
      { xpConcedido: 10, rotina: { usuario: { id: "u1", nome: "Ana" } } },
    ]);

    const ranking = await rankingService.obterRankingSemanal(AGORA);

    expect(ranking).toEqual([
      { usuarioId: "u1", nome: "Ana", xpSemana: 20 },
      { usuarioId: "u2", nome: "Bia", xpSemana: 10 },
    ]);
  });

  it("retorna lista vazia quando ninguém concluiu tarefas na semana", async () => {
    (prisma.tarefa.findMany as jest.Mock).mockResolvedValue([]);

    const ranking = await rankingService.obterRankingSemanal(AGORA);

    expect(ranking).toEqual([]);
  });
});
