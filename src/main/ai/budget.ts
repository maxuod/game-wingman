import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readFileSync, writeSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { generateText, type ProviderConfig, type TextRequest, type TextResult } from './providers';
import type { BudgetState } from '../../shared/types';

// CNY micro-units avoid floating-point rounding. Prices checked 2026-09-24:
// https://api-docs.deepseek.com/zh-cn/quick_start/pricing/
// Reserve the ENTIRE model context (1 Mi tokens), plus our output cap, before sending.
// This deliberately avoids estimating image/text tokenization for a hard local limit.
export const BASELINE = { limit: 10_000_000, inputRate: 2, outputRate: 8, maxInput: 1_048_576, maxOutput: 1024 } as const;
export const RESERVATION = BASELINE.maxInput * BASELINE.inputRate + BASELINE.maxOutput * BASELINE.outputRate;
export const emptyBudget = (): BudgetState => ({ limitMicros: BASELINE.limit, chargedMicros: 0, reservedMicros: 0,
  requests: 0, completed: 0, inputTokens: 0, outputTokens: 0, averageMs: null, ready: false, message: '预算账本未就绪' });
export class BudgetError extends Error {}
type Entry = { type: 'reserve'; id: string; at: string } | { type: 'settle'; id: string; at: string; input: number; output: number; elapsedMs: number };
const HEADER = JSON.stringify({ version: 1, test: 'first-deepseek-baseline', ...BASELINE });
const integer = (n: unknown): n is number => Number.isSafeInteger(n) && Number(n) >= 0;

/** Main process, single-instance, append-only durable ledger. Never stores images, prompts or keys. */
export class BaselineBudget {
  private value = emptyBudget();
  private pending = new Set<string>();
  private seen = new Set<string>();
  private elapsed = 0;
  constructor(private filename: string, private update: (state: BudgetState) => void = () => {}) {}
  snapshot(): BudgetState { return { ...this.value }; }
  private publish() { this.update(this.snapshot()); }
  private block(message: string): never {
    this.value.ready = false; this.value.message = message; this.publish(); throw new BudgetError(message);
  }
  private append(line: string, create = false) {
    let fd: number | undefined;
    try {
      fd = openSync(this.filename, create ? 'wx' : 'a', 0o600);
      const bytes = Buffer.from(line + '\n'); let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset);
      fsyncSync(fd);
    } finally { if (fd !== undefined) closeSync(fd); }
  }
  load() {
    try {
      mkdirSync(path.dirname(this.filename), { recursive: true });
      if (!existsSync(this.filename)) this.append(HEADER, true);
      const raw = readFileSync(this.filename, 'utf8');
      if (raw.length > 5_000_000 || !raw.endsWith('\n')) throw new Error();
      const lines = raw.trimEnd().split('\n');
      if (lines.shift() !== HEADER) throw new Error();
      this.value = emptyBudget(); this.pending.clear(); this.seen.clear(); this.elapsed = 0;
      for (const line of lines) this.apply(JSON.parse(line));
      this.value.ready = true; this.value.message = 'DeepSeek 基准 · 总预算 ¥10（跨暂停和重启累计）'; this.publish();
    } catch { this.block('预算账本无法核验，AI 请求已锁定；请保留账本并检查文件。'); }
  }
  private apply(entry: Entry) {
    if (!entry || typeof entry.id !== 'string' || !/^[a-f0-9-]{36}$/.test(entry.id) || !Number.isFinite(Date.parse(entry.at))) throw new Error();
    if (entry.type === 'reserve') {
      if (this.seen.has(entry.id) || this.value.chargedMicros + this.value.reservedMicros + RESERVATION > BASELINE.limit) throw new Error();
      this.seen.add(entry.id); this.pending.add(entry.id); this.value.requests++; this.value.reservedMicros += RESERVATION;
    } else if (entry.type === 'settle') {
      if (!this.pending.has(entry.id) || !integer(entry.input) || entry.input > BASELINE.maxInput || !integer(entry.output) || entry.output > BASELINE.maxOutput || !integer(entry.elapsedMs)) throw new Error();
      this.pending.delete(entry.id); this.value.reservedMicros -= RESERVATION;
      this.value.chargedMicros += entry.input * BASELINE.inputRate + entry.output * BASELINE.outputRate;
      this.value.inputTokens += entry.input; this.value.outputTokens += entry.output; this.value.completed++;
      this.elapsed += entry.elapsedMs; this.value.averageMs = Math.round(this.elapsed / this.value.completed);
    } else throw new Error();
  }
  ensureAvailable() {
    if (!this.value.ready) throw new BudgetError(this.value.message);
    if (this.value.chargedMicros + this.value.reservedMicros + RESERVATION > BASELINE.limit) {
      throw new BudgetError('剩余预算不足以安全发送下一次请求，已停止；总上限 ¥10。');
    }
  }
  private reserve(): string {
    this.ensureAvailable();
    const entry: Entry = { type: 'reserve', id: randomUUID(), at: new Date().toISOString() };
    try { this.append(JSON.stringify(entry)); this.apply(entry); }
    catch { this.block('预算预留写入失败，未发送请求；请检查磁盘和账本。'); }
    this.publish(); return entry.id;
  }
  private settle(id: string, result: TextResult, elapsedMs: number) {
    if (!integer(result.inputTokens) || result.inputTokens > BASELINE.maxInput || !integer(result.outputTokens) || result.outputTokens > BASELINE.maxOutput) {
      throw new BudgetError('API 用量缺失或异常，已保留整笔预算并停止跟进。');
    }
    const entry: Entry = { type: 'settle', id, at: new Date().toISOString(), input: result.inputTokens, output: result.outputTokens, elapsedMs };
    try { this.append(JSON.stringify(entry)); this.apply(entry); }
    catch { this.block('费用核算写入失败，已保留预算并锁定后续请求。'); }
    this.publish();
  }
  async generate(config: ProviderConfig, input: TextRequest, transport = generateText): Promise<TextResult> {
    if (config.provider !== 'deepseek' || config.model !== 'deepseek-flash') throw new BudgetError('本次基准测试仅允许 DeepSeek / deepseek-flash。');
    if (!config.enabled || !config.apiKey) throw new BudgetError('请先配置 DeepSeek 密钥并允许 AI 请求。');
    if ((input.maxOutputTokens ?? 1024) > BASELINE.maxOutput) throw new BudgetError('请求输出超过本次测试上限。');
    if (input.signal?.aborted) throw new BudgetError('请求已取消，未发送。');
    const id = this.reserve(); const start = performance.now();
    // On timeout, malformed response, abort or crash, retain the full reservation.
    // Provider cancellation is not proof that a request was free.
    const result = await transport(config, input);
    this.settle(id, result, Math.round(performance.now() - start));
    return result;
  }
}
