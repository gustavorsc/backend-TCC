import { Router } from "express";

const router = Router();

// GET /health — healthcheck, sem autenticação.
router.get("/", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

export default router;
