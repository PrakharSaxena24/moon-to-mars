#!/usr/bin/env node
'use strict';

/*
 * Hostile acceptance verifier for the campaign-aligned Hikone tutorial.
 *
 * Required loop:
 *   deck -> arrange -> connect -> freeze -> Run -> causal report
 *        -> exact plan target -> revise -> rerun -> physical payoff
 *
 * Browser viewport checks remain a separate release gate when a supported
 * browser is available. This suite pins source contracts and the pure model.
 */

var fs = require('fs');
var path = require('path');
var vm = require('vm');
var ROOT = __dirname;
var checks = 0, failures = 0;

function pass(message) { checks++; console.log('  \u2713 ' + message); }
function fail(message, detail) { checks++; failures++; console.error('  \u2717 ' + message + (detail ? ' — ' + detail : '')); }
function ok(condition, message, detail) { if (condition) pass(message); else fail(message, detail); }
function section(name) { console.log('\n=== ' + name + ' ==='); }
function read(name) {
  var file = path.join(ROOT, name);
  if (!fs.existsSync(file)) { fail(name + ' exists'); return ''; }
  pass(name + ' exists'); return fs.readFileSync(file, 'utf8');
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce(function (out, key) { out[key] = stable(value[key]); return out; }, {});
  return value;
}
function same(a, b) { return JSON.stringify(stable(a)) === JSON.stringify(stable(b)); }
function stripEvent(value) { var out = clone(value); delete out.lastEvent; return out; }
function task(state, id) { return state.plan.tasks.filter(function (entry) { return entry.id === id; })[0]; }

section('FILES / STANDALONE SHELL');
var html = read('hikone.html');
var css = read('hikone.css');
var js = read('hikone.js');
var i18n = read('i18n.js');
var combined = html + '\n' + css + '\n' + js;

