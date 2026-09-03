import { Rotina, Tarefa, Usuario } from "@prisma/client";

jest.mock("../../src/lib/prisma", () => {
  const client = {
    tarefa: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    rotina: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    usuario: {
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
    },
    desafio: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    $transaction: jest.fn((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(client)
    ),
  };
  return { __esModule: true, default: client };
});

jest.mock("../../src/services/ia.service", () => ({
  __esModule: true,
  gerarDesafioAdaptativo: jest.fn(),
}));

import prisma from "../../src/lib/prisma";
import * as tarefaService from "../../src/services/tarefa.service";
import { gerarDesafioAdaptativo } from "../../src/services/ia.service";
import { XP_POR_TAREFA } from "../../src/utils/constants";

const USUARIO_ID = "usuario-1";
const OUTRO_USUARIO_ID = "usuario-2";
const ROTINA_ID = "rotina-1";
const TAREFA_ID = "tarefa-1";

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

function tarefaFixture(overrides: Partial<Tarefa> = {}): Tarefa {
  return {
    id: TAREFA_ID,
    rotinaId: ROTINA_ID,
    titulo: "Ler capítulo 1",
    descricao: null,
    concluida: false,
    dataCriacao: new Date("2026-08-01T00:00:00Z"),
    dataConclusao: null,
    xpConcedido: 0,
    ...overrides,
  };
}

function usuarioFixture(overrides: Partial<Usuario> = {}): Usuario {
  return {
    id: USUARIO_ID,
    firebaseUid: "firebase-uid-1",
    nome: "Ana",
    email: "ana@example.com",
    authProvider: "password",
    xpTotal: 0,
    streakAtual: 0,
    ultimaAtividade: null,
    dataCriacao: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

describe("tarefa.service", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("criar", () => {
    it("lança 403 quando a rotina é de outro usuário", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(
        rotinaFixture({ usuarioId: OUTRO_USUARIO_ID })
      );

      await expect(
        tarefaService.criar(USUARIO_ID, ROTINA_ID, { titulo: "Nova tarefa" })
      ).rejects.toMatchObject({ statusCode: 403 });
      expect(prisma.tarefa.create).not.toHaveBeenCalled();
    });

    it("cria a tarefa e recalcula o progresso da rotina", async () => {
      (prisma.rotina.findUnique as jest.Mock).mockResolvedValue(rotinaFixture());
      (prisma.tarefa.create as jest.Mock).mockResolvedValue(tarefaFixture());
      (prisma.tarefa.count as jest.Mock).mockResolvedValueOnce(2).mockResolvedValueOnce(1);

      const resultado = await tarefaService.criar(USUARIO_ID, ROTINA_ID, {
        titulo: "Nova tarefa",
      });

      expect(prisma.tarefa.create).toHaveBeenCalledWith({
        data: { rotinaId: ROTINA_ID, titulo: "Nova tarefa", descricao: null },
      });
      expect(prisma.rotina.update).toHaveBeenCalledWith({
        where: { id: ROTINA_ID },
        data: { progresso: 50 },
      });
      expect(resultado.id).toBe(TAREFA_ID);
    });
  });

  describe("excluir", () => {
    it("lança 400 ROTINA_SEM_TAREFA quando é a última tarefa da rotina", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue({
        ...tarefaFixture(),
        rotina: { usuarioId: USUARIO_ID },
      });
      (prisma.tarefa.count as jest.Mock).mockResolvedValue(1);

      await expect(tarefaService.excluir(USUARIO_ID, TAREFA_ID)).rejects.toMatchObject({
        statusCode: 400,
        code: "ROTINA_SEM_TAREFA",
      });
      expect(prisma.tarefa.delete).not.toHaveBeenCalled();
    });

    it("remove a tarefa e recalcula o progresso quando não é a última", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue({
        ...tarefaFixture(),
        rotina: { usuarioId: USUARIO_ID },
      });
      (prisma.tarefa.count as jest.Mock)
        .mockResolvedValueOnce(2) // checagem RN03
        .mockResolvedValueOnce(1) // recalcularProgresso: total
        .mockResolvedValueOnce(1); // recalcularProgresso: concluídas

      await tarefaService.excluir(USUARIO_ID, TAREFA_ID);

      expect(prisma.tarefa.delete).toHaveBeenCalledWith({ where: { id: TAREFA_ID } });
      expect(prisma.rotina.update).toHaveBeenCalledWith({
        where: { id: ROTINA_ID },
        data: { progresso: 100 },
      });
    });
  });

  describe("concluir", () => {
    it("lança 404 quando a tarefa não existe", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue(null);

      await expect(tarefaService.concluir(USUARIO_ID, TAREFA_ID)).rejects.toMatchObject({
        statusCode: 404,
      });
    });

    it("lança 403 quando a tarefa é de outro usuário", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue({
        ...tarefaFixture(),
        rotina: { usuarioId: OUTRO_USUARIO_ID },
      });

      await expect(tarefaService.concluir(USUARIO_ID, TAREFA_ID)).rejects.toMatchObject({
        statusCode: 403,
      });
    });

    it("é idempotente: tarefa já concluída não repete XP/streak", async () => {
      const tarefaConcluida = { ...tarefaFixture({ concluida: true }), rotina: { usuarioId: USUARIO_ID } };
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue(tarefaConcluida);

      const resultado = await tarefaService.concluir(USUARIO_ID, TAREFA_ID);

      expect(resultado.concluida).toBe(true);
      expect(prisma.usuario.update).not.toHaveBeenCalled();
    });

    it("concede XP, atualiza o streak e recalcula o progresso ao concluir", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue({
        ...tarefaFixture(),
        rotina: { usuarioId: USUARIO_ID, tema: "Matemática" },
      });
      (prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue(
        usuarioFixture({ streakAtual: 2, ultimaAtividade: null })
      );
      (prisma.tarefa.update as jest.Mock).mockResolvedValue(
        tarefaFixture({ concluida: true, xpConcedido: XP_POR_TAREFA })
      );
      (prisma.tarefa.count as jest.Mock)
        .mockResolvedValueOnce(1) // recalcularProgresso: total
        .mockResolvedValueOnce(1) // recalcularProgresso: concluídas
        .mockResolvedValueOnce(0); // RN13: tarefas atrasadas do mesmo tema

      const resultado = await tarefaService.concluir(USUARIO_ID, TAREFA_ID);

      expect(prisma.tarefa.update).toHaveBeenCalledWith({
        where: { id: TAREFA_ID },
        data: expect.objectContaining({ concluida: true, xpConcedido: XP_POR_TAREFA }),
      });
      expect(prisma.usuario.update).toHaveBeenCalledWith({
        where: { id: USUARIO_ID },
        data: expect.objectContaining({
          xpTotal: { increment: XP_POR_TAREFA },
          streakAtual: 1, // sem atividade anterior -> streak recomeça em 1
        }),
      });
      expect(prisma.rotina.update).toHaveBeenCalledWith({
        where: { id: ROTINA_ID },
        data: { progresso: 100 },
      });
      expect(resultado.xpConcedido).toBe(XP_POR_TAREFA);
      expect(prisma.desafio.create).not.toHaveBeenCalled();
    });

    it("RN13: gera o desafio pela IA e persiste quando há 3+ tarefas atrasadas do mesmo tema", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue({
        ...tarefaFixture(),
        rotina: { usuarioId: USUARIO_ID, tema: "Matemática" },
      });
      (prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue(usuarioFixture());
      (prisma.tarefa.update as jest.Mock).mockResolvedValue(
        tarefaFixture({ concluida: true, xpConcedido: XP_POR_TAREFA })
      );
      (prisma.tarefa.count as jest.Mock)
        .mockResolvedValueOnce(4) // recalcularProgresso: total
        .mockResolvedValueOnce(1) // recalcularProgresso: concluídas
        .mockResolvedValueOnce(3); // RN13: 3 tarefas atrasadas do mesmo tema
      (prisma.desafio.findFirst as jest.Mock).mockResolvedValue(null); // sem desafio em aberto
      (gerarDesafioAdaptativo as jest.Mock).mockResolvedValue({
        titulo: "Retomada de Matemática",
        conteudo: "Objetivo: revisar frações.\n1. ...",
      });

      await tarefaService.concluir(USUARIO_ID, TAREFA_ID);

      expect(gerarDesafioAdaptativo).toHaveBeenCalledWith("Matemática", 3);
      expect(prisma.desafio.create).toHaveBeenCalledWith({
        data: {
          usuarioId: USUARIO_ID,
          tema: "Matemática",
          conteudo: "Retomada de Matemática\n\nObjetivo: revisar frações.\n1. ...",
        },
      });
    });

    it("RN13: se a IA falhar, a conclusão da tarefa não quebra e nenhum desafio é criado", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue({
        ...tarefaFixture(),
        rotina: { usuarioId: USUARIO_ID, tema: "Matemática" },
      });
      (prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue(usuarioFixture());
      (prisma.tarefa.update as jest.Mock).mockResolvedValue(
        tarefaFixture({ concluida: true, xpConcedido: XP_POR_TAREFA })
      );
      (prisma.tarefa.count as jest.Mock)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3);
      (prisma.desafio.findFirst as jest.Mock).mockResolvedValue(null);
      (gerarDesafioAdaptativo as jest.Mock).mockRejectedValue(new Error("IA fora do ar"));

      const resultado = await tarefaService.concluir(USUARIO_ID, TAREFA_ID);

      expect(resultado.concluida).toBe(true);
      expect(prisma.desafio.create).not.toHaveBeenCalled();
    });

    it("RN13: não duplica desafio quando já existe um em aberto para o tema", async () => {
      (prisma.tarefa.findUnique as jest.Mock).mockResolvedValue({
        ...tarefaFixture(),
        rotina: { usuarioId: USUARIO_ID, tema: "Matemática" },
      });
      (prisma.usuario.findUniqueOrThrow as jest.Mock).mockResolvedValue(usuarioFixture());
      (prisma.tarefa.update as jest.Mock).mockResolvedValue(
        tarefaFixture({ concluida: true, xpConcedido: XP_POR_TAREFA })
      );
      (prisma.tarefa.count as jest.Mock)
        .mockResolvedValueOnce(4)
        .mockResolvedValueOnce(1)
        .mockResolvedValueOnce(3);
      (prisma.desafio.findFirst as jest.Mock).mockResolvedValue({ id: "desafio-existente" });

      await tarefaService.concluir(USUARIO_ID, TAREFA_ID);

      expect(prisma.desafio.create).not.toHaveBeenCalled();
    });
  });
});
