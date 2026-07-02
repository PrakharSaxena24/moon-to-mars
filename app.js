/* ============================================================================
 * app.js — wires the rehearsal engine (engine.js, window.PRS) + strings (i18n.js)
 * to the DOM. SETUP (canvas + design decisions) → RUN (site map) → REPORT.
 * ==========================================================================*/
(function () {
  'use strict';
  var P = window.PRS, STR = window.STR;
  var $ = function (id) { return document.getElementById(id); };
  var nf = function (n) { return Math.round(n).toLocaleString(); };
  var clamp = function (v, lo, hi) { return Math.max(lo, Math.min(hi, v)); };

  var L = 'en';
  function T() { return STR[L]; }
  function nm(o) { if (!o) return ''; if (typeof o === 'string') return o; return (L === 'ja' ? o.jp : o.en) || o.en || ''; }
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }

  // detectors, in display order, mapped to their fix
  var DETS = ['safety', 'budgetAuth', 'info', 'report', 'fatigue', 'reserve', 'returnLogi', 'handoffTiming'];
  var DET_FIX = { safety: 'setSafety', budgetAuth: 'grantAuth', info: 'shareInfo', report: 'setReport', fatigue: 'rebalance', reserve: 'fixReserve', returnLogi: 'setReturn', handoffTiming: 'fixHandoffs' };
  var DET_ROLE = { safety: 'safetyLead', budgetAuth: 'budgetLead', info: 'pm', report: 'safetyLead', fatigue: 'siteLead', reserve: 'budgetLead', returnLogi: 'logi', handoffTiming: 'specialist' };
  // which day(s) each design decision affects (a gap can bite on more than one day)
  var DET_SEG = { safety: ['ops', 'fishday'], budgetAuth: ['ops', 'return'], info: ['arrival', 'ops'], report: ['ops'], fatigue: ['ops', 'return'], reserve: ['ops', 'return'], returnLogi: ['return'], handoffTiming: ['fishday'] };
  var daySel = 'arrival';   // which day is being planned / rehearsed
  function detsForDay(d) { return (d === 'all') ? DETS.slice() : DETS.filter(function (id) { return DET_SEG[id].indexOf(d) >= 0; }); }
  function dayLabel(seg) { if (seg === 'all') return T().wholeTrip; var s = null; P.SEGMENTS.forEach(function (x) { if (x.id === seg) s = x; }); return s ? nm(s.name) : seg; }
  function dayGapCount(seg) { return P.gapsForSegment(currentPlan(), seg).length; }

  // which design decisions the player has closed (true = fixed)
  var fixed = { setSafety: false, grantAuth: false, shareInfo: false, setReport: false, rebalance: false, fixReserve: false, setReturn: false, fixHandoffs: false };
  // fishday hand-authored edits (drawn/erased arrows, re-timed blocks) — §7 editor output
  var fdOv = { timing: {}, handoffs: {} };
  function fdReset() { fdOv = { timing: {}, handoffs: {} }; }
  function buildCfg() {
    var cfg = { seed: 1, overrides: {} }, k;
    DETS.forEach(function (d) { if (fixed[DET_FIX[d]]) cfg = P.applyFix(cfg, DET_FIX[d]); });
    var o = cfg.overrides;
    for (k in fdOv.timing) { (o.timing = o.timing || {})[k] = fdOv.timing[k]; }
    for (k in fdOv.handoffs) { (o.handoffs = o.handoffs || {})[k] = fdOv.handoffs[k]; }
    return cfg;
  }
  function currentPlan() { return P.mergePlan(buildCfg()); }
  function activeProblemIds() { return P.detect(currentPlan()).map(function (p) { return p.id; }); }
  function hhmm(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

  var sim = null, timer = null, paused = false, BASE_TICK = 520, speedMult = 1, lastResult = null, figEls = {};
  function tickMs() { return Math.round(BASE_TICK / speedMult); }

  var BUB = { confused: '❓', meeting: '💬', waiting: '⏳', tired: '😣', onFire: '🔥', resolved: '✅', working: '', idle: '', waitInfo: '⏳', rework: '🔁' };
  var STATE_KEY = { working: 'stWorking', confused: 'stConfused', meeting: 'stMeeting', waiting: 'stWaiting', tired: 'stTired', onFire: 'stOnFire', resolved: 'stResolved', idle: 'stIdle', waitInfo: 'stWaitInfo', rework: 'stRework' };

  // =========================================================================
  // i18n apply
  // =========================================================================
  function applyLang() {
    document.documentElement.lang = L;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var v = T()[el.getAttribute('data-i18n')]; if (typeof v === 'string') el.textContent = v; });
    $('lang-en').classList.toggle('on', L === 'en'); $('lang-ja').classList.toggle('on', L === 'ja');
    paintSetup(); buildRules(); buildLegend();
    if (!$('run').classList.contains('hidden') && sim) { renderSim(sim); }
    if (!$('report').classList.contains('hidden') && lastResult) renderReport(lastResult);
  }

  // =========================================================================
  // SETUP
  // =========================================================================
  function paintSetup() { buildDaySelect(); buildCanvas(); buildOrg(); buildTimeline(); buildEditors(); buildFishday(); updatePlanUI(); }

  function buildDaySelect() {
    var box = $('day-select'); if (!box) return;
    var opts = ['arrival', 'ops', 'fishday', 'return', 'all'];   // chronological display order
    box.innerHTML = opts.map(function (seg) {
      var n = dayGapCount(seg), clean = n === 0;
      return '<button class="day-btn' + (seg === daySel ? ' on' : '') + '" data-day="' + seg + '">' +
        '<span class="db-name">' + dayLabel(seg) + '</span>' +
        '<span class="db-gaps ' + (clean ? 'ok' : 'bad') + '">' + (clean ? '✓' : n + ' ' + T().fixGapLbl) + '</span></button>';
    }).join('');
  }

  function buildCanvas() {
    var pl = P.makeTemplate(), pr = pl.project, t = T();
    $('c-name').textContent = nm(pr.name);
    var g = $('canvas-grid');
    g.innerHTML =
      cell('🎯', t.cvSuccess ? '' : '', nm(pr.goal), true) +
      cell('📅', t.cvDays, pr.days + ' ' + t.cvDaysUnit) +
      cell('📍', t.cvLocation, nm(pr.location)) +
      cell('👥', t.cvHeadcount, pr.headcount + ' (' + t.cvHeadcountNote(pr.staff, pr.guests, pr.chefs) + ')') +
      cell('💴', t.cvBudget, '¥' + nf(pl.budget.total)) +
      cell('⚠️', t.cvConstraints, pr.constraints.map(nm).join(' · '), true);
    $('c-conds').innerHTML = '<div class="conds-h">' + t.cvSuccess + '</div>' +
      pr.successConditions.map(function (c) { return '<span class="cond">• ' + nm(c.text) + '</span>'; }).join('');
    function cell(ic, lbl, val, wide) { return '<div class="cv-cell' + (wide ? ' wide' : '') + '"><span class="cv-ic">' + ic + '</span><span class="cv-lbl">' + lbl + '</span><span class="cv-val">' + val + '</span></div>'; }
  }

  function buildOrg() {
    var plan = currentPlan(), box = $('org'); box.innerHTML = '';
    var order = ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'specialist', 'chef'];
    order.forEach(function (rid) {
      var r = plan.roles[rid], rr = P.role(rid);
      var holder = r && r.holder ? byId(plan.participants, r.holder) : null;
      var unset = !holder;
      var dep = r && r.deputyId ? byId(plan.participants, r.deputyId) : null;
      var chip = document.createElement('div'); chip.className = 'role-chip' + (unset ? ' unset' : '');
      chip.style.borderColor = unset ? 'var(--wait)' : 'transparent';
      chip.innerHTML = '<span class="rc-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
        '<span class="rc-body"><b>' + nm(rr.name) + '</b><small>' + (holder ? nm(holder.name) : '—') + (dep ? ' · ' + T().pnNeeded.slice(0, 0) : '') + '</small></span>';
      box.appendChild(chip);
    });
  }

  function buildTimeline() {
    var plan = P.makeTemplate(), box = $('timeline'); if (!box) return;
    var days = plan.project.days, rail = '';
    var raySel = { arrival: function (d) { return d === 1; }, ops: function (d) { return d >= 2 && d <= 9; }, fishday: function (d) { return d === 3; }, return: function (d) { return d === days; }, all: function () { return true; } }[daySel] || function () { return false; };
    for (var d = 1; d <= days; d++) { var cls = (d === 1) ? 'arr' : (d === days ? 'ret' : (d === 3 ? 'fish' : 'ops')); rail += '<span class="tl-day ' + cls + (raySel(d) ? ' sel' : '') + '">' + d + '</span>'; }
    var phases = [], seen = {}, segByCls = { arr: 'arrival', ops: 'ops', ret: 'return', fish: 'fishday' };
    plan.tasks.forEach(function (t) { var k = t.phase.en; if (!seen[k]) { seen[k] = { phase: t.phase, tasks: [], cls: '' }; phases.push(seen[k]); } seen[k].tasks.push(t); });
    if (phases[0]) phases[0].cls = 'arr'; if (phases[1]) phases[1].cls = 'ops'; if (phases[2]) phases[2].cls = 'ret'; if (phases[3]) phases[3].cls = 'fish';
    var blocks = phases.map(function (ph) {
      var sel = (daySel === 'all' || segByCls[ph.cls] === daySel) ? ' sel' : '';
      var shown = ph.tasks.slice(0, 6);
      var chips = shown.map(function (t) { return '<span class="tl-chip">' + P.station(t.station).icon + ' ' + nm(t.name) + '</span>'; }).join('');
      if (ph.tasks.length > shown.length) chips += '<span class="tl-chip">… +' + (ph.tasks.length - shown.length) + '</span>';
      return '<div class="tl-stage ' + ph.cls + sel + '"><div class="tl-h">' + nm(ph.phase) + '</div>' + chips + '</div>';
    }).join('');
    box.innerHTML = '<div class="tl-rail">' + rail + '</div><div class="tl-blocks">' + blocks + '</div>';
  }

  function buildEditors() {
    var t = T(), box = $('editors'); box.innerHTML = '';
    var head = $('ed-head'); if (head) head.textContent = t.planDayLine(dayLabel(daySel), detsForDay(daySel).length);
    detsForDay(daySel).forEach(function (d) {
      var rr = P.role(DET_ROLE[d]);
      var c = document.createElement('div'); c.className = 'editor-card'; c.id = 'ed-' + d;
      c.innerHTML =
        '<div class="ed-top"><span class="ed-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
          '<span class="ed-label">' + t['e_' + d + '_label'] + '</span><span class="ed-chip" id="chip-' + d + '"></span></div>' +
        '<div class="ed-cause" id="cause-' + d + '">' + t['p_' + d + '_cause'] + '</div>' +
        '<select class="ed-sel" data-fix="' + DET_FIX[d] + '">' +
          '<option value="off">' + t['e_' + d + '_off'] + '</option>' +
          '<option value="on">✓ ' + t['e_' + d + '_on'] + '</option></select>';
      box.appendChild(c);
      c.querySelector('select').value = fixed[DET_FIX[d]] ? 'on' : 'off';
    });
  }

  function updatePlanUI() {
    var open = {}; activeProblemIds().forEach(function (id) { open[id] = true; });
    var t = T(), dayDets = detsForDay(daySel), gaps = 0;
    dayDets.forEach(function (d) {
      var isOpen = !!open[d];
      var chip = $('chip-' + d), cause = $('cause-' + d), card = $('ed-' + d);
      var sel = document.querySelector('.ed-sel[data-fix="' + DET_FIX[d] + '"]');
      if (sel) sel.value = fixed[DET_FIX[d]] ? 'on' : 'off';
      if (chip) { chip.textContent = isOpen ? ('⛔ ' + t.fixGapLbl) : '✓'; chip.className = 'ed-chip ' + (isOpen ? 'bad' : 'ok'); }
      if (cause) cause.style.display = isOpen ? 'block' : 'none';
      if (card) card.classList.toggle('closed', !isOpen);
      if (isOpen) gaps++;
    });
    buildOrg();
    $('plan-ready').innerHTML = '<span class="pr-lbl">' + t.readyTitle + '</span>' + dayDets.map(function (d) {
      return '<span class="pr-item ' + (open[d] ? 'bad' : 'ok') + '">' + (open[d] ? '•' : '✓') + ' ' + t['e_' + d + '_label'].split(' (')[0].split('（')[0] + '</span>';
    }).join('');
    $('plan-hint').textContent = gaps ? t.hintGaps(gaps) : t.hintReadyDay(dayLabel(daySel));
    $('plan-hint').className = 'planhint' + (gaps ? '' : ' good');
    buildDaySelect();
    $('launch').textContent = t.runDayBtn(dayLabel(daySel));
    buildFishday();
  }

  // =========================================================================
  // FISHDAY EDITOR — timeline lanes + info-arrow overlay (§7)
  // =========================================================================
  var PXM = 0.8, FD_T0 = P.DAY_START_MIN, FD_T1 = P.DAY_END_MIN, LANE_H = 40, LBL_W = 108, RULER_H = 26;
  var fdDrag = null, fdWire = null, arrowEdit = null, fdUid = 1;
  function fdX(min) { return LBL_W + (min - FD_T0) * PXM; }
  function fdMin(x) { return clamp(Math.round(((x - LBL_W) / PXM + FD_T0) / 5) * 5, FD_T0, FD_T1); }
  function cardOwnerOf(plan, cid) { var c = byId(plan.infoCards, cid); return c ? c.ownerRoleId : null; }
  function producerOf(plan, cid) { for (var i = 0; i < plan.tasks.length; i++) { var t = plan.tasks[i]; if (t.day === 'fishday' && (t.produces || []).indexOf(cid) >= 0) return t; } return null; }
  function fdBlockGeo(plan, tk) {
    var lane = 0; plan.participants.forEach(function (pp, i) { if (pp.id === tk.assignedIds[0]) lane = i; });
    return { x: fdX(tk.startMin), w: Math.max(10, tk.durMin * PXM), y: RULER_H + lane * LANE_H + 7 };
  }

  function buildFishday() {
    var card = $('fd-card'); if (!card) return;
    if (daySel !== 'fishday') { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    var plan = currentPlan(), fds = P.fishdayTasks(plan), fd = P.fishdaySchedule(plan);
    var lanes = plan.participants;
    var W = fdX(FD_T1) + 16, H = RULER_H + lanes.length * LANE_H + 6, html = '';
    for (var m = FD_T0; m <= FD_T1; m += 60) html += '<div class="fd-tick" style="left:' + fdX(m) + 'px">' + hhmm(m) + '</div>';
    lanes.forEach(function (pp, i) {
      var rr = P.role(pp.roleId), top = RULER_H + i * LANE_H;
      html += '<div class="fd-lane" style="top:' + top + 'px;width:' + W + 'px"></div>' +
        '<div class="fd-lbl" style="top:' + top + 'px"><span class="fd-lbl-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' + nm(pp.name) + '</div>';
    });
    fds.forEach(function (tk) {
      if (!tk.assignedIds.length) return;
      var g = fdBlockGeo(plan, tk), e = fd.byTask[tk.id];
      var sock = '';
      (tk.neededInfo || []).forEach(function (cid, si) {
        if (cardOwnerOf(plan, cid) === tk.ownerRoleId) return;
        var arr = P.infoArrival(plan, cid, tk.ownerRoleId);
        var cls = arr == null ? 'miss' : (arr <= tk.startMin ? 'ok' : 'late');
        sock += '<span class="fd-socket ' + cls + '" data-task="' + tk.id + '" data-card="' + cid + '" style="top:' + (si * 11 + 1) + 'px" title="● ' + nm(byId(plan.infoCards, cid).name) + '"></span>';
      });
      var port = (tk.produces || []).length ? '<span class="fd-port" data-task="' + tk.id + '" data-card="' + tk.produces[0] + '" title="○ ' + nm(byId(plan.infoCards, tk.produces[0]).name) + '"></span>' : '';
      var multi = tk.assignedIds.length > 1 ? '<i class="fd-x">×' + tk.assignedIds.length + '</i>' : '';
      html += '<div class="fd-block' + (g.w < 60 ? ' sm' : '') + (e && e.wrongFish ? ' wf' : '') + '" data-task="' + tk.id + '" style="left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px" title="' + nm(tk.name) + '  ' + hhmm(tk.startMin) + '–' + hhmm(tk.startMin + tk.durMin) + '">' +
        sock + '<span class="fd-bname">' + P.station(tk.station).icon + (g.w >= 60 ? ' ' + nm(tk.name) : '') + '</span>' + multi + port + '<span class="fd-rsz"></span></div>';
    });
    var box = $('fd-canvas');
    box.style.width = W + 'px'; box.style.height = H + 'px';
    box.innerHTML = html + '<svg class="fd-arrows" id="fd-arrows" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"></svg>';
    drawFdArrows(plan);
    buildFdArrowList(plan);
    buildFdReady(plan, fd);
  }

  function arrowEnds(plan, h) {
    var from = byId(plan.tasks, h.fromTaskId), to = byId(plan.tasks, h.toTaskId);
    if (!from || !to || from.day !== 'fishday' || to.day !== 'fishday' || !from.assignedIds.length || !to.assignedIds.length) return null;
    var gf = fdBlockGeo(plan, from), gt = fdBlockGeo(plan, to);
    var si = 0; (to.neededInfo || []).forEach(function (cid, i2) { if (cid === h.cardId) si = i2; });
    return { x1: gf.x + gf.w + 5, y1: gf.y + 13, x2: gt.x - 6, y2: gt.y + si * 11 + 6 };
  }
  function drawFdArrows(plan) {
    var svg = $('fd-arrows'); if (!svg) return;
    var s = '';
    plan.handoffs.forEach(function (h) {
      var e = arrowEnds(plan, h); if (!e) return;
      var to = byId(plan.tasks, h.toTaskId), sa = P.staticArrival(plan, h);
      var late = sa == null || sa > to.startMin;
      var mx = (e.x1 + e.x2) / 2;
      s += '<path class="' + (late ? 'late' : 'ok') + '" data-h="' + h.id + '" d="M' + e.x1 + ' ' + e.y1 + ' C ' + mx + ' ' + e.y1 + ', ' + mx + ' ' + e.y2 + ', ' + e.x2 + ' ' + e.y2 + '"></path>' +
        '<circle cx="' + e.x2 + '" cy="' + e.y2 + '" r="2.6" fill="' + (late ? 'rgba(217,83,79,.9)' : 'rgba(47,158,111,.9)') + '"></circle>';
    });
    svg.innerHTML = s;
  }
  function buildFdArrowList(plan) {
    var t = T();
    $('fd-arrowlist').innerHTML = plan.handoffs.map(function (h) {
      var to = byId(plan.tasks, h.toTaskId); if (!to || to.day !== 'fishday') return '';
      var sa = P.staticArrival(plan, h), late = sa == null || sa > to.startMin;
      var card = byId(plan.infoCards, h.cardId);
      return '<button class="fd-ar-chip ' + (late ? 'late' : 'ok') + '" data-h="' + h.id + '">' + (late ? '⚑' : '✓') + ' ' + nm(card ? card.name : h.cardId).split('：')[0].split(':')[0] + ' <span class="muted2">' + (sa == null ? '—' : hhmm(sa)) + ' ' + t['ch' + h.channel.charAt(0).toUpperCase() + h.channel.slice(1)].split(' ')[0] + '</span></button>';
    }).join('');
  }
  function buildFdReady(plan, fd) {
    var t = T(), hints = P.readiness(plan), chips = [];
    function tn(id) { var x = byId(plan.tasks, id); return x ? nm(x.name) : id; }
    function cn(id) { var x = byId(plan.infoCards, id); return x ? nm(x.name).split('：')[0].split(':')[0] : id; }
    hints.forEach(function (h) {
      if (h.type === 'MISSING_ARROW') chips.push(t.rhMissing(cn(h.cardId), tn(h.taskId)));
      else if (h.type === 'ARROW_LATE') chips.push(t.rhLate(cn(h.cardId), tn(h.taskId), h.lateMin));
      else if (h.type === 'WRONG_FISH_RISK') chips.push(t.rhWrongFish(cn(h.cardId), tn(h.taskId)));
      else if (h.type === 'DEP_BROKEN') chips.push(t.rhDep(tn(h.taskId), tn(h.depId)));
      else if (h.type === 'OVERLOAD') { var pp = byId(plan.participants, h.personId); chips.push(t.rhOverload(pp ? nm(pp.name) : h.personId)); }
      else if (h.type === 'TASK_UNSTAFFED') chips.push(t.rhUnstaffed(tn(h.taskId)));
      else if (h.type === 'DUTY_UNASSIGNED') chips.push(t.rhDuty(nm(P.role(h.roleId).name)));
    });
    $('fd-ready').innerHTML = '<span class="pr-lbl">' + t.fdReadyLbl + '</span>' +
      (chips.length ? chips.slice(0, 8).map(function (c) { return '<span class="pr-item bad">' + c + '</span>'; }).join('') + (chips.length > 8 ? '<span class="pr-item bad">+' + (chips.length - 8) + '</span>' : '')
                    : '<span class="pr-item ok">' + t.fdReadyOk + '</span>');
    var proj = P.projected(buildCfg());
    $('fd-projected').textContent = t.fdProjected(proj.score, proj.efficiency);
    $('fd-projected').className = 'planhint' + (chips.length ? '' : ' good');
  }

  // ---- block drag / resize / arrow wire (Pointer Events) ----
  function fdPointerDown(ev) {
    var port = ev.target.closest('.fd-port');
    if (port) {
      var svg = $('fd-arrows'), r = $('fd-canvas').getBoundingClientRect();
      fdWire = { fromTask: port.dataset.task, cardId: port.dataset.card, ox: r.left, oy: r.top, x0: ev.clientX - r.left, y0: ev.clientY - r.top };
      ev.preventDefault(); return;
    }
    var sock = ev.target.closest('.fd-socket');
    if (sock) {
      if (sock.classList.contains('miss')) fdAutoDraw(sock.dataset.task, sock.dataset.card);
      ev.preventDefault(); return;
    }
    var blk = ev.target.closest('.fd-block'); if (!blk) return;
    var plan = currentPlan(), tk = byId(plan.tasks, blk.dataset.task); if (!tk) return;
    var resize = !!ev.target.closest('.fd-rsz');
    fdDrag = { taskId: tk.id, el: blk, resize: resize, x0: ev.clientX, startMin: tk.startMin, durMin: tk.durMin };
    blk.setPointerCapture && blk.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }
  function fdPointerMove(ev) {
    if (fdWire) {
      var x = ev.clientX - fdWire.ox, y = ev.clientY - fdWire.oy, svg = $('fd-arrows');
      var old = svg.querySelector('.wire'); if (old) old.remove();
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', 'wire'); p.setAttribute('d', 'M' + fdWire.x0 + ' ' + fdWire.y0 + ' L ' + x + ' ' + y);
      svg.appendChild(p); return;
    }
    if (!fdDrag) return;
    var dMin = Math.round((ev.clientX - fdDrag.x0) / PXM / 5) * 5;
    if (fdDrag.resize) {
      var nd = clamp(fdDrag.durMin + dMin, 5, FD_T1 - fdDrag.startMin);
      fdDrag.el.style.width = Math.max(10, nd * PXM) + 'px'; fdDrag.newDur = nd;
    } else {
      var ns = clamp(fdDrag.startMin + dMin, FD_T0, FD_T1 - fdDrag.durMin);
      fdDrag.el.style.left = fdX(ns) + 'px'; fdDrag.newStart = ns;
    }
  }
  function fdPointerUp(ev) {
    if (fdWire) {
      var el = document.elementFromPoint(ev.clientX, ev.clientY);
      var sock = el && el.closest ? el.closest('.fd-socket') : null;
      if (sock && sock.dataset.card === fdWire.cardId) fdAutoDraw(sock.dataset.task, sock.dataset.card);
      fdWire = null; buildFishday(); updatePlanUI(); return;
    }
    if (!fdDrag) return;
    var d = fdDrag; fdDrag = null;
    if (d.resize && d.newDur != null && d.newDur !== d.durMin) fdOv.timing[d.taskId] = { startMin: d.startMin, durMin: d.newDur };
    else if (!d.resize && d.newStart != null && d.newStart !== d.startMin) fdOv.timing[d.taskId] = { startMin: d.newStart, durMin: d.durMin };
    else return;
    paintSetup();
  }
  // draw the arrow for (consumer task, card) from the task that produces the card
  function fdAutoDraw(toTaskId, cardId) {
    var plan = currentPlan(), to = byId(plan.tasks, toTaskId), from = producerOf(plan, cardId);
    if (!to || !from) return;
    var card = byId(plan.infoCards, cardId);
    var assume = (to.assumeOn || []).indexOf(cardId) >= 0;
    var id = 'h_' + cardId.replace('ic_', '') + '_' + to.ownerRoleId + '_' + (fdUid++);
    fdOv.handoffs[id] = { cardId: cardId, fromRoleId: from.ownerRoleId, fromTaskId: from.id, toRoleId: to.ownerRoleId, toTaskId: to.id,
      trigger: { type: 'onTaskDone', taskId: from.id }, channel: 'radio', ifLate: assume ? 'assume' : 'idle',
      reworkKind: assume ? 'wrongFish' : null, content: { en: nm2(card.name, 'en'), jp: nm2(card.name, 'jp') } };
    paintSetup();
    openArrowPanel(id);
  }
  function nm2(o, lang) { return o ? (lang === 'jp' ? (o.jp || o.en) : o.en) : ''; }

  // ---- arrow edit panel ----
  var CH_LIST = ['faceToFace', 'radio', 'phone', 'chat', 'board'];
  function openArrowPanel(hid) {
    var plan = currentPlan(), h = byId(plan.handoffs, hid); if (!h) return;
    arrowEdit = hid;
    var t = T(), card = byId(plan.infoCards, h.cardId), from = byId(plan.tasks, h.fromTaskId), to = byId(plan.tasks, h.toTaskId);
    $('ar-title').textContent = nm(card ? card.name : h.cardId);
    $('ar-sub').textContent = t.arFrom + ' ' + (from ? nm(from.name) : h.fromRoleId) + ' → ' + t.arTo + ' ' + (to ? nm(to.name) : h.toRoleId);
    var trigDone = h.trigger.type === 'onTaskDone';
    var sendMin = P.resolveSendMin(plan, h);
    var chOpts = CH_LIST.map(function (c) {
      return '<option value="' + c + '"' + (h.channel === c ? ' selected' : '') + '>' + t['ch' + c.charAt(0).toUpperCase() + c.slice(1)] + ' (+' + P.CHANNELS[c] + (L === 'ja' ? '分' : ' min') + ')</option>';
    }).join('');
    var arr = P.staticArrival(plan, h), needBy = to ? to.startMin : 0, late = arr == null || arr > needBy;
    $('ar-body').innerHTML =
      '<div class="ar-row"><span class="dt-h">' + t.arTrigger + '</span>' +
        '<select class="ar-sel" id="ar-trig"><option value="onTaskDone"' + (trigDone ? ' selected' : '') + '>' + t.arTrigDone + (from ? ' — ' + nm(from.name) : '') + '</option>' +
        '<option value="atMinute"' + (!trigDone ? ' selected' : '') + '>' + t.arTrigAt + '</option></select>' +
        '<input class="ar-time" id="ar-time" type="time" step="300" value="' + hhmm(sendMin == null ? needBy : sendMin) + '"' + (trigDone ? ' disabled' : '') + '></div>' +
      '<div class="ar-row"><span class="dt-h">' + t.arChannel + '</span><select class="ar-sel" id="ar-ch">' + chOpts + '</select></div>' +
      '<div class="ar-arrive ' + (late ? 'late' : 'ok') + '">' + (arr == null ? '—' : (late ? t.arriveLate(hhmm(arr), arr - needBy) : t.arriveOk(hhmm(arr)))) + ' <span class="muted2">(' + (to ? nm(to.name) + ' ' + hhmm(needBy) : '') + ')</span></div>' +
      (h.ifLate === 'assume' ? '<div class="ar-note">' + t.arriveAssume + '</div>' : '');
    $('arrow-modal').classList.add('show');
  }
  function arrowPatch() {
    if (!arrowEdit) return;
    var plan = currentPlan(), h = byId(plan.handoffs, arrowEdit); if (!h) return;
    var trig = $('ar-trig').value, ch = $('ar-ch').value, tv = $('ar-time').value;
    var patch = { channel: ch };
    if (trig === 'onTaskDone') patch.trigger = { type: 'onTaskDone', taskId: h.fromTaskId };
    else { var mm = tv ? (parseInt(tv.slice(0, 2), 10) * 60 + parseInt(tv.slice(3, 5), 10)) : h.trigger.value || 0; patch.trigger = { type: 'atMinute', value: mm }; }
    var prev = fdOv.handoffs[arrowEdit];
    fdOv.handoffs[arrowEdit] = prev && prev !== null ? Object.assign({}, prev, patch) : patch;
    paintSetup();
    openArrowPanel(arrowEdit);
  }
  function arrowErase() {
    if (!arrowEdit) return;
    fdOv.handoffs[arrowEdit] = null;
    arrowEdit = null;
    $('arrow-modal').classList.remove('show');
    paintSetup();
  }

  // =========================================================================
  // RUN
  // =========================================================================
  var ADJ = [['command', 'port'], ['command', 'clinic'], ['command', 'finance'], ['command', 'lodging'], ['port', 'vessel'], ['lodging', 'mess'], ['mess', 'finance'], ['finance', 'clinic']];
  function buildSitemap() {
    var box = $('stations'); box.innerHTML = '';
    P.STATIONS.forEach(function (s) {
      var d = document.createElement('div'); d.className = 'station'; d.id = 'st-' + s.id;
      d.style.left = (s.x * 100) + '%'; d.style.top = (s.y * 100) + '%';
      d.innerHTML = '<div class="st-badge" id="badge-' + s.id + '"></div><div class="st-ic">' + s.icon + '</div><div class="st-nm">' + nm(s.name) + '</div><div class="st-ring" id="ring-' + s.id + '"></div>';
      box.appendChild(d);
    });
    // paths between stations (computed from the map's pixel size)
    var map = $('sitemap'), W = map.clientWidth, H = map.clientHeight, paths = $('paths'); paths.innerHTML = '';
    ADJ.forEach(function (e) {
      var a = P.station(e[0]), b = P.station(e[1]);
      var ax = a.x * W, ay = a.y * H, bx = b.x * W, by = b.y * H;
      var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
      var p = document.createElement('div'); p.className = 'path'; p.style.left = ax + 'px'; p.style.top = ay + 'px'; p.style.width = len + 'px'; p.style.transform = 'rotate(' + ang + 'deg)';
      paths.appendChild(p);
    });
    // the 16 hosted guests (served by the 8 staff) — a passive group, not workers
    var pr = P.makeTemplate().project, gt = document.getElementById('guests-tag');
    if (!gt) { gt = document.createElement('div'); gt.id = 'guests-tag'; gt.className = 'guests-tag'; $('sitemap').appendChild(gt); }
    gt.innerHTML = '👥 <b>' + pr.guests + '</b> ' + T().guestsShort;
  }

  function launch() {
    sim = P.createSim({ seed: (Math.floor(Math.random() * 1e9) >>> 0) || 1, overrides: buildCfg().overrides }, daySel);
    paused = false; document.body.classList.add('running');
    $('detail-modal').classList.remove('show'); $('inspect-modal').classList.remove('show'); $('arrow-modal').classList.remove('show');
    speedMult = 1; document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-spd') === '1'); });
    $('setup').classList.add('hidden'); $('report').classList.add('hidden'); $('run').classList.remove('hidden');
    figEls = {}; $('figs').innerHTML = ''; $('banner').classList.remove('show');
    updateRunButtons(); buildSitemap(); renderSim(sim);
    if (timer) clearInterval(timer); timer = setInterval(step, tickMs());
  }
  function restartTimer() { if (timer) { clearInterval(timer); timer = setInterval(step, tickMs()); } }
  function step() {
    if (paused || !sim) return;
    if (sim.paused) return;                       // checkpoint: wait for Resume
    P.tick(sim); renderSim(sim);
    if (sim.paused && sim.checkpoint) openInspector();
    if (sim.finished) finish();
  }

  function layout(s) {
    var pos = {}, bucket = {}; s.stations.forEach(function (st) { bucket[st.id] = []; });
    s.participants.forEach(function (p) { bucket[p.station].push(p); });
    s.stations.forEach(function (st) {
      bucket[st.id].forEach(function (p, i) {
        var col = i % 3, row = Math.floor(i / 3);
        var dx = (col - 1) * 17, dy = 26 + row * 16;
        pos[p.id] = { left: 'calc(' + (st.x * 100) + '% + ' + dx + 'px)', top: 'calc(' + (st.y * 100) + '% + ' + dy + 'px)' };
      });
    });
    return pos;
  }

  function renderSim(s) {
    var pos = layout(s);
    s.participants.forEach(function (p) {
      var el = figEls[p.id];
      if (!el) { el = document.createElement('div'); el.className = 'astro'; el.innerHTML = '<div class="hat"></div><div class="bdy"></div><div class="nm"></div><div class="bub"></div>'; $('figs').appendChild(el); figEls[p.id] = el; el._hat = el.querySelector('.hat'); el._bub = el.querySelector('.bub'); el.querySelector('.nm').textContent = nm(p.name); el._hat.style.borderColor = P.role(p.roleId).color; el._role = p.roleId; }
      var ps = pos[p.id] || { left: '50%', top: '50%' };
      el.style.left = ps.left; el.style.top = ps.top;
      el.className = 'astro s-' + p.state;
      el._bub.textContent = BUB[p.state] || '';
    });
    // stations: crew count + dominant problem badge
    s.stations.forEach(function (st) {
      var ring = $('ring-' + st.id); if (ring) { ring.textContent = st.crewIds.length ? st.crewIds.length : ''; ring.classList.toggle('show', st.crewIds.length > 0); }
      var badge = $('badge-' + st.id), node = $('st-' + st.id);
      var hot = st.dominantProblem && st.crewIds.length;
      if (badge) { badge.textContent = hot ? ('⛔ ' + T()['p_' + st.dominantProblem.id + '_title']) : ''; badge.classList.toggle('show', !!hot); }
      if (node) node.classList.toggle('stalled', !!hot);
    });
    var ban = $('banner'); if (s.bannerOn) { ban.textContent = T().bannerText; ban.classList.add('show'); } else ban.classList.remove('show');
    $('sitemap').classList.toggle('blocked', !!s.bannerOn);
    $('nowtag').textContent = s.mode === 'minute'
      ? T().fdDayLine(hhmm(s.clockMin))
      : T().dayLine(Math.min(P.DAYS, Math.ceil(s.day)), P.DAYS) + (s.phaseLabel ? ' · ' + nm(s.phaseLabel) : '');
    renderDashboard(s);
  }

  function renderDashboard(s) {
    var sc = P.score(s), t = T();
    $('dash-day').textContent = s.mode === 'minute' ? t.fdDayLine(hhmm(s.clockMin)) : T().dayLine(Math.min(P.DAYS, Math.ceil(s.day)), P.DAYS);
    $('dash-phase').textContent = s.phaseLabel ? nm(s.phaseLabel) : '';
    // fishday: Efficiency % beside the grade (§9) + idle/rework minutes
    $('dash-fd').classList.toggle('hidden', s.mode !== 'minute');
    if (s.mode === 'minute') {
      $('dash-eff').textContent = sc.efficiency + '%';
      $('dash-eff-bar').style.width = sc.efficiency + '%';
      $('dash-eff-bar').className = sc.efficiency >= 98 ? 'ok' : (sc.efficiency >= 90 ? 'mid' : 'bad');
      $('dash-idle').textContent = t.idleLine(sc.idleMin, sc.reworkMin);
    }
    $('dash-ready').textContent = sc.score + '%';
    $('dash-ready-bar').style.width = sc.score + '%';
    $('dash-ready-bar').className = sc.score >= 75 ? 'ok' : (sc.score >= 60 ? 'mid' : 'bad');
    var bpct = Math.round(s.budget.spent / s.budget.total * 100);
    $('dash-budget-txt').textContent = '¥' + nf(s.budget.spent) + ' / ¥' + nf(s.budget.total);
    $('dash-budget-bar').style.width = bpct + '%';
    // warnings
    var w = $('dash-warnings');
    if (!s.problems.length) w.innerHTML = '<div class="warn-ok">' + t.noWarnings + '</div>';
    else w.innerHTML = s.problems.map(function (p) {
      return '<div class="warn sev-' + p.severity + '" data-station="' + p.station + '"><span class="warn-ic">' + (p.severity === 'high' ? '⛔' : '⚠️') + '</span>' + t['p_' + p.id + '_title'] + '</div>';
    }).join('');
    // team performance (6 values)
    var team = sc.team;
    var rows = [['action', 'perf-good'], ['decision', 'perf-good'], ['coop', 'perf-good'], ['contribution', 'perf-good'], ['load', 'perf-stress'], ['fatigue', 'perf-stress']];
    var lblK = { action: 'ivAction', decision: 'ivDecision', coop: 'ivCoop', contribution: 'ivContribution', load: 'ivLoad', fatigue: 'ivFatigue' };
    $('dash-perf').innerHTML = rows.map(function (r) {
      var v = team[r[0]];
      return '<div class="perfbar"><div class="pf-top"><span>' + t[lblK[r[0]]] + '</span><b>' + v + '</b></div><div class="pf-bar ' + r[1] + '"><i style="width:' + v + '%"></i></div></div>';
    }).join('');
  }

  function buildLegend() {
    var t = T();
    $('legend').innerHTML =
      '<span class="lg"><span class="lg-dot ok"></span>' + t.legWorking + '</span>' +
      '<span class="lg"><span class="lg-dot bad"></span>' + t.legStuck + '</span>' +
      '<span class="lg">⏳ ' + t.legWaitInfo + '</span>' +
      '<span class="lg">🔁 ' + t.legRework + '</span>' +
      '<span class="lg"><span class="lg-dot done">✓</span>' + t.legResolved + '</span>';
  }
  function updateRunButtons() { $('btn-pause').textContent = paused ? T().resumeBtn : T().pauseBtn; }

  // ---- checkpoint inspector (関所, §8): inspect each member → intervene → resume ----
  function openInspector() {
    if (!sim || !sim.checkpoint) return;
    var t = T(), cp = sim.checkpoint;
    $('insp-title').textContent = t.inspTitle + ' — ' + nm(cp.name);
    $('insp-sub').textContent = t.inspSub + (sim.handFed ? ' · ' + t.handFedNote(sim.handFed) : '');
    $('insp-body').innerHTML = sim.participants.map(function (p) {
      var mi = P.memberInfo(sim, p.id); if (!mi) return '';
      var rr = P.role(p.roleId);
      var held = mi.held.map(function (hc) {
        var c = byId(sim.plan.infoCards, hc.cardId);
        return '<span class="ins-card ok" title="' + hhmm(hc.atMin) + '">' + nm(c ? c.name : hc.cardId).split('：')[0].split(':')[0] + (hc.own ? ' ◉' : ' ' + hhmm(hc.atMin)) + '</span>';
      }).join('');
      var waits = mi.waiting.map(function (w) {
        var c = byId(sim.plan.infoCards, w.cardId);
        return '<span class="ins-card wait">⏳ ' + nm(c ? c.name : w.cardId).split('：')[0].split(':')[0] + ' → ' + hhmm(w.etaMin) +
          ' <button class="btn sm primary ins-send" data-card="' + w.cardId + '" data-role="' + p.roleId + '">' + t.sendNow + '</button></span>';
      }).join('');
      var cur = mi.currentTaskId ? nm(byId(sim.plan.tasks, mi.currentTaskId).name) : '—';
      var nxt = mi.nextTaskId ? nm(byId(sim.plan.tasks, mi.nextTaskId).name) + (mi.nextAtMin != null ? ' (' + hhmm(mi.nextAtMin) + ')' : '') : '—';
      return '<div class="insp-row"><span class="ins-ic2" style="background:' + rr.color + '">' + rr.icon + '</span>' +
        '<div class="ins-main"><b>' + nm(p.name) + '</b><span class="ins-state">' + (BUB[p.state] || '') + ' ' + (t[STATE_KEY[p.state]] || p.state) + '</span>' +
        '<div class="ins-line">' + t.inspNowDoing + ': ' + cur + ' · ' + t.inspNext + ': ' + nxt + '</div>' +
        '<div class="ins-cards">' + held + (waits || '<span class="ins-none">' + t.inspIdleFree + '</span>') + '</div></div></div>';
    }).join('');
    $('inspect-modal').classList.add('show');
  }
  function closeInspector() { $('inspect-modal').classList.remove('show'); if (sim && sim.paused) P.resume(sim); }

  // ---- problem detail panel ----
  function openProblemPanel(stationId) {
    if (!sim) return;
    var st = byId(sim.stations, stationId);
    var p = st ? st.dominantProblem : null, t = T();
    $('detail-ic').textContent = st ? st.icon : '🔍';
    $('detail-title').textContent = st ? nm(st.name) : '';
    if (!p) { $('detail-sub').textContent = ''; $('detail-body').innerHTML = '<div class="dt-note">' + t.detailDecoy + '</div>'; }
    else {
      $('detail-sub').textContent = t['p_' + p.id + '_title'];
      $('detail-body').innerHTML =
        '<div class="dt-sec"><div class="dt-h">' + t.pnCause + '</div><p>' + t['p_' + p.id + '_cause'] + '</p></div>' +
        '<div class="dt-sec"><div class="dt-h">' + t.pnNeeded + '</div><span class="dt-dep bad">' + t['p_' + p.id + '_need'] + '</span></div>' +
        '<div class="dt-sec"><div class="dt-h">' + t.pnFix + '</div><p>' + t['p_' + p.id + '_fix'] + '</p></div>';
    }
    $('detail-modal').classList.add('show');
  }
  function closeDetail() { $('detail-modal').classList.remove('show'); }

  // =========================================================================
  // REPORT
  // =========================================================================
  function finish() {
    clearInterval(timer); timer = null;
    lastResult = { trip: P.score(sim), day: (sim.segment !== 'all' ? P.daySummary(sim) : null), segment: sim.segment };
    setTimeout(function () { document.body.classList.remove('running'); $('run').classList.add('hidden'); $('report').classList.remove('hidden'); renderReport(lastResult); }, 700);
  }

  var CAT_ORDER = ['objective', 'schedule', 'roles', 'info', 'budget', 'safety', 'quality', 'health'];
  var CAT_KEY = { objective: 'catObjective', schedule: 'catSchedule', roles: 'catRoles', info: 'catInfo', budget: 'catBudget', safety: 'catSafety', quality: 'catQuality', health: 'catHealth' };

  function renderReport(res) {
    var t = T(), sc = res.trip, day = res.day, head = day || sc;
    $('r-grade').textContent = head.grade; $('r-grade').style.color = { A: 'var(--build)', B: 'var(--leader)', C: 'var(--idle)', D: 'var(--wait)' }[head.grade];
    if (day) {
      $('r-verdict').textContent = day.clean ? t.rDayDone(dayLabel(res.segment)) : t.rDayGaps(dayLabel(res.segment));
      var perfectD = day.clean && day.grade === 'A';
      var bd = $('r-badge'); bd.textContent = perfectD ? t.badgeDayClean : ''; bd.classList.toggle('show', perfectD);
      $('r-conds').innerHTML = '<span class="cond ' + (day.clean ? 'met' : 'unmet') + '">' + (day.clean ? '✓' : '✗') + ' ' + t.dayTasksLine(day.tasksDone, day.tasksTotal) + '</span>';
      if (res.segment === 'fishday') {
        var perfectFd = sc.efficiency === 100 && sc.idleMin === 0;
        $('r-conds').innerHTML +=
          '<span class="cond ' + (sc.efficiency === 100 ? 'met' : 'unmet') + '">' + t.rcEff(sc.efficiency) + '</span>' +
          '<span class="cond ' + (sc.idleMin === 0 ? 'met' : 'unmet') + '">' + t.rcIdle(sc.idleMin) + '</span>' +
          '<span class="cond ' + (sc.reworkMin === 0 ? 'met' : 'unmet') + '">' + t.rcRework(sc.reworkMin) + '</span>' +
          (sc.wrongFishCount ? '<span class="cond unmet">🐟 ' + t.rcWrongFish(sc.wrongFishCount) + '</span>' : '') +
          (sc.dinnerMin != null ? '<span class="cond ' + (sc.dinnerMin <= 1080 ? 'met' : 'unmet') + '">' + t.rcDinner(hhmm(sc.dinnerMin)) + '</span>' : '') +
          (sc.handFed ? '<span class="cond unmet">' + t.handFedNote(sc.handFed) + '</span>' : '');
      }
    } else {
      $('r-verdict').textContent = sc.reason === 'done' ? t.rDone : t.rIncomplete;
      var perfect = sc.clean && sc.grade === 'A';
      var badge = $('r-badge'); badge.textContent = perfect ? t.badgePerfect : ''; badge.classList.toggle('show', perfect);
      $('r-conds').innerHTML = sc.conditions.map(function (c) {
        return '<span class="cond ' + (c.met ? 'met' : 'unmet') + '">' + (c.met ? '✓' : '✗') + ' ' + nm(c.text) + '</span>';
      }).join('');
    }
    // overall trip scorecard (8 categories) — the whole plan; improves as you fix any day
    $('scorecard').innerHTML = CAT_ORDER.map(function (k) {
      var val = sc.categories[k], max = P.CAT_MAX[k], pct = Math.round(val / max * 100);
      return '<div class="pillar"><div class="pl-top"><span>' + t[CAT_KEY[k]] + '</span><b>' + val + '<small>/' + max + '</small></b></div><div class="pl-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
    // fix-pack: the rehearsed day's gaps (or all gaps for a whole-trip run)
    var fixes = day ? day.fixes : sc.fixes;
    if (!fixes.length) $('fixpack').innerHTML = '<div class="fix-clean">' + (day ? t.fixpackCleanDay(dayLabel(res.segment)) : t.fixpackClean) + '</div>';
    else $('fixpack').innerHTML = fixes.map(function (f) {
      return '<div class="fix-row sev-' + f.severity + '"><div class="fix-main"><div class="fix-title">' + (f.severity === 'high' ? '⛔ ' : '⚠️ ') + t['p_' + f.id + '_title'] + '</div>' +
        '<div class="fix-body">' + t['p_' + f.id + '_fix'] + '</div></div>' +
        '<button class="btn sm primary fix-apply" data-fix="' + f.fixId + '">' + t.applyFixBtn + '</button></div>';
    }).join('');
    // individuals table
    var head = ['ivName', 'ivAction', 'ivDecision', 'ivLoad', 'ivFatigue', 'ivCoop', 'ivContribution'];
    var th = '<tr>' + head.map(function (h) { return '<th>' + t[h] + '</th>'; }).join('') + '</tr>';
    var rows = sc.individuals.map(function (iv) {
      function td(v, stress) { var bad = stress ? v >= 70 : v < 50; return '<td class="' + (bad ? 'iv-bad' : '') + '">' + v + '</td>'; }
      return '<tr><td class="iv-name"><span class="iv-ic">' + P.role(iv.roleId).icon + '</span>' + nm(iv.name) + '</td>' +
        td(iv.action) + td(iv.decision) + td(iv.load, true) + td(iv.fatigue, true) + td(iv.coop) + td(iv.contribution) + '</tr>';
    }).join('');
    $('individuals').innerHTML = th + rows;
  }

  function applyFixAndRerun(fixId) { if (fixId && fixed.hasOwnProperty(fixId)) fixed[fixId] = true; launch(); }

  // =========================================================================
  // RULES
  // =========================================================================
  function buildRules() {
    var t = T(), secs = [['rConceptT', 'rConceptB'], ['rRunT', 'rRunB'], ['rGapsT', 'rGapsB'], ['rFixT', 'rFixB'], ['rScoreT', 'rScoreB']];
    $('rules-body').innerHTML = secs.map(function (s) { return '<div class="rule"><h3>' + t[s[0]] + '</h3><p>' + t[s[1]] + '</p></div>'; }).join('');
  }

  // =========================================================================
  // EVENTS
  // =========================================================================
  function toSetup() {
    if (timer) { clearInterval(timer); timer = null; }
    sim = null; paused = false; document.body.classList.remove('running');
    $('detail-modal').classList.remove('show');
    $('report').classList.add('hidden'); $('run').classList.add('hidden'); $('setup').classList.remove('hidden');
    paintSetup();
  }

  function bind() {
    document.querySelectorAll('.lang button').forEach(function (b) { b.addEventListener('click', function () { L = b.getAttribute('data-lang'); applyLang(); }); });
    $('rules-open').addEventListener('click', function () { $('rules-modal').classList.add('show'); });
    $('rules-close').addEventListener('click', function () { $('rules-modal').classList.remove('show'); });
    $('rules-modal').addEventListener('click', function (e) { if (e.target === $('rules-modal')) $('rules-modal').classList.remove('show'); });

    $('day-select').addEventListener('click', function (e) { var b = e.target.closest('.day-btn'); if (b) { daySel = b.dataset.day; paintSetup(); } });
    $('editors').addEventListener('change', function (e) { var s = e.target.closest('.ed-sel'); if (s) { fixed[s.dataset.fix] = (s.value === 'on'); updatePlanUI(); } });
    $('btn-auto').addEventListener('click', function () { for (var k in fixed) fixed[k] = true; fdReset(); paintSetup(); });
    $('btn-clear').addEventListener('click', function () { for (var k in fixed) fixed[k] = false; fdReset(); paintSetup(); });
    $('launch').addEventListener('click', launch);

    // fishday editor: drag blocks / draw & edit arrows (§7)
    $('fd-canvas').addEventListener('pointerdown', fdPointerDown);
    document.addEventListener('pointermove', fdPointerMove);
    document.addEventListener('pointerup', fdPointerUp);
    $('fd-canvas').addEventListener('click', function (e) { var p = e.target.closest && e.target.closest('path[data-h]'); if (p) openArrowPanel(p.getAttribute('data-h')); });
    $('fd-arrowlist').addEventListener('click', function (e) { var c = e.target.closest('.fd-ar-chip'); if (c) openArrowPanel(c.dataset.h); });
    $('ar-body') && $('arrow-modal').addEventListener('change', function (e) { if (e.target.closest('.ar-sel') || e.target.closest('.ar-time')) arrowPatch(); });
    $('ar-delete').addEventListener('click', arrowErase);
    $('ar-close').addEventListener('click', function () { arrowEdit = null; $('arrow-modal').classList.remove('show'); });
    $('arrow-modal').addEventListener('click', function (e) { if (e.target === $('arrow-modal')) { arrowEdit = null; $('arrow-modal').classList.remove('show'); } });

    // checkpoint inspector (§8)
    $('insp-body').addEventListener('click', function (e) {
      var b = e.target.closest('.ins-send'); if (!b || !sim) return;
      P.intervene(sim, b.dataset.card, b.dataset.role);
      openInspector();
    });
    $('insp-resume').addEventListener('click', closeInspector);
    $('inspect-modal').addEventListener('click', function (e) { if (e.target === $('inspect-modal')) closeInspector(); });

    $('btn-pause').addEventListener('click', function () { paused = !paused; updateRunButtons(); });
    $('btn-quit').addEventListener('click', function () { if (sim && !sim.finished) { sim.finished = sim.finished || 'incomplete'; finish(); } });
    $('stations').addEventListener('click', function (e) { var st = e.target.closest('.station'); if (st) openProblemPanel(st.id.replace('st-', '')); });
    $('dash-warnings').addEventListener('click', function (e) { var w = e.target.closest('.warn'); if (w && w.dataset.station) openProblemPanel(w.dataset.station); });
    $('detail-close').addEventListener('click', closeDetail);
    $('detail-modal').addEventListener('click', function (e) { if (e.target === $('detail-modal')) closeDetail(); });

    $('fixpack').addEventListener('click', function (e) { var b = e.target.closest('.fix-apply'); if (b) applyFixAndRerun(b.dataset.fix); });
    $('btn-tweak').addEventListener('click', toSetup);
    $('btn-again').addEventListener('click', launch);

    document.querySelectorAll('.spd').forEach(function (b) { b.addEventListener('click', function () { speedMult = parseFloat(b.dataset.spd); document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x === b); }); restartTimer(); }); });
  }

  // ---- init ----
  bind(); applyLang();
})();
