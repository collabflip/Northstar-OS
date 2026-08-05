/**
 * RED-TEAM: SEC-10 — workflows.webhook is an unauthenticated-by-design
 * (any-member) tRPC mutation with NO signature, NO eventType allowlist, and
 * NO check that the event matches what the workflow is waiting for.
 * A plain team_member can forge "approval_granted" and walk a seller_journey
 * workflow past its human-approval wait state.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import * as s from "@db/schema";
import { getDb } from "../queries/connection";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";
import { workflowsRouter } from "../routers/workflows";
import { startWorkflow } from "../workflows/runner";
import { WORKFLOW_DEFINITIONS } from "../workflows/definitions";
import { getStore } from "../store/drizzle";

let fx: TwoTenantFixture;
let workflowId: number;

beforeAll(async () => {
  fx = await createTwoTenantFixture("webhook");
  const contactId = await fx.insert(s.contacts, {
    tenantId: fx.tenantA, firstName: "W", lastName: "H", kind: "seller",
  });
  const started = await startWorkflow(getStore(), WORKFLOW_DEFINITIONS.seller_journey, {
    tenantId: fx.tenantA, input: { initiatedBy: fx.userA.id, contactId },
  });
  workflowId = started.workflowId;
});

afterAll(async () => {
  const db = getDb();
  await db.delete(s.workflowEvents).where(eq(s.workflowEvents.tenantId, fx.tenantA));
  for (const t of [s.outbox, s.policyDecisions, s.auditLog] as const) {
    await db.delete(t).where(eq(t.tenantId, fx.tenantA));
    await db.delete(t).where(eq(t.tenantId, fx.tenantB));
  }
  await fx?.cleanup();
});

const A = () => ctxFor(fx.userA, fx.tenantA);

describe("SEC-10 — forged approval_granted webhook advances the workflow", () => {
  it("workflow is parked at the human-approval wait state", async () => {
    const [wf] = await getDb().select().from(s.workflows).where(eq(s.workflows.id, workflowId));
    expect(wf.status).toBe("waiting");
    expect(wf.currentStep).toBe("await_approval");
  });

  it("regression: team_member forging approval_granted → FORBIDDEN (role gate), workflow unmoved", async () => {
    await expect(workflowsRouter.createCaller(A()).webhook({
      id: workflowId,
      eventType: "approval_granted",
      payload: { approvedBy: "totally-not-a-broker" },
      dedupeKey: "forged-approval-1",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    const [wf] = await getDb().select().from(s.workflows).where(eq(s.workflows.id, workflowId));
    expect(wf.status).toBe("waiting"); // still parked at the human-approval wait
    const state = wf.state as { approval?: unknown };
    expect(state?.approval).toBeUndefined(); // no forged payload recorded
  });

  it("regression: no dedupe oracle for unauthorized callers — repeat is also FORBIDDEN", async () => {
    await expect(workflowsRouter.createCaller(A()).webhook({
      id: workflowId, eventType: "approval_granted", payload: {}, dedupeKey: "forged-approval-1",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("regression: a fresh dedupeKey no longer helps an unauthorized caller inject events", async () => {
    await expect(workflowsRouter.createCaller(A()).webhook({
      id: workflowId, eventType: "conditions_fulfilled", payload: { forged: true }, dedupeKey: "forged-2",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
