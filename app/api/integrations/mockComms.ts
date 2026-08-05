/**
 * MockCommsProvider — email/SMS sends are recorded locally and labeled MOCK.
 * Sends are ALWAYS enqueued via the outbox and policy-gated by the drainer;
 * this provider only performs the (mock) delivery. Never claims to be live.
 */
export interface MockSend {
  channel: "email" | "sms";
  to: string;
  body: string;
  idempotencyKey: string;
}

export interface MockSendResult {
  status: "mock";
  provider: "mock-comms";
  delivered: false;
  note: string;
  idempotencyKey: string;
}

export class MockCommsProvider {
  readonly name = "mock-comms";
  readonly statusNote =
    "MOCK provider — messages are recorded, never delivered. Not a live email/SMS gateway.";
  sentLog: (MockSend & { sentAt: string })[] = [];

  async send(msg: MockSend): Promise<MockSendResult> {
    this.sentLog.push({ ...msg, sentAt: new Date().toISOString() });
    return {
      status: "mock",
      provider: "mock-comms",
      delivered: false,
      note: "MOCK send recorded — no live message was delivered",
      idempotencyKey: msg.idempotencyKey,
    };
  }
}
