/* ============================================================================
 * stage.js — Ogasawara Rehearsal · Tier 2 Canvas 2D stage (CLAUDE.md §21).
 * One plain file, vanilla ES5, no library (§11). Draws the WHOLE scene each
 * frame from deterministic sim state (window.PRS) + the interpolated position
 * caches handed in via `view`. Rendering only READS — it never writes to sim.
 * Coordinates: all drawing is in CSS px (the DPR transform is applied once in
 * initStage/resizeStage); station/engine positions are normalized [0..1] and
 * scale by view.w / view.h — the same normalized×w/h math the DOM stage used.
 * ==========================================================================*/
(function () {
  'use strict';
  var P = window.PRS;

  // =========================================================================
  // Module render state (set by initStage / resizeStage; scene() refreshes lang)
  // =========================================================================
  var _canvas = null, _ctx = null, _dims = { w: 0, h: 0 }, _dpr = 1;
  var _lang = 'en';                       // refreshed from view.lang at the top of scene()

  // =========================================================================
  // PORTED CONSTANTS — single source of truth for the canvas scene.
  // (Values ported verbatim from app.js / style.css; do NOT re-derive.)
  // =========================================================================

  // 8 road segments between stations (app.js:791)
  var ADJ = [['command', 'port'], ['command', 'clinic'], ['command', 'finance'], ['command', 'lodging'],
             ['port', 'vessel'], ['lodging', 'mess'], ['mess', 'finance'], ['finance', 'clinic']];

  // boat quadratic bay-arc anchors, normalized (app.js:799): pos = qbez(DOCK, BOATC, SEA, param)
  var DOCK = { x: 0.155, y: 0.52 }, SEA = { x: 0.05, y: 0.93 }, BOATC = { x: 0.01, y: 0.66 };

  // ambient life counts + hush radius² in normalized coords (app.js:800)
  var GULLS = 3, FISH = 3, HUSH_R2 = 0.032;

  // duty-holder states that count as "stalled" (feed hotPts / hush / name reveal) (app.js:801)
  var STALL_STATES = { confused: 1, meeting: 1, waiting: 1, tired: 1, onFire: 1, waitInfo: 1, rework: 1 };

  // guest coat palette, washi-friendly (app.js:802)
  var YUKATA = ['#3d5a6c', '#7c4a5a', '#5b6b45', '#a3823c'];

  // participant state → speech-bubble emoji (app.js:93); '' = no bubble
  var BUB = { confused: '❓', meeting: '💬', waiting: '⏳', tired: '😣', onFire: '🔥',
              resolved: '✅', working: '', idle: '', waitInfo: '⏳', rework: '🔁' };

  // day-phase sky table (app.js:1176-1187): [clockMin, topRGB, horizonRGB, alpha]
  var SKY = [
    [240, [13, 19, 38], [24, 32, 52], 0.52],     // 04:00 pre-dawn dark
    [300, [24, 28, 52], [88, 52, 64], 0.44],     // 05:00 first light
    [330, [44, 38, 66], [196, 100, 74], 0.38],   // 05:30 dawn rose
    [420, [52, 68, 94], [232, 166, 96], 0.25],   // 07:00 sunrise gold — the boat departs into it
    [600, [64, 96, 126], [126, 154, 172], 0.15], // 10:00 morning
    [780, [74, 108, 138], [148, 170, 184], 0.11],// 13:00 midday (lightest)
    [960, [70, 92, 118], [204, 154, 92], 0.19],  // 16:00 the cook block begins — light turns
    [1080, [56, 54, 88], [226, 114, 62], 0.32],  // 18:00 dinner sunset
    [1140, [28, 32, 58], [124, 64, 74], 0.44],   // 19:00 dusk
    [1200, [12, 18, 36], [22, 30, 50], 0.52]     // 20:00 night
  ];
  var SKY_MIN = 240, SKY_MAX = 1200;             // updateSky clamps clockMin to this range

  // night threshold (app.js:1205): lanterns on when clockMin < 330 || >= 1110
  var NIGHT_END_MIN = 330, NIGHT_START_MIN = 1110;

  // figure state → foot-aura (style.css:307-312). rgb = the radial-gradient centre colour,
  // a = its centre alpha, op = the layer opacity, pulse = the CSS pulse animation.
  var AURA_RED = '217,83,79', AURA_AMBER = '193,122,31', AURA_BLUE = '92,127,146', AURA_GREEN = '124,143,92';
  var STATE_AURA = {
    confused: { rgb: AURA_RED,   a: 0.6, op: 1,   pulse: false },
    onFire:   { rgb: AURA_RED,   a: 0.6, op: 1,   pulse: true  },
    waiting:  { rgb: AURA_AMBER, a: 0.6, op: 1,   pulse: false },
    waitInfo: { rgb: AURA_AMBER, a: 0.6, op: 1,   pulse: false },
    meeting:  { rgb: AURA_BLUE,  a: 0.6, op: 1,   pulse: false },
    rework:   { rgb: AURA_BLUE,  a: 0.6, op: 1,   pulse: true  },
    resolved: { rgb: AURA_GREEN, a: 0.6, op: 0.8, pulse: false }
  };
  // whole-figure opacity by state (style.css:316-318); default 1
  var STATE_DIM = { tired: 0.8, waitInfo: 0.92, idle: 0.55 };

  // station territory tint (style.css:370-377). rgb/a = halo radial centre, op = halo
  // opacity, border = the icon-disc border colour that replaces the default gold.
  var TERR = {
    green: { rgb: '91,107,69',  a: 0.48, op: 0.85, border: '#7c8f5c' },
    amber: { rgb: '193,122,31', a: 0.52, op: 0.95, border: '#c17a1f' },
    red:   { rgb: '161,61,47',  a: 0.58, op: 1,    border: '#a13d2f' }
  };

  // effect durations, ms (CSS class + setTimeout effects → timed pooled entries, §21.3)
  var DUR = { ping: 560, strike: 340, bubpop: 220, wake: 900,
              moteMin: 650, moteMax: 1550, cascadeHop: 1000, cascadeRest: 900, trailKeep: 300 };

  // washi/lacquer palette as 'r,g,b' strings (style.css :root) — use with rgba(PAL.x, a)
  var PAL = {
    gold: '227,196,107',       // --accent-light #e3c46b (foam, lanterns, wakes, spotlight)
    goldDeep: '184,137,43',    // --accent #b8892b (lines, chip borders at .25/.48)
    hanko: '161,61,47',        // --wait #a13d2f (critical red)
    redBright: '217,83,79',    // cascade comet / onFire aura core
    amber: '193,122,31',       // --idle #c17a1f
    moss: '91,107,69',         // --build #5b6b45
    mossLight: '124,143,92',   // --build-light #7c8f5c
    seaInk: '61,90,108',       // --leader #3d5a6c
    ink: '36,29,21',           // --ink #241d15
    washi: '246,239,220',      // --bg1 #f6efdc (chip backgrounds at .92)
    indigo: '35,47,58',        // --indigo #232f3a
    indigoDeep: '20,27,34',    // --indigo-deep #141b22
    seaDeep: '29,58,82',       // .water top #1d3a52
    seaMid: '42,74,100',       // .water mid rgba(42,74,100,.85)
    skin: '233,207,164'        // figure head #e9cfa4
  };

  // =========================================================================
  // SHARED HELPERS — every draw layer uses these; do not re-implement locally.
  // =========================================================================

  // engine-style bilingual name: entity objects carry {en, jp} (NOT ja) — app.js:14 parity
  function nm(o) {
    if (!o) return '';
    if (typeof o === 'string') return o;
    return (_lang === 'ja' ? o.jp : o.en) || o.en || '';
  }

  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function smoothstep(k) { k = clamp(k, 0, 1); return k * k * (3 - 2 * k); }   // the app's e = k*k*(3-2*k)
  function rgba(rgb, a) { return 'rgba(' + rgb + ',' + a + ')'; }              // rgb = 'r,g,b' string
  function mixRGB(a, b, k) {                                                   // a,b = [r,g,b] arrays → 'r,g,b'
    return Math.round(a[0] + (b[0] - a[0]) * k) + ',' +
           Math.round(a[1] + (b[1] - a[1]) * k) + ',' +
           Math.round(a[2] + (b[2] - a[2]) * k);
  }
  // scalar quadratic bezier (boat arc): qbez(DOCK.x, BOATC.x, SEA.x, param)
  function qbez(a, c, b, k) { var u = 1 - k; return u * u * a + 2 * u * k * c + k * k * b; }
  // normalized station/engine coords → CSS px
  function px(nx, view) { return nx * view.w; }
  function py(ny, view) { return ny * view.h; }
  function stationPx(st, view) { return { x: st.x * view.w, y: st.y * view.h }; }
  // night check on the minute clock (app.js:1205)
  function isNight(clockMin) { return clockMin < NIGHT_END_MIN || clockMin >= NIGHT_START_MIN; }
  // interpolated sky stop for a clock minute → { top:'r,g,b', hor:'r,g,b', alpha:Number }
  function skyAt(clockMin) {
    var m = clamp(clockMin, SKY_MIN, SKY_MAX), i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= m) i++;
    var a = SKY[i], b = SKY[i + 1], k = clamp((m - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
    return { top: mixRGB(a[1], b[1], k), hor: mixRGB(a[2], b[2], k), alpha: a[3] + (b[3] - a[3]) * k };
  }
  // true when normalized point (nx,ny) is inside HUSH_R2 of any hot point (guest hush)
  function isHushed(nx, ny, hotPts) {
    if (!hotPts) return false;
    for (var i = 0; i < hotPts.length; i++) {
      var dx = nx - hotPts[i].x, dy = ny - hotPts[i].y;
      if (dx * dx + dy * dy < HUSH_R2) return true;
    }
    return false;
  }
  // rounded-rect PATH (no fill/stroke — caller does): safe r clamp, begins a new path
  function roundRect(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); if (r < 0) r = 0;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  // soft radial light-pool / halo: filled circle fading rgb@alpha → transparent
  function radialGlow(ctx, x, y, r, rgbStr, alpha) {
    if (r <= 0 || alpha <= 0) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rgbStr, alpha));
    g.addColorStop(1, rgba(rgbStr, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }
  // contact-shadow ellipse under feet/hulls (rx/ry = radii, centred on x,y)
  function shadowEllipse(ctx, x, y, rx, ry, alpha) {
    if (rx <= 0 || ry <= 0 || alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y); ctx.scale(1, ry / rx);
    ctx.fillStyle = rgba(PAL.indigoDeep, alpha);
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
  // measured chip / label / speech bubble. (x, y) = TOP-CENTRE of the chip box.
  // o (all optional): font, pad (h-padding, default 4), h (box height, default 14),
  // bg, border, ink (colours), r (corner radius, default 2), alpha (whole-chip),
  // tail ('down' → small triangle under the box, i.e. a speech bubble).
  // Returns { w, h } so callers can stack/avoid overlap.
  function chip(ctx, x, y, text, o) {
    o = o || {};
    var font = o.font || '600 10px system-ui,sans-serif';
    var pad = o.pad != null ? o.pad : 4, h = o.h != null ? o.h : 14;
    var r = o.r != null ? o.r : 2;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    ctx.font = font;
    var w = ctx.measureText(text).width + pad * 2, x0 = x - w / 2;
    roundRect(ctx, x0, y, w, h, r);
    ctx.fillStyle = o.bg || rgba(PAL.washi, 0.92);
    ctx.fill();
    ctx.strokeStyle = o.border || rgba(PAL.goldDeep, 0.48);
    ctx.lineWidth = 1;
    ctx.stroke();
    if (o.tail === 'down') {
      ctx.beginPath();
      ctx.moveTo(x - 3, y + h); ctx.lineTo(x, y + h + 4); ctx.lineTo(x + 3, y + h);
      ctx.closePath();
      ctx.fillStyle = o.bg || rgba(PAL.washi, 0.92); ctx.fill();
      ctx.strokeStyle = o.border || rgba(PAL.goldDeep, 0.48); ctx.stroke();
    }
    ctx.fillStyle = o.ink || 'rgb(' + PAL.ink + ')';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + h / 2 + 0.5);
    ctx.restore();
    return { w: w, h: h };
  }

  // =========================================================================
  // CANVAS LIFECYCLE — backing store at dims×dpr, drawing space in CSS px
  // =========================================================================
  function initStage(canvasEl, dims) {
    _canvas = canvasEl;
    _ctx = canvasEl.getContext('2d');
    resizeStage(dims, window.devicePixelRatio || 1);
    return _ctx;
  }
  function resizeStage(dims, dpr) {
    _dpr = dpr || window.devicePixelRatio || 1;
    _dims.w = dims.w; _dims.h = dims.h;
    if (_canvas) {
      _canvas.width = Math.max(1, Math.round(_dims.w * _dpr));
      _canvas.height = Math.max(1, Math.round(_dims.h * _dpr));
      _canvas.style.width = _dims.w + 'px';
      _canvas.style.height = _dims.h + 'px';
    }
    if (_ctx) _ctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
  }

  // =========================================================================
  // SCENE — one clear + full bottom→top redraw per frame (§21.3 draw order).
  // t is SECONDS (float) on the rAF clock: t = ts/1000, the same clock every
  // view t0/timestamp is stamped in (compare t*1000 against them).
  // Layers self-gate: reduced motion via view.rm, minute-mode via sim.mode,
  // guests via view.guestsVisible. Draw functions are spliced in below and
  // hoisted, so scene() may reference them here.
  // =========================================================================
  function scene(ctx, sim, t, view) {
    _lang = view.lang || 'en';
    ctx.clearRect(0, 0, view.w, view.h);
    drawGround(ctx, sim, t, view);     // 1  island base + stipple + vignette + banner ring
    drawSea(ctx, sim, t, view);        // 2  bay water band + foam + shimmer
    drawSeaLife(ctx, sim, t, view);    // 3  gulls + jumping fish (deterministic from t)
    drawRoads(ctx, sim, t, view);      // 4  8 dashed ADJ segments, marching dashes
    drawSky(ctx, sim, t, view);        // 5  day-phase tint UNDER actors (minute-mode only)
    drawGuests(ctx, sim, t, view);     // 6  13 yukata pawns (gated by view.guestsVisible)
    drawBoat(ctx, sim, t, view);       // 7  skiff on the bay arc + pooled wakes
    drawStations(ctx, sim, t, view);   // 8  7 landmarks: halo tint, disc, name, rings, lanterns
    drawFigures(ctx, sim, t, view);    // 9  11 duty-holders: shadow, pawn, aura, bubbles, chips
    drawMotes(ctx, sim, t, view);      // 10 handoff dots A→B + arrival pings
    drawCascade(ctx, sim, t, view);    // 11 red comet + ghosts + strikes (RM: static chain)
  }

  
  // ---- drawGround ----
function drawGround_ellipseBase(ctx, w, h) {
  // .sitemap background: radial-gradient(ellipse at 28% 18%, #1c2733, var(--indigo-deep) 72%) — style.css:222-224
  ctx.fillStyle = rgba(PAL.indigoDeep, 1);
  ctx.fillRect(0, 0, w, h);

  var cx = w * 0.28, cy = h * 0.18;
  var dx = Math.max(cx, w - cx);
  var dy = Math.max(cy, h - cy);
  var k = Math.sqrt((dx / w) * (dx / w) + (dy / h) * (dy / h));
  var rx = k * w, ry = k * h;
  if (!(rx > 0) || !(ry > 0)) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(rx, ry);
  var grad = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  grad.addColorStop(0, 'rgb(28,39,51)');
  grad.addColorStop(0.72, rgba(PAL.indigoDeep, 1));
  ctx.fillStyle = grad;
  ctx.fillRect(-cx / rx, -cy / ry, w / rx, h / ry);
  ctx.restore();
}

function drawGround_ringField(ctx, w, h, cxFrac, cyFrac, period, alpha) {
  // .sitemap::before stipple: repeating-radial-gradient(circle at .., gold 0 1px, transparent 2px period) — style.css:225-229
  var cx = w * cxFrac, cy = h * cyFrac;
  var dx = Math.max(cx, w - cx), dy = Math.max(cy, h - cy);
  var maxR = Math.sqrt(dx * dx + dy * dy);
  ctx.save();
  ctx.strokeStyle = rgba(PAL.gold, alpha);
  ctx.lineWidth = 1.3;
  var r = period;
  while (r <= maxR) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    r += period;
  }
  ctx.restore();
}

function drawGround_vignette(ctx, w, h) {
  // .sitemap::after: box-shadow: inset 0 0 90px 18px rgba(10,14,20,.55) — style.css:231-232
  var rgbStr = '10,14,20', a = 0.55, vg = 18 + 90;
  ctx.save();

  var gTop = ctx.createLinearGradient(0, 0, 0, vg);
  gTop.addColorStop(0, rgba(rgbStr, a));
  gTop.addColorStop(1, rgba(rgbStr, 0));
  ctx.fillStyle = gTop;
  ctx.fillRect(0, 0, w, vg);

  var gBot = ctx.createLinearGradient(0, h, 0, h - vg);
  gBot.addColorStop(0, rgba(rgbStr, a));
  gBot.addColorStop(1, rgba(rgbStr, 0));
  ctx.fillStyle = gBot;
  ctx.fillRect(0, h - vg, w, vg);

  var gLeft = ctx.createLinearGradient(0, 0, vg, 0);
  gLeft.addColorStop(0, rgba(rgbStr, a));
  gLeft.addColorStop(1, rgba(rgbStr, 0));
  ctx.fillStyle = gLeft;
  ctx.fillRect(0, 0, vg, h);

  var gRight = ctx.createLinearGradient(w, 0, w - vg, 0);
  gRight.addColorStop(0, rgba(rgbStr, a));
  gRight.addColorStop(1, rgba(rgbStr, 0));
  ctx.fillStyle = gRight;
  ctx.fillRect(w - vg, 0, vg, h);

  ctx.restore();
}

function drawGround(ctx, sim, t, view) {
  if (!view || !(view.w > 0) || !(view.h > 0)) return;
  var w = view.w, h = view.h;

  // 1. base island radial gradient (style.css .sitemap background)
  drawGround_ellipseBase(ctx, w, h);

  // 2. stipple / dot-noise texture, two overlapping ring fields (style.css .sitemap::before)
  drawGround_ringField(ctx, w, h, 0.22, 0.30, 90, 0.05 * 0.55);
  drawGround_ringField(ctx, w, h, 0.74, 0.72, 110, 0.04 * 0.55);

  // 3. inner vignette (style.css .sitemap::after)
  drawGround_vignette(ctx, w, h);

  // 4. blocked-state inset ring (style.css .sitemap.blocked), gated on sim.bannerOn
  if (sim && sim.bannerOn) {
    ctx.save();
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(PAL.hanko, 0.55);
    ctx.strokeRect(1.5, 1.5, w - 3, h - 3);
    ctx.restore();
  }
}


  // ---- drawSea ----
function drawSea_bayPath(ctx, x0, y0, w, h) {
  // CSS border-radius: 0 52% 34% 0 / 0 46% 30% 0 (h-radii / v-radii, TL TR BR BL)
  // left corners stay square (off-canvas anyway); right corners bulge into the bay silhouette.
  var rtx = w * 0.52, rty = h * 0.46, rbx = w * 0.34, rby = h * 0.30;
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x0 + w - rtx, y0);
  ctx.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + rty);
  ctx.lineTo(x0 + w, y0 + h - rby);
  ctx.quadraticCurveTo(x0 + w, y0 + h, x0 + w - rbx, y0 + h);
  ctx.lineTo(x0, y0 + h);
  ctx.closePath();
}

