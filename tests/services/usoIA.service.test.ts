jest.mock("../../src/lib/prisma", () => ({
  __esModule: true,
  default: { usoIA: { upsert: jest.fn() } },
}));

import prisma from "../../src/lib/prisma";
import * as usoIA from "../../src/services/usoIA.service";
import { IA_LIMITE_DIARIO } from "../../src/utils/constants";

const USUARIO_ID = "usuario-1";

describe("usoIA.service", () => {
  afterEach(() => jest.clearAllMocks());

  describe("reservarChamadaIA", () => {
    it("incrementa o contador do dia e retorna as chamadas restantes", async () => {
      (prisma.usoIA.upsert as jest.Mock).mockResolvedValue({ contagem: 1 });

      const resultado = await usoIA.reservarChamadaIA(USUARIO_ID, new Date("2026-09-03T10:00:00Z"));

      expect(prisma.usoIA.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { usuarioId_dia: { usuarioId: USUARIO_ID, dia: "2026-09-03" } },
          create: { usuarioId: USUARIO_ID, dia: "2026-09-03", contagem: 1 },
          update: { contagem: { increment: 1 } },
        })
      );
      expect(resultado.chamadasRestantes).toBe(IA_LIMITE_DIARIO - 1);
    });

    it("lança 429 LIMITE_IA_DIARIO quando o contador ultrapassa o limite diário", async () => {
      (prisma.usoIA.upsert as jest.Mock).mockResolvedValue({ contagem: IA_LIMITE_DIARIO + 1 });

      await expect(usoIA.reservarChamadaIA(USUARIO_ID)).rejects.toMatchObject({
        statusCode: 429,
        code: "LIMITE_IA_DIARIO",
      });
    });

    it("libera a última chamada dentro do limite (chamadasRestantes = 0)", async () => {
      (prisma.usoIA.upsert as jest.Mock).mockResolvedValue({ contagem: IA_LIMITE_DIARIO });

      const resultado = await usoIA.reservarChamadaIA(USUARIO_ID);

      expect(resultado.chamadasRestantes).toBe(0);
    });
  });
});
