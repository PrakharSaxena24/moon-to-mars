/* Headless verification of the PRS engine teaching gradient (run: node verify.js).
   Asserts: gappy baseline fails (D) with the 5+ seeded gaps; each fix raises its
   category and removes its detector; all fixes -> clean A ~100; determinism. */
var P = require('./engine.js');

function runToEnd(cfg) { var sim = P.createSim(cfg); var g = 0; while (!sim.finished && g < 500) { P.tick(sim); g++; } return sim; }
function scoreOf(cfg) { return P.score(runToEnd(cfg)); }
var pass = 0, fail = 0;
function ok(cond, msg) { (cond ? pass++ : fail++); console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + msg); }

var base = { seed: 1, overrides: {} };

console.log('=== BASELINE (gappy Ogasawara) ===');
var s0 = scoreOf(base);
console.log('  grade', s0.grade, 'score', s0.score, 'goal%', s0.goalPct, 'problems', s0.problemCount, 'reason', s0.reason);
console.log('  categories', JSON.stringify(s0.categories));
console.log('  detectors:', P.detect(P.mergePlan(base)).map(function (d) { return d.id; }).join(', '));
ok(s0.grade === 'D', 'gappy plan grades D');
ok(s0.problemCount >= 5, 'gappy plan has >=5 active gaps (' + s0.problemCount + ')');
ok(s0.reason === 'incomplete', 'gappy run finishes incomplete');

console.log('\n=== EACH FIX RAISES ITS CATEGORY & REMOVES ITS DETECTOR ===');
var fixCat = { setSafety: 'safety', grantAuth: 'budget', shareInfo: 'info', setReport: 'info', rebalance: 'health', fixReserve: 'budget', setReturn: 'roles', fixHandoffs: 'schedule' };
var detForFix = { setSafety: 'safety', grantAuth: 'budgetAuth', shareInfo: 'info', setReport: 'report', rebalance: 'fatigue', fixReserve: 'reserve', setReturn: 'returnLogi', fixHandoffs: 'handoffTiming' };
Object.keys(fixCat).forEach(function (fx) {
  var cfg = P.applyFix(base, fx);
  // MIGRATION (Voyage carryover, 2026-07-13): handoffTiming's test reads fishdaySchedule(plan),
  // which now ALSO stalls on the seed's missing jig case (load-day custody gap, spec §2) —
  // fixHandoffs alone (drawing the fishday arrows) can no longer clear it in isolation; the
  // day-0 carry gap must ALSO be authored (applyDayFix('load')) for this fix's OWN effect to
  // be observable in isolation, per the carryover thesis ("what misses the ship cannot be
  // fixed at sea" — not even by a downstream information fix).
  if (fx === 'fixHandoffs') cfg = P.applyDayFix(cfg, 'load');
  var s1 = scoreOf(cfg);
  var cat = fixCat[fx];
  var detsAfter = P.detect(P.mergePlan(cfg)).map(function (d) { return d.id; });
  var raised = s1.categories[cat] > s0.categories[cat];
  var removed = detsAfter.indexOf(detForFix[fx]) < 0;
  var totalUp = s1.score > s0.score;
  ok(removed, fx + ' removes detector "' + detForFix[fx] + '"');
  ok(raised || totalUp, fx + ' raises category "' + cat + '" (' + s0.categories[cat] + '→' + s1.categories[cat] + ') / total ' + s0.score + '→' + s1.score);
});

console.log('\n=== ALL FIXES -> CLEAN A ===');
// MIGRATION (Voyage carryover, 2026-07-13): a clean fishday now ALSO needs the load day's
// custody chain authored (applyDayFix('load')) alongside the 8 classic fixes — the jig case
// missing from the truck run is a day-0 gap fixHandoffs cannot reach. `allFixesLoad` is the new
// "everything fixed" reference cfg used throughout the rest of this file for that reason.
var allFixesLoad = P.applyDayFix(P.applyAllFixes(base), 'load');
var sAll = scoreOf(allFixesLoad);
console.log('  grade', sAll.grade, 'score', sAll.score, 'goal%', sAll.goalPct, 'problems', sAll.problemCount, 'clean', sAll.clean, 'reason', sAll.reason);
console.log('  categories', JSON.stringify(sAll.categories));
ok(sAll.problemCount === 0, 'all fixes -> 0 active gaps');
ok(sAll.clean === true, 'all fixes -> clean');
ok(sAll.grade === 'A', 'all fixes -> grade A');
ok(sAll.score >= 95, 'all fixes -> score >= 95 (' + sAll.score + ')');
ok(sAll.reason === 'done', 'fully-fixed run finishes done');

console.log('\n=== INDIVIDUAL PERFORMANCE VALUES ===');
ok(sAll.individuals.length === 11, 'individuals present (11 duty-holders: 8 organizers + 3 chefs) (' + sAll.individuals.length + ')');
var sl0 = s0.individuals.filter(function (i) { return i.roleId === 'siteLead'; })[0];
var slA = sAll.individuals.filter(function (i) { return i.roleId === 'siteLead'; })[0];
ok(sl0 && slA && slA.fatigue <= sl0.fatigue, 'site lead fatigue drops after fixes (' + (sl0 && sl0.fatigue) + '→' + (slA && slA.fatigue) + ')');

console.log('\n=== PER-DAY REHEARSAL ===');
function dayRun(cfg, seg) { var s = P.createSim(cfg, seg); var g = 0; while (!s.finished && g < 500) { P.tick(s); g++; } return P.daySummary(s); }
['arrival', 'ops', 'return'].forEach(function (seg) {
  var gp = dayRun(base, seg), fx = dayRun(P.applyAllFixes(base), seg);
  ok(gp.grade === 'D' && gp.gaps >= 1, seg + ' day fails gappy (D, ' + gp.gaps + ' gaps, ' + gp.tasksDone + '/' + gp.tasksTotal + ' tasks)');
  ok(fx.grade === 'A' && fx.gaps === 0 && fx.clean, seg + ' day -> clean A when fixed (' + fx.tasksDone + '/' + fx.tasksTotal + ')');
});

console.log('\n=== MISSION CONTROL · budgeting planner ===');
var br0 = P.budgetReadiness(P.mergePlan(base));
ok(br0.ready === false, 'gappy Mission Control budget plan is not ready');
ok(br0.gaps.filter(function (g) { return g.type === 'BUDGET_AUTH'; }).length === 1, 'Mission Control flags missing meals approver');
ok(br0.gaps.filter(function (g) { return g.type === 'RESERVE_SHORT'; }).length === 1, 'Mission Control flags missing cash reserve');
ok(br0.resources.filter(function (r) { return r.id === 'res_cash'; })[0].ok === false, 'cash resource starts under target');
ok(br0.events.filter(function (ev) { return ev.id === 'sp_meals'; })[0].ok === false, 'morning food spend is blocked before budgeting fix');
var mcCfg = { seed: 1, overrides: { budget: {
  reserve: 300000,
  lines: { bl_meals: { approverRoleId: 'budgetLead', payMethod: 'cash' } },
  resources: { res_cash: { planned: 300000 }, res_ice: { planned: 55 } }
} } };
var mcPlan = P.mergePlan(mcCfg), mcBr = P.budgetReadiness(mcPlan), mcDets = P.detect(mcPlan).map(function (d) { return d.id; });
ok(mcBr.gaps.length === 0, 'Mission Control overrides clear budget readiness gaps');
ok(mcBr.ready === true, 'Mission Control ready flag requires envelopes, spends, and resources');
ok(mcDets.indexOf('budgetAuth') < 0 && mcDets.indexOf('reserve') < 0, 'Mission Control budget edits remove budgetAuth/reserve detectors');
ok(mcBr.resources.filter(function (r) { return r.id === 'res_ice'; })[0].planned === 55, 'Mission Control resource override updates ice count');
ok(P.makeTemplate().budget.reserve === 0, 'Mission Control merge does not mutate the template');
ok(P.projected(mcCfg).categories.budget === 10, 'Mission Control edits are reflected in projected budget score');

console.log('\n=== FISHDAY · temporal information axis (minute clock) ===');
function fishRun(cfg) {
  var sim = P.createSim(cfg, 'fishday'), g = 0, pauses = [];
  while (!sim.finished && g < 400) { P.tick(sim); if (sim.paused) { pauses.push(sim.checkpoint.id); P.resume(sim); } g++; }
  sim._pauses = pauses; return sim;
}
// MIGRATION (Voyage carryover, 2026-07-13): `baseL` is the gappy trip with ONLY the load day
// authored canonically (applyDayFix('load')) — everything else (fishday's own info arrows,
// the classic 10-day gaps) stays exactly as gappy as `base`. This reproduces the pre-Voyage
// fishday pins (1450 idle / 68% eff) verbatim; the raw, unauthored `base` now additionally
// stalls on the seed's missing jig case (1590/66%), which is a NEW, deliberate day-0 gap
// (spec §2/§4 "SEED GAP L1"), not the fishday teaching gradient this section pins.
var baseL = P.applyDayFix(base, 'load');
var gplan = P.mergePlan(baseL);
ok(P.detect(gplan).map(function (d) { return d.id; }).indexOf('handoffTiming') >= 0, 'gappy plan raises handoffTiming');
var gfd = P.fishdaySchedule(gplan);
ok(gfd.idleTotal > 0, 'gappy fishday accrues idle minutes (' + gfd.idleTotal + ' — tackle list late on chat)');
// §7/§13.4 P2 re-tune: the seed now withholds 9 of the 14 canonical arrows (only 4 kept
// on-time + 1 kept-but-late) -> 10 missing (task,card) pairs + 1 late (was 2/1 pre-retune)
ok(gfd.missing.length === 10 && gfd.late.length === 1, 'ships 9 withheld arrows (10 missing pairs) + 1 late tackle arrow (' + gfd.missing.length + '/' + gfd.late.length + ')');
ok(gfd.wrongFish.length === 4, 'undrawn ic_menu/ic_ground -> wrong-fish rework at gear-load, route, rig & fish (' + gfd.wrongFish.join(',') + ')');
ok(gfd.efficiency < 100, 'gappy efficiency < 100 (' + gfd.efficiency + '%)');
ok(gfd.dinnerMin > 1080, 'wrong fish pushes dinner past 18:00 (min ' + gfd.dinnerMin + ')');
var gsim = fishRun(baseL);
ok(gsim._pauses.join(',') === 'cp_predep,cp_relay,cp_dinner', 'run pauses at the 3 checkpoints (' + gsim._pauses.join(',') + ')');
var gsc = P.score(gsim);
ok(gsim.finished === 'incomplete' && gsc.grade === 'D', 'gappy fishday finishes incomplete, grades D (' + gsc.score + ')');

// MIGRATION (Voyage carryover, 2026-07-13): the fully-fixed fishday reference is now
// allFixesLoad (8 classic fixes + applyDayFix('load')) — applyAllFixes alone leaves the jig
// case missing, so the fishday never reaches 0 idle / 100% without also authoring Load.
var fAll = allFixesLoad;
var ffd = P.fishdaySchedule(P.mergePlan(fAll));
ok(ffd.idleTotal === 0, 'all fixes -> zero idle minutes');
ok(ffd.efficiency === 100, 'all fixes -> 100% efficiency');
ok(ffd.wrongFish.length === 0 && ffd.missing.length === 0 && ffd.late.length === 0, 'all fixes -> no missing / late / wrong-fish');
ok(ffd.dinnerMin === 1080, 'all fixes -> dinner served exactly 18:00 (min ' + ffd.dinnerMin + ')');
var fsim = fishRun(fAll), fsc = P.score(fsim);
ok(fsim.finished === 'done' && fsc.grade === 'A' && fsc.score === 100 && fsc.clean, 'fixed fishday -> clean A 100 (' + fsc.score + ')');

var effSeq = [], accF = base;
['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn', 'fixHandoffs'].forEach(function (fx) { accF = P.applyFix(accF, fx); effSeq.push(P.score(runToEnd(accF)).efficiency); });
// MIGRATION (Voyage carryover, 2026-07-13): the ladder's final rung now needs applyDayFix('load')
// too — the 8 classic fixes alone still leave the jig case missing (84%, not 100%).
accF = P.applyDayFix(accF, 'load'); effSeq.push(P.score(runToEnd(accF)).efficiency);
var mono = true; for (var e = 1; e < effSeq.length; e++) if (effSeq[e] < effSeq[e - 1]) mono = false;
ok(mono && effSeq[effSeq.length - 1] === 100, 'efficiency climbs monotonically to 100 (' + effSeq.join('→') + ')');

// a task's idle is the MAX of its late inputs, never the sum. h_orgfood and h_weather_chef
// are two of the arrows the P2 seed withholds, so both are supplied as FULL handoff objects
// here (not bare patches) — seed-independent regardless of which arrows the template ships
// pre-drawn. h_weather_chef is restored ON TIME (canonical, untouched) so t_f_menu's third
// input (ic_weather) doesn't itself go missing and dominate via IDLE_CAP(60), which would
// swamp the very max(22,32) comparison this test exists to isolate.
var two = P.mergePlan({ seed: 1, overrides: { handoffs: {
  h_food:    { trigger: { type: 'atMinute', value: 320 }, channel: 'phone' },   // arrives 322 -> 22 late (h_food is pre-drawn; patch is enough)
  h_orgfood: { cardId: 'ic_orgfood', fromRoleId: 'comms', fromTaskId: 't_f_orgfood', toRoleId: 'chef', toTaskId: 't_f_menu',
    trigger: { type: 'atMinute', value: 330 }, channel: 'phone', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } }, // arrives 332 -> 32 late
  h_weather_chef: { cardId: 'ic_weather', fromRoleId: 'safetyLead', fromTaskId: 't_f_weather', toRoleId: 'chef', toTaskId: 't_f_menu',
    trigger: { type: 'onTaskDone', taskId: 't_f_weather' }, channel: 'faceToFace', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } } // on time (canonical)
} } });
ok(P.fishdaySchedule(two).byTask.t_f_menu.idleMin === 32, 'task idle = max(22, 32) of late inputs, not sum (' + P.fishdaySchedule(two).byTask.t_f_menu.idleMin + ')');

// the ⏳ waitInfo visual: at 05:45 the angler is due (05:30) but the tackle list lands 06:10
var wsim = P.createSim(base, 'fishday');
while (wsim.clockMin < 345) P.tick(wsim);
var wgl = null, wp8 = null;
wsim.tasks.forEach(function (t) { if (t.id === 't_f_gearload') wgl = t; });
wsim.participants.forEach(function (p) { if (p.id === 'p08') wp8 = p; });
ok(wgl.state === 'waitinfo' && wp8.state === 'waitInfo' && wp8.station === 'port', 'at 05:45 gappy, gear-load waits on info and the angler shows 手待ち at the port (' + wgl.state + '/' + wp8.state + '@' + wp8.station + ')');

// checkpoint intervene: unblocks the LIVE run; the plan gap survives a clean re-run
// MIGRATION (Voyage carryover, 2026-07-13): uses baseL (load authored) so the ONLY remaining
// gap is the withheld ic_tackle arrow — on raw `base` the gear-load would also stall on the
// missing jig case, and the hand-fed info alone could never reach start===330.
var isim = P.createSim(baseL, 'fishday');
P.intervene(isim, 'ic_tackle', 'specialist');
ok(isim.sched.byTask.t_f_gearload.start === 330 && isim.handFed === 1, 'intervene(ic_tackle) unblocks the live gear-load (hand-fed 1x)');
ok(P.score(isim).idleMin === gfd.idleTotal, 'plan gap survives the hand-feed: score still bills ' + gfd.idleTotal + ' idle min');

// the canonical channel-latency table (§6.1) — the pricing of 報連相 — pinned exactly
ok(P.CHANNELS.faceToFace === 0 && P.CHANNELS.radio === 1 && P.CHANNELS.phone === 2 && P.CHANNELS.chat === 10 && P.CHANNELS.board === 30, 'channel latency pinned: 対面0 · 無線1 · 電話2 · チャット10 · 掲示板30');
// §7/§13.4 P2 re-tune: withholding 9 more arrows raises idle 220->1450 (rework/lateness unchanged)
ok(gfd.idleTotal === 1450 && gfd.reworkTotal === 90 && gfd.late[0].lateMin === 40, 'gappy ledger pinned exactly: 1450 idle + 90 rework person-min, tackle 40 min late');

