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
var sAll = scoreOf(P.applyAllFixes(base));
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
var gplan = P.mergePlan(base);
ok(P.detect(gplan).map(function (d) { return d.id; }).indexOf('handoffTiming') >= 0, 'gappy plan raises handoffTiming');
var gfd = P.fishdaySchedule(gplan);
ok(gfd.idleTotal > 0, 'gappy fishday accrues idle minutes (' + gfd.idleTotal + ' — tackle list late on chat)');
ok(gfd.missing.length === 2 && gfd.late.length === 1, 'ships 2 missing cook-consult arrows + 1 late tackle arrow (' + gfd.missing.length + '/' + gfd.late.length + ')');
ok(gfd.wrongFish.length === 2, 'undrawn ic_menu -> wrong-fish rework at gear-load & route (' + gfd.wrongFish.join(',') + ')');
ok(gfd.efficiency < 100, 'gappy efficiency < 100 (' + gfd.efficiency + '%)');
ok(gfd.dinnerMin > 1080, 'wrong fish pushes dinner past 18:00 (min ' + gfd.dinnerMin + ')');
var gsim = fishRun(base);
ok(gsim._pauses.join(',') === 'cp_predep,cp_relay,cp_dinner', 'run pauses at the 3 checkpoints (' + gsim._pauses.join(',') + ')');
var gsc = P.score(gsim);
ok(gsim.finished === 'incomplete' && gsc.grade === 'D', 'gappy fishday finishes incomplete, grades D (' + gsc.score + ')');

var fAll = P.applyAllFixes(base);
var ffd = P.fishdaySchedule(P.mergePlan(fAll));
ok(ffd.idleTotal === 0, 'all fixes -> zero idle minutes');
ok(ffd.efficiency === 100, 'all fixes -> 100% efficiency');
ok(ffd.wrongFish.length === 0 && ffd.missing.length === 0 && ffd.late.length === 0, 'all fixes -> no missing / late / wrong-fish');
ok(ffd.dinnerMin === 1080, 'all fixes -> dinner served exactly 18:00 (min ' + ffd.dinnerMin + ')');
var fsim = fishRun(fAll), fsc = P.score(fsim);
ok(fsim.finished === 'done' && fsc.grade === 'A' && fsc.score === 100 && fsc.clean, 'fixed fishday -> clean A 100 (' + fsc.score + ')');

var effSeq = [], accF = base;
['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn', 'fixHandoffs'].forEach(function (fx) { accF = P.applyFix(accF, fx); effSeq.push(P.score(runToEnd(accF)).efficiency); });
var mono = true; for (var e = 1; e < effSeq.length; e++) if (effSeq[e] < effSeq[e - 1]) mono = false;
ok(mono && effSeq[effSeq.length - 1] === 100, 'efficiency climbs monotonically to 100 (' + effSeq.join('→') + ')');

