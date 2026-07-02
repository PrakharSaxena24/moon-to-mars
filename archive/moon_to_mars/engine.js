/* ============================================================================
 * Moon to Mars — Mission Director  (engine v4, pure sim, browser + Node)
 *
 * YOU PLAN THREE THINGS, then watch it run:
 *   1) THE TIMELINE  — put each ROAD task in a STAGE (1,2,3…). A task can only
 *      build once all its prerequisites are DONE. Schedule a task before its
 *      prereqs and it STALLS (its crew stand idle, everything stops, the
 *      deadline slips). Schedule everything in separate stages and you lose the
 *      parallel time — it finishes late. The right timeline respects the
 *      dependencies AND runs independent tasks in the same stage (in parallel).
 *   2) WHO DOES WHAT — assign each astronaut (a SPECIALTY) to a task. Matching
 *      specialist = fast, few questions, few defects. Mis-match = slow, floods
 *      the leader, more defects. A road task with no one never finishes.
 *      Putting people on a DECOY (busywork) wastes them and starves a road task.
 *   3) CHECKPOINTS — defects happen. A checkpoint lets YOU inspect a task when
 *      it finishes (cheap fix); skip it and defects ESCAPE to the goal (dear).
 *
 * Deterministic (seeded RNG): a plan reproduces the same run.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var DT = 0.2;
  var STEP_WORK = 3;
  var BUILD_SCALE = 0.35;  // fewer ticks per task, so a SLOWER tick still finishes in good wall-time
  var PASK = 0.02;
  var INSPECT_TICKS = 4;
  var REWORK_UNIT = 1.6;
  var ESCAPE_UNIT = 42.0;
  var WAGE = 800, CMD_WAGE = 1200;
  var MISMATCH_PACE = 0.45, MISMATCH_ASK = 2.6, MISMATCH_DEFECT = 2.6;

  // FOUR ROLES (like unit types): scout, hauler, builder, engineer.
  // 'spec' on a task = the role that fits it. A BUILDER fits both Foundation & Paving.
  var ROLES = ['scout', 'hauler', 'builder', 'engineer'];
  // Real road tasks have DEPENDENCIES (deps). Decoys are unrelated busywork.
  var TASKS = [
    { key: 'survey',     real: true,  need: 1, spec: 'scout',    risk: 0,   x: 0.16, deps: [] },
    { key: 'haul',       real: true,  need: 2, spec: 'hauler',   risk: 1.0, x: 0.34, deps: ['survey'] },
    { key: 'base',       real: true,  need: 2, spec: 'builder',  risk: 1.6, x: 0.52, deps: ['survey'] },
    { key: 'pave',       real: true,  need: 2, spec: 'builder',  risk: 1.2, x: 0.70, deps: ['haul', 'base'] },
    { key: 'commission', real: true,  need: 1, spec: 'engineer', risk: 0,   x: 0.88, deps: ['pave'] },
    { key: 'rocks',      real: false, need: 2, spec: 'builder',  risk: 0,   x: 0.30, deps: [] },
    { key: 'photo',      real: false, need: 1, spec: 'scout',    risk: 0,   x: 0.55, deps: [] },
    { key: 'depot',      real: false, need: 2, spec: 'hauler',   risk: 0,   x: 0.78, deps: [] }
  ];
  // The whole plan is 4 STAGES: survey(1) -> haul+base(2, parallel) -> pave(3) -> commission(4)
  var STAGE_COUNT = 4;
  var DEFAULT_STAGE = { survey: 1, haul: 2, base: 2, pave: 3, commission: 4 };
  var TOTAL_NEED = 8;

  // The crew: people who fit the roles (1 scout, 2 haulers, 4 builders, 1 engineer = 8).
  var ROSTER = [
    { id: 0, name: 'Nova',  spec: 'scout' },   { id: 1, name: 'Rex', spec: 'hauler' }, { id: 2, name: 'Vega', spec: 'hauler' },
    { id: 3, name: 'Atlas', spec: 'builder' }, { id: 4, name: 'Mei', spec: 'builder' }, { id: 5, name: 'Cosmo', spec: 'builder' },
    { id: 6, name: 'Iris',  spec: 'builder' }, { id: 7, name: 'Orion', spec: 'engineer' }
  ];

  var DIFF = {
    easy:   { askMult: 0.55, service: 2, disobey: 0.00, defectRate: 0.000, selfHelp: 0.50, patience: 2 },
    medium: { askMult: 1.00, service: 3, disobey: 0.05, defectRate: 0.022, selfHelp: 0.50, patience: 2 },
    hard:   { askMult: 1.40, service: 4, disobey: 0.10, defectRate: 0.045, selfHelp: 0.50, patience: 2 }
  };

  function mulberry32(seed) { var a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function byId(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }
  function removeFromQueue(sim, id) { var i = sim.queue.indexOf(id); if (i >= 0) sim.queue.splice(i, 1); }
  function taskByKey(sim, k) { for (var i = 0; i < sim.tasks.length; i++) if (sim.tasks[i].key === k) return sim.tasks[i]; return null; }
  function totalWages(sim) { return sim.leaders.length * CMD_WAGE + sim.chars.length * WAGE; }
  function logEv(sim, type, data) { sim.events.push({ tick: sim.tick, type: type, data: data }); if (sim.events.length > 90) sim.events.shift(); sim.lastEvent = { type: type, data: data }; }
  function matches(ch, t) { return t.spec === '*' || ch.spec === t.spec; }
  function depsDone(sim, t) { for (var i = 0; i < t.deps.length; i++) { var d = taskByKey(sim, t.deps[i]); if (!d || d.state !== 'done') return false; } return true; }

  // Deterministic read of the PLAN (not the run): who is idle, what is unstaffed / on a decoy /
  // mis-specced / over-inspected, and whether the timeline is fully serial. Drives the score's
  // structural penalties and the "clean plan" A-gate. Reads only cfg + the static TASKS/ROSTER.
  function auditPlan(cfg) {
    var assign = cfg.assign || {}, stg = cfg.stage || {}, cks = cfg.checkpoints || {};
    var crewN = {}; for (var a = 0; a < TASKS.length; a++) crewN[TASKS[a].key] = 0;
    var idleCrew = 0;
    for (var r = 0; r < ROSTER.length; r++) { var k = assign[ROSTER[r].id]; if (k != null && crewN.hasOwnProperty(k)) crewN[k]++; else idleCrew++; }
    var unstaffed = 0, decoyN = 0, mismN = 0, overCheck = 0, usedStages = {}, schedN = 0;
    for (var i = 0; i < TASKS.length; i++) {
      var t = TASKS[i], n = crewN[t.key] || 0;
      if (t.real && n === 0) unstaffed++;
      if (!t.real && n > 0) decoyN++;
      if (t.real && n > 0) {
        var mism = false;
        for (var j = 0; j < ROSTER.length; j++) { if (assign[ROSTER[j].id] === t.key && ROSTER[j].spec !== t.spec) { mism = true; break; } }
        if (mism) mismN++;
        if (stg[t.key]) { usedStages[stg[t.key]] = 1; schedN++; }
      }
      if (t.real && t.risk < 0.8 && cks[t.key]) overCheck++;
    }
    var serial = schedN >= 2 && Object.keys(usedStages).length === schedN;
    return { idleCrew: idleCrew, unstaffed: unstaffed, decoyN: decoyN, mismN: mismN, overCheck: overCheck, serial: serial };
  }

  // cfg = { dl, bud, diff, cmd, empower, seed, assign:{charId:taskKey|null}, checkpoints:{key:bool}, stage:{key:int} }
  function createSim(cfg) {
    var P = DIFF[cfg.diff] || DIFF.medium;
    var assign = cfg.assign || {}, cks = cfg.checkpoints || {}, stg = cfg.stage || {};
    var tasks = TASKS.map(function (t) {
      var base = t.real ? STEP_WORK * t.need : Infinity;
      return { key: t.key, real: t.real, need: t.need, spec: t.spec, risk: t.risk, x: t.x, deps: t.deps.slice(),
        stage: (t.real ? (stg[t.key] || 0) : 0), baseWork: t.real ? base : 0, work: base, done: 0, defects: 0,
        checkpoint: t.real && !!cks[t.key], inspected: false, coreCount: 0, state: 'building', stalled: false };
    });
    var sim0 = { tasks: tasks };
    var chars = ROSTER.map(function (c) { return { id: c.id, name: c.name, spec: c.spec, task: (assign[c.id] != null ? assign[c.id] : null), core: false, state: 'idle', x: 0.05, walkT: 0, waitStart: 0, leaderId: null }; });
    chars.forEach(function (ch) { if (ch.task == null) return; var t = taskByKey(sim0, ch.task); if (!t) { ch.task = null; return; } if (t.coreCount < t.need) { ch.core = true; t.coreCount++; } });
    var leaders = []; for (var j = 0; j < Math.max(1, cfg.cmd); j++) leaders.push({ id: 'L' + j, state: 'free', servingId: null, ticksLeft: 0 });

    // stages that actually have staffed real tasks, in order
    var stageSet = {};
    tasks.forEach(function (t) { if (t.real && t.stage > 0 && t.coreCount > 0) stageSet[t.stage] = true; });
    var stages = Object.keys(stageSet).map(Number).sort(function (a, b) { return a - b; });

    return {
      cfg: { dl: cfg.dl, bud: cfg.bud, diff: cfg.diff, cmd: cfg.cmd, assign: Object.assign({}, assign), checkpoints: Object.assign({}, cks), stage: Object.assign({}, stg) },
      P: { askMult: P.askMult, service: P.service, disobey: P.disobey, defectRate: P.defectRate, selfHelp: P.selfHelp, patience: P.patience },
      rng: mulberry32((cfg.seed >>> 0) || 1), empower: !!cfg.empower,
      tick: 0, day: 0, budget: cfg.bud,
      tasks: tasks, chars: chars, leaders: leaders, queue: [],
      stages: stages, stageIdx: 0, currentStage: stages.length ? stages[0] : 0,
      phase: 'build', finalFix: null, pendingInspections: [], pendingInspect: null, progress: 0,
      buildingNow: 0, waitingNow: 0, idleNow: 0, stalled: false,
      leaderBusyTicks: 0, leaderTotalTicks: 0, lostTicks: 0, workTickTotal: 0,
      queueMax: 0, disobeys: 0, defectsMade: 0, defectsCaught: 0, defectsEscaped: 0,
      inspectTicksSpent: 0, reworkWork: 0, finalFixWork: 0, decoyCharTicks: 0, mismatchCharTicks: 0, stallTicks: 0,
      events: [], lastEvent: null, bannerOn: false, bannerEverFired: false, blockStreak: 0, finished: null
    };
  }

  function eligible(sim, t) { return t.real && t.state === 'building' && t.stage > 0 && t.stage === sim.currentStage && depsDone(sim, t); }

  function tick(sim) {
    if (sim.finished) return sim;
    if (sim.phase === 'await-inspect') return sim;
    sim.tick++; sim.day += DT;
    var P = sim.P, rng = sim.rng, chars = sim.chars, i, ch, L, t;

    // --- normalise char states to the timeline: only eligible/decoy crew work ---
    if (sim.phase === 'build') {
      sim.stalled = false;
      for (i = 0; i < chars.length; i++) {
        ch = chars[i];
        if (ch.task == null) { ch.state = 'idle'; continue; }
        t = taskByKey(sim, ch.task);
        if (!t) { ch.task = null; ch.state = 'idle'; continue; }
        var canWork = (!t.real) ? true : (eligible(sim, t) && ch.core);
        if (canWork) { if (ch.state === 'standby' || ch.state === 'idle') { ch.state = 'working'; ch.x = t.x; } }
        else {
          if (ch.state === 'asking') { var lid = ch.leaderId; for (var li = 0; li < sim.leaders.length; li++) if (sim.leaders[li].id === lid) { sim.leaders[li].state = 'free'; sim.leaders[li].servingId = null; } ch.leaderId = null; }
          if (ch.state === 'waiting' || ch.state === 'walking') removeFromQueue(sim, ch.id);
          ch.state = 'standby';
        }
      }
      // a current-stage staffed real task whose deps aren't done is STALLED (everything stops)
      for (i = 0; i < sim.tasks.length; i++) { t = sim.tasks[i]; t.stalled = (t.real && t.state === 'building' && t.stage > 0 && t.stage === sim.currentStage && (!depsDone(sim, t) || t.coreCount === 0)); if (t.stalled) sim.stalled = true; }
      if (sim.stalled) sim.stallTicks++;
    }

    // PASS 1 — resolve service
    for (i = 0; i < sim.leaders.length; i++) {
      L = sim.leaders[i]; if (L.state !== 'busy') continue; L.ticksLeft--; if (L.ticksLeft > 0) continue;
      ch = byId(chars, L.servingId); if (!ch) { L.state = 'free'; L.servingId = null; continue; }
      if (rng() < P.disobey && ch.task !== 'finalfix') { ch.state = 'waiting'; ch.waitStart = sim.tick; sim.queue.unshift(ch.id); sim.disobeys++; logEv(sim, 'disobey', ch.id); }
      else ch.state = 'working';
      ch.leaderId = null; L.state = 'free'; L.servingId = null;
    }
    // PASS 2 — arrivals (eligible/decoy working only)
    for (i = 0; i < chars.length; i++) { ch = chars[i]; if (ch.state !== 'working' || !ch.core) continue; t = taskByKey(sim, ch.task); if (!t || t.key === 'finalfix') continue; var askF = (!t.real) ? 1.3 : (matches(ch, t) ? 1 : MISMATCH_ASK); if (rng() < PASK * P.askMult * askF) { ch.state = 'walking'; ch.walkT = 1; } }
    // PASS 3 — walk to queue
    for (i = 0; i < chars.length; i++) { ch = chars[i]; if (ch.state === 'walking') { ch.walkT--; if (ch.walkT <= 0) { ch.state = 'waiting'; ch.waitStart = sim.tick; sim.queue.push(ch.id); } } }
    // PASS 4 — empower self-resolve
    if (sim.empower) { for (i = 0; i < chars.length; i++) { ch = chars[i]; if (ch.state === 'waiting' && (sim.tick - ch.waitStart) >= P.patience && rng() < P.selfHelp) { removeFromQueue(sim, ch.id); ch.state = 'working'; logEv(sim, 'selfhelp', ch.id); } } }
    // PASS 5 — leaders pull queue
    for (i = 0; i < sim.leaders.length; i++) { L = sim.leaders[i]; if (L.state === 'free' && sim.queue.length > 0) { var id = sim.queue.shift(); ch = byId(chars, id); ch.state = 'asking'; ch.leaderId = L.id; L.state = 'busy'; L.servingId = id; L.ticksLeft = P.service; } }

    // PASS 6 — BUILD eligible tasks + finalfix
    for (var ti = 0; ti < sim.tasks.length; ti++) sim.tasks[ti]._eff = 0;
    for (i = 0; i < chars.length; i++) {
      ch = chars[i]; if (ch.state !== 'working' || !ch.core) continue; t = taskByKey(sim, ch.task); if (!t) continue;
      var build = (t.key === 'finalfix') || eligible(sim, t) || !t.real;
      if (!build) continue;
      if (t.real) { t._eff += matches(ch, t) ? 1 : MISMATCH_PACE; if (!matches(ch, t) && t.key !== 'finalfix') sim.mismatchCharTicks++; }
      else sim.decoyCharTicks++;
      if (t.real && !t.inspected && t.key !== 'finalfix') { var dr = P.defectRate * t.risk * (matches(ch, t) ? 1 : MISMATCH_DEFECT); if (rng() < dr) { t.defects++; sim.defectsMade++; } }
    }
    for (var tj = 0; tj < sim.tasks.length; tj++) {
      t = sim.tasks[tj]; if (!t.real || t.state !== 'building') continue;
      if (t.key !== 'finalfix' && !eligible(sim, t)) continue;
      var eff = Math.min(t._eff, t.need); if (eff <= 0) continue;
      t.done = Math.min(t.work, t.done + eff * BUILD_SCALE * (0.9 + 0.2 * rng()));
      if (t.done >= t.work - 1e-6) {
        if (t.key === 'finalfix') { t.state = 'done'; }
        else if (t.checkpoint && !t.inspected) { t.state = 'awaiting'; sim.pendingInspections.push(t.key); }
        else { if (t.defects > 0) { sim.defectsEscaped += t.defects; logEv(sim, 'escape', t.defects); } t.state = 'done'; freeChars(sim, t); }
      }
    }

    // advance the stage when its staffed real tasks are all done
    if (sim.phase === 'build' && sim.stages.length) {
      var allDone = true;
      for (i = 0; i < sim.tasks.length; i++) { t = sim.tasks[i]; if (t.real && t.stage === sim.currentStage && t.state !== 'done') { allDone = false; break; } }
      if (allDone) { sim.stageIdx++; if (sim.stageIdx < sim.stages.length) sim.currentStage = sim.stages[sim.stageIdx]; else sim.currentStage = 0; }
    }

    // budget + metrics
    sim.budget -= totalWages(sim) * DT;
    var building = 0, waiting = 0, idle = 0;
    for (i = 0; i < chars.length; i++) { ch = chars[i]; if (ch.state === 'working') { var tt = taskByKey(sim, ch.task); if (tt && tt.real && matches(ch, tt)) building++; } if (ch.state === 'walking' || ch.state === 'waiting' || ch.state === 'asking') waiting++; else if (ch.state === 'idle' || ch.state === 'standby') idle++; }
    sim.buildingNow = building; sim.waitingNow = waiting; sim.idleNow = idle;
    sim.workTickTotal += chars.length; sim.lostTicks += (chars.length - building);
    sim.leaderTotalTicks += sim.leaders.length; for (i = 0; i < sim.leaders.length; i++) if (sim.leaders[i].state === 'busy') sim.leaderBusyTicks++;
    if (sim.queue.length > sim.queueMax) sim.queueMax = sim.queue.length;

    var thresh = Math.max(2, Math.ceil(chars.length / 3));
    if (sim.queue.length >= thresh) sim.blockStreak++; else sim.blockStreak = 0;
    if ((sim.blockStreak >= 2 || sim.stalled) && !sim.bannerOn) { sim.bannerOn = true; sim.bannerEverFired = true; }
    if (sim.queue.length < thresh && !sim.stalled && sim.bannerOn) sim.bannerOn = false;

    if (sim.pendingInspections.length && sim.phase === 'build') { sim.phase = 'await-inspect'; sim.pendingInspect = { key: sim.pendingInspections[0], defects: taskByKey(sim, sim.pendingInspections[0]).defects }; logEv(sim, 'inspect', sim.pendingInspections[0]); }

    updateProgress(sim); checkGoal(sim);
    if (!sim.finished && sim.phase !== 'done') { if (sim.budget <= 0) { sim.budget = 0; sim.finished = 'broke'; } else if (sim.day >= sim.cfg.dl) sim.finished = 'late'; }
    return sim;
  }

  function approveInspection(sim) {
    if (sim.phase !== 'await-inspect' || !sim.pendingInspect) return sim;
    var t = taskByKey(sim, sim.pendingInspect.key);
    sim.day += INSPECT_TICKS * DT; sim.budget -= totalWages(sim) * DT * INSPECT_TICKS; sim.inspectTicksSpent += INSPECT_TICKS;
    t.inspected = true;
    if (t.defects > 0) { var extra = t.defects * REWORK_UNIT; t.work += extra; sim.reworkWork += extra; sim.defectsCaught += t.defects; logEv(sim, 'caught', t.defects); t.defects = 0; t.state = 'building'; }
    else { logEv(sim, 'clean', t.key); t.state = 'done'; freeChars(sim, t); }
    sim.pendingInspections.shift();
    if (sim.pendingInspections.length) sim.pendingInspect = { key: sim.pendingInspections[0], defects: taskByKey(sim, sim.pendingInspections[0]).defects };
    else { sim.pendingInspect = null; sim.phase = (sim.finalFix ? 'finalfix' : 'build'); }
    // re-evaluate stage advance after a task may have completed
    if (sim.phase === 'build' && sim.stages.length) {
      var allDone = true; for (var i = 0; i < sim.tasks.length; i++) { var tt = sim.tasks[i]; if (tt.real && tt.stage === sim.currentStage && tt.state !== 'done') { allDone = false; break; } }
      if (allDone) { sim.stageIdx++; sim.currentStage = (sim.stageIdx < sim.stages.length) ? sim.stages[sim.stageIdx] : 0; }
    }
    updateProgress(sim); checkGoal(sim);
    if (!sim.finished && sim.phase !== 'done') { if (sim.budget <= 0) { sim.budget = 0; sim.finished = 'broke'; } else if (sim.day >= sim.cfg.dl) sim.finished = 'late'; }
    return sim;
  }

  function freeChars(sim, t) { sim.chars.forEach(function (ch) { if (ch.task === t.key) { ch.task = null; ch.core = false; ch.state = 'idle'; ch.x = 0.05; ch.leaderId = null; } }); }
  function updateProgress(sim) { var base = 0, done = 0; for (var i = 0; i < sim.tasks.length; i++) { var t = sim.tasks[i]; if (!t.real) continue; base += t.baseWork; done += (t.state === 'done') ? t.baseWork : Math.min(t.done, t.baseWork); } sim.progress = base > 0 ? done / base : 0; }
  function checkGoal(sim) {
    if (sim.finished || sim.phase === 'await-inspect') return;
    var allDone = true; for (var i = 0; i < sim.tasks.length; i++) { var t = sim.tasks[i]; if (t.real && t.state !== 'done') { allDone = false; break; } }
    if (!allDone) return;
    if (sim.phase === 'finalfix') { if (sim.finalFix.done >= sim.finalFix.work - 1e-6) { sim.phase = 'done'; sim.finished = 'done'; } return; }
    if (sim.defectsEscaped > 0 && !sim.finalFix) {
      var w = sim.defectsEscaped * ESCAPE_UNIT; sim.finalFixWork = w;
      sim.finalFix = { key: 'finalfix', real: true, need: sim.chars.length, spec: '*', x: 0.94, deps: [], stage: (sim.stages.length ? sim.stages[sim.stages.length - 1] + 1 : 1), baseWork: w, work: w, done: 0, defects: 0, checkpoint: false, inspected: true, coreCount: sim.chars.length, state: 'building', stalled: false };
      sim.tasks.push(sim.finalFix);
      for (var c = 0; c < sim.chars.length; c++) { var ch = sim.chars[c]; ch.task = 'finalfix'; ch.core = true; ch.state = 'working'; ch.x = 0.94; }
      sim.phase = 'finalfix'; logEv(sim, 'finalfix', sim.defectsEscaped);
    } else if (!sim.finalFix) { sim.phase = 'done'; sim.finished = 'done'; }
  }

  function setEmpower(sim, on) { if (sim.empower === !!on) return; sim.empower = !!on; logEv(sim, on ? 'empowerOn' : 'empowerOff'); }
  function delegate(sim) { if (sim.leaders.length >= 2) return false; sim.leaders.push({ id: 'L' + sim.leaders.length, state: 'free', servingId: null, ticksLeft: 0 }); sim.cfg.cmd = sim.leaders.length; logEv(sim, 'delegate'); return true; }
  function triggerCrisis(sim, kind) { var pool = []; for (var i = 0; i < sim.chars.length; i++) if (sim.chars[i].state === 'working') pool.push(sim.chars[i]); var n = Math.max(1, Math.ceil(pool.length / 2)); for (var j = 0; j < n && j < pool.length; j++) { var ch = pool[j]; ch.state = 'waiting'; ch.waitStart = sim.tick; sim.queue.push(ch.id); } logEv(sim, 'crisis', kind); return n; }

  // Finishing by this fraction of the deadline earns the full SPEED bonus; the reward ramps up
  // from the deadline down to here, so parallelising the critical path visibly pays off.
  var SCORE_PAR = 0.88;

  function score(sim) {
    var cfg = sim.cfg, compPct = Math.round(sim.progress * 100);
    var onTime = (sim.finished === 'done' && sim.day <= cfg.dl), budLeft = Math.max(0, sim.budget);
    // "Crew put to good use": productive person-ticks vs the AVOIDABLE waste (decoys, mis-matches,
    // stalls). Crew legitimately on standby for a later stage are NOT counted as waste — so a clean
    // sequential plan reads ~100%, while busywork / wrong-job / stalls drag it down.
    var productive = Math.max(0, sim.workTickTotal - sim.lostTicks);
    var waste = sim.decoyCharTicks + sim.mismatchCharTicks + sim.stallTicks;
    var effPct = (productive + waste) > 0 ? Math.round(productive / (productive + waste) * 100) : 100;
    var leaderBusyPct = sim.leaderTotalTicks ? Math.round(sim.leaderBusyTicks / sim.leaderTotalTicks * 100) : 0;
    var aud = auditPlan(cfg);

    // six scored dimensions (see rGrade in i18n) — totalling 100
    var comp = Math.min(33, compPct * 0.33);                                    // Completion: build the road
    var onTimePts = onTime ? 20 : (sim.finished === 'late' ? 3 : 0);            // On-time: beat the deadline
    var frac = cfg.dl > 0 ? sim.day / cfg.dl : 1;
    var speedFrac = onTime ? Math.max(0, Math.min(1, (1 - frac) / (1 - SCORE_PAR))) : 0;
    var speed = Math.min(15, speedFrac * 15);                                   // Speed: the earlier, the better (parallelise!)
    var flow = Math.max(0, Math.min(13, effPct * 0.13) - Math.min(9, aud.idleCrew * 4) - (aud.serial ? 5 : 0)); // Flow: no dead weight
    var bud = Math.min(9, budLeft / cfg.bud * 18);                             // Budget: spend wisely
    var def = Math.max(0, (10 - Math.min(10, sim.defectsEscaped * 2.5)) - Math.min(4, aud.overCheck * 2)); // Quality: catch defects cheaply, don't over-inspect
    var s = comp + onTimePts + speed + flow + bud + def;

    // An A demands a CLEAN plan: nothing wasted, nothing escaped, nothing stalled, nothing over-inspected.
    // Any single management slip caps the run at B, so each mistake is visible exactly one band down.
    var clean = sim.finished === 'done' && onTime && aud.unstaffed === 0 && aud.decoyN === 0 &&
      aud.mismN === 0 && aud.idleCrew === 0 && !aud.serial && sim.defectsEscaped === 0 &&
      sim.stallTicks === 0 && aud.overCheck === 0;
    var grade = (s >= 85 && clean) ? 'A' : (s >= 70 ? 'B' : (s >= 55 ? 'C' : 'D'));
    if (!clean && s > 84) s = 84;

    var pillars = { completion: Math.round(comp), onTimePts: Math.round(onTimePts), speed: Math.round(speed),
      flow: Math.round(flow), budget: Math.round(bud), quality: Math.round(def) };

    return { score: Math.round(s), grade: grade, clean: clean, reason: sim.finished, compPct: compPct, onTime: onTime, budLeft: Math.round(budLeft), day: Math.round(sim.day * 10) / 10,
      workPct: effPct, leaderBusyPct: leaderBusyPct, queueMax: sim.queueMax, disobeys: sim.disobeys,
      defectsMade: sim.defectsMade, defectsCaught: sim.defectsCaught, defectsEscaped: sim.defectsEscaped,
      inspectTicksSpent: sim.inspectTicksSpent, reworkWork: Math.round(sim.reworkWork), finalFixWork: Math.round(sim.finalFixWork),
      decoyCharTicks: sim.decoyCharTicks, mismatchCharTicks: sim.mismatchCharTicks, stallTicks: sim.stallTicks, bannerEverFired: sim.bannerEverFired,
      idleCrew: aud.idleCrew, unstaffed: aud.unstaffed, decoyN: aud.decoyN, mismN: aud.mismN, overCheck: aud.overCheck, serial: aud.serial, pillars: pillars };
  }

  var api = {
    DT: DT, TASKS: TASKS, ROSTER: ROSTER, ROLES: ROLES, TOTAL_NEED: TOTAL_NEED, DIFF: DIFF, DEFAULT_STAGE: DEFAULT_STAGE, STAGE_COUNT: STAGE_COUNT,
    STEP_WORK: STEP_WORK, BUILD_SCALE: BUILD_SCALE, PASK: PASK, WAGE: WAGE, CMD_WAGE: CMD_WAGE,
    INSPECT_TICKS: INSPECT_TICKS, REWORK_UNIT: REWORK_UNIT, ESCAPE_UNIT: ESCAPE_UNIT,
    mulberry32: mulberry32, createSim: createSim, tick: tick, approveInspection: approveInspection, depsDone: depsDone, eligible: eligible,
    setEmpower: setEmpower, delegate: delegate, triggerCrisis: triggerCrisis, totalWages: totalWages, score: score, auditPlan: auditPlan
  };
  global.M2M = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
