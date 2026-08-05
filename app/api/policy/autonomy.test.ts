/**
 * F9 — autonomy ceiling enforcement. Effective autonomy = min(requested,
 * tenant ceiling for the action's risk class); above-ceiling without an
 * approval forces human approval (fail closed); at-ceiling passes.
 */
import { describe, expect, it } from "vitest";
import { MemoryStore } from "../store/memory";
import { effectiveAutonomyCeiling, evaluateAction, type ActionInput, type EvalContext } from "./engine";

const NOW = new Date("2026-06-10T14:00:00Z");

function makeStore(ceiling = "A2") {
  const store = new MemoryStore();
  store.addTenant({
    id: 1, name: "Harbourline", province: "ON", timezone: "America/Toronto",
    brokeragePolicyVersion: "2.3", autonomyCeiling: ceiling, policyPackVersion: "2026.1",
  });
  store.addMembership({ tenantId: 1, userId: 10, role: "team_member" });
  return store;
}

const ctx: EvalContext = { tenantId: 1, actorId: 10, now: NOW, brokeragePolicyVersion: "2.3" };

function launch(level: ActionInput["autonomyLevel"], approvalId?: number): ActionInput {
  return {
    kind: "campaign.launch",
    payload: { campaignId: 1 },
    destination: "comms:mock",
    idempotencyKey: `campaign_launch_f9_${level}_${approvalId ?? "none"}`,
    requiresApproval: true,
    approvalId,
    autonomyLevel: level,
  };
}

describe("F9 autonomy ceiling", () => {
  it("effective ceiling: A1 for high-risk, tenant ceiling otherwise", () => {
    expect(effectiveAutonomyCeiling("A2", "high")).toBe("A1");
    expect(effectiveAutonomyCeiling("A2", "regulated")).toBe("A1");
    expect(effectiveAutonomyCeiling("A2", "medium")).toBe("A2");
    expect(effectiveAutonomyCeiling("A4", "high")).toBe("A1");
    expect(effectiveAutonomyCeiling("A0", "low")).toBe("A0");
  });

  it("above-ceiling high-risk action without approval → forced human approval (escalate)", async () => {
    const store = makeStore("A2");
    const d = await evaluateAction(store, ctx, launch("A3"));
    expect(d.verdict).toBe("escalate");
    const check = d.checks.find((c) => c.check === "autonomy_ceiling");
    expect(check?.ok).toBe(false);
    expect(check?.verdict).toBe("escalate");
  });

  it("high-risk action above the A1 class cap is escalated even at tenant ceiling A2", async () => {
    const store = makeStore("A2");
    const d = await evaluateAction(store, ctx, launch("A2"));
    const check = d.checks.find((c) => c.check === "autonomy_ceiling");
    expect(check?.ok).toBe(false);
    expect(check?.message).toContain("A1");
  });

  it("at-ceiling request passes the ceiling check", async () => {
    const store = makeStore("A2");
    const d = await evaluateAction(store, ctx, launch("A1"));
    const check = d.checks.find((c) => c.check === "autonomy_ceiling");
    expect(check?.ok).toBe(true);
  });

  it("above-ceiling with a referenced approval proceeds only under human approval", async () => {
    const store = makeStore("A2");
    store.addApproval({
      id: 77, tenantId: 1, kind: "campaign.launch", title: "t",
      payload: { campaignId: 1 },
      payloadHash: "sha256:8a9a0b24f15340e2205a9c7e0bdcd0d6e2a7d1a3d5a9f0f0f0f0f0f0f0f0f0f0",
      destination: "comms:mock", status: "approved",
      decidedAt: NOW, expiresAt: new Date(NOW.getTime() + 86400000),
      autonomyLevel: "A3", requestedBy: "u", createdAt: NOW,
    });
    // Recompute the real canonical hash for the payload so binding passes.
    const { actionPayloadHash } = await import("./actionHash");
    const a = (await store.getApproval(1, 77))!;
    a.payloadHash = actionPayloadHash({ kind: "campaign.launch", payload: { campaignId: 1 }, destination: "comms:mock" });
    const d = await evaluateAction(store, ctx, launch("A3", 77));
    expect(d.checks.find((c) => c.check === "autonomy_ceiling")?.ok).toBe(true);
    expect(d.verdict).toBe("allow");
  });

  it("no asserted autonomy level → check not applicable", async () => {
    const store = makeStore("A2");
    const action = launch(undefined);
    const d = await evaluateAction(store, ctx, action);
    expect(d.checks.find((c) => c.check === "autonomy_ceiling")?.message).toMatch(/n\/a/);
  });
});
