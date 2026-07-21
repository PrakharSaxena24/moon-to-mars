#!/usr/bin/env node
'use strict';

/*
 * Hostile acceptance verifier for The Hikone Morning embodied rebuild.
 *
 * This suite intentionally rejects the superseded card/effort/progress/Next
 * slideshow. The required learning loop is:
 *
 *   notice -> act on the world -> physical consequence -> revise -> succeed
 *
 * The browser controller remains responsible for final visual viewport QA.
 * This file pins deterministic source and pure-model behavior runnable in Node.
 *
 * Required pure seam:
 *   window.HIKONE / module.exports = {
 *     SCENES, ITEMS, freshState(), reduce(state, action), derive(state)
 *   }
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = __dirname;
var checks = 0;
var failures = 0;

function pass(message) {
  checks++;
  console.log('  \u2713 ' + message);
}

function fail(message, detail) {
  checks++;
  failures++;
  console.error('  \u2717 ' + message + (detail ? ' \u2014 ' + detail : ''));
}

function ok(condition, message, detail) {
  if (condition) pass(message);
  else fail(message, detail);
}

function section(name) {
  console.log('\n=== ' + name + ' ===');
}

function read(name) {
  var file = path.join(ROOT, name);
  if (!fs.existsSync(file)) {
    fail(name + ' exists');
    return '';
  }
  pass(name + ' exists');
  return fs.readFileSync(file, 'utf8');
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce(function (out, key) {
      out[key] = stable(value[key]);
      return out;
    }, {});
  }
  return value;
}

function same(a, b) {
  return JSON.stringify(stable(a)) === JSON.stringify(stable(b));
}

function idOf(item) {
  return String(item && (item.id || item.key || item.itemId || item.name) || '');
}

function labelOf(item) {
  var value = item && (item.label || item.name || item.title || item.copy);
  if (value && typeof value === 'object') value = value.en || value.ja || value.jp;
  return String(value || '');
}

function textOf(item) {
  return (idOf(item) + ' ' + labelOf(item)).toLowerCase();
}

function stripEvent(value) {
  var result = clone(value);
  delete result.lastEvent;
  delete result.lastAction;
  delete result.message;
  return result;
}

function modelFrom(source) {
  var moduleBox = { exports: {} };
  var sandbox = {
    module: moduleBox,
    exports: moduleBox.exports,
    console: console,
    window: {},
    globalThis: {},
    setTimeout: function () { return 0; },
    clearTimeout: function () {},
    setInterval: function () { return 0; },
    clearInterval: function () {},
    localStorage: {
      getItem: function () { return null; },
      setItem: function () {},
      removeItem: function () {}
    },
    matchMedia: function () {
      return { matches: true, addEventListener: function () {}, removeEventListener: function () {} };
    }
  };
  sandbox.window.localStorage = sandbox.localStorage;
  sandbox.window.matchMedia = sandbox.matchMedia;
  sandbox.globalThis = sandbox.window;
  vm.runInNewContext(source, sandbox, { filename: 'hikone.js', timeout: 1500 });
  return moduleBox.exports && Object.keys(moduleBox.exports).length ? moduleBox.exports :
    (sandbox.window.HIKONE || sandbox.window.HIKONE_MODEL || null);
}

section('FILES / STANDALONE SHELL');
var html = read('hikone.html');
var css = read('hikone.css');
var js = read('hikone.js');
var combined = html + '\n' + css + '\n' + js;
var htmlAndJs = html + '\n' + js;

if (!html || !css || !js) {
  console.error('\nHIKONE VERIFY BLOCKED: embodied implementation files are incomplete.');
  process.exitCode = 1;
} else {
  ok(/<meta[^>]+name=["']viewport["'][^>]+width=device-width/i.test(html), 'mobile viewport metadata is present');
  ok(/href=["'][^"']*hikone\.css["']/i.test(html), 'standalone Hikone stylesheet is loaded');
  ok(/src=["'][^"']*hikone\.js["']/i.test(html), 'standalone Hikone script is loaded');
  ok(!/(?:src|href)=["']https?:\/\//i.test(html), 'there is no remote runtime dependency');
  ok(!/(?:app|engine|stage|sound)\.js/i.test(html), 'Ogasawara campaign runtime is not booted');
  ok(/<main\b[^>]*id=["']hk-app["']/i.test(html), 'one semantic standalone application owns the page');
  ok(/id=["']hk-world["']/i.test(html), '#hk-world is the primary physical play surface');
  ok(/id=["']hk-scene["']/i.test(html), '#hk-scene is reserved for deterministic interactive objects');

  section('REJECTED SLIDESHOW MUST STAY DELETED');
  ok(!/\bhk-panel\b/i.test(combined), 'old hk-panel architecture is absent');
  ok(!/\bhk-progress(?:-[a-z0-9_-]+)?\b/i.test(combined), 'old hk-progress architecture is absent');
  ok(!/\bhk-card(?:-[a-z0-9_-]+)?\b/i.test(combined), 'old hk-card classes are absent');
  ok(!/\btask-card\b|\bmember-lane\b/i.test(combined), 'task-card/member-lane sorting UI is absent');
  ok(!/\beffort(?:\s+beats?|word|of)?\b/i.test(htmlAndJs), 'player-facing effort values and effort-beat model are absent');
  ok(!/\bBASELINE\b/.test(js), 'old BASELINE workload constant is absent');
  ok(!/\bCARDS\b/.test(js), 'old CARDS data model is absent');
  ok(!/\brenderAssignment\b/.test(js), 'old renderAssignment screen is absent');
  ok(!/\bnextPhase\b|data-action\s*=\s*["']next["']|["']Next["']|>\s*Next\s*</i.test(htmlAndJs), 'Next-style narration controls are absent');
  ok(!/12\s*(?:\/|of|\uFF0F)\s*0|max(?:imum)?\s*(?:lane|queue)?\s*7|7\s+or\s+less/i.test(htmlAndJs), 'old queue totals and pass threshold are absent');

  section('PHYSICAL WORLD / DIRECT MANIPULATION');
  ['yard-tap', 'vending', 'car', 'trunk', 'lake', 'route'].forEach(function (part) {
    ok(new RegExp('hk-' + part, 'i').test(combined), 'world includes physical ' + part.replace('-', ' '));
  });
  ok(/data-(?:card|item|object)/.test(js), 'interactive equipment exposes canonical [data-card] or item/object aliases');
  ok(/data-(?:person|actor)/.test(js) && /(?:cap|towel)/i.test(js), 'Cap and Towel expose canonical [data-person] or actor aliases');
  ok(/data-zone/.test(js), 'physical world targets expose [data-zone] hooks');
  ok(/createElement\s*\(\s*["']button["']\s*\)|<button\b/i.test(htmlAndJs), 'actors, objects, and actions use native buttons');
  ok(/(?:draggable\s*=|setAttribute\s*\(\s*["']draggable|dragstart|pointerdown)/i.test(js), 'objects support pointer/touch direct manipulation');
  ok(/addEventListener\s*\(\s*["'](?:click|pointerup)["']/i.test(js), 'tap/click is a canonical non-drag path');
  ok(/(?:dragover|pointermove)/i.test(js) && /(?:drop|pointerup)/i.test(js), 'direct manipulation has move/drop handling');
  ok(/\.hk-(?:prop|item)[^{]*\{[^}]*min-width\s*:\s*(?:6[4-9]|[7-9]\d)px[^}]*min-height\s*:\s*(?:6[4-9]|[7-9]\d)px/is.test(css), 'core world objects have at least 64px hit areas');
  ok(/\.hk-person\s*,\s*\.hk-actor\s*\{[^}]*(?:min-)?width\s*:\s*(?:6[4-9]|[7-9]\d|\d{3,})px[^}]*(?:min-)?height\s*:\s*(?:6[4-9]|[7-9]\d|\d{3,})px/is.test(css), 'Cap/Towel actor targets are at least 64px');
  ok(/\.hk-zone\s*\{[^}]*min-width\s*:\s*(?:6[4-9]|[7-9]\d)px[^}]*min-height\s*:\s*(?:6[4-9]|[7-9]\d)px/is.test(css), 'physical world zones are at least 64px');
  ok(/\.hk-catch\s*\{[^}]*(?:min-)?width\s*:\s*(?:6[4-9]|[7-9]\d|\d{3,})px[^}]*(?:min-)?height\s*:\s*(?:6[4-9]|[7-9]\d|\d{3,})px/is.test(css), 'caught tanago and suppon have at least 64px hit areas');
  ok(/\.hk-catch\s*\{[^}]*pointer-events\s*:\s*auto/is.test(css) &&
    /\.hk-catch\s*\{[^}]*touch-action\s*:\s*none/is.test(css), 'caught animals remain draggable/tappable above the pointer-disabled scene layer');
  ok(/(?:data-person|data-actor)=["']cap["'][^\n]{0,240}(?:var\(--cap\)|red)|(?:var\(--cap\)|red)[^\n]{0,240}(?:data-person|data-actor)=["']cap["']/i.test(css), 'Cap has a visible red-cap accessory cue');
  ok(/(?:data-person|data-actor)=["']towel["'][^\n]{0,240}(?:var\(--towel\)|blue)|(?:var\(--towel\)|blue)[^\n]{0,240}(?:data-person|data-actor)=["']towel["']/i.test(css), 'Towel has a visible blue towel/scarf cue');
  ok(/data-zone=["']home-tanago["']/.test(css) && /data-zone=["']home-suppon["']/.test(css), 'home payoff reserves two distinct aquarium targets');
  ok(/aria-live\s*=|setAttribute\s*\(\s*["']aria-live/i.test(combined), 'physical consequences have live-region equivalents');
  ok(/:focus-visible/.test(css), 'keyboard focus is visibly styled');

  section('LOCKED PEOPLE / OBJECTS / PURPOSE');
  ['Watanabe', 'Cap', 'Towel', 'Ryokan Izumi', 'Yokkaichi', 'Lake Biwa', 'Hikone'].forEach(function (fact) {
    ok(combined.toLowerCase().indexOf(fact.toLowerCase()) >= 0, 'locked fact is present: ' + fact);
  });
  ['\u6E21\u8FBA', '\u56DB\u65E5\u5E02', '\u7435\u7436\u6E56', '\u5F66\u6839', '\u30BF\u30CA\u30B4', '\u30B9\u30C3\u30DD\u30F3', '\u30DF\u30DF\u30BA', '\u98F2\u307F\u7269'].forEach(function (fact) {
    ok(combined.indexOf(fact) >= 0, 'Japanese fact is present: ' + fact);
  });
  ['rod', 'worm', 'chicken', 'tanago', 'suppon', 'drink'].forEach(function (item) {
    ok(combined.toLowerCase().indexOf(item) >= 0, 'physical preparation is present: ' + item);
  });
  ok(/(?:not|never)\s+(?:for\s+)?food|not\s+food|\u98DF\u7528(?:\u3067\u306F|\u3058\u3083)\u306A\u3044/i.test(combined), 'tanago and suppon are explicitly aquarium animals, not food');
  ok(!/(?:official\s+(?:guide|instruction)|approved\s+handling|veterinary\s+instruction|catch\s+guarantee)/i.test(combined), 'fiction makes no official handling or guaranteed-catch claim');
  ok(!/(?:\b\d+(?:\.\d+)?\s*\u00B0[CF]\b|oxygenation\s+rate|dosage|feed\s+every|water\s+change\s+schedule)/i.test(combined), 'there is no real animal-care procedure');

  section('EMBODIED CAUSAL SURFACE');
  ok(/(?:empty|filled|waterline|filledWithWater|tanagoBox)/i.test(js), 'tanago box has explicit empty/filled physical state');
  var emptyBoxVisual = /data-card=["']tanago-box["']\]\s*::after[^\{]*\{[^}]*content\s*:\s*["']["']/i.test(css);
  var filledBoxVisual = /(?:data-state=["']filled["']|data-filled=["']true["'])[^\{]*::after[^\{]*\{[^}]*content\s*:\s*["'][^"']*\u2248/i.test(css);
  ok(emptyBoxVisual && filledBoxVisual, 'empty and filled tanago-box CSS states render differently');
  ok(/(?:refus|reject|bounce)/i.test(js), 'invalid physical actions expose refusal state');
  ok(/(?:detour|roadside|vending)[^\n]{0,120}drink|drink[^\n]{0,120}(?:detour|roadside|vending)/i.test(js), 'forgotten drinks cause a non-failing roadside detour');
  ok(/(?:bare|worm|chicken)[^\n]{0,120}(?:hook|bait)|(?:hook|bait)[^\n]{0,120}(?:bare|worm|chicken)/i.test(js), 'hook state distinguishes bare, worm, and chicken bait');
  ok(/(?:shallow|shallows)/i.test(js) && /\bdeep\b/i.test(js), 'lake casting distinguishes shallow and deep water');
  ok(/tanago[^\n]{0,140}(?:box|container)|(?:box|container)[^\n]{0,140}tanago/i.test(js), 'tanago can be transferred into the water-filled box');
  ok(/suppon[^\n]{0,160}(?:tank|wrong|refus|reject)|(?:tank|wrong|refus|reject)[^\n]{0,160}suppon/i.test(js), 'suppon has wrong-box refusal and separate-tank resolution');
  ['jetty', 'hook', 'home-tanago', 'home-suppon'].forEach(function (location) {
    ok(new RegExp('data-location=["\\\']' + location + '["\\\']', 'i').test(css), 'object state has a visible physical placement for ' + location.replace('-', ' '));
  });
  ok(/empty-box[^\n]{0,220}(?:data-zone=["']tap|["']tap["'])/i.test(js) &&
    /bare-hook[^\n]{0,220}(?:data-object=["']worms|["']worms["'])/i.test(js) &&
    /wrong-container[^\n]{0,260}(?:data-object=["']suppon-tank|["']suppon-tank["'])/i.test(js), 'canonical refusals point at the next useful physical target');
  ok(/\.has-tanago[^\{]*(?:aquarium-tanago|tanago)[^\{]*\{/i.test(css) &&
    /\.has-suppon[^\{]*(?:aquarium-suppon|suppon)[^\{]*\{/i.test(css), 'home aquarium inhabitants are gated by actual placement state');
  ok(!/Math\.random\s*\(/.test(js), 'playable outcomes contain no randomness');

  section('FULL VIEWPORT / RESTART / LANGUAGE / REDUCED MOTION');
  ok(/html\s*,\s*body[^\{]*\{[^}]*overflow\s*:\s*hidden/is.test(css), 'document-level scrolling is clipped');
  ok(/100vh/.test(css) && /100dvh/.test(css), 'viewport shell has 100vh fallback and 100dvh ownership');
  ok(/\.hk-app[^\{]*\{[^}]*overflow\s*:\s*hidden/is.test(css), 'application shell cannot create a page scrollbar');
  ok(/env\(safe-area-inset-(?:top|right|bottom|left)\)/.test(css), 'safe-area insets are honored');
  ok(/@media\s*\([^)]*(?:max-aspect-ratio|max-width)/i.test(css), 'portrait/mobile world restaging exists');
  ok(/@media\s*\([^)]*max-height/i.test(css), 'short-landscape world restaging exists');
  ok(/id=["']hk-replay["']|#[a-z0-9_-]*replay/i.test(combined), 'restart/replay has a stable control hook');
  ok(/id=["']hk-lang-en["']/i.test(html) && /id=["']hk-lang-ja["']/i.test(html), 'English and Japanese controls are present');
  ok(/document\.documentElement\.lang|setAttribute\s*\(\s*["']lang["']/i.test(js), 'language switching updates document language');
  ok(/prefers-reduced-motion\s*:\s*reduce/.test(css), 'CSS reduced-motion mode exists');
  ok(/matchMedia\s*\([^)]*prefers-reduced-motion/.test(js), 'JavaScript observes reduced-motion preference');
  ok(!/requestAnimationFrame\s*\(/.test(js) || /reduced|motion/i.test(js), 'animation-frame work is reduced-motion aware');

  section('PERSISTENCE ISOLATION');
  ok(/["'][^"']*hikone[^"']*(?:v\d+|\.\d+)[^"']*["']/i.test(js), 'completion uses a dedicated versioned Hikone key');
  ok(!/(?:prs_campaign|campaign_state|campaign_run_state|plan_autosave|authoring)/i.test(js), 'Hikone never reads or writes campaign/authoring state');
  ok(/completedAt/.test(js) && /["']?version["']?\s*[:=]\s*\d+/.test(js), 'completion envelope is versioned and timestamped');
  ok(!/localStorage\.(?:setItem|getItem)[^\n]{0,180}(?:scene|actor|item|hook|tanago|suppon|drink)/i.test(js), 'mid-run physical state is not persisted or resumed');

  section('PURE MODEL / FSM STRUCTURE');
  var model = null;
  var modelError = null;
  try { model = modelFrom(js); }
  catch (error) { modelError = error; }
  ok(!!model, 'hikone.js exposes the pure HIKONE seam', modelError && modelError.message);

  if (model) {
    ok(Array.isArray(model.SCENES), 'SCENES is an exported ordered array');
    ok(Array.isArray(model.ITEMS), 'ITEMS is an exported physical-object array');
    ok(typeof model.freshState === 'function', 'freshState() is exported');
    ok(typeof model.reduce === 'function', 'reduce(state, action) is exported');
    ok(typeof model.derive === 'function', 'derive(state) is exported');

    if (Array.isArray(model.SCENES)) {
      ok(same(Array.prototype.slice.call(model.SCENES), ['arrival', 'packing', 'drive', 'lake', 'home']), 'FSM scenes are exactly arrival -> packing -> drive -> lake -> home');
    }

    if (Array.isArray(model.ITEMS)) {
      ok(model.ITEMS.length === 6, 'model contains exactly six physical preparations');
      [
        [/rod/, 'rods'], [/worm/, 'worms'], [/chicken/, 'chicken bait'],
        [/tanago.*box|box.*tanago/, 'tanago box'], [/suppon.*tank|tank.*suppon/, 'suppon tank'], [/drink/, 'drinks']
      ].forEach(function (entry) {
        var matches = model.ITEMS.filter(function (item) { return entry[0].test(textOf(item)); });
        ok(matches.length === 1, 'ITEMS has one unambiguous ' + entry[1]);
      });
      ok(model.ITEMS.every(function (item) { return item.effort == null && item.load == null && item.cost == null; }), 'physical items expose no effort/load/cost puzzle values');
    }

    if (typeof model.freshState === 'function' && typeof model.reduce === 'function' && typeof model.derive === 'function') {
      var fresh = model.freshState();
      var freshSnapshot = clone(fresh);
      var derivedA = model.derive(fresh);
      var derivedB = model.derive(clone(fresh));
      ok(fresh && fresh.scene === 'arrival', 'fresh state starts in arrival');
      ok(same(derivedA, derivedB), 'derive() is deterministic for equal serializable state');
      ok(same(fresh, freshSnapshot), 'derive() does not mutate caller-owned state');
      ok(same(fresh, JSON.parse(JSON.stringify(fresh))), 'fresh state is JSON serializable');

      var invalidA = model.reduce(fresh, { type: '__QA_UNKNOWN_ACTION__' });
      var invalidB = model.reduce(clone(fresh), { type: '__QA_UNKNOWN_ACTION__' });
      ok(invalidA && invalidA !== fresh, 'reduce() returns a new state for fail-closed actions');
      ok(same(stripEvent(invalidA), stripEvent(fresh)), 'unknown action cannot advance or mutate physical state');
      ok(same(invalidA, invalidB), 'unknown-action refusal is deterministic');
      ok(same(fresh, freshSnapshot), 'reduce() does not mutate caller-owned state');

      section('PURE END-TO-END EMBODIED LOOP');
      var state = model.freshState();
      var pathActions = [];
      var ownedInputs = [];

      function advance(action) {
        var input = state;
        var snapshot = clone(input);
        pathActions.push(clone(action));
        state = model.reduce(input, action);
        ownedInputs.push({ state: input, snapshot: snapshot });
        return state;
      }

      advance({ type: 'START' });
      ok(state.scene === 'packing' && state.lastEvent.code === 'packing-started', 'START physically opens the packing scene');

      var jumpFromPacking = clone(state);
      var jumped = model.reduce(state, { type: 'ARRIVE_LAKE' });
      ok(jumped.lastEvent.type === 'refusal' && jumped.scene === 'packing', 'the FSM refuses a packing-to-lake scene jump');
      ok(same(stripEvent(jumped), stripEvent(jumpFromPacking)), 'an illegal scene jump changes only refusal feedback');

      var watanabeAttempt = model.reduce(state, { type: 'ASSIGN_ITEM', actor: 'watanabe', item: 'rods' });
      ok(watanabeAttempt.lastEvent.type === 'refusal' && watanabeAttempt.lastEvent.code === 'invalid-assignment', 'Watanabe cannot be used as a third assignment lane');
      ok(same(stripEvent(watanabeAttempt), stripEvent(state)), 'a Watanabe assignment cannot move equipment or change work state');

      advance({ type: 'ASSIGN_ITEM', actor: 'cap', item: 'rods' });
      advance({ type: 'ASSIGN_ITEM', actor: 'towel', item: 'worms' });
      ok(state.actors.cap.status === 'working' && state.actors.cap.current === 'rods' &&
        state.actors.towel.status === 'working' && state.actors.towel.current === 'worms', 'Cap and Towel can work concurrently on distinct real objects');
      ok(state.items.rods.location === 'carried' && state.items.rods.owner === 'cap' &&
        state.items.worms.location === 'carried' && state.items.worms.owner === 'towel', 'concurrent assignments visibly transfer object ownership');
      ok(!model.derive(state).canDepart, 'departure stays locked while concurrent actor jobs are active');

      advance({ type: 'COMPLETE_JOB', actor: 'cap' });
      advance({ type: 'COMPLETE_JOB', actor: 'towel' });
      ok(state.items.rods.location === 'trunk' && state.items.worms.location === 'trunk', 'completed actor jobs put rods and worms in the trunk');
      advance({ type: 'ASSIGN_ITEM', actor: 'cap', item: 'chicken' });
      advance({ type: 'COMPLETE_JOB', actor: 'cap' });
      ok(state.items.chicken.location === 'trunk' && state.items.drinks.location === 'vending', 'chicken loads while drinks remain deliberately missable at the vending machine');

      var beforeEmptyBox = clone(state);
      advance({ type: 'MOVE_ITEM', item: 'tanago-box', target: 'trunk' });
      ok(state.lastEvent.type === 'refusal' && state.lastEvent.code === 'empty-box', 'an empty tanago box produces the canonical empty-box refusal');
      ok(state.items['tanago-box'].location === 'yard' && state.items['tanago-box'].water === 'empty', 'empty-box refusal leaves the box physically empty in the yard');
      ok(same(stripEvent(state), stripEvent(beforeEmptyBox)), 'empty-box refusal changes only feedback, never physical progress');

      advance({ type: 'MOVE_ITEM', item: 'tanago-box', target: 'tap' });
      ok(state.items['tanago-box'].location === 'tap' && state.items['tanago-box'].status === 'filling', 'moving the tanago box to the tap begins a visible fill state');
      advance({ type: 'FILL_COMPLETE' });
      ok(state.items['tanago-box'].water === 'full' && state.items['tanago-box'].status === 'ready', 'the fill consequence makes the tanago box water-full and ready');

      advance({ type: 'MOVE_ITEM', item: 'tanago-box', target: 'trunk' });
      ok(state.packing.coopItem === 'tanago-box' && state.items['tanago-box'].owner === 'both', 'the filled tanago box begins a two-person cooperative carry');
      ok(state.actors.cap.current === 'coop:tanago-box' && state.actors.towel.current === 'coop:tanago-box' &&
        state.actors.cap.status === 'working' && state.actors.towel.status === 'working', 'both actors are concurrently occupied by the heavy filled box');
      advance({ type: 'COMPLETE_COOP' });
      ok(state.items['tanago-box'].location === 'trunk' && state.actors.cap.status === 'idle' && state.actors.towel.status === 'idle', 'cooperation loads the filled box and releases both actors');

      advance({ type: 'MOVE_ITEM', item: 'suppon-tank', target: 'trunk' });
      ok(state.packing.coopItem === 'suppon-tank' && state.items['suppon-tank'].owner === 'both' &&
        state.actors.cap.current === 'coop:suppon-tank' && state.actors.towel.current === 'coop:suppon-tank', 'the separate suppon tank also requires both people');
      advance({ type: 'COMPLETE_COOP' });
      var readyToDepart = model.derive(state);
      ok(readyToDepart.essentialsLoaded && readyToDepart.canDepart, 'all five essential physical preparations unlock departure');
      ok(!readyToDepart.drinksLoaded && state.items.drinks.location === 'vending', 'drinks can be omitted without failing the packing phase');

      var plannedDrive = model.reduce(state, { type: 'ASSIGN_ITEM', actor: 'towel', item: 'drinks' });
      plannedDrive = model.reduce(plannedDrive, { type: 'COMPLETE_JOB', actor: 'towel' });
      ok(model.derive(plannedDrive).drinksLoaded && plannedDrive.items.drinks.location === 'cabin', 'planning ahead loads optional drinks into the cabin');
      plannedDrive = model.reduce(plannedDrive, { type: 'DEPART' });
      ok(plannedDrive.scene === 'drive' && !plannedDrive.drive.detour && plannedDrive.lastEvent.code === 'direct-drive', 'remembered drinks earn a direct drive with no detour');
      ok(state.scene === 'packing' && state.items.drinks.location === 'vending', 'testing the planned branch cannot mutate the missable-drinks branch');

      advance({ type: 'DEPART' });
      ok(state.scene === 'drive' && state.drive.detour && !state.drive.detourComplete && state.lastEvent.code === 'drinks-detour', 'omitted drinks cause the recoverable roadside detour');
      var beforeEarlyArrival = clone(state);
      advance({ type: 'ARRIVE_LAKE' });
      ok(state.scene === 'drive' && state.lastEvent.type === 'refusal' && state.lastEvent.code === 'drive-pending', 'the lake cannot be reached before the drinks detour resolves');
      ok(same(stripEvent(state), stripEvent(beforeEarlyArrival)), 'premature arrival refusal preserves drive state');
      var beforeDetourClock = state.clockMinutes;
      advance({ type: 'DETOUR_COMPLETE' });
      ok(state.drive.detourComplete && state.items.drinks.location === 'cabin' && state.items.drinks.owner === 'watanabe', 'the detour physically recovers the missed drinks into the car cabin');
      ok(state.clockMinutes === beforeDetourClock + 8, 'forgetting drinks has a deterministic eight-minute consequence');
      advance({ type: 'ARRIVE_LAKE' });
      ok(state.scene === 'lake' && state.lastEvent.code === 'lake-arrival', 'resolved travel reaches the lake scene');

      advance({ type: 'MOVE_ITEM', item: 'rods', target: 'jetty' });
      ok(state.items.rods.location === 'jetty', 'the rods must physically reach the jetty');
      var beforeBareHook = clone(state);
      advance({ type: 'CAST', zone: 'shallows' });
      ok(state.lastEvent.type === 'refusal' && state.lastEvent.code === 'bare-hook', 'casting without bait produces the canonical bare-hook refusal');
      ok(state.lake.hookBait === null && state.lake.tanago === 'waiting', 'bare-hook refusal produces no hidden catch progress');
      ok(same(stripEvent(state), stripEvent(beforeBareHook)), 'bare-hook refusal changes only feedback');

      advance({ type: 'BAIT_HOOK', item: 'worms' });
      ok(state.lake.hookBait === 'worms' && state.items.worms.location === 'hook', 'worms physically occupy the hook before the tanago cast');
      advance({ type: 'CAST', zone: 'shallows' });
      ok(state.lake.tanago === 'bite' && state.items.worms.location === 'used' && state.lake.hookBait === null, 'worm plus shallows deterministically produces a tanago bite');
      advance({ type: 'REEL' });
      ok(state.lake.tanago === 'caught', 'reeling materializes a movable tanago catch');
      advance({ type: 'MOVE_CATCH', catch: 'tanago', target: 'tanago-box' });
      ok(state.lake.tanago === 'boxed' && state.items['tanago-box'].contains === 'tanago', 'the caught tanago transfers into the prepared water box');

      advance({ type: 'BAIT_HOOK', item: 'chicken' });
      ok(state.lake.hookBait === 'chicken' && state.items.chicken.location === 'hook', 'chicken physically occupies the hook for the suppon attempt');
      var beforeWrongWater = clone(state);
      advance({ type: 'CAST', zone: 'shallows' });
      ok(state.lastEvent.type === 'refusal' && state.lastEvent.code === 'wrong-water', 'chicken in the shallows is refused as the wrong water');
      ok(state.lake.hookBait === 'chicken' && state.items.chicken.location === 'hook' && same(stripEvent(state), stripEvent(beforeWrongWater)), 'wrong-water refusal preserves bait for immediate revision');
      advance({ type: 'CAST', zone: 'deep' });
      ok(state.lake.suppon === 'fighting' && state.items.chicken.location === 'used', 'chicken plus deep water deterministically produces a suppon fight');
      advance({ type: 'REEL' });
      ok(state.lake.suppon === 'caught', 'reeling materializes a movable suppon catch');

      var beforeWrongContainer = clone(state);
      advance({ type: 'MOVE_CATCH', catch: 'suppon', target: 'tanago-box' });
      ok(state.lastEvent.type === 'refusal' && state.lastEvent.code === 'wrong-container', 'suppon in the fish box produces the canonical wrong-container refusal');
      ok(state.lake.suppon === 'caught' && state.lake.tanago === 'boxed' &&
        state.items['tanago-box'].contains === 'tanago' && state.items['suppon-tank'].contains === null, 'wrong-container refusal preserves both animals and both containers');
      ok(same(stripEvent(state), stripEvent(beforeWrongContainer)), 'wrong-container refusal changes only feedback');
      advance({ type: 'MOVE_CATCH', catch: 'suppon', target: 'suppon-tank' });
      ok(state.lake.suppon === 'tanked' && state.items['suppon-tank'].contains === 'suppon' && model.derive(state).canGoHome, 'the separate tank secures the suppon and unlocks home');

      advance({ type: 'GO_HOME' });
      ok(state.scene === 'home' && !state.completed, 'returning home still requires physical aquarium placement');
      var beforeWrongHome = clone(state);
      advance({ type: 'PLACE_HOME', item: 'suppon-tank', target: 'home-tanago' });
      ok(state.lastEvent.type === 'refusal' && state.lastEvent.code === 'wrong-home' && same(stripEvent(state), stripEvent(beforeWrongHome)), 'the two home aquariums refuse the wrong animal without progress');
      advance({ type: 'PLACE_HOME', item: 'tanago-box', target: 'home-tanago' });
      ok(state.home.tanagoPlaced && !state.completed && state.items['tanago-box'].location === 'home-tanago', 'placing only the tanago does not prematurely complete the tutorial');
      advance({ type: 'PLACE_HOME', item: 'suppon-tank', target: 'home-suppon' });
      ok(state.completed && state.home.tanagoPlaced && state.home.supponPlaced && state.lastEvent.code === 'tutorial-complete', 'separate final aquarium placements complete the embodied loop');
      ok(state.items['tanago-box'].location === 'home-tanago' && state.items['suppon-tank'].location === 'home-suppon' && model.derive(state).homeComplete, 'completion keeps tanago and suppon in distinct physical homes');

      var completedState = clone(state);
      function runPath(actions) {
        return actions.reduce(function (current, action) { return model.reduce(current, clone(action)); }, model.freshState());
      }
      ok(same(runPath(pathActions), completedState) && same(runPath(pathActions), runPath(pathActions)), 'the complete action/refusal path is replay-deterministic');
      ok(ownedInputs.every(function (entry) { return same(entry.state, entry.snapshot); }), 'no transition in the complete path mutates caller-owned state');

      var japanese = model.reduce(state, { type: 'SET_LANG', language: 'ja' });
      ok(japanese.language === 'ja' && japanese.completed, 'language switching preserves completed physical state');
      var invalidLanguage = model.reduce(japanese, { type: 'SET_LANG', language: 'xx' });
      ok(invalidLanguage.lastEvent.type === 'refusal' && same(stripEvent(invalidLanguage), stripEvent(japanese)), 'invalid language changes are fail-closed');
      var restarted = model.reduce(japanese, { type: 'RESTART' });
      ok(restarted.scene === 'arrival' && restarted.language === 'ja' && !restarted.completed, 'restart returns to a clean arrival state while preserving language choice');
      ok(restarted.items['tanago-box'].water === 'empty' && restarted.items['tanago-box'].contains === null &&
        restarted.items['suppon-tank'].contains === null && restarted.items.drinks.location === 'vending', 'restart clears every learned-world consequence for replay');
    }
  }

  console.log('\n=== RESULT ===');
  if (failures) {
    console.error('HIKONE VERIFY FAILED: ' + failures + ' of ' + checks + ' checks failed.');
    process.exitCode = 1;
  } else {
    console.log('ALL ' + checks + ' EMBODIED HIKONE CHECKS PASSED \u2713');
  }
}