// drawing a FASTER duplicate arrow is a legitimate alternate fix (min-arrival per pair)
// MIGRATION (Voyage carryover, 2026-07-13): also needs applyDayFix('load') — otherwise the
// gear-load still idles 60 min on the missing jig case even once the info arrow is fixed.
var dupFd = P.fishdaySchedule(P.mergePlan(P.applyDayFix({ seed: 1, overrides: { handoffs: { h_tackle2: { cardId: 'ic_tackle', fromRoleId: 'logi', fromTaskId: 't_f_tackleprep', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_tackleprep' }, channel: 'faceToFace', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } } } } }, 'load')));
ok(dupFd.late.length === 0 && dupFd.byTask.t_f_gearload.idleMin === 0, 'a faster duplicate arrow clears the late pair without touching the slow one');

// IDLE_CAP: erasing a needed wait-arrow charges 60 capped minutes and flags the pair missing
var capFd = P.fishdaySchedule(P.mergePlan({ seed: 1, overrides: { handoffs: { h_ground_chef: null } } }));
var capMiss = capFd.missing.filter(function (m) { return m.taskId === 't_f_sideprep' && m.cardId === 'ic_ground'; }).length;
ok(capFd.byTask.t_f_sideprep.idleMin === 60 && capMiss === 1, 'erased wait-arrow -> IDLE_CAP 60 min idle + missing pair (side prep / ic_ground)');

// beforeTaskStart trigger (§6.1, third trigger type) resolves consumer start − lead
var btsPlan = P.mergePlan({ seed: 1, overrides: { handoffs: { h_food: { trigger: { type: 'beforeTaskStart', taskId: 't_f_menu', leadMin: 20 } } } } });
var btsH = btsPlan.handoffs.filter(function (h) { return h.id === 'h_food'; })[0];
ok(P.resolveSendMin(btsPlan, btsH) === 280 && P.staticArrival(btsPlan, btsH) === 280, 'beforeTaskStart resolves to consumer start − lead (05:00−20 = 04:40)');

// fixHandoffs heals a hand-vandalized plan (erased + slowed + junk arrows) back to clean
var vandal = { seed: 1, overrides: { handoffs: {
  h_food: null,
  h_catch_chef: { channel: 'board' },
  h_junk: { cardId: 'ic_tackle', fromRoleId: 'logi', fromTaskId: 't_f_tackleprep', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'atMinute', value: 700 }, channel: 'board', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } }
} } };
// MIGRATION (Voyage carryover, 2026-07-13): + applyDayFix('load') — without it the jig case
// stays missing and the healed plan can never reach 0 idle / 100%.
var healed = P.applyDayFix(P.applyAllFixes(vandal), 'load'), healedPlan = P.mergePlan(healed), healedFd = P.fishdaySchedule(healedPlan);
ok(P.detect(healedPlan).length === 0 && healedFd.idleTotal === 0 && healedFd.efficiency === 100, 'fixHandoffs heals an erased/slowed/junk-arrowed plan back to clean 100%');

// guests judge lateness against the PROMISED time: dragging dinner later cannot hide the wait
// MIGRATION (Voyage carryover, 2026-07-13): + applyDayFix('load') so the ONLY surviving gap is
// the dragged dinner block itself (otherwise the missing jig case would also bill guestWaitMin).
var lateDinner = P.applyDayFix(P.applyAllFixes(base), 'load');
lateDinner.overrides.timing = { t_f_serve: { startMin: 1110 } };
var ldFd = P.fishdaySchedule(P.mergePlan(lateDinner));
ok(ldFd.guestWaitMin === 30 && ldFd.dinnerMin === 1110, 'dinner dragged to 18:30 still bills 30 min guest wait (' + ldFd.guestWaitMin + '/' + ldFd.dinnerMin + ')');

// a dynamically-unresolvable arrow graph (mutual onTaskDone arrows) cannot score as clean
var loopCfg = { seed: 1, overrides: { handoffs: {
  h_loop: { cardId: 'ic_tackle', fromRoleId: 'chef', fromTaskId: 't_f_cook', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_cook' }, channel: 'radio', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } },
  h_tackle: null
} } };
var loopFd = P.fishdaySchedule(P.mergePlan(P.applyFix(loopCfg, 'setSafety')));
ok(loopFd.unresolved > 0, 'a cyclic arrow graph marks tasks unresolved (' + loopFd.unresolved + ') instead of scoring clean');
ok(P.detect(P.mergePlan(loopCfg)).map(function (d) { return d.id; }).indexOf('handoffTiming') >= 0, 'handoffTiming fires on an unresolvable arrow graph');

// a trigger pointing at a DAY-CLOCK task (no startMin) is unresolvable — never a free on-time pass
var nanCfg = { seed: 1, overrides: { handoffs: { h_tackle: { trigger: { type: 'onTaskDone', taskId: 't06' }, channel: 'faceToFace' } } } };
var nanPlan = P.mergePlan(nanCfg), nanH = nanPlan.handoffs.filter(function (h) { return h.id === 'h_tackle'; })[0];
var nanFd = P.fishdaySchedule(nanPlan);
var nanMiss = nanFd.missing.filter(function (m) { return m.taskId === 't_f_gearload' && m.cardId === 'ic_tackle'; }).length;
ok(P.resolveSendMin(nanPlan, nanH) === null && nanMiss === 1 && nanFd.byTask.t_f_gearload.idleMin === 60, 'NaN send-time (day-clock trigger task) counts as missing + IDLE_CAP, not on-time (' + nanFd.byTask.t_f_gearload.idleMin + ')');

// a redundant unresolvable arrow cannot deadlock a pair another arrow already feeds on time
// MIGRATION (Voyage carryover, 2026-07-13): + applyDayFix('load') so the plan is otherwise
// clean before the self-referencing junk arrow is added.
var dead = P.applyDayFix(P.applyAllFixes(base), 'load');
dead.overrides.handoffs.h_dead = { cardId: 'ic_tackle', fromRoleId: 'specialist', fromTaskId: 't_f_gearload', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_gearload' }, channel: 'radio', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } };
var deadFd = P.fishdaySchedule(P.mergePlan(dead));
ok(deadFd.unresolved === 0 && deadFd.idleTotal === 0 && deadFd.efficiency === 100, 'self-referencing junk arrow beside an on-time arrow: no deadlock, still clean');

// memberInfo is a minute-clock API: a coarse sim returns null instead of throwing
var coarse = P.createSim(base); P.tick(coarse);
var miCoarse = null, miThrew = false;
try { miCoarse = P.memberInfo(coarse, 'p03'); } catch (e) { miThrew = true; }
ok(!miThrew && miCoarse === null, 'memberInfo on a coarse sim returns null (no crash)');

// merge/config surface: draw / erase arrows and retain detailed timing compatibility.
// §7/§13.4 P2 re-tune: the gappy seed now ships only 5 of 14 fishday arrows (was 12)
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_x: { cardId: 'ic_menu', fromRoleId: 'chef', fromTaskId: 't_f_menu', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_menu' }, channel: 'faceToFace', ifLate: 'assume', reworkKind: 'wrongFish', content: { en: 'x', jp: 'x' } } } } }).handoffs.length === 6, 'editor can draw a new arrow (5 -> 6)');
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_catch_chef: null } } }).handoffs.length === 4, 'editor can erase an arrow (5 -> 4)');
var mv = P.mergePlan({ seed: 1, overrides: { timing: { t_f_menu: { startMin: 315, durMin: 45 } } } }).tasks.filter(function (t) { return t.id === 't_f_menu'; })[0];
ok(mv.startMin === 315 && mv.durMin === 45,
  'internal/config timing overrides retain detailed-minute compatibility (315/45); the UI authoring projection is hourly');

console.log('\n=== DETERMINISM ===');
var a = JSON.stringify(scoreOf({ seed: 42, overrides: {} }));
var b = JSON.stringify(scoreOf({ seed: 42, overrides: {} }));
ok(a === b, 'same seed -> identical score()');
// a FRESH module instance (no shared state) reproduces the identical score
delete require.cache[require.resolve('./engine.js')];
var P2 = require('./engine.js');
var s2f = P2.createSim({ seed: 42, overrides: {} }), g2 = 0;
while (!s2f.finished && g2++ < 500) P2.tick(s2f);
ok(JSON.stringify(P2.score(s2f)) === a, 'fresh engine instance -> identical score (no hidden module state)');

console.log('\n=== gradient table ===');
var steps = [['gappy', base]];
var acc = base; ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn', 'fixHandoffs'].forEach(function (fx) { acc = P.applyFix(acc, fx); steps.push(['+' + fx, acc]); });
steps.forEach(function (st) { var s = scoreOf(st[1]); console.log('  ' + (st[0] + '            ').slice(0, 14) + ' ' + s.grade + ' ' + ('  ' + s.score).slice(-3) + ' /100  gaps=' + s.problemCount + ' goal%=' + s.goalPct); });

console.log('\n=== LAYER 0 — living-harbor cosmetic helpers (pure, no scoring impact) ===');
// ambientActors: 13 seeded guests, deterministic, in-range, animate with phase
var aa1 = P.ambientActors(7, 0.3), aa2 = P.ambientActors(7, 0.3), aa3 = P.ambientActors(7, 1.9);
ok(aa1.length === P.GUESTS, 'ambientActors returns ' + P.GUESTS + ' guests (' + aa1.length + ')');
ok(JSON.stringify(aa1) === JSON.stringify(aa2), 'ambientActors deterministic for same (seed,phase)');
ok(JSON.stringify(aa1) !== JSON.stringify(aa3), 'ambientActors animates with phase');
ok(aa1.every(function (g) { return g.x >= 0 && g.x <= 1 && g.y >= 0 && g.y <= 1; }), 'ambientActors positions stay in [0,1]');

// helper: run a fishday sim to a given minute (auto-resuming checkpoints)
function fishdayAt(cfg, minute) { var s = P.createSim(cfg, 'fishday'), g = 0; while (!s.finished && (s.clockMin || 0) < minute && g++ < 500) { if (s.paused) P.resume(s); P.tick(s); } return s; }
function fishdayEnd(cfg) { var s = P.createSim(cfg, 'fishday'), g = 0; while (!s.finished && g++ < 500) { if (s.paused) P.resume(s); P.tick(s); } return s; }

// boatState: docked at dawn, at sea mid-morning, docked by day's end
var simEnd = fishdayEnd(P.applyAllFixes(base));
ok(P.boatState(P.createSim(base, 'fishday')).param === 0, 'boat docked at dawn (param 0)');
ok(P.boatState(fishdayAt(P.applyAllFixes(base), 660)).atSea, 'boat is at sea mid-morning');
ok(P.boatState(simEnd).param < 0.05, 'boat back at dock by day end');

// stationReadiness: gappy paints red/amber; a clean day paints no red
var srG = P.stationReadiness(fishdayAt(base, 780)), srC = P.stationReadiness(simEnd);
ok(Object.keys(srG).some(function (k) { return srG[k] === 'red' || srG[k] === 'amber'; }), 'gappy fishday paints red/amber territory');
ok(!Object.keys(srC).some(function (k) { return srC[k] === 'red'; }), 'clean fishday paints no red territory');

// cascadeTrace: gappy has a time-ordered fault; a clean plan has none
// MIGRATION (Voyage carryover, 2026-07-13): the clean-cascade side needs + applyDayFix('load')
// too, or the missing jig case still ripples a fault through the cascade.
var ctG = P.cascadeTrace(P.mergePlan(base)), ctC = P.cascadeTrace(P.mergePlan(allFixesLoad));
ok(ctG.hasFault && ctG.hops.length >= 2, 'gappy cascade has a fault (' + ctG.hops.map(function (h) { return h.station; }).join('→') + ')');
ok(!ctC.hasFault && ctC.hops.length === 0, 'clean cascade has no fault');
ok((function () { for (var i = 1; i < ctG.hops.length; i++) if (ctG.hops[i].atMin < ctG.hops[i - 1].atMin) return false; return true; })(), 'cascade hops are time-ordered');

// purity: cosmetic helpers must never perturb the score (no hidden state / no score-RNG)
var scBefore = JSON.stringify(scoreOf(base));
P.ambientActors(1, 0.5); P.cascadeTrace(P.mergePlan(base)); P.stationReadiness(P.createSim(base, 'fishday')); P.boatState(P.createSim(base, 'fishday'));
ok(JSON.stringify(scoreOf(base)) === scBefore, 'cosmetic helpers do not perturb score() (pure)');

console.log('\n=== AUTHORABLE DAYS — daySchedule / scoreDay (§20 + §Voyage) ===');
(function () {
  // MIGRATION (Voyage, 2026-07-13): the hardcoded FIRST_BTB id map is retired — the Voyage
  // program's "return" reshape to Pack & Sail (spec §1) means hd_r_settle/h_r_cash_site's role
  // as "the first back-to-back handoff" is no longer guaranteed to survive the rename/reorder.
  // Replaced with a dynamic finder (producer end === consumer start, first in handoff-array
  // order) that needs no per-seg id at all, so it self-heals across the reshape. Verified to
  // reproduce the exact old ids (h_a_ferry / h_o_weather / h_r_cash_site) against the pre-Voyage
  // engine before this migration landed.
  function firstBackToBack(plan, seg) {
    var tasks = P.tasksForSeg(plan, seg), byId = {};
    tasks.forEach(function (t) { byId[t.id] = t; });
    var hs = P.handoffsForSeg(plan, seg);
    for (var i = 0; i < hs.length; i++) {
      var h = hs[i];
      if (h.trigger && h.trigger.type === 'onTaskDone') {
        var prod = byId[h.trigger.taskId], cons = byId[h.toTaskId];
        if (prod && cons && (prod.startMin + prod.durMin) === cons.startMin) return h.id;
      }
    }
    return null;
  }

  // purity witnesses, captured before any §20 read helper below is called
  var pureBefore = { sc: JSON.stringify(scoreOf(base)), tasks: JSON.stringify(P.mergePlan(base).tasks), days: JSON.stringify(P.mergePlan(base).days) };

  // Voyage: 'load'/'voyage' deliberately NOT folded into this shared generic loop. 'voyage's
  // buddy tasks (t_v_star_*/t_v_esc_*) have NO fixed ownerRoleId (any of the 8 organizers may
  // buddy), which would make sub-test 6's "reassign to p01 must misassign" assumption unsound if
  // the first required task happens to be buddy-owned; keeping 'load' out too avoids this loop
  // (used unmodified by arrival/ops/return since before Voyage) depending on load's unpinned
  // internal task shape. Both new segments' structural/carry/buddy anchors are covered by the
  // dedicated "VOYAGE §1/§2/§3" sections below instead.
  ['arrival', 'ops', 'return'].forEach(function (seg) {
    // 1. per-day 100 anchor: canonDay (via applyDayFix) over the all-fixes cfg reaches a clean 100
    var cfg1 = P.applyDayFix(P.applyAllFixes(base), seg);
    var plan1 = P.mergePlan(cfg1);
    var sd1 = P.scoreDay(plan1, seg);
    ok(sd1.score === 100 && sd1.grade === 'A' && sd1.clean === true && sd1.efficiency === 100,
      seg + ': canonDay reference plan -> scoreDay 100/A/clean/100% eff (' + sd1.score + '/' + sd1.grade + '/' + sd1.clean + '/' + sd1.efficiency + '%)');
    var reqIds = P.tasksForSeg(plan1, seg).filter(function (t) { return t.required !== false; }).map(function (t) { return t.id; });

    // 2. cleared day: every required task unplaced
    var cfg2 = P.applyAllFixes(base);
    cfg2.overrides.days = cfg2.overrides.days || {};
    cfg2.overrides.days[seg] = { placement: {} };
    reqIds.forEach(function (id) { cfg2.overrides.days[seg].placement[id] = null; });
    var plan2 = P.mergePlan(cfg2), ds2 = P.daySchedule(plan2, seg), rd2 = P.dayReadiness(plan2, seg), sd2 = P.scoreDay(plan2, seg);
    ok(sd2.grade === 'D' && sd2.categories.objective === 0 && ds2.unplacedRequired.length === reqIds.length,
      seg + ': clearing all ' + reqIds.length + ' required tasks -> grade D, objective 0, unplacedRequired.length===' + reqIds.length + ' (' + sd2.grade + '/' + sd2.categories.objective + '/' + ds2.unplacedRequired.length + ')');
    ok(rd2.some(function (r) { return r.type === 'UNPLACED_REQUIRED'; }), seg + ': cleared-day readiness hints UNPLACED_REQUIRED');

    // 3. monotone authoring gradient: cleared <= half <= perfect(100), starting from the perfect cfg
    // and clearing the LATER ceil(n/2)..n-1 required ids (so the FIRST ceil(n/2) stay placed)
    var half = Math.ceil(reqIds.length / 2), laterHalf = reqIds.slice(half);
    var cfg3 = P.applyDayFix(P.applyAllFixes(base), seg);
    cfg3.overrides.days[seg].placement = cfg3.overrides.days[seg].placement || {};
    laterHalf.forEach(function (id) { cfg3.overrides.days[seg].placement[id] = null; });
    var sd3 = P.scoreDay(P.mergePlan(cfg3), seg);
    ok(sd2.score <= sd3.score && sd3.score <= sd1.score && sd1.score === 100,
      seg + ': monotone authoring gradient cleared(' + sd2.score + ') <= half(' + sd3.score + ') <= perfect(' + sd1.score + ')');

    // 4. channel pricing survives hour quanta: slow the first back-to-back handoff to 'board' (+30)
    var btbId = firstBackToBack(plan1, seg);
    ok(!!btbId, seg + ': a back-to-back handoff (producer end === consumer start) is found dynamically');
    var cfg4 = P.applyDayFix(P.applyAllFixes(base), seg);
    cfg4.overrides.days[seg].handoffs[btbId] = { channel: 'board' };
    var plan4 = P.mergePlan(cfg4), ds4 = P.daySchedule(plan4, seg), sd4 = P.scoreDay(plan4, seg);
    var lateEntry = ds4.late.filter(function (l) { return l.id === btbId; })[0];
    ok(!!lateEntry && lateEntry.lateMin === 30, seg + ': first back-to-back handoff ' + btbId + ' slowed to board -> late 30 min (' + (lateEntry && lateEntry.lateMin) + ')');
    ok(sd4.categories.info === sd1.categories.info - 3, seg + ': board channel on ' + btbId + ' drops info category by 3 (' + sd1.categories.info + '→' + sd4.categories.info + ')');
    ok(ds4.idleTotal > 0, seg + ': board channel on ' + btbId + ' raises idle minutes (0→' + ds4.idleTotal + ')');

    // 5. decoy placed: place one decoy from the deck onto the board
    var cfg5 = P.applyDayFix(P.applyAllFixes(base), seg);
    var decoyId = P.deckFor(P.mergePlan(cfg5), seg).decoys[0];
    cfg5.overrides.days[seg].placement = cfg5.overrides.days[seg].placement || {};
    cfg5.overrides.days[seg].placement[decoyId] = { startMin: 600, durMin: 60, assignedIds: ['p06'] };
    var plan5 = P.mergePlan(cfg5), ds5 = P.daySchedule(plan5, seg), rd5 = P.dayReadiness(plan5, seg), sd5 = P.scoreDay(plan5, seg);
    ok(ds5.decoysPlaced.length >= 1 && rd5.some(function (r) { return r.type === 'DECOY_PLACED'; }),
      seg + ': placing decoy ' + decoyId + ' -> decoysPlaced>=1 (' + ds5.decoysPlaced.length + ') + DECOY_PLACED hint');
    ok(sd5.clean === false && sd5.score <= 89, seg + ': a placed decoy -> !clean, score<=89 (' + sd5.score + ')');

    // 6. misassignment: reassign a required task to p01 (roleId 'owner', never a per-day ownerRoleId)
    var cfg6 = P.applyDayFix(P.applyAllFixes(base), seg);
    var reqTask6 = P.tasksForSeg(P.mergePlan(cfg6), seg).filter(function (t) { return t.required !== false; })[0];
    cfg6.overrides.days[seg].placement = cfg6.overrides.days[seg].placement || {};
    cfg6.overrides.days[seg].placement[reqTask6.id] = { assignedIds: ['p01'] };
    var plan6 = P.mergePlan(cfg6), ds6 = P.daySchedule(plan6, seg), rd6 = P.dayReadiness(plan6, seg), sd6 = P.scoreDay(plan6, seg);
    ok(ds6.misassigned.length >= 1 && rd6.some(function (r) { return r.type === 'MISASSIGNED'; }),
      seg + ': reassigning ' + reqTask6.id + ' (' + reqTask6.ownerRoleId + ') to p01 -> misassigned>=1 (' + ds6.misassigned.length + ') + MISASSIGNED hint');
    ok(sd6.categories.roles < 15, seg + ': misassignment drops roles category below 15 (' + sd6.categories.roles + ')');

    // 7. double-booking: move the 2nd required task onto the 1st's person and start time
    var cfg7 = P.applyDayFix(P.applyAllFixes(base), seg);
    var dbTasks = P.tasksForSeg(P.mergePlan(cfg7), seg).filter(function (t) { return t.required !== false; });
    cfg7.overrides.days[seg].placement = cfg7.overrides.days[seg].placement || {};
    cfg7.overrides.days[seg].placement[dbTasks[1].id] = { assignedIds: dbTasks[0].assignedIds.slice(), startMin: dbTasks[0].startMin };
    var ds7 = P.daySchedule(P.mergePlan(cfg7), seg);
    ok(ds7.overbookMin > 0, seg + ': double-booking ' + dbTasks[1].id + ' onto ' + dbTasks[0].id + '\'s person/time -> overbookMin>0 (' + ds7.overbookMin + ')');
  });

  // 8. façade equality (fishday): daySchedule('fishday') delegates to (and matches) fishdaySchedule()
  // MIGRATION (Voyage carryover, 2026-07-13): uses baseL (load authored) to reproduce the
  // pre-Voyage 1450/68% pins verbatim (raw `base` also stalls on the missing jig case: 1590/66%).
  var fdPlan = P.mergePlan(baseL);
  var dsFacade = P.daySchedule(fdPlan, 'fishday'), fdFacade = P.fishdaySchedule(fdPlan);
  ok(dsFacade.idleTotal === fdFacade.idleTotal && fdFacade.idleTotal === 1450,
    'daySchedule(fishday).idleTotal === fishdaySchedule().idleTotal === 1450 (' + dsFacade.idleTotal + '/' + fdFacade.idleTotal + ')');
  ok(dsFacade.efficiency === 68, 'daySchedule(fishday).efficiency === 68 (' + dsFacade.efficiency + '%)');

  // 9. purity: the §20 read helpers (daySchedule/scoreDay/dayReadiness/deckFor) never perturb
  // score()/plan.tasks/plan.days, for any of the four authorable segs
  P.AUTHORABLE.forEach(function (seg) {
    P.daySchedule(P.mergePlan(base), seg);
    P.scoreDay(P.mergePlan(base), seg);
    P.dayReadiness(P.mergePlan(base), seg);
    P.deckFor(P.mergePlan(base), seg);
  });
  var pureAfter = { sc: JSON.stringify(scoreOf(base)), tasks: JSON.stringify(P.mergePlan(base).tasks), days: JSON.stringify(P.mergePlan(base).days) };
  ok(pureBefore.sc === pureAfter.sc, '§20 read helpers do not perturb score() (pure)');
  ok(pureBefore.tasks === pureAfter.tasks, '§20 read helpers do not mutate plan.tasks (pure)');
  ok(pureBefore.days === pureAfter.days, '§20 read helpers do not mutate plan.days (pure)');
})();

console.log('\n=== §20 REVIEW FIXES — fishday stays timing+arrows-only; coarse atMinute handoffs stay honest ===');
(function () {
  // ---- Fix A: no engine-level public flow ever empties a fishday task's crew. The §20 editor's
  // deck/unplace/Clear-day/drag-to-deck/Delete capabilities are gated OFF fishday entirely at the
  // app layer (app.js); this pins the invariant those gates depend on staying true at the engine
  // level, across every public entry point that touches a plan or runs a sim. ----
  function allFishdayPlaced(plan) { return P.fishdayTasks(plan).every(function (t) { return P.isPlaced(t); }); }
  ok(allFishdayPlaced(P.mergePlan(base)), 'gappy baseline: every fishday task is placed (assignedIds.length > 0)');
  ok(allFishdayPlaced(P.mergePlan(P.applyAllFixes(base))), 'all-fixes plan: every fishday task stays placed');
  var ranSim = fishRun(P.applyAllFixes(base));
  ok(allFishdayPlaced(ranSim.plan), 'a full checkpoint-paused fishday run never empties a task\'s crew (createSim/tick)');
  var isim2 = P.createSim(base, 'fishday'); P.intervene(isim2, 'ic_tackle', 'specialist');
  ok(allFishdayPlaced(isim2.plan), 'intervene() (checkpoint hand-feed) never touches assignedIds either');

  // contrast: the generic overrides.staffing channel (shared with the classic day tasks) COULD
  // technically empty a fishday task's crew if something ever constructed that override — and
  // daySchedule would silently drop the task from scoring and IMPROVE the ledger, hiding its idle
  // liability. This is precisely the exploit Fix A closes off at the UI layer (app.js never
  // constructs this override while daySel==='fishday'); pinned here so the risk stays documented
  // and any future engine change that made unplacing MORE attractive would be caught.
  var gfd2 = P.fishdaySchedule(P.mergePlan(base));
  var emptiedPlan = P.mergePlan({ seed: 1, overrides: { staffing: { t_f_gearload: [] } } });
  var emptiedFd = P.fishdaySchedule(emptiedPlan);
  ok(!emptiedFd.byTask.hasOwnProperty('t_f_gearload') && emptiedFd.idleTotal < gfd2.idleTotal && emptiedFd.efficiency > gfd2.efficiency,
    'unplacing a gappy fishday task HIDES its liability and improves the score (idle ' + gfd2.idleTotal + '→' + emptiedFd.idleTotal + ', eff ' + gfd2.efficiency + '%→' + emptiedFd.efficiency + '%) — exactly why app.js gates this off fishday (Fix A)');

  // ---- Fix E: an atMinute coarse (arrival/ops/return) handoff whose producer is moved later
  // re-scores as LATE, not clean — the engine-side half of the reclamp contract app.js now runs for
  // coarse days too (mirroring the existing fishday self-heal). onTaskDone triggers already re-clamp
  // DYNAMICALLY inside the cascade (eff[...].end); atMinute triggers do not — so once the producer
  // moves and its atMinute send is re-clamped forward to the new finish (exactly what app.js's
  // reclampArrows now writes for coarse days too), the engine must bill the resulting lateness
  // against the (unmoved) consumer — never score it as a free on-time pass. ----
  var cfgAtm = P.applyDayFix(P.applyAllFixes(base), 'ops');
  cfgAtm.overrides.days.ops.placement = cfgAtm.overrides.days.ops.placement || {};
  cfgAtm.overrides.days.ops.placement.hd_o_weather = { startMin: 330 };  // was 300 -> finish 360; now finish 390
  cfgAtm.overrides.days.ops.handoffs.h_o_weather = { trigger: { type: 'atMinute', value: 390 }, channel: 'faceToFace' };  // re-clamped to the new finish
  var planAtm = P.mergePlan(cfgAtm), dsAtm = P.daySchedule(planAtm, 'ops'), sdAtm = P.scoreDay(planAtm, 'ops');
  var lateAtm = dsAtm.late.filter(function (l) { return l.id === 'h_o_weather'; })[0];
  ok(!!lateAtm && lateAtm.lateMin === 30, 'ops: producer hd_o_weather moved +30min, atMinute handoff re-clamped to its new finish -> re-scores 30min late (' + (lateAtm && lateAtm.lateMin) + ')');
  ok(sdAtm.clean === false && sdAtm.score <= 89, 'ops: the re-clamped late handoff breaks clean, capping score <= 89 (' + sdAtm.score + ')');
})();

console.log('\n=== SEAT ASSIGNMENT — overrides.seats bijection (default = no-op; reassignment is person-agnostic) ===');
(function () {
  var ID = { owner: 'p01', pm: 'p02', siteLead: 'p03', budgetLead: 'p04', safetyLead: 'p05', logi: 'p06', comms: 'p07', specialist: 'p08' };
  var order = ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'specialist'];
  function part(pl, id) { return pl.participants.filter(function (p) { return p.id === id; })[0]; }
  // (a) identity seats == no overrides, byte-for-byte (the CRITICAL default-reproduces-today invariant)
  ok(JSON.stringify(P.mergePlan({ seed: 1, overrides: {} })) === JSON.stringify(P.mergePlan({ seed: 1, overrides: { seats: ID } })),
    'identity overrides.seats deep-equals the default merged plan (byte-identical)');
  // a malformed (non-bijection) overrides.seats is ignored -> the default seating stands
  ok(JSON.stringify(P.mergePlan({ seed: 1, overrides: { seats: { owner: 'p01', pm: 'p01', siteLead: 'p03', budgetLead: 'p04', safetyLead: 'p05', logi: 'p06', comms: 'p07', specialist: 'p08' } } })) === JSON.stringify(P.mergePlan({ seed: 1, overrides: {} })),
    'malformed (double-booked) overrides.seats is ignored -> default merged plan');
  // (b) swap logi <-> specialist propagates holder + roleId + assignedIds together
  var swap = {}; order.forEach(function (r) { swap[r] = ID[r]; }); swap.logi = 'p08'; swap.specialist = 'p06';
  var pls = P.mergePlan({ seed: 1, overrides: { seats: swap } });
  ok(pls.roles.logi.holder === 'p08' && pls.roles.specialist.holder === 'p06', 'swap: role holders move (logi=p08, specialist=p06)');
  ok(part(pls, 'p08').roleId === 'logi' && part(pls, 'p06').roleId === 'specialist', 'swap: participant.roleId follows the seat');
  var st = pls.tasks.filter(function (t) { return t.day === 'fishday' && t.ownerRoleId === 'specialist' && t.assignedIds.length; })[0];
  ok(st && st.assignedIds.indexOf('p06') >= 0 && st.assignedIds.indexOf('p08') < 0, 'swap: specialist fishday task assignedIds -> p06 (not p08)');
  ok(pls.roles.logi.deputyId === 'p06', 'swap: logi deputyId (default p08) follows the seat -> p06');
  ok(pls.roles.chef.deputyId === 'p10', 'swap: chef deputyId (p10) untouched — outside the 8-seat domain');
  // (c) a full cyclic derangement keeps the coarse-day misassigned check empty (the likeliest silent regression)
  var pids = order.map(function (r) { return ID[r]; }), der = {};
  order.forEach(function (r, i) { der[r] = pids[(i + 1) % 8]; });
  ['arrival', 'ops', 'return'].forEach(function (seg) {
    var ds = P.daySchedule(P.mergePlan({ seed: 1, overrides: { seats: der } }), seg);
    ok(ds.misassigned.length === 0, 'derangement: daySchedule(' + seg + ').misassigned is empty (' + ds.misassigned.length + ')');
  });
  // (d) the win is person-agnostic: all-fixes fishday + full classic run score identically under a derangement
  // MIGRATION (Voyage carryover, 2026-07-13): "all-fixes" now means allFixesLoad (8 classic
  // fixes + applyDayFix('load')) — applyAllFixes alone leaves the jig case missing (idle>0).
  var fdDef = P.fishdaySchedule(P.mergePlan(allFixesLoad));
  var derCfg = P.applyDayFix(P.applyAllFixes(base), 'load'); derCfg.overrides.seats = der;
  var fdDer = P.fishdaySchedule(P.mergePlan(derCfg));
  ok(fdDef.idleTotal === 0 && fdDef.efficiency === 100, 'all-fixes fishday is a clean win by default (idle 0, eff 100)');
  ok(fdDer.idleTotal === fdDef.idleTotal && fdDer.efficiency === fdDef.efficiency && fdDer.dinnerMin === fdDef.dinnerMin,
    'derangement: fishday idle/eff/dinner identical to default (person-agnostic)');
  var dS = scoreOf(derCfg), aS = scoreOf(allFixesLoad);
  ok(dS.grade === aS.grade && dS.score === aS.score && JSON.stringify(dS.categories) === JSON.stringify(aS.categories),
    'derangement: classic-run grade/score/categories identical to all-fixes default (aggregate person-agnostic; per-person individuals[] legitimately differ)');
  // (e) a player's explicit coarse-day deck placement (authored in current-holder pids) is EXEMPT from the seat
  // remap — no double-shift, no phantom MISASSIGNED (the reseat + Task-Deck interaction bug the review caught)
  var sw2 = {}; order.forEach(function (r) { sw2[r] = ID[r]; }); sw2.owner = 'p02'; sw2.pm = 'p01';
  var plP = P.mergePlan({ seed: 1, overrides: { seats: sw2, days: { arrival: { placement: { hd_a_ferrycheck: { assignedIds: ['p01'] } } } } } });
  var ftk = plP.days.arrival.tasks.filter(function (t) { return t.id === 'hd_a_ferrycheck'; })[0];
  ok(ftk && ftk.assignedIds.length === 1 && ftk.assignedIds[0] === 'p01', 'reseat + placement: player-placed coarse task keeps its current-holder pid (no double-remap)');
  ok(P.daySchedule(plP, 'arrival').misassigned.length === 0, 'reseat + placement: no phantom MISASSIGNED');
})();

// ============================================================================
// COARSE-DAY ANIMATION — opt-in minute-sim for arrival/ops/return (§21.12)
// The 3rd-arg {animate:true} flips a coarse day onto the minute clock so it plays
// (people move, pause-on-stall) like the fishday. The 2-arg createSim (used
// everywhere else in this file) MUST stay the classic day clock, byte-for-byte —
// that is the whole verify-safety of the change, so it is asserted per segment.
// ============================================================================
console.log('\n=== COARSE-DAY ANIMATION — opt-in minute-sim (§21.12) ===');
(function () {
  // Every authored segment now carries its full physical-route chain. Keep this check
  // data-driven: the seed may intentionally leave required cards unplaced, while every
  // placed card must still have a solved animation row and every canonical day must run
  // without a live handoff stall.
  ['arrival', 'ops', 'return'].forEach(function (seg) {
    var anim = P.createSim(base, seg, { animate: true });
    ok(anim.mode === 'minute', 'coarse ' + seg + ': {animate:true} => minute-clock sim');
    ok(P.createSim(base, seg).mode !== 'minute', 'coarse ' + seg + ': 2-arg createSim stays the classic day clock (verify-safe gate)');
    if (seg === 'arrival') {
      var arrivalPlaced = Object.keys(P.daySchedule(P.mergePlan(base), seg).byTask).length;
      ok(anim.tasks.length === arrivalPlaced && anim.tasks.every(function (t) { return anim.sched.byTask[t.id]; }),
        'coarse arrival: every placed route task animates with a solved schedule row (' + anim.tasks.length + ')');
      ok(P.dayReadiness(P.mergePlan(base), seg).some(function (r) { return r.type === 'UNPLACED_REQUIRED'; }),
        'coarse arrival: dayReadiness flags UNPLACED_REQUIRED for the still-unplaced tasks');
    } else {
      ok(anim.tasks.length > 0 && anim.tasks.every(function (t) { return anim.sched.byTask[t.id]; }),
        'coarse ' + seg + ': every animated task is scheduled (sim.tasks <-> sched.byTask lock-step)');
    }
    ok(anim.clockMin === anim.winStart && anim.winEnd > anim.winStart, 'coarse ' + seg + ': clock starts at the segment window start');
    // Seeded (gappy) day: someone stalls on a gap -> pauses on cp_stall. The
    // return canvas spans more than a day, so derive the guard from its window.
    var g = 0, stalls = 0, guardLimit = Math.ceil((anim.winEnd - anim.winStart) / P.MIN_DT) + 100;
    while (!anim.finished && g < guardLimit) { P.tick(anim); if (anim.paused) { if (anim.checkpoint.id === 'cp_stall') stalls++; P.resume(anim); } g++; }
    ok(anim.finished, 'coarse ' + seg + ': runs to a finish');
    ok(stalls > 0, 'coarse ' + seg + ' (seeded gaps): pauses on a cp_stall at least once');
    // auto-arranged arrows + restored placements -> no handoff stall -> zero pauses, 100% efficiency
    var cfg = P.applyDayFix(base, seg), clean = P.createSim(cfg, seg, { animate: true }), g2 = 0, p2 = 0;
    var cleanGuard = Math.ceil((clean.winEnd - clean.winStart) / P.MIN_DT) + 100;
    while (!clean.finished && g2 < cleanGuard) { P.tick(clean); if (clean.paused) { p2++; P.resume(clean); } g2++; }
    ok(p2 === 0, 'coarse ' + seg + ' (auto-arranged arrows): no stall pause');
    ok(P.scoreDay(P.mergePlan(cfg), seg).efficiency === 100, 'coarse ' + seg + ' (auto-arranged): scoreDay efficiency 100%');
  });
  ok(P.createSim(base, 'fishday').mode === 'minute', 'fishday is still a minute-sim without opts (coarse gate leaves it alone)');
  // intervene on a coarse animated sim re-solves via daySchedule + logs the hand-feed
  var isim = P.createSim(base, 'arrival', { animate: true }), gi = 0;
  while (!isim.paused && !isim.finished && gi < 400) { P.tick(isim); gi++; }
  var hf = isim.handFed || 0; P.intervene(isim, 'ic_ferry', 'pm');
  ok((isim.handFed || 0) === hf + 1 && isim.sched && isim.sched.byTask, 'coarse arrival: intervene re-solves the schedule + increments handFed');
})();

// ============================================================================
// SCORING BLUEPRINT §13 — P1 structural: scoreTrip(plan)/tripEfficiency(plan).
// P1 changes NO content/seed, so this asserts STRUCTURE only (Sigma maxPts, the
// bucket/dimension weight table, determinism, purity) — never canonical-earns-100
// or any gradient (that is a P2 anchor, once the 5 make-real atoms + Owner/PM
// flex lanes + seed re-tune land). The existing 196 checks above stay untouched.
// ============================================================================
console.log('\n=== SCORING BLUEPRINT §13 — scoreTrip/tripEfficiency (P1 structural) ===');
(function () {
  var canon = P.mergePlan(P.applyAllFixes(base));
  var st1 = P.scoreTrip(canon);

  var sumMax = 0; st1.atoms.forEach(function (a) { sumMax += a.maxPts; });
  ok(sumMax === 100, 'scoreTrip: Sigma atoms.maxPts === 100 exactly (' + sumMax + ')');

  // MIGRATION (Voyage, 2026-07-13): the old exact 5-key byBucket/byDimension equalities are
  // retired here — the Voyage program grows the matrix to 7 buckets (+load +voyage, spec §4),
  // rebalancing every existing cell. Only the sum invariant is checked in this P1-era block now;
  // the exact re-packed per-bucket/per-dimension values (with the integrator-PINS estimates) live
  // in the dedicated "VOYAGE — the re-derived constitution (§4)" section below.
  var bb = {}; for (var k in st1.byBucket) bb[k] = st1.byBucket[k].maxPts;
  var bbSum = 0; for (var kbb in bb) bbSum += bb[kbb];
  ok(bbSum === 100, 'scoreTrip: byBucket maxPts sums to exactly 100 across all buckets (' + JSON.stringify(bb) + ')');

  var bd = {}; for (var k2 in st1.byDimension) bd[k2] = st1.byDimension[k2].maxPts;
  var bdSum = 0; for (var kbd in bd) bdSum += bd[kbd];
  ok(bdSum === 100, 'scoreTrip: byDimension maxPts sums to exactly 100 across all dimensions (' + JSON.stringify(bd) + ')');

  // the maxPts inventory is TEMPLATE-derived (§6 "never the player's plan") — the same
  // Sigma=100 holds on the gappy baseline too, not just the canonical/all-fixes plan
  var stGappy = P.scoreTrip(P.mergePlan(base));
  var sumMaxGappy = 0; stGappy.atoms.forEach(function (a) { sumMaxGappy += a.maxPts; });
  ok(sumMaxGappy === 100, 'scoreTrip: Sigma maxPts === 100 on the gappy baseline too (template-priced, not plan-priced)');

  // determinism: two calls on the same (merged) plan return byte-identical output
  var d1 = JSON.stringify(P.scoreTrip(canon)), d2 = JSON.stringify(P.scoreTrip(canon));
  ok(d1 === d2, 'scoreTrip: determinism — two calls on the same plan are byte-identical');
  var e1 = P.tripEfficiency(canon), e2 = P.tripEfficiency(canon);
  ok(e1 === e2 && typeof e1 === 'number' && e1 >= 0 && e1 <= 100, 'tripEfficiency: determinism + returns an int 0..100 (' + e1 + ')');

  // purity: neither function perturbs score()/createSim() output, nor mutates its plan argument
  var planBefore = JSON.stringify(canon);
  var scoreBefore = JSON.stringify(P.score(P.createSim(P.applyAllFixes(base))));
  P.scoreTrip(canon); P.tripEfficiency(canon);
  var planAfter = JSON.stringify(canon);
  var scoreAfter = JSON.stringify(P.score(P.createSim(P.applyAllFixes(base))));
  ok(planBefore === planAfter, 'scoreTrip/tripEfficiency: do not mutate the plan they were given');
  ok(scoreBefore === scoreAfter, 'scoreTrip/tripEfficiency: do not perturb score(createSim(...)) (pure)');

  // shape sanity (§13.2 frozen contract): the fields the report/UI will read
  ok(typeof st1.total === 'number' && st1.total >= 0 && st1.total <= 100, 'scoreTrip: total is an int 0..100 (' + st1.total + ')');
  ok(['A', 'B', 'C', 'D'].indexOf(st1.grade) >= 0, 'scoreTrip: grade is one of A/B/C/D (' + st1.grade + ')');
  ok(typeof st1.gate.clean === 'boolean' && typeof st1.gate.withheldA === 'boolean', 'scoreTrip: gate.{clean,withheldA} are booleans');
  ok(st1.atoms.length > 0 && st1.atoms.every(function (a) { return a.id && a.bucket && a.dimension && a.itemRef && typeof a.maxPts === 'number' && typeof a.earned === 'number' && a.status && a.reasonKey; }),
    'scoreTrip: every atom carries {id,bucket,dimension,itemRef,maxPts,earned,status,reasonKey} (' + st1.atoms.length + ' atoms)');

  // §13.3 / v1.0 §7.4 — every reasonKey is drawn from the fixed template set (no free text, no
  // typos). scr_people_ok/scr_people_overload are v1.0-new (frame_load_relief no longer borrows
  // an exec reasonKey — its own People-dimension reason family).
  var RK = { scr_info_ok: 1, scr_info_late: 1, scr_info_missing: 1, scr_info_drawn_late: 1, scr_exec_ok: 1, scr_exec_unstaffed: 1, scr_exec_misassigned: 1, scr_exec_overlap: 1, scr_exec_compressed: 1, scr_exec_broken: 1, scr_safety_ok: 1, scr_safety_gap: 1, scr_qual_ok: 1, scr_qual_fail: 1, scr_money_ok: 1, scr_money_gap: 1, scr_decoy: 1, scr_people_ok: 1, scr_people_overload: 1 };
  ok(st1.atoms.every(function (a) { return RK[a.reasonKey]; }) && P.scoreTrip(P.mergePlan(base)).atoms.every(function (a) { return RK[a.reasonKey]; }),
    'scoreTrip: every reasonKey is from the fixed §13.3/§7.4 set (canonical + gappy)');
  // §13.2 — itemRef.type is one of lane|socket|gate|decoy|frame
  var IT = { lane: 1, socket: 1, gate: 1, decoy: 1, frame: 1 };
  ok(st1.atoms.every(function (a) { return IT[a.itemRef.type]; }), 'scoreTrip: every itemRef.type is lane|socket|gate|decoy|frame');

  // frame_load_relief uses the People-specific reason keys (never a borrowed exec key): on the
  // true canonical (rebalance applied) it earns full with scr_people_ok; on the gappy seed
  // (rebalance NOT applied -> the 'fatigue' detector is live) it earns 0 with scr_people_overload.
  var lrCanon = P.scoreTrip(P.mergePlan(P.applyAllFixes(base))).atoms.filter(function (a) { return a.id === 'frame_load_relief'; })[0];
  ok(!!lrCanon && lrCanon.earned === lrCanon.maxPts && lrCanon.reasonKey === 'scr_people_ok',
    'frame_load_relief: canonical (rebalance applied) -> earns its full pts, reasonKey scr_people_ok (' + (lrCanon && lrCanon.reasonKey) + ')');
  var lrGappy = P.scoreTrip(P.mergePlan(base)).atoms.filter(function (a) { return a.id === 'frame_load_relief'; })[0];
  ok(!!lrGappy && lrGappy.earned === 0 && lrGappy.reasonKey === 'scr_people_overload',
    'frame_load_relief: gappy (no rebalance, fatigue detector live) -> earned 0, reasonKey scr_people_overload (' + (lrGappy && lrGappy.reasonKey) + ')');
  // false-credit guard: a wrong-role fishday lane task must LOSE its exec point. daySchedule flags
  // misassigned[] on every seg, but dayReadiness surfaces MISASSIGNED on coarse segs only — so the
  // lane atom reads the schedule directly, else a wrong-role Day-3 placement keeps full exec credit.
  var chefBefore = st1.atoms.filter(function (a) { return a.id === 'fishday_exec_chef'; })[0];
  var misCfg = P.applyAllFixes({ seed: 1, overrides: {} }); misCfg.overrides.staffing = misCfg.overrides.staffing || {}; misCfg.overrides.staffing.t_f_cook = ['p01'];
  var chefAfter = P.scoreTrip(P.mergePlan(misCfg)).atoms.filter(function (a) { return a.id === 'fishday_exec_chef'; })[0];
  ok(chefBefore.earned === 1 && chefAfter.earned === 0 && chefAfter.reasonKey === 'scr_exec_misassigned',
    'scoreTrip: a wrong-role fishday lane task loses its exec point (misassign caught on Day 3, not only coarse days)');
})();

// ============================================================================
// SCORING BLUEPRINT §13 — P2a: the 7 formerly-stubbed atoms are now real (§13.1),
// plus the true canonical (all classic fixes + all three per-day canonDay fixes)
// reaches scoreTrip 100/A/clean with every atom at its max — the P2 anchor §13.4
// promised once the make-real content + owner/pm flex lanes landed.
// ============================================================================
console.log('\n=== SCORING BLUEPRINT §13 — P2a make-real atoms (earn on canonical, fail on broken) ===');
(function () {
  // MIGRATION (Voyage, 2026-07-13): 'load'/'voyage' folded into the canonical-reference recipe
  // — without authoring them too, the true canonical no longer totals 100 under the re-packed
  // Voyage matrix (their seed gaps would survive unaddressed).
  function trueCanonCfg() {
    var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
    ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (s) { cfg = P.applyDayFix(cfg, s); });
    return cfg;
  }
  function atomOf(atoms, id) { return atoms.filter(function (a) { return a.id === id; })[0]; }

  var canonCfg = trueCanonCfg();
  var canonPlan = P.mergePlan(canonCfg);
  var t = P.scoreTrip(canonPlan);

  // the frozen acceptance anchor (task §2): true canonical -> 100/A/clean, every atom at its max
  ok(t.total === 100 && t.grade === 'A' && t.gate.clean === true,
    'scoreTrip: true canonical (all fixes + all 3 canonDay) -> 100/A/clean (' + t.total + '/' + t.grade + '/' + t.gate.clean + ')');
  ok(t.atoms.every(function (a) { return a.earned === a.maxPts; }),
    'scoreTrip: true canonical -> every atom earns its maxPts exactly (no surviving gap)');

  // MIGRATION (Voyage §4.1 senior-dev gate ruling — RATIFIED retirements): fishday_exec_owner and
  // fishday_exec_pm no longer exist — the owner/pm fishday tasks are flex/standby lanes, exempt
  // from exec-lane pricing entirely (§4.1 "the owner/pm fishday flex lanes... flex-standby
  // exemption"). fishday_quality_portions is also retired (§4.1 "the defensive portions quality
  // atom" — it could never fail on a well-formed plan). Replaced below with equivalent behavioral
  // pins on SURVIVING atoms, per the gate ruling's own suggestion: the allergy quality atom (kept
  // unchanged) plus one representative fishday exec lane (fishday_exec_siteLead).
  var MAKE_REAL = ['frame_hospital_shared', 'frame_abort_night', 'fishday_safety_t_f_health',
    'fishday_quality_allergy', 'fishday_exec_siteLead'];
  MAKE_REAL.forEach(function (id) {
    var a = atomOf(t.atoms, id);
    ok(!!a && a.earned === a.maxPts && a.earned > 0, id + ': earns its full ' + (a && a.maxPts) + ' pts on the true canonical (' + (a && a.earned) + ')');
  });

  // 1. fishday_exec_specialist: unstaffing a surviving fishday exec-lane task loses its point.
  // MIGRATION: replaces the retired fishday_exec_owner/t_f_flex_owner pin (that lane no longer
  // exists — flex tasks are priced-exempt) with the identical "unstaffed -> earned 0" behavior on
  // a lane that still exists.
  var brk1 = trueCanonCfg(); brk1.overrides.staffing = brk1.overrides.staffing || {}; brk1.overrides.staffing.t_f_gearload = [];
  var a1 = atomOf(P.scoreTrip(P.mergePlan(brk1)).atoms, 'fishday_exec_specialist');
  ok(!!a1 && a1.earned === 0 && a1.reasonKey === 'scr_exec_unstaffed', 'fishday_exec_specialist: unstaffing t_f_gearload -> earned 0 (' + (a1 && a1.reasonKey) + ')');

  // 2. fishday_exec_siteLead: misassigning a surviving fishday exec-lane task to the wrong role
  // loses its point. MIGRATION: replaces the retired fishday_exec_pm/t_f_flex_pm pin the same way.
  var brk2 = trueCanonCfg(); brk2.overrides.staffing = brk2.overrides.staffing || {}; brk2.overrides.staffing.t_f_route = ['p08'];
  var a2 = atomOf(P.scoreTrip(P.mergePlan(brk2)).atoms, 'fishday_exec_siteLead');
  ok(!!a2 && a2.earned === 0 && a2.reasonKey === 'scr_exec_misassigned', 'fishday_exec_siteLead: reassigning t_f_route to specialist p08 -> earned 0 (' + (a2 && a2.reasonKey) + ')');

  // 3. frame_hospital_shared: dropping a needed recipient loses the point
  var brk3 = trueCanonCfg(); brk3.overrides.info = brk3.overrides.info || {}; brk3.overrides.info.ic_hospital = { recipientRoleIds: ['pm', 'siteLead'] };
  var a3 = atomOf(P.scoreTrip(P.mergePlan(brk3)).atoms, 'frame_hospital_shared');
  ok(!!a3 && a3.earned === 0 && a3.reasonKey === 'scr_safety_gap', 'frame_hospital_shared: ic_hospital not shared to comms/safetyLead -> earned 0 (' + (a3 && a3.reasonKey) + ')');

  // 4. frame_abort_night: clearing rk_night's abort criterion loses the point (rk_sea untouched)
  var brk4 = trueCanonCfg(); brk4.overrides.risks = brk4.overrides.risks || {}; brk4.overrides.risks.rk_night = { abortCriterion: null };
  var st4 = P.scoreTrip(P.mergePlan(brk4));
  var a4 = atomOf(st4.atoms, 'frame_abort_night'), a4sea = atomOf(st4.atoms, 'frame_abort_sea');
  ok(!!a4 && !!a4sea && a4.earned === 0 && a4.reasonKey === 'scr_safety_gap' && a4sea.earned === a4sea.maxPts,
    'frame_abort_night: clearing rk_night.abortCriterion -> earned 0, frame_abort_sea unaffected (' + (a4 && a4.reasonKey) + ')');

  // 5. fishday_safety_t_f_health: unstaffing t_f_health loses the point
  var brk5 = trueCanonCfg(); brk5.overrides.staffing = brk5.overrides.staffing || {}; brk5.overrides.staffing.t_f_health = [];
  var a5 = atomOf(P.scoreTrip(P.mergePlan(brk5)).atoms, 'fishday_safety_t_f_health');
  ok(!!a5 && a5.earned === 0 && a5.reasonKey === 'scr_safety_gap', 'fishday_safety_t_f_health: unstaffing t_f_health -> earned 0 (' + (a5 && a5.reasonKey) + ')');

  // 6. fishday_quality_allergy: committing the menu to a species in the allergen CATEGORY
  // (refinement-1: 'shrimp' -> category 'shellfish', which intersects ic_food.allergens —
  // exercises the real species->category path, not a literal species/category string match)
  var brk6 = trueCanonCfg(); brk6.overrides.info = brk6.overrides.info || {}; brk6.overrides.info.ic_menu = { species: 'shrimp' };
  var a6 = atomOf(P.scoreTrip(P.mergePlan(brk6)).atoms, 'fishday_quality_allergy');
  ok(!!a6 && a6.earned === 0 && a6.reasonKey === 'scr_qual_fail', 'fishday_quality_allergy: menu species set to shrimp (category shellfish, the allergen) -> earned 0 (' + (a6 && a6.reasonKey) + ')');

  // purity: none of these broken-plan constructions perturbed the true canonical's own score
  ok(P.scoreTrip(canonPlan).total === 100, 'scoreTrip: true canonical still scores 100 after constructing the 7 broken variants (pure)');
})();

// ============================================================================
// SCORING BLUEPRINT §7/§13.4 — P2 numeric: the re-tuned seed (Arrival pre-cleared +
// most fishday arrows withheld) lands the gappy trip in the D band, and drawing the
// fishday information arrows (fixHandoffs) is the single LARGEST jump toward 100 —
// bigger than authoring Arrival (applyDayFix) and bigger than any one classic fix.
// ============================================================================
console.log('\n=== SCORING BLUEPRINT §7/§13.4 — P2 numeric: gappy D-band + arrow-draw is the biggest jump ===');
(function () {
  var gappyPlan = P.mergePlan(base);
  var g = P.scoreTrip(gappyPlan);
  console.log('  gappy scoreTrip:', g.total, '/', g.grade, JSON.stringify(g.byBucket));
  // v1.0 §6/§8: band assertions ("<60", "~50 target") are retired now that the exact seed value
  // is pinned (see the "SCORING RUBRIC v1.0 §8" section below, PINS.gappySeed).
  ok(g.grade === 'D', 'scoreTrip: gappy trip grades D (' + g.grade + ')');
  ok(g.gate.clean === false, 'scoreTrip: gappy trip is not clean');

  var CLASSIC = ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn'];
  var deltas = {};
  CLASSIC.forEach(function (fx) { deltas[fx] = P.scoreTrip(P.mergePlan(P.applyFix(base, fx))).total - g.total; });
  deltas.applyDayFix_arrival = P.scoreTrip(P.mergePlan(P.applyDayFix(base, 'arrival'))).total - g.total;
  deltas.fixHandoffs = P.scoreTrip(P.mergePlan(P.applyFix(base, 'fixHandoffs'))).total - g.total;
  console.log('  per-fix score deltas from gappy:', JSON.stringify(deltas));

  var maxOtherDelta = Math.max.apply(null, CLASSIC.map(function (fx) { return deltas[fx]; }).concat([deltas.applyDayFix_arrival]));
  ok(deltas.fixHandoffs > maxOtherDelta,
    'fixHandoffs delta (+' + deltas.fixHandoffs + ') is the single largest jump — bigger than authoring Arrival (+' +
    deltas.applyDayFix_arrival + ') and every classic fix (max +' + Math.max.apply(null, CLASSIC.map(function (fx) { return deltas[fx]; })) + ')');
  ok(deltas.fixHandoffs > deltas.applyDayFix_arrival, 'fixHandoffs (+' + deltas.fixHandoffs + ') beats applyDayFix(arrival) (+' + deltas.applyDayFix_arrival + ') specifically');

  // the true canonical (all classic fixes + all 5 canonDay days, MIGRATION Voyage 2026-07-13:
  // 'load'/'voyage' added alongside arrival/ops/return) still reaches 100/A/clean — re-affirmed
  // here alongside the gradient numbers (already anchored in the P2a block above)
  var canonCfg2 = P.applyAllFixes({ seed: 1, overrides: {} });
  ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (s) { canonCfg2 = P.applyDayFix(canonCfg2, s); });
  var t2 = P.scoreTrip(P.mergePlan(canonCfg2));
  ok(t2.total === 100 && t2.grade === 'A' && t2.gate.clean === true, 'scoreTrip: canonical still 100/A/clean under the re-tuned seed (' + t2.total + '/' + t2.grade + ')');
})();

