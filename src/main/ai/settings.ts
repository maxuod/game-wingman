import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PROVIDERS, providerConfig, providerEndpoint, type ProviderConfig, type ProviderId } from './providers';
import type { AiSettings, AiSettingsInput } from '../../shared/types';

interface Cipher { isEncryptionAvailable(): boolean; encryptString(value: string): Buffer; decryptString(value: Buffer): string }
interface Stored { selected: ProviderId; enabled: boolean; providers: Record<ProviderId, { model: string; region: 'cn' | 'global'; key?: string }> }
const fresh = (): Stored => ({ selected: 'deepseek', enabled: false, providers: {
  minimax: { model: PROVIDERS.minimax.model, region: 'cn' }, deepseek: { model: PROVIDERS.deepseek.model, region: 'global' }, gemini: { model: PROVIDERS.gemini.model, region: 'global' }
} });
function isProvider(value: unknown): value is ProviderId { return typeof value === 'string' && Object.hasOwn(PROVIDERS, value); }

/** Main/Node only. Public snapshots contain presence flags, never keys or ciphertext. */
export class AiSettingsStore {
  private value = fresh();
  private writes: Promise<unknown> = Promise.resolve();
  constructor(private filename: string, private cipher: Cipher) {}
  async load() {
    try {
      const text = await readFile(this.filename, 'utf8');
      if (text.length > 40_000) throw new Error();
      const raw = JSON.parse(text) as Stored;
      if (!isProvider(raw.selected) || typeof raw.enabled !== 'boolean') throw new Error();
      for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
        const item = raw.providers[id];
        this.validate({ provider: id, model: item.model, region: item.region, enabled: raw.enabled });
        if (item.key !== undefined && (typeof item.key !== 'string' || item.key.length > 16000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(item.key))) throw new Error();
      }
      this.value = raw;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('AI 配置无法读取，请重新导入凭据。');
    }
  }
  status(): AiSettings {
    return { selected: this.value.selected, enabled: this.value.enabled, secureStorage: this.cipher.isEncryptionAvailable(),
      providers: (Object.keys(PROVIDERS) as ProviderId[]).map(id => ({ provider: id, label: PROVIDERS[id].label,
        model: this.value.providers[id].model, region: this.value.providers[id].region,
        endpoint: providerEndpoint({ provider: id, region: this.value.providers[id].region }), hasKey: !!this.value.providers[id].key })) };
  }
  private validate(input: AiSettingsInput) {
    if (!input || !isProvider(input.provider) || typeof input.model !== 'string' || typeof input.enabled !== 'boolean' || !['cn', 'global'].includes(input.region)) throw new Error('AI 设置无效。');
    providerConfig({ [PROVIDERS[input.provider].modelEnv]: input.model, MINIMAX_REGION: input.region }, input.provider);
    if (!input.model.trim()) throw new Error('请填写模型名称。');
  }
  private update(change: (draft: Stored) => void) {
    const operation = this.writes.then(async () => {
      const draft = structuredClone(this.value); change(draft);
      await mkdir(path.dirname(this.filename), { recursive: true });
      await writeFile(this.filename + '.tmp', JSON.stringify(draft), { mode: 0o600 });
      await rename(this.filename + '.tmp', this.filename);
      this.value = draft;
      return this.status();
    });
    this.writes = operation.catch(() => {});
    return operation;
  }
  save(input: AiSettingsInput) {
    this.validate(input);
    return this.update(draft => {
      draft.selected = input.provider; draft.enabled = input.enabled;
      draft.providers[input.provider].model = input.model.trim(); draft.providers[input.provider].region = input.region;
    });
  }
  setKey(provider:unknown,key:unknown) {
    if(!isProvider(provider)||typeof key!=='string')throw new Error('请选择支持的平台并填写 API Key。');
    return this.importKeys({[provider]:key});
  }
  importKeys(keys: Partial<Record<ProviderId, string>>) {
    if (!this.cipher.isEncryptionAvailable()) throw new Error('系统安全存储不可用，未保存密钥。');
    const encrypted: Partial<Record<ProviderId, string>> = {};
    for (const id of Object.keys(PROVIDERS) as ProviderId[]) {
      if (keys[id] === undefined) continue;
      const key = keys[id];
      if (typeof key !== 'string' || !key.trim() || key.length > 4096 || /[\s\x00-\x1f\x7f]/.test(key.trim())) throw new Error('密钥格式无效。');
      encrypted[id] = this.cipher.encryptString(key.trim()).toString('base64');
    }
    if (!Object.keys(encrypted).length) throw new Error('文件中未找到支持的 API Key。');
    return this.update(draft => { for (const id of Object.keys(encrypted) as ProviderId[]) draft.providers[id].key = encrypted[id]; });
  }
  removeKey(id: ProviderId) {
    if (!isProvider(id)) throw new Error('提供方无效。');
    return this.update(draft => { delete draft.providers[id].key; });
  }
  config(id = this.value.selected): ProviderConfig {
    if (!isProvider(id)) throw new Error('提供方无效。');
    const item = this.value.providers[id];
    if (!this.cipher.isEncryptionAvailable() || !item.key) throw new Error('请先导入该提供方的 API Key。');
    let key: string;
    try { key = this.cipher.decryptString(Buffer.from(item.key, 'base64')); }
    catch { throw new Error('当前系统账户无法解密凭据，请重新导入。'); }
    return providerConfig({ AI_ENABLED: String(this.value.enabled), MINIMAX_REGION: item.region,
      [PROVIDERS[id].modelEnv]: item.model, [PROVIDERS[id].keyEnv]: key }, id);
  }
}
