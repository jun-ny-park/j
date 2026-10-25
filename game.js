(() => {
  'use strict';
  // Add PNGs at these paths; each missing/invalid file keeps its drawn fallback.
  const ASSET_PATHS = {
    player: 'assets/characters/yusaeng.png',
    orange: 'assets/items/orange.png',
    train: 'assets/obstacles/train.png',
    background: 'assets/backgrounds/background.png'
  };
  const images = {};
  Object.entries(ASSET_PATHS).forEach(([key, path]) => {
    const img = new Image();
    img.onload = () => { if (img.naturalWidth && img.naturalHeight) images[key] = img; };
    img.onerror = () => { delete images[key]; };
    img.src = path;
  });
  const $ = id => document.getElementById(id);
  const canvas = $('game'), ctx = canvas.getContext('2d');
  const W = 960, H = 480, GROUND = 385;
  let mode = 'ready', score = 0, health = 3, distance = 0, elapsed = 0;
  let objects = [], particles = [], spawnIn = 1.5, invincible = 0, previous = 0;
  const player = { x: 148, y: GROUND - 87, w: 48, h: 87, vy: 0, grounded: true };
  let viewWidth = W;
  function resize() {
    const rect = canvas.getBoundingClientRect();
    // Portrait screens show a narrower world, preserving all character proportions.
    viewWidth = Math.min(W, Math.max(460, H * rect.width / rect.height));
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
  }
  window.addEventListener('resize', resize);
  resize();
  function hud() {
    $('score').textContent = score.toLocaleString('ko-KR');
    $('health').textContent = '♥ '.repeat(health) + '♡ '.repeat(3 - health);
    $('health').setAttribute('aria-label', `체력 ${health} / 3`);
    $('distance').textContent = `${Math.floor(distance)} m`;
  }
  function overlay(kicker, title, description, button) {
    $('overlay-kicker').textContent = kicker;
    $('overlay-title').textContent = title;
    $('overlay-description').textContent = description;
    $('start').textContent = button;
    $('overlay').hidden = false;
  }
  function start() {
    score = 0; health = 3; distance = 0; elapsed = 0; spawnIn = 1.4; invincible = 0;
    objects = []; particles = [];
    Object.assign(player, { y: GROUND - player.h, vy: 0, grounded: true });
    mode = 'running'; $('overlay').hidden = true; $('pause').disabled = false;
    $('pause').textContent = 'Ⅱ'; $('pause').setAttribute('aria-label', '일시 정지');
    hud(); $('status').textContent = '달리기 시작. 체력 3.';
  }
  function pause() {
    if (mode === 'running') {
      mode = 'paused';
      overlay('잠깐 쉬어 가기', '바람도 쉬어 가는 시간', '준비되면 여정을 이어 가세요.', '계속 달리기 →');
      $('pause').textContent = '▶'; $('pause').setAttribute('aria-label', '계속 달리기');
    } else if (mode === 'paused') {
      mode = 'running'; $('overlay').hidden = true;
      $('pause').textContent = 'Ⅱ'; $('pause').setAttribute('aria-label', '일시 정지');
    }
  }
  function jump() {
    if (mode !== 'running' || !player.grounded) return;
    player.vy = -650; player.grounded = false;
  }
  $('start').addEventListener('click', () => mode === 'paused' ? pause() : start());
  $('pause').addEventListener('click', pause);
  $('jump').addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && e.target.tagName !== 'BUTTON' && e.target.tagName !== 'A') {
      e.preventDefault(); if (!e.repeat) { if (mode === 'ready' || mode === 'over') start(); else jump(); }
    }
    if (e.code === 'Escape' && !e.repeat) pause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') pause(); });
  function overlap(a,b) { return a.x < b.x+b.w && a.x+a.w > b.x && a.y < b.y+b.h && a.y+a.h > b.y; }
  function burst(x,y,color) {
    for (let i=0;i<9;i++) particles.push({x,y,vx:(Math.random()-.5)*160,vy:-40-Math.random()*120,life:.6,color});
  }
  function update(dt) {
    elapsed += dt; invincible = Math.max(0, invincible-dt);
    const speed = Math.min(355, 235 + elapsed * 1.5);
    distance += speed * dt / 20;
    player.vy += 1750 * dt; player.y += player.vy * dt;
    if (player.y + player.h >= GROUND) { player.y = GROUND-player.h; player.vy=0; player.grounded=true; }
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const x = viewWidth + 100;
      objects.push({type:'train',x,y:GROUND-51,w:78,h:51,hit:false});
      // A collectible arc leads the player across each obstacle.
      for(let i=0;i<5;i++) objects.push({type:'orange',x:x-55+i*42,y:GROUND-110-Math.sin(i/4*Math.PI)*68,w:24,h:24});
      spawnIn = 2.5 + Math.random()*.5;
    }
    const box = {x:player.x+8,y:player.y+18,w:player.w-16,h:player.h-20};
    for (const obj of objects) {
      obj.x -= speed * dt;
      if (obj.hit || !overlap(box,obj)) continue;
      if (obj.type === 'orange') {
        obj.hit=true; score+=100; burst(obj.x+12,obj.y+12,'#e6a046');
      } else if (invincible<=0) {
        obj.hit=true; health--; invincible=1.35; burst(player.x+24,player.y+40,'#b76e52');
        $('status').textContent = `장애물 충돌. 남은 체력 ${health}.`;
        if (!health) {
          mode='over'; $('pause').disabled=true;
          overlay('오늘의 여정 완료', '참 잘 달렸어요, 유생님!', `${score.toLocaleString('ko-KR')}점 · ${Math.floor(distance)}m의 따뜻한 여정`, '다시 달리기 →');
          $('status').textContent = `게임 오버. 최종 점수 ${score}. 다시 달리기를 누르세요.`;
          break;
        }
      }
    }
    objects=objects.filter(o=>o.x+o.w>-40 && !(o.type==='orange'&&o.hit));
    particles.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=350*dt;p.life-=dt;});
    particles=particles.filter(p=>p.life>0); hud();
  }
  function ellipse(x,y,rx,ry,color) { ctx.fillStyle=color;ctx.beginPath();ctx.ellipse(x,y,rx,ry,0,0,Math.PI*2);ctx.fill(); }
  function polygon(points,color) { ctx.fillStyle=color;ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fill(); }
  function background() {
    ctx.fillStyle='#eee7d2';ctx.fillRect(0,0,viewWidth,H);
    ellipse(760,95,37,37,'#e9c88d');
    const scroll=distance*20;
    // Periodic layers: edges repeat exactly, with independent parallax speeds.
    for (const [period,factor,color,base,amp] of [[620,.13,'#cdd2b8',280,115],[470,.27,'#aebda0',340,105]]) {
      ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,GROUND);
      for(let x=0;x<=viewWidth+5;x+=5) {
        const phase=(x+scroll*factor)/period*Math.PI*2;
        ctx.lineTo(x,base-Math.sin(phase)*amp*.4-Math.sin(phase*2)*amp*.18);
      }
      ctx.lineTo(viewWidth,GROUND);ctx.closePath();ctx.fill();
    }
    for(let i=-1;i<5;i++) {
      const x=i*340-((scroll*.42)%340);
      ctx.fillStyle='#b7a38a';ctx.fillRect(x+85,287,70,64);
      polygon([[x+65,290],[x+120,251],[x+177,290]],'#777d6b');
      ctx.fillStyle='#7f806b';ctx.fillRect(x+113,314,17,37);
      ctx.fillStyle='#847d59';ctx.fillRect(x+251,275,8,82);
      ellipse(x+255,266,35,39,'#9ca979');ellipse(x+234,283,26,29,'#9ca979');
    }
    if(images.background) {
      const img=images.background, width=H*img.naturalWidth/img.naturalHeight;
      for(let x=-(scroll*.35%width);x<viewWidth;x+=width)ctx.drawImage(img,x,0,width,H);
    }
    ctx.fillStyle='#d8c699';ctx.fillRect(0,GROUND,viewWidth,H-GROUND);
    ctx.fillStyle='#a4aa73';ctx.fillRect(0,GROUND,viewWidth,7);
    for(let i=-1;i<30;i++) {
      const x=i*61-scroll%61;
      ctx.strokeStyle='#c5b284';ctx.beginPath();ctx.moveTo(x,GROUND+42);ctx.lineTo(x+18,GROUND+43);ctx.stroke();
      ellipse(x+25,GROUND+74,2,1,'#bdae86');
    }
    // Deterministic paper fibers, no external texture dependency.
    ctx.fillStyle='#76643b';ctx.globalAlpha=.045;
    for(let i=0;i<650;i++)ctx.fillRect((i*137.3)%viewWidth,(i*91.7)%H,1+(i%3),1);
    ctx.globalAlpha=1;
  }
  function drawOrange(o) {
    if(images.orange) return ctx.drawImage(images.orange,o.x,o.y,o.w,o.h);
    ellipse(o.x+12,o.y+13,12,11,'#df923d');ellipse(o.x+8,o.y+10,3,4,'#efb65b');
    ellipse(o.x+15,o.y+2,6,2,'#74854f');
  }
  function drawTrain(o) {
    if(images.train) return ctx.drawImage(images.train,o.x,o.y,o.w,o.h);
    ctx.fillStyle='#9c7055';ctx.fillRect(o.x,o.y+13,74,29);
    ctx.fillStyle='#b58b66';ctx.fillRect(o.x+39,o.y,31,40);
    ctx.fillStyle='#6f7564';ctx.fillRect(o.x+35,o.y-3,40,7);ctx.fillRect(o.x+8,o.y+2,10,17);
    ctx.fillStyle='#e7d5a7';ctx.fillRect(o.x+47,o.y+8,15,13);
    for(const x of [16,55]){ellipse(o.x+x,o.y+43,10,10,'#5c6054');ellipse(o.x+x,o.y+43,4,4,'#c3b594');}
  }
  function drawPlayer() {
    ctx.save();ctx.translate(player.x,player.y);
    if(invincible>0 && Math.floor(invincible*12)%2)ctx.globalAlpha=.35;
    if(images.player){ctx.drawImage(images.player,-14,-9,76,96);ctx.restore();return;}
    const step=player.grounded && mode==='running'?Math.sin(elapsed*17)*7:0;
    ctx.strokeStyle='#4c5147';ctx.lineWidth=8;ctx.lineCap='round';
    ctx.beginPath();ctx.moveTo(19,66);ctx.lineTo(13+step,83);ctx.moveTo(30,66);ctx.lineTo(36-step,83);ctx.stroke();
    polygon([[14,29],[35,29],[48,69],[2,69]],'#658879');
    polygon([[15,32],[1,49],[-8,41],[-13,50],[6,60],[23,40]],'#77998a');
    polygon([[32,32],[51,44],[57,39],[62,48],[45,56],[26,40]],'#77998a');
    polygon([[19,30],[25,36],[31,30],[26,57]],'#e9e2c8');
    ctx.fillStyle='#476659';ctx.fillRect(13,51,24,4);
    ellipse(25,19,15,17,'#e6c39b');
    ctx.fillStyle='#3f493f';ctx.fillRect(12,-7,26,16);ellipse(25,8,32,5,'#3f493f');
    ellipse(31,18,1.4,1.8,'#464639');ellipse(36,25,3,1.5,'#cc947e');
    ctx.strokeStyle='#64634d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(5,10);ctx.quadraticCurveTo(19,54,42,10);ctx.stroke();
    ctx.restore();
  }
  function render() {
    ctx.setTransform(canvas.width/viewWidth,0,0,canvas.height/H,0,0);
    background();
    ellipse(player.x+24,GROUND+4,29,5,'#b6ad87');
    objects.forEach(o=>o.type==='orange'?drawOrange(o):drawTrain(o));drawPlayer();
    particles.forEach(p=>{ctx.globalAlpha=p.life/.6;ellipse(p.x,p.y,3,3,p.color);});ctx.globalAlpha=1;
  }
  function frame(now) {
    const dt=Math.min((now-previous)/1000||0,1/30);previous=now;
    if(mode==='running')update(dt);
    render();requestAnimationFrame(frame);
  }
  hud();requestAnimationFrame(frame);
})();
