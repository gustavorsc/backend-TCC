import { NextFunction, Request, Response } from "express";
import * as tarefaService from "../services/tarefa.service";

export async function criar(req: Request, res: Response, next: NextFunction) {
  try {
    const tarefa = await tarefaService.criar(req.usuario!.id, req.params.id, req.body);
    res.status(201).json(tarefa);
  } catch (err) {
    next(err);
  }
}

export async function atualizar(req: Request, res: Response, next: NextFunction) {
  try {
    const tarefa = await tarefaService.atualizar(req.usuario!.id, req.params.id, req.body);
    res.status(200).json(tarefa);
  } catch (err) {
    next(err);
  }
}

export async function excluir(req: Request, res: Response, next: NextFunction) {
  try {
    await tarefaService.excluir(req.usuario!.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function concluir(req: Request, res: Response, next: NextFunction) {
  try {
    const tarefa = await tarefaService.concluir(req.usuario!.id, req.params.id);
    res.status(200).json(tarefa);
  } catch (err) {
    next(err);
  }
}
