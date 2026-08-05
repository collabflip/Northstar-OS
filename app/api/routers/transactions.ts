import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createRouter, authedQuery } from "../middleware";
import { scoped, requireFintracOfficer } from "../scoped";
import { appendAudit } from "../audit";
import { getStore } from "../store/drizzle";
import { isFintracTaskKind, redactFintracTasks } from "../lib/fintrac";
import { TransactionCoordinator } from "../agents";

export const transactionsRouter = createRouter({
  list: authedQuery.query(async ({ ctx }) => {
    const scope = await scoped(ctx);
    return getDb().select().from(s.transactions).where(eq(s.transactions.tenantId, scope.tenantId)).orderBy(desc(s.transactions.id));
  }),

  byId: authedQuery.input(z.object({ id: z.number() })).query(async ({ ctx, input }) => {
    const scope = await scoped(ctx);
    const db = getDb();
    const [txn] = await db.select().from(s.transactions).where(
      and(eq(s.transactions.tenantId, scope.tenantId), eq(s.transactions.id, input.id)),
    );
    if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });
    const rawTasks = await db.select().from(s.transactionTasks).where(eq(s.transactionTasks.transactionId, txn.id)).orderBy(asc(s.transactionTasks.dueAt));
    // F3: FINTRAC-flagged task details are visible only to the fintrac_officer.
    const tasks = redactFintracTasks(scope.role, rawTasks);
    const wfRows = await db.select().from(s.workflows).where(
      and(eq(s.workflows.tenantId, scope.tenantId), eq(s.workflows.kind, "transaction_coordination"), eq(s.workflows.subjectId, txn.id)),
    ).orderBy(desc(s.workflows.id)).limit(1);
    const health = TransactionCoordinator.run({
      tasks: tasks.map((t) => ({ kind: t.kind, title: t.title, dueAt: t.dueAt, status: t.status })),
      docs: [],
    });
    return {
      transaction: txn,
      tasks,
      health: health.result,
      workflow: wfRows[0] ? { id: wfRows[0].id, status: wfRows[0].status, currentStep: wfRows[0].currentStep, version: wfRows[0].version } : null,
    };
  }),

  completeTask: authedQuery
    .input(z.object({ taskId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const scope = await scoped(ctx);
      const db = getDb();
      const [task] = await db.select().from(s.transactionTasks).where(
        and(eq(s.transactionTasks.tenantId, scope.tenantId), eq(s.transactionTasks.id, input.taskId)),
      );
      if (!task) throw new TRPCError({ code: "NOT_FOUND", message: "Task not found" });
      // SEC-3/COMP-5 (FIN-07 write side): fintrac_* tasks may only be closed
      // by the fintrac_officer. The attempt is audited BEFORE authorization,
      // mirroring compliance.fintracQueue (anti-tipping-off evidence trail).
      if (isFintracTaskKind(task.kind)) {
        await appendAudit(getStore(), {
          tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
          action: "transaction.complete_fintrac_task_attempt", subjectType: "transaction_task",
          subjectId: input.taskId, payload: { granted: scope.role === "fintrac_officer" },
        });
        requireFintracOfficer(scope);
      }
      await db.update(s.transactionTasks).set({ status: "done", completedAt: new Date() }).where(
        and(eq(s.transactionTasks.tenantId, scope.tenantId), eq(s.transactionTasks.id, input.taskId)),
      );
      await appendAudit(getStore(), {
        tenantId: scope.tenantId, actorId: scope.userId, actorRole: scope.role,
        action: "transaction.complete_task", subjectType: "transaction_task", subjectId: input.taskId, payload: {},
      });
      return { ok: true };
    }),
});
