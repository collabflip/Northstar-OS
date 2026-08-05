import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

export type Lang = 'en' | 'fr';

const en = {
  // Brand & shell
  'brand.name': 'Northstar SellerOS',
  'tenant.name': 'Harbourline Realty Inc., Brokerage',
  'tenant.short': 'HRL',
  // Nav groups
  'nav.group.operate': 'Operate',
  'nav.group.sell': 'Sell',
  'nav.group.govern': 'Govern',
  // Nav items
  'nav.commandCentre': 'Command Centre',
  'nav.pipeline': 'Pipeline',
  'nav.conversations': 'Conversations',
  'nav.calendar': 'Calendar',
  'nav.sellers': 'Sellers',
  'nav.approvals': 'Approvals',
  'nav.campaigns': 'Campaigns',
  'nav.offers': 'Offers',
  'nav.transactions': 'Transactions',
  'nav.compliance': 'Compliance',
  'nav.audit': 'Audit',
  'nav.settings': 'Settings',
  // Sidebar footer
  'sidebar.autonomyCeiling': 'Autonomy ceiling',
  'sidebar.mockProviders': 'Mock providers',
  'sidebar.connected': 'Connected',
  'sidebar.collapse': 'Collapse sidebar',
  'sidebar.expand': 'Expand sidebar',
  // Top bar
  'topbar.demoData': 'Demo data — Ontario seed',
  'topbar.search': 'Search sellers, properties, approvals…',
  'topbar.notifications': 'Notifications',
  'topbar.autonomyExplainer': 'Autonomy ceiling set by your broker of record. The AI may never exceed it.',
  'topbar.userMenu': 'User menu',
  'topbar.signIn': 'Sign in',
  'topbar.language': 'Language',
  // Autonomy levels
  'autonomy.A0': 'Observe',
  'autonomy.A1': 'Draft',
  'autonomy.A2': 'Reversible execution',
  'autonomy.A3': 'Bounded campaign',
  'autonomy.A4': 'Human-only commit',
  'autonomy.setBy': 'Set by broker of record',
  // Evidence states
  'ev.verified': 'Verified',
  'ev.external': 'Third-party',
  'ev.estimate': 'Estimate',
  'ev.generated': 'Generated',
  'ev.assumption': 'Assumption',
  'ev.missing': 'Missing',
  'ev.conflict': 'Conflict',
  'ev.ai': 'AI recommendation',
  'ev.approved': 'Approved',
  'ev.blocked': 'Blocked',
  // Evidence drawer
  'drawer.title': 'Why this?',
  'drawer.statement': 'Statement',
  'drawer.source': 'Source',
  'drawer.freshness': 'Freshness',
  'drawer.confidence': 'Confidence',
  'drawer.lineage': 'Lineage',
  'drawer.assumptions': 'Assumptions',
  'drawer.conflicts': 'Unresolved conflicts',
  'drawer.policies': 'Related policy rules',
  // Freshness
  'freshness.updated': 'Updated',
  'freshness.stale': 'Stale',
  // Common actions
  'action.approve': 'Approve',
  'action.review': 'Review',
  'action.close': 'Close',
  'action.retry': 'Retry',
  'action.request': 'Request',
  'action.provide': 'Provide',
  'action.requestFromSeller': 'Request from seller',
  'action.newSellerLead': 'New seller lead',
  'action.openConversation': 'Open conversation',
  'action.evidence': 'Evidence',
  // Policy gate
  'policy.title': 'Commit-time policy gate',
  'policy.passed': 'passed',
  // Misc shared
  'misc.notProvided': 'Not yet provided',
  'misc.restricted': 'Restricted',
  'misc.blockedReason': 'Why is this blocked?',
  'misc.viewAudit': 'View in Audit Explorer',
  'misc.empty.caughtUp': 'All caught up — nothing waiting on you.',
  'misc.login': 'Login',
  'misc.portal': 'Seller Portal',
  // Command Centre
  'cc.greeting': 'Good morning, Maya',
  'cc.subline': 'Tuesday, June 10 · Harbourline Realty Inc. · Ontario policy pack v2.3.1',
  'cc.kpi.activeSellers': 'Active seller opportunities',
  'cc.kpi.activeSellersDelta': '+2 this week',
  'cc.kpi.approvals': 'Approvals waiting on you',
  'cc.kpi.approvalsOldest': 'Oldest: 26 h',
  'cc.kpi.leads': 'High-intent leads (72 h)',
  'cc.kpi.leadsSub': 'Scored ≥ 80',
  'cc.kpi.compliance': 'Compliance items',
  'cc.kpi.complianceSub': 'CASL consent expiring',
  'cc.pipelineSnapshot': 'Pipeline snapshot',
  'cc.autonomyStatus': 'Autonomy status',
  'cc.requestChange': 'Request change → Settings',
  'cc.lastGate': 'Last commit-time check: 14/14 passed',
  'cc.needsApproval': 'Needs your approval',
  'cc.highIntentLeads': 'High-intent leads',
  'cc.aiNextActions': 'AI recommended next actions',
  'cc.todaySchedule': 'Today’s schedule',
  'cc.complianceAlerts': 'Compliance alerts',
  'cc.viewAll': 'View all',
  'cc.age': 'age',
  'cc.whyThis': 'Why this?',
  'cc.approveInline': 'Approve — payload-bound review',
  'cc.restrictedFintrac': 'Restricted — compliance officer',
} as const;