function drawSea_gradLine(x0, y0, w, h, deg) {
  // convert a CSS gradient angle (0deg = up, 90deg = right, clockwise) into canvas
  // createLinearGradient endpoints spanning the given box, per the standard CSS algorithm.
  var rad = deg * Math.PI / 180, dx = Math.sin(rad), dy = -Math.cos(rad);
  var len = Math.abs(w * dx) + Math.abs(h * dy), half = len / 2;
  var cx = x0 + w / 2, cy = y0 + h / 2;
  return { x1: cx - dx * half, y1: cy - dy * half, x2: cx + dx * half, y2: cy + dy * half };
}

function drawSea(ctx, sim, t, view) {
  if (!view || !view.w || !view.h) return;
  var w = view.w, h = view.h;
  // .water: left:-5% top:17% width:33% height:96% of #sitemap (style.css:333)
  var x0 = -0.05 * w, y0 = 0.17 * h, bw = 0.33 * w, bh = 0.96 * h;

  ctx.save();
  drawSea_bayPath(ctx, x0, y0, bw, bh);
  ctx.clip();

  // angled deep-blue-to-transparent fill (CSS: linear-gradient(100deg, #1d3a52, rgba(42,74,100,.85) 46%,
  // rgba(48,78,102,.45) 72%, rgba(35,47,58,.1) 92%, transparent)) — approximated with PAL stops.
  var gp = drawSea_gradLine(x0, y0, bw, bh, 100);
  var grad = ctx.createLinearGradient(gp.x1, gp.y1, gp.x2, gp.y2);
  grad.addColorStop(0, rgba(PAL.seaDeep, 1));
  grad.addColorStop(0.46, rgba(PAL.seaMid, 0.85));
  grad.addColorStop(0.72, rgba(PAL.seaMid, 0.45));
  grad.addColorStop(0.92, rgba(PAL.indigo, 0.1));
  grad.addColorStop(1, rgba(PAL.indigo, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(x0, y0, bw, bh);

  // inner shadow along the shore edge (CSS inset -6px 0 18px rgba(8,14,22,.5): darkens toward the
  // right/land edge) and the deep-water edge (CSS inset 14px 0 30px rgba(16,42,64,.6): darkens toward
  // the open-sea/left edge) — both approximated with PAL.indigoDeep at matching widths/alphas.
  var shoreShadow = ctx.createLinearGradient(x0 + bw - 20, 0, x0 + bw, 0);
  shoreShadow.addColorStop(0, rgba(PAL.indigoDeep, 0));
  shoreShadow.addColorStop(1, rgba(PAL.indigoDeep, 0.5));
  ctx.fillStyle = shoreShadow;
  ctx.fillRect(x0, y0, bw, bh);

  var deepShadow = ctx.createLinearGradient(x0, 0, x0 + 32, 0);
  deepShadow.addColorStop(0, rgba(PAL.indigoDeep, 0.55));
  deepShadow.addColorStop(1, rgba(PAL.indigoDeep, 0));
  ctx.fillStyle = deepShadow;
  ctx.fillRect(x0, y0, bw, bh);

  // darken the whole band at night
  if (view.night) {
    ctx.fillStyle = rgba(PAL.indigoDeep, 0.32);
    ctx.fillRect(x0, y0, bw, bh);
  }

  // animated diagonal gold shimmer stripes (CSS ::after: repeating-linear-gradient(105deg,
  // rgba(227,196,107,.10) 0 2px, transparent 2px 9px), opacity .5, `shimmer` 6s linear infinite
  // moves background-position 60px -> ~10px/s along the stripe axis). Frozen when reduced-motion.
  var rad105 = 105 * Math.PI / 180, sdx = Math.sin(rad105), sdy = -Math.cos(rad105);
  var ang = Math.atan2(sdy, sdx);
  var diag = Math.sqrt(bw * bw + bh * bh);
  var period = 9, stripe = 2;
  var offset = view.rm ? 0 : (t * 10) % period;
  ctx.save();
  ctx.translate(x0 + bw / 2, y0 + bh / 2);
  ctx.rotate(ang);
  ctx.fillStyle = rgba(PAL.gold, 0.05); // stripe alpha .10 * layer opacity .5
  for (var sx = -diag - period; sx <= diag + period; sx += period) {
    ctx.fillRect(sx + offset, -diag, stripe, diag * 2);
  }
  ctx.restore();

  ctx.restore(); // drop the bay-shape clip

  // vertical dashed gold foam line at the shore edge (CSS ::before: right:1px top:3% bottom:4%
  // width:2.5px, repeating-linear-gradient(180deg, gold .4 0-9px, transparent 9-19px)). ::before is a
  // plain rectangular box (only .water's own background/::after inherit the bay border-radius; .water
  // itself has no overflow:hidden), so this is a straight line — NOT clipped to the bay curve.
  ctx.save();
  ctx.strokeStyle = rgba(PAL.gold, 0.4);
  ctx.lineWidth = 2.5;
  ctx.setLineDash([9, 10]);
  ctx.beginPath();
  ctx.moveTo(x0 + bw - 2.25, y0 + bh * 0.03);
  ctx.lineTo(x0 + bw - 2.25, y0 + bh * 0.96);
  ctx.stroke();
  ctx.restore();
}


  // ---- drawSeaLife ----
function drawSeaLife_gullArc(ctx, gx, gy, strokeColor) {
  ctx.beginPath();
  ctx.moveTo(gx - 5.5, gy);
  ctx.quadraticCurveTo(gx - 2.75, gy - 4.5, gx, gy);
  ctx.quadraticCurveTo(gx + 2.75, gy - 4.5, gx + 5.5, gy);
  ctx.lineWidth = 1.6;
  ctx.lineCap = 'round';
  ctx.strokeStyle = strokeColor;
  ctx.stroke();
}

function drawSeaLife(ctx, sim, t, view) {
  if (!view || view.rm) return;
  ctx.save();                                        // isolate lineWidth/lineCap/stroke so they can't bleed into drawRoads
  var w = view.w, h = view.h;
  var gi, period, delay, local, k, xPct, gx, topPct, yOff, gy;
  var fi, fdelay, flocal, fk, segK, segT, op, dy, sc, fxPct, fyPct, fx, fy, r;

  // GULLS: sweep left->right, per-gull period 17+gi*4s, phase -gi*5.5s (CSS negative
  // animation-delay == already advanced by that much), sin y-bob, top band 8/17/26%.
  for (gi = 0; gi < GULLS; gi++) {
    period = 17 + gi * 4;
    delay = gi * 5.5;
    local = t + delay;
    k = local % period; if (k < 0) k += period; k = k / period;
    xPct = lerp(-8, 108, k);
    gx = w * xPct / 100;
    topPct = 8 + gi * 9;
    yOff = -11 * Math.sin(k * Math.PI);
    gy = h * topPct / 100 + yOff;
    drawSeaLife_gullArc(ctx, gx, gy, rgba(PAL.gold, 0.55));
  }

  // FISH: gold splash dots arcing up/down on a 7s ease-in-out loop, phase fi*2.3s
  // (CSS positive animation-delay == starts later). Ported from @keyframes fish-jump:
  // 0%,86% invisible -> 90% opacity .85/y-11/scale1 -> 96% opacity .6/y-3/scale.85 -> 100% opacity0/y2/scale.5.
  for (fi = 0; fi < FISH; fi++) {
    fdelay = fi * 2.3;
    flocal = t - fdelay;
    fk = flocal % 7; if (fk < 0) fk += 7; fk = fk / 7;
    if (fk < 0.86) continue;
    segK = (fk - 0.86) / 0.14;
    if (segK <= 0.2857) {
      segT = segK / 0.2857;
      op = lerp(0, 0.85, segT); dy = lerp(0, -11, segT); sc = lerp(0.5, 1, segT);
    } else if (segK <= 0.7143) {
      segT = (segK - 0.2857) / 0.4286;
      op = lerp(0.85, 0.6, segT); dy = lerp(-11, -3, segT); sc = lerp(1, 0.85, segT);
    } else {
      segT = (segK - 0.7143) / 0.2857;
      op = lerp(0.6, 0, segT); dy = lerp(-3, 2, segT); sc = lerp(0.85, 0.5, segT);
    }
    fxPct = 3 + fi * 5;
    fyPct = 55 + fi * 13;
    fx = w * fxPct / 100;
    fy = h * fyPct / 100 + dy;
    r = 2.5 * sc;
    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(PAL.gold, op * 0.75);
    ctx.fill();
  }
  ctx.restore();
}


  // ---- drawRoads ----
function drawRoads(ctx, sim, t, view) {
  var i, a, b, ap, bp, speed = 42 / 9, offset;
  offset = view.rm ? 0 : -(t * speed);
  ctx.save();
  ctx.strokeStyle = rgba(PAL.gold, 0.36);
  ctx.lineWidth = 2;
  ctx.setLineDash([7, 7]);
  ctx.lineDashOffset = offset;
  if (view.night) ctx.globalAlpha *= 0.85;
  ctx.beginPath();
  for (i = 0; i < ADJ.length; i++) {
    a = P.station(ADJ[i][0]);
    b = P.station(ADJ[i][1]);
    ap = stationPx(a, view);
    bp = stationPx(b, view);
    ctx.moveTo(ap.x, ap.y);
    ctx.lineTo(bp.x, bp.y);
  }
  ctx.stroke();
  ctx.restore();
}


  // ---- drawSky ----
function drawSky(ctx, sim, t, view) {
  if (!sim || sim.mode !== 'minute') return;
  var sky = skyAt(sim.clockMin);
  var top = sky.top, hor = sky.hor, al = sky.alpha;
  var w = view.w, h = view.h;
  ctx.save();
  var grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, rgba(top, al));
  grad.addColorStop(0.52, rgba(top, al * 0.8));
  grad.addColorStop(1, rgba(hor, al));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}


  // ---- drawGuests ----
function drawGuests(ctx, sim, t, view) {
  if (!view || !view.guestsVisible) return;
  var vg = view.guest; if (!vg) return;
  var w = view.w, h = view.h;
  var hot = view.hotPts || [];
  var n = (typeof P !== 'undefined' && P.GUESTS) ? P.GUESTS : 13;

  for (var i = 0; i < n; i++) {
    var id = 'g' + i;
    var gs = vg[id];
    if (!gs || typeof gs.cx !== 'number' || typeof gs.cy !== 'number') continue;
    var cx = gs.cx, cy = gs.cy;

    // hush: prefer frame()'s precomputed flag, else derive it the same way (HUSH_R2 around a stalled holder)
    var hushed = gs.hushed;
    if (typeof hushed !== 'boolean') {
      var nx = w ? cx / w : 0, ny = h ? cy / h : 0;
      hushed = isHushed(nx, ny, hot);
    }

    // free-running bob — CSS @keyframes bob (0%,100% 0 / 50% -2.5px), 1.7s default, 2.6s for chatters;
    // stops under reduced motion or while hushed/frozen (mirrors .guest.hushed{} killing the animation)
    var bobY = 0;
    if (!view.rm && !hushed) {
      var period = (gs.act === 'chat') ? 2600 : 1700;
      var phase = (t * 1000 % period) / period;
      bobY = -2.5 * (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    }
    var fy = cy + bobY;                       // this frame's feet/body-anchor line
    var col = YUKATA[i % YUKATA.length];

    ctx.save();
    ctx.globalAlpha = hushed ? 0.3 : 1;        // .guest.hushed{opacity:.3}

    // yukata body — 8x11 rounded rect, feet at fy, centred on cx (style.css .g-body)
    roundRect(ctx, cx - 4, fy - 11, 8, 11, 3.5);
    ctx.fillStyle = col;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(20,27,34,.4)';
    ctx.stroke();

    // head dot (::before): 5px circle, centred (cx, fy-12.5)
    ctx.beginPath();
    ctx.arc(cx, fy - 12.5, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = rgba(PAL.skin, 1);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(20,27,34,.35)';
    ctx.stroke();

    // fishing rod for the fixed shore casters (::after on .g-cast .g-body):
    // a 12x1.5 bar rotated -34deg about its left-bottom corner
    if (gs.cast) {
      var px0 = cx + 2, py0 = fy - 16.5;
      var ang = -34 * Math.PI / 180;
      var px1 = px0 + 12 * Math.cos(ang), py1 = py0 + 12 * Math.sin(ang);
      ctx.beginPath();
      ctx.moveTo(px0, py0);
      ctx.lineTo(px1, py1);
      ctx.strokeStyle = rgba(PAL.gold, 0.65);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    ctx.restore();
  }
}


  // ---- drawBoat ----
function drawBoat_hullPath(ctx, x, y, w, h, rtl, rtr, rbr, rbl) {
  ctx.beginPath();
  ctx.moveTo(x + rtl, y);
  ctx.lineTo(x + w - rtr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rtr);
  ctx.lineTo(x + w, y + h - rbr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rbr, y + h);
  ctx.lineTo(x + rbl, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rbl);
  ctx.lineTo(x, y + rtl);
  ctx.quadraticCurveTo(x, y, x + rtl, y);
  ctx.closePath();
}

function drawBoat(ctx, sim, t, view) {
  if (!view || !view.boat) return;
  var b = view.boat, bs = P.boatState(sim);
  var cx = b.cx, cy = b.cy;
  var faceL = (bs.phase === 'outbound' || bs.phase === 'ground');
  var atSea = bs.atSea;
  var ts = t * 1000;
  var i, wk, age, wa;

  // ---- wake pool: pooled gold ellipses fading over 900ms, laid on the water behind the hull ----
  // (style.css .wk: 12x4 ellipse, rgba(227,196,107,.3) == PAL.gold; app.js frame() fades (1-age/900)*0.5)
  if (!view.rm && view.wakes) {
    for (i = 0; i < view.wakes.length; i++) {
      wk = view.wakes[i];
      if (!wk || !wk.t0) continue;
      age = ts - wk.t0;
      if (age < 0 || age >= 900) continue;
      wa = (1 - age / 900) * 0.5;
      ctx.fillStyle = rgba(PAL.gold, wa);
      ctx.beginPath();
      ctx.ellipse(wk.x, wk.y, 6, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // contact shadow on the water beneath the hull (the "hull shadow" the shared helper names)
  shadowEllipse(ctx, cx, cy + 4, 13, 3, 0.32);

  // continuous sin bob (style.css @keyframes boatbob, 3.2s, 0..-1.5px + -1..1deg);
  // .boat.sailing swaps the WHOLE animation for boat-rock (2.6s, -5..5deg, no translateY) — replicate that swap
  var bobY = 0, rot = 0;
  if (!view.rm) {
    if (atSea) {
      rot = Math.sin(t * (2 * Math.PI) / 2.6) * (5 * Math.PI / 180);
    } else {
      bobY = (Math.sin(t * (2 * Math.PI) / 3.2) - 1) * 0.75;
      rot = Math.sin(t * (2 * Math.PI) / 3.2) * (1 * Math.PI / 180);
    }
  }

  ctx.save();
  ctx.translate(cx, cy);
  if (faceL) ctx.scale(-1, 1);   // .boat.faceL .bwrap{transform:scaleX(-1)} — bow toward the open sea
  ctx.translate(0, bobY);
  ctx.rotate(rot);

  // ---- hull: lacquer gradient, rounded, thin gold rim highlight ----
  // style.css .hull: 26x7, border-radius 2/10/4/3 — CSS auto-clamps corner radii whose adjacent
  // sum exceeds the edge length (right edge 7px vs tr10+br4=14) by scaling ALL radii by 7/14=.5;
  // canvas paths don't auto-clamp, so the scaled values (1,5,2,1.5) are used directly here.
  drawBoat_hullPath(ctx, -13, -2, 26, 7, 1, 5, 2, 1.5);
  var hg = ctx.createLinearGradient(0, -2, 0, 5);
  hg.addColorStop(0, '#333c46');
  hg.addColorStop(1, '#171d24');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = rgba(PAL.gold, 0.55);   // inset 0 1.5px 0 rgba(227,196,107,.55) == PAL.gold
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-11, -0.5);
  ctx.lineTo(11, -0.5);
  ctx.stroke();

  // ---- mast (.mast: 1.5x14 #4a3a22) ----
  ctx.strokeStyle = '#4a3a22';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(-0.25, -15);
  ctx.lineTo(-0.25, -1);
  ctx.stroke();

  // ---- sail: cream washi triangle (the CSS border-trick: 0x0 box, border-left 9 transparent +
  // border-bottom 11 solid at local left:3/bottom:8 of the 26x22 bwrap -> the visible triangle) ----
  ctx.fillStyle = 'rgba(240,231,208,0.92)';
  ctx.beginPath();
  ctx.moveTo(-10, -3);
  ctx.lineTo(-10, 8);
  ctx.lineTo(-19, 8);
  ctx.closePath();
  ctx.fill();

  // ---- hinomaru dot (.sail::after: 4x4 circle, background var(--wait) == PAL.hanko) ----
  ctx.fillStyle = rgba(PAL.hanko, 1);
  ctx.beginPath();
  ctx.arc(-15, 1, 2, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}


  // ---- drawStations ----
function drawStations_glyph(ctx, id, cx, cy, r) {
  // per-id landmark glyph: 'roof-like' ids sit just above the icon disc,
  // 'waterline' ids (port/vessel) sit just below it — mirrors the old
  // .st-arch top:/bottom: split (style.css:251-262).
  var topY = cy - r - 3, botY = cy + r + 3, i2;
  ctx.save();
  if (id === 'command') {
    var hw = 15, h = 14;
    ctx.beginPath();
    ctx.moveTo(cx, topY - h);
    ctx.lineTo(cx - hw, topY);
    ctx.lineTo(cx + hw, topY);
    ctx.closePath();
    ctx.fillStyle = '#2c3844'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(227,196,107,.85)'; ctx.stroke();
  } else if (id === 'lodging') {
    var hw2 = 12, h2 = 11;
    ctx.beginPath();
    ctx.moveTo(cx, topY - h2);
    ctx.lineTo(cx - hw2, topY);
    ctx.lineTo(cx + hw2, topY);
    ctx.closePath();
    ctx.fillStyle = '#34404c'; ctx.fill();
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(227,196,107,.55)'; ctx.stroke();
  } else if (id === 'mess') {
    var aw = 30, ah = 9, ax = cx - aw / 2, ay = topY - ah;
    roundRect(ctx, ax, ay, aw, ah, 3);
    ctx.fillStyle = '#8a3427'; ctx.fill();
    ctx.save();
    roundRect(ctx, ax, ay, aw, ah, 3); ctx.clip();
    ctx.fillStyle = rgba(TERR.red.rgb, 1);
    for (i2 = ax; i2 < ax + aw; i2 += 12) ctx.fillRect(i2, ay, 7, ah);
    ctx.restore();
    radialGlow(ctx, ax + aw + 3, ay + ah * 0.5, 6, '227,196,107', 0.45);
  } else if (id === 'clinic') {
    var bw = 15, bh = 15, bx = cx - bw / 2, byy = topY - bh;
    roundRect(ctx, bx, byy, bw, bh, 2);
    ctx.fillStyle = '#f6efdc'; ctx.fill();
    ctx.strokeStyle = rgba(PAL.indigoDeep, 0.35); ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = rgba(TERR.red.rgb, 1);
    ctx.fillRect(cx - 2, byy + 3, 4, bh - 6);
    ctx.fillRect(bx + 3, byy + bh / 2 - 2, bw - 6, 4);
  } else if (id === 'finance') {
    var cr = 7, cyc = topY - cr;
    var grad = ctx.createRadialGradient(cx, cyc, 1, cx, cyc, cr);
    grad.addColorStop(0, '#e3c46b'); grad.addColorStop(1, '#b8892b');
    ctx.beginPath(); ctx.arc(cx, cyc, cr, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    ctx.fillStyle = rgba(PAL.indigoDeep, 1);
    ctx.beginPath(); ctx.arc(cx + 1.5, cyc + 1.5, 1.6, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'port') {
    var pw = 30, pxx = cx - pw / 2;
    ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 4; ctx.lineCap = 'butt';
    ctx.beginPath();
    for (i2 = 0; i2 < pw; i2 += 8) { ctx.moveTo(pxx + i2, botY); ctx.lineTo(pxx + Math.min(i2 + 5, pw), botY); }
    ctx.stroke();
  } else if (id === 'vessel') {
    var vw = 36, vx0 = cx - vw / 2, vy = botY + 2;
    ctx.strokeStyle = 'rgba(120,160,190,.4)'; ctx.lineWidth = 2;
    for (i2 = 0; i2 < 3; i2++) {
      ctx.beginPath();
      ctx.arc(vx0 + 6 + i2 * 12, vy, 5, Math.PI, 0);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawStations(ctx, sim, t, view) {
  if (!view || !P || !P.STATIONS) return;
  var terr = view.tintMap || P.stationReadiness(sim);
  var night = !!view.night;
  var discR = 21;
  var simStations = (sim && sim.stations) ? sim.stations : null;
  var i, j;
  for (i = 0; i < P.STATIONS.length; i++) {
    var st = P.STATIONS[i];
    var p = stationPx(st, view);
    var cx = p.x, cy = p.y;
    var simSt = null;
    if (simStations) { for (j = 0; j < simStations.length; j++) { if (simStations[j].id === st.id) { simSt = simStations[j]; break; } } }
    var crewCount = simSt ? simSt.crewIds.length : 0;
    var hot = !!(simSt && simSt.dominantProblem && crewCount > 0);
    var tv = terr[st.id] || 'none';
    var terrDef = TERR[tv];

    // (c) territory halo — greens/ambers/reds the ground behind the icon (style.css:370-377)
    if (terrDef) {
      ctx.save();
      ctx.globalAlpha = terrDef.op;
      radialGlow(ctx, cx, cy, discR * 1.3, terrDef.rgb, terrDef.a);
      ctx.restore();
    }
    // (f) night lantern glow — a stalled station's red warning always outranks the cozy lantern
    if (night && !hot) {
      radialGlow(ctx, cx, cy, discR * 1.6, '227,196,107', 0.18);
    }
    // DOM centres the whole disc+name block on station.y (translate(-50%,-50%)) so the disc sits ~11px above cy.
    // Keep the halo + night glow at cy (roads/tint meet the station point); raise the disc block to discCy.
    var discCy = cy - 11;
    // (b) icon disc — indigo fill, drop shadow (style.css:263-267)
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,.4)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
    ctx.beginPath(); ctx.arc(cx, discCy, discR, 0, Math.PI * 2);
    ctx.fillStyle = rgba(PAL.indigo, 1); ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(cx, discCy, discR, 0, Math.PI * 2);
    ctx.lineWidth = 2;
    ctx.strokeStyle = terrDef ? terrDef.border : rgba(PAL.gold, 1);
    ctx.stroke();
    // icon emoji
    ctx.save();
    ctx.font = '19px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#fff';
    ctx.fillText(st.icon, cx, discCy + 1);
    ctx.restore();
    // (a) per-id landmark glyph, drawn resting against the disc
    drawStations_glyph(ctx, st.id, cx, discCy, discR);
    // (e) pulsing red stalled ring — only when the station has a live problem AND crew
    if (hot) {
      var puls = view.rm ? 0.8 : (0.8 + 0.2 * Math.cos(t * 2 * Math.PI / 1.1));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, discCy, discR + 4, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(TERR.red.rgb, 0.35 * puls);
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.restore();
    }
    // (d) crew-count badge, top-right corner of the disc
    if (crewCount > 0) {
      var bx = cx + discR * 0.75, by4 = discCy - discR * 0.9, br = 9;
      ctx.save();
      ctx.beginPath(); ctx.arc(bx, by4, br, 0, Math.PI * 2);
      ctx.fillStyle = rgba(PAL.gold, 1); ctx.fill();
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(PAL.indigoDeep, 1);
      ctx.fillText(String(crewCount), bx, by4 + 1);
      ctx.restore();
    }
    // bilingual name — plain gold text (no box), matching .st-nm (style.css:268) so it never occludes pawns
    ctx.save();
    ctx.font = '600 11px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3;
    ctx.fillStyle = rgba(PAL.gold, 1);
    ctx.fillText(nm(st.name), cx, discCy + discR + 6);
    ctx.restore();
  }
}


  // ---- drawFigures ----
function drawFigures_pulse(t, period, lo, hi) {
  var ph = (t % period) / period;
  var c = (Math.cos(2 * Math.PI * ph) + 1) / 2;   // 1 at ph=0, 0 at ph=.5 (mirrors the CSS "pulse" keyframe)
  return lo + (hi - lo) * c;
}
function drawFigures_leg(ctx, hipX, hipY, w, h, angleDeg, color) {
  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(angleDeg * Math.PI / 180);
  ctx.fillStyle = color;
  roundRect(ctx, -w / 2, 0, w, h, 1.5);
  ctx.fill();
  ctx.restore();
}
function drawFigures(ctx, sim, t, view) {
  if (!sim || !sim.participants || !view || !view.fig) return;
  var ts = t * 1000;
  var rm = !!view.rm;
  // state -> bubble/border tint (mirrors style.css .astro.s-* .bub border-color groups; resolved/idle/tired/working keep the chip default)
  var BTINT = { confused: '217,83,79', onFire: '217,83,79', waiting: '193,122,31', waitInfo: '193,122,31', meeting: '92,127,146', rework: '92,127,146' };
  for (var i = 0; i < sim.participants.length; i++) {
    var p = sim.participants[i];
    var f = view.fig[p.id];
    if (!f) continue;
    var role = P.role(p.roleId) || { color: '#5b6b45', icon: '' };
    var state = p.state;
    var cx = f.cx, feetY = f.cy;
    var dim = (STATE_DIM[state] != null) ? STATE_DIM[state] : 1;

    ctx.save();
    ctx.globalAlpha = dim;

    // ---- shadow + pawn body (flip + walk-bob live in here; shadow ignores bob) ----
    ctx.save();
    if (f.faceL) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }

    var shRx = (f.walking && !rm) ? 6 : 7.5;
    shadowEllipse(ctx, cx, feetY + 3, shRx, 2.5, 0.45);

    // walk trot / working idle-breath bob (t-driven ambience per contract §2); none under rm
    var bobOffset = 0;
    if (!rm) {
      if (state === 'working') {
        var ph2 = (t % 1.15) / 1.15;
        bobOffset = -1.25 * (1 - Math.cos(2 * Math.PI * ph2));
      } else if (f.walking) {
        var ph1 = (t % 0.38) / 0.38;
        bobOffset = -0.8 * (1 - Math.cos(2 * Math.PI * ph1));
      }
    }
    // leg swing (independent of the bob rule above — CSS keeps legswing tied purely to .walking)
    var angL = 0, angR = 0;
    if (f.walking && !rm) {
      var phL = (t % 0.38) / 0.38;
      angL = -26 * Math.cos(2 * Math.PI * phL);
      angR = -angL;
    }

    ctx.save();
    ctx.translate(0, bobOffset);

    drawFigures_leg(ctx, cx - 2, feetY - 7.5, 3, 7.5, angL, '#2b241c');
    drawFigures_leg(ctx, cx + 2, feetY - 7.5, 3, 7.5, angR, '#2b241c');

    // torso (coat) — role colour, top highlight / bottom shade bevel, ink outline, washi sash
    var trX = cx - 6, trY = feetY - 18, trW = 12, trH = 12.5;
    ctx.fillStyle = role.color;
    roundRect(ctx, trX, trY, trW, trH, 3.5);
    ctx.fill();
    ctx.fillStyle = rgba('255,255,255', 0.22);
    ctx.fillRect(trX, trY, trW, 2);
    ctx.fillStyle = rgba('0,0,0', 0.22);
    ctx.fillRect(trX, trY + trH - 2, trW, 2);
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(PAL.ink, 0.35);
    roundRect(ctx, trX, trY, trW, trH, 3.5);
    ctx.stroke();
    ctx.fillStyle = rgba(PAL.washi, 0.7);
    ctx.fillRect(trX, trY + trH - 5, trW, 2);

    // head — skin tone
    ctx.beginPath();
    ctx.fillStyle = rgba(PAL.skin, 1);
    ctx.arc(cx, feetY - 19.5, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = rgba(PAL.ink, 0.3);
    ctx.stroke();

    // cap — role colour, small bevel
    var hX = cx - 5, hY = feetY - 26, hW = 10, hH = 5;
    ctx.fillStyle = role.color;
    roundRect(ctx, hX, hY, hW, hH, 2.2);
    ctx.fill();
    ctx.fillStyle = rgba('255,255,255', 0.25);
    ctx.fillRect(hX, hY, hW, 1.5);
    ctx.fillStyle = rgba(PAL.washi, 0.75);
    ctx.fillRect(hX, hY + hH - 1, hW, 1);

    ctx.restore(); // end bob translate
    ctx.restore(); // end flip

    // ---- state foot-aura (flattened radial glow; never mirrored, never bobbed) ----
    var aura = STATE_AURA[state];
    if (aura) {
      var op = aura.op;
      if (aura.pulse && !rm) op = op * drawFigures_pulse(t, 1.1, 0.6, 1);
      ctx.save();
      ctx.globalAlpha = op;
      ctx.translate(cx, feetY + 1);
      ctx.scale(1, 10 / 26);
      radialGlow(ctx, 0, 0, 13, aura.rgb, aura.a);
      ctx.restore();
    }

    // ---- Live gap-focus spotlight ring (gold, pulsing) ----
    if (view.spotlightPid && p.id === view.spotlightPid) {
      var pf = rm ? 1 : drawFigures_pulse(t, 1.2, 0.6, 1);
      ctx.save();
      ctx.globalAlpha = 0.4 * pf;
      radialGlow(ctx, cx, feetY + 3, 16, PAL.gold, 0.5);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.75 * pf;
      ctx.lineWidth = 2;
      ctx.strokeStyle = rgba(PAL.gold, 1);
      ctx.beginPath();
      ctx.arc(cx, feetY + 3, 9, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // ---- speech-bubble chip (BUB map; '' = none) — pops on state change ----
    var bubTxt = BUB[state] || '';
    if (bubTxt) {
      var bubY = feetY - 46; // top-centre; tail:'down' lands the tail near the cap
      var scale = 1;
      if (!rm && f.bubT0) {
        var kk = (ts - f.bubT0) / DUR.bubpop;
        if (kk < 0) kk = 0;
        if (kk < 1) {
          if (kk < 0.65) scale = 0.5 + (1.15 - 0.5) * (kk / 0.65);
          else scale = 1.15 + (1 - 1.15) * ((kk - 0.65) / 0.35);
        }
      }
      var bopts = { tail: 'down' };
      var tint = BTINT[state];
      if (tint) bopts.border = rgba(tint, 1);
      if (scale !== 1) {
        var ax = cx, ay = bubY + 7;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.scale(scale, scale);
        ctx.translate(-ax, -ay);
        chip(ctx, cx, bubY, bubTxt, bopts);
        ctx.restore();
      } else {
        chip(ctx, cx, bubY, bubTxt, bopts);
      }
    }

    // ---- name chip: role icon + localized name — stall state, spotlight, or hover ----
    if (STALL_STATES[state] || p.id === view.spotlightPid || p.id === view.hoverPid) {
      var label = (role.icon ? role.icon + ' ' : '') + nm(p.name);
      chip(ctx, cx, feetY + 5, label, {});
    }

    ctx.restore(); // end dim alpha
  }
}


  // ---- drawMotes ----
function drawMotes_dot(ctx, x, y, rgb, hi) {
  ctx.save();
  radialGlow(ctx, x, y, 13, rgb, 0.5);          // ~box-shadow 0 0 9px 3px rgba(rgb,.5)
  var g = ctx.createRadialGradient(x, y, 0, x, y, 5);
  g.addColorStop(0, rgba(hi, 1));
  g.addColorStop(0.65, rgba(rgb, 0.4));
  g.addColorStop(0.75, rgba(rgb, 0));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawMotes_ping(ctx, x, y, elapsed, dur, rgb, rm) {
  var k, r, a;
  ctx.save();
  if (rm) {
    // reduced motion: a fixed-radius ring for the ping's visible window, no expansion
    radialGlow(ctx, x, y, 16, rgb, 0.35);
    ctx.strokeStyle = rgba(rgb, 0.55);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.stroke();
  } else {
    k = clamp(elapsed / dur, 0, 1);
    r = 9 + k * 14;                              // ~box-shadow spread 0 -> 14px
    a = 0.7 * (1 - k);                            // ~alpha .7 -> 0
    ctx.strokeStyle = rgba(rgb, a);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawMotes(ctx, sim, t, view) {
  if (!sim || sim.mode !== 'minute') return;      // §21.3 self-gate: minute-mode only
  if (!view || !view.motes || !view.motes.length) return;
  var ts = t * 1000;
  var i, m, rgb, hi, x, y, k, e, st, sp, tst;
  for (i = 0; i < view.motes.length; i++) {
    m = view.motes[i];
    if (!m || !m.state) continue;                 // 0 = armed, not yet launched -> invisible
    rgb = m.late ? PAL.hanko : PAL.gold;           // "gold on time . hanko red late" (style.css:238)
    hi = m.late ? '255,178,162' : '255,238,176';   // bright core highlight (CSS #ffb2a2 / #ffeeb0)
    if (m.state === 1) {
      if (view.rm) continue;                       // RM: no flight, ping-only at state 2
      k = clamp((ts - (m.t0 || ts)) / (m.dur || 650), 0, 1);
      e = smoothstep(k);
      x = px(lerp(m.ax, m.bx, e), view);
      y = py(lerp(m.ay, m.by, e), view) - Math.sin(k * Math.PI) * 12;
      drawMotes_dot(ctx, x, y, rgb, hi);
    } else if (m.state === 2) {
      if (m.noPing) continue;                        // app skipped this delivery silently (fast-forward / post-commit sweep) — no ping
      if (!m._pingT0) m._pingT0 = ts;               // render-only scratch stamp, first frame seen done
      tst = ts - m._pingT0;
      if (tst >= 0 && tst < DUR.ping) {
        st = P.station(m.toSt);
        sp = stationPx(st, view);
        drawMotes_ping(ctx, sp.x, sp.y, tst, DUR.ping, rgb, view.rm);
      }
    }
  }
}


  // ---- drawCascade ----
function drawCascade_marker(ctx, x, y) {
  radialGlow(ctx, x, y, 12, PAL.hanko, .4);
  radialGlow(ctx, x, y, 5, PAL.redBright, .85);
}

function drawCascade(ctx, sim, t, view) {
  var c = view.cascade;
  if (!c || !c.has || !c.hops || !c.hops.length) return;
  var hops = c.hops;

  if (view.rm) {
    var chainPts = (view.chain && view.chain.length) ? view.chain : null;
    ctx.save();
    if (chainPts) {
      for (var ci = 0; ci < chainPts.length; ci++) drawCascade_marker(ctx, chainPts[ci].x, chainPts[ci].y);
    } else {
      for (var cj = 0; cj < hops.length; cj++) {
        var csp = stationPx(P.station(hops[cj].station), view);
        drawCascade_marker(ctx, csp.x, csp.y - 30);
      }
    }
    ctx.restore();
    return;
  }

  if (view.frozen) return;      // comet hides while paused/livePausedForFix; RM chain above stays visible
  if (hops.length < 2) return;  // need at least two hops to animate a segment

  var ts = t * 1000;
  var HOP = DUR.cascadeHop, REST = DUR.cascadeRest;
  var span = (hops.length - 1) * HOP;
  var total = span + REST;
  var tt = ts % total;

  if (typeof c._strikeSeg === 'undefined') { c._strikeSeg = -1; c._strikeAt = 0; c._strikeStation = null; }

  // fading strike ring at the last-struck station — independent of the comet's own moving/resting phase
  if (c._strikeAt && (ts - c._strikeAt) < DUR.strike) {
    var sk = (ts - c._strikeAt) / DUR.strike;
    var sPt = stationPx(P.station(c._strikeStation), view);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sPt.x, sPt.y, 21 + sk * 14, 0, Math.PI * 2);
    ctx.lineWidth = 3;
    ctx.strokeStyle = rgba(PAL.redBright, (1 - sk) * 0.75);
    ctx.stroke();
    ctx.restore();
  }

  if (tt >= span) {
    // rest gap between loops: hide comet + ghosts, forget the last segment so the next lap starts clean
    c._strikeSeg = -1;
    view.trail.length = 0;
    for (var gz = 0; gz < view.ghost.length; gz++) view.ghost[gz].on = false;
    return;
  }

  var seg = Math.floor(tt / HOP);
  var f0 = (tt % HOP) / HOP;
  var frac = smoothstep(f0);
  var A = P.station(hops[seg].station);
  var B = P.station(hops[Math.min(hops.length - 1, seg + 1)].station);
  var x = px(lerp(A.x, B.x, frac), view);
  var y = py(lerp(A.y, B.y, frac), view);

  // trail bookkeeping (this layer owns view.trail/view.ghost)
  view.trail.push({ x: x, y: y, t: ts });
  while (view.trail.length && ts - view.trail[0].t > DUR.trailKeep) view.trail.shift();

  for (var gi = 0; gi < view.ghost.length; gi++) {
    var idx = view.trail.length - 1 - (gi + 1) * 5;
    var ge = view.ghost[gi];
    if (idx < 0) { ge.on = false; continue; }
    var tp = view.trail[idx];
    ge.x = tp.x; ge.y = tp.y; ge.on = true; ge.alpha = 0.5 - gi * 0.14;
  }

  ctx.save();
  for (var gj = 0; gj < view.ghost.length; gj++) {
    var gd = view.ghost[gj];
    if (gd.on) radialGlow(ctx, gd.x, gd.y, 4.5, PAL.redBright, 0.7 * gd.alpha);
  }
  ctx.restore();

  // arriving at a hop strikes that station — cause -> effect, not a cruising dot
  if (seg !== c._strikeSeg) {
    if (c._strikeSeg >= 0 && seg > 0) {
      c._strikeStation = hops[seg].station;
      c._strikeAt = ts;
    }
    c._strikeSeg = seg;
  }

  // the comet itself: soft box-shadow-like glow + two-tone dot (dark-red ring, bright-red core)
  ctx.save();
  radialGlow(ctx, x, y, 23, PAL.hanko, .5);
  radialGlow(ctx, x, y, 7, PAL.hanko, .18);
  radialGlow(ctx, x, y, 4.2, PAL.redBright, .95);
  ctx.restore();
}


  window.PRS_STAGE = { initStage: initStage, resizeStage: resizeStage, scene: scene };
})();
