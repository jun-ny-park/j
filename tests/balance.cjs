const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const file=process.env.BALANCE_SOURCE||path.resolve(__dirname,'../game.js');
const source=fs.readFileSync(file,'utf8').replace('level.recipes[patternIndex % level.recipes.length].map', '(window.gateRecipe || level.recipes[patternIndex % level.recipes.length]).map').replace(' hud();requestAnimationFrame(frame);',`
window.balanceTest={start:()=>{start();let seed=12345;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};nextBrushAt=18;nextGiantAt=30;},update,jump,pause,spawn,predictTravel,render,
 state:()=>({mode,time,stage:currentStage,score,health,speed:SPEED*movementFactor(),boostRemaining,giantRemaining,giantExitReadyAt:typeof giantExitReadyAt==='undefined'?0:giantExitReadyAt,player:{...player},objects:objects.map(o=>({...o})),worldWidth}),
 exitSetup:(at,boost,air)=>{start();time=at;currentStage=difficultyAt().index;boostRemaining=boost?5:0;giantRemaining=.01;visualScale=1.5;objects=[];spawnIn=1e6;nextBrushAt=nextGiantAt=1e6;
 if(air){jump();update(.12);jump();update(.08);giantRemaining=.01;}
 const d=OBSTACLES[2],h=d.height,w=h*images[d.path].naturalWidth/images[d.path].naturalHeight;
 objects.push({type:'obstacle',path:d.path,core:d.core,x:player.x+player.w+140-w/2,y:GROUND-h,w,h,hit:false});},
 postExitSpawn:()=>{objects=[];spawn();spawnIn=1e6;},
 gate:at=>{start();time=at;currentStage=difficultyAt().index;patternIndex=0;objects=[];window.gateRecipe=['double'];spawn();window.gateRecipe=null;return objects.filter(o=>o.type==='obstacle').map(o=>o.pattern);}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
 await page.evaluate(b=>{window.balanceBaseline=b;},!!process.env.BALANCE_BASELINE);
 const outcomes=await page.evaluate(()=>{
  const g=balanceTest,results=[];window.balanceCaptures=[];
  for(const policy of ['perfect','idle','spam-160ms','spam-220ms','always-double','miss-every-8','miss-every-20']){
   g.start();const passed=new Set(),windows=[{from:0,to:10,n:0,high:0},{from:10,to:20,n:0,high:0},{from:20,to:35,n:0,high:0},{from:35,to:50,n:0,high:0},{from:50,to:90,n:0,high:0}],encounters=[];
   let airborne=false,target=null,jumpAt=0,second=false,lastTap=-1,nextOrdinal=0,skip=false,steps=0;
   while(g.state().mode==='running'&&g.state().time<120&&steps++<60000){
    const s=g.state();let dt=1/60;
    if(policy==='perfect' && !window.balanceBaseline){const at=[.5,10.5,20.5,35.5,52][window.balanceCaptures.length];if(at!==undefined&&s.time>=at){g.render();window.balanceCaptures.push({at,data:document.querySelector('#game').toDataURL()});}}
    if(policy==='idle'){g.update(dt);continue;}
    if(policy.startsWith('spam')){const rate=policy==='spam-160ms'?.16:.22;if(s.time-lastTap>=rate){g.jump();lastTap=s.time;}g.update(dt);continue;}
    if(airborne&&s.player.grounded){passed.add(target.group+':'+target.order);airborne=false;}
    if(!airborne){
     const next=s.objects.filter(o=>o.type==='obstacle'&&!passed.has(o.group+':'+o.order)).sort((a,b)=>a.x+a.w/2-b.x-b.w/2)[0];
     if(next&&(!target||target.group!==next.group||target.order!==next.order)){
      target=next;nextOrdinal++;skip=policy==='miss-every-8'?nextOrdinal%8===0:policy==='miss-every-20'?nextOrdinal%20===0:false;
     }else target=next;
    }
    if(!airborne&&target){
     if(skip){if(target.x+target.w<s.player.x){passed.add(target.group+':'+target.order);target=null;}g.update(dt);continue;}
     const delta=target.x+target.w/2-(s.player.x+s.player.w/2)-g.predictTravel(target.lead);
     if(delta<=.05){
      const window=windows.find(w=>s.time>=w.from&&s.time<w.to);if(window){window.n++;if(target.pattern==='double')window.high++;}encounters.push({t:s.time,kind:target.pattern});
      g.jump();airborne=true;jumpAt=s.time;second=false;continue;
     }
     dt=Math.min(dt,Math.max(.00005,delta/765));
    }else if(airborne&&!second&&(target.pattern==='double'||policy==='always-double')){
     const until=.24-(s.time-jumpAt);if(until<=1e-8){g.jump();second=true;continue;}dt=Math.min(dt,until);
    }
    g.update(dt);
   }
   const end=g.state();results.push({policy,time:end.time,over:end.mode==='over',health:end.health,score:end.score,jumps:encounters.length,windows});
  }return results;
 });
 if(!process.env.BALANCE_BASELINE){
  assert(outcomes.find(o=>o.policy==='perfect').time>=120,'no forced time limit');assert.equal(outcomes.find(o=>o.policy==='perfect').health,3);
  for(const policy of ['idle','spam-160ms','spam-220ms','always-double'])assert(outcomes.find(o=>o.policy===policy).over,policy);
  const gate=await page.evaluate(()=>[balanceTest.gate(9.99),balanceTest.gate(10)]);assert(gate[0].every(k=>k==='single'));assert(gate[1].includes('double'));
  const exits=await page.evaluate(()=>{const r=[];for(const at of [22,37,52])for(const boost of [false,true])for(const air of [false,true]){
   balanceTest.exitSetup(at,boost,air);balanceTest.update(.01);const exit=balanceTest.state();balanceTest.postExitSpawn();const next=balanceTest.state();
   const earliest=next.objects.filter(o=>o.type==='obstacle').sort((a,b)=>a.x+a.w/2-b.x-b.w/2)[0];
   const distance=earliest.x+earliest.w/2-(next.player.x+next.player.w/2),required=balanceTest.predictTravel(Math.max(0,next.giantExitReadyAt-next.time)+earliest.lead);
   r.push({at,boost,air,health:exit.health,giant:exit.giantRemaining,remaining:exit.objects.filter(o=>o.type==='obstacle').length,readyAfter:exit.giantExitReadyAt-exit.time,distance,required});
  }return r;});
  for(const e of exits){assert.equal(e.health,3,JSON.stringify(e));assert.equal(e.giant,0);assert.equal(e.remaining,1);assert(e.readyAfter>=.18-1e-8);assert(e.distance>=e.required,JSON.stringify(e));}
  // Special replacements use a fixed seed; historical density fixtures predate this placement.
  const output=path.resolve(__dirname,'../work/validation');fs.mkdirSync(output,{recursive:true});for(const capture of await page.evaluate(()=>window.balanceCaptures))fs.writeFileSync(path.join(output,`balance-${capture.at}s.png`),Buffer.from(capture.data.split(',')[1],'base64'));
  console.log(JSON.stringify({result:'PASS',outcomes,exitCases:exits,notes:'Scripted input policies are not measurements of human novice/expert lifetimes.'}));
 }else console.log(JSON.stringify(outcomes,null,2));
 assert.deepEqual(errors,[]);
 }finally{await browser.close();}
})();
