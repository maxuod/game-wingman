import { parseEnv } from 'node:util';
import { PROVIDERS, type ProviderId } from './providers';

export const EMPTY_KEY_TEMPLATE = JSON.stringify(Object.fromEntries(Object.values(PROVIDERS).map(p=>[p.keyEnv,''])),null,2)+'\n';

/** Only named key fields are imported; model/enabled flags never grant request consent. */
export function parseKeyFile(contents:string,json:boolean):Partial<Record<ProviderId,string>> {
  try {
    if(Buffer.byteLength(contents,'utf8')>20000)throw new Error();
    const text=contents.replace(/^\uFEFF/,'');
    const values:unknown=json?JSON.parse(text):parseEnv(text);
    if(!values||typeof values!=='object'||Array.isArray(values))throw new Error();
    const keys:Partial<Record<ProviderId,string>>={};
    for(const id of Object.keys(PROVIDERS) as ProviderId[]){
      const value=(values as Record<string,unknown>)[PROVIDERS[id].keyEnv];
      if(value===undefined||value==='')continue;
      if(typeof value!=='string'||!value.trim()||value.length>4096||/[\s\x00-\x1f\x7f]/.test(value.trim()))throw new Error();
      keys[id]=value.trim();
    }
    if(!Object.keys(keys).length)throw new Error();return keys;
  }catch{throw new Error('配置文件需包含非空的 DEEPSEEK_API_KEY、GEMINI_API_KEY 或 MINIMAX_API_KEY；请检查格式。');}
}
