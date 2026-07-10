/* ============================================================================
 * stage.js — Ogasawara Rehearsal · Tier 2 Canvas 2D stage (CLAUDE.md §21).
 * One plain file, vanilla ES5, no library (§11). Draws the WHOLE scene each
 * frame from deterministic sim state (window.PRS) + the interpolated position
 * caches handed in via `view`. Rendering only READS — it never writes to sim.
 * Coordinates: all drawing is in CSS px (the DPR transform is applied once in
 * initStage/resizeStage); station/engine positions are normalized [0..1] and
 * scale by view.w / view.h — the same normalized×w/h math the DOM stage used.
 *
 * VISUAL LEAP (§21.1 "richer washi/lacquer"): scene() sets the module-scope
 * `scale` (Number, ~1.0–1.7, from view.scale or derived from view.w/h) at the
 * top of every frame. Draw layers multiply ALL drawn SIZES by it — radii,
 * font px, stroke widths, pawn/boat dims, glow/shadow radii, offsets from an
 * anchor — but NEVER positions (cache cx/cy and normalized×w/h are already in
 * final px). See the WASHI ART HELPERS section for the shared richer-art kit.
 * ==========================================================================*/
(function () {
  'use strict';
  var P = window.PRS;

  // =========================================================================
  // Module render state (set by initStage / resizeStage; scene() refreshes lang)
  // =========================================================================
  var _canvas = null, _ctx = null, _dims = { w: 0, h: 0 }, _dpr = 1;
  var _lang = 'en';                       // refreshed from view.lang at the top of scene()

  // stage size factor — set ONCE per frame at the top of scene() (§21 visual
  // leap). Every draw layer reads this module var and multiplies its SIZES by
  // it (radii, font px, line widths, pawn/boat/guest dims, shadow/glow sizes,
  // anchor offsets). POSITIONS are never multiplied: view.fig/guest/boat cache
  // cx/cy values and normalized→px conversions (px()/py()/stationPx()) are
  // already final CSS px. Layers must NOT declare a local `var scale`.
  var scale = 1;

  // ---- Harbor Complete (spec §2) — pawn scale + sprite + lighting + camera state ----

  // PAWN SCALE +30% (spec §2): multiplies every PAWN-BODY size (torso/head/cap/
  // legs/aura/gesture anchors/bubble offsets) but never the world around them.
  // `figs` is the resolved per-frame figure scale (= scale × FIG_SCALE), set by
  // drawFigures/drawGuests before their body blocks; gesture/leg helpers read it.
  // Exported on PRS_STAGE so the app layer can plumb the SAME factor into its
  // fan spacing + pawn hit radius (app.js FAN_COL/FAN_ROW/FEET_BASE + pawnAt 26px).
  var FIG_SCALE = 1.3;
  var figs = 1;

  // sprite provider (spec §1 pinned API) — re-resolved every frame in scene().
  // null => full procedural fallback (the game must render perfectly without
  // sprites.js loaded at all). A throwing provider is disarmed for the session.
  var SPR = null, _sprBroken = false;
  function sprGet(roleId, pose, frame, facing) {
    if (!SPR) return null;
    try { return SPR.get(roleId, pose, frame, facing) || null; }
    catch (e) { _sprBroken = true; SPR = null; return null; }
  }

  // per-frame LIGHTING MODEL (spec §2: the SKY table becomes a true light rig).
  // Resolved once per frame by lightFrame(); every layer reads LIGHT instead of
  // re-deriving nightAmount()/isNight() locally, so the whole scene always
  // agrees on the hour — and view.dusk (the §4 report-on-stage grade) can bend
  // ALL of it at once. Fields:
  //   night      0..1 smooth night factor (lanterns, moon glints, water dark)
  //   dayK       0..1 position of the day (04:00→20:00), dusk-bent by view.dusk
  //   sunX/sunY  the sun/moon glow anchor as FRACTIONS of w/h
  //   shadowDirX +1 = shadows stretch right (dawn), -1 = left (dusk)
  //   shadowLen  0..1 how stretched a long cast shadow is (low sun = long)
  //   shadowA    peak alpha for long cast shadows (0 at night unless dusk-graded)
  var LIGHT = { night: 0, dayK: 0.5, sunX: 0.5, sunY: 0.9, shadowDirX: 1, shadowLen: 0, shadowA: 0 };
  var _dusk = 0;   // view.dusk resolved 0..1 (report-on-stage evening grade)
  function lightFrame(sim, view) {
    var minute = sim && sim.mode === 'minute' && typeof sim.clockMin === 'number';
    _dusk = (view.dusk === true) ? 1 : (typeof view.dusk === 'number' ? clamp(view.dusk, 0, 1) : 0);
    var n = minute ? nightAmount(sim.clockMin) : (view.night ? 1 : 0);
    if (_dusk > 0) n = Math.max(n, 0.82 * _dusk);          // dusk floor: lanterns bloom, water moonlights
    LIGHT.night = n;
    var dayK = minute ? clamp((sim.clockMin - SKY_MIN) / (SKY_MAX - SKY_MIN), 0, 1) : 0.5;
    if (_dusk > 0) dayK = lerp(dayK, 0.94, _dusk);         // pull the sun low over the ocean for the dusk grade
    LIGHT.dayK = dayK;
    var cosA = Math.cos(dayK * Math.PI);                   // +1 dawn → 0 noon → -1 dusk
    LIGHT.shadowDirX = cosA >= 0 ? 1 : -1;
    LIGHT.shadowLen = cosA * cosA;                         // long only when the sun sits low
    LIGHT.shadowA = 0.16 * LIGHT.shadowLen * Math.max(1 - n, 0.6 * _dusk);
    LIGHT.sunX = lerp(0.06, 0.94, dayK);
    LIGHT.sunY = lerp(0.92, 0.8, Math.sin(dayK * Math.PI));
  }

  // AUTO-CINEMATIC CAMERA (spec §3) — module state driven by the exported
  // camTo/camReset ease helpers; scene() resolves it once per frame. The
  // transform wraps the WORLD layers only (HUD stamp/dusk-grade sit outside);
  // identity while nothing is easing; reduced motion = identity ALWAYS (any
  // pending/holding move is snapped away). t0 stamps on the first frame after
  // a request so easing rides the same rAF clock scene() is called with.
  var CAM = { x: 0, y: 0, zoom: 1, fx: 0, fy: 0, fz: 1, tx: 0, ty: 0, tz: 1,
              t0: -1, dur: 0, easing: false, pend: null };
  function camTo(target, ms) {
    if (!target) return;
    CAM.pend = { x: (typeof target.x === 'number') ? target.x : CAM.x,
                 y: (typeof target.y === 'number') ? target.y : CAM.y,
                 z: (typeof target.zoom === 'number' && target.zoom > 0) ? target.zoom : 1,
                 ms: (typeof ms === 'number' && ms > 0) ? ms : 0 };
  }
  function camReset(ms) { camTo({ x: CAM.x, y: CAM.y, zoom: 1 }, ms); if (!(ms > 0)) { CAM.pend = null; CAM.easing = false; CAM.zoom = 1; CAM.fz = 1; CAM.tz = 1; } }
  function camState() {
    return { x: CAM.x, y: CAM.y, zoom: CAM.zoom,
             active: !!CAM.easing || !!CAM.pend || Math.abs(CAM.zoom - 1) > 0.001 };
  }
  // per-frame resolve → null (identity) or {x, y, zoom} in canvas CSS px
  function camFrame(t, view) {
    if (view.rm) {                                        // RM: no camera, ever — snap all state to identity
      CAM.pend = null; CAM.easing = false; CAM.zoom = 1; CAM.fz = 1; CAM.tz = 1;
      return null;                                        // (an explicit view.cam is ignored under RM too)
    }
    if (CAM.pend) {
      CAM.fx = CAM.x; CAM.fy = CAM.y; CAM.fz = CAM.zoom;
      CAM.tx = CAM.pend.x; CAM.ty = CAM.pend.y; CAM.tz = CAM.pend.z;
      CAM.dur = CAM.pend.ms / 1000; CAM.t0 = t; CAM.easing = true; CAM.pend = null;
    }
    if (CAM.easing) {
      var k = CAM.dur > 0 ? clamp((t - CAM.t0) / CAM.dur, 0, 1) : 1;
      var e = smoothstep(k);
      CAM.x = lerp(CAM.fx, CAM.tx, e); CAM.y = lerp(CAM.fy, CAM.ty, e); CAM.zoom = lerp(CAM.fz, CAM.tz, e);
      if (k >= 1) CAM.easing = false;
    }
    var cam = (view.cam && typeof view.cam.zoom === 'number' && view.cam.zoom > 0)
      ? view.cam                                           // explicit per-frame override wins (contract: view.cam)
      : { x: CAM.x, y: CAM.y, zoom: CAM.zoom };
    if (Math.abs(cam.zoom - 1) < 0.0005) return null;
    return cam;
  }

  // =========================================================================
  // PORTED CONSTANTS — single source of truth for the canvas scene.
  // (Values ported verbatim from app.js / style.css; do NOT re-derive.)
  // =========================================================================

  // 8 road segments between stations (app.js:791)
  var ADJ = [['mess', 'port'], ['mess', 'clinic'], ['mess', 'lodging'], ['port', 'vessel']];   // §map v2: Hinata(mess) hub + port->iso boat route

  // boat quadratic arc anchors, normalized: pos = qbez(DOCK, BOATC, SEA, param).
  // NEW GEOGRAPHY: Nobu-san sails from the PORT shore (0.52,0.55) out to the iso rock (0.82,0.72).
  var DOCK = { x: 0.52, y: 0.55 }, SEA = { x: 0.80, y: 0.72 }, BOATC = { x: 0.66, y: 0.60 };

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

  // washi/lacquer palette as 'r,g,b' strings (style.css :root) — use with rgba(PAL.x, a).
  // §21 visual-leap additions marked (new); everything above them is untouched.
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
    skin: '233,207,164',       // figure head #e9cfa4
    // ---- §21 richer-washi additions (new) ----
    lantern: '255,186,102',    // warm lantern orange — lightPool centre at night
    lanternCore: '255,226,168',// hot lantern core / flame highlight
    goldLeaf: '212,175,84',    // mid gold-leaf (bevelDisc default rim body)
    goldPale: '244,224,166',   // bright gold-leaf glint / sparkle / top bevel edge
    rimWhite: '255,246,224',   // warm off-white — rimLightArc default (upper-left key light)
    shadow: '8,11,16',         // contact-shadow ink (deeper than indigoDeep)
    washiWarm: '240,229,204',  // warm washi mid-tone (paper grain flecks, sail cloth)
    seaGlint: '178,204,214'    // cool moonlit water highlight
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
  // — hard-edged legacy form; prefer contactShadow() below for the soft §21 look
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
  // tail ('down' → small triangle under the box, i.e. a speech bubble),
  // tailLen (tail triangle drop, default 4 — pass a scaled value with scaled h/pad).
  // Returns { w, h } so callers can stack/avoid overlap.
  // NOTE (§21 scale): chip does NOT auto-scale — pass scaled font/h/pad/r/tailLen.
  function chip(ctx, x, y, text, o) {
    o = o || {};
    var font = o.font || '600 10px system-ui,sans-serif';
    var pad = o.pad != null ? o.pad : 4, h = o.h != null ? o.h : 14;
    var r = o.r != null ? o.r : 2;
    var tailLen = o.tailLen != null ? o.tailLen : 4;
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
      var tw = tailLen * 0.75;
      ctx.beginPath();
      ctx.moveTo(x - tw, y + h); ctx.lineTo(x, y + h + tailLen); ctx.lineTo(x + tw, y + h);
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
  // WASHI ART HELPERS (§21 visual leap) — the shared richer-art kit. All are
  // pure draw calls (no state kept except the cached grain pattern), all take
  // FINAL px sizes (caller multiplies by `scale`), and all no-op on degenerate
  // input, so layers can call them unconditionally.
  // =========================================================================

  // lift/darken an 'r,g,b' string by amt (-255..255) → clamped 'r,g,b' string.
  // The cheap way to derive bevel top/bottom tones from any base colour
  // (works on PAL keys and on '#rrggbb'-free role colours converted upstream).
  function liftRGB(rgb, amt) {
    var p = String(rgb).split(','), out = [], i, v;
    for (i = 0; i < 3; i++) {
      v = Math.round((+p[i] || 0) + amt);
      out.push(v < 0 ? 0 : (v > 255 ? 255 : v));
    }
    return out.join(',');
  }

  // '#rrggbb' (or '#rgb') hex → 'r,g,b' string, so role colours can feed the
  // rgb-string helpers (liftRGB / rgba / lightPool / bevelDisc).
  function hexRGB(hex) {
    var h = String(hex || '').replace('#', ''), r, g, b;
    if (h.length === 3) h = h.charAt(0) + h.charAt(0) + h.charAt(1) + h.charAt(1) + h.charAt(2) + h.charAt(2);
    if (h.length !== 6) return '0,0,0';
    r = parseInt(h.substring(0, 2), 16); g = parseInt(h.substring(2, 4), 16); b = parseInt(h.substring(4, 6), 16);
    return (r || 0) + ',' + (g || 0) + ',' + (b || 0);
  }

  // SOFT CONTACT SHADOW — gradient ground ellipse under a figure / boat / disc.
  // (x, y) = centre on the ground line; w, h = FULL width / FULL height of the
  // ellipse in px (already scaled by the caller); alpha = peak centre opacity.
  // Softer than shadowEllipse: dense core fading to nothing at the edge, in the
  // deep PAL.shadow ink. Draw it BEFORE the thing that casts it.
  function contactShadow(ctx, x, y, w, h, alpha) {
    if (!(w > 0) || !(h > 0) || !(alpha > 0)) return;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(1, h / w);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    g.addColorStop(0, rgba(PAL.shadow, alpha));
    g.addColorStop(0.55, rgba(PAL.shadow, alpha * 0.55));
    g.addColorStop(1, rgba(PAL.shadow, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, w / 2, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  // WARM LIGHT POOL — lantern / window light on the ground or in the air.
  // (x, y) centre, r = radius px (scaled), rgb = 'r,g,b' (use PAL.lantern for
  // night lanterns, PAL.gold for day accents), alpha = centre opacity.
  // Richer falloff than radialGlow: holds a warm core to ~35% radius, then
  // breathes out — reads as light ON a surface rather than a fog ball.
  function lightPool(ctx, x, y, r, rgb, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    var g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, rgba(rgb, alpha));
    g.addColorStop(0.35, rgba(rgb, alpha * 0.6));
    g.addColorStop(0.75, rgba(rgb, alpha * 0.18));
    g.addColorStop(1, rgba(rgb, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  // RIM LIGHT — the scene's key light comes from the UPPER-LEFT. Strokes a
  // rounded highlight arc hugging the upper-left of a circle of radius r at
  // (x, y): canvas angles PI*0.95 → PI*1.55 (left → past top). rgbOpt defaults
  // to PAL.rimWhite; use PAL.goldPale on gold-leaf, PAL.seaGlint on water.
  // For non-circular shapes, imitate it: a short light stroke / lightened band
  // along the shape's upper-left edge at the same alpha.
  function rimLightArc(ctx, x, y, r, alpha, rgbOpt) {
    if (!(r > 0) || !(alpha > 0)) return;
    ctx.save();
    ctx.strokeStyle = rgba(rgbOpt || PAL.rimWhite, alpha);
    ctx.lineWidth = Math.max(1, r * 0.14);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(x, y, r, Math.PI * 0.95, Math.PI * 1.55);
    ctx.stroke();
    ctx.restore();
  }

  // SOFT INNER SHADOW — darkens the inside rim of a disc (radius r at x, y),
  // heavier toward the bottom (the inner gradient circle is lifted slightly),
  // so filled discs stop looking like flat stickers. alpha = edge opacity.
  // Call AFTER the disc's base fill, BEFORE its rim stroke.
  function softInnerShadow(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    var g = ctx.createRadialGradient(x, y - r * 0.18, r * 0.5, x, y, r);
    g.addColorStop(0, rgba(PAL.indigoDeep, 0));
    g.addColorStop(0.72, rgba(PAL.indigoDeep, alpha * 0.25));
    g.addColorStop(1, rgba(PAL.indigoDeep, alpha));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832); ctx.fill();
  }

  // GOLD-LEAF BEVELED DISC — the §21 station-disc treatment in one call:
  // lacquer body gradient (lit top → deep bottom) + soft inner shadow +
  // upper-left rim light + a gold-leaf rim stroke that is bright on top and
  // deep at the bottom (real leaf, not a flat ring). fillRgb / rimRgb are
  // 'r,g,b' strings (defaults: PAL.indigo body, PAL.goldLeaf rim; pass
  // TERR[x].border via hexRGB() for territory-tinted rims). Draw the disc's
  // drop/contact shadow yourself first; draw glyphs/emoji/badges after.
  function bevelDisc(ctx, x, y, r, fillRgb, rimRgb) {
    if (!(r > 0)) return;
    fillRgb = fillRgb || PAL.indigo;
    rimRgb = rimRgb || PAL.goldLeaf;
    ctx.save();
    // lacquer body
    var g = ctx.createLinearGradient(0, y - r, 0, y + r);
    g.addColorStop(0, rgba(liftRGB(fillRgb, 24), 1));
    g.addColorStop(0.55, rgba(fillRgb, 1));
    g.addColorStop(1, rgba(liftRGB(fillRgb, -14), 1));
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
    ctx.fillStyle = g; ctx.fill();
    // depth
    softInnerShadow(ctx, x, y, r, 0.5);
    rimLightArc(ctx, x, y, r - Math.max(1.5, r * 0.14), 0.3);
    // gold-leaf rim: vertical leaf gradient on the stroke
    var rg = ctx.createLinearGradient(0, y - r, 0, y + r);
    rg.addColorStop(0, rgba(liftRGB(rimRgb, 36), 1));
    rg.addColorStop(0.5, rgba(rimRgb, 1));
    rg.addColorStop(1, rgba(liftRGB(rimRgb, -42), 1));
    ctx.beginPath(); ctx.arc(x, y, r, 0, 6.2832);
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.strokeStyle = rg;
    ctx.stroke();
    ctx.restore();
  }

  // GOLD GLINT — tiny 4-point sparkle (gold-leaf catching light). r = arm
  // length px (scaled). Use sparingly (1–2 per station disc, shimmer crests).
  function sparkle(ctx, x, y, r, alpha) {
    if (!(r > 0) || !(alpha > 0)) return;
    ctx.save();
    ctx.strokeStyle = rgba(PAL.goldPale, alpha);
    ctx.lineWidth = 1;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x - r, y); ctx.lineTo(x + r, y);
    ctx.moveTo(x, y - r); ctx.lineTo(x, y + r);
    ctx.stroke();
    ctx.restore();
  }

  // PAPER GRAIN — a subtle washi-fibre texture over a region. Builds a 96×96
  // deterministic fleck/fibre tile once (Park–Miller LCG, no Math.random) and
  // tiles it over (0,0,w,h) at the given alpha. Keep alpha LOW (0.03–0.08 over
  // the ground; up to 0.12 inside a lit pool). The TILE is cached module-wide
  // and the CanvasPattern is cached PER CONTEXT (ctx._prsGrain) so the same
  // helper serves both the live ctx and the offscreen ground-cache ctx.
  // No-ops outside a browser.
  var _grainTile = null;
  function paperTexture(ctx, w, h, alpha) {
    if (!(w > 0) || !(h > 0) || !(alpha > 0)) return;
    if (!_grainTile) {
      if (typeof document === 'undefined') return;
      var pc = document.createElement('canvas');
      pc.width = 96; pc.height = 96;
      var g = pc.getContext('2d');
      if (!g) return;
      var seed = 48271, i, x0, y0, len;
      var nx = function () { seed = (seed * 16807) % 2147483647; return seed; };
      // pale washi flecks + dark ink flecks
      for (i = 0; i < 300; i++) {
        x0 = nx() % 96; y0 = nx() % 96;
        g.fillStyle = (nx() % 100 < 58) ? rgba(PAL.washiWarm, 0.5) : rgba(PAL.shadow, 0.5);
        g.fillRect(x0, y0, 1, 1);
      }
      // a few longer horizontal fibres
      g.strokeStyle = rgba(PAL.washiWarm, 0.28);
      g.lineWidth = 1;
      for (i = 0; i < 14; i++) {
        x0 = nx() % 96; y0 = nx() % 96; len = 3 + (nx() % 7);
        g.beginPath();
        g.moveTo(x0, y0 + 0.5); g.lineTo(x0 + len, y0 + 0.5);
        g.stroke();
      }
      _grainTile = pc;
    }
    var pat = ctx._prsGrain || (ctx._prsGrain = ctx.createPattern(_grainTile, 'repeat'));
    if (!pat) return;
    ctx.save();
    ctx.globalAlpha *= alpha;
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // LONG CAST SHADOW (spec §2 lighting) — a soft directional shadow stretching
  // away from the low sun, drawn UNDER a pawn/station in addition to its round
  // contact shadow. (x, y) = ground point; wpx = the caster's footprint width
  // in FINAL px. Direction/length/alpha all come off the per-frame LIGHT rig,
  // so every shadow in the scene always agrees; no-ops at midday and at night
  // (unless the dusk grade keeps a low evening light alive). Pure light — safe
  // under reduced motion (it doesn't move within a frame).
  function longShadow(ctx, x, y, wpx, alphaMul) {
    var a = LIGHT.shadowA * (alphaMul == null ? 1 : alphaMul);
    if (a <= 0.004 || !(wpx > 0)) return;
    var len = wpx * (0.8 + 2.4 * LIGHT.shadowLen);           // low sun = long stretch
    var half = len * 0.5 + wpx * 0.35;
    var cx2 = x + LIGHT.shadowDirX * len * 0.5;
    ctx.save();
    ctx.translate(cx2, y);
    ctx.scale(1, clamp((wpx * 0.20) / half, 0.05, 0.6));     // flatten onto the ground
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, half);
    g.addColorStop(0, rgba(PAL.shadow, a));
    g.addColorStop(0.6, rgba(PAL.shadow, a * 0.5));
    g.addColorStop(1, rgba(PAL.shadow, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, half, 0, 6.2832); ctx.fill();
    ctx.restore();
  }

  // SMOOTH NIGHT FACTOR — 0 in full day → 1 in full night, easing over the
  // hour around the lantern thresholds (binary isNight() stays the gate for
  // on/off decisions; use this to GRADE lantern/light-pool strength so dusk
  // lights fade in instead of popping). Pass sim.clockMin; if the sim is not
  // in minute mode, fall back to (view.night ? 1 : 0) yourself.
  function nightAmount(clockMin) {
    if (typeof clockMin !== 'number') return 0;
    var m = clamp(clockMin, SKY_MIN, SKY_MAX);
    var dawn = 1 - smoothstep((m - 270) / 120);   // 1 before 04:30 → 0 by 06:30
    var dusk = smoothstep((m - 1050) / 120);      // 0 before 17:30 → 1 by 19:30
    return dawn > dusk ? dawn : dusk;
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
  // §21 SCALE: the module `scale` is refreshed here every frame — from
  // view.scale when app.js provides it, else derived from the stage size
  // (1.0 at the old ~1000×560 stage, capped at 1.7 on the enlarged ~74vh /
  // wrap-1500 stage). Layers multiply SIZES by it, never positions.
  // =========================================================================
  function scene(ctx, sim, t, view) {
    _lang = view.lang || 'en';
    scale = (typeof view.scale === 'number' && view.scale > 0)
      ? view.scale
      : clamp(Math.min(view.w / 1000, view.h / 560), 1, 1.7);
    // sprite provider (spec §1): consumed ONLY when present AND ready; a broken
    // provider is disarmed once and the full procedural pawn path takes over.
    SPR = (!_sprBroken && typeof window !== 'undefined' && window.PRS_SPRITES &&
           window.PRS_SPRITES.ready && typeof window.PRS_SPRITES.get === 'function')
      ? window.PRS_SPRITES : null;
    lightFrame(sim, view);             // resolve the per-frame light rig (night/sun/shadows/dusk)
    var cam = camFrame(t, view);       // resolve the auto-cinematic camera (null = identity)

    ctx.clearRect(0, 0, view.w, view.h);
    // letterbox base under any pull-back (zoom < 1): the world shrinks but the
    // paper never shows a raw hole — drawn OUTSIDE the camera transform.
    ctx.fillStyle = rgba(PAL.indigoDeep, 1);
    ctx.fillRect(0, 0, view.w, view.h);

    ctx.save();                        // ---- WORLD (inside the one camera transform, spec §3) ----
    if (cam) {
      ctx.translate(cam.x, cam.y);
      ctx.scale(cam.zoom, cam.zoom);
      ctx.translate(-cam.x, -cam.y);
    }
    drawGround(ctx, sim, t, view);       // 1  island base (offscreen-cached) + grass + vignette + banner
    drawSea(ctx, sim, t, view);          // 2  living water: bands, crests, reflections, spray
    drawSeaLife(ctx, sim, t, view);      // 3  gulls + jumping fish (deterministic from t)
    drawRoads(ctx, sim, t, view);        // 4  dashed ADJ segments, marching dashes
    drawCloudShadows(ctx, sim, t, view); // 4b drifting cloud shade over land+sea (day only)
    drawSky(ctx, sim, t, view);          // 5  day-phase light grade UNDER actors
    drawGuests(ctx, sim, t, view);       // 6  13 yukata pawns (gated by view.guestsVisible)
    drawBoat(ctx, sim, t, view);         // 7  skiff on the bay arc + pooled wakes
    drawStations(ctx, sim, t, view);     // 8  landmarks: halo tint, bevel disc, name, rings, lanterns
    drawStallMarkers(ctx, sim, t, view); // 8b report-on-stage: glow pulses where idle/rework accrued
    drawParticles(ctx, sim, t, view);    // 8c seasoning: chimney smoke, cook-steam, dusk fireflies
    drawFigures(ctx, sim, t, view);      // 9  11 duty-holders: shadow, pawn/sprite, aura, bubbles, chips
    drawMotes(ctx, sim, t, view);        // 10 handoff dots A→B + arrival pings
    drawCascade(ctx, sim, t, view);      // 11 red comet + ghosts + strikes (RM: static chain)
    ctx.restore();                       // ---- end WORLD / camera ----

    drawDusk(ctx, view);               // HUD 1: full-canvas evening unifier (view.dusk, outside cam)
    drawStamp(ctx, t, view);           // HUD 2: hanko grade stamp in the stage corner (view.stamp)
  }

  
  // ---- drawGround ----
  // ---- drawGround ----
function drawGround_ellipseBase(ctx, w, h) {
  // .sitemap background: radial-gradient(ellipse at 28% 18%, #1c2733, var(--indigo-deep) 72%) — style.css:222-224
  // richer pass: extra lacquer-depth stops (a lit near-peak + a mid tone + a deepened outer edge) so the
  // island reads as toned washi/lacquer terrain rather than a flat two-stop fill. Anchor stops (28,39,51
  // and indigoDeep@.72) are kept at their original CSS-matching positions.
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
  grad.addColorStop(0, 'rgb(32,44,57)');
  grad.addColorStop(0.30, 'rgb(28,39,51)');
  grad.addColorStop(0.58, rgba(PAL.indigo, 0.9));
  grad.addColorStop(0.72, rgba(PAL.indigoDeep, 1));
  grad.addColorStop(1, 'rgb(8,12,17)');
  ctx.fillStyle = grad;
  ctx.fillRect(-cx / rx, -cy / ry, w / rx, h / ry);
  ctx.restore();
}

function drawGround_contours(ctx, w, h) {
  // faint topographic hints — a few gently irregular concentric rings around the terrain's light-peak
  // (30%,25%), built from pure sin/cos harmonics (no RNG) so the frame is stable and cheap every redraw.
  // Reads as sketched elevation ink on washi, not literal cartography — kept very low alpha (restraint).
  var cx = w * 0.30, cy = h * 0.25;
  var rings = [0.11, 0.185, 0.27], steps = 26, ri, i, a, wob, rx, ry, qx, qy;
  ctx.save();
  ctx.lineWidth = 1 * scale;
  ctx.strokeStyle = rgba(PAL.goldDeep, 0.07);
  for (ri = 0; ri < rings.length; ri++) {
    rx = w * rings[ri];
    ry = h * rings[ri] * 1.2;
    ctx.beginPath();
    for (i = 0; i <= steps; i++) {
      a = (i / steps) * Math.PI * 2;
      wob = 1 + 0.09 * Math.sin(a * 3 + ri * 2.1) + 0.045 * Math.cos(a * 5 - ri * 1.4);
      qx = cx + Math.cos(a) * rx * wob;
      qy = cy + Math.sin(a) * ry * wob;
      if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
    }
    ctx.closePath();
    ctx.stroke();
  }
  ctx.restore();
}

function drawGround_ringField(ctx, w, h, cxFrac, cyFrac, period, alpha) {
  // .sitemap::before stipple: repeating-radial-gradient(circle at .., gold 0 1px, transparent 2px period) — style.css:225-229
  // period + lineWidth are reference-design px sizes -> scaled so the grain stays visually consistent
  // as the stage grows (§ART CONTRACT scale convention).
  var cx = w * cxFrac, cy = h * cyFrac;
  var dx = Math.max(cx, w - cx), dy = Math.max(cy, h - cy);
  var maxR = Math.sqrt(dx * dx + dy * dy);
  var per = period * scale;
  ctx.save();
  ctx.strokeStyle = rgba(PAL.gold, alpha);
  ctx.lineWidth = 1.3 * scale;
  var r = per;
  while (r <= maxR) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    r += per;
  }
  ctx.restore();
}

function drawGround_vignette(ctx, w, h) {
  // .sitemap::after: box-shadow: inset 0 0 90px 18px rgba(10,14,20,.55) — style.css:231-232
  // strengthened pass: deeper ink + slightly greater reach so the frame edges hold the eye in more
  // decisively; the outer box itself stays the full (0,0,w,h) canvas (a position, not scaled) while the
  // inset "spread" (vg) is a size and scales with the stage.
  var rgbStr = '8,11,16', a = 0.62, vg = (18 + 96) * scale;
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

// ---- LAND (visual-first-draft improvement: LAND must read as clearly different from OCEAN) ----
// LAND is the canvas's LEFT region (x <~0.55); OCEAN is the RIGHT (drawSea). The shoreline is the
// same gentle curve drawSea_traceShore already draws for the ocean fill.

// Builds ONE path — left edge + top + bottom of the canvas, with the right edge tracing the exact
// shoreline curve (calls drawSea_traceShore directly, never duplicates its control points) — so
// land and sea always meet with zero seam/gap. Begins its own ctx path; caller clips/fills/strokes.
function drawGround_landPath(ctx, w, h) {
  ctx.beginPath();
  ctx.moveTo(0, -0.02 * h);
  ctx.lineTo(w * 0.57, -0.02 * h);
  drawSea_traceShore(ctx, w, h);   // appends the shore curve as its own closed sub-path
  ctx.lineTo(0, 1.02 * h);
  ctx.lineTo(0, -0.02 * h);
  ctx.closePath();
}

// LAND grass-fleck / mottling texture — a second deterministic cached tile (Park-Miller LCG, no
// Math.random — same technique as paperTexture above) in earthy moss/mossLight/washiWarm dabs
// instead of paper fibres. Caller must already be clipped to the land region. Alpha kept low.
// Tile cached module-wide; the pattern per CONTEXT (ctx._prsLand) so the offscreen ground
// cache can build it too.
var _landGrainTile = null;
function drawGround_landTexture(ctx, w, h) {
  if (typeof document === 'undefined') return;
  if (!_landGrainTile) {
    var pc = document.createElement('canvas');
    pc.width = 110; pc.height = 110;
    var g = pc.getContext('2d');
    if (!g) return;
    var seed = 733459, i, x0, y0, r, pick;
    var nx = function () { seed = (seed * 16807) % 2147483647; return seed; };
    for (i = 0; i < 260; i++) {
      x0 = nx() % 110; y0 = nx() % 110; r = 0.6 + (nx() % 100) / 100;
      pick = nx() % 100;
      g.fillStyle = pick < 45 ? rgba(PAL.mossLight, 0.5) : (pick < 80 ? rgba(PAL.moss, 0.45) : rgba(PAL.washiWarm, 0.4));
      g.beginPath(); g.arc(x0, y0, r, 0, 6.2832); g.fill();
    }
    _landGrainTile = pc;
  }
  var pat = ctx._prsLand || (ctx._prsLand = ctx.createPattern(_landGrainTile, 'repeat'));
  if (!pat) return;
  ctx.save();
  ctx.globalAlpha *= 0.16;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// LAND fill — muted moss/olive + warm-earth gradient (lit upper-left -> deep lower-right, per the
// scene's upper-left key-light convention), clipped to drawGround_landPath, plus the grass-fleck
// texture. The ocean itself is never touched here — drawSea (clipped to its own path) keeps blue.
function drawGround_landFill(ctx, w, h) {
  ctx.save();
  drawGround_landPath(ctx, w, h);
  ctx.clip();

  var g = ctx.createLinearGradient(0, 0, w * 0.6, h);
  g.addColorStop(0, rgba(PAL.mossLight, 0.92));
  g.addColorStop(0.40, rgba(PAL.moss, 0.9));
  g.addColorStop(0.75, rgba(liftRGB(PAL.moss, -16), 0.94));
  g.addColorStop(1, rgba(liftRGB(PAL.moss, -28), 0.96));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // warm earthy pools — washi-toned, not neon; a sun-warmed clearing low, a gold catch upper-mid
  lightPool(ctx, w * 0.16, h * 0.84, 300 * scale, PAL.washiWarm, 0.10);
  lightPool(ctx, w * 0.30, h * 0.14, 220 * scale, PAL.gold, 0.06);

  drawGround_landTexture(ctx, w, h);
  ctx.restore();
}

// LAND coastline — a soft sandy strand hugging the SAME shore curve, clipped to the land side only
// (drawSea's own shallow-water fade handles the water side of the same line, so the two together
// read as one continuous strand where green land meets blue water).
function drawGround_landStrand(ctx, w, h) {
  ctx.save();
  drawGround_landPath(ctx, w, h);
  ctx.clip();
  ctx.beginPath();
  drawSea_traceShore(ctx, w, h);
  ctx.strokeStyle = rgba(PAL.washiWarm, 0.24);
  ctx.lineWidth = 26 * scale;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  drawSea_traceShore(ctx, w, h);
  ctx.strokeStyle = rgba(liftRGB(PAL.gold, 20), 0.30);
  ctx.lineWidth = 9 * scale;
  ctx.stroke();
  ctx.restore();
}

// ELEVATION BANDS + INLAND SHADOW (spec §2 layered terrain) — two broad, soft
// moss-dark diagonal bands across the land (higher ground reading as toned
// washi ink) + a cool inland shadow deepening the far-left interior, so the
// island rises toward the west instead of lying flat. Static — cached.
function drawGround_elevation(ctx, w, h) {
  ctx.save();
  drawGround_landPath(ctx, w, h);
  ctx.clip();
  // band 1: upland ridge upper-left
  var g1 = ctx.createLinearGradient(0, 0, w * 0.42, h * 0.55);
  g1.addColorStop(0, rgba(liftRGB(PAL.moss, -34), 0.34));
  g1.addColorStop(0.55, rgba(liftRGB(PAL.moss, -20), 0.12));
  g1.addColorStop(1, rgba(PAL.moss, 0));
  ctx.fillStyle = g1;
  ctx.fillRect(0, 0, w, h);
  // band 2: a softer mid-slope terrace across the lower land
  var g2 = ctx.createLinearGradient(w * 0.05, h * 1.0, w * 0.5, h * 0.55);
  g2.addColorStop(0, rgba(liftRGB(PAL.moss, -26), 0.22));
  g2.addColorStop(0.6, rgba(liftRGB(PAL.moss, -12), 0.08));
  g2.addColorStop(1, rgba(PAL.moss, 0));
  ctx.fillStyle = g2;
  ctx.fillRect(0, 0, w, h);
  // inland shadow: the interior deepens away from the shore light
  var g3 = ctx.createLinearGradient(0, 0, w * 0.3, 0);
  g3.addColorStop(0, rgba(PAL.shadow, 0.20));
  g3.addColorStop(1, rgba(PAL.shadow, 0));
  ctx.fillStyle = g3;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// WIND-BENT GRASS TUFTS (spec §2) — a dozen small sumi-stroke tufts at fixed
// land positions (hand-placed clear of stations/roads), each 3 blades bending
// on a slow shared wind with per-tuft phase. LIVE layer (not cached): the wind
// is motion — under reduced motion the tufts hold one gently-bent pose.
var GRASS = [
  [0.06, 0.30], [0.10, 0.52], [0.05, 0.68], [0.20, 0.92], [0.36, 0.90],
  [0.46, 0.76], [0.08, 0.13], [0.20, 0.18], [0.44, 0.30], [0.30, 0.68],
  [0.50, 0.90], [0.40, 0.12]
];
function drawGround_grass(ctx, t, view) {
  var i, b, gx, gy, hgt, bend, ph, blade, bx, tipX, tipY;
  ctx.save();
  ctx.lineCap = 'round';
  for (i = 0; i < GRASS.length; i++) {
    gx = px(GRASS[i][0], view); gy = py(GRASS[i][1], view);
    ph = (i * 0.61803398875) % 1;                      // deterministic per-tuft phase, no RNG
    bend = view.rm ? 0.4 : Math.sin(t * 0.9 + ph * 6.2832) * 0.55 + 0.25;   // wind: lean, never whip
    hgt = (6 + 3 * ((i * 0.37) % 1)) * scale;
    for (blade = -1; blade <= 1; blade++) {
      bx = gx + blade * 1.6 * scale;
      tipX = bx + (bend * 3.5 + blade * 0.9) * scale;
      tipY = gy - hgt * (1 - Math.abs(blade) * 0.22);
      ctx.beginPath();
      ctx.moveTo(bx, gy);
      ctx.quadraticCurveTo(bx + bend * 1.2 * scale, gy - hgt * 0.6, tipX, tipY);
      ctx.strokeStyle = (blade === 0) ? rgba(PAL.mossLight, 0.55) : rgba(liftRGB(PAL.moss, 18), 0.45);
      ctx.lineWidth = 1.1 * scale;
      ctx.stroke();
    }
    // an occasional gold seed-head catching the light (every third tuft)
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(gx + bend * 3.5 * scale, gy - hgt, 0.9 * scale, 0, 6.2832);
      ctx.fillStyle = rgba(PAL.goldDeep, 0.5);
      ctx.fill();
    }
  }
  ctx.restore();
}

// STATIC GROUND CACHE (plan S2 step 6) — everything in the ground stack that
// never changes between frames (base gradient, land fill, elevation, contours,
// stipple rings, strand, paper grain) is rendered ONCE into an offscreen
// canvas at the current dims×dpr and blitted per frame. Keyed on w/h/dpr/scale
// so any resize or DPR change rebuilds it. The LIVE pieces (grass wind,
// horizon glow, vignette, banner ring) stay per-frame on top.
var _groundCache = null, _groundKey = '';
function drawGround_static(gctx, w, h) {
  drawGround_ellipseBase(gctx, w, h);
  drawGround_landFill(gctx, w, h);
  drawGround_elevation(gctx, w, h);
  drawGround_contours(gctx, w, h);
  drawGround_ringField(gctx, w, h, 0.22, 0.30, 90, 0.05 * 0.55);
  drawGround_ringField(gctx, w, h, 0.28, 0.68, 110, 0.04 * 0.55);
  drawGround_landStrand(gctx, w, h);
  // grain lives in the cache (under the live glow/vignette — imperceptible at α.05)
  paperTexture(gctx, w, h, 0.05);
}

function drawGround(ctx, sim, t, view) {
  if (!view || !(view.w > 0) || !(view.h > 0)) return;
  var w = view.w, h = view.h;

  // 1. the static terrain stack — offscreen-cached (rebuilt on resize/DPR/scale change)
  var key = w + 'x' + h + '@' + _dpr + '/' + scale.toFixed(4);
  if (typeof document !== 'undefined') {
    if (!_groundCache || _groundKey !== key) {
      var oc = _groundCache || document.createElement('canvas');
      oc.width = Math.max(1, Math.round(w * _dpr));
      oc.height = Math.max(1, Math.round(h * _dpr));
      var gctx = oc.getContext('2d');
      if (gctx) {
        gctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
        gctx.clearRect(0, 0, w, h);
        drawGround_static(gctx, w, h);
        _groundCache = oc; _groundKey = key;
      }
    }
    if (_groundCache) ctx.drawImage(_groundCache, 0, 0, w, h);
    else drawGround_static(ctx, w, h);
  } else {
    drawGround_static(ctx, w, h);
  }

  // 2. wind-bent grass tufts (live: the wind moves; RM holds a bent pose)
  drawGround_grass(ctx, t, view);

  // 3. subtle warm horizon glow, low on the map — an ambient light suggestion (not a lantern), centred
  // just below the visible frame so only its upper arc grazes the shoreline. Graded by the LIGHT rig: a
  // quiet sunset/sunrise held-core warmth that peaks mid dawn/dusk transition, recedes at full day/night.
  var duskDawn = Math.sin(clamp(LIGHT.night, 0, 1) * Math.PI); // 0 at full day/full night, peaks mid-transition
  lightPool(ctx, w * 0.56, h * 1.03, 250 * scale, PAL.gold, 0.035 + 0.07 * duskDawn);

  // 4. inner vignette, strengthened (style.css .sitemap::after)
  drawGround_vignette(ctx, w, h);

  // 5. blocked-state inset ring (style.css .sitemap.blocked), gated on sim.bannerOn
  if (sim && sim.bannerOn) {
    var lw = 3 * scale, inset = lw / 2;
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = rgba(PAL.hanko, 0.55);
    ctx.strokeRect(inset, inset, w - lw, h - lw);
    ctx.restore();
  }
}


  // ---- drawSea ----
// NEW GEOGRAPHY (map redesign, first draft): LAND on the LEFT, OCEAN on the RIGHT. The
// shoreline is a gently curved edge near x=0.55, passing just seaward of the port station
// (0.50,0.55) so the port reads as the water's edge.
function drawSea_traceShore(ctx, w, h) {
  // trace the shoreline top->bottom into the CURRENT path (no beginPath here) so the ocean
  // fill, the ink wet-line, the foam glow and the dashed foam all share one curve.
  ctx.moveTo(w * 0.57, -0.02 * h);
  ctx.quadraticCurveTo(w * 0.555, 0.25 * h, w * 0.53, 0.52 * h);
  ctx.quadraticCurveTo(w * 0.512, 0.78 * h, w * 0.575, 1.02 * h);
}

function drawSea_oceanPath(ctx, w, h) {
  // closed ocean silhouette: down the shoreline, out past the right edge and back
  ctx.beginPath();
  drawSea_traceShore(ctx, w, h);
  ctx.lineTo(w * 1.05, 1.02 * h);
  ctx.lineTo(w * 1.05, -0.02 * h);
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

// gentle animated wave line across the bay box; baseY/amp/lw are already-resolved px values.
function drawSea_waveLine(ctx, x0, bw, baseY, amp, speed, phase, t, rgb, alpha, lw) {
  if (alpha <= 0 || lw <= 0) return;
  var steps = 6, i, xx, yy;
  ctx.beginPath();
  for (i = 0; i <= steps; i++) {
    xx = x0 + bw * (i / steps);
    yy = baseY + Math.sin(t * speed + phase + i * 0.85) * amp;
    if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
  }
  ctx.strokeStyle = rgba(rgb, alpha);
  ctx.lineWidth = lw;
  ctx.lineCap = 'round';
  ctx.stroke();
}

// FOAM CRESTS (spec §2 living water) — one or two short pale whitecap licks
// drifting along a wave band, appearing where the band "crests" and fading
// out. Deterministic from t; the caller skips the whole family under RM.
function drawSea_crests(ctx, x0, bw, baseY, amp, speed, phase, t, alpha) {
  var j, drift, cx2, cy2, a2;
  for (j = 0; j < 2; j++) {
    drift = ((t * 0.017 + j * 0.47 + phase * 0.11) % 1 + 1) % 1;
    cx2 = x0 + bw * drift;
    cy2 = baseY + Math.sin(t * speed + phase + drift * 6 * 0.85) * amp - 1.2 * scale;
    a2 = alpha * Math.max(0, Math.sin((t * 0.55 + j * 2.3 + phase) % 6.2832));  // slow appear/fade
    if (a2 <= 0.015) continue;
    ctx.beginPath();
    ctx.moveTo(cx2 - 5 * scale, cy2 + 1 * scale);
    ctx.quadraticCurveTo(cx2, cy2 - 1.6 * scale, cx2 + 5 * scale, cy2 + 0.6 * scale);
    ctx.strokeStyle = rgba(PAL.rimWhite, a2);
    ctx.lineWidth = 1.2 * scale;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
}

// LIGHT REFLECTION COLUMN (spec §2: station/lantern reflections that shimmer) —
// a stack of short horizontal dashes descending from a light source at the
// water's edge, widths thinning and alpha fading with depth, x wobbling on t.
// Under RM the dashes hold still (the LIGHT stays; the shimmer motion stops).
function drawSea_lightColumn(ctx, x, yTop, len, rgb, alpha, t, seedPh, rm) {
  if (!(len > 0) || !(alpha > 0)) return;
  var n = 7, i, kk, yy, ww, ax, wob;
  ctx.save();
  for (i = 0; i < n; i++) {
    kk = i / (n - 1);
    yy = yTop + len * kk + i * 0.6 * scale;
    wob = rm ? 0 : Math.sin(t * 1.4 + seedPh + i * 1.9) * (1.5 + 2.5 * kk) * scale;
    ww = (9 - 5 * kk) * scale * (0.75 + 0.35 * Math.sin(seedPh + i * 1.7 + (rm ? 0 : t * 1.1)));
    ax = alpha * (1 - kk * 0.85) * (rm ? 0.8 : (0.65 + 0.35 * Math.sin(t * 1.7 + i * 2.3 + seedPh)));
    if (ax <= 0.012 || ww <= 0) continue;
    ctx.fillStyle = rgba(rgb, ax);
    ctx.fillRect(x - ww / 2 + wob, yy, ww, 1.2 * scale);
  }
  ctx.restore();
}

// SEA SPRAY at the iso rock (spec §2 particles — seasoning, not weather):
// three droplets per slow cycle arcing off the rock's seaward edge. Pure
// function of t, fixed count. Skipped entirely under RM (pure motion).
function drawSea_spray(ctx, t, view) {
  var cx = px(0.82, view), cy = py(0.72, view);
  var i, ph, k, sx, sy, a;
  for (i = 0; i < 3; i++) {
    ph = ((t / 3.7 + i * 0.333) % 1 + 1) % 1;
    if (ph > 0.42) continue;                       // droplets live in the first 42% of each cycle
    k = ph / 0.42;
    sx = cx + (26 + i * 5) * scale + k * (8 + i * 3) * scale;
    sy = cy - 2 * scale - Math.sin(k * Math.PI) * (9 + i * 2) * scale;
    a = (1 - k) * 0.5;
    ctx.beginPath();
    ctx.arc(sx, sy, (1.4 - k * 0.7) * scale, 0, 6.2832);
    ctx.fillStyle = rgba(PAL.seaGlint, a);
    ctx.fill();
  }
}

function drawSea(ctx, sim, t, view) {
  if (!view || !view.w || !view.h) return;
  var w = view.w, h = view.h;
  // NEW GEOGRAPHY ocean layout box: from just left of the shoreline (x=0.50) out past the
  // right edge, full height — layout box, NOT scaled
  var x0 = 0.50 * w, y0 = -0.02 * h, bw = 0.57 * w, bh = 1.04 * h;

  // graded night factor off the shared per-frame LIGHT rig (dawn/dusk fade instead
  // of a hard isNight() pop; also carries the view.dusk report-stage floor).
  var nightK = LIGHT.night;

  ctx.save();
  drawSea_oceanPath(ctx, w, h);
  ctx.clip();

  // ---- base deep-to-shallow fill: deep open ocean at the RIGHT, fading out over the beach
  // band at the shore (the trench/shelf passes below reuse the same flipped axis) ----
  var gp = drawSea_gradLine(x0, y0, bw, bh, 260);
  var grad = ctx.createLinearGradient(gp.x1, gp.y1, gp.x2, gp.y2);
  grad.addColorStop(0, rgba(PAL.seaDeep, 1));
  grad.addColorStop(0.46, rgba(PAL.seaMid, 0.85));
  grad.addColorStop(0.72, rgba(PAL.seaMid, 0.45));
  grad.addColorStop(0.92, rgba(PAL.indigo, 0.1));
  grad.addColorStop(1, rgba(PAL.indigo, 0));
  ctx.fillStyle = grad;
  ctx.fillRect(x0, y0, bw, bh);

  // ---- NEW: extra depth read — a darker trench toward open sea, a lifted teal shelf toward shore ----
  var trench = ctx.createLinearGradient(gp.x1, gp.y1, gp.x2, gp.y2);
  trench.addColorStop(0, rgba(PAL.indigoDeep, 0.30));
  trench.addColorStop(0.28, rgba(PAL.seaDeep, 0.14));
  trench.addColorStop(0.5, rgba(PAL.seaDeep, 0));
  ctx.fillStyle = trench;
  ctx.fillRect(x0, y0, bw, bh);

  var shelfRgb = liftRGB(PAL.seaMid, 34);
  var shelf = ctx.createLinearGradient(gp.x1, gp.y1, gp.x2, gp.y2);
  shelf.addColorStop(0.55, rgba(shelfRgb, 0));
  shelf.addColorStop(0.78, rgba(shelfRgb, 0.16));
  shelf.addColorStop(0.95, rgba(shelfRgb, 0.06));
  shelf.addColorStop(1, rgba(shelfRgb, 0));
  ctx.fillStyle = shelf;
  ctx.fillRect(x0, y0, bw, bh);

  // ---- inner shadow along the open-ocean (right) edge; the curved shore side instead gets
  // an ink wet-line stroked on the shoreline further below ----
  var deepShadow = ctx.createLinearGradient(x0 + bw - 32 * scale, 0, x0 + bw, 0);
  deepShadow.addColorStop(0, rgba(PAL.indigoDeep, 0));
  deepShadow.addColorStop(1, rgba(PAL.indigoDeep, 0.55));
  ctx.fillStyle = deepShadow;
  ctx.fillRect(x0, y0, bw, bh);

  // darken the whole band at night — graded by nightAmount() instead of popping at isNight()'s threshold
  if (nightK > 0) {
    ctx.fillStyle = rgba(PAL.indigoDeep, 0.32 * nightK);
    ctx.fillRect(x0, y0, bw, bh);
  }

  // ---- NEW: moonlit seaGlint accents + a warm dockside lantern reflection (night only) ----
  if (nightK > 0.02) {
    var mgPos = [[0.35, 0.30], [0.58, 0.55], [0.45, 0.78]];   // fractions of the ocean box — open water, clear of the shore
    for (var mi = 0; mi < mgPos.length; mi++) {
      var mgx = x0 + bw * mgPos[mi][0], mgy = y0 + bh * mgPos[mi][1];
      var twinkle = view.rm ? 0.75 : (0.5 + 0.5 * Math.sin(t * 1.3 + mi * 2.1));
      radialGlow(ctx, mgx, mgy, (5 + 2 * twinkle) * scale, PAL.seaGlint, 0.32 * nightK * twinkle);
    }
    lightPool(ctx, px(DOCK.x, view), py(DOCK.y, view), 28 * scale, PAL.lantern, 0.22 * nightK);
  }

  // ---- NEW: soft rim of light along the water's upper edge (bay isn't circular, so the upper-left
  // key light is faked as a band along its top edge, per the rim-light convention; PAL.seaGlint on water) ----
  var rimH = 15 * scale;
  var rimGrad = ctx.createLinearGradient(0, y0, 0, y0 + rimH);
  rimGrad.addColorStop(0, rgba(PAL.seaGlint, 0.20 * (1 - nightK * 0.45)));
  rimGrad.addColorStop(1, rgba(PAL.seaGlint, 0));
  ctx.fillStyle = rimGrad;
  ctx.fillRect(x0, y0, bw, rimH);

  // ---- living water (spec §2): three gentle wave bands drifting across the bay, each
  // carrying an occasional pale foam crest (skip under reduced motion — pure wave motion) ----
  if (!view.rm) {
    drawSea_waveLine(ctx, x0, bw, y0 + bh * 0.16, 2 * scale, 0.8, 3.1, t, PAL.gold, 0.04 * (1 - nightK * 0.6), 1 * scale);
    drawSea_waveLine(ctx, x0, bw, y0 + bh * 0.16, 2 * scale, 0.8, 3.1, t, PAL.seaGlint, 0.05 * nightK, 1 * scale);
    drawSea_waveLine(ctx, x0, bw, y0 + bh * 0.34, 2.5 * scale, 0.7, 0, t, PAL.gold, 0.05 * (1 - nightK * 0.6), 1 * scale);
    drawSea_waveLine(ctx, x0, bw, y0 + bh * 0.34, 2.5 * scale, 0.7, 0, t, PAL.seaGlint, 0.06 * nightK, 1 * scale);
    drawSea_waveLine(ctx, x0, bw, y0 + bh * 0.62, 3 * scale, 0.55, 1.7, t, PAL.gold, 0.045 * (1 - nightK * 0.6), 1 * scale);
    drawSea_waveLine(ctx, x0, bw, y0 + bh * 0.62, 3 * scale, 0.55, 1.7, t, PAL.seaGlint, 0.05 * nightK, 1 * scale);
    drawSea_crests(ctx, x0, bw, y0 + bh * 0.34, 2.5 * scale, 0.7, 0, t, 0.30);
    drawSea_crests(ctx, x0, bw, y0 + bh * 0.62, 3 * scale, 0.55, 1.7, t, 0.26);
  }

  // ---- shore-light reflections shimmering on the water (spec §2). Columns descend from
  // the lights that actually sit at the water's edge: the port lantern, the iso-rock
  // station lantern (both graded by night), and the low sun/moon glow when it hangs over
  // the ocean (dawn keeps it over land — nothing reflects; dusk pours gold on the water).
  // Drawn inside the ocean clip so the land never catches a reflection. ----
  var refA = 0.10 + 0.16 * nightK;
  drawSea_lightColumn(ctx, px(0.52, view) + 10 * scale, py(0.56, view) + 12 * scale, 60 * scale,
    nightK > 0.4 ? PAL.lantern : PAL.gold, refA, t, 0.7, view.rm);
  drawSea_lightColumn(ctx, px(0.82, view), py(0.72, view) + 14 * scale, 46 * scale,
    nightK > 0.4 ? PAL.lantern : PAL.gold, refA * 0.85, t, 2.9, view.rm);
  if (LIGHT.sunX > 0.62) {
    var glowRef = drawSky_mix(PAL.gold, PAL.seaGlint, nightK);
    drawSea_lightColumn(ctx, LIGHT.sunX * w, y0 + bh * 0.30, bh * 0.5,
      glowRef, 0.10 + 0.10 * LIGHT.shadowLen, t, 5.3, view.rm);
  }

  // ---- animated diagonal gold shimmer stripes (byte-faithful; sizes + march offset scaled together),
  // with an occasional sparkle() where a stripe crests (skip under reduced motion) ----
  var rad105 = 105 * Math.PI / 180, sdx = Math.sin(rad105), sdy = -Math.cos(rad105);
  var ang = Math.atan2(sdy, sdx);
  var diag = Math.sqrt(bw * bw + bh * bh);
  var period = 9 * scale, stripe = 2 * scale, speed = 10 * scale;
  var offset = view.rm ? 0 : (t * speed) % period;
  ctx.save();
  ctx.translate(x0 + bw / 2, y0 + bh / 2);
  ctx.rotate(ang);
  var stripeIdx = 0;
  for (var sx = -diag - period; sx <= diag + period; sx += period) {
    ctx.fillStyle = rgba(PAL.gold, 0.05); // stripe alpha .10 * layer opacity .5 (re-set each pass — sparkle() below may repaint fillStyle)
    ctx.fillRect(sx + offset, -diag, stripe, diag * 2);
    if (!view.rm) {
      var crestPhase = Math.sin(t * 0.6 + stripeIdx * 1.7);
      if (crestPhase > 0.9) {
        var frac = (stripeIdx * 0.61803398875) % 1;      // deterministic low-discrepancy scatter, no RNG
        var crestY = (frac - 0.5) * diag * 1.3;
        ctx.save();
        sparkle(ctx, sx + offset, crestY, 3 * scale, (crestPhase - 0.9) * 6);
        ctx.restore();
      }
    }
    stripeIdx++;
  }
  ctx.restore();

  // ---- soft ink wet-line where the water meets the sand (stroked on the shore curve while
  // the clip still holds, so only the waterside half of the stroke survives) ----
  ctx.save();
  ctx.beginPath();
  drawSea_traceShore(ctx, w, h);
  ctx.strokeStyle = rgba(PAL.indigoDeep, 0.35);
  ctx.lineWidth = 5 * scale;
  ctx.stroke();
  ctx.restore();

  ctx.restore(); // drop the ocean-shape clip

  // ---- gold foam hugging the curved shoreline: a soft glow band + the crisp dashed line on
  // top (the shore/foam is now the LEFT edge of the water, near x=0.55) ----
  ctx.save();
  ctx.lineCap = 'round';
  ctx.beginPath();
  drawSea_traceShore(ctx, w, h);
  ctx.strokeStyle = rgba(PAL.gold, 0.1);
  ctx.lineWidth = 14 * scale;
  ctx.stroke();
  ctx.beginPath();
  drawSea_traceShore(ctx, w, h);
  ctx.strokeStyle = rgba(PAL.gold, 0.4);
  ctx.lineWidth = 2.5 * scale;
  ctx.setLineDash([9 * scale, 10 * scale]);
  ctx.stroke();
  ctx.restore();

  // ---- NEW GEOGRAPHY ocean scenery: the iso rock islet + Kimura-san's jigging boat ----
  drawSea_isoRock(ctx, t, view, nightK);
  if (!view.rm) drawSea_spray(ctx, t, view);   // sea spray licking off the rock (pure motion — RM skips)
  drawSea_kimura(ctx, t, view, nightK);
}

// NEW GEOGRAPHY: small rocky islet under the iso/vessel station (0.82,0.72) — a dark lacquer
// rock silhouette with a gold foam ring lapping it. Pure ocean scenery: drawStations draws the
// station disc/label on top of it later in the frame.
function drawSea_isoRock(ctx, t, view, nightK) {
  var cx = px(0.82, view), cy = py(0.72, view);
  var rx = 34 * scale, ry = 13 * scale, steps = 18, i, a, wob, qx, qy;
  ctx.save();
  // foam ring lapping the rock (dashed, matching the shoreline foam)
  ctx.beginPath();
  ctx.ellipse(cx, cy + 2 * scale, rx * 1.25, ry * 1.45, 0, 0, 6.2832);
  ctx.strokeStyle = rgba(PAL.gold, 0.3);
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([7 * scale, 8 * scale]);
  ctx.stroke();
  ctx.setLineDash([]);
  // rock silhouette — irregular ellipse from sin/cos harmonics (deterministic, no RNG)
  ctx.beginPath();
  for (i = 0; i <= steps; i++) {
    a = (i / steps) * 6.2832;
    wob = 1 + 0.16 * Math.sin(a * 3 + 0.7) + 0.09 * Math.cos(a * 5);
    qx = cx + Math.cos(a) * rx * wob;
    qy = cy + Math.sin(a) * ry * wob - (Math.sin(a) < 0 ? 4 * scale : 0); // lift the crown a touch
    if (i === 0) ctx.moveTo(qx, qy); else ctx.lineTo(qx, qy);
  }
  ctx.closePath();
  var rg = ctx.createLinearGradient(0, cy - ry - 6 * scale, 0, cy + ry);
  rg.addColorStop(0, '#3a4450');
  rg.addColorStop(0.55, '#242c35');
  rg.addColorStop(1, '#12171d');
  ctx.fillStyle = rg;
  ctx.fill();
  ctx.lineWidth = 1 * scale;
  ctx.strokeStyle = rgba(PAL.ink, 0.4);
  ctx.stroke();
  // upper-left key-light lick on the crown; a touch cooler/brighter under moonlight
  ctx.beginPath();
  ctx.moveTo(cx - rx * 0.55, cy - ry * 0.5);
  ctx.quadraticCurveTo(cx - rx * 0.15, cy - ry * 1.35, cx + rx * 0.2, cy - ry * 0.85);
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.22 + 0.1 * nightK);
  ctx.lineWidth = 1.3 * scale;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.restore();
}

// NEW GEOGRAPHY: Kimura-san's jigging boat — purely decorative scenery far out in the open
// ocean at (0.92,0.90). Jigging = mostly stationary: it bobs/rocks in place (sin of t), works
// a tiny nodding jig rod, and carries a draft label. Not engine-driven; stilled under view.rm.
function drawSea_kimura(ctx, t, view, nightK) {
  var cx = px(0.92, view), cy = py(0.90, view);
  var bobY = view.rm ? 0 : Math.sin(t * 2 * Math.PI / 3.8) * 1.2 * scale;
  var rot = view.rm ? 0 : Math.sin(t * 2 * Math.PI / 5.1) * (2.5 * Math.PI / 180);
  contactShadow(ctx, cx, cy + 3 * scale, 22 * scale, 6 * scale, 0.28);
  ctx.save();
  ctx.translate(cx, cy + bobY);
  ctx.rotate(rot);
  // warm stern lantern at night
  if (nightK > 0.02) lightPool(ctx, 0, -2 * scale, 8 * scale, PAL.lantern, 0.25 * nightK);
  // little hull — reuses the skiff hull path at ~70% of Nobu-san's dims
  drawBoat_hullPath(ctx, -9 * scale, -1.5 * scale, 18 * scale, 5 * scale,
    1 * scale, 3.5 * scale, 1.5 * scale, 1 * scale);
  var hg = ctx.createLinearGradient(0, -1.5 * scale, 0, 3.5 * scale);
  hg.addColorStop(0, '#3d4854');
  hg.addColorStop(1, '#12171d');
  ctx.fillStyle = hg;
  ctx.fill();
  ctx.strokeStyle = rgba(PAL.goldLeaf, 0.5);
  ctx.lineWidth = 0.8 * scale;
  ctx.beginPath();
  ctx.moveTo(-7.5 * scale, -0.4 * scale);
  ctx.lineTo(7.5 * scale, -0.4 * scale);
  ctx.stroke();
  // Kimura: tiny seated pawn amidships (sea-ink coat, skin head)
  ctx.fillStyle = 'rgb(' + PAL.seaInk + ')';
  roundRect(ctx, -2.5 * scale, -8 * scale, 5 * scale, 6.5 * scale, 2 * scale);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -9.5 * scale, 2 * scale, 0, 6.2832);
  ctx.fillStyle = rgba(PAL.skin, 1);
  ctx.fill();
  // jig rod off the bow, nodding on a slow jigging rhythm; line droops to a lure glint
  var nod = view.rm ? 0 : Math.sin(t * 2 * Math.PI / 1.9) * 0.06;
  var ang = -0.62 + nod;
  var rodLen = 11 * scale;
  var tipX = 2.5 * scale + rodLen * Math.cos(ang);
  var tipY = -6 * scale + rodLen * Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(2.5 * scale, -6 * scale);
  ctx.lineTo(tipX, tipY);
  ctx.strokeStyle = rgba(PAL.goldDeep, 0.85);
  ctx.lineWidth = 1 * scale;
  ctx.lineCap = 'round';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.quadraticCurveTo(tipX + 1.5 * scale, tipY * 0.4, tipX + 0.8 * scale, 1 * scale);
  ctx.strokeStyle = rgba(PAL.gold, 0.35);
  ctx.lineWidth = 0.6 * scale;
  ctx.stroke();
  if (!view.rm) sparkle(ctx, tipX + 0.8 * scale, 1 * scale, 2 * scale, 0.4 + 0.3 * Math.sin(t * 3.1));
  ctx.restore();
  // draft label (scaled chip, world space)
  chip(ctx, cx, cy + 8 * scale, (_lang === 'ja' ? 'きむらさん 🎣' : 'Kimura-san 🎣'), {
    font: '600 ' + Math.round(9 * scale) + 'px system-ui,sans-serif',
    pad: 3 * scale, h: 12 * scale, r: 2 * scale, alpha: 0.85
  });
}


  // ---- drawSeaLife ----
// ---- drawSeaLife (enriched) ----
function drawSeaLife_gull(ctx, gx, gy, span, bodyAlpha, altK) {
  // faint altitude-graded shadow first (bolder/tighter near the baseline, soft & small when high)
  var shW = lerp(span * 1.65, span * 1.0, altK);
  var shH = lerp(span * 0.5, span * 0.28, altK);
  var shA = lerp(0.2, 0.06, altK);
  contactShadow(ctx, gx + span * 0.15, gy + span * 0.95, shW, shH, shA);

  // crisp wing silhouette
  var th = 1.7 * scale;
  ctx.beginPath();
  ctx.moveTo(gx - span, gy);
  ctx.quadraticCurveTo(gx - span * 0.5, gy - span * 0.82, gx, gy);
  ctx.quadraticCurveTo(gx + span * 0.5, gy - span * 0.82, gx + span, gy);
  ctx.lineWidth = th;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(PAL.gold, bodyAlpha);
  ctx.stroke();

  // upper-left key-light rim highlight on the near wing only
  ctx.beginPath();
  ctx.moveTo(gx - span * 0.92, gy - span * 0.08);
  ctx.quadraticCurveTo(gx - span * 0.46, gy - span * 0.88, gx - span * 0.06, gy - span * 0.1);
  ctx.lineWidth = th * 0.42;
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(PAL.goldPale, bodyAlpha * 0.65);
  ctx.stroke();
}

function drawSeaLife_splash(ctx, x, y, rx, ry, alpha) {
  if (rx <= 0 || ry <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(1, ry / rx);
  ctx.beginPath();
  ctx.arc(0, 0, rx, 0, 6.2832);
  ctx.lineWidth = Math.max(0.55, rx * 0.22);
  ctx.strokeStyle = rgba(PAL.seaGlint, alpha);
  ctx.stroke();
  ctx.restore();
}

function drawSeaLife(ctx, sim, t, view) {
  if (!view || view.rm) return;
  ctx.save();                                        // isolate lineWidth/lineCap/stroke so they can't bleed into drawRoads
  var w = view.w, h = view.h;
  var gi, period, delay, local, k, xPct, gx, topPct, yOff, gy, altK, span;
  var fi, fdelay, flocal, fk, segK, segT, op, dy, sc, fxPct, fyPct, fx, fyBase, fy, r;
  var splashK, ringR, dropT, dOp, dDX, dDY, dr;

  // GULLS: sweep left->right, per-gull period 17+gi*4s, phase -gi*5.5s (CSS negative
  // animation-delay == already advanced by that much), sin y-bob, top band 8/17/26%.
  for (gi = 0; gi < GULLS; gi++) {
    period = 17 + gi * 4;
    delay = gi * 5.5;
    local = t + delay;
    k = local % period; if (k < 0) k += period; k = k / period;
    xPct = lerp(50, 112, k);   // NEW GEOGRAPHY: sweep across the right-side ocean, not the land
    gx = w * xPct / 100;
    topPct = 8 + gi * 9;
    yOff = -11 * scale * Math.sin(k * Math.PI);
    gy = h * topPct / 100 + yOff;
    altK = clamp(-yOff / (11 * scale), 0, 1);        // 0 = low/near baseline (bold shadow), 1 = apex (faint/small)
    span = 5.5 * scale;
    drawSeaLife_gull(ctx, gx, gy, span, 0.55, altK);
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
      op = lerp(0, 0.85, segT); dy = lerp(0, -11 * scale, segT); sc = lerp(0.5, 1, segT);
    } else if (segK <= 0.7143) {
      segT = (segK - 0.2857) / 0.4286;
      op = lerp(0.85, 0.6, segT); dy = lerp(-11 * scale, -3 * scale, segT); sc = lerp(1, 0.85, segT);
    } else {
      segT = (segK - 0.7143) / 0.2857;
      op = lerp(0.6, 0, segT); dy = lerp(-3 * scale, 2 * scale, segT); sc = lerp(0.85, 0.5, segT);
    }
    fxPct = 62 + fi * 10;   // NEW GEOGRAPHY: splash in the open ocean, right of the shoreline
    fyPct = 26 + fi * 14;
    fx = w * fxPct / 100;
    fyBase = h * fyPct / 100;
    fy = fyBase + dy;
    r = 2.5 * sc * scale;

    // splash ring (+ occasional sparkle) right at the water-line crossing (|dy| small == surface
    // contact) — fires once near jump-out and once near splash-back-in, purely a function of dy.
    splashK = clamp(1 - Math.abs(dy) / (4.2 * scale), 0, 1);
    if (splashK > 0.02) {
      ringR = (2.2 + 2.8 * splashK) * scale;
      drawSeaLife_splash(ctx, fx, fyBase, ringR, ringR * 0.38, splashK * 0.5);
      if (splashK > 0.6) sparkle(ctx, fx + ringR * 0.55, fyBase - ringR * 0.18, 1.3 * scale, (splashK - 0.6) * 0.9);
    }

    // a droplet flicked up on the exit jump, arcing to the upper-left, fading fast
    if (segK < 0.4) {
      dropT = segK / 0.4;
      dOp = (1 - dropT) * 0.55;
      dDX = 3.2 * scale;
      dDY = -7 * scale * Math.sin(dropT * Math.PI);
      dr = lerp(1.3 * scale, 0.5 * scale, dropT);
      ctx.beginPath();
      ctx.arc(fx - dDX, fyBase + dDY, dr, 0, 6.2832);
      ctx.fillStyle = rgba(PAL.seaGlint, dOp);
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(fx, fy, r, 0, Math.PI * 2);
    ctx.fillStyle = rgba(PAL.gold, op * 0.75);
    ctx.fill();
  }
  ctx.restore();
}


  // ---- drawRoads ----
function drawRoads(ctx, sim, t, view) {
  if (!view || !P) return;
  var i, a, b, ap, bp, speed = 42 / 9, offset;
  var dashLen = 7 * scale;
  offset = view.rm ? 0 : -(t * speed * scale);

  // richer washi/lacquer: grade the lantern warmth smoothly off the shared LIGHT rig
  var nightAmt = LIGHT.night;

  // ---- 8 ADJ segments: warmer gold-leaf dash, marching, soft lantern-glow halo (native shadow blur) ----
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = rgba(PAL.goldLeaf, 0.46);
  ctx.lineWidth = 2 * scale;
  ctx.setLineDash([dashLen, dashLen]);
  ctx.lineDashOffset = offset;
  ctx.shadowColor = rgba(PAL.lantern, 0.32 + 0.34 * nightAmt);
  ctx.shadowBlur = (3 + 4 * nightAmt) * scale;
  if (view.night) ctx.globalAlpha *= 0.85;   // preserved: existing night dim
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

  // ---- subtle lantern-lit nodes where roads meet (deduped station endpoints; shadow state already
  // cleared by the restore above, so these read as clean warm washes, not stacked blur) ----
  var seen = {}, ids = [], sid;
  for (i = 0; i < ADJ.length; i++) {
    sid = ADJ[i][0]; if (!seen[sid]) { seen[sid] = 1; ids.push(sid); }
    sid = ADJ[i][1]; if (!seen[sid]) { seen[sid] = 1; ids.push(sid); }
  }
  for (i = 0; i < ids.length; i++) {
    var sp = stationPx(P.station(ids[i]), view);
    // faint gold gather-point by day; blooms into a warm lantern pool by night — mostly veiled by the
    // station disc drawn on top later, this is the wash that peeks softly around its rim.
    // The pool BREATHES at night (spec §2 "lantern pools that bloom") — RM holds the base radius.
    lightPool(ctx, sp.x, sp.y, 28 * scale, PAL.gold, 0.04);
    if (nightAmt > 0.01) {
      var bloom = view.rm ? 1 : 1 + 0.08 * Math.sin(t * 0.8 + i * 2.1);
      lightPool(ctx, sp.x, sp.y, 36 * scale * bloom, PAL.lantern, 0.16 * nightAmt);
    }
  }

  // ---- one slow gold-leaf glint travels junction to junction — sparingly, alive but never noisy ----
  if (!view.rm && ids.length) {
    var slot = 3.6, cyc = t % (slot * ids.length);
    var idx = Math.floor(cyc / slot) % ids.length;
    var ph = (cyc % slot) / slot;
    var glintA = Math.sin(ph * Math.PI);   // 0 -> 1 -> 0 across its slot in the cycle
    if (glintA > 0.06) {
      var gs = stationPx(P.station(ids[idx]), view);
      sparkle(ctx, gs.x, gs.y, 7 * scale, 0.45 * glintA);
    }
  }
}


  // ---- drawSky ----
function drawSky_mix(aStr, bStr, k) {
  // local 'r,g,b'-string blend (skyAt's own mixRGB takes [r,g,b] arrays, not strings) — used to
  // manufacture extra smooth gradient stops + to blend the sun/moon glow colour across day<->night.
  var a = aStr.split(','), b = bStr.split(',');
  return Math.round(+a[0] + (+b[0] - +a[0]) * k) + ',' +
         Math.round(+a[1] + (+b[1] - +a[1]) * k) + ',' +
         Math.round(+a[2] + (+b[2] - +a[2]) * k);
}

function drawSky(ctx, sim, t, view) {
  // §21.3 self-gate: minute-mode only, stays under actors — EXCEPT when the §4
  // report-on-stage dusk grade (view.dusk) asks for evening light on any sim.
  var minute = sim && sim.mode === 'minute' && typeof sim.clockMin === 'number';
  if (!minute && _dusk <= 0) return;
  var w = view.w, h = view.h;
  var sky = minute ? skyAt(sim.clockMin) : skyAt(1140);
  var top = sky.top, hor = sky.hor, al = sky.alpha;
  if (_dusk > 0) {                                       // bend the hour toward the 19:00 dusk stop
    var duskStop = skyAt(1140);
    top = drawSky_mix(top, duskStop.top, _dusk);
    hor = drawSky_mix(hor, duskStop.hor, _dusk);
    al = lerp(al, duskStop.alpha, _dusk);
  }
  var nAmt = LIGHT.night;

  ctx.save();

  // ---- day-phase wash: smoother 5-stop gradient (was a flat top/mid/horizon 3-stop) so the tint
  // reads as a graded sky rather than a hard band; every colour still comes straight off the SKY table ----
  var midHi = drawSky_mix(top, hor, 0.34);
  var midLo = drawSky_mix(top, hor, 0.7);
  var grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0,    rgba(top, al));
  grad.addColorStop(0.30, rgba(midHi, al * 0.86));
  grad.addColorStop(0.58, rgba(midLo, al * 0.66));
  grad.addColorStop(0.84, rgba(hor, al * 0.9));
  grad.addColorStop(1,    rgba(hor, al));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // ---- global colour grade (spec §2 "true lighting model"): when the sun sits low, a
  // whisper of the horizon colour is MULTIPLIED into the whole world so shadows deepen
  // and everything keys to the same dawn/dusk warmth. Alpha is tiny and rides the same
  // low-sun curve as the long shadows; skipped at night (the night wash above owns it).
  var lowSun = LIGHT.shadowLen * (1 - nAmt * 0.55);
  if (lowSun > 0.03) {
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = rgba(drawSky_mix(hor, '255,236,210', 0.35), 0.10 * lowSun);
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  // ---- soft sun/moon glow, low near the horizon, sweeping dawn-side -> dusk-side with the clock.
  // Colour blends continuously gold (day) <-> pale moon-glint (night) via the LIGHT rig so it never
  // pops at the binary night threshold; alpha rides the SKY table's own alpha (already peaks at
  // dawn/dusk/night, dips at midday) so the glow stays a restrained washi/lacquer accent, not a
  // literal sun disc. Position comes off LIGHT.sunX/sunY (shared with the water's sun column) —
  // frac*w / frac*h layout math, left unscaled per the SCALE contract; only the glow's radius /
  // sparkle size are multiplied by `scale`. ----
  var glowX = w * LIGHT.sunX;
  var glowY = h * LIGHT.sunY;
  var glowRgb = drawSky_mix(PAL.gold, PAL.seaGlint, nAmt);
  var glowR = (95 + 45 * Math.sin(LIGHT.dayK * Math.PI)) * scale;
  var glowAlpha = clamp(al * 0.5, 0.05, 0.24);
  lightPool(ctx, glowX, glowY, glowR, glowRgb, glowAlpha);
  if (!view.rm && nAmt < 0.35) {
    sparkle(ctx, glowX, glowY - glowR * 0.25, 3 * scale, 0.4 * (1 - nAmt / 0.35));
  }

  ctx.restore();
}

// DRIFTING CLOUD SHADOWS (spec §2) — two huge, very soft shade blobs sliding
// slowly across land and water (a ~95s crossing), day only (clouds cast no
// shade under lantern light). Fixed count, pure function of t. Under RM the
// clouds hold still at their seed positions — the shade (light) stays, the
// drift (motion) stops.
function drawCloudShadows(ctx, sim, t, view) {
  var dayA = 0.055 * (1 - LIGHT.night);
  if (dayA <= 0.006) return;
  var w = view.w, h = view.h, i, kx, cx2, cy2, rx;
  for (i = 0; i < 2; i++) {
    kx = view.rm ? (0.28 + i * 0.45)
                 : ((t / (95 + i * 22) + i * 0.5) % 1.3) - 0.15;   // -0.15 → 1.15: enters and leaves the frame
    cx2 = w * kx;
    cy2 = h * (0.22 + i * 0.42) + (view.rm ? 0 : Math.sin(t * 0.05 + i * 3) * h * 0.03);
    rx = w * (0.20 + i * 0.05);
    ctx.save();
    ctx.translate(cx2, cy2);
    ctx.scale(1, 0.42);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, rgba(PAL.shadow, dayA));
    g.addColorStop(0.7, rgba(PAL.shadow, dayA * 0.5));
    g.addColorStop(1, rgba(PAL.shadow, 0));
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, 6.2832); ctx.fill();
    ctx.restore();
  }
}



  // ---- drawGuests ----
// ---- drawGuests ----
// Small helper: the fixed shore casters' fishing rod, now a bent-under-tension rod with a
// gold-lit tip and a drooping line to a tiny lure that catches the light. All sizes take
// FINAL px (caller already multiplied by `scale`). Private to drawGuests.
function drawGuests_rod(ctx, px0, py0, gscale, rm) {
  var ang = -34 * Math.PI / 180;
  var rodLen = 12 * gscale;
  var tipX = px0 + rodLen * Math.cos(ang);
  var tipY = py0 + rodLen * Math.sin(ang);
  var midX = px0 + rodLen * 0.55 * Math.cos(ang);
  var midY = py0 + rodLen * 0.55 * Math.sin(ang);
  var perpAng = ang + Math.PI / 2;
  var bend = 1.6 * gscale;
  var ctrlX = midX + bend * Math.cos(perpAng);
  var ctrlY = midY + bend * Math.sin(perpAng);

  // bent rod (quadratic curve), gold-gradient shaft brightening toward the tip
  ctx.beginPath();
  ctx.moveTo(px0, py0);
  ctx.quadraticCurveTo(ctrlX, ctrlY, tipX, tipY);
  var rodGrad = ctx.createLinearGradient(px0, py0, tipX, tipY);
  rodGrad.addColorStop(0, rgba(PAL.goldDeep, 0.75));
  rodGrad.addColorStop(1, rgba(PAL.goldPale, 0.9));
  ctx.strokeStyle = rodGrad;
  ctx.lineWidth = 1.4 * gscale;
  ctx.lineCap = 'round';
  ctx.stroke();

  // drooping fishing line (gravity sag via a second quadratic) down to a tiny lure
  var lineEndX = tipX - 3 * gscale;
  var lineEndY = tipY + 14 * gscale;
  var lineCtrlX = tipX + 2 * gscale;
  var lineCtrlY = tipY + 9 * gscale;
  ctx.beginPath();
  ctx.moveTo(tipX, tipY);
  ctx.quadraticCurveTo(lineCtrlX, lineCtrlY, lineEndX, lineEndY);
  ctx.strokeStyle = rgba(PAL.gold, 0.35);
  ctx.lineWidth = 0.6 * gscale;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(lineEndX, lineEndY, 1.3 * gscale, 0, Math.PI * 2);
  ctx.fillStyle = rgba(PAL.hanko, 0.85);
  ctx.fill();
  if (!rm) sparkle(ctx, lineEndX, lineEndY, 2.6 * gscale, 0.55);   // a glint off the lure, restrained
}

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

    // free-running bob — CSS @keyframes bob (0%,100% 0 / 50% -2.5px), 1.7s default, 2.6s for chatters
    // (gs.act === 'chat'); stops under reduced motion or while hushed/frozen (mirrors .guest.hushed{}
    // killing the animation). Amplitude is a drawn size, so it scales with the stage.
    var bobY = 0;
    if (!view.rm && !hushed) {
      var period = (gs.act === 'chat') ? 2600 : 1700;
      var phase = (t * 1000 % period) / period;
      bobY = -2.5 * scale * (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    }
    var fy = cy + bobY;                       // this frame's feet/body-anchor line
    var col = YUKATA[i % YUKATA.length];
    var colRGB = hexRGB(col);

    ctx.save();
    ctx.globalAlpha = hushed ? 0.3 : 1;        // .guest.hushed{opacity:.3}

    // soft contact shadow — grounded on the feet line, ignores bob, drawn before the caster
    contactShadow(ctx, cx, cy + 1 * scale, 15 * scale, 5 * scale, 0.4);

    // a fixed shore caster leans very slightly toward the water — a nicer, more purposeful stance
    // than standing bolt upright; the whole pawn (body/head/rod) rotates as one group about its feet.
    var leaning = !!gs.cast;
    if (leaning) {
      ctx.save();
      ctx.translate(cx, fy);
      ctx.rotate(-7 * Math.PI / 180);
      ctx.translate(-cx, -fy);
    }

    // yukata body — 8x11 rounded rect, feet at fy, centred on cx (style.css .g-body), now a
    // top-lit lacquer bevel (liftRGB) instead of a flat fill, plus a washi sash and an upper-left
    // rim-light lick (non-circular shape -> a light stroke along the edge, per the key-light rule)
    var bw = 8 * scale, bh = 11 * scale, br = 3.5 * scale;
    var bx = cx - bw / 2, by = fy - bh;
    roundRect(ctx, bx, by, bw, bh, br);
    var bodyGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
    bodyGrad.addColorStop(0, rgba(liftRGB(colRGB, 26), 1));
    bodyGrad.addColorStop(0.55, rgba(colRGB, 1));
    bodyGrad.addColorStop(1, rgba(liftRGB(colRGB, -24), 1));
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = 1 * scale;
    ctx.strokeStyle = rgba(PAL.indigoDeep, 0.4);
    ctx.stroke();

    // washi sash near the waist — a small charm detail that reads "yukata", not just a coloured block
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, br); ctx.clip();
    ctx.fillStyle = rgba(PAL.washiWarm, 0.55);
    ctx.fillRect(bx, by + bh - 4 * scale, bw, 1.4 * scale);
    ctx.restore();

    ctx.save();
    roundRect(ctx, bx, by, bw, bh, br); ctx.clip();
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.24);
    ctx.lineWidth = 1.3 * scale;
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.12, by + bh * 0.05);
    ctx.lineTo(bx + bw * 0.02, by + bh * 0.62);
    ctx.stroke();
    ctx.restore();

    // head dot (::before): 5px circle, centred (cx, fy-12.5), now with a key-light rim arc
    var headR = 2.5 * scale;
    var headCx = cx, headCy = fy - bh - 1.5 * scale;
    ctx.beginPath();
    ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
    ctx.fillStyle = rgba(PAL.skin, 1);
    ctx.fill();
    ctx.lineWidth = 1 * scale;
    ctx.strokeStyle = rgba(PAL.indigoDeep, 0.35);
    ctx.stroke();
    rimLightArc(ctx, headCx, headCy, headR, 0.32);

    // fishing rod for the fixed shore casters (::after on .g-cast .g-body) — bent, gold-lit,
    // with a drooping line + tiny glinting lure (drawGuests_rod above)
    if (gs.cast) {
      var px0 = cx + 2 * scale, py0 = fy - 16.5 * scale;
      drawGuests_rod(ctx, px0, py0, scale, view.rm);
    }

    if (leaning) ctx.restore();  // end lean rotation

    ctx.restore();               // end hush alpha
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

// soft wobbling mirror-shimmer of the hull on the water surface, drawn in view (world) space
// so it stays put on the sea while the hull bobs/rocks above it.
function drawBoat_reflection(ctx, cx, cy, w, h, tintRgb, alpha, wob) {
  if (w <= 0 || h <= 0 || alpha <= 0) return;
  ctx.save();
  ctx.translate(cx + wob, cy);
  var g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, rgba(tintRgb, alpha));
  g.addColorStop(1, rgba(tintRgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, h * 0.5, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBoat(ctx, sim, t, view) {
  if (!view || !view.boat) return;
  var b = view.boat, bs = P.boatState(sim);
  var cx = b.cx, cy = b.cy;                 // engine-driven position — NOT scaled
  var faceL = (bs.phase === 'outbound' || bs.phase === 'ground');
  var atSea = bs.atSea;
  var ts = t * 1000;
  var i, wk, age, wa;
  // smooth night grade off the shared LIGHT rig (running lantern, reflection tint)
  var nightAmt = LIGHT.night;
  var night = nightAmt > 0.5;

  // ---- wake pool: pooled foam ellipses fading over 900ms, laid on the water behind the hull ----
  // (style.css .wk: 12x4 ellipse, rgba(227,196,107,.3) == PAL.gold; app.js frame() fades (1-age/900)*0.5 —
  // timing/alpha math kept byte-faithful; only the foam's look is enriched: a soft outer glow + a brighter
  // pale core, with a brief glint on the freshest puffs)
  if (!view.rm && view.wakes) {
    for (i = 0; i < view.wakes.length; i++) {
      wk = view.wakes[i];
      if (!wk || !wk.t0) continue;
      age = ts - wk.t0;
      if (age < 0 || age >= 900) continue;
      wa = (1 - age / 900) * 0.5;
      ctx.beginPath();
      ctx.ellipse(wk.x, wk.y, 6 * scale, 2 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(PAL.gold, wa);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(wk.x, wk.y, 3 * scale, 1 * scale, 0, 0, Math.PI * 2);
      ctx.fillStyle = rgba(PAL.goldPale, wa * 0.9);
      ctx.fill();
      if (age < 260 && (i % 2 === 0)) {
        sparkle(ctx, wk.x + 2 * scale, wk.y - 1 * scale, 2.2 * scale, (1 - age / 260) * 0.75);
      }
    }
  }

  // ---- V-wake (spec §2 "boat wake interacting"): two diverging foam lines peeling off the
  // stern while under way, fading with distance — they thread through the pooled puffs so the
  // wake reads as one system, not confetti. Motion-only: skipped under RM and at the dock. ----
  if (!view.rm && atSea) {
    var wdir = faceL ? 1 : -1;                 // faceL = bow seaward (+x) => wake trails -x… flipped below
    var sternX = cx - wdir * 12 * scale;
    ctx.save();
    ctx.lineCap = 'round';
    for (i = 0; i < 2; i++) {
      var vy = (i === 0 ? -1 : 1);
      var wsw = view.rm ? 0 : Math.sin(t * 2.1 + i * 2.6) * 1.2 * scale;
      var grad2 = ctx.createLinearGradient(sternX, cy, sternX - wdir * 26 * scale, cy);
      grad2.addColorStop(0, rgba(PAL.gold, 0.30));
      grad2.addColorStop(1, rgba(PAL.gold, 0));
      ctx.strokeStyle = grad2;
      ctx.lineWidth = 1.4 * scale;
      ctx.beginPath();
      ctx.moveTo(sternX, cy + 2 * scale);
      ctx.quadraticCurveTo(sternX - wdir * 13 * scale, cy + 2 * scale + vy * 3 * scale,
                           sternX - wdir * 26 * scale, cy + 2 * scale + vy * (6 * scale) + wsw);
      ctx.stroke();
    }
    ctx.restore();
  }

  // soft gradient contact shadow on the water beneath the hull (replaces the hard shadowEllipse)
  contactShadow(ctx, cx, cy + 4 * scale, 30 * scale, 8 * scale, 0.32);

  // wobbling mirror-shimmer of the hull on the water — moonlit seaGlint at night, ink-dark by day
  var wob = view.rm ? 0 : Math.sin(t * 1.3) * 1.2 * scale;
  drawBoat_reflection(ctx, cx, cy + 5 * scale, 22 * scale, 7 * scale,
    night ? PAL.seaGlint : PAL.indigoDeep, night ? 0.22 : 0.14, wob);

  // continuous sin bob (style.css @keyframes boatbob, 3.2s, 0..-1.5px + -1..1deg);
  // .boat.sailing swaps the WHOLE animation for boat-rock (2.6s, -5..5deg, no translateY) — replicate that swap.
  // rot is an angle (unscaled); bobY is a px amplitude (scaled like any other offset).
  var bobY = 0, rot = 0;
  if (!view.rm) {
    if (atSea) {
      rot = Math.sin(t * (2 * Math.PI) / 2.6) * (5 * Math.PI / 180);
    } else {
      bobY = (Math.sin(t * (2 * Math.PI) / 3.2) - 1) * 0.75 * scale;
      rot = Math.sin(t * (2 * Math.PI) / 3.2) * (1 * Math.PI / 180);
    }
  }

  ctx.save();
  ctx.translate(cx, cy);
  if (faceL) ctx.scale(-1, 1);   // .boat.faceL .bwrap{transform:scaleX(-1)} — bow toward the open sea
  ctx.translate(0, bobY);
  ctx.rotate(rot);

  // running lantern: a warm pool bleeding out from the stern at night, graded smoothly by nightAmt
  // (tiny/none by day — lightPool no-ops at alpha<=0)
  if (nightAmt > 0) {
    lightPool(ctx, 9 * scale, -0.5 * scale, 9 * scale, PAL.lantern, 0.3 * nightAmt);
  }

  // ---- hull: lacquer top-lit gradient, rounded, gold-leaf gunwale rail, upper-left rim light ----
  // style.css .hull: 26x7, border-radius 2/10/4/3 — CSS auto-clamps corner radii whose adjacent
  // sum exceeds the edge length (right edge 7px vs tr10+br4=14) by scaling ALL radii by 7/14=.5;
  // canvas paths don't auto-clamp, so the scaled values (1,5,2,1.5) are used directly here (×scale).
  drawBoat_hullPath(ctx, -13 * scale, -2 * scale, 26 * scale, 7 * scale,
    1 * scale, 5 * scale, 2 * scale, 1.5 * scale);
  var hg = ctx.createLinearGradient(0, -2 * scale, 0, 5 * scale);
  hg.addColorStop(0, '#3d4854');
  hg.addColorStop(0.55, '#262e37');
  hg.addColorStop(1, '#12171d');
  ctx.fillStyle = hg;
  ctx.fill();

  // upper-left key-light lick along the top rail (fakes rim light on a non-circular hull)
  ctx.save();
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.2);
  ctx.lineWidth = 1.1 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-11 * scale, -1.2 * scale);
  ctx.quadraticCurveTo(-4 * scale, -2 * scale, 3 * scale, -1.5 * scale);
  ctx.stroke();
  ctx.restore();

  // gold-leaf gunwale trim — vertical gradient, bright top / deep bottom (bevelDisc's rim treatment,
  // hand-applied to a straight rail); replaces the old flat inset-gold stroke
  var railGrad = ctx.createLinearGradient(0, -1.2 * scale, 0, 0.3 * scale);
  railGrad.addColorStop(0, rgba(PAL.goldPale, 0.8));
  railGrad.addColorStop(1, rgba(PAL.goldLeaf, 0.55));
  ctx.strokeStyle = railGrad;
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(-11 * scale, -0.5 * scale);
  ctx.lineTo(11 * scale, -0.5 * scale);
  ctx.stroke();

  // ---- mast (.mast: 1.5x14 #4a3a22) ----
  ctx.strokeStyle = '#4a3a22';
  ctx.lineWidth = 1.5 * scale;
  ctx.beginPath();
  ctx.moveTo(-0.25 * scale, -15 * scale);
  ctx.lineTo(-0.25 * scale, -1 * scale);
  ctx.stroke();

  // ---- sail: crisp cream washi triangle (paper-gradient fill + ink outline + a mast-edge light lick) ----
  ctx.beginPath();
  ctx.moveTo(-10 * scale, -3 * scale);
  ctx.lineTo(-10 * scale, 8 * scale);
  ctx.lineTo(-19 * scale, 8 * scale);
  ctx.closePath();
  var sailGrad = ctx.createLinearGradient(-19 * scale, -3 * scale, -10 * scale, 8 * scale);
  sailGrad.addColorStop(0, 'rgba(244,236,214,0.95)');
  sailGrad.addColorStop(1, 'rgba(224,212,180,0.92)');
  ctx.fillStyle = sailGrad;
  ctx.fill();
  ctx.lineWidth = 0.75 * scale;
  ctx.strokeStyle = rgba(PAL.ink, 0.18);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.3);
  ctx.lineWidth = 1 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-10 * scale, -2 * scale);
  ctx.lineTo(-10 * scale, 5 * scale);
  ctx.stroke();
  ctx.restore();

  // ---- hinomaru dot (.sail::after: 4x4 circle, background var(--wait) == PAL.hanko) ----
  // crisped with a thin ink ring + a tiny lacquer glint
  ctx.beginPath();
  ctx.arc(-15 * scale, 1 * scale, 2 * scale, 0, Math.PI * 2);
  ctx.fillStyle = rgba(PAL.hanko, 1);
  ctx.fill();
  ctx.lineWidth = 0.6 * scale;
  ctx.strokeStyle = rgba(PAL.ink, 0.35);
  ctx.stroke();
  rimLightArc(ctx, -15 * scale, 1 * scale, 2 * scale, 0.35);

  ctx.restore();

  // NEW GEOGRAPHY draft label under Nobu-san's skiff (world space — after the flip/bob restore)
  chip(ctx, cx, cy + 10 * scale, (_lang === 'ja' ? 'のぶさん 🛥' : 'Nobu-san 🛥'), {
    font: '600 ' + Math.round(9 * scale) + 'px system-ui,sans-serif',
    pad: 3 * scale, h: 12 * scale, r: 2 * scale, alpha: 0.85
  });
}


  // ---- drawStations ----
function drawStations_glyph(ctx, id, cx, cy, r, na, t, rm) {
  // per-id landmark glyph: 'roof-like' ids sit just above the icon disc,
  // 'waterline' ids (port/vessel) sit just below it — mirrors the old
  // .st-arch top:/bottom: split (style.css:251-262). na = nightAmount(0..1),
  // used to grade the mess-awning lantern + the vessel wave-arc moonlit tint.
  // t/rm drive the small living details (bobbing floats); rm holds them still.
  var topY = cy - r - 3 * scale, botY = cy + r + 3 * scale, i2;
  ctx.save();
  if (id === 'command') {
    var hw = 15 * scale, h = 14 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, topY - h);
    ctx.lineTo(cx - hw, topY);
    ctx.lineTo(cx + hw, topY);
    ctx.closePath();
    ctx.fillStyle = '#2c3844'; ctx.fill();
    ctx.lineWidth = 1 * scale; ctx.strokeStyle = 'rgba(227,196,107,.85)'; ctx.stroke();
    // upper-left key-light: a light stroke faking rim light along the left roof edge
    ctx.beginPath();
    ctx.moveTo(cx, topY - h);
    ctx.lineTo(cx - hw, topY);
    ctx.lineWidth = 1.4 * scale;
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.28);
    ctx.stroke();
  } else if (id === 'lodging') {
    var hw2 = 12 * scale, h2 = 11 * scale;
    ctx.beginPath();
    ctx.moveTo(cx, topY - h2);
    ctx.lineTo(cx - hw2, topY);
    ctx.lineTo(cx + hw2, topY);
    ctx.closePath();
    ctx.fillStyle = '#34404c'; ctx.fill();
    ctx.lineWidth = 1 * scale; ctx.strokeStyle = 'rgba(227,196,107,.55)'; ctx.stroke();
    // roof ridge cap + tile chords (spec §2 richer architecture — quiet ink, not literal tiles)
    ctx.strokeStyle = rgba(PAL.ink, 0.35);
    ctx.lineWidth = 0.8 * scale;
    ctx.beginPath();
    ctx.moveTo(cx - hw2 * 0.45, topY - h2 * 0.55); ctx.lineTo(cx + hw2 * 0.45, topY - h2 * 0.55);
    ctx.moveTo(cx - hw2 * 0.75, topY - h2 * 0.25); ctx.lineTo(cx + hw2 * 0.75, topY - h2 * 0.25);
    ctx.stroke();
    ctx.strokeStyle = rgba(PAL.goldDeep, 0.55);
    ctx.lineWidth = 1.6 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 2.4 * scale, topY - h2 + 0.6 * scale); ctx.lineTo(cx + 2.4 * scale, topY - h2 + 0.6 * scale);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, topY - h2);
    ctx.lineTo(cx - hw2, topY);
    ctx.lineWidth = 1.2 * scale;
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.22);
    ctx.stroke();
  } else if (id === 'mess') {
    var aw = 30 * scale, ah = 9 * scale, ax = cx - aw / 2, ay = topY - ah;
    roundRect(ctx, ax, ay, aw, ah, 3 * scale);
    ctx.fillStyle = '#8a3427'; ctx.fill();
    ctx.save();
    roundRect(ctx, ax, ay, aw, ah, 3 * scale); ctx.clip();
    ctx.fillStyle = rgba(TERR.red.rgb, 1);
    for (i2 = ax; i2 < ax + aw; i2 += 12 * scale) ctx.fillRect(i2, ay, 7 * scale, ah);
    ctx.restore();
    // light stroke along the awning's upper-left edge (fakes rim light on a non-circular shape)
    ctx.beginPath();
    ctx.moveTo(ax + 2 * scale, ay + 1 * scale);
    ctx.lineTo(ax + aw * 0.4, ay + 1 * scale);
    ctx.lineWidth = 1.2 * scale;
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.22);
    ctx.stroke();
    // the awning lantern — a small warm light always present, graded much stronger at night
    lightPool(ctx, ax + aw + 3 * scale, ay + ah * 0.5, (6 + 4 * na) * scale, PAL.lantern, 0.1 + 0.42 * na);
  } else if (id === 'clinic') {
    var bw = 15 * scale, bh = 15 * scale, bx = cx - bw / 2, byy = topY - bh;
    roundRect(ctx, bx, byy, bw, bh, 2 * scale);
    ctx.fillStyle = '#f6efdc'; ctx.fill();
    ctx.strokeStyle = rgba(PAL.indigoDeep, 0.35); ctx.lineWidth = 1 * scale; ctx.stroke();
    ctx.fillStyle = rgba(TERR.red.rgb, 1);
    ctx.fillRect(cx - 2 * scale, byy + 3 * scale, 4 * scale, bh - 6 * scale);
    ctx.fillRect(bx + 3 * scale, byy + bh / 2 - 2 * scale, bw - 6 * scale, 4 * scale);
    // upper-left glass highlight
    ctx.beginPath();
    ctx.moveTo(bx + 1.5 * scale, byy + bh - 2 * scale);
    ctx.lineTo(bx + 1.5 * scale, byy + 1.5 * scale);
    ctx.lineTo(bx + bw - 2 * scale, byy + 1.5 * scale);
    ctx.lineWidth = 1.2 * scale;
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.3);
    ctx.stroke();
  } else if (id === 'finance') {
    var cr = 7 * scale, cyc = topY - cr;
    var grad = ctx.createRadialGradient(cx - cr * 0.3, cyc - cr * 0.3, cr * 0.15, cx, cyc, cr);
    grad.addColorStop(0, rgba(PAL.goldPale, 1)); grad.addColorStop(1, rgba(PAL.goldDeep, 1));
    ctx.beginPath(); ctx.arc(cx, cyc, cr, 0, Math.PI * 2); ctx.fillStyle = grad; ctx.fill();
    ctx.strokeStyle = rgba(PAL.goldDeep, 0.8); ctx.lineWidth = 1 * scale; ctx.stroke();
    ctx.fillStyle = rgba(PAL.indigoDeep, 1);
    ctx.beginPath(); ctx.arc(cx + 1.5 * scale, cyc + 1.5 * scale, 1.6 * scale, 0, Math.PI * 2); ctx.fill();
  } else if (id === 'port') {
    var pw = 30 * scale, pxx = cx - pw / 2;
    ctx.strokeStyle = '#4a3a22'; ctx.lineWidth = 4 * scale; ctx.lineCap = 'butt';
    ctx.beginPath();
    for (i2 = 0; i2 < pw; i2 += 8 * scale) { ctx.moveTo(pxx + i2, botY); ctx.lineTo(pxx + Math.min(i2 + 5 * scale, pw), botY); }
    ctx.stroke();
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.18); ctx.lineWidth = 1 * scale;
    ctx.beginPath();
    ctx.moveTo(pxx, botY - 1.5 * scale); ctx.lineTo(pxx + pw, botY - 1.5 * scale);
    ctx.stroke();
    // NETS & FLOATS (spec §2 richer port): a drying net draped left of the disc —
    // two catenary swags with vertical ties — and three glass floats hanging off
    // the pier planks, bobbing gently on the water (still under reduced motion).
    var netX = cx - r - 16 * scale, netY = cy - r * 0.55, netW = 13 * scale, ni;
    ctx.strokeStyle = rgba(PAL.washiWarm, 0.4);
    ctx.lineWidth = 0.9 * scale;
    ctx.beginPath();
    ctx.moveTo(netX - netW / 2, netY);
    ctx.quadraticCurveTo(netX, netY + 6 * scale, netX + netW / 2, netY);
    ctx.moveTo(netX - netW / 2, netY + 4 * scale);
    ctx.quadraticCurveTo(netX, netY + 10 * scale, netX + netW / 2, netY + 4 * scale);
    for (ni = 0; ni < 3; ni++) {
      var nvx = netX - netW / 2 + (netW / 2) * ni;
      ctx.moveTo(nvx, netY + (ni === 1 ? 6 : 0) * scale * 0.9);
      ctx.lineTo(nvx, netY + (ni === 1 ? 10 : 4) * scale);
    }
    ctx.stroke();
    // net posts
    ctx.strokeStyle = rgba(PAL.ink, 0.5);
    ctx.lineWidth = 1.2 * scale;
    ctx.beginPath();
    ctx.moveTo(netX - netW / 2, netY - 2 * scale); ctx.lineTo(netX - netW / 2, netY + 12 * scale);
    ctx.moveTo(netX + netW / 2, netY - 2 * scale); ctx.lineTo(netX + netW / 2, netY + 12 * scale);
    ctx.stroke();
    for (ni = 0; ni < 3; ni++) {
      var flx = pxx + (5 + ni * 10) * scale;
      var fbob = rm ? 0 : Math.sin(t * 1.3 + ni * 2.2) * 1 * scale;
      var fly = botY + 5 * scale + fbob;
      ctx.beginPath();
      ctx.moveTo(flx, botY + 2 * scale); ctx.lineTo(flx, fly - 2 * scale);
      ctx.strokeStyle = rgba(PAL.ink, 0.4); ctx.lineWidth = 0.7 * scale; ctx.stroke();
      ctx.beginPath();
      ctx.arc(flx, fly, 2 * scale, 0, 6.2832);
      ctx.fillStyle = ni === 1 ? rgba(PAL.hanko, 0.85) : rgba(PAL.goldDeep, 0.9);
      ctx.fill();
      ctx.lineWidth = 0.6 * scale; ctx.strokeStyle = rgba(PAL.ink, 0.4); ctx.stroke();
      rimLightArc(ctx, flx, fly, 2 * scale, 0.3);
    }
  } else if (id === 'vessel') {
    var vw = 36 * scale, vx0 = cx - vw / 2, vy = botY + 2 * scale;
    ctx.strokeStyle = rgba(PAL.seaGlint, 0.32 + 0.25 * na); ctx.lineWidth = 2 * scale;
    for (i2 = 0; i2 < 3; i2++) {
      ctx.beginPath();
      ctx.arc(vx0 + (6 + i2 * 12) * scale, vy, 5 * scale, Math.PI, 0);
      ctx.stroke();
    }
  }
  ctx.restore();
}

