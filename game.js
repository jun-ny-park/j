(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const canvas = $('game');
  const ctx = canvas.getContext('2d');
  // Background only. Blur is measured in CSS pixels; 1 is unchanged color strength.
  const BACKGROUND_STYLE = { blurPx: 1.25, saturation: .94, contrast: .94 };
  const backgroundLayer = document.createElement('canvas');
  const backgroundCtx = backgroundLayer.getContext('2d');
  const asset = {
    backgrounds: ['assets/backgrounds/bbaakk1.jpg'],
    characters: [1, 2, 3, 4, 5, 6, 7, 8, 9].map(n =>
      `assets/characters/${n === 1 ? '캐릭어' : '캐릭터'}이미지${n}.png`),
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
  const SPEED = 306; // +17.69% from 260. Brush speed is exactly 459.
  const BOOST_SECONDS = 5, GIANT_SECONDS = 5, BOOST_FACTOR = 1.5;
  const player = { x: 106, y: 363, w: 74, h: 98, vy: 0, grounded: true, land: 0, jumps: 0 };
  let loaded = false, mode = 'loading', score = 0, health = 3;
  let distance = 0, time = 0, runTime = 0, spawnIn = .5, invincible = 0;
  let boostRemaining = 0, giantRemaining = 0, visualScale = 1, orangeSequence = 0, objects = [], effects = [], last = 0;
  let worldWidth = 1100, tiles = [], patternIndex = 0;
  let canvasPixelRatio = 1;
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
    // Runtime-only silhouette; original PNG files stay unchanged.
    t.globalCompositeOperation = 'source-in';
    t.fillStyle = '#fff4d9'; t.fillRect(0, 0, c.width, c.height);
    silhouettes[path] = c;
  }

  Promise.all(paths.map(path => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      images[path] = img;
      if (asset.items.includes(path) || asset.brush.includes(path) || asset.giant.includes(path) || obstaclePaths.includes(path)) {
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
    spawnIn = .5; patternIndex = 0; invincible = 0; boostRemaining = 0; giantRemaining = 0; visualScale = 1; orangeSequence = 0;
    objects = []; effects = [];
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
  for (const el of [canvas, $('jump')]) el.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
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
  function spawn() {
    const kind = ['flat', 'single', 'flat', 'double'][patternIndex % 4];
    const anchor = worldWidth + 40;
    const variants = OBSTACLES.filter(o => o.kind === kind);
    const descriptor = variants[Math.floor(patternIndex / 4) % variants.length];
    let obstacle = null;
    if (descriptor && images[descriptor.path]) {
      const img = images[descriptor.path], h = descriptor.height, w = h * img.naturalWidth / img.naturalHeight;
      obstacle = { type: 'obstacle', path: descriptor.path, core: descriptor.core,
        x: anchor + SPEED * (kind === 'double' ? .5 : .355) - w / 2,
        y: GROUND - h, w, h, hit: false, pattern: kind };
      objects.push(obstacle);
    }
    const times = kind === 'double' ? [.13, .23, .37, .49, .61, .74, .88] :
      kind === 'single' ? [.12, .22, .32, .42, .52, .62] : [0, .17, .34, .51, .68, .85];
    for (let i = 0; i < times.length; i++) {
      const t = times[i], path = asset.items[orangeSequence % asset.items.length];
      if (!images[path]) continue;
      const centerY = kind === 'flat' ? GROUND - 48 : GROUND + jumpOffset(t, kind === 'double') - player.h / 2;
      const o = { type: 'orange', path, x: anchor + SPEED * t - 18,
        y: Math.max(90, Math.min(GROUND - 38, centerY - 18)), w: 36, h: 36, hit: false, phase: i * .7, pattern: kind };
      if (!obstacle || !overlap({ ...o, y: o.y - 5, h: o.h + 10 }, obstacle)) { objects.push(o); orangeSequence++; }
    }
    // An occasional, ground-accessible brush, separated from the jump trails.
    if (kind === 'flat' && patternIndex % 12 === 4 && images[asset.brush[0]]) {
      objects.push({ type: 'brush', path: asset.brush[0], x: anchor + SPEED * 1.2 - 19,
        y: GROUND - 80, w: 38, h: 47, hit: false, phase: 0, pattern: kind });
    }
    if (kind === 'flat' && patternIndex % 8 === 0 && images[asset.giant[0]]) {
      objects.push({ type: 'giant', path: asset.giant[0], x: anchor + SPEED * 1.65 - 20,
        y: GROUND - 80, w: 40, h: 46, hit: false, phase: 0, pattern: kind });
    }
    patternIndex++; spawnIn = 2.9;
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
    const t = Math.min(1, boostRemaining / .25);
    return 1 + (BOOST_FACTOR - 1) * t * t * (3 - 2 * t);
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
    $('pause').disabled = true; $('final-score').textContent = score.toLocaleString('ko-KR');
    panel('result'); $('status').textContent = `게임 오버. 최종 점수 ${score}.`;
  }
  function advance(realDt, factor) {
    const runDt = realDt * factor;
    time += realDt; runTime += runDt;
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
      player.y += player.vy * runDt + .5 * GRAVITY * runDt * runDt; player.vy += GRAVITY * runDt;
    }
    if (player.y + player.h >= GROUND) {
      if (!player.grounded) player.land = .14;
      player.y = GROUND - player.h; player.vy = 0; player.grounded = true; player.jumps = 0;
    }
    spawnIn -= runDt; if (spawnIn <= 0) spawn();
    const box = { x: player.x + 18, y: player.y + 15, w: player.w - 32, h: player.h - 20 };
    for (const o of objects) {
      o.x -= SPEED * runDt;
      if (o.hit || !collides(box, o)) continue;
      if (o.type === 'orange') {
        o.hit = true; score += 100; collectEffect(100);
      } else if (o.type === 'brush') {
        o.hit = true; boostRemaining = BOOST_SECONDS;
        $('status').textContent = '붓 획득. 5초 가속!';
      } else if (o.type === 'giant') {
        o.hit = true; giantRemaining = GIANT_SECONDS;
        $('status').textContent = '과거 책 획득. 5초 거대화!';
      } else if (o.type === 'obstacle' && invincible <= 0) {
        o.hit = true; health--; invincible = 1.4;
        $('status').textContent = `장애물 충돌. 체력 ${health}.`;
        if (health === 0) { endGame(); break; }
      }
    }
    objects = objects.filter(o => o.x + o.w > -50 && !(o.hit && o.type !== 'obstacle'));
    for (const e of effects) { e.life -= realDt; e.y -= realDt * 22; }
    effects = effects.filter(e => e.life > 0).slice(-4);
  }
  function update(dt) {
    if (mode !== 'running') return;
    // Real-time boost clock and movement clock are separate. Small steps avoid tunnelling
    // at 459px/s and split exactly at the 5-second expiration boundary.
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
  function character() {
    const index = mode === 'over' ? 6 : invincible > 1.05 ? 5 : !player.grounded ? (player.vy < 0 ? 7 : 0) :
      [0, 1, 2, 3, 4, 8][Math.floor(runTime * 9 * SPEED / 260) % 6];
    const scale = player.land > 0 ? 1 - .06 * Math.sin(player.land / .14 * Math.PI) : 1;
    const h = player.h * scale * visualScale, w = player.w * scale * visualScale;
    const blink = mode === 'running' && invincible > 0 && Math.floor(invincible * 11) % 2 ? .45 : 1;
    if (boostRemaining > 0) {
      for (let i = 0; i < 3; i++) {
        const phase = time * 4 + i * 2.1;
        sparkle(player.x - 6 - i * 10, player.y + 25 + (Math.sin(phase) + 1) * 24, 2.5, .45);
      }
    }
    draw(asset.characters[index], player.x + (player.w - w) / 2, player.y + player.h - h, w, h, blink);
  }
  function render() {
    ctx.setTransform(canvas.width / worldWidth, 0, 0, canvas.height / H, 0, 0);
    ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high'; background();
    for (const o of objects) if (o.type === 'obstacle') drawObject(o);
    character();
    // Collectibles always render in the foreground, after background and hazards.
    for (const o of objects) if (o.type !== 'obstacle') drawObject(o);
    for (const e of effects) {
      if (e.type === 'collect') {
        ctx.save(); ctx.globalAlpha = Math.min(1, e.life / .12); ctx.fillStyle = '#805232';
        ctx.font = '22px "Gamja Flower", cursive'; ctx.fillText(`+${e.amount}`, e.x, e.y); ctx.restore();
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
