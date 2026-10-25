const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../work/validation');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.resultPanelTest={
 state:()=>({mode,score,health,time,distance,boostRemaining,giantRemaining}),
 show:n=>{start();score=n;endGame();},
 play:()=>{start();score=900;health=2;boostRemaining=3;giantRemaining=4;objects=[];spawnIn=1e6;hud();}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const results=[];
  for(const profile of [{width:1280,height:960},{width:320,height:844},{width:568,height:320,touch:true},{width:844,height:390,touch:true},{width:390,height:844,touch:true}]){
   const context=await browser.newContext({viewport:{width:profile.width,height:profile.height},hasTouch:!!profile.touch,isMobile:!!profile.touch});
   const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(decodeURIComponent(r.url())));
   await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>!document.querySelector('#start').disabled);await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));await page.evaluate(()=>document.fonts.ready);
   for(const score of [0,600,12345,123456789,Number.MAX_SAFE_INTEGER]){
    await page.evaluate(n=>resultPanelTest.show(n),score);
    assert.equal(await page.locator('#result-title').innerText(),'황감제 결과 발표');assert.equal(await page.locator('#result-caption').innerText(),'그대의 성적은?');assert.equal(await page.locator('#final-score').innerText(),score.toLocaleString('ko-KR')+'점');assert.equal(await page.locator('#restart').innerText(),'다시 도전하겠소');assert.equal(await page.locator('#result button').count(),1);
    const g=await page.evaluate(()=>{
     const rotated=Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('main')).transform).b)>.5;
     const rect=e=>e.getBoundingClientRect(),board=rect(document.querySelector('.result-board')),game=rect(document.querySelector('.game'));
     const axis=r=>rotated?r.y+r.height/2:r.x+r.width/2;
     const labels=['#result-title','#result-caption','#final-score'].map(s=>{const e=document.querySelector(s),r=rect(e),range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();return{s,center:axis(r),textCenter:axis(t),extent:rotated?t.height:t.width,available:rotated?r.height:r.width,font:getComputedStyle(e).fontFamily,top:e.offsetTop};});
     const imgs=[document.querySelector('#pause img'),document.querySelector('.result-board>img'),document.querySelector('#restart img')].map(e=>{const r=getComputedStyle(e);return{src:e.getAttribute('src'),ratio:parseFloat(r.width)/parseFloat(r.height),natural:e.naturalWidth/e.naturalHeight,fit:r.objectFit};});
     const p=document.querySelector('#pause'),ps=getComputedStyle(p),panel=rect(document.querySelector('#result'));
     return{center:axis(board),labels,imgs,pauseWidth:parseFloat(ps.width),pauseHeight:parseFloat(ps.height),fits:panel.left>=game.left-1&&panel.right<=game.right+1&&panel.top>=game.top-1&&panel.bottom<=game.bottom+1,oldCover:getComputedStyle(document.querySelector('#result'),'::before').content};
    });
    for(const l of g.labels){assert(Math.abs(l.center-g.center)<.6);assert(Math.abs(l.textCenter-g.center)<.6);assert(l.extent<=l.available+.5,JSON.stringify({profile,score,l}));assert(l.font.includes('Gamja Flower'));}
    assert(g.labels[0].top<g.labels[1].top&&g.labels[1].top<g.labels[2].top);assert(g.fits,JSON.stringify({profile,score,g}));assert(g.pauseWidth>=44&&g.pauseHeight>=44);assert.equal(g.oldCover,'none');
    for(const img of g.imgs)assert.equal(img.fit,'contain');assert(Math.abs(g.imgs[1].ratio-g.imgs[1].natural)<.01);assert(Math.abs(g.imgs[2].ratio-g.imgs[2].natural)<.01);
    results.push({width:profile.width,height:profile.height,touch:!!profile.touch,score});
    if(score===600)await page.screenshot({path:path.join(out,`new-ui-${profile.width}x${profile.height}.png`),fullPage:true});
   }
   assert(!requests.some(r=>/기타이미지(?:13|15)\.png$/.test(r)),'old result and pause images excluded');for(const name of ['멈춤버튼','성적공개','재시도버튼'])assert(requests.some(r=>r.endsWith(name+'.jpg')));
   if(profile.touch)await page.locator('#restart').tap();else await page.locator('#restart').click();const reset=await page.evaluate(()=>resultPanelTest.state());assert.equal(reset.mode,'running');assert.equal(reset.score,0);assert.equal(reset.health,3);assert.equal(reset.time,0);assert.equal(reset.boostRemaining,0);assert.equal(reset.giantRemaining,0);
   await page.evaluate(()=>resultPanelTest.play());if(profile.touch)await page.locator('#pause').tap();else await page.locator('#pause').click();const before=await page.evaluate(()=>resultPanelTest.state());await page.clock.runFor(2000);assert.deepEqual(await page.evaluate(()=>resultPanelTest.state()),before);if(profile.touch)await page.locator('#resume').tap();else await page.locator('#resume').click();const resumed=await page.evaluate(()=>resultPanelTest.state());assert.deepEqual(resumed,{...before,mode:'running'});assert.deepEqual(errors,[]);await context.close();
  }
  const page=await browser.newPage({viewport:{width:1280,height:960}});
  await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.route(/\/(?:멈춤버튼|성적공개|재시도버튼)\.jpg$/,r=>r.abort());
  // Browser request URLs may remain percent encoded.
  await page.route('**/assets/ui/*.jpg',r=>r.abort());await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>!document.querySelector('#start').disabled);
  await page.evaluate(()=>resultPanelTest.show(12345));assert.equal(await page.locator('.result-board.is-image-missing').count(),1);for(const img of await page.locator('[data-ui-fallback]').all())assert(!(await img.isVisible()),'broken image is hidden');assert(await page.locator('#restart .ui-image-fallback').isVisible());assert(await page.locator('#pause .ui-image-fallback').isVisible());assert.equal(await page.locator('#final-score').innerText(),'12,345점');await page.locator('#restart').click();assert.equal((await page.evaluate(()=>resultPanelTest.state())).mode,'running');await page.locator('#pause').click();assert.equal((await page.evaluate(()=>resultPanelTest.state())).mode,'paused');await page.screenshot({path:path.join(out,'new-ui-fallback.png')});
  console.log(JSON.stringify({result:'PASS',layouts:results.length,checks:['three supplied JPG paths','all result labels centered','0 through MAX_SAFE_INTEGER score fits','original aspect ratios with contain','44px pause hit target','old blue result image removed entirely','restart and pause/resume preserve expected state','image-request failure fallbacks','PC and mobile landscape/rotated portrait']}));
 }finally{await browser.close();}
})();
