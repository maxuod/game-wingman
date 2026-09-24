import type { Catalog, CatalogEntry } from '../shared/types';

export function validVersion(value: unknown): value is string {
  return typeof value === 'string' && /^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(value);
}

// Data Dragon includes many historical sets. Select this sample's explicitly audited set.
export function parseEntries(document: unknown, kind: 'champion' | 'trait'): CatalogEntry[] {
  if (!document || typeof document !== 'object' || !('data' in document) || !document.data || typeof document.data !== 'object') {
    throw new Error('资料格式发生变化，请稍后重试。');
  }
  return Object.values(document.data).flatMap((raw: unknown) => {
    if (!raw || typeof raw !== 'object') return [];
    const item = raw as Record<string, unknown>;
    const image = item.image as { full?: unknown } | undefined;
    if (typeof image?.full !== 'string' || !image.full.endsWith('.TFT_Set18.png')) return [];
    if (typeof item.id !== 'string' || typeof item.name !== 'string' || item.id.length > 240 || item.name.length > 120) return [];
    return [{ id: `${kind}:${item.id}`, name: item.name, kind,
      ...(kind === 'champion' && typeof item.cost === 'number' && item.cost >= 0 && item.cost <= 10 ? { cost: item.cost } : {}) }];
  });
}

async function getJSON(url: string): Promise<unknown> {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000), redirect: 'error' });
  if (!response.ok) throw new Error(`资料服务器暂不可用（${response.status}）。`);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('资料服务器没有返回内容。');
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > 12_000_000) throw new Error('资料文件超出预期大小。');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

export async function downloadCatalog(): Promise<Catalog> {
  const realm = await getJSON('https://ddragon.leagueoflegends.com/realms/na.json') as { v?: unknown };
  if (!validVersion(realm.v)) throw new Error('无法确认美服资源版本。');
  const version = realm.v;
  const docs = await Promise.all((['champion', 'trait'] as const).map(async kind => {
    const document = await getJSON(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/tft-${kind}.json`);
    return parseEntries(document, kind);
  }));
  const entries = docs.flat();
  if (docs.some(group => group.length === 0)) throw new Error('该资源版本未包含样品需要的 Set 18 数据，请更新应用。');
  return { version, checkedAt: new Date().toISOString(), entries };
}

export function validateCatalog(raw: unknown): raw is Catalog {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Catalog;
  return validVersion(value.version) && typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt)) &&
    Array.isArray(value.entries) && value.entries.length > 0 && value.entries.length < 3000 && value.entries.every(entry =>
      entry && typeof entry.id === 'string' && entry.id.length <= 250 && typeof entry.name === 'string' && entry.name.length <= 120 &&
      ['champion', 'trait'].includes(entry.kind) && (entry.cost === undefined || (Number.isInteger(entry.cost) && entry.cost >= 0 && entry.cost <= 10)));
}
