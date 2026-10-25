const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { chromium, devices } = require('playwright');
const output = path.resolve(__dirname, '../work/validation');
fs.mkdirSync(output, { recursive: true });
const source = fs.readFileSync(path.resolve(__dirname, '../game.js'), 'utf8').replace(' hud();requestAnimationFrame(frame);', `
window.orientationTest = {
  state:()=>({mode,score,health,time,distance,boostRemaining,giantRemaining,worldWidth,player:{...player}}),
  isolate:()=>{objects=[];spawnIn=1e6;},
  power:()=>{boostRemaining=5;giantRemaining=5;hud();},
  update,render,endGame
};hud();requestAnimationFrame(frame);`);
const inspect = () => {
  const canvas = document.querySelector('canvas'), main = document.querySelector('main');
  const c = getComputedStyle(canvas), m = getComputedStyle(main);
  const rect = el => { const r = el.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,w:r.width,h:r.height}; };
  const matrix = new DOMMatrix(m.transform);
  return {width:innerWidth,height:innerHeight,main:rect(main),canvas:rect(canvas),layoutWidth:parseFloat(c.width),layoutHeight:parseFloat(c.height),bitmapWidth:canvas.width,bitmapHeight:canvas.height,angle:Math.round(Math.atan2(matrix.b,matrix.a)*180/Math.PI),worldWidth:orientationTest.state().worldWidth,
    ui:['.hud','#score','#health','#pause','.game-footer','#distance','.guide'].map(s=>({s,...rect(document.querySelector(s))})),
    overflow:document.documentElement.scrollWidth>innerWidth || document.documentElement.scrollHeight>innerHeight};
};
function contained(r, outer, message) { assert(r.x>=outer.x-1 && r.y>=outer.y-1 && r.right<=outer.right+1 && r.bottom<=outer.bottom+1, message+JSON.stringify(r)); }
(async()=>{
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',args:['--no-sandbox']});
  try {
    const results=[];
    for (const profile of [
      {name:'android-small',...devices['Pixel 7'],viewport:{width:320,height:568}},
      {name:'android-chrome',...devices['Pixel 7'],viewport:{width:412,height:915}},
      {name:'iphone-sized-chromium',...devices['iPhone 13'],defaultBrowserType:undefined}
    ]) {
      const {name,defaultBrowserType,...options}=profile;
      const context=await browser.newContext(options),page=await context.newPage(),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));
      await page.addInitScript(()=>addEventListener('DOMContentLoaded',()=>{window.initialRotation=getComputedStyle(document.querySelector('main')).transform;}));
      await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');
      await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));
      await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));await page.evaluate(()=>document.fonts.ready);
      const portrait=page.viewportSize();
      assert(await page.evaluate(()=>new DOMMatrix(initialRotation).b===1),'portrait rotates at initial DOM render');
      const check=async(angle)=>{
        await page.waitForFunction(()=>{const c=document.querySelector('canvas'),s=getComputedStyle(c);return Math.abs(orientationTest.state().worldWidth-500*parseFloat(s.width)/parseFloat(s.height))<.01;});
        const r=await page.evaluate(inspect);assert.equal(r.angle,angle);assert(r.layoutWidth>r.layoutHeight,'landscape logical canvas');
        contained(r.main,{x:0,y:0,right:r.width,bottom:r.height},'main fits');
        assert(!r.overflow,'no page overflow');
        assert(Math.abs(r.bitmapWidth/r.bitmapHeight-r.layoutWidth/r.layoutHeight)<.01,'unrotated raster aspect');
        for(const ui of r.ui)contained(ui,r.main,'UI stays visible '+ui.s);
        return r;
      };
      const first=await check(90);await page.screenshot({path:path.join(output,`orientation-${name}-start.png`)});contained(await page.locator('#welcome').boundingBox().then(r=>({x:r.x,y:r.y,right:r.x+r.width,bottom:r.y+r.height})),first.main,'welcome fits');
      await page.locator('#start').tap();await page.evaluate(()=>orientationTest.isolate());
      await page.locator('#game').tap({position:{x:70,y:70}});assert.equal((await page.evaluate(()=>orientationTest.state())).player.jumps,1);
      await page.clock.runFor(120);await page.locator('#game').tap({position:{x:120,y:110}});assert.equal((await page.evaluate(()=>orientationTest.state())).player.jumps,2);
      await page.locator('#game').tap();assert.equal((await page.evaluate(()=>orientationTest.state())).player.jumps,2);
      await page.evaluate(()=>orientationTest.power());await page.locator('#pause').tap();const paused=await page.evaluate(()=>orientationTest.state());
      const transitions=[];
      for(const viewport of [{width:portrait.height,height:portrait.width},portrait,{width:portrait.width,height:portrait.height-60},{width:portrait.height-60,height:portrait.width},portrait]){
        await page.setViewportSize(viewport);const r=await check(viewport.width>viewport.height?0:90);transitions.push(r.angle);
        const state=await page.evaluate(()=>orientationTest.state());for(const key of ['score','health','time','distance','boostRemaining','giantRemaining'])assert.equal(state[key],paused[key],'rotation preserves '+key);
        assert.equal(state.mode,'paused');
      }
      await page.locator('#resume').tap();assert.equal((await page.evaluate(()=>orientationTest.state())).mode,'running');
      await page.clock.runFor(1200);await page.evaluate(()=>{orientationTest.isolate();orientationTest.render();});
      await page.screenshot({path:path.join(output,`orientation-${name}-portrait.png`)});
      await page.setViewportSize({width:portrait.height,height:portrait.width});await check(0);await page.evaluate(()=>orientationTest.render());await page.screenshot({path:path.join(output,`orientation-${name}-landscape.png`)});
      await page.evaluate(()=>orientationTest.endGame());await page.screenshot({path:path.join(output,`orientation-${name}-result.png`)});const result=await page.locator('#result').boundingBox();contained({x:result.x,y:result.y,right:result.x+result.width,bottom:result.y+result.height},(await page.evaluate(inspect)).main,'result fits');await page.locator('#restart').tap();assert.equal((await page.evaluate(()=>orientationTest.state())).score,0);
      assert.deepEqual(errors,[]);results.push({name,logicalCanvas:[first.layoutWidth,first.layoutHeight],transitions,realTouchDoubleJump:true});await context.close();
    }
    const pc=await browser.newPage({viewport:{width:390,height:844}});await pc.goto(process.env.GAME_URL||'http://127.0.0.1:8001');assert.equal(await pc.locator('main').evaluate(e=>getComputedStyle(e).transform),'none','desktop narrow windows do not rotate');await pc.close();
    console.log(JSON.stringify({result:'PASS',engine:'Chromium mobile emulation, not physical Safari or Android Chrome',results}));
  } finally { await browser.close(); }
})();
