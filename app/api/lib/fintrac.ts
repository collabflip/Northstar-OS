/**
 * F3 — FINTRAC anti-tipping-off redaction (central chokepoint).
 *
 * ONLY the `fintrac_officer` role may see FINTRAC-related details. Everyone
 * else — including broker_of_record and admin — gets redacted/absent data,
 * because revealing that a FINTRAC review/STR exists can tip off a client
 * under review (PCMLTFA anti-tipping-off).
 */

export const FINTRAC_OFFICER_ROLE = "fintrac_officer";
export const FINTRAC_TASK_PREFIX = "fintrac_";
export const FINTRAC_AUDIT_SUBJECT_TYPE = "fintrac_queue";
export const FINTRAC_VIEW_ATTEMPT_ACTION = "compliance.fintrac_queue_view_attempt";

/** True only for the FINTRAC officer — no exceptions for BOR/admin. */
export function canSeeFintrac(role: string): boolean {
  return role === FINTRAC_OFFICER_ROLE;
}

export function isFintracTaskKind(kind: string): boolean {
  return kind.startsWith(FINTRAC_TASK_PREFIX);
}

export function isFintracAuditEntry(action: string, subjectType: string): boolean {
  return subjectType === FINTRAC_AUDIT_SUBJECT_TYPE || action.toLowerCase().includes("fintrac");
}

/** Drop FINTRAC-flagged transaction tasks unless the caller is the officer. */
export function redactFintracTasks<T extends { kind: string }>(role: string, tasks: T[]): T[] {
  if (canSeeFintrac(role)) return tasks;
  return tasks.filter((t) => !isFintracTaskKind(t.kind));
}

/** Drop FINTRAC-related audit entries (e.g. queue view attempts) for non-officers. */
export function redactFintracAudit<T extends { action: string; subjectType: string }>(
  role: string,
  rows: T[],
): T[] {
  if (canSeeFintrac(role)) return rows;
  return rows.filter((r) => !isFintracAuditEntry(r.action, r.subjectType));
}
