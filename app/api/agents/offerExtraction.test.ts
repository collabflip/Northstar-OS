import { describe, expect, it } from "vitest";
import { OfferExtraction, parseOfferDocument } from "./OfferExtraction";

const DOC = [
  "[p.1 §1.0] AGREEMENT OF PURCHASE AND SALE — DEMO-ON-PROPERTY-001, Toronto",
  "[p.2 §1.3] Purchase Price: $1,225,000",
  "[p.2 §1.4] Deposit: $60,000 — within 24 hours of acceptance",
  "[p.2 §1.5] Completion Date: August 15, 2026",
  "[p.3 §2.1] Irrevocable until: June 11, 2026 21:00",
  "[p.3 §3.0] Conditions: financing (5 business days)",
  "[p.5 §8.2] Escalation clause: exceed any competing bona fide offer by $5,000 to a cap of $1,260,000",
  "[p.6 §9.1] Schedule A deposit: $55,000 payable upon acceptance",
  "[p.6 §9.2] Witness signature: ",
].join("\n");

describe("offer extraction — deterministic parser with citations", () => {
  const terms = parseOfferDocument(DOC);
  const byField = (f: string) => terms.filter((t) => t.field === f);

  it("extracts price with exact page/section citation", () => {
    const price = byField("price")[0];
    expect(price.value).toBe("1,225,000");
    expect(price.sourcePage).toBe(2);
    expect(price.sourceSection).toBe("1.3");
    expect(price.confidence).toBe(95);
  });

  it("extracts conditions, irrevocability, completion date with citations", () => {
    expect(byField("conditions")[0].value).toContain("financing");
    expect(byField("conditions")[0].sourceSection).toBe("3.0");
    expect(byField("irrevocability")[0].sourcePage).toBe(3);
    expect(byField("completionDate")[0].value).toBe("August 15, 2026");
  });

  it("flags deposit contradiction between body and Schedule A", () => {
    const deposits = terms.filter((t) => t.field === "deposit" || t.field === "scheduleADeposit");
    expect(deposits).toHaveLength(2);
    expect(deposits.every((t) => t.flag === "contradiction")).toBe(true);
    expect(deposits[0].flagNote).toMatch(/conflict/);
  });

  it("flags missing witness signature", () => {
    const sig = byField("signatures")[0];
    expect(sig.flag).toBe("missing");
    expect(sig.value).toBeNull();
    expect(sig.sourcePage).toBe(6);
  });

  it("flags escalation clause as unusual", () => {
    const esc = byField("escalationClause")[0];
    expect(esc.flag).toBe("unusual");
    expect(esc.sourceSection).toBe("8.2");
  });

  it("agent wrapper reports fields needing verification + regulated risk", () => {
    const r = OfferExtraction.run({ documentText: DOC });
    expect(r.result.fieldsNeedingVerification).toContain("deposit");
    expect(r.result.fieldsNeedingVerification).toContain("signatures");
    expect(r.result.extractionConfidence).toBeLessThan(95);
    expect(r.riskClass).toBe("regulated");
    expect(r.requiresHumanApproval).toBe(true);
    expect(r.rationale).toContain("never acts on offers");
  });

  it("empty document extracts nothing (truthful, no fabrication)", () => {
    const r = OfferExtraction.run({ documentText: "" });
    expect(r.result.terms).toHaveLength(0);
    expect(r.result.extractionConfidence).toBe(0);
  });
});
