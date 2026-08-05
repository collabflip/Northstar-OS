import { payloadHash } from "../audit";

/**
 * F5 — THE canonical action-payload hash.
 *
 * One function, three call sites: the commit-time policy gate, approval-row
 * creation, and the workflow drainer. Any action that may require human
 * approval must be hashed through here so a decided approval always binds to
 * the exact payload that was escalated — never a differently-shaped re-hash.
 */
export interface CanonicalActionRef {
  /** Action type, e.g. "campaign.launch". */
  kind: string;
  /** The exact action payload object (stable-stringified for hashing). */
  payload: unknown;
  /** The exact destination the side effect will go to. */
  destination: string;
}

export function actionPayloadHash(action: CanonicalActionRef): string {
  // SEC-7: the canonical hash binds the FULL action identity — kind, payload,
  // and destination — not the payload alone. An approval for
  // {kind:"campaign.launch", P, D} must never authorize {kind:"fintrac.review", P, D}.
  return payloadHash({
    kind: action.kind,
    payload: action.payload,
    destination: action.destination,
  });
}

/**
 * An approval binds an action iff the canonical (kind, payload, destination)
 * hash AND destination match exactly. Because the hash itself now covers the
 * action kind (SEC-7), cross-kind confusion fails the hash comparison.
 */
export function approvalBindsAction(
  approval: { payloadHash: string; destination: string },
  action: CanonicalActionRef,
): boolean {
  return (
    approval.payloadHash === actionPayloadHash(action) &&
    approval.destination === action.destination
  );
}
