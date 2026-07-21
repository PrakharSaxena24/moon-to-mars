#!/usr/bin/env node
'use strict';

// Focused, dependency-free audiovisual regression checks.  The small test
// hooks below are injected only into source strings evaluated in isolated VM
// contexts; production globals and source files are never modified.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = __dirname;

function readSource(name) {
  return fs.readFileSync(path.join(ROOT, name), 'utf8');
}

function sourceBetween(source, startNeedle, endNeedle, file) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, (file || 'source') + ': missing regression source boundary');
  return source.slice(start, end).trim();
}

function injectBefore(source, needle, hook, file) {
  assert.ok(source.indexOf(needle) >= 0, file + ': test injection point is missing');
  return source.replace(needle, hook + needle);
}

function cssRule(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(escaped + '\\s*\\{([^}]*)\\}'));
  assert.ok(match, 'style.css: missing rule for ' + selector);
  return match[1].replace(/\s+/g, ' ');
}

function assertDecl(rule, declaration, message) {
  assert.ok(new RegExp(declaration).test(rule), message + ' (rule: ' + rule.trim() + ')');
}

function wildlifeTimerRegression() {
  const apiNeedle =
    '  var API = { enabled: false, toggle: toggle, cue: cue, ambient: ambient, scene: sceneAmbient };';
  const testHook = [
    '  window.__PRS_SOUND_REGRESSION__ = {',
    "    start: function () { var bus = {}; ambientG = bus; scheduleWildlife('cricket', bus); },",
    '    pending: function () { return ambientTimers.length; },',
    '    stop: stopWildlife',
    '  };',
    ''
  ].join('\n');
  const source = injectBefore(readSource('sound.js'), apiNeedle, testHook, 'sound.js');

  let nextId = 1;
  const timers = [];
  function fakeSetTimeout(callback, delay) {
    const timer = { id: nextId++, callback: callback, delay: delay, active: true };
    timers.push(timer);
    return timer.id;
  }
  function fakeClearTimeout(id) {
    const timer = timers.find(function (item) { return item.id === id; });
    if (timer) timer.active = false;
  }
  function runNextTimer() {
    const timer = timers.find(function (item) { return item.active; });
    assert.ok(timer, 'sound.js: expected one pending wildlife timer');
    timer.active = false;
    timer.callback();
  }
  function activeTimerCount() {
    return timers.filter(function (item) { return item.active; }).length;
  }

  const deterministicMath = Object.create(Math);
  deterministicMath.random = function () { return 0; };
  const window = {
    matchMedia: function () {
      return { matches: false, addEventListener: function () {} };
    }
  };
  const sandbox = {
    window: window,
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {}
    },
    Math: deterministicMath,
    Promise: Promise,
    Float32Array: Float32Array,
    setTimeout: fakeSetTimeout,
    clearTimeout: fakeClearTimeout
  };
  vm.runInNewContext(source, sandbox, { filename: 'sound.js' });

  const probe = window.__PRS_SOUND_REGRESSION__;
  assert.ok(probe, 'sound.js: regression hook was not installed');
  probe.start();
  assert.strictEqual(probe.pending(), 1, 'sound.js: scheduler should begin with one pending timeout id');
  assert.strictEqual(activeTimerCount(), 1, 'sound.js: scheduler should begin with one active timeout');

  for (let callbackNo = 1; callbackNo <= 100; callbackNo++) {
    runNextTimer();
    assert.strictEqual(
      probe.pending(),
      1,
      'sound.js: pending timeout ids grew after wildlife callback ' + callbackNo
    );
    assert.strictEqual(
      activeTimerCount(),
      1,
      'sound.js: active timeout count drifted after wildlife callback ' + callbackNo
    );
  }

  probe.stop();
  assert.strictEqual(probe.pending(), 0, 'sound.js: stopWildlife should clear the pending-id registry');
  assert.strictEqual(activeTimerCount(), 0, 'sound.js: stopWildlife should cancel the pending callback');
  console.log('✓ wildlife timeout ids stay bounded through 100 callbacks and clear on stop');
}

