import { z } from "zod";

/** POST /api/rotinas/:id/tarefas (RF07). */
export const criarTarefaSchema = z.object({
  titulo: z.string().trim().min(1, "titulo é obrigatório"),
  descricao: z.string().trim().nullable().optional(),
});

export type CriarTarefaInput = z.infer<typeof criarTarefaSchema>;

/**
 * PUT /api/tarefas/:id (RF07). `concluida`, `dataConclusao` e `xpConcedido` não
 * são editáveis por aqui — só via PATCH /api/tarefas/:id/concluir (RN09).
 */
export const atualizarTarefaSchema = z
  .object({
    titulo: z.string().trim().min(1, "titulo não pode ser vazio").optional(),
    descricao: z.string().trim().nullable().optional(),
  })
  .strict()
  .refine((dados) => Object.keys(dados).length > 0, {
    message: "Envie ao menos um campo para atualizar",
  });

export type AtualizarTarefaInput = z.infer<typeof atualizarTarefaSchema>;

/**
 * PATCH /api/tarefas/:id/concluir — valida o formato de `respostaSelecionada`
 * quando enviado. Não usa `validateBody` (o corpo inteiro é opcional: tarefas
 * sem pergunta concluem sem corpo nenhum) — é parseado direto no service, que
 * também decide se a resposta é obrigatória para aquela tarefa específica.
 */
export const respostaSelecionadaSchema = z.number().int().min(0);
