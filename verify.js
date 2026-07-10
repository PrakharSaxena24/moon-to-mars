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
// §7/§13.4 P2 re-tune: the seed now withholds 9 of the 14 canonical arrows (only 4 kept
// on-time + 1 kept-but-late) -> 10 missing (task,card) pairs + 1 late (was 2/1 pre-retune)
ok(gfd.missing.length === 10 && gfd.late.length === 1, 'ships 9 withheld arrows (10 missing pairs) + 1 late tackle arrow (' + gfd.missing.length + '/' + gfd.late.length + ')');
ok(gfd.wrongFish.length === 4, 'undrawn ic_menu/ic_ground -> wrong-fish rework at gear-load, route, rig & fish (' + gfd.wrongFish.join(',') + ')');
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
var isim = P.createSim(base, 'fishday');
P.intervene(isim, 'ic_tackle', 'specialist');
ok(isim.sched.byTask.t_f_gearload.start === 330 && isim.handFed === 1, 'intervene(ic_tackle) unblocks the live gear-load (hand-fed 1x)');
ok(P.score(isim).idleMin === gfd.idleTotal, 'plan gap survives the hand-feed: score still bills ' + gfd.idleTotal + ' idle min');

// the canonical channel-latency table (§6.1) — the pricing of 報連相 — pinned exactly
ok(P.CHANNELS.faceToFace === 0 && P.CHANNELS.radio === 1 && P.CHANNELS.phone === 2 && P.CHANNELS.chat === 10 && P.CHANNELS.board === 30, 'channel latency pinned: 対面0 · 無線1 · 電話2 · チャット10 · 掲示板30');
// §7/§13.4 P2 re-tune: withholding 9 more arrows raises idle 220->1450 (rework/lateness unchanged)
ok(gfd.idleTotal === 1450 && gfd.reworkTotal === 90 && gfd.late[0].lateMin === 40, 'gappy ledger pinned exactly: 1450 idle + 90 rework person-min, tackle 40 min late');

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
// §7/§13.4 P2 re-tune: the gappy seed now ships only 5 of 14 fishday arrows (was 12)
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_x: { cardId: 'ic_menu', fromRoleId: 'chef', fromTaskId: 't_f_menu', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_menu' }, channel: 'faceToFace', ifLate: 'assume', reworkKind: 'wrongFish', content: { en: 'x', jp: 'x' } } } } }).handoffs.length === 6, 'editor can draw a new arrow (5 -> 6)');
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_catch_chef: null } } }).handoffs.length === 4, 'editor can erase an arrow (5 -> 4)');
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
  var fdDef = P.fishdaySchedule(P.mergePlan(P.applyAllFixes(base)));
  var derCfg = P.applyAllFixes(base); derCfg.overrides.seats = der;
  var fdDer = P.fishdaySchedule(P.mergePlan(derCfg));
  ok(fdDef.idleTotal === 0 && fdDef.efficiency === 100, 'all-fixes fishday is a clean win by default (idle 0, eff 100)');
  ok(fdDer.idleTotal === fdDef.idleTotal && fdDer.efficiency === fdDef.efficiency && fdDer.dinnerMin === fdDef.dinnerMin,
    'derangement: fishday idle/eff/dinner identical to default (person-agnostic)');
  var dS = scoreOf(derCfg), aS = scoreOf(P.applyAllFixes(base));
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
  // §7/§13.4 P2 re-tune: Arrival now ships HALF-cleared (6 of its 11 required tasks placed;
  // the other 5 blanked) — the placed subset is an internally-consistent, on-time chain (a
  // structural authoring gap on the still-unplaced tasks, not a live temporal stall), so it
  // animates those 6 tasks with zero stalls. Ops/Return still ship fully wired, so they keep
  // the original "seeded gaps -> live stall" shape.
  ['arrival', 'ops', 'return'].forEach(function (seg) {
    var anim = P.createSim(base, seg, { animate: true });
    ok(anim.mode === 'minute', 'coarse ' + seg + ': {animate:true} => minute-clock sim');
    ok(P.createSim(base, seg).mode !== 'minute', 'coarse ' + seg + ': 2-arg createSim stays the classic day clock (verify-safe gate)');
    if (seg === 'arrival') {
      ok(anim.tasks.length === 6 && anim.tasks.every(function (t) { return anim.sched.byTask[t.id]; }),
        'coarse arrival (half-cleared seed): the 6 placed tasks animate, scheduled (' + anim.tasks.length + ')');
      ok(P.dayReadiness(P.mergePlan(base), seg).some(function (r) { return r.type === 'UNPLACED_REQUIRED'; }),
        'coarse arrival (half-cleared seed): dayReadiness flags UNPLACED_REQUIRED for the still-unplaced tasks');
    } else {
      ok(anim.tasks.length > 0 && anim.tasks.every(function (t) { return anim.sched.byTask[t.id]; }),
        'coarse ' + seg + ': every animated task is scheduled (sim.tasks <-> sched.byTask lock-step)');
    }
    ok(anim.clockMin === anim.winStart && anim.winEnd > anim.winStart, 'coarse ' + seg + ': clock starts at the segment window start');
    // seeded (gappy) day: someone stalls on a gap -> pauses on a cp_stall at least once
    // (arrival's placed subset is internally consistent, so it correctly pauses zero times)
    var g = 0, stalls = 0;
    while (!anim.finished && g < 400) { P.tick(anim); if (anim.paused) { if (anim.checkpoint.id === 'cp_stall') stalls++; P.resume(anim); } g++; }
    ok(anim.finished, 'coarse ' + seg + ': runs to a finish');
    if (seg === 'arrival') ok(stalls === 0, 'coarse arrival (half-cleared seed): the placed chain is clean -> zero cp_stall pauses');
    else ok(stalls > 0, 'coarse ' + seg + ' (seeded gaps): pauses on a cp_stall at least once');
    // auto-arranged arrows + restored placements -> no handoff stall -> zero pauses, 100% efficiency
    var cfg = P.applyDayFix(base, seg), clean = P.createSim(cfg, seg, { animate: true }), g2 = 0, p2 = 0;
    while (!clean.finished && g2 < 400) { P.tick(clean); if (clean.paused) { p2++; P.resume(clean); } g2++; }
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

  var bb = {}; for (var k in st1.byBucket) bb[k] = st1.byBucket[k].maxPts;
  ok(JSON.stringify(bb) === JSON.stringify({ frame: 14, arrival: 15, ops: 18, fishday: 41, return: 12 }),
    'scoreTrip: byBucket maxPts === {frame:14,arrival:15,ops:18,fishday:41,return:12} (' + JSON.stringify(bb) + ')');

  var bd = {}; for (var k2 in st1.byDimension) bd[k2] = st1.byDimension[k2].maxPts;
  ok(JSON.stringify(bd) === JSON.stringify({ info: 34, exec: 25, safety: 20, quality: 10, money: 10, people: 1 }),
    'scoreTrip: byDimension maxPts === {info:34,exec:25,safety:20,quality:10,money:10,people:1} (' + JSON.stringify(bd) + ')');

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
  function trueCanonCfg() {
    var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
    ['arrival', 'ops', 'return'].forEach(function (s) { cfg = P.applyDayFix(cfg, s); });
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

  // v1.0 id scheme (plan §W1-T2 id-change list): fishday_exec_owner_flex->fishday_exec_owner,
  // fishday_exec_pm_flex->fishday_exec_pm, fishday_safety_health_check->fishday_safety_t_f_health
  var SEVEN = ['fishday_exec_owner', 'fishday_exec_pm', 'frame_hospital_shared', 'frame_abort_night',
    'fishday_safety_t_f_health', 'fishday_quality_allergy', 'fishday_quality_portions'];
  SEVEN.forEach(function (id) {
    var a = atomOf(t.atoms, id);
    ok(!!a && a.earned === a.maxPts && a.earned > 0, id + ': earns its full ' + (a && a.maxPts) + ' pts on the true canonical (' + (a && a.earned) + ')');
  });

  // 1. fishday_exec_owner: unplacing the flex task loses its point
  var brk1 = trueCanonCfg(); brk1.overrides.staffing = brk1.overrides.staffing || {}; brk1.overrides.staffing.t_f_flex_owner = [];
  var a1 = atomOf(P.scoreTrip(P.mergePlan(brk1)).atoms, 'fishday_exec_owner');
  ok(a1.earned === 0 && a1.reasonKey === 'scr_exec_unstaffed', 'fishday_exec_owner: unplacing t_f_flex_owner -> earned 0 (' + a1.reasonKey + ')');

  // 2. fishday_exec_pm: misassigning the flex task to the wrong role loses its point
  var brk2 = trueCanonCfg(); brk2.overrides.staffing = brk2.overrides.staffing || {}; brk2.overrides.staffing.t_f_flex_pm = ['p08'];
  var a2 = atomOf(P.scoreTrip(P.mergePlan(brk2)).atoms, 'fishday_exec_pm');
  ok(a2.earned === 0 && a2.reasonKey === 'scr_exec_misassigned', 'fishday_exec_pm: reassigning t_f_flex_pm to specialist p08 -> earned 0 (' + a2.reasonKey + ')');

  // 3. frame_hospital_shared: dropping a needed recipient loses the point
  var brk3 = trueCanonCfg(); brk3.overrides.info = brk3.overrides.info || {}; brk3.overrides.info.ic_hospital = { recipientRoleIds: ['pm', 'siteLead'] };
  var a3 = atomOf(P.scoreTrip(P.mergePlan(brk3)).atoms, 'frame_hospital_shared');
  ok(a3.earned === 0 && a3.reasonKey === 'scr_safety_gap', 'frame_hospital_shared: ic_hospital not shared to comms/safetyLead -> earned 0 (' + a3.reasonKey + ')');

  // 4. frame_abort_night: clearing rk_night's abort criterion loses the point (rk_sea untouched)
  var brk4 = trueCanonCfg(); brk4.overrides.risks = brk4.overrides.risks || {}; brk4.overrides.risks.rk_night = { abortCriterion: null };
  var st4 = P.scoreTrip(P.mergePlan(brk4));
  var a4 = atomOf(st4.atoms, 'frame_abort_night'), a4sea = atomOf(st4.atoms, 'frame_abort_sea');
  ok(a4.earned === 0 && a4.reasonKey === 'scr_safety_gap' && a4sea.earned === a4sea.maxPts,
    'frame_abort_night: clearing rk_night.abortCriterion -> earned 0, frame_abort_sea unaffected (' + a4.reasonKey + ')');

  // 5. fishday_safety_t_f_health: unstaffing t_f_health loses the point
  var brk5 = trueCanonCfg(); brk5.overrides.staffing = brk5.overrides.staffing || {}; brk5.overrides.staffing.t_f_health = [];
  var a5 = atomOf(P.scoreTrip(P.mergePlan(brk5)).atoms, 'fishday_safety_t_f_health');
  ok(a5.earned === 0 && a5.reasonKey === 'scr_safety_gap', 'fishday_safety_t_f_health: unstaffing t_f_health -> earned 0 (' + a5.reasonKey + ')');

  // 6. fishday_quality_allergy: committing the menu to a species in the allergen CATEGORY
  // (refinement-1: 'shrimp' -> category 'shellfish', which intersects ic_food.allergens —
  // exercises the real species->category path, not a literal species/category string match)
  var brk6 = trueCanonCfg(); brk6.overrides.info = brk6.overrides.info || {}; brk6.overrides.info.ic_menu = { species: 'shrimp' };
  var a6 = atomOf(P.scoreTrip(P.mergePlan(brk6)).atoms, 'fishday_quality_allergy');
  ok(a6.earned === 0 && a6.reasonKey === 'scr_qual_fail', 'fishday_quality_allergy: menu species set to shrimp (category shellfish, the allergen) -> earned 0 (' + a6.reasonKey + ')');

  // 7. fishday_quality_portions: a menu portion count that disagrees with GUESTS+addOns loses the point
  var brk7 = trueCanonCfg(); brk7.overrides.info = brk7.overrides.info || {}; brk7.overrides.info.ic_menu = { portions: 20 };
  var a7 = atomOf(P.scoreTrip(P.mergePlan(brk7)).atoms, 'fishday_quality_portions');
  ok(a7.earned === 0 && a7.reasonKey === 'scr_qual_fail', 'fishday_quality_portions: menu portions (20) disagree with 13 guests + 5 add-ons (18) -> earned 0 (' + a7.reasonKey + ')');

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

  // the true canonical (all classic fixes + all 3 canonDay) still reaches 100/A/clean —
  // re-affirmed here alongside the gradient numbers (already anchored in the P2a block above)
  var canonCfg2 = P.applyAllFixes({ seed: 1, overrides: {} });
  ['arrival', 'ops', 'return'].forEach(function (s) { canonCfg2 = P.applyDayFix(canonCfg2, s); });
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
  function trueCanonCfg() {
    var cfg = P.applyAllFixes({ seed: 1, overrides: {} });
    ['arrival', 'ops', 'return'].forEach(function (s) { cfg = P.applyDayFix(cfg, s); });
    return cfg;
  }

  // PINS — the exact seed values (spec §6, plan §W1-T2). These are the reference derivation's
  // PRE-MEASURED ESTIMATES, not yet the real numbers off the merged v1.0 engine (this task
  // (W1-T2) runs concurrently with W1-T1's engine rewrite and cannot measure them). The
  // INTEGRATOR (W2) measures the true values from the merged engine.js and overwrites the
  // fields below to the exact measured numbers before committing — this object is the single
  // place a seed re-tune touches thereafter, spec-first per §6.
  var PINS = {
    gappySeed: 54,
    gappyBuckets: { frame: 0, arrival: 7, ops: 16, fishday: 20, return: 11 },
    fixHandoffsJump: 18,
    tripEffGappy: 81
  };

  var gappyPlan = P.mergePlan(base);
  var g = P.scoreTrip(gappyPlan);
  var canonCfg = trueCanonCfg();
  var canonPlan = P.mergePlan(canonCfg);
  var t = P.scoreTrip(canonPlan);

  // (1) atom count === 89, gappy AND canonical (the constitution's atom inventory is
  // template-derived, not plan-derived — both plans carry the identical 89 atoms)
  ok(g.atoms.length === 89, 'scoreTrip: gappy atoms.length === 89 (' + g.atoms.length + ')');
  ok(t.atoms.length === 89, 'scoreTrip: canonical atoms.length === 89 (' + t.atoms.length + ')');

  // (4) Sigma atoms.earned (clamped >=0) === total, on gappy + canonical
  ok(sumEarnedClamped(g.atoms) === g.total, 'scoreTrip: Sigma atoms.earned (clamped) === total on gappy (' + g.total + ')');
  ok(sumEarnedClamped(t.atoms) === t.total, 'scoreTrip: Sigma atoms.earned (clamped) === total on canonical (' + t.total + ')');

  // (5) PINS — exact seed values (finalized by the integrator against the merged engine)
  ok(g.total === PINS.gappySeed, 'scoreTrip: gappy total pinned exactly at PINS.gappySeed (' + g.total + ')');
  var gBuckets = {}; for (var kg in g.byBucket) gBuckets[kg] = g.byBucket[kg].earned;
  ok(JSON.stringify(gBuckets) === JSON.stringify(PINS.gappyBuckets),
    'scoreTrip: gappy byBucket earned pinned exactly at PINS.gappyBuckets (' + JSON.stringify(gBuckets) + ')');
  var jump = P.scoreTrip(P.mergePlan(P.applyFix(base, 'fixHandoffs'))).total - g.total;
  ok(jump === PINS.fixHandoffsJump, 'scoreTrip: fixHandoffs jump pinned exactly at PINS.fixHandoffsJump (' + jump + ')');
  ok(P.tripEfficiency(gappyPlan) === PINS.tripEffGappy, 'tripEfficiency: gappy pinned exactly at PINS.tripEffGappy (' + P.tripEfficiency(gappyPlan) + ')');

  // (6) cumulative monotone ladder: the 8 classic fixes (incl. fixHandoffs) then applyDayFix x3
  // (arrival/ops/return) -> each step's total is >= the previous, and the Sigma-earned identity
  // holds at every step; the final step reaches 100/A/clean.
  var LADDER_FIXES = ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn', 'fixHandoffs'];
  var accCfg = base, ladder = [g];
  LADDER_FIXES.forEach(function (fx) { accCfg = P.applyFix(accCfg, fx); ladder.push(P.scoreTrip(P.mergePlan(accCfg))); });
  ['arrival', 'ops', 'return'].forEach(function (seg) { accCfg = P.applyDayFix(accCfg, seg); ladder.push(P.scoreTrip(P.mergePlan(accCfg))); });
  var monoLadder = true;
  for (var li = 1; li < ladder.length; li++) {
    if (ladder[li].total < ladder[li - 1].total) monoLadder = false;
    ok(sumEarnedClamped(ladder[li].atoms) === ladder[li].total, 'scoreTrip: Sigma atoms.earned (clamped) === total at ladder step ' + li + ' (' + ladder[li].total + ')');
  }
  ok(monoLadder, 'scoreTrip: cumulative fix ladder (8 classic incl. fixHandoffs + 3 canonDay) is monotone non-decreasing (' + ladder.map(function (s) { return s.total; }).join('→') + ')');
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

  // (7b) the clean gate also polices the one classic detector without an atom home: skipping
  // setReturn (frame t_ship staffing) still totals 100 but withholds the A via detect()!==0
  var nrCfg = base;
  ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'fixHandoffs'].forEach(function (fx) { nrCfg = P.applyFix(nrCfg, fx); });
  ['arrival', 'ops', 'return'].forEach(function (seg) { nrCfg = P.applyDayFix(nrCfg, seg); });
  var nrt = P.scoreTrip(P.mergePlan(nrCfg));
  ok(nrt.total === 100 && nrt.gate.clean === false && nrt.grade === 'B' && nrt.gate.withheldA === true,
    'scoreTrip: skipping setReturn -> 100 points but a live returnLogi detector withholds the A (' +
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

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED ✓' : pass + ' passed, ' + fail + ' FAILED ✗'));
process.exit(fail === 0 ? 0 : 1);
