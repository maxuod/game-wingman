const assert=require('node:assert/strict');const path=require('node:path');
module.exports=async({main,overlay,app,until,artifacts})=>{
  assert.equal((await main.evaluate(()=>window.desktop.loadIcon('http://localhost/private'))).value,null);
  // Force a fresh icon failure without altering existing cards or the game's actual state.
  await app.evaluate(()=>{global.__failIcons=true});
  await main.evaluate(async()=>{const {entityIcon}=await import('./icons.js');const node=entityIcon('离线名称','https://c-tft-api.op.gg/img/set/18/tft-item/OfflineFixture.png');node.id='icon-fallback-test';document.getElementById('item-recipes').prepend(node);node.scrollIntoView();node.focus();});
  await until(()=>app.evaluate(()=>global.__iconRequests.some(u=>u.endsWith('/OfflineFixture.png'))),Boolean);
  assert.equal(await main.locator('#icon-fallback-test img').count(),0);assert.equal(await main.locator('#icon-fallback-test').getAttribute('aria-label'),'离线名称');
  assert.equal(await main.locator('#icon-fallback-test .icon-fallback').isVisible(),true);
  assert.equal(await main.evaluate(()=>getComputedStyle(document.getElementById('icon-fallback-test'),'::after').content),'"离线名称"');
  await main.evaluate(()=>document.getElementById('icon-fallback-test').remove());await app.evaluate(()=>{global.__failIcons=false});
  await main.evaluate(()=>document.getElementById('equipment-status').scrollIntoView());
  await until(()=>main.locator('#craft-plan img').evaluateAll(imgs=>imgs.length>=4&&imgs.every(i=>i.naturalWidth>0)),Boolean);
  await main.screenshot({path:path.join(artifacts,'icon-equipment.png')});await overlay.screenshot({path:path.join(artifacts,'icon-overlay.png')});
};
