import { Usuario } from "@prisma/client";
import firebaseAdmin from "../lib/firebase-admin";
import prisma from "../lib/prisma";
import { streakEmRisco } from "../utils/streak";

/**
 * Formato público do usuário devolvido pela API — nunca expor firebaseUid,
 * que é um identificador interno de integração com o Firebase.
 */
export interface PerfilUsuario {
  id: string;
  nome: string;
  email: string;
  xpTotal: number;
  streakAtual: number;
  ultimaAtividade: Date | null;
  dataCriacao: Date;
}

function paraPerfilPublico(usuario: Usuario): PerfilUsuario {
  return {
    id: usuario.id,
    nome: usuario.nome,
    email: usuario.email,
    xpTotal: usuario.xpTotal,
    streakAtual: usuario.streakAtual,
    ultimaAtividade: usuario.ultimaAtividade,
    dataCriacao: usuario.dataCriacao,
  };
}

/** GET /api/usuarios/me (RF01, RF02) — perfil do usuário autenticado. */
export function buscarPerfil(usuario: Usuario): PerfilUsuario {
  return paraPerfilPublico(usuario);
}

export interface ProgressoUsuario {
  xpTotal: number;
  streakAtual: number;
  /** RN16 — true quando há streak ativo e nenhuma tarefa concluída ainda hoje. */
  streakEmRisco: boolean;
  rotinas: { id: string; tema: string; progresso: number }[];
}

/** GET /api/usuarios/me/progresso (RF09, RF10, RN16) — XP, streak, risco de streak e progresso de cada rotina. */
export async function buscarProgresso(usuario: Usuario): Promise<ProgressoUsuario> {
  const rotinas = await prisma.rotina.findMany({
    where: { usuarioId: usuario.id },
    select: { id: true, tema: true, progresso: true },
    orderBy: { dataCriacao: "desc" },
  });

  return {
    xpTotal: usuario.xpTotal,
    streakAtual: usuario.streakAtual,
    streakEmRisco: streakEmRisco(usuario.streakAtual, usuario.ultimaAtividade, new Date()),
    rotinas,
  };
}

/**
 * DELETE /api/usuarios/me (RNF02 — LGPD) — exclui a conta e todos os dados pessoais.
 * Apaga tarefas, rotinas e desafios do usuário antes do próprio registro, numa
 * transação, para não violar as foreign keys do schema.
 */
export async function excluirConta(usuario: Usuario): Promise<void> {
  await prisma.$transaction([
    prisma.tarefa.deleteMany({ where: { rotina: { usuarioId: usuario.id } } }),
    prisma.rotina.deleteMany({ where: { usuarioId: usuario.id } }),
    prisma.desafio.deleteMany({ where: { usuarioId: usuario.id } }),
    prisma.usoIA.deleteMany({ where: { usuarioId: usuario.id } }),
    prisma.usuario.delete({ where: { id: usuario.id } }),
  ]);

  // Melhor esforço: remove também o usuário do Firebase Auth. Se falhar (ex.: SDK
  // não configurado, usuário já removido lá), não bloqueia a exclusão dos dados —
  // o requisito de LGPD já foi cumprido ao apagar os dados pessoais no banco.
  try {
    await firebaseAdmin.auth().deleteUser(usuario.firebaseUid);
  } catch (err) {
    console.warn(
      `[usuario.service] Falha ao excluir usuário ${usuario.firebaseUid} no Firebase Auth:`,
      err
    );
  }
}
