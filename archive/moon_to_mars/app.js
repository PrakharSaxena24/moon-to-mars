/* ============================================================================
 * app.js — wires the simulation (engine.js) + strings (i18n.js) to the DOM.
 * SETUP (briefing + task list + assign who-does-what) -> RUN -> REPORT.
 * ==========================================================================*/
(function () {
  'use strict';
  var M = window.M2M, STR = window.STR;
  var $ = function (id) { return document.getElementById(id); };
  var nf = function (n) { return Math.round(n).toLocaleString(); };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };
  var cap = function (s) { return s.charAt(0).toUpperCase() + s.slice(1); };

  var TASK_ICON = { survey: '🛰️', haul: '🚚', base: '🏗️', pave: '🛣️', commission: '🔧', rocks: '🪨', photo: '📸', depot: '📦' };
  var SPEC_COLOR = { scout: '#5b8def', hauler: '#36c29a', builder: '#f2a93b', engineer: '#9b8cff' };
  var SPEC_ROLE = { scout: 'roleScout', hauler: 'roleHauler', builder: 'roleBuilder', engineer: 'roleEngineer' };
  var NMK = {}, DSK = {};
  M.TASKS.forEach(function (t) { NMK[t.key] = 'n' + cap(t.key); DSK[t.key] = 'd' + cap(t.key); });

  var L = 'en';
  function autoPlan() { var a = {}, c = {}; M.ROSTER.forEach(function (ch) { var tk = null; M.TASKS.forEach(function (t) { if (t.real && t.spec === ch.spec) { c[t.key] = c[t.key] || 0; if (c[t.key] < t.need && !tk) { tk = t.key; c[t.key]++; } } }); a[ch.id] = tk; }); return a; }
  function autoChecks() { var ck = {}; M.TASKS.forEach(function (t) { if (t.real && t.risk >= 1.0) ck[t.key] = true; }); return ck; }
  function autoStage() { return Object.assign({}, M.DEFAULT_STAGE); }
  var cfg = { dl: 15, bud: 150000, diff: 'medium', cmd: 1, empower: false, assign: autoPlan(), checkpoints: autoChecks(), stage: autoStage() };

  var sim = null, timer = null, paused = false, BASE_TICK = 950, speedMult = 1;
  function tickMs() { return Math.round(BASE_TICK / speedMult); }
  var figEls = {}, beamsLayer = null, finalFixEl = null, inspectState = null, lastResult = null, detailOpen = null;

  function T() { return STR[L]; }
  function taskByKey(k) { for (var i = 0; i < M.TASKS.length; i++) if (M.TASKS[i].key === k) return M.TASKS[i]; return null; }
  function taskName(k) { return T()[NMK[k]] || k; }
  function roleName(spec) { return T()[SPEC_ROLE[spec]] || spec; }
  function riskLabel(r) { return r >= 1.3 ? T().riskHigh : (r >= 0.8 ? T().riskMed : T().riskLow); }
  function riskClass(r) { return r >= 1.3 ? 'r-high' : (r >= 0.8 ? 'r-med' : 'r-low'); }
  function roleFits(role) { return M.TASKS.filter(function (t) { return t.real && t.spec === role; }).map(function (t) { return taskName(t.key); }); }

  // =========================================================================
  // i18n
  // =========================================================================
  function applyLang() {
    document.documentElement.lang = L;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var v = T()[el.getAttribute('data-i18n')]; if (typeof v === 'string') el.textContent = v; });
    $('lang-en').classList.toggle('on', L === 'en'); $('lang-ja').classList.toggle('on', L === 'ja');
    paintSetup(); buildRules(); buildLegend();
    if (!$('run').classList.contains('hidden')) { $('lbl-moon').textContent = T().moon; $('lbl-mars').textContent = T().mars; $('control-lbl').textContent = T().control; buildWorksites(); updateRunButtons(); if (sim) render(sim); }
    if (!$('report').classList.contains('hidden') && lastResult) renderReport(lastResult);
  }

  // =========================================================================
  // SETUP
  // =========================================================================
  function buildTaskList() {
    var box = $('task-list'); box.innerHTML = '';
    M.TASKS.forEach(function (t) {
      var c = document.createElement('div'); c.className = 'taskcard'; c.id = 'tc-' + t.key;
      var depNames = (t.deps && t.deps.length) ? t.deps.map(taskName).join(', ') : T().depsNone;
      var stageSel = '';
      if (t.real) {
        var opts = '<option value="0">' + T().stageNone + '</option>';
        for (var s = 1; s <= M.STAGE_COUNT; s++) opts += '<option value="' + s + '">' + T().stageLbl + ' ' + s + '</option>';
        stageSel = '<select class="stage-sel" data-stage="' + t.key + '">' + opts + '</select>';
      }
      c.innerHTML =
        '<div class="tc-top"><span class="tc-ic">' + TASK_ICON[t.key] + '</span>' +
          '<span class="tc-nm">' + taskName(t.key) + '</span>' +
          '<span class="riskbadge ' + riskClass(t.risk) + '">' + riskLabel(t.risk) + '</span></div>' +
        '<div class="tc-ds">' + T()[DSK[t.key]] + '</div>' +
        (t.real ? '<div class="tc-dep">' + T().depsLbl + ': ' + depNames + '</div>' : '') +
        '<div class="tc-meta"><span class="muted2">' + T().needLbl + ' <b>' + t.need + '</b> · ' + roleName(t.spec) + '</span></div>' +
        (t.real ? '<div class="tc-ctrl">' + stageSel + '<button class="ck-toggle" data-ck="' + t.key + '">🔍 ' + T().checkpointLbl + '</button></div>' : '') +
        '<div class="tc-crew" id="tcrew-' + t.key + '"></div>';
      box.appendChild(c);
      if (t.real) c.querySelector('.stage-sel').value = String(cfg.stage[t.key] || 0);
    });
  }

  function buildTimeline() {
    var box = $('timeline'); if (!box) return;
    var maxStage = 4; M.TASKS.forEach(function (t) { if (t.real && cfg.stage[t.key] > maxStage) maxStage = cfg.stage[t.key]; });
    var stageOf = {}; M.TASKS.forEach(function (t) { if (t.real) stageOf[t.key] = cfg.stage[t.key] || 0; });
    var html = '';
    for (var s = 1; s <= maxStage; s++) {
      var chips = '';
      M.TASKS.forEach(function (t) {
        if (!t.real || stageOf[t.key] !== s) return;
        var bad = t.deps.some(function (d) { return !stageOf[d] || stageOf[d] >= s; });
        chips += '<span class="tl-chip' + (bad ? ' bad' : '') + '">' + TASK_ICON[t.key] + ' ' + taskName(t.key) + '</span>';
      });
      html += '<div class="tl-stage"><div class="tl-h">' + T().stageLbl + ' ' + s + '</div>' + (chips || '<span class="tl-empty">·</span>') + '</div>';
    }
    var un = M.TASKS.filter(function (t) { return t.real && !stageOf[t.key]; });
    if (un.length) html += '<div class="tl-stage tl-un"><div class="tl-h">' + T().stageNone + '</div>' + un.map(function (t) { return '<span class="tl-chip bad">' + TASK_ICON[t.key] + ' ' + taskName(t.key) + '</span>'; }).join('') + '</div>';
    box.innerHTML = html;
  }

  // Roster grouped by ROLE — defines each role (and what it fits) + the people in it.
  function buildRoster() {
    var box = $('roster'); box.innerHTML = '';
    var taskOpts = '<option value="">' + T().idleOpt + '</option>';
    M.TASKS.forEach(function (t) { taskOpts += '<option value="' + t.key + '">' + TASK_ICON[t.key] + ' ' + taskName(t.key) + '</option>'; });
    M.ROLES.forEach(function (role) {
      var people = M.ROSTER.filter(function (c) { return c.spec === role; });
      if (!people.length) return;
      var g = document.createElement('div'); g.className = 'rolegroup';
      g.innerHTML = '<div class="role-h"><span class="role-dot" style="background:' + SPEC_COLOR[role] + '"></span>' +
        '<b>' + roleName(role) + '</b><span class="role-fits">' + T().roleFits + ' ' + roleFits(role).join(', ') + '</span></div>';
      people.forEach(function (ch) {
        var row = document.createElement('div'); row.className = 'crewrow'; row.id = 'cr-' + ch.id;
        row.innerHTML =
          '<span class="avatar" style="background:' + SPEC_COLOR[ch.spec] + '">' + ch.name.charAt(0) + '</span>' +
          '<span class="cr-id"><b>' + ch.name + '</b></span>' +
          '<select class="cr-sel" data-char="' + ch.id + '">' + taskOpts + '</select>';
        g.appendChild(row);
        row.querySelector('select').value = cfg.assign[ch.id] || '';
      });
      box.appendChild(g);
    });
  }

  function paintSetup() {
    document.querySelectorAll('#diff-seg button').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-diff') === cfg.diff); });
    $('diff-desc').textContent = T()[{ easy: 'diffEasyD', medium: 'diffMediumD', hard: 'diffHardD' }[cfg.diff]];
    $('o-dl').textContent = cfg.dl; $('o-bud').textContent = nf(cfg.bud); $('o-cmd').textContent = cfg.cmd;
    var b = $('empower-toggle'); b.textContent = cfg.empower ? T().empowerOnBtn : T().empowerOffBtn; b.classList.toggle('on', cfg.empower);
    buildTaskList(); buildRoster(); updatePlanUI();
  }

  function updatePlanUI() {
    var assignedByTask = {}; M.TASKS.forEach(function (t) { assignedByTask[t.key] = []; });
    var idle = [];
    M.ROSTER.forEach(function (ch) { var k = cfg.assign[ch.id]; if (k && assignedByTask[k]) assignedByTask[k].push(ch); else idle.push(ch); });

    var unstaffed = [], decoy = [], mism = [], noCheck = [];
    M.TASKS.forEach(function (t) {
      var crew = assignedByTask[t.key];
      // crew avatars on the task card
      var holder = $('tcrew-' + t.key);
      if (holder) holder.innerHTML = crew.length ? crew.map(function (ch) {
        var bad = ch.spec !== t.spec;
        return '<span class="mini" title="' + ch.name + '" style="background:' + SPEC_COLOR[ch.spec] + (bad ? ';outline:2px solid var(--wait)' : '') + '">' + ch.name.charAt(0) + '</span>';
      }).join('') : '<span class="muted2">' + T().noOneLbl + '</span>';
      var card = $('tc-' + t.key);
      if (card) { card.classList.toggle('k-bad', t.real && crew.length === 0); card.classList.toggle('k-decoy', !t.real && crew.length > 0); }
      var ck = card && card.querySelector('.ck-toggle'); if (ck) ck.classList.toggle('on', !!cfg.checkpoints[t.key]);
      if (t.real && crew.length === 0) unstaffed.push(taskName(t.key));
      if (!t.real && crew.length > 0) decoy.push(taskName(t.key));
      if (t.real && crew.some(function (ch) { return ch.spec !== t.spec; })) mism.push(taskName(t.key));
      if (t.real && t.risk >= 1.0 && !cfg.checkpoints[t.key]) noCheck.push(taskName(t.key));
    });

    $('p-wage').textContent = nf(cfg.cmd * M.CMD_WAGE + M.ROSTER.length * M.WAGE);
    $('o-cmd').textContent = cfg.cmd;
    M.ROSTER.forEach(function (ch) { var s = document.querySelector('.cr-sel[data-char="' + ch.id + '"]'); if (s) s.value = cfg.assign[ch.id] || ''; });
    M.TASKS.forEach(function (t) { if (t.real) { var s = document.querySelector('.stage-sel[data-stage="' + t.key + '"]'); if (s) s.value = String(cfg.stage[t.key] || 0); } });

    // ---- timeline validation ----
    var stageOf = function (k) { return cfg.stage[k] || 0; };
    var tlUnsched = [], tlViol = null, usedStages = {}, staffedScheduled = 0;
    M.TASKS.forEach(function (t) {
      if (!t.real || assignedByTask[t.key].length === 0) return;
      if (stageOf(t.key) === 0) { tlUnsched.push(taskName(t.key)); return; }
      usedStages[stageOf(t.key)] = (usedStages[stageOf(t.key)] || 0) + 1; staffedScheduled++;
      t.deps.forEach(function (d) { if (!tlViol && (stageOf(d) === 0 || stageOf(d) >= stageOf(t.key))) tlViol = [taskName(t.key), taskName(d)]; });
    });
    var distinct = Object.keys(usedStages).length;
    var tlSlow = staffedScheduled >= 2 && distinct === staffedScheduled; // nothing runs in parallel

    // positive pre-launch readiness checklist (all green = ready for an A-grade run)
    var pr = $('plan-ready');
    if (pr) {
      var t = T();
      var ready = [
        [!tlViol && tlUnsched.length === 0 && !tlSlow, t.readyPlan],
        [unstaffed.length === 0 && idle.length === 0, t.readyCover],
        [mism.length === 0 && decoy.length === 0, t.readyAssign],
        [noCheck.length === 0, t.readyCheck]
      ];
      pr.innerHTML = '<span class="pr-lbl">' + t.readyTitle + '</span>' + ready.map(function (r) {
        return '<span class="pr-item ' + (r[0] ? 'ok' : 'bad') + '">' + (r[0] ? '✓' : '•') + ' ' + r[1] + '</span>';
      }).join('');
    }

    buildTimeline();
    var h = $('plan-hint');
    if (unstaffed.length) h.textContent = T().hintUnstaffed(unstaffed.join('、'));
    else if (tlUnsched.length) h.textContent = T().hintTLunscheduled(tlUnsched.join('、'));
    else if (tlViol) h.textContent = T().hintTLviolation(tlViol[0], tlViol[1]);
    else if (decoy.length) h.textContent = T().hintDecoy(decoy.join('、'));
    else if (mism.length) h.textContent = T().hintMismatch(mism.join('、'));
    else if (idle.length) h.textContent = T().hintIdle(idle.map(function (ch) { return ch.name; }).join('、'));
    else if (noCheck.length && cfg.diff !== 'easy') h.textContent = T().hintNoCheck(noCheck.join('、'));
    else if (tlSlow) h.textContent = T().hintTLslow;
    else h.textContent = T().hintGood;
  }

  function adjMission(k, d) {
    if (k === 'dl') cfg.dl = clamp(cfg.dl + d, 8, 30);
    else if (k === 'bud') cfg.bud = clamp(cfg.bud + d, 30000, 300000);
    else if (k === 'cmd') cfg.cmd = clamp(cfg.cmd + d, 1, 2);
    paintSetup();
  }

  // =========================================================================
  // RUN
  // =========================================================================
  function taskY(t) { return t.real ? 0.62 : 0.86; }     // real on the route, decoys on a "busywork" row
  // Map a task's 0..1 position onto the ROUTE span (inset left:74px / right:78px in CSS) so every
  // worksite sits ON the route and the rightmost one (Commission, x=0.88) stays on-screen at any width.
  function wsLeftCss(x) { return 'calc(var(--route-l) + ' + x + ' * (100% - var(--route-l) - var(--route-r)))'; }
  function buildWorksites() {
    var box = $('worksites'); box.innerHTML = '';
    M.TASKS.forEach(function (t) {
      var d = document.createElement('div'); d.className = 'ws' + (t.real ? '' : ' decoy') + ' pending'; d.id = 'ws-' + t.key;
      d.style.left = wsLeftCss(t.x); d.style.top = (taskY(t) * 100) + '%';
      d.innerHTML = '<div class="wgate">🔍</div><div class="wdef"></div><div class="wic">' + TASK_ICON[t.key] + '</div>' +
        '<div class="pad"></div><div class="wbar"><i></i></div><div class="wnm">' + taskName(t.key) + '</div><div class="wstate"></div>';
      box.appendChild(d);
    });
  }
  function buildStars() { var s = '', seed = 7; for (var i = 0; i < 50; i++) { seed = (seed * 9301 + 49297) % 233280; var r = seed / 233280; s += '<div class="star" style="left:' + ((i * 37) % 100) + '%;top:' + ((i * 53 + r * 17) % 60) + '%;animation-delay:' + (r * 3).toFixed(2) + 's"></div>'; } $('stars').innerHTML = s; }
  function buildPod() { var pod = $('pod'); pod.innerHTML = ''; for (var i = 0; i < sim.leaders.length; i++) { var c = document.createElement('div'); c.className = 'cmd'; pod.appendChild(c); } }

  function launch() {
    sim = M.createSim({ dl: cfg.dl, bud: cfg.bud, diff: cfg.diff, cmd: cfg.cmd, empower: cfg.empower,
      assign: Object.assign({}, cfg.assign), checkpoints: Object.assign({}, cfg.checkpoints), stage: Object.assign({}, cfg.stage),
      seed: (Math.floor(Math.random() * 1e9) >>> 0) || 1 });
    paused = false; document.body.classList.add('running');
    $('detail-modal').classList.remove('show'); detailOpen = null;
    speedMult = 1; document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-spd') === '1'); });
    $('setup').classList.add('hidden'); $('report').classList.add('hidden'); $('run').classList.remove('hidden');
    $('scene').classList.remove('fail', 'win', 'blocked'); $('rocket').classList.remove('go');
    figEls = {}; $('figs').innerHTML = ''; if (beamsLayer) beamsLayer.innerHTML = '';
    $('banner').textContent = ''; $('banner').classList.remove('show');
    $('inspect-modal').classList.remove('show'); inspectState = null;
    if (finalFixEl) { finalFixEl.textContent = ''; finalFixEl.classList.remove('show'); }
    $('lbl-moon').textContent = T().moon; $('lbl-mars').textContent = T().mars; $('control-lbl').textContent = T().control;
    buildStars(); buildWorksites(); buildPod(); updateRunButtons(); render(sim);
    timer = setInterval(step, tickMs());
  }
  function restartTimer() { if (timer) { clearInterval(timer); timer = setInterval(step, tickMs()); } }
  function step() {
    if (paused || !sim) return;
    if (sim.phase === 'await-inspect') return;
    M.tick(sim); render(sim);
    if (sim.phase === 'await-inspect') { openChecklist(); return; }
    if (sim.finished) finish();
  }

  function layout(s) {
    var pos = {}, byTask = {};
    s.tasks.forEach(function (t) { byTask[t.key] = []; });
    var idle = [], asking = [];
    s.chars.forEach(function (ch) {
      if (ch.state === 'working' || ch.state === 'redundant') { if (ch.task && byTask[ch.task]) byTask[ch.task].push(ch); else idle.push(ch); }
      else if (ch.state === 'asking') asking.push(ch);
      else if (ch.state === 'idle') idle.push(ch);
    });
    s.tasks.forEach(function (t) {
      var arr = byTask[t.key], y = (t.key === 'finalfix') ? 0.55 : taskY(t);
      arr.forEach(function (ch, i) { var o = i - (arr.length - 1) / 2; pos[ch.id] = { leftCss: 'calc(' + wsLeftCss(t.x) + ' + ' + (o * 18) + 'px)', top: (ch.state === 'redundant' ? y + 0.13 : y - 0.08) * 100 }; });
    });
    idle.forEach(function (ch, i) { pos[ch.id] = { left: 8 + (i % 3) * 2.8, top: 38 + Math.floor(i / 3) * 8 }; });
    asking.forEach(function (ch, i) { var o = i - (asking.length - 1) / 2; pos[ch.id] = { left: 50 + o * 5, top: 24 }; });
    s.queue.forEach(function (id, i) { var per = 12, o = i - (Math.min(s.queue.length, per) - 1) / 2; pos[id] = { left: 50 + o * 3.4, top: 31 + Math.floor(i / per) * 6 }; });
    s.chars.forEach(function (ch) { if (ch.state === 'walking') pos[ch.id] = { left: 50, top: 44 }; });
    return pos;
  }

  var BUB = { walking: '❓', waiting: '❓', asking: '💬', idle: '💤' };
  function render(s) {
    var pos = layout(s);
    s.chars.forEach(function (ch) {
      var el = figEls[ch.id];
      if (!el) { el = document.createElement('div'); el.className = 'astro'; el.innerHTML = '<div class="hat"></div><div class="bdy"></div><div class="nm"></div><div class="bub"></div>'; $('figs').appendChild(el); figEls[ch.id] = el; el._hat = el.querySelector('.hat'); el._bub = el.querySelector('.bub'); el.querySelector('.nm').textContent = ch.name; el._hat.style.borderColor = SPEC_COLOR[ch.spec]; }
      var p = pos[ch.id] || { left: 8, top: 40 };
      el.style.left = p.leftCss ? p.leftCss : (p.left + '%'); el.style.top = p.top + '%';
      var t = ch.task ? taskByKey(ch.task) : null;
      var mism = ch.state === 'working' && t && t.real && t.spec !== ch.spec;
      var onDecoy = ch.state === 'working' && t && !t.real;
      el.className = 'astro s-' + ch.state + (mism ? ' mismatch' : '') + (onDecoy ? ' decoywork' : '');
      el._bub.textContent = BUB[ch.state] || (mism ? '⚠' : (onDecoy ? '💤' : ''));
    });
    drawBeams(s);

    s.tasks.forEach(function (t) {
      var d = $('ws-' + t.key); if (!d) return;
      if (t.real) d.querySelector('.wbar i').style.width = (t.work > 0 && t.work !== Infinity ? Math.min(100, t.done / t.work * 100) : 0) + '%';
      var cls = 'pending';
      if (t.state === 'done') cls = 'done';
      else if (t.state === 'awaiting') cls = 'inspecting';
      else if (t.stalled) cls = 'stalled';
      else if (t.coreCount > 0 && (!t.real || M.eligible(s, t))) cls = 'active';
      d.className = 'ws' + (t.real ? '' : ' decoy') + ' ' + cls;
      if (t.checkpoint) d.classList.add('has-gate');
      var def = d.querySelector('.wdef'); if (t.defects > 0 && t.state !== 'done') { def.textContent = t.defects; def.classList.add('show'); } else def.classList.remove('show');
      d.querySelector('.wstate').textContent = (t.state === 'awaiting') ? T().stInspecting : (t.stalled ? '⛔' : '');
    });
    // stage indicator
    var nt = $('nowtag');
    if (s.phase === 'finalfix') nt.textContent = T().stFinalFix;
    else if (!s.stages.length || s.currentStage === 0) nt.textContent = T().stageDone;
    else { var nm = s.tasks.filter(function (t) { return t.real && t.stage === s.currentStage; }).map(function (t) { return taskName(t.key); }).join(' + '); nt.textContent = T().stageNow(s.stageIdx + 1, s.stages.length, nm); }
    if (detailOpen) renderDetail();

    var rcs = getComputedStyle(document.documentElement);
    var rl = parseFloat(rcs.getPropertyValue('--route-l')) || 74, rr = parseFloat(rcs.getPropertyValue('--route-r')) || 78;
    var routeW = Math.max(80, $('scene').clientWidth - rl - rr);
    $('route-done').style.width = (routeW * s.progress) + 'px';

    if (s.phase === 'finalfix') { finalFixEl.textContent = T().stFinalFix; finalFixEl.classList.add('show'); $('scene').classList.add('blocked'); } else finalFixEl.classList.remove('show');

    var busy = 0; for (var i = 0; i < s.leaders.length; i++) if (s.leaders[i].state === 'busy') busy++;
    $('pod').classList.toggle('busy', busy > 0);
    var nc = Math.max(1, s.chars.length);
    $('m-build').textContent = s.buildingNow; $('m-build-bar').style.width = (s.buildingNow / nc * 100) + '%';
    $('m-wait').textContent = s.waitingNow; $('m-wait-bar').style.width = (s.waitingNow / nc * 100) + '%';
    $('m-wait-card').classList.toggle('alarm', s.waitingNow > s.leaders.length);
    var busyPct = Math.round(busy / Math.max(1, s.leaders.length) * 100);
    var ring = $('gauge-ring'); ring.style.setProperty('--p', busyPct); ring.classList.toggle('hot', busyPct >= 80); $('gauge-val').textContent = busyPct + '%';
    $('s-prog').textContent = Math.round(s.progress * 100) + '%';
    $('s-day').textContent = Math.floor(s.day) + ' / ' + s.cfg.dl;
    $('s-bud').textContent = nf(Math.max(0, s.budget));
    $('s-qual').textContent = s.defectsEscaped; $('s-qual-card').classList.toggle('bad', s.defectsEscaped > 0);
    var qc = $('qcount'); qc.textContent = T().queueLbl + ': ' + s.queue.length; qc.classList.toggle('show', s.queue.length > 0);
    var ban = $('banner'); if (s.bannerOn) { ban.textContent = T().bannerStop(s.queue.length); ban.classList.add('show'); } else ban.classList.remove('show');
    if (s.phase !== 'finalfix') $('scene').classList.toggle('blocked', !!s.bannerOn);
    syncLog(s);
  }

  function drawBeams(s) {
    if (!beamsLayer) return; beamsLayer.innerHTML = '';
    var scene = $('scene'), pod = $('pod'); var sr = scene.getBoundingClientRect(), pr = pod.getBoundingClientRect();
    var px = pr.left + pr.width / 2 - sr.left, py = pr.top + pr.height / 2 - sr.top;
    s.chars.forEach(function (ch) {
      if (ch.state !== 'asking') return; var el = figEls[ch.id]; if (!el) return;
      var r = el.getBoundingClientRect(); var x = r.left + r.width / 2 - sr.left, y = r.top + r.height / 2 - sr.top;
      var dx = x - px, dy = y - py, len = Math.sqrt(dx * dx + dy * dy);
      var b = document.createElement('div'); b.className = 'beam'; b.style.left = px + 'px'; b.style.top = py + 'px'; b.style.width = len + 'px'; b.style.transform = 'rotate(' + (Math.atan2(dy, dx) * 180 / Math.PI) + 'deg)';
      beamsLayer.appendChild(b);
    });
  }

  function evText(e) {
    var t = T();
    switch (e.type) {
      case 'inspect': return t.logInspect(taskName(e.data));
      case 'caught': return t.logCaught(e.data);
      case 'clean': return t.logClean(taskName(e.data));
      case 'escape': return t.logEscape(e.data);
      case 'finalfix': return t.logFinalFix(e.data);
      case 'disobey': return t.logDisobey;
      case 'selfhelp': return t.logSelfhelp;
      case 'empowerOn': return t.logEmpowerOn;
      case 'empowerOff': return t.logEmpowerOff;
      case 'delegate': return t.logDelegate;
      case 'crisis': return t.logCrisis(e.data || 1);
      default: return '';
    }
  }
  function syncLog(s) {
    var arr = [], prev = null;
    for (var i = 0; i < s.events.length; i++) { var x = evText(s.events[i]); if (x && x !== prev) { arr.push(x); prev = x; } }
    var lines = arr.slice(-4).reverse();
    if (s.bannerOn && lines[0] !== T().logBanner) lines.unshift(T().logBanner);
    if (!lines.length) lines.push(T().logLaunched);
    $('logbox').innerHTML = lines.slice(0, 4).map(function (l, i) { return i === 0 ? '<span class="new">' + l + '</span>' : l; }).join('<br>');
  }

  // ---- task detail / item checklist (read-only, live during the run) ----
  function openDetail(key) { if (!sim) return; detailOpen = key; renderDetail(); $('detail-modal').classList.add('show'); }
  function closeDetail() { detailOpen = null; $('detail-modal').classList.remove('show'); }
  function renderDetail() {
    if (!sim || !detailOpen) return;
    var t = null; for (var i = 0; i < sim.tasks.length; i++) if (sim.tasks[i].key === detailOpen) t = sim.tasks[i];
    if (!t) { closeDetail(); return; }
    $('detail-ic').textContent = TASK_ICON[t.key] || '📋';
    $('detail-title').textContent = taskName(t.key);
    var pct = (t.real && t.work && t.work !== Infinity) ? Math.round(t.done / t.work * 100) : 0;
    $('detail-prog').textContent = t.real ? (T().statProg + ': ' + pct + '%') : '';
    var body = '';
    if (!t.real) { body = '<div class="dt-note">' + T().detailDecoy + '</div>'; }
    else {
      var deps = t.deps.length ? t.deps.map(function (d) { var dt = null; for (var j = 0; j < sim.tasks.length; j++) if (sim.tasks[j].key === d) dt = sim.tasks[j]; var dn = dt && dt.state === 'done'; return '<span class="dt-dep ' + (dn ? 'ok' : 'bad') + '">' + (dn ? '✓' : '•') + ' ' + taskName(d) + '</span>'; }).join(' ') : T().depsNone;
      body += '<div class="dt-sec"><div class="dt-h">' + T().detailDeps + '</div>' + deps + '</div>';
      var crew = sim.chars.filter(function (ch) { return ch.task === t.key; });
      body += '<div class="dt-sec"><div class="dt-h">' + T().detailCrew + '</div>' + (crew.length ? crew.map(function (ch) { var bad = ch.spec !== t.spec; return '<span class="mini" style="background:' + SPEC_COLOR[ch.spec] + (bad ? ';outline:2px solid var(--wait)' : '') + '">' + ch.name.charAt(0) + '</span> ' + ch.name; }).join(' &nbsp; ') : T().detailNone) + '</div>';
      var items = T()['ck' + cap(t.key)] || [];
      var doneN = Math.round(items.length * (t.work ? Math.min(1, t.done / t.work) : 0));
      body += '<div class="dt-sec"><div class="dt-h">' + T().detailItems + '</div>' + items.map(function (it, ix) { var on = ix < doneN; return '<div class="dt-item ' + (on ? 'on' : '') + '"><span class="ck-box">' + (on ? '✓' : '') + '</span>' + it + '</div>'; }).join('') + '</div>';
    }
    $('detail-body').innerHTML = body;
  }

  function buildLegend() {
    var t = T(), items = [['var(--build)', t.legendWorking], ['var(--wait)', t.legendWaiting], ['var(--idle)', t.legendIdle], ['var(--build)', t.legendDone]];
    $('legend').innerHTML = items.map(function (it, i) { return '<span class="lg"><span class="lg-dot" style="background:' + it[0] + '">' + (i === 3 ? '✓' : '') + '</span>' + it[1] + '</span>'; }).join('');
  }
  function updateRunButtons() {
    $('btn-pause').textContent = paused ? T().resumeBtn : T().pauseBtn;
    if (sim) { $('btn-empower').textContent = sim.empower ? T().empowerOnBtn : T().empowerOffBtn; $('btn-empower').classList.toggle('on', sim.empower); var canDel = sim.leaders.length < 2; $('btn-delegate').textContent = canDel ? T().delegateBtn : T().delegateDone; $('btn-delegate').disabled = !canDel; }
  }

  // ---- interactive checkpoint ----
  function openChecklist() {
    var pi = sim.pendingInspect; if (!pi) return;
    var items = (T()['ck' + cap(pi.key)] || []).slice();
    var defectN = Math.min(pi.defects, items.length);
    var flags = items.map(function (_, i) { return i < defectN; });
    var rot = items.length ? (pi.defects + pi.key.length) % items.length : 0;
    flags = flags.slice(rot).concat(flags.slice(0, rot));
    inspectState = { items: items, flags: flags, checked: items.map(function () { return false; }) };
    $('inspect-sub').textContent = T().inspectSub;
    $('inspect-step').textContent = TASK_ICON[pi.key] + ' ' + taskName(pi.key);
    renderChecklist(); $('inspect-approve').disabled = true; $('inspect-approve').textContent = T().approveLocked;
    $('inspect-modal').classList.add('show');
  }
  function renderChecklist() {
    var st = inspectState; if (!st) return;
    $('inspect-list').innerHTML = st.items.map(function (label, i) {
      var done = st.checked[i], bad = st.flags[i];
      var status = done ? (bad ? '⚠ ' + T().itemDefect : '✓ ' + T().itemOK) : T().itemIdle;
      return '<button class="ckitem' + (done ? (bad ? ' bad' : ' ok') : '') + '" data-ci="' + i + '"><span class="ck-box">' + (done ? (bad ? '⚠' : '✓') : '') + '</span><span class="ck-label">' + label + '</span><span class="ck-status">' + status + '</span></button>';
    }).join('');
  }
  function inspectItem(i) {
    if (!inspectState || inspectState.checked[i]) return;
    inspectState.checked[i] = true; renderChecklist();
    if (inspectState.checked.every(function (c) { return c; })) { $('inspect-approve').disabled = false; $('inspect-approve').textContent = T().approveBtn; }
  }
  function doApprove() {
    if (!sim || sim.phase !== 'await-inspect') return;
    M.approveInspection(sim); inspectState = null; $('inspect-modal').classList.remove('show');
    if (sim.phase === 'await-inspect') { render(sim); openChecklist(); return; }  // another task awaits
    render(sim); if (sim.finished) finish();
  }

  // =========================================================================
  // REPORT
  // =========================================================================
  function finish() {
    clearInterval(timer); timer = null;
    var sc = M.score(sim);
    lastResult = { sc: sc, cfg: { assign: Object.assign({}, sim.cfg.assign), checkpoints: Object.assign({}, sim.cfg.checkpoints), stage: Object.assign({}, sim.cfg.stage), cmd: sim.cfg.cmd }, empower: sim.empower, diff: cfg.diff };
    if (sc.reason === 'done') { $('scene').classList.add('win'); $('rocket').classList.add('go'); } else $('scene').classList.add('fail');
    $('inspect-modal').classList.remove('show'); inspectState = null;
    setTimeout(function () { document.body.classList.remove('running'); $('run').classList.add('hidden'); $('report').classList.remove('hidden'); renderReport(lastResult); }, sc.reason === 'done' ? 1400 : 900);
  }
  function renderReport(res) {
    var sc = res.sc, t = T();
    $('r-grade').textContent = sc.grade; $('r-grade').style.color = { A: 'var(--build)', B: 'var(--leader)', C: 'var(--idle)', D: 'var(--wait)' }[sc.grade];
    $('r-verdict').textContent = sc.reason === 'done' ? t.rDone : (sc.reason === 'late' ? t.rLate : t.rBroke);
    $('r-prog').textContent = sc.compPct + '%'; $('r-day').textContent = sc.day; $('r-work').textContent = sc.workPct + '%'; $('r-qual').textContent = sc.defectsEscaped;

    // per-pillar management scorecard (the six scored dimensions)
    var P = sc.pillars || {};
    var rows = [['completion', t.pillarCompletion, 33], ['onTimePts', t.pillarOnTime, 20], ['speed', t.pillarSpeed, 15],
      ['flow', t.pillarFlow, 13], ['budget', t.pillarBudget, 9], ['quality', t.pillarQuality, 10]];
    $('scorecard').innerHTML = rows.map(function (r) {
      var val = P[r[0]] || 0, max = r[2], pct = Math.max(0, Math.min(100, Math.round(val / max * 100)));
      return '<div class="pillar"><div class="pl-top"><span>' + r[1] + '</span><b>' + val + '<small>/' + max + '</small></b></div>' +
        '<div class="pl-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');

    // perfect-mission ribbon: only a flawless A
    var badge = $('r-badge'), perfect = !!sc.clean && sc.grade === 'A';
    badge.textContent = perfect ? t.badgePerfect : ''; badge.classList.toggle('show', perfect);

    // analyse the plan
    var unstaffed = 0, decoyAssigned = 0, mism = 0, idle = 0, overCheck = 0;
    var byTask = {}; M.TASKS.forEach(function (tk) { byTask[tk.key] = []; });
    M.ROSTER.forEach(function (ch) { var k = res.cfg.assign[ch.id]; if (k && byTask[k]) byTask[k].push(ch); else idle++; });
    M.TASKS.forEach(function (tk) {
      var crew = byTask[tk.key];
      if (tk.real && crew.length === 0) unstaffed++;
      if (!tk.real && crew.length > 0) decoyAssigned++;
      if (tk.real && crew.some(function (ch) { return ch.spec !== tk.spec; })) mism++;
      if (tk.real && tk.risk < 0.8 && res.cfg.checkpoints[tk.key]) overCheck++;
    });
    // timeline analysis
    var stg = res.cfg.stage || {}, usedS = {}, schedN = 0;
    M.TASKS.forEach(function (tk) { if (!tk.real) return; var staffed = M.ROSTER.some(function (ch) { return res.cfg.assign[ch.id] === tk.key; }); if (staffed && stg[tk.key]) { usedS[stg[tk.key]] = 1; schedN++; } });
    var slowTL = schedN >= 2 && Object.keys(usedS).length === schedN;

    var wastePct = 100 - sc.workPct, lessons = [];
    if (sc.stallTicks > 0) lessons.push(['⛔', t.lBadTimeline]);
    if (unstaffed > 0) lessons.push(['⛔', t.lUnstaffed]);
    if (decoyAssigned > 0) lessons.push(['🎭', t.lDecoy]);
    if (mism > 0) lessons.push(['🔀', t.lMismatch]);
    if (idle > 0) lessons.push(['💤', t.lIdle]);
    if (sc.defectsEscaped > 0) lessons.push(['🐞', t.lEscaped(sc.defectsEscaped)]);
    if (sc.bannerEverFired) lessons.push(['⏳', t.lBottleneck]);
    if (overCheck > 0) lessons.push(['🔍', t.lOverCheck]);
    if (sc.defectsCaught > 0) lessons.push(['✅', t.lCaught(sc.defectsCaught)]);
    if (res.diff === 'hard' && sc.disobeys > 0) lessons.push(['🔁', t.lDisobey(sc.disobeys)]);
    if (res.empower && sc.score >= 70) lessons.push(['🛠️', t.lEmpower]);
    if (res.cfg.cmd >= 2 && sc.score >= 70) lessons.push(['👥', t.lDelegate]);
    if (slowTL && !sc.stallTicks) lessons.push(['🐢', t.lSlowTimeline]);
    if (wastePct >= 40) lessons.push(['💸', t.lWaste(wastePct)]);
    if (sc.clean && sc.grade === 'A') lessons.unshift(['🌟', t.lGreat]);
    if (!lessons.length) lessons.push(['💸', t.lWaste(wastePct)]);
    $('debrief').innerHTML = lessons.slice(0, 4).map(function (l) { return '<div class="lesson"><span class="b">' + l[0] + '</span><span>' + l[1] + '</span></div>'; }).join('');
  }

  function ruleHtml(titleKey, bodyKey, badge) {
    var t = T(), b = badge ? '<span class="step-badge">' + badge + '</span>' : '';
    return '<div class="rule"><h3>' + b + t[titleKey] + '</h3><p>' + t[bodyKey] + '</p></div>';
  }
  // Worked example: the canonical optimal plan, drawn from engine constants so it always stays in sync.
  function exampleStrip() {
    var stageOf = M.DEFAULT_STAGE, html = '';
    for (var s = 1; s <= M.STAGE_COUNT; s++) {
      var chips = '';
      M.TASKS.forEach(function (t) {
        if (!t.real || stageOf[t.key] !== s) return;
        var ck = (t.risk >= 1.0) ? ' 🔍' : '';
        chips += '<span class="tl-chip">' + TASK_ICON[t.key] + ' ' + taskName(t.key) + ck + '</span>';
      });
      html += '<div class="tl-stage"><div class="tl-h">' + T().stageLbl + ' ' + s + '</div>' + chips + '</div>';
    }
    return '<div class="timeline ex-timeline">' + html + '</div>';
  }
  function buildRules() {
    var t = T();
    var html = '<div class="loopframe">' + t.loopFrame + '</div>';
    html += ruleHtml('rGoalT', 'rGoalB') + ruleHtml('rRoleT', 'rRoleB');
    html += ruleHtml('rTimeT', 'rTimeB', 1) + ruleHtml('rAssignT', 'rAssignB', 2) +
            ruleHtml('rCheckT', 'rCheckB', 3) + ruleHtml('rSteerT', 'rSteerB', 4);
    html += '<div class="rule"><h3>' + t.rExampleT + '</h3>' + exampleStrip() + '<p>' + t.rExampleB + '</p></div>';
    html += ruleHtml('rGradeT', 'rGradeB') + ruleHtml('rDiffT', 'rDiffB');
    $('rules-body').innerHTML = html;
  }

  // =========================================================================
  // EVENTS
  // =========================================================================
  function bind() {
    document.querySelectorAll('.lang button').forEach(function (b) { b.addEventListener('click', function () { L = b.getAttribute('data-lang'); applyLang(); }); });
    $('rules-open').addEventListener('click', function () { $('rules-modal').classList.add('show'); });
    $('rules-close').addEventListener('click', function () { $('rules-modal').classList.remove('show'); });
    $('rules-modal').addEventListener('click', function (e) { if (e.target === $('rules-modal')) $('rules-modal').classList.remove('show'); });

    $('setup').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      if (b.dataset.adj) adjMission(b.dataset.adj, parseInt(b.dataset.d, 10));
      else if (b.dataset.ck) { cfg.checkpoints[b.dataset.ck] = !cfg.checkpoints[b.dataset.ck]; updatePlanUI(); }
      else if (b.dataset.diff) { cfg.diff = b.dataset.diff; paintSetup(); }
    });
    $('setup').addEventListener('change', function (e) {
      var cs = e.target.closest('.cr-sel'); if (cs) { cfg.assign[parseInt(cs.dataset.char, 10)] = cs.value || null; updatePlanUI(); return; }
      var ss = e.target.closest('.stage-sel'); if (ss) { var v = parseInt(ss.value, 10) || 0; if (v) cfg.stage[ss.dataset.stage] = v; else delete cfg.stage[ss.dataset.stage]; updatePlanUI(); return; }
    });
    $('empower-toggle').addEventListener('click', function () { cfg.empower = !cfg.empower; paintSetup(); });
    $('btn-auto').addEventListener('click', function () { cfg.assign = autoPlan(); cfg.checkpoints = autoChecks(); cfg.stage = autoStage(); paintSetup(); });
    $('btn-clear').addEventListener('click', function () { cfg.assign = {}; cfg.checkpoints = {}; cfg.stage = {}; paintSetup(); });
    $('launch').addEventListener('click', launch);

    $('btn-pause').addEventListener('click', function () { paused = !paused; updateRunButtons(); });
    $('btn-empower').addEventListener('click', function () { if (sim) { M.setEmpower(sim, !sim.empower); updateRunButtons(); } });
    $('btn-delegate').addEventListener('click', function () { if (sim) { M.delegate(sim); buildPod(); updateRunButtons(); } });
    $('btn-crisis').addEventListener('click', function () { if (sim && !paused && sim.phase !== 'await-inspect') M.triggerCrisis(sim, 'flare'); });
    $('btn-quit').addEventListener('click', function () { if (sim && !sim.finished) { sim.finished = 'late'; finish(); } });
    $('btn-again').addEventListener('click', function () { toSetup(false); });
    $('btn-tweak').addEventListener('click', function () { toSetup(true); });
    $('inspect-list').addEventListener('click', function (e) { var b = e.target.closest('[data-ci]'); if (b) inspectItem(parseInt(b.dataset.ci, 10)); });
    $('inspect-approve').addEventListener('click', doApprove);
    $('worksites').addEventListener('click', function (e) { var w = e.target.closest('.ws'); if (w) openDetail(w.id.replace('ws-', '')); });
    $('detail-close').addEventListener('click', closeDetail);
    $('detail-modal').addEventListener('click', function (e) { if (e.target === $('detail-modal')) closeDetail(); });
    document.querySelectorAll('.spd').forEach(function (b) { b.addEventListener('click', function () { speedMult = parseFloat(b.dataset.spd); document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x === b); }); restartTimer(); }); });
  }
  function toSetup(keep) {
    if (timer) { clearInterval(timer); timer = null; }
    if (keep === true && lastResult) { cfg.cmd = lastResult.cfg.cmd; cfg.empower = lastResult.empower; cfg.assign = Object.assign({}, lastResult.cfg.assign); cfg.checkpoints = Object.assign({}, lastResult.cfg.checkpoints); cfg.stage = Object.assign({}, lastResult.cfg.stage); }
    sim = null; paused = false; document.body.classList.remove('running');
    $('inspect-modal').classList.remove('show'); inspectState = null;
    $('detail-modal').classList.remove('show'); detailOpen = null;
    $('report').classList.add('hidden'); $('run').classList.add('hidden'); $('setup').classList.remove('hidden');
    paintSetup();
  }

  // ---- init ----
  beamsLayer = document.createElement('div'); beamsLayer.style.cssText = 'position:absolute;inset:0;z-index:4;pointer-events:none;'; $('scene').appendChild(beamsLayer);
  finalFixEl = document.createElement('div'); finalFixEl.className = 'finalfix'; $('scene').appendChild(finalFixEl);
  bind(); applyLang();
})();
