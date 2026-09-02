import { Router } from "express";
import * as tarefaController from "../controllers/tarefa.controller";
import { validateBody } from "../utils/validate";
import { atualizarTarefaSchema } from "../schemas/tarefa.schema";

const router = Router();

router.put("/:id", validateBody(atualizarTarefaSchema), tarefaController.atualizar);
router.delete("/:id", tarefaController.excluir);
router.patch("/:id/concluir", tarefaController.concluir);

export default router;
