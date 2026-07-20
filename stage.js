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
  var SPR = null, _sprBroken = false, _sprSince = 0;
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
    var dayMin = minute ? clockOfDay(sim.clockMin) : null;
    _dusk = (view.dusk === true) ? 1 : (typeof view.dusk === 'number' ? clamp(view.dusk, 0, 1) : 0);
    var n = minute ? nightAmount(dayMin) : (view.night ? 1 : 0);
    if (_dusk > 0) n = Math.max(n, 0.82 * _dusk);          // dusk floor: lanterns bloom, water moonlights
    LIGHT.night = n;
    var dayK = minute ? clamp((dayMin - SKY_MIN) / (SKY_MAX - SKY_MIN), 0, 1) : 0.5;
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
  // ROUTE-AWARE PHYSICAL SCENES — presentation-only, schedule-driven.
  //
  // These are places and vessels, not day names. A segment may cross several
  // profiles; sceneProfile follows the solved schedule (or explicit scene
  // metadata supplied by newer engine builds) without mutating simulation data.
  // The return direction is intentionally marked inferred until the user
  // confirms that it is the exact reverse of the outbound route.
  // =========================================================================
  function profile(id, family, stationSet, en, jp, kind, vesselId, flags) {
    return { id: id, family: family, stationSet: stationSet, en: en, jp: jp,
      kind: kind, stopId: id === 'route-overview' ? null : id,
      vesselId: vesselId || null, flags: flags || {} };
  }
  var SCENE_PROFILES = {
    'tokyo-hotel': profile('tokyo-hotel', 'tokyo', 'land', 'TOKYO HOTEL', '東京・ホテル', 'hotel', null,
      { water: false, seaLife: false, localBoat: false, guests: true, guestsRequired: true, showCrew: true }),
    'takeshiba-terminal': profile('takeshiba-terminal', 'tokyo', 'land', 'TAKESHIBA TERMINAL', '竹芝客船ターミナル', 'terminal', 'ogasawara-maru',
      { water: true, seaLife: false, localBoat: false, guests: true, guestsRequired: true, showCrew: true }),
    'ogasawara-maru': profile('ogasawara-maru', 'ship', 'voyage', 'OGASAWARA-MARU', 'おがさわら丸', 'longhaul', 'ogasawara-maru',
      { water: true, seaLife: false, localBoat: false, guests: true, guestsRequired: true, showCrew: true }),
    'chichijima-transfer': profile('chichijima-transfer', 'island', 'land', 'CHICHIJIMA · TRANSFER', '父島・乗り継ぎ', 'transfer', null,
      { water: true, seaLife: false, localBoat: false, guests: true, guestsRequired: true, showCrew: true }),
    'interisland-ferry': profile('interisland-ferry', 'ship', 'interisland', 'INTER-ISLAND VESSEL · NAME/TIMES UNCONFIRMED', '島間船・船名／時刻未確認', 'interisland', 'interisland-vessel',
      { water: true, seaLife: false, localBoat: false, guests: true, guestsRequired: true, showCrew: true }),
    'hahajima-hinata': profile('hahajima-hinata', 'island', 'land', 'HAHAJIMA · HINATA', '母島・ひなた', 'hahajima', null,
      { water: true, seaLife: true, localBoat: true, guests: true, guestsRequired: false, showCrew: true }),
    'route-overview': profile('route-overview', 'overview', 'overview', 'TOKYO → HAHAJIMA · ROUTE', '東京 → 母島・行程', 'overview', null,
      { water: false, seaLife: false, localBoat: false, guests: false, guestsRequired: false, showCrew: false })
  };
  var _scene = SCENE_PROFILES['hahajima-hinata'];

  var PHYSICAL_IDS = {
    'tokyo-hotel': 1, 'takeshiba-terminal': 1, 'ogasawara-maru': 1,
    'chichijima-transfer': 1, 'interisland-ferry': 1,
    'hahajima-hinata': 1, 'route-overview': 1
  };
  var LEGACY_SCENE_ALIASES = {
    'tokyo-load': 'tokyo-hotel',
    'ship-outbound': 'ogasawara-maru',
    'ship-transit': 'ogasawara-maru',
    'return-ship': 'ogasawara-maru',
    'tokyo-return': 'takeshiba-terminal',
    'return-island': 'hahajima-hinata',
    'ogasawara': 'hahajima-hinata'
  };

  function copyObj(o) { var x = {}, k; for (k in o) x[k] = o[k]; return x; }
  function directedProfile(p, direction) {
    if (!p || !direction || p.routeDirection === direction) return p;
    var out = copyObj(p); out.flags = copyObj(p.flags || {}); out.routeDirection = direction;
    if (direction === 'return') {
      out.inferred = true;
      out.en = p.en + ' · RETURN (INFERRED)';
      out.jp = p.jp + '・帰路（推定）';
    }
    return out;
  }
  function sceneIdValue(v) {
    if (!v) return null;
    if (typeof v === 'object') v = v.id || v.sceneId || v.locationId;
    if (typeof v !== 'string') return null;
    var s = v.toLowerCase().replace(/_/g, '-');
    if (PHYSICAL_IDS[s]) return s;
    if (LEGACY_SCENE_ALIASES[s]) return LEGACY_SCENE_ALIASES[s];
    if (s === 'tokyo' || s === 'takeshiba' || s === 'tokyo-terminal') return 'takeshiba-terminal';
    if (s === 'hotel' || s === 'tokyo-load') return 'tokyo-hotel';
    if (s === 'chichijima' || s === 'futami' || s === 'transfer') return 'chichijima-transfer';
    if (s === 'interisland' || s === 'inter-island' || s === 'interisland-vessel' || s === 'local-ferry') return 'interisland-ferry';
    if (s === 'hahajima' || s === 'hinata' || s === 'ogasawara') return 'hahajima-hinata';
    return null;
  }
  function simClock(sim) {
    return sim && sim.mode === 'minute' && typeof sim.clockMin === 'number' ? sim.clockMin : null;
  }
  var _routeResolveCache = { plan: null, seg: '', minute: null, sceneId: null };
  function engineRouteScene(sim, seg, now) {
    if (!sim || now == null || !P || typeof P.routeSceneId !== 'function' || !sim.plan) return null;
    if (_routeResolveCache.plan === sim.plan && _routeResolveCache.seg === seg && _routeResolveCache.minute === now) return _routeResolveCache.sceneId;
    try {
      var id = sceneIdValue(P.routeSceneId(sim.plan, seg, now));
      _routeResolveCache = { plan: sim.plan, seg: seg, minute: now, sceneId: id };
      return id;
    }
    catch (e) { return null; }
  }
  function taskNameText(t) {
    var n = t && t.name;
    return (((t && t.id) || '') + ' ' + (typeof n === 'string' ? n : ((n && n.en) || '')) + ' ' + ((n && n.jp) || '')).replace(/_/g, '-');
  }
  function scheduleRows(sim) {
    var out = [], bt = sim && sim.sched && sim.sched.byTask, tasks = sim && sim.tasks || [], by = {}, i, k, t, e;
    for (i = 0; i < tasks.length; i++) by[tasks[i].id] = tasks[i];
    if (!bt) return out;
    for (k in bt) {
      e = bt[k]; if (!e || typeof e.start !== 'number') continue;
      t = by[k] || { id: k, name: { en: k, jp: k } };
      out.push({ id: k, task: t, start: e.start, end: typeof e.end === 'number' ? e.end : e.start, text: taskNameText(t).toLowerCase() });
    }
    out.sort(function (a, b) { return a.start - b.start || a.end - b.end || (a.id < b.id ? -1 : 1); });
    return out;
  }
  function rowMatch(rows, tests, last) {
    var hit = null, i, j;
    for (i = 0; i < rows.length; i++) {
      for (j = 0; j < tests.length; j++) {
        if (tests[j].test(rows[i].text)) { hit = rows[i]; break; }
      }
      if (hit && !last) return hit;
    }
    return hit;
  }
  function explicitScene(sim, rows, now) {
    var direct = sceneIdValue(sim && (sim.sceneId || sim.routeScene || sim.locationId || (sim.routeState && sim.routeState.sceneId)));
    if (direct) return direct;
    if (now == null) return null;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i]; if (now < r.start || now >= r.end) continue;
      direct = sceneIdValue(r.task && (r.task.sceneId || r.task.routeScene || r.task.locationId || r.task.location));
      if (direct) return direct;
    }
    return null;
  }
  function arrivalScene(sim) {
    var now = simClock(sim), rows = scheduleRows(sim), primary = engineRouteScene(sim, 'arrival', now), direct = explicitScene(sim, rows, now);
    if (primary) return SCENE_PROFILES[primary];
    if (direct) return SCENE_PROFILES[direct];
    if (now == null) return SCENE_PROFILES['chichijima-transfer'];
    var cross = rowMatch(rows, [/^hd-a-cross\b/, /^hd-a-.*inter.*(cross|voyage|sail)/, /inter.?island crossing/, /島間航海/]);
    var disembark = rowMatch(rows, [/^hd-a-(disembark|ferrycheck|transfer|board)\b/, /disembark.*chichijima/, /父島.*(下船|乗り換|乗換)/]);
    var hahajima = rowMatch(rows, [/^hd-a-(checkin|intake|safety|gearstow|headcount|dinnerprep|dinnerserve|foodsource)\b/, /arrive on hahajima/, /hinata.*(check|intake|brief|meal|food)/, /母島到着/]);
    if (cross) {
      if (now >= cross.end) return SCENE_PROFILES['hahajima-hinata'];
      if (now >= cross.start) return SCENE_PROFILES['interisland-ferry'];
    }
    if (hahajima && now >= hahajima.start) return SCENE_PROFILES['hahajima-hinata'];
    if (disembark && now >= disembark.start) return SCENE_PROFILES['chichijima-transfer'];
    // Before the Chichijima transfer starts, the party is still aboard the
    // Ogasawara-maru. No made-up connection time is used.
    return SCENE_PROFILES['ogasawara-maru'];
  }
  function returnScene(sim) {
    var now = simClock(sim), rows = scheduleRows(sim), primary = engineRouteScene(sim, 'return', now), direct = explicitScene(sim, rows, now), p;
    if (primary) { p = SCENE_PROFILES[primary]; return directedProfile(p, 'return'); }
    if (direct) { p = SCENE_PROFILES[direct]; return directedProfile(p, 'return'); }
    if (now == null) return directedProfile(SCENE_PROFILES['hahajima-hinata'], 'return');
    var inter = rowMatch(rows, [/^hd-r-(interisland|local-cross|cross)\b/, /inter.?island crossing from hahajima/, /母島.*父島.*島間航海/]);
    var transfer = rowMatch(rows, [/^hd-r-(chichi-transfer|chichijima-transfer|transfer)\b/, /change ships.*chichijima/, /父島.*(乗り継|乗換|船の乗)/]);
    var longhaul = rowMatch(rows, [/^hd-r-(sail|longhaul|ogasawara-sail)\b/, /ogasawara.?maru voyage.*takeshiba/, /おがさわら丸.*竹芝/]);
    var tokyo = rowMatch(rows, [/^hd-r-(tokyocount|takeshiba-arrival)\b/, /takeshiba arrival headcount/, /東京.*(帰着|点呼)/, /竹芝到着/]);
    if (tokyo && now >= tokyo.start) return directedProfile(SCENE_PROFILES['takeshiba-terminal'], 'return');
    if (longhaul) {
      if (now >= longhaul.end && !tokyo) return directedProfile(SCENE_PROFILES['takeshiba-terminal'], 'return');
      if (now >= longhaul.start) return directedProfile(SCENE_PROFILES['ogasawara-maru'], 'return');
    }
    if (transfer && now >= transfer.start) {
      if (now < transfer.end || !longhaul) return directedProfile(SCENE_PROFILES['chichijima-transfer'], 'return');
    }
    if (inter) {
      if (now >= inter.end) return directedProfile(SCENE_PROFILES['chichijima-transfer'], 'return');
      if (now >= inter.start) return directedProfile(SCENE_PROFILES['interisland-ferry'], 'return');
    }
    return directedProfile(SCENE_PROFILES['hahajima-hinata'], 'return');
  }
  function loadScene(sim) {
    var now = simClock(sim), rows = scheduleRows(sim), primary = engineRouteScene(sim, 'load', now), direct = explicitScene(sim, rows, now);
    if (primary) return SCENE_PROFILES[primary];
    if (direct) return SCENE_PROFILES[direct];
    if (now == null) return SCENE_PROFILES['tokyo-hotel'];
    var leave = rowMatch(rows, [/^hd-l-(truck|hotel-transfer|depart-hotel)\b/, /leave.*hotel.*takeshiba/, /ホテル出発.*竹芝/]);
    // 10:00 is user-supplied; it is the only fallback boundary here. Breakfast
    // timing and terminal travel duration remain deliberately unspecified.
    var terminalAt = leave ? leave.start : 600;
    return now >= terminalAt ? SCENE_PROFILES['takeshiba-terminal'] : SCENE_PROFILES['tokyo-hotel'];
  }
  function sceneForSegment(seg, sim) {
    if (seg === 'load') return loadScene(sim);
    if (seg === 'voyage') return SCENE_PROFILES['ogasawara-maru'];
    if (seg === 'arrival') return arrivalScene(sim);
    if (seg === 'return') return returnScene(sim);
    if (seg === 'ops' || seg === 'fishday') return SCENE_PROFILES['hahajima-hinata'];
    return SCENE_PROFILES['route-overview'];
  }
  function sceneProfile(sim, view) {
    var requested = view && typeof view.mapProfile === 'string' ? view.mapProfile :
      (sim && sim.segment ? sim.segment : 'fishday');
    var req = requested.toLowerCase().replace(/_/g, '-');
    if (PHYSICAL_IDS[req]) return directedProfile(SCENE_PROFILES[req],
      (req !== 'route-overview' && sim && sim.segment === 'return') ? 'return' : null);
    if (req === 'all') {
      // A real Whole Trip orchestrator passes its current segment sim; the
      // static planning/report surfaces pass the legacy all-day sim.
      return sim && sim.segment && sim.segment !== 'all' ? sceneForSegment(sim.segment, sim) : SCENE_PROFILES['route-overview'];
    }
    if (req === 'tokyo-load') return loadScene(sim);
    if (req === 'ship-transit') return sim && sim.segment === 'return' ? returnScene(sim) :
      (sim && sim.segment === 'arrival' ? arrivalScene(sim) : SCENE_PROFILES['ogasawara-maru']);
    if (req === 'return-ship') return returnScene(sim);
    if (req === 'ogasawara') return sceneForSegment(sim && sim.segment || 'fishday', sim);
    if (LEGACY_SCENE_ALIASES[req]) return directedProfile(SCENE_PROFILES[LEGACY_SCENE_ALIASES[req]],
      req.indexOf('return') >= 0 ? 'return' : null);
    return sceneForSegment(req, sim);
  }

  // Location-specific visual station maps. Logical task ids never change;
  // stationForScene maps them onto a visible fixture in the current place.
  var SCENE_STATION_OVERRIDES = {
    'tokyo-hotel': {
      command: { name: { en: 'Hotel lobby', jp: 'ホテルロビー' }, icon: '📋', x: 0.28, y: 0.44, hidden: false, hub: false },
      lodging: { name: { en: 'Guest rooms', jp: '客室' }, icon: '🏨', x: 0.16, y: 0.72, hidden: false, hub: false },
      mess: { name: { en: 'Breakfast room', jp: '朝食会場' }, icon: '🍳', x: 0.43, y: 0.64, hidden: false, hub: false },
      port: { x: 0.28, y: 0.44, hidden: true }, vessel: { x: 0.28, y: 0.44, hidden: true },
      finance: { x: 0.28, y: 0.44, hidden: true }, clinic: { x: 0.16, y: 0.72, hidden: true }
    },
    'takeshiba-terminal': {
      command: { name: { en: 'Group assembly', jp: '集合・本部' }, icon: '📋', x: 0.30, y: 0.44, hidden: false, hub: false },
      mess: { name: { en: 'Terminal concourse', jp: 'ターミナルコンコース' }, icon: '🧳', x: 0.38, y: 0.68, hidden: false, hub: false },
      port: { name: { en: 'Takeshiba berth', jp: '竹芝・乗船口' }, icon: '⚓', x: 0.55, y: 0.55, hidden: false },
      vessel: { name: { en: 'Ogasawara-maru boarding', jp: 'おがさわら丸・乗船' }, icon: '🚢', x: 0.78, y: 0.62, hidden: false },
      lodging: { x: 0.30, y: 0.44, hidden: true }, finance: { x: 0.30, y: 0.44, hidden: true }, clinic: { x: 0.30, y: 0.44, hidden: true }
    },
    'chichijima-transfer': {
      command: { name: { en: 'Transfer desk', jp: '乗継ぎ受付' }, icon: '📋', x: 0.30, y: 0.44, hidden: false, hub: false },
      lodging: { name: { en: 'Waiting area', jp: '待合所' }, icon: '🪑', x: 0.17, y: 0.72, hidden: false, hub: false },
      mess: { name: { en: 'Transfer provisions', jp: '乗継ぎ物資' }, icon: '📦', x: 0.30, y: 0.44, hidden: true, hub: false },
      port: { name: { en: 'Chichijima arrival berth', jp: '父島・到着岸壁' }, icon: '⚓', x: 0.53, y: 0.56, hidden: false },
      vessel: { name: { en: 'Inter-island boarding', jp: '島間航路・乗船' }, icon: '⛴', x: 0.78, y: 0.66, hidden: false },
      finance: { x: 0.30, y: 0.44, hidden: true }, clinic: { x: 0.30, y: 0.44, hidden: true }
    },
    'interisland-ferry': {
      command: { x: 0.72, y: 0.31, hidden: true, hub: false },
      lodging: { name: { en: 'Passenger cabin', jp: '客室' }, icon: '💺', x: 0.66, y: 0.50, hidden: false, hub: false },
      mess: { name: { en: 'Passenger saloon', jp: '客室サロン' }, icon: '🍵', x: 0.78, y: 0.62, hidden: false, hub: false },
      port: { name: { en: 'Baggage deck', jp: '手荷物甲板' }, icon: '📦', x: 0.60, y: 0.72, hidden: false },
      vessel: { name: { en: 'Wheelhouse', jp: '操舵室' }, icon: '🧭', x: 0.88, y: 0.42, hidden: false },
      finance: { x: 0.78, y: 0.62, hidden: true }, clinic: { x: 0.66, y: 0.50, hidden: true }
    },
    'hahajima-hinata': {
      command: { x: 0.30, y: 0.44, hidden: true },
      mess: { name: { en: 'Hinata · Hahajima', jp: 'ひなた・母島' }, icon: '🍽️', x: 0.30, y: 0.44, hidden: false, hub: true },
      lodging: { name: { en: 'Hahajima lodging', jp: '母島・宿' }, icon: '🏨', x: 0.13, y: 0.78, hidden: false },
      port: { name: { en: 'Hahajima port', jp: '母島・港' }, icon: '⚓', x: 0.52, y: 0.56, hidden: false },
      vessel: { name: { en: 'Fishing ground', jp: '釣り場' }, icon: '🪨', x: 0.82, y: 0.72, hidden: false },
      finance: { x: 0.30, y: 0.44, hidden: true }, clinic: { x: 0.30, y: 0.44, hidden: true }
    }
  };
  var PROFILE_ANCHORS = {
    'tokyo-hotel': { port: 'command', vessel: 'command', finance: 'command', clinic: 'lodging' },
    'takeshiba-terminal': { lodging: 'command', finance: 'command', clinic: 'command' },
    'ogasawara-maru': { command: 'purser', finance: 'purser', clinic: 'deck', port: 'hold', vessel: 'deck', lodging: 'cabins', mess: 'dining' },
    'chichijima-transfer': { mess: 'command', finance: 'command', clinic: 'command' },
    'interisland-ferry': { command: 'vessel', finance: 'mess', clinic: 'lodging' },
    'hahajima-hinata': { command: 'mess', finance: 'mess', clinic: 'mess' }
  };
  var PROFILE_LINKS = {
    'tokyo-hotel': [['lodging', 'command'], ['command', 'mess']],
    'takeshiba-terminal': [['command', 'mess'], ['command', 'port'], ['mess', 'port'], ['port', 'vessel']],
    'ogasawara-maru': [['hold', 'cabins'], ['cabins', 'purser'], ['cabins', 'dining'], ['dining', 'deck'], ['purser', 'deck']],
    'chichijima-transfer': [['lodging', 'command'], ['command', 'port'], ['port', 'vessel']],
    'interisland-ferry': [['port', 'lodging'], ['lodging', 'mess'], ['mess', 'vessel']],
    'hahajima-hinata': [['mess', 'port'], ['mess', 'lodging'], ['port', 'vessel']],
    'route-overview': []
  };
  var SCENE_STATION_CACHE = {};

  function visualStation(st, profile0) {
    if (!st) return null;
    profile0 = profile0 || _scene;
    var out = {}, k, ov = (SCENE_STATION_OVERRIDES[profile0.id] || {})[st.id] || null;
    for (k in st) out[k] = st[k];
    if (ov) for (k in ov) out[k] = ov[k];
    return out;
  }
  function stationsForProfile(profile0) {
    profile0 = profile0 || _scene;
    if (SCENE_STATION_CACHE[profile0.id]) return SCENE_STATION_CACHE[profile0.id];
    if (profile0.stationSet === 'overview') return (SCENE_STATION_CACHE[profile0.id] = []);
    var base = profile0.stationSet === 'voyage' && P.VOYAGE_STATIONS ? P.VOYAGE_STATIONS : P.STATIONS;
    var out = [], i;
    for (i = 0; i < base.length; i++) out.push(visualStation(base[i], profile0));
    SCENE_STATION_CACHE[profile0.id] = out;
    return out;
  }
  function anchorIdForProfile(profile0, id) {
    var a = PROFILE_ANCHORS[profile0.id] || {};
    return a[id] || id;
  }
  function stationsForScene(sim, view) { return stationsForProfile(sceneProfile(sim, view)); }
  function stationForScene(id, sim, view) {
    var p0 = sceneProfile(sim, view), anchorId = anchorIdForProfile(p0, id), list = stationsForProfile(p0), i;
    for (i = 0; i < list.length; i++) if (list[i].id === anchorId) return list[i];
    return visualStation(P.station(anchorId), p0);
  }
  function linksForScene(sim, view) {
    var p0 = sceneProfile(sim, view), src = PROFILE_LINKS[p0.id] || [], out = [], i;
    for (i = 0; i < src.length; i++) out.push(src[i].slice());
    return out;
  }
  function topologyForScene(sim, view) {
    var p0 = sceneProfile(sim, view), ss = stationsForProfile(p0), nodes = [], i;
    for (i = 0; i < ss.length; i++) if (!ss[i].hidden) nodes.push(ss[i].id);
    return { profileId: p0.id, nodes: nodes, links: linksForScene(sim, view),
      routeDirection: p0.routeDirection || 'outbound', inferred: !!p0.inferred, vesselId: p0.vesselId || null };
  }
  function domFlagsForScene(sim, view) {
    var p0 = sceneProfile(sim, view), f = copyObj(p0.flags || {});
    // The ambient fishing boats belong to Hahajima operations, never to the
    // return transfer even though its first frame is at the same island.
    if (p0.id === 'hahajima-hinata' && sim && sim.segment === 'return') f.localBoat = false;
    if (p0.id === 'hahajima-hinata' && sim && (sim.segment === 'arrival' || sim.segment === 'return')) f.guestsRequired = true;
    f.profileId = p0.id; f.family = p0.family; f.vesselId = p0.vesselId || null;
    f.routeDirection = p0.routeDirection || (sim && sim.segment === 'return' ? 'return' : 'outbound');
    f.inferred = !!p0.inferred || !!(sim && sim.segment === 'return');
    return f;
  }

  var ROUTE_POINTS = {
    'tokyo-hotel': { x: 0.11, y: 0.31, en: 'Tokyo hotel', jp: '東京・ホテル' },
    'takeshiba-terminal': { x: 0.23, y: 0.45, en: 'Takeshiba', jp: '竹芝' },
    'ogasawara-maru': { x: 0.47, y: 0.42, en: 'Ogasawara-maru', jp: 'おがさわら丸' },
    'chichijima-transfer': { x: 0.67, y: 0.50, en: 'Chichijima', jp: '父島' },
    'interisland-ferry': { x: 0.79, y: 0.59, en: 'Inter-island vessel', jp: '島間船' },
    'hahajima-hinata': { x: 0.90, y: 0.71, en: 'Hahajima · Hinata', jp: '母島・ひなた' }
  };
  function routePoint(sceneId, stationId, view) {
    var sid = sceneIdValue(sceneId) || 'hahajima-hinata', q = ROUTE_POINTS[sid];
    if (!q) return null;
    var ids = ['command','port','vessel','lodging','mess','finance','clinic','hold','cabins','dining','deck','purser'];
    var idx = ids.indexOf(stationId), ring = idx < 0 ? 0 : idx % 6;
    var ang = ring * Math.PI / 3, rad = idx < 0 ? 0 : 0.012 + Math.floor(idx / 6) * 0.007;
    return { x: q.x + Math.cos(ang) * rad, y: q.y + Math.sin(ang) * rad,
      name: ((view && view.lang) || _lang) === 'ja' ? q.jp : q.en, profileId: sid, stationId: stationId || null };
  }
  function routePoints(view) {
    var order = ['tokyo-hotel','takeshiba-terminal','ogasawara-maru','chichijima-transfer','interisland-ferry','hahajima-hinata'];
    var out = [], i; for (i = 0; i < order.length; i++) out.push(routePoint(order[i], null, view)); return out;
  }

  // Aggregate logical simulation stations into their visible physical fixture.
  function stationStateForScene(st, sim, view, tintMap) {
    var p0 = sceneProfile(sim, view);
    if (typeof st === 'string') st = stationForScene(st, sim, view);
    var out = { crewCount: 0, dominantProblem: null, problemStationId: st ? st.id : null, readiness: 'none' };
    if (!st || !sim || !sim.stations) return out;
    var terr = tintMap || (P.stationReadiness ? P.stationReadiness(sim) : {});
    var tr = { none: 0, green: 1, amber: 2, red: 3 };
    var pr = { low: 1, med: 2, high: 3 }, bestProblem = -1;
    for (var i = 0; i < sim.stations.length; i++) {
      var ss = sim.stations[i];
      if (anchorIdForProfile(p0, ss.id) !== st.id) continue;
      var ssCrew = (ss.crewIds || []).length;
      out.crewCount += ssCrew;
      var tv = terr[ss.id] || 'none';
      if ((tr[tv] || 0) > (tr[out.readiness] || 0)) out.readiness = tv;
      if (ss.dominantProblem && ssCrew > 0) {
        var rank = pr[ss.dominantProblem.severity] || 0;
        if (rank > bestProblem) {
          bestProblem = rank; out.dominantProblem = ss.dominantProblem; out.problemStationId = ss.id;
        }
      }
    }
    return out;
  }

  // =========================================================================
  // SHARED HELPERS — every draw layer uses these; do not re-implement locally.
  // =========================================================================

  // engine-style bilingual name: entity objects carry {en, jp} (NOT ja) — app.js:14 parity
  function nm(o) {
    if (!o) return '';
    if (typeof o === 'string') return o;
    return (_lang === 'ja' ? o.jp : o.en) || o.en || '';
  }

  // Match the DOM's Japanese optical lift for the small, localized Canvas
  // labels.  Start from the exact integer px value the English renderer has
  // always used, then apply a restrained 6% only in Japanese.  Callers must
  // opt in: decorative scenery words, numeric badges and emoji keep their
  // original font strings and geometry.
  var JA_CANVAS_TEXT_SCALE = 1.06;
  function localizedFont(weight, rawPx, family, lang) {
    var basePx = Math.round(rawPx);
    var px = ((lang || _lang) === 'ja')
      ? Math.round(basePx * JA_CANVAS_TEXT_SCALE * 100) / 100
      : basePx;
    return weight + ' ' + px + 'px ' + (family || 'system-ui,sans-serif');
  }

  function lerp(a, b, k) { return a + (b - a) * k; }
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function clockOfDay(v) { var m = v % 1440; return m < 0 ? m + 1440 : m; }
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
  function isNight(clockMin) { var m = clockOfDay(clockMin); return m < NIGHT_END_MIN || m >= NIGHT_START_MIN; }
  // interpolated sky stop for a clock minute → { top:'r,g,b', hor:'r,g,b', alpha:Number }
  function skyAt(clockMin) {
    var m = clamp(clockOfDay(clockMin), SKY_MIN, SKY_MAX), i = 0;
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
  // tailLen (tail triangle drop, default 4 — pass a scaled value with scaled h/pad),
  // maxW (optional outer-width clamp), prefix/prefixFont and suffix/suffixFont
  // (unscaled icon runs around localized text; keep emoji geometry independent
  // from language size).
  // Returns { w, h } so callers can stack/avoid overlap.
  // NOTE (§21 scale): chip does NOT auto-scale — pass scaled font/h/pad/r/tailLen.
  function chip(ctx, x, y, text, o) {
    o = o || {};
    var font = o.font || '600 10px system-ui,sans-serif';
    var prefix = o.prefix || '', prefixFont = o.prefixFont || font;
    var suffix = o.suffix || '', suffixFont = o.suffixFont || font;
    var pad = o.pad != null ? o.pad : 4, h = o.h != null ? o.h : 14;
    var r = o.r != null ? o.r : 2;
    var tailLen = o.tailLen != null ? o.tailLen : 4;
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha *= o.alpha;
    var prefixW = 0, suffixW = 0;
    if (prefix) { ctx.font = prefixFont; prefixW = ctx.measureText(prefix).width; }
    if (suffix) { ctx.font = suffixFont; suffixW = ctx.measureText(suffix).width; }
    ctx.font = font;
    var textW = ctx.measureText(text).width, fixedW = prefixW + suffixW;
    var contentW = fixedW + textW;
    var maxContentW = o.maxW != null ? Math.max(1, o.maxW - pad * 2) : contentW;
    var textMaxW = Math.max(1, maxContentW - fixedW);
    var textDrawW = Math.min(textW, textMaxW);
    var drawContentW = fixedW + textDrawW;
    var w = drawContentW + pad * 2, x0 = x - w / 2;
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
    if (!prefix && !suffix) {
      ctx.font = font;
      if (o.maxW != null) ctx.fillText(text, x, y + h / 2 + 0.5, maxContentW);
      else ctx.fillText(text, x, y + h / 2 + 0.5);
    } else {
      var tx = x - drawContentW / 2;
      ctx.textAlign = 'left';
      if (prefix) { ctx.font = prefixFont; ctx.fillText(prefix, tx, y + h / 2 + 0.5); }
      ctx.font = font;
      if (o.maxW != null) ctx.fillText(text, tx + prefixW, y + h / 2 + 0.5, textMaxW);
      else ctx.fillText(text, tx + prefixW, y + h / 2 + 0.5);
      if (suffix) {
        ctx.font = suffixFont;
        ctx.fillText(suffix, tx + prefixW + textDrawW, y + h / 2 + 0.5);
      }
    }
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
    var m = clamp(clockOfDay(clockMin), SKY_MIN, SKY_MAX);
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
    // Harbor Complete §1: kick the sprite atelier's decode the first time any
    // stage boots. init(cb) is idempotent (sprites.js settles once and replays
    // late callbacks), so every initStage caller (run stage, plan stage, report
    // stage, vignette) can call it blindly. No callback needed: scene()
    // re-resolves the provider every frame, so the moment `ready` flips the
    // pawns become sprites seamlessly — until then the procedural pawns render.
    // A throwing provider is disarmed for the session (fallback contract).
    if (!_sprBroken && typeof window !== 'undefined' && window.PRS_SPRITES &&
        typeof window.PRS_SPRITES.init === 'function') {
      try { window.PRS_SPRITES.init(); }
      catch (e) { _sprBroken = true; SPR = null; }
    }
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
    _scene = sceneProfile(sim, view);
    scale = (typeof view.scale === 'number' && view.scale > 0)
      ? view.scale
      : clamp(Math.min(view.w / 1000, view.h / 560), 1, 1.7);
    // sprite provider (spec §1): consumed ONLY when present AND ready; a broken
    // provider is disarmed once and the full procedural pawn path takes over.
    var sprWas = SPR;
    SPR = (!_sprBroken && typeof window !== 'undefined' && window.PRS_SPRITES &&
           window.PRS_SPRITES.ready && typeof window.PRS_SPRITES.get === 'function')
      ? window.PRS_SPRITES : null;
    // async decode settles mid-session: ease the procedural->sprite swap (a height
    // morph over ~450ms) instead of a one-frame pop to 40%-taller silhouettes
    if (SPR && !sprWas) _sprSince = (typeof performance !== 'undefined' ? performance.now() : 0);
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
    drawDeck(ctx, sim, t, view);         // 6  route vessel under passengers/crew
    drawGuests(ctx, sim, t, view);       // 7  travelling party / island ambience
    drawBoat(ctx, sim, t, view);         // 7b Hahajima-only local fishing skiff
    drawStations(ctx, sim, t, view);     // 8  landmarks: halo tint, bevel disc, name, rings, lanterns
    drawStallMarkers(ctx, sim, t, view); // 8b report-on-stage: glow pulses where idle/rework accrued
    drawParticles(ctx, sim, t, view);    // 8c seasoning: chimney smoke, cook-steam, dusk fireflies
    drawFigures(ctx, sim, t, view);      // 9  11 duty-holders: shadow, pawn/sprite, aura, bubbles, chips
    drawMotes(ctx, sim, t, view);        // 10 handoff dots A→B + arrival pings
    drawCascade(ctx, sim, t, view);      // 11 red comet + ghosts + strikes (RM: static chain)
    ctx.restore();                       // ---- end WORLD / camera ----

    drawDusk(ctx, view);               // HUD 1: full-canvas evening unifier (view.dusk, outside cam)
    drawStamp(ctx, t, view);           // HUD 2: hanko grade stamp in the stage corner (view.stamp)
    drawSceneLabel(ctx, view);         // HUD 3: short, explicit location/status chip
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
function groundCacheKey(profile, w, h, dpr, sc) {
  return profile.id + (profile.id === 'route-overview' ? '|' + _lang : '') + '|' + w + 'x' + h + '@' + dpr + '/' + sc.toFixed(4);
}
function drawGround_tokyoStatic(gctx, w, h) {
  // Takeshiba is an angular city waterfront, never the organic Hahajima land
  // mass with a different colour. The right-hand harbor water is painted by
  // drawSea(); this cached layer owns the skyline, terminal and paved apron.
  var base = gctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, 'rgb(64,76,87)');
  base.addColorStop(0.58, 'rgb(38,49,59)');
  base.addColorStop(1, 'rgb(18,29,39)');
  gctx.fillStyle = base; gctx.fillRect(0, 0, w, h);

  // Dense, rectilinear Tokyo skyline behind the low passenger terminal.
  var buildings = [
    [0.015,0.13,0.055,0.22], [0.076,0.08,0.050,0.27], [0.132,0.17,0.070,0.18],
    [0.208,0.05,0.054,0.30], [0.268,0.12,0.082,0.23], [0.356,0.075,0.052,0.275],
    [0.414,0.16,0.068,0.19], [0.488,0.10,0.058,0.25], [0.552,0.18,0.045,0.17]
  ];
  var i, b, bx, by, bw, bh;
  for (i = 0; i < buildings.length; i++) {
    b = buildings[i]; bx = b[0] * w; by = b[1] * h; bw = b[2] * w; bh = b[3] * h;
    var bg = gctx.createLinearGradient(0, by, 0, by + bh);
    bg.addColorStop(0, rgba(liftRGB(PAL.indigo, 20), 0.96));
    bg.addColorStop(1, rgba(PAL.indigoDeep, 0.98));
    gctx.fillStyle = bg; gctx.fillRect(bx, by, bw, bh);
    gctx.fillStyle = rgba(PAL.goldPale, 0.22);
    var wx, wy;
    for (wy = by + 8 * scale; wy < by + bh - 4 * scale; wy += 10 * scale) {
      for (wx = bx + 7 * scale; wx < bx + bw - 4 * scale; wx += 11 * scale) gctx.fillRect(wx, wy, 2 * scale, 2 * scale);
    }
  }
  // A restrained red lattice tower keeps Tokyo legible at thumbnail size.
  var tx = w * 0.105, tBase = h * 0.35, tTop = h * 0.035;
  gctx.strokeStyle = rgba(PAL.hanko, 0.88); gctx.lineWidth = 2.2 * scale;
  gctx.beginPath(); gctx.moveTo(tx - 18 * scale, tBase); gctx.lineTo(tx, tTop); gctx.lineTo(tx + 18 * scale, tBase); gctx.stroke();
  gctx.lineWidth = 1 * scale;
  for (i = 1; i <= 5; i++) { var ty = tTop + (tBase - tTop) * i / 6; var tw = 3 + 15 * i / 6; gctx.beginPath(); gctx.moveTo(tx - tw * scale, ty); gctx.lineTo(tx + tw * scale, ty); gctx.stroke(); }

  // Broad concrete apron. Its hard edge is intentionally vertical/stepped;
  // drawSea_tokyoQuay repeats that geometry above the water layer.
  var apron = gctx.createLinearGradient(0, h * 0.30, w * 0.62, h);
  apron.addColorStop(0, 'rgb(91,101,108)'); apron.addColorStop(0.58, 'rgb(62,72,80)'); apron.addColorStop(1, 'rgb(41,51,59)');
  gctx.fillStyle = apron;
  gctx.beginPath(); gctx.moveTo(0, h * 0.29); gctx.lineTo(w * 0.61, h * 0.29); gctx.lineTo(w * 0.61, h * 0.44);
  gctx.lineTo(w * 0.53, h * 0.52); gctx.lineTo(w * 0.53, h); gctx.lineTo(0, h); gctx.closePath(); gctx.fill();

  // Passenger terminal: long, low glass hall with a cantilevered boarding canopy.
  var hallX = w * 0.12, hallY = h * 0.25, hallW = w * 0.37, hallH = h * 0.23;
  gctx.fillStyle = rgba(PAL.indigoDeep, 0.97); gctx.fillRect(hallX, hallY, hallW, hallH);
  gctx.fillStyle = rgba(PAL.seaGlint, 0.31);
  for (i = 0; i < 8; i++) gctx.fillRect(hallX + hallW * (0.035 + i * 0.12), hallY + hallH * 0.24, hallW * 0.075, hallH * 0.48);
  gctx.fillStyle = rgba(PAL.washiWarm, 0.82); gctx.fillRect(hallX - 8 * scale, hallY - 7 * scale, hallW + 16 * scale, 8 * scale);
  gctx.fillStyle = rgba(PAL.hanko, 0.76); gctx.fillRect(hallX + hallW * 0.08, hallY + hallH * 0.82, hallW * 0.22, 3 * scale);
  gctx.font = '800 ' + Math.round(10 * scale) + 'px system-ui,sans-serif';
  gctx.textAlign = 'left'; gctx.textBaseline = 'bottom'; gctx.fillStyle = rgba(PAL.washi, 0.78);
  gctx.fillText('TAKESHIBA', hallX + 9 * scale, hallY - 10 * scale);
  // Canopy/gangway approach from the hall toward the berth.
  gctx.fillStyle = rgba(PAL.washiWarm, 0.34);
  gctx.beginPath(); gctx.moveTo(w * 0.45, h * 0.39); gctx.lineTo(w * 0.60, h * 0.46); gctx.lineTo(w * 0.57, h * 0.52); gctx.lineTo(w * 0.43, h * 0.45); gctx.closePath(); gctx.fill();

  // Loading lanes and pedestrian markings read as city infrastructure, not island paths.
  gctx.strokeStyle = rgba(PAL.washiWarm, 0.16); gctx.lineWidth = 1 * scale;
  gctx.beginPath();
  var gx, gy;
  for (gy = h * 0.53; gy < h; gy += 52 * scale) { gctx.moveTo(0, gy); gctx.lineTo(w * 0.52, gy); }
  for (gx = 18 * scale; gx < w * 0.52; gx += 58 * scale) { gctx.moveTo(gx, h * 0.50); gctx.lineTo(gx, h); }
  gctx.stroke();
  // Boulevard + zebra crossing at the landward edge.
  gctx.fillStyle = rgba(PAL.shadow, 0.32); gctx.fillRect(0, h * 0.83, w * 0.52, h * 0.17);
  gctx.strokeStyle = rgba(PAL.goldPale, 0.30); gctx.lineWidth = 1.5 * scale; gctx.setLineDash([18 * scale, 14 * scale]);
  gctx.beginPath(); gctx.moveTo(0, h * 0.915); gctx.lineTo(w * 0.50, h * 0.915); gctx.stroke(); gctx.setLineDash([]);
  gctx.fillStyle = rgba(PAL.washi, 0.34);
  for (i = 0; i < 7; i++) gctx.fillRect(w * (0.055 + i * 0.025), h * 0.84, w * 0.012, h * 0.14);

  // Two tiny luggage carts reinforce the boarding workflow without competing
  // with the station discs or crew.
  for (i = 0; i < 2; i++) {
    var cartX = w * (0.39 + i * 0.055), cartY = h * (0.72 + i * 0.035);
    gctx.fillStyle = rgba(PAL.hanko, 0.58); gctx.fillRect(cartX, cartY, 20 * scale, 9 * scale);
    gctx.fillStyle = rgba(PAL.indigoDeep, 0.9); gctx.beginPath(); gctx.arc(cartX + 4 * scale, cartY + 11 * scale, 2 * scale, 0, 6.2832); gctx.arc(cartX + 17 * scale, cartY + 11 * scale, 2 * scale, 0, 6.2832); gctx.fill();
  }

  paperTexture(gctx, w, h, 0.045);
}

function drawGround_hotelStatic(gctx, w, h) {
  // Warm, contained hotel interior overlooking a dense Tokyo street. No land
  // contour, shoreline, cloud shadow or island texture is reused here.
  var floor = gctx.createLinearGradient(0, 0, w, h);
  floor.addColorStop(0, 'rgb(92,76,69)'); floor.addColorStop(0.5, 'rgb(57,54,58)'); floor.addColorStop(1, 'rgb(27,35,43)');
  gctx.fillStyle = floor; gctx.fillRect(0, 0, w, h);
  gctx.save();
  // Panoramic window and skyline on the right.
  var wx0 = w * 0.60, wy0 = h * 0.075, ww = w * 0.35, wh = h * 0.66;
  var win = gctx.createLinearGradient(0, wy0, 0, wy0 + wh);
  win.addColorStop(0, 'rgb(45,68,86)'); win.addColorStop(0.62, 'rgb(38,52,66)'); win.addColorStop(1, 'rgb(21,30,40)');
  gctx.fillStyle = win; gctx.fillRect(wx0, wy0, ww, wh);
  var bh = [0.25,0.39,0.20,0.46,0.31,0.24,0.36];
  for (var i = 0; i < bh.length; i++) {
    var cbx = wx0 + ww * (0.045 + i * 0.132), cbw = ww * 0.10, cbh = wh * bh[i];
    gctx.fillStyle = rgba(liftRGB(PAL.indigo, 8 + i * 2), 0.98); gctx.fillRect(cbx, wy0 + wh - cbh, cbw, cbh);
    gctx.fillStyle = rgba(PAL.goldPale, 0.22);
    for (var rw = wy0 + wh - cbh + 8 * scale; rw < wy0 + wh - 5 * scale; rw += 11 * scale) gctx.fillRect(cbx + 5 * scale, rw, Math.max(1, cbw - 10 * scale), 1.5 * scale);
  }
  gctx.strokeStyle = rgba(PAL.goldPale, 0.36); gctx.lineWidth = 3 * scale; gctx.strokeRect(wx0, wy0, ww, wh);
  gctx.lineWidth = 1 * scale;
  for (i = 1; i < 4; i++) { gctx.beginPath(); gctx.moveTo(wx0 + ww * i / 4, wy0); gctx.lineTo(wx0 + ww * i / 4, wy0 + wh); gctx.stroke(); }

  // Guest-room wing with individual doors and warm sconces.
  gctx.fillStyle = rgba(PAL.indigoDeep, 0.72); gctx.fillRect(w * 0.045, h * 0.43, w * 0.22, h * 0.48);
  for (i = 0; i < 6; i++) {
    var dx = w * (0.068 + (i % 3) * 0.064), dy = h * (0.51 + Math.floor(i / 3) * 0.20);
    gctx.fillStyle = rgba(PAL.hanko, 0.58); gctx.fillRect(dx, dy, w * 0.043, h * 0.105);
    radialGlow(gctx, dx + w * 0.021, dy - 4 * scale, 8 * scale, PAL.lantern, 0.14);
  }

  // Carpeted circulation links the three actual hotel work zones.
  gctx.strokeStyle = rgba(PAL.goldLeaf, 0.28); gctx.lineWidth = 18 * scale;
  gctx.lineCap = 'round';
  gctx.beginPath();
  gctx.moveTo(w * 0.16, h * 0.72); gctx.lineTo(w * 0.28, h * 0.44); gctx.lineTo(w * 0.43, h * 0.64);
  gctx.stroke();
  gctx.lineWidth = 1.5 * scale; gctx.strokeStyle = rgba(PAL.goldPale, 0.34);
  gctx.strokeRect(w * 0.045, h * 0.43, w * 0.22, h * 0.48);

  // Lobby desk, brass luggage cart and breakfast tables/buffet.
  roundRect(gctx, w * 0.205, h * 0.35, w * 0.16, h * 0.075, 5 * scale);
  gctx.fillStyle = rgba(PAL.washiWarm, 0.60); gctx.fill();
  gctx.fillStyle = rgba(PAL.hanko, 0.62); gctx.fillRect(w * 0.34, h * 0.55, w * 0.19, h * 0.035);
  for (i = 0; i < 3; i++) {
    gctx.beginPath(); gctx.arc(w * (0.34 + i * 0.075), h * 0.70, 15 * scale, 0, 6.2832);
    gctx.fillStyle = rgba(PAL.washiWarm, 0.20); gctx.fill();
  }
  gctx.strokeStyle = rgba(PAL.goldPale, 0.62); gctx.lineWidth = 2 * scale;
  gctx.beginPath(); gctx.moveTo(w * 0.18, h * 0.55); gctx.lineTo(w * 0.18, h * 0.66); gctx.lineTo(w * 0.225, h * 0.66); gctx.stroke();
  gctx.fillStyle = rgba(PAL.hanko, 0.62); gctx.fillRect(w * 0.185, h * 0.58, w * 0.035, h * 0.07);
  gctx.restore();
  paperTexture(gctx, w, h, 0.045);
}

function drawGround_transferStatic(gctx, w, h) {
  drawGround_ellipseBase(gctx, w, h);
  drawGround_landFill(gctx, w, h);
  // Chichijima's transfer surface is a compact terminal apron, not Hinata's
  // garden/command-centre terrain.
  gctx.save();
  drawGround_landPath(gctx, w, h); gctx.clip();
  gctx.fillStyle = 'rgba(63,72,76,.62)'; gctx.fillRect(0, h * 0.30, w * 0.58, h * 0.62);
  gctx.strokeStyle = rgba(PAL.washiWarm, 0.18); gctx.lineWidth = 1 * scale;
  gctx.setLineDash([8 * scale, 9 * scale]);
  gctx.beginPath(); gctx.moveTo(w * 0.12, h * 0.72); gctx.lineTo(w * 0.53, h * 0.56); gctx.stroke();
  gctx.setLineDash([]);
  gctx.fillStyle = rgba(PAL.indigo, 0.96); gctx.fillRect(w * 0.20, h * 0.30, w * 0.23, h * 0.18);
  gctx.fillStyle = rgba(PAL.goldPale, 0.34);
  for (var i = 0; i < 4; i++) gctx.fillRect(w * (0.225 + i * 0.047), h * 0.35, w * 0.026, h * 0.045);
  gctx.restore();
  drawGround_landStrand(gctx, w, h);
  paperTexture(gctx, w, h, 0.05);
}

function drawGround_overviewStatic(gctx, w, h) {
  var g = gctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, rgba(PAL.indigo, 1)); g.addColorStop(0.55, rgba(PAL.seaDeep, 1)); g.addColorStop(1, rgba(PAL.indigoDeep, 1));
  gctx.fillStyle = g; gctx.fillRect(0, 0, w, h);
  var pts = routePoints({ lang: _lang }), i, a, b;
  gctx.save(); gctx.lineCap = 'round'; gctx.lineJoin = 'round';
  // Outbound chain is solid; the inferred reverse is a parallel dashed trace.
  gctx.strokeStyle = rgba(PAL.goldLeaf, 0.68); gctx.lineWidth = 3 * scale;
  gctx.beginPath();
  for (i = 0; i < pts.length; i++) { if (!i) gctx.moveTo(pts[i].x * w, pts[i].y * h); else gctx.lineTo(pts[i].x * w, pts[i].y * h); }
  gctx.stroke();
  gctx.setLineDash([6 * scale, 8 * scale]); gctx.strokeStyle = rgba(PAL.seaGlint, 0.34); gctx.lineWidth = 1.5 * scale;
  gctx.beginPath();
  for (i = pts.length - 1; i >= 0; i--) {
    var ox = -6 * scale, oy = 7 * scale;
    if (i === pts.length - 1) gctx.moveTo(pts[i].x * w + ox, pts[i].y * h + oy); else gctx.lineTo(pts[i].x * w + ox, pts[i].y * h + oy);
  }
  gctx.stroke(); gctx.setLineDash([]);
  for (i = 0; i < pts.length; i++) {
    a = pts[i];
    radialGlow(gctx, a.x * w, a.y * h, 18 * scale, i === 0 || i === pts.length - 1 ? PAL.hanko : PAL.gold, 0.24);
    gctx.beginPath(); gctx.arc(a.x * w, a.y * h, 5 * scale, 0, 6.2832);
    gctx.fillStyle = rgba(i === 0 || i === pts.length - 1 ? PAL.hanko : PAL.goldPale, 0.95); gctx.fill();
    gctx.font = localizedFont('700', 10 * scale, 'system-ui,sans-serif');
    gctx.textAlign = i > 3 ? 'right' : 'left'; gctx.textBaseline = 'bottom';
    gctx.fillStyle = rgba(PAL.washi, 0.92);
    if (_lang === 'ja') gctx.fillText(a.name, a.x * w + (i > 3 ? -9 : 9) * scale, a.y * h - 7 * scale, w * 0.18);
    else gctx.fillText(a.name, a.x * w + (i > 3 ? -9 : 9) * scale, a.y * h - 7 * scale);
    if (i < pts.length - 1) {
      b = pts[i + 1];
      var k = 0.58, ax = lerp(a.x, b.x, k) * w, ay = lerp(a.y, b.y, k) * h;
      gctx.save(); gctx.translate(ax, ay); gctx.rotate(Math.atan2((b.y - a.y) * h, (b.x - a.x) * w));
      gctx.fillStyle = rgba(PAL.goldPale, 0.82); gctx.beginPath(); gctx.moveTo(5 * scale, 0); gctx.lineTo(-4 * scale, -3 * scale); gctx.lineTo(-4 * scale, 3 * scale); gctx.closePath(); gctx.fill(); gctx.restore();
    }
  }
  gctx.font = localizedFont('600', 10 * scale, 'system-ui,sans-serif');
  gctx.textAlign = 'center'; gctx.textBaseline = 'bottom';
  gctx.fillStyle = rgba(PAL.seaGlint, 0.78);
  if (_lang === 'ja') gctx.fillText('破線の帰路は逆順ルートの推定（時刻未確認）', w * 0.52, h * 0.92, w * 0.9);
  else gctx.fillText('Dashed return is inferred as the reverse route · timetable unconfirmed', w * 0.52, h * 0.92);
  gctx.restore();
  paperTexture(gctx, w, h, 0.04);
}

