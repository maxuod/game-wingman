import type { CompGuide, ItemReference, ItemDefinition } from '../shared/types';
import { validIconUrl } from './icon-cache';
export const PUBLIC_PATCH = '18.3';
export const COMPS_URL = 'https://op.gg/tft/meta-trends/comps';
export const ITEMS_URL = 'https://op.gg/tft/game-guide/items';
export const MAX_PUBLIC_BYTES = 4_000_000;
export const OFFICIAL_UPDATES_URL = 'https://teamfighttactics.leagueoflegends.com/en-us/news/game-updates/';
export function officialPatchUrl(patch: string): string {
  if (!validPatch(patch)) throw new Error('官方补丁版本无效。');
  return `${OFFICIAL_UPDATES_URL}teamfight-tactics-patch-${patch.replace('.', '-')}/`;
}

export async function downloadPublicPage(url: string, fetcher: typeof fetch = fetch): Promise<string> {
  if (![COMPS_URL, ITEMS_URL, OFFICIAL_UPDATES_URL].includes(url) &&
    !/^https:\/\/teamfighttactics\.leagueoflegends\.com\/en-us\/news\/game-updates\/teamfight-tactics-patch-(?:1[8-9]|[2-9]\d)-[1-9]\d?\/$/.test(url)) throw new Error('资料来源无效。');
  const response = await fetcher(url, { signal: AbortSignal.timeout(15000), redirect: 'error' });
  return readPublicResponse(response);
}
export async function readPublicResponse(response: Response): Promise<string> {
  if (!response.ok || !response.body) throw new Error('公开资料暂不可用。');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > MAX_PUBLIC_BYTES) throw new Error('统计页面过大。'); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString('utf8');
}
// Public Flight payloads contain JSON records and length-prefixed text records.
// Parse only data, skipping UTF-8 text by byte length. Never evaluate page scripts.
export function publicRecords(html: string): unknown[] {
  if (Buffer.byteLength(html) > MAX_PUBLIC_BYTES) throw new Error('统计页面过大。');
  const stream = [...html.matchAll(/<script[^>]*>self\.__next_f\.push\((\[[\s\S]*?\])\)<\/script>/g)].map(match => {
    const value: unknown = JSON.parse(match[1]);
    return Array.isArray(value) && value[0] === 1 && typeof value[1] === 'string' ? value[1] : '';
  }).join('');
  return flightRecords(stream);
}
export function flightRecords(stream: string): unknown[] {
  if (Buffer.byteLength(stream) > MAX_PUBLIC_BYTES) throw new Error('统计页面过大。');
  const buffer = Buffer.from(stream); const records: unknown[] = []; let at = 0;
  while (at < buffer.length) {
    if (buffer[at] === 10) { at++; continue; }
    const prefix = /^([\da-f]+):/.exec(buffer.subarray(at, at + 32).toString());
    if (!prefix) { const end = buffer.indexOf(10, at); if (end < 0) break; at = end + 1; continue; }
    at += prefix[0].length;
    if (buffer[at] === 84) {
      const comma = buffer.indexOf(44, at); const length = buffer.subarray(at + 1, comma).toString();
      if (comma < 0 || !/^[\da-f]{1,8}$/.test(length) || comma + 1 + parseInt(length, 16) > buffer.length) throw new Error('页面文本记录无效。');
      at = comma + 1 + parseInt(length, 16); continue;
    }
    let end = buffer.indexOf(10, at); if (end < 0) end = buffer.length;
    if (buffer[at] === 91 || buffer[at] === 123) { try { records.push(JSON.parse(buffer.subarray(at, end).toString())); } catch { throw new Error('公开资料 JSON 无效。'); } }
    at = end + 1;
  }
  if (!records.length) throw new Error('统计页面结构已改变。');
  return records;
}
export function walkPublic(value: unknown, visit: (obj: Record<string, any>) => boolean | void, depth = 0): void {
  if (!value || typeof value !== 'object') return;
  if (depth > 80) throw new Error('统计页面结构已改变。');
  const obj = value as Record<string, any>; if (visit(obj) === false) return;
  for (const [key, child] of Object.entries(obj)) if (key !== 'messages' && key !== 'opggKitInit') walkPublic(child, visit, depth + 1);
}
function text(value: unknown, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max || /[<>\u0000-\u001f]/.test(value)) throw new Error('资料名称字段无效。'); return value;
}
function id(value: unknown): string { const result = text(value, 100); if (!/^[\w-]+$/.test(result)) throw new Error('资料 ID 无效。'); return result; }
export function validCell(value:unknown):value is {x:number;y:number} {
  const c=value as {x:number;y:number};return !!c && Number.isInteger(c.x)&&c.x>=1&&c.x<=7&&Number.isInteger(c.y)&&c.y>=1&&c.y<=4;
}
export function validPatch(value: unknown): value is string { return typeof value === 'string' && /^(?:1[8-9]|[2-9]\d)\.[1-9]\d?$/.test(value); }
export function validTeamCode(code: unknown, patch: string): boolean {
  return validPatch(patch) && typeof code === 'string' && new RegExp(`^02[\\da-f]{30}TFTSet${Number(patch.split('.')[0])}$`).test(code);
}
export function parseCompPage(html: string, now = Date.now(), expectedPatch = PUBLIC_PATCH): CompGuide[] {
  const records = publicRecords(html); const scopes: any[] = []; const groups: any[] = []; const clocks: string[] = []; const texts: string[] = [];
  function strings(value: unknown, depth = 0) { if (depth > 80) return; if (typeof value === 'string' && value.length < 180) texts.push(value); else if (value && typeof value === 'object') for (const [key, child] of Object.entries(value)) if (!['messages', 'opggKitInit', 'decks'].includes(key)) strings(child, depth + 1); }
  strings(records);
  walkPublic(records, obj => { if ('game_region' in obj) scopes.push(obj); if (Array.isArray(obj.decks)) { groups.push(obj); return false; }
    if (obj.locale === 'en' && typeof obj.now === 'string' && obj.now.startsWith('$D')) clocks.push(obj.now.slice(2)); });
  if (scopes.length !== 1 || groups.length !== 1 || clocks.length !== 1) throw new Error('统计页面结构已改变。');
  const scope = scopes[0], group = groups[0];
  if (!validPatch(expectedPatch) || scope.game_version !== expectedPatch || group.version !== expectedPatch) throw new Error('阵容统计补丁与官方版本尚未一致，等待来源更新。');
  if (scope.game_region !== 'global' || scope.game_tier !== 'ALL' || scope.game_mode !== 'ALL' || !texts.some(t => /^This data is from the analysis of [\d,]+ games in the last 24 hours\.$/.test(t))) throw new Error('统计口径已改变。');
  const relative = texts.map(t => /^Last updated: (\d+) (minute|hour)s? ago$/.exec(t)).find(Boolean);
  if (!relative) throw new Error('来源更新时间缺失。');
  const stamp = Date.parse(clocks[0]) - (Number(relative[1]) + 1) * (relative[2] === 'hour' ? 3600000 : 60000);
  if (!Number.isFinite(stamp) || now - stamp < -300000 || now - stamp > 72 * 3600000) throw new Error('统计过期或时间无效。');
  if (!group.decks.length || group.decks.length > 500) throw new Error('阵容数量异常。');
  const seen = new Set<string>();
  return group.decks.map((row: any): CompGuide => {
    const key = id(row.id); if (seen.has(key)) throw new Error('阵容 ID 重复。'); seen.add(key);
    if (!validTeamCode(row.teamCode, expectedPatch) || row.stat?.representative !== true || !Array.isArray(row.units) || !row.units.length || row.units.length > 12) throw new Error('阵容字段无效。');
    const s = row.stat.label;
    if (!s || !['winRate', 'top4Rate', 'avgPlacement', 'compsCount', 'winCount', 'top4Count'].every(k => typeof s[k] === 'number' && Number.isFinite(s[k])) ||
      s.winRate < 0 || s.top4Rate > 1 || s.winRate > s.top4Rate || s.avgPlacement < 1 || s.avgPlacement > 8 || s.compsCount < 1 ||
      ![s.compsCount, s.winCount, s.top4Count].every(Number.isSafeInteger) || s.winCount < 0 || s.winCount > s.top4Count || s.top4Count > s.compsCount ||
      Math.abs(s.winCount / s.compsCount - s.winRate) > .00011 || Math.abs(s.top4Count / s.compsCount - s.top4Rate) > .00011) throw new Error('统计字段无效。');
    const units = row.units.map((u: any) => {
      if (!Array.isArray(u.itemMetas) || u.itemMetas.length > 3 || !(u.priority === null || (Number.isInteger(u.priority) && u.priority >= 1 && u.priority <= 12))) throw new Error('阵容配装字段无效。');
      if(u.cell!==null&&!validCell(u.cell))throw new Error('阵容站位坐标无效。');
      return { id: id(u.key), name: text(u.meta?.name), priority: u.isCore === true ? u.priority : null, cell:u.cell===null?null:{x:u.cell.x,y:u.cell.y},
        ...(validIconUrl(u.meta?.imageUrl)?{iconUrl:u.meta.imageUrl}:{}), items: u.itemMetas.map((i: any) => ({ id: id(i.apiName), name: text(i.name) })) };
    });
    if (new Set(units.map((u: any) => u.id)).size !== units.length) throw new Error('棋子 ID 重复。');
    const cells=units.filter((u:any)=>u.cell).map((u:any)=>`${u.cell.x},${u.cell.y}`);
    if(new Set(cells).size!==cells.length)throw new Error('阵容站位重复。');
    const coreUnits = units.filter((u: any) => u.priority !== null).sort((a: any, b: any) => a.priority - b.priority);
    const core = coreUnits.map((u: any) => u.name);
    const english = text(row.name?.en_US), chinese = row.name?.zh_CN ? text(row.name.zh_CN) : english;
    return { id: key, name: chinese === english ? english : `${chinese} / ${english}`, sourceName: 'OP.GG', sourceUrl: COMPS_URL,
      patch: expectedPatch, updatedAt: new Date(stamp).toISOString(), teamCode: row.teamCode,
      winRate: Number((s.winRate * 100).toFixed(2)), top4Rate: Number((s.top4Rate * 100).toFixed(2)), averagePlace: s.avgPlacement, games: s.compsCount,
      core, flex: units.filter((u: any) => u.priority === null).map((u: any) => u.name), units,
      items: coreUnits.map((u: any) => `${u.name}：${u.items.map((i: any) => i.name).join(' / ')}`),
      plan: `终盘 ${units.length} 位棋子；配装优先关注 ${core.join(' / ')}。需结合来牌与经济选择。` };
  });
}
export function parseItemPage(html: string, names: Record<string, string> = {}, now = Date.now()): ItemReference {
  if (!html.includes('Learn about the guides for set 18.')) throw new Error('装备页面当前赛季已改变。');
  const maps: any[] = []; walkPublic(publicRecords(html), obj => { if (obj.ITEMS) { maps.push(obj.ITEMS); return false; } });
  if (maps.length !== 1 || !maps[0].DA_Component_BFSword || !maps[0].DA_Deathblade) throw new Error('装备页面结构或赛季已改变。');
  const items: ItemDefinition[] = Object.values(maps[0]).flatMap((v: any) => {
    // The Set 18 page also embeds revival / historical entries with Set 18 CDN paths.
    // Current Enchanted Wilds item IDs use DA_; never infer set solely from image URL.
    if (typeof v.apiName !== 'string' || !v.apiName.startsWith('DA_') || v.revival || !['component', 'core', 'emblem', 'artifact', 'radiant'].includes(v.category)) return [];
    if (!Array.isArray(v.composition) || ![0, 2].includes(v.composition.length)) throw new Error('装备配方无效。');
    const key = id(v.apiName); const englishName = text(v.name);
    return [{ id: key, name: names[key] ? text(names[key]) : englishName, englishName, ...(validIconUrl(v.imageUrl)?{iconUrl:v.imageUrl}:{}), category: v.category, recipe: v.composition.map(id) }];
  });
  const components = items.filter(i => i.category === 'component'); const recipes = items.filter(i => i.recipe.length);
  if (components.length !== 10 || recipes.length !== 55 || new Set(items.map(i => i.id)).size !== items.length) throw new Error('装备数量或配方覆盖已改变。');
  if (recipes.some(i => i.recipe.some(k => !components.some(c => c.id === k))) || new Set(recipes.map(i => [...i.recipe].sort().join('|'))).size !== 55) throw new Error('装备配方关系无效。');
  return { set: 18, patch: PUBLIC_PATCH, checkedAt: new Date(now).toISOString(), sourceUrl: ITEMS_URL, items };
}
