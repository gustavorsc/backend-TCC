-- AlterTable
ALTER TABLE "Tarefa" ADD COLUMN     "opcoes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "pergunta" TEXT,
ADD COLUMN     "respostaCorreta" INTEGER;
