import cors from "cors";
import express, { Application } from "express";
import { authMiddleware } from "./middlewares/auth.middleware";
import { errorHandler } from "./middlewares/errorHandler";
import healthRoute from "./routes/health.route";
import apiRouter from "./routes/index";

if (!process.env.FRONTEND_URL) {
  console.warn(
    "[cors] FRONTEND_URL não definida no .env — chamadas do frontend serão bloqueadas pelo CORS."
  );
}

const app: Application = express();

app.use(
  cors({
    origin: process.env.FRONTEND_URL,
    credentials: true,
  })
);
app.use(express.json());

// Sem autenticação.
app.use("/health", healthRoute);

// Todas as demais rotas passam pelo authMiddleware (RN02).
app.use("/api", authMiddleware, apiRouter);

// Deve ser o último middleware registrado.
app.use(errorHandler);

export default app;
