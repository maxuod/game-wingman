import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CompAugments, CompGuide } from '../shared/types';
import { validIconUrl } from './icon-cache';
import { COMPS_URL, downloadPublicPage, flightRecords, parseCompPage, readPublicResponse, validPatch } from './public-data';

const TTL=6*3600000, MAX_AGE=72*3600000;
const tiers=['silver','gold','prism'] as const;
function plain(v:unknown,max=120):v is string {return typeof v==='string'&&v.length>0&&v.length<=max&&!/[<>\u0000-\u001f]/.test(v);}
export function parseAugments(payload:string):CompAugments['entries'] {
  // Only the public getAugment result referenced by the Flight root is accepted.
  const root=/^0:(\{[^\n]+\})$/m.exec(payload);if(!root)throw new Error('海克斯来源结构已改变。');
  const ref=JSON.parse(root[1]).a;if(typeof ref!=='string'||!/^\$@[\da-f]+$/.test(ref))throw new Error('海克斯来源结构已改变。');
  const row=new RegExp(`^${ref.slice(2)}:(\\{[^\\n]+\\})$`,'m').exec(payload);if(!row)throw new Error('海克斯来源未返回推荐。');
  const records=flightRecords(payload);const value=JSON.parse(row[1]);
  if(!records.length||Object.keys(value).sort().join(',')!=='gold,prism,silver')throw new Error('海克斯来源结构已改变。');
  const entries:CompAugments['entries']=[];
  for(const tier of tiers){if(!Array.isArray(value[tier])||value[tier].length>30)throw new Error('海克斯数量异常。');
    for(const a of value[tier]){
      if(!plain(a._key,100)||!/^DA_[\w]+$/.test(a._key)||!plain(a.name)||a.tier!==tier)throw new Error('海克斯名称或等级无效。');
      const rounds=['21','32','42'].filter(r=>a.org?.['isRound'+r]===true).map(r=>r[0]+'-'+r[1]);
      entries.push({id:a._key,name:a.name,tier,rounds,...(validIconUrl(a.imageUrl)?{iconUrl:a.imageUrl}:{})});
    }
  }
  if(new Set(entries.map(a=>a.id)).size!==entries.length)throw new Error('海克斯 ID 重复。');return entries;
}
export function validAugmentCache(v:unknown,guide:CompGuide,now:number):v is CompAugments {
  const c=v as CompAugments;
  return !!c&&c.guideId===guide.id&&c.patch===guide.patch&&typeof c.checkedAt==='string'&&Number.isFinite(Date.parse(c.checkedAt))&&Date.parse(c.checkedAt)<=now&&
    typeof c.stale==='boolean'&&(c.iconsChecked===undefined||typeof c.iconsChecked==='boolean')&&Array.isArray(c.entries)&&c.entries.length<=90&&new Set(c.entries.map(a=>a.id)).size===c.entries.length&&
    c.entries.every(a=>plain(a.id,100)&&/^DA_[\w]+$/.test(a.id)&&plain(a.name)&&(a.iconUrl===undefined||validIconUrl(a.iconUrl))&&tiers.includes(a.tier)&&Array.isArray(a.rounds)&&a.rounds.length<=3&&a.rounds.every(r=>['2-1','3-2','4-2'].includes(r)));
}
export class CompAugmentService {
  private pending=new Map<string,Promise<CompAugments>>();
  private attempts=new Map<string,number>();
  private source:Promise<{action:string;ids:Set<string>;patch:string;at:number}>|null=null;
  constructor(private directory:string,private fetcher:typeof fetch=(...args)=>fetch(...args),private clock=()=>Date.now()){}
  get(guide:CompGuide):Promise<CompAugments>{
    if(!/^[\da-f]{32}$/.test(guide.id)||!validPatch(guide.patch))return Promise.reject(new Error('阵容无效。'));
    const key=guide.patch+'-'+guide.id;const existing=this.pending.get(key);if(existing)return existing;
    const request=this.load(guide,key).finally(()=>this.pending.delete(key));this.pending.set(key,request);return request;
  }
  private async action(guide:CompGuide):Promise<string>{
    if(this.source){const previous=await this.source.catch(()=>null);if(!previous||previous.patch!==guide.patch||this.clock()-previous.at>=TTL)this.source=null;}
    if(!this.source)this.source=(async()=>{
      const html=await downloadPublicPage(COMPS_URL,this.fetcher);
      const guides=parseCompPage(html,this.clock(),guide.patch);
      // Follow only the known public recommendation module advertised by this page.
      // A deployment may change this module: fail visibly instead of running remote JS.
      const urls=[...html.matchAll(/<script[^>]+src="(https:\/\/c-tft-web\.op\.gg\/_next\/static\/chunks\/9558-[\da-f]{16}\.js)"/g)].map(m=>m[1]);
      if(new Set(urls).size!==1)throw new Error('海克斯来源接口已改变，请查看 OP.GG。');
      const js=await readPublicResponse(await this.fetcher(urls[0],{signal:AbortSignal.timeout(15000),redirect:'error'}));
      const actions=[...js.matchAll(/createServerReference\)\("([\da-f]{40,64})",[^;]{0,240}"getAugment"\)/g)].map(m=>m[1]);
      if(actions.length!==1)throw new Error('海克斯来源接口已改变，请查看 OP.GG。');
      return {action:actions[0],ids:new Set(guides.map(g=>g.id)),patch:guide.patch,at:this.clock()};
    })();
    const source=await this.source;if(!source.ids.has(guide.id))throw new Error('来源已移除此阵容，等待排名刷新。');return source.action;
  }
  private async load(guide:CompGuide,key:string):Promise<CompAugments>{
    const file=path.join(this.directory,key+'.json'),now=this.clock();let cached:CompAugments|null=null;
    try{if((await stat(file)).size>80000)throw new Error('large');const value:unknown=JSON.parse(await readFile(file,'utf8'));if(validAugmentCache(value,guide,now))cached=value;}catch{/* Missing/invalid public cache is fetched again. */}
    if(cached?.iconsChecked&&now-Date.parse(cached.checkedAt)<TTL)return {...cached,stale:false};
    try {
      const attempt=this.attempts.get(key);if(attempt!==undefined&&now-attempt<3600000)throw new Error('海克斯读取失败，稍后重试或查看来源。');
      this.attempts.set(key,now);
      const action=await this.action(guide);
      const response=await this.fetcher(COMPS_URL,{method:'POST',signal:AbortSignal.timeout(15000),redirect:'error',
        headers:{'Next-Action':action,Accept:'text/x-component','Content-Type':'text/plain;charset=UTF-8'},
        body:JSON.stringify([{deckId:guide.id,locale:'zh-cn',version:guide.patch}])});
      if(!response.headers.get('content-type')?.includes('text/x-component'))throw new Error('海克斯来源暂不可用。');
      const entries=parseAugments(await readPublicResponse(response));
      const value:CompAugments={guideId:guide.id,patch:guide.patch,checkedAt:new Date(this.clock()).toISOString(),stale:false,iconsChecked:true,entries};
      await mkdir(this.directory,{recursive:true});await writeFile(file+'.tmp',JSON.stringify(value),'utf8');await rename(file+'.tmp',file);
      this.attempts.delete(key);return value;
    }catch{if(cached&&now-Date.parse(cached.checkedAt)<MAX_AGE)return {...cached,stale:true};throw new Error('海克斯推荐暂未读到，可查看 OP.GG 来源；稍后重新打开此阵容重试。');}
  }
}
