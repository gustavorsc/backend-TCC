import { NextFunction, Request, Response } from "express";
import * as rotinaService from "../services/rotina.service";

export async function listar(req: Request, res: Response, next: NextFunction) {
  try {
    const rotinas = await rotinaService.listarPorUsuario(req.usuario!.id);
    res.status(200).json(rotinas);
  } catch (err) {
    next(err);
  }
}

export async function buscarDetalhe(req: Request, res: Response, next: NextFunction) {
  try {
    const rotina = await rotinaService.buscarDetalhe(req.usuario!.id, req.params.id);
    res.status(200).json(rotina);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const rotina = await rotinaService.atualizar(req.usuario!.id, req.params.id, req.body);
    res.status(200).json(rotina);
  } catch (err) {
    next(err);
  }
}

export async function excluir(req: Request, res: Response, next: NextFunction) {
  try {
    await rotinaService.excluir(req.usuario!.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
