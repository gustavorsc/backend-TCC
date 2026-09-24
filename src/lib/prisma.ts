import { PrismaClient } from "@prisma/client";

/**
 * Instância única do PrismaClient, reutilizada em toda a aplicação.
 * Evita esgotar o pool de conexões do Supabase (Transaction Pooler)
 * criando múltiplas instâncias em hot-reload/dev.
 *
 * `omit` global: `Tarefa.respostaCorreta` nunca sai em nenhuma consulta por
 * padrão — é o índice da opção certa da questão de múltipla escolha (ver RN13
 * e schema.prisma), e não pode vazar pro frontend antes de responder. Só
 * services/tarefa.service.ts a lê de verdade, explicitamente, com
 * `omit: { respostaCorreta: false }` na única query que precisa conferir a
 * resposta enviada.
 */
const prisma = new PrismaClient({
  omit: {
    tarefa: { respostaCorreta: true },
  },
});

export default prisma;
