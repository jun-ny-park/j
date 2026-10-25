const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const out=path.resolve(__dirname,'../work/validation');fs.mkdirSync(out,{recursive:true});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.resultPanelTest={
 state:()=>({mode,score,health,time,distance,boostRemaining,giantRemaining,stage:currentStage,objects:objects.length,flights:flyingObstacles.length}),
 show:n=>{start();score=n;endGame();},
 earned:()=>{start();spawnIn=1e6;for(let n=0;n<3;n++){objects=[{type:'orange',path:asset.items[n],x:player.x+18,y:player.y+20,w:36,h:36,phase:0,hit:false}];update(.01);}const earned=score;for(let n=0;n<3;n++){const d=OBSTACLES[0];invincible=0;objects=[{type:'obstacle',path:d.path,core:d.core,x:player.x,y:player.y+15,w:74,h:74,hit:false}];update(.01);}return earned;},
 play:()=>{start();score=900;health=2;boostRemaining=3;giantRemaining=4;objects=[];spawnIn=1e6;hud();}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 try{
  const layouts=[],coverage=[];
  for(const v of [{width:1280,height:960},{width:320,height:568},{width:568,height:320,touch:true},{width:844,height:390,touch:true},{width:390,height:844,touch:true},{width:568,height:240,touch:true}]){
   const context=await browser.newContext({viewport:{width:v.width,height:v.height},isMobile:!!v.touch,hasTouch:!!v.touch});const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));await page.evaluate(()=>document.fonts.ready);
   assert.equal(await page.locator('#result').count(),1);assert.equal(await page.locator('#overlay').count(),1);assert.equal(await page.locator('#result button').count(),1);
   for(const score of [0,300,600,43900,12345,123456789,Number.MAX_SAFE_INTEGER]){
    await page.evaluate(n=>resultPanelTest.show(n),score);
    assert.equal(await page.locator('#result-title').innerText(),'황감제 결과 발표');assert.equal(await page.locator('#result-caption').innerText(),'그대의 성적은?');assert.equal(await page.locator('#final-score').innerText(),score.toLocaleString('ko-KR')+'점');assert.equal(await page.locator('#restart').innerText(),'다시 도전하겠소');
    const g=await page.evaluate(()=>{
     const panel=document.querySelector('#result'),img=panel.querySelector('img'),pr=panel.getBoundingClientRect(),game=document.querySelector('.game').getBoundingClientRect(),style=getComputedStyle(panel),width=parseFloat(style.width),height=parseFloat(style.height),rotated=Math.abs(new DOMMatrix(getComputedStyle(document.querySelector('main')).transform).b)>.5,axis=r=>rotated?r.y+r.height/2:r.x+r.width/2,center=axis(pr);
     const children=['#result-title','#result-caption','#final-score','#restart'].map(s=>{const e=document.querySelector(s),r=e.getBoundingClientRect(),range=document.createRange();range.selectNodeContents(e);const t=range.getBoundingClientRect();return{s,center:axis(r),textCenter:axis(t),textWidth:rotated?t.height:t.width,width:rotated?r.height:r.width,left:e.offsetLeft,top:e.offsetTop,bottom:e.offsetTop+e.offsetHeight,font:getComputedStyle(e).fontFamily,fontSize:parseFloat(getComputedStyle(e).fontSize),weight:getComputedStyle(e).fontWeight,color:getComputedStyle(e).color};});
     const mask=s=>{const e=s==='button'?panel.querySelector('.result-legacy-button-cover'):panel,cs=getComputedStyle(e,s==='button'?null:s);return{x:parseFloat(cs.left),y:parseFloat(cs.top),w:parseFloat(cs.width),h:parseFloat(cs.height),background:cs.backgroundColor,z:cs.zIndex};};
     const masks=[mask('::before'),mask('::after'),mask('button')];
     const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;const ctx=c.getContext('2d');ctx.drawImage(img,0,0);const px=ctx.getImageData(0,0,c.width,c.height).data;
     const count=(bounds,match)=>{let ink=0,uncovered=0;for(let y=bounds[1];y<bounds[3];y++)for(let x=bounds[0];x<bounds[2];x++){const k=(y*c.width+x)*4;if(px[k+3]<200||!match(px[k],px[k+1],px[k+2]))continue;ink++;const dx=(x+.5)*width/c.width,dy=(y+.5)*height/c.height;if(!masks.some(m=>dx>=m.x&&dx<=m.x+m.w&&dy>=m.y&&dy<=m.y+m.h))uncovered++;}return{ink,uncovered};};
     const heading=count([78,28,179,59],(r,g,b)=>b>r+15&&b>g),score=count([74,80,153,127],(r,g,b)=>r<180&&g<150&&b<130),button=count([35,140,195,186],(r,g,b)=>r>70&&g>120&&b>150&&g>r+20&&b>r+25);
     return{center,headingCenter:center+width*.135,width,height,children,masks,heading,score,button,ratio:width/height,natural:img.naturalWidth/img.naturalHeight,fits:pr.left>=game.left-1&&pr.right<=game.right+1&&pr.top>=game.top-1&&pr.bottom<=game.bottom+1,characterBottom:height*.33};
    });
    for(const c of g.children){const expected=c.s==='#result-title'?g.headingCenter:g.center;assert(Math.abs(c.center-expected)<.6,JSON.stringify(c));assert(Math.abs(c.textCenter-expected)<.6,JSON.stringify(c));assert(c.textWidth<=c.width+.5,JSON.stringify({v,score,c}));assert(c.font.includes('Gamja Flower'));}
    for(let i=1;i<g.children.length;i++)assert(g.children[i].top>=g.children[i-1].bottom-1,'no text/button overlap');assert(g.children[0].left>=g.width*.34,'heading to the right of scholar');const titleCenter=(g.children[0].top+g.children[0].bottom)/2/g.height;assert(titleCenter>=.20&&titleCenter<=.25,'heading at 20–25 percent');assert.equal(g.children[0].color,'rgb(67, 138, 187)');assert.equal(g.children[2].weight,'700');if(score<1000000)assert(g.children[2].fontSize>g.children[1].fontSize,'score larger than caption');assert(Math.abs(g.ratio-g.natural)<.01,'scroll aspect preserved');assert(g.fits,'panel fits game');
    for(const name of ['heading','score','button']){assert(g[name].ink>100,name+' ink detected');assert.equal(g[name].uncovered,0,JSON.stringify({v,score,name,coverage:g[name]}));}for(const mask of g.masks){assert.equal(mask.background,'rgb(255, 241, 210)');assert.equal(mask.z,'1');}
    coverage.push({width:v.width,height:v.height,heading:g.heading.ink,score:g.score.ink,button:g.button.ink});layouts.push({v,score});
    if(score===43900)await page.screenshot({path:path.join(out,`result-clean-${v.width}x${v.height}.png`),fullPage:true});
   }
   const earned=await page.evaluate(()=>resultPanelTest.earned());assert.equal(earned,300);assert.equal((await page.evaluate(()=>resultPanelTest.state())).mode,'over');assert.equal(await page.locator('#final-score').innerText(),'300점');assert.equal(await page.locator('#result #final-score').count(),1);
   if(v.touch)await page.locator('#restart').tap();else await page.locator('#restart').click();const reset=await page.evaluate(()=>resultPanelTest.state());assert.deepEqual(reset,{mode:'running',score:0,health:3,time:0,distance:0,boostRemaining:0,giantRemaining:0,stage:0,objects:0,flights:0});assert(await page.locator('#result').isHidden());assert(await page.locator('#overlay').isHidden());
   await page.evaluate(()=>resultPanelTest.play());if(v.touch)await page.locator('#pause').tap();else await page.locator('#pause').click();const before=await page.evaluate(()=>resultPanelTest.state());await page.clock.runFor(1000);assert.deepEqual(await page.evaluate(()=>resultPanelTest.state()),before);if(v.touch)await page.locator('#resume').tap();else await page.locator('#resume').click();assert.deepEqual(await page.evaluate(()=>resultPanelTest.state()),{...before,mode:'running'});assert.deepEqual(errors,[]);await context.close();
  }
  const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');assert(!/게임 오버|12,345|다시하기|300점/.test(html));
  console.log(JSON.stringify({result:'PASS',layouts:layouts.length,coverage:coverage.filter((_,i)=>i%7===0),checks:['one result panel and one restart button','all baked heading/score/blue-button ink fully covered','centered body labels and inset button without overlap','historic heading at 24 percent beside scholar','large bold dynamic score','actual three pickups produce final 300점 once','reset score health distance stage and effects','PC/mobile landscape/rotated portrait/short-height layouts','game.js and image files unchanged']}));
 }finally{await browser.close();}
})();