export type StringKey = keyof typeof en;

const fr: Record<StringKey, string> = {
  'brand.name': 'Northstar SellerOS',
  'tenant.name': 'Harbourline Realty Inc., maison de courtage',
  'tenant.short': 'HRL',
  'nav.group.operate': 'Opérer',
  'nav.group.sell': 'Vendre',
  'nav.group.govern': 'Gouverner',
  'nav.commandCentre': 'Centre de commandement',
  'nav.pipeline': 'Pipeline',
  'nav.conversations': 'Conversations',
  'nav.calendar': 'Calendrier',
  'nav.sellers': 'Vendeurs',
  'nav.approvals': 'Approbations',
  'nav.campaigns': 'Campagnes',
  'nav.offers': 'Offres d’achat',
  'nav.transactions': 'Transactions',
  'nav.compliance': 'Conformité',
  'nav.audit': 'Journal d’audit',
  'nav.settings': 'Paramètres',
  'sidebar.autonomyCeiling': 'Plafond d’autonomie',
  'sidebar.mockProviders': 'Fournisseurs simulés',
  'sidebar.connected': 'Connecté',
  'sidebar.collapse': 'Réduire la barre latérale',
  'sidebar.expand': 'Agrandir la barre latérale',
  'topbar.demoData': 'Données démo — graine Ontario',
  'topbar.search': 'Rechercher vendeurs, propriétés, approbations…',
  'topbar.notifications': 'Notifications',
  'topbar.autonomyExplainer': 'Plafond d’autonomie défini par votre courtier responsable. L’IA ne peut jamais le dépasser.',
  'topbar.userMenu': 'Menu utilisateur',
  'topbar.signIn': 'Se connecter',
  'topbar.language': 'Langue',
  'autonomy.A0': 'Observation',
  'autonomy.A1': 'Brouillon',
  'autonomy.A2': 'Exécution réversible',
  'autonomy.A3': 'Campagne encadrée',
  'autonomy.A4': 'Validation humaine seulement',
  'autonomy.setBy': 'Défini par le courtier responsable',
  'ev.verified': 'Vérifié',
  'ev.external': 'Tiers',
  'ev.estimate': 'Estimation',
  'ev.generated': 'Généré',
  'ev.assumption': 'Hypothèse',
  'ev.missing': 'Manquant',
  'ev.conflict': 'Conflit',
  'ev.ai': 'Recommandation IA',
  'ev.approved': 'Approuvé',
  'ev.blocked': 'Bloqué',
  'drawer.title': 'Pourquoi ?',
  'drawer.statement': 'Énoncé',
  'drawer.source': 'Source',
  'drawer.freshness': 'Fraîcheur',
  'drawer.confidence': 'Confiance',
  'drawer.lineage': 'Provenance',
  'drawer.assumptions': 'Hypothèses',
  'drawer.conflicts': 'Conflits non résolus',
  'drawer.policies': 'Règles de politique liées',
  'freshness.updated': 'Mis à jour',
  'freshness.stale': 'Périmé',
  'action.approve': 'Approuver',
  'action.review': 'Réviser',
  'action.close': 'Fermer',
  'action.retry': 'Réessayer',
  'action.request': 'Demander',
  'action.provide': 'Fournir',
  'action.requestFromSeller': 'Demander au vendeur',
  'action.newSellerLead': 'Nouveau vendeur potentiel',
  'action.openConversation': 'Ouvrir la conversation',
  'action.evidence': 'Preuves',
  'policy.title': 'Contrôle de politique à la validation',
  'policy.passed': 'réussis',
  'misc.notProvided': 'Pas encore fourni',
  'misc.restricted': 'Accès restreint',
  'misc.blockedReason': 'Pourquoi est-ce bloqué ?',
  'misc.viewAudit': 'Voir dans le journal d’audit',
  'misc.empty.caughtUp': 'Tout est à jour — rien n’attend votre action.',
  'misc.login': 'Connexion',
  'misc.portal': 'Portail vendeur',
  'cc.greeting': 'Bonjour, Maya',
  'cc.subline': 'Mardi 10 juin · Harbourline Realty Inc. · trousse de politiques Ontario v2.3.1',
  'cc.kpi.activeSellers': 'Occasions vendeurs actives',
  'cc.kpi.activeSellersDelta': '+2 cette semaine',
  'cc.kpi.approvals': 'Approbations en attente',
  'cc.kpi.approvalsOldest': 'Plus ancienne : 26 h',
  'cc.kpi.leads': 'Prospects à forte intention (72 h)',
  'cc.kpi.leadsSub': 'Score ≥ 80',
  'cc.kpi.compliance': 'Éléments de conformité',
  'cc.kpi.complianceSub': 'Consentement LCAP expirant',
  'cc.pipelineSnapshot': 'Aperçu du pipeline',
  'cc.autonomyStatus': 'État de l’autonomie',
  'cc.requestChange': 'Demander un changement → Paramètres',
  'cc.lastGate': 'Dernier contrôle à la validation : 14/14 réussis',
  'cc.needsApproval': 'Nécessite votre approbation',
  'cc.highIntentLeads': 'Prospects à forte intention',
  'cc.aiNextActions': 'Prochaines actions recommandées par l’IA',
  'cc.todaySchedule': 'Horaire du jour',
  'cc.complianceAlerts': 'Alertes de conformité',
  'cc.viewAll': 'Tout voir',
  'cc.age': 'âge',
  'cc.whyThis': 'Pourquoi ?',
  'cc.approveInline': 'Approuver — révision liée au contenu',
  'cc.restrictedFintrac': 'Accès restreint — agent de conformité',
};

