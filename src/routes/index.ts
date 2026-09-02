import { Router } from "express";
import desafioRoute from "./desafio.route";
import rankingRoute from "./ranking.route";
import rotinaRoute from "./rotina.route";
import tarefaRoute from "./tarefa.route";
import usuarioRoute from "./usuario.route";

/**
 * Agregador das rotas autenticadas da API (montado em /api, atrás do authMiddleware).
 * A rota de chat com IA é adicionada aqui quando implementada — ver tabela de
 * contrato no CLAUDE.md.
 */
const apiRouter = Router();

apiRouter.use("/usuarios", usuarioRoute);
apiRouter.use("/rotinas", rotinaRoute);
apiRouter.use("/tarefas", tarefaRoute);
apiRouter.use("/desafios", desafioRoute);
apiRouter.use("/ranking", rankingRoute);

export default apiRouter;
