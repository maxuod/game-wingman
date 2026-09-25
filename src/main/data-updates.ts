import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompGuide, DataUpdateState, OfficialVersion, RankChange } from '../shared/types';
import { GUIDE_PATCH, ITEM_REFERENCE, REVIEWED_GUIDES, refreshGuides } from './guides';
import { COMPS_URL, officialPatchUrl, validPatch, validTeamCode, validCell } from './public-data';
import { fetchOfficialVersion } from './official-updates';
import reviewedOfficial from './data/official-version.json';
import { validIconUrl } from './icon-cache';

export const RANKING_INTERVAL = 6 * 3600000;
export const RETRY_INTERVAL = 3600000;
const DAY = 86400000;
interface Cache {
  schema: 1; official: OfficialVersion; entries: CompGuide[];
  officialCheckedAt: string | null; rankingCheckedAt: string | null;
  officialAttemptAt: string | null; rankingAttemptAt: string | null;
  rankingChangedAt: string | null; comparedAt: string | null;
  changes: RankChange[]; added: number; removed: number;
}
function initialCache(): Cache {
  return {schema:1, official:structuredClone(reviewedOfficial), entries:structuredClone(REVIEWED_GUIDES), officialCheckedAt:null,
    rankingCheckedAt:null, officialAttemptAt:null, rankingAttemptAt:null, rankingChangedAt:null, comparedAt:null, changes:[], added:0, removed:0};
}
function localDay(time: number): string { const date = new Date(time); return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`; }
function due(checked: string | null, attempt: string | null, interval: number, now: number): boolean {
  if (attempt && (!checked || Date.parse(attempt) > Date.parse(checked)) && now - Date.parse(attempt) < RETRY_INTERVAL) return false;
  return !checked || localDay(Date.parse(checked)) !== localDay(now) || now - Date.parse(checked) >= interval;
}
function nextDue(checked: string | null, attempt: string | null, interval: number, now: number): number {
  if (attempt && (!checked || Date.parse(attempt) > Date.parse(checked))) return Math.max(now, Date.parse(attempt) + RETRY_INTERVAL);
  if (!checked) return now;
  const midnight = new Date(Date.parse(checked)); midnight.setHours(24, 0, 0, 0);
  return Math.max(now, Math.min(Date.parse(checked) + interval, midnight.getTime()));
}
function ranking(entries: CompGuide[], key: 'top4Rate' | 'winRate'): Map<string,number> {
  return new Map([...entries].sort((a,b)=>b[key]-a[key] || a.averagePlace-b.averagePlace || b.games-a.games).map((g,i)=>[g.id,i+1]));
}
export function compareRankings(previous: CompGuide[], next: CompGuide[]): {changes:RankChange[];added:number;removed:number} {
  if (previous[0]?.patch !== next[0]?.patch) return {changes:[],added:0,removed:0};
  const old = new Map(previous.map(g=>[g.id,g]));
  const before4=ranking(previous,'top4Rate'), before1=ranking(previous,'winRate'), after4=ranking(next,'top4Rate'), after1=ranking(next,'winRate');
  const changes=next.map((g):RankChange=>({id:g.id,top4:old.has(g.id)?before4.get(g.id)!-after4.get(g.id)!:null,
    win:old.has(g.id)?before1.get(g.id)!-after1.get(g.id)!:null,
    top4Rate:old.has(g.id)?Number((g.top4Rate-old.get(g.id)!.top4Rate).toFixed(2)):0,
    winRate:old.has(g.id)?Number((g.winRate-old.get(g.id)!.winRate).toFixed(2)):0})).filter(c=>c.top4===null||c.top4!==0||c.win!==0||c.top4Rate!==0||c.winRate!==0);
  return {changes,added:next.filter(g=>!old.has(g.id)).length,removed:previous.filter(g=>!after4.has(g.id)).length};
}
function cleanText(v:unknown,max=250):v is string { return typeof v==='string' && v.length>0 && v.length<=max && !/[<>\u0000-\u001f]/.test(v); }
function cleanId(v:unknown):v is string { return cleanText(v,100) && /^[\w-]+$/.test(v); }
function timestamp(v: unknown, now:number):boolean { return typeof v==='string' && Number.isFinite(Date.parse(v)) && Date.parse(v)<=now+300000; }
// Local public caches receive the same bounds and plain-text restrictions as network facts.
export function validDataCache(raw:unknown, now=Date.now()):raw is Cache {
  try {
    const c=raw as Cache, o=c.official;
    if (c.schema!==1 || !validPatch(o.patch) || o.url!==officialPatchUrl(o.patch) || !timestamp(o.publishedAt,now) ||
      !(o.hotfix===null||/^[B-Z]$/.test(o.hotfix)) || !/^[\da-f]{64}$/.test(o.contentHash) || typeof o.mentionsRecipes!=='boolean') return false;
    for(const key of ['officialCheckedAt','rankingCheckedAt','officialAttemptAt','rankingAttemptAt','rankingChangedAt','comparedAt'] as const) if(c[key]!==null&&!timestamp(c[key],now))return false;
    if (!Array.isArray(c.entries)||!c.entries.length||c.entries.length>500||new Set(c.entries.map(g=>g.id)).size!==c.entries.length)return false;
    for(const g of c.entries) {
      if(!cleanId(g.id)||!cleanText(g.name)||!validPatch(g.patch)||g.patch!==c.entries[0].patch||!validTeamCode(g.teamCode,g.patch)||g.sourceUrl!==COMPS_URL||g.sourceName!=='OP.GG'||!timestamp(g.updatedAt,now)||
        ![g.winRate,g.top4Rate,g.averagePlace,g.games].every(Number.isFinite)||g.winRate<0||g.winRate>g.top4Rate||g.top4Rate>100||g.averagePlace<1||g.averagePlace>8||!Number.isSafeInteger(g.games)||g.games<1)return false;
      if(!Array.isArray(g.units)||!g.units.length||g.units.length>12||new Set(g.units.map(u=>u.id)).size!==g.units.length)return false;
      const cells=g.units.filter(u=>u.cell).map(u=>`${u.cell!.x},${u.cell!.y}`);if(new Set(cells).size!==cells.length)return false;
      for(const u of g.units)if(!cleanId(u.id)||!cleanText(u.name,120)||(u.iconUrl!==undefined&&!validIconUrl(u.iconUrl))||!(u.cell===null||validCell(u.cell))||!(u.priority===null||Number.isInteger(u.priority)&&u.priority>=1&&u.priority<=12)||
        !Array.isArray(u.items)||u.items.length>3||u.items.some(i=>!cleanId(i.id)||!cleanText(i.name,120)))return false;
      if(!cleanText(g.plan,2500)||[g.core,g.flex,g.items].some(a=>!Array.isArray(a)||a.length>12||a.some(s=>!cleanText(s,600))))return false;
    }
    if(!Array.isArray(c.changes)||c.changes.length>500||new Set(c.changes.map(x=>x.id)).size!==c.changes.length||
      ![c.added,c.removed].every(n=>Number.isInteger(n)&&n>=0&&n<=500))return false;
    return c.changes.every(x=>c.entries.some(g=>g.id===x.id)&&[x.top4,x.win].every(n=>n===null||Number.isInteger(n)&&Math.abs(n)<500)&&[x.top4Rate,x.winRate].every(n=>Number.isFinite(n)&&Math.abs(n)<=100));
  } catch {return false;}
}
export class PublicDataUpdater {
  private cache=initialCache();
  private inFlight:Promise<void>|null=null;
  private message='启动后自动检查官方补丁与阵容排名。';
  sourceKind:'reviewed'|'cached'|'refreshed'='reviewed';
  constructor(private readonly file:string,private readonly fetcher:typeof fetch=(...args)=>fetch(...args),private readonly clock=()=>Date.now()){}
  async load():Promise<void> {
    try {
      if((await stat(this.file)).size>2_000_000)throw new Error('oversized cache');
      const raw:unknown=JSON.parse(await readFile(this.file,'utf8'));
      if(!validDataCache(raw,this.clock()))throw new Error('invalid cache');
      this.cache=raw;this.sourceKind='cached';this.message='已恢复本地资料；按更新时间自动决定是否刷新。';
    } catch {this.message='使用内置资料，启动后检查最新补丁与排名。';}
  }
  entries():CompGuide[]{return structuredClone(this.cache.entries);}
  patch():string{return this.cache.official?.patch??GUIDE_PATCH;}
  view():DataUpdateState {
    const c=this.cache, now=this.clock();
    const pending=c.official.patch!==ITEM_REFERENCE.patch || c.official.contentHash!==reviewedOfficial.contentHash;
    return {official:structuredClone(c.official),officialCheckedAt:c.officialCheckedAt,rankingCheckedAt:c.rankingCheckedAt,rankingChangedAt:c.rankingChangedAt,
      comparedAt:c.comparedAt,changes:structuredClone(c.changes),added:c.added,removed:c.removed,message:this.message,
      nextCheckAt:new Date(Math.min(nextDue(c.officialCheckedAt,c.officialAttemptAt,DAY,now),nextDue(c.rankingCheckedAt,c.rankingAttemptAt,RANKING_INTERVAL,now))).toISOString(),
      recipesPending:pending,recipeMessage:pending?`官方补丁已有变更；合成表仍为 ${ITEM_REFERENCE.patch} 核查版，等待配方确认，暂缓合成建议。`:
        `合成表沿用 ${ITEM_REFERENCE.patch} 已核查配方；只随官方变更核对，不随阵容排名刷新。`};
  }
  isDue():boolean {const c=this.cache,n=this.clock();return due(c.officialCheckedAt,c.officialAttemptAt,DAY,n)||due(c.rankingCheckedAt,c.rankingAttemptAt,RANKING_INTERVAL,n);}
  check(force=false):Promise<void> {
    if(this.inFlight)return this.inFlight;
    if(!force&&!this.isDue())return Promise.resolve();
    this.inFlight=this.update(force).finally(()=>{this.inFlight=null;});return this.inFlight;
  }
  private async save():Promise<void> {
    await mkdir(path.dirname(this.file),{recursive:true});
    const temporary=this.file+'.tmp';await writeFile(temporary,JSON.stringify(this.cache),'utf8');await rename(temporary,this.file);
  }
  private async update(force:boolean):Promise<void> {
    const c=this.cache, now=this.clock(), checkedAt=new Date(now).toISOString();const messages:string[]=[];let officialChanged=false;
    if(force||due(c.officialCheckedAt,c.officialAttemptAt,DAY,now)) {
      c.officialAttemptAt=checkedAt;
      try {
        const latest=await fetchOfficialVersion(this.fetcher,now);
        const sequence=(p:string)=>Number(p.split('.')[0])*100+Number(p.split('.')[1]);
        if(Date.parse(latest.publishedAt)<Date.parse(c.official.publishedAt) || sequence(latest.patch)<sequence(c.official.patch) ||
          latest.patch===c.official.patch && (latest.hotfix??'A')<(c.official.hotfix??'A'))throw new Error('官方来源暂时返回旧补丁。');
        officialChanged=latest.contentHash!==c.official.contentHash||latest.patch!==c.official.patch;
        c.official=latest;c.officialCheckedAt=checkedAt;
        messages.push(`官方 ${latest.patch}${latest.hotfix??''}${officialChanged?' 有更新':' 已核对'}`);
      } catch {messages.push('官方检查失败，保留已知版本；1 小时后可自动重试');}
    }
    if(force||officialChanged||due(c.rankingCheckedAt,c.rankingAttemptAt,RANKING_INTERVAL,now)) {
      c.rankingAttemptAt=checkedAt;
      try {
        const entries=await refreshGuides(this.fetcher,c.official.patch,now);
        if(entries[0].patch===c.entries[0]?.patch&&Date.parse(entries[0].updatedAt)<Date.parse(c.entries[0].updatedAt))throw new Error('来源返回旧统计。');
        const samePatch=c.entries[0]?.patch===entries[0].patch;
        const comparison=compareRankings(c.entries,entries);
        const changed=!samePatch||comparison.changes.length>0||comparison.added>0||comparison.removed>0;
        c.comparedAt=samePatch?c.entries[0].updatedAt:null;
        Object.assign(c,comparison);c.entries=entries;c.rankingCheckedAt=checkedAt;
        if(changed)c.rankingChangedAt=checkedAt;
        this.sourceKind='refreshed';
        messages.push(samePatch?changed?`排名/胜率变化 ${comparison.changes.length} 套，新增 ${comparison.added}、移出 ${comparison.removed}`:'排名和胜率未变，统计已核对':`已切换 ${entries[0].patch} 的 ${entries.length} 套阵容，新补丁重新建立比较基准`);
      } catch(error) {messages.push(`${error instanceof Error?error.message:'阵容刷新失败。'} 保留带日期的缓存，1 小时后可自动重试`);}
    }
    this.message=messages.join('；');
    try{await this.save();}catch{this.message+='；本地缓存保存失败，下次启动会重新检查';}
  }
}
export function initialDataUpdates():DataUpdateState {
  return {official:structuredClone(reviewedOfficial),officialCheckedAt:null,rankingCheckedAt:null,rankingChangedAt:null,comparedAt:null,nextCheckAt:null,
    changes:[],added:0,removed:0,message:'启动后自动检查官方补丁与阵容排名。',recipesPending:false,recipeMessage:'装备配方沿用已核查版本。'};
}
