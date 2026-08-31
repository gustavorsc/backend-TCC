import { Router } from "express";
import * as rotinaController from "../controllers/rotina.controller";
import { validateBody } from "../utils/validate";
import { atualizarRotinaSchema } from "../schemas/rotina.schema";

const router = Router();

router.get("/", rotinaController.listar);
router.get("/:id", rotinaController.buscarDetalhe);
router.put("/:id", validateBody(atualizarRotinaSchema), rotinaController.atualizar);
router.delete("/:id", rotinaController.excluir);

export default router;