// HUB_FOOT_MULT — single source of truth for Hinata's footprint multiplier (a normal station
// disc's radius × this = the hub's footR). Read by BOTH drawStations() (sizing the compound it
// draws, incl. the territory halo / stalled ring / crew badge that already key off footR) and
// hubSections() (sizing the compound the app layer places DOM hotspots over) so the two can never
// drift apart. Hinata absorbs command+finance+clinic (engine.js:65/69-71) and is the dominant
// structure on the land side of the map; the land runs to x≈0.55 and the hub sits at 0.30,0.44,
// well clear of the shoreline even at this larger footprint.
var HUB_FOOT_MULT = 3.6;

// the 3 sub-zones Hinata offers — Food / Fishing rod / Transport (replaces the old
// Kitchen/Rod-Check/Discuss trio). id = stable hotspot key (matches hubSections()'s contract);
// icon = the emoji drawn in the small disc; en/jp = the bilingual chip label, read the same way
// nm() reads entity {en,jp} pairs elsewhere in this file (_lang==='ja' ? jp : en).
var HUB_SECTIONS = [
  { id: 'food',      icon: '🍱', en: 'Food',        jp: '食事' },
  { id: 'rod',       icon: '🎣', en: 'Fishing/Gear', jp: '釣り・装備' },
  { id: 'transport', icon: '🚤', en: 'Transport',    jp: '移動' }
];

