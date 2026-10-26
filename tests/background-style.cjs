const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const output=path.resolve(__dirname,'../work/validation');fs.mkdirSync(output,{recursive:true});
const source=fs.readFileSync(path.resolve(__dirname,'../game.js'),'utf8').replace(' hud();requestAnimationFrame(frame);',`
window.backgroundStyleTest={
 scenario:index=>{start();objects=[];spawnIn=1e6;const n=Math.max(0,[1,5,3,7,11].indexOf(index)),d=OBSTACLES[n],img=images[d.path],h=d.height,w=h*img.naturalWidth/img.naturalHeight;
 objects.push({type:'obstacle',path:d.path,core:d.core,x:player.x+150,y:GROUND-h,w,h});
 asset.items.forEach((path,i)=>objects.push({type:'orange',path,x:player.x+40+i*45,y:GROUND+jumpOffset(.10+i*.12,true)-player.h/2-18,w:36,h:36,phase:i}));
 for(const type of ['brush','giant'])objects.push({type,path:asset[type][0],x:Math.min(player.x+(type==='brush'?320:380),worldWidth-(type==='brush'?90:44)),y:GROUND-90,w:36,h:43,phase:0});mode='paused';},
 style:s=>Object.assign(BACKGROUND_STYLE,s),settings:()=>({...BACKGROUND_STYLE}),render,
 filter:()=>ctx.filter,
 dimensions:()=>({worldWidth,H}),
 edges:()=>{const p=ctx.getImageData(0,0,canvas.width,canvas.height).data;let min=255;for(let x=0;x<canvas.width;x++)min=Math.min(min,p[x*4+3],p[((canvas.height-1)*canvas.width+x)*4+3]);for(let y=0;y<canvas.height;y++)min=Math.min(min,p[(y*canvas.width)*4+3],p[(y*canvas.width+canvas.width-1)*4+3]);return min;}
};hud();requestAnimationFrame(frame);`);
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true,args:['--no-sandbox']});
 try{
  const summary=[];
  for(const config of [{width:1280,height:960,dpr:1},{width:390,height:844,dpr:1},{width:390,height:844,dpr:2},{width:568,height:320,dpr:1,touch:true},{width:844,height:390,dpr:2,touch:true},{width:390,height:844,dpr:2,touch:true}]){
   const context=await browser.newContext({viewport:{width:config.width,height:config.height},deviceScaleFactor:config.dpr,isMobile:!!config.touch,hasTouch:!!config.touch});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.renderCalls=[];const origins=new WeakMap(),draw=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(im,...args){const source=im.src||origins.get(im)||'buffer';if(this.canvas.id!=='game'&&source!=='buffer')origins.set(this.canvas,source);window.renderCalls.push({main:this.canvas.id==='game',source,rawSource:im.src||'buffer',filter:this.filter,args});return draw.call(this,im,...args);};});
   await page.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:source}));await page.clock.install();await page.goto(process.env.GAME_URL||'http://127.0.0.1:8001');await page.waitForFunction(()=>document.querySelector('#loading').textContent.includes('SPACE'));await page.clock.pauseAt(await page.evaluate(()=>Date.now()+100));await page.evaluate(()=>document.fonts.ready);assert.deepEqual(await page.evaluate(()=>backgroundStyleTest.settings()),{blurPx:1.25,saturation:.93,contrast:.93});
   await page.evaluate(()=>{backgroundStyleTest.scenario(3);backgroundStyleTest.style({blurPx:3,saturation:.83,contrast:.88});backgroundStyleTest.render();});
   await page.screenshot({path:path.join(output,`depth-before-${config.width}x${config.height}-${config.dpr}-${!!config.touch}.png`)});
   const calls=await page.evaluate(()=>{backgroundStyleTest.style({blurPx:1.25,saturation:.93,contrast:.93});window.renderCalls=[];backgroundStyleTest.render();return window.renderCalls;});
   const filtered=calls.filter(c=>c.filter!=='none');assert.equal(filtered.length,1,'one cached background build');assert.equal(filtered[0].rawSource,'buffer');assert.equal(filtered[0].main,false);assert(calls.filter(c=>c.main).every(c=>c.filter==='none'));const warm=await page.evaluate(()=>{window.renderCalls=[];backgroundStyleTest.render();return renderCalls;});assert(warm.every(c=>c.filter==='none'),'cached frame needs no filter work');
   assert(filtered[0].filter.includes(`blur(${1.25*config.dpr}px)`));assert(filtered[0].filter.includes('saturate(0.93)'));assert(filtered[0].filter.includes('contrast(0.93)'));
   for(const call of calls.filter(c=>/\/characters\/|\/items\/|\/obstacles\/|\/extras\//.test(c.source)))assert.equal(call.filter,'none',call.source);
   assert.equal(await page.evaluate(()=>backgroundStyleTest.filter()),'none');assert.equal(await page.evaluate(()=>backgroundStyleTest.edges()),255,'no transparent blur margins');
   assert.equal(await page.locator('canvas').evaluate(e=>getComputedStyle(e).filter),'none');assert.equal(await page.locator('.hud').evaluate(e=>getComputedStyle(e).filter),'none');
   await page.screenshot({path:path.join(output,`depth-after-${config.width}x${config.height}-${config.dpr}-${!!config.touch}.png`)});
   const seen=new Set();for(const index of [1,5,3,7,11]){
    const frame=await page.evaluate(i=>{backgroundStyleTest.scenario(i);window.renderCalls=[];backgroundStyleTest.render();return window.renderCalls;},index);
    for(const c of frame.filter(c=>/\/characters\/|\/items\/|\/obstacles\/|\/extras\//.test(c.source))){assert.equal(c.filter,'none');seen.add(decodeURIComponent(c.source).split('/').at(-1));}
   }
   for(const n of [1,2,6,7,9])assert(seen.has(`기타이미지${n}.png`),'all obstacles sharp');for(let n=1;n<=6;n++)assert(seen.has(`귤${n}.png`),'all oranges sharp');assert(seen.has('기타이미지3.png'));assert(seen.has('기타이미지4.png'));
   assert.deepEqual(errors,[]);summary.push({width:config.width,height:config.height,touch:!!config.touch,dpr:config.dpr,backgroundFilter:filtered[0].filter,foreground:'none',opaqueEdges:true});await context.close();
  }
  console.log(JSON.stringify({result:'PASS',summary,checks:['background-only filter','all six oranges, five obstacles, character and both special items unfiltered','no CSS canvas/UI filter','no transparent blur border','before/after screenshots']}));
 }finally{await browser.close();}
})();
