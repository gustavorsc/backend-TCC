-- CreateTable
CREATE TABLE "UsoIA" (
    "id" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "dia" TEXT NOT NULL,
    "contagem" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsoIA_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UsoIA_usuarioId_dia_key" ON "UsoIA"("usuarioId", "dia");

-- AddForeignKey
ALTER TABLE "UsoIA" ADD CONSTRAINT "UsoIA_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
