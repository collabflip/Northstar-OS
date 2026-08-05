import { Bot, ArrowRight } from 'lucide-react';
import { ConfidenceBar } from './ConfidenceBar';
import { useT } from '@/lib/i18n';

interface AgentRunCardProps {
  agentName: string;
  modelVersion: string;
  promptVersion: string;
  duration: string;
  tokens?: string;
  cost?: string;
  confidence?: number;
  evidenceCount: number;
  auditHref: string;
  status?: 'completed' | 'running' | 'failed';
}

/** An agent execution: model/prompt versions, duration, cost, confidence, evidence count, audit link. */
export function AgentRunCard({ agentName, modelVersion, promptVersion, duration, tokens, cost, confidence, evidenceCount, auditHref, status = 'completed' }: AgentRunCardProps) {
  const { t } = useT();
  return (
    <div className="rounded-xl border border-line bg-surface p-3 shadow-card" aria-live={status !== 'running' ? 'polite' : undefined}>
      <div className="flex items-center gap-2">
        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-accent-tint text-accent">
          <Bot size={13} aria-hidden />
        </span>
        <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{agentName}</p>
        <span className="text-[11px] text-ink-3">{duration}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
        <code className="font-mono">{modelVersion}</code>
        <code className="font-mono">{promptVersion}</code>
        {tokens && <span className="tnum">{tokens}</span>}
        {cost && <span className="tnum">{cost}</span>}
        <span className="tnum">{evidenceCount} evidence</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {typeof confidence === 'number' ? <ConfidenceBar value={confidence} /> : <span />}
        <a href={auditHref} className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-accent hover:underline">
          {t('misc.viewAudit')}
          <ArrowRight size={12} aria-hidden />
        </a>
      </div>
    </div>
  );
}
