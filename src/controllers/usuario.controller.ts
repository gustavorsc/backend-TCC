import { NextFunction, Request, Response } from "express";
import * as usuarioService from "../services/usuario.service";

export async function getMe(req: Request, res: Response, next: NextFunction) {
  try {
    // req.usuario é garantido pelo authMiddleware.
    const perfil = usuarioService.buscarPerfil(req.usuario!);
    res.status(200).json(perfil);
  } catch (err) {
    next(err);
  }
}

export async function deleteMe(req: Request, res: Response, next: NextFunction) {
  try {
    await usuarioService.excluirConta(req.usuario!);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getProgresso(req: Request, res: Response, next: NextFunction) {
  try {
    const progresso = await usuarioService.buscarProgresso(req.usuario!);
    res.status(200).json(progresso);
  } catch (err) {
    next(err);
  }
}