// SHARED SOURCE OF TRUTH for the three sub-zone rects, in already-scaled CSS px, given the hub's
// own draw centre (hubCx, hubCy — the SAME discCy drawStations passes into drawStations_hub) and
// its footR. drawStations_hub draws directly from this; hubSections() (exported, read by the app
// layer to place clickable hotspots) returns the IDENTICAL geometry — so the drawn art and the tap
// targets can never drift apart. Pure: no ctx writes, no state reads beyond its arguments.
function hubSectionRects(hubCx, hubCy, footR) {
  var zy = hubCy + footR * 1.05;
  var zr = footR * 0.19;             // sub-zone icon-disc radius — bigger/clearer, proportional to the hub
  var out = [], i, z;
  for (i = 0; i < HUB_SECTIONS.length; i++) {
    z = HUB_SECTIONS[i];
    out.push({ id: z.id, icon: z.icon, en: z.en, jp: z.jp, cx: hubCx + (i - 1) * footR, cy: zy, r: zr });
  }
  return out;
}

// HINATA COMMAND-CENTRE COMPOUND (station flag hub===true) — replaces the normal ~42px icon disc
// with a big base/lodge that reads as the group's dominant structure: a wide lacquer platform, a
// roofed lodge (peaked roof + red-tile eave, folded in from the old 'command'/'mess' motifs,
// engine.js:65/69, PLUS real timber-and-washi walls with a doorway and two lantern-lit windows so
// it reads as a proper base rather than a floating roof), the station's own icon big in the
// middle, and three small labelled sub-zones in a row beneath the platform — Food / Fishing rod /
// Transport, where the team actually eats, gears up, and moves. Reuses bevelDisc / roundRect /
// chip / lightPool / rimLightArc / contactShadow — no new palette entries. `r` is the caller's
// already-scaled footprint radius (HUB_FOOT_MULT × a normal station disc).
// HUB GEOMETRY — the compound's key points, derived the same way drawStations
// derives them, so the particle layer (chimney smoke, cook-steam) anchors on
// exactly what drawStations_hub drew. Returns null when there is no hub.
function hubGeom(view) {
  if (!P || !P.STATIONS) return null;
  var hubSt = null, i;
  for (i = 0; i < P.STATIONS.length; i++) if (P.STATIONS[i].hub) { hubSt = P.STATIONS[i]; break; }
  if (!hubSt || hubSt.hidden) return null;
  var p = stationPx(hubSt, view);
  var discCy = p.y - 11 * scale;
  var footR = 21 * scale * HUB_FOOT_MULT;
  var roofW = footR * 0.92, roofH = footR * 0.62, roofY = discCy - footR * 0.55;
  return { cx: p.x, cy: p.y, discCy: discCy, footR: footR,
           roofW: roofW, roofH: roofH, roofY: roofY,
           chimneyX: p.x + roofW * 0.52, chimneyMouthY: roofY - roofH * 0.48 - 9 * scale };
}

