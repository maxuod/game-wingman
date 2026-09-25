import type { AiObservation, AiProvider, CapturedFrame, LiveState, Observation } from '../../shared/types';
import { BudgetError } from './budget';

export const LIVE_LIMITS = { intervalMs: 5000, heartbeatMs: 15000, durationMs: 3600000, maxRequests: 720, staleMs: 15000 } as const;
export const emptyLiveState = (): LiveState => ({ phase: 'off', message: '', provider: null, model: null, startedAt: null, expiresAt: null, requests: 0, observation: null, events: [] });
export interface PreparedFrame { data: string; fingerprint: Uint8Array }
type Observe = (frame: CapturedFrame, signal: AbortSignal) => Promise<AiObservation>;

function changed(a: Uint8Array | null, b: Uint8Array): boolean {
  if (!a || a.length !== b.length) return true;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference += Math.abs(a[i] - b[i]);
  // A coarse scheduling hint, never a claim that the game state is unchanged.
  return difference / Math.max(1, a.length) >= 2;
}
function changes(previous: Observation | undefined, next: Observation): string {
  if (!previous) return `开始记录 · 阶段 ${next.stage ?? '未知'}`;
  const labels = { stage: '阶段', gold: '金币', hp: '生命', level: '等级' };
  const parts: string[] = [];
  for (const key of ['stage', 'gold', 'hp', 'level'] as const) {
    if (previous[key] !== null && next[key] !== null && previous[key] !== next[key]) parts.push(`${labels[key]} ${previous[key]} → ${next[key]}`);
  }
  if (JSON.stringify([...previous.entities].sort()) !== JSON.stringify([...next.entities].sort())) parts.push('可见名称变化');
  if (JSON.stringify(previous.equipment) !== JSON.stringify(next.equipment)) parts.push('装备清单变化');
  return parts.join(' · ');
}

/** One explicitly consented session. No image queue, persistent frames, or automatic retries. */
export class LiveTracker {
  private state = emptyLiveState();
  private revision = 0;
  private pending: AbortController | null = null;
  private observe: Observe | null = null;
  private fingerprint: Uint8Array | null = null;
  private lastAttempt = -Infinity;
  private lastFrame = 0;
  private missing = 0;
  constructor(private readonly update: (state: LiveState) => void, private readonly now = Date.now) {}
  snapshot(): LiveState { return structuredClone(this.state); }
  get active(): boolean { return this.state.phase === 'watching' || this.state.phase === 'running'; }
  private publish() { this.update(this.snapshot()); }
  reset() {
    this.revision++; this.pending?.abort(); this.pending = null; this.observe = null; this.fingerprint = null;
    this.state = emptyLiveState(); this.publish();
  }
  start(provider: AiProvider, model: string, observe: Observe) {
    this.reset(); this.observe = observe; this.lastAttempt = -Infinity; this.lastFrame = this.now(); this.missing = 0;
    this.state = { ...emptyLiveState(), phase: 'watching', message: '等待下一张画面', provider, model,
      startedAt: new Date(this.now()).toISOString(), expiresAt: new Date(this.now() + LIVE_LIMITS.durationMs).toISOString() };
    this.publish();
  }
  stop(message = '本次跟进已停止') {
    if (!this.active) return;
    this.revision++; this.pending?.abort(); this.pending = null; this.observe = null; this.fingerprint = null;
    this.state.phase = 'stopped'; this.state.message = message; this.publish();
  }
  touchFrame() { if (this.active) this.lastFrame = this.now(); }
  tick() {
    if (!this.active) return;
    if (this.now() >= Date.parse(this.state.expiresAt!)) this.stop('60 分钟测试已结束，自动发送已停止');
    else if (this.now() - this.lastFrame >= LIVE_LIMITS.staleMs) this.stop('窗口画面已停止更新，自动发送已停止');
  }
  async offer(frame: CapturedFrame, prepare: () => PreparedFrame): Promise<void> {
    this.tick();
    if (!this.active || this.pending || !this.observe || this.now() - this.lastAttempt < LIVE_LIMITS.intervalMs) return;
    if (this.state.requests >= LIVE_LIMITS.maxRequests) { this.stop('达到本次 720 次请求上限'); return; }
    let prepared: PreparedFrame;
    try { prepared = prepare(); } catch { this.stop('画面无法读取，自动发送已停止'); return; }
    if (this.now() - this.lastAttempt < LIVE_LIMITS.heartbeatMs && !changed(this.fingerprint, prepared.fingerprint)) return;
    const revision = this.revision;
    const controller = new AbortController(); this.pending = controller;
    this.lastAttempt = this.now(); this.fingerprint = prepared.fingerprint;
    this.state.requests++; this.state.phase = 'running'; this.state.message = '正在识别最新画面'; this.publish();
    try {
      const observation = await this.observe({ ...frame, data: prepared.data }, controller.signal);
      if (revision !== this.revision || controller.signal.aborted) return;
      this.tick();
      if (!this.active || revision !== this.revision) return;
      if (this.now() - Date.parse(frame.capturedAt) >= LIVE_LIMITS.staleMs) { this.stop('识别响应已过时，跟进已停止'); return; }
      const fields = observation.fields;
      if (fields.stage === null || [fields.gold, fields.hp, fields.level].every(value => value === null)) {
        this.missing++; this.state.observation = null;
        if (this.missing >= 3) { this.stop('连续三次未读到足够对局信息，跟进已停止'); return; }
        this.state.message = '未读到足够对局信息，等待下一张画面';
      } else {
        this.missing = 0;
        const summary = changes(this.state.observation?.fields, fields);
        this.state.observation = observation;
        if (summary) this.state.events = [{ capturedAt: frame.capturedAt, summary }, ...this.state.events].slice(0, 8);
        this.state.message = '持续跟进中 · AI 字段待核对';
      }
      this.state.phase = 'watching';
      if (this.state.requests >= LIVE_LIMITS.maxRequests) this.stop('达到本次 720 次请求上限');
    } catch (error) {
      // Do not retain upstream response bodies or retry paid failures in the background.
      if (revision === this.revision) this.stop(error instanceof BudgetError ? error.message : '识别请求失败，跟进已停止；请检查连接、模型或额度');
    } finally {
      if (revision === this.revision) { this.pending = null; this.publish(); }
    }
  }
}
