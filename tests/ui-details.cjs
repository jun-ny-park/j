const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{execFileSync}=require('node:child_process');
const {chromium}=require('playwright');
const beforeCss=execFileSync('git',['show','613e78b:style.css'],{encoding:'utf8'});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.uiDetails={
 state:()=>({mode,score,health,time,distance,boostRemaining,giantRemaining,player:{...player},objects:objects.map(o=>({...o}))}),
 prepare:()=>{start();score=700;health=2;time=22;distance=150;boostRemaining=4.4;giantRemaining=3.3;objects=[];spawnIn=1e6;hud();},
 health:n=>{health=n;hud();},show:n=>{start();score=n;endGame();}
};hud();requestAnimationFrame(frame);`);
const measure=()=>{
 const rect=e=>{const r=e.getBoundingClientRect();return{x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};};
 const element=s=>{const e=document.querySelector(s),r=rect(e),cs=getComputedStyle(e),range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();return{...r,font:parseFloat(cs.fontSize),top:e.offsetTop,left:e.offsetLeft,cssWidth:parseFloat(cs.width),cssHeight:parseFloat(cs.height),textW:t.width,textH:t.height,textCX:t.x+t.width/2,textCY:t.y+t.height/2};};
 return{pause:element('#pause'),resume:element('#resume'),restart:element('#restart'),title:element('#result-title'),caption:element('#result-caption'),panel:element('#result'),bar:rect(document.querySelector('.health-track')),health:element('#health'),healthImage:rect(document.querySelector('.health-panel>img')),rotated:Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('main')).transform).b)>.5};
};
const close=(a,b,n)=>assert(Math.abs(a-b)<.15,`${n}: ${a} vs ${b}`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 try{
  const results=[],out=path.resolve(__dirname,'../work/validation');fs.mkdirSync(out,{recursive:true});
  for(const v of [{width:1280,height:900},{width:390,height:844},{width:568,height:320,touch:true},{width:844,height:390,touch:true},{width:390,height:844,touch:true}]){
   const context=await browser.newContext({viewport:{width:v.width,height:v.height},hasTouch:!!v.touch,isMobile:!!v.touch});
   const open=async baseline=>{const p=await context.newPage();await p.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));if(baseline)await p.route('**/style.css',r=>r.fulfill({contentType:'text/css',body:beforeCss}));await p.clock.install();await p.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await p.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));await p.evaluate(()=>document.fonts.ready);return p;};
   const baseline=await open(true);await baseline.evaluate(()=>uiDetails.prepare());const original=await baseline.evaluate(measure);await baseline.locator('#pause').click();const originalPaused=await baseline.evaluate(measure);await baseline.evaluate(()=>uiDetails.show(43900));const originalResult=await baseline.evaluate(measure);await baseline.close();
   const page=await open(false),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.evaluate(()=>uiDetails.prepare());const running=await page.evaluate(measure);
   for(const key of ['x','y','w','h'])close(running.pause[key],original.pause[key],'unchanged pause '+key);
   for(const key of ['x','y','w','h'])close(running.healthImage[key],original.healthImage[key],'unchanged health image '+key);
   assert.equal(await page.locator('#pause img').getAttribute('src'),'assets/ui/기타이미지15.png');
   for(const n of [3,2,1,0]){await page.evaluate(n=>uiDetails.health(n),n);const g=await page.evaluate(measure);close(g.health.cx,g.bar.cx,'health horizontal');close(g.health.cy,g.bar.cy,'health vertical');close(g.rotated?g.health.textCY:g.health.textCX,g.rotated?g.bar.cy:g.bar.cx,'number text centered');}
   let resumeRatios;
   for(let i=0;i<3;i++){
    await page.evaluate(()=>uiDetails.prepare());const active=await page.evaluate(()=>uiDetails.state());if(v.touch)await page.locator('#pause').tap();else await page.locator('#pause').click();await page.waitForFunction(()=>document.querySelector('#pause img').getAttribute('src')==='assets/ui/멈춤버튼.png');
    await page.mouse.move(0,0);const paused=await page.evaluate(()=>uiDetails.state());assert.deepEqual(paused,{...active,mode:'paused'});await page.clock.runFor(1000);assert.deepEqual(await page.evaluate(()=>uiDetails.state()),paused);
    const g=await page.evaluate(measure);for(const key of ['x','y','w','h'])close(g.pause[key],running.pause[key],'same icon box '+key);
    const fit=await page.locator('#pause img').evaluate(e=>getComputedStyle(e).objectFit);assert.equal(fit,'contain');
    const shrinkW=g.resume.w/originalPaused.resume.w,shrinkH=g.resume.h/originalPaused.resume.h;assert(shrinkW>=.79&&shrinkW<=.86);assert(shrinkH>=.79&&shrinkH<=.86,JSON.stringify({v,shrinkH}));assert(g.resume.font<originalPaused.resume.font);assert(Math.min(g.resume.w,g.resume.h)>=43.9,'resume hit height at least 44px');resumeRatios={width:shrinkW,height:shrinkH};
    if(i===0)await page.screenshot({path:path.join(out,`ui-details-pause-${v.width}x${v.height}-${!!v.touch}.png`),fullPage:true});
    if(v.touch)await page.locator('#resume').tap();else await page.locator('#resume').click();assert.equal(await page.locator('#pause img').getAttribute('src'),'assets/ui/기타이미지15.png');assert.deepEqual(await page.evaluate(()=>uiDetails.state()),active);
   }
   await page.evaluate(()=>uiDetails.show(43900));const g=await page.evaluate(measure);
   close(g.restart.w/originalResult.restart.w,.82,'retry shrink width');close(g.restart.h/originalResult.restart.h,.82,'retry shrink height');
   assert(g.restart.font<originalResult.restart.font);assert(g.title.font/originalResult.title.font>=.76&&g.title.font/originalResult.title.font<=.81);
   assert(g.title.left>originalResult.title.left);assert(g.title.top<originalResult.title.top);assert(g.caption.top<originalResult.caption.top);
   const hit=await page.evaluate(()=>['restart','resume'].map(id=>{const e=document.getElementById(id),s=getComputedStyle(e,'::after');return{id,width:parseFloat(s.width),height:parseFloat(s.height)};}));for(const h of hit)if(h.id==='restart')assert(h.width>=44&&h.height>=44);
   const expandedHit=await page.evaluate(()=>{const e=document.querySelector('#restart'),r=e.getBoundingClientRect(),rot=Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('main')).transform).b)>.5;const x=r.x+r.width/2+(rot?21:0),y=r.y+r.height/2+(rot?0:21);return{x,y,id:document.elementFromPoint(x,y)?.closest('button')?.id};});assert.equal(expandedHit.id,'restart','transparent touch extension works');
   await page.screenshot({path:path.join(out,`ui-details-result-${v.width}x${v.height}-${!!v.touch}.png`),fullPage:true});if(v.touch)await page.touchscreen.tap(expandedHit.x,expandedHit.y);else await page.mouse.click(expandedHit.x,expandedHit.y);const reset=await page.evaluate(()=>uiDetails.state());assert.equal(reset.mode,'running');assert.equal(reset.score,0);assert.equal(reset.health,3);assert.deepEqual(errors,[]);results.push({viewport:v,resumeRatios,retryWidthRatio:g.restart.w/originalResult.restart.w,titleFontRatio:g.title.font/originalResult.title.font});await context.close();
  }
  const page=await browser.newPage();await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.route('**/assets/ui/*.png',r=>decodeURIComponent(r.request().url()).endsWith('/멈춤버튼.png')?r.abort():r.continue());await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.evaluate(()=>uiDetails.prepare());await page.locator('#pause').click();assert.equal(await page.locator('#pause img').getAttribute('src'),'assets/ui/기타이미지15.png');await page.locator('#resume').click();assert.equal((await page.evaluate(()=>uiDetails.state())).mode,'running');
  console.log(JSON.stringify({result:'PASS',results,checks:['original running icon / transparent paused PNG / original on resume, three cycles','unchanged pause location and hit box','unchanged health image and centered 0–3 gauge numbers','18 percent smaller buttons with >=44px hit extensions','smaller upper-right heading and raised centered caption','pause freezes all game state','paused PNG failure falls back to original icon']}));
 }finally{await browser.close();}
})();
