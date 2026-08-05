import type { Store } from "../store/types";
import {
  CAPS,
  disallowedTools,
  exfiltrationScan,
  injectionScan,
  neverAdmitScan,
  redactPii,
  wrapUntrusted,
} from "./controls";
import { MockDeterministicProvider, OpenAICompatibleProvider } from "./providers";
import type {
  ModelCallBlocked,
  ModelCallOutcome,
  ModelProvider,
  ModelRequest,
} from "./types";

/**
 * Model gateway (ARCHITECTURE_CONTRACT §Model gateway).
 * Pipeline per call: never-admit scan → injection scan → exfiltration scan →
 * PII redaction / high-sensitivity tokenization → tool allowlist → caps →
 * provider call (with deterministic fallback) → zod structured-output
 * enforcement → evidence-required check → model_calls logging.
 * Fail closed: any blocked category returns ok:false and NO provider call runs.
 */
export class ModelGateway {
  constructor(
    private store: Store,
    private primary: ModelProvider = new MockDeterministicProvider(),
    private fallback: ModelProvider = new MockDeterministicProvider(),
  ) {}

  static openAiConfigured(): ModelProvider {
    return new OpenAICompatibleProvider();
  }

  private blocked(
    category: ModelCallBlocked["category"],
    reason: string,
    warnings: string[] = [],
  ): ModelCallBlocked {
    return { ok: false, category, reason, warnings };
  }

  async call(req: ModelRequest): Promise<ModelCallOutcome> {
    const warnings: string[] = [];
    const whole = `${req.system}\n${req.user}\n${req.untrustedContent ?? ""}`;

    // 1 — never-admit list
    const na = neverAdmitScan(whole);
    if (na)
      return this.blocked("never_admit", `never-admit content (${na.category}: "${na.match}") — refused before provider call`, warnings);

    // 2 — prompt injection in untrusted content
    if (req.untrustedContent) {
      const inj = injectionScan(req.untrustedContent);
      if (inj)
        return this.blocked("prompt_injection", `injection pattern "${inj}" in untrusted content — refused`, warnings);
    }

    // 3 — exfiltration patterns in the request itself
    const exf = exfiltrationScan(req.user);
    if (exf)
      return this.blocked("exfiltration", `exfiltration pattern "${exf}" — refused`, warnings);

    // 4 — tool allowlist
    const badTools = disallowedTools(req.tools ?? []);
    if (badTools.length)
      return this.blocked("tool_not_allowed", `tools not on allowlist: ${badTools.join(", ")}`, warnings);

    // 5 — evidence-required flag
    if (req.evidenceRequired && (req.evidenceIds?.length ?? 0) === 0)
      return this.blocked("evidence_missing", "evidenceRequired call without evidenceIds — fail closed", warnings);

    // 6 — caps
    const maxTokens = Math.min(req.maxTokens ?? CAPS.maxTokens, CAPS.maxTokens);
    const maxCost = Math.min(req.maxCostCents ?? CAPS.maxCostCentsPerCall, CAPS.maxCostCentsPerCall);

    // 7 — PII redaction / high-sensitivity tokenization (pre-send)
    const needsRedaction = req.sensitivity !== "public";
    const sys = needsRedaction ? redactPii(req.system, req.knownPii ?? []) : { text: req.system, redactedCount: 0, tokenMap: {} };
    const usr = needsRedaction ? redactPii(req.user, req.knownPii ?? []) : { text: req.user, redactedCount: 0, tokenMap: {} };
    const untrusted = req.untrustedContent
      ? wrapUntrusted(
          (needsRedaction ? redactPii(req.untrustedContent, req.knownPii ?? []) : { text: req.untrustedContent }).text,
        )
      : undefined;
    const piiRedacted = sys.redactedCount + usr.redactedCount > 0;
    if (piiRedacted) warnings.push(`PII tokenized pre-send (${sys.redactedCount + usr.redactedCount} token(s))`);

    // 8 — provider call with deterministic fallback
    const started = Date.now();
    let provider = this.primary;
    let fallbackUsed = false;
    let result: { content: string; tokensIn: number; tokensOut: number };
    try {
      if (!provider.isConfigured()) throw new Error(`${provider.name} not configured`);
      result = await provider.complete({
        system: sys.text,
        user: usr.text,
        untrustedContent: untrusted,
        mockResponse: req.mockResponse,
        maxTokens,
      });
    } catch (err) {
      warnings.push(`primary provider failed (${(err as Error).message}) — deterministic fallback used`);
      provider = this.fallback;
      fallbackUsed = true;
      try {
        result = await provider.complete({
          system: sys.text,
          user: usr.text,
          untrustedContent: untrusted,
          mockResponse: req.mockResponse,
          maxTokens,
        });
      } catch (err2) {
        return this.blocked("provider_unavailable", `all providers failed: ${(err2 as Error).message}`, warnings);
      }
    }
    const durationMs = Date.now() - started;

    // 9 — exfiltration scan of provider output
    const outExf = exfiltrationScan(result.content);
    if (outExf)
      return this.blocked("exfiltration", `exfiltration pattern in model output ("${outExf}") — output suppressed`, warnings);

    // 10 — cost cap
    const costCents = Math.max(1, Math.ceil((result.tokensIn + result.tokensOut) / 1000));
    if (costCents > maxCost)
      return this.blocked("cap_exceeded", `estimated cost ${costCents}¢ exceeds cap ${maxCost}¢`, warnings);

    // 11 — structured output enforcement (zod)
    let parsed: unknown = result.content;
    if (req.outputSchema) {
      try {
        parsed = req.outputSchema.parse(
          typeof req.mockResponse !== "undefined"
            ? req.mockResponse
            : JSON.parse(result.content),
        );
      } catch (err) {
        return this.blocked("schema_violation", `provider output failed zod validation: ${(err as Error).message}`, warnings);
      }
    }

    // 12 — model_calls logging
    await this.store.recordModelCall({
      tenantId: req.tenantId ?? null,
      provider: provider.name,
      model: provider.model,
      promptVersion: req.promptVersion,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costCents,
      sensitivity: req.sensitivity,
      piiRedacted,
      durationMs,
      status: "ok",
    });

    return {
      ok: true,
      content: result.content,
      parsed,
      provider: provider.name,
      model: provider.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costCents,
      durationMs,
      piiRedacted,
      fallbackUsed,
      warnings,
    };
  }
}

export * from "./types";
export * from "./controls";
export { MockDeterministicProvider, OpenAICompatibleProvider } from "./providers";
