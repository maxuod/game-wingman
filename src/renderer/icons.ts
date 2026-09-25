import type { ItemDefinition, ItemReference } from '../shared/types.js';
const requests=new Map<string,Promise<string|null>>();
const visible=new IntersectionObserver(entries=>{for(const entry of entries)if(entry.isIntersecting){visible.unobserve(entry.target);void load(entry.target as HTMLElement);}}, {rootMargin:'60px'});
// Watch only attached icons: unopened/rebuilt cards must not retain detached nodes.
new MutationObserver(records=>{for(const record of records){
  for(const node of record.removedNodes)if(node instanceof HTMLElement&&!node.isConnected){visible.unobserve(node);for(const child of node.querySelectorAll('.entity-icon'))visible.unobserve(child);}
  for(const node of record.addedNodes)if(node instanceof HTMLElement&&node.isConnected){const icons=[...(node.matches('.entity-icon[data-icon-url]')?[node]:[]),...node.querySelectorAll('.entity-icon[data-icon-url]')];for(const icon of icons)if(!icon.querySelector('img'))visible.observe(icon);}
}}).observe(document.body,{childList:true,subtree:true});
async function load(node:HTMLElement){
  const url=node.dataset.iconUrl;if(!url||!node.isConnected)return;
  let request=requests.get(url);if(!request){request=window.desktop.loadIcon(url).then(r=>r.ok?r.value:null).catch(()=>null);if(requests.size>=512)requests.delete(requests.keys().next().value!);requests.set(url,request);void request.then(value=>{if(!value)setTimeout(()=>{if(requests.get(url)===request)requests.delete(url)},300000);});}
  const data=await request;if(!data||!node.isConnected)return;
  const img=document.createElement('img');img.alt='';img.decoding='async';img.draggable=false;
  img.addEventListener('load',()=>node.classList.add('icon-loaded'),{once:true});
  img.addEventListener('error',()=>{img.remove();node.classList.remove('icon-loaded');},{once:true});
  img.src=data;node.prepend(img);
}
export function entityIcon(name:string,url?:string,options:{kind?:string;count?:number;small?:boolean;focus?:boolean;detail?:string}={}):HTMLSpanElement{
  const icon=document.createElement('span');icon.className=`entity-icon icon-${options.kind??'item'}${options.small?' icon-small':''}`;icon.dataset.name=name;
  const title=name+(options.count!==undefined?` ×${options.count}`:'')+(options.detail?' · '+options.detail:'');icon.title=title;icon.setAttribute('role','img');icon.setAttribute('aria-label',title);icon.tabIndex=options.focus===false?-1:0;
  const fallback=document.createElement('span');fallback.className='icon-fallback';fallback.textContent=name;fallback.setAttribute('aria-hidden','true');icon.append(fallback);
  if(options.count!==undefined){const badge=document.createElement('span');badge.className='icon-count';badge.textContent=String(options.count);badge.setAttribute('aria-hidden','true');icon.append(badge);}
  if(url)icon.dataset.iconUrl=url;return icon;
}
export function symbol(text:string):HTMLElement{const span=document.createElement('span');span.className='recipe-symbol';span.textContent=text;span.setAttribute('aria-hidden','true');return span;}
export function itemIcon(id:string,reference:ItemReference,options:Parameters<typeof entityIcon>[2]={}):HTMLElement{
  const item=reference.items.find(i=>i.id===id);return entityIcon(item?.name??id,item?.iconUrl,options);
}
export function recipeIcons(item:ItemDefinition,reference:ItemReference,small=false):HTMLElement{
  const row=document.createElement('span');row.className='icon-recipe';
  const names=item.recipe.map(id=>reference.items.find(i=>i.id===id)?.name??id);
  row.title=names.join(' + ')+' → '+item.name;row.setAttribute('aria-label',row.title);
  item.recipe.forEach((id,index)=>{if(index)row.append(symbol('+'));row.append(itemIcon(id,reference,{small}));});
  if(item.recipe.length)row.append(symbol('→'));row.append(entityIcon(item.name,item.iconUrl));return row;
}