function returnLabelRegression() {
  const exportNeedle = '  window.PRS_STAGE = {';
  const testHook = [
    '  window.__PRS_STAGE_REGRESSION__ = {',
    '    drawLabel: function (ctx, view, profile) {',
    "      _lang = 'en'; _scene = profile; scale = 1; drawSceneLabel(ctx, view);",
    '    }',
    '  };',
    ''
  ].join('\n');
  const source = injectBefore(readSource('stage.js'), exportNeedle, testHook, 'stage.js');
  const window = {};
  vm.runInNewContext(source, { window: window, Math: Math }, { filename: 'stage.js' });

  const fillTextCalls = [];
  const ctx = {
    save: function () {},
    restore: function () {},
    beginPath: function () {},
    moveTo: function () {},
    arcTo: function () {},
    closePath: function () {},
    fill: function () {},
    stroke: function () {},
    measureText: function () { return { width: 360 }; },
    fillText: function () {
      fillTextCalls.push(Array.prototype.slice.call(arguments));
    }
  };
  const label = 'INTER-ISLAND VESSEL · NAME/TIMES UNCONFIRMED · RETURN (INFERRED)';
  const profile = { en: label, jp: '島間船・帰路（推定）', routeDirection: 'return' };
  const probe = window.__PRS_STAGE_REGRESSION__;
  assert.ok(probe, 'stage.js: regression hook was not installed');
  probe.drawLabel(ctx, { w: 296 }, profile);

  assert.strictEqual(fillTextCalls.length, 1, 'stage.js: scene label should make one fillText call');
  const call = fillTextCalls[0];
  assert.strictEqual(call[0], label, 'stage.js: regression probe rendered the wrong scene label');
  assert.strictEqual(call.length, 4, 'stage.js: inferred-return English label must pass a maxWidth');
  assert.ok(Number.isFinite(call[3]), 'stage.js: scene-label maxWidth must be finite');
  assert.ok(
    call[3] <= 264,
    'stage.js: inferred-return English label maxWidth ' + call[3] + ' exceeds 264px on a 296px stage'
  );
  console.log('✓ 296px inferred-return English label passes maxWidth ' + call[3] + 'px (≤264px)');
}

