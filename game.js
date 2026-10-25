(() => {
 'use strict';
 const $=id=>document.getElementById(id), canvas=$('game'), ctx=canvas.getContext('2d');
 const asset={
  backgrounds:[1,2,3,4].map(n=>`assets/backgrounds/배경이미지${n}.PNG`),
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
 let objects=[],effects=[],last=0,worldWidth=1100,tiles=[];
 const H=500,GROUND=461,player={x:106,y:363,w:74,h:98,vy:0,grounded:true,land:0};
 const paths=Object.values(asset).flat();
 Promise.all(paths.map(path=>new Promise(resolve=>{
  const img=new Image();img.onload=()=>{images[path]=img;resolve();};
  img.onerror=()=>{failed.push(path);console.error(`이미지 로딩 실패: ${path} (경로, 대소문자, 파일 형식을 확인하세요)`);resolve();};img.src=path;
 }))).then(()=>{
  loaded=true;mode='ready';
  tiles=asset.backgrounds.filter(p=>images[p]).map(p=>{
   const img=images[p],c=document.createElement('canvas');c.width=Math.round(img.naturalWidth*H/img.naturalHeight);c.height=H;
   const t=c.getContext('2d');t.drawImage(img,0,0,c.width,H);
   // Feather only the rendered left edge; source PNGs remain untouched.
   t.globalCompositeOperation='destination-in';const g=t.createLinearGradient(0,0,130,0);g.addColorStop(0,'transparent');g.addColorStop(1,'black');t.fillStyle=g;t.fillRect(0,0,c.width,H);return c;
  });
  $('loading').textContent=failed.length?'일부 그림을 불러오지 못했어요. 아래 안내를 확인하세요.':'SPACE 또는 화면 터치로 점프';
  if(failed.length){$('asset-warning').hidden=false;$('asset-warning').textContent=`불러오지 못한 이미지: ${failed.join(', ')}`;}
  $('start').disabled=!(images[asset.characters[0]]&&images[asset.items[0]]&&tiles.length);
 });
 function resize(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);worldWidth=Math.min(1100,Math.max(500,H*r.width/r.height));canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);}
 addEventListener('resize',resize);resize();
 function hud(){ $('score').textContent=score.toLocaleString('ko-KR');$('health').textContent=`${health} / 3`;$('health').setAttribute('aria-label',`체력 ${health} / 3`);$('health-fill').style.width=`${health/3*100}%`;$('distance').textContent=`${Math.floor(distance)} m`; }
 function panel(name){$('overlay').hidden=!name;for(const n of ['welcome','result','paused'])$(n).hidden=n!==name;}
 function start(){if(!loaded||$('start').disabled)return;score=0;health=3;distance=0;time=0;spawnIn=1.1;invincible=0;objects=[];effects=[];Object.assign(player,{y:GROUND-player.h,vy:0,grounded:true,land:0});mode='running';panel(null);$('pause').disabled=false;$('pause').setAttribute('aria-label','일시 정지');hud();$('status').textContent='달리기 시작. 체력 3.';}
 function pause(){if(mode==='running'){mode='paused';panel('paused');$('pause').setAttribute('aria-label','계속 달리기');}else if(mode==='paused'){mode='running';panel(null);$('pause').setAttribute('aria-label','일시 정지');}}
 function jump(){if(mode!=='running'||!player.grounded)return;player.vy=-695;player.grounded=false;player.land=0;}
 $('start').addEventListener('click',start);$('restart').addEventListener('click',start);$('resume').addEventListener('click',pause);$('pause').addEventListener('click',pause);
 for(const el of [canvas,$('jump')])el.addEventListener('pointerdown',e=>{e.preventDefault();jump();});
 document.addEventListener('keydown',e=>{if(e.code==='Space'&&!['BUTTON','A'].includes(e.target.tagName)){e.preventDefault();if(!e.repeat){if(mode==='ready'||mode==='over')start();else jump();}}if(e.code==='Escape'&&!e.repeat)pause();});
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&mode==='running')pause();});
 function overlap(a,b){return a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;}
 function spawn(){
  const x=worldWidth+80,type=Math.random()<.4?'train':'obstacle';
  const p=type==='train'?asset.trains[Math.floor(Math.random()*2)]:asset.obstacles[Math.floor(Math.random()*3)];
  const img=images[p];if(img){const w=type==='train'?148:56,h=w*img.naturalHeight/img.naturalWidth;objects.push({type,path:p,x,y:GROUND-h,w,h,hit:false});}
  for(let i=0;i<6;i++){const p=asset.items[Math.floor(Math.random()*6)],img=images[p];if(img)objects.push({type:'orange',path:p,x:x-45+i*38,y:GROUND-95-Math.sin(i/5*Math.PI)*95,w:30,h:30,hit:false});}
 }
 function update(dt){
  time+=dt;invincible=Math.max(0,invincible-dt);player.land=Math.max(0,player.land-dt);
  const speed=Math.min(340,225+time*1.1);distance+=speed*dt/20;
  player.vy+=1800*dt;player.y+=player.vy*dt;
  if(player.y+player.h>=GROUND){if(!player.grounded){player.land=.14;}player.y=GROUND-player.h;player.vy=0;player.grounded=true;}
  spawnIn-=dt;if(spawnIn<=0){spawn();spawnIn=2.65+Math.random()*.45;}
  const box={x:player.x+18,y:player.y+15,w:player.w-32,h:player.h-20};
  for(const o of objects){o.x-=speed*dt;if(o.hit)continue;
   const b=o.type==='orange'?o:{x:o.x+7,y:o.y+7,w:o.w-14,h:o.h-10};
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
  const lengths=tiles.map(t=>t.width-130),total=lengths.reduce((a,b)=>a+b,0),offset=(distance*20*.65)%total;
  for(let cycle=-1;cycle<=1;cycle++){let x=cycle*total-offset;for(let i=0;i<tiles.length;i++){if(x<worldWidth&&x+tiles[i].width>0)ctx.drawImage(tiles[i],x,0);x+=lengths[i];}}
  // Original trees and scroll decorate the far edges of the road.
  const period=950,shift=(distance*20*.8)%period;
  for(let i=-1;i<3;i++){const x=i*period-shift;draw(asset.scenery[0],x+380,GROUND-112,105,112);draw(asset.scenery[1],x+700,GROUND-128,120,128);draw(asset.scenery[2],x+880,GROUND-70,37,70);}
 }
 function character(){
  let index=mode==='over'?6:invincible>1.05?5:!player.grounded?(player.vy<0?7:0):[0,1,2,3,4,8][Math.floor(time*9)%6];
  // A uniform landing compression avoids stretching the artwork.
  const scale=player.land>0?1-.06*Math.sin(player.land/.14*Math.PI):1;
  const h=player.h*scale,w=player.w*scale;const blink=invincible>0&&Math.floor(invincible*11)%2?.45:1;
  draw(asset.characters[index],player.x+(player.w-w)/2,player.y+player.h-h,w,h,blink);
 }
 function render(){ctx.setTransform(canvas.width/worldWidth,0,0,canvas.height/H,0,0);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';background();for(const o of objects)draw(o.path,o.x,o.y,o.w,o.h);character();
  for(const e of effects){if(e.type==='collect'){draw(e.path,e.x,e.y,25,25,Math.min(1,e.life*3));ctx.save();ctx.globalAlpha=Math.min(1,e.life*3);ctx.fillStyle='#8d592c';ctx.font='bold 15px sans-serif';ctx.fillText('+100',e.x+20,e.y+12);ctx.restore();}}
 }
 function frame(now){const dt=Math.min((now-last)/1000||0,1/30);last=now;if(mode==='running')update(dt);render();requestAnimationFrame(frame);}
 hud();requestAnimationFrame(frame);
})();