function drawStations_hub(ctx, cx, cy, r, rimRgb, na, ic, t, rm) {
  ctx.save();

  // wide lacquer platform — same bevel treatment as a normal station disc, just the big footprint
  bevelDisc(ctx, cx, cy, r, PAL.indigo, rimRgb);

  // folded-in roof: 'command's peaked silhouette + the old 'mess' awning's red-tile eave, bigger
  var roofW = r * 0.92, roofH = r * 0.62, roofY = cy - r * 0.55, i2;
  ctx.beginPath();
  ctx.moveTo(cx, roofY - roofH);
  ctx.lineTo(cx - roofW, roofY);
  ctx.lineTo(cx + roofW, roofY);
  ctx.closePath();
  ctx.fillStyle = '#2c3844'; ctx.fill();
  ctx.lineWidth = 1.4 * scale; ctx.strokeStyle = 'rgba(227,196,107,.85)'; ctx.stroke();

  // GALLEY CHIMNEY (spec §2) — pokes through the right roof slope; the particle
  // layer's smoke/cook-steam rises from its mouth (hubGeom keeps the two in sync)
  var chX = cx + roofW * 0.52, chTop = roofY - roofH * 0.48 - 9 * scale, chW = 5 * scale;
  ctx.fillStyle = '#222b34';
  ctx.fillRect(chX - chW / 2, chTop, chW, roofY - roofH * 0.2 - chTop);
  ctx.fillStyle = rgba(PAL.ink, 0.85);
  ctx.fillRect(chX - chW / 2 - 1 * scale, chTop - 1.6 * scale, chW + 2 * scale, 2.2 * scale);
  ctx.beginPath();                                        // upper-left light lick on the flue
  ctx.moveTo(chX - chW / 2 + 0.8 * scale, chTop + 1.5 * scale);
  ctx.lineTo(chX - chW / 2 + 0.8 * scale, roofY - roofH * 0.3);
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.18);
  ctx.lineWidth = 1 * scale;
  ctx.stroke();

  // ROOF RIDGE (spec §2 "roof ridge lines"): a gold-capped ridge beam at the apex
  // + two quiet ink tile chords following the slope
  ctx.strokeStyle = rgba(PAL.goldDeep, 0.6);
  ctx.lineWidth = 2 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - r * 0.06, roofY - roofH + 1 * scale); ctx.lineTo(cx + r * 0.06, roofY - roofH + 1 * scale);
  ctx.stroke();
  ctx.strokeStyle = rgba(PAL.ink, 0.3);
  ctx.lineWidth = 1 * scale;
  ctx.beginPath();
  ctx.moveTo(cx - roofW * 0.5, roofY - roofH * 0.5); ctx.lineTo(cx + roofW * 0.5, roofY - roofH * 0.5);
  ctx.moveTo(cx - roofW * 0.78, roofY - roofH * 0.22); ctx.lineTo(cx + roofW * 0.78, roofY - roofH * 0.22);
  ctx.stroke();
  // red-tile awning band along the roof's eave (mess motif, folded in)
  ctx.save();
  roundRect(ctx, cx - roofW, roofY - roofH * 0.24, roofW * 2, roofH * 0.24, 3 * scale);
  ctx.clip();
  ctx.fillStyle = rgba(TERR.red.rgb, 1);
  for (i2 = cx - roofW; i2 < cx + roofW; i2 += 12 * scale) ctx.fillRect(i2, roofY - roofH * 0.24, 7 * scale, roofH * 0.24);
  ctx.restore();
  // upper-left rim light on the roof ridge (key-light convention)
  ctx.beginPath();
  ctx.moveTo(cx, roofY - roofH);
  ctx.lineTo(cx - roofW, roofY);
  ctx.lineWidth = 1.6 * scale;
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.3);
  ctx.stroke();
  // ridge lantern — the HQ's own light, graded by nightAmount like every other station's lantern
  lightPool(ctx, cx, roofY - roofH - 2 * scale, (7 + 5 * na) * scale, PAL.lantern, 0.14 + 0.46 * na);

  // lodge walls beneath the roof — the "proper base/lodge" read: a warm timber-and-washi wall
  // band, a dark doorway, and two lantern-lit windows (brighter at night, same na grade as the
  // ridge lantern above).
  var wallW = roofW * 1.62, wallH = r * 0.5, wallX = cx - wallW / 2, wallY = roofY;
  roundRect(ctx, wallX, wallY, wallW, wallH, 3 * scale);
  var wallGrad = ctx.createLinearGradient(0, wallY, 0, wallY + wallH);
  wallGrad.addColorStop(0, rgba(liftRGB(PAL.washiWarm, -6), 1));
  wallGrad.addColorStop(1, rgba(liftRGB(PAL.moss, -30), 1));
  ctx.fillStyle = wallGrad; ctx.fill();
  ctx.lineWidth = 1 * scale; ctx.strokeStyle = rgba(PAL.indigoDeep, 0.4); ctx.stroke();
  // doorway, centred, flush with the platform
  var doorW = wallW * 0.15, doorH = wallH * 0.82, doorX = cx - doorW / 2, doorY = wallY + wallH - doorH;
  roundRect(ctx, doorX, doorY, doorW, doorH, 2 * scale);
  ctx.fillStyle = rgba(PAL.ink, 0.72); ctx.fill();

  // NOREN CURTAIN (spec §2 "noren at Hinata") — two indigo cloth panels hanging
  // over the doorway's upper half, hems swaying gently in the harbor breeze
  // (still under reduced motion), one panel carrying a small gold hanko circle.
  var nrH = doorH * 0.52, nrGap = 1 * scale, nrW = (doorW - nrGap) / 2, np;
  for (np = 0; np < 2; np++) {
    var nrX = doorX + np * (nrW + nrGap);
    var sway = rm ? 0.6 * scale : Math.sin(t * 1.1 + np * 2.4) * 1.3 * scale;
    ctx.beginPath();
    ctx.moveTo(nrX, doorY);
    ctx.lineTo(nrX + nrW, doorY);
    ctx.lineTo(nrX + nrW + sway * 0.7, doorY + nrH);
    ctx.lineTo(nrX + sway, doorY + nrH);
    ctx.closePath();
    var ng = ctx.createLinearGradient(0, doorY, 0, doorY + nrH);
    ng.addColorStop(0, rgba(liftRGB(PAL.indigo, 14), 0.96));
    ng.addColorStop(1, rgba(PAL.indigo, 0.92));
    ctx.fillStyle = ng;
    ctx.fill();
    ctx.lineWidth = 0.6 * scale;
    ctx.strokeStyle = rgba(PAL.ink, 0.5);
    ctx.stroke();
    if (np === 1) {                                  // the gold mark, right panel
      ctx.beginPath();
      ctx.arc(nrX + nrW / 2 + sway * 0.4, doorY + nrH * 0.55, nrW * 0.24, 0, 6.2832);
      ctx.strokeStyle = rgba(PAL.goldLeaf, 0.85);
      ctx.lineWidth = 0.8 * scale;
      ctx.stroke();
    }
  }
  // hanging rail over the noren
  ctx.beginPath();
  ctx.moveTo(doorX - 1 * scale, doorY + 0.4 * scale);
  ctx.lineTo(doorX + doorW + 1 * scale, doorY + 0.4 * scale);
  ctx.strokeStyle = rgba(PAL.goldDeep, 0.55);
  ctx.lineWidth = 1 * scale;
  ctx.stroke();
  // two lit windows flanking the door
  var winW = wallW * 0.1, winH = wallH * 0.34, winY = wallY + wallH * 0.28, wi, winX, winOff = [-0.30, 0.30];
  for (wi = 0; wi < winOff.length; wi++) {
    winX = cx + winOff[wi] * wallW - winW / 2;
    roundRect(ctx, winX, winY, winW, winH, 1.5 * scale);
    ctx.fillStyle = rgba(PAL.lantern, 0.32 + 0.5 * na);
    ctx.fill();
    ctx.lineWidth = 0.8 * scale; ctx.strokeStyle = rgba(PAL.ink, 0.55); ctx.stroke();
  }
  // upper-left rim light along the wall's top edge (key-light convention)
  ctx.beginPath();
  ctx.moveTo(wallX + 2 * scale, wallY + 1.2 * scale);
  ctx.lineTo(wallX + wallW * 0.42, wallY + 1.2 * scale);
  ctx.lineWidth = 1.2 * scale;
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.2);
  ctx.stroke();

  // the station's own icon, big, centred on the platform
  ctx.save();
  ctx.font = Math.round(r * 0.62) + 'px sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.fillText(ic, cx, cy + 2 * scale);
  ctx.restore();

  // three small labelled sub-zones in a row beneath the platform — Food / Fishing rod / Transport,
  // geometry from the SAME hubSectionRects() helper hubSections() reads, so the drawn art and the
  // app layer's clickable hotspots always land in exactly the same place.
  var rects = hubSectionRects(cx, cy, r), zi, rct, zg;
  for (zi = 0; zi < rects.length; zi++) {
    rct = rects[zi];
    contactShadow(ctx, rct.cx, rct.cy + rct.r * 0.7, rct.r * 2.2, rct.r * 0.8, 0.16);
    zg = ctx.createLinearGradient(0, rct.cy - rct.r, 0, rct.cy + rct.r);
    zg.addColorStop(0, rgba(liftRGB(PAL.washi, -4), 1));
    zg.addColorStop(1, rgba(liftRGB(PAL.washi, -28), 1));
    ctx.beginPath(); ctx.arc(rct.cx, rct.cy, rct.r, 0, Math.PI * 2);
    ctx.fillStyle = zg; ctx.fill();
    ctx.lineWidth = 1 * scale; ctx.strokeStyle = rgba(PAL.goldDeep, 0.55); ctx.stroke();
    rimLightArc(ctx, rct.cx, rct.cy, rct.r - 1 * scale, 0.3, PAL.rimWhite);
    ctx.save();
    ctx.font = Math.round(rct.r * 1.05) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(rct.icon, rct.cx, rct.cy + 0.5 * scale);
    ctx.restore();
    chip(ctx, rct.cx, rct.cy + rct.r + 3 * scale, (_lang === 'ja' ? rct.jp : rct.en), {
      font: '600 ' + Math.round(9 * scale) + 'px system-ui,sans-serif',
      pad: 3 * scale, h: 12 * scale, r: 2 * scale,
      bg: rgba(PAL.washi, 0.88), border: rgba(PAL.goldDeep, 0.4)
    });
  }

  ctx.restore();
}

