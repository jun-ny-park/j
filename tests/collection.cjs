const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.collectionTest={
 state:()=>({mode,score,health,time,stage:currentStage,boostRemaining,giantRemaining,visualScale,player:{...player},objects:objects.map(o=>({...o})),flights:flyingObstacles.map(f=>({...f})),box:collectionBox(),frame:characterGeometry(),worldWidth}),
 update,jump,start,pause,render,
 setup:(giant=false,boost=false,jumps=0)=>{start();objects=[];spawnIn=1e6;giantRemaining=giant?5:0;boostRemaining=boost?5:0;visualScale=giant?1.5:1;
 if(jumps){jump();update(.12);if(jumps===2){jump();update(.12);}}},
 setEffects:(g,b=0,scale=visualScale)=>{giantRemaining=g;boostRemaining=b;visualScale=scale;},
 boundary:t=>{time=t;currentStage=difficultyAt().index;},
 put:(type,n=0,edge='right',outside=0)=>{
  const f=characterGeometry(),a=alphaBounds[f.path]||{x:0,y:0,w:1,h:1};
  const r={x:f.x+a.x*f.w,y:f.y+a.y*f.h,w:a.w*f.w,h:a.h*f.h};
  const path=type==='orange'?asset.items[n]:asset[type][0],w=type==='orange'?36:38,h=type==='orange'?36:47;
  const o={type,path,x:0,y:0,w,h,phase:-time*3,hit:false},hit=hitRect(o);
  let x=r.x+r.w-2+outside,y=r.y+r.h/2-hit.h/2;
  if(edge==='left')x=r.x-hit.w+2-outside;
  if(edge==='top'){x=r.x+r.w/2-hit.w/2;y=r.y-hit.h+2-outside;}
  if(edge==='bottom'){x=r.x+r.w/2-hit.w/2;y=r.y+r.h-2+outside;}
  o.x=x-hit.x;o.y=y-hit.y;objects.push(o);
  return {visible:r,collection:collectionBox(),placed:hitRect(o)};
 },
 obstacle:n=>{const d=OBSTACLES[n],h=d.height,w=h*images[d.path].naturalWidth/images[d.path].naturalHeight;
 objects.push({type:'obstacle',path:d.path,core:d.core,x:player.x+player.w/2+20-w/2,y:GROUND-h,w,h,hit:false});}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
  await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));
  const all=[];
  for(const viewport of [{width:1280,height:960},{width:390,height:844}]){
   await page.setViewportSize(viewport);await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width/collectionTest.state().worldWidth-r.height/500)<.001;});
   const cases=await page.evaluate(()=>{const g=collectionTest,r=[];
    for(const mode of ['normal','giant','both'])for(const jumps of [0,1,2])for(let n=0;n<6;n++)for(const edge of ['left','right','top','bottom']){
     g.setup(mode!=='normal',mode==='both',jumps);const placement=g.put('orange',n,edge);g.update(.001);const hit=g.state();g.update(.05);const later=g.state();
     r.push({mode,jumps,n,edge,score:hit.score,later:later.score,oranges:hit.objects.filter(o=>o.type==='orange').length,health:hit.health,placement});
    }return r;
   });
   for(const r of cases){assert.equal(r.score,100,JSON.stringify(r));assert.equal(r.later,100,JSON.stringify(r));assert.equal(r.oranges,0);assert.equal(r.health,3);}
   all.push(...cases.map(c=>({width:viewport.width,...c})));
  }
  const growth=await page.evaluate(()=>{const g=collectionTest,r=[];
   for(const phase of ['grow','before-expiry','after-expiry','shrunk'])for(let n=0;n<6;n++){
    g.setup(false);if(phase==='grow'){g.put('giant');g.update(.001);g.update(.10);}else if(phase==='before-expiry'){g.setEffects(.01,0,1.5);}else{g.setEffects(.001,0,1.5);g.update(.001);if(phase==='shrunk')g.update(.6);}
    const before=g.state();g.put('orange',n,'right');g.update(.001);const after=g.state();r.push({phase,n,before,after});
   }return r;
  });
  for(const r of growth){assert.equal(r.after.score,100,JSON.stringify(r));if(r.phase==='shrunk')assert.equal(r.after.visualScale,1);}
  const outside=await page.evaluate(()=>{collectionTest.setup(false);collectionTest.put('orange',0,'right',10);collectionTest.update(.001);return collectionTest.state();});assert.equal(outside.score,0,'outside normal-sized body is not collected');
  const specials=await page.evaluate(()=>{const r=[];for(const type of ['brush','giant']){collectionTest.setup(true);collectionTest.setEffects(1,0,1.5);collectionTest.put(type,0,'right');collectionTest.update(.001);r.push({type,state:collectionTest.state()});}return r;});
  assert.equal(specials[0].state.boostRemaining,5);assert.equal(specials[1].state.giantRemaining,5);
  const combined=await page.evaluate(()=>{const g=collectionTest,r=[];for(let i=0;i<5;i++){g.setup(true,true);g.obstacle(i);g.put('orange',i%6,'right');g.update(.001);const first=g.state();for(let n=0;n<6;n++){g.put('orange',n,'top');g.update(.001);}g.update(.05);r.push({first,final:g.state()});}return r;});
  for(const r of combined){assert.equal(r.first.health,3);assert.equal(r.first.score,100);assert.equal(r.first.flights.length,1);assert.equal(r.final.score,700);assert.equal(r.final.flights.length,1);assert.equal(r.final.health,3);}
  const transition=await page.evaluate(()=>{collectionTest.setup(false);collectionTest.boundary(14.99);collectionTest.update(.02);return collectionTest.state();});assert.equal(transition.stage,2);assert.equal(await page.locator('#difficulty-note').count(),0);
  const documents=await page.evaluate(()=>document.body.innerText);assert(!/시험이 어려워지고|시험이 어려워지고 있소|시험이 어려워지고 있도다/.test(documents));
  const original=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8');const html=fs.readFileSync(path.resolve(__dirname,'../index.html'),'utf8');const css=fs.readFileSync(path.resolve(__dirname,'../style.css'),'utf8');
  for(const text of [original,html,css])assert(!/stageNotice|difficulty-note|시험이 어려워지/.test(text));
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  console.log(JSON.stringify({result:'PASS',edgeCases:all.length,growthExpiryCases:growth.length,checks:['all six oranges normal/giant/giant+boost','visible body edges on PC/mobile','first and second jump','growth and expiry match rendered size','single collection and exact +100','brush and giant refresh collected at enlarged edge','five obstacle smashes with sequential orange collection and immunity','normal pickup bounds restored','no difficulty notice DOM/style/timer/string','difficulty still advances','no JavaScript or asset errors']}));
 }finally{await browser.close();}
})();