// a task's idle is the MAX of its late inputs, never the sum
var two = P.mergePlan({ seed: 1, overrides: { handoffs: {
  h_food:    { trigger: { type: 'atMinute', value: 320 }, channel: 'phone' },   // arrives 322 -> 22 late
  h_orgfood: { trigger: { type: 'atMinute', value: 330 }, channel: 'phone' }    // arrives 332 -> 32 late
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
var isim = P.createSim(base, 'fishday');
P.intervene(isim, 'ic_tackle', 'specialist');
ok(isim.sched.byTask.t_f_gearload.start === 330 && isim.handFed === 1, 'intervene(ic_tackle) unblocks the live gear-load (hand-fed 1x)');
ok(P.score(isim).idleMin === gfd.idleTotal, 'plan gap survives the hand-feed: score still bills ' + gfd.idleTotal + ' idle min');

// the canonical channel-latency table (§6.1) — the pricing of 報連相 — pinned exactly
ok(P.CHANNELS.faceToFace === 0 && P.CHANNELS.radio === 1 && P.CHANNELS.phone === 2 && P.CHANNELS.chat === 10 && P.CHANNELS.board === 30, 'channel latency pinned: 対面0 · 無線1 · 電話2 · チャット10 · 掲示板30');
ok(gfd.idleTotal === 220 && gfd.reworkTotal === 90 && gfd.late[0].lateMin === 40, 'gappy ledger pinned exactly: 220 idle + 90 rework person-min, tackle 40 min late');

// drawing a FASTER duplicate arrow is a legitimate alternate fix (min-arrival per pair)
var dupFd = P.fishdaySchedule(P.mergePlan({ seed: 1, overrides: { handoffs: { h_tackle2: { cardId: 'ic_tackle', fromRoleId: 'logi', fromTaskId: 't_f_tackleprep', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_tackleprep' }, channel: 'faceToFace', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } } } } }));
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
var healed = P.applyAllFixes(vandal), healedPlan = P.mergePlan(healed), healedFd = P.fishdaySchedule(healedPlan);
ok(P.detect(healedPlan).length === 0 && healedFd.idleTotal === 0 && healedFd.efficiency === 100, 'fixHandoffs heals an erased/slowed/junk-arrowed plan back to clean 100%');

// guests judge lateness against the PROMISED time: dragging dinner later cannot hide the wait
var lateDinner = P.applyAllFixes(base);
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
var dead = P.applyAllFixes(base);
dead.overrides.handoffs.h_dead = { cardId: 'ic_tackle', fromRoleId: 'specialist', fromTaskId: 't_f_gearload', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_gearload' }, channel: 'radio', ifLate: 'idle', reworkKind: null, content: { en: 'x', jp: 'x' } };
var deadFd = P.fishdaySchedule(P.mergePlan(dead));
ok(deadFd.unresolved === 0 && deadFd.idleTotal === 0 && deadFd.efficiency === 100, 'self-referencing junk arrow beside an on-time arrow: no deadlock, still clean');

// memberInfo is a minute-clock API: a coarse sim returns null instead of throwing
var coarse = P.createSim(base); P.tick(coarse);
var miCoarse = null, miThrew = false;
try { miCoarse = P.memberInfo(coarse, 'p03'); } catch (e) { miThrew = true; }
ok(!miThrew && miCoarse === null, 'memberInfo on a coarse sim returns null (no crash)');

// editor merge surface: draw / erase arrows, retime a block
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_x: { cardId: 'ic_menu', fromRoleId: 'chef', fromTaskId: 't_f_menu', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_menu' }, channel: 'faceToFace', ifLate: 'assume', reworkKind: 'wrongFish', content: { en: 'x', jp: 'x' } } } } }).handoffs.length === 13, 'editor can draw a new arrow (12 -> 13)');
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_catch_chef: null } } }).handoffs.length === 11, 'editor can erase an arrow (12 -> 11)');
var mv = P.mergePlan({ seed: 1, overrides: { timing: { t_f_menu: { startMin: 315, durMin: 45 } } } }).tasks.filter(function (t) { return t.id === 't_f_menu'; })[0];
ok(mv.startMin === 315 && mv.durMin === 45, 'editor can retime a task block (315/45)');

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
var ctG = P.cascadeTrace(P.mergePlan(base)), ctC = P.cascadeTrace(P.mergePlan(P.applyAllFixes(base)));
ok(ctG.hasFault && ctG.hops.length >= 2, 'gappy cascade has a fault (' + ctG.hops.map(function (h) { return h.station; }).join('→') + ')');
ok(!ctC.hasFault && ctC.hops.length === 0, 'clean cascade has no fault');
ok((function () { for (var i = 1; i < ctG.hops.length; i++) if (ctG.hops[i].atMin < ctG.hops[i - 1].atMin) return false; return true; })(), 'cascade hops are time-ordered');

// purity: cosmetic helpers must never perturb the score (no hidden state / no score-RNG)
var scBefore = JSON.stringify(scoreOf(base));
P.ambientActors(1, 0.5); P.cascadeTrace(P.mergePlan(base)); P.stationReadiness(P.createSim(base, 'fishday')); P.boatState(P.createSim(base, 'fishday'));
ok(JSON.stringify(scoreOf(base)) === scBefore, 'cosmetic helpers do not perturb score() (pure)');

console.log('\n=== ALL-DAY GRID — dayLayout / derivedHandoffs (pure, additive) ===');
(function () {
  var plan = P.mergePlan(base);
  var tasksBefore = JSON.stringify(plan.tasks);
  var scBefore = JSON.stringify(scoreOf(base));
  ok(P.dayLayout(plan, 'fishday') === null, 'dayLayout(fishday) === null (Day 3 uses the minute path)');
  ['arrival', 'ops', 'return'].forEach(function (seg) {
    var L = P.dayLayout(plan, seg);
    var shape = L && Array.isArray(L.lanes) && Array.isArray(L.blocks) && Array.isArray(L.unstaffed);
    ok(shape, 'dayLayout(' + seg + ') returns {lanes,blocks,unstaffed}');
    if (!shape) return;
    var within = L.blocks.every(function (b) { return b.startMin >= P.DAY_HOUR_START && (b.startMin + b.durMin) <= P.DAY_HOUR_END && b.laneIndex >= 0 && b.laneIndex < L.lanes.length; });
    ok(within, seg + ': all blocks within [' + P.DAY_HOUR_START + ',' + P.DAY_HOUR_END + '] and a valid lane');
    var groups = {}; L.blocks.forEach(function (b) { var k = b.laneIndex + '_' + b.subRow; (groups[k] = groups[k] || []).push(b); });
    var noOverlap = Object.keys(groups).every(function (k) {
      var g = groups[k].slice().sort(function (a, b) { return a.startMin - b.startMin; });
      for (var i = 1; i < g.length; i++) if (g[i].startMin < g[i - 1].startMin + g[i - 1].durMin) return false;
      return true;
    });
    ok(noOverlap, seg + ': blocks in the same lane-row never overlap in time');
  });
  ok(P.dayLayout(plan, 'return').unstaffed.indexOf('t_ship') >= 0, 'return flags t_ship unstaffed (GAP-G surfaced)');
  var ho = P.derivedHandoffs(plan, 'ops');
  ok(ho.length >= 1 && ho.every(function (a) { return typeof a.cardId === 'string' && typeof a.fromRoleId === 'string' && typeof a.toRoleId === 'string' && typeof a.toTaskId === 'string' && typeof a.incoming === 'boolean'; }), 'derivedHandoffs(ops) well-formed (' + ho.length + ')');
  ok(ho.some(function (a) { return a.incoming === false && a.fromTaskId; }), 'derivedHandoffs(ops) has a real sender→task line');
  ok(P.derivedHandoffs(plan, 'return').length === 0, 'derivedHandoffs(return) empty (no cross-person flow)');
  ok(JSON.stringify(scoreOf(base)) === scBefore, 'dayLayout/derivedHandoffs do not perturb score() (pure)');
  ok(JSON.stringify(plan.tasks) === tasksBefore, 'dayLayout/derivedHandoffs do not mutate plan.tasks (pure)');
})();

console.log('\n=== AUTHORABLE DAYS — daySchedule / scoreDay (§20) ===');
(function () {
  // the first back-to-back handoff (producer end === consumer start) per seg, in handoff-array order
  var FIRST_BTB = { arrival: 'h_a_ferry', ops: 'h_o_weather', 'return': 'h_r_cash_site' };

  // purity witnesses, captured before any §20 read helper below is called
  var pureBefore = { sc: JSON.stringify(scoreOf(base)), tasks: JSON.stringify(P.mergePlan(base).tasks), days: JSON.stringify(P.mergePlan(base).days) };

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
    var btbId = FIRST_BTB[seg];
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
  var fdPlan = P.mergePlan(base);
  var dsFacade = P.daySchedule(fdPlan, 'fishday'), fdFacade = P.fishdaySchedule(fdPlan);
  ok(dsFacade.idleTotal === fdFacade.idleTotal && fdFacade.idleTotal === 220,
    'daySchedule(fishday).idleTotal === fishdaySchedule().idleTotal === 220 (' + dsFacade.idleTotal + '/' + fdFacade.idleTotal + ')');
  ok(dsFacade.efficiency === 91, 'daySchedule(fishday).efficiency === 91 (' + dsFacade.efficiency + '%)');

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

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED ✓' : pass + ' passed, ' + fail + ' FAILED ✗'));
process.exit(fail === 0 ? 0 : 1);
