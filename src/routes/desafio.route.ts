import { Router } from "express";
import * as desafioController from "../controllers/desafio.controller";

const router = Router();

router.get("/", desafioController.listar);
router.patch("/:id/concluir", desafioController.concluir);

export default router;
