import { Router } from "express";
import * as rankingController from "../controllers/ranking.controller";

const router = Router();

router.get("/", rankingController.listar);

export default router;
