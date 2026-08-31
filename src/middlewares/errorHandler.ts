import { NextFunction, Request, Response } from "express";

/**
 * Erro de aplicação com código HTTP e código de negócio (ex.: "ROTINA_NAO_ENCONTRADA"),
 * para ser lançado pelas camadas de service/controller e capturado aqui.
 */
export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(message: string, statusCode = 400, code = "ERRO_INTERNO") {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

/**
 * Middleware de tratamento de erro. Deve ser o último `app.use` registrado.
 * Nunca vaza stack trace ou detalhes internos na resposta (ver CLAUDE.md).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: { message: err.message, code: err.code },
    });
    return;
  }

  console.error(err);
  res.status(500).json({
    error: { message: "Erro interno do servidor", code: "ERRO_INTERNO" },
  });
}
