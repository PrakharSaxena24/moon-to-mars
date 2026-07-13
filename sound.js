/* ============================================================================
 * sound.js — Ogasawara Rehearsal · procedural WebAudio (Voyage §5 / plan W3).
 * One plain file, vanilla ES5, offline (§11), ZERO audio files — every ambient
 * layer and cue below is synthesized at runtime from oscillators + one shared
 * noise buffer. No library, no CDN, no build step.
 *
 * PINNED API (app.js calls every member null-safe from the caller side, the
 * SAME fallback discipline as sprites.js's window.PRS_SPRITES header: this
 * file can be deleted outright and the game runs identically — nothing here
 * feeds a deterministic sim path, nothing here is load-bearing):
 *
 *   window.PRS_SOUND = {
 *     enabled,            // boolean, kept in sync manually (no getter magic):
 *                          // true once the user has toggled sound ON and the
 *                          // AudioContext is running.
 *     toggle(),           // flip on/off. MUST be called from inside a real
 *                          // user-gesture handler (a click) — browsers refuse
 *                          // to start/resume an AudioContext otherwise. Persists
 *                          // the choice to localStorage['prs_sound']. Returns
 *                          // the new enabled state.
 *     cue(name),          // one-shot event sound. name is one of:
 *                          //   'freeze'  — soft low bell (a Live/coarse stall)
 *                          //   'place'   — wooden tick (a tray/care commit)
 *                          //   'gain'    — +N pentatonic blip (the rail float)
 *                          //   'thock'   — the hanko stamp knock (report grade)
 *                          //   'fanfare' — warm 3-note layer (on-time dinner)
 *                          //   'drawer'  — short swish (day-drawer open/close)
 *                          // Never throws, even before toggle() has ever run —
 *                          // a no-op while sound is off / uninitialized.
 *     ambient(seg, dayK)  // (re)start the looping ambient bed for a run
 *                          // segment: 'load'|'voyage'|'arrival'|'ops'|
 *                          // 'fishday'|'return'|other. Call ambient(null) on
 *                          // run-exit to tear the bed down. dayK is the sim
 *                          // clock-minute (roughly 0-1440) AT THE MOMENT OF
 *                          // THIS CALL — it picks day-vs-dusk wildlife ONCE;
 *                          // this is called only at run-enter/exit (never per
 *                          // animation tick), so it is not re-sampled live.
 *   }
 *
 * AUTOPLAY POLICY: `enabled` starts false and no AudioContext is constructed
 * at all unless localStorage remembers the user turned sound on before. The
 * ONLY place this file ever calls ctx.resume() is inside toggle(), which
 * app.js fires exclusively from a real click handler (a user gesture) — so a
 * fresh, still-`suspended` context is never force-started outside a gesture.
 * The one optimistic exception (bottom of file): if the browser's own
 * autoplay heuristic already hands back a brand-new AudioContext in the
 * 'running' state (some browsers do this once an origin has enough past
 * engagement — no gesture involved, no resume() call made), and the stored
 * preference says the user wants sound, playback is allowed to start; if the
 * context comes back 'suspended' (the common case, esp. on first visit / most
 * browsers most of the time), the page stays silent exactly as if no
 * preference existed. Under prefers-reduced-motion this restore is skipped
 * entirely — sound only ever starts from an explicit in-session toggle click.
 *
 * DESIGN: gentle, "-18dB-ish", never busy. A shared master gain caps overall
 * loudness; every individual oscillator/noise layer sits well below that on
 * top. Under prefers-reduced-motion the ambient bed also drops its sparse
 * gull-chirp/cricket-tick scheduler (the steady surf+wind/hum layer stays) —
 * less transient business, matching the spirit of the motion preference even
 * though sound is a different modality from animation.
 * ==========================================================================*/
