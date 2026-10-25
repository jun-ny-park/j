const path=require('node:path');const screenshotDir=path.resolve(__dirname,'../work/validation');require('node:fs').mkdirSync(screenshotDir,{recursive:true});
const {chromium}=require('playwright');const fs=require('node:fs');const assert=require('node:assert/strict');
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8');
const instrument=source.replace(' hud();requestAnimationFrame(frame);',` window.testGame={
 state:()=>({mode,score,health,distance,time,player:{...player},objects:objects.map(o=>({...o})),effects:effects.map(e=>({...e})),tiles:tiles.map(t=>({path:t.path,width:t.width})),worldWidth}),
 jump,update,start,spawn,background,
 isolated:()=>{start();objects=[];spawnIn=100;},
 pattern:(index)=>{start();patternIndex=index;objects=[];spawn();spawnIn=100;const delta=worldWidth+40-(player.x+player.w/2);objects.forEach(o=>o.x-=delta);},
 collide:()=>{objects=[{type:'obstacle',path:asset.obstacles[0],x:player.x,y:player.y,w:74,h:98,hit:false}];invincible=0;},
 backgroundAt:(travel)=>{distance=travel/20;background();}
 };hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(require('node:fs').existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],bad=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
 await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:instrument}));await page.clock.install();await page.goto((process.env.GAME_URL||'http://127.0.0.1:8001'));
 await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('h1').innerText(),'유생런');assert.equal(await page.locator('#overlay-description').innerText(),'성균관에 특별한 시험이 열렸도다.\n장애물을 뛰어넘고 귤을 모아\n장원급제의 영광을 차지해 보시오!');
 assert(await page.evaluate(()=>document.fonts.check('20px "Gamja Flower"','유생런')));
 for(const selector of ['h1','#overlay-description','#score','#final-score','#jump'])assert((await page.locator(selector).evaluate(e=>getComputedStyle(e).fontFamily)).includes('Gamja Flower'),selector);
 await page.screenshot({path:path.join(screenshotDir,'third-start.png')});
 const physics=await page.evaluate(()=>{const g=testGame;const tick=n=>{for(let i=0;i<n;i++)g.update(.01);};g.isolated();g.jump();tick(20);const first=g.state();g.jump();tick(20);const second=g.state();const before=second.player.vy;g.jump();const third=g.state();tick(120);const landed=g.state();g.jump();return {first,second,third,before,landed,afterLanding:g.state()};});
 assert.equal(physics.first.player.jumps,1);assert.equal(physics.second.player.jumps,2);assert(physics.second.player.y<physics.first.player.y-40);assert.equal(physics.third.player.vy,physics.before);assert.equal(physics.landed.player.jumps,0);assert.equal(physics.afterLanding.player.jumps,1);
 const trials=await page.evaluate(()=>{const g=testGame,results=[];for(let index=0;index<20;index++){
  g.pattern(index);const initial=g.state();const oranges=initial.objects.filter(o=>o.type==='orange');const obstacles=initial.objects.filter(o=>o.type!=='orange');
  const overlaps=oranges.some(o=>obstacles.some(b=>o.x<b.x+b.w&&o.x+o.w>b.x&&o.y<b.y+b.h&&o.y+o.h>b.y));
  if(index%4!==0&&index%4!==2)g.jump();for(let t=0;t<150;t++){if(index%4===3&&t===24)g.jump();g.update(.01);}const end=g.state();results.push({index,oranges:oranges.length,collected:end.score/100,health:end.health,overlaps,outside:oranges.some(o=>o.y<0||o.y+o.h>500)});
 }return results;});
 for(const trial of trials){assert(!trial.overlaps,JSON.stringify(trial));assert(!trial.outside);assert.equal(trial.health,3,JSON.stringify(trial));assert.equal(trial.collected,trial.oranges,JSON.stringify(trial));}
 const high=await page.evaluate(()=>{testGame.pattern(3);testGame.jump();for(let i=0;i<150;i++)testGame.update(.01);return testGame.state().score/100;});assert(high<trials[3].oranges,'high trail actually needs double jump');
 await page.evaluate(()=>testGame.isolated());await page.keyboard.press('Space');await page.clock.runFor(150);await page.keyboard.press('Space');await page.clock.runFor(150);assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
 await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
 await page.evaluate(()=>testGame.isolated());
 const collision=await page.evaluate(()=>{testGame.pattern(0);for(let i=0;i<150;i++)testGame.update(.01);for(let i=0;i<3;i++){testGame.collide();testGame.update(.01);}return testGame.state();});assert.equal(collision.health,0);assert.equal(collision.mode,'over');assert(await page.locator('#result').isVisible());
 assert.equal(await page.locator('#final-score').innerText(),await page.locator('#score').innerText());await page.screenshot({path:path.join(screenshotDir,'third-gameover.png')});
 await page.getByRole('button',{name:'다시하기',exact:true}).click();assert.equal(await page.locator('#score').innerText(),'0');assert.match(await page.locator('#health').innerText(),/3 \/ 3/);
 await page.getByRole('button',{name:'일시 정지',exact:true}).click();const distance=await page.locator('#distance').innerText();await page.clock.runFor(3000);assert.equal(await page.locator('#distance').innerText(),distance);await page.getByRole('button',{name:'계속 달리기 →',exact:true}).click();
 for(const width of [320,375,390,640,844,1280]){await page.setViewportSize({width,height:900});await page.clock.runFor(20);await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width/testGame.state().worldWidth-r.height/500)<.001;});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const geometry=await page.evaluate(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return [r.width/testGame.state().worldWidth,r.height/500];});assert(Math.abs(geometry[0]-geometry[1])<.001,'uniform aspect ratio '+width+' '+geometry);}
 await page.setViewportSize({width:320,height:844});await page.evaluate(()=>testGame.start());await page.getByRole('button',{name:'일시 정지',exact:true}).click();await page.evaluate(()=>{document.querySelector('#paused').hidden=true;document.querySelector('#welcome').hidden=false;});
 const fits=await page.locator('#overlay-description').evaluate(e=>{const r=e.getBoundingClientRect(),p=e.parentElement.getBoundingClientRect();return {height:r.height,fit:r.left>=p.left&&r.right<=p.right};});assert(fits.fit,'three description lines fit 320px');await page.screenshot({path:path.join(screenshotDir,'third-mobile-start.png')});
 await page.evaluate(()=>testGame.isolated());await page.locator('#jump').dispatchEvent('pointerdown');await page.clock.runFor(150);await page.locator('#game').dispatchEvent('pointerdown');await page.clock.runFor(150);assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);await page.screenshot({path:path.join(screenshotDir,'third-mobile-play.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);
 console.log(JSON.stringify({result:'PASS',physics:'first / second ascent, third rejected, landing reset',trials,highWithSingleJump:high,checks:['official local font loaded','font consistent including final score','final copy and 3 lines','keyboard and touch double jump','collision game over and restart','pause','6 viewports and uniform proportions','320px description fits','all assets 200','no JavaScript errors']}));await browser.close();
})();
