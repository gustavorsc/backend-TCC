import { NextFunction, Request, Response } from "express";
import * as rankingService from "../services/ranking.service";

export async function listar(_req: Request, res: Response, next: NextFunction) {
  try {
    const ranking = await rankingService.obterRankingSemanal();
    res.status(200).json(ranking);
  } catch (err) {
    next(err);
  }
}
