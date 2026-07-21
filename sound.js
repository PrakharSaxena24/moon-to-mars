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
 *                          // the confirmed choice to localStorage['prs_sound'].
 *                          // Returns Promise<boolean>; enabling resolves true
 *                          // only once AudioContext.state is actually 'running'.
 *     cue(name),          // one-shot event sound. name is one of:
 *                          //   'freeze'  — soft low bell (a Live/coarse stall)
 *                          //   'place'   — wooden tick (a tray/care commit)
 *                          //   'gain'    — +N pentatonic blip (the rail float)
 *                          //   'thock'   — the hanko stamp knock (report grade)
 *                          //   'fanfare' — warm 3-note layer (on-time dinner)
 *                          //   'drawer'  — short swish (day-drawer open/close)
 *                          // Never throws, even before toggle() has ever run —
 *                          // a no-op while sound is off / uninitialized.
 *     ambient(seg, dayK, scene) // (re)start/update the looping ambient bed
 *                          // segment: 'load'|'voyage'|'arrival'|'ops'|
 *                          // 'fishday'|'return'|other. Call ambient(null) on
 *                          // run-exit to tear the bed down. dayK is the sim
 *                          // clock-minute (roughly 0-1440). `scene` is an
 *                          // optional physical scene id or profile object.
 *                          // Existing two-argument calls remain valid. Calls
 *                          // with the same scene are cheap: only the wildlife
 *                          // scheduler is refreshed when day/night changes.
 *     scene(scene, dayK, seg) // scene-first alias for renderers that already
 *                          // have a physical scene profile at a transition.
 *     describeCue(name),    // pure metadata: category, duration, and the
 *                          // REQUIRED visible equivalent for every cue.
 *     beat(kindOrFrame),    // play a causal presentation beat ('stall',
 *                          // 'reveal', 'handoff', 'repair', 'recovery',
 *                          // 'risk') or a PRS_STAGE.causalBeatFrame object.
 *     transition(signatureOrFrom, to) // play a restrained route cue from a
 *                          // PRS_STAGE.routeSignature or two scene ids.
 *                          // Both helpers remain no-ops while muted and never
 *                          // create/resume AudioContext outside toggle().
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
  var curSeg = null, curDayK = null, curScene = null; // last request, remembered while muted
  var curBedKey = null, curWildlifeKey = null;

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
  // AMBIENT BED — keyed to the PHYSICAL scene rather than only the itinerary
  // segment. This matters during Arrival/Return, where one segment crosses
  // land, two different ferries, and another island. Sparse wildlife follows
  // both location and the current clock; reduced motion gates transients.
  // =========================================================================
  function lower(v) { return String(v == null ? '' : v).toLowerCase(); }
  function sceneInfo(seg, scene) {
    var id = typeof scene === 'string' ? scene : (scene && scene.id) || '';
    var family = scene && typeof scene === 'object' ? lower(scene.family) : '';
    var s = lower(seg), k = lower(id || s);
    var longShip = family === 'ship' || /ogasawara[-_ ]?maru|ship-outbound|ship-transit|return-ship|homebound|long[-_ ]?haul/.test(k);
    var interShip = /inter[-_ ]?island|interisland|island[-_ ]?ferry/.test(k);
    var island = family === 'island' || /hahajima|hinata|ogasawara|return-island|fishday|(^|[-_ ])ops($|[-_ ])/.test(k);
    var coast = /takeshiba|chichijima|terminal|harbou?r|port|arrival/.test(k);
    var urban = family === 'tokyo' || /tokyo|hotel/.test(k);

    // Backward-compatible inference when an older caller supplies only seg.
    if (!id) {
      if (s === 'voyage') longShip = true;
      else if (s === 'fishday' || s === 'ops') island = true;
      else if (s === 'arrival') coast = true;
      else if (s === 'load') urban = true;
    }
    var kind = interShip ? 'interisland-ship' : longShip ? 'long-ship' :
      island ? 'island' : coast ? 'coast' : urban ? 'urban' : 'coast';
    return { id: id || s || 'coast', family: family, kind: kind };
  }
  function timeBand(dayK) {
    if (dayK == null || !isFinite(dayK)) return 'day';
    var m = ((Number(dayK) % 1440) + 1440) % 1440;
    if (m < 300 || m >= 1140) return 'night';
    if (m < 390) return 'dawn';
    if (m >= 1050) return 'dusk';
    return 'day';
  }
  function wildlifeFor(info, band) {
    if (info.kind === 'island') return band === 'night' || band === 'dusk' ? 'cricket' : 'gull';
    if (info.kind === 'coast') return band === 'day' || band === 'dawn' ? 'gull' : 'none';
    if (info.kind === 'long-ship' || info.kind === 'interisland-ship') return band === 'day' ? 'gull' : 'none';
    return 'none';
  }
  function stopWildlife() {
    ambientTimers.forEach(function (id) { clearTimeout(id); });
    ambientTimers = [];
    curWildlifeKey = null;
  }
  // Keep ambientTimers equal to the set of genuinely pending callbacks.  A
  // fired timeout no longer needs cancellation, so remove its id before
  // invoking the callback that may enqueue the next wildlife sound.
  function wildlifeTimeout(fn, delay) {
    var id = setTimeout(function () {
      var at = ambientTimers.indexOf(id);
      if (at >= 0) ambientTimers.splice(at, 1);
      fn();
    }, delay);
    ambientTimers.push(id);
    return id;
  }
  function stopAmbientNodes() {
    stopWildlife();
    var nodes = curNodes; curNodes = [];
    var bus = ambientG; ambientG = null;
    curBedKey = null;
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
  function scheduleWildlife(kind, bus) {
    stopWildlife();
    curWildlifeKey = kind;
    if (RM.matches || kind === 'none') return;
    function loop() {
      if (ambientG !== bus) return;   // torn down / replaced — stop the chain
      if (kind === 'gull') gullChirp(bus); else cricketTick(bus);
      var next = kind === 'gull' ? (6000 + Math.random() * 9000) : (900 + Math.random() * 1800);
      wildlifeTimeout(loop, next);
    }
    wildlifeTimeout(loop, 2000 + Math.random() * 3000);
  }

  function startAmbient(seg, dayK, scene) {
    if (!ctx || !enabled) return;
    var info = sceneInfo(seg, scene), band = timeBand(dayK);
    var bedKey = info.kind, wildlife = wildlifeFor(info, band);

    // Renderers may safely call ambient() every simulated tick. Keep the
    // steady bed intact unless the physical location changed; only swap the
    // sparse wildlife scheduler when the time band changes.
    if (ambientG && curBedKey === bedKey) {
      if (curWildlifeKey !== wildlife) scheduleWildlife(wildlife, ambientG);
      return;
    }
    stopAmbientNodes();
    var bus = ctx.createGain(); bus.gain.value = 0.0001; bus.connect(master);
    bus.gain.linearRampToValueAtTime(1, now() + 1.2);
    ambientG = bus;
    curBedKey = bedKey;

    // Surf belongs at coasts/islands/ships, not inside the Tokyo hotel.
    if (info.kind !== 'urban') {
      var surf = noiseSource();
      var surfF = ctx.createBiquadFilter(); surfF.type = 'bandpass'; surfF.frequency.value = info.kind.indexOf('ship') >= 0 ? 390 : 480; surfF.Q.value = 0.6;
      var surfG = ctx.createGain(); surfG.gain.value = info.kind.indexOf('ship') >= 0 ? 0.13 : 0.16;
      surf.connect(surfF); surfF.connect(surfG); surfG.connect(bus);
      var swell = ctx.createOscillator(); swell.type = 'sine'; swell.frequency.value = 0.08;
      var swellG = ctx.createGain(); swellG.gain.value = 0.05;
      swell.connect(swellG); swellG.connect(surfG.gain);
      surf.start(); swell.start();
      curNodes.push(surf, swell);
    }

    // wind: lowpass-filtered noise, quieter and slower still
    var wind = noiseSource();
    var windF = ctx.createBiquadFilter(); windF.type = 'lowpass'; windF.frequency.value = 900;
    var windG = ctx.createGain(); windG.gain.value = info.kind === 'urban' ? 0.035 : 0.09;
    wind.connect(windF); windF.connect(windG); windG.connect(bus);
    wind.start();
    curNodes.push(wind);

    // Any ferry scene gets machinery. The long-haul Ogasawara-maru and the
    // smaller inter-island ferry deliberately have different fundamentals.
    if (info.kind === 'long-ship' || info.kind === 'interisland-ship') {
      var baseHz = info.kind === 'long-ship' ? 54 : 68;
      var hum1 = ctx.createOscillator(); hum1.type = 'sawtooth'; hum1.frequency.value = baseHz;
      var hum2 = ctx.createOscillator(); hum2.type = 'sawtooth'; hum2.frequency.value = baseHz + 0.6;
      var humF = ctx.createBiquadFilter(); humF.type = 'lowpass'; humF.frequency.value = 220;
      var humG = ctx.createGain(); humG.gain.value = 0.07;
      hum1.connect(humF); hum2.connect(humF); humF.connect(humG); humG.connect(bus);
      hum1.start(); hum2.start();
      curNodes.push(hum1, hum2);
    }

    scheduleWildlife(wildlife, bus);
  }

  function ambient(seg, dayK, scene) {
    if (!seg) { curSeg = null; curDayK = null; curScene = null; stopAmbientNodes(); return; }
    curSeg = seg; curDayK = dayK; curScene = scene || null;
    if (!enabled || !ctx) return;   // remembered; the bed starts the moment sound is turned on
    startAmbient(seg, dayK, scene);
  }

  function sceneAmbient(scene, dayK, seg) {
    ambient(seg || curSeg || 'scene', dayK == null ? curDayK : dayK, scene);
  }

  // =========================================================================
  // ONE-SHOT CUES — every one gentle (well under the master ceiling), short,
  // and self-cleaning (oscillators are scheduled to .stop() themselves).
  // =========================================================================
  var PENTA = [523.25, 587.33, 659.25, 783.99, 880.00];   // C D E G A — bright pentatonic blip set

  // Every audio cue declares the visual/state cue that must already be on
  // screen.  The metadata is available while sound is muted or unsupported;
  // sound is therefore always an optional reinforcement, never information.
  var CUE_META = {
    freeze:   { category: 'causal', durationMs: 1150, visualEquivalent: 'named actor stops; station turns red; missing handoff is visible' },
    place:    { category: 'commit', durationMs: 100,  visualEquivalent: 'token visibly seats on its authored target' },
    gain:     { category: 'feedback', durationMs: 300, visualEquivalent: 'visible +N float and updated mastery rail' },
    thock:    { category: 'report', durationMs: 620, visualEquivalent: 'visible hanko grade lands on the report stage' },
    fanfare:  { category: 'outcome', durationMs: 1230, visualEquivalent: 'dinner outcome and settled downstream stations are visible' },
    drawer:   { category: 'navigation', durationMs: 260, visualEquivalent: 'drawer visibly opens or closes and exposes its state' },
    focus:    { category: 'causal', durationMs: 520, visualEquivalent: 'named actor receives a high-contrast focus ring' },
    reveal:   { category: 'causal', durationMs: 620, visualEquivalent: 'missing information, item, or authority appears as text and symbol' },
    handoff:  { category: 'causal', durationMs: 520, visualEquivalent: 'labelled token and route visibly connect sender to recipient' },
    recover:  { category: 'causal', durationMs: 760, visualEquivalent: 'recipient reaction and settled downstream state are visible' },
    risk:     { category: 'causal', durationMs: 720, visualEquivalent: 'remaining downstream risk stays visibly marked in amber' },
    depart:   { category: 'route', durationMs: 850, visualEquivalent: 'framed route title, departure arrow, and location change are visible' },
    arrive:   { category: 'route', durationMs: 850, visualEquivalent: 'framed route title, arrival marker, and location change are visible' },
    transfer: { category: 'route', durationMs: 720, visualEquivalent: 'both locations and the transfer direction are visibly named' },
    exchange: { category: 'relationship', durationMs: 760, visualEquivalent: 'departing and arriving guests are visibly named with a custody arrow' }
  };
  function describeCue(name) {
    var m = CUE_META[name];
    return m ? { name: name, category: m.category, durationMs: m.durationMs,
      visualEquivalent: m.visualEquivalent, soundOptional: true } : null;
  }

  // Small deterministic tone primitive used by Phase-4 cues.  It schedules
  // and self-cleans exactly like the legacy cue functions; no timer or sim
  // state is retained.
  function cueTone(freq, delay, dur, gain, type, endFreq) {
    var t = now() + (delay || 0), o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
    if (endFreq && endFreq > 0) o.frequency.exponentialRampToValueAtTime(endFreq, t + dur);
    g.gain.value = 0; o.connect(g); g.connect(master);
    g.gain.linearRampToValueAtTime(gain, t + Math.min(0.018, dur * 0.18));
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

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

  // Causal sequence: focus is grounded and singular; reveal opens upward;
  // handoff travels; recover resolves.  These reinforce the stage contract but
  // are deliberately intelligible only in combination with its visible cue.
  function cueFocus() {
    cueTone(196, 0, 0.46, 0.11, 'sine', 220);
    cueTone(392, 0.035, 0.34, 0.045, 'sine', 440);
  }
  function cueReveal() {
    cueTone(392, 0, 0.42, 0.085, 'triangle', 523.25);
    cueTone(659.25, 0.18, 0.38, 0.065, 'sine', 783.99);
  }
  function cueHandoff() {
    cueTone(440, 0, 0.28, 0.075, 'sine', 587.33);
    cueTone(659.25, 0.22, 0.28, 0.07, 'triangle', 783.99);
  }
  function cueRecover() {
    cueTone(392, 0, 0.58, 0.08, 'triangle', 523.25);
    cueTone(523.25, 0.16, 0.56, 0.075, 'sine', 783.99);
  }
  function cueRisk() {
    cueTone(174.61, 0, 0.54, 0.085, 'sine', 164.81);
    cueTone(174.61, 0.24, 0.46, 0.065, 'triangle', 155.56);
  }
  function cueDepart() {
    cueTone(130.81, 0, 0.78, 0.075, 'sine', 196);
    cueTone(261.63, 0.20, 0.62, 0.055, 'triangle', 392);
  }
  function cueArrive() {
    cueTone(392, 0, 0.66, 0.065, 'triangle', 261.63);
    cueTone(196, 0.20, 0.62, 0.075, 'sine', 130.81);
  }
  function cueTransfer() {
    cueTone(329.63, 0, 0.23, 0.075, 'triangle', 392);
    cueTone(392, 0.20, 0.23, 0.07, 'triangle', 493.88);
    cueTone(493.88, 0.40, 0.29, 0.065, 'sine', 523.25);
  }
  function cueExchange() {
    cueTone(293.66, 0, 0.54, 0.065, 'triangle', 392);
    cueTone(493.88, 0.12, 0.58, 0.065, 'triangle', 369.99);
  }
  var CUES = { freeze: cueFreeze, place: cuePlace, gain: cueGain, thock: cueThock,
    fanfare: cueFanfare, drawer: cueDrawer, focus: cueFocus, reveal: cueReveal,
    handoff: cueHandoff, recover: cueRecover, risk: cueRisk, depart: cueDepart,
    arrive: cueArrive, transfer: cueTransfer, exchange: cueExchange };

  function cue(name) {
    var meta = describeCue(name);
    if (!meta) return null;
    if (!enabled || !ctx) return meta;    // muted: no sound, same visual-equivalent contract
    var fn = CUES[name]; if (!fn) return meta;
    try { fn(); } catch (e) { /* cosmetic only — a synthesis glitch must never reach the caller */ }
    return meta;
  }

  var BEAT_CUES = { stall: 'focus', reveal: 'reveal', handoff: 'handoff',
    repair: 'recover', recovery: 'recover', risk: 'risk' };
  function beat(kindOrFrame) {
    var name = typeof kindOrFrame === 'string' ? BEAT_CUES[kindOrFrame] || kindOrFrame :
      kindOrFrame && (kindOrFrame.audioCue || BEAT_CUES[kindOrFrame.kind]);
    return name ? cue(name) : null;
  }
  function isShipScene(id) { return /ogasawara[-_ ]?maru|inter[-_ ]?island|ship|ferry|vessel/.test(lower(id)); }
  function transitionCue(from, to) {
    var f = lower(typeof from === 'string' ? from : from && (from.id || from.fromId));
    var t = lower(typeof to === 'string' ? to : to && (to.id || to.toId));
    if (!f || !t) return null;
    if (isShipScene(t) && !isShipScene(f)) return 'depart';
    if (isShipScene(f) && !isShipScene(t)) return 'arrive';
    if (/chichijima|transfer/.test(f + ' ' + t)) return 'transfer';
    return 'depart';
  }
  function transition(signatureOrFrom, to) {
    var name = signatureOrFrom && typeof signatureOrFrom === 'object' && signatureOrFrom.audioCue;
    if (!name) name = transitionCue(signatureOrFrom, to);
    return name ? cue(name) : null;
  }

  // =========================================================================
  // TOGGLE — the ONLY place an AudioContext is created/resumed; app.js only
  // ever calls this from inside a real click handler (a user gesture).
  // =========================================================================
  var MASTER_ON = 0.85;
  var desiredEnabled = false;
  var toggleGeneration = 0;

  function muteMaster(immediate) {
    if (!ctx || !master) return;
    try {
      master.gain.cancelScheduledValues(now());
      if (immediate) {
        if (master.gain.setValueAtTime) master.gain.setValueAtTime(0, now());
        else master.gain.value = 0;
      } else {
        master.gain.linearRampToValueAtTime(0, now() + 0.4);
      }
    } catch (e) {
      // A cosmetic ramp failure must still leave the authoritative gain muted.
      try { master.gain.value = 0; } catch (ignore) { }
    }
  }

  function confirmDisabled(immediate) {
    enabled = false;
    API.enabled = false;
    savePref(false);
    muteMaster(immediate);
    stopAmbientNodes();
  }

  function toggle() {
    var target = !desiredEnabled;
    var generation = ++toggleGeneration;
    desiredEnabled = target;

    if (!target) {
      confirmDisabled(false);
      return Promise.resolve(false);
    }

    // Sound remains authoritatively off, muted, and persisted off until the
    // browser confirms that its AudioContext is running. This also clears a
    // stale remembered preference after an autoplay/resume failure.
    confirmDisabled(true);
    if (!AC) {
      desiredEnabled = false;
      return Promise.resolve(false);
    }
    ensureCtx();
    if (!ctx) {
      desiredEnabled = false;
      return Promise.resolve(false);
    }

    var resumeResult;
    try {
      resumeResult = ctx.resume();
    } catch (e) {
      desiredEnabled = false;
      confirmDisabled(true);
      return Promise.resolve(false);
    }

    // Promise.resolve also handles older implementations whose resume()
    // returns undefined. The final catch makes toggle() a never-reject API,
    // even when callers intentionally fire-and-forget it from a click handler.
    return Promise.resolve(resumeResult).then(function () {
      if (generation !== toggleGeneration || !desiredEnabled) return enabled;
      if (!ctx || ctx.state !== 'running') {
        desiredEnabled = false;
        confirmDisabled(true);
        return false;
      }
      enabled = true;
      API.enabled = true;
      savePref(true);
      try {
        master.gain.cancelScheduledValues(now());
        master.gain.linearRampToValueAtTime(MASTER_ON, now() + 0.5);
      } catch (e) { }
      if (curSeg) startAmbient(curSeg, curDayK, curScene);
      return true;
    }).catch(function () {
      if (generation === toggleGeneration) {
        desiredEnabled = false;
        confirmDisabled(true);
        return false;
      }
      return enabled;
    });
  }

  var API = { enabled: false, toggle: toggle, cue: cue, ambient: ambient, scene: sceneAmbient };
  // Additive Phase-4 surface; the pinned legacy members above remain byte-for-
  // byte compatible for existing callers and regression injection points.
  API.describeCue = describeCue;
  API.beat = beat;
  API.transition = transition;

  // Live preference changes also update the transient scheduler. The steady
  // bed remains stable; switching to reduce stops chirps immediately.
  function reducedMotionChanged() {
    if (!ambientG || !curSeg) return;
    if (RM.matches) stopWildlife();
    else {
      var info = sceneInfo(curSeg, curScene);
      scheduleWildlife(wildlifeFor(info, timeBand(curDayK)), ambientG);
    }
  }
  if (RM.addEventListener) RM.addEventListener('change', reducedMotionChanged);
  else if (RM.addListener) RM.addListener(reducedMotionChanged);

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
        enabled = true; desiredEnabled = true; API.enabled = true;
      }
    }
  } catch (e) { /* never let a restore attempt break page load */ }

  window.PRS_SOUND = API;
})();
