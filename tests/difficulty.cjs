const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace('o.hit = true; o.destroyed = true;', "o.hit = true; o.destroyed = true; if(window.testDestroyed)window.testDestroyed.add(o.group+':'+o.order);").replace(' hud();requestAnimationFrame(frame);',`
window.difficultyTest={
 destroyed:(group,order)=>window.testDestroyed?.has(group+':'+order),
 state:()=>({mode,time,stage:difficultyAt().index,speed:SPEED*movementFactor(),target:difficultyAt().speed,
 boostRemaining,giantRemaining,visualScale,giantExitReadyAt,player:{...player},
 objects:objects.map(o=>({...o})),worldWidth,cap:viewportSpeedCap,patternIndex,nextBrushAt,nextGiantAt,score,health}),
 stageAt:t=>difficultyAt(t),speedAt:t=>difficultySpeed(t),predictTravel,update,jump,pause,start,render,
 isolated:(at,b=0,g=0)=>{start();time=at;currentStage=difficultyAt().index;objects=[];spawnIn=1e6;boostRemaining=b;giantRemaining=g;},
 pattern:(stage,index,b=false,g=false,at=null)=>{start();window.testDestroyed=new Set();time=at??DIFFICULTY[stage].start+(stage===0?1:stage===1?6:2);currentStage=difficultyAt().index;
 obstacleChoices={single:Math.floor(index/DIFFICULTY[stage].recipes.length),double:Math.floor(index/DIFFICULTY[stage].recipes.length)};patternIndex=index;nextBrushAt=nextGiantAt=1e6;boostRemaining=b?5:0;giantRemaining=g?5:0;visualScale=g?1.5:1;
 objects=[];spawn();spawnIn=1e6;return objects.filter(o=>o.type==='obstacle').map(o=>({...o}));},
 recipes:()=>DIFFICULTY.map(s=>s.recipes.length),
 rareSeries:()=>{start();const r=[];for(let t=0;t<=180;t+=.5){time=t;objects=[];spawn();for(const o of objects)if(['brush','giant'].includes(o.type))r.push({t,type:o.type});}objects=[];return r;},
 collision:()=>{const d=OBSTACLES[0];objects=[{type:'obstacle',path:d.path,core:d.core,x:player.x,y:player.y+15,w:74,h:74,hit:false}];invincible=0;}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{let seed=987654;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};});await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const levels=await page.evaluate(()=>[0,9.999,10,19.999,20,34.999,35,49.999,50,500].map(t=>({t,index:difficultyTest.stageAt(t).index,target:difficultyTest.stageAt(t).speed,speed:difficultyTest.speedAt(t)})));
  assert.deepEqual(levels.map(l=>l.index),[0,0,1,1,2,2,3,3,4,4]);assert.deepEqual(levels.map(l=>l.target),[1.25,1.25,1.45,1.45,1.65,1.65,1.85,1.85,2,2]);
  for(const boundary of [10,20,35,50]){const values=await page.evaluate(t=>[difficultyTest.speedAt(t-.0001),difficultyTest.speedAt(t+.0001),difficultyTest.speedAt(t+1.5)],boundary);assert(Math.abs(values[1]-values[0])<1e-5);assert.equal(values[2],levels.find(l=>l.t===boundary).target);}
  const actualSpeeds=await page.evaluate(()=>[1,12,22,37,52,500].map(t=>{difficultyTest.isolated(t);const base=difficultyTest.state().speed;difficultyTest.isolated(t,5);return{t,base,brush:difficultyTest.state().speed};}));
  for(const [i,r] of actualSpeeds.entries()){assert(Math.abs(r.base-[382.5,443.7,504.9,566.1,612,612][i])<1e-6);assert(Math.abs(r.brush-r.base*1.5)<1e-6);}
  const physics=await page.evaluate(()=>{const g=difficultyTest,r=[];for(const t of [1,12,22,37,52])for(const b of [0,5]){g.isolated(t,b);g.jump();g.update(.2);const first=g.state().player;g.jump();g.update(.2);const second=g.state().player;r.push({first,second});}return r;});
  for(const r of physics){assert(Math.abs(r.first.y-271)<1e-7);assert(Math.abs(r.second.y-183)<1e-7);assert(Math.abs(r.second.vy+260)<1e-7);}
  const routes=await page.evaluate(()=>{
   const g=difficultyTest,results=[];
   function route(stage,index,boost,giant,fps,jitter=0,at=null){
    const initial=g.pattern(stage,index,boost,giant,at),r={stage,index,boost,giant,fps,jitter,nodes:initial.length,health:3,minRecovery:Infinity,visible:true};
    let cursor=0,airborne=false,jumpAt=0,second=false,lastLanding=null,steps=0;
    while(cursor<initial.length&&steps++<20000){
     const state=g.state();const o=state.objects.find(o=>o.type==='obstacle'&&o.order===cursor)||(airborne?initial[cursor]:null);
     if(!o&&g.destroyed(initial[cursor].group,initial[cursor].order)){cursor++;continue;}if(!o)throw new Error('target disappeared '+JSON.stringify(r));
     if(airborne&&state.player.grounded){airborne=false;lastLanding=state.time;cursor++;continue;}
     let dt=1/fps;
     if(!airborne){
      const lead=o.lead-jitter,delta=o.x+o.w/2-(state.player.x+state.player.w/2)-g.predictTravel(lead);
      if(delta<=.05){
       if(lastLanding!==null)r.minRecovery=Math.min(r.minRecovery,state.time-lastLanding);
       r.visible&&=o.x<state.worldWidth;g.jump();airborne=true;jumpAt=state.time;second=false;continue;
      }
      dt=Math.min(dt,Math.max(.00005,delta/1200));
     }else if(o.pattern==='double'&&!second){
      const until=.24-(state.time-jumpAt);
      if(until<=1e-8){g.jump();second=true;continue;}
      dt=Math.min(dt,until);
     }
     g.update(dt);r.health=g.state().health;if(r.health!==3)break;
    }
    r.finished=cursor===initial.length;r.minRecovery=Number.isFinite(r.minRecovery)?r.minRecovery:null;r.paths=initial.map(o=>o.path);r.gap=initial.length>1?initial[1].x+initial[1].w/2-initial[0].x-initial[0].w/2:null;
    return r;
   }
   const recipes=g.recipes();
   for(let stage=0;stage<5;stage++)for(let index=0;index<recipes[stage]*3;index++)for(const boost of [false,true])for(const giant of [false,true])for(const fps of [15,60,120])results.push(route(stage,index,boost,giant,fps));
   for(let stage=0;stage<5;stage++)for(let index=0;index<recipes[stage]*3;index++)for(const boost of [false,true])for(const jitter of [-.03,.03])results.push(route(stage,index,boost,false,60,jitter));
   for(const [stage,at]of [[0,9.7],[1,19.7],[2,34.7],[3,49.7]])for(const jitter of [-.03,0,.03])for(const boost of [false,true])results.push(route(stage,0,boost,false,60,jitter,at));
   return results;
  });
  for(const r of routes){assert.equal(r.health,3,JSON.stringify(r));assert(r.finished,JSON.stringify(r));if(r.minRecovery!==null)assert(r.minRecovery>=.085-1e-3,JSON.stringify(r));}
  const paths=new Set(routes.flatMap(r=>r.paths));assert.deepEqual([...paths].sort(),[1,2,6,7,9].map(n=>`assets/obstacles/기타이미지${n}.png`).sort());
  assert(routes.filter(r=>r.stage===0).every(r=>r.paths.every(p=>/기타이미지[12]\.png$/.test(p))));
  const rare=await page.evaluate(()=>difficultyTest.rareSeries());for(const type of ['brush','giant']){const events=rare.filter(e=>e.type===type);for(let i=1;i<events.length;i++)assert(events[i].t-events[i-1].t>=(type==='brush'?36:48));}
  const pause=await page.evaluate(()=>{const g=difficultyTest;g.isolated(19.99,5,5);g.pause();const before=g.state();g.update(50);const after=g.state();g.pause();g.update(.02);const resumed=g.state();g.update(1.01);const faded=g.state();g.update(5.1);for(let i=0;i<3;i++){g.collision();g.update(.01);}const over=g.state();g.start();return {before,after,resumed,faded,over,reset:g.state()};});
  assert.deepEqual(pause.before,pause.after);assert.equal(pause.resumed.stage,2);assert.equal(await page.locator('#difficulty-note').count(),0);assert.equal(pause.reset.stage,0);assert.equal(pause.reset.time,0);assert.equal(pause.reset.boostRemaining,0);assert.equal(pause.reset.giantRemaining,0);assert.equal(pause.over.mode,'over');
  const caps=[];for(const width of [320,390,1280]){await page.setViewportSize({width,height:900});await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width/difficultyTest.state().worldWidth-r.height/500)<.001;});const cap=await page.evaluate(()=>{difficultyTest.isolated(120,5);return difficultyTest.state();});assert(cap.speed<=1193.4+1e-6);assert(cap.cap>=306*1.25);caps.push({width,cap:cap.cap,speed:cap.speed});}
  const continuous=[];
  for(const viewport of [{width:1280,height:900},{width:390,height:900},{width:320,height:900},{width:568,height:320,mobile:true},{width:844,height:390,mobile:true},{width:390,height:844,mobile:true}]){
   let active=page,mobileContext=null;
   if(viewport.mobile){mobileContext=await browser.newContext({viewport:{width:viewport.width,height:viewport.height},hasTouch:true,isMobile:true});active=await mobileContext.newPage();active.on('pageerror',e=>errors.push(e.message));await active.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await active.clock.install();await active.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await active.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await active.clock.pauseAt(await active.evaluate(()=>Date.now()+100));}
   else await active.setViewportSize({width:viewport.width,height:viewport.height});
   await active.waitForFunction(()=>{const r=getComputedStyle(document.querySelector('canvas'));return Math.abs(difficultyTest.state().worldWidth-500*parseFloat(r.width)/parseFloat(r.height))<.01;});
   if(viewport.mobile){const measured=await active.evaluate(()=>[1,12,22,37,52].map(t=>{difficultyTest.isolated(t);const base=difficultyTest.state().speed;difficultyTest.isolated(t,5);return{base,brush:difficultyTest.state().speed};}));for(const [i,r]of measured.entries()){assert(Math.abs(r.base-[382.5,443.7,504.9,566.1,612][i])<1e-6);assert(Math.abs(r.brush-r.base*1.5)<1e-6);}}
   continuous.push(await active.evaluate(()=>{
    const g=difficultyTest;g.start();window.fastCaptures=[];const passed=new Set();let airborne=false,target=null,jumpAt=0,second=false,lastLanding=null,minRecovery=Infinity,jumps=0,minVisible=Infinity,steps=0;window.recoveryDiagnostics=[];
    while(g.state().time<185&&steps++<80000){
     const state=g.state();const captureAt=[.5,20.5,35.5,52][window.fastCaptures.length];if(captureAt!==undefined&&state.time>=captureAt){g.render();window.fastCaptures.push({at:captureAt,data:document.querySelector('#game').toDataURL()});}if(state.health!==3)return {health:state.health,time:state.time,target,player:state.player,objects:state.objects,boost:state.boostRemaining,giant:state.giantRemaining};
     if(state.giantRemaining>0)lastLanding=null;
     if(airborne&&state.player.grounded){passed.add(target.group+':'+target.order);airborne=false;lastLanding=state.giantRemaining>0?null:state.time;}
     if(!airborne)target=state.objects.filter(o=>o.type==='obstacle'&&!passed.has(o.group+':'+o.order)).sort((a,b)=>(a.x+a.w/2)-(b.x+b.w/2))[0];
     let dt=1/30;
     if(!airborne&&target){
      const delta=target.x+target.w/2-(state.player.x+state.player.w/2)-g.predictTravel(target.lead);
      if(delta<=.05){if(lastLanding!==null){minRecovery=Math.min(minRecovery,state.time-lastLanding);if(state.time-lastLanding<.085)window.recoveryDiagnostics.push({time:state.time,lastLanding,target,giant:state.giantRemaining,boost:state.boostRemaining,player:state.player,objects:state.objects.filter(o=>o.type==='obstacle')});}minVisible=Math.min(minVisible,(state.worldWidth-target.x)/state.speed);g.jump();airborne=true;jumpAt=state.time;second=false;jumps++;continue;}
      dt=Math.min(dt,Math.max(.00005,delta/1200));
     }else if(airborne&&target.pattern==='double'&&!second){const until=.24-(state.time-jumpAt);if(until<=1e-8){g.jump();second=true;continue;}dt=Math.min(dt,until);}
     g.update(dt);
    }
    const state=g.state();return {width:state.worldWidth,health:state.health,time:state.time,stage:state.stage,jumps,minRecovery,minVisible,score:state.score,recoveryDiagnostics:window.recoveryDiagnostics};
   }));
   const shotDir=path.resolve(__dirname,'../work/validation');fs.mkdirSync(shotDir,{recursive:true});for(const shot of await active.evaluate(()=>window.fastCaptures||[]))fs.writeFileSync(path.join(shotDir,`fast-${viewport.width}x${viewport.height}-${shot.at}s.png`),Buffer.from(shot.data.split(',')[1],'base64'));
   if(mobileContext)await mobileContext.close();
  }
  for(const run of continuous){assert.equal(run.health,3,JSON.stringify(run));assert(run.time>=185);assert.equal(run.stage,4);assert(run.minRecovery>=.085-1e-3,JSON.stringify(run));assert(run.minVisible>=.075,JSON.stringify(run));}
  const output=path.resolve(__dirname,'../work/validation');fs.mkdirSync(output,{recursive:true});await page.evaluate(()=>{difficultyTest.pattern(4,0);difficultyTest.render();difficultyTest.pause();});await page.screenshot({path:path.join(output,'difficulty-expert.png')});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({result:'PASS',routes:routes.length,obstacles:routes.reduce((n,r)=>n+r.nodes,0),continuous,minLandingRecovery:Math.min(...routes.filter(r=>r.minRecovery!==null).map(r=>r.minRecovery)),levels,actualSpeeds,caps,rareItems:rare,checks:['fixed real-time jump physics','five stages and smooth ramps','all recipes normal/boost/giant/both at 15/60/120fps','stage-boundary and input jitter routes','no impossible collisions','landing room','real-time rare-item cooldowns','pause freezes difficulty/effects','restart resets stage','speed cap','no JavaScript errors']}));
 }finally{await browser.close();}
})();