function drawStations(ctx, sim, t, view) {
  if (!view || !P || !P.STATIONS) return;
  var terr = view.tintMap || P.stationReadiness(sim);
  // the shared LIGHT rig grades the lantern glow smoothly (and carries the report dusk floor)
  var na = LIGHT.night;
  var discR = 21 * scale;
  var simStations = (sim && sim.stations) ? sim.stations : null;
  var i, j;
  for (i = 0; i < P.STATIONS.length; i++) {
    var st = P.STATIONS[i];
    if (st.hidden) continue;   // §map v2: command folded into Hinata, finance hidden
    var p = stationPx(st, view);
    var cx = p.x, cy = p.y;
    var simSt = null;
    if (simStations) { for (j = 0; j < simStations.length; j++) { if (simStations[j].id === st.id) { simSt = simStations[j]; break; } } }
    var crewCount = simSt ? simSt.crewIds.length : 0;
    var hot = !!(simSt && simSt.dominantProblem && crewCount > 0);
    var tv = terr[st.id] || 'none';
    var terrDef = TERR[tv];
    // DOM centres the whole disc+name block on station.y (translate(-50%,-50%)) so the disc sits ~11px above cy.
    // Keep the halo + night lantern + contact shadow at cy (roads/tint/ground meet the station point); raise
    // the disc block to discCy.
    var discCy = cy - 11 * scale;
    // Hinata (flag hub===true) gets the big command-centre compound (drawStations_hub) in place of
    // the normal ~42px icon disc; footR is the generic "disc footprint radius" every halo/shadow/
    // ring/badge/name below is sized from, so the whole treatment scales up with it unchanged.
    var isHub = !!st.hub;
    var footR = isHub ? discR * HUB_FOOT_MULT : discR;

    // wide, faint ground shadow under the whole disc block, resting on the station's ground point,
    // plus the low-sun LONG cast shadow (spec §2 lighting) stretching away from the dawn/dusk sun
    contactShadow(ctx, cx, cy, footR * 2.6, footR * 0.9, 0.2);
    longShadow(ctx, cx, cy + footR * 0.15, footR * 1.5, isHub ? 0.8 : 1);

    // (c) territory halo — greens/ambers/reds the ground behind the icon (style.css:370-377)
    if (terrDef) {
      ctx.save();
      ctx.globalAlpha = terrDef.op;
      radialGlow(ctx, cx, cy, footR * 1.3, terrDef.rgb, terrDef.a);
      ctx.restore();
    }
    // (f) warm night lantern light-pool, graded by the LIGHT rig — a stalled station's red warning
    // always outranks the cozy lantern. The pool BREATHES slowly at night (spec §2 "lantern pools
    // that bloom"); reduced motion holds the base radius (light stays, motion stops).
    if (!hot && na > 0.02) {
      var lb = view.rm ? 1 : 1 + 0.07 * Math.sin(t * 0.7 + i * 1.9);
      lightPool(ctx, cx, cy, footR * 1.7 * lb, PAL.lantern, 0.24 * na);
    }

    // (b) icon disc — full gold-leaf lacquer bevel (lacquer body + inner shadow + upper-left rim
    // light + gold-leaf rim stroke), territory-tinted when the station has a live tint
    var rimRgb = terrDef ? hexRGB(terrDef.border) : PAL.goldLeaf;
    if (isHub) {
      drawStations_hub(ctx, cx, discCy, footR, rimRgb, na, st.icon, t, !!view.rm);
    } else {
      bevelDisc(ctx, cx, discCy, discR, PAL.indigo, rimRgb);

      // occasional gold-leaf glint catching the rim light — sparingly, staggered per station so they
      // don't all shimmer in unison; skipped under reduced motion
      if (!view.rm) {
        var glintPh = (t * 0.35 + i * 1.7) % 4;
        if (glintPh < 0.35) {
          var glintA = Math.sin((glintPh / 0.35) * Math.PI);
          sparkle(ctx, cx + discR * 0.62, discCy - discR * 0.66, 2.4 * scale, 0.75 * glintA);
        }
      }

      // icon emoji
      ctx.save();
      ctx.font = Math.round(19 * scale) + 'px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = '#fff';
      ctx.fillText(st.icon, cx, discCy + 1 * scale);
      ctx.restore();
      // (a) per-id landmark glyph, drawn resting against the disc
      drawStations_glyph(ctx, st.id, cx, discCy, discR, na, t, !!view.rm);
    }
    // (e) pulsing red stalled ring — only when the station has a live problem AND crew
    if (hot) {
      var puls = view.rm ? 0.8 : (0.8 + 0.2 * Math.cos(t * 2 * Math.PI / 1.1));
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, discCy, footR + 4 * scale, 0, Math.PI * 2);
      ctx.strokeStyle = rgba(TERR.red.rgb, 0.35 * puls);
      ctx.lineWidth = 3 * scale;
      ctx.stroke();
      ctx.restore();
    }
    // (d) crew-count badge, top-right corner of the disc — a mini gold bevel (liftRGB gradient +
    // upper-left rim-light arc) instead of the old flat gold fill
    if (crewCount > 0) {
      var bx = cx + footR * 0.75, by4 = discCy - footR * 0.9, br = 9 * scale;
      ctx.save();
      var bg = ctx.createLinearGradient(bx, by4 - br, bx, by4 + br);
      bg.addColorStop(0, rgba(liftRGB(PAL.gold, 40), 1));
      bg.addColorStop(1, rgba(liftRGB(PAL.gold, -30), 1));
      ctx.beginPath(); ctx.arc(bx, by4, br, 0, Math.PI * 2);
      ctx.fillStyle = bg; ctx.fill();
      ctx.lineWidth = 1 * scale;
      ctx.strokeStyle = rgba(PAL.goldDeep, 0.7);
      ctx.stroke();
      rimLightArc(ctx, bx, by4, br, 0.4, PAL.goldPale);
      ctx.font = 'bold ' + Math.round(11 * scale) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = rgba(PAL.indigoDeep, 1);
      ctx.fillText(String(crewCount), bx, by4 + 1 * scale);
      ctx.restore();
    }
    // bilingual name — plain gold text (no box), matching .st-nm (style.css:268) so it never occludes pawns.
    // Hub gets extra clearance, PROPORTIONAL to footR (not a fixed px offset), so the name always
    // clears the sub-zone chip row beneath it regardless of HUB_FOOT_MULT.
    ctx.save();
    ctx.font = '600 ' + Math.round(11 * scale) + 'px sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3 * scale;
    ctx.fillStyle = rgba(PAL.gold, 1);
    ctx.fillText(nm(st.name), cx, discCy + footR + (isHub ? footR * 0.6 : 6 * scale));
    ctx.restore();
  }
}

