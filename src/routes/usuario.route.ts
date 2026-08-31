import { Router } from "express";
import * as usuarioController from "../controllers/usuario.controller";

const router = Router();

router.get("/me", usuarioController.getMe);
router.delete("/me", usuarioController.deleteMe);

export default router;