// ============================================================================
// SCORING RUBRIC v1.0 — §8 the pinned constitution (spec 2026-07-10-scoring-rubric-v1-design.md
// §6 seed contract + §8 verification contract). Items (2) Sigma maxPts===100 and (3) both matrix
// axes exact are ALREADY asserted above (the P1-structural block) and are not repeated here.
// Everything else — atom count, the Sigma-earned-clamped identity, the exact PINS, the monotone
// ladder, and the three constructed recipes (withheldA / drawn-but-late / redundant-arrow) — is
// new and lives in this one section, per plan Task W1-T2 Step 3.
// ============================================================================
console.log('\n=== SCORING RUBRIC v1.0 §8 — the pinned constitution ===');
(function () {
  function sumEarnedClamped(atoms) {
    var s = 0; atoms.forEach(function (a) { s += a.earned; });
    return Math.max(0, s);
  }
  function atomOf(atoms, id) { return atoms.filter(function (a) { return a.id === id; })[0]; }
  // MIGRATION (Voyage, 2026-07-13): 'load'/'voyage' folded into the canonical recipe — see the
  // identical note on the P2a block's copy of this helper.
  function trueCanonCfg() {
    var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
    ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (s) { cfg = P.applyDayFix(cfg, s); });
    return cfg;
  }

  // MIGRATION (Voyage, 2026-07-13): the rubric-v1.0 PINS object (gappySeed 54, a 5-key
  // gappyBuckets, fixHandoffsJump 18, tripEffGappy 81) is RETIRED here — the Voyage program adds
  // seed gaps to load/voyage and rebalances the whole matrix, so none of those exact numbers can
  // survive unchanged. The re-measured exact pins (once W1a lands) belong in the dedicated
  // "VOYAGE — the re-derived constitution (§4)" section below (its own PINS_VOYAGE object,
  // same estimate-now/integrator-finalizes contract). What stays checkable WITHOUT exact numbers
  // is kept below: atom-count consistency, the Sigma-earned identity, and the qualitative shape
  // of the seed (D-band, some positive fixHandoffs jump, a legal 0..100 efficiency).

  var gappyPlan = P.mergePlan(base);
  var g = P.scoreTrip(gappyPlan);
  var canonCfg = trueCanonCfg();
  var canonPlan = P.mergePlan(canonCfg);
  var t = P.scoreTrip(canonPlan);

  // (1) atom count is template-derived (not plan-derived) — gappy and canonical carry the
  // IDENTICAL inventory. The exact count (89 pre-Voyage) grows once load/voyage/carry/buddy
  // atoms land; only cross-plan consistency is pinned here, the exact new count is an
  // integrator-PINS estimate in the Voyage constitution section below.
  ok(g.atoms.length === t.atoms.length && g.atoms.length > 0,
    'scoreTrip: gappy and canonical carry the identical atom count (template-derived, not plan-derived) (' + g.atoms.length + ')');

  // (4) Sigma atoms.earned (clamped >=0) === total, on gappy + canonical
  ok(sumEarnedClamped(g.atoms) === g.total, 'scoreTrip: Sigma atoms.earned (clamped) === total on gappy (' + g.total + ')');
  ok(sumEarnedClamped(t.atoms) === t.total, 'scoreTrip: Sigma atoms.earned (clamped) === total on canonical (' + t.total + ')');

  // (5) qualitative seed shape (exact PINS retired above; re-pinned exactly in the Voyage
  // constitution section once the integrator measures the merged engine)
  ok(g.total > 0 && g.total < 100, 'scoreTrip: gappy total is a genuine partial score, not 0 or 100 (' + g.total + ')');
  var jump = P.scoreTrip(P.mergePlan(P.applyFix(base, 'fixHandoffs'))).total - g.total;
  ok(jump > 0, 'scoreTrip: fixHandoffs raises the gappy total (jump +' + jump + ')');
  ok(P.tripEfficiency(gappyPlan) >= 0 && P.tripEfficiency(gappyPlan) <= 100, 'tripEfficiency: gappy is a legal 0..100 int (' + P.tripEfficiency(gappyPlan) + ')');

  // (6) cumulative monotone ladder: the 8 classic fixes (incl. fixHandoffs) then applyDayFix over
  // all 5 non-fishday authorable days (MIGRATION Voyage 2026-07-13: load/voyage appended) ->
  // each step's total is >= the previous, and the Sigma-earned identity holds at every step; the
  // final step reaches 100/A/clean.
  var LADDER_FIXES = ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn', 'fixHandoffs'];
  var accCfg = base, ladder = [g];
  LADDER_FIXES.forEach(function (fx) { accCfg = P.applyFix(accCfg, fx); ladder.push(P.scoreTrip(P.mergePlan(accCfg))); });
  ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (seg) { accCfg = P.applyDayFix(accCfg, seg); ladder.push(P.scoreTrip(P.mergePlan(accCfg))); });
  var monoLadder = true;
  for (var li = 1; li < ladder.length; li++) {
    if (ladder[li].total < ladder[li - 1].total) monoLadder = false;
    ok(sumEarnedClamped(ladder[li].atoms) === ladder[li].total, 'scoreTrip: Sigma atoms.earned (clamped) === total at ladder step ' + li + ' (' + ladder[li].total + ')');
  }
  ok(monoLadder, 'scoreTrip: cumulative fix ladder (8 classic incl. fixHandoffs + 5 canonDay incl. load/voyage) is monotone non-decreasing (' + ladder.map(function (s) { return s.total; }).join('→') + ')');
  var lastStep = ladder[ladder.length - 1];
  ok(lastStep.total === 100 && lastStep.grade === 'A' && lastStep.gate.clean === true, 'scoreTrip: final ladder step -> 100/A/clean');

  // (7) withheldA: canonical minus one 1pt return arrow -> 99, not clean, grade B, gate.withheldA
  var wCfg = trueCanonCfg();
  wCfg.overrides.days = wCfg.overrides.days || {};
  wCfg.overrides.days['return'] = wCfg.overrides.days['return'] || {};
  wCfg.overrides.days['return'].handoffs = wCfg.overrides.days['return'].handoffs || {};
  var returnArrowIds = P.mergePlan(wCfg).days['return'].handoffs.map(function (h) { return h.id; });
  wCfg.overrides.days['return'].handoffs[returnArrowIds[0]] = null;
  var wPlan = P.mergePlan(wCfg), wt = P.scoreTrip(wPlan);
  ok(wt.total === 99 && wt.gate.clean === false && wt.grade === 'B' && wt.gate.withheldA === true,
    'scoreTrip: withheldA — erasing one 1pt return arrow (' + returnArrowIds[0] + ') -> 99/clean:false/B/withheldA:true (' +
    wt.total + '/' + wt.grade + '/' + wt.gate.withheldA + ')');

  // (7b) 100 means mastery: the formerly detector-only returnLogi duty is now bound to
  // the existing 1-point Return Logistics execution atom (no new row/weight).
  var nrCfg = base;
  ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'fixHandoffs'].forEach(function (fx) { nrCfg = P.applyFix(nrCfg, fx); });
  ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (seg) { nrCfg = P.applyDayFix(nrCfg, seg); });
  var nrt = P.scoreTrip(P.mergePlan(nrCfg));
  ok(nrt.total === 99 && nrt.gate.clean === false && nrt.grade === 'B' && nrt.gate.withheldA === true,
    'scoreTrip: skipping setReturn -> 99 because the existing Return Logistics atom prices the live returnLogi duty (' +
    nrt.total + '/' + nrt.grade + '/withheldA:' + nrt.gate.withheldA + ')');

  // (8) drawn-but-late riskable: canonical + retime h_menu_angler to a late board send ->
  // fishday_info_specialist_ic_menu earns 1/3, status present-but-late, reasonKey scr_info_drawn_late
  var lCfg = trueCanonCfg();
  lCfg.overrides.handoffs = lCfg.overrides.handoffs || {};
  // retime the FULL canonical arrow (a partial {trigger,channel} override would replace the
  // whole arrow at merge and orphan the socket into 'missing' — the arrow must stay valid)
  var lArrow = P.canonHandoffs().filter(function (h) { return h.id === 'h_menu_angler'; })[0];
  var lPatch = {}; for (var lk in lArrow) lPatch[lk] = lArrow[lk];
  lPatch.trigger = { type: 'atMinute', value: 330 }; lPatch.channel = 'board';
  lCfg.overrides.handoffs.h_menu_angler = lPatch;
  var lPlan = P.mergePlan(lCfg), lt = P.scoreTrip(lPlan);
  var lAtom = atomOf(lt.atoms, 'fishday_info_specialist_ic_menu');
  ok(!!lAtom && lAtom.earned === 1 && lAtom.status === 'present-but-late' && lAtom.reasonKey === 'scr_info_drawn_late',
    'scoreTrip: drawn-but-late riskable socket earns 1/3, status present-but-late, reasonKey scr_info_drawn_late (' +
    (lAtom && lAtom.earned) + '/' + (lAtom && lAtom.status) + '/' + (lAtom && lAtom.reasonKey) + ')');

  // (9) redundant-arrow non-inflation: canonical + a duplicate faster arrow on an already-ok
  // socket -> total unchanged at 100, and that socket's maxPts is unaffected by the extra wire
  var rCfg = trueCanonCfg();
  rCfg.overrides.handoffs = rCfg.overrides.handoffs || {};
  rCfg.overrides.handoffs.h_tackle2 = { cardId: 'ic_tackle', fromRoleId: 'logi', fromTaskId: 't_f_tackleprep', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_tackleprep' }, channel: 'faceToFace', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } };
  var rPlan = P.mergePlan(rCfg), rt = P.scoreTrip(rPlan);
  var rAtom = atomOf(rt.atoms, 'fishday_info_specialist_ic_tackle');
  ok(rt.total === 100, 'scoreTrip: a redundant faster duplicate arrow does not inflate the total (still 100)');
  ok(!!rAtom && rAtom.maxPts === 1 && rAtom.earned === 1,
    'scoreTrip: the duplicated socket (fishday_info_specialist_ic_tackle) stays at its normal maxPts/earned, unaffected by the extra wire (' + (rAtom && rAtom.maxPts) + '/' + (rAtom && rAtom.earned) + ')');

  // (10) i18n parity: EN/JA key sets are symmetric (require guarded by the i18n.js UMD export
  // tail another Wave-1 worker (W1-T3) adds; STR.en/STR.ja are plain flat namespaces)
  var STR = require('./i18n.js');
  var enKeys = Object.keys(STR.en || {}), jaKeys = Object.keys(STR.ja || {});
  var onlyEn = enKeys.filter(function (k) { return jaKeys.indexOf(k) < 0; });
  var onlyJa = jaKeys.filter(function (k) { return enKeys.indexOf(k) < 0; });
  ok(onlyEn.length === 0 && onlyJa.length === 0,
    'i18n: EN/JA key sets are symmetric (only-EN=' + onlyEn.join(',') + ' only-JA=' + onlyJa.join(',') + ')');

  // (11) tripEfficiency: pinned exact on gappy (via PINS above) and 100 on canonical; determinism
  ok(P.tripEfficiency(canonPlan) === 100, 'tripEfficiency: canonical -> 100 (pinned)');
  var eff1 = P.tripEfficiency(gappyPlan), eff2 = P.tripEfficiency(gappyPlan);
  ok(eff1 === eff2, 'tripEfficiency: determinism — two calls on the same plan are identical (' + eff1 + ')');

  // (12) QA-wave hardening — behavioral cases for rules the pins above reach only structurally.
  function tripOf(cfg) { return P.scoreTrip(P.mergePlan(cfg)); }
  function cloneCfg(cfg) { return JSON.parse(JSON.stringify(cfg)); }
  var atomIn = function (t, id) { return atomOf(t.atoms, id); };

  // 12a. collapsed socket + one unplaced consumer -> the whole socket is 'missing' (§5
  // worst-consumer: specialist×ic_ground feeds BOTH t_f_rig and t_f_fish; unplacing t_f_fish
  // must void the socket even though t_f_rig is still fed on time)
  var csCfg = cloneCfg(trueCanonCfg());
  csCfg.overrides.staffing = csCfg.overrides.staffing || {};
  csCfg.overrides.staffing.t_f_fish = [];
  var cst = tripOf(csCfg), csA = atomIn(cst, 'fishday_info_specialist_ic_ground');
  ok(!!csA && csA.earned === 0 && csA.status === 'missing' && csA.reasonKey === 'scr_info_missing',
    'scoreTrip §5: collapsed socket with an unplaced consumer voids all 3 pts -> missing (' +
    (csA && csA.earned) + '/' + (csA && csA.status) + ')');
  ok(sumEarnedClamped(cst.atoms) === cst.total, 'scoreTrip §5: Sigma-earned identity holds on the unplaced-consumer plan (' + cst.total + ')');

  // 12b. same-role overlap -> lane atom reports 'overlap' / scr_exec_overlap (moving
  // hd_a_board onto hd_a_checkin's hour, same logi person, dep ferrycheck still satisfied)
  var ovCfg = cloneCfg(trueCanonCfg());
  var ovPlan0 = P.mergePlan(ovCfg), ovCheckin = null, ovBoard = null;
  P.tasksForSeg(ovPlan0, 'arrival').forEach(function (t) { if (t.id === 'hd_a_checkin') ovCheckin = t; if (t.id === 'hd_a_board') ovBoard = t; });
  ovCfg.overrides.days = ovCfg.overrides.days || {}; ovCfg.overrides.days.arrival = ovCfg.overrides.days.arrival || {};
  ovCfg.overrides.days.arrival.placement = ovCfg.overrides.days.arrival.placement || {};
  ovCfg.overrides.days.arrival.placement.hd_a_board = { startMin: ovCheckin.startMin, durMin: ovBoard.durMin, assignedIds: ovBoard.assignedIds.slice() };
  var ovA = atomIn(tripOf(ovCfg), 'arrival_exec_logi');
  ok(!!ovA && ovA.earned === 0 && ovA.status === 'overlap' && ovA.reasonKey === 'scr_exec_overlap',
    'scoreTrip §3.2: double-booked logi lane -> overlap / scr_exec_overlap (' + (ovA && ovA.status) + '/' + (ovA && ovA.reasonKey) + ')');

  // 12c. dependency broken -> lane atom reports 'broken' / scr_exec_broken (board re-timed
  // to start before its dep hd_a_ferrycheck finishes)
  var dbCfg = cloneCfg(trueCanonCfg());
  dbCfg.overrides.days = dbCfg.overrides.days || {}; dbCfg.overrides.days.arrival = dbCfg.overrides.days.arrival || {};
  dbCfg.overrides.days.arrival.placement = dbCfg.overrides.days.arrival.placement || {};
  dbCfg.overrides.days.arrival.placement.hd_a_board = { startMin: 300, durMin: ovBoard.durMin, assignedIds: ovBoard.assignedIds.slice() };
  var dbA = atomIn(tripOf(dbCfg), 'arrival_exec_logi');
  ok(!!dbA && dbA.earned === 0 && dbA.status === 'broken' && dbA.reasonKey === 'scr_exec_broken',
    'scoreTrip §3.2: dep-broken logi lane -> broken / scr_exec_broken (' + (dbA && dbA.status) + '/' + (dbA && dbA.reasonKey) + ')');

  // 12d. decoy debits bill scoreTrip itself: placing an exec decoy costs -2, a safety-flavored
  // one -3, and either kills clean (§3.2)
  var dcCfg = cloneCfg(trueCanonCfg());
  dcCfg.overrides.days = dcCfg.overrides.days || {}; dcCfg.overrides.days.ops = dcCfg.overrides.days.ops || {};
  dcCfg.overrides.days.ops.placement = dcCfg.overrides.days.ops.placement || {};
  dcCfg.overrides.days.ops.placement.hd_o_dec_sidefish = { startMin: 600, durMin: 60, assignedIds: ['p08'] };
  var dct = tripOf(dcCfg), dcA = atomIn(dct, 'ops_decoy_hd_o_dec_sidefish');
  ok(!!dcA && dcA.earned === -2 && dcA.status === 'decoy' && dct.total === 98 && dct.gate.clean === false,
    'scoreTrip §3.2: placed exec decoy -> -2, total 98, not clean (' + (dcA && dcA.earned) + '/' + dct.total + ')');
  var dsCfg = cloneCfg(trueCanonCfg());
  dsCfg.overrides.days = dsCfg.overrides.days || {}; dsCfg.overrides.days.arrival = dsCfg.overrides.days.arrival || {};
  dsCfg.overrides.days.arrival.placement = dsCfg.overrides.days.arrival.placement || {};
  dsCfg.overrides.days.arrival.placement.hd_a_dec_nightfish = { startMin: 1140, durMin: 60, assignedIds: ['p08'] };
  var dst = tripOf(dsCfg), dsA = atomIn(dst, 'arrival_decoy_hd_a_dec_nightfish');
  ok(!!dsA && dsA.earned === -3 && dst.total === 97 && dst.gate.clean === false,
    'scoreTrip §3.2: placed safety-flavored decoy -> -3, total 97, not clean (' + (dsA && dsA.earned) + '/' + dst.total + ')');

  // 12e. the shrink-the-cook-block exploit (§3.2 durMin floor): t_f_cook at 30min (< 5×18=90)
  // -> cookblock 0/2 'compressed' AND the chef lane compressed too
  var ckCfg = cloneCfg(trueCanonCfg());
  ckCfg.overrides.timing = ckCfg.overrides.timing || {};
  ckCfg.overrides.timing.t_f_cook = { durMin: 30 };
  var ckt = tripOf(ckCfg), ckA = atomIn(ckt, 'fishday_quality_cookblock'), ckL = atomIn(ckt, 'fishday_exec_chef');
  ok(!!ckA && ckA.earned === 0 && ckA.status === 'compressed' && !!ckL && ckL.earned === 0 && ckL.status === 'compressed',
    'scoreTrip §3.2: shrunk cook block -> cookblock 0/2 compressed + chef lane compressed (' +
    (ckA && ckA.status) + '/' + (ckL && ckL.status) + ')');
  ok(sumEarnedClamped(ckt.atoms) === ckt.total, 'scoreTrip §3.2: Sigma-earned identity holds on the shrunk-cook plan (' + ckt.total + ')');

  // 12f. misassigned safety gate -> 'broken' (§7.4: wrong role is broken, never 迷い/'missing')
  var mgCfg = cloneCfg(trueCanonCfg());
  mgCfg.overrides.days = mgCfg.overrides.days || {}; mgCfg.overrides.days.ops = mgCfg.overrides.days.ops || {};
  mgCfg.overrides.days.ops.placement = mgCfg.overrides.days.ops.placement || {};
  var mgPlan0 = P.mergePlan(cloneCfg(trueCanonCfg())), mgW = null;
  P.tasksForSeg(mgPlan0, 'ops').forEach(function (t) { if (t.id === 'hd_o_weather') mgW = t; });
  mgCfg.overrides.days.ops.placement.hd_o_weather = { startMin: mgW.startMin, durMin: mgW.durMin, assignedIds: ['p09'] };
  var mgA = atomIn(tripOf(mgCfg), 'ops_safety_hd_o_weather');
  ok(!!mgA && mgA.earned === 0 && mgA.status === 'broken' && mgA.reasonKey === 'scr_safety_gap',
    'scoreTrip §7.4: safety gate on the wrong role -> broken / scr_safety_gap (' + (mgA && mgA.status) + ')');
})();

