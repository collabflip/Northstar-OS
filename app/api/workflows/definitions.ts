import type { WorkflowDefinition, WorkflowState } from "./types";

/**
 * Seller journey: lead → qualify → book consultation → dossier → strategy →
 * approval (human gate) → campaign draft. Every outward side effect is an
 * outbox intent; the approval step waits for an external "approval_granted"
 * webhook before proceeding.
 */
export const sellerJourneyWorkflow: WorkflowDefinition = {
  kind: "seller_journey",
  initialStep: "intake",
  // SEC-10: the only external event this workflow may ever wait for.
  waitEventTypes: ["approval_granted"],
  steps: {
    intake: (s) => ({
      state: { ...s, stage: "qualified_lead" },
      effects: [],
      next: "qualify",
    }),
    qualify: (s) => ({
      state: { ...s, stage: "qualified" },
      effects: [],
      next: "book_consultation",
    }),
    book_consultation: (s) => ({
      state: { ...s, stage: "consultation_booked" },
      effects: [
        {
          action: "cem.send",
          actorId: s.input?.initiatedBy as number | undefined,
          destination: "comms:email:mock",
          channel: "email",
          contactId: s.input?.contactId as number | undefined,
          purpose: "transaction",
          text: "Your consultation is booked. We look forward to meeting you.",
          payload: { kind: "consultation_confirmation", input: s.input },
        },
      ],
      next: "build_dossier",
    }),
    build_dossier: (s) => ({
      state: { ...s, stage: "dossier_ready" },
      effects: [],
      next: "propose_strategy",
    }),
    propose_strategy: (s) => ({
      state: { ...s, stage: "strategy_proposed" },
      effects: [],
      next: "await_approval",
    }),
    await_approval: (s: WorkflowState) => {
      const granted = s.lastEvent?.type === "approval_granted";
      if (!granted) {
        return { state: s, effects: [], next: "draft_campaign", waitFor: "approval_granted" };
      }
      return { state: { ...s, stage: "approved", approval: s.lastEvent?.payload }, effects: [], next: "draft_campaign" };
    },
    draft_campaign: (s) => ({
      state: { ...s, stage: "campaign_drafted" },
      effects: [
        {
          action: "campaign.launch",
          actorId: s.input?.initiatedBy as number | undefined,
          destination: "comms:mock",
          requiresApproval: true,
          payload: { kind: "campaign_draft", stage: "campaign_drafted", input: s.input },
        },
      ],
      next: null,
    }),
  },
};

/**
 * Transaction coordination: conditions, deadlines, docs, reminders, lawyer
 * handoff, closing checklist. Waits for "conditions_fulfilled" before firming.
 */
export const transactionCoordinationWorkflow: WorkflowDefinition = {
  kind: "transaction_coordination",
  initialStep: "opened",
  // SEC-10: the only external event this workflow may ever wait for.
  waitEventTypes: ["conditions_fulfilled"],
  steps: {
    opened: (s) => ({
      state: { ...s, phase: "conditional" },
      effects: [],
      next: "deposit",
    }),
    deposit: (s) => ({
      state: { ...s, depositRecorded: true },
      effects: [],
      next: "conditions",
    }),
    conditions: (s) => ({
      state: { ...s, remindersScheduled: true },
      effects: [
        {
          action: "transaction.update_send",
          actorId: s.input?.initiatedBy as number | undefined,
          destination: "comms:email:mock",
          channel: "email",
          contactId: s.input?.sellerContactId as number | undefined,
          purpose: "transaction",
          text: "Status update: conditions are being tracked; next deadline approaching.",
          payload: { kind: "condition_reminder", input: s.input },
        },
      ],
      next: "await_fulfilment",
    }),
    await_fulfilment: (s: WorkflowState) => {
      const fulfilled = s.lastEvent?.type === "conditions_fulfilled";
      if (!fulfilled) {
        return { state: s, effects: [], next: "firm", waitFor: "conditions_fulfilled" };
      }
      return { state: { ...s, phase: "firm" }, effects: [], next: "firm" };
    },
    firm: (s) => ({
      state: { ...s, firmAt: "recorded" },
      effects: [],
      next: "lawyer_handoff",
    }),
    lawyer_handoff: (s) => ({
      state: { ...s, lawyerPackageSent: true },
      effects: [
        {
          action: "transaction.update_send",
          actorId: s.input?.initiatedBy as number | undefined,
          destination: "comms:email:mock",
          channel: "email",
          purpose: "transaction",
          text: "Executed APS + amendments package for lawyer review.",
          payload: { kind: "lawyer_package", input: s.input },
        },
      ],
      next: "closing_checklist",
    }),
    closing_checklist: (s) => ({
      state: { ...s, closingChecklistReady: true },
      effects: [],
      next: null,
    }),
  },
};

export const WORKFLOW_DEFINITIONS = {
  [sellerJourneyWorkflow.kind]: sellerJourneyWorkflow,
  [transactionCoordinationWorkflow.kind]: transactionCoordinationWorkflow,
} as const;