function drawGround_shipStatic(gctx, w, h) {
  var g = gctx.createLinearGradient(0, 0, w, h);
  // This is the ship scene's actual ocean base. drawSea_open adds only the
  // moving current/light layer, so the cached washi texture remains visible.
  g.addColorStop(0, rgba(liftRGB(PAL.seaMid, 18), 1));
  g.addColorStop(0.48, rgba(PAL.seaDeep, 1));
  g.addColorStop(1, rgba(liftRGB(PAL.seaDeep, -26), 1));
  gctx.fillStyle = g; gctx.fillRect(0, 0, w, h);
  paperTexture(gctx, w, h, 0.04);
}

function drawGround_static(gctx, w, h, profile) {
  if (profile.id === 'tokyo-hotel') { drawGround_hotelStatic(gctx, w, h); return; }
  if (profile.id === 'route-overview') { drawGround_overviewStatic(gctx, w, h); return; }
  if (profile.id === 'chichijima-transfer') { drawGround_transferStatic(gctx, w, h); return; }
  if (profile.family === 'tokyo') { drawGround_tokyoStatic(gctx, w, h); return; }
  if (profile.family === 'ship') { drawGround_shipStatic(gctx, w, h); return; }
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

function drawGround_liveOverlays(ctx, sim, view) {
  var w = view.w, h = view.h;
  // A quiet sunset/sunrise held-core warmth that peaks mid transition.
  var duskDawn = Math.sin(clamp(LIGHT.night, 0, 1) * Math.PI);
  lightPool(ctx, w * 0.56, h * 1.03, 250 * scale, PAL.gold, 0.035 + 0.07 * duskDawn);
  drawGround_vignette(ctx, w, h);
  if (sim && sim.bannerOn) {
    var lw = 3 * scale, inset = lw / 2;
    ctx.save();
    ctx.lineWidth = lw;
    ctx.strokeStyle = rgba(PAL.hanko, 0.55);
    ctx.strokeRect(inset, inset, w - lw, h - lw);
    ctx.restore();
  }
}

function drawGround(ctx, sim, t, view) {
  if (!view || !(view.w > 0) || !(view.h > 0)) return;
  var w = view.w, h = view.h;

  // 1. the static terrain stack — offscreen-cached (rebuilt on resize/DPR/scale change)
  // Profile MUST be part of the key: all stages commonly share identical
  // dimensions, and otherwise Tokyo could reuse the just-cached island bitmap.
  var key = groundCacheKey(_scene, w, h, _dpr, scale);
  if (typeof document !== 'undefined') {
    if (!_groundCache || _groundKey !== key) {
      var oc = _groundCache || document.createElement('canvas');
      oc.width = Math.max(1, Math.round(w * _dpr));
      oc.height = Math.max(1, Math.round(h * _dpr));
      var gctx = oc.getContext('2d');
      if (gctx) {
        gctx.setTransform(_dpr, 0, 0, _dpr, 0, 0);
        gctx.clearRect(0, 0, w, h);
        drawGround_static(gctx, w, h, _scene);
        _groundCache = oc; _groundKey = key;
      }
    }
    if (_groundCache) ctx.drawImage(_groundCache, 0, 0, w, h);
    else drawGround_static(ctx, w, h, _scene);
  } else {
    drawGround_static(ctx, w, h, _scene);
  }

  // 2. wind-bent grass tufts (live: the wind moves; RM holds a bent pose)
  if (_scene.id === 'hahajima-hinata') drawGround_grass(ctx, t, view);

  // Ship water fills the complete stage in the next layer, so its finishing
  // overlays are deliberately applied at the end of drawSea_open instead.
  if (_scene.family !== 'ship') drawGround_liveOverlays(ctx, sim, view);
}


  // ---- drawSea ----
// NEW GEOGRAPHY (map redesign, first draft): LAND on the LEFT, OCEAN on the RIGHT. The
// shoreline is a gently curved edge near x=0.55, passing just seaward of the port station
// (0.50,0.55) so the port reads as the water's edge.
// the ONE set of shoreline control points — the ocean fill, wet-line, foam, and the
// figures' over-water test (shoreNX below) all derive from these five points.
var SHORE_PTS = [[0.57, -0.02], [0.555, 0.25], [0.53, 0.52], [0.512, 0.78], [0.575, 1.02]];
function drawSea_traceShore(ctx, w, h) {
  // trace the shoreline top->bottom into the CURRENT path (no beginPath here) so the ocean
  // fill, the ink wet-line, the foam glow and the dashed foam all share one curve.
  ctx.moveTo(w * SHORE_PTS[0][0], SHORE_PTS[0][1] * h);
  ctx.quadraticCurveTo(w * SHORE_PTS[1][0], SHORE_PTS[1][1] * h, w * SHORE_PTS[2][0], SHORE_PTS[2][1] * h);
  ctx.quadraticCurveTo(w * SHORE_PTS[3][0], SHORE_PTS[3][1] * h, w * SHORE_PTS[4][0], SHORE_PTS[4][1] * h);
}
// shoreline x (normalized) at a normalized y — 33-sample LUT over the same two quadratics,
// linearly interpolated; used by the figures' water test (a pawn east of this is at sea)
var _shoreLUT = null;
function shoreNX(ny) {
  if (!_shoreLUT) {
    _shoreLUT = [];
    var segs = [[SHORE_PTS[0], SHORE_PTS[1], SHORE_PTS[2]], [SHORE_PTS[2], SHORE_PTS[3], SHORE_PTS[4]]];
    for (var s = 0; s < 2; s++) {
      var a = segs[s][0], b = segs[s][1], c = segs[s][2];
      for (var i = 0; i <= 16; i++) {
        var tt = i / 16, u = 1 - tt;
        _shoreLUT.push([u * u * a[1] + 2 * u * tt * b[1] + tt * tt * c[1],   // y
                        u * u * a[0] + 2 * u * tt * b[0] + tt * tt * c[0]]); // x
      }
    }
  }
  if (ny <= _shoreLUT[0][0]) return _shoreLUT[0][1];
  for (var j = 1; j < _shoreLUT.length; j++) {
    if (ny <= _shoreLUT[j][0]) {
      var p0 = _shoreLUT[j - 1], p1 = _shoreLUT[j];
      var k = (ny - p0[0]) / Math.max(1e-6, p1[0] - p0[0]);
      return p0[1] + (p1[1] - p0[1]) * k;
    }
  }
  return _shoreLUT[_shoreLUT.length - 1][1];
}

function drawSea_oceanPath(ctx, w, h) {
  // closed ocean silhouette: down the shoreline, out past the right edge and back
  ctx.beginPath();
  drawSea_traceShore(ctx, w, h);
  ctx.lineTo(w * 1.05, 1.02 * h);
  ctx.lineTo(w * 1.05, -0.02 * h);
  ctx.closePath();
}

// Takeshiba replaces the island's sand/foam with a hard, stepped city quay,
// passenger pier and moored Ogasawara-maru. This pass is deliberately drawn
// AFTER the shared clipped harbor water: the angular concrete masks the old
// organic shore composition without changing Hahajima's shoreline/shoreNX.
function drawSea_tokyoQuay(ctx, w, h) {
  ctx.save();

  // Stepped concrete seawall: vertical north berth, diagonal corner, vertical
  // south berth. Its wide fill fully conceals the island's curved foam line.
  var concrete = ctx.createLinearGradient(w * 0.46, 0, w * 0.63, h);
  concrete.addColorStop(0, 'rgba(158,166,170,.98)'); concrete.addColorStop(1, 'rgba(73,83,91,.98)');
  ctx.fillStyle = concrete;
  ctx.beginPath();
  ctx.moveTo(w * 0.44, -2 * scale); ctx.lineTo(w * 0.615, -2 * scale); ctx.lineTo(w * 0.615, h * 0.43);
  ctx.lineTo(w * 0.535, h * 0.515); ctx.lineTo(w * 0.535, h + 2 * scale); ctx.lineTo(w * 0.44, h + 2 * scale);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(214,220,221,.84)'; ctx.lineWidth = 4 * scale;
  ctx.beginPath(); ctx.moveTo(w * 0.615, 0); ctx.lineTo(w * 0.615, h * 0.43); ctx.lineTo(w * 0.535, h * 0.515); ctx.lineTo(w * 0.535, h); ctx.stroke();
  ctx.strokeStyle = rgba(PAL.gold, 0.72); ctx.lineWidth = 2 * scale; ctx.setLineDash([11 * scale, 8 * scale]);
  ctx.beginPath(); ctx.moveTo(w * 0.595, 0); ctx.lineTo(w * 0.595, h * 0.42); ctx.lineTo(w * 0.515, h * 0.50); ctx.lineTo(w * 0.515, h); ctx.stroke(); ctx.setLineDash([]);

  // Broad passenger pier and covered gangway point from the actual Takeshiba
  // berth station toward the actual Ogasawara-maru boarding station.
  var pier = ctx.createLinearGradient(w * 0.49, h * 0.48, w * 0.84, h * 0.70);
  pier.addColorStop(0, 'rgba(181,187,188,.98)'); pier.addColorStop(1, 'rgba(87,98,104,.98)');
  ctx.fillStyle = pier;
  ctx.beginPath(); ctx.moveTo(w * 0.49, h * 0.485); ctx.lineTo(w * 0.845, h * 0.54);
  ctx.lineTo(w * 0.825, h * 0.705); ctx.lineTo(w * 0.49, h * 0.625); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.58); ctx.lineWidth = 2 * scale; ctx.stroke();
  ctx.strokeStyle = rgba(PAL.goldPale, 0.46); ctx.lineWidth = 1.4 * scale; ctx.setLineDash([7 * scale, 7 * scale]);
  ctx.beginPath(); ctx.moveTo(w * 0.52, h * 0.555); ctx.lineTo(w * 0.80, h * 0.61); ctx.stroke(); ctx.setLineDash([]);
  // Bollards and safety lamps.
  for (var bi = 0; bi < 5; bi++) {
    var bpx = w * (0.545 + bi * 0.062), bpy = h * (0.615 + bi * 0.011);
    ctx.beginPath(); ctx.arc(bpx, bpy, 3.2 * scale, 0, 6.2832); ctx.fillStyle = rgba(PAL.indigoDeep, 0.94); ctx.fill();
    radialGlow(ctx, bpx, bpy - 3 * scale, 9 * scale, PAL.lantern, 0.10 + 0.10 * LIGHT.night);
  }

  // Moored long-haul ferry: white superstructure, navy hull and red funnel.
  // It is intentionally partial at the right frame edge, reading as a large
  // real ferry beside the terminal rather than the small boats on Hahajima.
  ctx.beginPath();
  ctx.moveTo(w * 0.735, h * 0.455); ctx.lineTo(w * 1.04, h * 0.405); ctx.lineTo(w * 1.04, h * 0.84);
  ctx.lineTo(w * 0.79, h * 0.815); ctx.lineTo(w * 0.73, h * 0.665); ctx.closePath();
  var hull = ctx.createLinearGradient(0, h * 0.43, 0, h * 0.84);
  hull.addColorStop(0, '#f0f1eb'); hull.addColorStop(0.53, '#cbd2d0'); hull.addColorStop(0.54, '#29465b'); hull.addColorStop(1, '#11283a');
  ctx.fillStyle = hull; ctx.fill(); ctx.strokeStyle = rgba(PAL.rimWhite, 0.62); ctx.lineWidth = 2 * scale; ctx.stroke();

  // Deckhouse bands and passenger windows.
  roundRect(ctx, w * 0.775, h * 0.42, w * 0.25, h * 0.16, 7 * scale);
  ctx.fillStyle = rgba(PAL.washi, 0.96); ctx.fill(); ctx.strokeStyle = rgba(PAL.seaInk, 0.45); ctx.lineWidth = 1.2 * scale; ctx.stroke();
  ctx.fillStyle = rgba(PAL.seaDeep, 0.82);
  for (bi = 0; bi < 8; bi++) {
    roundRect(ctx, w * (0.792 + bi * 0.029), h * 0.465, w * 0.018, h * 0.036, 1.5 * scale); ctx.fill();
  }
  roundRect(ctx, w * 0.885, h * 0.345, w * 0.036, h * 0.10, 4 * scale);
  ctx.fillStyle = rgba(PAL.hanko, 0.97); ctx.fill();
  ctx.fillStyle = rgba(PAL.indigoDeep, 0.95); ctx.fillRect(w * 0.885, h * 0.345, w * 0.036, h * 0.025);
  ctx.fillStyle = 'rgba(225,119,48,.94)';
  roundRect(ctx, w * 0.80, h * 0.60, w * 0.075, 9 * scale, 4 * scale); ctx.fill();
  ctx.font = '800 ' + Math.round(8 * scale) + 'px system-ui,sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.fillStyle = rgba(PAL.washi, 0.78); ctx.fillText('OGASAWARA-MARU', w * 0.785, h * 0.725);

  // Covered boarding bridge laid on top of both pier and ship.
  ctx.fillStyle = rgba(PAL.washiWarm, 0.86);
  ctx.beginPath(); ctx.moveTo(w * 0.65, h * 0.535); ctx.lineTo(w * 0.79, h * 0.49); ctx.lineTo(w * 0.80, h * 0.535); ctx.lineTo(w * 0.66, h * 0.58); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = rgba(PAL.indigoDeep, 0.68); ctx.lineWidth = 1 * scale; ctx.stroke();
  ctx.restore();
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

// Open-ocean field for the outbound and homebound ship scenes. Unlike the
// island sea, it fills the whole stage and has no shoreline, iso rock, or
// Ogasawara-only decorative boats beneath the ferry deck.
function drawSea_open(ctx, sim, t, view) {
  var w = view.w, h = view.h, nightK = LIGHT.night;
  ctx.save();
  // The full-ocean base + paper grain live in drawGround_shipStatic's cache.
  // Keep this pass transparent apart from light/current motion so it cannot
  // erase the cache or the profile's finishing overlays.
  if (nightK > 0) { ctx.fillStyle = rgba(PAL.indigoDeep, 0.34 * nightK); ctx.fillRect(0, 0, w, h); }

  // Broad current bands and sparse whitecaps give the deck a moving ocean
  // context without competing with station/task information.
  var rows = [0.14, 0.28, 0.47, 0.68, 0.86], i;
  for (i = 0; i < rows.length; i++) {
    var yy = h * rows[i], amp = (2.2 + (i % 3)) * scale;
    drawSea_waveLine(ctx, -0.03 * w, 1.06 * w, yy, amp, 0.38 + i * 0.07, i * 1.3, t,
      nightK > 0.5 ? PAL.seaGlint : PAL.gold, 0.07 + (i % 2) * 0.025, 1.1 * scale);
    if (!view.rm && i % 2) drawSea_crests(ctx, -0.03 * w, 1.06 * w, yy, amp,
      0.38 + i * 0.07, i * 1.3, t, 0.22);
  }
  // Moon/sun path through the water, using the shared light rig.
  drawSea_lightColumn(ctx, LIGHT.sunX * w, h * 0.08, h * 0.72,
    nightK > 0.45 ? PAL.seaGlint : PAL.gold, 0.12 + 0.10 * LIGHT.shadowLen, t, 4.7, view.rm);

  if (!view.rm) {
    var drift = (t * 13 * scale) % (70 * scale);
    ctx.save(); ctx.strokeStyle = rgba(PAL.seaGlint, 0.055); ctx.lineWidth = 1 * scale;
    for (i = -2; i < 18; i++) {
      var x = i * 70 * scale + drift;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x - h * 0.42, h); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  drawGround_liveOverlays(ctx, sim, view);
}

function drawSea(ctx, sim, t, view) {
  if (!view || !view.w || !view.h) return;
  if (!_scene.flags || !_scene.flags.water) return;
  if (_scene.family === 'ship') { drawSea_open(ctx, sim, t, view); return; }
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

  if (_scene.family === 'tokyo') {
    drawSea_tokyoQuay(ctx, w, h);
  } else {
    // Gold foam hugging the curved island shoreline: a soft glow band + crisp dashes.
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
  }

  // Ogasawara-only scenery. Tokyo uses the same stable water coordinates but
  // no iso rock / local fishing boats, and return pack-out keeps the route clear.
  if (domFlagsForScene(sim, view).localBoat) {
    drawSea_isoRock(ctx, t, view, nightK);
    if (!view.rm) drawSea_spray(ctx, t, view);   // sea spray licking off the rock (pure motion — RM skips)
    drawSea_kimura(ctx, t, view, nightK);
  }
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
  if (_lang === 'ja') {
    chip(ctx, cx, cy + 8 * scale, 'きむらさん', {
      font: localizedFont('600', 9 * scale, 'system-ui,sans-serif'),
      suffix: ' 🎣', suffixFont: '600 ' + Math.round(9 * scale) + 'px system-ui,sans-serif',
      maxW: Math.max(1, 2 * Math.min(cx, view.w - cx) - 4 * scale),
      pad: 3 * scale, h: 12 * scale, r: 2 * scale, alpha: 0.85
    });
  } else {
    chip(ctx, cx, cy + 8 * scale, 'Kimura-san 🎣', {
      font: '600 ' + Math.round(9 * scale) + 'px system-ui,sans-serif',
      pad: 3 * scale, h: 12 * scale, r: 2 * scale, alpha: 0.85
    });
  }
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
  if (!view || view.rm || !_scene.flags || !_scene.flags.seaLife) return;
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
  if (_scene.family === 'ship' || _scene.family === 'overview') return;   // vessels/overview paint their own topology
  var links = linksForScene(sim, view);
  if (!links.length) return;
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
  for (i = 0; i < links.length; i++) {
    a = stationForScene(links[i][0], sim, view);
    b = stationForScene(links[i][1], sim, view);
    if (!a || !b) continue;
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
  for (i = 0; i < links.length; i++) {
    sid = links[i][0]; if (!seen[sid]) { seen[sid] = 1; ids.push(sid); }
    sid = links[i][1]; if (!seen[sid]) { seen[sid] = 1; ids.push(sid); }
  }
  for (i = 0; i < ids.length; i++) {
    var sp = stationPx(stationForScene(ids[i], sim, view), view);
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
      var gs = stationPx(stationForScene(ids[idx], sim, view), view);
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
  // Hotel lighting enters through the panoramic window; the carpet, doors and
  // breakfast room remain warm interior space instead of receiving an outdoor
  // full-stage sky wash.
  if (_scene.id === 'tokyo-hotel') {
    ctx.beginPath(); ctx.moveTo(w * 0.60, h * 0.075); ctx.lineTo(w * 0.95, h * 0.075);
    ctx.lineTo(w * 0.95, h * 0.735); ctx.lineTo(w * 0.60, h * 0.735); ctx.closePath(); ctx.clip();
  }

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
  if (_scene.id === 'tokyo-hotel') return; // indoors: city light is confined to the window
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
  if (!view) return;
  var sceneFlags = domFlagsForScene(sim, view);
  if (!sceneFlags.guests || (!view.guestsVisible && !sceneFlags.guestsRequired)) return;
  var vg = view.guest || {};
  var w = view.w, h = view.h;
  var hot = view.hotPts || [];
  var n = (typeof P !== 'undefined' && P.GUESTS) ? P.GUESTS : 13;
  // §2 pawn scale rides along for the guests so the world keeps one proportion
  // system. DELIBERATELY procedural (no sprite consumption here): the atelier's
  // single generic guest body would flatten the 13 seeded yukata colours + the
  // cast-lean/rod interplay into identical clones — the varied hand-drawn crowd
  // is the higher-craft read for background ambience.
  figs = scale * FIG_SCALE;

  for (var i = 0; i < n; i++) {
    var id = 'g' + i;
    var gs = vg[id] || { cx: w * 0.25, cy: h * 0.6, act: 'chat', cast: false, hushed: false };
    var cx = typeof gs.cx === 'number' ? gs.cx : w * 0.25;
    var cy = typeof gs.cy === 'number' ? gs.cy : h * 0.6;
    if (_scene.family === 'ship') {
      // Passenger positions are fixtures on the vessel, not reused island
      // wander coordinates. Both directions therefore keep the same interior.
      cx = w * (0.61 + (i % 5) * 0.062);
      cy = h * (0.40 + Math.floor(i / 5) * 0.145);
    } else if (_scene.id === 'tokyo-hotel') {
      cx = w * (0.13 + (i % 5) * 0.073);
      cy = h * (0.50 + Math.floor(i / 5) * 0.12);
    } else if (_scene.id === 'takeshiba-terminal') {
      cx = w * (0.24 + (i % 5) * 0.066);
      cy = h * (0.43 + Math.floor(i / 5) * 0.13);
    } else if (_scene.id === 'chichijima-transfer') {
      cx = w * (0.16 + (i % 5) * 0.074);
      cy = h * (0.42 + Math.floor(i / 5) * 0.14);
    } else {
      // Hahajima ambient wander stays on land.
      var shoreMax = (0.47 + (i % 5) * 0.006) * w;
      if (cx > shoreMax) cx = shoreMax;
    }

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
      bobY = -2.5 * figs * (1 - Math.cos(phase * 2 * Math.PI)) / 2;
    }
    var fy = cy + bobY;                       // this frame's feet/body-anchor line
    var col = YUKATA[i % YUKATA.length];
    var colRGB = hexRGB(col);

    ctx.save();
    ctx.globalAlpha = hushed ? 0.3 : 1;        // .guest.hushed{opacity:.3}

    // soft contact shadow — grounded on the feet line, ignores bob, drawn before the caster
    contactShadow(ctx, cx, cy + 1 * scale, 15 * figs, 5 * figs, 0.4);
    longShadow(ctx, cx, cy + 1 * scale, 8 * figs, 0.5);   // low-sun cast (spec §2), gentler than a duty-holder's

    // a fixed shore caster leans very slightly toward the water — a nicer, more purposeful stance
    // than standing bolt upright; the whole pawn (body/head/rod) rotates as one group about its feet.
    var islandCaster = _scene.id === 'hahajima-hinata' && sceneFlags.localBoat && !!gs.cast;
    if (islandCaster) {
      ctx.save();
      ctx.translate(cx, fy);
      ctx.rotate(-7 * Math.PI / 180);
      ctx.translate(-cx, -fy);
    }

    // yukata body — 8x11 rounded rect, feet at fy, centred on cx (style.css .g-body), now a
    // top-lit lacquer bevel (liftRGB) instead of a flat fill, plus a washi sash and an upper-left
    // rim-light lick (non-circular shape -> a light stroke along the edge, per the key-light rule)
    var bw = 8 * figs, bh = 11 * figs, br = 3.5 * figs;
    var bx = cx - bw / 2, by = fy - bh;
    roundRect(ctx, bx, by, bw, bh, br);
    var bodyGrad = ctx.createLinearGradient(bx, by, bx, by + bh);
    bodyGrad.addColorStop(0, rgba(liftRGB(colRGB, 26), 1));
    bodyGrad.addColorStop(0.55, rgba(colRGB, 1));
    bodyGrad.addColorStop(1, rgba(liftRGB(colRGB, -24), 1));
    ctx.fillStyle = bodyGrad;
    ctx.fill();
    ctx.lineWidth = 1 * figs;
    ctx.strokeStyle = rgba(PAL.indigoDeep, 0.4);
    ctx.stroke();

    // washi sash near the waist — a small charm detail that reads "yukata", not just a coloured block
    ctx.save();
    roundRect(ctx, bx, by, bw, bh, br); ctx.clip();
    ctx.fillStyle = rgba(PAL.washiWarm, 0.55);
    ctx.fillRect(bx, by + bh - 4 * figs, bw, 1.4 * figs);
    ctx.restore();

    // Tokyo guests are travelling with luggage, not casting from an island
    // shore. A restrained suitcase on alternating figures makes the hotel and
    // terminal crowds operationally legible without adding new actors.
    if (_scene.family === 'tokyo' && i % 3 === 0) {
      var caseX = cx + 5.5 * figs, caseY = fy - 6.5 * figs;
      ctx.strokeStyle = rgba(PAL.goldPale, 0.52); ctx.lineWidth = 0.8 * figs;
      ctx.beginPath(); ctx.moveTo(caseX + 1.5 * figs, caseY); ctx.lineTo(caseX + 1.5 * figs, caseY - 2.5 * figs);
      ctx.lineTo(caseX + 4.5 * figs, caseY - 2.5 * figs); ctx.lineTo(caseX + 4.5 * figs, caseY); ctx.stroke();
      roundRect(ctx, caseX, caseY, 6 * figs, 7 * figs, 1.5 * figs);
      ctx.fillStyle = rgba(i % 2 ? PAL.hanko : PAL.indigo, 0.88); ctx.fill();
      ctx.beginPath(); ctx.arc(caseX + 1.5 * figs, caseY + 7.5 * figs, 0.7 * figs, 0, 6.2832);
      ctx.arc(caseX + 4.5 * figs, caseY + 7.5 * figs, 0.7 * figs, 0, 6.2832); ctx.fillStyle = rgba(PAL.shadow, 0.9); ctx.fill();
    }

    ctx.save();
    roundRect(ctx, bx, by, bw, bh, br); ctx.clip();
    ctx.strokeStyle = rgba(PAL.rimWhite, 0.24);
    ctx.lineWidth = 1.3 * figs;
    ctx.beginPath();
    ctx.moveTo(bx + bw * 0.12, by + bh * 0.05);
    ctx.lineTo(bx + bw * 0.02, by + bh * 0.62);
    ctx.stroke();
    ctx.restore();

    // head dot (::before): 5px circle, centred (cx, fy-12.5), now with a key-light rim arc
    var headR = 2.5 * figs;
    var headCx = cx, headCy = fy - bh - 1.5 * figs;
    ctx.beginPath();
    ctx.arc(headCx, headCy, headR, 0, Math.PI * 2);
    ctx.fillStyle = rgba(PAL.skin, 1);
    ctx.fill();
    ctx.lineWidth = 1 * figs;
    ctx.strokeStyle = rgba(PAL.indigoDeep, 0.35);
    ctx.stroke();
    rimLightArc(ctx, headCx, headCy, headR, 0.32);

    // fishing rod for the fixed shore casters (::after on .g-cast .g-body) — bent, gold-lit,
    // with a drooping line + tiny glinting lure (drawGuests_rod above)
    if (islandCaster) {
      var px0 = cx + 2 * figs, py0 = fy - 16.5 * figs;
      drawGuests_rod(ctx, px0, py0, figs, view.rm);
    }

    if (islandCaster) ctx.restore();  // end lean rotation

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
  if (!domFlagsForScene(sim, view).localBoat) return;  // Nobu-san's skiff belongs only to Hahajima operations
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

  // A compact motor skiff: centre console + windscreen + outboard. Removing
  // the old sail/mast silhouette keeps it unmistakably separate from both
  // ferries and from Kimura-san's stationary jigging boat.
  roundRect(ctx, -2.5 * scale, -7.5 * scale, 8 * scale, 6 * scale, 1.5 * scale);
  var cab = ctx.createLinearGradient(0, -7.5 * scale, 0, -1.5 * scale);
  cab.addColorStop(0, rgba(PAL.washi, 0.95)); cab.addColorStop(1, rgba(PAL.washiWarm, 0.82));
  ctx.fillStyle = cab; ctx.fill();
  ctx.strokeStyle = rgba(PAL.indigoDeep, 0.55); ctx.lineWidth = 0.8 * scale; ctx.stroke();
  ctx.fillStyle = rgba(PAL.seaGlint, 0.72);
  ctx.fillRect(-1.2 * scale, -6.4 * scale, 5 * scale, 2.2 * scale);
  // outboard on the stern (right before the optional scene flip)
  roundRect(ctx, 10.5 * scale, 0, 4 * scale, 5 * scale, 1 * scale);
  ctx.fillStyle = rgba(PAL.hanko, 0.9); ctx.fill();
  ctx.strokeStyle = rgba(PAL.ink, 0.45); ctx.lineWidth = 0.7 * scale; ctx.stroke();
  ctx.beginPath(); ctx.arc(-7 * scale, -4.2 * scale, 2.1 * scale, 0, 6.2832);
  ctx.fillStyle = rgba(PAL.skin, 1); ctx.fill();

  ctx.restore();

  // NEW GEOGRAPHY draft label under Nobu-san's skiff (world space — after the flip/bob restore)
  if (_lang === 'ja') {
    chip(ctx, cx, cy + 10 * scale, 'のぶさん', {
      font: localizedFont('600', 9 * scale, 'system-ui,sans-serif'),
      suffix: ' 🛥', suffixFont: '600 ' + Math.round(9 * scale) + 'px system-ui,sans-serif',
      maxW: Math.max(1, 2 * Math.min(cx, view.w - cx) - 4 * scale),
      pad: 3 * scale, h: 12 * scale, r: 2 * scale, alpha: 0.85
    });
  } else {
    chip(ctx, cx, cy + 10 * scale, 'Nobu-san 🛥', {
      font: '600 ' + Math.round(9 * scale) + 'px system-ui,sans-serif',
      pad: 3 * scale, h: 12 * scale, r: 2 * scale, alpha: 0.85
    });
  }
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
  if (_scene.id !== 'hahajima-hinata') return null;
  var hubSt = null, i;
  var list = stationsForProfile(_scene);
  for (i = 0; i < list.length; i++) if (list[i].hub) { hubSt = list[i]; break; }
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
      font: localizedFont('600', 9 * scale, 'system-ui,sans-serif'),
      pad: 3 * scale, h: 12 * scale, r: 2 * scale,
      bg: rgba(PAL.washi, 0.88), border: rgba(PAL.goldDeep, 0.4)
    });
  }

  ctx.restore();
}

// ---- drawDeck ----
// Stable vessel interiors. The long-haul ferry is a large modern passenger ship
// (white superstructure/navy hull/red funnel); the unnamed inter-island vessel
// is a visibly smaller blue-white ferry. Neither borrows the local skiff art.
function ferryHullPath(ctx, x0, y0, x1, y1, bowTop) {
  var cx = (x0 + x1) / 2, shoulder = (x1 - x0) * 0.16, r = 22 * scale;
  ctx.beginPath();
  if (bowTop) {
    ctx.moveTo(cx, y0); ctx.lineTo(x1 - shoulder, y0 + r); ctx.quadraticCurveTo(x1, y0 + r, x1, y0 + r * 2);
    ctx.lineTo(x1, y1 - r); ctx.quadraticCurveTo(x1, y1, x1 - r, y1); ctx.lineTo(x0 + r, y1);
    ctx.quadraticCurveTo(x0, y1, x0, y1 - r); ctx.lineTo(x0, y0 + r * 2); ctx.quadraticCurveTo(x0, y0 + r, x0 + shoulder, y0 + r); ctx.closePath();
  } else {
    ctx.moveTo(x0 + r, y0); ctx.lineTo(x1 - r, y0); ctx.quadraticCurveTo(x1, y0, x1, y0 + r);
    ctx.lineTo(x1, y1 - r * 2); ctx.quadraticCurveTo(x1, y1 - r, x1 - shoulder, y1 - r);
    ctx.lineTo(cx, y1); ctx.lineTo(x0 + shoulder, y1 - r); ctx.quadraticCurveTo(x0, y1 - r, x0, y1 - r * 2);
    ctx.lineTo(x0, y0 + r); ctx.quadraticCurveTo(x0, y0, x0 + r, y0); ctx.closePath();
  }
}
function drawDeck(ctx, sim, t, view) {
  if (_scene.family !== 'ship') return;
  if (!view || !(view.w > 0) || !(view.h > 0)) return;
  var deckStations = stationsForProfile(_scene).filter(function (s) { return !s.hidden; });
  if (!deckStations.length) return;
  var i;
  // bounding box of the station cluster (px), padded so crews fanned around each station stay on deck
  var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9;
  for (i = 0; i < deckStations.length; i++) {
    var s = deckStations[i], sx = s.x * view.w, sy = s.y * view.h;
    if (sx < minX) minX = sx; if (sx > maxX) maxX = sx;
    if (sy < minY) minY = sy; if (sy > maxY) maxY = sy;
  }
  var isLocal = _scene.id === 'interisland-ferry';
  var padX = (isLocal ? 60 : 78) * scale, padTop = (isLocal ? 42 : 55) * scale, padBot = (isLocal ? 52 : 68) * scale;
  var x0 = minX - padX, x1 = maxX + padX, y0 = minY - padTop, y1 = maxY + padBot;
  var w = x1 - x0, h = y1 - y0, cx = (x0 + x1) / 2;
  if (!(w > 0) || !(h > 0)) return;
  var bowTop = _scene.routeDirection === 'return';
  ctx.save();
  if (isLocal) {
    // Twin water shadows make the smaller ferry read as a compact catamaran.
    contactShadow(ctx, x0 + w * 0.27, y1 - 2 * scale, w * 0.34, 17 * scale, 0.28);
    contactShadow(ctx, x0 + w * 0.73, y1 - 2 * scale, w * 0.34, 17 * scale, 0.28);
  } else contactShadow(ctx, cx, y1 - 4 * scale, w * 0.96, 24 * scale, 0.34);
  ferryHullPath(ctx, x0, y0, x1, y1, bowTop);
  var g = ctx.createLinearGradient(x0, y0, x1, y1);
  if (isLocal) { g.addColorStop(0, '#f1eadb'); g.addColorStop(0.68, '#c8d2d0'); g.addColorStop(1, '#2e6f82'); }
  else { g.addColorStop(0, '#f5f0e4'); g.addColorStop(0.58, '#cfd5d1'); g.addColorStop(0.59, '#27445b'); g.addColorStop(1, '#12293b'); }
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = isLocal ? rgba(PAL.seaGlint, 0.8) : rgba(PAL.goldLeaf, 0.7);
  ctx.lineWidth = Math.max(1.5, 2 * scale); ctx.stroke();

  // Clip fixtures/details to the hull so the interior remains one stable plane.
  ctx.save();
  ferryHullPath(ctx, x0, y0, x1, y1, bowTop); ctx.clip();
  ctx.strokeStyle = rgba(isLocal ? PAL.seaInk : PAL.indigoDeep, 0.13); ctx.lineWidth = 1 * scale;
  for (var yy = y0 + 34 * scale; yy < y1; yy += 32 * scale) { ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); }
  // Superstructure and wheelhouse.
  var sx = x0 + w * (isLocal ? 0.24 : 0.16), sw = w * (isLocal ? 0.52 : 0.68);
  var sy = y0 + h * 0.14, sh = h * (isLocal ? 0.20 : 0.24);
  roundRect(ctx, sx, sy, sw, sh, 9 * scale);
  ctx.fillStyle = rgba(PAL.washi, 0.94); ctx.fill();
  ctx.strokeStyle = rgba(PAL.seaInk, 0.48); ctx.lineWidth = 1.2 * scale; ctx.stroke();
  var windows = isLocal ? 5 : 8;
  ctx.fillStyle = rgba(PAL.seaDeep, 0.78);
  for (i = 0; i < windows; i++) {
    roundRect(ctx, sx + sw * (0.07 + i * 0.11), sy + sh * 0.28, sw * 0.065, sh * 0.32, 1.5 * scale); ctx.fill();
  }
  if (!isLocal) {
    // Ogasawara-maru's red funnel and orange lifeboats are categorical
    // passenger-ferry cues, not decorative sailing-ship rigging.
    roundRect(ctx, cx - 14 * scale, sy - 30 * scale, 28 * scale, 35 * scale, 5 * scale);
    ctx.fillStyle = rgba(PAL.hanko, 0.96); ctx.fill();
    ctx.fillStyle = rgba(PAL.indigoDeep, 0.9); ctx.fillRect(cx - 14 * scale, sy - 30 * scale, 28 * scale, 9 * scale);
    for (i = 0; i < 2; i++) {
      roundRect(ctx, x0 + w * (i ? 0.70 : 0.18), y0 + h * 0.48, w * 0.12, 10 * scale, 5 * scale);
      ctx.fillStyle = 'rgba(222,112,45,.92)'; ctx.fill();
    }
  } else {
    // Blue wheelhouse brow and twin-hull centre gap distinguish the smaller vessel.
    ctx.fillStyle = rgba(PAL.seaInk, 0.84); ctx.fillRect(sx, sy, sw, 5 * scale);
    ctx.fillStyle = rgba(PAL.seaDeep, 0.38); ctx.fillRect(cx - 9 * scale, y0 + h * 0.62, 18 * scale, h * 0.34);
  }
  // Railings: clean parallel lines, no mast or sail.
  ctx.strokeStyle = rgba(PAL.rimWhite, 0.55); ctx.lineWidth = 1 * scale;
  ctx.beginPath(); ctx.moveTo(x0 + 20 * scale, y0 + h * 0.42); ctx.lineTo(x1 - 20 * scale, y0 + h * 0.42); ctx.stroke();
  ctx.restore();
  // Direction arrow follows the physical route; return is explicitly inferred.
  var arrowY = bowTop ? y0 + 12 * scale : y1 - 12 * scale, dir = bowTop ? -1 : 1;
  ctx.fillStyle = rgba(PAL.goldPale, 0.72); ctx.beginPath();
  ctx.moveTo(cx, arrowY + dir * 7 * scale); ctx.lineTo(cx - 5 * scale, arrowY - dir * 3 * scale); ctx.lineTo(cx + 5 * scale, arrowY - dir * 3 * scale); ctx.closePath(); ctx.fill();
  var namedLongHaul = _scene.id === 'ogasawara-maru';
  if (_lang === 'ja') {
    if (namedLongHaul) {
      // The named ship wordmark is scenery, so even Japanese keeps the legacy draw signature.
      chip(ctx, cx, y0 + 7 * scale, 'おがさわら丸', {
        font: '800 ' + Math.round(9 * scale) + 'px system-ui,sans-serif', pad: 4 * scale, h: 14 * scale, r: 7 * scale,
        bg: rgba(PAL.indigoDeep, 0.78), border: rgba(PAL.gold, 0.45), ink: rgba(PAL.washi, 0.96)
      });
    } else {
      chip(ctx, cx, y0 + 7 * scale, '島間船（船名・時刻未確認）', {
        font: localizedFont('800', 9 * scale, 'system-ui,sans-serif'),
        maxW: Math.max(1, x1 - x0 - 8 * scale), pad: 4 * scale, h: 14 * scale, r: 7 * scale,
        bg: rgba(PAL.indigoDeep, 0.78), border: rgba(PAL.gold, 0.45), ink: rgba(PAL.washi, 0.96)
      });
    }
  } else {
    chip(ctx, cx, y0 + 7 * scale, namedLongHaul ? 'OGASAWARA-MARU' : 'INTER-ISLAND VESSEL · UNCONFIRMED', {
      font: '800 ' + Math.round(9 * scale) + 'px system-ui,sans-serif', pad: 4 * scale, h: 14 * scale, r: 7 * scale,
      bg: rgba(PAL.indigoDeep, 0.78), border: rgba(PAL.gold, 0.45), ink: rgba(PAL.washi, 0.96)
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
  // Scene profiles choose the visible station vocabulary. The underlying sim
  // station ids remain unchanged and are joined below for live crew/readiness.
  var stList = stationsForProfile(_scene);
  var i;
  for (i = 0; i < stList.length; i++) {
    var st = stList[i];
    if (st.hidden) continue;   // §map v2: command folded into Hinata, finance hidden (voyage stations carry no such flag)
    var p = stationPx(st, view);
    var cx = p.x, cy = p.y;
    var live = stationStateForScene(st, sim, view, terr);
    var crewCount = live.crewCount;
    var hot = !!(live.dominantProblem && crewCount > 0);
    var tv = live.readiness;
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
      if (_scene.family === 'island') drawStations_glyph(ctx, st.id, cx, discCy, discR, na, t, !!view.rm);
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
    ctx.font = localizedFont('600', 11 * scale, 'sans-serif');
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0,0,0,.55)'; ctx.shadowBlur = 3 * scale;
    ctx.fillStyle = rgba(PAL.gold, 1);
    if (_lang === 'ja') {
      ctx.fillText(nm(st.name), cx, discCy + footR + (isHub ? footR * 0.6 : 6 * scale),
        Math.max(64 * scale, Math.min(130 * scale, view.w * 0.22)));
    } else {
      ctx.fillText(nm(st.name), cx, discCy + footR + (isHub ? footR * 0.6 : 6 * scale));
    }
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
function hubSections(view, sim) {
  if (!view || !(view.w > 0) || !(view.h > 0) || !P || !P.STATIONS) return [];
  var profile = sceneProfile(sim, view);
  if (profile.id !== 'hahajima-hinata') return [];
  var hubSt = null, i;
  var list = stationsForProfile(profile);
  for (i = 0; i < list.length; i++) {
    if (list[i].hub) { hubSt = list[i]; break; }
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
  var i, m, st, p, footR, discCy, sev, rgb, pulse, k2, markerScene, rp;
  for (i = 0; i < ms.length; i++) {
    m = ms[i]; if (!m) continue;
    markerScene = sceneIdValue(m.sceneId || m.profileId || m.scene);
    if (_scene.id === 'route-overview') {
      rp = routePoint(markerScene, m.stationId || m.station, view);
      if (!rp) continue;
      p = { x: rp.x * view.w, y: rp.y * view.h };
      footR = 8 * scale; discCy = p.y;
    } else {
      if (markerScene && markerScene !== _scene.id) continue;
      st = stationForScene(m.stationId || m.station, sim, view);
      if (!st) continue;
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
  if (_scene.id !== 'hahajima-hinata') return;
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
    var homes = [stationForScene('mess', sim, view), stationForScene('lodging', sim, view)], si, fi2, lx, ly, fx, fy, fa, pph;
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

// ---- drawSceneLabel — explicit map status, independent of the task clock ----
function drawSceneLabel(ctx, view) {
  if (!view || !_scene) return;
  var label = _lang === 'ja' ? _scene.jp : _scene.en;
  var hs = Math.max(1, scale);   // HUD text keeps a readable CSS-pixel floor on compact stages
  var font = _lang === 'ja'
    ? localizedFont('800', 10 * hs, 'system-ui,sans-serif')
    : '800 ' + Math.round(10 * hs) + 'px system-ui,sans-serif';
  ctx.save(); ctx.font = font;
  ctx.restore();
  // Centre avoids the live dinner/status tag in the top-right and the clock in
  // the top-left. The DOM map region carries the same label for AT.
  var sceneLabelOpts = {
    font: font, pad: 6 * hs, h: 18 * hs, r: 9 * hs,
    bg: rgba(PAL.indigoDeep, 0.82), border: rgba(PAL.gold, 0.52),
    ink: rgba(PAL.goldPale, 0.96)
  };
  if (_lang === 'ja') sceneLabelOpts.maxW = Math.max(1, view.w - 20 * scale);
  // The inferred-return suffix makes the longest English ship label wider
  // than a phone stage.  Use chip's measured text compression only for that
  // route state, preserving the established desktop/English typography.
  else if (_scene.routeDirection === 'return') sceneLabelOpts.maxW = Math.max(1, view.w - 20 * scale);
  chip(ctx, view.w / 2, 10 * scale, label, sceneLabelOpts);
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
    // `at` rides the same rAF clock as t, in SECONDS (the app stamps
    // performance.now()/1000 — app.js bootReportStage). Values that can only
    // be milliseconds (a raw performance.now()) are normalized defensively.
    var at0 = s.at > 1e5 ? s.at / 1000 : s.at;
    k = (t - at0) / 0.62;
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

// sprite pose selection (spec §1): walking wins (legs must move), then the
// stall family (the slumped diagnostic star), then the work gesture, else idle.
function drawFigures_pose(f, state) {
  if (f.walking) return 'walk';
  if (STALL_STATES[state]) return 'stall';
  if (state === 'working') return 'work';
  return 'idle';
}

function drawFigures(ctx, sim, t, view) {
  if (!sim || !sim.participants || !view || !view.fig) return;
  if (_scene.flags && _scene.flags.showCrew === false) return;
  var ts = t * 1000;
  var rm = !!view.rm;
  figs = scale * FIG_SCALE;   // §2 pawn scale +30% — every pawn-body size below
  // state -> bubble/border tint (mirrors style.css .astro.s-* .bub border-color groups; resolved/idle/tired/working keep the chip default)
  var BTINT = { confused: '217,83,79', onFire: '217,83,79', waiting: '193,122,31', waitInfo: '193,122,31', meeting: '92,127,146', rework: '92,127,146' };
  // scaled chip geometry, shared by the speech bubble + name chip (chip() never
  // auto-scales). Text stays at HUD scale — chips are labels, not body parts.
  var chipFont = '600 ' + Math.round(10 * scale) + 'px system-ui,sans-serif';
  var pawnLabelFont = localizedFont('600', 10 * scale, 'system-ui,sans-serif');
  var chipPad = 4 * scale, chipH = 14 * scale, chipR = 2 * scale, chipTail = 4 * scale;

  // ---- only the named boats go to sea (WORLD.md: Nobu-san / Kimura-san) — no individual
  // ever crosses water. Crew STATIONED at sea share ONE boat hull per station (drawn here,
  // under everyone); crew WALKING to a sea station board at the dock — they fade out at the
  // shoreline (aboard, below deck) and fade back in on the deck (the per-figure loop below).
  function isAfloat(x, y) { return view.w > 0 && (x / view.w) > shoreNX(y / view.h) + 0.004; }
  // §voyage (spec §3): on the ship day the WHOLE cast is aboard ONE vessel — drawDeck() paints
  // that single hull under the station cluster, so suppress the per-station group-hulls here
  // (five over-water stations would otherwise read as five separate dinghies). Every crew still
  // renders `aboard` (legs cropped, no personal shadow) via the per-figure logic below.
  var voyage = _scene.family === 'ship';
  var localBoatWorld = !!domFlagsForScene(sim, view).localBoat;
  var boatGroups = {};
  if (!voyage && localBoatWorld) {
  for (var bg = 0; bg < sim.participants.length; bg++) {
    var bpp = sim.participants[bg], bff = view.fig[bpp.id];
    if (!bff) continue;
    var gx = null, gy = null;
    if (!bff.walking && isAfloat(bff.cx, bff.cy)) { gx = bff.cx; gy = bff.cy; }
    else if (bff.walking && typeof bff.tx === 'number' && isAfloat(bff.tx, bff.ty)) { gx = bff.tx; gy = bff.ty; }
    if (gx === null) continue;
    var gk = bpp.station || 'sea';
    var g0 = boatGroups[gk] || (boatGroups[gk] = { minX: gx, maxX: gx, y: gy });
    if (gx < g0.minX) g0.minX = gx;
    if (gx > g0.maxX) g0.maxX = gx;
    if (gy > g0.y) g0.y = gy;
  }
  for (var gkk in boatGroups) {
    var gb = boatGroups[gkk];
    var bw = (gb.maxX - gb.minX) / 2 + 20 * figs, bcx = (gb.minX + gb.maxX) / 2, bhy = gb.y - 3.5 * figs, bhh = 6 * figs;
    ctx.save();
    contactShadow(ctx, bcx, gb.y + 4 * scale, bw * 1.7, 4.5 * figs, 0.28);   // hull shadow on the water
    drawBoat_hullPath(ctx, bcx - bw, bhy, bw * 2, bhh, 2 * figs, 2 * figs, 6 * figs, 6 * figs);
    var bgr = ctx.createLinearGradient(0, bhy, 0, bhy + bhh);
    bgr.addColorStop(0, '#4a382a'); bgr.addColorStop(1, '#2e2118');
    ctx.fillStyle = bgr; ctx.fill();
    ctx.strokeStyle = 'rgba(212,180,124,0.55)'; ctx.lineWidth = Math.max(1, 0.8 * figs);
    ctx.beginPath(); ctx.moveTo(bcx - bw * 0.96, bhy + 0.5); ctx.lineTo(bcx + bw * 0.96, bhy + 0.5); ctx.stroke();
    // Centre console + outboard: the local crew hull shares Nobu-san's motor-
    // skiff language and cannot be mistaken for either route ferry.
    roundRect(ctx, bcx - 4 * figs, bhy - 5 * figs, 8 * figs, 5 * figs, 1.5 * figs);
    ctx.fillStyle = rgba(PAL.washiWarm, 0.9); ctx.fill();
    ctx.fillStyle = rgba(PAL.seaGlint, 0.65); ctx.fillRect(bcx - 2.5 * figs, bhy - 4 * figs, 5 * figs, 1.5 * figs);
    roundRect(ctx, bcx + bw * 0.87, bhy + 1 * figs, 4 * figs, 5 * figs, 1 * figs);
    ctx.fillStyle = rgba(PAL.hanko, 0.88); ctx.fill();
    ctx.restore();
  }
  }   // end if(!voyage) group-hull pre-pass

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

    // over-water fiction: stationed at sea = aboard the group hull (legs cropped below);
    // walking over water = in transit BY BOAT — visible at the dockside, unseen mid-water,
    // fading back in on the deck. Nobody is ever drawn walking on the sea.
    // A ship profile is already one continuous deck even when its stable
    // logical coordinates happen to sit west of the island shoreline.
    var afloat = voyage || (localBoatWorld && isAfloat(cx, feetY));
    var aboard = afloat && !f.walking;
    if (!voyage && afloat && f.walking) {
      var overW = (cx / view.w) - shoreNX(feetY / view.h);
      var aShore = 1 - (overW - 0.004) / 0.05;
      if (aShore < 0) aShore = 0; if (aShore > 1) aShore = 1;
      var aBoat = 0;
      if (typeof f.tx === 'number' && isAfloat(f.tx, f.ty)) {
        var bdx = cx - f.tx, bdy = feetY - f.ty;
        aBoat = 1 - Math.sqrt(bdx * bdx + bdy * bdy) / (52 * figs);
        if (aBoat < 0) aBoat = 0; if (aBoat > 1) aBoat = 1;
      }
      var transitA = aShore > aBoat ? aShore : aBoat;
      if (transitA < 0.05) continue;   // mid-crossing: below deck, not drawn
      dim *= transitA;
    }

    ctx.save();
    ctx.globalAlpha = dim;

    // ---- sprite lookup (spec §1) — resolved BEFORE any transform so a null
    // falls through to the full procedural pawn with zero drift. Facing -1
    // canvases are PRE-MIRRORED by the atelier: the sprite path must never
    // also ctx.scale(-1,1). frame 0 under RM (one static pose).
    var pose = drawFigures_pose(f, state);
    var sprFrame = 0;
    if (!rm) {
      if (pose === 'walk') {
        sprFrame = ((t % 0.38) / 0.38) < 0.5 ? 0 : 1;            // rides the same 0.38s cycle as the bob
      } else if (pose === 'work') {
        var sgPeriod = 0.8 + workFrac(p.id + '#gp') * 0.8;       // the gesture's own seeded cadence
        sprFrame = gesturePhase(t, sgPeriod, workFrac(p.id + '#ga')) < 0.5 ? 0 : 1;
      }
    }
    var spr = sprGet(p.roleId, pose, sprFrame, f.faceL ? -1 : 1);

    // ---- shadow + pawn body (flip + walk-bob live in here; shadow ignores bob) ----
    ctx.save();
    if (!spr && f.faceL) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }

    var shRx = (f.walking && !rm) ? 6 : 7.5;
    if (!aboard) {
      contactShadow(ctx, cx, feetY + 3 * scale, shRx * 2 * figs, 5 * figs, 0.42);
      // low-sun long cast shadow (spec §2 lighting) — same rig as the stations',
      // so at dawn every pawn stretches the same way; no-op at midday/night.
      // Pawns get a stronger mul than stations: a small caster needs the darker
      // core for the stretch to read at all (the 07:00 departure is the money shot).
      longShadow(ctx, cx, feetY + 2 * scale, 11 * figs, 1.2);
    }
    // aboard: no personal shadow — the group hull (drawn in the pre-pass) casts it

    // walk trot / working idle-breath bob (t-driven ambience per contract §2); none under rm
    var bobOffset = 0, swayX = 0;
    if (!rm) {
      if (state === 'working') {
        var ph2 = (t % 1.15) / 1.15;
        bobOffset = -1.25 * figs * (1 - Math.cos(2 * Math.PI * ph2));
      } else if (f.walking) {
        var ph1 = (t % 0.38) / 0.38;
        bobOffset = -0.8 * figs * (1 - Math.cos(2 * Math.PI * ph1));
      } else if (state === 'idle') {
        // ---- W2 idle fidget: a subtle weight-shift sway, seeded per pid, every few seconds
        var fPeriod = 3.4 + workFrac(p.id + '#fp') * 1.6;
        var fPhase = workFrac(p.id + '#fa');
        swayX = Math.sin(gesturePhase(t, fPeriod, fPhase) * Math.PI * 2) * 1.6 * figs;
      }
    }

    ctx.save();
    ctx.translate(swayX, bobOffset);

    if (spr) {
      // ---- SPRITE PAWN (spec §1): feet-centre anchor at meta (24,52) of a
      // 48×56 box, display scale = figs so the sprite torso (~12-15 units wide)
      // lands exactly where the procedural coat (12*figs) stood. The sprite
      // carries its own legs/arms/tool/face — the procedural limb + gesture
      // overlays are suppressed; the shadow/aura/bubble/name stack (below,
      // outside this block) and the wander/bob offsets are kept.
      var sm = (SPR && SPR.meta) ? SPR.meta : { w: 48, h: 56, feetX: 24, feetY: 52 };
      // swap ease: grow from ~procedural height to full sprite height, feet anchored
      var swapK = 1;
      if (_sprSince && !rm) {
        swapK = ((typeof performance !== 'undefined' ? performance.now() : _sprSince) - _sprSince) / 450;
        if (swapK >= 1) { swapK = 1; _sprSince = 0; }
        else if (swapK < 0) swapK = 0;
      }
      var mh = 0.72 + 0.28 * swapK;
      if (aboard) {
        // crop the sprite's legs (bottom ~8 units) so the pawn stands IN the boat hull
        var res2 = sm.res || 2, cropU = 8;
        ctx.drawImage(spr, 0, 0, sm.w * res2, (sm.h - cropU) * res2,
          cx - sm.feetX * figs * mh, feetY - sm.feetY * figs * mh, sm.w * figs * mh, (sm.h - cropU) * figs * mh);
      } else {
        ctx.drawImage(spr, cx - sm.feetX * figs * mh, feetY - sm.feetY * figs * mh, sm.w * figs * mh, sm.h * figs * mh);
      }
    } else {
      // ---- PROCEDURAL PAWN (the permanent fallback — byte-equivalent art,
      // sized by figs): legs, coat, head, cap, work gesture. ----
      // leg swing (independent of the bob rule above — CSS keeps legswing tied purely to .walking)
      var angL = 0, angR = 0;
      if (f.walking && !rm) {
        var phL = (t % 0.38) / 0.38;
        angL = -26 * Math.cos(2 * Math.PI * phL);
        angR = -angL;
      }

      if (!aboard) {   // aboard, the legs live inside the hull
        drawFigures_leg(ctx, cx - 2 * figs, feetY - 7.5 * figs, 3 * figs, 7.5 * figs, 1.5 * figs, angL, '#2b241c');
        drawFigures_leg(ctx, cx + 2 * figs, feetY - 7.5 * figs, 3 * figs, 7.5 * figs, 1.5 * figs, angR, '#2b241c');
      }

      // torso (coat) — role-colour lacquer bevel (liftRGB top/bottom), ink outline, washi sash, upper-left rim light
      var trX = cx - 6 * figs, trY = feetY - 18 * figs, trW = 12 * figs, trH = 12.5 * figs, trR = 3.5 * figs;
      var torsoGrad = ctx.createLinearGradient(trX, trY, trX, trY + trH);
      torsoGrad.addColorStop(0, 'rgb(' + liftRGB(roleRGB, 24) + ')');
      torsoGrad.addColorStop(1, 'rgb(' + liftRGB(roleRGB, -18) + ')');
      ctx.fillStyle = torsoGrad;
      roundRect(ctx, trX, trY, trW, trH, trR);
      ctx.fill();
      ctx.lineWidth = 1 * figs;
      ctx.strokeStyle = rgba(PAL.ink, 0.35);
      roundRect(ctx, trX, trY, trW, trH, trR);
      ctx.stroke();
      ctx.fillStyle = rgba(PAL.washi, 0.7);
      ctx.fillRect(trX, trY + trH - 5 * figs, trW, 2 * figs);
      // upper-left key-light lick along the coat's shoulder/collar edge
      ctx.save();
      ctx.strokeStyle = rgba(PAL.rimWhite, 0.3);
      ctx.lineWidth = 1.3 * figs;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(trX + 1.2 * figs, trY + trH * 0.62);
      ctx.lineTo(trX + 1.2 * figs, trY + 1.4 * figs);
      ctx.quadraticCurveTo(trX + 1.2 * figs, trY + 0.8 * figs, trX + trW * 0.5, trY + 0.8 * figs);
      ctx.stroke();
      ctx.restore();

      // head — skin tone, soft ink outline, upper-left rim-light arc
      var headR = 4 * figs, headCy = feetY - 19.5 * figs;
      ctx.beginPath();
      ctx.fillStyle = rgba(PAL.skin, 1);
      ctx.arc(cx, headCy, headR, 0, Math.PI * 2);
      ctx.fill();
      ctx.lineWidth = 1 * figs;
      ctx.strokeStyle = rgba(PAL.ink, 0.3);
      ctx.stroke();
      rimLightArc(ctx, cx, headCy, headR, 0.4);

      // cap — role colour, small bevel, left-biased warm rim-light band + washi trim
      var hX = cx - 5 * figs, hY = feetY - 26 * figs, hW = 10 * figs, hH = 5 * figs, hR = 2.2 * figs;
      ctx.fillStyle = role.color;
      roundRect(ctx, hX, hY, hW, hH, hR);
      ctx.fill();
      ctx.fillStyle = rgba(PAL.rimWhite, 0.34);
      ctx.fillRect(hX, hY, hW * 0.6, 1.5 * figs);
      ctx.fillStyle = rgba(PAL.washi, 0.75);
      ctx.fillRect(hX, hY + hH - 1 * figs, hW, 1 * figs);

      // ---- W2 role work-gesture overlay: small, seeded, only while actually working ----
      if (!rm && state === 'working') {
        var gfn = GESTURE[p.roleId];
        if (gfn) {
          var gPeriod = 0.8 + workFrac(p.id + '#gp') * 0.8;
          var gPhase = workFrac(p.id + '#ga');
          gfn(ctx, cx, feetY, headCy, gesturePhase(t, gPeriod, gPhase));
        }
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
      radialGlow(ctx, 0, 0, 13 * figs, aura.rgb, aura.a);
      ctx.restore();
    }

    // ---- Live gap-focus spotlight ring (gold, pulsing) + a small catching-light sparkle ----
    if (view.spotlightPid && p.id === view.spotlightPid) {
      var pf = rm ? 1 : drawFigures_pulse(t, 1.2, 0.6, 1);
      ctx.save();
      ctx.globalAlpha = 0.4 * pf;
      radialGlow(ctx, cx, feetY + 3 * scale, 16 * figs, PAL.gold, 0.5);
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = 0.75 * pf;
      ctx.lineWidth = 2 * scale;
      ctx.strokeStyle = rgba(PAL.gold, 1);
      ctx.beginPath();
      ctx.arc(cx, feetY + 3 * scale, 9 * figs, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (!rm) sparkle(ctx, cx + 8 * figs, feetY - 4 * figs, 3 * scale, 0.85 * pf);
    }

    // ---- speech-bubble chip (BUB map; '' = none) — pops on state change ----
    var bubTxt = BUB[state] || '';
    if (bubTxt) {
      // sprite heads reach ~37 units above the feet (vs the procedural ~26) — lift the chip
      // clear of the hat so the diagnostic bubble never covers the face it explains
      var bubY = feetY - (spr ? 56 : 46) * figs; // top-centre; tail:'down' hangs toward the hat
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
      var label;
      if (_lang === 'ja') {
        label = nm(p.name);
        // hovered pawn: append the localized state word (supplied by app.js via view.hoverWord)
        if (p.id === view.hoverPid && view.hoverWord) label += ' · ' + view.hoverWord;
        chip(ctx, cx, feetY + 5 * figs, label, {
          font: pawnLabelFont, prefix: role.icon ? role.icon + ' ' : '', prefixFont: chipFont,
          pad: chipPad, h: chipH, r: chipR,
          maxW: Math.max(1, Math.min(220 * scale, view.w - 20 * scale))
        });
      } else {
        label = (role.icon ? role.icon + ' ' : '') + nm(p.name);
        if (p.id === view.hoverPid && view.hoverWord) label += ' · ' + view.hoverWord;
        chip(ctx, cx, feetY + 5 * figs, label, { font: chipFont, pad: chipPad, h: chipH, r: chipR });
      }
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
        st = stationForScene(m.toSt, sim, view);
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
  if (_scene.family === 'overview') return;
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
        var csp = stationPx(stationForScene(hops[cj].station, sim, view), view);
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
    var sPt = stationPx(stationForScene(c._strikeStation, sim, view), view);
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
  var A = stationForScene(hops[seg].station, sim, view);
  var B = stationForScene(hops[Math.min(hops.length - 1, seg + 1)].station, sim, view);
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


  // Public surface. camTo/camReset (spec §3) are the S5 cinematic triggers'
  // entry points — eased inside scene()'s camFrame, identity under reduced
  // motion, never moved by the stage itself. camState lets the app hide/re-sync
  // DOM hotspot overlays while the camera is away from identity. FIG_SCALE is
  // exported so the app layer plumbs the SAME +30% factor into its fan spacing
  // and pawn hit radius (app.js pawnAt: 26px → 26×FIG_SCALE ≈ 34px).
  window.PRS_STAGE = { initStage: initStage, resizeStage: resizeStage, scene: scene, hubSections: hubSections,
                       sceneProfile: sceneProfile, stationsForScene: stationsForScene, stationForScene: stationForScene,
                       stationStateForScene: stationStateForScene, linksForScene: linksForScene,
                       topologyForScene: topologyForScene, domFlagsForScene: domFlagsForScene,
                       sceneFlags: domFlagsForScene, routePoint: routePoint, routePoints: routePoints,
                       groundCacheKey: groundCacheKey, localizedFont: localizedFont,
                       camTo: camTo, camReset: camReset, camState: camState, FIG_SCALE: FIG_SCALE };
})();
