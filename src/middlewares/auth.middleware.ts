import { NextFunction, Request, Response } from "express";
import { Prisma, Usuario } from "@prisma/client";
import type { DecodedIdToken } from "firebase-admin/auth";
import firebaseAdmin from "../lib/firebase-admin";
import prisma from "../lib/prisma";
import { AppError } from "./errorHandler";

/**
 * Verifica o token Firebase enviado em `Authorization: Bearer <token>`.
 * O backend não faz login — só valida um token que o frontend já obteve.
 *
 * 1. Lê o header Authorization.
 * 2. Valida com admin.auth().verifyIdToken. Inválido/expirado -> 401.
 * 3. Busca o Usuario local por firebaseUid; se não existir (primeiro login), cria.
 * 4. Reconcilia `nome`/`email` quando o token do provedor diverge do registro
 *    local (cadastro por e-mail: o nome só entra no token depois do
 *    `updateProfile` + refresh; troca de nome no provedor).
 * 5. Anexa o Usuario em req.usuario.
 *
 * Todas as rotas passam por este middleware, exceto /health.
 */
export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new AppError("Token de autenticação ausente", 401, "NAO_AUTENTICADO");
    }

    const token = authHeader.slice("Bearer ".length);

    let decoded: DecodedIdToken;
    try {
      decoded = await firebaseAdmin.auth().verifyIdToken(token);
    } catch {
      throw new AppError("Token de autenticação inválido ou expirado", 401, "NAO_AUTENTICADO");
    }

    req.usuario = await obterOuCriarUsuario(decoded);
    next();
  } catch (err) {
    next(err);
  }
}

const ehConflitoUnico = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";

async function obterOuCriarUsuario(decoded: DecodedIdToken): Promise<Usuario> {
  const nomeToken = decoded.name?.trim();
  const emailToken = decoded.email?.trim();

  const existente = await prisma.usuario.findUnique({
    where: { firebaseUid: decoded.uid },
  });

  if (existente) {
    return reconciliar(existente, nomeToken, emailToken);
  }

  try {
    return await prisma.usuario.create({
      data: {
        firebaseUid: decoded.uid,
        nome: nomeToken || emailToken || "Usuário",
        email: emailToken ?? "",
        authProvider: decoded.firebase.sign_in_provider,
      },
    });
  } catch (err) {
    // Corrida: outra requisição concorrente do mesmo primeiro acesso já criou o
    // registro (o frontend dispara várias chamadas em paralelo ao abrir o app).
    if (ehConflitoUnico(err)) {
      const criado = await prisma.usuario.findUnique({
        where: { firebaseUid: decoded.uid },
      });
      if (criado) return reconciliar(criado, nomeToken, emailToken);
    }
    throw err;
  }
}

/** Alinha `nome`/`email` locais ao que o provedor (Firebase) manda no token. */
async function reconciliar(
  usuario: Usuario,
  nomeToken: string | undefined,
  emailToken: string | undefined
): Promise<Usuario> {
  const data: Prisma.UsuarioUpdateInput = {};
  if (nomeToken && nomeToken !== usuario.nome) data.nome = nomeToken;
  if (emailToken && emailToken !== usuario.email) data.email = emailToken;

  if (Object.keys(data).length === 0) return usuario;

  try {
    return await prisma.usuario.update({ where: { id: usuario.id }, data });
  } catch (err) {
    // e-mail é @unique — se colidir com outra conta, mantém o registro atual.
    if (ehConflitoUnico(err)) return usuario;
    throw err;
  }
}
