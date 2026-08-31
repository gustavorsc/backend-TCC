import { z } from "zod";

/**
 * Campos editáveis de uma Rotina via PUT /api/rotinas/:id (RF05).
 * `progresso`, `dataCriacao`, `usuarioId` e `tarefas` não são editáveis por aqui:
 * progresso é recalculado automaticamente (RN08) e as demais são geridas por outros fluxos.
 */
export const atualizarRotinaSchema = z
  .object({
    tema: z.string().trim().min(1, "tema não pode ser vazio").optional(),
    descricao: z.string().trim().nullable().optional(),
    nivelConhecimento: z.string().trim().nullable().optional(),
    tempoDisponivel: z.string().trim().nullable().optional(),
    frequencia: z.string().trim().nullable().optional(),
  })
  .strict()
  .refine((dados) => Object.keys(dados).length > 0, {
    message: "Envie ao menos um campo para atualizar",
  });

export type AtualizarRotinaInput = z.infer<typeof atualizarRotinaSchema>;
