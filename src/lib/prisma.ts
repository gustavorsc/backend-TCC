import { PrismaClient } from "@prisma/client";

/**
 * Instância única do PrismaClient, reutilizada em toda a aplicação.
 * Evita esgotar o pool de conexões do Supabase (Transaction Pooler)
 * criando múltiplas instâncias em hot-reload/dev.
 */
const prisma = new PrismaClient();

export default prisma;
