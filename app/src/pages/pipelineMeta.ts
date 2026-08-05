import type { JourneyKey } from '@/lib/i18n/journey';

/* ── Stages (shared pipeline metadata; component-free module) ────────── */

export const STAGES = [
  'new_lead', 'qualified', 'consultation_booked', 'dossier_ready', 'strategy_proposed',
  'approved', 'live_listing', 'offer_review', 'under_contract', 'closed',
] as const;
export type Stage = (typeof STAGES)[number];

export const STAGE_KEY: Record<Stage, JourneyKey> = {
  new_lead: 'stage.new_lead', qualified: 'stage.qualified',
  consultation_booked: 'stage.consultation_booked', dossier_ready: 'stage.dossier_ready',
  strategy_proposed: 'stage.strategy_proposed', approved: 'stage.approved',
  live_listing: 'stage.live_listing', offer_review: 'stage.offer_review',
  under_contract: 'stage.under_contract', closed: 'stage.closed',
};

export const STAGE_TONE: Record<Stage, 'neutral' | 'accent' | 'emerald' | 'amber' | 'red' | 'slate'> = {
  new_lead: 'slate', qualified: 'accent', consultation_booked: 'accent',
  dossier_ready: 'accent', strategy_proposed: 'amber', approved: 'emerald',
  live_listing: 'emerald', offer_review: 'red', under_contract: 'amber', closed: 'neutral',
};

/** Map seeded addresses to manifest photography. */
export function propertyPhoto(address: string | null | undefined): string | null {
  if (!address) return null;
  if (address.includes('DEMO-ON-PROPERTY-001')) return '/property-demo-001-exterior.jpg';
  if (address.includes('DEMO-ON-PROPERTY-002')) return '/property-demo-002.jpg';
  if (address.includes('DEMO-ON-PROPERTY-003')) return '/property-demo-003.jpg';
  return null;
}
