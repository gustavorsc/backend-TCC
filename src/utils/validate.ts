import { NextFunction, Request, Response } from "express";
import { ZodTypeAny } from "zod";
import { AppError } from "../middlewares/errorHandler";

/**
 * Middleware de validação de entrada com Zod (ver convenções no CLAUDE.md:
 * "Validação de entrada com Zod antes de chegar ao service").
 * Em caso de falha, lança AppError 400 com o primeiro erro de validação.
 */
export function validateBody(schema: ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const resultado = schema.safeParse(req.body);

    if (!resultado.success) {
      const primeiroErro = resultado.error.issues[0];
      next(
        new AppError(
          primeiroErro?.message ?? "Dados inválidos",
          400,
          "VALIDACAO"
        )
      );
      return;
    }

    req.body = resultado.data;
    next();
  };
}
