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

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED ✓' : pass + ' passed, ' + fail + ' FAILED ✗'));
process.exit(fail === 0 ? 0 : 1);