function stageVisualEquivalentRegression() {
  const window = {};
  vm.runInNewContext(readSource('stage.js'), { window: window, Math: Math }, { filename: 'stage.js' });
  const stage = window.PRS_STAGE;
  assert.ok(stage, 'stage.js: PRS_STAGE was not exported');
  assert.strictEqual(typeof stage.causalBeatFrame, 'function', 'stage.js: causal-beat contract must be exported');
  assert.strictEqual(typeof stage.routeSignature, 'function', 'stage.js: route-signature contract must be exported');
  assert.strictEqual(typeof stage.routeTransitionFrame, 'function', 'stage.js: route-frame contract must be exported');

  const beatSpec = {
    id: 'qa-handoff',
    kind: 'handoff',
    atMs: 1000,
    durationMs: 1600,
    actorPid: 'p01',
    recipientPid: 'p04',
    itemLabel: { en: 'Departure list', jp: '出航リスト' }
  };
  const beatBefore = JSON.stringify(beatSpec);
  const movingBeat = stage.causalBeatFrame(beatSpec, 1800, { reducedMotion: false });
  const staticBeat = stage.causalBeatFrame(beatSpec, 1800, { reducedMotion: true });
  assert.strictEqual(JSON.stringify(beatSpec), beatBefore, 'stage.js: causal presentation must not mutate caller data');
  assert.ok(movingBeat.active && staticBeat.active, 'stage.js: equivalent moving/static beats must share active timing');
  assert.ok(movingBeat.durationMs >= 1000 && movingBeat.durationMs <= 2000, 'stage.js: causal beat must stay in the 1–2 second presentation window');
  assert.strictEqual(movingBeat.controlBlocking, false, 'stage.js: causal presentation must not become a reflex gate');
  assert.strictEqual(staticBeat.phase, 'static', 'stage.js: reduced motion must resolve to a held static frame');
  assert.strictEqual(staticBeat.travelProgress, null, 'stage.js: reduced motion must not animate a travelling token');
  assert.deepStrictEqual(staticBeat.itemLabel, movingBeat.itemLabel, 'stage.js: reduced motion must preserve the named cause');
  assert.strictEqual(staticBeat.audioCue, movingBeat.audioCue, 'stage.js: reduced motion must preserve the cue meaning');
  assert.ok(staticBeat.visualEquivalent && staticBeat.visualEquivalent.required === true,
    'stage.js: causal beat must declare a required visual equivalent');
  ['focus', 'cause', 'route', 'outcome'].forEach(function (key) {
    assert.ok(typeof staticBeat.visualEquivalent[key] === 'string' && staticBeat.visualEquivalent[key].length > 0,
      'stage.js: causal visual equivalent must name its ' + key + ' surface');
  });

  const signature = stage.routeSignature('takeshiba-terminal', 'ogasawara-maru', {
    atMs: 500,
    durationMs: 1300
  });
  assert.ok(signature && signature.visualEquivalent && signature.visualEquivalent.required === true,
    'stage.js: route transition must declare a required visual equivalent');
  assert.ok(signature.visualEquivalent.en.indexOf('→') >= 0 && signature.visualEquivalent.jp.indexOf('→') >= 0,
    'stage.js: route equivalent must visibly name direction in both languages');
  const movingRoute = stage.routeTransitionFrame(signature, 1000, { reducedMotion: false });
  const staticRoute = stage.routeTransitionFrame(signature, 1000, { reducedMotion: true });
  assert.strictEqual(staticRoute.phase, 'static', 'stage.js: reduced-motion route must be a static transition');
  assert.strictEqual(staticRoute.pullback, 1, 'stage.js: reduced-motion route must not zoom');
  assert.strictEqual(staticRoute.crossfade, 1, 'stage.js: reduced-motion route must show a settled state');
  assert.deepStrictEqual(staticRoute.visualEquivalent, movingRoute.visualEquivalent,
    'stage.js: route facts must be identical with and without motion');

  const identity = stage.priorityGuestIdentity({ id: 'gd_watanabe', name: { en: 'Watanabe', jp: '渡邊' } }, 0);
  assert.ok(identity && identity.color && identity.shape && identity.name,
    'stage.js: priority guests must have colour, shape, and visible-name identity channels');
  assert.ok(/marker.*visible name/.test(identity.visualEquivalent),
    'stage.js: guest identity must explicitly remain legible without colour');
  console.log('✓ stage causal/route/identity cues keep visual equivalents under reduced motion');
}

function mutedSoundNoOpRegression() {
  let audioContexts = 0;
  let scheduledTimers = 0;
  let preferenceWrites = 0;
  function FakeAudioContext() { audioContexts++; this.state = 'suspended'; }
  const window = {
    AudioContext: FakeAudioContext,
    matchMedia: function () {
      return { matches: false, addEventListener: function () {} };
    }
  };
  const sandbox = {
    window: window,
    localStorage: {
      getItem: function () { return null; },
      setItem: function () { preferenceWrites++; }
    },
    Math: Math,
    Promise: Promise,
    Float32Array: Float32Array,
    setTimeout: function () { scheduledTimers++; return scheduledTimers; },
    clearTimeout: function () {}
  };
  vm.runInNewContext(readSource('sound.js'), sandbox, { filename: 'sound.js' });
  const sound = window.PRS_SOUND;
  assert.ok(sound && sound.enabled === false, 'sound.js: sound must begin muted without a saved opt-in');
  assert.strictEqual(audioContexts, 0, 'sound.js: module load must not create an AudioContext');

  ['freeze', 'reveal', 'handoff', 'recover', 'risk', 'depart', 'arrive', 'transfer', 'exchange'].forEach(function (name) {
    const described = sound.describeCue(name);
    const returned = sound.cue(name);
    assert.ok(described && described.soundOptional === true,
      'sound.js: ' + name + ' must declare sound as optional');
    assert.ok(typeof described.visualEquivalent === 'string' && described.visualEquivalent.length > 12,
      'sound.js: ' + name + ' must name a visible/state equivalent');
    assert.deepStrictEqual(returned, described,
      'sound.js: muted ' + name + ' must return the same semantic metadata');
  });
  assert.ok(sound.beat({ kind: 'reveal', audioCue: 'reveal' }).visualEquivalent,
    'sound.js: muted beat adapter must preserve visible-equivalent metadata');
  assert.ok(sound.transition({ audioCue: 'depart' }).visualEquivalent,
    'sound.js: muted transition adapter must preserve visible-equivalent metadata');
  assert.strictEqual(sound.cue('unknown-cue'), null, 'sound.js: unknown cues must fail closed');
  assert.strictEqual(audioContexts, 0, 'sound.js: muted cue/beat/transition calls must not create an AudioContext');
  assert.strictEqual(scheduledTimers, 0, 'sound.js: muted cue/beat/transition calls must not schedule work');
  assert.strictEqual(preferenceWrites, 0, 'sound.js: muted cue calls must not change the saved preference');
  assert.strictEqual(sound.enabled, false, 'sound.js: muted cue calls must not enable sound');
  console.log('✓ muted sound is a no-op while every cue retains visible-equivalent metadata');
}

