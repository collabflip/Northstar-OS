import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { MockCommsProvider } from "../integrations/mockComms";
import { handleWebhook, resumeWorkflow, startWorkflow } from "./runner";
import { drainOutbox } from "./drainer";
import { sellerJourneyWorkflow, transactionCoordinationWorkflow } from "./definitions";

const NOW = new Date("2026-06-10T14:00:00Z");

function makeStore() {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: "A2", policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  store.addContact({
    id: 100, tenantId: 1, firstName: "N", lastName: "P", language: "en",
    kind: "seller", isSrp: false, onInternalDnc: false, onDncl: false, stage: "qualified",
  });
  store.addConsent({
    id: 1, tenantId: 1, contactId: 100, channel: "email", basis: "express",
    evidenceText: "form", source: "web", purpose: "transaction",
    capturedAt: NOW, status: "active",
  });
  return store;
}

describe("durable workflow runner", () => {
  it("seller journey runs to waiting state; effects enqueued only via outbox", async () => {
    const store = makeStore();
    const { workflowId, stepsRun, effectsEnqueued } = await startWorkflow(
      store, sellerJourneyWorkflow,
      { tenantId: 1, subjectId: 100, input: { contactId: 100, initiatedBy: 10 } },
    );
    expect(stepsRun).toContain("book_consultation");
    expect(effectsEnqueued).toBe(1); // consultation email only (campaign waits for approval)
    const wf = await store.getWorkflow(1, workflowId);
    expect(wf?.status).toBe("waiting");
    expect(wf?.currentStep).toBe("await_approval");
    const events = await store.listWorkflowEvents(1, workflowId);
    expect(events[0].type).toBe("workflow_started");
    expect(events.every((e, i) => e.seq === i + 1)).toBe(true);
  });

  it("drainer sends allowed effects through the commit-time gate (mock)", async () => {
    const store = makeStore();
    await startWorkflow(store, sellerJourneyWorkflow, {
      tenantId: 1, subjectId: 100, input: { contactId: 100, initiatedBy: 10 },
    });
    const comms = new MockCommsProvider();
    const res = await drainOutbox(store, comms, { now: NOW, actorId: 10 });
    expect(res.sent).toBe(1);
    expect(comms.sentLog).toHaveLength(1);
    expect(comms.sentLog[0].idempotencyKey).toMatch(/^wf_\d+_book_consultation_0$/);
    const decisions = await store.listPolicyDecisions(1);
    expect(decisions.length).toBe(1);
    expect(decisions[0].verdict).toBe("allow");
    const row = await store.getOutboxByKey(1, "cem.send", comms.sentLog[0].idempotencyKey);
    expect(row?.status).toBe("sent");
    expect(row?.policyDecisionId).toBe(decisions[0].id);
  });

  it("restart-resume: replay + continue with ZERO duplicate sends", async () => {
    const store = makeStore();
    const { workflowId } = await startWorkflow(store, sellerJourneyWorkflow, {
      tenantId: 1, subjectId: 100, input: { contactId: 100, initiatedBy: 10 },
    });
    const comms = new MockCommsProvider();
    await drainOutbox(store, comms, { now: NOW, actorId: 10 });
    const sendsBefore = comms.sentLog.length;
    // "crash" + restart: resume replays events and re-enqueues (dedupe)
    const resumed = await resumeWorkflow(store, sellerJourneyWorkflow, workflowId, 1);
    expect(resumed.effectsEnqueued).toBe(0);
    const res2 = await drainOutbox(store, comms, { now: NOW, actorId: 10 });
    expect(res2.sent).toBe(0);
    expect(comms.sentLog.length).toBe(sendsBefore); // zero duplicates
  });

  it("DB-6: webhook resumes a workflow whose cached status is stale after a crash", async () => {
    const store = makeStore();
    const { workflowId } = await startWorkflow(store, sellerJourneyWorkflow, {
      tenantId: 1, subjectId: 100, input: { contactId: 100, initiatedBy: 10 },
    });
    // Simulate the crash window: the step_completed(waitFor=approval_granted)
    // event is durably appended, but the workflows.status cache update never
    // landed — the row still reads "running".
    await store.updateWorkflow(1, workflowId, { status: "running" });
    const wf = await store.getWorkflow(1, workflowId);
    expect(wf?.status).toBe("running"); // stale cache — old code read THIS
    const r = await handleWebhook(store, sellerJourneyWorkflow, workflowId, 1, {
      eventType: "approval_granted", payload: { approvalId: 1 }, dedupeKey: "wh_crash_1",
    });
    // Replayed event log says "waiting" → the workflow resumes and completes.
    expect(r.resumed).toBe(true);
    expect(r.stepsRun).toContain("await_approval");
    const after = await store.getWorkflow(1, workflowId);
    expect(after?.status).toBe("completed");
  });

  it("duplicate webhook delivery is deduped (acknowledged, never reprocessed)", async () => {
    const store = makeStore();
    const { workflowId } = await startWorkflow(store, sellerJourneyWorkflow, {
      tenantId: 1, subjectId: 100, input: { contactId: 100, initiatedBy: 10 },
    });
    const evt = { eventType: "approval_granted", payload: { approvalId: 1 }, dedupeKey: "wh_abc123" };
    const first = await handleWebhook(store, sellerJourneyWorkflow, workflowId, 1, evt);
    expect(first.duplicate).toBe(false);
    expect(first.resumed).toBe(true);
    const eventsAfterFirst = (await store.listWorkflowEvents(1, workflowId)).length;
    const second = await handleWebhook(store, sellerJourneyWorkflow, workflowId, 1, evt);
    expect(second.duplicate).toBe(true);
    const eventsAfterSecond = (await store.listWorkflowEvents(1, workflowId)).length;
    expect(eventsAfterSecond).toBe(eventsAfterFirst);
    const wf = await store.getWorkflow(1, workflowId);
    expect(wf?.status).toBe("completed"); // approval resumed it through draft_campaign
  });

  it("outbox idempotency: same key never creates two rows", async () => {
    const store = makeStore();
    const a = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "k_same_key_1", action: "cem.send", payload: {} });
    const b = await store.enqueueOutbox({ tenantId: 1, idempotencyKey: "k_same_key_1", action: "cem.send", payload: {} });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(a.id).toBe(b.id);
  });

  it("transaction workflow waits for conditions_fulfilled then completes lawyer handoff", async () => {
    const store = makeStore();
    const { workflowId } = await startWorkflow(store, transactionCoordinationWorkflow, {
      tenantId: 1, subjectId: 55, input: { sellerContactId: 100, initiatedBy: 10 },
    });
    let wf = await store.getWorkflow(1, workflowId);
    expect(wf?.status).toBe("waiting");
    const r = await handleWebhook(store, transactionCoordinationWorkflow, workflowId, 1, {
      eventType: "conditions_fulfilled", payload: { financing: "waived" }, dedupeKey: "wh_cond_1",
    });
    expect(r.resumed).toBe(true);
    wf = await store.getWorkflow(1, workflowId);
    expect(wf?.status).toBe("completed");
    const comms = new MockCommsProvider();
    const drained = await drainOutbox(store, comms, { now: NOW, actorId: 10 });
    expect(drained.sent).toBe(2); // condition reminder + lawyer package
    expect(drained.blocked).toBe(0);
  });

  it("gate still blocks at drain time when actor authority disappears (fail closed mid-flight)", async () => {
    const store = makeStore();
    await startWorkflow(store, sellerJourneyWorkflow, {
      tenantId: 1, subjectId: 100, input: { contactId: 100, initiatedBy: 10 },
    });
    store.memberships.length = 0; // authority revoked AFTER enqueue — gate runs fresh at drain
    const comms = new MockCommsProvider();
    const res = await drainOutbox(store, comms, { now: NOW, actorId: 10 });
    expect(res.sent).toBe(0);
    expect(comms.sentLog).toHaveLength(0);
    expect(res.blocked + res.escalated).toBeGreaterThan(0);
  });
});
