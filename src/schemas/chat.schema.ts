import { z } from "zod";

/**
 * POST /api/rotinas/chat (RF03, RF12, RN10, RN15).
 *
 * O backend não guarda histórico de conversa: o frontend envia toda a troca de
 * mensagens a cada requisição. `role` só aceita "user" e "assistant" — o system
 * prompt é montado no backend (ver ia.service) e nunca vem do cliente.
 * Limites de tamanho evitam abuso e estouro de tokens antes de gastar a chamada.
 */
export const chatSchema = z.object({
  mensagens: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1, "content não pode ser vazio").max(2000),
      })
    )
    .min(1, "envie ao menos uma mensagem")
    .max(40, "conversa longa demais")
    .refine((msgs) => msgs[msgs.length - 1]?.role === "user", {
      message: "a última mensagem deve ser do usuário",
    }),
});

export type ChatInput = z.infer<typeof chatSchema>;
export type ChatMensagem = ChatInput["mensagens"][number];

/**
 * RN10 — contrato do que a IA deve devolver (JSON). Validado estruturalmente
 * antes de persistir/exibir qualquer coisa. Campos opcionais aceitam string,
 * null ou ausência; a rotina precisa ter ao menos 1 tarefa (RN03).
 */
const campoOpcional = z.string().trim().min(1).nullish();

export const rotinaGeradaSchema = z.object({
  tema: z.string().trim().min(1),
  descricao: campoOpcional,
  nivelConhecimento: campoOpcional,
  tempoDisponivel: campoOpcional,
  frequencia: campoOpcional,
  tarefas: z
    .array(
      z.object({
        titulo: z.string().trim().min(1),
        descricao: campoOpcional,
      })
    )
    .min(1, "a rotina precisa ter ao menos uma tarefa")
    .max(50, "rotina com tarefas demais"),
});

export const respostaIASchema = z.discriminatedUnion("tipo", [
  z.object({ tipo: z.literal("pergunta"), mensagem: z.string().trim().min(1) }),
  z.object({ tipo: z.literal("rotina"), rotina: rotinaGeradaSchema }),
]);

export type RotinaGerada = z.infer<typeof rotinaGeradaSchema>;
export type RespostaIA = z.infer<typeof respostaIASchema>;
