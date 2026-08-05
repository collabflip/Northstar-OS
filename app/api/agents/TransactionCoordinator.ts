import { z } from "zod";
import { agentResult, type AgentDef } from "./types";

export const txnResultSchema = z.object({
  conditionsRemaining: z.number(),
  nextDeadline: z.object({ title: z.string(), dueAt: z.string() }).nullable(),
  docsComplete: z.string(),
  exceptions: z.array(z.object({ title: z.string(), reason: z.string() })),
  remindersDue: z.array(z.string()),
});
export type TxnResult = z.infer<typeof txnResultSchema>;
export interface TxnInput {
  tasks: { kind: string; title: string; dueAt?: string | Date | null; status: string }[];
  docs: { name: string; status: string }[];
  now?: Date;
}

export const TransactionCoordinator: AgentDef<TxnInput, TxnResult> = {
  meta: { name: "TransactionCoordinator", promptVersion: "transaction-coordinator@1.0" },
  resultSchema: txnResultSchema,
  run(input) {
    const now = input.now ?? new Date();
    const open = input.tasks.filter((t) => t.status === "pending" || t.status === "in_progress");
    const conditions = open.filter((t) => t.kind === "condition");
    const dated = open.filter((t) => t.dueAt).sort((a, b) => +new Date(a.dueAt!) - +new Date(b.dueAt!));
    const next = dated[0] ?? null;
    const overdue = open.filter((t) => t.dueAt && +new Date(t.dueAt) < +now);
    const docsDone = input.docs.filter((d) => d.status === "received").length;
    const remindersDue = open
      .filter((t) => t.dueAt && +new Date(t.dueAt) - +now <= 48 * 3600 * 1000 && +new Date(t.dueAt) >= +now)
      .map((t) => t.title);
    return agentResult(TransactionCoordinator.meta, {
      conditionsRemaining: conditions.length,
      nextDeadline: next ? { title: next.title, dueAt: new Date(next.dueAt!).toISOString() } : null,
      docsComplete: `${docsDone}/${input.docs.length}`,
      exceptions: overdue.map((t) => ({ title: t.title, reason: `overdue since ${new Date(t.dueAt!).toISOString().slice(0, 10)}` })),
      remindersDue,
    }, {
      confidence: 0.9,
      rationale: `${conditions.length} condition(s) open; next deadline ${next ? next.title : "none"}; ${overdue.length} exception(s).`,
      riskClass: overdue.length ? "high" : "medium",
      autonomyLevel: "A2",
      requiresHumanApproval: overdue.length > 0,
      proposedAction: remindersDue.length
        ? { kind: "transaction.update_send", payload: { reminders: remindersDue }, destination: "comms:mock" }
        : null,
    });
  },
};
