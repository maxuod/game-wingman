import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const MAX_BYTES=256000, TTL=7*86400000;
export function validIconUrl(url:unknown):url is string {
  return typeof url==='string'&&url.length<=350&&/^https:\/\/c-tft-api\.op\.gg\/img\/set\/(?:1[8-9]|[2-9]\d)\/tft-(?:item|augment|champion\/tiles)\/[A-Za-z0-9_.-]+\.(?:png|jpg|jpeg|webp)$/.test(url);
}
function imageType(bytes:Buffer):string|null {
  if(bytes.length<12||bytes.length>MAX_BYTES)return null;
  if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
  if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
  if(bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP')return 'image/webp';
  return null;
}
export class IconCache {
  private pending=new Map<string,Promise<string|null>>();
  private memory=new Map<string,{data:string|null;until:number}>();
  private running=0;private queue:Array<()=>void>=[];
  constructor(private directory:string,private fetcher:typeof fetch=(...args)=>fetch(...args),private clock=()=>Date.now()){}
  async get(url:unknown):Promise<string|null>{
    if(!validIconUrl(url))return null;
    const cached=this.memory.get(url);if(cached&&cached.until>this.clock())return cached.data;
    const pending=this.pending.get(url);if(pending)return pending;
    if(this.pending.size>=512)return null;
    const request=this.load(url).then(data=>{
      if(this.memory.size>=512)this.memory.delete(this.memory.keys().next().value!);
      this.memory.set(url,{data,until:this.clock()+(data?TTL:300000)});return data;
    }).finally(()=>this.pending.delete(url));this.pending.set(url,request);return request;
  }
  private async load(url:string):Promise<string|null>{
    const file=path.join(this.directory,createHash('sha256').update(url).digest('hex')+'.img');let bytes:Buffer|null=null;
    try{const meta=await stat(file);if(meta.size<=MAX_BYTES&&this.clock()-meta.mtimeMs>=0&&this.clock()-meta.mtimeMs<TTL){const local=await readFile(file);if(imageType(local))bytes=local;}}catch{/* First view fetches a public icon. */}
    if(!bytes){
      if(this.running>=4)await new Promise<void>(resolve=>this.queue.push(resolve));else this.running++;
      try{
        const response=await this.fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'error',credentials:'omit'});
        if(!response.ok||!response.body)throw new Error('Icon unavailable');
        const reader=response.body.getReader(),chunks:Uint8Array[]=[];let size=0;
        try{while(true){const r=await reader.read();if(r.done)break;size+=r.value.length;if(size>MAX_BYTES)throw new Error('Icon too large');chunks.push(r.value);}}finally{await reader.cancel().catch(()=>{});}
        bytes=Buffer.concat(chunks);if(!imageType(bytes))return null;
        // Cache failures should not prevent the current in-memory image from displaying.
        try{await mkdir(this.directory,{recursive:true});await writeFile(file+'.tmp',bytes);await rename(file+'.tmp',file);}catch{}
      }catch{return null;}finally{const next=this.queue.shift();if(next)next();else this.running--;}
    }
    return `data:${imageType(bytes)};base64,${bytes.toString('base64')}`;
  }
}