if (!html || !css || !js) {
  console.error('\nHIKONE VERIFY BLOCKED: implementation files are incomplete.');
  process.exitCode = 1;
} else {
  ok(/<meta[^>]+name=["']viewport["'][^>]+width=device-width/i.test(html), 'mobile viewport metadata is present');
  ok(/href=["'][^"']*hikone\.css["']/i.test(html), 'standalone stylesheet is loaded');
  ok(/src=["']engine\.js["']/i.test(html) && /src=["']hikone\.js["']/i.test(html), 'campaign engine and tutorial controller are loaded');
  ok(html.indexOf('src="engine.js"') < html.indexOf('src="hikone.js"'), 'campaign engine loads before the tutorial adapter');
  ok(!/(?:src|href)=["']https?:\/\//i.test(html), 'there is no remote runtime dependency');
  ['hk-app', 'hk-world', 'hk-scene', 'hk-plan', 'hk-run', 'hk-report', 'hk-clock'].forEach(function (id) {
    ok(new RegExp('id=["\']' + id + '["\']', 'i').test(html), '#' + id + ' has a stable semantic mount');
  });

  section('SHARED CAMPAIGN GRAMMAR');
  ['hk-deck', 'hk-timeline', 'hk-run-plan', 'hk-handoff', 'hk-revise-plan'].forEach(function (id) {
    ok(js.indexOf(id) >= 0, '#' + id + ' is rendered by the tutorial controller');
  });
  ok(/data-person-lane/.test(js) && /prakhar/.test(js) && /nishinaga/.test(js), 'the planner renders Prakhar and Nishinaga person lanes');
  ok(/data-task/.test(js) && /data-slot/.test(js), 'task blocks and time slots have stable interaction hooks');
  ok(/data-connect/.test(js) && /faceToFace/.test(js), 'the information handoff is an authored face-to-face connection');
  ok(/daySchedule\s*\(/.test(js) && /dayReadiness\s*\(/.test(js), 'Hikone calls the campaign temporal/readiness engine');
  ok(/buildCampaignPlan/.test(js) && /days\s*:\s*\{\s*hikone/.test(js), 'Hikone builds a campaign-shaped custom day');
  ok(/snapshot\s*:\s*copy\((?:state|next)\.plan\)/.test(js) && /fingerprint/.test(js), 'Run freezes and fingerprints an authored plan snapshot');
  ok(/focusTarget/.test(js) && /data-fix-target/.test(js), 'causal reports route back to an exact plan control');
  ok(/formatClock\(primary\.atMin\)/.test(js) && /formatClock\(root\.atMin\)/.test(js), 'primary and secondary report evidence render authored causal times');
  ok(/primary\.code\s*===\s*["']engine-unavailable["']/.test(js) && /window\.location\.reload\s*\(/.test(js), 'an unavailable shared engine offers Reload instead of a futile plan loop');
  ok(/Plan/.test(js) && /Run/.test(js) && /Observe/.test(js) && /Revise/.test(js), 'the four-step learning loop is named in English');
  ok(/計画/.test(js) && /実行/.test(js) && /観察/.test(js) && /修正/.test(js), 'the four-step learning loop is named in Japanese');

  section('REJECTED ARCHITECTURES STAY OUT');
  ok(!/\bhk-panel\b/i.test(combined), 'the rejected slideshow panel architecture is absent');
  ok(!/\bhk-progress(?:-[a-z0-9_-]+)?\b/i.test(combined), 'the rejected progress-bar architecture is absent');
  ok(!/\beffort(?:\s+beats?|word|of)?\b/i.test(html + '\n' + js), 'no player-facing effort-number puzzle remains');
  ok(!/\bBASELINE\b|\bCARDS\b|renderAssignment|data-action\s*=\s*["']next["']/i.test(js), 'old assignment slideshow constants/actions are absent');
  ['BAIT_HOOK', 'CAST', 'REEL', 'MOVE_CATCH', 'PLACE_HOME'].forEach(function (action) {
    ok(js.indexOf(action) < 0, 'tutorial-only adventure action is absent: ' + action);
  });
  ok(!/Math\.random\s*\(/.test(js), 'playable outcomes contain no randomness');
  ok(/\.hk-catch\s*\{[^}]*pointer-events\s*:\s*none/is.test(css), 'lake animals are payoff visuals, not a separate drag minigame');

  section('LOCKED STORY / AUTHORITATIVE NAMES');
  ['Watanabe-san', 'Prakhar', 'Nishinaga', 'Ryokan Izumi', 'Yokkaichi', 'Lake Biwa', 'Hikone'].forEach(function (fact) {
    ok((html + '\n' + js + '\n' + i18n).indexOf(fact) >= 0, 'locked fact is present: ' + fact);
  });
  ['渡邊', 'プラカール', '西永', '旅館いずみ', '四日市', '琵琶湖', '彦根', 'タナゴ', 'スッポン'].forEach(function (fact) {
    ok((html + '\n' + js + '\n' + i18n).indexOf(fact) >= 0, 'authoritative Japanese fact is present: ' + fact);
  });
  ok((html + '\n' + js + '\n' + i18n).indexOf('渡辺') < 0, 'incorrect simplified Watanabe Kanji is absent from tutorial copy');
  ok((html + '\n' + js + '\n' + i18n).indexOf('プラカル') < 0, 'incorrect shortened Prakhar Katakana is absent from tutorial copy');
  ok(!/actors\s*:\s*\{[^}]*\bcap\s*:|actors\s*:\s*\{[^}]*\btowel\s*:/is.test(js), 'Cap/Towel are not player-facing actor identities');
  ok(/not food|never as food|食用ではない/i.test(js), 'tanago and suppon are explicitly not food');
  ok(/separate aquariums|別々の水槽/i.test(js), 'tanago and suppon have separate aquarium purpose');
  ['rod', 'worm', 'chicken', 'tanago-box', 'suppon-tank', 'drinks'].forEach(function (item) {
    ok(js.toLowerCase().indexOf(item.toLowerCase()) >= 0, 'required preparation is modeled: ' + item);
  });

  section('POINTER / KEYBOARD / ACCESSIBILITY');
  ok(/addEventListener\s*\(\s*["']pointerdown["']/.test(js) && /pointermove/.test(js) && /pointerup/.test(js), 'task placement supports Pointer Events');
  ok(/pointercancel/.test(js) && /lostpointercapture/.test(js), 'pointer cancel and lost capture are handled');
  ok(/addEventListener\s*\(\s*["']click["']/.test(js), 'tap/keyboard click is a canonical placement path');
  ok(!/dragstart|new\s+DragEvent|draggable\s*=/.test(js), 'native DragEvent-only interaction is not used');
  ok(/<button\b/.test(html + '\n' + js), 'planner and actions use native buttons');
  ok(/aria-live/.test(html) && /announce\s*\(/.test(js), 'run/report consequences have live-region equivalents');
  ok(!/id=["']hk-run["'][^>]*aria-live/i.test(html), 'rapid run-frame repainting is not itself a live region');
  ok(/function\s+setText\s*\(/.test(js) && /element\.textContent\s*!==\s*value/.test(js), 'persistent live copy updates only when its value changes');
  ok(/repeatableFeedback/.test(js), 'consecutive user edits and refusals retain announcement feedback');
  ok(/:focus-visible/.test(css), 'keyboard focus is visibly styled');
  ok(/tabindex=.{0,20}selectedTask/.test(js) && /hk-slot.{0,60}is-armed/.test(js), 'timeline slots become named keyboard targets only while moving a task');
  ok(/event\.key\s*!==\s*["']Escape["']/.test(js) && /selection-cancelled/.test(js), 'Escape cancels a selected task move without editing the plan');
  ok(/oldScrollLeft/.test(js) && /scrollIntoView/.test(js), 'planner rebuilds preserve its rail and reveal exact focus targets');
  ok(/is-pointer-dragging[^\{]*\s+\.hk-task-block:not\(\.is-dragging\)\{[^}]*pointer-events\s*:\s*none/is.test(css), 'occupied cells expose their underlying slot during pointer drag');
  ok(/cloneNode\s*\(\s*true\s*\)/.test(js) && /ghost\.tabIndex\s*=\s*-1/.test(js) && /hk-drag-ghost/.test(js) && /\.hk-drag-ghost\{[^}]*position\s*:\s*fixed[^}]*pointer-events\s*:\s*none/is.test(css), 'a non-focusable fixed drag ghost stays visible across the deck and clipped timeline');
  ok(/\.hk-deck-task[^\{]*,\.hk-deck-drop\{[^}]*min-height\s*:\s*48px/is.test(css), 'deck task targets are at least 48px high');
  ok(/\.hk-slot\{[^}]*min-width\s*:\s*48px[^}]*min-height\s*:\s*60px/is.test(css), 'wide time-slot targets are at least 48px by 60px');
  ok(/\.hk-report-action\{[^}]*min-height\s*:\s*50px/is.test(css) || /\.hk-handoff,.hk-run-plan,.hk-report-action\{[^}]*min-height\s*:\s*54px/is.test(css), 'primary report/run controls meet touch target size');

  section('FULL VIEWPORT / RESPONSIVE / MOTION');
  ok(/html\s*,\s*body[^\{]*\{[^}]*overflow\s*:\s*hidden/is.test(css), 'document-level scrolling is clipped');
  ok(/100vh/.test(css) && /100dvh/.test(css), 'viewport shell has 100vh fallback and 100dvh ownership');
  ok(/\.hk-app[^\{]*\{[^}]*overflow\s*:\s*hidden/is.test(css), 'application shell cannot create a page scrollbar');
  ok(/\.hk-planner[^\{]*\{[^}]*position\s*:\s*fixed/is.test(css) || /\.hk-planner,.hk-run-panel,.hk-report-panel\{[^}]*position\s*:\s*fixed/is.test(css), 'planner/report/run surfaces are fixed internal overlays');
  ok(/\.hk-timeline-scroll[^\{]*\{[^}]*overflow-x\s*:\s*auto/is.test(css), 'narrow timeline pans inside its own boundary');
  ok(/scrollbar-width\s*:\s*none/.test(css) && /::-webkit-scrollbar\{display:none\}/.test(css), 'internal rails do not show a visual scrollbar');
  ok(/env\(safe-area-inset-(?:top|right|bottom|left)\)/.test(css), 'safe-area insets are honored');
  ok(/@media\s*\([^)]*max-width\s*:\s*760px/i.test(css), 'phone planner restaging exists');
  ok(/@media\s*\([^)]*max-height\s*:\s*520px/i.test(css), 'short-landscape planner restaging exists');
  ok(/prefers-reduced-motion\s*:\s*reduce/.test(css) && /matchMedia\s*\([^)]*prefers-reduced-motion/.test(js), 'CSS and JavaScript both support reduced motion');
  ok(/id=["']hk-lang-en["']/.test(html) && /id=["']hk-lang-ja["']/.test(html), 'English and Japanese controls are present');
  ok(/document\.documentElement\.lang/.test(js), 'language switching updates the document language');

  section('PURE MODEL EXPORTS');
  var H = null, loadError = null;
  try { H = require('./hikone.js'); } catch (error) { loadError = error; }
  ok(!!H, 'hikone.js exposes a CommonJS pure seam', loadError && loadError.message);
  if (H) {
    ['PHASES', 'PEOPLE', 'ITEMS', 'TASKS', 'SLOTS', 'ACTIONS', 'STORAGE_KEY'].forEach(function (key) { ok(H[key] != null, key + ' is exported'); });
    ['freshState', 'reduce', 'derive', 'simulatePlan', 'buildCampaignPlan', 'campaignEvidence', 'planFingerprint', 'saveCompletion', 'loadCompletion'].forEach(function (key) { ok(typeof H[key] === 'function', key + '() is exported'); });
    ok(same(Array.prototype.slice.call(H.PHASES), ['arrival', 'plan', 'run', 'observe', 'drive', 'lake', 'home']), 'lifecycle is arrival → plan → run → observe → payoff');
    ok(H.PEOPLE.length === 2 && H.PEOPLE[0].id === 'prakhar' && H.PEOPLE[1].id === 'nishinaga', 'exactly two people own controllable lanes');
    ok(H.PEOPLE.every(function (entry) { return entry.id !== 'watanabe'; }), 'Watanabe is not a controllable planner');
    ok(H.PEOPLE[0].ja === 'プラカール' && H.PEOPLE[1].ja === '西永', 'model exports authoritative Japanese planner names');
    ok(H.TASKS.length === 6 && H.TASKS.some(function (entry) { return entry.id === 'load-carriers' && entry.cooperative; }), 'six real preparation tasks include a cooperative load');
    ok(H.SLOTS[0] === 350 && H.SLOTS[H.SLOTS.length - 1] === 375, 'authoring window is the 05:50–06:15 slot grid before 06:20 departure');

    section('PURENESS / FAIL-CLOSED ACTIONS');
    var fresh = H.freshState(), freshSnapshot = clone(fresh);
    ok(fresh.phase === 'arrival' && fresh.scene === 'arrival', 'fresh state begins at the Ryokan arrival');
    ok(same(fresh, JSON.parse(JSON.stringify(fresh))), 'fresh state is JSON serializable');
    var derivedA = H.derive(fresh), derivedB = H.derive(clone(fresh));
    ok(same(derivedA, derivedB), 'derive() is deterministic');
    ok(same(fresh, freshSnapshot), 'derive() does not mutate caller-owned state');
    var unknownA = H.reduce(fresh, { type: '__UNKNOWN__' }), unknownB = H.reduce(clone(fresh), { type: '__UNKNOWN__' });
    ok(unknownA !== fresh && unknownA.lastEvent.type === 'refusal', 'unknown action returns a new fail-closed state');
    ok(same(stripEvent(unknownA), stripEvent(fresh)) && same(unknownA, unknownB), 'unknown action changes feedback only and is deterministic');
    var prematureRun = H.reduce(fresh, { type: 'RUN_PLAN' });
    ok(prematureRun.phase === 'arrival' && prematureRun.lastEvent.type === 'refusal', 'Run cannot skip the briefing/plan phase');

    section('RUN 1 — MISSING INFORMATION HANDOFF');
    var state = H.reduce(fresh, { type: 'START' });
    ok(state.phase === 'plan' && state.focusTarget === 'run', 'START opens the real planner and focuses Run');
    var badActor = H.reduce(state, { type: 'MOVE_TASK', taskId: 'rods', actor: 'watanabe', startMin: 350 });
    ok(badActor.lastEvent.type === 'refusal' && same(stripEvent(badActor), stripEvent(state)), 'Watanabe cannot become a task lane');
    var badTime = H.reduce(state, { type: 'MOVE_TASK', taskId: 'rods', actor: 'prakhar', startMin: 351 });
    ok(badTime.lastEvent.type === 'refusal' && same(stripEvent(badTime), stripEvent(state)), 'off-grid placement fails closed');
    var initialPlanSnapshot = clone(state.plan), initialResultA = H.simulatePlan(state.plan), initialResultB = H.simulatePlan(clone(state.plan));
    ok(same(initialResultA, initialResultB), 'equal plan JSON produces byte-equal simulation evidence');
    ok(same(state.plan, initialPlanSnapshot), 'simulatePlan() does not mutate the authored plan');
    ok(!initialResultA.success && initialResultA.roots.length === 1 && initialResultA.primaryRoot.code === 'missing-handoff', 'first-root-first initial result is the missing handoff');
    ok(initialResultA.primaryRoot.atMin === 360 && initialResultA.primaryRoot.focusTarget === 'handoff', 'missing handoff points to 06:00 and the exact connection control');
    ok(initialResultA.engineEvidence.available === true, 'the real campaign schedule/readiness engine supplied evidence');
    ok(Array.isArray(initialResultA.engineEvidence.rawReadiness) && Array.isArray(initialResultA.engineEvidence.readiness), 'campaign evidence exposes raw and actionable readiness');
    ok(same(initialResultA.engineEvidence.rawReadiness, initialResultA.engineEvidence.readiness), 'campaign readiness is consumed without a suppressed adapter exception');
    ok(initialResultA.engineEvidence.readiness.some(function (issue) { return issue.type === 'MISSING_ARROW'; }), 'campaign engine independently sees the missing information arrow');
    ok(initialResultA.engineEvidence.readiness.some(function (issue) { return issue.type === 'DEP_BROKEN'; }), 'campaign engine independently sees the bad Fill→Load order');
    ok(initialResultA.engineEvidence.readiness.some(function (issue) { return issue.type === 'UNPLACED_REQUIRED' && issue.taskId === 'drinks'; }), 'campaign engine independently sees unplanned Drinks');

    var planningOwned = state, planningOwnedSnapshot = clone(state);
    state = H.reduce(state, { type: 'RUN_PLAN' });
    ok(state.phase === 'run' && state.run.snapshot.connected === false, 'RUN_PLAN freezes the initial plan and enters automatic execution');
    ok(state.run.fingerprint === H.planFingerprint(state.run.snapshot), 'frozen run fingerprint matches its snapshot');
    planningOwned.plan.tasks[0].startMin = 375;
    ok(state.run.snapshot.tasks[0].startMin === 350, 'later caller-owned authoring mutation cannot change the active run');
    ok(same(state.run.result, initialResultA), 'active run outcome equals the pre-launch deterministic result');
    var runClocks = [], sawWait = false, guard = 0;
    while (state.phase === 'run' && guard++ < 30) {
      var before = state, beforeSnapshot = clone(before); state = H.reduce(state, { type: 'RUN_TICK' });
      ok(same(before, beforeSnapshot), 'RUN_TICK does not mutate its input at frame ' + guard);
      if (state.phase === 'run') { runClocks.push(state.clockMinutes); if (state.run.frame.code === 'handoff-wait') sawWait = true; }
    }
    ok(state.phase === 'observe' && state.report.primaryRoot.code === 'missing-handoff', 'Run 1 ends in a causal Observe report');
    ok(sawWait, 'Run 1 visibly reaches Nishinaga’s waiting frame');
    ok(runClocks.every(function (value, index) { return index === 0 || value >= runClocks[index - 1]; }), 'rehearsal clock is monotonic');
    var failedWrites = 0;
    ok(H.saveCompletion({ setItem: function () { failedWrites++; } }, state) === false && failedWrites === 0, 'failed rehearsal cannot attempt to persist completion');

    section('REVISE / RUN 2 — ORDER AND MISSING DRINKS');
    state = H.reduce(state, { type: 'REVISE_PLAN' });
    ok(state.phase === 'plan' && state.revision === 1 && state.focusTarget === 'handoff', 'Show in plan preserves authoring and targets the handoff');
    state = H.reduce(state, { type: 'CONNECT_HANDOFF', connected: true });
    ok(state.plan.connected && state.lastEvent.code === 'handoff-connected', 'player manually draws the face-to-face handoff');
    var connectedPreview = H.simulatePlan(state.plan);
    ok(!connectedPreview.success && connectedPreview.primaryRoot.code === 'bad-order', 'after connecting, Fill-after-Load becomes the first cause');
    ok(connectedPreview.roots.some(function (root) { return root.code === 'drinks-missing'; }), 'Run 2 also observes unplanned Drinks');
    ok(connectedPreview.detourMinutes === 8, 'missing Drinks has a deterministic eight-minute consequence');
    state = H.reduce(state, { type: 'RUN_PLAN' });
    while (state.phase === 'run') state = H.reduce(state, { type: 'RUN_TICK' });
    ok(state.report.primaryRoot.code === 'bad-order' && state.report.roots[1].code === 'drinks-missing', 'Run 2 report preserves causal root ordering');
    state = H.reduce(state, { type: 'REVISE_PLAN' });
    ok(state.focusTarget === 'fill-box' && state.revision === 2, 'Run 2 Show in plan focuses the Fill block');

    section('VALID MANUAL REPAIR / CLEAN RERUN');
    state = H.reduce(state, { type: 'MOVE_TASK', taskId: 'fill-box', actor: 'prakhar', startMin: 355 });
    state = H.reduce(state, { type: 'MOVE_TASK', taskId: 'rods', actor: 'nishinaga', startMin: 355 });
    state = H.reduce(state, { type: 'MOVE_TASK', taskId: 'drinks', actor: 'nishinaga', startMin: 370 });
    var cleanPlanSnapshot = clone(state.plan), clean = H.simulatePlan(state.plan);
    ok(clean.success && clean.roots.length === 0, 'manual reorder/reassignment/placement creates a clean plan');
    ok(clean.departureMin === 380 && clean.waitMinutes === 0 && clean.detourMinutes === 0, 'clean plan is ready at 06:20 without wait or detour');
    ok(clean.engineEvidence.available && clean.engineEvidence.readiness.length === 0, 'campaign dayReadiness has no non-adapter issue for the repaired plan');
    ok(clean.engineEvidence.rawReadiness.length === 0, 'campaign engine natively accepts the cooperative cross-role load');
    ok(clean.success === (clean.roots.length === 0 && clean.engineEvidence.readiness.length === 0), 'success is gated by both tutorial roots and every non-adapter campaign issue');
    ok(same(state.plan, cleanPlanSnapshot), 'clean simulation leaves authoring untouched');

    var campaignEngine = require('./engine.js'), ownerMissing = clone(clean.engineEvidence.plan), ownerMissingTask = ownerMissing.days.hikone.tasks.filter(function (entry) { return entry.id === 'load-carriers'; })[0];
    ownerMissingTask.assignedIds = ['p04'];
    ok(campaignEngine.dayReadiness(ownerMissing, 'hikone').some(function (issue) { return issue.type === 'MISASSIGNED' && issue.taskId === 'load-carriers'; }), 'an allowed helper cannot replace the cooperative task owner');
    var malformedAllowlist = clone(clean.engineEvidence.plan), malformedAllowlistTask = malformedAllowlist.days.hikone.tasks.filter(function (entry) { return entry.id === 'load-carriers'; })[0];
    malformedAllowlistTask.allowedRoleIds = 'budgetLead';
    ok(campaignEngine.dayReadiness(malformedAllowlist, 'hikone').some(function (issue) { return issue.type === 'MISASSIGNED' && issue.taskId === 'load-carriers'; }), 'a non-array cooperative role allowlist fails closed');
    var unknownAllowlist = clone(clean.engineEvidence.plan), unknownAllowlistTask = unknownAllowlist.days.hikone.tasks.filter(function (entry) { return entry.id === 'load-carriers'; })[0];
    unknownAllowlistTask.allowedRoleIds = ['future-role'];
    ok(campaignEngine.dayReadiness(unknownAllowlist, 'hikone').some(function (issue) { return issue.type === 'MISASSIGNED' && issue.taskId === 'load-carriers'; }), 'an unknown helper role cannot bypass campaign assignment checks');

    var noEngineContext = {};
    vm.runInNewContext(js, noEngineContext, { filename: 'hikone-no-engine.js' });
    var noEngineResult = noEngineContext.HIKONE.simulatePlan(cleanPlanSnapshot);
    ok(!noEngineResult.success && noEngineResult.primaryRoot.code === 'engine-unavailable' && noEngineResult.departureMin === null, 'missing shared engine fails closed with unverified trunk readiness');
    var futureEngineContext = { PRS: { daySchedule: function () { return {}; }, dayReadiness: function () { return [{ type: 'FUTURE_READINESS', taskId: 'rods' }]; } } };
    vm.runInNewContext(js, futureEngineContext, { filename: 'hikone-future-engine.js' });
    var futureEngineResult = futureEngineContext.HIKONE.simulatePlan(cleanPlanSnapshot);
    ok(!futureEngineResult.success && futureEngineResult.primaryRoot.code === 'campaign-gap' && futureEngineResult.primaryRoot.focusTarget === 'rods' && futureEngineResult.departureMin === null, 'unknown future campaign readiness fails closed at an exact task without claiming departure');

    var alternate = H.freshState(); alternate = H.reduce(alternate, { type: 'START' }); alternate = H.reduce(alternate, { type: 'CONNECT_HANDOFF', connected: true });
    alternate = H.reduce(alternate, { type: 'MOVE_TASK', taskId: 'drinks', actor: 'nishinaga', startMin: 355 });
    alternate = H.reduce(alternate, { type: 'MOVE_TASK', taskId: 'load-carriers', actor: 'both', startMin: 370 });
    ok(H.simulatePlan(alternate.plan).success, 'a second legal Fill-before-Load schedule also succeeds');

    var sameOwner = H.freshState(); sameOwner = H.reduce(sameOwner, { type: 'START' });
    sameOwner = H.reduce(sameOwner, { type: 'MOVE_TASK', taskId: 'confirm-care', actor: 'nishinaga', startMin: 350 });
    sameOwner = H.reduce(sameOwner, { type: 'MOVE_TASK', taskId: 'bait', actor: 'prakhar', startMin: 350 });
    sameOwner = H.reduce(sameOwner, { type: 'MOVE_TASK', taskId: 'fill-box', actor: 'prakhar', startMin: 355 });
    sameOwner = H.reduce(sameOwner, { type: 'MOVE_TASK', taskId: 'rods', actor: 'nishinaga', startMin: 355 });
    sameOwner = H.reduce(sameOwner, { type: 'MOVE_TASK', taskId: 'drinks', actor: 'nishinaga', startMin: 370 });
    var sameOwnerResult = H.simulatePlan(sameOwner.plan);
    ok(sameOwnerResult.success && !sameOwner.plan.connected, 'giving Confirm to Nishinaga is a clean alternative with no redundant handoff');
    ok(!sameOwnerResult.engineEvidence.plan.days.hikone.handoffs.length && sameOwnerResult.engineEvidence.readiness.length === 0, 'campaign evidence has no non-adapter issue when a shared information owner needs no arrow');

    var overlap = clone(state); overlap = H.reduce(overlap, { type: 'MOVE_TASK', taskId: 'drinks', actor: 'prakhar', startMin: 355 });
    var overlapResult = H.simulatePlan(overlap.plan), overlapAt355 = overlapResult.frames.filter(function (frame) { return frame.atMin === 355; })[0], overlapAt360 = overlapResult.frames.filter(function (frame) { return frame.atMin === 360; })[0];
    ok(overlapResult.roots.some(function (root) { return root.code === 'overlap'; }), 'double-booking one person becomes causal evidence');
    ok(task({ plan: { tasks: overlapResult.tasks } }, 'drinks').effectiveStart === 360 && task({ plan: { tasks: overlapResult.tasks } }, 'load-carriers').effectiveStart === 365, 'one-person capacity delays the conflicting job and its cooperative downstream work');
    ok(overlapAt355.actors.prakhar.status === 'working' && overlapAt355.actors.prakhar.taskId === 'fill-box', 'working physical evidence wins over a conflicting task’s wait state');
    ok(overlapAt360.items['tanago-box'].water === 'full' && overlapAt360.items.drinks.location === 'vending', 'overlapping outputs cannot both complete magically at the same minute');
    ok(same(task(state, 'drinks'), { id: 'drinks', actor: 'nishinaga', startMin: 370 }), 'testing an overlap branch cannot mutate the clean plan');

    var mixedRoots = clone(state); mixedRoots = H.reduce(mixedRoots, { type: 'UNPLACE_TASK', taskId: 'drinks' }); mixedRoots = H.reduce(mixedRoots, { type: 'MOVE_TASK', taskId: 'rods', actor: 'prakhar', startMin: 350 });
    var mixedResult = H.simulatePlan(mixedRoots.plan);
    ok(mixedResult.primaryRoot.code === 'overlap' && mixedResult.primaryRoot.atMin === 350 && mixedResult.roots[1].code === 'drinks-missing' && mixedResult.roots[1].atMin === 370, 'non-gated roots are ordered by first causal minute, then stable priority');

    var emptyPlan = H.simulatePlan({ connected: true, tasks: [] });
    ok(!emptyPlan.success && emptyPlan.roots.length === H.TASKS.length && emptyPlan.engineEvidence.readiness.filter(function (issue) { return issue.type === 'UNPLACED_REQUIRED'; }).length === H.TASKS.length, 'an empty imported plan fails closed in both tutorial and campaign evidence');
    var duplicateRows = clone(state.plan); duplicateRows.tasks.push(clone(duplicateRows.tasks[0]));
    var duplicateResult = H.simulatePlan(duplicateRows);
    ok(!duplicateResult.success && duplicateResult.roots.some(function (root) { return root.code === 'task-unplanned' && root.taskId === 'confirm-care'; }), 'duplicate canonical task rows normalize to an explicit unplanned failure');
    var unknownRows = clone(state.plan); unknownRows.tasks.push({ id: 'unknown-task', actor: 'prakhar', startMin: 350 });
    var unknownResult = H.simulatePlan(unknownRows);
    ok(!unknownResult.success && unknownResult.primaryRoot.detail.reason === 'unknown-task', 'unknown task rows fail closed without crashing the simulator');

    var unplacedLoad = clone(state); unplacedLoad = H.reduce(unplacedLoad, { type: 'UNPLACE_TASK', taskId: 'load-carriers' });
    var unplacedLoadResult = H.simulatePlan(unplacedLoad.plan);
    ok(!unplacedLoadResult.success && unplacedLoadResult.departureMin === null && unplacedLoadResult.roots.some(function (root) { return root.code === 'task-unplanned' && root.taskId === 'load-carriers'; }), 'unplacing cooperative Load fails closed and has no invented departure');
    ok(unplacedLoadResult.engineEvidence.readiness.some(function (issue) { return issue.type === 'UNPLACED_REQUIRED' && issue.taskId === 'load-carriers'; }), 'campaign readiness sees an unplaced cooperative task');

    var late = clone(state); late = H.reduce(late, { type: 'MOVE_TASK', taskId: 'load-carriers', actor: 'both', startMin: 375 });
    var lateResult = H.simulatePlan(late.plan);
    ok(!lateResult.success && lateResult.primaryRoot.code === 'late-departure', 'a plan finishing after 06:20 cannot pass merely because every card is placed');
    ok(lateResult.departureMin === 385 && lateResult.primaryRoot.detail.readyAt === 385, 'late departure evidence reports the real 06:25 ready time');

    state = H.reduce(state, { type: 'RUN_PLAN' });
    while (state.phase === 'run') state = H.reduce(state, { type: 'RUN_TICK' });
    ok(state.phase === 'observe' && state.report.success && state.report.fingerprint === H.planFingerprint(cleanPlanSnapshot), 'clean frozen rerun reaches a successful report');
    state = H.reduce(state, { type: 'CONTINUE_PAYOFF' });
    ok(state.phase === 'drive' && !state.completed, 'clean report alone unlocks—but does not skip—the drive payoff');
    state = H.reduce(state, { type: 'DRIVE_TICK' });
    ok(state.phase === 'lake' && state.scene === 'lake', 'Watanabe drives the group to Lake Biwa');
    for (var payoff = 0; payoff < 4; payoff++) state = H.reduce(state, { type: 'PAYOFF_TICK' });
    ok(state.phase === 'home' && state.completed && state.lastEvent.code === 'tutorial-complete', 'authored lake montage reaches two separate home aquariums');

    section('LANGUAGE / RESTART / STORAGE ISOLATION');
    var japanese = H.reduce(state, { type: 'SET_LANG', language: 'ja' });
    ok(japanese.language === 'ja' && japanese.completed, 'language switch preserves completed state');
    var invalidLanguage = H.reduce(japanese, { type: 'SET_LANG', language: 'xx' });
    ok(invalidLanguage.lastEvent.type === 'refusal' && same(stripEvent(invalidLanguage), stripEvent(japanese)), 'invalid language fails closed');
    var restarted = H.reduce(japanese, { type: 'RESTART' });
    ok(restarted.phase === 'arrival' && restarted.language === 'ja' && !restarted.completed && restarted.attempt === 0, 'restart returns to a clean arrival while preserving language');
    ok(H.STORAGE_KEY === 'prs.hikone-planning-tutorial.v3', 'storage key and schema version are aligned');

    var sentinels = {
      prs_campaign_state_v1: 'campaign-state-sentinel', prs_campaign_run_state_v1: 'run-state-sentinel',
      prs_authoring_plan: 'authoring-sentinel', prs_learning_attempts_v1: 'attempts-sentinel', prs_learning_level_v1: 'level-sentinel', prs_sound: 'sound-sentinel'
    };
    var store = clone(sentinels), calls = [];
    var storage = {
      getItem: function (key) { calls.push(['get', key]); return Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null; },
      setItem: function (key, value) { calls.push(['set', key]); store[key] = String(value); },
      removeItem: function (key) { calls.push(['remove', key]); delete store[key]; }
    };
    ok(H.saveCompletion(storage, state, '2026-07-21T00:00:00.000Z'), 'completed tutorial writes its dedicated envelope');
    ok(calls.length === 1 && calls[0][0] === 'set' && calls[0][1] === H.STORAGE_KEY, 'save touches only the dedicated tutorial key');
    Object.keys(sentinels).forEach(function (key) { ok(store[key] === sentinels[key], 'campaign/user sentinel remains byte-identical: ' + key); });
    var envelope = H.loadCompletion(storage);
    ok(envelope && envelope.kind === 'hikone-planning-tutorial' && envelope.version === 3 && envelope.completed, 'valid completion envelope round-trips');
    ok(calls[calls.length - 1][0] === 'get' && calls[calls.length - 1][1] === H.STORAGE_KEY, 'load reads only the dedicated tutorial key');
    var malformed = { getItem: function () { return '{bad'; } }, future = { getItem: function () { return JSON.stringify({ kind: 'hikone-planning-tutorial', version: 99, completed: true }); } };
    ok(H.loadCompletion(malformed) === null && H.loadCompletion(future) === null, 'malformed and future completion envelopes fail closed');
    ok(!/(?:prs_campaign|campaign_state|campaign_run_state|prs_authoring_plan|prs_learning)/.test(js), 'tutorial source never names campaign/authoring/learning storage keys');
  }

  console.log('\n=== RESULT ===');
  if (failures) {
    console.error('HIKONE VERIFY FAILED: ' + failures + ' of ' + checks + ' checks failed.');
    process.exitCode = 1;
  } else {
    console.log('ALL ' + checks + ' CAMPAIGN-ALIGNED HIKONE CHECKS PASSED \u2713');
  }
}
