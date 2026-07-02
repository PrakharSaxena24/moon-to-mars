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
var fixCat = { setSafety: 'safety', grantAuth: 'budget', shareInfo: 'info', setReport: 'info', rebalance: 'health', fixReserve: 'budget', setReturn: 'roles' };
var detForFix = { setSafety: 'safety', grantAuth: 'budgetAuth', shareInfo: 'info', setReport: 'report', rebalance: 'fatigue', fixReserve: 'reserve', setReturn: 'returnLogi' };
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
ok(sAll.individuals.length === 8, 'individuals present (8 AIBOS staff) (' + sAll.individuals.length + ')');
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

console.log('\n=== DETERMINISM ===');
var a = JSON.stringify(scoreOf({ seed: 42, overrides: {} }));
var b = JSON.stringify(scoreOf({ seed: 42, overrides: {} }));
ok(a === b, 'same seed -> identical score()');

console.log('\n=== gradient table ===');
var steps = [['gappy', base]];
var acc = base; ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn'].forEach(function (fx) { acc = P.applyFix(acc, fx); steps.push(['+' + fx, acc]); });
steps.forEach(function (st) { var s = scoreOf(st[1]); console.log('  ' + (st[0] + '            ').slice(0, 14) + ' ' + s.grade + ' ' + ('  ' + s.score).slice(-3) + ' /100  gaps=' + s.problemCount + ' goal%=' + s.goalPct); });

console.log('\n' + (fail === 0 ? 'ALL ' + pass + ' CHECKS PASSED ✓' : pass + ' passed, ' + fail + ' FAILED ✗'));
process.exit(fail === 0 ? 0 : 1);