// ============================================================================
// THE VOYAGE (2026-07-13) — W1b verify additions (plan §W1b, spec §6). Written
// against docs/superpowers/specs/2026-07-13-voyage-design.md and
// docs/superpowers/plans/2026-07-13-voyage.md's "Key pinned interfaces", NOT
// against today's on-disk engine.js — a concurrent W1a (fable) worker is
// rewriting engine.js to the same spec at the same time this file is written.
// Every dynamic-discovery choice below (name-regex lookups, atom-id
// pattern-matching, the integrator-PINS estimate objects) is commented at its
// point of use; the W1-gate Opus review reconciles literal ids/fields against
// whatever the landed engine.js actually names them.
// ============================================================================
function trueCanonCfgV() {
  var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
  ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (s) { cfg = P.applyDayFix(cfg, s); });
  return cfg;
}

console.log('\n=== VOYAGE §1 — new-seg structural anchors (load/voyage) ===');
(function () {
  var NEW_SEGS = ['load', 'voyage'];
  var ALL_AUTHORABLE = ['load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];

  ok(NEW_SEGS.every(function (s) { return P.AUTHORABLE.indexOf(s) >= 0; }), 'AUTHORABLE includes the new load/voyage segments (' + P.AUTHORABLE.join(',') + ')');
  ok(ALL_AUTHORABLE.every(function (s) { return P.AUTHORABLE.indexOf(s) >= 0; }) && P.AUTHORABLE.length === ALL_AUTHORABLE.length,
    'AUTHORABLE carries exactly the 6 campaign segments, no more/fewer (' + P.AUTHORABLE.join(',') + ')');

  // The load canvas opens at a neutral rehearsal anchor because breakfast time is
  // unknown. The only confirmed clocks are hotel departure at 10:00 and the
  // Ogasawara-maru departure at 11:00; the voyage boundary is approximately +24h.
  ok(P.DAY_WINDOWS.load && P.DAY_WINDOWS.load[0] === 480 && P.DAY_WINDOWS.load[1] === 660,
    'DAY_WINDOWS.load uses an 08:00 rehearsal canvas and ends at the confirmed 11:00 sailing (' + JSON.stringify(P.DAY_WINDOWS.load) + ')');
  ok(P.DAY_WINDOWS.voyage && P.DAY_WINDOWS.voyage[0] === 660 && P.DAY_WINDOWS.voyage[1] === 2100,
    'DAY_WINDOWS.voyage spans the confirmed 11:00 departure plus about one day (' + JSON.stringify(P.DAY_WINDOWS.voyage) + ')');
  ok(!!(P.DAY_WINDOWS.load && P.DAY_WINDOWS.voyage) && P.DAY_WINDOWS.load[1] === P.DAY_WINDOWS.voyage[0],
    'load ends exactly where voyage begins (11:00, the fixed sailing time — "what misses the ship cannot be fixed at sea")');

  var canonCfg = trueCanonCfgV();
  var canonPlan = P.mergePlan(canonCfg);

  function leg(id) { return (P.ITINERARY || []).filter(function (x) { return x.id === id; })[0] || null; }
  var breakfast = leg('out-breakfast'), hotelMove = leg('out-hotel-takeshiba');
  var longHaul = leg('out-ogasawara-maru'), chichi = leg('out-chichijima-transfer');
  var inter = leg('out-interisland'), hinata = leg('out-hinata');
  var interVessel = (P.VESSELS || []).filter(function (v) { return v.id === 'interisland-vessel'; })[0] || null;
  var returnLegs = (P.ITINERARY || []).filter(function (x) { return x.direction === 'return'; });
  ok(canonPlan.project && canonPlan.project.location && /Hahajima/.test(canonPlan.project.location.en) && /Hinata/.test(canonPlan.project.location.en),
    'authoritative destination is Hahajima · Hinata (' + (canonPlan.project && canonPlan.project.location && canonPlan.project.location.en) + ')');
  ok(breakfast && breakfast.sceneId === 'tokyo-hotel' && breakfast.departMin === null && breakfast.arriveMin === null,
    'breakfast is at the nearby Tokyo hotel and its time remains unknown');
  ok(hotelMove && hotelMove.fromStopId === 'tokyo-hotel' && hotelMove.toStopId === 'takeshiba-terminal' && hotelMove.departMin === 600,
    'hotel departure for Takeshiba is pinned exactly at 10:00');
  ok(longHaul && longHaul.vesselId === 'ogasawara-maru' && longHaul.departMin === 660 && longHaul.durationMin === 1440 && /approx/.test(longHaul.timeStatus),
    'Ogasawara-maru leaves Takeshiba exactly at 11:00 for an approximately 24-hour voyage');
  ok(chichi && chichi.kind === 'ship-transfer' && chichi.fromStopId === 'chichijima-transfer' && chichi.departMin === null,
    'outbound itinerary explicitly changes ships at Chichijima without inventing a connection time');
  ok(inter && inter.fromStopId === 'chichijima-transfer' && inter.toStopId === 'hahajima-hinata' && inter.vesselId === 'interisland-vessel' &&
     inter.departMin === null && inter.arriveMin === null && inter.durationMin === null && inter.timeStatus === 'unknown' &&
     interVessel && interVessel.knownName === false && interVessel.outboundDepartMin === null && interVessel.outboundDurationMin === null,
    'separate Chichijima→Hahajima vessel keeps its name and all timetable fields unconfirmed');
  ok(hinata && hinata.toStopId === 'hahajima-hinata', 'outbound route terminates at Hinata on Hahajima');
  ok(returnLegs.length === 5 && returnLegs.every(function (x) {
    return x.inferred === true && x.confirmed === false && x.departMin === null && x.arriveMin === null;
  }), 'reverse return route is explicit inference and exposes no confirmed timetable');

  // rosters non-empty (required tasks + at least one decoy each, per plan §W2a)
  NEW_SEGS.forEach(function (seg) {
    var required = P.tasksForSeg(canonPlan, seg).filter(function (t) { return t.required !== false; });
    var deck = P.deckFor(canonPlan, seg);
    ok(required.length > 0, seg + ': roster has at least one required task (' + required.length + ')');
    ok(deck && Array.isArray(deck.decoys) && deck.decoys.length > 0, seg + ': deckFor reports at least one decoy (' + (deck && deck.decoys.length) + ')');
  });

  // plan.manifest / plan.guests shapes (plan §Key pinned interfaces + spec §2/§3). Defensively
  // fall back to [] so an absent field (today's pre-Voyage engine) reports as clear FAILs rather
  // than crashing the rest of this file's checks.
  var manifest = canonPlan.manifest || [], guests = canonPlan.guests || [];
  ok(Array.isArray(canonPlan.manifest) && manifest.length > 0, 'plan.manifest is a non-empty array (' + manifest.length + ')');
  ok(manifest.every(function (m) { return m.id && m.name && m.name.en && m.name.jp && m.kind && m.forSeg && typeof m.outboundRequired === 'boolean' && typeof m.returnRequired === 'boolean'; }),
    'every manifest item carries {id, name:{en,jp}, kind, forSeg, outboundRequired, returnRequired}');
  ok(Array.isArray(canonPlan.guests) && guests.length === 13, 'plan.guests carries 13 named guests (' + guests.length + ')');
  ok(guests.every(function (g) { return g.id && g.name && g.name.en && g.name.jp && typeof g.vip === 'boolean' && typeof g.voyageCare === 'boolean'; }),
    'every guest carries {id, name:{en,jp}, voyageCare, legacy vip, party}');
  ok(guests.filter(function (g) { return g.voyageCare; }).length === 4, 'exactly 4 of the 13 guest records belong to outbound Voyage care');

  // canonDay reaches full placement on load/voyage — the same §20 contract already proven for
  // arrival/ops/return, extended to the two new segments
  NEW_SEGS.forEach(function (seg) {
    var ds = P.daySchedule(canonPlan, seg), rd = P.dayReadiness(canonPlan, seg);
    ok(ds.unplacedRequired.length === 0, seg + ': canonDay (via applyDayFix) places every required task (' + ds.unplacedRequired.length + ' unplaced)');
    ok(!rd.some(function (r) { return r.type === 'UNPLACED_REQUIRED'; }), seg + ': dayReadiness has no UNPLACED_REQUIRED after canonDay');
  });
})();

console.log('\n=== MAIN-GUEST ROTATION — inclusive Day 0–5 / Day 6–10 contract ===');
(function () {
  var plan = P.makeTemplate(), before = JSON.stringify(plan);
  function ids(day) { return P.guestRosterForDay(plan, day).map(function (g) { return g.id; }); }
  var early = ['gd_watanabe', 'gd_nagatani', 'gd_kadou', 'gd_maeda'];
  var late = ['gd_watanabe', 'gd_nagatani', 'gd_yamate', 'gd_saito'];
  ok(typeof P.guestRosterForDay === 'function', 'guestRosterForDay is exported as an explicit trip-day resolver');
  ok(JSON.stringify(ids(0)) === JSON.stringify(early), 'Day 0 main guests are Watanabe, Nagatani, Kadou, Maeda');
  ok(JSON.stringify(ids(5)) === JSON.stringify(early), 'Day 5 keeps the early roster (inclusive boundary)');
  ok(JSON.stringify(ids(6)) === JSON.stringify(late), 'Day 6 swaps to Watanabe, Nagatani, Yamate, Saito');
  ok(JSON.stringify(ids(10)) === JSON.stringify(late), 'Day 10 keeps the late roster (inclusive boundary)');
  ok(ids(-1).length === 0 && ids(11).length === 0 && ids(5.5).length === 0, 'out-of-campaign and fractional days resolve to no roster');
  ok(plan.guestRotations.length === 2 && plan.guestRotations.every(function (wave) {
    return wave.guestIds.length === 4 && new Set(wave.guestIds).size === 4 && wave.guestIds.every(function (id) { return !!plan.guests.filter(function (g) { return g.id === id; })[0]; });
  }), 'both rotation waves contain exactly 4 unique, resolvable guest ids');
  ok(ids(0).slice(0, 2).join(',') === ids(10).slice(0, 2).join(','), 'Watanabe and Nagatani remain in both waves');
  ok(JSON.stringify(plan) === before && JSON.stringify(ids(6)) === JSON.stringify(ids(6)), 'guestRosterForDay is pure and deterministic');
  ok(P.GUESTS === 13 && plan.project.guests === 13 && plan.guests.length === 13 && P.ambientActors(1, 0).length === 13,
    'the 4-person priority rotation does not alter the 13-guest planning/headcount envelope');
  ok(P.SNAP_MIN.fishday === 60, 'Day 3 authoring snap is exactly one hour (60 min)');
  ok(P.snapAuthoringMinute('fishday', 315, 'floor') === 300 && P.snapAuthoringMinute('fishday', 315, 'ceil') === 360,
    'Day 3 manual time authoring quantizes to hour blocks while preserving detailed internal math');
  var foodBlock = P.authoringTaskBlock('fishday', 255, 30), returnBlock = P.authoringTaskBlock('fishday', 765, 75);
  ok(foodBlock.startMin === 240 && foodBlock.durMin === 60 && foodBlock.endMin === 300 &&
     returnBlock.startMin === 720 && returnBlock.durMin === 120,
    'Day 3 detailed anchors project to containing whole-hour blocks (04:15/30m → 04:00–05:00; 12:45/75m → 12:00–14:00)');
  var projectedBefore = JSON.stringify(plan);
  var detailedTasks = P.tasksForSeg(plan, 'fishday');
  var projected = detailedTasks.map(function (task) { return P.authoringTaskBlock('fishday', task.startMin, task.durMin); });
  ok(projected.every(function (block, i) {
    var task = detailedTasks[i];
    return block && block.startMin % 60 === 0 && block.durMin >= 60 && block.durMin % 60 === 0 &&
      block.startMin <= task.startMin && block.endMin >= task.startMin + task.durMin;
  }) && JSON.stringify(plan) === projectedBefore,
    'every Day 3 authoring block is hour-aligned, contains its detailed task, and leaves rehearsal anchors untouched');
  ok(typeof P.authoringLaneLayout === 'function', 'authoringLaneLayout is exported as the pure Day 3 display-track resolver');
  var layoutInputBefore = JSON.stringify(detailedTasks);
  var layout = P.authoringLaneLayout('fishday', detailedTasks);
  var placedIds = detailedTasks.filter(function (task) { return task.assignedIds && task.assignedIds.length; })
    .map(function (task) { return task.id; }).sort();
  var layoutIds = layout.map(function (record) { return record.taskId; }).sort();
  ok(layout.length === placedIds.length && JSON.stringify(layoutIds) === JSON.stringify(placedIds),
    'authoring lane layout contains every placed Day 3 task id exactly once (' + layout.length + '/' + placedIds.length + ')');
  ok(layout.every(function (record) {
    var task = detailedTasks.filter(function (candidate) { return candidate.id === record.taskId; })[0];
    var expected = task && P.authoringTaskBlock('fishday', task.startMin, task.durMin);
    return expected && record.participantId === task.assignedIds[0] &&
      record.startMin === expected.startMin && record.durMin === expected.durMin && record.endMin === expected.endMin;
  }), 'every lane-layout record exactly matches its containing authoringTaskBlock and primary assignee');
  var noTrackOverlap = layout.every(function (record, i) {
    return layout.every(function (other, j) {
      return i === j || record.participantId !== other.participantId || record.track !== other.track ||
        record.endMin <= other.startMin || other.endMin <= record.startMin;
    });
  });
  ok(noTrackOverlap, 'same-person blocks on the same track never overlap (half-open intervals may touch)');
  var tallyLayout = layout.filter(function (record) { return record.taskId === 't_f_tally'; })[0];
  var stowLayout = layout.filter(function (record) { return record.taskId === 't_f_stow'; })[0];
  ok(tallyLayout && stowLayout && tallyLayout.participantId === stowLayout.participantId && tallyLayout.track !== stowLayout.track,
    't_f_tally and t_f_stow project onto distinct tracks in the specialist lane');
  var layoutAgain = P.authoringLaneLayout('fishday', detailedTasks);
  ok(JSON.stringify(detailedTasks) === layoutInputBefore && JSON.stringify(layoutAgain) === JSON.stringify(layout),
    'authoringLaneLayout is pure and deterministic');
  var greedyFixture = [
    { id: 'lane_a', assignedIds: ['p01'], startMin: 240, durMin: 60 },
    { id: 'lane_b', assignedIds: ['p01'], startMin: 300, durMin: 60 },
    { id: 'lane_overlap', assignedIds: ['p01'], startMin: 270, durMin: 60 }
  ];
  var greedyLayout = P.authoringLaneLayout('fishday', greedyFixture), greedyById = {};
  greedyLayout.forEach(function (record) { greedyById[record.taskId] = record; });
  ok(greedyById.lane_a.track === 0 && greedyById.lane_overlap.track === 1 && greedyById.lane_b.track === 0,
    'lane layout greedily reuses the lowest track when the previous half-open interval ends at the next start');
  var worstCaseFixture = [0, 1, 2, 3, 4, 5].map(function (n) {
    return { id: 'lane_worst_' + n, assignedIds: ['p01'], startMin: 240 + n * 5, durMin: 5 };
  });
  var worstCaseBefore = JSON.stringify(worstCaseFixture);
  var worstCaseLayout = P.authoringLaneLayout('fishday', worstCaseFixture);
  var worstCaseTracks = worstCaseLayout.map(function (record) { return record.track; }).sort(function (a, b) { return a - b; });
  ok(worstCaseLayout.length === 6 && worstCaseLayout.every(function (record) {
    return record.participantId === 'p01' && record.startMin === 240 && record.endMin === 300;
  }) && worstCaseTracks.join(',') === '0,1,2,3,4,5',
    'six legal same-person tasks collapsed into one Day 3 hour receive distinct tracks 0..5');
  ok(worstCaseLayout.every(function (record, i) {
    return worstCaseLayout.every(function (other, j) {
      return i === j || record.participantId !== other.participantId || record.track !== other.track ||
        record.endMin <= other.startMin || other.endMin <= record.startMin;
    });
  }), 'six-track worst case preserves the same-track half-open non-overlap invariant');
  ok(JSON.stringify(worstCaseFixture) === worstCaseBefore &&
     JSON.stringify(P.authoringLaneLayout('fishday', worstCaseFixture)) === JSON.stringify(worstCaseLayout),
    'six-track worst-case layout is pure and deterministic');
  var leftBoundary = P.editAuthoringTaskBlock('fishday', 255, 30, -60, false);
  var movedRight = P.editAuthoringTaskBlock('fishday', 255, 30, 60, false);
  var clampedWhole = P.editAuthoringTaskBlock('fishday', 300, 60, -180, false);
  var shrinkFloor = P.editAuthoringTaskBlock('fishday', 255, 30, -60, true);
  var grown = P.editAuthoringTaskBlock('fishday', 255, 30, 60, true);
  ok(leftBoundary.startMin === 240 && leftBoundary.durMin === 60 && movedRight.startMin === 300 && movedRight.durMin === 60 && clampedWhole.startMin === 240 &&
     shrinkFloor.durMin === 60 && grown.durMin === 120,
    'the shared pointer/keyboard reducer applies full-hour moves/resizes and clamps boundaries only to whole hours');
  ok(P.authoringSendMinute('fishday', 360, 405) === 420 && P.authoringSendMinute('fishday', 480, 405) === 480,
    'manual and automatic arrow sends round after production (06:45 → 07:00) without delaying an already-later hour');
})();

console.log('\n=== VOYAGE §2 — carryover purity: all-aboard is carry-inert; a missing item stalls its consumer ===');
(function () {
  var hasCarryState = typeof P.carryState === 'function';
  ok(hasCarryState, 'carryState is exported on api');
  // defensive: fall back to a no-op fn so an absent carryState (today's pre-Voyage engine)
  // degrades this whole section to clear FAILs instead of crashing the rest of this file
  function carryStateSafe(plan) { return hasCarryState ? P.carryState(plan) : {}; }

  // (a) all-aboard => carry-inert. When Load is authored canonically (every manifest item
  // packed -> trucked -> in hold -> aboard), the PRE-EXISTING arrival/ops/fishday day-schedule
  // pins are UNCHANGED — carryState must never inject a stall when nothing is actually missing.
  var loadFixedCfg = P.applyDayFix(P.applyAllFixes(base), 'load');
  var loadFixedPlan = P.mergePlan(loadFixedCfg);

  var cs = carryStateSafe(loadFixedPlan);
  ok(cs && typeof cs === 'object' && Object.keys(cs).length > 0, 'carryState returns a non-empty {itemId: {seg: status}} map (' + Object.keys(cs).length + ' items)');
  var outboundIds = (loadFixedPlan.manifest || []).filter(function (m) { return m.outboundRequired !== false; }).map(function (m) { return m.id; });
  var outboundAboard = outboundIds.every(function (itemId) {
    return ['load', 'voyage', 'arrival', 'ops', 'fishday'].every(function (seg) { return cs[itemId][seg] === 'aboard'; });
  });
  ok(outboundAboard, 'canonical Load day -> every outbound-required manifest item remains aboard through the outbound stay');
  var joinedIds = (loadFixedPlan.manifest || []).filter(function (m) { return m.outboundRequired === false; }).map(function (m) { return m.id; });
  ok(joinedIds.length === 2 && joinedIds.every(function (id) { return cs[id].load === 'not-applicable' && cs[id].ops === 'joins-day-6'; }),
    'Yamate/Saito return luggage joins at the Day-6 roster swap instead of being invented aboard on Day 0');

  var fullRouteCs = carryStateSafe(P.mergePlan(trueCanonCfgV()));
  var fullRouteAboard = Object.keys(fullRouteCs).every(function (itemId) {
    return fullRouteCs[itemId].return === 'aboard' || fullRouteCs[itemId].return === 'not-required';
  });
  ok(fullRouteAboard, 'canonical transfer and return chains bring every return-required item back aboard');

  // reuse the EXISTING pre-Voyage fishday pins verbatim (§7/§13.4 P2 re-tune): with everything
  // aboard, the fishday arrow-based teaching gradient (idle/efficiency — unrelated to carry) must
  // be byte-identical to the numbers pinned before the Voyage program existed. daySchedule/
  // fishdaySchedule are the SAME functions; only their internal carry-lookup is new plumbing.
  // MIGRATION (Voyage carryover, 2026-07-13): this needs the GAPPY fishday (baseL: Load authored
  // canonically, fishday arrows left exactly as gappy as the seed) — loadFixedPlan above ALSO
  // applies applyAllFixes, which draws the fishday arrows too and would score 0/100, not the
  // pre-Voyage 1450/68 pin this check names.
  var gfdCarry = P.fishdaySchedule(P.mergePlan(baseL));
  ok(gfdCarry.idleTotal === 1450 && gfdCarry.efficiency === 68,
    'carry-inert: fishday idle/efficiency unchanged at the pre-Voyage pins 1450/68% when Load ships everything aboard (' + gfdCarry.idleTotal + '/' + gfdCarry.efficiency + '%)');
  ok(P.daySchedule(P.mergePlan(baseL), 'fishday').idleTotal === 1450, 'carry-inert: daySchedule(fishday) facade agrees (1450)');

  // arrival/ops keep reaching their own canonical 100/A/clean/100%-eff anchor even with Load ALSO
  // authored canonically in the same cfg (proves carry doesn't cross-contaminate other days)
  ['arrival', 'ops'].forEach(function (seg) {
    var cfg = P.applyDayFix(loadFixedCfg, seg);
    var sd = P.scoreDay(P.mergePlan(cfg), seg);
    ok(sd.score === 100 && sd.grade === 'A' && sd.clean === true && sd.efficiency === 100,
      'carry-inert: ' + seg + ' still reaches its own canonical 100/A/clean/100% eff alongside a canonical Load day (' + sd.score + '/' + sd.grade + ')');
  });

  // (b) constructed failure: the jig case never makes the truck run -> the fishday gear pre-check
  // (t_f_gearload) records a stall (idle or rework), never a silent/free pass.
  // The hotel→Takeshiba move is a physical route leg, so discover it by the stable
  // route id rather than by obsolete vehicle wording in its display name.
  var jigItem = (loadFixedPlan.manifest || []).filter(function (m) { return /jig/i.test((m.name && m.name.en) || ''); })[0];
  ok(!!jigItem, 'plan.manifest carries an item named "jig case" (' + (jigItem && jigItem.id) + ')');

  if (jigItem) {
    var loadTasks = P.tasksForSeg(loadFixedPlan, 'load');
    var truckTasks = loadTasks.filter(function (t) { return t.routeLegId === 'out-hotel-takeshiba'; });
    ok(truckTasks.length === 1 && truckTasks[0].id === 'hd_l_truck',
      'Load has one hotel→Takeshiba custody move (' + truckTasks.map(function (t) { return t.id; }).join(',') + ')');

    var missCfg = P.applyDayFix(P.applyAllFixes(base), 'load');
    missCfg.overrides.days = missCfg.overrides.days || {};
    missCfg.overrides.days.load = missCfg.overrides.days.load || {};
    missCfg.overrides.days.load.placement = missCfg.overrides.days.load.placement || {};
    truckTasks.forEach(function (t) { missCfg.overrides.days.load.placement[t.id] = null; });
    var missPlan = P.mergePlan(missCfg);

    var missCs = carryStateSafe(missPlan);
    var jigStatus = missCs[jigItem.id] || {};
    var jigMissing = Object.keys(jigStatus).some(function (seg) { return jigStatus[seg] !== 'aboard'; });
    ok(jigMissing, 'unplacing the truck run -> carryState no longer reports the jig case aboard (' + JSON.stringify(jigStatus) + ')');

    var missFd = P.fishdaySchedule(missPlan);
    var gearTask = missFd.byTask && missFd.byTask.t_f_gearload;
    var gearRework = (missFd.wrongFish || []).indexOf('t_f_gearload') >= 0;
    ok((gearTask && gearTask.idleMin > 0) || gearRework,
      'missing jig case -> the fishday gear pre-check (t_f_gearload) records idle or rework (idleMin=' + (gearTask && gearTask.idleMin) + ', rework=' + gearRework + ')');

    var transferCfg = trueCanonCfgV();
    transferCfg.overrides.days.arrival.placement.hd_a_transfer = null;
    var transferStatus = carryStateSafe(P.mergePlan(transferCfg))[jigItem.id] || {};
    ok(transferStatus.voyage === 'aboard' && transferStatus.arrival === 'missing' && transferStatus.fishday === 'missing',
      'breaking the Chichijima vessel-transfer chain loses custody only after the long-haul voyage (' + JSON.stringify(transferStatus) + ')');

    function omitFromCustody(seg, taskId, itemId) {
      var cfg = trueCanonCfgV(), merged = P.mergePlan(cfg);
      var task = P.tasksForSeg(merged, seg).filter(function (x) { return x.id === taskId; })[0];
      cfg.overrides.days[seg].placement[taskId] = { startMin: task.startMin, durMin: task.durMin,
        assignedIds: task.assignedIds.slice(), carries: task.carries.filter(function (id) { return id !== itemId; }) };
      return P.mergePlan(cfg);
    }
    var loadCustodyBroken = omitFromCustody('load', 'hd_l_truck', 'mi_lug_gd_watanabe');
    var transferCustodyBroken = omitFromCustody('arrival', 'hd_a_transfer', 'mi_lug_gd_watanabe');
    var returnCustodyBroken = omitFromCustody('return', 'hd_r_hold', 'mi_lug_gd_yamate');
    ok(P.manifestChainGaps(loadCustodyBroken).indexOf('mi_lug_gd_watanabe') >= 0 && !P.scoreTrip(loadCustodyBroken).gate.clean,
      'an item-level Load custody omission withholds the trip A');
    ok(P.manifestTransferGaps(transferCustodyBroken).indexOf('mi_lug_gd_watanabe') >= 0 && !P.scoreTrip(transferCustodyBroken).gate.clean,
      'an item-level Chichijima transfer omission withholds the trip A');
    var brokenReturnTrip = P.scoreTrip(returnCustodyBroken);
    ok(P.manifestReturnGaps(returnCustodyBroken).indexOf('mi_lug_gd_yamate') >= 0 && brokenReturnTrip.total === 99 &&
       brokenReturnTrip.grade === 'B' && brokenReturnTrip.gate.withheldA &&
       P.dayReadiness(returnCustodyBroken, 'return').some(function (x) { return x.type === 'CARRY_GAP' && x.itemId === 'mi_lug_gd_yamate'; }),
      'a Day-6 guest return-luggage omission is visible on Return and costs the existing Return custody lane point');
  }
})();

console.log('\n=== VOYAGE §3 — named guests & VIP buddies ===');
(function () {
  var voyCfg = trueCanonCfgV();
  var voyPlan = P.mergePlan(voyCfg);
  var vips = (voyPlan.guests || []).filter(function (g) { return g.voyageCare; });
  var careIds = vips.map(function (g) { return g.id; });
  var expectedCare = ['gd_watanabe', 'gd_nagatani', 'gd_kadou', 'gd_maeda'];
  ok(JSON.stringify(careIds) === JSON.stringify(expectedCare), 'outbound care cohort is exactly Watanabe, Nagatani, Kadou, Maeda');
  var voyageTasks = P.tasksForSeg(voyPlan, 'voyage'), careTasks = voyageTasks.filter(function (t) { return !!t.careGuestId; });
  ok(careTasks.length === 16 && careTasks.every(function (t) { return expectedCare.indexOf(t.careGuestId) >= 0; }),
    'Voyage keeps exactly 16 care tasks (4 per outbound main guest)');
  ok(!voyageTasks.some(function (t) { return /gd_yamate|gd_saito/.test(t.id); }), 'late-wave Yamate/Saito receive no outbound Voyage care tasks');
  var outboundLuggage = (voyPlan.manifest || []).filter(function (m) { return m.kind === 'luggage' && m.outboundRequired; }).map(function (m) { return m.id.replace('mi_lug_', ''); });
  var returnLuggage = (voyPlan.manifest || []).filter(function (m) { return m.kind === 'luggage' && m.returnRequired; }).map(function (m) { return m.id.replace('mi_lug_', ''); });
  ok(JSON.stringify(outboundLuggage) === JSON.stringify(['gd_watanabe', 'gd_nagatani', 'gd_kadou', 'gd_maeda']),
    'outbound luggage follows the Day 0–5 main guests');
  ok(JSON.stringify(returnLuggage) === JSON.stringify(['gd_watanabe', 'gd_nagatani', 'gd_yamate', 'gd_saito']),
    'return luggage follows the Day 6–10 main guests');
  ok(voyPlan.buddies.gd_watanabe === 'p01' && voyPlan.buddies.gd_nagatani === 'p02' && voyPlan.buddies.gd_kadou === 'p07' && voyPlan.buddies.gd_maeda === 'p04',
    'canonical Voyage assigns buddies to the exact early-wave care cohort');
  var careAtomGuests = P.scoreTrip(voyPlan).atoms.filter(function (a) { return a.itemRef && a.itemRef.guestId; })
    .map(function (a) { return a.itemRef.guestId; });
  ok(JSON.stringify(careAtomGuests) === JSON.stringify(expectedCare),
    'the four scored care gates belong exactly to the outbound care cohort');

  function starId(gid) { return 't_v_star_' + gid; }
  // [integrator note] atom ids are not pinned by the plan for buddy tasks (buddy assignment is
  // player-chosen, not role-fixed, so these can't be role-keyed lane atoms like
  // "arrival_exec_logi" — the constitution's own precedent for non-role-fixed tasks is
  // "task-homed" ids, e.g. arrival_money_hd_a_board). atomForTask matches by substring so it
  // survives an exact-prefix difference as long as the taskId itself appears in the atom id.
  function atomForTask(atoms, taskId) { return atoms.filter(function (a) { return a.id.indexOf(taskId) >= 0; })[0] || null; }

  if (vips.length >= 2) {
    var vip0 = vips[0], vip1 = vips[1];

    // (a) unassigned VIP -> its auto-instantiated task exists but is unstaffed, and is priced as such
    var noBuddyCfg = trueCanonCfgV();
    noBuddyCfg.overrides.buddies = {};
    vips.forEach(function (g) { noBuddyCfg.overrides.buddies[g.id] = null; });
    var noBuddyPlan = P.mergePlan(noBuddyCfg);
    var nbTasks = P.tasksForSeg(noBuddyPlan, 'voyage'), nbById = {};
    nbTasks.forEach(function (t) { nbById[t.id] = t; });
    var t0star = nbById[starId(vip0.id)];
    ok(!!t0star, 'the VIP starlink task ' + starId(vip0.id) + ' exists in the voyage roster (auto-instantiated per VIP)');
    ok(t0star && (!t0star.assignedIds || t0star.assignedIds.length === 0), 'unassigned VIP ' + vip0.id + ': ' + starId(vip0.id) + ' is unstaffed with no buddy set');

    var noBuddyTrip = P.scoreTrip(noBuddyPlan);
    var a0 = atomForTask(noBuddyTrip.atoms, starId(vip0.id));
    ok(!!a0 && a0.earned === 0, 'unassigned VIP ' + vip0.id + ': its priced atom earns 0 (' + (a0 && a0.id) + '/' + (a0 && a0.earned) + ')');

    var manualCareCfg = trueCanonCfgV();
    manualCareCfg.overrides.buddies = {};
    vips.forEach(function (g) { manualCareCfg.overrides.buddies[g.id] = null; });
    manualCareCfg.overrides.days.voyage.placement = manualCareCfg.overrides.days.voyage.placement || {};
    careTasks.forEach(function (task, i) {
      manualCareCfg.overrides.days.voyage.placement[task.id] = { startMin: task.startMin, durMin: task.durMin,
        assignedIds: ['p0' + ((i % 8) + 1)] };
    });
    var manualCarePlan = P.mergePlan(manualCareCfg), manualCareTrip = P.scoreTrip(manualCarePlan);
    ok(P.tasksForSeg(manualCarePlan, 'voyage').filter(function (task) { return task.careGuestId; })
      .every(function (task) { return task.assignedIds.length === 0; }) && manualCareTrip.grade !== 'A' && !manualCareTrip.gate.clean,
      'generic task placement cannot bypass the dedicated-buddy relationship or earn a clean A');

    // (b) assigned buddy -> the task is staffed and earns its pts
    var oneBuddyCfg = trueCanonCfgV();
    oneBuddyCfg.overrides.buddies = {}; oneBuddyCfg.overrides.buddies[vip0.id] = 'p08';
    var oneBuddyPlan = P.mergePlan(oneBuddyCfg);
    var obById = {}; P.tasksForSeg(oneBuddyPlan, 'voyage').forEach(function (t) { obById[t.id] = t; });
    var t0starB = obById[starId(vip0.id)];
    ok(t0starB && t0starB.assignedIds && t0starB.assignedIds.indexOf('p08') >= 0, 'assigning available buddy p08 to VIP ' + vip0.id + ' staffs ' + starId(vip0.id) + ' with p08');
    var a0b = atomForTask(P.scoreTrip(oneBuddyPlan).atoms, starId(vip0.id));
    ok(!!a0b && a0b.earned === a0b.maxPts, 'assigned VIP ' + vip0.id + ': its priced atom earns its full maxPts (' + (a0b && a0b.earned) + '/' + (a0b && a0b.maxPts) + ')');

    // (c) double-booked buddy: the SAME organizer buddies 2 VIPs (spec §3 explicitly allows up to
    // 2 per organizer) -> their same-window escort/starlink tasks collide -> an overload readout,
    // via the SAME generic per-person overlap machinery §20 already uses for coarse days
    var dbCfg = trueCanonCfgV();
    dbCfg.overrides.buddies = {}; dbCfg.overrides.buddies[vip0.id] = 'p06'; dbCfg.overrides.buddies[vip1.id] = 'p06';
    var dbPlan = P.mergePlan(dbCfg);
    var dbDs = P.daySchedule(dbPlan, 'voyage');
    ok(dbDs.overbookMin > 0, 'buddy p06 double-booked across VIPs ' + vip0.id + '/' + vip1.id + ' -> overbookMin>0 (' + dbDs.overbookMin + ')');
    var dbRd = P.dayReadiness(dbPlan, 'voyage');
    ok(dbRd.some(function (r) { return r.type === 'OVERLOAD'; }), 'double-booked buddy -> dayReadiness surfaces an OVERLOAD hint (' + dbRd.map(function (r) { return r.type; }).join(',') + ')');

    var cleanGateCfg = trueCanonCfgV();
    cleanGateCfg.overrides.buddies = { gd_watanabe: 'p08', gd_nagatani: 'p08', gd_kadou: 'p07', gd_maeda: 'p04' };
    var cleanGatePlan = P.mergePlan(cleanGateCfg), cleanGateTrip = P.scoreTrip(cleanGatePlan);
    ok(cleanGateTrip.total < 100 && cleanGateTrip.grade === 'B' && cleanGateTrip.gate.withheldA && !cleanGateTrip.gate.clean &&
       P.dayReadiness(cleanGatePlan, 'voyage').some(function (r) { return r.type === 'OVERLOAD'; }),
      'a care-task overload now loses an existing per-guest care point, so 100 remains mastery-only');

    var overCapCfg = trueCanonCfgV();
    overCapCfg.overrides.buddies = { gd_watanabe: 'p06', gd_nagatani: 'p06', gd_kadou: 'p06', gd_maeda: 'p06' };
    var overCapPlan = P.mergePlan(overCapCfg);
    ok(overCapPlan.buddies.gd_watanabe === 'p06' && overCapPlan.buddies.gd_nagatani === 'p06' &&
       !overCapPlan.buddies.gd_kadou && !overCapPlan.buddies.gd_maeda,
      'buddy assignments beyond the two-guest cap are removed from the accepted plan mapping');
  }

  var lateBuddyCfg = trueCanonCfgV();
  lateBuddyCfg.overrides.buddies = lateBuddyCfg.overrides.buddies || {};
  ['gd_yamate', 'gd_saito', 'gd_nobuaki'].forEach(function (gid) { lateBuddyCfg.overrides.buddies[gid] = 'p06'; });
  var lateBuddyPlan = P.mergePlan(lateBuddyCfg);
  ok(['gd_yamate', 'gd_saito', 'gd_nobuaki'].every(function (gid) { return !lateBuddyPlan.buddies[gid]; }) &&
     !P.tasksForSeg(lateBuddyPlan, 'voyage').some(function (t) { return /gd_yamate|gd_saito|gd_nobuaki/.test(t.id); }),
    'late-wave and non-care guests cannot acquire an outbound buddy or mint Voyage care tasks');

  // (d) missing bl_card authority fails the money gate (spec §3: "a new bl_card budget envelope
  // with approver and payMethod"). [integrator note] atom id matched by /card/i since the exact
  // derived id (e.g. voyage_money_bl_card, per the "money atoms are task-homed" precedent) isn't
  // pinned by the plan.
  var cardCfg = trueCanonCfgV();
  cardCfg.overrides.budget = cardCfg.overrides.budget || {};
  cardCfg.overrides.budget.lines = cardCfg.overrides.budget.lines || {};
  cardCfg.overrides.budget.lines.bl_card = { approverRoleId: 'budgetLead', payMethod: 'card' };
  var cardPlan = P.mergePlan(cardCfg);
  var cardAtom = P.scoreTrip(cardPlan).atoms.filter(function (a) { return /card/i.test(a.id); })[0];
  ok(!!cardAtom, 'a money atom keyed to bl_card exists in the ledger (' + (cardAtom && cardAtom.id) + ')');
  ok(!!cardAtom && cardAtom.earned === cardAtom.maxPts, 'granting bl_card approver+payMethod earns its money atom (' + (cardAtom && cardAtom.earned) + '/' + (cardAtom && cardAtom.maxPts) + ')');

  var noCardCfg = trueCanonCfgV();
  noCardCfg.overrides.budget = noCardCfg.overrides.budget || {};
  noCardCfg.overrides.budget.lines = noCardCfg.overrides.budget.lines || {};
  noCardCfg.overrides.budget.lines.bl_card = { approverRoleId: null, payMethod: null };
  var noCardPlan = P.mergePlan(noCardCfg);
  var noCardAtom = P.scoreTrip(noCardPlan).atoms.filter(function (a) { return /card/i.test(a.id); })[0];
  ok(!!noCardAtom && noCardAtom.earned === 0, 'missing bl_card authority -> its money atom earns 0 (' + (noCardAtom && noCardAtom.earned) + ')');
  ok(!!noCardAtom && noCardAtom.reasonKey === 'scr_money_gap', 'missing bl_card authority -> reasonKey scr_money_gap (' + (noCardAtom && noCardAtom.reasonKey) + ')');
})();

console.log('\n=== VOYAGE §4 — the re-derived constitution (spec §4; integrator-PINS) ===');
(function () {
  // integrator-PINS: spec §4's TARGET bucket sizes were pre-integration estimates only ("~").
  // MIGRATION (Voyage §4.1 senior-dev gate ruling, 2026-07-13): the riskable-socket revert
  // (+4 to Fishing Day, funded by four 1-pt shaves elsewhere) landed the FROZEN matrix — "The
  // frozen matrix (pinned at integration): frame 11 · load 10 · voyage 11 · arrival 12 · ops 13
  // · fishday 34 (heaviest) · return 9 = 100" (spec §4.1) — which supersedes §4's pre-amendment
  // ~30 fishday estimate (34−30 = 4, outside this check's own +/-3 tolerance). TARGET now carries
  // the ratified §4.1 exact values verbatim.
  var TARGET = { frame: 11, load: 10, voyage: 11, arrival: 12, ops: 13, fishday: 34, 'return': 9 };
  var PINS_VOYAGE = {
    gappyTotal: null,       // TBD — integrator measures scoreTrip(mergePlan(base)).total
    fixHandoffsJump: null,  // TBD — integrator measures the fixHandoffs delta from gappy
    ladderFinal: 100        // spec §6: the true canonical must still reach 100/A/clean (frozen)
  };

  var canonPlan = P.mergePlan(trueCanonCfgV());
  var gappyPlan = P.mergePlan(base);
  var tCanon = P.scoreTrip(canonPlan), tGappy = P.scoreTrip(gappyPlan);

  function sumMax(atoms) { var s = 0; atoms.forEach(function (a) { s += a.maxPts; }); return s; }
  ok(sumMax(tGappy.atoms) === 100, 'scoreTrip (Voyage): Sigma atoms.maxPts === 100 on gappy (' + sumMax(tGappy.atoms) + ')');
  ok(sumMax(tCanon.atoms) === 100, 'scoreTrip (Voyage): Sigma atoms.maxPts === 100 on canonical (' + sumMax(tCanon.atoms) + ')');

  var BUCKET_KEYS = ['frame', 'load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];
  var bb = {}; for (var k in tCanon.byBucket) bb[k] = tCanon.byBucket[k].maxPts;
  ok(BUCKET_KEYS.every(function (k) { return bb.hasOwnProperty(k); }) && Object.keys(bb).length === BUCKET_KEYS.length,
    'scoreTrip (Voyage): byBucket carries exactly the 7 buckets frame/load/voyage/arrival/ops/fishday/return (' + JSON.stringify(bb) + ')');
  var bbSum = 0; BUCKET_KEYS.forEach(function (k) { bbSum += bb[k]; });
  ok(bbSum === 100, 'scoreTrip (Voyage): byBucket maxPts sums to exactly 100 (' + bbSum + ')');
  BUCKET_KEYS.forEach(function (k) {
    ok(Math.abs(bb[k] - TARGET[k]) <= 3, 'scoreTrip (Voyage): bucket ' + k + ' lands near its spec §4 target ' + TARGET[k] + ' (+/-3, landed ' + bb[k] + ')');
  });

  // fishday is STRICTLY the heaviest bucket — the thesis, never a tie (spec §4)
  var maxOtherBucket = Math.max.apply(null, BUCKET_KEYS.filter(function (k) { return k !== 'fishday'; }).map(function (k) { return bb[k]; }));
  ok(bb.fishday > maxOtherBucket, 'scoreTrip (Voyage): fishday (' + bb.fishday + ') is strictly the heaviest bucket (next largest ' + maxOtherBucket + ')');

  // Information is STRICTLY the heaviest dimension (spec §4)
  var bd = {}; for (var k2 in tCanon.byDimension) bd[k2] = tCanon.byDimension[k2].maxPts;
  var bdSum = 0; for (var k3 in bd) bdSum += bd[k3];
  ok(bdSum === 100, 'scoreTrip (Voyage): byDimension maxPts sums to exactly 100 (' + bdSum + ')');
  var maxOtherDim = Math.max.apply(null, Object.keys(bd).filter(function (k) { return k !== 'info'; }).map(function (k) { return bd[k]; }));
  ok(bd.info > maxOtherDim, 'scoreTrip (Voyage): Information (' + bd.info + ') is strictly the heaviest dimension (next largest ' + maxOtherDim + ')');

  // fixHandoffs remains the single strictly-largest jump from the gappy seed, now measured
  // against every classic fix AND every applyDayFix candidate across all 5 non-fishday days
  var CLASSIC = ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn'];
  var deltas = {};
  CLASSIC.forEach(function (fx) { deltas[fx] = P.scoreTrip(P.mergePlan(P.applyFix(base, fx))).total - tGappy.total; });
  ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (seg) {
    deltas['applyDayFix_' + seg] = P.scoreTrip(P.mergePlan(P.applyDayFix(base, seg))).total - tGappy.total;
  });
  deltas.fixHandoffs = P.scoreTrip(P.mergePlan(P.applyFix(base, 'fixHandoffs'))).total - tGappy.total;
  var otherKeys = Object.keys(deltas).filter(function (k) { return k !== 'fixHandoffs'; });
  var maxOther = Math.max.apply(null, otherKeys.map(function (k) { return deltas[k]; }));
  ok(deltas.fixHandoffs > maxOther, 'scoreTrip (Voyage): fixHandoffs delta (+' + deltas.fixHandoffs + ') remains the single strictly-largest jump (next best +' + maxOther + ', ' + JSON.stringify(deltas) + ')');

  // the true canonical (all classic fixes + applyDayFix over all 5 non-fishday authorable days)
  // still reaches 100/A/clean — the spec §6 anchor extended to the 2 new segments
  ok(tCanon.total === PINS_VOYAGE.ladderFinal && tCanon.grade === 'A' && tCanon.gate.clean === true,
    'scoreTrip (Voyage): true canonical (classic fixes + load/voyage/arrival/ops/return canonDay) -> 100/A/clean (' + tCanon.total + '/' + tCanon.grade + ')');
  ok(tCanon.atoms.every(function (a) { return a.earned === a.maxPts; }), 'scoreTrip (Voyage): true canonical -> every atom earns its maxPts exactly (no surviving gap)');

  // gappy grades D (spec §6 target band 45-60, extended into load/voyage's own seed gaps —
  // "load ships with the jig case never assigned + cabin list unshared", "voyage ships with 2 VIP
  // buddies unassigned + card authority missing"). Exact PINS_VOYAGE.gappyTotal is TBD above.
  ok(tGappy.grade === 'D' || (tGappy.total >= 45 && tGappy.total <= 60),
    'scoreTrip (Voyage): gappy trip is in the D band 45-60 (or grade D) pending the exact integrator PINS (' + tGappy.total + '/' + tGappy.grade + ')');
  ok(tGappy.gate.clean === false, 'scoreTrip (Voyage): gappy trip is not clean');

  console.log('  [integrator] voyage byBucket:', JSON.stringify(bb));
  console.log('  [integrator] voyage byDimension:', JSON.stringify(bd));
  console.log('  [integrator] voyage gappy total:', tGappy.total, 'grade:', tGappy.grade, 'fixHandoffs jump:', deltas.fixHandoffs);
})();

console.log('\n=== VOYAGE — i18n additions (plan §Key pinned interfaces) ===');
(function () {
  var STR = require('./i18n.js');
  var enKeys = Object.keys(STR.en || {}), jaKeys = Object.keys(STR.ja || {});
  // symmetric parity re-affirmed here (already asserted once in the v1.0 §8 block above); kept
  // as its own check in the Voyage section so a future edit to either block alone still catches
  // an asymmetry introduced by the new gd_*/snd*/day-label keys
  var onlyEn = enKeys.filter(function (k) { return jaKeys.indexOf(k) < 0; });
  var onlyJa = jaKeys.filter(function (k) { return enKeys.indexOf(k) < 0; });
  ok(onlyEn.length === 0 && onlyJa.length === 0, 'i18n: EN/JA key sets stay symmetric after the Voyage additions (only-EN=' + onlyEn.join(',') + ' only-JA=' + onlyJa.join(',') + ')');

  // RECONCILIATION (W1-gate Opus review): the plan's speculative "gd_* i18n key family" guess did
  // not land — the engine's actual (final) shape carries guest/care bilingual content INLINE on
  // plan.guests (id gd_*, name:{en,jp}), never as i18n.js STR keys (confirmed: i18n.js has zero
  // buddy/starlink/escort/vip/care/gd_ occurrences). That inline shape is exactly what "Key pinned
  // interfaces" asked for (full EN/JP parity on the guest/care surface) — reconciled here to assert
  // it against its real location instead of a nonexistent i18n key family.
  var gdPlan = P.mergePlan(trueCanonCfgV());
  var gdGuests = gdPlan.guests || [];
  ok(gdGuests.length > 0 && gdGuests.every(function (g) { return /^gd_/.test(g.id) && g.name && g.name.en && g.name.jp; }),
    'i18n (reconciled): every guest/care id (gd_*) carries a full EN+JP bilingual name inline on plan.guests (' + gdGuests.length + ')');
  ok(gdGuests.filter(function (g) { return g.vip; }).length === 4 && gdGuests.filter(function (g) { return g.vip; }).every(function (g) { return g.name.en && g.name.jp; }),
    'i18n (reconciled): all 4 VIP guest/care entries carry bilingual names');

  // day labels for load/voyage — exact key name not pinned by the plan, matched loosely on the
  // segment name so this survives a rename
  ok(enKeys.some(function (k) { return /load|voyage/i.test(k); }), 'i18n: at least one EN key names load/voyage');
  ok(jaKeys.some(function (k) { return /load|voyage/i.test(k); }), 'i18n: at least one JA key names load/voyage');
})();

console.log('\n=== SEGMENT-AWARE MAP PROFILES (presentation-only) ===');
(function () {
  // stage.js is browser-first; a tiny window shim exposes its pure profile API
  // without a browser or canvas dependency.
  global.window = { PRS: P };
  delete require.cache[require.resolve('./stage.js')];
  require('./stage.js');
  var S = global.window.PRS_STAGE;
  var canvasFontCases = [8, 9.4, 10.5, 11, 14.2, 19];
  ok(canvasFontCases.every(function (px) {
    return S.localizedFont('600', px, 'system-ui,sans-serif', 'en') ===
      '600 ' + Math.round(px) + 'px system-ui,sans-serif';
  }), 'map type: localized Canvas helper leaves every sampled EN font string byte-identical');
  ok(canvasFontCases.every(function (px) {
    var jaPx = parseFloat(S.localizedFont('600', px, 'system-ui,sans-serif', 'ja').match(/ ([0-9.]+)px /)[1]);
    var roundedBase = Math.round(px), exact = Math.round(roundedBase * 1.06 * 100) / 100;
    var ratio = jaPx / roundedBase;
    return jaPx === exact && ratio >= 1.059 && ratio <= 1.061;
  }), 'map type: explicit JA override applies exactly 1.06 after legacy px rounding (bounded 5.9–6.1%)');
  var stageTypeSource = require('fs').readFileSync(require('path').join(__dirname, 'stage.js'), 'utf8');
  var jaWordmarkStart = stageTypeSource.indexOf("chip(ctx, cx, y0 + 7 * scale, 'おがさわら丸', {");
  var jaWordmarkEnd = jaWordmarkStart < 0 ? -1 : stageTypeSource.indexOf('      });', jaWordmarkStart);
  var jaWordmarkBlock = jaWordmarkEnd < 0 ? '' : stageTypeSource.slice(jaWordmarkStart, jaWordmarkEnd);
  ok(stageTypeSource.indexOf("gctx.font = '800 ' + Math.round(10 * scale) + 'px system-ui,sans-serif';") >= 0 &&
      stageTypeSource.indexOf("ctx.font = 'bold ' + Math.round(11 * scale) + 'px sans-serif';") >= 0 &&
      jaWordmarkBlock.indexOf("font: '800 ' + Math.round(9 * scale) + 'px system-ui,sans-serif'") >= 0 &&
      jaWordmarkBlock.indexOf('maxW:') < 0 &&
      stageTypeSource.indexOf("chip(ctx, cx, y0 + 7 * scale, '島間船（船名・時刻未確認）', {") >= 0 &&
      stageTypeSource.indexOf("suffix: ' 🎣', suffixFont: '600 ' + Math.round(9 * scale)") >= 0 &&
      stageTypeSource.indexOf("suffix: ' 🛥', suffixFont: '600 ' + Math.round(9 * scale)") >= 0 &&
      stageTypeSource.indexOf("var bopts = { tail: 'down', font: chipFont") >= 0,
    'map type: decorative wordmarks, numeric badges, Kimura/Nobu emoji, and BUB icons retain legacy draw geometry');
  ok(stageTypeSource.indexOf("else gctx.fillText(a.name, a.x * w + (i > 3 ? -9 : 9) * scale, a.y * h - 7 * scale);") >= 0 &&
      stageTypeSource.indexOf("else gctx.fillText('Dashed return is inferred as the reverse route · timetable unconfirmed', w * 0.52, h * 0.92);") >= 0 &&
      stageTypeSource.indexOf("ctx.fillText(nm(st.name), cx, discCy + footR + (isHub ? footR * 0.6 : 6 * scale));") >= 0,
    'map type: EN overview, footer, and station labels keep legacy three-argument fillText calls');
  ok(stageTypeSource.indexOf("chip(ctx, cx, cy + 8 * scale, 'Kimura-san 🎣', {") >= 0 &&
      stageTypeSource.indexOf("chip(ctx, cx, cy + 10 * scale, 'Nobu-san 🛥', {") >= 0 &&
      stageTypeSource.indexOf("chip(ctx, cx, y0 + 7 * scale, namedLongHaul ? 'OGASAWARA-MARU' : 'INTER-ISLAND VESSEL · UNCONFIRMED', {") >= 0 &&
      stageTypeSource.indexOf("chip(ctx, cx, feetY + 5 * figs, label, { font: chipFont, pad: chipPad, h: chipH, r: chipR });") >= 0 &&
      stageTypeSource.indexOf("if (_lang === 'ja') sceneLabelOpts.maxW") >= 0,
    'map type: EN person/emoji chips stay single-run and scene width fitting remains JA-only');
  function profile(seg, min, requested, cfg) {
    var s = P.createSim(cfg || base, seg, { animate: true });
    if (typeof min === 'number') s.clockMin = min;
    return { sim: s, p: S.sceneProfile(s, { mapProfile: requested || seg }) };
  }
  var loadRef = profile('load'), hotelMove = loadRef.sim.sched.byTask.hd_l_truck;
  ok(profile('load', hotelMove.start - 1).p.id === 'tokyo-hotel' && profile('load', hotelMove.start).p.id === 'takeshiba-terminal',
    'map: Load changes from the Tokyo hotel to Takeshiba at the solved 10:00 departure');
  ok(profile('voyage', 660).p.id === 'ogasawara-maru', 'map: Voyage uses the Ogasawara-maru scene');

  var arrivalRef = profile('arrival'), disembark = arrivalRef.sim.sched.byTask.hd_a_disembark;
  var cross = arrivalRef.sim.sched.byTask.hd_a_cross;
  ok(profile('arrival', disembark.start - 1).p.id === 'ogasawara-maru' &&
     profile('arrival', disembark.start).p.id === 'chichijima-transfer' &&
     profile('arrival', cross.start).p.id === 'interisland-ferry' &&
     profile('arrival', cross.end).p.id === 'hahajima-hinata',
    'map: Arrival follows Ogasawara-maru → Chichijima transfer → inter-island vessel → Hahajima');
  ok(profile('ops', 600).p.id === 'hahajima-hinata' && profile('fishday', 780).p.id === 'hahajima-hinata',
    'map: Ops/Fishing Day stay at Hinata on Hahajima');

  var allSim = P.createSim(base, 'all', { animate: true });
  var allProfile = S.sceneProfile(allSim, { mapProfile: 'all' });
  var overviewPts = S.routePoints({ lang: 'en' });
  ok(allProfile.id === 'route-overview' && overviewPts.map(function (p) { return p.profileId; }).join('>') ===
     'tokyo-hotel>takeshiba-terminal>ogasawara-maru>chichijima-transfer>interisland-ferry>hahajima-hinata',
    'map: Whole Trip overview preserves all six physical route identities in order');

  var returnRef = profile('return'), interReturn = returnRef.sim.sched.byTask.hd_r_interisland;
  var sail = returnRef.sim.sched.byTask.hd_r_sail;
  ok(profile('return', interReturn.start - 1).p.id === 'hahajima-hinata',
    'map: Return stays at Hinata until the solved inter-island crossing starts');
  ok(profile('return', interReturn.start).p.id === 'interisland-ferry' &&
     profile('return', interReturn.end).p.id === 'chichijima-transfer',
    'map: Return crosses on the inter-island vessel and then reaches the Chichijima transfer');
  ok(profile('return', sail.start).p.id === 'ogasawara-maru' && profile('return', sail.end).p.id === 'takeshiba-terminal',
    'map: Return changes at Chichijima to Ogasawara-maru and ends at Takeshiba');
  var returnProfile = profile('return', sail.start).p;
  ok(returnProfile.routeDirection === 'return' && returnProfile.inferred === true,
    'map: every rendered reverse-route scene remains explicitly inferred');

  var movedCfg = { seed: 1, overrides: { days: { return: { placement: {
    hd_r_sail: { startMin: 900, durMin: 300, assignedIds: ['p03'] }
  } } } } };
  var movedRef = profile('return', null, null, movedCfg), movedSail = movedRef.sim.sched.byTask.hd_r_sail;
  var unplacedCfg = { seed: 1, overrides: { days: { return: { placement: { hd_r_sail: null } } } } };
  ok(profile('return', movedSail.start - 1, null, movedCfg).p.id === 'chichijima-transfer' &&
     profile('return', movedSail.start, null, movedCfg).p.id === 'ogasawara-maru' &&
     profile('return', movedSail.end, null, movedCfg).p.id === 'takeshiba-terminal' &&
     profile('return', 2000, null, unplacedCfg).p.id === 'chichijima-transfer',
     'map: edited long-haul time drives the transition, and an unplaced sailing remains at Chichijima');

  // Drive the real five-minute clock too: the first rendered ship/Tokyo frames
  // must land on the first tick at or after the solved schedule boundaries.
  var drivenReturn = P.createSim(base, 'return', { animate: true });
  var drivenInter = drivenReturn.sched.byTask.hd_r_interisland, drivenSail = drivenReturn.sched.byTask.hd_r_sail;
  var firstInter = null, firstChichi = null, firstShip = null, firstTokyo = null, driveGuard = 0;
  var driveLimit = Math.ceil((drivenReturn.winEnd - drivenReturn.winStart) / P.MIN_DT) + 100;
  while (!drivenReturn.finished && driveGuard++ < driveLimit) {
    if (drivenReturn.paused) { drivenReturn.paused = false; drivenReturn.checkpoint = null; }
    P.tick(drivenReturn);
    var drivenId = S.sceneProfile(drivenReturn, { mapProfile: 'return' }).id;
    if (firstInter == null && drivenId === 'interisland-ferry') firstInter = drivenReturn.clockMin;
    if (firstChichi == null && drivenId === 'chichijima-transfer') firstChichi = drivenReturn.clockMin;
    if (firstShip == null && drivenId === 'ogasawara-maru') firstShip = drivenReturn.clockMin;
    if (firstTokyo == null && drivenId === 'takeshiba-terminal') firstTokyo = drivenReturn.clockMin;
  }
  ok(firstInter >= drivenInter.start && firstInter < drivenInter.start + P.MIN_DT &&
     firstChichi >= drivenInter.end && firstChichi < drivenInter.end + P.MIN_DT,
    'map: driven Return enters the inter-island vessel and Chichijima on their first engine ticks (' + firstInter + '/' + firstChichi + ')');
  ok(firstShip >= drivenSail.start && firstShip < drivenSail.start + P.MIN_DT,
    'map: driven Return enters Ogasawara-maru on the first engine tick after solved departure (' + firstShip + ')');
  ok(firstTokyo >= drivenSail.end && firstTokyo < drivenSail.end + P.MIN_DT,
    'map: driven Return enters Takeshiba on the first engine tick after solved arrival (' + firstTokyo + ')');

  var puritySim = P.createSim(base, 'return', { animate: true }), purityBefore = JSON.stringify(puritySim);
  S.sceneProfile(puritySim, { mapProfile: 'return' });
  S.stationsForScene(puritySim, { mapProfile: 'return' });
  S.stationStateForScene('mess', puritySim, { mapProfile: 'return' }, P.stationReadiness(puritySim));
  ok(JSON.stringify(puritySim) === purityBefore, 'map: exported profile/station helpers are presentation-pure');

  var profileIds = ['tokyo-hotel','takeshiba-terminal','ogasawara-maru','chichijima-transfer','interisland-ferry','hahajima-hinata','route-overview'];
  ok(profileIds.every(function (id) { var p0 = S.sceneProfile(null, { mapProfile: id }); return p0.en && p0.jp && p0.family && p0.stationSet; }),
    'map: every exact scene profile has bilingual status + family/station metadata');

  var loadP = profile('load', hotelMove.start - 1), terminalP = profile('load', hotelMove.start), islandP = profile('fishday', 780);
  var loadKey = S.groundCacheKey(loadP.p, 900, 500, 2, 1);
  var terminalKey = S.groundCacheKey(terminalP.p, 900, 500, 2, 1);
  var islandKey = S.groundCacheKey(islandP.p, 900, 500, 2, 1);
  ok(loadKey !== terminalKey && loadKey !== islandKey &&
     loadKey !== S.groundCacheKey(loadP.p, 901, 500, 2, 1) &&
     loadKey !== S.groundCacheKey(loadP.p, 900, 500, 1, 1) &&
     loadKey !== S.groundCacheKey(loadP.p, 900, 500, 2, 1.1),
    'map: terrain cache key separates profile, size, DPR, and scale');
  var hotelFlags = S.domFlagsForScene(loadP.sim, { mapProfile: 'load' });
  var terminalFlags = S.domFlagsForScene(terminalP.sim, { mapProfile: 'load' });
  ok(loadP.p.kind === 'hotel' && terminalP.p.kind === 'terminal' &&
     hotelFlags.water === false && terminalFlags.water === true,
    'map: Tokyo hotel interior and Takeshiba waterfront expose different physical landscape semantics');
  ok(hotelFlags.seaLife === false && terminalFlags.seaLife === false &&
     hotelFlags.localBoat === false && terminalFlags.localBoat === false,
    'map: neither Tokyo landscape leaks Hahajima wildlife or local fishing boats');
  var hotelVisible = S.stationsForScene(loadP.sim, { mapProfile: 'load' }).filter(function (st) { return !st.hidden; }).map(function (st) { return st.id; }).sort();
  var terminalStations = S.stationsForScene(terminalP.sim, { mapProfile: 'load' });
  var terminalVisible = terminalStations.filter(function (st) { return !st.hidden; }).map(function (st) { return st.id; }).sort();
  ok(hotelVisible.join(',') === 'command,lodging,mess' && terminalVisible.join(',') === 'command,mess,port,vessel',
    'map: hotel rooms/lobby/breakfast topology differs from terminal assembly/concourse/berth/boarding');
  var terminalNames = terminalStations.filter(function (st) { return !st.hidden; }).map(function (st) { return st.name.en; });
  ok(terminalNames.indexOf('Takeshiba berth') >= 0 && terminalNames.indexOf('Ogasawara-maru boarding') >= 0,
    'map: Takeshiba landscape names its actual berth and moored Ogasawara-maru');
  var loadNames = S.stationsForScene(loadP.sim, { mapProfile: 'load' }).filter(function (st) { return !st.hidden; }).map(function (st) { return st.name.en; });
  ok(loadNames.indexOf('Hotel lobby') >= 0 && loadNames.indexOf('Breakfast room') >= 0 &&
     !loadNames.some(function (name) { return /Hinata|Hahajima/.test(name); }),
    'map: Tokyo hotel preparation uses hotel fixtures, never Hinata fixtures');

  var loadLive = P.createSim(base, 'load', { animate: true }); P.tick(loadLive);
  var loadAnchor = S.stationsForScene(loadLive, { mapProfile: 'load' }).filter(function (st) { return st.id === 'mess'; })[0];
  var loadState = S.stationStateForScene(loadAnchor, loadLive, { mapProfile: 'load' }, P.stationReadiness(loadLive));
  ok(loadState.crewCount === 1 && loadState.readiness === 'green',
    'map: hotel breakfast activity aggregates into the visible breakfast room');
  var returnIslandSim = profile('return', interReturn.start - 1).sim;
  var returnInterSim = profile('return', interReturn.start).sim;
  var returnChichiSim = profile('return', interReturn.end).sim;
  var returnShipSim = profile('return', sail.start).sim;
  ok(S.stationForScene('finance', returnIslandSim, { mapProfile: 'return' }).id === 'mess' &&
     S.stationForScene('finance', returnInterSim, { mapProfile: 'return' }).id === 'mess' &&
     S.stationForScene('finance', returnChichiSim, { mapProfile: 'return' }).id === 'command' &&
     S.stationForScene('finance', returnShipSim, { mapProfile: 'return' }).id === 'purser',
    'map: folded Finance work follows the physical fixture for Hahajima, inter-island vessel, Chichijima, and Ogasawara-maru');
  var returnFlags = S.domFlagsForScene(returnIslandSim, { mapProfile: 'return' });
  var fishingFlags = S.domFlagsForScene(profile('fishday', 780).sim, { mapProfile: 'fishday' });
  ok(returnFlags.localBoat === false && returnFlags.inferred === true && fishingFlags.localBoat === true && fishingFlags.seaLife === true,
    'map: local fishing boats/sea life stay on Hahajima operations and disappear from inferred return transport');

  // Render one static frame of every profile through a STRICT recording-canvas
  // shim. Unknown methods/properties throw, so a misspelled Canvas API cannot
  // silently pass as it would under an accept-everything Proxy.
  var grad = function () { return { addColorStop: function (offset) {
    if (typeof offset !== 'number' || !isFinite(offset) || offset < 0 || offset > 1) throw new Error('Invalid Canvas gradient stop: ' + offset);
  } }; };
  var canvasMethods = { arc:1, arcTo:1, beginPath:1, clearRect:1, clip:1, closePath:1, drawImage:1,
    ellipse:1, fill:1, fillRect:1, fillText:1, lineTo:1, moveTo:1, quadraticCurveTo:1, restore:1,
    rotate:1, save:1, scale:1, setLineDash:1, setTransform:1, stroke:1, strokeRect:1, translate:1 };
  var canvasProps = { fillStyle:1, strokeStyle:1, lineWidth:1, lineCap:1, lineJoin:1, lineDashOffset:1,
    shadowColor:1, shadowBlur:1, font:1, textAlign:1, textBaseline:1, globalAlpha:1, globalCompositeOperation:1,
    _prsGrain:1, _prsLand:1 };
  function strictCanvas(onClear) { return new Proxy({ globalAlpha: 1, _depth: 0 }, {
    get: function (t, prop) {
      if (Object.prototype.hasOwnProperty.call(t, prop)) return t[prop];
      if (prop === 'measureText') return function (s) { return { width: String(s).length * 6 }; };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return grad;
      if (prop === 'createPattern') return function () { return null; };
      if (prop === 'clearRect' && onClear) return onClear;
      if (prop === 'save') return function () { t._depth++; };
      if (prop === 'restore') return function () { if (t._depth <= 0) throw new Error('Unbalanced Canvas restore'); t._depth--; };
      if (canvasMethods[prop]) return function () {
        var args = Array.prototype.slice.call(arguments);
        for (var ai = 0; ai < args.length; ai++) if (typeof args[ai] === 'number' && !isFinite(args[ai])) throw new Error('Non-finite Canvas argument for ' + prop);
        if (prop === 'arc' && args[2] < 0) throw new Error('Negative arc radius');
        if (prop === 'ellipse' && (args[2] < 0 || args[3] < 0)) throw new Error('Negative ellipse radius');
        if (prop === 'setLineDash' && (!Array.isArray(args[0]) || args[0].some(function (n) { return typeof n !== 'number' || !isFinite(n) || n < 0; }))) throw new Error('Invalid line dash');
      };
      if (canvasProps[prop]) return undefined;
      throw new Error('Unknown CanvasRenderingContext2D member: ' + String(prop));
    },
    set: function (t, prop, value) {
      if (!canvasProps[prop]) throw new Error('Unknown CanvasRenderingContext2D property: ' + String(prop));
      t[prop] = value; return true;
    }
  }); }
  var ctx = strictCanvas();
  var frames = [
    ['load', hotelMove.start - 1], ['load', hotelMove.start], ['voyage', 660],
    ['arrival', disembark.start], ['arrival', cross.start], ['arrival', cross.end],
    ['ops', 600], ['fishday', 780], ['return', interReturn.start],
    ['return', interReturn.end], ['return', sail.start], ['return', sail.end],
    ['all', null, 'all'],
    ['load', hotelMove.start - 1, null, 360, 640], ['load', hotelMove.start, null, 360, 640],
    ['load', hotelMove.start - 1, null, 1440, 720], ['load', hotelMove.start, null, 1440, 720]
  ];
  var renderErr = null;
  try {
    frames.forEach(function (row) {
      var x = profile(row[0], row[1], row[2]), fig = {}, fw = row[3] || 900, fh = row[4] || 500;
      x.sim.participants.forEach(function (person) {
        var st = P.station(person.station);
        fig[person.id] = { pid: person.id, cx: st.x * fw, cy: st.y * fh, tx: st.x * fw, ty: st.y * fh, walking: false, faceL: false };
      });
      S.scene(ctx, x.sim, 1, { w: fw, h: fh, scale: Math.max(1, Math.min(1.7, Math.min(fw / 1000, fh / 560))), lang: 'en', rm: row[0] !== 'voyage', mapProfile: row[2] || row[0], night: false,
        guestsVisible: false, fig: fig, guest: {}, boat: { cx: fw * 0.52, cy: fh * 0.55 }, wakes: [], motes: [],
        cascade: { hops: [], has: false }, ghost: [{}, {}, {}], trail: [], chain: [], hotPts: [], frozen: false });
      if (ctx._depth !== 0) throw new Error('Unbalanced Canvas save/restore after ' + row[0] + ' frame: ' + ctx._depth);
    });
  } catch (e) { renderErr = e; }
  ok(!renderErr, 'map: every scene profile renders a dependency-free static frame' + (renderErr ? ' (' + renderErr.message + ')' : ''));

  // Exercise the real offscreen-cache branch too. Equal dimensions must redraw
  // for each physical scene rather than reusing terrain from a prior stop.
  var cacheClears = 0;
  var offCtx = strictCanvas(function () { cacheClears++; });
  global.document = { createElement: function () { return { width: 0, height: 0, getContext: function () { return offCtx; } }; } };
  try {
    [
      ['load', hotelMove.start - 1], ['load', hotelMove.start - 1],
      ['load', hotelMove.start], ['load', hotelMove.start],
      ['voyage', 660], ['voyage', 660],
      ['arrival', disembark.start], ['arrival', cross.start],
      ['fishday', 780]
    ].forEach(function (row) {
      var x = profile(row[0], row[1]), fig = {};
      x.sim.participants.forEach(function (person) {
        var st = P.station(person.station);
        fig[person.id] = { pid: person.id, cx: st.x * 900, cy: st.y * 500, tx: st.x * 900, ty: st.y * 500, walking: false, faceL: false };
      });
      S.scene(ctx, x.sim, 1, { w: 900, h: 500, scale: 1, lang: 'en', rm: true, mapProfile: row[0], night: false,
        guestsVisible: false, fig: fig, guest: {}, boat: { cx: 468, cy: 275 }, wakes: [], motes: [],
        cascade: { hops: [], has: false }, ghost: [{}, {}, {}], trail: [], chain: [], hotPts: [], frozen: false });
    });
    S.resizeStage({ w: 900, h: 500 }, 2);
    var dprFrame = profile('fishday', 780), dprFig = {};
    dprFrame.sim.participants.forEach(function (person) {
      var st = P.station(person.station);
      dprFig[person.id] = { pid: person.id, cx: st.x * 900, cy: st.y * 500, tx: st.x * 900, ty: st.y * 500, walking: false, faceL: false };
    });
    S.scene(ctx, dprFrame.sim, 1, { w: 900, h: 500, scale: 1, lang: 'en', rm: true, mapProfile: 'fishday', night: false,
      guestsVisible: false, fig: dprFig, guest: {}, boat: { cx: 468, cy: 275 }, wakes: [], motes: [],
      cascade: { hops: [], has: false }, ghost: [{}, {}, {}], trail: [], chain: [], hotPts: [], frozen: false });
  } finally { delete global.document; }
  ok(cacheClears === 7,
    'map: cache reuses identical profiles but redraws hotel→terminal→long-haul→Chichijima→inter-island→Hahajima and on DPR change (' + cacheClears + ' redraws)');

  // Report replays rebuild a fresh sim; prove that copying the completed run's
  // sim-local hand-feeds reproduces its final schedule exactly.
  var intervened = P.createSim(base, 'return', { animate: true });
  intervened.clockMin = 480; P.intervene(intervened, 'ic_cash', 'logi');
  var replayed = P.createSim(intervened.cfg, 'return', { animate: true });
  replayed.injections = intervened.injections.map(function (inj) { return { cardId: inj.cardId, toRoleId: inj.toRoleId, min: inj.min }; });
  replayed.sched = P.daySchedule(replayed.plan, 'return', replayed.injections);
  ok(JSON.stringify(replayed.sched) === JSON.stringify(intervened.sched),
    'map report: reapplying sim-local interventions reproduces the completed Return schedule');
})();

// ============================================================================
// TEACHING MVP — operational assumptions, feasible channels, and a deterministic
// communications-outage challenge. These contracts are additive: the canonical
// rehearsal still earns 100/A even while real-world route facts remain unresolved.
// ============================================================================
console.log('\n=== TEACHING MVP — readiness, channel feasibility, and scenarios ===');
(function () {
  var canonCfg = trueCanonCfgV(), canonPlan = P.mergePlan(canonCfg);
  var canonTrip = P.scoreTrip(canonPlan), canonFish = P.daySchedule(canonPlan, 'fishday');

  ok(!!P.SCENARIOS.normal && !!P.SCENARIOS['comms-outage'] && typeof P.applyScenario === 'function',
    'scenario API exports normal + comms-outage and a pure applicator');
  var sourceJson = JSON.stringify(canonCfg);
  var outageCfgA = P.applyScenario(canonCfg, 'comms-outage');
  var outageCfgB = P.applyScenario(canonCfg, 'comms-outage');
  ok(JSON.stringify(canonCfg) === sourceJson && outageCfgA !== canonCfg && outageCfgA.overrides !== canonCfg.overrides,
    'applyScenario clones its config and does not mutate caller-owned overrides');
  ok(JSON.stringify(outageCfgA) === JSON.stringify(outageCfgB) && outageCfgA.scenarioId === 'comms-outage',
    'applyScenario is deterministic and records the selected scenario as config data');

  var normalPlan = P.mergePlan(P.applyScenario(canonCfg, 'normal'));
  ok(JSON.stringify(P.daySchedule(normalPlan, 'fishday')) === JSON.stringify(canonFish),
    'normal scenario preserves every canonical fishday schedule anchor');
  ok(P.scoreTrip(normalPlan).total === canonTrip.total && canonTrip.total === 100 && canonTrip.grade === 'A',
    'normal scenario preserves the canonical 100/A scoreTrip result');

  // Guided progressive-disclosure tutorial seam: the UI may reveal one repair
  // at a time, but the lesson itself is an engine contract. Start from the true
  // canonical Day 3, remove only the food handoff, then repair that socket with
  // a separately-id'd feasible path. These checks deliberately avoid app.js
  // source text and DOM copy: a renamed panel or shorter hint cannot make them
  // pass while the tutorial's causal example is broken.
  var guidedFood = P.canonHandoffs().filter(function (h) { return h.id === 'h_food'; })[0];
  ok(!!guidedFood && guidedFood.cardId === 'ic_food' && guidedFood.fromTaskId === 't_f_food' &&
     guidedFood.toTaskId === 't_f_menu' && canonPlan.handoffs.some(function (h) { return h.id === 'h_food'; }),
    'guided tutorial: canonical Day 3 contains the food handoff into the menu task');

  var guidedCanonBefore = JSON.stringify(canonPlan);
  var guidedGapCfg = JSON.parse(JSON.stringify(canonCfg));
  guidedGapCfg.overrides.handoffs = guidedGapCfg.overrides.handoffs || {};
  guidedGapCfg.overrides.handoffs.h_food = null;
  var guidedGapPlan = P.mergePlan(guidedGapCfg);
  var guidedGapDay = P.daySchedule(guidedGapPlan, 'fishday');
  var guidedGapReady = P.dayReadiness(guidedGapPlan, 'fishday');
  var guidedMissing = guidedGapDay.missing.map(function (g) { return g.taskId + '|' + g.cardId; });
  ok(!guidedGapPlan.handoffs.some(function (h) { return h.id === 'h_food'; }) &&
     guidedMissing.length === 1 && guidedMissing[0] === 't_f_menu|ic_food' && guidedGapDay.late.length === 0,
    'guided tutorial: deleting only h_food yields exactly the earliest menu|food missing pair');
  ok(guidedGapReady.length === 1 && guidedGapReady[0].type === 'MISSING_ARROW' &&
     guidedGapReady[0].taskId === 't_f_menu' && guidedGapReady[0].cardId === 'ic_food' &&
     P.scoreDay(guidedGapPlan, 'fishday').clean === false,
    'guided tutorial: the single missing food path surfaces as one actionable Day-3 readiness gap');
  ok(guidedGapDay.idleTotal === 240 && guidedGapDay.reworkTotal === 90 && guidedGapDay.efficiency === 91 &&
     guidedGapDay.dinnerMin === 1110,
    'guided tutorial: the missing food path creates visible wait/rework and moves dinner from 18:00 to 18:30');

  var guidedRepairCfg = JSON.parse(JSON.stringify(guidedGapCfg));
  // Build the same shape the Live UI commits instead of cloning the canonical
  // answer. This catches missing endpoint/trigger fields in the real repair seam.
  var guidedRepair = {
    id: 'h_food_guided_repair', cardId: 'ic_food',
    fromRoleId: 'budgetLead', fromTaskId: 't_f_food',
    toRoleId: 'chef', toTaskId: 't_f_menu',
    trigger: { type: 'onTaskDone', taskId: 't_f_food' }, channel: 'radio',
    ifLate: 'idle', reworkKind: null, content: { en: '', jp: '' }
  };
  guidedRepairCfg.overrides.handoffs[guidedRepair.id] = guidedRepair;
  var guidedRepairPlan = P.mergePlan(guidedRepairCfg);
  var guidedRepairDay = P.daySchedule(guidedRepairPlan, 'fishday');
  var guidedRepairScore = P.scoreDay(guidedRepairPlan, 'fishday');
  ok(P.channelFeasibility(guidedRepairPlan, guidedRepair, 'fishday').ok === true &&
     !guidedRepairPlan.handoffs.some(function (h) { return h.id === 'h_food'; }) &&
     guidedRepairPlan.handoffs.some(function (h) { return h.id === guidedRepair.id; }) &&
     guidedRepairDay.missing.length === 0 && guidedRepairDay.late.length === 0 &&
     guidedRepairDay.idleTotal === 0 && P.dayReadiness(guidedRepairPlan, 'fishday').length === 0 &&
     guidedRepairScore.score === 100 && guidedRepairScore.grade === 'A' && guidedRepairScore.clean === true,
    'guided tutorial: a feasible replacement path restores Day 3 to clean 100/A');
  ok(JSON.stringify(canonPlan) === guidedCanonBefore,
    'guided tutorial variants do not mutate the canonical plan');

  var planBeforeAssumptions = JSON.stringify(canonPlan);
  var assumptionsA = P.criticalAssumptions(canonPlan), assumptionsB = P.criticalAssumptions(canonPlan);
  var unresolvedIds = assumptionsA.filter(function (x) { return x.status === 'unresolved'; }).map(function (x) { return x.id; }).sort();
  ok(JSON.stringify(assumptionsA) === JSON.stringify(assumptionsB) && JSON.stringify(canonPlan) === planBeforeAssumptions,
    'criticalAssumptions is deterministic and does not mutate the plan');
  ok(unresolvedIds.join(',') === 'chichijima-connection-time,day-6-guest-exchange,hotel-breakfast-time,interisland-vessel-name,return-timetable',
    'criticalAssumptions exposes breakfast, vessel-name, Chichijima connection, Day-6 guest exchange, and return-timetable facts');
  var er = P.executionReadiness(canonPlan);
  ok(er.rehearsalComplete === true && er.realExecutionReady === false && er.status === 'rehearsal-complete' && er.unresolvedCount === 5,
    'canonical 100/A is rehearsal-complete but not real-execution-ready while 5 critical facts are unknown');
  ok(P.scoreTrip(canonPlan).total === 100 && P.scoreTrip(canonPlan).grade === 'A' && P.scoreTrip(canonPlan).gate.clean === true,
    'critical external assumptions do not deduct scoreTrip points or withhold the rehearsal A');

  // Demonstrate the other side of the contract without adding invented facts to the
  // template: a caller-supplied, confirmed plan can become real-execution-ready.
  var confirmedPlan = P.mergePlan(canonCfg), ci;
  function cleg(id) { return confirmedPlan.itinerary.filter(function (x) { return x.id === id; })[0]; }
  cleg('out-breakfast').departMin = 450;
  cleg('out-ogasawara-maru').arriveMin = 2100;
  cleg('out-interisland').departMin = 2160;
  confirmedPlan.vessels.filter(function (x) { return x.id === 'interisland-vessel'; })[0].knownName = true;
  for (ci = 0; ci < confirmedPlan.itinerary.length; ci++) if (confirmedPlan.itinerary[ci].direction === 'return') {
    confirmedPlan.itinerary[ci].confirmed = true;
    confirmedPlan.itinerary[ci].departMin = 3000 + ci * 60;
  }
  confirmedPlan.project.route.returnConfirmed = true;
  confirmedPlan.project.guestRotationExchange.logisticsAttested = true;
  var confirmedEr = P.executionReadiness(confirmedPlan);
  ok(confirmedEr.rehearsalComplete && confirmedEr.realExecutionReady && confirmedEr.status === 'real-execution-ready' && confirmedEr.unresolvedCount === 0,
    'confirming every external fact advances a 100/A plan to real-execution-ready');

  var catchRadio = canonPlan.handoffs.filter(function (h) { return h.id === 'h_catch_chef'; })[0];
  function catchAs(channel) { var h = JSON.parse(JSON.stringify(catchRadio)); h.channel = channel; return h; }
  var faceF = P.channelFeasibility(canonPlan, catchAs('faceToFace'), 'fishday');
  var boardF = P.channelFeasibility(canonPlan, catchAs('board'), 'fishday');
  var unknownF = P.channelFeasibility(canonPlan, catchAs('carrier-pigeon'), 'fishday');
  ok(faceF.ok === false && faceF.reason === 'requires-colocation' && faceF.fromContext.atSea && !faceF.toContext.atSea,
    'fishday sea→shore face-to-face handoff fails with physical-context evidence');
  ok(boardF.ok === false && boardF.reason === 'requires-colocation',
    'fishday sea→shore notice-board handoff fails because the endpoints are not co-located');
  ok(unknownF.ok === false && unknownF.reason === 'unknown-channel',
    'an unrecognized channel fails closed with the stable unknown-channel reason');

  var impossibleCfg = JSON.parse(JSON.stringify(canonCfg));
  impossibleCfg.overrides.handoffs = impossibleCfg.overrides.handoffs || {};
  impossibleCfg.overrides.handoffs.h_catch_chef = { channel: 'faceToFace' };
  var impossiblePlan = P.mergePlan(impossibleCfg), impossibleDs = P.daySchedule(impossiblePlan, 'fishday');
  ok(impossibleDs.missing.some(function (x) { return x.taskId === 't_f_sideprep' && x.cardId === 'ic_catch'; }),
    'an infeasible sea→shore channel enters the schedule as unresolved/missing information');
  ok(P.dayReadiness(impossiblePlan, 'fishday').some(function (x) { return x.type === 'MISSING_ARROW' && x.taskId === 't_f_sideprep'; }),
    'dayReadiness surfaces the infeasible sea→shore delivery as a missing-arrow repair');

  var normalPhone = P.channelFeasibility(canonPlan, catchAs('phone'), 'fishday');
  var outagePlan = P.mergePlan(outageCfgA);
  var outagePhone = P.channelFeasibility(outagePlan, catchAs('phone'), 'fishday');
  var outageChat = P.channelFeasibility(outagePlan, catchAs('chat'), 'fishday');
  var outageRadio = P.channelFeasibility(outagePlan, catchAs('radio'), 'fishday');
  ok(normalPhone.ok === true, 'sea→shore phone remains feasible in the normal rehearsal scenario');
  ok(outagePhone.ok === false && outagePhone.reason === 'scenario-channel-unavailable',
    'comms-outage makes an at-sea phone relay unavailable');
  ok(outageChat.ok === false && outageChat.reason === 'scenario-channel-unavailable',
    'comms-outage makes an at-sea chat relay unavailable');
  ok(outageRadio.ok === true && outageRadio.reason === 'ok',
    'marine radio remains a feasible sea→shore fallback during comms-outage');

  var voyageCabins = outagePlan.days.voyage.handoffs.filter(function (h) { return h.id === 'h_v_cabins'; })[0];
  var voyageChat = JSON.parse(JSON.stringify(voyageCabins)); voyageChat.channel = 'chat';
  var voyageFace = P.channelFeasibility(outagePlan, voyageCabins, 'voyage');
  var voyageChatF = P.channelFeasibility(outagePlan, voyageChat, 'voyage');
  ok(voyageFace.ok === true && voyageFace.fromContext.atSea && voyageFace.toContext.atSea,
    'the Voyage board is physically aboard Ogasawara-maru and still permits face-to-face handoff');
  ok(voyageChatF.ok === false && voyageChatF.reason === 'scenario-channel-unavailable',
    'communications-outage applies to at-sea Voyage handoffs, not only Fishing Day');

  var outagePhoneCfg = P.applyScenario(canonCfg, 'comms-outage');
  outagePhoneCfg.overrides.handoffs = outagePhoneCfg.overrides.handoffs || {};
  outagePhoneCfg.overrides.handoffs.h_catch_chef = { channel: 'phone' };
  var outagePhoneDs = P.daySchedule(P.mergePlan(outagePhoneCfg), 'fishday');
  ok(outagePhoneDs.missing.some(function (x) { return x.taskId === 't_f_sideprep' && x.cardId === 'ic_catch'; }),
    'outage phone failure is integrated into the deterministic schedule cascade');
  var resilientPlan = P.mergePlan(P.applyScenario(canonCfg, 'comms-outage'));
  var resilientDs = P.daySchedule(resilientPlan, 'fishday'), resilientTrip = P.scoreTrip(resilientPlan);
  ok(resilientDs.missing.length === 0 && resilientDs.late.length === 0 && resilientDs.idleTotal === 0,
    'canonical radio relays recover the outage challenge with a zero-idle fishday');
  ok(resilientTrip.total === 100 && resilientTrip.grade === 'A' && resilientTrip.gate.clean,
    'radio-resilient canonical plan remains reachable at clean 100/A under comms-outage');
  var redundantOutagePlan = JSON.parse(JSON.stringify(resilientPlan));
  var unavailableSibling = catchAs('phone'); unavailableSibling.id = 'h_catch_phone_redundant';
  redundantOutagePlan.handoffs.push(unavailableSibling);
  var redundantOutageDs = P.daySchedule(redundantOutagePlan, 'fishday');
  var redundantOutageTrip = P.scoreTrip(redundantOutagePlan);
  ok(redundantOutageDs.missing.length === 0 && redundantOutageDs.late.length === 0 && redundantOutageDs.idleTotal === 0 &&
      redundantOutageTrip.total === 100 && redundantOutageTrip.gate.clean,
    'an unavailable duplicate never voids the same socket\'s feasible radio path or inflates its score');
})();

// ============================================================================
// CLUSTER-FIRST PLAN — deterministic causal roots + 100 means mastery.
// ============================================================================
console.log('\n=== CLUSTER-FIRST PLAN — score rollup, causal roots, stable editor targets ===');
(function () {
  var IDS = ['frame', 'load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];
  var MAX = [11, 10, 11, 12, 13, 34, 9];
  function canonCfg() {
    var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
    ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (seg) { cfg = P.applyDayFix(cfg, seg); });
    return cfg;
  }
  function clusterOf(list, id) { return list.filter(function (c) { return c.id === id; })[0]; }
  function rootsOf(list) { var out = []; list.forEach(function (c) { c.rootIssues.forEach(function (r) { out.push(r); }); }); return out; }
  function sum(list, field) { var n = 0; list.forEach(function (x) { n += Number(x[field]) || 0; }); return n; }
  function counts(values) { var out = {}; values.forEach(function (v) { out[v] = (out[v] || 0) + 1; }); return out; }
  function sameCounts(a, b) { return JSON.stringify(counts(a)) === JSON.stringify(counts(b)); }
  function sortedUnique(a) {
    if (!Array.isArray(a)) return false;
    for (var i = 1; i < a.length; i++) if (a[i - 1] >= a[i]) return false;
    return true;
  }
  function checkPartition(plan, label) {
    var trip = P.scoreTrip(plan), clusters = P.planClusters(plan), roots = rootsOf(clusters);
    ok(JSON.stringify(clusters.map(function (c) { return c.id; })) === JSON.stringify(IDS),
      label + ': exact stable cluster order');
    ok(sum(clusters, 'maxPts') === 100 && sum(clusters, 'earned') === trip.total,
      label + ': cluster earned/max roll up exactly to scoreTrip ' + trip.total + '/100');
    ok(clusters.every(function (c, i) {
      return c.maxPts === trip.byBucket[c.id].maxPts && c.earned === trip.byBucket[c.id].earned &&
        c.maxPts === MAX[i] && c.lostPoints === c.maxPts - c.earned &&
        sum(c.rootIssues, 'lostPoints') === c.lostPoints;
    }), label + ': every bucket is lossless and root losses exactly explain its missing points');

    var failed = trip.atoms.filter(function (a) { return a.earned < a.maxPts; }).map(function (a) { return a.id; }).sort();
    var homed = []; roots.forEach(function (r) { homed = homed.concat(r.atomIds); }); homed.sort();
    ok(JSON.stringify(failed) === JSON.stringify(homed) && Object.keys(counts(homed)).every(function (id) { return counts(homed)[id] === 1; }),
      label + ': every failed score atom belongs to exactly one root (no omission/duplication)');

    var expectedReady = 0; IDS.slice(1).forEach(function (seg) { expectedReady += P.dayReadiness(plan, seg).length; });
    var actualReady = 0; roots.forEach(function (r) { actualReady += r.readiness.length; });
    ok(actualReady === expectedReady, label + ': every detailed readiness row is partitioned once (' + actualReady + ')');
    var activeDet = P.detect(plan).map(function (d) { return d.id; }).sort(), homedDet = [];
    roots.forEach(function (r) { homedDet = homedDet.concat(r.detectorIds); }); homedDet.sort();
    ok(JSON.stringify(activeDet) === JSON.stringify(homedDet) && Object.keys(counts(homedDet)).every(function (id) { return counts(homedDet)[id] === 1; }),
      label + ': every live clean-gate detector is covered exactly once');

    var idFields = ['atomIds', 'reasonKeys', 'detectorIds', 'taskIds', 'cardIds', 'roleIds', 'itemIds', 'guestIds', 'handoffIds', 'lineIds'];
    var targetKinds = { handoff: 1, task: 1, detector: 1, manifest: 1, guest: 1, budget: 1, card: 1, role: 1 };
    var STR = require('./i18n.js');
    ok(roots.every(function (r) {
      return r.id && r.bucket && r.consequenceKey && STR.en[r.consequenceKey] != null && r.editorTarget && targetKinds[r.editorTarget.kind] &&
        idFields.every(function (f) { return sortedUnique(r[f]); }) &&
        (r.bucket === 'frame' || r.editorTarget.segment === r.bucket);
    }), label + ': roots expose stable unique affected IDs, i18n consequence keys, and discriminated editor targets');
    return { trip: trip, clusters: clusters, roots: roots };
  }

  var gappyPlan = P.mergePlan({ seed: 1, overrides: {} });
  var gappy = checkPartition(gappyPlan, 'gappy');
  ok(JSON.stringify(gappy.clusters.map(function (c) { return c.maxPts; })) === JSON.stringify(MAX),
    'cluster maxima are frozen at 11/10/11/12/13/34/9');
  var loadRoots = clusterOf(gappy.clusters, 'load').rootIssues;
  var cabinsRoot = loadRoots.filter(function (r) { return r.cardIds.indexOf('ic_cabins') >= 0; })[0];
  var jigRoot = loadRoots.filter(function (r) { return r.itemIds.indexOf('mi_jigcase') >= 0; })[0];
  ok(loadRoots.length === 2 && cabinsRoot && cabinsRoot.lostPoints === 3 &&
      cabinsRoot.atomIds.indexOf('load_info_comms_ic_cabins') >= 0 && cabinsRoot.atomIds.indexOf('load_safety_hd_l_headcount') >= 0,
    'gappy Load folds missing cabins -> late headcount gate into one -3 causal root');
  ok(jigRoot && jigRoot.lostPoints === 2 && jigRoot.editorTarget.kind === 'manifest' &&
      jigRoot.editorTarget.segment === 'load' && jigRoot.editorTarget.itemId === 'mi_jigcase' && !!jigRoot.editorTarget.taskId,
    'gappy Load keeps the independent jig custody cause separate with an exact manifest task target');

  var canonicalPlan = P.mergePlan(canonCfg());
  var before = JSON.stringify(canonicalPlan), c1 = P.planClusters(canonicalPlan), c2 = P.planClusters(canonicalPlan);
  ok(JSON.stringify(c1) === JSON.stringify(c2), 'planClusters is byte-deterministic on repeated calls');
  ok(before === JSON.stringify(canonicalPlan), 'planClusters does not mutate its plan input');
  var canonical = checkPartition(canonicalPlan, 'canonical');
  ok(canonical.trip.total === 100 && canonical.trip.gate.clean && canonical.clusters.every(function (c) {
    return c.mastered && c.status === 'mastered' && c.earned === c.maxPts && c.rootIssues.length === 0;
  }), 'canonical 100/A has seven mastered clusters and zero modeled roots');
  ok(P.executionReadiness(canonicalPlan).unresolvedCount > 0 && canonical.roots.length === 0,
    'external confirmations stay outside plan mastery/root scoring');

  // One intentional fault: the food handoff delays menu, wrong-fish assumptions, and
  // cook completion. The cascade is ONE root, not a second invented cook problem.
  var foodCfg = canonCfg(); foodCfg.overrides.handoffs.h_food = null;
  var foodPlan = P.mergePlan(foodCfg), foodCluster = clusterOf(P.planClusters(foodPlan), 'fishday');
  var foodRoot = foodCluster.rootIssues[0];
  ok(foodCluster.rootIssues.length === 1 && foodRoot.cardIds.indexOf('ic_food') >= 0 && foodRoot.lostPoints === 2 &&
      JSON.stringify(foodRoot.atomIds) === JSON.stringify(['fishday_info_chef_ic_food', 'fishday_quality_cookblock']),
    'single missing h_food folds its info atom + downstream cook-quality atom into one -2 root');
  ok(foodRoot.editorTarget.kind === 'handoff' && foodRoot.editorTarget.segment === 'fishday' &&
      foodRoot.editorTarget.taskId === 't_f_menu' && foodRoot.editorTarget.cardId === 'ic_food' &&
      foodRoot.taskIds.indexOf('t_f_cook') >= 0,
    'food causal root navigates to the handoff while retaining downstream cook impact');

  // Alternative clean solutions stay mastered: normal canonical, outage-resilient
  // canonical radio paths, and a harmless redundant faster arrow all produce no roots.
  var outagePlan = P.mergePlan(P.applyScenario(canonCfg(), 'comms-outage'));
  var outage = checkPartition(outagePlan, 'radio-resilient outage alternative');
  ok(outage.trip.total === 100 && outage.trip.gate.clean && outage.roots.length === 0,
    'radio-resilient comms-outage alternative remains root-free mastery');
  var redundantCfg = canonCfg();
  redundantCfg.overrides.handoffs.h_tackle2 = { cardId: 'ic_tackle', fromRoleId: 'logi', fromTaskId: 't_f_tackleprep',
    toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_tackleprep' },
    channel: 'faceToFace', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } };
  var redundantPlan = P.mergePlan(redundantCfg), redundantClusters = P.planClusters(redundantPlan);
  ok(P.scoreTrip(redundantPlan).total === 100 && rootsOf(redundantClusters).length === 0,
    'redundant feasible arrow neither inflates score nor creates a root');
  var futurePlan = JSON.parse(JSON.stringify(canonicalPlan)); futurePlan.futureExtension = { version: 99, data: ['unknown'] };
  ok(JSON.stringify(P.planClusters(futurePlan)) === JSON.stringify(c1), 'unknown future plan fields are ignored safely and deterministically');

  // Stable target locators across the main editor fault families.
  var deletedCfg = canonCfg(); deletedCfg.overrides.staffing.t_f_fish = [];
  var deletedRoot = clusterOf(P.planClusters(P.mergePlan(deletedCfg)), 'fishday').rootIssues[0];
  ok(deletedRoot.editorTarget.kind === 'task' && deletedRoot.editorTarget.taskId === 't_f_fish' && deletedRoot.lostPoints === 4 &&
      deletedRoot.atomIds.indexOf('fishday_info_specialist_ic_ground') >= 0 && deletedRoot.atomIds.indexOf('fishday_exec_specialist') >= 0,
    'deleted collapsed-socket consumer groups socket+lane loss at the missing task target');

  var lateCfg = canonCfg(), lateArrow = JSON.parse(JSON.stringify(P.canonHandoffs().filter(function (h) { return h.id === 'h_tackle'; })[0]));
  lateArrow.trigger = { type: 'atMinute', value: 360 }; lateArrow.channel = 'chat'; lateCfg.overrides.handoffs.h_tackle = lateArrow;
  var lateRoot = clusterOf(P.planClusters(P.mergePlan(lateCfg)), 'fishday').rootIssues[0];
  ok(lateRoot.status === 'late' && lateRoot.editorTarget.kind === 'handoff' && lateRoot.editorTarget.handoffId === 'h_tackle' &&
      lateRoot.editorTarget.cardId === 'ic_tackle' && lateRoot.editorTarget.taskId === 't_f_gearload',
    'late arrow root carries a stable handoff/card/consumer locator');

  var wrongCfg = canonCfg(); wrongCfg.overrides.staffing.t_f_route = ['p08'];
  var wrongRoot = clusterOf(P.planClusters(P.mergePlan(wrongCfg)), 'fishday').rootIssues[0];
  ok(wrongRoot.status === 'broken' && wrongRoot.editorTarget.kind === 'task' && wrongRoot.editorTarget.taskId === 't_f_route',
    'wrong-role lane root navigates to the exact task');

  var compactCfg = canonCfg(); compactCfg.overrides.timing = { t_f_cook: { durMin: 30 } };
  var compactRoot = clusterOf(P.planClusters(P.mergePlan(compactCfg)), 'fishday').rootIssues[0];
  ok(compactRoot.status === 'compressed' && compactRoot.lostPoints === 2 && compactRoot.editorTarget.taskId === 't_f_cook',
    'compressed cook groups lane+quality loss at the cook task');

  var decoyCfg = canonCfg(), decoyPlan0 = P.mergePlan(decoyCfg);
  var decoyTask = P.tasksForSeg(decoyPlan0, 'ops').filter(function (t) { return t.id === 'hd_o_dec_sidefish'; })[0];
  decoyCfg.overrides.days.ops.placement.hd_o_dec_sidefish = { startMin: decoyTask.startMin, durMin: decoyTask.durMin, assignedIds: ['p08'] };
  var decoyRoot = clusterOf(P.planClusters(P.mergePlan(decoyCfg)), 'ops').rootIssues[0];
  ok(decoyRoot.status === 'decoy' && decoyRoot.lostPoints === 2 && decoyRoot.editorTarget.kind === 'task' &&
      decoyRoot.editorTarget.taskId === 'hd_o_dec_sidefish', 'placed decoy penalty is homed once at the decoy task');

  function omitCarry(seg, taskId, itemId) {
    var cfg = canonCfg(), plan = P.mergePlan(cfg), task = P.tasksForSeg(plan, seg).filter(function (t) { return t.id === taskId; })[0];
    cfg.overrides.days[seg].placement[taskId] = { startMin: task.startMin, durMin: task.durMin,
      assignedIds: task.assignedIds.slice(), carries: task.carries.filter(function (id) { return id !== itemId; }) };
    return P.mergePlan(cfg);
  }
  var returnItem = 'mi_lug_gd_yamate', returnCustodyPlan = omitCarry('return', 'hd_r_hold', returnItem);
  var returnCustodyRoot = clusterOf(P.planClusters(returnCustodyPlan), 'return').rootIssues[0];
  ok(P.scoreTrip(returnCustodyPlan).total === 99 && returnCustodyRoot.lostPoints === 1 &&
      returnCustodyRoot.editorTarget.kind === 'manifest' && returnCustodyRoot.editorTarget.itemId === returnItem &&
      returnCustodyRoot.editorTarget.taskId === 'hd_r_hold' && returnCustodyRoot.taskIds.indexOf('hd_r_hold') >= 0,
    'return custody omission costs an existing point and opens the exact item/task carry choice');

  var outagePhoneCfg = P.applyScenario(canonCfg(), 'comms-outage');
  outagePhoneCfg.overrides.handoffs.h_catch_chef = { channel: 'phone' };
  var outagePhoneRoot = clusterOf(P.planClusters(P.mergePlan(outagePhoneCfg)), 'fishday').rootIssues[0];
  ok(outagePhoneRoot.editorTarget.kind === 'handoff' && outagePhoneRoot.editorTarget.handoffId === 'h_catch_chef' &&
      outagePhoneRoot.editorTarget.cardId === 'ic_catch' && outagePhoneRoot.lostPoints === 2,
    'outage-infeasible channel groups the failed socket + downstream cook consequence at the existing handoff');

  // No modeled warning may coexist with a displayed 100. Each formerly unpriced
  // clean-gate path now docks an existing atom, preserving all maxima and 99 rows.
  var masteryFaults = [];
  var noReturnCfg = canonCfg(); noReturnCfg.overrides.staffing.t_ship = []; masteryFaults.push(['returnLogi', P.mergePlan(noReturnCfg), 'return']);
  var noFerryCfg = canonCfg(); noFerryCfg.overrides.info.ic_ferry = { recipientRoleIds: ['pm'] }; masteryFaults.push(['ferry sharing', P.mergePlan(noFerryCfg), 'frame']);
  masteryFaults.push(['arrival custody', omitCarry('arrival', 'hd_a_transfer', 'mi_lug_gd_watanabe'), 'arrival']);
  masteryFaults.push(['return custody', returnCustodyPlan, 'return']);
  var careCfg = canonCfg(); careCfg.overrides.buddies = { gd_watanabe: 'p08', gd_nagatani: 'p08', gd_kadou: 'p07', gd_maeda: 'p04' };
  masteryFaults.push(['care overlap', P.mergePlan(careCfg), 'voyage']);
  [['load', 'hd_l_breakfast'], ['voyage', 'hd_v_watch_night'], ['fishday', 't_f_flex_owner']].forEach(function (pair) {
    var cfg = canonCfg();
    if (pair[0] === 'fishday') cfg.overrides.staffing[pair[1]] = [];
    else cfg.overrides.days[pair[0]].placement[pair[1]] = null;
    masteryFaults.push(['required flex ' + pair[1], P.mergePlan(cfg), pair[0]]);
  });
  masteryFaults.forEach(function (entry) {
    var trip = P.scoreTrip(entry[1]), cluster = clusterOf(P.planClusters(entry[1]), entry[2]);
    ok(trip.total < 100 && !trip.gate.clean && cluster.lostPoints >= 1 && cluster.rootIssues.some(function (r) { return r.lostPoints >= 1; }),
      '100=mastery audit: ' + entry[0] + ' costs an existing point in ' + entry[2]);
  });
})();

