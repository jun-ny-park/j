const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../work/validation');fs.mkdirSync(output,{recursive:true});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.smashTest={
 state:()=>({mode,time,runTime,score,health,boostRemaining,giantRemaining,visualScale,giantIntroRemaining,lastGiantStep,invincible,
 player:{...player},objects:objects.map(o=>({...o})),flights:flyingObstacles.map(f=>({...f})),effects:effects.map(e=>({...e})),worldWidth}),
 update,jump,pause,start,endGame,render,endingOpacity,count:()=>OBSTACLES.length,
 isolated:(giant=5,boost=0,at=0)=>{start();time=at;currentStage=difficultyAt().index;objects=[];spawnIn=1e6;giantRemaining=giant;boostRemaining=boost;visualScale=giant?1.5:1;},
 effects:(g,b=0)=>{giantRemaining=g;boostRemaining=b;hud();},
 obstacle:(n=0,x=player.x+player.w/2+20,hit=false)=>{const d=OBSTACLES[n],h=d.height,a=d.fitVisible?alphaBounds[d.path]:{w:1,h:1},w=h*images[d.path].naturalWidth*a.w/(images[d.path].naturalHeight*a.h);objects.push({type:'obstacle',path:d.path,core:d.core,fitVisible:!!d.fitVisible,x:x-w/2,y:GROUND-h,w,h,hit,pattern:d.kind});},
 pickup:type=>objects.push({type,path:asset[type][0],x:player.x+18,y:player.y+20,w:38,h:47,hit:false}),
 orange:()=>objects.push({type:'orange',path:asset.items[0],x:player.x+18,y:player.y+20,w:36,h:36,phase:0,hit:false}),
 airborne:()=>{player.grounded=false;player.y=GROUND-player.h-100;player.vy=-200;},
 missingJumpFrame:()=>{const p=characterPath(8),saved=images[p];delete images[p];try{jump();window.draws=[];render();return window.draws.filter(d=>d.src.includes('/characters/'));}finally{images[p]=saved;}},
 freeze:()=>{mode='paused';panel(null);render();}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],requests=[],bad=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(decodeURIComponent(r.url())));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
  await page.addInitScript(()=>{window.draws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(im,...args){if(this.canvas.id==='game'&&im.src){const t=this.getTransform();window.draws.push({src:im.src,args,alpha:this.globalAlpha,angle:Math.atan2(t.b,t.a),x:t.e,y:t.f,filter:this.filter});}return draw.call(this,im,...args);};});
  await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));
  // Drive frames explicitly so host CPU load cannot advance flight ages between assertions.
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));
  const smashCases=await page.evaluate(()=>{const g=smashTest,r=[];for(const fps of [15,60,120])for(const boost of [0,5])for(let n=0;n<g.count();n++){
   const tick=seconds=>{let left=seconds;while(left>1e-9){const dt=Math.min(left,1/fps);g.update(dt);left-=dt;}};g.isolated(5,boost,115);g.obstacle(n);g.update(1/fps);const hit=g.state();tick(.3);const later=g.state();tick(.31);const end=g.state();r.push({fps,boost,n,hit,later,end});
  }return r;});
  for(const r of smashCases){assert.equal(r.hit.health,3);assert.equal(r.hit.objects.filter(o=>o.type==='obstacle').length,0);assert.equal(r.hit.flights.length,1);assert.equal(r.hit.flights[0].duration,.6);assert.equal(r.later.flights.length,1);assert.equal(r.end.flights.length,0);assert.equal(r.end.score,0);assert.equal(r.end.player.grounded,true);assert.equal(r.end.player.vy,0);}
  const runThrough=await page.evaluate(()=>{const g=smashTest;g.isolated(5,5,115);for(let i=0;i<g.count();i++)g.obstacle(i,g.state().player.x+150+i*120);for(let i=0;i<250;i++)g.update(.01);return g.state();});
  assert.equal(runThrough.health,3);assert.equal(runThrough.objects.filter(o=>o.type==='obstacle').length,0);assert.equal(runThrough.player.jumps,0);
  const simultaneous=await page.evaluate(()=>{const g=smashTest;g.isolated(0);g.obstacle(0);g.pickup('giant');g.orange();g.update(1/120);const first=g.state();g.update(.05);return {first,second:g.state()};});assert.equal(simultaneous.first.health,3);assert.equal(simultaneous.first.score,100);assert.equal(simultaneous.second.score,100);assert.equal(simultaneous.second.flights.length,1);
  const alreadyHit=await page.evaluate(()=>{smashTest.isolated(5);smashTest.obstacle(2,undefined,true);smashTest.update(.01);return smashTest.state();});assert.equal(alreadyHit.flights.length,1);
  await page.evaluate(()=>{smashTest.isolated(5);smashTest.obstacle(3);smashTest.update(.1);smashTest.render();});
  const a=await page.evaluate(()=>{window.draws=[];smashTest.render();return draws.find(d=>d.src.includes('/obstacles/'));});
  const b=await page.evaluate(()=>{smashTest.update(.25);window.draws=[];smashTest.render();return draws.find(d=>d.src.includes('/obstacles/'));});
  assert(b.x>a.x,'flies right');assert(b.y<a.y,'flies up');assert(b.angle>a.angle&&b.angle<.35,'slight rotation');assert(b.alpha<a.alpha,'fade');assert(b.args[2]<a.args[2],'shrink');assert.equal(b.filter,'none');
  await page.evaluate(()=>{smashTest.isolated(5,5);smashTest.obstacle(2);smashTest.update(.1);smashTest.pause();});const before=await page.evaluate(()=>smashTest.state());await page.clock.runFor(3000);const after=await page.evaluate(()=>smashTest.state());assert.deepEqual(before,after);await page.locator('#resume').click();await page.clock.runFor(100);assert((await page.evaluate(()=>smashTest.state().flights[0].age))>before.flights[0].age);
  const expiry=await page.evaluate(()=>{const g=smashTest;g.isolated(5,5);g.update(4.99);const almost=g.state();g.update(.01);const expired=g.state();g.obstacle(0);g.update(.01);const normal=g.state();g.isolated(5,5);g.obstacle(1);g.update(.01);g.endGame();const over=g.state();g.start();const reset=g.state();return {almost,expired,normal,over,reset};});assert(Math.abs(expiry.almost.giantRemaining-.01)<1e-7);assert.equal(expiry.expired.giantRemaining,0);assert.equal(expiry.expired.boostRemaining,0);assert.equal(expiry.normal.health,2);for(const s of [expiry.over,expiry.reset]){assert.equal(s.flights.length,0);assert.equal(s.effects.length,0);assert.equal(s.giantIntroRemaining,0);assert.equal(s.visualScale,1);}
  const flashes=await page.evaluate(()=>{const r=[];for(let i=0;i<=12;i++){smashTest.effects(1-i/12);r.push(smashTest.endingOpacity());}return r;});assert(Math.min(...flashes)>=.71);assert(Math.min(...flashes)<.8);assert.equal(flashes.at(-1),1);let dips=0;for(let i=1;i<flashes.length-1;i++)if(flashes[i]<flashes[i-1]&&flashes[i]<flashes[i+1])dips++;assert.equal(dips,3);
  const frameStates=await page.evaluate(()=>{
   const g=smashTest;window.draws=[];const record=()=>g.render();
   g.isolated(0);for(let i=0;i<40;i++){g.update(.025);record();}g.jump();record();g.update(.15);record();g.jump();record();g.update(.4);record();
   g.isolated(0);g.obstacle(0);g.update(.01);record();g.endGame();record();
   g.isolated(5);for(let i=0;i<60;i++){g.update(.05);record();}g.jump();record();g.update(.15);g.jump();record();
   return window.draws.filter(d=>d.src.includes('/characters/')).map(d=>({path:decodeURIComponent(d.src).split('/').at(-1),alpha:d.alpha,args:d.args}));
  });
  assert(frameStates.length>100);for(const d of frameStates){assert(!/캐릭터이미지[67]\.png$/.test(d.path));assert(d.alpha>0&&d.args[2]>0&&d.args[3]>0,'no empty frames');}
  await page.evaluate(()=>smashTest.isolated(0));const fallback=await page.evaluate(()=>smashTest.missingJumpFrame());assert.equal(fallback.length,1);assert(!/캐릭터이미지[67]\.png$/.test(decodeURIComponent(fallback[0].src)));
  assert(!requests.some(r=>/캐릭터이미지[67]\.png$/.test(r)),'sliding poses not requested');
  await page.evaluate(()=>{smashTest.isolated(0);smashTest.pickup('giant');smashTest.update(.12);smashTest.obstacle(4);smashTest.update(.1);smashTest.freeze();});await page.screenshot({path:path.join(output,'giant-smash-pc.png')});
  await page.setViewportSize({width:390,height:844});await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width/smashTest.state().worldWidth-r.height/500)<.001;});await page.evaluate(()=>{smashTest.isolated(5,5,115);smashTest.obstacle(2);smashTest.update(.12);smashTest.freeze();});await page.screenshot({path:path.join(output,'giant-smash-mobile.png')});
  assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);console.log(JSON.stringify({result:'PASS',smashCases:smashCases.length,checks:['all nine actual obstacles smashed without jumping','zero HP loss or recoil','same-step pickup immunity','no duplicate collision or score','right/up rotation shrink fade over 0.6 seconds','independent timers and pause-frozen flight','expiry restores ordinary damage','game over/restart clears all effects','three gentle ending flashes','sliding poses never loaded/drawn','normal/jump/double/giant/hit/game-over frames remain visible','PC/mobile screenshots']}));
 }finally{await browser.close();}
})();
