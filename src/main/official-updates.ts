import { createHash } from 'node:crypto';
import type { OfficialVersion } from '../shared/types';
import { downloadPublicPage, MAX_PUBLIC_BYTES, OFFICIAL_UPDATES_URL, officialPatchUrl, validPatch } from './public-data';

function pageData(html: string): any {
  if (Buffer.byteLength(html) > MAX_PUBLIC_BYTES) throw new Error('官方页面过大。');
  const matches = [...html.matchAll(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/g)];
  if (matches.length !== 1) throw new Error('官方页面结构已改变。');
  const page = JSON.parse(matches[0][1])?.props?.pageProps?.page;
  if (!page || !Array.isArray(page.blades) || page.blades.length > 100) throw new Error('官方页面数据无效。');
  return page;
}
export function latestOfficialPatch(html: string, now = Date.now()): { patch: string; publishedAt: string } {
  const page = pageData(html);
  if (page.url !== OFFICIAL_UPDATES_URL) throw new Error('官方更新来源不符。');
  const cards = page.blades.filter((b: any) => b.type === 'articleCardGrid').flatMap((b: any) => b.items ?? []);
  const patches = cards.flatMap((card: any) => {
    const match = /^(?:Teamfight Tactics|TFT) [Pp]atch (\d+\.\d+)(?: [Nn]otes)?$/.exec(card.title ?? '');
    if (!match || !validPatch(match[1]) || card.category?.machineName !== 'game_updates' ||
      card.product?.machineName !== 'teamfight_tactics' || !card.tags?.some((t: any) => t.machineName === 'patch_notes')) return [];
    const url = card.action?.payload?.url;
    if (typeof url !== 'string' || new URL(url, OFFICIAL_UPDATES_URL).href.replace(/\/$/, '') !== officialPatchUrl(match[1]).replace(/\/$/, '')) return [];
    const date = Date.parse(card.publishedAt);
    if (!Number.isFinite(date) || date > now) return [];
    return [{ patch: match[1], publishedAt: new Date(date).toISOString() }];
  });
  patches.sort((a: any, b: any) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  if (!patches.length || now - Date.parse(patches[0].publishedAt) > 60 * 86400000) throw new Error('无法确认最新官方补丁。');
  return patches[0];
}
export function parseOfficialNotes(html: string, expected: {patch: string; publishedAt: string}): OfficialVersion {
  const page = pageData(html), url = officialPatchUrl(expected.patch);
  const mast = page.blades.filter((b: any) => b.type === 'articleMasthead');
  const sections = page.blades.filter((b: any) => b.type === 'patchNotesRichText' && b.fragmentId === expected.patch);
  if (page.url !== url || mast.length !== 1 || !new RegExp(`^(?:Teamfight Tactics|TFT) [Pp]atch ${expected.patch.replace('.', '\\.')}([ ]+[Nn]otes)?$`).test(mast[0].title) ||
    Date.parse(mast[0].publishDate) !== Date.parse(expected.publishedAt) || sections.length !== 1 || typeof sections[0].richText?.body !== 'string') throw new Error('官方补丁详情不匹配。');
  const body = sections[0].richText.body;
  const plain = body.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length < 40) throw new Error('官方补丁正文不完整。');
  const fixes = [...plain.matchAll(new RegExp(`\\b${expected.patch.replace('.', '\\.')}\\s*([B-Z])\\s+(?:PATCH|HOTFIX)\\b`, 'gi'))].map(m => m[1].toUpperCase()).sort();
  return { patch: expected.patch, hotfix: fixes.at(-1) ?? null, url, publishedAt: expected.publishedAt,
    contentHash: createHash('sha256').update(body).digest('hex'), mentionsRecipes: /\brecipes?\b/i.test(plain) };
}
export async function fetchOfficialVersion(fetcher: typeof fetch = fetch, now = Date.now()): Promise<OfficialVersion> {
  const patch = latestOfficialPatch(await downloadPublicPage(OFFICIAL_UPDATES_URL, fetcher), now);
  return parseOfficialNotes(await downloadPublicPage(officialPatchUrl(patch.patch), fetcher), patch);
}
