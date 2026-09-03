import { Router } from "express";
import * as rotinaController from "../controllers/rotina.controller";
import * as tarefaController from "../controllers/tarefa.controller";
import { validateBody } from "../utils/validate";
import { atualizarRotinaSchema } from "../schemas/rotina.schema";
import { criarTarefaSchema } from "../schemas/tarefa.schema";
import { chatSchema } from "../schemas/chat.schema";

const router = Router();

router.post("/chat", validateBody(chatSchema), rotinaController.chat);
router.get("/", rotinaController.listar);
router.get("/:id", rotinaController.buscarDetalhe);
router.put("/:id", validateBody(atualizarRotinaSchema), rotinaController.atualizar);
router.delete("/:id", rotinaController.excluir);
router.post("/:id/tarefas", validateBody(criarTarefaSchema), tarefaController.criar);

export default router;
