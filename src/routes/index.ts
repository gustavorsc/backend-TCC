import { Router } from "express";
import rotinaRoute from "./rotina.route";
import usuarioRoute from "./usuario.route";

/**
 * Agregador das rotas autenticadas da API (montado em /api, atrás do authMiddleware).
 * As demais rotas de negócio do contrato (tarefas, desafios, ranking, chat com IA)
 * são adicionadas aqui conforme forem implementadas — ver tabela de contrato no CLAUDE.md.
 */
const apiRouter = Router();

apiRouter.use("/usuarios", usuarioRoute);
apiRouter.use("/rotinas", rotinaRoute);

export default apiRouter;