// ---- hubSections (exported on window.PRS_STAGE) ----
// PUBLIC, pure, read-only: returns the SAME 3 sub-zone rects drawStations_hub just drew, in CSS
// px, so the app layer can place DOM click/keyboard hotspots exactly on top of them. Finds the hub
// station via P.STATIONS[].hub (the same flag drawStations() keys its isHub branch off) and
// computes its centre the SAME way drawStations() does — stationPx(hubSt, view) plus the module
// `scale` for the discCy/discR offsets — then feeds it through the SAME hubSectionRects() helper
// drawStations_hub calls, so the drawn art and the returned geometry can never drift apart.
// Returns [] if there is no hub station, it is hidden, or view is missing/degenerate. Safe to call
// every frame: no ctx writes, no state mutation, reads only P.STATIONS + the module `scale`.
function hubSections(view) {
  if (!view || !(view.w > 0) || !(view.h > 0) || !P || !P.STATIONS) return [];
  var hubSt = null, i;
  for (i = 0; i < P.STATIONS.length; i++) {
    if (P.STATIONS[i].hub) { hubSt = P.STATIONS[i]; break; }
  }
  if (!hubSt || hubSt.hidden) return [];
  var p = stationPx(hubSt, view);
  var discCy = p.y - 11 * scale;          // mirrors drawStations()'s discCy math exactly
  var discR = 21 * scale;                 // mirrors drawStations()'s discR constant
  var footR = discR * HUB_FOOT_MULT;
  var rects = hubSectionRects(p.x, discCy, footR);
  var out = [], j, z;
  for (j = 0; j < rects.length; j++) {
    z = rects[j];
    out.push({ id: z.id, label: (_lang === 'ja' ? z.jp : z.en), cx: z.cx, cy: z.cy, r: z.r });
  }
  return out;
}

