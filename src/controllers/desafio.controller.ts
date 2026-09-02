import { NextFunction, Request, Response } from "express";
import * as desafioService from "../services/desafio.service";

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const desafios = await desafioService.listarPorUsuario(req.usuario!.id);
    res.status(200).json(desafios);
  } catch (err) {
    next(err);
  }
}

export async function concluir(req: Request, res: Response, next: NextFunction) {
  try {
    const desafio = await desafioService.concluir(req.usuario!.id, req.params.id);
    res.status(200).json(desafio);
  } catch (err) {
    next(err);
  }
}
