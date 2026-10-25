const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../work/validation');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.resultPanelTest={
 state:()=>({mode,score,health,time,distance,boostRemaining,giantRemaining,stage:currentStage,objects:objects.map(o=>({...o}))}),
 show:n=>{start();score=n;endGame();},
 play:()=>{start();score=900;health=2;boostRemaining=3;giantRemaining=4;objects=[{type:'orange',path:asset.items[0],x:player.x+250,y:GROUND-80,w:36,h:36,phase:0,hit:false}];spawnIn=1e6;hud();}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('#paused h2').innerText(),'잠시 쉬어가게나');assert.equal(await page.locator('#resume').innerText(),'다시 달려보세');
  const results=[];
  for(const viewport of [{width:1280,height:960},{width:390,height:844},{width:320,height:844}]){
   await page.setViewportSize(viewport);
   for(const score of [0,600,12345,123456789,Number.MAX_SAFE_INTEGER]){
    await page.evaluate(n=>resultPanelTest.show(n),score);
    assert.equal(await page.locator('#result-title').innerText(),'황감제 결과 발표');assert.equal(await page.locator('#result-caption').innerText(),'그대의 성적은?');assert.equal(await page.locator('#final-score').innerText(),score.toLocaleString('ko-KR')+'점');assert.equal(await page.locator('#restart').innerText(),'다시 도전하겠소');assert.equal(await page.locator('#result button').count(),1);
    const geometry=await page.evaluate(()=>{
     const r=document.querySelector('#result').getBoundingClientRect(),center=r.x+r.width/2;
     const children=['#result-title','#result-caption','#final-score','#restart'].map(selector=>{const e=document.querySelector(selector),b=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();return {selector,top:b.top,bottom:b.bottom,width:b.width,center:b.x+b.width/2,textCenter:t.x+t.width/2,textWidth:t.width,scroll:e.scrollWidth,client:e.clientWidth,font:getComputedStyle(e).fontFamily};});
     const img=document.querySelector('#result>img'),ir=img.getBoundingClientRect(),button=document.querySelector('#restart').getBoundingClientRect(),c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const pixels=ctx.getImageData(0,0,c.width,c.height).data;let blue=0,uncovered=0;
     const radius=button.height/2;
     for(let y=140;y<186;y++)for(let x=35;x<195;x++){
      const k=(y*c.width+x)*4,R=pixels[k],G=pixels[k+1],B=pixels[k+2];if(!(pixels[k+3]>200&&R>70&&G>120&&B>150&&G>R+20&&B>R+25))continue;
      blue++;const px=ir.left+(x+.5)*ir.width/c.width-button.left,py=ir.top+(y+.5)*ir.height/c.height-button.top;
      let inside=px>=0&&px<=button.width&&py>=0&&py<=button.height;
      if(inside&&px<radius)inside=(px-radius)**2+(py-radius)**2<=radius**2;
      if(inside&&px>button.width-radius)inside=(px-(button.width-radius))**2+(py-radius)**2<=radius**2;
      if(!inside)uncovered++;
     }
     return {center,children,blue,uncovered,buttonOffset:button.left-r.left,panelWidth:r.width,pageFits:document.documentElement.scrollWidth<=innerWidth};
    });
    for(const c of geometry.children.slice(1,3)){assert(Math.abs(c.center-geometry.center)<.1,JSON.stringify(c));assert(Math.abs(c.textCenter-geometry.center)<.6,JSON.stringify(c));assert(c.textWidth<=c.width+.5,JSON.stringify(c));assert(c.font.includes('Gamja Flower'));}
    assert(geometry.children[0].textWidth<=geometry.children[0].width);for(let i=1;i<geometry.children.length;i++)assert(geometry.children[i].top>=geometry.children[i-1].top,'reading order');
    assert.equal(geometry.uncovered,0,JSON.stringify(geometry));assert(geometry.pageFits);assert(geometry.children[3].textWidth<=geometry.children[3].width);
    results.push({width:viewport.width,score,blue:geometry.blue,uncovered:geometry.uncovered});
    if([1280,390].includes(viewport.width)&&[600,Number.MAX_SAFE_INTEGER].includes(score))await page.screenshot({path:path.join(out,`result-${viewport.width}-${score}.png`)});
   }
  }
  const restarted=await page.evaluate(()=>{document.querySelector('#restart').click();return resultPanelTest.state();});assert.equal(restarted.mode,'running');assert.equal(restarted.score,0);assert.equal(restarted.health,3);assert.equal(restarted.time,0);assert.equal(restarted.boostRemaining,0);assert.equal(restarted.giantRemaining,0);
  await page.evaluate(()=>resultPanelTest.play());await page.getByRole('button',{name:'일시 정지',exact:true}).click();const before=await page.evaluate(()=>resultPanelTest.state());await page.clock.runFor(2000);assert.deepEqual(await page.evaluate(()=>resultPanelTest.state()),before);
  await page.screenshot({path:path.join(out,'resume-new-label.png')});const resumed=await page.evaluate(()=>{document.querySelector('#resume').click();return resultPanelTest.state();});const {mode:pm,...pausedState}=before,{mode:rm,...resumedState}=resumed;assert.equal(rm,'running');assert.deepEqual(resumedState,pausedState);
  assert.deepEqual(errors,[]);console.log(JSON.stringify({result:'PASS',layouts:results,checks:['exact copy and order','caption/score wrappers and text centered','0 through MAX_SAFE_INTEGER score fits','original blue button fill covered','single restart resets all state','renamed resume preserves paused state','handwriting font','PC/mobile screenshots','no JavaScript errors']}));
 }finally{await browser.close();}
})();
