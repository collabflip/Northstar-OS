/**
 * ARCH-6 — conversations.list is batched (one inArray contacts query + one
 * messages query instead of 2N+1 per-conversation lookups). These tests pin
 * the OUTPUT SHAPE and tenant predicates so the batching stays behavior-
 * preserving: contactName/leadScore from the contact, lastMessage = the
 * latest message per conversation, tenant isolation intact.
 *
 * Live-DB fixture (auth scoping resolves against the DB); all rows cleaned up.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import * as s from "@db/schema";
import { conversationsRouter } from "./conversations";
import { createTwoTenantFixture, ctxFor, type TwoTenantFixture } from "../testkit/liveDb";

let fx: TwoTenantFixture;
let convo1Id: number;
let convo2Id: number;
let decoyConvoId: number;

beforeAll(async () => {
  fx = await createTwoTenantFixture("convo");

  const contact1 = await fx.insert(s.contacts, {
    tenantId: fx.tenantA, firstName: "Ada", lastName: "Byron", leadScore: 42,
  });
  const contact2 = await fx.insert(s.contacts, {
    tenantId: fx.tenantA, firstName: "Alan", lastName: "Turing",
  });
  convo1Id = await fx.insert(s.conversations, {
    tenantId: fx.tenantA, contactId: contact1, channel: "email",
    updatedAt: new Date("2026-06-01T10:00:00Z"),
  });
  convo2Id = await fx.insert(s.conversations, {
    tenantId: fx.tenantA, contactId: contact2, channel: "sms",
    updatedAt: new Date("2026-06-02T10:00:00Z"),
  });
  // convo1: two messages — the list must surface the LATEST (higher id)
  await fx.insert(s.messages, {
    tenantId: fx.tenantA, conversationId: convo1Id, direction: "inbound", body: "older message",
  });
  await fx.insert(s.messages, {
    tenantId: fx.tenantA, conversationId: convo1Id, direction: "outbound", body: "latest message",
  });
  await fx.insert(s.messages, {
    tenantId: fx.tenantA, conversationId: convo2Id, direction: "inbound", body: "only message",
  });

  // tenant B decoy — must never leak into tenant A's list
  const decoyContact = await fx.insert(s.contacts, {
    tenantId: fx.tenantB, firstName: "Decoy", lastName: "Stranger",
  });
  decoyConvoId = await fx.insert(s.conversations, {
    tenantId: fx.tenantB, contactId: decoyContact, channel: "email",
    updatedAt: new Date("2026-06-03T10:00:00Z"),
  });
  await fx.insert(s.messages, {
    tenantId: fx.tenantB, conversationId: decoyConvoId, direction: "inbound", body: "decoy message",
  });
});

afterAll(async () => {
  await fx.cleanup();
});

describe("conversations.list (batched, ARCH-6)", () => {
  it("returns conversation + contactName + leadScore + lastMessage per row, newest conversation first", async () => {
    const caller = conversationsRouter.createCaller(ctxFor(fx.userA));
    const rows = await caller.list();

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.conversation.id)).toEqual([convo2Id, convo1Id]);

    expect(rows[0].contactName).toBe("Alan Turing");
    expect(rows[0].leadScore).toBeNull(); // no leadScore set → null
    expect(rows[0].lastMessage?.body).toBe("only message");

    expect(rows[1].contactName).toBe("Ada Byron");
    expect(rows[1].leadScore).toBe(42);
    expect(rows[1].lastMessage?.body).toBe("latest message"); // latest per conversation, not first
  });

  it("tenant isolation: decoy rows from another tenant never appear", async () => {
    const callerA = conversationsRouter.createCaller(ctxFor(fx.userA));
    const rowsA = await callerA.list();
    expect(rowsA.some((r) => r.conversation.id === decoyConvoId)).toBe(false);
    expect(rowsA.every((r) => r.conversation.tenantId === fx.tenantA)).toBe(true);

    const callerB = conversationsRouter.createCaller(ctxFor(fx.userB));
    const rowsB = await callerB.list();
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0].conversation.id).toBe(decoyConvoId);
    expect(rowsB[0].contactName).toBe("Decoy Stranger");
    expect(rowsB[0].lastMessage?.body).toBe("decoy message");
  });

  it("a conversation whose contact is unresolvable in-tenant still lists (Unknown, null)", async () => {
    // contact in tenant B, conversation in tenant A pointing at it — the
    // tenant-scoped contact lookup misses → "Unknown" fallback preserved.
    const stranger = await fx.insert(s.contacts, {
      tenantId: fx.tenantB, firstName: "Cross", lastName: "Tenant",
    });
    const orphanConvo = await fx.insert(s.conversations, {
      tenantId: fx.tenantA, contactId: stranger, channel: "dm",
      updatedAt: new Date("2026-06-04T10:00:00Z"),
    });
    const caller = conversationsRouter.createCaller(ctxFor(fx.userA));
    const rows = await caller.list();
    const orphan = rows.find((r) => r.conversation.id === orphanConvo);
    expect(orphan?.contactName).toBe("Unknown");
    expect(orphan?.leadScore).toBeNull();
    expect(orphan?.lastMessage).toBeNull();
    expect(rows).toHaveLength(3);
  });
});
