import { Router } from "express";
import rotinaRoute from "./rotina.route";
import tarefaRoute from "./tarefa.route";
import usuarioRoute from "./usuario.route";

/**
 * Agregador das rotas autenticadas da API (montado em /api, atrás do authMiddleware).
 * As demais rotas de negócio do contrato (desafios, ranking, chat com IA)
 * são adicionadas aqui conforme forem implementadas — ver tabela de contrato no CLAUDE.md.
 */
const apiRouter = Router();

apiRouter.use("/usuarios", usuarioRoute);
apiRouter.use("/rotinas", rotinaRoute);
apiRouter.use("/tarefas", tarefaRoute);

export default apiRouter;
