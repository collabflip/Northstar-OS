import { authRouter } from "./auth-router";
import { createRouter, publicQuery } from "./middleware";
import { dashboardRouter } from "./routers/dashboard";
import { pipelineRouter } from "./routers/pipeline";
import { contactsRouter } from "./routers/contacts";
import { consentsRouter } from "./routers/consents";
import { propertiesRouter } from "./routers/properties";
import { dossiersRouter } from "./routers/dossiers";
import { valuationsRouter } from "./routers/valuations";
import { strategiesRouter } from "./routers/strategies";
import { approvalsRouter } from "./routers/approvals";
import { campaignsRouter } from "./routers/campaigns";
import { conversationsRouter } from "./routers/conversations";
import { offersRouter } from "./routers/offers";
import { transactionsRouter } from "./routers/transactions";
import { workflowsRouter } from "./routers/workflows";
import { complianceRouter } from "./routers/compliance";
import { auditRouter } from "./routers/audit";
import { policyRouter } from "./routers/policy";
import { settingsRouter } from "./routers/settings";
import { portalRouter } from "./routers/portal";
import { integrationsRouter } from "./routers/integrations";

export const appRouter = createRouter({
  ping: publicQuery.query(() => ({ ok: true, ts: Date.now() })),
  auth: authRouter,
  dashboard: dashboardRouter,
  pipeline: pipelineRouter,
  contacts: contactsRouter,
  consents: consentsRouter,
  properties: propertiesRouter,
  dossiers: dossiersRouter,
  valuations: valuationsRouter,
  strategies: strategiesRouter,
  approvals: approvalsRouter,
  campaigns: campaignsRouter,
  conversations: conversationsRouter,
  offers: offersRouter,
  transactions: transactionsRouter,
  workflows: workflowsRouter,
  compliance: complianceRouter,
  audit: auditRouter,
  policy: policyRouter,
  settings: settingsRouter,
  portal: portalRouter,
  integrations: integrationsRouter,
});

export type AppRouter = typeof appRouter;
