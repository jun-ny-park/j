const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const screenshotDir=path.resolve(__dirname,'../work/validation');fs.mkdirSync(screenshotDir,{recursive:true});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8');
const instrument=source.replace(' hud();requestAnimationFrame(frame);',`
window.testGame={
 state:()=>({mode,score,health,time,runTime,distance,boostRemaining,giantRemaining,visualScale,factor:movementFactor(),worldWidth,
 player:{...player},objects:objects.map(o=>({...o})),effects:effects.map(o=>({...o})),
 visible:objects.map(o=>({type:o.type,path:o.path,rect:spriteRect(o),hit:hitRect(o)}))}),
 start,jump,update,pause,render,collides,
 isolated:()=>{start();objects=[];spawnIn=1e6;},
 effects:(b,g)=>{boostRemaining=b;giantRemaining=g;hud();},
 place:type=>{const p=type==='brush'?asset.brush[0]:asset.giant[0];objects=[{type,path:p,x:player.x+18,y:player.y+20,w:38,h:47,hit:false}];},
 pattern:(index,b=false,g=false)=>{start();patternIndex=index;objects=[];spawn();spawnIn=1e6;const shift=worldWidth+40-(player.x+player.w/2);objects=objects.filter(o=>['orange','obstacle'].includes(o.type));objects.forEach(o=>o.x-=shift);boostRemaining=b?5:0;giantRemaining=g?5:0;visualScale=g?1.5:1;},
 series:n=>{start();objects=[];const result=[];for(let i=0;i<n;i++){objects=[];spawn();result.push(objects.map(o=>({...o})));}objects=[];return result;},
 collision:()=>{const d=OBSTACLES[0];objects=[{type:'obstacle',path:d.path,core:d.core,x:player.x,y:player.y+15,w:74,h:74,hit:false}];invincible=0;}
};hud();requestAnimationFrame(frame);`);
assert.notEqual(source,instrument);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],bad=[],requests=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});page.on('request',r=>requests.push(decodeURIComponent(r.url())));
 await page.addInitScript(()=>{window.characterDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(im,...args){if(im.src?.includes('/characters/'))window.characterDraws.push(args);return draw.call(this,im,...args);};});
 await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:instrument}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');
 await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('#paused button').count(),1);assert.equal(await page.locator('#resume').innerText(),'다시 달리기');assert.equal(await page.locator('#pause-restart').count(),0);
 assert(!(await page.locator('body').innerText()).includes('귤빛 마을'));
 assert.equal(await page.locator('.effect-timers img').count(),0);
 assert(await page.evaluate(()=>document.fonts.check('20px "Gamja Flower"','다시 달리기 초')));
 await page.screenshot({path:path.join(screenshotDir,'latest-start.png')});
 const trials=await page.evaluate(()=>{
  const g=testGame,result=[];
  for(const fps of [15,60,120])for(const b of [false,true])for(const giant of [false,true])for(let index=0;index<12;index++){
   g.pattern(index,b,giant);const initial=g.state(),count=initial.objects.filter(o=>o.type==='orange').length;const kind=index%4;
   if(kind===1||kind===3)g.jump();let second=false;
   while(g.state().runTime<1.5-1e-9){
    const state=g.state();if(kind===3&&!second&&state.runTime>=.24-1e-9){g.jump();second=true;}
    let dt=Math.min(1/fps,(1.5-state.runTime)/state.factor);
    if(kind===3&&!second)dt=Math.min(dt,(.24-state.runTime)/state.factor);
    g.update(dt);
   }
   const end=g.state();result.push({fps,b,giant,index,count,collected:end.score/100,health:end.health,obstacles:initial.objects.filter(o=>o.type==='obstacle').map(o=>o.path)});
  }return result;
 });
 for(const r of trials){assert.equal(r.health,3,JSON.stringify(r));assert.equal(r.collected,r.count,JSON.stringify(r));}
 const singles=await page.evaluate(()=>{const result=[];for(const index of [3,7,11]){testGame.pattern(index);testGame.jump();for(let i=0;i<150;i++)testGame.update(.01);result.push({index,health:testGame.state().health});}return result;});
 for(const r of singles)assert.equal(r.health,2,'high obstacle must defeat single jump '+JSON.stringify(r));
 const series=await page.evaluate(()=>testGame.series(48));
 const obstacles=series.flat().filter(o=>o.type==='obstacle'),brushes=series.flat().filter(o=>o.type==='brush'),giants=series.flat().filter(o=>o.type==='giant');
 assert.deepEqual([...new Set(obstacles.map(o=>o.path))].sort(),[1,2,6,7,9].map(n=>`assets/obstacles/기타이미지${n}.png`).sort());
 assert.equal(brushes.length,4);assert.equal(giants.length,6); // Old brush cadence produced 6 in 48 patterns.
 const variants=Object.fromEntries([1,2,3,4,5,6].map(n=>[`assets/items/귤${n}.png`,0]));
 for(const o of series.flat().filter(o=>o.type==='orange'))variants[o.path]++;
 assert(Math.max(...Object.values(variants))-Math.min(...Object.values(variants))<=1);
 const noOverlap=series.every(objects=>objects.filter(o=>o.type==='orange').every(o=>objects.filter(b=>b.type==='obstacle').every(b=>!(o.x<b.x+b.w&&o.x+o.w>b.x&&o.y-3<b.y+b.h&&o.y+o.h+3>b.y))));assert(noOverlap);
 const decorations=await page.evaluate(()=>{testGame.pattern(3);const o=testGame.state().objects.find(o=>o.type==='obstacle');return testGame.collides({x:o.x,y:o.y,w:o.w*.1,h:o.h*.1},o);});assert.equal(decorations,false,'outer decorative canopy is not collidable');
 const timers=await page.evaluate(()=>{
  const g=testGame;g.isolated();g.place('brush');g.update(1/120);const brush=g.state();g.update(1);const fast=g.state();g.place('giant');g.update(1/120);const book=g.state();g.update(.5);const enlarged=g.state();
  g.pause();const before=g.state();g.update(50);const after=g.state();g.pause();
  g.isolated();g.effects(5,5);g.update(4.99);const almost=g.state();g.update(.01);const expired=g.state();g.update(.5);const restored=g.state();
  g.isolated();g.place('brush');g.update(1/120);g.update(2);g.place('brush');g.update(1/120);const refresh=g.state();
  g.effects(5,5);for(let i=0;i<3;i++){g.collision();g.update(.01);}const over=g.state();g.start();const reset=g.state();
  return {brush,fast,book,enlarged,before,after,almost,expired,restored,refresh,over,reset};
 });
 assert.equal(timers.brush.boostRemaining,5);assert.equal(timers.fast.factor,1.5);assert.equal(timers.book.giantRemaining,5);assert.equal(timers.enlarged.visualScale,1.5);
 assert.equal(timers.before.time,timers.after.time);assert.equal(timers.before.boostRemaining,timers.after.boostRemaining);assert.equal(timers.before.giantRemaining,timers.after.giantRemaining);
 assert(Math.abs(timers.almost.boostRemaining-.01)<1e-7);assert(Math.abs(timers.almost.giantRemaining-.01)<1e-7);
 assert.equal(timers.expired.boostRemaining,0);assert.equal(timers.expired.giantRemaining,0);assert.equal(timers.expired.factor,1);assert.equal(timers.restored.visualScale,1);
 assert.equal(timers.refresh.boostRemaining,5);assert.equal(timers.refresh.factor,1.5);assert.equal(timers.over.mode,'over');assert.equal(timers.over.giantRemaining,0);assert.equal(timers.reset.visualScale,1);
 await page.evaluate(()=>{testGame.isolated();testGame.place('giant');testGame.update(1/120);testGame.update(.5);testGame.effects(5,5);testGame.render();});
 const feet=await page.evaluate(()=>{const r=characterDraws.at(-1);return r[1]+r[3];});assert(Math.abs(feet-461)<.001,'enlarged feet remain on ground');
 assert.equal(await page.locator('#boost').innerText(),'5초');assert.equal(await page.locator('#giant').innerText(),'5초');
 await page.getByRole('button',{name:'일시 정지',exact:true}).click();const before=await page.evaluate(()=>testGame.state());await page.clock.runFor(3000);const after=await page.evaluate(()=>testGame.state());assert.deepEqual(before,after);
 await page.screenshot({path:path.join(screenshotDir,'latest-pause.png')});await page.locator('#resume').click();assert.equal(await page.evaluate(()=>testGame.state().score),before.score);assert.equal(await page.evaluate(()=>testGame.state().giantRemaining),before.giantRemaining);
 await page.evaluate(()=>testGame.isolated());await page.keyboard.press('Space');await page.clock.runFor(120);await page.keyboard.press('Space');await page.clock.runFor(120);assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
 for(const width of [320,375,390,640,844,1280]){await page.setViewportSize({width,height:900});await page.clock.runFor(20);await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width/testGame.state().worldWidth-r.height/500)<.001;});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>{testGame.pattern(3,true,true);testGame.render();});await page.screenshot({path:path.join(screenshotDir,'latest-mobile.png')});
 await page.locator('#jump').dispatchEvent('pointerdown');await page.clock.runFor(120);await page.locator('#game').dispatchEvent('pointerdown');await page.clock.runFor(120);assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
 assert(!requests.some(u=>/배경이미지|background[123]\.|귤이미지[1-8]\./.test(u)),'retired background and orange images are not loaded');
 assert(requests.some(u=>u.includes('bbaakk1.jpg')));assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log(JSON.stringify({result:'PASS',patterns:trials.length,reachableOranges:trials.reduce((n,r)=>n+r.count,0),orangeVariants:variants,brushesIn48Patterns:brushes.length,previousBrushes:6,checks:['five actual obstacles','high obstacles require double jump','normal/boost/giant/combined reachable','5-second effects and resets','fixed collision body during enlargement','grounded feet','pause preserves full state','time-only HUD','PC/mobile controls','six viewports','no JavaScript or asset errors']}));
 }finally{await browser.close();}
})();
