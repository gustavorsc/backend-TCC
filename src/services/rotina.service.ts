import { Prisma, Rotina } from "@prisma/client";
import { AppError } from "../middlewares/errorHandler";
import prisma from "../lib/prisma";
import { AtualizarRotinaInput } from "../schemas/rotina.schema";
import { ChatMensagem, RotinaGerada } from "../schemas/chat.schema";
import { conversar } from "./ia.service";
import { reservarChamadaIA } from "./usoIA.service";

/**
 * Busca a rotina pelo id e garante que pertence ao usuário autenticado (RN04).
 * 404 se a rotina não existe; 403 se existe mas é de outro usuário — distinção
 * usada pelo formato de erro do CLAUDE.md. Exportada para reuso por tarefa.service.
 */
export async function buscarRotinaDoUsuarioOuFalhar(
  usuarioId: string,
  rotinaId: string
): Promise<Rotina> {
  const rotina = await prisma.rotina.findUnique({ where: { id: rotinaId } });

  if (!rotina) {
    throw new AppError("Rotina não encontrada", 404, "ROTINA_NAO_ENCONTRADA");
  }

  if (rotina.usuarioId !== usuarioId) {
    throw new AppError("Rotina pertence a outro usuário", 403, "ROTINA_ACESSO_NEGADO");
  }

  return rotina;
}

/**
 * RN08 — recalcula e persiste o progresso da rotina (% de tarefas concluídas,
 * 0 a 100) a partir da contagem atual de tarefas. Chamada sempre que uma tarefa
 * é criada, removida ou concluída. Aceita um client de transação opcional para
 * ser usada dentro de operações atômicas maiores (ver tarefa.service).
 */
export async function recalcularProgresso(
  rotinaId: string,
  client: Prisma.TransactionClient | typeof prisma = prisma
): Promise<number> {
  const [total, concluidas] = await Promise.all([
    client.tarefa.count({ where: { rotinaId } }),
    client.tarefa.count({ where: { rotinaId, concluida: true } }),
  ]);

  const progresso = total === 0 ? 0 : Math.round((concluidas / total) * 100);

  await client.rotina.update({ where: { id: rotinaId }, data: { progresso } });

  return progresso;
}

/**
 * Persiste uma rotina gerada pela IA (já validada em ia.service, RN10/RN03)
 * como uma Rotina do usuário com suas Tarefas, numa única operação.
 * `progresso` começa em 0 — nenhuma tarefa concluída ainda (RN08).
 */
function persistirRotinaGerada(usuarioId: string, dados: RotinaGerada) {
  return prisma.rotina.create({
    data: {
      usuarioId,
      tema: dados.tema,
      descricao: dados.descricao ?? null,
      nivelConhecimento: dados.nivelConhecimento ?? null,
      tempoDisponivel: dados.tempoDisponivel ?? null,
      frequencia: dados.frequencia ?? null,
      tarefas: {
        create: dados.tarefas.map((t) => ({
          titulo: t.titulo,
          descricao: t.descricao ?? null,
        })),
      },
    },
    include: { tarefas: true },
  });
}

type RespostaChat =
  | { tipo: "pergunta"; mensagem: string; chamadasRestantes: number }
  | {
      tipo: "rotina";
      rotina: Prisma.RotinaGetPayload<{ include: { tarefas: true } }>;
      chamadasRestantes: number;
    };

/**
 * POST /api/rotinas/chat (RF03, RF12, RN10, RN15).
 *
 * 1. Reserva uma chamada à IA no limite diário do usuário — falha com 429 ANTES
 *    de gastar a requisição à OpenAI (RN15).
 * 2. Envia a conversa à IA e recebe a resposta já validada (RN10).
 * 3. Se for pergunta de complemento, repassa. Se for rotina, persiste como
 *    Rotina + Tarefas do usuário (RN03 garante ≥1 tarefa) e devolve o registro.
 */
export async function processarChat(
  usuarioId: string,
  mensagens: ChatMensagem[]
): Promise<RespostaChat> {
  const { chamadasRestantes } = await reservarChamadaIA(usuarioId);

  const resposta = await conversar(mensagens);

  if (resposta.tipo === "pergunta") {
    return { tipo: "pergunta", mensagem: resposta.mensagem, chamadasRestantes };
  }

  const rotina = await persistirRotinaGerada(usuarioId, resposta.rotina);
  return { tipo: "rotina", rotina, chamadasRestantes };
}

/** GET /api/rotinas (RF04, RN04) — lista as rotinas do usuário autenticado. */
export function listarPorUsuario(usuarioId: string) {
  return prisma.rotina.findMany({
    where: { usuarioId },
    orderBy: { dataCriacao: "desc" },
    include: { _count: { select: { tarefas: true } } },
  });
}

/** GET /api/rotinas/:id (RF04, RN04) — detalhe da rotina com suas tarefas. */
export async function buscarDetalhe(usuarioId: string, rotinaId: string) {
  await buscarRotinaDoUsuarioOuFalhar(usuarioId, rotinaId);

  // Refeito com include em vez de reaproveitar o resultado acima, para trazer as tarefas.
  return prisma.rotina.findUnique({
    where: { id: rotinaId },
    include: { tarefas: true },
  });
}

/** PUT /api/rotinas/:id (RF05, RN05) — edita a rotina, salvando imediatamente. */
export async function atualizar(
  usuarioId: string,
  rotinaId: string,
  dados: AtualizarRotinaInput
): Promise<Rotina> {
  await buscarRotinaDoUsuarioOuFalhar(usuarioId, rotinaId);

  return prisma.rotina.update({
    where: { id: rotinaId },
    data: dados,
  });
}

/**
 * DELETE /api/rotinas/:id (RF06). A confirmação (RN06) é responsabilidade do
 * frontend — o backend apenas executa a exclusão quando chamado. Apaga as
 * tarefas antes da rotina, numa transação, para respeitar a foreign key.
 */
export async function excluir(usuarioId: string, rotinaId: string): Promise<void> {
  await buscarRotinaDoUsuarioOuFalhar(usuarioId, rotinaId);

  await prisma.$transaction([
    prisma.tarefa.deleteMany({ where: { rotinaId } }),
    prisma.rotina.delete({ where: { id: rotinaId } }),
  ]);
}
