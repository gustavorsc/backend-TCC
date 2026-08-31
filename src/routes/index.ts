import { Router } from "express";

/**
 * Agregador das rotas autenticadas da API (montado em /api, atrás do authMiddleware).
 * As rotas de negócio do contrato (usuarios, rotinas, tarefas, desafios, ranking)
 * são adicionadas aqui conforme forem implementadas — ver tabela de contrato no CLAUDE.md.
 */
const apiRouter = Router();

export default apiRouter;