// ---- drawStallMarkers (spec §4 report-on-stage, render side) ----
// view.stallMarkers = [ { stationId, sev } ]: glow pulses at the stations where
// idle/rework actually accrued during the run. sev is 0..1 severity (numbers
// outside clamp; the strings 'idle'/'rework' are accepted defensively) — colour
// grades amber → hanko red with it. Markers for the folded/hidden stations
// (command/finance/clinic) land on the Hinata hub, mirroring the sim's own
// folding. The DOM hotspot + aria label live on the app side (S3); this layer
// is purely the light. RM: steady ring + glow, no pulse, no ripple.
function drawStallMarkers(ctx, sim, t, view) {
  var ms = view && view.stallMarkers;
  if (!ms || !ms.length || !P) return;
  var i, m, st, p, footR, discCy, sev, rgb, pulse, k2, hg;
  for (i = 0; i < ms.length; i++) {
    m = ms[i]; if (!m) continue;
    st = P.station(m.stationId || m.station);
    if (!st) continue;
    if (st.hidden) {
      hg = hubGeom(view); if (!hg) continue;
      p = { x: hg.cx, y: hg.cy }; footR = hg.footR; discCy = hg.discCy;
    } else {
      p = stationPx(st, view);
      footR = st.hub ? 21 * scale * HUB_FOOT_MULT : 21 * scale;
      discCy = p.y - 11 * scale;
    }
    sev = (typeof m.sev === 'number') ? clamp(m.sev, 0, 1) : (m.sev === 'idle' ? 0.55 : 1);
    rgb = drawSky_mix(PAL.amber, PAL.hanko, sev);
    pulse = view.rm ? 0.8 : 0.65 + 0.35 * Math.sin(t * 6.2832 / 1.6 + i * 1.3);
    // ground glow where the idle/rework burned
    radialGlow(ctx, p.x, p.y, footR * (0.9 + 0.4 * sev), rgb, (0.20 + 0.16 * sev) * pulse);
    // defining ring around the disc block
    ctx.save();
    ctx.beginPath();
    ctx.arc(p.x, discCy, footR + 7 * scale, 0, 6.2832);
    ctx.strokeStyle = rgba(rgb, (0.45 + 0.3 * sev) * pulse);
    ctx.lineWidth = 2.5 * scale;
    ctx.stroke();
    ctx.restore();
    // slow outbound ripple — pure motion, skipped under RM
    if (!view.rm) {
      k2 = ((t / 2.4 + i * 0.37) % 1 + 1) % 1;
      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, discCy, footR + (7 + k2 * 18) * scale, 0, 6.2832);
      ctx.strokeStyle = rgba(rgb, (1 - k2) * 0.28);
      ctx.lineWidth = 1.5 * scale;
      ctx.stroke();
      ctx.restore();
    }
  }
}

// ---- drawParticles (spec §2 pooled particle system — seasoning, not weather) ----
// Every particle is a pure function of (t, index): fixed counts (≤ 4 smoke +
// 3 steam + 6 fireflies per frame), zero allocation, zero retained state — the
// strictest possible "pool cap". Smoke rises from the hub's galley chimney
// (denser during the fishday 16:00–17:30 cook block, when cook-steam also
// puffs off the Food sub-zone); gold fireflies drift around the hub + lodging
// lanterns once the evening light passes ~0.22. RM keeps a held wisp + held
// glints (the light) and drops every drift (the motion).
function drawParticles(ctx, sim, t, view) {
  if (!view) return;
  var rm = !!view.rm;
  var hg = hubGeom(view);
  var i, ph, sx, sy, a;
  if (hg) {
    var cook = !!(sim && sim.mode === 'minute' && sim.segment === 'fishday' &&
                  sim.clockMin >= 960 && sim.clockMin < 1050);
    if (rm) {
      radialGlow(ctx, hg.chimneyX + 2 * scale, hg.chimneyMouthY - 8 * scale, 5 * scale, PAL.washiWarm, 0.10);
      radialGlow(ctx, hg.chimneyX + 5 * scale, hg.chimneyMouthY - 17 * scale, 7 * scale, PAL.washiWarm, 0.07);
    } else {
      for (i = 0; i < 4; i++) {
        ph = ((t / (cook ? 3.4 : 5.6) + i / 4) % 1 + 1) % 1;
        sx = hg.chimneyX + Math.sin(t * 0.7 + i * 1.8 + ph * 3.2) * (2 + 6 * ph) * scale + ph * 7 * scale;
        sy = hg.chimneyMouthY - ph * 42 * scale;
        a = (1 - ph) * (cook ? 0.20 : 0.13);
        radialGlow(ctx, sx, sy, (2 + 6.5 * ph) * scale, PAL.washiWarm, a);
      }
      if (cook) {
        var rects = hubSectionRects(hg.cx, hg.discCy, hg.footR), fz = rects[0];
        for (i = 0; i < 3; i++) {
          ph = ((t / 1.6 + i / 3) % 1 + 1) % 1;
          sx = fz.cx + Math.sin(t * 2.3 + i * 2.1) * 2 * scale;
          sy = fz.cy - fz.r - ph * 14 * scale;
          radialGlow(ctx, sx, sy, (1.5 + 2.5 * ph) * scale, PAL.rimWhite, (1 - ph) * 0.22);
        }
      }
    }
  }
  if (LIGHT.night > 0.22 && P && P.station) {
    var homes = [P.station('mess'), P.station('lodging')], si, fi2, lx, ly, fx, fy, fa, pph;
    for (si = 0; si < homes.length; si++) {
      if (!homes[si]) continue;
      lx = px(homes[si].x, view); ly = py(homes[si].y, view) - 8 * scale;
      for (fi2 = 0; fi2 < 3; fi2++) {
        if (rm) {
          fx = lx + (fi2 - 1) * 14 * scale; fy = ly - (6 + fi2 * 4) * scale;
          radialGlow(ctx, fx, fy, 1.8 * scale, PAL.goldPale, 0.22 * LIGHT.night);
        } else {
          pph = t * 0.32 + fi2 * 2.1 + si * 3.7;
          fx = lx + Math.cos(pph) * (16 + fi2 * 7) * scale;
          fy = ly - 4 * scale + Math.sin(pph * 1.7 + fi2) * (5.5 + fi2 * 2) * scale;
          fa = (0.14 + 0.22 * (0.5 + 0.5 * Math.sin(t * 2.4 + fi2 * 2.9 + si))) * LIGHT.night;
          radialGlow(ctx, fx, fy, 1.8 * scale, PAL.goldPale, fa);
        }
      }
    }
  }
}

// ---- drawDusk (spec §4, HUD side) — the full-canvas evening unifier ----
// A whisper-thin cool-to-warm grade laid over EVERYTHING (including any
// pull-back letterbox margins — it sits outside the camera transform). The
// heavy lifting of the dusk look happens inside the world layers via the
// LIGHT rig's dusk floor + drawSky's dusk blend; this pass just marries the
// frame together. Alpha stays low so pawn/state colours keep reading.
function drawDusk(ctx, view) {
  if (_dusk <= 0) return;
  var g = ctx.createLinearGradient(0, 0, 0, view.h);
  g.addColorStop(0, rgba('28,32,58', 0.14 * _dusk));
  g.addColorStop(0.55, rgba('88,52,64', 0.08 * _dusk));
  g.addColorStop(1, rgba('124,64,74', 0.14 * _dusk));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, view.w, view.h);
}

// ---- drawStamp (spec §4) — the hanko grade seal, stage corner (HUD layer) ----
// view.stamp = { grade, at, x?, y? }: `at` is the rAF-clock ms when the stamp
// landed; the thock plays over ~620ms (drop 1.7×→0.94 squash→1 settle, with a
// red shock ring at the moment of impact). Missing `at` — or reduced motion —
// renders the final seated seal, one static frame. The seal edge carries a
// deterministic harmonic wobble (ink bleed) + a few flecks seeded off the
// grade letter; no RNG anywhere.
function drawStamp_seal(ctx, r, alpha, wobMul) {
  var steps = 30, i, a, ca, sa, mx, base, wob, rr;
  ctx.beginPath();
  for (i = 0; i <= steps; i++) {
    a = (i / steps) * 6.2832;
    ca = Math.cos(a); sa = Math.sin(a);
    mx = Math.max(Math.abs(ca), Math.abs(sa));
    base = Math.min(r / mx, r * 1.3);                       // square, corner-clipped → rounded seal
    wob = 1 + wobMul * (0.022 * Math.sin(a * 5 + 1.3) + 0.016 * Math.cos(a * 8));
    rr = base * wob;
    if (i === 0) ctx.moveTo(ca * rr, sa * rr); else ctx.lineTo(ca * rr, sa * rr);
  }
  ctx.closePath();
  ctx.fillStyle = rgba(PAL.hanko, alpha);
  ctx.fill();
}
function drawStamp(ctx, t, view) {
  var s = view && view.stamp;
  if (!s || !s.grade) return;
  var size = 66 * scale;
  var x = (typeof s.x === 'number') ? s.x : view.w - size * 0.5 - 24 * scale;
  var y = (typeof s.y === 'number') ? s.y : view.h - size * 0.5 - 22 * scale;
  var k = 1;
  if (!view.rm && typeof s.at === 'number' && s.at > 0) {
    k = (t * 1000 - s.at) / 620;
    if (k < 0) return;                                      // not landed yet
    k = clamp(k, 0, 1);
  }
  var sc2 = (k < 0.5) ? lerp(1.7, 0.94, smoothstep(k / 0.5))
                      : lerp(0.94, 1, smoothstep((k - 0.5) / 0.5));
  var alpha = clamp(k * 3, 0, 1);
  // impact shock ring (motion-only)
  if (!view.rm && k > 0.42 && k < 0.9) {
    var rk = (k - 0.42) / 0.48;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, size * (0.55 + rk * 0.5), 0, 6.2832);
    ctx.strokeStyle = rgba(PAL.hanko, (1 - rk) * 0.4);
    ctx.lineWidth = 2 * scale;
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.rotate(-8 * Math.PI / 180);
  ctx.scale(sc2, sc2);
  // ink bleed halo under the body, then the seal itself
  drawStamp_seal(ctx, size * 0.54, 0.30, 2.2);
  drawStamp_seal(ctx, size * 0.5, 0.92, 1);
  // inner seal border, washi
  roundRect(ctx, -size * 0.36, -size * 0.36, size * 0.72, size * 0.72, size * 0.06);
  ctx.strokeStyle = rgba(PAL.washi, 0.4);
  ctx.lineWidth = 1.2 * scale;
  ctx.stroke();
  // the grade, brush-serif, washi on hanko red
  ctx.fillStyle = rgba(PAL.washi, 0.96);
  ctx.font = '700 ' + Math.round(size * 0.5) + 'px Georgia,"Hiragino Mincho ProN",serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(String(s.grade), 0, 1 * scale);
  // deterministic ink flecks seeded off the grade letter
  var seed = String(s.grade).charCodeAt(0) || 65, fi3, fa2, fr2;
  for (fi3 = 0; fi3 < 4; fi3++) {
    fa2 = ((seed * 2.399 + fi3 * 1.883) % 6.2832);
    fr2 = size * (0.56 + 0.1 * (((seed + fi3 * 7) % 5) / 5));
    ctx.beginPath();
    ctx.arc(Math.cos(fa2) * fr2, Math.sin(fa2) * fr2, (0.9 + (fi3 % 2) * 0.5) * scale, 0, 6.2832);
    ctx.fillStyle = rgba(PAL.hanko, 0.5);
    ctx.fill();
  }
  ctx.restore();
}



  // ---- drawFigures ----