const catalogs: Record<Lang, Record<StringKey, string>> = { en, fr };

interface I18nCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (key: StringKey) => string;
}

const I18nContext = createContext<I18nCtx>({
  lang: 'en',
  setLang: () => undefined,
  t: (k) => en[k],
});

const STORAGE_KEY = 'northstar.lang';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = typeof window !== 'undefined' ? window.localStorage.getItem(STORAGE_KEY) : null;
    return stored === 'fr' ? 'fr' : 'en';
  });

  const setLang = (l: Lang) => {
    setLangState(l);
    window.localStorage.setItem(STORAGE_KEY, l);
  };

  useEffect(() => {
    document.documentElement.lang = lang === 'fr' ? 'fr-CA' : 'en';
  }, [lang]);

  const t = (key: StringKey) => catalogs[lang][key] ?? en[key];

  return <I18nContext.Provider value={{ lang, setLang, t }}>{children}</I18nContext.Provider>;
}

export function useT() {
  return useContext(I18nContext);
}

/** Format CAD currency per locale: $1,249,000 (en) / 1 249 000 $ (fr-CA) */
export function formatCAD(value: number, lang: Lang): string {
  if (lang === 'fr') {
    const NBSP = '\u00A0';
    return `${value.toLocaleString('fr-CA').replace(/\u202F|,|\u00A0/g, NBSP)}${NBSP}$`;
  }
  return `$${value.toLocaleString('en-CA')}`;
}
