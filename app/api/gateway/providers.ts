import type { ModelProvider } from "./types";

/**
 * Default provider: fully deterministic, offline, truthful about being a mock.
 * Returns the caller-supplied mockResponse verbatim (as JSON when an output
 * schema is enforced), so demos and tests are reproducible.
 */
export class MockDeterministicProvider implements ModelProvider {
  name = "mock-deterministic";
  model = "mock-deterministic-1";
  statusNote = "MOCK provider — deterministic, offline. Never represents live model output.";
  isConfigured() {
    return true;
  }
  async complete(req: { system: string; user: string; mockResponse?: unknown; maxTokens: number }) {
    const content =
      req.mockResponse !== undefined
        ? typeof req.mockResponse === "string"
          ? req.mockResponse
          : JSON.stringify(req.mockResponse)
        : `mock-response:${hash(req.system + "|" + req.user)}`;
    return {
      content,
      tokensIn: Math.ceil((req.system.length + req.user.length) / 4),
      tokensOut: Math.ceil(content.length / 4),
    };
  }
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(16);
}

/**
 * OpenAI-compatible provider (Kimi K3 or Canada-hosted/self-hosted endpoint).
 * Configured via env: MODEL_GATEWAY_BASE_URL / MODEL_GATEWAY_MODEL /
 * MODEL_GATEWAY_API_KEY. Provider training opt-out is asserted via the
 * `X-Training-Opt-Out: true` header on every request.
 */
export class OpenAICompatibleProvider implements ModelProvider {
  name = "openai-compatible";
  statusNote =
    "OpenAI-compatible endpoint via env config. Training opt-out header asserted. Status is truthful: unconfigured until env is set.";
  constructor(
    private baseUrl = process.env.MODEL_GATEWAY_BASE_URL ?? "",
    private apiKey = process.env.MODEL_GATEWAY_API_KEY ?? "",
    public model = process.env.MODEL_GATEWAY_MODEL ?? "kimi-k3",
  ) {}
  isConfigured() {
    return this.baseUrl.length > 0 && this.apiKey.length > 0;
  }
  async complete(req: { system: string; user: string; untrustedContent?: string; maxTokens: number }) {
    if (!this.isConfigured()) throw new Error("openai-compatible provider not configured (MODEL_GATEWAY_BASE_URL/API_KEY)");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.apiKey}`,
          "x-training-opt-out": "true",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: req.maxTokens,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user + (req.untrustedContent ? `\n\n${req.untrustedContent}` : "") },
          ],
        }),
      });
      if (!res.ok) throw new Error(`provider HTTP ${res.status}`);
      const json = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };
      return {
        content: json.choices?.[0]?.message?.content ?? "",
        tokensIn: json.usage?.prompt_tokens ?? 0,
        tokensOut: json.usage?.completion_tokens ?? 0,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
