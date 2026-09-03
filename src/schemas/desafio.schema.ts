import { z } from "zod";

/**
 * RN10/RN13 — contrato do desafio adaptativo gerado pela IA. Validado
 * estruturalmente antes de persistir (ver ia.service / desafio.service).
 * O `Desafio` só guarda `conteudo`; a IA devolve título + corpo e o service
 * junta os dois num texto só.
 */
export const desafioGeradoSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  conteudo: z.string().trim().min(20).max(4000),
});

export type DesafioGerado = z.infer<typeof desafioGeradoSchema>;
