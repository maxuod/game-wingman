/** Text-only provider boundary. Not wired to screen capture or renderer IPC. */
export const PROVIDERS = {
  minimax: { label: 'MiniMax', model: 'MiniMax-M3', url: 'https://api.minimax.io/v1/chat/completions', keyEnv: 'MINIMAX_API_KEY', modelEnv: 'MINIMAX_MODEL' },
  deepseek: { label: 'DeepSeek', model: 'deepseek-flash', url: 'https://api.deepseek.com/chat/completions', keyEnv: 'DEEPSEEK_API_KEY', modelEnv: 'DEEPSEEK_MODEL' },
  gemini: { label: 'Gemini', model: 'gemini-3.8-flash', url: 'https://generativelanguage.googleapis.com/v1beta/models/', keyEnv: 'GEMINI_API_KEY', modelEnv: 'GEMINI_MODEL' }
} as const;
export type ProviderId = keyof typeof PROVIDERS;
export interface ProviderConfig { provider: ProviderId; model: string; apiKey: string; enabled: boolean; timeoutMs: number }
export interface TextRequest { system?: string; prompt: string; maxOutputTokens?: number; signal?: AbortSignal }
export interface TextResult { provider: ProviderId; model: string; text: string; inputTokens?: number; outputTokens?: number }
export class ProviderError extends Error {
  constructor(public code: 'disabled' | 'configuration' | 'input' | 'network' | 'timeout' | 'cancelled' | 'http' | 'response', message: string, public status?: number) {
    super(message); this.name = 'ProviderError';
  }
}
export function providerConfig(env: NodeJS.ProcessEnv, requested = env.AI_PROVIDER ?? 'minimax'): ProviderConfig {
  if (!Object.hasOwn(PROVIDERS, requested)) throw new ProviderError('configuration', 'Choose minimax, deepseek, or gemini.');
  const provider = requested as ProviderId;
  const definition = PROVIDERS[provider];
  const model = env[definition.modelEnv]?.trim() || definition.model;
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(model)) throw new ProviderError('configuration', 'Invalid model ID.');
  const apiKey = env[definition.keyEnv]?.trim() ?? '';
  if (/[\r\n]/.test(apiKey)) throw new ProviderError('configuration', 'Invalid API key format.');
  const timeoutMs = Number(env.AI_TIMEOUT_MS ?? 30_000);
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1000 || timeoutMs > 120_000) throw new ProviderError('configuration', 'AI_TIMEOUT_MS must be between 1000 and 120000.');
  return { provider, model, apiKey, enabled: env.AI_ENABLED === 'true', timeoutMs };
}

type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue { return value && typeof value === 'object' && !Array.isArray(value) ? value as RecordValue : {}; }
function count(value: unknown): number | undefined { return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : undefined; }

