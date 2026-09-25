-- CreateTable
CREATE TABLE "HistoricoXP" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "xp" INTEGER NOT NULL,
    "dataCriacao" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HistoricoXP_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HistoricoXP_dataCriacao_idx" ON "HistoricoXP"("dataCriacao");

-- AddForeignKey
ALTER TABLE "HistoricoXP" ADD CONSTRAINT "HistoricoXP_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
