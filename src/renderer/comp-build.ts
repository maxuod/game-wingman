import type { CompGuide, ItemReference } from '../shared/types.js';
import { entityIcon, itemIcon, recipeIcons } from './icons.js';

export function compBuild(guide:CompGuide,reference:ItemReference,recipesPending:boolean):HTMLElement {
  const root=document.createElement('div');root.className='comp-build';
  const label=(id:string,fallback=id)=>reference.items.find(i=>i.id===id)?.name??fallback;
  const equipment=document.createElement('ol');equipment.className='craft-list target-items';
  for(const unit of [...guide.units].filter(u=>u.items.length).sort((a,b)=>(a.priority??99)-(b.priority??99))){
    const row=document.createElement('li');row.className='target-unit';const name=entityIcon(unit.name,unit.iconUrl,{kind:'champion',detail:unit.priority?'核心 '+unit.priority:'参考棋子'});row.append(name);
    if(unit.priority){const priority=document.createElement('span');priority.className='core-priority';priority.textContent=String(unit.priority);priority.title='核心优先级 '+unit.priority;row.append(priority);}
    const loadout=document.createElement('div');loadout.className='target-loadout';row.append(loadout);
    for(const target of unit.items){const line=document.createElement('p');const item=reference.items.find(i=>i.id===target.id);
      if(item?.recipe.length===2&&!recipesPending&&guide.patch===reference.patch)line.append(recipeIcons(item,reference,true));
      else {line.append(item?itemIcon(item.id,reference):entityIcon(target.name));const note=document.createElement('small');note.textContent=item?.category==='component'?'散件':!item?'配方待核对':recipesPending||guide.patch!==reference.patch?'版本待核对':'非普通合成';line.append(note);}loadout.append(line);}
    equipment.append(row);
  }
  root.append(equipment);
  const positions=document.createElement('details');positions.className='build-positions';const summary=document.createElement('summary');summary.textContent='参考站位';positions.append(summary);
  if(guide.units.some(u=>!u.cell)){const p=document.createElement('p');p.className='fine';p.textContent='OP.GG 未提供这套阵容的完整站位，暂不绘制棋盘。';positions.append(p);}
  else {
    const caption=document.createElement('p');caption.className='fine';caption.textContent='上方靠近对手，下方为己方后排；沿用来源站位，尚未按本局对手调整。';positions.append(caption);
    const board=document.createElement('div');board.className='comp-board';board.setAttribute('aria-label','己方参考棋盘，上方前排，下方后排');
    for(let y=4;y>=1;y--){const row=document.createElement('div');row.className='board-row';
      for(let x=1;x<=7;x++){const unit=guide.units.find(u=>u.cell?.x===x&&u.cell.y===y);const cell=document.createElement('div');cell.className='board-cell'+(unit?' occupied':'')+(unit?.priority?' core':'');
        cell.dataset.cell=`${x},${y}`;cell.dataset.unit=unit?.id??'';cell.setAttribute('aria-label',`第 ${5-y} 排第 ${x} 格：${unit?.name??'空位'}`);
        if(unit){cell.title=`${unit.name} · ${unit.items.map(i=>label(i.id,i.name)).join(' / ')}`;cell.append(entityIcon(unit.name,unit.iconUrl,{kind:'champion'}));const gear=document.createElement('span');gear.className='board-gear';for(const i of unit.items)gear.append(itemIcon(i.id,reference,{small:true,focus:false}));cell.append(gear);}else cell.textContent='·';row.append(cell);}
      board.append(row);
    }positions.append(board);
  }
  root.append(positions);
  const augments=document.createElement('details');augments.className='build-augments';const title=document.createElement('summary');title.textContent='海克斯候选 · 银 / 金 / 彩';augments.append(title);
  const content=document.createElement('div');content.className='augment-content';augments.append(content);let loaded=false;
  augments.addEventListener('toggle',()=>{if(!augments.open||loaded)return;loaded=true;content.textContent='正在读取这套阵容的海克斯推荐…';
    void window.desktop.guideAugments(guide.id).then(result=>{
      if(!root.isConnected)return;
      if(!result.ok)throw new Error(result.error);const value=result.value;
      if(value.guideId!==guide.id||value.patch!==guide.patch)throw new Error('资料已切换，请重新打开阵容。');
      content.replaceChildren();const info=document.createElement('p');info.className='fine';info.textContent=`OP.GG · ${value.patch} · 读取 ${new Date(value.checkedAt).toLocaleString('zh-CN')}${value.stale?' · 更新失败，显示旧参考':''}。候选按来源顺序；未识别你面前的三个选项，也不表示必须选。`;content.append(info);
      for(const [tier,name] of [['silver','银色'],['gold','金色'],['prism','彩色']] as const){const h=document.createElement('h4');h.textContent=name;const list=document.createElement('ul');list.className='augment-list';
        const items=value.entries.filter(a=>a.tier===tier);for(const a of items){const li=document.createElement('li');li.append(entityIcon(a.name,a.iconUrl,{kind:'augment',detail:a.rounds.length?a.rounds.join(' / '):'来源候选'}));const rounds=document.createElement('small');rounds.textContent=a.rounds.join(' / ');li.append(rounds);list.append(li);}
        if(!items.length){const li=document.createElement('li');li.textContent='来源暂无候选';list.append(li);}content.append(h,list);}
    }).catch(error=>{if(root.isConnected)content.textContent=error instanceof Error?error.message:'海克斯推荐暂不可用。';loaded=false;});
  });root.append(augments);return root;
}
