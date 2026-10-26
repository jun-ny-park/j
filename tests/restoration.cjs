const fs=require('fs'),assert=require('assert/strict'),cp=require('child_process');
const {chromium}=require('playwright');
const old=cp.execFileSync('git',['show','0195379:game.js'],{encoding:'utf8'}),current=require('./pattern-fixture.cjs').basic(fs.readFileSync('game.js','utf8')),oldCSS=cp.execFileSync('git',['show','f6aae52:style.css'],{encoding:'utf8'});
const block=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)));
for(const [a,b]of [['  function collides(', '  function movementFactor('],['  function smashObstacle(', '  function destructionBox(']])assert.equal(block(current,a,b),block(old,a,b),'normal collision and flight animation unchanged');
const hook=`window.restoreTest={start,pause,render,endGame,jump,update,frame,
 state:()=>({mode,time,distance,health,score,boostRemaining,giantRemaining,objects:objects.map(o=>({...o})),flights:flyingObstacles.length,spawnIn}),
 scenario:(at,index,boost=0,due=false)=>{start();time=at;patternIndex=index;boostRemaining=boost;nextBrushAt=nextGiantAt=due?0:Infinity;objects=[];spawn();return objects;},
 setup:()=>{start();objects=[];spawnIn=1e6;score=900;health=2;boostRemaining=3;giantRemaining=4;hud();},
 show:()=>{start();score=43900;endGame();},
};hud();requestAnimationFrame(frame);`;
const instrument=s=>s.replace(' hud();requestAnimationFrame(frame);',hook);
(async()=>{const browser=await chromium.launch({executablePath:'/usr/bin/chromium',args:['--no-sandbox']});try{
 const pages=[];for(const source of [current]){const p=await browser.newPage({viewport:{width:1280,height:960}});await p.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:instrument(source)}));await p.clock.install();await p.goto('http://127.0.0.1:8001');await p.waitForFunction(()=>!document.querySelector('#start').disabled);await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));pages.push(p);}
 let groups=0,replacements=0;const types=new Set();
 for(const time of [1,12,22,37,52])for(const boost of [0])for(let index=0;index<12;index++){
  const base=await pages[0].evaluate(v=>restoreTest.scenario(...v),[time,index,boost,false]);
  groups++;
  for(const pick of [.1,.8]){const replaced=await pages[0].evaluate(({v,pick})=>{const saved=Math.random;let n=0;Math.random=()=>n++===0?.1:pick;try{return restoreTest.scenario(...v);}finally{Math.random=saved;}},{v:[time,index,boost,true],pick});assert.equal(replaced.length,base.length);let changed=0;for(let i=0;i<base.length;i++){const a=base[i],b=replaced[i];if(b.type!==a.type){assert.equal(a.type,'orange');assert(['brush','giant'].includes(b.type));types.add(b.type);changed++;replacements++;assert.equal(b.x,a.x);assert.equal(b.y,a.y);assert.equal(b.w,a.w);assert.equal(b.h,a.h);const copy={...b,type:a.type,path:a.path};assert.deepEqual(copy,a);}else assert.deepEqual(b,a);}assert.equal(changed,1,'one slot replaced, all others identical');}
 }
 assert.deepEqual([...types].sort(),['brush','giant']);for(const p of pages)await p.close();
 const reports=[];for(const v of [{width:1280,height:960},{width:844,height:390,touch:true},{width:568,height:320,touch:true},{width:390,height:844,touch:true}]){
  const context=await browser.newContext({viewport:v,isMobile:!!v.touch,hasTouch:!!v.touch}),p=await context.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.route('**/game.js',r=>r.fulfill({contentType:'text/javascript',body:instrument(current)}));await p.clock.install();await p.goto('http://127.0.0.1:8001');await p.waitForFunction(()=>!document.querySelector('#start').disabled);await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));await p.evaluate(()=>document.fonts.ready);
  const click=async id=>v.touch?p.locator(id).tap():p.locator(id).click();
  await p.evaluate(()=>restoreTest.setup());const stable=await p.evaluate(()=>restoreTest.state());
  const centers=async()=>p.evaluate(()=>{const h=document.querySelector('.health-track'),b=document.querySelector('#pause'),rotated=getComputedStyle(document.querySelector('main')).transform!=='none';const center=e=>{const r=e.getBoundingClientRect();return rotated?r.x+r.width/2:r.y+r.height/2;};return {health:center(h),pause:center(b),hit:document.elementFromPoint(...(()=>{const r=b.getBoundingClientRect();return[r.x+r.width/2,r.y+r.height/2];})())?.closest('button')?.id};});
  for(let n=0;n<3;n++){await click('#pause');assert.equal(await p.locator('#pause img').getAttribute('src'),'assets/ui/멈춤버튼.png');const frozen=await p.evaluate(()=>restoreTest.state());assert.equal(frozen.mode,'paused');await p.clock.runFor(1500);assert.deepEqual(await p.evaluate(()=>restoreTest.state()),frozen);const c=await centers();assert(Math.abs(c.health-c.pause)<.6,JSON.stringify(c));assert.equal(c.hit,'pause');await click(n===2?'#resume':'#pause');assert.equal(await p.locator('#pause img').getAttribute('src'),'assets/ui/기타이미지15.png');assert.deepEqual(await p.evaluate(()=>restoreTest.state()),stable);}
  await p.evaluate(()=>restoreTest.show());const width=await p.locator('#result').evaluate(e=>e.getBoundingClientRect().width);await p.addStyleTag({content:oldCSS+'@media (hover:none) and (pointer:coarse) and (max-width:1024px) and (orientation:landscape){.intro{flex-direction:column;gap:2px;min-height:0}}'});const before=await p.locator('#result').evaluate(e=>e.getBoundingClientRect().width);assert(Math.abs(width/before-.85)<.002);await p.reload();await p.waitForFunction(()=>!document.querySelector('#start').disabled);await p.clock.pauseAt(await p.evaluate(()=>Date.now()+100));await p.evaluate(()=>restoreTest.show());await p.screenshot({path:`work/validation/restored-result-${v.width}x${v.height}.png`});await click('#restart');assert.equal((await p.evaluate(()=>restoreTest.state())).mode,'running');assert.deepEqual(errors,[]);reports.push({v,resultScale:width/before});await context.close();
 }
 console.log(JSON.stringify({result:'PASS',groups,replacements,types:[...types],reports,checks:['existing-slot replacement preserves the remaining group','one existing slot replaced','original normal collision and flight animation','pause toggle and resume preserve state','health-track center alignment','result group scales to 85%']}));
}finally{await browser.close();}})();