// ============================================================================
// DAY-3 FOOD TRADE-OFF — three authored solutions, one scored causal socket.
// ============================================================================
console.log('\n=== DAY-3 FOOD TRADE-OFF — direct, delegated, and redundant paths ===');
(function () {
  var IDS = ['direct-fast', 'delegated-relay', 'redundant-paths'];
  function canonCfg() {
    var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
    ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (seg) { cfg = P.applyDayFix(cfg, seg); });
    return cfg;
  }
  function fishCluster(plan) { return P.planClusters(plan).filter(function (c) { return c.id === 'fishday'; })[0]; }
  function configured(id, scenario) {
    var cfg = P.applyDay3FoodStrategy(canonCfg(), id);
    return scenario ? P.applyScenario(cfg, scenario) : cfg;
  }
  function planFor(id, scenario) { return P.mergePlan(configured(id, scenario)); }
  function handoff(plan, id) { return P.handoffsForSeg(plan, 'fishday').filter(function (h) { return h.id === id; })[0]; }
  function sumMax(atoms) { return atoms.reduce(function (n, a) { return n + a.maxPts; }, 0); }

  ok(JSON.stringify(P.DAY3_FOOD_STRATEGY_IDS) === JSON.stringify(IDS) &&
      JSON.stringify(P.DAY3_FOOD_ROOT) === JSON.stringify({ segment: 'fishday', taskId: 't_f_menu', cardId: 'ic_food' }) &&
      typeof P.applyDay3FoodStrategy === 'function' && typeof P.day3FoodStrategy === 'function',
    'Day-3 food strategy API exports stable ids, root locator, applicator, and projection');

  var canonicalCfg = canonCfg(), canonicalJson = JSON.stringify(canonicalCfg);
  var applications = IDS.map(function (id) { return P.applyDay3FoodStrategy(canonicalCfg, id); });
  ok(JSON.stringify(canonicalCfg) === canonicalJson && applications.every(function (cfg) {
    return cfg !== canonicalCfg && cfg.overrides !== canonicalCfg.overrides && cfg.overrides.handoffs !== canonicalCfg.overrides.handoffs;
  }), 'strategy application deep-clones and never mutates caller-owned config/overrides');
  ok(applications.every(function (cfg, i) {
    return JSON.stringify(cfg) === JSON.stringify(P.applyDay3FoodStrategy(canonicalCfg, IDS[i])) &&
      JSON.stringify(cfg) === JSON.stringify(P.applyDay3FoodStrategy(cfg, IDS[i]));
  }), 'all three applicators are deterministic and idempotent');
  ok(JSON.stringify(P.applyDay3FoodStrategy(P.applyDay3FoodStrategy(canonicalCfg, 'direct-fast'), 'delegated-relay')) ===
      JSON.stringify(P.applyDay3FoodStrategy(canonicalCfg, 'delegated-relay')),
    'switching direct-fast to delegated-relay cleans sibling recipe keys exactly');
  var unknownCfg = P.applyDay3FoodStrategy(canonicalCfg, 'telepathy');
  ok(unknownCfg !== canonicalCfg && JSON.stringify(unknownCfg) === canonicalJson,
    'unknown strategy fails safely as an unchanged deep clone');

  var plans = {}, projections = {}, baselineAtoms = P.scoreTrip(P.mergePlan(canonicalCfg)).atoms.length;
  IDS.forEach(function (id) {
    var plan = plans[id] = planFor(id), before = JSON.stringify(plan);
    var projection = projections[id] = P.day3FoodStrategy(plan), projection2 = P.day3FoodStrategy(plan);
    var trip = P.scoreTrip(plan), cluster = fishCluster(plan);
    ok(trip.total === 100 && trip.grade === 'A' && trip.gate.clean && trip.atoms.length === baselineAtoms &&
        trip.atoms.length === 99 && sumMax(trip.atoms) === 100 && trip.atoms.every(function (a) { return a.earned === a.maxPts; }),
      id + ': reaches exact 100/A mastery with the frozen 99-atom/100-point ledger');
    ok(projection.strategyId === id && projection.topologyStrategyId === id && projection.recipeComplete && !projection.degraded &&
        projection.resolved && projection.rootCleared && projection.mastered &&
        projection.wholePlanScore === 100 && projection.clusterEarned === 34 && projection.clusterMaxPts === 34 &&
        cluster.rootIssues.length === 0,
      id + ': clears the food causal root and leaves the whole Fishing-Day cluster mastered');
    ok(before === JSON.stringify(plan) && JSON.stringify(projection) === JSON.stringify(projection2),
      id + ': trade-off projection is pure and byte-deterministic');
  });

  var direct = projections['direct-fast'], relay = projections['delegated-relay'], redundant = projections['redundant-paths'];
  ok(direct.arrivalMin === 285 && direct.latencyMin === 0 && direct.marginMin === 15 &&
      direct.transmissions === 1 && direct.pathCount === 1 && direct.relaySteps === 0 &&
      direct.senderWorkload.budgetLead === 1 && direct.singlePathFailureTolerance === 0,
    'direct-fast exposes the fastest one-send consequence (04:45 arrival, 15-minute margin)');
  ok(relay.arrivalMin === 292 && relay.latencyMin === 7 && relay.marginMin === 8 &&
      relay.transmissions === 2 && relay.pathCount === 1 && relay.relaySteps === 1 &&
      relay.senderWorkload.budgetLead === 1 && relay.senderWorkload.comms === 1 &&
      relay.paths[0].kind === 'relay' && JSON.stringify(relay.paths[0].handoffIds) ===
        JSON.stringify(['h_food_relay_intake', 'h_food_relay_delivery']),
    'delegated-relay exposes a real budgetLead→comms→chef two-hop workload and 04:52 arrival');
  ok(redundant.arrivalMin === 286 && redundant.latencyMin === 1 && redundant.marginMin === 14 &&
      redundant.transmissions === 2 && redundant.pathCount === 2 && redundant.relaySteps === 0 &&
      redundant.senderWorkload.budgetLead === 2 && redundant.singlePathFailureTolerance === 1 &&
      redundant.redundancyEffort === 1 && redundant.onTimePathCount === 2,
    'redundant-paths exposes two independent sends, one extra effort, and one-path failure tolerance');
  ok(new Set(IDS.map(function (id) {
    var x = projections[id]; return [x.arrivalMin, x.relaySteps, x.pathCount, x.singlePathFailureTolerance,
      JSON.stringify(x.senderWorkload)].join('|');
  })).size === 3, 'the three mastered choices have genuinely distinct measurable consequence vectors');

  IDS.forEach(function (id) {
    var outagePlan = planFor(id, 'comms-outage'), outageTrip = P.scoreTrip(outagePlan), outageProjection = P.day3FoodStrategy(outagePlan);
    ok(outageTrip.total === 100 && outageTrip.gate.clean && outageProjection.resolved && outageProjection.rootCleared &&
        outageProjection.paths.every(function (p) { return p.feasible; }),
      id + ': remains a feasible, deterministic 100 recovery in the comms-outage scenario');
  });

  // The second relay send cannot produce food information by itself: it is
  // accepted only after the intake path arrives at the delegated comms role.
  var noIntakeCfg = configured('delegated-relay');
  noIntakeCfg.overrides.handoffs.h_food_relay_intake = null;
  var noIntakePlan = P.mergePlan(noIntakeCfg), noIntake = P.day3FoodStrategy(noIntakePlan), noIntakeTrip = P.scoreTrip(noIntakePlan);
  ok(noIntake.strategyId === 'delegated-relay' && noIntake.topologyStrategyId === null &&
      !noIntake.recipeComplete && noIntake.degraded && !noIntake.resolved && !noIntake.rootCleared &&
      noIntake.paths[0].reason === 'missing-prerequisite' &&
      noIntakeTrip.total === 98 && fishCluster(noIntakePlan).rootIssues.some(function (r) {
        return r.cardIds.indexOf('ic_food') >= 0 && r.taskIds.indexOf('t_f_menu') >= 0 && r.lostPoints === 2;
      }), 'delegated delivery keeps authored identity but reports degraded/incomplete without its intake hop');
  var earlyRelayCfg = configured('delegated-relay');
  earlyRelayCfg.overrides.handoffs.h_food_relay_delivery.trigger = { type: 'atMinute', value: 285 };
  var earlyRelay = P.day3FoodStrategy(P.mergePlan(earlyRelayCfg));
  ok(earlyRelay.strategyId === 'delegated-relay' && earlyRelay.topologyStrategyId === null &&
      earlyRelay.recipeComplete && earlyRelay.degraded && !earlyRelay.resolved && earlyRelay.paths[0].reason === 'relay-not-ready',
    'delegated delivery is rejected when forwarding is scheduled before intake arrival');

  var impossibleCfg = configured('delegated-relay');
  impossibleCfg.overrides.handoffs.h_food_relay_intake.channel = 'carrier-pigeon';
  var impossiblePlan = P.mergePlan(impossibleCfg), impossible = P.day3FoodStrategy(impossiblePlan);
  ok(P.channelFeasibility(impossiblePlan, handoff(impossiblePlan, 'h_food_relay_intake'), 'fishday').reason === 'unknown-channel' &&
      impossible.strategyId === 'delegated-relay' && impossible.topologyStrategyId === null &&
      impossible.recipeComplete && impossible.degraded && !impossible.resolved && !impossible.rootCleared &&
      impossible.paths[0].reason === 'unknown-channel' &&
      P.scoreTrip(impossiblePlan).total === 98,
    'an infeasible relay channel is rejected end-to-end and cannot claim food mastery');

  var mixedCfg = configured('redundant-paths');
  mixedCfg.overrides.handoffs.h_food = JSON.parse(JSON.stringify(configured('direct-fast').overrides.handoffs.h_food));
  var mixedPlan = P.mergePlan(mixedCfg), mixed = P.day3FoodStrategy(mixedPlan);
  ok(mixed.strategyId === null && mixed.topologyStrategyId === 'redundant-paths' &&
      !mixed.recipeComplete && mixed.degraded && mixed.resolved && P.scoreTrip(mixedPlan).total === 100,
    'mixed valid direct/redundant recipe metadata fails identity closed while preserving actual topology metrics');
  var invalidMetaCfg = configured('redundant-paths');
  invalidMetaCfg.overrides.handoffs.h_food_backup_phone.strategyId = 'delegated-relay';
  var invalidMeta = P.day3FoodStrategy(P.mergePlan(invalidMetaCfg));
  ok(invalidMeta.strategyId === null && invalidMeta.topologyStrategyId === 'redundant-paths' &&
      !invalidMeta.recipeComplete && invalidMeta.degraded && invalidMeta.pathCount === 2 && invalidMeta.resolved,
    'handoff metadata that claims the wrong recipe id fails identity closed without falsifying graph metrics');

  ['h_food_primary_radio', 'h_food_backup_phone'].forEach(function (failedId) {
    var onePathCfg = configured('redundant-paths'); onePathCfg.overrides.handoffs[failedId] = null;
    var onePathPlan = P.mergePlan(onePathCfg), onePathTrip = P.scoreTrip(onePathPlan), onePath = P.day3FoodStrategy(onePathPlan);
    ok(onePath.strategyId === 'redundant-paths' && onePath.topologyStrategyId === 'direct-fast' &&
        !onePath.recipeComplete && onePath.degraded && onePathTrip.total === 100 && onePathTrip.gate.clean &&
        onePath.resolved && onePath.rootCleared &&
        onePath.pathCount === 1 && onePath.onTimePathCount === 1 && onePath.singlePathFailureTolerance === 0,
      'redundant recipe retains authored identity but reports degraded topology after loss of ' + failedId);
  });
  var bothLostCfg = configured('redundant-paths');
  bothLostCfg.overrides.handoffs.h_food_primary_radio = null; bothLostCfg.overrides.handoffs.h_food_backup_phone = null;
  var bothLostPlan = P.mergePlan(bothLostCfg), bothLostProjection = P.day3FoodStrategy(bothLostPlan);
  ok(P.scoreTrip(bothLostPlan).total === 98 && bothLostProjection.strategyId === null &&
      bothLostProjection.topologyStrategyId === null && !bothLostProjection.recipeComplete && bothLostProjection.degraded &&
      !bothLostProjection.resolved && !bothLostProjection.rootCleared,
    'losing both redundant paths restores the same single -2 socket root, never duplicate penalties');
})();