export async function generateText(config: ProviderConfig, input: TextRequest, fetcher: typeof fetch = fetch): Promise<TextResult> {
  if (!config.enabled) throw new ProviderError('disabled', 'AI is disabled. Set AI_ENABLED=true only when ready to send a paid request.');
  if (!Object.hasOwn(PROVIDERS, config.provider) || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,119}$/.test(config.model) ||
      !Number.isInteger(config.timeoutMs) || config.timeoutMs < 1000 || config.timeoutMs > 120_000) throw new ProviderError('configuration', 'Invalid provider configuration.');
  if (!config.apiKey || /[\r\n]/.test(config.apiKey)) throw new ProviderError('configuration', 'Set the selected provider API key in your local environment.');
  if (typeof input.prompt !== 'string' || !input.prompt.trim() || input.prompt.length > 32_000 ||
      (input.system !== undefined && (typeof input.system !== 'string' || input.system.length > 8_000))) throw new ProviderError('input', 'Text input is empty or exceeds the sample limit.');
  const limit = input.maxOutputTokens ?? 1024;
  if (!Number.isInteger(limit) || limit < 32 || limit > 8192) throw new ProviderError('input', 'Output token limit must be between 32 and 8192.');
  if (input.signal?.aborted) throw new ProviderError('cancelled', 'Request cancelled.');
  const definition = PROVIDERS[config.provider];
  let url: string = definition.url;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  let body: RecordValue;
  if (config.provider === 'gemini') {
    url += `${encodeURIComponent(config.model)}:generateContent`;
    headers['x-goog-api-key'] = config.apiKey;
    body = { contents: [{ role: 'user', parts: [{ text: input.prompt }] }], generationConfig: { maxOutputTokens: limit },
      ...(input.system ? { systemInstruction: { parts: [{ text: input.system }] } } : {}) };
  } else {
    headers.Authorization = `Bearer ${config.apiKey}`;
    body = { model: config.model, stream: false, messages: [
      ...(input.system ? [{ role: 'system', content: input.system }] : []), { role: 'user', content: input.prompt }
    ], ...(config.provider === 'minimax' ? { max_completion_tokens: limit, reasoning_split: true } : { max_tokens: limit }) };
  }
  const timeout = AbortSignal.timeout(config.timeoutMs);
  const signal = input.signal ? AbortSignal.any([input.signal, timeout]) : timeout;
  let data: RecordValue;
  try {
    const response = await fetcher(url, { method: 'POST', headers, body: JSON.stringify(body), redirect: 'error', signal });
    if (!response.ok) {
      await response.body?.cancel();
      throw new ProviderError('http', `${definition.label} returned HTTP ${response.status}. Check account access, model and quota.`, response.status);
    }
    // Bounded body reading avoids logging or retaining arbitrary upstream payloads.
    const reader = response.body?.getReader();
    if (!reader) throw new ProviderError('response', 'The provider returned no response body.');
    const chunks: Uint8Array[] = []; let bytes = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > 1_000_000) throw new ProviderError('response', 'The provider response exceeded the sample limit.');
        chunks.push(value);
      }
    } finally { await reader.cancel().catch(() => {}); }
    try { data = record(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
    catch { throw new ProviderError('response', 'The provider returned invalid JSON.'); }
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (input.signal?.aborted) throw new ProviderError('cancelled', 'Request cancelled.');
    if (timeout.aborted) throw new ProviderError('timeout', 'The provider request timed out. No automatic retry was made.');
    // Do not echo raw network errors: they may contain credentials or user content.
    throw new ProviderError('network', 'The provider could not be reached. No automatic retry was made.');
  }
  let text: unknown; let inputTokens: number | undefined; let outputTokens: number | undefined;
  if (config.provider === 'gemini') {
    const candidates = Array.isArray(data.candidates) ? data.candidates : [];
    const candidate = record(candidates[0]);
    if (candidate.finishReason !== 'STOP' || record(data.promptFeedback).blockReason) throw new ProviderError('response', 'The provider blocked, truncated or did not complete the response.');
    const parts = record(candidate.content).parts;
    text = Array.isArray(parts) ? parts.map(record).filter(part => part.thought !== true).map(part => typeof part.text === 'string' ? part.text : '').join('') : '';
    const usage = record(data.usageMetadata); inputTokens = count(usage.promptTokenCount); outputTokens = count(usage.candidatesTokenCount);
  } else {
    const choices = Array.isArray(data.choices) ? data.choices : [];
    const choice = record(choices[0]);
    const status = record(data.base_resp).status_code;
    if ((status !== undefined && status !== 0) || choice.finish_reason !== 'stop' || data.error) throw new ProviderError('response', 'The provider rejected, truncated or did not complete the response.');
    text = record(choice.message).content;
    const usage = record(data.usage); inputTokens = count(usage.prompt_tokens); outputTokens = count(usage.completion_tokens);
  }
  if (typeof text !== 'string' || !text.trim()) throw new ProviderError('response', 'The provider returned no final text.');
  // Older MiniMax model IDs can still return tagged reasoning despite reasoning_split.
  if (/<\/?think\b/i.test(text)) throw new ProviderError('response', 'The provider mixed reasoning with final text; this response is not displayed.');
  return { provider: config.provider, model: config.model, text: text.trim(), inputTokens, outputTokens };
}
