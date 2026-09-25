import type { CompGuide, GuideState, ItemReference } from '../shared/types';
import snapshot from './data/opgg-comps.json';
import itemSnapshot from './data/opgg-items.json';
import { COMPS_URL, ITEMS_URL, PUBLIC_PATCH, downloadPublicPage, parseCompPage, parseItemPage } from './public-data';
export const GUIDE_PATCH = PUBLIC_PATCH;
export const GUIDE_MAX_AGE = 72 * 3600000;
export const GUIDE_URL = COMPS_URL;
// Versioned factual source snapshot; strategy text is a local summary template.
export const REVIEWED_GUIDES: CompGuide[] = snapshot;
export const ITEM_REFERENCE = itemSnapshot as ItemReference;
export function freshGuide(guide: CompGuide, now = Date.now(), patch = GUIDE_PATCH): boolean {
  const age = now - Date.parse(guide.updatedAt);
  return guide.patch === patch && Number.isFinite(age) && age >= -300000 && age <= GUIDE_MAX_AGE && guide.games >= 400;
}
export function rankGuides(guides: CompGuide[], order: 'win' | 'top4', now = Date.now(), patch = GUIDE_PATCH): CompGuide[] {
  return guides.filter(g => freshGuide(g, now, patch)).sort((a,b)=>(order==='win' ? b.winRate-a.winRate : b.top4Rate-a.top4Rate)||a.averagePlace-b.averagePlace||b.games-a.games);
}
export function initialGuides(): GuideState {
  return { patch:GUIDE_PATCH, enabled:true, order:'top4', selectedId:null, entries:structuredClone(REVIEWED_GUIDES), loading:false,
    message:`已载入 OP.GG 全部 ${REVIEWED_GUIDES.length} 套阵容及变体 · 默认前四率排序`, sourceKind:'reviewed', recommendedId:null, freshIds:[],
    scope:'OP.GG · 全服 · 全段位 · 近24小时 · 18.3 · 未隔离18.3B热修' };
}
export const parseGuideStats = parseCompPage;
export async function refreshGuides(fetcher: typeof fetch = fetch, patch = GUIDE_PATCH, now = Date.now()): Promise<CompGuide[]> {
  return parseCompPage(await downloadPublicPage(COMPS_URL, fetcher), now, patch);
}
export async function refreshItems(fetcher: typeof fetch = fetch): Promise<ItemReference> {
  return parseItemPage(await downloadPublicPage(ITEMS_URL, fetcher), Object.fromEntries(ITEM_REFERENCE.items.map(i=>[i.id,i.name])));
}