// ============================================================================
// GUIDED LIVE UI — channel choice must keep a stable, reachable commit action.
// ============================================================================
console.log('\n=== GUIDED LIVE UI — stable channel commit control ===');
(function () {
  var source = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');
  var renderStart = source.indexOf('function renderSpot()');
  var previewStart = source.indexOf('function previewChannel(', renderStart);
  var previewEnd = source.indexOf('function paintBlast(', previewStart);
  var liveStepStart = source.indexOf('function liveStep()');
  var liveStepEnd = source.indexOf('function gapClusterKey(', liveStepStart);
  var authoredStepStart = source.indexOf('function step()');
  var authoredStepEnd = source.indexOf('function camPunchStall(', authoredStepStart);
  var scheduleStart = source.indexOf('function scheduleUncoveredTransition(');
  var scheduleEnd = source.indexOf('var BUB =', scheduleStart);
  var openGapStart = source.indexOf('function openGap(');
  var openGapEnd = source.indexOf('function advanceCluster()', openGapStart);
  var advanceStart = source.indexOf('function advanceCluster()');
  var advanceEnd = source.indexOf('function renderLivePanel(', advanceStart);
  var panelEnd = source.indexOf('function renderSpot()', advanceEnd);
  var renderSource = source.slice(renderStart, previewStart);
  var previewSource = source.slice(previewStart, previewEnd);
  var liveStepSource = source.slice(liveStepStart, liveStepEnd);
  var authoredStepSource = source.slice(authoredStepStart, authoredStepEnd);
  var scheduleSource = source.slice(scheduleStart, scheduleEnd);
  var openGapSource = source.slice(openGapStart, openGapEnd);
  var advanceSource = source.slice(advanceStart, advanceEnd);
  var panelSource = source.slice(advanceEnd, panelEnd);

  ok(renderStart >= 0 && previewStart > renderStart && previewEnd > previewStart,
    'Guided Live channel-choice functions are present in source order');
  ok(renderSource.indexOf('id="ld-send"') >= 0 &&
      renderSource.indexOf('disabled aria-disabled="true"') >= 0,
    'the channel commit action is rendered once and remains visible, initially disabled');
  ok(renderSource.indexOf("send.addEventListener('click'") >= 0 &&
      renderSource.indexOf('var ch = liveState && liveState.selectedChannel') >= 0 &&
      renderSource.indexOf('commitChannel(g, ch)') >= 0,
    'the stable action commits only the channel owned by Guided Live state');
  ok(previewSource.indexOf("send.disabled = !ev.feas.ok") >= 0 &&
      previewSource.indexOf("send.setAttribute('aria-disabled'") >= 0,
    'an explicit option click enables only a feasible selected channel');
  ok(previewSource.indexOf("querySelector('.ld-send')") < 0 &&
      previewSource.indexOf('.remove()') < 0 && previewSource.indexOf('createElement') < 0,
    'hover/focus previews cannot remove or recreate the channel commit action');
  ok(renderSource.indexOf("if (selected) previewChannel(g, selected.dataset.ch, false)") >= 0,
    'leaving a transient hover restores the selected channel preview without clearing its action');
  ok(renderSource.indexOf('liveState.selectedChannel = ch') >= 0 &&
      renderSource.indexOf('aria-pressed=') >= 0 &&
      renderSource.indexOf('if (selectedChannel) previewChannel(g, selectedChannel, true)') >= 0,
    'selection is state-owned, exposed accessibly, and restored after EN/JA or other re-renders');
  ok(renderSource.indexOf("send.addEventListener('focus'") >= 0 &&
      renderSource.indexOf('previewChannel(g, ch, false)') >= 0,
    'keyboard focus on Send restores the selected preview before commit');
  ok((source.match(/focusFirstLiveChannel\(\);/g) || []).length === 2,
    'the first channel receives focus both on the first gap and every following cluster card');
  ok(source.indexOf('function focusFirstLiveChannel() {\n    if (topModal()) return;') >= 0 &&
      liveStepSource.indexOf('topModal()') >= 0 && authoredStepSource.indexOf('topModal()') >= 0,
    'modal-covered rehearsals hold time and cannot move focus to controls behind the dialog');
  ok(source.indexOf("else if (top === 'rules-modal') { $('rules-modal').classList.remove('show'); modalClosed(); }") >= 0,
    'Escape closes Rules through the shared focus-restoration lifecycle');
  ok(scheduleSource.indexOf('if (topModal()) { finishTimer = setTimeout(attempt, 100); return; }') >= 0 &&
      scheduleSource.indexOf('if (stillValid && !stillValid()) return') >= 0,
    'delayed result/report transitions wait for dialogs and cancel when their run is no longer current');
  ok(liveStepSource.indexOf("liveState.phase === 'recovering'") >= 0 &&
      advanceSource.indexOf("livePausedForFix = recovering; liveState.phase = recovering ? 'recovering' : 'brief'") >= 0,
    'post-commit recovery holds the engine interval instead of racing straight to the result');
  var recoveryPhasePos = advanceSource.indexOf("liveState.phase = recovering ? 'recovering' : 'brief'");
  ok(recoveryPhasePos >= 0 && recoveryPhasePos < advanceSource.indexOf('renderLivePanel()', recoveryPhasePos) &&
      advanceSource.indexOf('scheduleUncoveredTransition(liveFinish, RM.matches ? 0 : 1600') >= 0,
    'the owned recovery timer follows the hold and preserves the deliberate 1.6-second visual beat');
  ok(panelSource.indexOf('t.ldRecoverT') >= 0 && panelSource.indexOf('t.ldRecoverP') >= 0,
    'the recovery beat no longer repeats the already-repaired missing-handoff warning');
  ok(openGapSource.indexOf("var planSession = $('plan-session'); if (planSession) planSession.open = false") >= 0,
    'entering a Guided decision closes the plan-session disclosure before the topbar is hidden');
})();