(function () {
  'use strict';

  var AC = window.AudioContext || window.webkitAudioContext;
  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  var PREF_KEY = 'prs_sound';

  var ctx = null, master = null, noiseBuf = null;
  var enabled = false;
  var ambientG = null;          // this run's ambient bus gain (torn down/rebuilt per segment)
  var ambientTimers = [];       // pending setTimeout ids for the wildlife scheduler
  var curNodes = [];            // oscillator/bufferSource nodes needing an explicit .stop()
  var curSeg = null, curDayK = null;   // last-requested segment/clock, remembered even while muted

  function loadPref() { try { return localStorage.getItem(PREF_KEY) === '1'; } catch (e) { return false; } }
  function savePref(v) { try { localStorage.setItem(PREF_KEY, v ? '1' : '0'); } catch (e) { } }

  function now() { return ctx.currentTime; }

  // 2s of white noise, looped — the shared raw material behind surf/wind/wooden/wildlife
  // textures (each use filters it differently). Built once, lazily, on first real use.
  function makeNoiseBuffer(c) {
    var len = Math.floor(c.sampleRate * 2), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0), i;
    for (i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  function noiseSource() { var s = ctx.createBufferSource(); s.buffer = noiseBuf; s.loop = true; return s; }

  function ensureCtx() {
    if (ctx || !AC) return ctx;
    try {
      ctx = new AC();
      master = ctx.createGain(); master.gain.value = 0;   // starts silent; toggle() ramps it up
      master.connect(ctx.destination);
      noiseBuf = makeNoiseBuffer(ctx);
    } catch (e) { ctx = null; }
    return ctx;
  }

  // =========================================================================
  // AMBIENT BED — one bus per running segment: surf + wind always; an engine
  // hum layer added only on the voyage day; a sparse gull-chirp (day) or
  // cricket-tick (dusk/night) scheduler layered on top, RM-gated off.
  // =========================================================================
  function stopAmbientNodes() {
    ambientTimers.forEach(function (id) { clearTimeout(id); });
    ambientTimers = [];
    var nodes = curNodes; curNodes = [];
    var bus = ambientG; ambientG = null;
    if (!ctx) return;
    if (bus) { try { bus.gain.cancelScheduledValues(now()); bus.gain.linearRampToValueAtTime(0.0001, now() + 0.3); } catch (e) { } }
    setTimeout(function () {
      nodes.forEach(function (n) { try { n.stop(); } catch (e) { } try { n.disconnect(); } catch (e) { } });
      if (bus) { try { bus.disconnect(); } catch (e) { } }
    }, 340);
  }

  function gullChirp(bus) {
    if (!ctx || ambientG !== bus) return;
    var t = now();
    var o = ctx.createOscillator(); o.type = 'sine';
    var g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(bus);
    o.frequency.setValueAtTime(2200 + Math.random() * 400, t);
    o.frequency.exponentialRampToValueAtTime(2900 + Math.random() * 500, t + 0.12);
    o.frequency.exponentialRampToValueAtTime(1700, t + 0.3);
    g.gain.linearRampToValueAtTime(0.07, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.34);
    o.start(t); o.stop(t + 0.36);
  }
  function cricketTick(bus) {
    if (!ctx || ambientG !== bus) return;
    var t = now();
    var o = ctx.createOscillator(); o.type = 'square'; o.frequency.value = 4100 + Math.random() * 300;
    var g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(bus);
    g.gain.linearRampToValueAtTime(0.045, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.05);
    o.start(t); o.stop(t + 0.06);
  }
  function scheduleWildlife(dayK, bus) {
    if (RM.matches) return;   // reduced motion: keep the bed steady, skip the sparse transients
    var day = (dayK == null) || (dayK >= 300 && dayK < 1080);   // ~05:00-18:00 = day; else dusk/night
    function loop() {
      if (ambientG !== bus) return;   // torn down / replaced — stop the chain
      if (day) gullChirp(bus); else cricketTick(bus);
      var next = day ? (6000 + Math.random() * 9000) : (900 + Math.random() * 1800);
      var id = setTimeout(loop, next);
      ambientTimers.push(id);
    }
    var id0 = setTimeout(loop, 2000 + Math.random() * 3000);
    ambientTimers.push(id0);
  }

  function startAmbient(seg, dayK) {
    if (!ctx || !enabled) return;
    stopAmbientNodes();
    var bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(master);
    bus.gain.linearRampToValueAtTime(1, now() + 1.2);
    ambientG = bus;

    // surf: bandpass-filtered noise, a slow swell LFO breathing its gain
    var surf = noiseSource();
    var surfF = ctx.createBiquadFilter(); surfF.type = 'bandpass'; surfF.frequency.value = 480; surfF.Q.value = 0.6;
    var surfG = ctx.createGain(); surfG.gain.value = 0.16;
    surf.connect(surfF); surfF.connect(surfG); surfG.connect(bus);
    var swell = ctx.createOscillator(); swell.type = 'sine'; swell.frequency.value = 0.08;
    var swellG = ctx.createGain(); swellG.gain.value = 0.05;
    swell.connect(swellG); swellG.connect(surfG.gain);
    surf.start(); swell.start();
    curNodes.push(surf, swell);

    // wind: lowpass-filtered noise, quieter and slower still
    var wind = noiseSource();
    var windF = ctx.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 900;
    var windG = ctx.createGain(); windG.gain.value = 0.09;
    wind.connect(windF); windF.connect(windG); windG.connect(bus);
    wind.start();
    curNodes.push(wind);

    // the voyage day alone adds a low engine-hum drone (two lightly detuned saws)
    if (seg === 'voyage') {
      var hum1 = ctx.createOscillator(); hum1.type = 'sawtooth'; hum1.frequency.value = 54;
      var hum2 = ctx.createOscillator(); hum2.type = 'sawtooth'; hum2.frequency.value = 54.6;
      var humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 220;
      var humG = ctx.createGain(); humG.gain.value = 0.07;
      hum1.connect(humF); hum2.connect(humF); humF.connect(humG); humG.connect(bus);
      hum1.start(); hum2.start();
      curNodes.push(hum1, hum2);
    }

    scheduleWildlife(dayK, bus);
  }

  function ambient(seg, dayK) {
    if (!seg) { curSeg = null; curDayK = null; stopAmbientNodes(); return; }
    curSeg = seg; curDayK = dayK;
    if (!enabled || !ctx) return;   // remembered; the bed starts the moment sound is turned on
    startAmbient(seg, dayK);
  }

  // =========================================================================
  // ONE-SHOT CUES — every one gentle (well under the master ceiling), short,
  // and self-cleaning (oscillators are scheduled to .stop() themselves).
  // =========================================================================
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];   // C D E G A — bright pentatonic blip set

  function cueFreeze() {
    var t = now();
    var o1 = ctx.createOscillator(); o1.type = 'sine'; o1.frequency.value = 220;
    var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = 440;
    var g = ctx.createGain(); g.gain.value = 0;
    o1.connect(g); o2.connect(g); g.connect(master);
    g.gain.linearRampToValueAtTime(0.16, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 1.1);
    o1.start(t); o2.start(t); o1.stop(t + 1.15); o2.stop(t + 1.15);
  }
  function cuePlace() {
    var t = now();
    var s = noiseSource();
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1500; f.Q.value = 3;
    var g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master);
    g.gain.linearRampToValueAtTime(0.2, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.09);
    s.start(t); s.stop(t + 0.1);
  }
  function cueGain() {
    var t = now(), f = PENTA[Math.floor(Math.random() * PENTA.length)];
    var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f;
    var g = ctx.createGain(); g.gain.value = 0;
    o.connect(g); g.connect(master);
    g.gain.linearRampToValueAtTime(0.18, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.28);
    o.start(t); o.stop(t + 0.3);
  }
  function cueThock() {
    var t = now();
    var s = noiseSource();
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 700;
    var ng = ctx.createGain(); ng.gain.value = 0;
    s.connect(f); f.connect(ng); ng.connect(master);
    ng.gain.linearRampToValueAtTime(0.26, t + 0.003);
    ng.gain.exponentialRampToValueAtTime(0.0008, t + 0.11);
    s.start(t); s.stop(t + 0.12);
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(70, t + 0.09);
    var og = ctx.createGain(); og.gain.value = 0;
    o.connect(og); og.connect(master);
    og.gain.linearRampToValueAtTime(0.2, t + 0.004);
    og.gain.exponentialRampToValueAtTime(0.0008, t + 0.14);
    o.start(t); o.stop(t + 0.15);
  }
  function cueFanfare() {
    var t = now(), notes = [523.25, 659.25, 783.99];   // C E G, warm major triad, arpeggiated
    notes.forEach(function (f, i) {
      var start = t + i * 0.14;
      var o1 = ctx.createOscillator(); o1.type = 'triangle'; o1.frequency.value = f;
      var o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = f * 2;
      var g = ctx.createGain(); g.gain.value = 0;
      o1.connect(g); o2.connect(g); g.connect(master);
      g.gain.linearRampToValueAtTime(0.15, start + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0008, start + 0.9);
      o1.start(start); o2.start(start); o1.stop(start + 0.95); o2.stop(start + 0.95);
    });
  }
  function cueDrawer() {
    var t = now();
    var s = noiseSource();
    var f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.2;
    f.frequency.setValueAtTime(2500, t);
    f.frequency.exponentialRampToValueAtTime(700, t + 0.22);
    var g = ctx.createGain(); g.gain.value = 0;
    s.connect(f); f.connect(g); g.connect(master);
    g.gain.linearRampToValueAtTime(0.13, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 0.24);
    s.start(t); s.stop(t + 0.26);
  }
  var CUES = { freeze: cueFreeze, place: cuePlace, gain: cueGain, thock: cueThock, fanfare: cueFanfare, drawer: cueDrawer };

  function cue(name) {
    if (!enabled || !ctx) return;         // never throws pre-init — a plain no-op
    var fn = CUES[name]; if (!fn) return;
    try { fn(); } catch (e) { /* cosmetic only — a synthesis glitch must never reach the caller */ }
  }

  // =========================================================================
  // TOGGLE — the ONLY place an AudioContext is created/resumed; app.js only
  // ever calls this from inside a real click handler (a user gesture).
  // =========================================================================
  var MASTER_ON = 0.85;
  function toggle() {
    if (!AC) return false;
    if (!enabled) {
      ensureCtx();
      if (!ctx) return false;
      try { ctx.resume(); } catch (e) { }
      try { master.gain.cancelScheduledValues(now()); master.gain.linearRampToValueAtTime(MASTER_ON, now() + 0.5); } catch (e) { }
      enabled = true; savePref(true);
      if (curSeg) startAmbient(curSeg, curDayK);
    } else {
      enabled = false; savePref(false);
      try { master.gain.cancelScheduledValues(now()); master.gain.linearRampToValueAtTime(0, now() + 0.4); } catch (e) { }
      stopAmbientNodes();
    }
    API.enabled = enabled;
    return enabled;
  }

  var API = { enabled: false, toggle: toggle, cue: cue, ambient: ambient };

  // Optimistic restore, NEVER a forced resume: some browsers grant an origin autoplay
  // after enough past engagement, so a brand-new AudioContext can come up already
  // 'running' (not 'suspended') with no gesture at all. If the user had sound on last
  // visit (localStorage) AND that happens, honor it — otherwise stay muted exactly as
  // documented above; toggle() remains the only path that ever calls ctx.resume().
  try {
    if (loadPref() && AC && !RM.matches) {
      ensureCtx();
      if (ctx && ctx.state === 'running') {
        master.gain.linearRampToValueAtTime(MASTER_ON, now() + 0.5);
        enabled = true; API.enabled = true;
      }
    }
  } catch (e) { /* never let a restore attempt break page load */ }

  window.PRS_SOUND = API;
})();
