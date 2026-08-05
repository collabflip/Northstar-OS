import { describe, expect, it } from "vitest";
import { MemoryStore } from "./store/memory";
import { appendAudit, payloadHash, verifyAuditChain, GENESIS_HASH } from "./audit";

describe("audit hash chain", () => {
  it("chains entries genesis→n and verifies", async () => {
    const store = new MemoryStore();
    const a = await appendAudit(store, { tenantId: 1, actorId: 1, action: "a", subjectType: "x", subjectId: 1, payload: { one: 1 } });
    expect(a.prevHash).toBe(GENESIS_HASH);
    expect(a.seq).toBe(1);
    const b = await appendAudit(store, { tenantId: 1, actorId: 1, action: "b", subjectType: "x", subjectId: 2, payload: { two: 2 } });
    expect(b.prevHash).toBe(a.hash);
    const c = await appendAudit(store, { tenantId: 1, actorId: 2, action: "c", subjectType: "y", subjectId: 3, payload: [3] });
    const rows = await store.listAudit(1);
    expect(rows).toHaveLength(3);
    expect(verifyAuditChain(rows).ok).toBe(true);
    expect(c.hash).toMatch(/^sha256:/);
  });

  it("detects tampering (payload edit and hash edit)", async () => {
    const store = new MemoryStore();
    await appendAudit(store, { tenantId: 1, action: "a", subjectType: "x", subjectId: 1, payload: { v: 1 } });
    await appendAudit(store, { tenantId: 1, action: "b", subjectType: "x", subjectId: 2, payload: { v: 2 } });
    const rows = await store.listAudit(1);
    const tampered = rows.map((r, i) => (i === 0 ? { ...r, action: "FORGED" } : r));
    const v1 = verifyAuditChain(tampered);
    expect(v1.ok).toBe(false);
    expect(v1.brokenAtSeq).toBe(1);
    const relinked = rows.map((r, i) => (i === 1 ? { ...r, prevHash: "sha256:evil" } : r));
    expect(verifyAuditChain(relinked).ok).toBe(false);
  });

  it("payloadHash is deterministic and order-independent", () => {
    expect(payloadHash({ b: 2, a: 1 })).toBe(payloadHash({ a: 1, b: 2 }));
    expect(payloadHash({ a: 1 })).not.toBe(payloadHash({ a: 2 }));
  });

  it("chains are tenant-isolated", async () => {
    const store = new MemoryStore();
    await appendAudit(store, { tenantId: 1, action: "a", subjectType: "x", subjectId: 1, payload: {} });
    await appendAudit(store, { tenantId: 2, action: "a", subjectType: "x", subjectId: 1, payload: {} });
    const t1 = await store.listAudit(1);
    const t2 = await store.listAudit(2);
    expect(t1).toHaveLength(1);
    expect(t2).toHaveLength(1);
    expect(t1[0].hash).not.toBe(t2[0].hash); // different tenantId in the preimage
    expect(verifyAuditChain(t1).ok && verifyAuditChain(t2).ok).toBe(true);
  });
});