// ============================================================================
// AUTHORING UI STATE — persistence ownership, async invalidation, focus safety.
// ============================================================================
console.log('\n=== AUTHORING UI STATE — guarded transitions and stable controls ===');
(function () {
  var source = require('fs').readFileSync(require('path').join(__dirname, 'app.js'), 'utf8');
  function section(startNeedle, endNeedle) {
    var start = source.indexOf(startNeedle), end = source.indexOf(endNeedle, start + startNeedle.length);
    return start >= 0 && end > start ? source.slice(start, end) : '';
  }
  var validation = section('function validDayState(v, seg, domain)', 'function validateAuthoringState(v)');
  var writer = section('function writeSavedPlan()', 'function flushPlanSave()');
  var claim = section('function claimMorningSession(level)', 'function resumeSavedPlan()');
  var reset = section('function resetAuthoringState(level)', 'function newRehearsal()');
  var exporter = section('function exportAuthoringPlan()', 'function rejectPlanImport()');
  var importer = section('function importAuthoringPlan(file)', 'function fdReset()');
  var debrief = section('function captureDebriefDraft()', 'function applyLang()');
  var enterScreenSource = section('function enterScreen(name)', 'function paintSetup()');
  var inspector = section('function openInspector(focusAfter)', 'function closeInspector()');
  var faultNav = section('function navigateToFault(target)', 'function takeMeToNextIssue()');
  var missionInput = section("$('mission-control').addEventListener('input'", "$('org').addEventListener('change'");
  var enterModeSource = section('function enterMode(m, claimLevel)', 'function startLive()');
  var introPlan = section('function planFromIntro()', '// §W4 COLD-OPEN VIGNETTE');
  var plannerFocus = section('function focusPlannerHome()', 'function planFromIntro()');
  var learningLevelSource = section('function setLearningLevel(level)', '// =========================================================================\n  // i18n apply');

  ok(writer.indexOf("!authoringSessionClaimed") >= 0 &&
      (writer.match(/!authoringSessionClaimed/g) || []).length === 2,
    'a discovered save is excluded from both immediate and debounced autosave paths until claimed');
  ok(claim.indexOf('window.confirm(T().planResetConfirm)') >= 0 &&
      claim.indexOf('return beginFreshAuthoringSession') >= 0 &&
      enterModeSource.indexOf("if (m === 'morning' && !claimMorningSession") >= 0 &&
      enterModeSource.indexOf('!claimMorningSession') < enterModeSource.indexOf('cancelPendingPlanImport()'),
    'every central transition into Morning confirms ownership before any screen/session mutation');
  ok(introPlan.indexOf("if (!enterMode('morning', learningLevel)) return") >= 0 &&
      introPlan.indexOf("enterMode('morning'") < introPlan.indexOf('markIntroSeen()') &&
      learningLevelSource.indexOf('!claimMorningSession(level)') < learningLevelSource.indexOf('learningLevel = level'),
    'Plan First and learning-level entry leave intro, level, and storage untouched when New is cancelled');
  ok(exporter.indexOf('(!authoringSessionClaimed && savedPlanRecord) ? jsonCopy(savedPlanRecord)') >= 0 &&
      reset.indexOf("=== 'challenge' ? 'fishday' : 'load'") >= 0,
    'unclaimed Export serializes the discovered save and a fresh Challenge session lands on Fishing Day');
  ok(importer.indexOf('token !== planImportToken || activePlanReader !== reader') >= 0 &&
      importer.indexOf('validatePlanEnvelope') < importer.indexOf('localStorage.setItem') &&
      enterScreenSource.indexOf('cancelPendingPlanImport()') >= 0,
    'an import validates before its atomic commit and stale readers are invalidated by later navigation');
  ok(validation.indexOf('x.length > 0') >= 0 &&
      validation.indexOf('(new Set(x)).size === x.length') >= 0 &&
      validation.indexOf('(new Set(x.assignedIds)).size === x.assignedIds.length') >= 0,
    'import validation rejects empty Fishing-Day crews and duplicate staff assignments in both day schemas');
  ok(debrief.indexOf('whySelection: selection(why)') >= 0 &&
      debrief.indexOf('transferSelection: selection(transfer)') >= 0 &&
      debrief.indexOf('restoreSelection(why, draft.whySelection)') >= 0 &&
      debrief.indexOf('restoreSelection(transfer, draft.transferSelection)') >= 0,
    'language re-render preserves both reflection drafts and both caret/selection states');
  ok(inspector.indexOf('prior.dataset.card') >= 0 && inspector.indexOf('prior.dataset.role') >= 0 &&
      inspector.indexOf("target = sends[0] || $('insp-resume')") >= 0 &&
      source.indexOf('openInspector(focusAfter)') >= 0,
    'checkpoint Send-now rebuild restores the same logical action or the next safe modal control');
  ok((faultNav.match(/navToken !== faultNavGeneration/g) || []).length === 2 &&
      (faultNav.match(/\$\('setup'\)\.classList\.contains\('hidden'\)/g) || []).length >= 2 &&
      (faultNav.match(/daySel !== seg \|\| drawerSeg !== seg/g) || []).length === 2 &&
      enterScreenSource.indexOf('clearTrayToast()') >= 0,
    'delayed fault reveals require the same generation/screen/day/drawer and transitions clear stale rejection toasts');
  ok(missionInput.indexOf('updatePlanUI({ keepMissionControl: true })') >= 0 &&
      missionInput.indexOf('refreshMissionResourceControl(el)') >= 0 &&
      source.indexOf("$('btn-pause').focus({ preventScroll: true })") >= 0 &&
      source.indexOf("if (enterMode('morning')) focusPlannerHome()") >= 0,
    'range input keeps its live node while Run and Report→Edit Plan perform visible focus handoffs');
  ok(plannerFocus.indexOf("var chapters = $('chapter-browser')") >= 0 &&
      plannerFocus.indexOf("chapters && !chapters.open ? chapters.querySelector('summary')") >= 0 &&
      plannerFocus.indexOf("document.querySelector('.day-btn.on')") >= 0 &&
      plannerFocus.indexOf("target = target || $('launch')") >= 0,
    'planner focus targets a visible chapter summary while closed, then the active day or Launch fallback');
})();

