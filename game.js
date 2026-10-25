(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  // Background only. Blur is measured in CSS pixels; 1 is unchanged color strength.
  const BACKGROUND_STYLE = { blurPx: 1.25, saturation: .94, contrast: .94 };
  const backgroundLayer = document.createElement('canvas');
  const backgroundCtx = backgroundLayer.getContext('2d');
  const characterPath = n => `assets/characters/${n === 1 ? '캐릭어' : '캐릭터'}이미지${n}.png`;
  const CHARACTER_POSES = { run:[1,2,3,4,5,9], jumpUp:8, jumpDown:1, hurt:5, over:2 };
  const SMASH_SECONDS = .6;
  const asset = {
    backgrounds: ['assets/backgrounds/bbaakk1.jpg'],
    characters: [1,2,3,4,5,8,9].map(characterPath),
    items: [1, 2, 3, 4, 5, 6].map(n => `assets/items/귤${n}.png`),
    brush: ['assets/extras/기타이미지4.png'],
    giant: ['assets/extras/기타이미지3.png'],
    ui: [11, 12, 13, 14, 15].map(n => `assets/ui/기타이미지${n}.png`)
  };
  const OBSTACLES = [
    { path: 'assets/obstacles/기타이미지1.png', kind: 'single', height: 55, core: {x:.08,y:.08,w:.84,h:.86} },
    { path: 'assets/obstacles/기타이미지2.png', kind: 'single', height: 68, core: {x:.13,y:.10,w:.74,h:.84} },
    { path: 'assets/obstacles/기타이미지6.png', kind: 'double', height: 165, core: {x:.35,y:.14,w:.30,h:.80} },
    { path: 'assets/obstacles/기타이미지7.png', kind: 'double', height: 170, core: {x:.40,y:.15,w:.23,h:.80} },
    { path: 'assets/obstacles/기타이미지9.png', kind: 'double', height: 160, core: {x:.24,y:.08,w:.54,h:.80} }
  ];
  const images = {}, silhouettes = {}, alphaBounds = {}, masks = {}, failed = [];
  const H = 500, GROUND = 461;
  const GRAVITY = 1800, FIRST_JUMP = 640, SECOND_JUMP = 620;
  const SPEED = 306;
  const DIFFICULTY = [
    { start:0, name:'적응', speed:1, recovery:.32, extra:100, recipes:[['single'],['single']] },
    { start:5, name:'보통', speed:1.15, recovery:.22, extra:50, recipes:[['single'],['single','single'],['double'],['single']] },
    { start:15, name:'어려움', speed:1.30, recovery:.15, extra:24, recipes:[['double','single'],['single','single'],['single','double'],['double'],['single','double','single']] },
    { start:30, name:'매우 어려움', speed:1.45, recovery:.11, extra:12, recipes:[['single','double','single'],['double','single','double'],['single','single','double'],['double','single','single'],['single','double']] },
    { start:50, name:'극한', speed:1.55, recovery:.085, extra:0, recipes:[['single','double','single','double'],['single','single','double','single'],['double','single','single','double'],['double','double','single'],['single','double','double','single']] }
  ];
  const SPEED_RAMP_SECONDS = 1.5;
  const MAX_SPEED = SPEED * 1.55 * 1.5;
  const SPACING_MARGIN = 48; // body alignment plus approximately 30ms input slack
  const SINGLE_FLIGHT = 2 * FIRST_JUMP / GRAVITY;
  const SECOND_AT = .24;
  const secondHeight = FIRST_JUMP * SECOND_AT - .5 * GRAVITY * SECOND_AT ** 2;
  const DOUBLE_FLIGHT = SECOND_AT + (SECOND_JUMP + Math.sqrt(SECOND_JUMP ** 2 + 2 * GRAVITY * secondHeight)) / GRAVITY;
  const BOOST_SECONDS = 5, GIANT_SECONDS = 5, BOOST_FACTOR = 1.5;
  const player = { x: 106, y: 363, w: 74, h: 98, vy: 0, grounded: true, land: 0, jumps: 0 };
  let loaded = false, mode = 'loading', score = 0, health = 3;
  let distance = 0, time = 0, runTime = 0, spawnIn = .25, invincible = 0;
  let boostRemaining = 0, giantRemaining = 0, visualScale = 1, orangeSequence = 0, objects = [], effects = [], last = 0;
  let worldWidth = 1100, tiles = [], patternIndex = 0;
  let canvasPixelRatio = 1, viewportSpeedCap = MAX_SPEED;
  let flyingObstacles = [], giantIntroRemaining = 0, lastGiantStep = -1;
  let currentStage = 0;
  let nextBrushAt = 14, nextGiantAt = 24;
  let giantExitReadyAt = 0;
  let obstacleChoices = { single:0, double:0 };
  const obstaclePaths = OBSTACLES.map(o => o.path);
  const paths = [...Object.values(asset).flat(), ...obstaclePaths];

  function prepareSprite(path, img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const t = c.getContext('2d');
    t.drawImage(img, 0, 0);
    const pixels = t.getImageData(0, 0, c.width, c.height).data;
    if (obstaclePaths.includes(path)) masks[path] = { data: pixels, width: c.width, height: c.height };
    let left = c.width, top = c.height, right = -1, bottom = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        if (pixels[(y * c.width + x) * 4 + 3] < 32) continue;
        left = Math.min(left, x); right = Math.max(right, x);
        top = Math.min(top, y); bottom = Math.max(bottom, y);
      }
    }
    alphaBounds[path] = right < left ? { x: 0, y: 0, w: 1, h: 1 } : {
      x: left / c.width, y: top / c.height,
      w: (right - left + 1) / c.width, h: (bottom - top + 1) / c.height
    };
    if (asset.characters.includes(path)) return;
    // Runtime-only silhouette; original PNG files stay unchanged.
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = '#fff4d9'; t.fillRect(0, 0, c.width, c.height);
    silhouettes[path] = c;
  }

  Promise.all(paths.map(path => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      images[path] = img;
      if (asset.characters.includes(path) || asset.items.includes(path) || asset.brush.includes(path) || asset.giant.includes(path) || obstaclePaths.includes(path)) {
        try { prepareSprite(path, img); } catch (error) {
          // Some browsers restrict local file pixel reads. Keep the image playable.
          console.warn(`투명도 분석을 생략합니다: ${path}`, error.name);
        }
      }
      resolve();
    };
    img.onerror = () => {
      failed.push(path); console.error(`이미지 로딩 실패: ${path}`); resolve();
    };
    img.src = path;
  }))).then(() => {
    loaded = true; mode = 'ready';
    tiles = asset.backgrounds.filter(p => images[p]).map(p => ({
      image: images[p], width: images[p].naturalWidth * H / images[p].naturalHeight, path: p
    }));
    $('loading').textContent = failed.length ? '이미지 경로를 확인해 주세요.' : 'SPACE / 화면 터치 · 최대 2단 점프';
    if (failed.length) {
      $('asset-warning').hidden = false;
      $('asset-warning').textContent = `불러오지 못한 이미지: ${failed.join(', ')}`;
    }
    $('start').disabled = !(images[asset.characters[0]] && images[asset.items[0]] && tiles.length);
  });

  function resize() {
    const r = canvas.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
    worldWidth = H * r.width / r.height;
    player.x = Math.min(106, Math.max(16, 16+(worldWidth-320)*.18));
    // Keep a visible approach window on narrow phones, even for the scroll.
    viewportSpeedCap = Math.max(SPEED*1.55, Math.min(MAX_SPEED, (worldWidth-(player.x+player.w/2)+46)/(.56+.09)));
    canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr);
    canvasPixelRatio = canvas.width / r.width;
  }
  addEventListener('resize', resize); resize();

  function hud() {
    $('score').textContent = score.toLocaleString('ko-KR');
    $('health').textContent = `${health} / 3`;
    $('health').setAttribute('aria-label', `체력 ${health} / 3`);
    $('health-fill').style.width = `${health / 3 * 100}%`;
    $('distance').textContent = `${Math.floor(distance)} m`;
    $('boost').hidden = boostRemaining <= 0;
    $('boost-time').textContent = `${Math.ceil(boostRemaining)}초`;
    $('boost').setAttribute('aria-label', `가속 남은 시간 ${Math.ceil(boostRemaining)}초`);
    $('giant').hidden = giantRemaining <= 0;
    $('giant-time').textContent = `${Math.ceil(giantRemaining)}초`;
    $('giant').setAttribute('aria-label', `거대화 남은 시간 ${Math.ceil(giantRemaining)}초`);
  }
  function panel(name) {
    $('overlay').hidden = !name;
    for (const n of ['welcome', 'result', 'paused']) $(n).hidden = n !== name;
  }
  function start() {
    if (!loaded || $('start').disabled) return;
    score = 0; health = 3; distance = 0; time = 0; runTime = 0;
    spawnIn = .25; patternIndex = 0; invincible = 0; boostRemaining = 0; giantRemaining = 0; visualScale = 1; orangeSequence = 0;
    objects = []; effects = [];
    flyingObstacles = []; giantIntroRemaining = 0; lastGiantStep = -1;
    currentStage = 0; nextBrushAt = 14; nextGiantAt = 24; giantExitReadyAt = 0; obstacleChoices = {single:0,double:0};
    Object.assign(player, { y: GROUND - player.h, vy: 0, grounded: true, land: 0, jumps: 0 });
    mode = 'running'; panel(null); canvas.focus({preventScroll:true}); $('pause').disabled = false;
    $('pause').setAttribute('aria-label', '일시 정지');
    hud(); $('status').textContent = '달리기 시작. 체력 3.';
  }
  function pause() {
    if (mode === 'running') {
      mode = 'paused'; panel('paused'); $('pause').setAttribute('aria-label', '이어하기');
    } else if (mode === 'paused') {
      mode = 'running'; panel(null); canvas.focus({preventScroll:true}); $('pause').setAttribute('aria-label', '일시 정지');
    }
  }
  function jump() {
    if (mode !== 'running' || player.jumps >= 2) return;
    player.jumps++;
    player.vy = player.jumps === 1 ? -FIRST_JUMP : -SECOND_JUMP;
    player.grounded = false; player.land = 0;
    if (player.jumps === 2) effects.push({ type: 'double', x: player.x + player.w / 2, y: player.y + player.h - 10, life: .3 });
  }
  $('start').addEventListener('click', start);
  $('restart').addEventListener('click', start);
  $('resume').addEventListener('click', pause);
  $('pause').addEventListener('click', pause);
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  document.addEventListener('keydown', e => {
    if (e.code === 'Space' && !['BUTTON', 'A'].includes(e.target.tagName)) {
      e.preventDefault();
      if (!e.repeat) { if (mode === 'ready' || mode === 'over') start(); else jump(); }
    }
    if (e.code === 'Escape' && !e.repeat) pause();
  });
  document.addEventListener('visibilitychange', () => { if (document.hidden && mode === 'running') pause(); });

  function overlap(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function jumpOffset(t, double = false) {
    const secondAt = .24;
    if (!double || t <= secondAt) return -FIRST_JUMP * t + .5 * GRAVITY * t * t;
    const atSecond = -FIRST_JUMP * secondAt + .5 * GRAVITY * secondAt * secondAt, after = t - secondAt;
    return atSecond - SECOND_JUMP * after + .5 * GRAVITY * after * after;
  }
  function difficultyAt(at = time) {
    let index = 0;
    for (let i=1;i<DIFFICULTY.length;i++) if (at >= DIFFICULTY[i].start) index = i;
    return { ...DIFFICULTY[index], index };
  }
  function difficultySpeed(at = time) {
    const level = difficultyAt(at);
    if (!level.index) return 1;
    const t = Math.max(0, Math.min(1, (at-level.start)/SPEED_RAMP_SECONDS));
    return DIFFICULTY[level.index-1].speed + (level.speed-DIFFICULTY[level.index-1].speed)*t*t*(3-2*t);
  }
  function brushFactor(remaining = boostRemaining) {
    const t = Math.max(0, Math.min(1, remaining/.25));
    return 1 + (BOOST_FACTOR-1)*t*t*(3-2*t);
  }
  function predictTravel(seconds, at = time, boost = boostRemaining) {
    const steps = Math.max(1, Math.ceil(seconds/.02)), dt = seconds/steps;
    let travel = 0;
    for(let i=0;i<steps;i++) {
      const t=(i+.5)*dt;
      travel += Math.min(viewportSpeedCap,SPEED*difficultySpeed(at+t)*brushFactor(Math.max(0,boost-t)))*dt;
    }
    return travel;
  }
  function arrivalTime(pixels) {
    let low=0, high=Math.max(0,pixels)/SPEED+1;
    for(let i=0;i<20;i++) {
      const mid=(low+high)/2;
      if(predictTravel(mid)<pixels) low=mid; else high=mid;
    }
    return (low+high)/2;
  }
  function landingGap(previous, next, level) {
    const flight=previous.kind==='double'?DOUBLE_FLIGHT:SINGLE_FLIGHT;
    const minSpeed=SPEED*difficultySpeed();
    const approach=Math.max(0,(previous.center??worldWidth+60)-(player.x+player.w/2))/minSpeed;
    const horizon=approach+flight+level.recovery+next.lead+.15;
    // Uncollected brushes can change speed before this group arrives. New brushes
    // are only placed in the rest area after a group's final obstacle.
    const mayBoost=boostRemaining>0 || objects.some(o=>o.type==='brush'&&!o.hit);
    const maxSpeed=Math.min(viewportSpeedCap,SPEED*difficultySpeed(time+horizon)*(mayBoost?BOOST_FACTOR:1));
    return maxSpeed*(flight+level.recovery+next.lead)-minSpeed*previous.lead+SPACING_MARGIN+level.extra;
  }
  function spawn() {
    const level = difficultyAt();
    const recipe = level.recipes[patternIndex % level.recipes.length].map(kind=>kind==='double'&&time<10?'single':kind);
    const baseAnchor=worldWidth+60;
    let anchor=patternIndex===0 ? Math.min(baseAnchor,player.x+player.w/2+SPEED*2) : baseAnchor;
    if(giantExitReadyAt>time) anchor=Math.max(anchor,player.x+player.w/2+predictTravel(giantExitReadyAt-time+.56)+80);
    const nodes=[];
    for(let i=0;i<recipe.length;i++) {
      const kind = recipe[i];
      const lead = kind==='double' ? [.52,.54,.56][(patternIndex+i)%3] : [.33,.36,.39][(patternIndex+i)%3];
      const node = {kind, lead, center:anchor};
      if(nodes.length) {
        const previous = nodes.at(-1);
        node.center = previous.center+landingGap(previous,node,level);
      }
      nodes.push(node);
    }
    const created=[];
    for(const node of nodes) {
      if(node.kind==='flat') continue;
      const variants=OBSTACLES.filter(o=>o.kind===node.kind);
      const descriptor=variants[obstacleChoices[node.kind]++ % variants.length];
      if(!descriptor || !images[descriptor.path]) continue;
      const img=images[descriptor.path], h=descriptor.height, w=h*img.naturalWidth/img.naturalHeight;
      const obstacle={type:'obstacle',path:descriptor.path,core:descriptor.core,
        x:node.center-w/2,y:GROUND-h,w,h,hit:false,pattern:node.kind,
        lead:node.lead,stage:level.index,group:patternIndex,order:created.length};
      created.push(obstacle); objects.push(obstacle);
    }
    for(const node of nodes) {
      const reaches=arrivalTime(node.center-(player.x+player.w/2));
      const jumpAt=Math.max(0,reaches-node.lead);
      const at=time+jumpAt, boost=Math.max(0,boostRemaining-jumpAt);
      const approach=predictTravel(node.lead,at,boost);
      const samples=node.kind==='flat' ? [0,.17,.34,.51,.68,.85] :
        node.kind==='double' ? [.16,.28,.42,.56,.70,.84] : [.10,.22,.34,.46,.58];
      for(const t of samples) {
        const path=asset.items[orangeSequence%asset.items.length]; if(!images[path]) continue;
        const x=node.kind==='flat' ? node.center+predictTravel(t,at,boost) : node.center+predictTravel(t,at,boost)-approach;
        const y=node.kind==='flat' ? GROUND-48 : GROUND+jumpOffset(t,node.kind==='double')-player.h/2;
        const orange={type:'orange',path,x:x-18,y:Math.max(90,Math.min(GROUND-38,y-18)),w:36,h:36,hit:false,phase:orangeSequence*.7,pattern:node.kind};
        if(created.some(o=>overlap({...orange,y:orange.y-5,h:orange.h+10},o))) continue;
        objects.push(orange); orangeSequence++;
      }
    }
    const lastNode=nodes.at(-1);
    let after=lastNode.kind==='flat' ? 1000+level.extra : landingGap(lastNode,{lead:.56},level);
    const specials=[];
    if(time>=nextBrushAt && images[asset.brush[0]]) {specials.push('brush'); nextBrushAt=time+36;}
    if(time>=nextGiantAt && images[asset.giant[0]]) {specials.push('giant'); nextGiantAt=time+48;}
    if(specials.length) {
      // Ground-level item rest area after landing, before any next jump begins.
      const flight=lastNode.kind==='double'?DOUBLE_FLIGHT:SINGLE_FLIGHT;
      const rest=lastNode.kind==='flat'?330:MAX_SPEED*(flight+level.recovery)-SPEED*lastNode.lead+48;
      specials.forEach((type,i)=>objects.push({type,path:asset[type][0],x:lastNode.center+rest+i*100-20,
        y:GROUND-80,w:type==='giant'?40:38,h:46,hit:false,phase:0}));
      after=Math.max(after,rest+specials.length*100+MAX_SPEED*.85);
    }
    patternIndex++;
    spawnIn=(lastNode.center-anchor+after+Math.max(0,anchor-baseAnchor))/SPEED;
  }

  function spriteRect(o) {
    const img = images[o.path];
    if (!img) return { x: o.x, y: o.y, w: o.w, h: o.h };
    const bounds = o.type === 'obstacle' ? { x:0,y:0,w:1,h:1 } : (alphaBounds[o.path] || {x:0,y:0,w:1,h:1});
    const scale = Math.min(o.w / (img.naturalWidth * bounds.w), o.h / (img.naturalHeight * bounds.h));
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const bob = o.type === 'orange' ? Math.sin(time * 3 + o.phase) * 3 : 0;
    return { x: o.x + (o.w - w * bounds.w) / 2 - bounds.x * w,
      y: o.y + o.h - h * bounds.h - bounds.y * h + bob, w, h };
  }
  function hitRect(o) {
    const r = spriteRect(o), a = o.core || alphaBounds[o.path];
    return a ? { x: r.x + a.x * r.w, y: r.y + a.y * r.h, w: a.w * r.w, h: a.h * r.h } : r;
  }
  function collides(box, o) {
    const h = hitRect(o);
    if (!overlap(box, h)) return false;
    const mask = masks[o.path];
    if (o.type !== 'obstacle' || !mask) return true;
    // Exclude decorative branches/tassels via the core, and transparent pixels via alpha.
    const r = spriteRect(o);
    const x0 = Math.max(0, Math.floor((Math.max(box.x,h.x)-r.x)/r.w*mask.width));
    const x1 = Math.min(mask.width-1, Math.ceil((Math.min(box.x+box.w,h.x+h.w)-r.x)/r.w*mask.width));
    const y0 = Math.max(0, Math.floor((Math.max(box.y,h.y)-r.y)/r.h*mask.height));
    const y1 = Math.min(mask.height-1, Math.ceil((Math.min(box.y+box.h,h.y+h.h)-r.y)/r.h*mask.height));
    for(let y=y0;y<=y1;y++) for(let x=x0;x<=x1;x++) if(mask.data[(y*mask.width+x)*4+3]>=96) return true;
    return false;
  }
  function movementFactor() {
    return Math.min(viewportSpeedCap/SPEED, 1.55*BOOST_FACTOR, difficultySpeed()*brushFactor());
  }
  function collectEffect(amount) {
    const recent = effects.find(e => e.type === 'collect' && e.life > .08);
    if (recent) recent.amount += amount;
    else {
      effects = effects.filter(e => e.type !== 'collect');
      effects.push({ type: 'collect', amount, x: player.x + player.w + 8, y: player.y + 15, life: .35 });
    }
  }
  function endGame() {
    mode = 'over'; boostRemaining = 0; giantRemaining = 0; visualScale = 1; effects = [];
    flyingObstacles = []; giantIntroRemaining = 0; lastGiantStep = -1; giantExitReadyAt=0;
    $('pause').disabled = true;
    const resultText = `${score.toLocaleString('ko-KR')}점`;
    $('final-score').textContent = resultText;
    $('final-score').style.setProperty('--score-chars', resultText.length);
    panel('result'); $('status').textContent = `황감제 결과 발표. 그대의 성적은 ${score}점.`;
    hud();
  }
  function stridePhase() {
    return runTime * 9 * SPEED / 260 * (giantRemaining > 0 ? 1.1 : 1);
  }
  function smashObstacle(o) {
    if (o.destroyed) return;
    o.hit = true; o.destroyed = true; // Disable collision before starting any animation.
    flyingObstacles.push({ path:o.path, x:o.x, y:o.y, w:o.w, h:o.h, age:0,
      duration:SMASH_SECONDS, travel:Math.max(160,worldWidth+o.w+60-o.x) });
    flyingObstacles = flyingObstacles.slice(-12);
    if (!effects.some(e=>e.type==='impact' && e.life>.12 && Math.abs(e.x-player.x)<120)) {
      effects.push({type:'impact',x:player.x+player.w*.8,y:GROUND-20,life:.32});
    }
  }
  function destructionBox() {
    const size = Math.max(1, visualScale), w=player.w*size, h=player.h*size;
    return {x:player.x+(player.w-w)/2+8,y:player.y+player.h-h+15,w:w-16,h:h-20};
  }
  function secureGiantExit() {
    const feet=player.y+player.h-GROUND;
    const landing=player.grounded?0:Math.max(0,(-player.vy+Math.sqrt(player.vy**2-2*GRAVITY*feet))/GRAVITY);
    const settle=landing+Math.max(.18,difficultyAt().recovery);
    giantExitReadyAt=time+settle;
    const front=player.x+player.w/2+predictTravel(settle+.56)+player.w/2+16;
    for(const o of objects) {
      if(o.type!=='obstacle'||o.destroyed)continue;
      const b=hitRect(o);
      if(b.x<=front && b.x+b.w>=player.x-16)smashObstacle(o);
    }
  }
  function advance(realDt, factor) {
    const runDt = realDt * factor;
    const giantWasActive=giantRemaining>0;
    for (const f of flyingObstacles) f.age += realDt;
    flyingObstacles = flyingObstacles.filter(f=>f.age<f.duration-1e-9);
    for (const e of effects) { e.life -= realDt; e.y -= realDt * (e.type==='collect'?22:0); }
    effects = effects.filter(e=>e.life>0);
    giantIntroRemaining = Math.max(0,giantIntroRemaining-realDt);
    time += realDt; runTime += runDt;
    currentStage=difficultyAt().index;
    invincible = Math.max(0, invincible - realDt); player.land = Math.max(0, player.land - realDt);
    boostRemaining = Math.max(0, boostRemaining - realDt);
    if (boostRemaining < 1e-9) boostRemaining = 0;
    giantRemaining = Math.max(0, giantRemaining - realDt);
    if (giantRemaining < 1e-9) giantRemaining = 0;
    const targetScale = giantRemaining > 0 ? 1.5 : 1;
    visualScale += (targetScale - visualScale) * (1 - Math.exp(-realDt / .08));
    if (Math.abs(targetScale - visualScale) < .001) visualScale = targetScale;
    distance += SPEED * runDt / 20;
    if (!player.grounded) {
      player.y += player.vy * realDt + .5 * GRAVITY * realDt * realDt; player.vy += GRAVITY * realDt;
    }
    if (player.y + player.h >= GROUND) {
      if (!player.grounded) player.land = .14;
      player.y = GROUND - player.h; player.vy = 0; player.grounded = true; player.jumps = 0;
    }
    spawnIn -= runDt; if (spawnIn <= 0) spawn();
    const damageBox = { x: player.x + 18, y: player.y + 15, w: player.w - 32, h: player.h - 20 };
    const pickupBox = collectionBox();
    for (const o of objects) o.x -= SPEED * runDt;
    // Resolve pickups first: a book collected on the same step grants immunity immediately.
    for (const o of objects) {
      if (o.type==='obstacle' || o.hit || !collides(pickupBox,o)) continue;
      if (o.type==='orange') {
        o.hit=true; score+=100; collectEffect(100);
      } else if(o.type==='brush') {
        o.hit=true; boostRemaining=BOOST_SECONDS;
        $('status').textContent='붓 획득. 5초 가속!';
      } else if(o.type==='giant') {
        o.hit=true; giantRemaining=GIANT_SECONDS; giantIntroRemaining=.3; invincible=0; lastGiantStep=-1;
        $('status').textContent='과거 책 획득. 5초 거대화!';
      }
    }
    // Finish the power-up with a short clear approach corridor, not extra immunity.
    if(giantWasActive && giantRemaining===0) secureGiantExit();
    const giantBox=giantRemaining>0?destructionBox():null;
    for (const o of objects) {
      if (o.type!=='obstacle' || (o.hit && giantRemaining<=0) || o.destroyed || !collides(giantBox||damageBox,o)) continue;
      if (giantRemaining>0) {
        smashObstacle(o);
      } else if(invincible<=0) {
        o.hit=true; health--; invincible=1.4;
        $('status').textContent=`장애물 충돌. 체력 ${health}.`;
        if(health===0) { endGame(); break; }
      }
    }
    objects=objects.filter(o=>!o.destroyed && o.x+o.w>-50 && !(o.hit && o.type!=='obstacle'));
    if(giantRemaining>0 && player.grounded) {
      const footfall=Math.floor(stridePhase()/3);
      if(footfall!==lastGiantStep) {
        lastGiantStep=footfall;
        effects.push({type:'dust',x:player.x+player.w*.35,y:GROUND-3,life:.22});
      }
    } else if(giantRemaining<=0) lastGiantStep=-1;
    effects=effects.slice(-10);
  }

  function update(dt) {
    if (mode !== 'running') return;
    // Real-time boost clock and movement clock are separate. Small steps avoid tunnelling
    // up to 711.45px/s and split exactly at item expiration boundaries.
    // Vertical physics always uses realDt, independent of either speed multiplier.
    let remaining = dt;
    while (remaining > 1e-9 && mode === 'running') {
      const factor = movementFactor();
      const step = Math.min(remaining, 1 / 120, boostRemaining > 0 ? boostRemaining : Infinity, giantRemaining > 0 ? giantRemaining : Infinity);
      advance(step, factor); remaining -= step;
    }
    hud();
  }

  function draw(path, x, y, w, h, alpha = 1) {
    const img = images[path]; if (!img) return;
    const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
    ctx.save(); ctx.globalAlpha = alpha;
    ctx.drawImage(img, x + (w - img.naturalWidth * s) / 2, y + h - img.naturalHeight * s, img.naturalWidth * s, img.naturalHeight * s);
    ctx.restore();
  }
  function background() {
    ctx.filter = 'none';
    if (!tiles.length) {
      ctx.fillStyle = '#d9ecfa'; ctx.fillRect(0, 0, worldWidth, H);
      return;
    }
    const pixelRatio = canvasPixelRatio;
    const blur = Math.max(0, BACKGROUND_STYLE.blurPx) * pixelRatio;
    const padding = Math.ceil(blur * 4) + 2;
    const layerWidth = canvas.width + padding * 2;
    const layerHeight = canvas.height + padding * 2;
    if (backgroundLayer.width !== layerWidth || backgroundLayer.height !== layerHeight) {
      backgroundLayer.width = layerWidth; backgroundLayer.height = layerHeight;
    }
    const scaleX = canvas.width / worldWidth, scaleY = canvas.height / H;
    const padX = padding / scaleX, padY = padding / scaleY;
    backgroundCtx.setTransform(1, 0, 0, 1, 0, 0);
    backgroundCtx.filter = 'none';
    backgroundCtx.fillStyle = '#d9ecfa'; backgroundCtx.fillRect(0, 0, layerWidth, layerHeight);
    backgroundCtx.setTransform(scaleX, 0, 0, scaleY, padding, padding);
    backgroundCtx.imageSmoothingEnabled = true; backgroundCtx.imageSmoothingQuality = 'high';
    const total = tiles.reduce((sum, t) => sum + t.width, 0);
    const offset = (distance * 20 * .65) % total;
    for (let cycle = -1; cycle <= 1; cycle++) {
      let x = cycle * total - offset;
      for (const tile of tiles) {
        if (x < worldWidth + padX && x + tile.width > -padX) {
          backgroundCtx.drawImage(tile.image, x, 0, tile.width, H);
          // Extend only offscreen edge pixels into the blur's sampling margin.
          // The entire visible source keeps its exact aspect ratio and composition.
          const img = tile.image;
          backgroundCtx.drawImage(img, 0, 0, img.naturalWidth, 1, x, -padY, tile.width, padY);
          backgroundCtx.drawImage(img, 0, img.naturalHeight - 1, img.naturalWidth, 1, x, H, tile.width, padY);
        }
        x += tile.width;
      }
    }
    // Filter the already-joined background once, avoiding transparent blur seams
    // between individual tiles. Never filter the canvas element or foreground.
    ctx.save();
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.filter = `blur(${blur}px) saturate(${BACKGROUND_STYLE.saturation}) contrast(${BACKGROUND_STYLE.contrast})`;
      ctx.drawImage(backgroundLayer, -padding, -padding);
    } finally {
      ctx.restore();
      ctx.filter = 'none';
    }
  }
  function sparkle(x, y, size, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#fff5c3'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke(); ctx.restore();
  }
  function drawObject(o) {
    const r = spriteRect(o);
    if (o.type === 'orange' || o.type === 'brush' || o.type === 'giant') {
      const silhouette = silhouettes[o.path];
      if (silhouette) {
        for (const [dx, dy] of [[-1.25, 0], [1.25, 0], [0, -1.25], [0, 1.25], [-.9, -.9], [.9, .9]]) {
          ctx.drawImage(silhouette, r.x + dx, r.y + dy, r.w, r.h);
        }
      }
      if (images[o.path]) {
        ctx.save();
        if (!silhouette) { ctx.shadowColor = '#fff4d9'; ctx.shadowBlur = 3; }
        ctx.drawImage(images[o.path], r.x, r.y, r.w, r.h); ctx.restore();
      }
      if (o.type === 'orange') sparkle(r.x + r.w + 2, r.y + 4, 2, .4);
    } else if (o.type === 'obstacle') {
      const b = hitRect(o);
      ctx.save(); ctx.fillStyle = '#785735'; ctx.globalAlpha = .24;
      ctx.beginPath(); ctx.ellipse(b.x + b.w / 2, GROUND + 2, b.w * .48, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      draw(o.path, o.x, o.y, o.w, o.h);
    }
  }
  function endingOpacity() {
    if(giantRemaining>0) return giantRemaining<=1 ? .86+.14*Math.cos((1-giantRemaining)*Math.PI*6) : 1;
    return mode==='running' && invincible>0 && Math.floor(invincible*11)%2 ? .45 : 1;
  }
  // Drawing and pickup bounds share exactly the same pose, growth, stride and landing scale.
  function characterGeometry() {
    const phase=stridePhase();
    const pose=mode==='over' ? CHARACTER_POSES.over :
      giantRemaining<=0 && invincible>1.05 ? CHARACTER_POSES.hurt :
      !player.grounded ? (player.vy<0?CHARACTER_POSES.jumpUp:CHARACTER_POSES.jumpDown) :
      CHARACTER_POSES.run[Math.floor(phase)%CHARACTER_POSES.run.length];
    const landing=player.land>0 ? 1-.06*Math.sin(player.land/.14*Math.PI) : 1;
    const intro=giantIntroRemaining>0 ? 1+.05*Math.sin(Math.PI*(1-giantIntroRemaining/.3)) : 1;
    const stride=giantRemaining>0 && player.grounded ? 1+.02*Math.sin(phase*Math.PI/3)**2 : 1;
    const h=player.h*landing*visualScale*intro*stride, w=player.w*landing*visualScale*intro*stride;
    const preferred=characterPath(pose);
    const path=images[preferred]?preferred:asset.characters.find(p=>images[p]);
    if(!path) return null;
    const img=images[path], fit=Math.min(w/img.naturalWidth,h/img.naturalHeight);
    const width=img.naturalWidth*fit, height=img.naturalHeight*fit;
    return {path,x:player.x+(player.w-width)/2,y:player.y+player.h-height,w:width,h:height};
  }
  function collectionBox() {
    const frame=characterGeometry();
    if(!frame) return {x:player.x,y:player.y,w:player.w,h:player.h};
    const a=alphaBounds[frame.path]||{x:0,y:0,w:1,h:1};
    // Friendly antialias margin; never use this larger box for taking obstacle damage.
    const pad=2;
    return {x:frame.x+a.x*frame.w-pad,y:frame.y+a.y*frame.h-pad,
      w:a.w*frame.w+pad*2,h:a.h*frame.h+pad*2};
  }
  function character() {
    if(boostRemaining>0) {
      for(let i=0;i<3;i++) {
        const angle=time*4+i*2.1;
        sparkle(player.x-6-i*10,player.y+25+(Math.sin(angle)+1)*24,2.5,.45);
      }
    }
    const frame=characterGeometry();
    if(frame) draw(frame.path,frame.x,frame.y,frame.w,frame.h,endingOpacity());
  }
  function drawFlyingObstacles() {
    for(const f of flyingObstacles) {
      const p=Math.min(1,f.age/f.duration), ease=1-(1-p)**3;
      const size=1-.52*p, alpha=(1-p)**.7;
      const x=f.x+f.w/2+f.travel*ease, y=f.y+f.h/2-210*Math.sin(p*Math.PI/2)-60*p;
      ctx.save();ctx.translate(x,y);ctx.rotate(.32*ease);
      draw(f.path,-f.w*size/2,-f.h*size/2,f.w*size,f.h*size,alpha);ctx.restore();
    }
  }
  function dustEffect(e) {
    const duration=e.type==='impact'?.32:.22,p=1-e.life/duration;
    ctx.save();ctx.fillStyle='#ddc9a5';ctx.globalAlpha=(1-p)*.4;
    for(let i=0;i<3;i++) {
      const spread=(i-1)*(6+p*13),radius=3+p*5;
      ctx.beginPath();ctx.ellipse(e.x+spread,e.y-p*8-(i%2)*3,radius,radius*.65,0,0,Math.PI*2);ctx.fill();
    }
    ctx.restore();
    if(e.type==='impact') for(let i=0;i<2;i++) {
      const x=e.x+12+i*16+p*18, y=e.y-20-i*12-p*20, r=4+p*2;
      ctx.save();ctx.globalAlpha=1-p;ctx.fillStyle='#fff0b8';ctx.strokeStyle='#c8a36a';ctx.lineWidth=.7;ctx.beginPath();
      for(let j=0;j<10;j++) {const angle=-Math.PI/2+j*Math.PI/5,rad=j%2?r*.45:r;const px=x+Math.cos(angle)*rad,py=y+Math.sin(angle)*rad;j?ctx.lineTo(px,py):ctx.moveTo(px,py);}
      ctx.closePath();ctx.fill();ctx.stroke();ctx.restore();
    }
  }
  function render() {
    ctx.setTransform(canvas.width / worldWidth, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; background();
    for (const o of objects) if (o.type === 'obstacle') drawObject(o);
    drawFlyingObstacles();
    character();
    // Collectibles always render in the foreground, after background and hazards.
    for (const o of objects) if (o.type !== 'obstacle') drawObject(o);
    for (const e of effects) {
      if (e.type === 'collect') {
        ctx.save(); ctx.globalAlpha = Math.min(1, e.life / .12); ctx.fillStyle = '#805232';
        ctx.font = '22px "Gamja Flower", cursive'; ctx.fillText(`+${e.amount}`, e.x, e.y); ctx.restore();
      } else if (e.type==='dust' || e.type==='impact') {
        dustEffect(e);
      } else if (e.type === 'double') {
        const progress = 1 - e.life / .3;
        for (let i = 0; i < 5; i++) {
          const angle = i * Math.PI * 2 / 5, radius = 13 + progress * 22;
          sparkle(e.x + Math.cos(angle) * radius, e.y + Math.sin(angle) * radius, 2.5, e.life / .3);
        }
      }
    }
  }
  function frame(now) {
    const dt = Math.max(0, (now - last) / 1000 || 0); last = now;
    if (mode === 'running') update(dt);
    render(); requestAnimationFrame(frame);
  }
 hud();requestAnimationFrame(frame);
})();
