import { NextFunction, Request, Response } from "express";
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
 * 4. Anexa o Usuario em req.usuario.
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

    let decoded;
    try {
      decoded = await firebaseAdmin.auth().verifyIdToken(token);
    } catch {
      throw new AppError("Token de autenticação inválido ou expirado", 401, "NAO_AUTENTICADO");
    }

    let usuario = await prisma.usuario.findUnique({
      where: { firebaseUid: decoded.uid },
    });

    if (!usuario) {
      usuario = await prisma.usuario.create({
        data: {
          firebaseUid: decoded.uid,
          nome: decoded.name ?? decoded.email ?? "Usuário",
          email: decoded.email ?? "",
          authProvider: decoded.firebase.sign_in_provider,
        },
      });
    }

    req.usuario = usuario;
    next();
  } catch (err) {
    next(err);
  }
}
