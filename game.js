(() => {
 'use strict';
 const $=id=>document.getElementById(id), canvas=$('game'), ctx=canvas.getContext('2d');
 const asset={
  backgrounds:[1,2,4,3].map(n=>`assets/backgrounds/배경이미지${n}.PNG`),
  characters:[1,2,3,4,5,6,7,8,9].map(n=>`assets/characters/${n===1?'캐릭어':'캐릭터'}이미지${n}.png`),
  items:[1,2,3,4,5,6].map(n=>`assets/items/귤이미지${n}.png`),
  trains:[7,8].map(n=>`assets/obstacles/귤이미지${n}.png`),
  obstacles:[1,2,5].map(n=>`assets/obstacles/기타이미지${n}.png`),
  scenery:[6,7,9].map(n=>`assets/obstacles/기타이미지${n}.png`),
  extras:[3,4,8,10].map(n=>`assets/extras/기타이미지${n}.png`),
  ui:[11,12,13,14,15].map(n=>`assets/ui/기타이미지${n}.png`)
 };
 const images={},failed=[];
 let loaded=false,mode='loading',score=0,health=3,distance=0,time=0,spawnIn=1.2,invincible=0;
 let objects=[],effects=[],last=0,worldWidth=1100,tiles=[],patternIndex=0;
 const H=500,GROUND=461,player={x:106,y:363,w:74,h:98,vy:0,grounded:true,land:0,jumps:0};
 const GRAVITY=1800,FIRST_JUMP=640,SECOND_JUMP=620,SPEED=260;
 const paths=Object.values(asset).flat();
 Promise.all(paths.map(path=>new Promise(resolve=>{
  const img=new Image();img.onload=()=>{images[path]=img;resolve();};
  img.onerror=()=>{failed.push(path);console.error(`이미지 로딩 실패: ${path} (경로, 대소문자, 파일 형식을 확인하세요)`);resolve();};img.src=path;
 }))).then(()=>{
  loaded=true;mode='ready';
  // Preserve exact native aspect ratios, with no feathering, overlap or resampling canvas.
  tiles=asset.backgrounds.filter(p=>images[p]).map(p=>({image:images[p],width:images[p].naturalWidth*H/images[p].naturalHeight,path:p}));
  $('loading').textContent=failed.length?'일부 그림을 불러오지 못했어요. 아래 안내를 확인하세요.':'SPACE / 화면 터치 · 최대 2단 점프';
  if(failed.length){$('asset-warning').hidden=false;$('asset-warning').textContent=`불러오지 못한 이미지: ${failed.join(', ')}`;}
  $('start').disabled=!(images[asset.characters[0]]&&images[asset.items[0]]&&tiles.length);
 });
 function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);worldWidth=H*r.width/r.height;canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
 addEventListener('resize',resize);resize();
 function hud(){ $('score').textContent=score.toLocaleString('ko-KR');$('health').textContent=`${health} / 3`;$('health').setAttribute('aria-label',`체력 ${health} / 3`);$('health-fill').style.width=`${health/3*100}%`;$('distance').textContent=`${Math.floor(distance)} m`; }
 function panel(name){$('overlay').hidden=!name;for(const n of ['welcome','result','paused'])$(n).hidden=n!==name;}
 function start(){if(!loaded||$('start').disabled)return;score=0;health=3;distance=0;time=0;spawnIn=.5;patternIndex=0;invincible=0;objects=[];effects=[];Object.assign(player,{y:GROUND-player.h,vy:0,grounded:true,land:0,jumps:0});mode='running';panel(null);$('pause').disabled=false;$('pause').setAttribute('aria-label','일시 정지');hud();$('status').textContent='달리기 시작. 체력 3.';}
 function pause(){if(mode==='running'){mode='paused';panel('paused');$('pause').setAttribute('aria-label','계속 달리기');}else if(mode==='paused'){mode='running';panel(null);$('pause').setAttribute('aria-label','일시 정지');}}
 function jump(){
  if(mode!=='running'||player.jumps>=2)return;
  player.jumps++;
  // Reset upward velocity on the second input so it adds height even while falling.
  player.vy=player.jumps===1?-FIRST_JUMP:-SECOND_JUMP;
  player.grounded=false;player.land=0;
  if(player.jumps===2)effects.push({type:'double',x:player.x+player.w/2,y:player.y+player.h-10,life:.42});
 }
 $('start').addEventListener('click',start);$('restart').addEventListener('click',start);$('resume').addEventListener('click',pause);$('pause').addEventListener('click',pause);
 for(const el of [canvas,$('jump')])el.addEventListener('pointerdown',e=>{e.preventDefault();jump();});
 document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['BUTTON','A'].includes(e.target.tagName)){e.preventDefault();if(!e.repeat){if(mode==='ready'||mode==='over')start();else jump();}}if(e.code==='Escape'&&!e.repeat)pause();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='running')pause();});
 function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
 // A repeatable teaching rhythm: low trail → single-jump arc → low trail → double-jump arc.
 // Anchor is a world position just ahead of the camera. Items enter through the right edge;
 // their vertical coordinates always remain inside the playable canvas.
 function jumpOffset(t,double=false){
  const secondAt=.24;
  if(!double||t<=secondAt)return -FIRST_JUMP*t+.5*GRAVITY*t*t;
  const atSecond=-FIRST_JUMP*secondAt+.5*GRAVITY*secondAt*secondAt,after=t-secondAt;
  return atSecond-SECOND_JUMP*after+.5*GRAVITY*after*after;
 }
 function spawn(){
  const kind=['flat','single','flat','double'][patternIndex%4];
  const anchor=worldWidth+40;
  let obstacle=null;
  if(kind!=='flat'){
   const variants=[asset.obstacles[0],asset.trains[0],asset.obstacles[1],asset.trains[1],asset.obstacles[2]];
   const path=variants[Math.floor(patternIndex/2)%variants.length],img=images[path];
   if(img){
    const w=asset.trains.includes(path)?112:54,h=w*img.naturalHeight/img.naturalWidth;
    obstacle={type:'obstacle',path,x:anchor+SPEED*.355-w/2,y:GROUND-h,w,h,hit:false,pattern:kind};
    objects.push(obstacle);
   }
  }
  const times=kind==='double'?[.13,.23,.37,.49,.61,.74,.88]:kind==='single'?[.12,.22,.32,.42,.52,.62]:[0,.17,.34,.51,.68,.85];
  for(let i=0;i<times.length;i++){
   const t=times[i],path=asset.items[(patternIndex+i)%asset.items.length];if(!images[path])continue;
   const centerY=kind==='flat'?GROUND-48:GROUND+jumpOffset(t,kind==='double')-player.h/2;
   const o={type:'orange',path,x:anchor+SPEED*t-15,y:Math.max(90,Math.min(GROUND-32,centerY-15)),w:30,h:30,hit:false,phase:i*.7,pattern:kind};
   // Keep full collectible boxes outside obstacle artwork, including their 3px float.
   const safe={...o,y:o.y-3,h:o.h+6};
   if(!obstacle||!overlap(safe,obstacle))objects.push(o);
  }
  patternIndex++;
  spawnIn=2.75;
 }
 function update(dt){
  time+=dt;invincible=Math.max(0,invincible-dt);player.land=Math.max(0,player.land-dt);
  const speed=SPEED;distance+=speed*dt/20;
  if(!player.grounded){player.y+=player.vy*dt+.5*GRAVITY*dt*dt;player.vy+=GRAVITY*dt;}
  if(player.y+player.h>=GROUND){if(!player.grounded){player.land=.14;}player.y=GROUND-player.h;player.vy=0;player.grounded=true;player.jumps=0;}
  spawnIn-=dt;if(spawnIn<=0)spawn();
  const box={x:player.x+18,y:player.y+15,w:player.w-32,h:player.h-20};
  for(const o of objects){o.x-=speed*dt;if(o.hit)continue;
   const b=o.type==='orange'?{...o,y:o.y+Math.sin(time*3+o.phase)*3}:{x:o.x+7,y:o.y+7,w:o.w-14,h:o.h-10};
   if(!overlap(box,b))continue;
   if(o.type==='orange'){o.hit=true;score+=100;effects.push({type:'collect',x:o.x,y:o.y,life:.65,path:asset.extras[2]});}
   else if(invincible<=0){o.hit=true;health--;invincible=1.4;$('status').textContent=`장애물 충돌. 체력 ${health}.`;
    if(health===0){mode='over';$('pause').disabled=true;$('final-score').textContent=score.toLocaleString('ko-KR');panel('result');$('status').textContent=`게임 오버. 최종 점수 ${score}. 다시 달리기 버튼으로 재시작하세요.`;break;}
   }
  }
  objects=objects.filter(o=>o.x+o.w>-50&&!(o.type==='orange'&&o.hit));effects.forEach(e=>{e.life-=dt;e.y-=dt*32;});effects=effects.filter(e=>e.life>0);hud();
 }
 // Every image is contained in its display box with one uniform scale.
 function draw(path,x,y,w,h,alpha=1){const img=images[path];if(!img)return;const s=Math.min(w/img.naturalWidth,h/img.naturalHeight);ctx.save();ctx.globalAlpha=alpha;ctx.drawImage(img,x+(w-img.naturalWidth*s)/2,y+h-img.naturalHeight*s,img.naturalWidth*s,img.naturalHeight*s);ctx.restore();}
 function background(){
  ctx.fillStyle='#d9ecfa';ctx.fillRect(0,0,worldWidth,H);if(!tiles.length)return;
  const total=tiles.reduce((sum,t)=>sum+t.width,0),offset=(distance*20*.65)%total;
  // Floating-point edges are shared exactly. No rounded-width drift at 3→1 wrap.
  for(let cycle=-1;cycle<=1;cycle++){
   let x=cycle*total-offset;
   for(const tile of tiles){if(x<worldWidth&&x+tile.width>0)ctx.drawImage(tile.image,x,0,tile.width,H);x+=tile.width;}
  }
  // Scenery stays above the running lane, at a smaller scale and lower opacity.
  // It is never put into the collidable objects array.
  const period=1100,shift=(distance*20*.45)%period;
  for(let i=-1;i<3;i++){
   const x=i*period-shift;
   draw(asset.scenery[0],x+340,GROUND-170,66,75,.36);
   draw(asset.scenery[1],x+690,GROUND-170,78,84,.36);
   draw(asset.scenery[2],x+950,GROUND-158,22,43,.3);
  }
 }
 function sparkle(x,y,size,alpha){
  ctx.save();ctx.globalAlpha=alpha;ctx.strokeStyle='#fff5c3';ctx.lineWidth=1.5;ctx.lineCap='round';
  ctx.beginPath();ctx.moveTo(x-size,y);ctx.lineTo(x+size,y);ctx.moveTo(x,y-size);ctx.lineTo(x,y+size);ctx.stroke();ctx.restore();
 }
 function drawObject(o){
  if(o.type==='orange'){
   const bob=Math.sin(time*3+o.phase)*3;
   draw(o.path,o.x,o.y+bob,o.w,o.h);
   sparkle(o.x+o.w+2,o.y+bob+4,2.5,.45+Math.sin(time*3+o.phase)*.2);
  }else{
   ctx.save();ctx.fillStyle='#785735';ctx.globalAlpha=.24;
   ctx.beginPath();ctx.ellipse(o.x+o.w/2,GROUND+2,o.w*.48,4,0,0,Math.PI*2);ctx.fill();ctx.restore();
   draw(o.path,o.x,o.y,o.w,o.h);
  }
 }
 function character(){
  let index=mode==='over'?6:invincible>1.05?5:!player.grounded?(player.vy<0?7:0):[0,1,2,3,4,8][Math.floor(time*9)%6];
  // A uniform landing compression avoids stretching the artwork.
  const scale=player.land>0?1-.06*Math.sin(player.land/.14*Math.PI):1;
  const h=player.h*scale,w=player.w*scale;const blink=mode==='running'&&invincible>0&&Math.floor(invincible*11)%2?.45:1;
  draw(asset.characters[index],player.x+(player.w-w)/2,player.y+player.h-h,w,h,blink);
 }
 function render(){ctx.setTransform(canvas.width/worldWidth,0,0,canvas.height/H,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';background();for(const o of objects)drawObject(o);character();
  for(const e of effects){if(e.type==='collect'){draw(e.path,e.x,e.y,25,25,Math.min(1,e.life*3));ctx.save();ctx.globalAlpha=Math.min(1,e.life*3);ctx.fillStyle='#8d592c';ctx.font='22px "Gamja Flower", cursive';ctx.fillText('+100',e.x+20,e.y+12);ctx.restore();}else if(e.type==='double'){const progress=1-e.life/.42;for(let i=0;i<5;i++){const angle=i*Math.PI*2/5;const radius=13+progress*25;sparkle(e.x+Math.cos(angle)*radius,e.y+Math.sin(angle)*radius,3,e.life/.42);}}}
 }
 function frame(now){const dt=Math.min((now-last)/1000||0,1/30);last=now;if(mode==='running')update(dt);render();requestAnimationFrame(frame);}
 hud();requestAnimationFrame(frame);
})();