function appPresentationBridgeRegression() {
  const app = readSource('app.js');
  const css = readSource('style.css');

  // Execute the exact edge adapter with small presentation fakes. Replaying an
  // edge must not replay sound, and the view history must remain bounded.
  const helperSource = sourceBetween(app, 'function presentationNow()', 'function presentRouteTransition(', 'app.js');
  const status = {
    attrs: {}, textContent: '',
    getAttribute: function (key) { return this.attrs[key] || null; },
    setAttribute: function (key, value) { this.attrs[key] = String(value); }
  };
  let beatCalls = 0;
  const fakeStage = {
    causalBeatFrame: function (raw, atMs, opts) {
      return { id: raw.id, kind: raw.kind, atMs: atMs, reducedMotion: opts.reducedMotion,
        visualEquivalent: { required: true } };
    }
  };
  const fakeSound = { beat: function () { beatCalls++; } };
  const context = {
    window: {
      performance: { now: function () { return 1200; } },
      PRS_STAGE: fakeStage,
      PRS_SOUND: fakeSound
    },
    PRS_STAGE: fakeStage,
    PRS_SOUND: fakeSound,
    performance: { now: function () { return 1200; } },
    Date: Date,
    Object: Object,
    RM: { matches: false },
    anim: { causalBeats: [], presentationEdges: {} },
    L: 'en',
    byId: function () { return null; },
    nm: function (value) { return typeof value === 'string' ? value : (value && value.en) || ''; },
    $: function (id) { return id === 'stage-presentation-status' ? status : null; }
  };
  vm.runInNewContext(`${helperSource}\nthis.__presentCausalBeat = presentCausalBeat;`, context, {
    filename: 'app.js#presentation-edge-bridge'
  });
  const first = context.__presentCausalBeat({ edgeId: 'stall:p01', kind: 'stall', announcement: 'Andrew stopped.' });
  const replay = context.__presentCausalBeat({ edgeId: 'stall:p01', kind: 'stall', announcement: 'Andrew stopped.' });
  assert.ok(first && first.id === 'stall:p01', 'app.js: a real state edge must create one causal presentation beat');
  assert.strictEqual(replay, null, 'app.js: replaying the same edge id must be a presentation no-op');
  assert.strictEqual(beatCalls, 1, 'app.js: one causal edge must emit sound at most once');
  assert.strictEqual(status.textContent, 'Andrew stopped.', 'app.js: the same edge must have a named visible/AT message');
  ['reveal:p02', 'handoff:p03', 'repair:p04', 'recovery:p05'].forEach(function (edgeId) {
    context.__presentCausalBeat({ edgeId: edgeId, kind: 'handoff', announcement: edgeId });
  });
  assert.strictEqual(context.anim.causalBeats.length, 3, 'app.js: causal presentation history must stay bounded to three beats');

  const frameSource = sourceBetween(app, 'function frame(ts)', 'function updateCascade(ts)', 'app.js');
  assert.ok(frameSource.indexOf('causalBeats: anim.causalBeats') >= 0 &&
    frameSource.indexOf('relationships: anim.relationships') >= 0 &&
    frameSource.indexOf('routeTransition: anim.routeTransition') >= 0,
  'app.js: the real canvas frame must receive causal, relationship, and route presentation state');
  assert.ok(!/PRS_SOUND\.(?:beat|transition)\s*\(/.test(frameSource),
    'app.js: sound must never be emitted from the requestAnimationFrame loop');
  assert.strictEqual((app.match(/PRS_SOUND\.beat\s*\(/g) || []).length, 1,
    'app.js: structured causal sound must have one edge-owned call site');
  assert.strictEqual((app.match(/PRS_SOUND\.transition\s*\(/g) || []).length, 1,
    'app.js: structured route sound must have one edge-owned call site');

  const renderSource = sourceBetween(app, 'function renderSim(s)', '// \u00a721.4 offscreen a11y roster', 'app.js');
  assert.ok(/if \(sceneChanged\) \{[\s\S]*presentRouteTransition\(/.test(renderSource),
    'app.js: route presentation must be driven by a physical scene-change edge');
  assert.ok(renderSource.indexOf('participantPresentationSpec(s, p, priorState)') >= 0 &&
    renderSource.indexOf('if (participantBeat) presentCausalBeat(participantBeat)') >= 0,
  'app.js: simulator participant-state edges must feed the causal bridge');
  assert.ok(renderSource.indexOf('scheduleMotes(s, !!participantBeat)') >= 0,
    'app.js: one simulator tick must not announce both a state edge and its duplicate mote edge');
  assert.ok(renderSource.indexOf('updateStageRelationships(s)') >= 0,
    'app.js: every rendered simulator state must refresh the relationship view');
  assert.ok(app.indexOf("presentMoteHandoff(m, s, 'handoff')") >= 0 &&
    app.indexOf("presentMoteHandoff(repairedMote, sim, 'repair'") >= 0,
  'app.js: normal handoffs and player repairs must both enter the causal bridge');

  const tripDaySource = sourceBetween(app, 'function relationshipTripDay(s, explicitDay)', 'function stageRelationshipsFor(', 'app.js');
  const dayContext = { isFinite: isFinite, Math: Math };
  vm.runInNewContext(`${tripDaySource}\nthis.__relationshipTripDay = relationshipTripDay;`, dayContext, {
    filename: 'app.js#relationship-trip-day'
  });
  assert.strictEqual(dayContext.__relationshipTripDay({ segment: 'load' }), 0,
    'app.js: boarding relationships must use the authored outbound cohort');
  assert.strictEqual(dayContext.__relationshipTripDay({ segment: 'fishday' }), 3,
    'app.js: fishing-day relationships must use the authored active cohort');
  assert.strictEqual(dayContext.__relationshipTripDay({ segment: 'return' }), 10,
    'app.js: return relationships must use the authored return cohort');
  assert.strictEqual(dayContext.__relationshipTripDay({ segment: 'ops' }), null,
    'app.js: a broad operations segment must never invent a Day-6 exchange');
  assert.strictEqual(dayContext.__relationshipTripDay({ segment: 'ops' }, 6), 6,
    'app.js: an explicitly attested Day-6 relationship view must remain available');

  const visibleMirror = cssRule(css, '.stage-presentation-status,.stage-relationships');
  assertDecl(visibleMirror, 'position\s*:\s*absolute',
    'style.css: DOM fallback must visibly present the same causal/relationship facts');
  const canvasMirror = cssRule(css, 'body.canvas-stage .stage-presentation-status,body.canvas-stage .stage-relationships');
  assertDecl(canvasMirror, 'width\s*:\s*1px',
    'style.css: canvas mode may visually hide, but must retain, its assistive mirror');
  assert.ok(!/display\s*:\s*none/.test(canvasMirror),
    'style.css: canvas-mode assistive mirrors must remain in the accessibility tree');
  console.log('✓ app bridges state/route/handoff edges once into bounded visual, AT, and optional sound cues');
}

function immersiveViewportSourceRegression() {
  const css = readSource('style.css');
  const html = readSource('index.html');
  const app = readSource('app.js');
  assert.ok(/<meta\s+name="viewport"\s+content="width=device-width,\s*initial-scale=1">/.test(html),
    'index.html: responsive viewport contract is missing');

  const rootRule = cssRule(css, 'html,body');
  assertDecl(rootRule, 'overflow-x\\s*:\\s*hidden', 'style.css: the document must not acquire horizontal page scroll');
  const bodyRule = cssRule(css, 'body.screen-run');
  assertDecl(bodyRule, 'height\\s*:\\s*100dvh', 'style.css: active play must own the dynamic viewport');
  assertDecl(bodyRule, 'min-height\\s*:\\s*0', 'style.css: run body must be shrinkable');
  assertDecl(bodyRule, 'overflow\\s*:\\s*hidden', 'style.css: active play must not create a page scrollbar');

  ['body.screen-run .wrap', 'body.screen-run #run', 'body.screen-run .runwrap',
    'body.screen-run .run-main', 'body.screen-run .sitemap'].forEach(function (selector) {
    assertDecl(cssRule(css, selector), 'min-height\\s*:\\s*0',
      'style.css: viewport height chain must stay shrinkable at ' + selector);
  });
  ['body.screen-run .dashboard', 'body.screen-run .live-dock', 'body.screen-run .run-console'].forEach(function (selector) {
    const rule = cssRule(css, selector);
    assertDecl(rule, 'position\\s*:\\s*absolute', 'style.css: ' + selector + ' must overlay the world');
    assertDecl(rule, 'overflow\\s*:\\s*auto', 'style.css: ' + selector + ' must own its internal scroll');
  });
  assert.ok(/@media\s*\(max-width:760px\)/.test(css),
    'style.css: narrow 390px/320px target viewports need a mobile drawer contract');
  assert.ok(/@media\s*\(max-height:620px\)/.test(css),
    'style.css: short 720px/568px target viewports need compact-height handling');
  assert.ok(/env\(safe-area-inset-(?:top|right|bottom|left)\)/.test(bodyRule),
    'style.css: dynamic viewport shell must honor mobile safe areas');
  assert.ok(!/body\.screen-run[^}]*min-width\s*:\s*(?!0(?:px)?(?:;|\s|}))[1-9][0-9]*px/.test(css),
    'style.css: active-play shell must not force a fixed horizontal page width');
  const dashboardDefault = sourceBetween(app, 'function defaultDashboardOpenForViewport()', 'var dashboardOpen =', 'app.js');
  assert.ok(/matchMedia\('\(max-width:760px\)'\)\.matches/.test(dashboardDefault),
    'app.js: dashboard launch state must follow the same narrow breakpoint as the bottom sheet');
  assert.ok(/setDashboardOpen\(defaultDashboardOpenForViewport\(\), false\)/.test(app),
    'app.js: every authored launch must recompute the viewport-aware dashboard default');
  const ghostRule = cssRule(css, 'body.screen-run .run-console .controls .btn.ghost');
  assertDecl(ghostRule, 'color\\s*:\\s*#f6efdc',
    'style.css: dark run HUD ghost controls need explicit light text');
  assertDecl(ghostRule, 'border-color\\s*:\\s*rgba\\(227,196,107,\\.52\\)',
    'style.css: dark run HUD ghost controls need a visible boundary');
  const ghostFocus = cssRule(css, 'body.screen-run .run-console .controls .btn.ghost:focus-visible');
  assertDecl(ghostFocus, 'outline\\s*:\\s*2px solid #f6efdc',
    'style.css: run HUD ghost controls need a high-contrast keyboard focus ring');
  assert.ok(/@media\(max-width:480px\)\{[\s\S]*?body\.screen-run #rules-open,[\s\S]*?body\.screen-run \.plan-session\{display:none;\}/.test(css),
    'style.css: phone runs must drop setup-only header actions instead of spending a second viewport row');
  console.log('✓ source contracts cover fixed-stage play at 1440×900, 1280×720, 390×844, and 320×568');
}

wildlifeTimerRegression();
returnLabelRegression();
stageVisualEquivalentRegression();
mutedSoundNoOpRegression();
appPresentationBridgeRegression();
immersiveViewportSourceRegression();
console.log('ALL VISUAL REGRESSION CHECKS PASSED ✓');