// ---- drawFigures ----
function drawFigures_pulse(t, period, lo, hi) {
  var ph = (t % period) / period;
  var c = (Math.cos(2 * Math.PI * ph) + 1) / 2;   // 1 at ph=0, 0 at ph=.5 (mirrors the CSS "pulse" keyframe)
  return lo + (hi - lo) * c;
}
function drawFigures_leg(ctx, hipX, hipY, w, h, r, angleDeg, color) {
  ctx.save();
  ctx.translate(hipX, hipY);
  ctx.rotate(angleDeg * Math.PI / 180);
  ctx.fillStyle = color;
  roundRect(ctx, -w / 2, 0, w, h, r);
  ctx.fill();
  // faint leading-edge highlight for a touch of cylindrical volume
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.16);
  ctx.lineWidth = Math.max(0.6, w * 0.22);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w / 2 + w * 0.22, h * 0.1);
  ctx.lineTo(-w / 2 + w * 0.22, h * 0.75);
  ctx.stroke();
  ctx.restore();
}
// ---- W2 deterministic idle work-loops (spec §4 / CLAUDE.md §21) ----------
// Pure functions of (pid, t) only — no RNG, no Date.now(), no extra engine
// reads. Mirrors the app.js figSpeedMul FNV-1a idiom (kept local to stage.js
// per the file-ownership boundary: stage.js never imports from app.js).
function workHash(s) {
  var h = 2166136261, i;
  s = s || '';
  for (i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h;
}
function workFrac(s) { return (workHash(s) % 100000) / 100000; }        // deterministic [0,1) per seed string
function gesturePhase(t, period, offset) {                              // deterministic [0,1) sawtooth, offset per pid
  var v = (t / period) + offset;
  return v - Math.floor(v);
}

// ---- role work-gesture overlays (spec §4's 8 gestures) --------------------
// Each draws a SMALL prop/limb overlay near the pawn's hand/head anchor, in
// the caller's already-translated/flipped local space (cx, feetY are the
// pawn's own — never re-derive positions here). ph is this pawn's gesture
// phase in [0,1). Amplitudes stay in the 2-4px (unscaled) band per the brief;
// every drawn SIZE still multiplies by the module `scale`, never a position.
function gestureChef(ctx, cx, feetY, headCy, ph) {                      // chop/stir: knife flicks over a board
  var handX = cx + 6.5 * figs, boardY = feetY - 8 * figs;
  var k = Math.abs(Math.sin(2 * Math.PI * ph));                        // 0..1, sharp at the down-chop
  var bladeY = boardY - 5 * figs - k * 3 * figs;
  ctx.save();
  ctx.strokeStyle = rgba(PAL.washi, 0.55);
  ctx.lineWidth = 1.1 * figs;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(handX - 4 * figs, boardY); ctx.lineTo(handX + 4 * figs, boardY); ctx.stroke();  // board
  ctx.strokeStyle = rgba(PAL.ink, 0.6);
  ctx.lineWidth = 1.3 * figs;
  ctx.beginPath(); ctx.moveTo(handX, bladeY); ctx.lineTo(handX, bladeY + 4 * figs); ctx.stroke();              // blade
  ctx.restore();
}
function gestureRod(ctx, cx, feetY, headCy, ph) {                       // specialist: rod-tip flick
  var handX = cx + 6 * figs, handY = feetY - 13 * figs;
  var ang = -34 + 16 * Math.sin(2 * Math.PI * ph);
  ctx.save();
  ctx.translate(handX, handY);
  ctx.rotate(ang * Math.PI / 180);
  ctx.strokeStyle = rgba(PAL.ink, 0.55);
  ctx.lineWidth = 1 * figs;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(13 * figs, 0); ctx.stroke();
  ctx.restore();
}
function gestureClipboard(ctx, cx, feetY, headCy, ph) {                 // comms: clipboard flip
  var x = cx - 6 * figs, y = feetY - 14 * figs;
  var tilt = 9 * Math.sin(2 * Math.PI * ph);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tilt * Math.PI / 180);
  ctx.fillStyle = rgba(PAL.washi, 0.82);
  ctx.strokeStyle = rgba(PAL.ink, 0.4);
  ctx.lineWidth = 0.8 * figs;
  roundRect(ctx, -2.4 * figs, -3.2 * figs, 4.8 * figs, 6.4 * figs, 0.8 * figs);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
function gestureScan(ctx, cx, feetY, headCy, ph) {                      // safetyLead: horizon scan (hand-shade sweep)
  var sweep = Math.sin(2 * Math.PI * ph) * 4 * figs;
  ctx.save();
  ctx.strokeStyle = rgba(PAL.ink, 0.5);
  ctx.lineWidth = 1.1 * figs;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 3 * figs, headCy - 4.5 * figs);
  ctx.lineTo(cx - 3 * figs + sweep, headCy - 6.2 * figs);
  ctx.stroke();
  ctx.restore();
}
function gestureCrate(ctx, cx, feetY, headCy, ph) {                     // logi: crate lift
  var liftK = (Math.sin(2 * Math.PI * ph) + 1) / 2;
  var y = feetY - 7 * figs - liftK * 3 * figs;
  ctx.save();
  ctx.fillStyle = rgba(PAL.washiWarm, 0.5);
  ctx.strokeStyle = rgba(PAL.ink, 0.45);
  ctx.lineWidth = 0.9 * figs;
  roundRect(ctx, cx - 4 * figs, y - 3.5 * figs, 8 * figs, 5.5 * figs, 1 * figs);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
function gestureTally(ctx, cx, feetY, headCy, ph) {                    // budgetLead: tally count (tick at hand)
  var x = cx + 6.5 * figs, y = feetY - 12 * figs + Math.sin(2 * Math.PI * ph) * 1.4 * figs;
  ctx.save();
  ctx.strokeStyle = rgba(PAL.ink, 0.55);
  ctx.lineWidth = 1 * figs;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(x, y - 2 * figs); ctx.lineTo(x, y + 2 * figs); ctx.stroke();
  ctx.restore();
}
function gestureBeckon(ctx, cx, feetY, headCy, ph) {                    // pm: beckon/point wave
  var shX = cx + 6 * figs, shY = feetY - 15 * figs;
  var ang = -18 + 26 * Math.sin(2 * Math.PI * ph);
  ctx.save();
  ctx.translate(shX, shY);
  ctx.rotate(ang * Math.PI / 180);
  ctx.strokeStyle = rgba(PAL.skin, 0.9);
  ctx.lineWidth = 1.8 * figs;
  ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(8 * figs, 1.5 * figs); ctx.stroke();
  ctx.restore();
}
function gestureSurvey(ctx, cx, feetY, headCy, ph) {                    // siteLead/owner: broad survey stance sway
  var sway = Math.sin(2 * Math.PI * ph) * 1.6 * figs;
  ctx.save();
  ctx.strokeStyle = rgba(PAL.ink, 0.42);
  ctx.lineWidth = 1 * figs;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(cx - 6 * figs, feetY - 14 * figs);
  ctx.lineTo(cx - 8 * figs + sway, feetY - 9 * figs);
  ctx.moveTo(cx + 6 * figs, feetY - 14 * figs);
  ctx.lineTo(cx + 8 * figs + sway, feetY - 9 * figs);
  ctx.stroke();
  ctx.restore();
}
var GESTURE = {
  chef: gestureChef, specialist: gestureRod, comms: gestureClipboard, safetyLead: gestureScan,
  logi: gestureCrate, budgetLead: gestureTally, pm: gestureBeckon, siteLead: gestureSurvey, owner: gestureSurvey
};

function drawFigures(ctx, sim, t, view) {
  if (!sim || !sim.participants || !view || !view.fig) return;
  var ts = t * 1000;
  var rm = !!view.rm;
  // state -> bubble/border tint (mirrors style.css .astro.s-* .bub border-color groups; resolved/idle/tired/working keep the chip default)
  var BTINT = { confused: '217,83,79', onFire: '217,83,79', waiting: '193,122,31', waitInfo: '193,122,31', meeting: '92,127,146', rework: '92,127,146' };
  // scaled chip geometry, shared by the speech bubble + name chip (chip() never auto-scales)
  var chipFont = '600 ' + Math.round(10 * scale) + 'px system-ui,sans-serif';
  var chipPad = 4 * scale, chipH = 14 * scale, chipR = 2 * scale, chipTail = 4 * scale;

  for (var i = 0; i < sim.participants.length; i++) {
    var p = sim.participants[i];
    var f = view.fig[p.id];
    if (!f) continue;
    var role = P.role(p.roleId) || { color: '#5b6b45', icon: '' };
    // §21.4 Live bridge: the gap-focus figure shows the gap taxonomy (迷い/手待ち/手戻り) the app painted, not raw engine state
    var state = (view.gapState && view.gapState.pid === p.id) ? view.gapState.state : p.state;
    var cx = f.cx, feetY = f.cy;
    // ---- W2 bounded idle wander: a slow (20-40s), <=6px-radius seeded drift
    // on the fanned station position — only when settled (never walking,
    // never mid-stall: a frozen pawn must read as STOPPED) and never under RM.
    if (!rm && !f.walking && !STALL_STATES[state]) {
      var wPeriod = 20 + workFrac(p.id + '#wp') * 20;
      var wPhase = workFrac(p.id + '#wa') * Math.PI * 2;
      var wRadK = 0.35 + workFrac(p.id + '#wr') * 0.65;
      var wAng = (t * Math.PI * 2 / wPeriod) + wPhase;
      var wRad = 6 * scale * wRadK;
      cx += Math.cos(wAng) * wRad;
      feetY += Math.sin(wAng) * wRad * 0.4;
    }
    var dim = (STATE_DIM[state] != null) ? STATE_DIM[state] : 1;
    var roleRGB = hexRGB(role.color);

    ctx.save();
    ctx.globalAlpha = dim;

    // ---- shadow + pawn body (flip + walk-bob live in here; shadow ignores bob) ----
    ctx.save();
    if (f.faceL) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }

    var shRx = (f.walking && !rm) ? 6 : 7.5;
    contactShadow(ctx, cx, feetY + 3 * scale, shRx * 2 * scale, 5 * scale, 0.42);

    // walk trot / working idle-breath bob (t-driven ambience per contract §2); none under rm
    var bobOffset = 0, swayX = 0;
    if (!rm) {
      if (state === 'working') {
        var ph2 = (t % 1.15) / 1.15;
        bobOffset = -1.25 * scale * (1 - Math.cos(2 * Math.PI * ph2));
      } else if (f.walking) {
        var ph1 = (t % 0.38) / 0.38;
        bobOffset = -0.8 * scale * (1 - Math.cos(2 * Math.PI * ph1));
      } else if (state === 'idle') {
        // ---- W2 idle fidget: a subtle weight-shift sway, seeded per pid, every few seconds
        var fPeriod = 3.4 + workFrac(p.id + '#fp') * 1.6;
        var fPhase = workFrac(p.id + '#fa');
        swayX = Math.sin(gesturePhase(t, fPeriod, fPhase) * Math.PI * 2) * 1.6 * scale;
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
    ctx.translate(swayX, bobOffset);

    drawFigures_leg(ctx, cx - 2 * scale, feetY - 7.5 * scale, 3 * scale, 7.5 * scale, 1.5 * scale, angL, '#2b241c');
    drawFigures_leg(ctx, cx + 2 * scale, feetY - 7.5 * scale, 3 * scale, 7.5 * scale, 1.5 * scale, angR, '#2b241c');

    // torso (coat) — role-colour lacquer bevel (liftRGB top/bottom), ink outline, washi sash, upper-left rim light
    var trX = cx - 6 * scale, trY = feetY - 18 * scale, trW = 12 * scale, trH = 12.5 * scale, trR = 3.5 * scale;
    var torsoGrad = ctx.createLinearGradient(trX, trY, trX, trY + trH);
    torsoGrad.addColorStop(0, 'rgb(' + liftRGB(roleRGB, 24) + ')');
    torsoGrad.addColorStop(1, 'rgb(' + liftRGB(roleRGB, -18) + ')');
    ctx.fillStyle = torsoGrad;
    roundRect(ctx, trX, trY, trW, trH, trR);
    ctx.fill();
    ctx.lineWidth = 1 * scale;
    ctx.strokeStyle = rgba(PAL.ink, 0.35);
    roundRect(ctx, trX, trY, trW, trH, trR);
    ctx.stroke();
    ctx.fillStyle = rgba(PAL.washi, 0.7);
    ctx.fillRect(trX, trY + trH - 5 * scale, trW, 2 * scale);
    // upper-left key-light lick along the coat's shoulder/collar edge
    ctx.save();
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.3);
    ctx.lineWidth = 1.3 * scale;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(trX + 1.2 * scale, trY + trH * 0.62);
    ctx.lineTo(trX + 1.2 * scale, trY + 1.4 * scale);
    ctx.quadraticCurveTo(trX + 1.2 * scale, trY + 0.8 * scale, trX + trW * 0.5, trY + 0.8 * scale);
    ctx.stroke();
    ctx.restore();

    // head — skin tone, soft ink outline, upper-left rim-light arc
    var headR = 4 * scale, headCy = feetY - 19.5 * scale;
    ctx.beginPath();
    ctx.fillStyle = rgba(PAL.skin, 1);
    ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 1 * scale;
    ctx.strokeStyle = rgba(PAL.ink, 0.3);
    ctx.stroke();
    rimLightArc(ctx, cx, headCy, headR, 0.4);

    // cap — role colour, small bevel, left-biased warm rim-light band + washi trim
    var hX = cx - 5 * scale, hY = feetY - 26 * scale, hW = 10 * scale, hH = 5 * scale, hR = 2.2 * scale;
    ctx.fillStyle = role.color;
    roundRect(ctx, hX, hY, hW, hH, hR);
    ctx.fill();
    ctx.fillStyle = rgba(PAL.rimWhite, 0.34);
    ctx.fillRect(hX, hY, hW * 0.6, 1.5 * scale);
    ctx.fillStyle = rgba(PAL.washi, 0.75);
    ctx.fillRect(hX, hY + hH - 1 * scale, hW, 1 * scale);

    // ---- W2 role work-gesture overlay: small, seeded, only while actually working ----
    if (!rm && state === 'working') {
      var gfn = GESTURE[p.roleId];
      if (gfn) {
        var gPeriod = 0.8 + workFrac(p.id + '#gp') * 0.8;
        var gPhase = workFrac(p.id + '#ga');
        gfn(ctx, cx, feetY, headCy, gesturePhase(t, gPeriod, gPhase));
      }
    }

    ctx.restore(); // end bob translate
    ctx.restore(); // end flip

    // ---- state foot-aura (flattened radial glow; never mirrored, never bobbed) ----
    var aura = STATE_AURA[state];
    if (aura) {
      var op = aura.op;
      if (aura.pulse && !rm) op = op * drawFigures_pulse(t, 1.1, 0.6, 1);
      ctx.save();
      ctx.globalAlpha = op;
      ctx.translate(cx, feetY + 1 * scale);
      ctx.scale(1, 10 / 26);
      radialGlow(ctx, 0, 0, 13 * scale, aura.rgb, aura.a);
      ctx.restore();
    }

    // ---- Live gap-focus spotlight ring (gold, pulsing) + a small catching-light sparkle ----
    if (view.spotlightPid && p.id === view.spotlightPid) {
      var pf = rm ? 1 : drawFigures_pulse(t, 1.2, 0.6, 1);
      ctx.save();
      ctx.globalAlpha = 0.4 * pf;
      radialGlow(ctx, cx, feetY + 3 * scale, 16 * scale, PAL.gold, 0.5);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.75 * pf;
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = rgba(PAL.gold, 1);
      ctx.beginPath();
      ctx.arc(cx, feetY + 3 * scale, 9 * scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (!rm) sparkle(ctx, cx + 8 * scale, feetY - 4 * scale, 3 * scale, 0.85 * pf);
    }

    // ---- speech-bubble chip (BUB map; '' = none) — pops on state change ----
    var bubTxt = BUB[state] || '';
    if (bubTxt) {
      var bubY = feetY - 46 * scale; // top-centre; tail:'down' lands the tail near the cap
      var bubScale = 1;
      if (!rm && f.bubT0) {
        var kk = (ts - f.bubT0) / DUR.bubpop;
        if (kk < 0) kk = 0;
        if (kk < 1) {
          if (kk < 0.65) bubScale = 0.5 + (1.15 - 0.5) * (kk / 0.65);
          else bubScale = 1.15 + (1 - 1.15) * ((kk - 0.65) / 0.35);
        }
      }
      var bopts = { tail: 'down', font: chipFont, pad: chipPad, h: chipH, r: chipR, tailLen: chipTail };
      var tint = BTINT[state];
      if (tint) bopts.border = rgba(tint, 1);
      if (bubScale !== 1) {
        var ax = cx, ay = bubY + chipH / 2;
        ctx.save();
        ctx.translate(ax, ay);
        ctx.scale(bubScale, bubScale);
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
      // hovered pawn: append the localized state word (supplied by app.js via view.hoverWord)
      if (p.id === view.hoverPid && view.hoverWord) label += ' · ' + view.hoverWord;
      chip(ctx, cx, feetY + 5 * scale, label, { font: chipFont, pad: chipPad, h: chipH, r: chipR });
    }

    ctx.restore(); // end dim alpha
  }
}


  // ---- drawMotes ----
function drawMotes_trailDot(ctx, x, y, r, rgb, alpha) {
  // small fading glow used for the comet's trail ghosts — cheap, no gradient stops beyond fade-out
  if (r <= 0 || alpha <= 0) return;
  var g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(rgb, alpha));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}

function drawMotes_dot(ctx, x, y, rgb, hi, late) {
  // glowing comet-dot: warm bloom + soft ambient halo + a brighter hot core than before
  ctx.save();
  lightPool(ctx, x, y, 15 * scale, rgb, late ? 0.3 : 0.4);   // warm light spilling off the mote
  radialGlow(ctx, x, y, 13 * scale, rgb, 0.4);               // ~box-shadow 0 0 9px 3px rgba(rgb,.4)
  var g = ctx.createRadialGradient(x, y, 0, x, y, 6 * scale);
  g.addColorStop(0, rgba(hi, 1));
  g.addColorStop(0.4, rgba(hi, 0.85));
  g.addColorStop(0.72, rgba(rgb, 0.42));
  g.addColorStop(1, rgba(rgb, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, 6 * scale, 0, Math.PI * 2);
  ctx.fill();
  if (!late) sparkle(ctx, x, y, 7 * scale, 0.55);            // gold-on-time gets a tiny glint; hanko stays a plain warning
  ctx.restore();
}

function drawMotes_ping(ctx, x, y, elapsed, dur, rgb, hi, rm, late) {
  var k, r, r2, a, flashA;
  ctx.save();
  if (rm) {
    // reduced motion: a fixed-radius double ring for the ping's visible window, no expansion
    lightPool(ctx, x, y, 20 * scale, rgb, late ? 0.3 : 0.4);
    radialGlow(ctx, x, y, 16 * scale, rgb, 0.35);
    ctx.strokeStyle = rgba(rgb, 0.55);
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(x, y, 13 * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = rgba(hi, 0.35);
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(x, y, 8 * scale, 0, Math.PI * 2);
    ctx.stroke();
    if (!late) sparkle(ctx, x, y, 9 * scale, 0.5);
  } else {
    k = clamp(elapsed / dur, 0, 1);
    r = (9 + k * 14) * scale;                                // ~box-shadow spread 0 -> 14px
    a = 0.7 * (1 - k);                                       // ~alpha .7 -> 0
    flashA = Math.max(0, 1 - elapsed / (dur * 0.4));         // quick hot flash right at arrival

    if (flashA > 0) {
      lightPool(ctx, x, y, 22 * scale, rgb, (late ? 0.3 : 0.45) * flashA);
      radialGlow(ctx, x, y, 12 * scale, hi, (late ? 0.4 : 0.6) * flashA);
    }

    ctx.strokeStyle = rgba(rgb, a);
    ctx.lineWidth = 3 * scale;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    // slightly smaller bright echo ring trailing the main one -- reads as a nicer, richer ping
    r2 = Math.max(0, r - 6 * scale);
    ctx.strokeStyle = rgba(hi, a * 0.5);
    ctx.lineWidth = 1.5 * scale;
    ctx.beginPath();
    ctx.arc(x, y, r2, 0, Math.PI * 2);
    ctx.stroke();

    if (!late && flashA > 0.3) sparkle(ctx, x, y, 10 * scale, flashA * 0.7);
  }
  ctx.restore();
}

function drawMotes(ctx, sim, t, view) {
  if (!sim || sim.mode !== 'minute') return;      // §21.3 self-gate: minute-mode only
  if (!view || !view.motes || !view.motes.length) return;
  var ts = t * 1000;
  var i, m, rgb, hi, late, x, y, k, e, st, sp, tst, ti, kt, et, xt, yt, rt, at;
  for (i = 0; i < view.motes.length; i++) {
    m = view.motes[i];
    if (!m || !m.state) continue;                 // 0 = armed, not yet launched -> invisible
    late = !!m.late;
    rgb = late ? PAL.hanko : PAL.gold;             // "gold on time . hanko red late" (style.css:238)
    hi = late ? '255,178,162' : '255,238,176';     // bright core highlight (CSS #ffb2a2 / #ffeeb0)
    if (m.state === 1) {
      if (view.rm) continue;                       // RM: no flight, ping-only at state 2
      k = clamp((ts - (m.t0 || ts)) / (m.dur || 650), 0, 1);
      e = smoothstep(k);
      x = px(lerp(m.ax, m.bx, e), view);
      y = py(lerp(m.ay, m.by, e), view) - Math.sin(k * Math.PI) * 12 * scale;

      // short fading trail behind the comet head -- purely a function of k, no extra cached state
      for (ti = 3; ti >= 1; ti--) {
        kt = k - ti * 0.06;
        if (kt <= 0) continue;                      // don't draw trail before the mote actually launched
        et = smoothstep(kt);
        xt = px(lerp(m.ax, m.bx, et), view);
        yt = py(lerp(m.ay, m.by, et), view) - Math.sin(kt * Math.PI) * 12 * scale;
        rt = Math.max(0, (5 - ti * 1.1) * scale);
        at = Math.max(0, 0.42 - ti * 0.11);
        drawMotes_trailDot(ctx, xt, yt, rt, rgb, at);
      }

      drawMotes_dot(ctx, x, y, rgb, hi, late);
    } else if (m.state === 2) {
      if (m.noPing) continue;                        // app skipped this delivery silently (fast-forward / post-commit sweep) -- no ping
      if (!m._pingT0) m._pingT0 = ts;               // render-only scratch stamp, first frame seen done
      tst = ts - m._pingT0;
      if (tst >= 0 && tst < DUR.ping) {
        st = P.station(m.toSt);
        sp = stationPx(st, view);
        drawMotes_ping(ctx, sp.x, sp.y, tst, DUR.ping, rgb, hi, view.rm, late);
      }
    }
  }
}


  // ---- drawCascade ----
function drawCascade_marker(ctx, x, y) {
  // static RM fault mark: layered glow + thin defining ring + a hint of rim light for volume
  radialGlow(ctx, x, y, 16 * scale, PAL.hanko, 0.38);
  radialGlow(ctx, x, y, 7 * scale, PAL.redBright, 0.85);
  rimLightArc(ctx, x, y, 5 * scale, 0.5, PAL.rimWhite);
  ctx.save();
  ctx.lineWidth = 1.4 * scale;
  ctx.strokeStyle = rgba(PAL.hanko, 0.55);
  ctx.beginPath();
  ctx.arc(x, y, 9 * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawCascade_trail(ctx, trail, ts) {
  // continuous glowing streak through the recent trail points, fading toward the tail —
  // drawn under the discrete ghost beads so the comet reads as one flowing line, not dots
  if (!trail || trail.length < 2) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (var i = 1; i < trail.length; i++) {
    var p0 = trail[i - 1], p1 = trail[i];
    var age = ts - p1.t;
    var k = 1 - clamp(age / DUR.trailKeep, 0, 1);
    if (k <= 0) continue;
    ctx.strokeStyle = rgba(PAL.hanko, 0.4 * k);
    ctx.lineWidth = (1.5 + 3.5 * k) * scale;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawCascade_strike(ctx, x, y, sk) {
  // dramatic double shockwave + a warm contracting flash on the ground at the struck station
  var ringBase = 21 * scale;
  lightPool(ctx, x, y, 34 * scale * (1 - sk * 0.35), PAL.hanko, 0.5 * (1 - sk));
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, ringBase + sk * 14 * scale, 0, Math.PI * 2);
  ctx.lineWidth = 3 * scale;
  ctx.strokeStyle = rgba(PAL.redBright, (1 - sk) * 0.75);
  ctx.stroke();
  var sk2 = clamp(sk - 0.18, 0, 1);
  if (sk2 > 0) {
    ctx.beginPath();
    ctx.arc(x, y, ringBase + sk2 * 22 * scale, 0, Math.PI * 2);
    ctx.lineWidth = 2 * scale;
    ctx.strokeStyle = rgba(PAL.hanko, (1 - sk2) * 0.5);
    ctx.stroke();
  }
  ctx.restore();
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
        drawCascade_marker(ctx, csp.x, csp.y - 30 * scale);
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

  // fading strike shockwave at the last-struck station — independent of the comet's own moving/resting phase
  if (c._strikeAt && (ts - c._strikeAt) < DUR.strike) {
    var sk = (ts - c._strikeAt) / DUR.strike;
    var sPt = stationPx(P.station(c._strikeStation), view);
    drawCascade_strike(ctx, sPt.x, sPt.y, sk);
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

  // continuous glowing streak through the recent trail (drawn under the beads/head)
  drawCascade_trail(ctx, view.trail, ts);

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
    if (gd.on) {
      radialGlow(ctx, gd.x, gd.y, 7 * scale, PAL.hanko, 0.35 * gd.alpha);
      radialGlow(ctx, gd.x, gd.y, 3.2 * scale, PAL.redBright, 0.75 * gd.alpha);
    }
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

  // the comet itself: layered glow with a brighter hot core + a hint of rim light for volume
  ctx.save();
  radialGlow(ctx, x, y, 30 * scale, PAL.hanko, 0.3);
  radialGlow(ctx, x, y, 16 * scale, PAL.hanko, 0.5);
  radialGlow(ctx, x, y, 8 * scale, PAL.redBright, 0.95);
  radialGlow(ctx, x, y, 3 * scale, PAL.rimWhite, 0.85);
  rimLightArc(ctx, x, y, 6 * scale, 0.55, PAL.rimWhite);
  ctx.restore();
}


  window.PRS_STAGE = { initStage: initStage, resizeStage: resizeStage, scene: scene, hubSections: hubSections };
})();