// ============================================================================
// HANDOFF EDITOR A11Y — completed taps, stable focus, full-size equivalents.
// ============================================================================
console.log('\n=== HANDOFF EDITOR A11Y — tap lifecycle, focus return, 24px routes ===');
(function () {
  var fs = require('fs'), path = require('path');
  var source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  var css = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
  var html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
  var i18n = fs.readFileSync(path.join(__dirname, 'i18n.js'), 'utf8');
  function section(startNeedle, endNeedle) {
    var start = source.indexOf(startNeedle), end = source.indexOf(endNeedle, start + startNeedle.length);
    return start >= 0 && end > start ? source.slice(start, end) : '';
  }
  var pointer = section('function fdPointerDown(ev)', 'function fdWireClear()');
  var ready = section('function buildFdReady(plan, fd, seg)', 'function toggleChipPlacing(taskId)');
  var returns = section('function arrowReturnKeyFor(el, handoff)', 'function makeGhost(chip, x, y)');
  var autoDraw = section('function fdAutoDraw(toTaskId, cardId, returnKey)', 'function nm2(o, lang)');
  var panel = section('function openArrowPanel(hid, returnKey, focusId)', 'function arrowPatch(focusId)');
  var arrowPatchSource = section('function arrowPatch(focusId)', 'function closeArrowPanel(repaint)');
  var missionControl = section('function buildMissionControl()', 'function refreshMissionResourceControl(el)');
  var closePanel = section('function closeArrowPanel(repaint)', 'function clearDayClick()');
  var validation = section('function validTrigger(v, domain)', 'function validateAuthoringState(v)');
  var modalFocus = section('var lastFocus = null, lastFocusResolver = null', '// ---- checkpoint inspector');
  var listeners = section("$('fd-wrap').addEventListener('pointerdown'", '// checkpoint inspector');
  var keyboard = section("document.addEventListener('keydown', function (e) {\n      var top = topModal();", '// any day\'s blocks');

  ok(pointer.indexOf("var sock = ev.target.closest('.fd-socket')") >= 0 &&
      pointer.indexOf('if (sock) return;') >= 0 && pointer.indexOf('fdSocketTap(sock)') < 0,
    'socket pointerdown waits for a completed click/tap and cannot mount a backdrop mid-gesture');
  ok(listeners.indexOf("var sock = e.target.closest && e.target.closest('.fd-socket')") >= 0 &&
      listeners.indexOf('fdSocketTap(sock)') >= 0 &&
      keyboard.indexOf("el.classList.contains('fd-socket')") >= 0 && keyboard.indexOf('fdSocketTap(el)') >= 0,
    'completed canvas clicks and Enter/Space share the same socket activation path');
  ok(ready.indexOf("type === 'MISSING_ARROW' || type === 'ARROW_LATE' || type === 'WRONG_FISH_RISK'") >= 0 &&
      ready.indexOf('class="pr-item bad pr-action"') >= 0 && ready.indexOf('data-task="') >= 0 &&
      ready.indexOf("chip(h.type, t.rhWrongFish(cn(h.cardId), tn(h.taskId)), h)") >= 0 &&
      listeners.indexOf("$('fd-ready').addEventListener('click'") >= 0 && listeners.indexOf('fdActivateHandoff(action.dataset.task, action.dataset.card, action)') >= 0,
    'missing, late, and wrong-assumption readiness rows are named buttons routed through the socket action');
  ok(ready.indexOf("data-type=\"ROUTE_REVIEW\"") >= 0 &&
      ready.indexOf('t.fdRouteReview(cn(cid), tn(tk.id))') >= 0 &&
      ready.indexOf("if (cardOwnerOf(plan, cid) === tk.ownerRoleId) return") >= 0 &&
      (i18n.match(/fdRouteReview: function/g) || []).length === 2,
    'concealed learning supplies a localized neutral route button for every visible cross-role socket');
  ok(source.indexOf("var attrs = ' type=\"button\" data-h=\"' + h.id + '\" data-task=\"' + to.id + '\" data-card=\"' + h.cardId + '\" data-role=\"' + to.ownerRoleId + '\"'") >= 0 &&
      css.indexOf('.fd-ar-chip{display:inline-flex;align-items:center;gap:5px;min-height:24px;') >= 0 &&
      css.indexOf('.pr-action{min-height:24px;') >= 0,
    'existing arrow chips and readiness alternatives are semantic buttons at least 24px tall');
  ok(returns.indexOf("el.classList.contains('fd-ar-chip') ? 'arrow'") >= 0 &&
      returns.indexOf("el.classList.contains('pr-action') ? 'action' : 'socket'") >= 0 &&
      returns.indexOf('handoffId:') >= 0 && returns.indexOf('taskId:') >= 0 && returns.indexOf('cardId:') >= 0 && returns.indexOf('roleId:') >= 0 &&
      returns.indexOf("document.querySelectorAll(selector)") >= 0 && returns.indexOf("document.querySelector('.day-btn.on')") >= 0,
    'arrow focus return is a logical handoff key with connected editor fallbacks, not a stale node');
  ok(returns.indexOf("function action()") >= 0 &&
      returns.indexOf("key.preferred === 'action' ? (action() || arrow() || socket())") >= 0 &&
      returns.indexOf("el.dataset.task === key.taskId && el.dataset.card === key.cardId && el.getClientRects().length") >= 0,
    'readiness invokers restore the rebuilt matching full-size action before arrow or socket fallbacks');
  ok(autoDraw.indexOf('returnKey.handoffId = id') >= 0 && autoDraw.indexOf('paintSetup();') < autoDraw.indexOf('openArrowPanel(id, returnKey)') &&
      panel.indexOf('modalOpening(\'arrow-modal\', resolveArrowReturnTarget)') >= 0 &&
      closePanel.indexOf('if (repaint) paintSetup();') < closePanel.indexOf('modalClosed();'),
    'new routes and channel repaints restore focus only after the equivalent control is rebuilt');
  ok(autoDraw.indexOf('h.fromTaskId === null && h.toTaskId === toTaskId && h.cardId === cardId') >= 0 &&
      autoDraw.indexOf('dayOv[seg].handoffs[external.id] = jsonCopy(external)') >= 0 &&
      autoDraw.indexOf('openArrowPanel(external.id, returnKey)') >= 0,
    'the one canonical external-source Voyage route can be restored through the same full-size action');
  ok(validation.indexOf("seg !== 'voyage' || id !== 'h_v_cabins'") >= 0 &&
      validation.indexOf('v.fromTaskId !== null') >= 0 && validation.indexOf("v.trigger.type !== 'atMinute'") >= 0 &&
      validation.indexOf("(v.type === 'onTaskDone' || v.type === 'beforeTaskStart') && !domain.taskIds[v.taskId]") >= 0 &&
      validation.indexOf('(tasks[x.fromTaskId] || external)') >= 0 &&
      panel.indexOf("(hasProducer ? '<option value=\"onTaskDone\"'") >= 0 &&
      arrowPatchSource.indexOf("trig === 'onTaskDone' && h.fromTaskId") >= 0,
    'saved external-source edits validate only for canonical endpoints and the UI cannot assign a task trigger');
  ok(panel.indexOf('<label class="ar-row"><label') < 0 &&
      panel.indexOf('<label class="dt-h" for="ar-trig">') >= 0 &&
      panel.indexOf('<label class="dt-h" for="ar-ch">') >= 0,
    'handoff trigger and channel selects have localized programmatic labels');
  ok(panel.indexOf('aria-label="\' + esc(t.arTime) + \'"') >= 0 &&
      (i18n.match(/arTime:/g) || []).length === 2,
    'enabled handoff time input has a symmetric localized accessible name');
  ok(missionControl.indexOf('aria-label="\' + esc(nm(r.name)) + \'"') >= 0,
    'all Mission Control resource ranges inherit their localized resource name');
  ok(panel.indexOf('var rebuiltControl = focusId && $(focusId)') >= 0 &&
      panel.indexOf('rebuiltControl.focus({ preventScroll: true })') >= 0 &&
      arrowPatchSource.indexOf('openArrowPanel(arrowEdit, null, focusId)') >= 0 &&
      listeners.indexOf('arrowPatch(control.id)') >= 0,
    'arrow trigger, channel, and time edits restore focus to the rebuilt logical control');
  ok(modalFocus.indexOf('lastFocusResolver') >= 0 && modalFocus.indexOf('target = lastFocusResolver()') >= 0 &&
      modalFocus.indexOf('target.focus({ preventScroll: true })') >= 0 &&
      html.indexOf('<h2 id="rules-title" tabindex="-1"') >= 0 &&
      modalFocus.indexOf("modal.scrollTop = 0") >= 0 && modalFocus.indexOf('title.focus({ preventScroll: true })') >= 0,
    'Rules starts at its focused title without mobile auto-scroll and dialogs restore their invoker');
  ok(keyboard.indexOf("else if (top === 'arrow-modal') closeArrowPanel(false)") >= 0 &&
      keyboard.indexOf("else if (top === 'rules-modal') { $('rules-modal').classList.remove('show'); modalClosed(); }") >= 0 &&
      listeners.indexOf("$('ar-close').addEventListener('click', function () { closeArrowPanel(false); })") >= 0,
    'Escape and the Arrow Close button both use the shared logical focus-restoration lifecycle');
})();

// ============================================================================
// JAPANESE TYPOGRAPHY — optical lift stays language-scoped and layout-safe.
// ============================================================================
console.log('\n=== JAPANESE TYPOGRAPHY — scoped optical sizing ===');
(function () {
  var css = require('fs').readFileSync(require('path').join(__dirname, 'style.css'), 'utf8');
  var controlRule = 'html:lang(ja) :where(button,input,select,textarea){font-size-adjust:inherit;}';
  var controlRulePos = css.lastIndexOf(controlRule);
  var iconRulePos = css.lastIndexOf('html:lang(ja) :where(\n  .brand-seal');
  var iconRuleEnd = iconRulePos < 0 ? -1 : css.indexOf('){font-size-adjust:none;}', iconRulePos);
  var iconRule = iconRuleEnd < 0 ? '' : css.slice(iconRulePos, iconRuleEnd + 27);
  var glyphAfterRulePos = css.lastIndexOf('html:lang(ja) :where(\n  .plan-session>summary,.setup-score-details>summary');
  var glyphAfterRuleEnd = glyphAfterRulePos < 0 ? -1 : css.indexOf(')::after{font-size-adjust:none;}', glyphAfterRulePos);
  var glyphAfterRule = glyphAfterRuleEnd < 0 ? '' : css.slice(glyphAfterRulePos, glyphAfterRuleEnd + 36);
  var glyphBeforeRule = 'html:lang(ja) :where(.ed-more summary,.plan-chip)::before{font-size-adjust:none;}';
  var glyphBeforeRulePos = css.lastIndexOf(glyphBeforeRule);
  ok(css.indexOf('html:lang(ja) body{font-size-adjust:ic-height 1.06;}') >= 0,
    'type: Japanese mode applies one inherited 6% ideographic-height adjustment');
  ok(iconRulePos > controlRulePos &&
      iconRule.indexOf('.tray-hint-x,.pc-x,.tc-x,.fd-x,.dd-close') >= 0 &&
      iconRule.indexOf('.cv-ic,.rc-ic,.ed-ic,.mc-role,.st-ic,.warn-ic,.lg-dot') >= 0 &&
      iconRule.indexOf('.fd-chip-ic,.fd-lbl-ic,.pc-ic,.pc-bub,.gc-ic,.to-ic,.tc-ic,.td-ic,.pt-ic') >= 0,
    'type: the full pictogram opt-out, including icon-only buttons, wins the final control cascade');
  ok(glyphAfterRulePos > iconRulePos && glyphBeforeRulePos > iconRulePos &&
      glyphAfterRule.indexOf('.chapter-browser>summary') >= 0 &&
      glyphAfterRule.indexOf('.pr-more>summary,.run-options>summary,.intro-hero,.fd-block.time-unknown') >= 0 &&
      glyphAfterRule.indexOf(')::after{font-size-adjust:none;}') >= 0 &&
      css.indexOf(glyphBeforeRule) >= 0,
    'type: decorative ::after/::before glyphs use valid pseudo-outside-:where opt-outs');
  ok(controlRulePos > css.lastIndexOf('font:'),
    'type: final form-control inheritance wins over every compact font shorthand');
  ok(css.indexOf('.plan-session-menu{position:absolute;right:0;top:calc(100% + 7px);z-index:90;width:min(260px,calc(100vw - 32px));display:none;') >= 0 &&
      css.indexOf('.plan-session[open] .plan-session-menu{display:grid;}') >= 0,
    'mobile shell: the saved-plan menu is absent while its details element is closed');
  ok(css.indexOf('.railcard #launch{width:100%;height:48px;font-size:16px;margin-top:12px;}') >= 0 &&
      css.indexOf('html:lang(ja) .railcard #launch{min-height:48px;height:auto;padding:10px 15px;line-height:1.35;white-space:normal;}') >= 0,
    'mobile shell: Launch keeps legacy EN metrics while only the Japanese label can grow');
  ok(css.indexOf('html:lang(ja) .fd-lbl{width:108px;}') >= 0 &&
      css.indexOf('.plan-session-menu{left:0;right:0;top:calc(100% + 7px);width:auto;}') >= 0,
    'mobile shell: Japanese lane labels use the reserved 108px gutter and the open saved-plan menu stays inset');
})();

// ============================================================================
// MASTERY P0 — every authored dependency break must cost an existing point.
// ============================================================================
console.log('\n=== MASTERY P0 — Return shipping must finish before headcount ===');
(function () {
  function canonCfg() {
    var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
    ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (seg) { cfg = P.applyDayFix(cfg, seg); });
    return cfg;
  }
  function clone(x) { return JSON.parse(JSON.stringify(x)); }
  function movedProducer(cfg, plan, seg, taskId, startMin) {
    var out = clone(cfg), task = P.tasksForSeg(plan, seg).filter(function (t) { return t.id === taskId; })[0];
    if (seg === 'fishday') {
      out.overrides.timing = out.overrides.timing || {};
      out.overrides.timing[taskId] = { startMin: startMin };
    } else {
      out.overrides.days = out.overrides.days || {}; out.overrides.days[seg] = out.overrides.days[seg] || {};
      out.overrides.days[seg].placement = out.overrides.days[seg].placement || {};
      out.overrides.days[seg].placement[taskId] = { startMin: startMin, durMin: task.durMin,
        assignedIds: task.assignedIds.slice(), carries: (task.carries || []).slice() };
    }
    return out;
  }
  function sumMax(atoms) { return atoms.reduce(function (n, a) { return n + a.maxPts; }, 0); }

  var baseCfg = canonCfg(), basePlan = P.mergePlan(baseCfg);
  var brokenCfg = movedProducer(baseCfg, basePlan, 'return', 'hd_r_ship', 540);
  var brokenPlan = P.mergePlan(brokenCfg), rd = P.dayReadiness(brokenPlan, 'return');
  ok(JSON.stringify(rd) === JSON.stringify([{ type: 'DEP_BROKEN', taskId: 'hd_r_headcount', depId: 'hd_r_ship' }]),
    'moving hd_r_ship 480→540 creates the exact headcount<-shipping dependency break');

  var trip = P.scoreTrip(brokenPlan), failed = trip.atoms.filter(function (a) { return a.earned < a.maxPts; });
  var atom = failed[0], ret = trip.byBucket.return;
  ok(trip.atoms.length === 99 && sumMax(trip.atoms) === 100 && trip.total === 99 && trip.grade === 'B' &&
      !trip.gate.clean && trip.gate.withheldA && ret.earned === 8 && ret.maxPts === 9,
    'late Return shipping preserves 99 atoms/100 maxima but scores exactly 99 with Return 8/9');
  ok(failed.length === 1 && atom.id === 'return_exec_logi' && atom.maxPts === 1 && atom.earned === 0 &&
      atom.status === 'broken' && atom.reasonKey === 'scr_exec_broken' && atom.itemRef.roleId === 'logi' &&
      atom.itemRef.taskId.indexOf('hd_r_ship') >= 0,
    'the existing 1-point Return Logistics atom owns the dependency failure exactly once');

  var cluster = P.planClusters(brokenPlan).filter(function (c) { return c.id === 'return'; })[0], root = cluster.rootIssues[0];
  ok(cluster.earned === 8 && cluster.lostPoints === 1 && cluster.rootIssues.length === 1 && root.lostPoints === 1 &&
      JSON.stringify(root.atomIds) === JSON.stringify(['return_exec_logi']) && root.reasonKeys[0] === 'scr_exec_broken' &&
      root.readiness.length === 1 && root.readiness[0].taskId === 'hd_r_headcount' && root.readiness[0].depId === 'hd_r_ship' &&
      root.editorTarget.kind === 'task' && root.editorTarget.segment === 'return' && root.editorTarget.taskId === 'hd_r_ship',
    'cluster projection folds the warning and lost point into one exact hd_r_ship repair root');

  // Matrix audit: force every direct dependency edge in every authorable segment
  // to overlap by moving its producer to the consumer's start. Every modeled edge
  // must surface DEP_BROKEN and lose at least one existing atom; Voyage has no deps.
  var audited = 0, auditFailures = [];
  P.AUTHORABLE.forEach(function (seg) {
    var canonicalCfg = canonCfg(), canonicalPlan = P.mergePlan(canonicalCfg);
    var tasks = P.tasksForSeg(canonicalPlan, seg), byTask = {};
    tasks.forEach(function (t) { byTask[t.id] = t; });
    tasks.filter(function (t) { return t.required !== false; }).forEach(function (consumer) {
      (consumer.deps || []).forEach(function (depId) {
        audited++;
        var cfg = movedProducer(canonicalCfg, canonicalPlan, seg, depId, consumer.startMin);
        var plan = P.mergePlan(cfg), readiness = P.dayReadiness(plan, seg), score = P.scoreTrip(plan);
        var hasExactRow = readiness.some(function (r) {
          return r.type === 'DEP_BROKEN' && r.taskId === consumer.id && r.depId === depId;
        });
        if (!hasExactRow || score.total >= 100 || score.gate.clean ||
            !score.atoms.some(function (a) { return a.earned < a.maxPts; })) {
          auditFailures.push(seg + ':' + depId + '>' + consumer.id + ':' + score.total);
        }
      });
    });
  });
  ok(audited === 52 && auditFailures.length === 0,
    'all 52 authorable dependency-edge overlap variants surface a cause and withhold 100' +
      (auditFailures.length ? ' (' + auditFailures.join(', ') + ')' : ''));
})();

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED ✓' : pass + ' passed, ' + fail + ' FAILED ✗'));
process.exit(fail === 0 ? 0 : 1);
