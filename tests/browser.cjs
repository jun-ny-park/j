const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const screenshotDir = path.resolve(__dirname, '../work/validation');
fs.mkdirSync(screenshotDir, { recursive: true });
const source = fs.readFileSync(path.resolve(__dirname, '../game.js'), 'utf8');
// These controls are injected into the browser response only, never the production game.
const instrumented = source.replace(' hud();requestAnimationFrame(frame);', `
 window.testGame = {
  state: () => ({mode, score, health, time, runTime, distance, boostRemaining,
   speed: SPEED * (boostRemaining > 0 ? BOOST_FACTOR : 1),
   player: {...player}, objects: objects.map(o=>({...o})), effects: effects.map(e=>({...e})), worldWidth,
   visible: objects.map(o=>({type:o.type,rect:spriteRect(o),hit:hitRect(o)}))}),
  start, jump, update, pause, render,
  isolated: () => {start();objects=[];spawnIn=1e6;},
  brush: () => {objects=[{type:'brush',path:asset.brush[0],x:player.x+18,y:player.y+20,w:38,h:47,hit:false}];},
  boost: seconds => {boostRemaining=seconds;hud();},
  pattern: (index, boosted=false) => {
   start();patternIndex=index;objects=[];spawn();spawnIn=1e6;
   const shift=worldWidth+40-(player.x+player.w/2);
   objects=objects.filter(o=>o.type!=='brush');objects.forEach(o=>o.x-=shift);
   boostRemaining=boosted?10:0;
  },
  // Geometry-only regression fixtures. They are not wood artwork and never ship as game assets.
  collision: () => {objects=[{type:'obstacle',path:null,x:player.x,y:player.y,w:74,h:98,hit:false}];invincible=0;},
  woodGeometry: high => {
   const h=high?142:62,w=high?40:60;
   objects=[{type:'obstacle',path:null,x:player.x+player.w/2+SPEED*(high?.5:.355)-w/2,y:GROUND-h,w,h,hit:false}];
  }
 };hud();requestAnimationFrame(frame);`);
assert.notEqual(instrumented, source, 'test injection marker');

