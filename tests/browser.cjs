const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../work/validation');fs.mkdirSync(output,{recursive:true});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.testGame={
 state:()=>({mode,score,health,time,stage:currentStage,boostRemaining,giantRemaining,visualScale,distance,player:{...player},objects:objects.map(o=>({...o})),worldWidth}),
 isolated:()=>{start();objects=[];spawnIn=1e6;},update,jump,pause,start,render,
 place:type=>{objects=[{type,path:asset[type][0],x:player.x+18,y:player.y+20,w:38,h:47,hit:false}];},
 orange:n=>{objects=[{type:'orange',path:asset.items[n],x:player.x+18,y:player.y+20,w:36,h:36,phase:0,hit:false}];},
 collision:()=>{const d=OBSTACLES[0];objects=[{type:'obstacle',path:d.path,core:d.core,x:player.x,y:player.y+15,w:74,h:74,hit:false}];invincible=0;}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
 const page=await browser.newPage({viewport:{width:1280,height:960}}),errors=[],bad=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)bad.push(r.url());});
 await page.addInitScript(()=>{window.characterDraws=[];const draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(im,...args){if(im.src?.includes('/characters/'))window.characterDraws.push(args);return draw.call(this,im,...args);};});
 await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.evaluate(()=>document.fonts.ready);
 assert.equal(await page.locator('#paused button').count(),1);assert.equal(await page.locator('#resume').innerText(),'다시 달려보세');assert.equal(await page.locator('.effect-timers img').count(),0);
 assert(await page.evaluate(()=>document.fonts.check('20px "Gamja Flower"','유생런 다시 달려보세 5초')));
 const timers=await page.evaluate(()=>{
  const g=testGame;g.isolated();g.place('brush');g.update(1/120);const brush=g.state();g.place('giant');g.update(1/120);const book=g.state();g.update(.5);const enlarged=g.state();
  g.isolated();g.place('brush');g.update(1/120);g.place('giant');g.update(1/120);
  g.update(4.99);const almost=g.state();g.update(.01);const expired=g.state();g.update(.5);const restored=g.state();
  return {brush,book,enlarged,almost,expired,restored};
 });
 assert.equal(timers.brush.boostRemaining,5);assert.equal(timers.book.giantRemaining,5);assert.equal(timers.enlarged.visualScale,1.5);assert(Math.abs(timers.almost.giantRemaining-.01)<1e-7);assert.equal(timers.expired.boostRemaining,0);assert.equal(timers.expired.giantRemaining,0);assert.equal(timers.restored.visualScale,1);
 await page.evaluate(()=>{testGame.isolated();testGame.place('giant');testGame.update(1/120);testGame.update(.5);testGame.place('brush');testGame.update(1/120);testGame.render();});
 assert(Math.abs((await page.evaluate(()=>{const r=characterDraws.at(-1);return r[1]+r[3];}))-461)<.001);
 await page.getByRole('button',{name:'일시 정지',exact:true}).click();const before=await page.evaluate(()=>testGame.state());await page.clock.runFor(3000);assert.deepEqual(await page.evaluate(()=>testGame.state()),before);
 await page.screenshot({path:path.join(output,'difficulty-pause.png')});const resumed=await page.evaluate(()=>{document.querySelector('#resume').click();return testGame.state();});assert.equal(resumed.giantRemaining,before.giantRemaining);await page.clock.runFor(100);assert((await page.evaluate(()=>testGame.state().giantRemaining))<resumed.giantRemaining);
 await page.evaluate(()=>testGame.isolated());await page.keyboard.press('Space');await page.clock.runFor(120);await page.keyboard.press('Space');await page.clock.runFor(120);assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);await page.keyboard.press('Space');assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);
 await page.evaluate(()=>{testGame.isolated();for(let i=0;i<6;i++){testGame.orange(i);testGame.update(.01);}for(let i=0;i<3;i++){testGame.collision();testGame.update(.01);}});
 assert.equal(await page.locator('#final-score').innerText(),'600점');assert(await page.locator('#result').isVisible());await page.locator('#restart').click();assert.equal(await page.locator('#score').innerText(),'0');assert.match(await page.locator('#health').innerText(),/3 \/ 3/);
 for(const width of [320,375,390,640,844,1280]){await page.setViewportSize({width,height:900});await page.clock.runFor(20);await page.waitForFunction(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return Math.abs(r.width/testGame.state().worldWidth-r.height/500)<.001;});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>testGame.isolated());assert.equal(await page.locator('#jump').count(),0);await page.locator('#game').dispatchEvent('pointerdown');await page.clock.runFor(120);await page.locator('#game').dispatchEvent('pointerdown');await page.clock.runFor(120);assert.equal(await page.evaluate(()=>testGame.state().player.jumps),2);await page.screenshot({path:path.join(output,'difficulty-mobile.png')});
 assert.deepEqual(errors,[]);assert.deepEqual(bad,[]);console.log('PASS: keyboard/mobile double jump, 5-second effects, enlargement feet, full pause state, 600-point game over, restart, six viewports, font/assets and no JavaScript errors');
 }finally{await browser.close();}
})();
