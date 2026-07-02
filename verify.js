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

// checkpoint intervene: unblocks the LIVE run; the plan gap survives a clean re-run
var isim = P.createSim(base, 'fishday');
P.intervene(isim, 'ic_tackle', 'specialist');
ok(isim.sched.byTask.t_f_gearload.start === 330 && isim.handFed === 1, 'intervene(ic_tackle) unblocks the live gear-load (hand-fed 1x)');
ok(P.score(isim).idleMin === gfd.idleTotal, 'plan gap survives the hand-feed: score still bills ' + gfd.idleTotal + ' idle min');

// editor merge surface: draw / erase arrows, retime a block
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_x: { cardId: 'ic_menu', fromRoleId: 'chef', fromTaskId: 't_f_menu', toRoleId: 'specialist', toTaskId: 't_f_gearload', trigger: { type: 'onTaskDone', taskId: 't_f_menu' }, channel: 'faceToFace', ifLate: 'assume', reworkKind: 'wrongFish', content: { en: 'x', jp: 'x' } } } } }).handoffs.length === 13, 'editor can draw a new arrow (12 -> 13)');
ok(P.mergePlan({ seed: 1, overrides: { handoffs: { h_catch_chef: null } } }).handoffs.length === 11, 'editor can erase an arrow (12 -> 11)');
var mv = P.mergePlan({ seed: 1, overrides: { timing: { t_f_menu: { startMin: 315, durMin: 45 } } } }).tasks.filter(function (t) { return t.id === 't_f_menu'; })[0];
ok(mv.startMin === 315 && mv.durMin === 45, 'editor can retime a task block (315/45)');

console.log('\n=== DETERMINISM ===');
var a = JSON.stringify(scoreOf({ seed: 42, overrides: {} }));
var b = JSON.stringify(scoreOf({ seed: 42, overrides: {} }));
ok(a === b, 'same seed -> identical score()');

console.log('\n=== gradient table ===');
var steps = [['gappy', base]];
var acc = base; ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn', 'fixHandoffs'].forEach(function (fx) { acc = P.applyFix(acc, fx); steps.push(['+' + fx, acc]); });
steps.forEach(function (st) { var s = scoreOf(st[1]); console.log('  ' + (st[0] + '            ').slice(0, 14) + ' ' + s.grade + ' ' + ('  ' + s.score).slice(-3) + ' /100  gaps=' + s.problemCount + ' goal%=' + s.goalPct); });

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED ✓' : pass + ' passed, ' + fail + ' FAILED ✗'));
process.exit(fail === 0 ? 0 : 1);
