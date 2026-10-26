(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  // Background only. Blur is measured in CSS pixels; 1 is unchanged color strength.
  const BACKGROUND_STYLE = { blurPx: 1.25, saturation: .93, contrast: .93 };
  const backgroundLayer = document.createElement('canvas');
  const backgroundCtx = backgroundLayer.getContext('2d');
  const backgroundCache = document.createElement('canvas');
  const backgroundCacheCtx = backgroundCache.getContext('2d');
  let backgroundCacheKey = '', backgroundPeriod = 0, backgroundPeriodPixels = 0;
  const MAX_FRAME_DELTA = .1;
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
    { path: 'assets/obstacles/기타이미지5.png', kind: 'single', height: 68, fitVisible:true, core: {x:.04,y:.08,w:.92,h:.88} },
    { path: 'assets/obstacles/야호2.png', kind: 'single', height: 68, fitVisible:true, core: {x:.04,y:.04,w:.92,h:.91} },
    { path: 'assets/obstacles/야호3.png', kind: 'single', height: 72, fitVisible:true, core: {x:.04,y:.04,w:.92,h:.91} },
    { path: 'assets/obstacles/기타이미지6.png', kind: 'double', height: 165, core: {x:.35,y:.14,w:.30,h:.80} },
    { path: 'assets/obstacles/기타이미지7.png', kind: 'double', height: 170, core: {x:.40,y:.15,w:.23,h:.80} },
    { path: 'assets/obstacles/기타이미지9.png', kind: 'double', height: 160, core: {x:.24,y:.08,w:.54,h:.80} },
    { path: 'assets/obstacles/야호1.png', kind: 'double', height: 160, fitVisible:true, core: {x:.18,y:.17,w:.64,h:.78} },
    { path: 'assets/obstacles/야호4.png', kind: 'double', height: 140, fitVisible:true, core: {x:.03,y:.04,w:.94,h:.91} }
  ];
  const images = {}, silhouettes = {}, alphaBounds = {}, masks = {}, failed = [];
  const H = 500, GROUND = 461;
  const GRAVITY = 1800, FIRST_JUMP = 640, SECOND_JUMP = 620;
  const SPEED = 306;
  const DIFFICULTY = [
    { start:0, name:'적응', speed:1.25, recovery:.24, extra:48, recipes:[['single'],['single','single']] },
    { start:10, name:'보통', speed:1.45, recovery:.18, extra:24, recipes:[['single','double'],['double','single'],['single','single'],['double']] },
    { start:20, name:'어려움', speed:1.65, recovery:.13, extra:12, recipes:[['single','double','single'],['double','single','double'],['single','double'],['double','single'],['single','single','double']] },
    { start:35, name:'매우 어려움', speed:1.85, recovery:.10, extra:4, recipes:[['single','double','single','double'],['double','single','double'],['single','single','double'],['double','single','single','double'],['single','double','double','single']] },
    { start:50, name:'극한', speed:2.0, recovery:.085, extra:0, recipes:[['single','double','single','double'],['double','single','double','single'],['double','double','single'],['single','single','double','single'],['single','double','double','single']] }
  ];
  // Recipes still use the existing node coordinates and landing-gap solver.
  // Item mixing remains the original rare replacement shared by every pattern.
  const PATTERNS = [
    {id:'basic',weight:5}, {id:'chain',weight:3}, {id:'tension',weight:3},
    {id:'bonus',weight:1,quiet:true}, {id:'rest',weight:1,quiet:true}
  ];
  const SPEED_RAMP_SECONDS = 1.5;
  const SCORE_RAMP_SECONDS = 1.5;
  // Final factors relative to the original 306px/s, never compounded with older stages.
  const MAX_SPEED = SPEED * 2 * 1.30 * 1.5; // Maximum time × score × brush; applied once.
  const OBSTACLE_GAP_FACTOR = .78;
  const MIN_LANDING_RECOVERY = .085;
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
  let scoreSpeedFrom = 1, scoreSpeedTarget = 1, scoreSpeedStartedAt = 0;
  let nextBrushAt = 14, nextGiantAt = 24;
  let obstacleChoices = { single:0, double:0 };
  let patternSeed = 1, previousPattern = '', patternRepeat = 0, previousQuiet = false;
  let previousLayout = '', layoutRepeat = 0;
  function resetPatternSelection(seed) {
    patternSeed = (seed ?? (globalThis.crypto?.getRandomValues
      ? crypto.getRandomValues(new Uint32Array(1))[0] : Date.now() ^ Math.random()*0xffffffff)) >>> 0;
    previousPattern = ''; patternRepeat = 0; previousQuiet = false;
    previousLayout = ''; layoutRepeat = 0;
  }
  function patternRandom() {
    let n = patternSeed = (patternSeed+0x6D2B79F5) >>> 0;
    n = Math.imul(n ^ n >>> 15,n | 1); n ^= n + Math.imul(n ^ n >>> 7,n | 61);
    return ((n ^ n >>> 14) >>> 0)/4294967296;
  }
  function selectPattern(level) {
    const base=level.recipes[patternIndex % level.recipes.length];
    const longest=Math.max(...level.recipes.map(r=>r.length));
    const options=[];
    for(const p of PATTERNS){
      if(patternIndex===0 && p.id!=='basic')continue;
      if((p.id===previousPattern && patternRepeat>=2) || (previousQuiet && p.quiet))continue;
      const recipes=p.id==='basic'?[base]:p.id==='tension'
        ?level.recipes.filter(r=>r.length===longest):level.recipes.filter(r=>r.length>=2).map(r=>r.slice(0,2));
      const variants=recipes.map(recipe=>{
        const obstacles=recipe.map((_,i)=>p.id!=='bonus' && !(p.id==='rest' && i===1));
        const signature=recipe.map((kind,i)=>(obstacles[i]?kind:'coin')).join(',');
        return {id:p.id,recipe,obstacles,signature};
      }).filter(v=>!(v.signature===previousLayout && layoutRepeat>=2));
      if(variants.length)options.push({pattern:p,variants});
    }
    let roll=patternRandom()*options.reduce((sum,o)=>sum+o.pattern.weight,0);
    let selected=options.at(-1);
    for(const o of options){roll-=o.pattern.weight;if(roll<0){selected=o;break;}}
    const plan=selected.variants[Math.floor(patternRandom()*selected.variants.length)];
    patternRepeat=plan.id===previousPattern?patternRepeat+1:1;
    previousPattern=plan.id; previousQuiet=!!selected.pattern.quiet;
    layoutRepeat=plan.signature===previousLayout?layoutRepeat+1:1;
    previousLayout=plan.signature;
    if(plan.id==='bonus')plan.lineY=GROUND-(patternRandom()<.5?150:50);
    return plan;
  }
  const hudCache = Object.create(null);
  const collectibleCache = new Map();
  let collectibleScale = 0;
  const obstaclePaths = OBSTACLES.map(o => o.path);
  const paths = [...Object.values(asset).flat(), ...obstaclePaths];
  const pauseIcons = { running:'assets/ui/기타이미지15.png', paused:'assets/ui/멈춤버튼.png' };
  const pauseIconImage = $('pause').querySelector('img');
  let pausedIconReady = false;
  const pausedIconPreview = new Image();
  pausedIconPreview.onload = () => { pausedIconReady = true; syncPauseIcon(); };
  pausedIconPreview.onerror = () => { pausedIconReady = false; syncPauseIcon(); };
  pausedIconPreview.src = pauseIcons.paused;
  pauseIconImage.addEventListener('error', () => {
    if (pauseIconImage.getAttribute('src') === pauseIcons.paused) {
      pausedIconReady = false; syncPauseIcon();
    }
  });


  function prepareSprite(path, img) {
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const t = c.getContext('2d');
    t.drawImage(img, 0, 0);
    const pixels = t.getImageData(0, 0, c.width, c.height).data;
    if (obstaclePaths.includes(path) || asset.characters.includes(path)) masks[path] = { data: pixels, width: c.width, height: c.height };
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
    warmCollectibles();
    $('start').disabled = !(images[asset.characters[0]] && images[asset.items[0]] && tiles.length);
  });

  function resize() {
    // Layout dimensions stay in game coordinates when CSS rotates the entire UI.
    const layout = getComputedStyle(canvas);
    const width = parseFloat(layout.width), height = parseFloat(layout.height);
    if (!width || !height) return;
    const dpr = Math.min(devicePixelRatio || 1, 2, Math.sqrt(3000000/(width*height)));
    worldWidth = H * width / height;
    player.x = Math.min(106, Math.max(16, 16+(worldWidth-320)*.18));
    // Keep a visible approach window on narrow phones, even for the scroll.
    viewportSpeedCap = Math.min(MAX_SPEED, Math.max(SPEED*1.25, (worldWidth-(player.x+player.w/2)+46)/(.56+.14)));
    const pixelWidth=Math.round(width*dpr),pixelHeight=Math.round(height*dpr);
    if(canvas.width!==pixelWidth || canvas.height!==pixelHeight){canvas.width=pixelWidth;canvas.height=pixelHeight;backgroundCacheKey='';}
    canvasPixelRatio = canvas.width / width;
    if(loaded)warmCollectibles();
  }
  addEventListener('resize', resize);
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(canvas);
  resize();

  function hud() {
    const text=(id,value)=>{if(hudCache[id]!==value){$(id).textContent=value;hudCache[id]=value;}};
    if(hudCache.scoreValue!==score){text('score',score.toLocaleString('ko-KR'));hudCache.scoreValue=score;}
    text('health',`${health} / 3`);
    if(hudCache.hp!==health){$('health').setAttribute('aria-label',`체력 ${health} / 3`);$('health-fill').style.width=`${health/3*100}%`;hudCache.hp=health;}
    text('distance',`${Math.floor(distance)} m`);
    for(const [id,remaining,label]of [['boost',boostRemaining,'가속'],['giant',giantRemaining,'거대화']]){
      const seconds=Math.ceil(remaining),visible=remaining>0;
      if(hudCache[id+'Visible']!==visible){$(id).hidden=!visible;hudCache[id+'Visible']=visible;}
      text(id+'-time',`${seconds}초`);
      if(hudCache[id+'Aria']!==seconds){$(id).setAttribute('aria-label',`${label} 남은 시간 ${seconds}초`);hudCache[id+'Aria']=seconds;}
    }
  }
  function syncPauseIcon() {
    const src = mode === 'paused' && pausedIconReady ? pauseIcons.paused : pauseIcons.running;
    if (pauseIconImage.getAttribute('src') !== src) pauseIconImage.src = src;
    $('pause').setAttribute('aria-pressed', String(mode === 'paused'));
  }
  function panel(name) {
    $('overlay').hidden = !name;
    for (const n of ['welcome', 'result', 'paused']) $(n).hidden = n !== name;
    syncPauseIcon();
  }
  function start() {
    if (!loaded || $('start').disabled) return;
    score = 0; health = 3; distance = 0; time = 0; runTime = 0;
    spawnIn = .25; patternIndex = 0; invincible = 0; boostRemaining = 0; giantRemaining = 0; visualScale = 1; orangeSequence = 0;
    objects = []; effects = [];
    flyingObstacles = []; giantIntroRemaining = 0; lastGiantStep = -1;
    last=0;
    scoreSpeedFrom = scoreSpeedTarget = 1; scoreSpeedStartedAt = 0;
    resetPatternSelection();
    currentStage = 0; nextBrushAt = 14; nextGiantAt = 24; obstacleChoices = {single:0,double:0};
    Object.assign(player, { y: GROUND - player.h, vy: 0, grounded: true, land: 0, jumps: 0 });
    mode = 'running'; panel(null); canvas.focus({preventScroll:true}); $('pause').disabled = false;
    $('pause').setAttribute('aria-label', '일시 정지');
    hud(); $('status').textContent = '달리기 시작. 체력 3.';
  }
  function pause() {
    last=0;
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
    if (!level.index) return DIFFICULTY[0].speed;
    const t = Math.max(0, Math.min(1, (at-level.start)/SPEED_RAMP_SECONDS));
    return DIFFICULTY[level.index-1].speed + (level.speed-DIFFICULTY[level.index-1].speed)*t*t*(3-2*t);
  }
  function scoreFactorFor(points) { return points >= 10000 ? 1.30 : points >= 5000 ? 1.15 : 1; }
  function scoreSpeed(at = time) {
    const t = Math.max(0, Math.min(1, (at-scoreSpeedStartedAt)/SCORE_RAMP_SECONDS));
    return scoreSpeedFrom + (scoreSpeedTarget-scoreSpeedFrom)*t*t*(3-2*t);
  }
  function syncScoreSpeed() {
    const target = scoreFactorFor(score);
    if (target === scoreSpeedTarget) return;
    scoreSpeedFrom = scoreSpeed(); scoreSpeedTarget = target; scoreSpeedStartedAt = time;
  }
  function brushFactor(remaining = boostRemaining) {
    const t = Math.max(0, Math.min(1, remaining/.25));
    return 1 + (BOOST_FACTOR-1)*t*t*(3-2*t);
  }
  function jumpRate(remaining = boostRemaining, at = time) {
    const base = SPEED*difficultySpeed(at)*scoreSpeed(at);
    const normal = Math.min(viewportSpeedCap,base);
    return normal > 0 ? Math.min(viewportSpeedCap,base*brushFactor(remaining))/normal : 1;
  }
  function predictTravel(seconds, at = time, boost = boostRemaining, pointsFactor = null) {
    const steps = Math.max(1, Math.ceil(seconds/.02)), dt = seconds/steps;
    let travel = 0;
    for(let i=0;i<steps;i++) {
      const t=(i+.5)*dt;
      travel += Math.min(viewportSpeedCap,SPEED*difficultySpeed(at+t)*(pointsFactor ?? scoreSpeed(at+t))*brushFactor(Math.max(0,boost-t)))*dt;
    }
    return travel;
  }
  function arrivalTime(pixels, patternOnly = false) {
    let low=0, high=Math.max(0,pixels)/SPEED+1;
    for(let i=0;i<20;i++) {
      const mid=(low+high)/2;
      if((patternOnly ? predictTravel(mid,time,0,1) : predictTravel(mid))<pixels) low=mid; else high=mid;
    }
    return (low+high)/2;
  }
  function landingGap(previous, next, level, patternOnly = false) {
    const flight=previous.kind==='double'?DOUBLE_FLIGHT:SINGLE_FLIGHT;
    const minSpeed=Math.min(viewportSpeedCap,SPEED*difficultySpeed()*(patternOnly?1:scoreSpeed()));
    const approach=Math.max(0,(previous.center??worldWidth+60)-(player.x+player.w/2))/minSpeed;
    const horizon=approach+flight+level.recovery+next.lead+.15;
    // Reserve only reachable score milestones in the queued coins plus this
    // existing group (at most four six-coin arcs). No new obstacle recipe.
    const queuedPoints=objects.reduce((sum,o)=>sum+(o.type==='orange'&&!o.hit?100:0),0);
    const possibleScoreFactor=patternOnly?1:scoreFactorFor(score+queuedPoints+24*100);
    const maxSpeed=Math.min(viewportSpeedCap,SPEED*difficultySpeed(time+horizon)*Math.max(patternOnly?1:scoreSpeed(time+horizon),possibleScoreFactor));
    const original=maxSpeed*(flight+level.recovery+next.lead)-minSpeed*previous.lead+SPACING_MARGIN+level.extra;
    if(patternOnly)return original; // Keep the existing internal collectible shape.
    // Obstacle geometry is a baseline world-distance rule. Item state, item
    // expiry and uncollected brushes must never expand or reschedule it.
    const leadSpeed=minSpeed;
    const physicalMinimum=maxSpeed*(flight+MIN_LANDING_RECOVERY+next.lead)-leadSpeed*previous.lead+18;
    return Math.max(original*OBSTACLE_GAP_FACTOR,physicalMinimum);
  }
  function spawn() {
    const level = difficultyAt();
    const selection = selectPattern(level);
    const straightY=selection.obstacles.every(visible=>!visible)?(selection.lineY ?? GROUND-50):null;
    const recipe = selection.recipe.map(kind=>kind==='double'&&time<10?'single':kind);
    const baseAnchor=worldWidth+60;
    let anchor=patternIndex===0 ? Math.min(baseAnchor,player.x+player.w/2+SPEED*2) : baseAnchor;
    const nodes=[];
    for(let i=0;i<recipe.length;i++) {
      const kind = recipe[i];
      const lead = kind==='double' ? [.52,.54,.56][(patternIndex+i)%3] : [.33,.36,.39][(patternIndex+i)%3];
      const node = {kind, lead, center:anchor, patternCenter:anchor, obstacle:selection.obstacles[i]};
      if(nodes.length) {
        const previous = nodes.at(-1);
        node.center = previous.center+landingGap(previous,node,level);
        node.patternCenter = previous.patternCenter+landingGap({...previous,center:previous.patternCenter},node,level,true);
      }
      nodes.push(node);
    }
    const created=[];
    const lastArc=[];
    for(const node of nodes) {
      if(node.kind==='flat') continue;
      const variants=OBSTACLES.filter(o=>o.kind===node.kind);
      const descriptor=variants[obstacleChoices[node.kind]++ % variants.length];
      if(!descriptor || !images[descriptor.path]) continue;
      const img=images[descriptor.path], h=descriptor.height;
      const bounds=descriptor.fitVisible?alphaBounds[descriptor.path]:{w:1,h:1};
      const w=h*img.naturalWidth*bounds.w/(img.naturalHeight*bounds.h);
      const obstacle={type:'obstacle',path:descriptor.path,core:descriptor.core,
        x:node.center-w/2,y:GROUND-h,w,h,hit:false,pattern:node.kind,
        lead:node.lead,stage:level.index,group:patternIndex,order:created.length};
      if(descriptor.fitVisible)obstacle.fitVisible=true;
      // Keep the virtual obstacle for the existing coin exclusion/slot rules.
      // Bonus/rest only omit its display/collision; coin coordinates do not change.
      created.push(obstacle); if(node.obstacle) objects.push(obstacle);
    }
    const firstCoin=objects.length;
    for(const node of nodes) {
      const reaches=arrivalTime(node.patternCenter-(player.x+player.w/2),true);
      const jumpAt=Math.max(0,reaches-node.lead);
      const at=time+jumpAt;
      // Fixed world spacing: only the original time-based speed shapes the arc.
      const approach=predictTravel(node.lead,at,0,1);
      const samples=node.kind==='flat' ? [0,.17,.34,.51,.68,.85] :
        node.kind==='double' ? [.16,.28,.42,.56,.70,.84] : [.10,.22,.34,.46,.58];
      for(const t of samples) {
        const path=asset.items[orangeSequence%asset.items.length]; if(!images[path]) continue;
        const x=node.kind==='flat' ? node.center+predictTravel(t,at,0,1) : node.center+predictTravel(t,at,0,1)-approach;
        const y=node.kind==='flat' ? GROUND-48 : GROUND+jumpOffset(t,node.kind==='double')-player.h/2;
        const orange={type:'orange',path,x:x-18,y:Math.max(90,Math.min(GROUND-38,y-18)),w:36,h:36,hit:false,phase:orangeSequence*.7,pattern:node.kind};
        if(created.some(o=>overlap({...orange,y:orange.y-5,h:orange.h+10},o))) continue;
        objects.push(orange); if(node === nodes.at(-1)) lastArc.push(orange); orangeSequence++;
      }
    }
    // Retain every old X slot and exclusion decision; flatten Y only after
    // the existing arc builder has finished. No phantom obstacle gaps in a line.
    if(straightY!==null)for(let i=firstCoin;i<objects.length;i++){
      objects[i].y=straightY-18; objects[i].straight=true;
    }
    const lastNode=nodes.at(-1);
    // A rare replacement, never an additional spawn. Cooldowns are the original
    // 36s / 48s minimums, and only reset after a replacement actually occurs.
    const finalCore = created.length ? hitRect(created.at(-1)) : null;
    // A brush uses an existing late slot after this obstacle's collision core.
    // Its immediate acceleration must not pull the player into the same jump.
    const brushSlots = lastArc.filter(slot => !finalCore || slot.x > finalCore.x+finalCore.w+player.w);
    const ready = ['brush','giant'].filter(type => images[asset[type][0]] &&
      time >= (type === 'brush' ? nextBrushAt : nextGiantAt) && (type !== 'brush' || brushSlots.length));
    // Keep the old arcs and every remaining orange exactly where they were.
    // Use the final arc so a brush cannot accelerate earlier in-group jumps.
    if (ready.length && lastArc.length && Math.random() < .25) {
      const type = ready[Math.floor(Math.random()*ready.length)];
      const slots = type === 'brush' ? brushSlots : lastArc;
      const slot = slots[Math.floor(Math.random()*slots.length)];
      Object.assign(slot, {type, path:asset[type][0]});
      if (type === 'brush') nextBrushAt = time + 36;
      else nextGiantAt = time + 48;
    }
    // The same baseline world-distance spacing applies before/after a pickup.
    const after=lastNode.kind==='flat' ? 1000+level.extra : landingGap(lastNode,{lead:.56},level);
    patternIndex++;
    spawnIn=(lastNode.center-anchor+after+Math.max(0,anchor-baseAnchor))/SPEED;
  }

  function spriteRect(o) {
    const img = images[o.path];
    if (!img) return { x: o.x, y: o.y, w: o.w, h: o.h };
    const bounds = o.type === 'obstacle' && !o.fitVisible ? { x:0,y:0,w:1,h:1 } : (alphaBounds[o.path] || {x:0,y:0,w:1,h:1});
    const scale = Math.min(o.w / (img.naturalWidth * bounds.w), o.h / (img.naturalHeight * bounds.h));
    const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
    const bob = o.type === 'orange' && !o.straight ? Math.sin(time * 3 + o.phase) * 3 : 0;
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
    return Math.min(viewportSpeedCap/SPEED, MAX_SPEED/SPEED, difficultySpeed()*scoreSpeed()*brushFactor());
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
    flyingObstacles = []; giantIntroRemaining = 0; lastGiantStep = -1;
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
    const frame = characterGeometry();
    if (!frame) return null;
    const a = alphaBounds[frame.path];
    return {x:frame.x+a.x*frame.w,y:frame.y+a.y*frame.h,w:a.w*frame.w,h:a.h*frame.h};
  }
  function giantTouches(o, box) {
    if (!box || !collides(box,o)) return false;
    const frame=characterGeometry(), body=masks[frame.path], obstacle=masks[o.path];
    if (!body || !obstacle) return false;
    const r=spriteRect(o), core=hitRect(o);
    const left=Math.max(box.x,core.x), right=Math.min(box.x+box.w,core.x+core.w);
    const top=Math.max(box.y,core.y), bottom=Math.min(box.y+box.h,core.y+core.h);
    // Sample the visible intersection, not an expanded forward reach. At most
    // half a logical pixel separates samples; transparent hat/robe gaps do not hit.
    const opaque=(mask,rect,x,y)=>{
      const px=Math.floor((x-rect.x)/rect.w*mask.width),py=Math.floor((y-rect.y)/rect.h*mask.height);
      return px>=0&&px<mask.width&&py>=0&&py<mask.height&&mask.data[(py*mask.width+px)*4+3]>=96;
    };
    for(let y=top+.125;y<bottom;y+=.5)for(let x=left+.125;x<right;x+=.5){
      if(opaque(body,frame,x,y)&&opaque(obstacle,r,x,y))return true;
    }
    return false;
  }
  function advance(realDt, factor) {
    const runDt = realDt * factor;
    const jumpDt = realDt * jumpRate();
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
      player.y += player.vy * jumpDt + .5 * GRAVITY * jumpDt * jumpDt; player.vy += GRAVITY * jumpDt;
    }
    if (player.y + player.h >= GROUND) {
      if (!player.grounded) player.land = .14;
      player.y = GROUND - player.h; player.vy = 0; player.grounded = true; player.jumps = 0;
    }
    // spawnIn is remaining distance / SPEED, not a wall-clock cooldown.
    // Decrement by exactly the same travel as every moving object.
    spawnIn -= runDt;
    if (spawnIn <= 0) {
      const remainder=spawnIn, firstNew=objects.length;
      spawn();
      spawnIn+=remainder; // Preserve distance crossed beyond the scheduled point.
      const beforeSpawn=runDt+remainder;
      for(let i=firstNew;i<objects.length;i++)objects[i].x+=SPEED*beforeSpawn;
    }
    const damageBox = { x: player.x + 18, y: player.y + 15, w: player.w - 32, h: player.h - 20 };
    const pickupBox = collectionBox();
    for (const o of objects) o.x -= SPEED * runDt;
    // Resolve pickups first: a book collected on the same step grants immunity immediately.
    for (const o of objects) {
      if (o.type==='obstacle' || o.hit || !collides(pickupBox,o)) continue;
      if (o.type==='orange') {
        o.hit=true; score+=100; syncScoreSpeed(); collectEffect(100);
      } else if(o.type==='brush') {
        o.hit=true; boostRemaining=BOOST_SECONDS;
        $('status').textContent='붓 획득. 5초 가속!';
      } else if(o.type==='giant') {
        o.hit=true; giantRemaining=GIANT_SECONDS; giantIntroRemaining=.3; invincible=0; lastGiantStep=-1;
        $('status').textContent='과거 책 획득. 5초 거대화!';
      }
    }
    const giantBox=giantRemaining>0?destructionBox():null;
    for (const o of objects) {
      if (o.type!=='obstacle' || (o.hit && giantRemaining<=0) || o.destroyed || !(giantRemaining>0 ? giantTouches(o,giantBox) : collides(damageBox,o))) continue;
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
    // up to MAX_SPEED and split exactly at item expiration boundaries.
    // Only brush acceleration compresses the jump clock; score/time keep their
    // original physics. Heights and the two-input limit remain unchanged.
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
    ctx.filter='none';
    if(!tiles.length){ctx.fillStyle='#d9ecfa';ctx.fillRect(0,0,worldWidth,H);return;}
    const scaleX=canvas.width/worldWidth,scaleY=canvas.height/H;
    const key=[canvas.height,scaleX,canvasPixelRatio,BACKGROUND_STYLE.blurPx,BACKGROUND_STYLE.saturation,BACKGROUND_STYLE.contrast,...tiles.map(t=>t.path)].join('|');
    if(key!==backgroundCacheKey){
      const blur=Math.max(0,BACKGROUND_STYLE.blurPx)*canvasPixelRatio,padding=Math.ceil(blur*4)+2;
      backgroundPeriod=tiles.reduce((sum,t)=>sum+t.width,0);backgroundPeriodPixels=backgroundPeriod*scaleX;
      const width=Math.ceil(backgroundPeriodPixels),height=canvas.height;
      backgroundLayer.width=width+padding*2;backgroundLayer.height=height+padding*2;
      backgroundCtx.filter='none';backgroundCtx.fillStyle='#d9ecfa';backgroundCtx.fillRect(0,0,backgroundLayer.width,backgroundLayer.height);
      backgroundCtx.setTransform(scaleX,0,0,scaleY,padding,padding);
      backgroundCtx.imageSmoothingEnabled=true;backgroundCtx.imageSmoothingQuality='high';
      const padX=padding/scaleX,padY=padding/scaleY;
      for(let cycle=-1;cycle<=1;cycle++){let x=cycle*backgroundPeriod;for(const tile of tiles){
        if(x<backgroundPeriod+padX&&x+tile.width>-padX){const im=tile.image;backgroundCtx.drawImage(im,x,0,tile.width,H);backgroundCtx.drawImage(im,0,0,im.naturalWidth,1,x,-padY,tile.width,padY);backgroundCtx.drawImage(im,0,im.naturalHeight-1,im.naturalWidth,1,x,H,tile.width,padY);}x+=tile.width;
      }}
      // Two physical guard pixels retain periodic neighbors during bilinear sampling.
      backgroundCache.width=width+4;backgroundCache.height=height;
      try{backgroundCacheCtx.filter=`blur(${blur}px) saturate(${BACKGROUND_STYLE.saturation}) contrast(${BACKGROUND_STYLE.contrast})`;backgroundCacheCtx.drawImage(backgroundLayer,-padding+2,-padding);}
      finally{backgroundCacheCtx.filter='none';}
      backgroundCacheKey=key;
    }
    // Reuse the filtered period at fractional scroll coordinates; no per-frame blur.
    const offset=((distance*20*.65)%backgroundPeriod+backgroundPeriod)%backgroundPeriod,guard=2/scaleX;
    for(let x=-offset;x<worldWidth;x+=backgroundPeriod)ctx.drawImage(backgroundCache,0,0,backgroundPeriodPixels+4,backgroundCache.height,x-guard,0,backgroundPeriod+guard*2,H);
    ctx.filter='none';
  }

  function sparkle(x, y, size, alpha) {
    ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = '#fff5c3'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - size, y); ctx.lineTo(x + size, y);
    ctx.moveTo(x, y - size); ctx.lineTo(x, y + size); ctx.stroke(); ctx.restore();
  }
  function cachedCollectible(o) {
    const silhouette=silhouettes[o.path],img=images[o.path];
    if(!silhouette||!img)return null;
    const scale=canvas.width/worldWidth;
    if(scale!==collectibleScale){collectibleCache.clear();collectibleScale=scale;}
    const key=o.path+'|'+o.w+'|'+o.h;
    if(collectibleCache.has(key))return collectibleCache.get(key);
    const pad=3,c=document.createElement('canvas');c.width=Math.ceil((o.w+pad*2)*scale);c.height=Math.ceil((o.h+pad*2)*scale);
    const t=c.getContext('2d');t.setTransform(scale,0,0,scale,pad*scale,pad*scale);t.imageSmoothingQuality='high';
    const r=spriteRect({...o,x:0,y:0,phase:-time*3});
    for(const[dx,dy]of [[-1.25,0],[1.25,0],[0,-1.25],[0,1.25],[-.9,-.9],[.9,.9]])t.drawImage(silhouette,r.x+dx,r.y+dy,r.w,r.h);
    t.drawImage(img,r.x,r.y,r.w,r.h);
    const cached={canvas:c,pad,w:c.width/scale,h:c.height/scale};collectibleCache.set(key,cached);return cached;
  }
  function warmCollectibles() {
    for(const path of asset.items)cachedCollectible({type:'orange',path,w:36,h:36});
    for(const type of ['brush','giant'])cachedCollectible({type,path:asset[type][0],w:40,h:46});
  }
  function drawObject(o) {
    if(o.x>worldWidth+32 || o.x+o.w<-32)return;
    const r = spriteRect(o);
    if (o.type === 'orange' || o.type === 'brush' || o.type === 'giant') {
      const cached=cachedCollectible(o);
      if(cached){
        const bob=o.type==='orange'&&!o.straight?Math.sin(time*3+o.phase)*3:0;
        ctx.drawImage(cached.canvas,o.x-cached.pad,o.y+bob-cached.pad,cached.w,cached.h);
      }else{
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
    const dt=last?Math.max(0,(now-last)/1000):0;last=now;
    // A long stall is a pause, never a giant catch-up jump or a dropped collision.
    if(mode==='running'){if(dt>MAX_FRAME_DELTA+1e-6)pause();else update(Math.min(dt,MAX_FRAME_DELTA));}
    render(); requestAnimationFrame(frame);
  }
 hud();requestAnimationFrame(frame);
})();