(async () => {
 const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
  headless: true, args: ['--no-sandbox']
 });
 try {
  const page = await browser.newPage({viewport:{width:1280,height:960}});
  const errors=[], bad=[], requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
  page.on('request',r=>requests.push(decodeURIComponent(r.url())));
  await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:instrumented}));
  await page.clock.install();
  await page.goto(process.env.GAME_URL || 'http://127.0.0.1:8001');
  await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));
  await page.evaluate(()=>document.fonts.ready);
  assert.equal(await page.locator('h1').innerText(),'유생런');
  assert.equal(await page.locator('#overlay-description').innerText(),'성균관에 특별한 시험이 열렸도다.\n장애물을 뛰어넘고 귤을 모아\n장원급제의 영광을 차지해 보시오!');
  assert.equal(await page.locator('#paused h2').innerText(),'잠시 쉬어가게나');
  assert.equal(await page.locator('#resume').innerText(),'다시 달려보세!');
  assert.equal(await page.locator('#pause-restart').innerText(),'다시 도전하기');
  assert(!await page.locator('body').innerText().then(s=>s.includes('그림자가 있는 물체는 장애물')));
  assert(await page.evaluate(()=>document.fonts.check('20px "Gamja Flower"','잠시 쉬어가게나 다시 달려보세! 도전 가속 초')));
  for(const selector of ['h1','#overlay-description','#score','#final-score','#jump','#resume','#pause-restart']) {
   assert((await page.locator(selector).evaluate(e=>getComputedStyle(e).fontFamily)).includes('Gamja Flower'),selector);
  }
  await page.screenshot({path:path.join(screenshotDir,'fourth-start.png')});

  const physics = await page.evaluate(()=>{
   const g=testGame,tick=n=>{for(let i=0;i<n;i++)g.update(.01);};
   g.isolated();g.jump();tick(20);const first=g.state();g.jump();tick(20);const second=g.state();
   g.jump();const third=g.state();tick(120);const landed=g.state();g.jump();
   return {first,second,third,landed,next:g.state()};
  });
  assert.equal(physics.first.player.jumps,1);assert.equal(physics.second.player.jumps,2);
  assert(physics.second.player.y<physics.first.player.y-40);
  assert.equal(physics.third.player.vy,physics.second.player.vy);
  assert.equal(physics.landed.player.jumps,0);assert.equal(physics.next.player.jumps,1);

  const trials = await page.evaluate(()=>{
   const g=testGame,results=[];
   for(const fps of [15,30,60,120])for(const boosted of [false,true])for(let index=0;index<20;index++){
    g.pattern(index,boosted);const initial=g.state(),count=initial.objects.length;
    const factor=boosted?1.5:1,kind=index%4;
    if(kind===1||kind===3)g.jump();
    let t=0,second=false;
    while(t<1.5/factor-1e-9){
     const at=.24/factor;
     if(kind===3&&!second&&t>=at-1e-9){g.jump();second=true;}
     let dt=Math.min(1/fps,1.5/factor-t);
     if(kind===3&&!second&&t<at)dt=Math.min(dt,at-t);
     g.update(dt);t+=dt;
    }
    const end=g.state();results.push({fps,boosted,index,count,collected:end.score/100,health:end.health,
     obstacles:initial.objects.filter(o=>o.type==='obstacle').length,
     outside:initial.objects.some(o=>o.y<0||o.y+o.h>500)});
   }
   return results;
  });
  for(const t of trials){assert.equal(t.collected,t.count,JSON.stringify(t));assert.equal(t.health,3);assert.equal(t.obstacles,0);assert(!t.outside);}
  const geometry = await page.evaluate(()=>{
   const g=testGame,result=[];
   for(const boosted of [false,true])for(const high of [false,true])for(const jumps of [1,2]){
    g.isolated();g.boost(boosted?10:0);g.woodGeometry(high);g.jump();
    for(let i=0;i<150;i++){if(jumps===2&&i===24)g.jump();g.update(.01/(boosted?1.5:1));}
    result.push({boosted,high,jumps,health:g.state().health});
   }return result;
  });
  for(const t of geometry){assert.equal(t.health,t.high&&t.jumps===1?2:3,JSON.stringify(t));}

  const boostTests=await page.evaluate(()=>{
   const g=testGame;
   g.isolated();g.update(1);const base=g.state();
   g.isolated();g.brush();g.update(1/120);const acquired=g.state();
   const origin=acquired.distance;g.update(1);const fast=g.state();
   g.update(8.99);const beforeExpiry=g.state();g.update(.01);const expired=g.state();
   const afterOrigin=expired.distance;g.update(1);const restored=g.state();
   g.brush();g.update(1/120);g.update(4);g.brush();g.update(1/120);const refreshed=g.state();
   g.pause();const pausedBefore=g.state();g.update(100);const pausedAfter=g.state();g.pause();
   for(let i=0;i<3;i++){g.collision();g.update(.01);}const over=g.state();
   g.start();const restarted=g.state();
   return {base,acquired,fast,beforeExpiry,expired,restored,origin,afterOrigin,refreshed,pausedBefore,pausedAfter,over,restarted};
  });
  assert.equal(boostTests.base.speed,306);
  assert(Math.abs(boostTests.base.distance*20-306)<1e-6);
  assert.equal(boostTests.acquired.boostRemaining,10);
  assert.equal(boostTests.fast.speed,459);
  assert(Math.abs((boostTests.fast.distance-boostTests.origin)*20-459)<1e-6);
  assert(Math.abs(boostTests.beforeExpiry.boostRemaining-.01)<1e-7);
  assert.equal(boostTests.expired.boostRemaining,0);assert.equal(boostTests.expired.speed,306);
  assert(Math.abs((boostTests.restored.distance-boostTests.afterOrigin)*20-306)<1e-6);
  assert.equal(boostTests.refreshed.boostRemaining,10);assert.equal(boostTests.refreshed.speed,459);
  assert.equal(boostTests.pausedBefore.boostRemaining,boostTests.pausedAfter.boostRemaining);
  assert.equal(boostTests.pausedBefore.distance,boostTests.pausedAfter.distance);
  assert.equal(boostTests.over.mode,'over');assert.equal(boostTests.over.boostRemaining,0);
  assert.equal(boostTests.restarted.boostRemaining,0);assert.equal(boostTests.restarted.score,0);

  const natural=await page.evaluate(()=>{
   testGame.start();let acquired=false,firstTimer=0,maxEffects=0;
   for(let i=0;i<1800;i++){
    testGame.update(.01);const state=testGame.state();
    maxEffects=Math.max(maxEffects,state.effects.length);
    if(!acquired&&state.boostRemaining>0){acquired=true;firstTimer=state.boostRemaining;}
   }
   return {acquired,firstTimer,maxEffects,state:testGame.state()};
  });
  assert(natural.acquired,'naturally spawned brush is reachable without fixture placement');
  assert(natural.firstTimer>9.98);
  assert.equal(natural.state.boostRemaining,0,'natural boost expires before the next brush');
  assert(natural.maxEffects<=4,'effects remain bounded');

  // A boost beginning or expiring midair must preserve the reachable spatial trail.
  const transitions=await page.evaluate(()=>{
   const g=testGame,results=[];
   for(const action of ['start','end']){
    g.pattern(3,action==='end');if(action==='end')g.boost(.2);g.jump();
    let second=false;
    while(g.state().runTime<1.5-1e-8){
     const before=g.state();if(!second&&before.runTime>=.24-1e-8){g.jump();second=true;}
     if(action==='start'&&before.runTime>=.35&&before.boostRemaining===0)g.boost(10);
     const factor=g.state().speed/306;
     let dt=Math.min(.005,(1.5-before.runTime)/factor);
     if(!second)dt=Math.min(dt,(.24-before.runTime)/factor);
     g.update(dt);
    }
    results.push({action,score:g.state().score});
   }return results;
  });
  for(const t of transitions)assert.equal(t.score,700,JSON.stringify(t));

  await page.evaluate(()=>testGame.isolated());await page.keyboard.press('Space');await page.clock.runFor(150);
  await page.keyboard.press('Space');await page.clock.runFor(150);
  assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
  await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
  await page.evaluate(()=>{testGame.isolated();testGame.brush();testGame.update(1/120);});
  await page.getByRole('button',{name:'일시 정지',exact:true}).click();
  const paused=await page.evaluate(()=>testGame.state().boostRemaining);
  await page.clock.runFor(3000);assert.equal(await page.evaluate(()=>testGame.state().boostRemaining),paused);
  await page.screenshot({path:path.join(screenshotDir,'fourth-pause.png')});
  await page.locator('#resume').click();
  await page.clock.runFor(100);assert((await page.evaluate(()=>testGame.state().boostRemaining))<paused);
  await page.getByRole('button',{name:'일시 정지',exact:true}).click();
  await page.locator('#pause-restart').click();assert.equal(await page.evaluate(()=>testGame.state().boostRemaining),0);
  assert(await page.locator('#boost').isHidden());
  await page.evaluate(()=>{testGame.pattern(0);for(let i=0;i<150;i++)testGame.update(.01);for(let i=0;i<3;i++){testGame.collision();testGame.update(.01);}});
  assert.equal(await page.locator('#final-score').innerText(),'600');
  await page.screenshot({path:path.join(screenshotDir,'fourth-gameover.png')});
  await page.locator('#restart').click();

  for(const width of [320,375,390,640,844,1280]){
   await page.setViewportSize({width,height:900});await page.clock.runFor(20);
   await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width/testGame.state().worldWidth-r.height/500)<.001;});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:320,height:844});
  await page.evaluate(()=>testGame.isolated());await page.locator('#jump').dispatchEvent('pointerdown');await page.clock.runFor(150);
  await page.locator('#game').dispatchEvent('pointerdown');await page.clock.runFor(150);
  assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
  await page.evaluate(()=>{testGame.isolated();testGame.brush();testGame.update(1/120);testGame.pattern(1,true);testGame.update(.005);testGame.render();});
  await page.screenshot({path:path.join(screenshotDir,'fourth-mobile.png')});
  await page.getByRole('button',{name:'일시 정지',exact:true}).click();
  await page.screenshot({path:path.join(screenshotDir,'fourth-mobile-pause.png')});
  assert(!requests.some(u=>/\/obstacles\/(귤이미지[78]|기타이미지)|\/extras\/기타이미지(3|8|10)\./.test(u)),'removed obstacles and floating decorations are not requested');
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
  console.log(JSON.stringify({result:'PASS',patterns:trials.length,reachableOranges:trials.reduce((n,t)=>n+t.count,0),
   geometryFixtures:geometry,boost:'10 seconds, 1.5x, refresh, freeze, expiry, resets, midair transitions',
   checks:['PC and mobile double jump','pause/resume/restart copy','actual 600-point game over','6 viewports','local font','no old obstacle or decoration requests','all assets loaded','no JavaScript errors'],
   blocked:'Actual stump/log artwork absent; production obstacle appearance and image-specific collisions cannot be verified.'}));
 } finally {await browser.close();}
})();
