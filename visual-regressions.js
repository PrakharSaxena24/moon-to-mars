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

function injectBefore(source, needle, hook, file) {
  assert.ok(source.indexOf(needle) >= 0, file + ': test injection point is missing');
  return source.replace(needle, hook + needle);
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

wildlifeTimerRegression();
returnLabelRegression();
console.log('ALL VISUAL REGRESSION CHECKS PASSED ✓');
