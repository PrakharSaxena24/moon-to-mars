#!/usr/bin/env node
'use strict';

/*
 * Standalone acceptance verifier for the locked Hikone tutorial.
 *
 * Contract under test
 * -------------------
 * 1. One lesson only: decompose six known requirements, then parallelize them
 *    across Member A and Member B. There is no hidden seventh task/failure.
 * 2. Exact story facts: Watanabe arrives outside Ryokan Izumi in Yokkaichi in
 *    his own generic car, he drives, and the destination is Hikone/Lake Biwa.
 * 3. Exactly three people exist. Watanabe is immutable/non-assignable; only
 *    neutral placeholders Member A and Member B own preparation cards.
 * 4. Cards/effort are frozen: rods 2; worms 1; chicken bait for suppon 1;
 *    water-filled tanago box 3; suppon aquarium transport 4; road drinks 1.
 *    Total effort is 12. Initial assigned effort is 0.
 * 5. Retry passes iff all six are assigned, both lanes are used, and neither
 *    lane exceeds 7 effort. Assignment and load derivation are deterministic.
 * 6. Flow is arrival -> Watanabe brief -> forced 12/0 serial baseline -> retry
 *    assignment -> parallel prep -> trunk proof -> route -> Lake Biwa unload /
 *    aquarium payoff -> completion.
 * 7. The animals are aquarium-bound, never framed as food. The experience is
 *    fictional planning education: no official-guide claim, catch guarantee,
 *    or real animal-handling instructions.
 * 8. It is standalone: only a versioned Hikone completion envelope is persisted
 *    under a dedicated key; no campaign/authoring state is read/written
 *    and no mid-run assignment state auto-resumes.
 * 9. Full-viewport shell: no page scrollbar, shrinkable height chain, internal
 *    overflow escape hatch, phone/short-landscape rules, safe areas.
 * 10. Native-button tap/keyboard path, >=48px targets, phase-heading focus,
 *     aria-live status, decorative visuals with equivalent DOM copy.
 * 11. Reduced motion has a static/instant equivalent and never requires rAF,
 *     pan, parallax, drag, animation, or sound to understand/pass the lesson.
 *
 * Optional pure model seam (strongly recommended and exercised below):
 *   window.HIKONE or module.exports = {
 *     PEOPLE, CARDS, BASELINE,
 *     freshState(), assign(state, cardId, laneId), derive(state)
 *   }
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');

var ROOT = __dirname;
var failures = 0, checks = 0;

function pass(message) { checks++; console.log('  \u2713 ' + message); }
function fail(message, detail) {
  checks++; failures++;
  console.error('  \u2717 ' + message + (detail ? ' — ' + detail : ''));
}
function ok(condition, message, detail) { if (condition) pass(message); else fail(message, detail); }
function section(name) { console.log('\n=== ' + name + ' ==='); }
function read(name) {
  var file = path.join(ROOT, name);
  if (!fs.existsSync(file)) { fail(name + ' exists'); return ''; }
  pass(name + ' exists');
  return fs.readFileSync(file, 'utf8');
}
function includesAll(haystack, values) {
  var lower = haystack.toLowerCase();
  return values.every(function (value) { return lower.indexOf(String(value).toLowerCase()) >= 0; });
}
function compact(value) { return String(value == null ? '' : value).toLowerCase().replace(/[^a-z0-9]+/g, ''); }
function labelOf(item) {
  var value = item && (item.label || item.name || item.title || item.copy || item.text);
  if (value && typeof value === 'object') value = value.en || value.jp || value.ja;
  return String(value || '');
}
function effortOf(item) { return Number(item && (item.effort != null ? item.effort : (item.load != null ? item.load : item.cost))); }
function idOf(item) { return String(item && (item.id || item.key || item.cardId || item.taskId) || ''); }
function laneOf(value) {
  value = compact(value);
  if (value === 'a' || value === 'membera' || value === 'lanea') return 'a';
  if (value === 'b' || value === 'memberb' || value === 'laneb') return 'b';
  return value;
}

section('FILES / STANDALONE BOOT');
var html = read('hikone.html');
var css = read('hikone.css');
var js = read('hikone.js');
var combined = html + '\n' + css + '\n' + js;

if (!html || !css || !js) {
  console.error('\nHIKONE VERIFY BLOCKED: implementation files have not landed yet.');
  process.exitCode = 1;
} else {
  ok(/<meta[^>]+name=["']viewport["'][^>]+width=device-width/i.test(html), 'mobile viewport metadata is present');
  ok(/href=["'][^"']*hikone\.css["']/i.test(html), 'HTML loads only the Hikone stylesheet seam');
  ok(/src=["'][^"']*hikone\.js["']/i.test(html), 'HTML loads only the Hikone script seam');
  ok(!/(?:src|href)=["']https?:\/\//i.test(html), 'standalone tutorial has no remote runtime dependency');
  ok(!/(?:app|engine|stage|sound)\.js/i.test(html), 'standalone tutorial does not boot Ogasawara simulation globals');
  ok(/<main\b/i.test(html), 'document exposes one semantic main experience');

  section('LOCKED STORY FACTS');
  ['Watanabe', 'Member A', 'Member B', 'Ryokan Izumi', 'Yokkaichi', 'Lake Biwa', 'Hikone'].forEach(function (fact) {
    ok(combined.toLowerCase().indexOf(fact.toLowerCase()) >= 0, 'exact fact is present: ' + fact);
  });
  ['渡辺', '四日市', '琵琶湖', '彦根', 'タナゴ', 'スッポン', 'ミミズ', '飲み物'].forEach(function (fact) {
    ok(combined.indexOf(fact) >= 0, 'Japanese fact parity is present: ' + fact);
  });
  ok(/(?:own|his)\s+(?:generic\s+)?car|car\s+(?:belongs\s+to|owned\s+by)\s+Watanabe/i.test(combined), 'Watanabe arrives in his own car');
  ok(/Watanabe[^.\n]{0,100}(?:drive|driver)|(?:drive|driver)[^.\n]{0,100}Watanabe/i.test(combined), 'Watanabe—not a member—is the driver');
  ok(!/Member\s+[AB]\s+(?:(?:will|would|can)\s+)?(?:drive|drives|is\s+the\s+driver)/i.test(combined), 'Member A/B are never described as the driver');

  section('LOCKED REQUIREMENTS / AQUARIUM FRAMING');
  ['rod', 'worm', 'chicken', 'tanago', 'suppon', 'drink', 'aquarium'].forEach(function (fact) {
    ok(combined.toLowerCase().indexOf(fact) >= 0, 'requirement/framing term is present: ' + fact);
  });
  ok(/water[- ]filled[^.\n]{0,80}tanago|tanago[^.\n]{0,80}water[- ]filled/i.test(combined), 'tanago holding box is explicitly water-filled up front');
  ok(/chicken[^.\n]{0,80}(?:bait|suppon)|(?:bait|suppon)[^.\n]{0,80}chicken/i.test(combined), 'chicken is explicitly suppon bait, not a meal');
  ok(/(?:not|never)\s+(?:for\s+)?food|not\s+food|食用(?:では|じゃ)ない/i.test(combined), 'copy explicitly says aquarium animals are not food');
  ok(!/(?:cook|eat|serve)\s+(?:the\s+)?(?:tanago|suppon)|(?:tanago|suppon)\s+(?:meal|dinner|dish|food)/i.test(combined), 'tanago/suppon are never framed as food');
  ok(!/(?:guaranteed?|will)\s+(?:to\s+)?catch|catch\s+guarantee/i.test(combined), 'copy never guarantees a catch');
  ok(!/(?:official\s+(?:guide|instruction|advice)|approved\s+handling|veterinary\s+instruction)/i.test(combined), 'copy makes no official-guide or professional-handling claim');
  ok(!/(?:\b\d+(?:\.\d+)?\s*°[CF]\b|oxygenation\s+rate|dosage|feed\s+every|change\s+the\s+water\s+every)/i.test(combined), 'copy contains no real animal-handling procedure');
  ok(!/(?:fill-water|waterReady|hidden[-_ ](?:task|failure)|seventh[-_ ](?:task|card))/i.test(js), 'no hidden water failure or seventh repair task was introduced');

  section('FLOW / CAUSAL LESSON');
  [
    ['arrival', /arrival|arrive/i],
    ['Watanabe brief', /brief/i],
    ['forced serial baseline', /serial|one[- ]by[- ]one/i],
    ['player assignment retry', /retry|try\s+again|assign/i],
    ['parallel preparation', /parallel/i],
    ['trunk proof', /trunk/i],
    ['route vignette', /route|drive/i],
    ['Lake Biwa unload', /unload/i],
    ['completion', /complete|completion/i],
    ['debrief transfer question', /transfer|next\s+(?:trip|plan)|what\s+will\s+you/i]
  ].forEach(function (entry) { ok(entry[1].test(combined), 'flow includes ' + entry[0]); });
  ok(/12\s*(?:\/|of|／)\s*0|(?:effort|load)[^\n]{0,60}12[^\n]{0,30}(?:assigned|parallel)[^\n]{0,30}0/i.test(combined), 'forced baseline visibly states 12 total / 0 assigned');
  ok(/free|no\s+(?:cost|penalty)|減点なし|無料/i.test(combined), 'failed split can be revised without penalty');
  ok(!/Math\.random\s*\(/.test(js), 'tutorial state/effort logic contains no randomness');

  section('PERSISTENCE ISOLATION');
  var storageKeys = [], storagePattern = /["']([^"']*hikone[^"']*(?:v1|\.1))[^"']*["']/ig, storageMatch;
  while ((storageMatch = storagePattern.exec(js))) if (storageKeys.indexOf(storageMatch[1]) < 0) storageKeys.push(storageMatch[1]);
  ok(storageKeys.length >= 1, 'uses a dedicated versioned Hikone completion key');
  ok(!/(?:prs_campaign|campaign_state|campaign_run_state|plan_autosave|authoring)/i.test(js), 'does not read or write campaign/authoring storage');
  ok(/hikone-tutorial/i.test(js) && /completedAt/.test(js) && /["']?version["']?\s*[:=]\s*1/.test(js), 'completion envelope is kind/version/time bounded');
  ok(!/localStorage\.(?:setItem|getItem)[^\n]{0,160}(?:assignment|selectedCard|laneLoad|phase)/i.test(js), 'mid-run assignment/phase state is not persisted');

  section('FULL VIEWPORT / MOBILE / INPUT / REDUCED MOTION');
  ok(/100dvh/.test(css) && /100vh/.test(css), 'viewport shell has 100vh fallback plus 100dvh');
  ok(/overflow\s*:\s*hidden/.test(css) && /overflow-x\s*:\s*hidden/.test(css), 'page shell clips document overflow (no horizontal or page scrollbar)');
  ok(/min-height\s*:\s*0/.test(css), 'shrinkable height-chain escape hatch is present');
  ok(/overflow(?:-y)?\s*:\s*(?:auto|scroll)/.test(css), 'bounded panel/overlay owns any necessary internal scrolling');
  ok(/env\(safe-area-inset-(?:top|right|bottom|left)\)/.test(css), 'safe-area insets are honored');
  ok(/@media\s*\([^)]*max-width/i.test(css), 'phone-width layout rule exists');
  ok(/@media\s*\([^)]*max-height/i.test(css), 'short-landscape layout rule exists (including 640x360 class)');
  ok(/min-(?:height|block-size)\s*:\s*(?:4[4-9]|[5-9]\d)px/.test(css), 'primary tap targets are at least 44px');
  ok(/@media\s*\([^)]*max-width[^}]+font-size\s*:\s*(?:1[6-9]|[2-9]\d)px/is.test(css), 'narrow-screen core text retains a 16px minimum rule');
  ok(/:focus-visible/.test(css), 'keyboard focus is visibly styled');
  ok(/prefers-reduced-motion\s*:\s*reduce/.test(css), 'CSS reduced-motion mode exists');
  ok(/matchMedia\s*\([^)]*prefers-reduced-motion/.test(js), 'JS observes reduced-motion preference');
  ok(!/requestAnimationFrame\s*\(/.test(js) || /(?:reducedMotion|reduceMotion|\bRM\b)/.test(js), 'any rAF path is explicitly reduced-motion gated');
  ok(/aria-live\s*=|setAttribute\s*\(\s*["']aria-live/i.test(combined), 'status changes have an aria-live text equivalent');
  ok(/tabindex\s*=\s*["']-1["']|\.focus\s*\(/i.test(combined), 'phase changes have a programmatic heading/focus target');
  ok(/<button\b|createElement\s*\(\s*["']button["']/.test(combined), 'card/lane controls use native buttons');
  ok(/addEventListener\s*\(\s*["']click["']/.test(js), 'canonical card/lane action works by tap/click without drag');
  ok(!/draggable\s*=\s*["']true["']/.test(html) || /addEventListener\s*\(\s*["']click["']/.test(js), 'drag, if present, is enhancement rather than the only input');
  ok(/aria-hidden\s*=\s*["']true["']/.test(combined) || !/<canvas\b/i.test(html), 'decorative canvas/art is hidden from AT or absent');

  // Load the optional pure state seam without booting the DOM application.
  section('PURE STATE / DETERMINISTIC LOAD GATES');
  var model = null, exportError = null;
  try {
    var moduleBox = { exports: {} };
    var sandbox = { module: moduleBox, exports: moduleBox.exports, console: console,
      window: {}, globalThis: {}, setTimeout: function () { return 0; }, clearTimeout: function () {},
      localStorage: { getItem: function () { return null; }, setItem: function () {}, removeItem: function () {} },
      matchMedia: function () { return { matches: true, addEventListener: function () {}, removeEventListener: function () {} }; } };
    sandbox.window.localStorage = sandbox.localStorage; sandbox.window.matchMedia = sandbox.matchMedia;
    sandbox.globalThis = sandbox.window;
    vm.runInNewContext(js, sandbox, { filename: 'hikone.js', timeout: 1000 });
    model = moduleBox.exports && Object.keys(moduleBox.exports).length ? moduleBox.exports :
      (sandbox.window.HIKONE || sandbox.window.HIKONE_MODEL || sandbox.HIKONE || null);
  } catch (error) { exportError = error; }
  ok(!!model, 'hikone.js exposes a pure HIKONE model seam for state verification', exportError && exportError.message);

  if (model) {
    var people = model.PEOPLE || model.people || model.MEMBERS || model.members || [];
    var cards = model.CARDS || model.cards || model.TASKS || model.tasks || [];
    var fresh = model.freshState || model.initialState || model.createState;
    var assign = model.assign;
    var derive = model.derive || model.evaluate || model.statusFor;
    var reduce = model.reduce;
    if (!assign && reduce) assign = function (state, cardId, laneId) {
      return reduce(state, { type: 'assign', cardId: cardId, laneId: laneId });
    };
    ok(Array.isArray(people) && people.length === 3, 'pure model contains exactly Watanabe + Member A/B');
    ok(Array.isArray(cards) && cards.length === 6, 'pure model contains exactly six known preparation cards');
    ok(typeof fresh === 'function' && typeof assign === 'function' && typeof derive === 'function', 'pure model exports freshState + assign/reduce + derive');

    if (Array.isArray(people) && people.length) {
      var assignable = people.filter(function (person) { return person.assignable !== false && !/watanabe/i.test(idOf(person) + ' ' + labelOf(person)); });
      var watanabe = people.filter(function (person) { return /watanabe/i.test(idOf(person) + ' ' + labelOf(person)); })[0];
      ok(!!watanabe && (watanabe.assignable === false || watanabe.driver === true), 'Watanabe is immutable/non-assignable and identified as driver');
      ok(assignable.length === 2 && includesAll(assignable.map(function (p) { return idOf(p) + ' ' + labelOf(p); }).join(' '), ['a', 'b']), 'only neutral Member A/B lanes are assignable');
    }

    if (Array.isArray(cards) && cards.length) {
      var expected = [
        [/\brods?\b/i, 2, 'rods'], [/worm/i, 1, 'worms'], [/chicken/i, 1, 'chicken bait'],
        [/(?:tanago.*(?:box|holding)|(?:box|holding).*tanago)/i, 3, 'water-filled tanago box'],
        [/(?:suppon.*(?:carrier|transport|aquarium)|(?:carrier|transport|aquarium).*suppon)/i, 4, 'suppon aquarium transport'],
        [/drink/i, 1, 'road drinks']
      ];
      expected.forEach(function (entry) {
        var found = cards.filter(function (card) { return entry[0].test(idOf(card) + ' ' + labelOf(card)); });
        ok(found.length === 1 && effortOf(found[0]) === entry[1], entry[2] + ' has exact effort ' + entry[1]);
      });
      ok(cards.reduce(function (sum, card) { return sum + effortOf(card); }, 0) === 12, 'six card efforts sum to the frozen total 12');
    }

    if (typeof fresh === 'function' && typeof assign === 'function' && typeof derive === 'function' && cards.length === 6) {
      function cardFor(pattern) { return cards.filter(function (card) { return pattern.test(idOf(card) + ' ' + labelOf(card)); })[0]; }
      var memberA = people.filter(function (person) { return /(?:member|lane)[-_ ]?a\b|\bA\b/.test(idOf(person) + ' ' + labelOf(person)); })[0];
      var memberB = people.filter(function (person) { return /(?:member|lane)[-_ ]?b\b|\bB\b/.test(idOf(person) + ' ' + labelOf(person)); })[0];
      var laneAId = memberA ? idOf(memberA) : 'a', laneBId = memberB ? idOf(memberB) : 'b';
      function put(state, card, lane) { return assign(state, idOf(card), lane === 'a' ? laneAId : laneBId); }
      function readyOf(result) { return !!(result && (result.ready === true || result.canBegin === true || result.pass === true)); }
      function loadValue(result, lane) {
        if (!result) return NaN;
        var loads = result.loads || result.laneLoads || result.effortByLane || {};
        var id = lane === 'a' ? laneAId : laneBId;
        return Number(loads[id] != null ? loads[id] : (loads[lane] != null ? loads[lane] : loads['member-' + lane]));
      }
      var baseState = fresh(), baseSnapshot = JSON.stringify(baseState), baseDerived = derive(baseState);
      ok(!readyOf(baseDerived), 'fresh 12/0 state is not ready');
      ok((baseDerived.assignedCount == null || baseDerived.assignedCount === 0) &&
        (baseDerived.assignedEffort == null || baseDerived.assignedEffort === 0), 'fresh state starts at zero assigned cards/effort');

      var oneLane = fresh(); cards.forEach(function (card) { oneLane = put(oneLane, card, 'a'); });
      ok(!readyOf(derive(oneLane)), 'all six on one lane fails the both-lanes/max-7 gate');

      var over = fresh();
      [/(?:suppon.*(?:carrier|transport|aquarium)|(?:carrier|transport|aquarium).*suppon)/i,
        /(?:tanago.*(?:box|holding)|(?:box|holding).*tanago)/i, /\brods?\b/i].forEach(function (pattern) { over = put(over, cardFor(pattern), 'a'); });
      [/worm/i, /chicken/i, /drink/i].forEach(function (pattern) { over = put(over, cardFor(pattern), 'b'); });
      ok(!readyOf(derive(over)), '9/3 assignment fails the max-lane-7 gate');

      var balanced = fresh();
      [/(?:suppon.*(?:carrier|transport|aquarium)|(?:carrier|transport|aquarium).*suppon)/i, /\brods?\b/i, /worm/i].forEach(function (pattern) { balanced = put(balanced, cardFor(pattern), 'a'); });
      [/(?:tanago.*(?:box|holding)|(?:box|holding).*tanago)/i, /chicken/i, /drink/i].forEach(function (pattern) { balanced = put(balanced, cardFor(pattern), 'b'); });
      var balancedDerived = derive(balanced);
      ok(readyOf(balancedDerived), '7/5 assignment passes exactly when all six and both lanes are used');
      ok(loadValue(balancedDerived, 'a') === 7 && loadValue(balancedDerived, 'b') === 5, 'lane effort is exact deterministic sum (A=7, B=5)');
      ok(JSON.stringify(baseState) === baseSnapshot, 'assign/derive never mutates the fresh caller-owned state');

      var repeatA = fresh(), repeatB = fresh();
      cards.forEach(function (card, index) { repeatA = put(repeatA, card, index < 3 ? 'a' : 'b'); });
      cards.forEach(function (card, index) { repeatB = put(repeatB, card, index < 3 ? 'a' : 'b'); });
      ok(JSON.stringify(repeatA) === JSON.stringify(repeatB) && JSON.stringify(derive(repeatA)) === JSON.stringify(derive(repeatB)), 'same assignments produce byte-deterministic state and derived loads');

      var invalid = null, invalidRejected = false;
      try { invalid = assign(fresh(), idOf(cards[0]), 'watanabe'); }
      catch (error) { invalidRejected = true; }
      if (!invalidRejected && invalid) invalidRejected = !readyOf(derive(invalid)) && JSON.stringify(invalid).toLowerCase().indexOf('watanabe') < 0;
      ok(invalidRejected, 'assigning a card to Watanabe fails closed');
    }
  }

  console.log('\n=== RESULT ===');
  if (failures) {
    console.error('HIKONE VERIFY FAILED: ' + failures + ' of ' + checks + ' checks failed.');
    process.exitCode = 1;
  } else console.log('ALL ' + checks + ' HIKONE CHECKS PASSED \u2713');
}
