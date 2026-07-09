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
  // Mission Control board edits: budget envelopes, usable reserves, and resource counts.
  var mcOv = { lines: {}, resources: {}, reserve: null };
  function mcReset() { mcOv = { lines: {}, resources: {}, reserve: null }; }
  function mcClearFixConflicts(fixId) {
    if (fixId === 'grantAuth') delete mcOv.lines.bl_meals;
    if (fixId === 'fixReserve') { mcOv.reserve = null; if (mcOv.resources.res_cash) delete mcOv.resources.res_cash; }
  }
  // Org chart seat assignment: overrides.seats = {roleId: pid}, a bijection over the 8 co_aibos
  // organizer seats (p01-p08). Identity = the template's default holders, so an untouched org
  // chart adds NOTHING to cfg.overrides (byte-identical-default invariant, mirrors mcOv/dayOv).
  var orgOv = { owner: 'p01', pm: 'p02', siteLead: 'p03', budgetLead: 'p04', safetyLead: 'p05', logi: 'p06', comms: 'p07', specialist: 'p08' };
  function isDefaultSeats() {
    var def = { owner: 'p01', pm: 'p02', siteLead: 'p03', budgetLead: 'p04', safetyLead: 'p05', logi: 'p06', comms: 'p07', specialist: 'p08' };
    for (var r in def) if (orgOv[r] !== def[r]) return false;
    return true;
  }
  function orgSeatReset() { orgOv = { owner: 'p01', pm: 'p02', siteLead: 'p03', budgetLead: 'p04', safetyLead: 'p05', logi: 'p06', comms: 'p07', specialist: 'p08' }; }
  // §20 authorable-days editor state — ONE deck→arrange→connect override store for all four
  // day tabs. Fishday's sub-object keeps the LEGACY timing/staffing/handoffs channels (so its
  // verify/E2E anchors stay byte-identical); arrival/ops/return use the unified placement/handoffs
  // schema that buildCfg folds into overrides.days[seg] (§20.3).
  function freshDayOv(seg) { return seg === 'fishday' ? { timing: {}, staffing: {}, handoffs: {} } : { placement: {}, handoffs: {} }; }
  var dayOv = { arrival: freshDayOv('arrival'), ops: freshDayOv('ops'), 'return': freshDayOv('return'), fishday: freshDayOv('fishday') };
  // Reset ALL four days (not just fishday) — "Reset to gappy" / "Auto-fix all" must clear coarse-day
  // deck authoring too, or a hand-authored arrival/ops/return arrangement would survive underneath a
  // reset button that visibly claims to start over.
  function fdReset() { dayOv = { arrival: freshDayOv('arrival'), ops: freshDayOv('ops'), 'return': freshDayOv('return'), fishday: freshDayOv('fishday') }; }
  // fixHandoffs must win over stale hand-edits/erasures of the canonical arrows,
  // or the fix-pack button would appear to do nothing (the hand-edit re-breaks it).
  // ANY block re-timing can re-break the zero-idle anchor through the dep chain
  // (engine contract: fixHandoffs returns the fishday to its anchor no matter what
  // the editor did) — so applying the fix resets every fishday timing edit too.
  function fdClearFixConflicts() {
    dayOv.fishday.timing = {};
    P.canonHandoffs().forEach(function (h) {
      if (dayOv.fishday.handoffs.hasOwnProperty(h.id)) delete dayOv.fishday.handoffs[h.id];
    });
  }
  function buildCfg() {
    var cfg = { seed: 1, overrides: {} }, k;
    DETS.forEach(function (d) { if (fixed[DET_FIX[d]]) cfg = P.applyFix(cfg, DET_FIX[d]); });
    var o = cfg.overrides;
    if (mcOv.reserve != null || Object.keys(mcOv.lines).length || Object.keys(mcOv.resources).length) {
      o.budget = o.budget || {};
      if (mcOv.reserve != null) o.budget.reserve = mcOv.reserve;
      for (k in mcOv.lines) { ((o.budget.lines = o.budget.lines || {})[k] = o.budget.lines[k] || {}); Object.assign(o.budget.lines[k], mcOv.lines[k]); }
      for (k in mcOv.resources) { ((o.budget.resources = o.budget.resources || {})[k] = o.budget.resources[k] || {}); Object.assign(o.budget.resources[k], mcOv.resources[k]); }
    }
    for (k in dayOv.fishday.timing) { (o.timing = o.timing || {})[k] = dayOv.fishday.timing[k]; }
    for (k in dayOv.fishday.staffing) { (o.staffing = o.staffing || {})[k] = dayOv.fishday.staffing[k]; }
    for (k in dayOv.fishday.handoffs) { (o.handoffs = o.handoffs || {})[k] = dayOv.fishday.handoffs[k]; }
    ['arrival', 'ops', 'return'].forEach(function (seg) {
      var ov = dayOv[seg], hasP = Object.keys(ov.placement).length, hasH = Object.keys(ov.handoffs).length;
      if (!hasP && !hasH) return;
      o.days = o.days || {}; var od = o.days[seg] = o.days[seg] || {};
      if (hasP) { od.placement = od.placement || {}; for (k in ov.placement) od.placement[k] = ov.placement[k]; }
      if (hasH) { od.handoffs = od.handoffs || {}; for (k in ov.handoffs) od.handoffs[k] = ov.handoffs[k]; }
    });
    if (!isDefaultSeats()) { o.seats = {}; for (k in orgOv) o.seats[k] = orgOv[k]; }
    return cfg;
  }
  function currentPlan() { return P.mergePlan(buildCfg()); }
  function activeProblemIds() { return P.detect(currentPlan()).map(function (p) { return p.id; }); }
  function hhmm(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m; }

  var sim = null, timer = null, paused = false, BASE_TICK = 520, speedMult = 1, lastResult = null;
  var appMode = 'live', runFn = null, livePausedForFix = false, liveState = null;
  var finishTimer = null;                  // finish()'s 700ms report reveal — cleared on any screen change
  var morningSnap = null;                  // the Morning-authored plan, preserved across a Live detour
  var lastDetailStation = null;            // so a language switch can re-render an open problem panel
  var RM = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
  function tickMs() { return Math.round(BASE_TICK / speedMult); }
  function clearFinishTimer() { if (finishTimer) { clearTimeout(finishTimer); finishTimer = null; } }

  var BUB = { confused: '❓', meeting: '💬', waiting: '⏳', tired: '😣', onFire: '🔥', resolved: '✅', working: '', idle: '', waitInfo: '⏳', rework: '🔁' };
  var STATE_KEY = { working: 'stWorking', confused: 'stConfused', meeting: 'stMeeting', waiting: 'stWaiting', tired: 'stTired', onFire: 'stOnFire', resolved: 'stResolved', idle: 'stIdle', waitInfo: 'stWaitInfo', rework: 'stRework' };

  // =========================================================================
  // i18n apply
  // =========================================================================
  function applyLang() {
    document.documentElement.lang = L;
    document.querySelectorAll('[data-i18n]').forEach(function (el) { var v = T()[el.getAttribute('data-i18n')]; if (typeof v === 'string') el.textContent = v; });
    $('lang-en').classList.toggle('on', L === 'en'); $('lang-ja').classList.toggle('on', L === 'ja');
    updateRunButtons();   // keep the pause/guests/drawer imperative labels (and aria-labels) in sync with the language
    paintSetup(); buildRules(); buildLegend();
    if (!$('intro').classList.contains('hidden')) renderIntro();   // intro-how (HTML) + cast grid re-render in the new language
    // mid-run: rebuild station labels but keep every walker where it stands (no teleport)
    if (!$('run').classList.contains('hidden') && sim && anim) { buildSitemap(true); renderSim(sim); }
    if (appMode === 'live' && liveState && !$('run').classList.contains('hidden')) {
      renderLivePanel();
      if (livePausedForFix && liveState.currentGap) paintGapFocus(liveState.currentGap);   // keep the freeze visuals
    }
    if (!$('report').classList.contains('hidden') && lastResult) renderReport(lastResult);
    // open modals re-render in the new language (their content is built, not data-i18n)
    if ($('inspect-modal').classList.contains('show')) openInspector();
    if ($('arrow-modal').classList.contains('show') && arrowEdit) openArrowPanel(arrowEdit);
    if ($('detail-modal').classList.contains('show') && lastDetailStation) openProblemPanel(lastDetailStation);
  }

  // =========================================================================
  // SETUP
  // =========================================================================
  function paintSetup() { buildDaySelect(); buildCanvas(); buildOrg(); buildTimeline(); buildMissionControl(); buildEditors(); buildDayGrid(); updatePlanUI(); }

  function buildDaySelect() {
    var box = $('day-select'); if (!box) return;
    var opts = ['arrival', 'ops', 'fishday', 'return', 'all'];   // chronological display order
    box.innerHTML = opts.map(function (seg) {
      var n = dayGapCount(seg), clean = n === 0;
      return '<button class="day-btn' + (seg === daySel ? ' on' : '') + '" data-day="' + seg + '">' +
        '<span class="db-name">' + dayLabel(seg) + '</span>' +
        '<span class="db-gaps ' + (clean ? 'ok' : 'bad') + '">' + (clean ? '✓' : n + ' ' + (n === 1 ? T().fixGapLbl : T().fixGapLblN)) + '</span></button>';
    }).join('');
  }

  function buildCanvas() {
    var pl = P.makeTemplate(), pr = pl.project, t = T();
    $('c-name').textContent = nm(pr.name);
    var g = $('canvas-grid');
    g.innerHTML =
      cell('🎯', t.cvGoal, nm(pr.goal), true) +
      cell('📅', t.cvDays, pr.days + ' ' + t.cvDaysUnit) +
      cell('📍', t.cvLocation, nm(pr.location)) +
      cell('👥', t.cvHeadcount, pr.headcount + ' (' + t.cvHeadcountNote(pr.staff, pr.guests, pr.chefs) + ')') +
      cell('💴', t.cvBudget, '¥' + nf(pl.budget.total)) +
      cell('⚠️', t.cvConstraints, pr.constraints.map(nm).join(' · '), true);
    $('c-conds').innerHTML = '<div class="conds-h">' + t.cvSuccess + '</div>' +
      pr.successConditions.map(function (c) { return '<span class="cond">• ' + nm(c.text) + '</span>'; }).join('');
    function cell(ic, lbl, val, wide) { return '<div class="cv-cell' + (wide ? ' wide' : '') + '"><span class="cv-ic">' + ic + '</span><span class="cv-lbl">' + lbl + '</span><span class="cv-val">' + val + '</span></div>'; }
  }

  // options for the org-chart seat <select>s: the 8 co_aibos organizers only (chefs/guests excluded)
  function personOpts(selPid) {
    var people = currentPlan().participants.filter(function (p) { return p.company === 'co_aibos'; });
    return people.map(function (p) { return '<option value="' + p.id + '"' + (p.id === selPid ? ' selected' : '') + '>' + nm(p.name) + '</option>'; }).join('');
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
      var isSeat = orgOv.hasOwnProperty(rid);
      var body = isSeat
        ? ('<b>' + nm(rr.name) + '</b><select class="org-sel mc-sel" data-role="' + rid + '" aria-label="' + nm(rr.name) + '">' + personOpts(orgOv[rid]) + '</select>' + (dep ? '<small>⇄ ' + nm(dep.name) + '</small>' : ''))
        : ('<b>' + nm(rr.name) + '</b><small>' + (holder ? nm(holder.name) : '—') + (dep ? ' · ⇄ ' + nm(dep.name) : '') + '</small>');
      chip.innerHTML = '<span class="rc-ic" style="background:' + rr.color + '">' + rr.icon + '</span><span class="rc-body">' + body + '</span>';
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

  function roleOpts(val, allowNone) {
    var html = allowNone ? '<option value="">—</option>' : '';
    ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'specialist', 'chef'].forEach(function (rid) {
      html += '<option value="' + rid + '"' + (val === rid ? ' selected' : '') + '>' + P.role(rid).icon + ' ' + nm(P.role(rid).name) + '</option>';
    });
    return html;
  }
  function payOpts(val) {
    return ['cash', 'card', 'invoice'].map(function (m) { return '<option value="' + m + '"' + (val === m ? ' selected' : '') + '>' + T()['pay_' + m] + '</option>'; }).join('');
  }
  function buildMissionControl() {
    var box = $('mission-control'); if (!box) return;
    var plan = currentPlan(), br = P.budgetReadiness(plan), t = T();
    var gapCount = br.gaps.length + br.events.filter(function (ev) { return !ev.ok; }).length + br.resources.filter(function (r) { return !r.ok; }).length;
    var roles = ['budgetLead', 'logi', 'siteLead', 'chef', 'safetyLead', 'comms'];
    var people = roles.map(function (rid) {
      var rr = P.role(rid), ro = plan.roles[rid], pp = ro && ro.holder ? byId(plan.participants, ro.holder) : null;
      var auth = ro && ro.authority ? (ro.authority.canPay ? t.mcCanPay(nf(ro.authority.payCap === Infinity ? plan.budget.total : ro.authority.payCap)) : t.mcNoPay) : '';
      return '<div class="mc-person"><span class="mc-role" style="background:' + rr.color + '">' + rr.icon + '</span><b>' + nm(rr.name) + '</b><small>' + (pp ? nm(pp.name) : '—') + ' · ' + auth + '</small></div>';
    }).join('');
    var envelopes = br.envelopes.map(function (ln) {
      return '<div class="mc-env' + (ln.ok ? '' : ' bad') + '" data-line="' + ln.id + '">' +
        '<div class="mc-env-top"><b>' + nm(ln.name) + '</b><span>¥' + nf(ln.cap) + '</span></div>' +
        '<label>' + t.mcApprover + '<select class="mc-sel" data-mc="line" data-line="' + ln.id + '" data-field="approverRoleId">' + roleOpts(ln.approverRoleId || '', true) + '</select></label>' +
        '<label>' + t.mcPayMethod + '<select class="mc-sel" data-mc="line" data-line="' + ln.id + '" data-field="payMethod">' + payOpts(ln.payMethod || 'cash') + '</select></label>' +
        '<div class="mc-note">' + t.mcReceipt + ': ' + (t['receipt_' + ln.receiptRule] || ln.receiptRule) + '</div></div>';
    }).join('');
    var resources = br.resources.map(function (r) {
      var pct = Math.max(0, Math.min(100, Math.round(r.planned / Math.max(1, r.target) * 100)));
      return '<div class="mc-res' + (r.ok ? '' : ' bad') + '"><div class="mc-res-top"><b>' + nm(r.name) + '</b><span>' + nf(r.planned) + ' / ' + nf(r.target) + ' ' + nm(r.unit) + '</span></div>' +
        '<input class="mc-range" type="range" min="0" max="' + Math.max(r.target * 2, r.planned, 1) + '" step="' + (r.unit.en === 'yen' ? 10000 : 1) + '" value="' + r.planned + '" data-mc="resource" data-resource="' + r.id + '">' +
        '<div class="mc-res-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
    var events = br.events.map(function (ev) {
      var line = br.envelopes.filter(function (ln) { return ln.id === ev.lineId; })[0];
      return '<div class="mc-spend' + (ev.ok ? '' : ' bad') + '"><b>' + nm(ev.name) + '</b><span>¥' + nf(ev.amount) + ' · ' + (line ? nm(line.name) : ev.lineId) + ' · ' + T()['pay_' + ev.requiredMethod] + '</span>' +
        '<small>' + (ev.ok ? t.mcSpendOk : t.mcSpendBlocked) + '</small></div>';
    }).join('');
    box.innerHTML =
      '<div class="mc-status ' + (gapCount ? 'bad' : 'ok') + '"><b>' + (gapCount ? t.mcStatusBad(gapCount) : t.mcStatusOk) + '</b><span>' + t.mcStatusSub + '</span></div>' +
      '<div class="mc-grid"><section><h3>' + t.mcPeople + '</h3><div class="mc-people">' + people + '</div></section>' +
      '<section><h3>' + t.mcEnvelopes + '</h3><div class="mc-envs">' + envelopes + '</div></section>' +
      '<section><h3>' + t.mcResources + '</h3><div class="mc-resources">' + resources + '</div></section>' +
      '<section><h3>' + t.mcSpendDrills + '</h3><div class="mc-spends">' + events + '</div></section></div>';
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
        '<details class="ed-more" id="cause-' + d + '"><summary>' + t.whyBtn + '</summary><div>' + t['p_' + d + '_cause'] + '</div></details>' +
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
      if (chip) { chip.textContent = isOpen ? ('⛔ ' + t.gapChip) : '✓'; chip.className = 'ed-chip ' + (isOpen ? 'bad' : 'ok'); }
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
    buildMissionControl();
    buildDayGrid();
  }

  // =========================================================================
  // DAY EDITOR — ONE deck→arrange→connect editor for all four day tabs (§20).
  // Fishday keeps its per-participant minute-level authoring exactly as before;
  // Arrival/Ops/Return now share the identical renderer + drag/wire machinery,
  // reading P.tasksForSeg/P.handoffsForSeg and writing dayOv[seg] (§20.3).
  // =========================================================================
  var PXM = 0.8, FD_T0 = P.DAY_START_MIN, FD_T1 = P.DAY_END_MIN, LANE_H = 40, LBL_W = 108, RULER_H = 26;
  var fdDrag = null, fdWire = null, fdGhost = null, arrowEdit = null, arrowEditSeg = null, placingChip = null, fdUid = 1, fdLastProj = {};
  // AoE-style resource-tick: float a "+N" over the projection when a fix raises the score
  function floatDelta(host, txt, cls) {
    if (!host) return;
    var f = document.createElement('span'); f.className = 'score-float ' + (cls || 'up'); f.textContent = txt;
    host.appendChild(f); setTimeout(function () { if (f.parentNode) f.parentNode.removeChild(f); }, 1000);
  }
  // per-seg authoring window + placement snap (§20.1: fishday 15 min, others 60)
  function segWin(seg) { return P.DAY_WINDOWS[seg] || [P.DAY_START_MIN, P.DAY_END_MIN]; }
  function segSnap(seg) { return P.SNAP_MIN[seg] || 60; }
  function fdX(min) { var w = segWin(daySel); return LBL_W + (min - w[0]) * PXM; }
  function fdMin(x) { var w = segWin(daySel), sn = segSnap(daySel); return clamp(Math.round(((x - LBL_W) / PXM + w[0]) / sn) * sn, w[0], w[1]); }
  function cardOwnerOf(plan, cid) { var c = byId(plan.infoCards, cid); return c ? c.ownerRoleId : null; }
  // fishday-only producer lookup (Live mode's gap flow depends on this exact — plan.tasks, day==='fishday' — shape)
  function producerOf(plan, cid) { for (var i = 0; i < plan.tasks.length; i++) { var t = plan.tasks[i]; if (t.day === 'fishday' && (t.produces || []).indexOf(cid) >= 0) return t; } return null; }
  function fdBlockGeo(plan, tk) {
    var lane = 0; plan.participants.forEach(function (pp, i) { if (pp.id === tk.assignedIds[0]) lane = i; });
    return { x: fdX(tk.startMin), w: Math.max(10, tk.durMin * PXM), y: RULER_H + lane * LANE_H + 7 };
  }

  // ---- seg-scoped info-flow lens (mirrors engine.js's resolveSendMin/staticArrival/infoArrival,
  // but resolved against P.tasksForSeg/P.handoffsForSeg so it's correct for the coarse days too —
  // for seg==='fishday' these read the exact same plan.tasks/plan.handoffs data, byte-identical). ----
  function producerInSeg(segT, cid) { for (var i = 0; i < segT.length; i++) if ((segT[i].produces || []).indexOf(cid) >= 0) return segT[i]; return null; }
  // An UNPLACED producer must resolve to null here, exactly like engine.js's daySchedule (whose
  // fdById only contains PLACED tasks) — otherwise an unplaced task's stale startMin/durMin would
  // still paint its outgoing arrow/socket on-time-green in the editor while the engine (dayReadiness/
  // score) already scores that same handoff as MISSING. P.isPlaced is the shared placement test.
  function sendMinInSeg(segT, h) {
    var t;
    if (h.trigger.type === 'atMinute') return (typeof h.trigger.value === 'number' && isFinite(h.trigger.value)) ? h.trigger.value : null;
    if (h.trigger.type === 'onTaskDone') { t = byId(segT, h.trigger.taskId); return (t && P.isPlaced(t) && typeof t.startMin === 'number') ? (t.startMin + t.durMin) : null; }
    if (h.trigger.type === 'beforeTaskStart') { t = byId(segT, h.trigger.taskId || h.toTaskId); return (t && P.isPlaced(t) && typeof t.startMin === 'number') ? (t.startMin - (h.trigger.leadMin || 0)) : null; }
    return null;
  }
  function arrivalInSeg(segT, h) { var s = sendMinInSeg(segT, h); return s == null ? null : s + (P.CHANNELS[h.channel] || 0); }
  function arrowsToInSeg(segH, roleId, cid) { var out = []; segH.forEach(function (h) { if (h.cardId === cid && h.toRoleId === roleId) out.push(h); }); return out; }
  function infoArrivalSeg(segT, segH, cid, roleId) {
    var hs = arrowsToInSeg(segH, roleId, cid), best = null;
    hs.forEach(function (h) { var a = arrivalInSeg(segT, h); if (a != null && (best == null || a < best)) best = a; });
    return best;
  }
  function feedArrowInSeg(segH, segT, toTaskId, cardId) {
    var to = byId(segT, toTaskId), best = null, bestArr = Infinity, bestTask = null, bestTaskArr = Infinity;
    if (!to) return null;
    segH.forEach(function (h) {
      if (h.cardId !== cardId || h.toRoleId !== to.ownerRoleId) return;
      var a = arrivalInSeg(segT, h);
      if (a == null) return;
      if (h.toTaskId === toTaskId && a < bestTaskArr) { bestTaskArr = a; bestTask = h; }
      if (a < bestArr) { bestArr = a; best = h; }
    });
    return bestTask || best;
  }
  function producedAtSeg(segT, h) { var from = byId(segT, h.fromTaskId); return (from && P.isPlaced(from)) ? from.startMin + from.durMin : segWin(daySel)[0]; }

  // ---- unified placement write-through: fishday keeps the legacy timing/staffing channels,
  // arrival/ops/return use the placement schema (§20.3, buildCfg folds both into their own
  // overrides channel). This is the ONE place that branches by seg for block placement. ----
  function writeMove(taskId, startMin, durMin, assignedIds) {
    if (daySel === 'fishday') dayOv.fishday.timing[taskId] = { startMin: startMin, durMin: durMin };
    else dayOv[daySel].placement[taskId] = { startMin: startMin, durMin: durMin, assignedIds: (assignedIds || []).slice() };
  }
  // Day 3 (fishday) is NEVER deck-authorable — its puzzle is block-timing + info-arrows only, so a
  // fishday task's crew can never become []. Deck/unplace/Clear-day/drag-to-deck/Delete are coarse-
  // day-only capabilities (arrival/ops/return); a fishday call here is a deliberate no-op.
  function writeUnplace(taskId) {
    if (daySel === 'fishday') return;
    dayOv[daySel].placement[taskId] = null;
  }
  function writePlace(taskId, startMin, durMin, personId) {
    if (daySel === 'fishday') { dayOv.fishday.staffing[taskId] = [personId]; dayOv.fishday.timing[taskId] = { startMin: startMin, durMin: durMin }; }
    else dayOv[daySel].placement[taskId] = { startMin: startMin, durMin: durMin, assignedIds: [personId] };
  }

  // ---- Task Deck rail (#fd-deck): every unplaced task (required + decoys) for the active seg.
  // Placed tasks are never in the deck; decoys render identically to required ones (no visual
  // tell) except a small .req badge marks the ones the day actually needs. ----
  function buildDeck() {
    var box = $('fd-deck'); if (!box) return;
    var wrap = $('fd-wrap');
    // fishday is never deck-authorable (§20 Fix A) — no deck rail, fishday's canvas runs full-width.
    if (daySel === 'fishday') { box.innerHTML = ''; box.classList.add('hidden'); if (wrap) wrap.classList.add('no-deck'); return; }
    box.classList.remove('hidden'); if (wrap) wrap.classList.remove('no-deck');
    var t = T(), seg = daySel, plan = currentPlan(), deck = P.deckFor(plan, seg), segT = P.tasksForSeg(plan, seg);
    var reqUnplaced = deck.unplaced.filter(function (id) { return deck.required.indexOf(id) >= 0; }).length;
    var chips = deck.unplaced.map(function (id) {
      var tk = byId(segT, id); if (!tk) return '';
      var req = deck.required.indexOf(id) >= 0, rr = P.role(tk.ownerRoleId);
      return '<div class="fd-chip' + (req ? ' req' : '') + (placingChip === id ? ' placing' : '') + '" tabindex="0" role="button" data-task="' + id + '" title="' + nm(tk.name) + '">' +
        '<span class="fd-chip-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
        '<span class="fd-chip-name">' + nm(tk.name) + '</span>' +
        '<span class="fd-chip-dur">' + Math.round(tk.durMin) + t.minAbbrev + '</span>' +
        (req ? '<i class="fd-chip-req-badge" title="' + t.deckRequired + '"></i>' : '') + '</div>';
    }).join('');
    box.innerHTML = '<div class="dash-lbl fd-deck-title">' + t.deckTitle + '</div>' +
      '<div class="fd-deck-count">' + t.deckCount(reqUnplaced) + '</div>' +
      '<div class="fd-deck-chips">' + (chips || '<span class="pr-item ok">' + t.deckEmpty + '</span>') + '</div>';
  }

  function buildDayGrid() {
    var card = $('fd-card'); if (!card) return;
    if (daySel === 'all') { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    var seg = daySel, t0 = T(), plan = currentPlan();
    var segT = P.tasksForSeg(plan, seg), segH = P.handoffsForSeg(plan, seg), fd = P.daySchedule(plan, seg);
    if (seg === 'fishday') { $('fd-title').textContent = t0.fdTitle; $('fd-hint').textContent = t0.fdHint; }
    else { $('fd-title').textContent = t0.dayGridTitle(dayLabel(seg)); $('fd-hint').textContent = t0.dayGridHint; }
    $('fd-arrows-lbl').textContent = t0.fdArrowsLbl;
    // Reset the button's visual AND the real armed flag (dataset.armed) on every repaint, or an
    // armed-then-edited "Clear day" fires on a single unconfirmed click (§20 Fix C) — the two must
    // never desync. Fishday never shows Clear-day at all (§20 Fix A: timing+arrows only, no deck).
    var cb = $('fd-clear-day');
    if (cb) {
      cb.classList.remove('armed'); cb.dataset.armed = ''; cb.textContent = t0.clearDayBtn;
      cb.classList.toggle('hidden', seg === 'fishday');
    }
    buildDeck();
    var win = segWin(seg), lanes = plan.participants;
    var W = fdX(win[1]) + 16, H = RULER_H + lanes.length * LANE_H + 6, html = '';
    for (var m = win[0]; m <= win[1]; m += 60) html += '<div class="fd-tick" style="left:' + fdX(m) + 'px">' + hhmm(m) + '</div>';
    lanes.forEach(function (pp, i) {
      var rr = P.role(pp.roleId), top = RULER_H + i * LANE_H;
      html += '<div class="fd-lane" style="top:' + top + 'px;width:' + W + 'px"></div>' +
        '<div class="fd-lbl" style="top:' + top + 'px"><span class="fd-lbl-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' + nm(pp.name) + '</div>';
    });
    segT.forEach(function (tk) {
      if (!tk.assignedIds.length) return;                  // unplaced tasks live in the deck, not the canvas
      var g = fdBlockGeo(plan, tk), e = fd.byTask[tk.id];
      var sock = '';
      (tk.neededInfo || []).forEach(function (cid, si) {
        if (cardOwnerOf(plan, cid) === tk.ownerRoleId) return;
        var arr = infoArrivalSeg(segT, segH, cid, tk.ownerRoleId);
        var cls = arr == null ? 'miss' : (arr <= tk.startMin ? 'ok' : 'late');
        sock += '<span class="fd-socket ' + cls + '" tabindex="0" role="button" data-task="' + tk.id + '" data-card="' + cid + '" style="top:' + (si * 11 + 1) + 'px" title="● ' + nm(byId(plan.infoCards, cid).name) + '"></span>';
      });
      var port = (tk.produces || []).length ? '<span class="fd-port" data-task="' + tk.id + '" data-card="' + tk.produces[0] + '" title="○ ' + nm(byId(plan.infoCards, tk.produces[0]).name) + '"></span>' : '';
      var multi = tk.assignedIds.length > 1 ? '<i class="fd-x">×' + tk.assignedIds.length + '</i>' : '';
      html += '<div class="fd-block' + (g.w < 60 ? ' sm' : '') + (e && e.wrongFish ? ' wf' : '') + '" tabindex="0" data-task="' + tk.id + '" style="left:' + g.x + 'px;top:' + g.y + 'px;width:' + g.w + 'px" title="' + nm(tk.name) + '  ' + hhmm(tk.startMin) + '–' + hhmm(tk.startMin + tk.durMin) + '">' +
        sock + '<span class="fd-bname">' + P.station(tk.station).icon + (g.w >= 60 ? ' ' + nm(tk.name) : '') + '</span>' + multi + port + '<span class="fd-rsz"></span></div>';
    });
    var box = $('fd-canvas');
    box.style.width = W + 'px'; box.style.height = H + 'px';
    box.innerHTML = html + '<svg class="fd-arrows" id="fd-arrows" width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '"></svg>';
    // keep the lane labels pinned if the timeline is already panned
    var sc2 = $('fd-scroll');
    if (sc2 && sc2.scrollLeft) box.querySelectorAll('.fd-lbl').forEach(function (lb) { lb.style.transform = 'translateX(' + sc2.scrollLeft + 'px)'; });
    drawFdArrows(plan, seg);
    buildFdArrowList(plan, seg);
    buildFdReady(plan, fd, seg);
    if (placingChip) renderDropSlots();                    // keep the tap-to-place slots visible across repaints
  }

  function arrowEnds(plan, seg, h) {
    var segT = P.tasksForSeg(plan, seg), from = byId(segT, h.fromTaskId), to = byId(segT, h.toTaskId);
    if (!from || !to || !from.assignedIds.length || !to.assignedIds.length) return null;
    var gf = fdBlockGeo(plan, from), gt = fdBlockGeo(plan, to);
    var si = 0; (to.neededInfo || []).forEach(function (cid, i2) { if (cid === h.cardId) si = i2; });
    return { x1: gf.x + gf.w + 8, y1: gf.y + 13, x2: gt.x - 6, y2: gt.y + si * 11 + 6 };
  }
  function drawFdArrows(plan, seg) {
    var svg = $('fd-arrows'); if (!svg) return;
    var s = '', segT = P.tasksForSeg(plan, seg), segH = P.handoffsForSeg(plan, seg);
    segH.forEach(function (h) {
      var e = arrowEnds(plan, seg, h); if (!e) return;
      var to = byId(segT, h.toTaskId), sa = arrivalInSeg(segT, h);
      var late = sa == null || sa > to.startMin;
      var mx = (e.x1 + e.x2) / 2;
      s += '<path class="' + (late ? 'late' : 'ok') + '" data-h="' + h.id + '" d="M' + e.x1 + ' ' + e.y1 + ' C ' + mx + ' ' + e.y1 + ', ' + mx + ' ' + e.y2 + ', ' + e.x2 + ' ' + e.y2 + '"></path>' +
        '<circle cx="' + e.x2 + '" cy="' + e.y2 + '" r="2.6" fill="' + (late ? 'rgba(217,83,79,.9)' : 'rgba(47,158,111,.9)') + '"></circle>';
    });
    svg.innerHTML = s;
  }
  function buildFdArrowList(plan, seg) {
    var t = T(), segT = P.tasksForSeg(plan, seg), segH = P.handoffsForSeg(plan, seg);
    $('fd-arrowlist').innerHTML = segH.map(function (h) {
      var to = byId(segT, h.toTaskId); if (!to) return '';
      var sa = arrivalInSeg(segT, h), late = sa == null || sa > to.startMin;
      var card = byId(plan.infoCards, h.cardId);
      return '<button class="fd-ar-chip ' + (late ? 'late' : 'ok') + '" data-h="' + h.id + '">' + (late ? '⚑' : '✓') + ' ' + nm(card ? card.name : h.cardId).split('：')[0].split(':')[0] + ' <span class="muted2">' + (sa == null ? '—' : hhmm(sa)) + ' ' + t['ch' + h.channel.charAt(0).toUpperCase() + h.channel.slice(1)].split(' ')[0] + '</span></button>';
    }).join('');
  }
  function buildFdReady(plan, fd, seg) {
    var t = T(), hints = P.dayReadiness(plan, seg), chips = [], segT = P.tasksForSeg(plan, seg);
    function tn(id) { var x = byId(segT, id); return x ? nm(x.name) : id; }
    function cn(id) { var x = byId(plan.infoCards, id); return x ? nm(x.name).split('：')[0].split(':')[0] : id; }
    function chip(type, txt) { return '<span class="pr-item bad" data-type="' + type + '">' + txt + '</span>'; }
    hints.forEach(function (h) {
      if (h.type === 'MISSING_ARROW') chips.push(chip(h.type, t.rhMissing(cn(h.cardId), tn(h.taskId))));
      else if (h.type === 'ARROW_LATE') chips.push(chip(h.type, t.rhLate(cn(h.cardId), tn(h.taskId), h.lateMin)));
      else if (h.type === 'WRONG_FISH_RISK') chips.push(chip(h.type, t.rhWrongFish(cn(h.cardId), tn(h.taskId))));
      else if (h.type === 'DEP_BROKEN') chips.push(chip(h.type, t.rhDep(tn(h.taskId), tn(h.depId))));
      else if (h.type === 'OVERLOAD') { var pp = byId(plan.participants, h.personId); chips.push(chip(h.type, t.rhOverload(pp ? nm(pp.name) : h.personId))); }
      else if (h.type === 'TASK_UNSTAFFED') chips.push(chip(h.type, t.rhUnstaffed(tn(h.taskId))));
      else if (h.type === 'DUTY_UNASSIGNED') chips.push(chip(h.type, t.rhDuty(nm(P.role(h.roleId).name))));
      else if (h.type === 'UNPLACED_REQUIRED') chips.push(chip(h.type, t.rhUnplaced(tn(h.taskId))));
      else if (h.type === 'DECOY_PLACED') chips.push(chip(h.type, t.rhDecoy(tn(h.taskId))));
      else if (h.type === 'MISASSIGNED') chips.push(chip(h.type, t.rhMisassigned(tn(h.taskId))));
    });
    $('fd-ready').innerHTML = '<span class="pr-lbl">' + t.fdReadyLbl + '</span>' +
      (chips.length ? chips.slice(0, 8).join('') + (chips.length > 8 ? '<span class="pr-item bad">+' + (chips.length - 8) + '</span>' : '')
                    : '<span class="pr-item ok">' + t.fdReadyOk + '</span>');
    // fishday keeps its existing (whole-trip) projected wording; the coarse days show their own
    // rule-based day score (§20.4) via scoreDay/projectedDay
    var scoreVal, effVal;
    if (seg === 'fishday') { var proj = P.projected(buildCfg()); scoreVal = proj.score; effVal = proj.efficiency; }
    else { var pd = P.projectedDay(buildCfg(), seg); scoreVal = pd.score; effVal = pd.efficiency; }
    var pe = $('fd-projected');
    pe.textContent = t.fdProjected(scoreVal, effVal);
    pe.className = 'planhint' + (chips.length ? '' : ' good');
    if (fdLastProj[seg] != null && scoreVal > fdLastProj[seg]) {
      floatDelta(pe, '+' + (scoreVal - fdLastProj[seg])); pe.classList.add('bump');
      setTimeout(function () { pe.classList.remove('bump'); }, 620);
    }
    fdLastProj[seg] = scoreVal;
  }

  // ---- tap-to-place fallback (keyboard/touch parity with the pointer drag below): tap/Enter a
  // deck chip to arm it, then a row of pulsing .fd-slot targets appears — one per lane, at the
  // task's own default time — tap/Enter one to place it there. ----
  function toggleChipPlacing(taskId) {
    placingChip = (placingChip === taskId) ? null : taskId;
    paintSetup();
    if (placingChip) { var s = document.querySelector('.fd-slot'); if (s) s.focus(); }
    else { var c = document.querySelector('.fd-chip[data-task="' + taskId + '"]'); if (c) c.focus(); }
  }
  function renderDropSlots() {
    var canvas = $('fd-canvas'); if (!canvas) return;
    var plan = currentPlan(), seg = daySel, segT = P.tasksForSeg(plan, seg), tk = byId(segT, placingChip);
    if (!tk) { placingChip = null; return; }
    var win = segWin(seg), sn = segSnap(seg);
    var startMin = clamp(Math.round((tk.startMin || win[0]) / sn) * sn, win[0], win[1] - tk.durMin);
    var html = '';
    plan.participants.forEach(function (pp, i) {
      var top = RULER_H + i * LANE_H + 3;
      html += '<div class="fd-slot" tabindex="0" role="button" data-task="' + tk.id + '" data-lane="' + i + '" data-start="' + startMin + '" style="left:' + fdX(startMin) + 'px;top:' + top + 'px;width:' + Math.max(10, tk.durMin * PXM) + 'px" title="' + nm(pp.name) + '"></div>';
    });
    canvas.querySelectorAll('.fd-slot').forEach(function (o) { o.remove(); });
    canvas.insertAdjacentHTML('beforeend', html);
  }
  function commitDropSlot(el) {
    var lane = parseInt(el.dataset.lane, 10), startMin = parseInt(el.dataset.start, 10), taskId = el.dataset.task;
    var plan = currentPlan(), person = plan.participants[lane]; if (!person) return;
    var segT = P.tasksForSeg(plan, daySel), tk = byId(segT, taskId); if (!tk) return;
    writePlace(taskId, startMin, tk.durMin, person.id);
    placingChip = null;
    paintSetup();
    var b = document.querySelector('.fd-block[data-task="' + taskId + '"]'); if (b) b.focus();
  }

  // ---- block drag / resize / chip placement / arrow wire (Pointer Events) ----
  function fdSocketTap(sock) {
    var plan = currentPlan(), segT = P.tasksForSeg(plan, daySel), segH = P.handoffsForSeg(plan, daySel);
    if (sock.classList.contains('miss')) { fdAutoDraw(sock.dataset.task, sock.dataset.card); return; }
    var ex = feedArrowInSeg(segH, segT, sock.dataset.task, sock.dataset.card);   // late/ok: edit what feeds it
    if (ex) openArrowPanel(ex.id);
  }
  function makeGhost(chip, x, y) {
    removeGhost();
    var g = document.createElement('div'); g.className = 'fd-chip ghost'; g.innerHTML = chip.innerHTML;
    g.style.left = (x - 40) + 'px'; g.style.top = (y - 14) + 'px';
    document.body.appendChild(g); fdGhost = g;
  }
  function removeGhost() { if (fdGhost && fdGhost.parentNode) fdGhost.parentNode.removeChild(fdGhost); fdGhost = null; }
  function removeDropSlot() { var s = $('fd-dropslot'); if (s && s.parentNode) s.parentNode.removeChild(s); }
  function isOverDeck(ev) {
    var deck = $('fd-deck'); if (!deck) return false;
    var r = deck.getBoundingClientRect();
    return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
  }
  function fdPointerDown(ev) {
    if (ev.button != null && ev.button !== 0 && ev.pointerType === 'mouse') return;
    if (fdWire && ev.pointerId !== fdWire.pid) { ev.preventDefault(); return; }   // a second finger can't hijack a live wire
    if (fdDrag) return;                                    // a gesture is already in flight
    var chip = ev.target.closest('.fd-chip');
    if (chip && !fdWire) {
      var plan0 = currentPlan(), segT0 = P.tasksForSeg(plan0, daySel), tk0 = byId(segT0, chip.dataset.task); if (!tk0) return;
      fdDrag = { fromDeck: true, taskId: tk0.id, durMin: tk0.durMin, pid: ev.pointerId, x0: ev.clientX, y0: ev.clientY, moved: false, dropLane: null, dropStart: null };
      makeGhost(chip, ev.clientX, ev.clientY);
      chip.setPointerCapture && chip.setPointerCapture(ev.pointerId);
      ev.preventDefault(); return;
    }
    var port = ev.target.closest('.fd-port');
    if (port) {
      var r = $('fd-canvas').getBoundingClientRect();
      fdWire = { fromTask: port.dataset.task, cardId: port.dataset.card, pid: ev.pointerId, ox: r.left, oy: r.top, x0: ev.clientX - r.left, y0: ev.clientY - r.top };
      port.setPointerCapture && port.setPointerCapture(ev.pointerId);
      ev.preventDefault(); return;
    }
    var sock = ev.target.closest('.fd-socket');
    if (sock) { fdSocketTap(sock); ev.preventDefault(); return; }
    if (fdWire) return;                                   // a wire is live — don't start a drag underneath it
    var blk = ev.target.closest('.fd-block'); if (!blk) return;
    var plan = currentPlan(), segT = P.tasksForSeg(plan, daySel), tk = byId(segT, blk.dataset.task); if (!tk) return;
    var resize = !!ev.target.closest('.fd-rsz');
    fdDrag = { taskId: tk.id, el: blk, pid: ev.pointerId, resize: resize, x0: ev.clientX, startMin: tk.startMin, durMin: tk.durMin, assignedIds: tk.assignedIds.slice() };
    blk.setPointerCapture && blk.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  }
  function fdWireClear() {
    var svg = $('fd-arrows'), old = svg && svg.querySelector('.wire');
    if (old) old.remove();
    fdWire = null;
  }
  function updateDropSlot(ev) {
    var canvas = $('fd-canvas'); if (!canvas) { removeDropSlot(); fdDrag.dropLane = null; return; }
    var r = canvas.getBoundingClientRect();
    var localX = ev.clientX - r.left, localY = ev.clientY - r.top;
    var plan = currentPlan(), lanes = plan.participants;
    if (localX < LBL_W || localY < 0 || localY > r.height) { removeDropSlot(); fdDrag.dropLane = null; fdDrag.dropStart = null; return; }
    var li = clamp(Math.floor((localY - RULER_H) / LANE_H), 0, lanes.length - 1);
    var win = segWin(daySel);
    var startMin = clamp(fdMin(localX), win[0], win[1] - fdDrag.durMin);
    var slot = $('fd-dropslot');
    if (!slot) { slot = document.createElement('div'); slot.id = 'fd-dropslot'; slot.className = 'fd-slot drag'; canvas.appendChild(slot); }
    slot.style.left = fdX(startMin) + 'px'; slot.style.top = (RULER_H + li * LANE_H + 3) + 'px'; slot.style.width = Math.max(10, fdDrag.durMin * PXM) + 'px';
    fdDrag.dropLane = li; fdDrag.dropStart = startMin;
  }
  function fdPointerMove(ev) {
    if (fdWire) {
      if (fdWire.pid != null && ev.pointerId !== fdWire.pid) return;
      if (ev.pointerType === 'mouse' && ev.buttons === 0) { fdWireClear(); return; }   // button released off-window
      var x = ev.clientX - fdWire.ox, y = ev.clientY - fdWire.oy, svg = $('fd-arrows');
      var old = svg.querySelector('.wire'); if (old) old.remove();
      var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      p.setAttribute('class', 'wire'); p.setAttribute('d', 'M' + fdWire.x0 + ' ' + fdWire.y0 + ' L ' + x + ' ' + y);
      svg.appendChild(p); return;
    }
    if (fdDrag && fdDrag.fromDeck) {
      if (fdDrag.pid != null && ev.pointerId !== fdDrag.pid) return;
      if (ev.pointerType === 'mouse' && ev.buttons === 0) { removeGhost(); removeDropSlot(); fdDrag = null; paintSetup(); return; }
      if (Math.abs(ev.clientX - fdDrag.x0) > 5 || Math.abs(ev.clientY - fdDrag.y0) > 5) fdDrag.moved = true;
      if (fdGhost) { fdGhost.style.left = (ev.clientX - 40) + 'px'; fdGhost.style.top = (ev.clientY - 14) + 'px'; }
      updateDropSlot(ev);
      return;
    }
    if (!fdDrag) return;
    if (fdDrag.pid != null && ev.pointerId !== fdDrag.pid) return;
    if (ev.pointerType === 'mouse' && ev.buttons === 0) { fdDrag = null; paintSetup(); return; }  // self-heal a stuck drag
    var sn = segSnap(daySel), win2 = segWin(daySel);
    var dMin = Math.round((ev.clientX - fdDrag.x0) / PXM / sn) * sn;
    if (fdDrag.resize) {
      var nd = clamp(fdDrag.durMin + dMin, sn, win2[1] - fdDrag.startMin);
      fdDrag.el.style.width = Math.max(10, nd * PXM) + 'px'; fdDrag.newDur = nd;
    } else {
      var ns = clamp(fdDrag.startMin + dMin, win2[0], win2[1] - fdDrag.durMin);
      fdDrag.el.style.left = fdX(ns) + 'px'; fdDrag.newStart = ns;
      fdDrag.el.classList.toggle('over-deck', isOverDeck(ev));   // about to drop back onto the deck (unplace)
    }
  }
  // wire drop test with touch slop: exact hit first, then any matching socket within 14px
  function fdDropSocket(ev) {
    var el = document.elementFromPoint(ev.clientX, ev.clientY);
    var sock = el && el.closest ? el.closest('.fd-socket') : null;
    if (sock && sock.dataset.card === fdWire.cardId) return sock;
    var best = null, bestD = 15 * 15;
    document.querySelectorAll('.fd-socket[data-card="' + fdWire.cardId + '"]').forEach(function (s) {
      var r = s.getBoundingClientRect(), dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
      var d = dx * dx + dy * dy; if (d < bestD) { bestD = d; best = s; }
    });
    return best;
  }
  // a re-timed producer can strand an atMinute send before the card exists — re-clamp its arrows
  // to the producer's new finish. Seg-aware (§20 Fix E): fishday keeps its legacy plan.handoffs/
  // dayOv.fishday.handoffs channel + producedAt (byte-pinned dep-chain contract, untouched); coarse
  // days (arrival/ops/return) run the identical clamp against P.handoffsForSeg/dayOv[seg].handoffs
  // so a moved coarse block can't strand a stale atMinute send either.
  function reclampArrows(taskId) {
    var plan = currentPlan(), seg = daySel, segT = P.tasksForSeg(plan, seg), segH = P.handoffsForSeg(plan, seg);
    segH.forEach(function (h) {
      if (h.fromTaskId !== taskId || !h.trigger || h.trigger.type !== 'atMinute') return;
      var pa = seg === 'fishday' ? producedAt(plan, h) : producedAtSeg(segT, h);
      if (h.trigger.value < pa) dayOv[seg].handoffs[h.id] = Object.assign({}, h, { trigger: { type: 'atMinute', value: pa } });
    });
  }
  function fdPointerUp(ev) {
    if (fdWire) {
      if (fdWire.pid != null && ev.pointerId !== fdWire.pid) return;
      var sock = fdDropSocket(ev);
      fdDrag = null; fdWireClear();
      if (sock) {
        var plan = currentPlan(), segT = P.tasksForSeg(plan, daySel), segH = P.handoffsForSeg(plan, daySel);
        var ex = !sock.classList.contains('miss') && feedArrowInSeg(segH, segT, sock.dataset.task, sock.dataset.card);
        var to2 = byId(segT, sock.dataset.task);
        var onTime = ex && to2 && arrivalInSeg(segT, ex) <= to2.startMin;
        if (onTime) openArrowPanel(ex.id);                          // already fed on time — edit, don't duplicate
        else fdAutoDraw(sock.dataset.task, sock.dataset.card);      // missing or late — draw (a faster duplicate is a legit fix)
      }
      buildDayGrid(); updatePlanUI(); return;
    }
    if (fdDrag && fdDrag.fromDeck) {
      if (fdDrag.pid != null && ev.pointerId !== fdDrag.pid) return;
      var wasTap = !fdDrag.moved, lane = fdDrag.dropLane, start = fdDrag.dropStart, taskId = fdDrag.taskId, durMin = fdDrag.durMin;
      removeGhost(); removeDropSlot(); fdDrag = null;
      if (wasTap) { toggleChipPlacing(taskId); return; }
      if (lane != null && start != null) {
        var plan2 = currentPlan(), person = plan2.participants[lane];
        if (person) writePlace(taskId, start, durMin, person.id);
      }
      paintSetup();
      return;
    }
    if (!fdDrag) return;
    if (fdDrag.pid != null && ev.pointerId !== fdDrag.pid) return;
    var d = fdDrag; fdDrag = null;
    if (d.el) d.el.classList.remove('over-deck');
    if (!d.resize && daySel !== 'fishday' && isOverDeck(ev)) { writeUnplace(d.taskId); paintSetup(); return; }
    if (d.resize && d.newDur != null && d.newDur !== d.durMin) writeMove(d.taskId, d.startMin, d.newDur, d.assignedIds);
    else if (!d.resize && d.newStart != null && d.newStart !== d.startMin) writeMove(d.taskId, d.newStart, d.durMin, d.assignedIds);
    else return;
    reclampArrows(d.taskId);
    paintSetup();
  }
  function fdPointerCancel() {
    if (!fdDrag && !fdWire) return;             // touch scrolls fire pointercancel constantly — only clean real gestures
    removeGhost(); removeDropSlot();
    fdDrag = null; fdWireClear(); paintSetup();
  }
  // draw the arrow for (consumer task, card) from the task that produces the card, within the active seg
  function fdAutoDraw(toTaskId, cardId) {
    var plan = currentPlan(), seg = daySel, segT = P.tasksForSeg(plan, seg);
    var to = byId(segT, toTaskId), from = producerInSeg(segT, cardId);
    if (!to || !from) return;
    var card = byId(plan.infoCards, cardId);
    var assume = (to.assumeOn || []).indexOf(cardId) >= 0;
    var id = 'h_' + cardId.replace('ic_', '') + '_' + to.ownerRoleId + '_' + (fdUid++);
    dayOv[seg].handoffs[id] = { cardId: cardId, fromRoleId: from.ownerRoleId, fromTaskId: from.id, toRoleId: to.ownerRoleId, toTaskId: to.id,
      trigger: { type: 'onTaskDone', taskId: from.id }, channel: 'faceToFace', ifLate: assume ? 'assume' : 'idle',
      reworkKind: assume ? 'wrongFish' : null, content: { en: nm2(card.name, 'en'), jp: nm2(card.name, 'jp') } };
    paintSetup();
    openArrowPanel(id);
  }
  function nm2(o, lang) { return o ? (lang === 'jp' ? (o.jp || o.en) : o.en) : ''; }

  // ---- arrow edit panel (now seg-aware — the same modal edits fishday AND coarse-day arrows) ----
  var CH_LIST = ['faceToFace', 'radio', 'phone', 'chat', 'board'];
  // the earliest minute a card can physically leave: its producing task's finish (fishday-only —
  // shared with Live mode + reclampArrows, which always run against plan.tasks/plan.handoffs)
  function producedAt(plan, h) {
    var from = byId(plan.tasks, h.fromTaskId);
    return from && from.day === 'fishday' ? from.startMin + from.durMin : FD_T0;
  }
  function openArrowPanel(hid) {
    var plan = currentPlan(), seg = daySel, segT = P.tasksForSeg(plan, seg), segH = P.handoffsForSeg(plan, seg);
    var h = byId(segH, hid); if (!h) return;
    arrowEdit = hid; arrowEditSeg = seg;
    var t = T(), card = byId(plan.infoCards, h.cardId), from = byId(segT, h.fromTaskId), to = byId(segT, h.toTaskId);
    $('ar-title').textContent = nm(card ? card.name : h.cardId);
    $('ar-sub').textContent = t.arFrom + ' ' + (from ? nm(from.name) : h.fromRoleId) + ' → ' + t.arTo + ' ' + (to ? nm(to.name) : h.toRoleId);
    var trigDone = h.trigger.type === 'onTaskDone';
    var sendMin = sendMinInSeg(segT, h), minSend = producedAtSeg(segT, h);
    var chOpts = CH_LIST.map(function (c) {
      return '<option value="' + c + '"' + (h.channel === c ? ' selected' : '') + '>' + t['ch' + c.charAt(0).toUpperCase() + c.slice(1)] + ' (+' + P.CHANNELS[c] + t.chMin + ')</option>';
    }).join('');
    var arr = arrivalInSeg(segT, h), needBy = to ? to.startMin : 0, late = arr == null || arr > needBy;
    $('ar-body').innerHTML =
      '<div class="ar-row"><span class="dt-h">' + t.arTrigger + '</span>' +
        '<select class="ar-sel" id="ar-trig"><option value="onTaskDone"' + (trigDone ? ' selected' : '') + '>' + t.arTrigDone + (from ? ' — ' + nm(from.name) : '') + '</option>' +
        '<option value="atMinute"' + (!trigDone ? ' selected' : '') + '>' + t.arTrigAt + '</option></select>' +
        '<input class="ar-time" id="ar-time" type="time" step="300" min="' + hhmm(minSend) + '" value="' + hhmm(sendMin == null ? needBy : Math.max(sendMin, minSend)) + '"' + (trigDone ? ' disabled' : '') + '></div>' +
      '<div class="ar-row"><span class="dt-h">' + t.arChannel + '</span><select class="ar-sel" id="ar-ch">' + chOpts + '</select></div>' +
      '<div class="ar-arrive ' + (late ? 'late' : 'ok') + '">' + (arr == null ? '—' : (late ? t.arriveLate(hhmm(arr), arr - needBy) : t.arriveOk(hhmm(arr)))) + ' <span class="muted2">(' + (to ? nm(to.name) + ' ' + hhmm(needBy) : '') + ')</span></div>' +
      (h.ifLate === 'assume' ? '<div class="ar-note">' + t.arriveAssume + '</div>' : '');
    modalOpening('arrow-modal');
    $('arrow-modal').classList.add('show');
    var cb = $('ar-close'); if (cb && !$('arrow-modal').contains(document.activeElement)) cb.focus();
  }
  function arrowPatch() {
    if (!arrowEdit) return;
    var plan = currentPlan(), seg = arrowEditSeg, segT = P.tasksForSeg(plan, seg), segH = P.handoffsForSeg(plan, seg);
    var h = byId(segH, arrowEdit); if (!h) return;
    var trig = $('ar-trig').value, ch = $('ar-ch').value, tv = $('ar-time').value;
    var patch = { channel: ch };
    if (trig === 'onTaskDone') patch.trigger = { type: 'onTaskDone', taskId: h.fromTaskId };
    else {
      var mm = tv ? (parseInt(tv.slice(0, 2), 10) * 60 + parseInt(tv.slice(3, 5), 10)) : h.trigger.value || 0;
      mm = Math.max(mm, producedAtSeg(segT, h));           // a card can't be sent before it exists
      patch.trigger = { type: 'atMinute', value: mm };
    }
    // always store the FULL merged arrow: fix-provided arrows have no template entry, and a
    // partial patch would reach mergePlan's push-as-new branch as a malformed handoff
    dayOv[seg].handoffs[arrowEdit] = Object.assign({}, h, patch);
    paintSetup();
    openArrowPanel(arrowEdit);
  }
  function arrowErase() {
    if (!arrowEdit) return;
    dayOv[arrowEditSeg].handoffs[arrowEdit] = null;
    arrowEdit = null; arrowEditSeg = null;
    $('arrow-modal').classList.remove('show');
    modalClosed();
    paintSetup();
  }
  // #fd-clear-day: two-step confirm (armed on the FIRST click, executes on the SECOND for the
  // same day) — no native confirm() dialog, consistent with every other custom modal in this app.
  function clearDayClick() {
    var btn = $('fd-clear-day'); if (!btn) return;
    var seg = daySel;
    if (seg === 'fishday') return;      // fishday is never deck-cleared — timing+arrows only (§20 Fix A)
    if (btn.dataset.armed === seg) {
      btn.dataset.armed = '';
      P.tasksForSeg(currentPlan(), seg).forEach(function (tk) { writeUnplace(tk.id); });
      placingChip = null;
      paintSetup();
      return;
    }
    btn.dataset.armed = seg; btn.classList.add('armed'); btn.textContent = T().clearDayConfirmBtn;
  }

  // =========================================================================
  // RUN
  // =========================================================================
  var ADJ = [['mess', 'port'], ['mess', 'clinic'], ['mess', 'lodging'], ['port', 'vessel']];   // §map v2: Hinata(mess) is the hub; port->iso is the boat route

  // ---- ROAD-FOLLOW MOTION (§21.10): figures walk ALONG the dashed ADJ road graph, not beeline ----
  // Pure READ over ADJ / anim state; never writes engine state. BFS gives a station route; each figure
  // follows waypoint-to-waypoint, easing from rest and settling on arrival, with a deterministic per-person
  // speed. The FINAL leg targets the fanned point (f.tx/f.ty) so figures at the SAME station still fan out.
  var FAN_COL = 23, FAN_ROW = 24, FEET_BASE = 36;              // base fan spacing / feet offset (× stageScale)
  function stageScaleNow() {                                   // bigger stage -> bigger pawns/fan (capped ~1.7)
    var w = (anim && anim.w) || 1000, h = (anim && anim.h) || 560;
    return Math.max(1, Math.min(Math.min(w / 1000, h / 560), 1.7));
  }
  var ADJ_MAP = null;
  function adjMap() {                                          // undirected adjacency built once from ADJ
    if (ADJ_MAP) return ADJ_MAP;
    var m = {}, i;
    function add(a, b) { if (!m[a]) m[a] = []; m[a].push(b); }
    for (i = 0; i < ADJ.length; i++) { add(ADJ[i][0], ADJ[i][1]); add(ADJ[i][1], ADJ[i][0]); }
    ADJ_MAP = m; return m;
  }
  function stationPath(from, to) {                            // BFS shortest station path [from .. to]
    if (from === to) return [from];
    var m = adjMap(), q = [from], prev = {}, i, cur, nb, n, c, path;
    prev[from] = from;
    while (q.length) {
      cur = q.shift(); nb = m[cur] || [];
      for (i = 0; i < nb.length; i++) {
        n = nb[i];
        if (!prev.hasOwnProperty(n)) {
          prev[n] = cur;
          if (n === to) { path = [to]; c = to; while (c !== from) { c = prev[c]; path.unshift(c); } return path; }
          q.push(n);
        }
      }
    }
    return [from, to];                                        // disconnected fallback -> single straight leg
  }
  function routeWaypoints(f, fromId, toId) {                  // store pass-through station centres (final leg = fanned tx/ty)
    var path = stationPath(fromId, toId), W = anim.w, H = anim.h, feet = FEET_BASE * (USE_CANVAS ? stageScaleNow() : 1), wp = [], i, st;
    for (i = 1; i < path.length - 1; i++) { st = P.station(path[i]); wp.push({ x: st.x * W, y: st.y * H + feet }); }
    f.wp = wp; f.wpi = 0;
  }
  function figSpeedMul(pid) {                                 // deterministic slight per-person speed (~0.85..1.17)
    var h = 2166136261, i;
    pid = pid || '';
    for (i = 0; i < pid.length; i++) { h ^= pid.charCodeAt(i); h = (h * 16777619) >>> 0; }
    return 0.85 + (h % 1000) / 1000 * 0.32;
  }
  function advanceWalker(f, dt, baseWalk, rm) {               // one figure's step: waypoint-follow + accel-from-rest + settle
    if (rm) { f.cx = f.tx; f.cy = f.ty; f.wpi = f.wp ? f.wp.length : 0; f.walking = false; f.spd = 0; return; }
    if (!f.wp) { f.wp = []; f.wpi = 0; }
    if (f.spdMul === undefined) f.spdMul = figSpeedMul(f.pid);
    var lastLeg = f.wpi >= f.wp.length;
    var tx = lastLeg ? f.tx : f.wp[f.wpi].x, ty = lastLeg ? f.ty : f.wp[f.wpi].y;
    var dx = tx - f.cx, dy = ty - f.cy, dist = Math.sqrt(dx * dx + dy * dy), guard = 0;
    while (!lastLeg && dist < 4 && guard++ < 8) {             // pop through any waypoints already reached
      f.wpi++; lastLeg = f.wpi >= f.wp.length;
      tx = lastLeg ? f.tx : f.wp[f.wpi].x; ty = lastLeg ? f.ty : f.wp[f.wpi].y;
      dx = tx - f.cx; dy = ty - f.cy; dist = Math.sqrt(dx * dx + dy * dy);
    }
    if (lastLeg && dist <= 0.35) { f.cx = tx; f.cy = ty; f.walking = false; f.spd = 0; return; }
    var maxV = baseWalk * f.spdMul;
    f.spd = (f.spd || 0) + maxV * 3.2 * dt;                   // accelerate from rest (reaches max in ~0.31s)
    if (f.spd > maxV) f.spd = maxV;
    var v = f.spd;
    if (lastLeg) { var settle = 5 * dist; if (settle < v) v = settle; }  // ease out onto the fanned point only
    var stp = v * dt;
    if (stp >= dist) { f.cx = tx; f.cy = ty; if (!lastLeg) f.wpi++; }     // reached this leg's target this frame
    else { f.cx += dx / dist * stp; f.cy += dy / dist * stp; }
    var moving = lastLeg ? (dist > 2.5) : true;
    f.walking = moving;
    if (moving && Math.abs(dx) > 3) f.faceL = dx < 0;         // keep facing flip; stable when nearly vertical
  }

  // ---- Layer 0 "Living Harbor": rAF motion for figures, guests, boat, cascade ----
  // The engine still OWNS every position (which station a unit belongs to, where the
  // boat is); the renderer only interpolates the journey so people WALK instead of
  // teleporting, and the map breathes with 13 hosted guests + sea life. Nothing here
  // feeds back into the sim — it is pure presentation over deterministic state.
  // Every mover is positioned via transform:translate3d (composited); never left/top.
  var DOCK = { x: 0.52, y: 0.55 }, SEA = { x: 0.80, y: 0.72 }, BOATC = { x: 0.66, y: 0.60 }; // Nobu-san's arc: port shore -> iso rock (must match stage.js)
  var GULLS = 3, FISH = 3, HUSH_R2 = 0.032;                       // hush radius² around a stalled holder
  var STALL_STATES = { confused: 1, meeting: 1, waiting: 1, tired: 1, onFire: 1, waitInfo: 1, rework: 1 };
  var YUKATA = ['#3d5a6c', '#7c4a5a', '#5b6b45', '#a3823c'];      // guest coat palette (washi-friendly)
  var anim = null;
  // ---- Tier 2 canvas stage (CLAUDE.md §21) — additive, behind USE_CANVAS; the DOM stage stays intact ----
  // Tier 2: the Canvas 2D stage is now the DEFAULT (§21). Add ?dom to the URL to fall back to the old DOM stage.
  var USE_CANVAS = !/[?&#]dom(&|=|$)/i.test(location.search + location.hash);
  var guestsVisible = false;             // §21.1: the 13 guests are hidden by default (toggle is P4)
  var dashboardOpen = true;              // dashboard drawer: open by default; closing widens the stage to full width
  var stageCtx = null;                   // #stage 2D context (captured in buildSitemap)
  var stageTrail = [], stageGhost = [{}, {}, {}], stageChain = [];  // canvas-owned cascade scratch (separate from anim.*)
  var stageSpotPid = null, stageTint = null, stageGapState = null;  // §21.4 Live draw-state bridge -> the scene() view
  function mapDims() { var m = $('sitemap'); return { w: m.clientWidth || 900, h: m.clientHeight || 480 }; }
  function animReset() {
    anim = { running: false, raf: null, last: 0, w: 0, h: 0, fig: {}, guest: {}, boat: null, wakes: [], hotPts: [],
      cascade: { hops: [], has: false }, ghost: [], trail: [], strikeSeg: -1, chain: [], chainOn: false,
      motes: [], acts: null, actsAt: -1, tweens: {}, fanfared: false, skyKey: '' };
    // §21.4 bridge state is module-scoped: clear it per run so a frozen gap's tint/spotlight can't leak into the next cold-open
    stageTint = null; stageSpotPid = null; stageGapState = null;
    stageTrail.length = 0; stageChain = []; stageGhost = [{}, {}, {}];
    // dashboard readouts carry tween state on the DOM node — a fresh run must not
    // tween from (or float a delta against) the previous run's final value
    ['dash-eff', 'dash-ready'].forEach(function (id) {
      var el = $(id); if (el) { el._v = null; el._shown = null; if (el.parentNode) el.parentNode.classList.remove('gold'); }
    });
  }
  // one transform write per mover per frame, and only when it actually moved
  function setXY(el, x, y) {
    if (el._x === undefined || Math.abs(el._x - x) > 0.02 || Math.abs(el._y - y) > 0.02) {
      el._x = x; el._y = y; el.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    }
  }
  function rebuildPaths() {
    var W = anim.w, H = anim.h, paths = $('paths'); paths.innerHTML = '';
    ADJ.forEach(function (e) {
      var a = P.station(e[0]), b = P.station(e[1]);
      var ax = a.x * W, ay = a.y * H, bx = b.x * W, by = b.y * H;
      var len = Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)), ang = Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
      var p = document.createElement('div'); p.className = 'path'; p.style.left = ax + 'px'; p.style.top = ay + 'px'; p.style.width = len + 'px'; p.style.transform = 'rotate(' + ang + 'deg)';
      paths.appendChild(p);
    });
  }

  // Re-fit the canvas/DOM stage to the CURRENT #sitemap box: rescale every mover's live (interpolated)
  // position by the width/height ratio, resize the Tier-2 canvas backing store, rebuild the
  // pixel-anchored paths, and let renderSim recompute fresh walk targets. This is the SAME path the
  // window-resize handler uses (factored out here so the dashboard-drawer toggle can call it too —
  // its class flip changes .runwrap's grid-template-columns, so the stage must re-fit immediately).
  function refitStage() {
    if (!anim || $('run').classList.contains('hidden')) return;
    var d = mapDims(), sx = anim.w ? d.w / anim.w : 1, sy = anim.h ? d.h / anim.h : 1;
    anim.w = d.w; anim.h = d.h;
    if (USE_CANVAS && stageCtx && window.PRS_STAGE) PRS_STAGE.resizeStage({ w: anim.w, h: anim.h }, window.devicePixelRatio || 1);
    var k2;
    for (k2 in anim.fig) { var f2 = anim.fig[k2]; f2.cx *= sx; f2.cy *= sy; f2.tx *= sx; f2.ty *= sy; if (f2.wp) for (var wI = 0; wI < f2.wp.length; wI++) { f2.wp[wI].x *= sx; f2.wp[wI].y *= sy; } }
    for (k2 in anim.guest) { var g2 = anim.guest[k2]; g2.cx *= sx; g2.cy *= sy; }
    if (anim.boat) { anim.boat.cx *= sx; anim.boat.cy *= sy; }
    anim.trail.length = 0;
    // px-anchored reduced-motion chain markers rebuild at the new scale next frame
    if (anim.chainOn) { anim.chain.forEach(function (n) { n.remove(); }); anim.chain = []; anim.chainOn = false; }
    rebuildPaths();
    if (sim) renderSim(sim);
    // renderSim repaints from engine state — a live freeze must keep its taxonomy + tint
    if (appMode === 'live' && livePausedForFix && liveState && liveState.currentGap) paintGapFocus(liveState.currentGap);
  }

  // keepActors=true (language switch / resize) reuses the ambient cast so nobody teleports
  function buildSitemap(keepActors) {
    var box = $('stations'); box.innerHTML = '';
    P.STATIONS.forEach(function (s) {
      if (s.hidden) return;   // §map v2: hidden stations (command folded into Hinata, finance off) get no hotspot
      var d = document.createElement('div'); d.className = 'station'; d.id = 'st-' + s.id;
      d.setAttribute('data-st', s.id); d.setAttribute('tabindex', '0'); d.setAttribute('role', 'button');
      d.setAttribute('aria-label', nm(s.name));   // §21.4: canvas hides .st-nm, so the hotspot needs its own accessible name (status appended live in renderSim)
      d.style.left = (s.x * 100) + '%'; d.style.top = (s.y * 100) + '%';
      d.innerHTML = '<div class="st-arch"></div><div class="st-badge" id="badge-' + s.id + '"></div><div class="st-halo"></div><div class="st-ic">' + s.icon + '</div><div class="st-nm">' + nm(s.name) + '</div><div class="st-ring" id="ring-' + s.id + '"></div>';
      box.appendChild(d);
    });
    // §map: clickable hotspots over Hinata's Food / Fishing-rod / Transport sections (canvas only;
    // positioned each frame in frame() from PRS_STAGE.hubSections so they track the drawn sub-zones)
    if (USE_CANVAS && window.PRS_STAGE && PRS_STAGE.hubSections) {
      ['food', 'rod', 'transport'].forEach(function (sid) {
        var b = document.createElement('div'); b.className = 'sec-hot'; b.id = 'sec-' + sid;
        b.setAttribute('data-sec', sid); b.setAttribute('tabindex', '0'); b.setAttribute('role', 'button');
        box.appendChild(b);
      });
    }
    var map = $('sitemap');
    var dims = mapDims(); anim.w = dims.w; anim.h = dims.h;
    rebuildPaths();
    // Tier 2: mount + size the canvas stage; body.canvas-stage hides the DOM stage layers (CSS)
    if (USE_CANVAS && window.PRS_STAGE) {
      var cv = $('stage');
      if (cv) { PRS_STAGE.initStage(cv, { w: anim.w, h: anim.h }); stageCtx = cv.getContext('2d'); }
      document.body.classList.add('canvas-stage');
    }
    // sea + micro-life layer (west-coast water band, drifting gulls, jumping fish) — pure ambience
    var sea = document.getElementById('sealayer');
    if (!sea) { sea = document.createElement('div'); sea.id = 'sealayer'; sea.className = 'sealayer'; map.insertBefore(sea, $('paths')); }
    var life = '<div class="water"></div>';
    for (var gi = 0; gi < GULLS; gi++) life += '<span class="gull" style="top:' + (8 + gi * 9) + '%;animation-delay:' + (-gi * 5.5) + 's;animation-duration:' + (17 + gi * 4) + 's"></span>';
    for (var fi = 0; fi < FISH; fi++) life += '<span class="splash" style="left:' + (3 + fi * 5) + '%;top:' + (55 + fi * 13) + '%;animation-delay:' + (fi * 2.3) + 's"></span>';
    sea.innerHTML = life;
    // ambient layer: 13 hosted guests (coloured, with activities from the engine) + the skiff
    var amb = document.getElementById('ambient');
    if (!amb) { amb = document.createElement('div'); amb.id = 'ambient'; amb.className = 'ambient'; map.insertBefore(amb, $('figs')); }
    var seed0 = (sim && sim.cfg && sim.cfg.seed) || 1;
    var acts0 = P.ambientActors(seed0, 0);
    if (!keepActors || !amb.firstChild) {
      var ah = '<div class="boat" id="boat"><div class="bwrap"><div class="bcore"><span class="hull"></span><span class="mast"></span><span class="sail"></span></div></div></div>';
      for (var wi = 0; wi < 3; wi++) ah += '<span class="wk" id="wk' + wi + '"></span>';
      for (var i = 0; i < P.GUESTS; i++) {
        var act = acts0[i] ? acts0[i].act : 'stroll';
        ah += '<div class="guest g-' + act + '" id="gg' + i + '" style="--gc:' + YUKATA[i % YUKATA.length] + '"><span class="g-body"></span></div>';
      }
      amb.innerHTML = ah;
    }
    // legend of who the small figures are (kept, restyled)
    var pr = P.makeTemplate().project, gt = document.getElementById('guests-tag');
    if (!gt) { gt = document.createElement('div'); gt.id = 'guests-tag'; gt.className = 'guests-tag'; map.appendChild(gt); }
    gt.innerHTML = '👥 <b>' + pr.guests + '</b> ' + T().guestsShort;
    // wire the rAF caches, preserving live coordinates across rebuilds (language switch, resize)
    anim.guest = {};
    for (var g = 0; g < P.GUESTS; g++) {
      var ge = $('gg' + g), cast = acts0[g] && acts0[g].act === 'cast';
      anim.guest['g' + g] = { el: ge, cast: cast, act: (acts0[g] && acts0[g].act) || 'stroll',
        homeX: cast ? 0.165 + (g % 4) * 0.013 : 0, homeY: cast ? 0.48 + ((g * 7) % 5) * 0.09 : 0,
        cx: ge._cx != null ? ge._cx : dims.w * 0.5, cy: ge._cy != null ? ge._cy : dims.h * 0.62 };
    }
    var be = $('boat');
    anim.boat = { el: be, cx: be._cx != null ? be._cx : DOCK.x * dims.w, cy: be._cy != null ? be._cy : DOCK.y * dims.h, lastParam: 0 };
    anim.wakes = [];
    for (var wj = 0; wj < 3; wj++) anim.wakes.push({ el: $('wk' + wj), x: 0, y: 0, t0: 0 });
    // duty-holders: rewire any existing figures so a language switch keeps them mid-stride
    anim.fig = {};
    var exist = $('figs').querySelectorAll('.astro');
    for (var x2 = 0; x2 < exist.length; x2++) {
      var ae = exist[x2], pid2 = ae.getAttribute('data-pid');
      anim.fig[pid2] = { el: ae, bub: ae.querySelector('.bub'), nmEl: ae.querySelector('.nm'),
        cx: ae._cx != null ? ae._cx : dims.w / 2, cy: ae._cy != null ? ae._cy : dims.h / 2,
        tx: ae._cx != null ? ae._cx : dims.w / 2, ty: ae._cy != null ? ae._cy : dims.h / 2,
        st: ae._st || '', lang: '',
        pid: pid2, spdMul: figSpeedMul(pid2), spd: 0, wp: [], wpi: 0, stn: ae._stn };   // keep road-follow/speed cache across a lang-switch rebuild
    }
    // cascade comet trail ghosts (pooled)
    anim.ghost = [];
    var oldg = map.querySelectorAll('.cghost');
    for (var og = 0; og < oldg.length; og++) oldg[og].remove();
    for (var gh = 0; gh < 3; gh++) { var gd = document.createElement('span'); gd.className = 'cghost'; map.appendChild(gd); anim.ghost.push(gd); }
    var oldc = map.querySelectorAll('.cstatic');
    for (var oc = 0; oc < oldc.length; oc++) oldc[oc].remove();
    anim.chain = []; anim.chainOn = false;      // updateCascade rebuilds the RM chain from live state
  }

  // ---- P21: the hand-offs themselves fly the map — gold on time, hanko-red late ----
  // Deliveries are per (role, card) and the EARLIEST arrow wins (the engine's min-over-arrows,
  // so a superseded slow arrow never flies red over a plan the score calls clean).
  function buildMotes(s) {
    var box = $('motes'); if (box) box.innerHTML = '';
    anim.motes = [];
    // info motes fly the fishday's plan.handoffs — a coarse day's arrows live in plan.days[seg]; drawing
    // the fishday arrows over an arrival/ops/return animation would be wrong-context, so gate to fishday
    if (!box || !s || s.mode !== 'minute' || s.segment !== 'fishday') return;
    var plan = s.plan, pairs = {};
    plan.handoffs.forEach(function (h) {
      var to = byId(plan.tasks, h.toTaskId), from = byId(plan.tasks, h.fromTaskId);
      if (!to || !from || to.day !== 'fishday' || from.day !== 'fishday') return;
      var send = P.resolveSendMin(plan, h), arr = P.staticArrival(plan, h);
      if (send == null || arr == null) return;
      var key = h.toRoleId + '|' + h.cardId;
      if (!pairs[key] || arr < pairs[key].arr) pairs[key] = { arr: arr, send: send, h: h, from: from, to: to };
    });
    Object.keys(pairs).forEach(function (k) {
      var b = pairs[k], A = P.station(b.from.station), B = P.station(b.to.station);
      // late if ANY consuming task of this role needs the card before the winning arrival
      var late = false;
      plan.tasks.forEach(function (tk) {
        if (tk.day === 'fishday' && tk.ownerRoleId === b.h.toRoleId && tk.assignedIds.length &&
            (tk.neededInfo || []).indexOf(b.h.cardId) >= 0 && b.arr > tk.startMin) late = true;
      });
      var el = document.createElement('span'); el.className = 'mote ' + (late ? 'red' : 'gold');
      box.appendChild(el);
      setXY(el, A.x * anim.w, A.y * anim.h);
      anim.motes.push({ el: el, role: b.h.toRoleId, card: b.h.cardId, send: b.send,
        ax: A.x, ay: A.y, bx: B.x, by: B.y, late: late,
        same: b.from.station === b.to.station, toSt: b.to.station, state: 0, t0: 0,
        dur: 650 + Math.min(900, Math.max(0, b.arr - b.send) * 55) });
    });
  }
  function pingStation(stId, late) {
    var n = $('st-' + stId); if (!n) return;
    var cls = late ? 'ping-red' : 'ping';
    n.classList.remove('ping', 'ping-red'); void n.offsetWidth; n.classList.add(cls);
    setTimeout(function () { n.classList.remove(cls); }, 560);
  }
  // called once per engine tick: launch motes whose send-minute the clock just crossed
  function scheduleMotes(s) {
    if (s.mode !== 'minute') return;
    var now = s.clockMin;
    for (var i = 0; i < anim.motes.length; i++) {
      var m = anim.motes[i];
      if (m.state !== 0 || now < m.send) continue;
      if (now > m.send + 15) { m.state = 2; m.noPing = true; continue; }   // long past (fast-forward) — skip silently (canvas honors noPing)
      m.state = 1; m.t0 = 0;
      if (m.same || RM.matches) { m.state = 2; pingStation(m.toSt, m.late); }
      else m.el.classList.add('on');
    }
  }
  function updateMotes(ts) {
    for (var i = 0; i < anim.motes.length; i++) {
      var m = anim.motes[i]; if (m.state !== 1) continue;
      if (!m.t0) m.t0 = ts;
      var k = (ts - m.t0) / m.dur;
      if (k >= 1) { m.state = 2; m.el.classList.remove('on'); pingStation(m.toSt, m.late); continue; }
      var e = k * k * (3 - 2 * k);
      var x = (m.ax + (m.bx - m.ax) * e) * anim.w;
      var y = (m.ay + (m.by - m.ay) * e) * anim.h - Math.sin(k * Math.PI) * 12;
      setXY(m.el, x, y);
    }
  }

  function launch() {
    stopAnim(); clearFinishTimer();                       // never stack a second rAF loop or a stale report reveal
    // §21.8b: every authored day now ANIMATES on the minute clock — the coarse days (arrival/ops/return)
    // opt into the minute-sim via {animate:true} so people walk + comment + PAUSE-on-stall like the fishday.
    // The run ends in a rule-based P.scoreDay report (finish()); the plan gaps that caused the pauses are
    // exactly what mark the day down. Whole-trip ('all') is not authorable → stays the classic day clock.
    sim = P.createSim({ seed: (Math.floor(Math.random() * 1e9) >>> 0) || 1, overrides: buildCfg().overrides }, daySel, { animate: true });
    paused = false; livePausedForFix = false; document.body.classList.add('running');
    closeModals();
    $('live-dock').classList.add('hidden');               // a morning run never shows the live dock
    speedMult = 1; document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-spd') === '1'); });
    $('setup').classList.add('hidden'); $('report').classList.add('hidden'); $('run').classList.remove('hidden');
    $('figs').innerHTML = ''; $('banner').classList.remove('show');
    var ff = $('fanfare'); if (ff) ff.classList.remove('show');
    animReset(); updateRunButtons(); buildSitemap();
    // the cascade comet traces the fishday fault chain (港→船→食堂); it's fishday-specific, so a coarse
    // animated day shows no comet (its stalls surface as ⏳ pauses + the scoreDay markdown instead)
    anim.cascade = (sim.mode === 'minute' && sim.segment === 'fishday') ? P.cascadeTrace(sim.plan) : { hops: [], has: false };
    anim.cascade.has = anim.cascade.hasFault;
    buildMotes(sim);
    renderSim(sim); startAnim();
    runFn = step;
    if (timer) clearInterval(timer); timer = setInterval(step, tickMs());
  }
  function restartTimer() { if (timer) { clearInterval(timer); timer = setInterval(runFn || step, tickMs()); } }
  function step() {
    if (paused || !sim) return;
    if (sim.paused) return;                       // checkpoint: wait for Resume
    P.tick(sim); renderSim(sim);
    if (sim.paused && sim.checkpoint) openInspector();
    if (sim.finished) finish();
  }

  // px target for each duty-holder: its engine station + a fanned stack below it
  // (anchor = the sprite's FEET; rows of 4, wide enough that name chips stay legible)
  function figTargets(s) {
    var pos = {}, bucket = {}; s.stations.forEach(function (st) { bucket[st.id] = []; });
    s.participants.forEach(function (p) { bucket[p.station].push(p); });
    var W = anim.w, H = anim.h, sc = USE_CANVAS ? stageScaleNow() : 1;   // only scale the fan when the (scaled) canvas is active
    var colGap = FAN_COL * sc, rowGap = FAN_ROW * sc, feet = FEET_BASE * sc;   // scale fan+feet so bigger pawns don't overlap
    s.stations.forEach(function (st) {
      var n = bucket[st.id].length;
      bucket[st.id].forEach(function (p, i) {
        var col = i % 4, row = Math.floor(i / 4), rowN = Math.min(4, n - row * 4);
        pos[p.id] = { x: st.x * W + (col - (rowN - 1) / 2) * colGap, y: st.y * H + feet + row * rowGap };
      });
    });
    return pos;
  }

  // ---- the continuous animation loop (walking, guests, boat, motes, cascade) ----
  function startAnim() { if (!anim.running) { anim.running = true; anim.last = 0; anim.raf = requestAnimationFrame(frame); } }
  function stopAnim() { if (anim && anim.raf) cancelAnimationFrame(anim.raf); if (anim) { anim.running = false; anim.raf = null; } }
  function frame(ts) {
    if (!anim || !anim.running) return;
    if ($('run').classList.contains('hidden')) { anim.running = false; return; }
    var dt = anim.last ? Math.min(0.1, (ts - anim.last) / 1000) : 0.016; anim.last = ts;
    var rm = RM.matches, phase = ts / 2600;
    var kAmb = 1 - Math.exp(-2.2 * dt);                       // frame-rate independent easing
    var WALK = 92 * Math.max(1, speedMult);                   // px/s — a brisk harbor walk, scaled with game speed
    // duty-holders FOLLOW the ADJ roads to the targets renderSim set: accelerate from rest, settle on arrival,
    // per-person speed variation; the canvas reads f.cx/f.cy/f.walking/f.faceL, the DOM stage mirrors via setXY.
    for (var pid in anim.fig) {
      var f = anim.fig[pid];
      advanceWalker(f, dt, WALK, rm);
      if (f.el) {
        f.el.classList.toggle('walking', !!f.walking);
        f.el.classList.toggle('faceL', !!f.faceL);
        f.el._cx = f.cx; f.el._cy = f.cy;
        setXY(f.el, f.cx, f.cy);
      }
    }
    if (sim) {
      // guests wander (engine-seeded, sampled ~15Hz — the easing below smooths between samples);
      // hush + freeze near a stalled duty-holder
      var seed = (sim.cfg && sim.cfg.seed) || 1;
      if (!anim.acts || ts - anim.actsAt > 66) { anim.acts = P.ambientActors(seed, phase); anim.actsAt = ts; }
      var acts = anim.acts, hot = anim.hotPts || [];
      for (var a = 0; a < acts.length; a++) {
        var g = acts[a], gs = anim.guest[g.id]; if (!gs || !gs.el) continue;
        var gx = gs.cast ? gs.homeX : g.x, gy = gs.cast ? gs.homeY : g.y;
        var hush = false, nx = gs.cx / anim.w, ny = gs.cy / anim.h;
        for (var h = 0; h < hot.length; h++) { var dxg = nx - hot[h].x, dyg = ny - hot[h].y; if (dxg * dxg + dyg * dyg < HUSH_R2) { hush = true; break; } }
        gs.el.classList.toggle('hushed', hush); gs.hushed = hush; gs.act = g.act;
        if (!hush) {
          if (rm) { gs.cx = gx * anim.w; gs.cy = gy * anim.h; }
          else { gs.cx += (gx * anim.w - gs.cx) * kAmb; gs.cy += (gy * anim.h - gs.cy) * kAmb; }
        }
        gs.el._cx = gs.cx; gs.el._cy = gs.cy;
        setXY(gs.el, gs.cx, gs.cy);
      }
      // the boat sails a quadratic arc through the bay, bow to the heading, wake while under way
      var bs = P.boatState(sim), b = anim.boat;
      if (b && b.el) {
        var tq = bs.param, u = 1 - tq;
        var bx = (u * u * DOCK.x + 2 * u * tq * BOATC.x + tq * tq * SEA.x) * anim.w;
        var by = (u * u * DOCK.y + 2 * u * tq * BOATC.y + tq * tq * SEA.y) * anim.h;
        if (rm) { b.cx = bx; b.cy = by; }
        else { b.cx += (bx - b.cx) * kAmb; b.cy += (by - b.cy) * kAmb; }
        b.el._cx = b.cx; b.el._cy = b.cy;
        setXY(b.el, b.cx, b.cy);
        b.el.classList.toggle('sailing', bs.atSea);
        b.el.classList.toggle('faceL', bs.phase === 'outbound' || bs.phase === 'ground');   // bow toward the open sea
        if (!rm && bs.atSea && Math.abs(tq - b.lastParam) > 0.0004 && ts - (b.wakeAt || 0) > 170) {
          b.wakeAt = ts;
          var wk = anim.wakes[b.wakeI = ((b.wakeI || 0) + 1) % anim.wakes.length];
          if (wk && wk.el) { wk.x = b.cx; wk.y = b.cy + 3; wk.t0 = ts; }
        }
        b.lastParam = tq;
        for (var w2 = 0; w2 < anim.wakes.length; w2++) {
          var wke = anim.wakes[w2]; if (!wke.el || !wke.t0) continue;
          var wa = (ts - wke.t0) / 900;
          if (wa >= 1) { wke.el.style.opacity = 0; wke.t0 = 0; continue; }
          setXY(wke.el, wke.x, wke.y);
          wke.el.style.opacity = (1 - wa) * 0.5;
        }
      }
      updateMotes(ts);
    }
    updateCascade(ts);
    updateTweens(ts);
    // Tier 2: paint the canvas scene from the same interpolated caches the DOM stage uses (read-only)
    if (USE_CANVAS && stageCtx && sim && window.PRS_STAGE) {
      var stageView = {
        w: anim.w, h: anim.h, scale: stageScaleNow(), lang: L, rm: RM.matches,
        night: sim.mode === 'minute' && (sim.clockMin < 330 || sim.clockMin >= 1110),
        speedMult: speedMult, guestsVisible: guestsVisible,
        hoverPid: null, spotlightPid: stageSpotPid, tintMap: stageTint, gapState: stageGapState,
        fig: anim.fig, guest: anim.guest, boat: anim.boat, wakes: anim.wakes,
        motes: anim.motes, cascade: anim.cascade,
        ghost: stageGhost, trail: stageTrail, chain: stageChain, hotPts: anim.hotPts,
        frozen: !!(paused || livePausedForFix || (sim && sim.paused))
      };
      PRS_STAGE.scene(stageCtx, sim, ts / 1000, stageView);
      if (PRS_STAGE.hubSections) syncHubSections(PRS_STAGE.hubSections(stageView));
    }
    anim.raf = requestAnimationFrame(frame);
  }

  // the signature 見せ場: a red comet (with trail + per-hop strike) rolls 港→船→食堂 while a fault is live
  function updateCascade(ts) {
    var pulse = $('cascade-pulse'); if (!pulse) return;
    var c = anim.cascade;
    function hideGhosts() { for (var i = 0; i < anim.ghost.length; i++) anim.ghost[i].classList.remove('show'); }
    if (RM.matches) {                          // reduced motion: a static red chain marks the affected stations
      pulse.classList.remove('show'); hideGhosts();
      var wantChain = c && c.has && c.hops.length >= 1;
      if (wantChain && !anim.chainOn) {
        anim.chainOn = true; anim.chain = [];
        c.hops.forEach(function (hp) {
          var st = P.station(hp.station), d2 = document.createElement('span'); d2.className = 'cstatic';
          d2.style.transform = 'translate3d(' + (st.x * anim.w) + 'px,' + (st.y * anim.h - 30) + 'px,0)';
          $('sitemap').appendChild(d2); anim.chain.push(d2);
        });
      } else if (!wantChain && anim.chainOn) { anim.chain.forEach(function (n) { n.remove(); }); anim.chain = []; anim.chainOn = false; }
      return;
    }
    if (anim.chainOn) { anim.chain.forEach(function (n) { n.remove(); }); anim.chain = []; anim.chainOn = false; }
    if (!c || !c.has || c.hops.length < 2 || paused || livePausedForFix || (sim && sim.paused)) { pulse.classList.remove('show'); hideGhosts(); return; }
    var HOP = 1000, hops = c.hops, span = (hops.length - 1) * HOP, total = span + 900, tt = ts % total;
    if (tt >= span) { pulse.classList.remove('show'); hideGhosts(); anim.strikeSeg = -1; anim.trail.length = 0; return; }
    var seg = Math.floor(tt / HOP), f0 = (tt % HOP) / HOP, frac = f0 * f0 * (3 - 2 * f0);
    var A = P.station(hops[seg].station), B = P.station(hops[Math.min(hops.length - 1, seg + 1)].station);
    var x = (A.x + (B.x - A.x) * frac) * anim.w, y = (A.y + (B.y - A.y) * frac) * anim.h;
    setXY(pulse, x, y); pulse.classList.add('show');
    // trail ghosts follow the comet's recent path
    anim.trail.push({ x: x, y: y, t: ts });
    while (anim.trail.length && ts - anim.trail[0].t > 300) anim.trail.shift();
    for (var gi = 0; gi < anim.ghost.length; gi++) {
      var idx = anim.trail.length - 1 - (gi + 1) * 5, ge = anim.ghost[gi];
      if (idx < 0) { ge.classList.remove('show'); continue; }
      setXY(ge, anim.trail[idx].x, anim.trail[idx].y);
      ge.style.opacity = 0.5 - gi * 0.14;
      ge.classList.add('show');
    }
    // arriving at a hop strikes that station — cause → effect, not a cruising dot
    if (seg !== anim.strikeSeg) {
      if (anim.strikeSeg >= 0 && seg > 0) {
        var hitSt = hops[seg].station, node = $('st-' + hitSt);
        if (node) { node.classList.remove('strike'); void node.offsetWidth; node.classList.add('strike'); setTimeout(function () { node.classList.remove('strike'); }, 340); }
      }
      anim.strikeSeg = seg;
    }
  }

  // dashboard readouts glide to their new value; ±N floats; gold pulse is reserved for exactly 100
  function tweenNum(el, target, sfx) {
    if (!el) return;
    sfx = sfx || '';
    if (RM.matches || !anim) { if (el._v !== target) { el._v = target; el._shown = target; el.textContent = target + sfx; } return; }
    if (el._v == null) { el._v = target; el._shown = target; el.textContent = target + sfx; return; }
    if (el._v === target) return;
    var prev = el._v;
    el._from = el._shown != null ? el._shown : prev;
    el._v = target; el._t0 = 0; el._sfx = sfx;
    anim.tweens[el.id] = el;
    if (Math.abs(target - prev) >= 3) floatDelta(el.parentNode, (target > prev ? '+' : '') + (target - prev), target >= prev ? 'up' : 'down');
    // the gold pulse lives on the .bigreadout wrapper (the CSS carrier), reserved for exactly 100
    if (target === 100 && el.parentNode) { var host = el.parentNode; host.classList.remove('gold'); void host.offsetWidth; host.classList.add('gold'); }
  }
  function updateTweens(ts) {
    for (var id in anim.tweens) {
      var el = anim.tweens[id];
      if (!el._t0) el._t0 = ts;
      var k = Math.min(1, (ts - el._t0) / 380);
      el._shown = Math.round(el._from + (el._v - el._from) * k);
      el.textContent = el._shown + (el._sfx || '');
      if (k >= 1) delete anim.tweens[id];
    }
  }

  // time of day falls across the map, driven only by the deterministic minute clock
  var SKY = [
    [240, [13, 19, 38], [24, 32, 52], 0.52],     // 04:00 pre-dawn dark
    [300, [24, 28, 52], [88, 52, 64], 0.44],     // 05:00 first light
    [330, [44, 38, 66], [196, 100, 74], 0.38],   // 05:30 dawn rose
    [420, [52, 68, 94], [232, 166, 96], 0.25],   // 07:00 sunrise gold — the boat departs into it
    [600, [64, 96, 126], [126, 154, 172], 0.15], // 10:00 morning
    [780, [74, 108, 138], [148, 170, 184], 0.11],// 13:00 midday (lightest)
    [960, [70, 92, 118], [204, 154, 92], 0.19],  // 16:00 the cook block begins — light turns
    [1080, [56, 54, 88], [226, 114, 62], 0.32],  // 18:00 dinner sunset
    [1140, [28, 32, 58], [124, 64, 74], 0.44],   // 19:00 dusk
    [1200, [12, 18, 36], [22, 30, 50], 0.52]     // 20:00 night
  ];
  function updateSky(s) {
    var el = $('skytint'), map = $('sitemap'); if (!el) return;
    if (s.mode !== 'minute') {
      if (anim.skyKey !== 'off') { anim.skyKey = 'off'; el.style.background = 'none'; map.classList.remove('night'); }
      return;
    }
    var m = clamp(s.clockMin, 240, 1200);
    if (anim.skyKey === m) return;
    anim.skyKey = m;
    var i = 0;
    while (i < SKY.length - 2 && SKY[i + 1][0] <= m) i++;
    var a = SKY[i], b = SKY[i + 1], k = clamp((m - a[0]) / Math.max(1, b[0] - a[0]), 0, 1);
    function mx(ca, cb, j) { return Math.round(ca[j] + (cb[j] - ca[j]) * k); }
    var top = mx(a[1], b[1], 0) + ',' + mx(a[1], b[1], 1) + ',' + mx(a[1], b[1], 2);
    var hor = mx(a[2], b[2], 0) + ',' + mx(a[2], b[2], 1) + ',' + mx(a[2], b[2], 2);
    var al = a[3] + (b[3] - a[3]) * k;
    el.style.background = 'linear-gradient(180deg, rgba(' + top + ',' + al.toFixed(3) + ') 0%, rgba(' + top + ',' + (al * 0.8).toFixed(3) + ') 52%, rgba(' + hor + ',' + al.toFixed(3) + ') 100%)';
    map.classList.toggle('night', m < 330 || m >= 1110);
  }

  function renderSim(s) {
    var pos = figTargets(s);
    anim.hotPts = [];
    s.participants.forEach(function (p) {
      var f = anim.fig[p.id];
      if (!f) {
        var el = document.createElement('div'); el.className = 'astro';
        el.setAttribute('data-pid', p.id);
        el.style.setProperty('--rc', P.role(p.roleId).color);
        el.innerHTML = '<div class="fig"><span class="sh"></span><div class="pw"><span class="lg l"></span><span class="lg r"></span><span class="tr"></span><span class="hd"></span><span class="hat"></span></div></div><div class="nm"></div><div class="bub"></div>';
        $('figs').appendChild(el);
        var st0 = P.station(p.station);
        var feet0 = FEET_BASE * (USE_CANVAS ? stageScaleNow() : 1);
        f = anim.fig[p.id] = { el: el, bub: el.querySelector('.bub'), nmEl: el.querySelector('.nm'),
          cx: st0.x * anim.w, cy: st0.y * anim.h + feet0, tx: st0.x * anim.w, ty: st0.y * anim.h + feet0, st: '', lang: '',
          pid: p.id, spdMul: figSpeedMul(p.id), spd: 0, wp: [], wpi: 0, stn: p.station };
        el._cx = f.cx; el._cy = f.cy;
        setXY(el, f.cx, f.cy);
      }
      if (f.lang !== L) { f.nmEl.innerHTML = '<i>' + P.role(p.roleId).icon + '</i>' + nm(p.name); f.lang = L; }
      var t = pos[p.id]; if (t) { f.tx = t.x; f.ty = t.y; }
      if (f.stn !== p.station) { routeWaypoints(f, f.stn, p.station); f.stn = p.station; }   // engine moved this figure: recompute the road route
      if (f.el) f.el._stn = p.station;   // persist current station on the DOM node so a keepActors rebuild keeps the route
      // the rAF loop owns walking/faceL; the live spotlight owns spot — preserve them across state writes
      var keep = (f.el.className.indexOf('walking') >= 0 ? ' walking' : '') +
                 (f.el.className.indexOf('faceL') >= 0 ? ' faceL' : '') +
                 (f.el.className.indexOf('spot') >= 0 ? ' spot' : '');
      f.el.className = 'astro s-' + p.state + keep;
      f.bub.textContent = BUB[p.state] || '';
      if (f.st !== p.state) {                    // state change: pop the bubble chip once
        f.st = p.state; f.el._st = p.state; f.bubT0 = anim.last || 0;
        if (!RM.matches && f.bub.textContent) { f.bub.classList.remove('pop'); void f.bub.offsetWidth; f.bub.classList.add('pop'); }
      }
      if (STALL_STATES[p.state]) { var st = P.station(p.station); anim.hotPts.push({ x: st.x, y: st.y }); }
    });
    // stations: crew count + dominant problem badge + "territory" tint (green/amber/red)
    var terr = P.stationReadiness(s);
    s.stations.forEach(function (st) {
      var ring = $('ring-' + st.id); if (ring) { ring.textContent = st.crewIds.length ? st.crewIds.length : ''; ring.classList.toggle('show', st.crewIds.length > 0); }
      var badge = $('badge-' + st.id), node = $('st-' + st.id);
      var hot = st.dominantProblem && st.crewIds.length;
      if (badge) { badge.textContent = hot ? ('⛔ ' + T()['p_' + st.dominantProblem.id + '_title']) : ''; badge.classList.toggle('show', !!hot); }
      if (node) {
        node.classList.toggle('stalled', !!hot);
        var tv = terr[st.id] || 'none';
        node.classList.toggle('terr-green', tv === 'green');
        node.classList.toggle('terr-amber', tv === 'amber');
        node.classList.toggle('terr-red', tv === 'red');
        // §21.4: canvas hides .st-nm, so keep the hotspot's accessible name current (+ live problem status)
        node.setAttribute('aria-label', nm(P.station(st.id).name) + (hot ? ' — ' + T()['p_' + st.dominantProblem.id + '_title'] : ''));
      }
    });
    var ban = $('banner'); if (s.bannerOn && appMode !== 'live') { ban.textContent = T().bannerText; ban.classList.add('show'); } else ban.classList.remove('show');
    $('sitemap').classList.toggle('blocked', !!s.bannerOn);
    $('nowtag').textContent = s.mode === 'minute'
      ? (s.segment === 'fishday' ? T().fdDayLine(hhmm(s.clockMin)) : dayLabel(s.segment) + ' · ' + hhmm(s.clockMin))
      : T().dayLine(Math.min(P.DAYS, Math.ceil(s.day)), P.DAYS) + (s.phaseLabel ? ' · ' + nm(s.phaseLabel) : '');
    updateSky(s);
    scheduleMotes(s);
    updatePressure(s);
    renderDashboard(s);
    if (USE_CANVAS) updateStageRoster(s);
  }

  // §21.4 offscreen a11y roster: the canvas stage draws the 11 duty-holders with no DOM, so a
  // screen-reader loses the crew entirely. Mirror their name/role/state into a visually-hidden,
  // aria-live=polite list. Read-only (no sim writes); rebuilt only when the text actually changes
  // so the live region doesn't thrash on every tick.
  function updateStageRoster(s) {
    var el = $('stage-roster'); if (!el) return;
    var t = T();
    var lines = s.participants.map(function (p) {
      // §21.4: during a Live freeze the canvas shows the gap taxonomy on the spotlighted crewmate — mirror it to AT
      var pst = (stageGapState && stageGapState.pid === p.id) ? stageGapState.state : p.state;
      return P.role(p.roleId).icon + ' ' + nm(p.name) + ' — ' + (t[STATE_KEY[pst]] || pst);
    });
    var sig = L + '|' + lines.join('¦');
    if (el._sig === sig) return;
    el._sig = sig;
    el.innerHTML = '<h2>' + t.rosterHeading + '</h2><ul>' + lines.map(function (ln) { return '<li>' + ln + '</li>'; }).join('') + '</ul>';
  }

  // minute-mode pressure: a live countdown to the 18:00 dinner + the fanfare payoff
  function updatePressure(s) {
    var tag = $('dinnertag'); if (!tag) return;
    // the 18:00 dinner countdown + fanfare are fishday-specific — a coarse animated day has no dinner deadline
    if (s.mode !== 'minute' || s.segment !== 'fishday') { tag.classList.add('hidden'); return; }
    tag.classList.remove('hidden');
    var t = T(), DINNER = 1080, now = s.clockMin, dm = s.sched ? s.sched.dinnerMin : null;
    var willLate = dm != null && dm > DINNER;
    if (now < DINNER) { tag.textContent = t.dinnerIn(hhmm(DINNER - now)) + (willLate ? ' · ' + t.dinnerWillLate(dm - DINNER) : ''); }
    else { tag.textContent = (dm != null && dm <= DINNER) ? t.dinnerOnNow : t.dinnerLateNow; }
    tag.className = 'dinnertag' + (willLate || now > DINNER ? ' late' : (DINNER - now <= 120 ? ' soon' : ''));
    // fanfare: dinner served on time — the age-up moment, fired once
    if (!anim.fanfared && s.sched && dm != null && dm <= DINNER && s.sched.wrongFish.length === 0) {
      var serve = s.sched.byTask['t_f_serve'];
      if (serve && now >= serve.start) { anim.fanfared = true; fireFanfare(); }
    }
  }
  function fireFanfare() {
    var ff = $('fanfare'); if (!ff) return;
    ff.textContent = T().fanfareText; ff.classList.remove('show'); void ff.offsetWidth; ff.classList.add('show');
    setTimeout(function () { ff.classList.remove('show'); }, 2600);
  }

  function renderDashboard(s) {
    // §21.8b: a coarse animated day reads its live grade + efficiency from the rule-based scoreDay over
    // the merged plan.days[seg] (same source as the report), not the classic score() (which grades the frame).
    var coarseMin = s.mode === 'minute' && s.segment !== 'fishday';
    var sc = coarseMin ? P.scoreDay(s.plan, s.segment) : P.score(s), t = T();
    // §Phase3a — SWITCH: non-Live (Morning) runs read the readiness/efficiency headline off the
    // whole-trip ledger (scoreTrip/tripEfficiency) instead of the legacy per-segment scorers above.
    // Live keeps its legacy source untouched (Phase 4 retunes Live).
    var trip = appMode !== 'live' ? P.scoreTrip(s.plan) : null;
    var tripEff = appMode !== 'live' ? P.tripEfficiency(s.plan) : null;
    $('dash-day').textContent = s.mode === 'minute' ? (s.segment === 'fishday' ? t.fdDayLine(hhmm(s.clockMin)) : dayLabel(s.segment) + ' · ' + hhmm(s.clockMin)) : T().dayLine(Math.min(P.DAYS, Math.ceil(s.day)), P.DAYS);
    $('dash-phase').textContent = s.phaseLabel ? nm(s.phaseLabel) : '';
    // fishday: Efficiency % beside the grade (§9) + idle/rework minutes
    $('dash-fd').classList.toggle('hidden', s.mode !== 'minute');
    if (s.mode === 'minute') {
      var effVal = tripEff != null ? tripEff : sc.efficiency;
      tweenNum($('dash-eff'), effVal, '%');
      $('dash-eff-bar').style.width = effVal + '%';
      $('dash-eff-bar').className = effVal >= 98 ? 'ok' : (effVal >= 90 ? 'mid' : 'bad');
      // idle accrued SO FAR (climbs live as the clock passes each waiting task's start)
      var idleSoFar = 0;
      if (s.sched) s.tasks.forEach(function (tk) {
        if (tk.scope !== 'in') return; var e = s.sched.byTask[tk.id]; if (!e) return;
        idleSoFar += Math.max(0, Math.min(s.clockMin, e.start) - tk.startMin) * Math.max(1, tk.assignedIds.length);
      });
      $('dash-idle').textContent = t.idleLine(Math.round(idleSoFar), sc.reworkMin);
      var ib = $('dash-idle-bar');
      if (ib) { var iw = Math.min(100, idleSoFar / 2.2); ib.style.width = iw + '%'; ib.className = idleSoFar <= 0 ? 'ok' : (iw > 40 ? 'bad' : 'mid'); }
    }
    var readyVal = trip ? trip.total : sc.score;
    tweenNum($('dash-ready'), readyVal, '%');
    $('dash-ready-bar').style.width = readyVal + '%';
    $('dash-ready-bar').className = readyVal >= 75 ? 'ok' : (readyVal >= 60 ? 'mid' : 'bad');
    $('dash-ready').style.color = trip ? GRADE_COLOR[trip.grade] : '';
    var bpct = Math.round(s.budget.spent / s.budget.total * 100);
    $('dash-budget-txt').textContent = '¥' + nf(s.budget.spent) + ' / ¥' + nf(s.budget.total);
    $('dash-budget-bar').style.width = bpct + '%';
    // warnings — rebuilt only when the list actually changes, so keyboard focus survives the tick
    var w = $('dash-warnings');
    var wsig = L + '|' + s.problems.map(function (p) { return p.id + p.severity; }).join(',');
    if (w._sig !== wsig) {
      w._sig = wsig;
      if (!s.problems.length) w.innerHTML = '<div class="warn-ok">' + t.noWarnings + '</div>';
      else w.innerHTML = s.problems.map(function (p) {
        return '<div class="warn sev-' + p.severity + '" data-station="' + p.station + '" tabindex="0" role="button"><span class="warn-ic">' + (p.severity === 'high' ? '⛔' : '⚠️') + '</span>' + t['p_' + p.id + '_title'] + '</div>';
      }).join('');
    }
    // team performance (6 values) — classic score() only; a coarse day is graded by scoreDay, which
    // has no per-team performance block, so clear the bars rather than crash on the missing field.
    var team = sc.team;
    if (team) {
      var rows = [['action', 'perf-good'], ['decision', 'perf-good'], ['coop', 'perf-good'], ['contribution', 'perf-good'], ['load', 'perf-stress'], ['fatigue', 'perf-stress']];
      var lblK = { action: 'ivAction', decision: 'ivDecision', coop: 'ivCoop', contribution: 'ivContribution', load: 'ivLoad', fatigue: 'ivFatigue' };
      $('dash-perf').innerHTML = rows.map(function (r) {
        var v = team[r[0]];
        return '<div class="perfbar"><div class="pf-top"><span>' + t[lblK[r[0]]] + '</span><b>' + v + '</b></div><div class="pf-bar ' + r[1] + '"><i style="width:' + v + '%"></i></div></div>';
      }).join('');
    } else { $('dash-perf').innerHTML = ''; }
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
  function updateRunButtons() {
    $('btn-pause').textContent = paused ? T().resumeBtn : T().pauseBtn;
    var gb = $('btn-guests');
    if (gb) { gb.textContent = guestsVisible ? T().guestsHide : T().guestsShow; gb.setAttribute('aria-label', T().guestsToggleAria); }
    var db = $('btn-drawer');
    if (db) { db.textContent = dashboardOpen ? T().drawerHide : T().drawerShow; db.setAttribute('aria-label', T().drawerAria); }
  }

  // ---- modal focus management: remember the invoker, restore focus on close ----
  var lastFocus = null;
  function modalOpening(id) {
    if (!$(id).classList.contains('show')) {
      var a = document.activeElement;
      lastFocus = (a && a !== document.body) ? a : null;
    }
  }
  function modalClosed() {
    if (lastFocus && document.body.contains(lastFocus)) { try { lastFocus.focus(); } catch (e2) { } }
    lastFocus = null;
  }

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
      var seenW = {};
      var waits = mi.waiting.map(function (w) {
        seenW[w.cardId] = 1;
        var c = byId(sim.plan.infoCards, w.cardId);
        return '<span class="ins-card wait">⏳ ' + nm(c ? c.name : w.cardId).split('：')[0].split(':')[0] + ' → ' + hhmm(w.etaMin) +
          ' <button class="btn sm primary ins-send" data-card="' + w.cardId + '" data-role="' + p.roleId + '">' + t.sendNow + '</button></span>';
      }).join('');
      // cards the current task waits on with NO arrow drawn (missing) — still hand-feedable
      waits += mi.waitsOn.filter(function (w) { return w.cardId && !seenW[w.cardId]; }).map(function (w) {
        var c = byId(sim.plan.infoCards, w.cardId);
        return '<span class="ins-card wait">⏳ ' + nm(c ? c.name : w.cardId).split('：')[0].split(':')[0] + ' → ' + (w.missing ? t.inspMissing : hhmm(w.until)) +
          ' <button class="btn sm primary ins-send" data-card="' + w.cardId + '" data-role="' + p.roleId + '">' + t.sendNow + '</button></span>';
      }).join('');
      // look up in sim.tasks (the live segment's task list) — coarse-day ids (hd_*) live there, not in plan.tasks
      var ctk = mi.currentTaskId ? byId(sim.tasks, mi.currentTaskId) : null, ntk = mi.nextTaskId ? byId(sim.tasks, mi.nextTaskId) : null;
      var cur = ctk ? nm(ctk.name) : '—';
      var nxt = ntk ? nm(ntk.name) + (mi.nextAtMin != null ? ' (' + hhmm(mi.nextAtMin) + ')' : '') : '—';
      return '<div class="insp-row"><span class="ins-ic2" style="background:' + rr.color + '">' + rr.icon + '</span>' +
        '<div class="ins-main"><b>' + nm(p.name) + '</b><span class="ins-state">' + (BUB[p.state] || '') + ' ' + (t[STATE_KEY[p.state]] || p.state) + '</span>' +
        '<div class="ins-line">' + t.inspNowDoing + ': ' + cur + ' · ' + t.inspNext + ': ' + nxt + '</div>' +
        '<div class="ins-cards">' + held + (waits || '<span class="ins-none">' + t.inspIdleFree + '</span>') + '</div></div></div>';
    }).join('');
    var wasOpen = $('inspect-modal').classList.contains('show');
    if (!wasOpen) modalOpening('inspect-modal');
    $('inspect-modal').classList.add('show');
    if (!wasOpen) $('insp-resume').focus();
  }
  function closeInspector() { $('inspect-modal').classList.remove('show'); if (sim && sim.paused) P.resume(sim); modalClosed(); }

  // ---- problem detail panel ----
  function openProblemPanel(stationId) {
    if (!sim) return;
    lastDetailStation = stationId;
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
    var wasOpen = $('detail-modal').classList.contains('show');
    if (!wasOpen) modalOpening('detail-modal');
    $('detail-modal').classList.add('show');
    if (!wasOpen) $('detail-close').focus();
  }
  function closeDetail() { $('detail-modal').classList.remove('show'); modalClosed(); }
  // §map: clicking a Hinata section (Food / Fishing rod / Transport) opens an info panel
  function openSectionPanel(id) {
    var t = T(), ic = { food: '🍱', rod: '🎣', transport: '🚤' };
    $('detail-ic').textContent = ic[id] || '📍';
    $('detail-title').textContent = t['sec_' + id + '_t'] || id;
    $('detail-sub').textContent = nm(P.station('mess').name);   // "Hinata"
    $('detail-body').innerHTML = '<div class="dt-note">' + (t['sec_' + id + '_b'] || '') + '</div>';
    var wasOpen = $('detail-modal').classList.contains('show');
    if (!wasOpen) modalOpening('detail-modal');
    $('detail-modal').classList.add('show');
    if (!wasOpen) $('detail-close').focus();
  }
  // position the 3 Hinata section hotspots over where stage.js draws them (dead-banded per frame)
  function syncHubSections(secs) {
    for (var i = 0; i < secs.length; i++) {
      var sc = secs[i], hb = $('sec-' + sc.id); if (!hb) continue;
      var lx = sc.cx - sc.r, ty = sc.cy - sc.r, d = sc.r * 2;
      if (hb._sl !== lx || hb._stp !== ty) { hb.style.left = lx + 'px'; hb.style.top = ty + 'px'; hb.style.width = d + 'px'; hb.style.height = d + 'px'; hb._sl = lx; hb._stp = ty; }
      if (hb._lb !== sc.label) { hb.setAttribute('aria-label', sc.label); hb._lb = sc.label; }
    }
  }

  // =========================================================================
  // REPORT
  // =========================================================================
  function finish() {
    clearInterval(timer); timer = null;
    // §21.8b: a coarse animated day (arrival/ops/return) is graded by the rule-based P.scoreDay over the
    // authored plan.days[seg] arrangement — NOT the classic score()/daySummary, which read the 10-day frame's
    // plan.tasks. The plan gaps that stalled the run are exactly what scoreDay marks the day down for.
    if (sim.mode === 'minute' && sim.segment !== 'fishday') {
      lastResult = { trip: null, day: P.scoreDay(sim.plan, sim.segment), segment: sim.segment, coarse: true };
    } else {
      lastResult = { trip: P.score(sim), day: (sim.segment !== 'all' ? P.daySummary(sim) : null), segment: sim.segment };
    }
    var simAt = sim;
    clearFinishTimer();
    finishTimer = setTimeout(function () {
      finishTimer = null;
      if (sim !== simAt) return;      // a mode/screen change won the race — don't pop the report over it
      stopAnim(); document.body.classList.remove('running'); $('run').classList.add('hidden'); $('report').classList.remove('hidden'); renderReport(lastResult);
    }, 700);
  }

  var CAT_ORDER = ['objective', 'schedule', 'roles', 'info', 'budget', 'safety', 'quality', 'health'];
  var CAT_KEY = { objective: 'catObjective', schedule: 'catSchedule', roles: 'catRoles', info: 'catInfo', budget: 'catBudget', safety: 'catSafety', quality: 'catQuality', health: 'catHealth' };
  var GRADE_COLOR = { A: 'var(--build)', B: 'var(--leader)', C: 'var(--idle)', D: 'var(--wait)' };

  // =========================================================================
  // §Phase3b — SCORE LEDGER: the whole-trip 100 (P.scoreTrip) rendered as a
  // list where every point is a named, reasoned row, grouped bucket -> dimension
  // -> atom. Reads only trip.atoms/byBucket (engine.js §13.2/§13.3); never writes.
  // =========================================================================
  var LEDGER_BUCKETS = ['frame', 'arrival', 'ops', 'fishday', 'return'];
  var LEDGER_DIMS = ['info', 'exec', 'safety', 'quality', 'money', 'people'];
  var LEDGER_TITLE = { en: 'Score Ledger — every point, named', ja: '採点台帳 — すべての得点に理由' };
  // a coarse/fishday single-day report shows that bucket + the trip-wide 'frame' bucket
  // (frame atoms are standing authorities, not tied to one day); 'all' shows all five.
  function ledgerBucketsFor(segment) {
    if (segment === 'all') return LEDGER_BUCKETS;
    return segment === 'frame' ? ['frame'] : ['frame', segment];
  }
  // only 4 gate atoms (money/evac authority checks with no card or task) carry neither a
  // cardId nor a taskId nor a truthy detectorId — humanize the atom id as a last resort so
  // every row still names something (strip the bucket_/dimension_ prefixes it was built with).
  function ledgerHumanizeId(id, bucket) {
    var s = id || '';
    var bp = bucket + '_'; if (s.indexOf(bp) === 0) s = s.slice(bp.length);
    for (var i = 0; i < LEDGER_DIMS.length; i++) { var dp = LEDGER_DIMS[i] + '_'; if (s.indexOf(dp) === 0) { s = s.slice(dp.length); break; } }
    s = s.replace(/_/g, ' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
  }
  // explicit bilingual labels for the gate atoms whose itemRef carries no card/task and no
  // (truthy) detectorId — otherwise ledgerHumanizeId would surface a raw-id hack ("Transport
  // auth", "Evac plan"). The two frame abort gates share one detector label ("Safety authority
  // (sea / night)"), so name them apart here too (sea vs night) — worded off the same budget-line
  // / risk data they are priced against, so the ledger reads like the rest of the UI.
  var LEDGER_ITEM_NM = {
    frame_abort_sea: { en: 'Rough-sea abort authority', jp: '時化時の中止権限' },
    frame_abort_night: { en: 'Night-sea abort authority', jp: '夜間の中止権限' },
    arrival_money_transport_auth: { en: 'Transport budget sign-off', jp: '交通費の承認' },
    ops_money_onsite_auth: { en: 'On-site budget sign-off', jp: '現地費の承認' },
    ops_money_tackle_auth: { en: 'Gear / tackle budget sign-off', jp: '道具費の承認' },
    return_safety_evac_plan: { en: 'Typhoon evacuation plan', jp: '台風時の避難計画' }
  };
  // resolve a bilingual display name for one atom's itemRef, off the SAME arrays the atom
  // was priced against: socket/gate-with-card -> the info card; lane/gate-with-task/decoy ->
  // the task(s) via P.tasksForSeg(plan,bucket) (fishday included — tasksForSeg dispatches);
  // gate-with-detector -> the existing problem-panel label (e_<id>_label).
  function ledgerItemName(plan, atom) {
    var ref = atom.itemRef, bucket = atom.bucket, roleName, tasks, tids, names, i, tk, card;
    if (LEDGER_ITEM_NM[atom.id]) return nm(LEDGER_ITEM_NM[atom.id]);
    if (!ref) return ledgerHumanizeId(atom.id, bucket);
    if (ref.cardId) {
      card = byId(plan.infoCards, ref.cardId);
      roleName = ref.roleId ? nm(P.role(ref.roleId).name) : '';
      return (card ? nm(card.name) : ref.cardId) + (roleName ? ' → ' + roleName : '');
    }
    if (ref.taskId) {
      tids = Array.isArray(ref.taskId) ? ref.taskId : [ref.taskId];
      tasks = bucket === 'frame' ? [] : P.tasksForSeg(plan, bucket);
      names = [];
      for (i = 0; i < tids.length; i++) { tk = byId(tasks, tids[i]); names.push(tk ? nm(tk.name) : tids[i]); }
      roleName = ref.roleId ? nm(P.role(ref.roleId).name) : '';
      return (roleName ? roleName + ': ' : '') + names.join(' · ');
    }
    if (ref.detectorId) return T()['e_' + ref.detectorId + '_label'] || ref.detectorId;
    return ledgerHumanizeId(atom.id, bucket);
  }
  // status -> {sst_*} chip label; 'present-but-late' (a riskable socket drawn but late, 1/3
  // partial credit) has no dedicated chip key, so it reads as the existing 'late' chip.
  var LEDGER_STATUS_KEY = { ok: 'ok', missing: 'missing', late: 'late', broken: 'broken', overlap: 'overlap', compressed: 'compressed', decoy: 'decoy', 'present-but-late': 'late' };
  function ledgerChip(status) { return T()['sst_' + (LEDGER_STATUS_KEY[status] || 'missing')] || status; }
  // reasonKey is almost always a plain scr_* string; a couple may be function-valued (take
  // reasonParams) per the ledger contract, so honor both.
  function ledgerReason(atom) {
    var v = T()[atom.reasonKey];
    if (typeof v === 'function') return v(atom.reasonParams || {});
    return v || atom.reasonKey;
  }
  // earned/max -> full (calm/green) | partial (amber) | zero (stands out/red). A decoy row
  // (maxPts 0) is 'full' when clean (not placed) and 'zero' only when its penalty actually bit.
  function ledgerTier(atom) {
    if (atom.maxPts > 0) return atom.earned >= atom.maxPts ? 'full' : (atom.earned > 0 ? 'partial' : 'zero');
    return atom.earned < 0 ? 'zero' : 'full';
  }
  function renderLedger(trip, segment) {
    var plan = currentPlan(), buckets = ledgerBucketsFor(segment), i, a;
    var titleEl = $('ledger-title'); if (titleEl) titleEl.textContent = LEDGER_TITLE[L] || LEDGER_TITLE.en;
    // hide the legacy 8-cat scorecard now that the ledger is the primary breakdown (code kept,
    // just hidden — nothing else that reads/writes #scorecard's innerHTML is touched).
    var scCard = $('scorecard') && $('scorecard').closest('.card'); if (scCard) scCard.classList.add('hidden');
    var byBucketDim = {};
    for (i = 0; i < trip.atoms.length; i++) {
      a = trip.atoms[i]; if (buckets.indexOf(a.bucket) < 0) continue;
      byBucketDim[a.bucket] = byBucketDim[a.bucket] || {};
      (byBucketDim[a.bucket][a.dimension] = byBucketDim[a.bucket][a.dimension] || []).push(a);
    }
    $('ledger').innerHTML = buckets.map(function (bk) {
      var bStat = trip.byBucket[bk], dims = byBucketDim[bk] || {};
      var dimHtml = LEDGER_DIMS.filter(function (d) { return dims[d] && dims[d].length; }).map(function (d) {
        var group = dims[d], dEarned = 0, dMax = 0, j;
        for (j = 0; j < group.length; j++) { dMax += group[j].maxPts; dEarned += group[j].earned; }
        var rows = group.map(function (atom) {
          var tier = ledgerTier(atom), pts = atom.maxPts > 0 ? (atom.earned + '/' + atom.maxPts) : String(atom.earned);
          return '<div class="lg-row ' + tier + '">' +
            '<span class="lg-name">' + ledgerItemName(plan, atom) + '</span>' +
            '<span class="lg-chip ' + tier + '">' + ledgerChip(atom.status) + '</span>' +
            '<span class="lg-reason">' + ledgerReason(atom) + '</span>' +
            '<span class="lg-pts">' + pts + '</span></div>';
        }).join('');
        return '<div class="lg-dim"><div class="lg-dhead"><span>' + T()['sd_' + d] + '</span><b>' + dEarned + ' / ' + dMax + '</b></div>' +
          '<div class="lg-rows">' + rows + '</div></div>';
      }).join('');
      return '<div class="lg-bucket"><div class="lg-bhead"><span>' + T()['sb_' + bk] + '</span><b>' + bStat.earned + ' / ' + bStat.maxPts + '</b></div>' + dimHtml + '</div>';
    }).join('');
  }

  function renderReport(res) {
    // the individuals table has no coarse-day (scoreDay) analogue — hide its card for a coarse
    // report, and restore it for the animated fishday/whole-trip paths (idempotent either way).
    var indivCard = $('individuals').closest('.card');
    if (res.coarse) { if (indivCard) indivCard.classList.add('hidden'); renderDayReport(res); return; }
    if (indivCard) indivCard.classList.remove('hidden');
    var t = T(), sc = res.trip, day = res.day;
    // §Phase3a — SWITCH: the headline grade/score/verdict now comes from the whole-trip ledger
    // (scoreTrip) — one currency across the trip. A single-day (fishday) run sees that day's SLICE
    // of the trip 100 (the day-slice line below); a whole-trip ('all') run sees the full total.
    // The scorecard/fix-pack/individuals panels below stay on the legacy per-run scorers (sc/day) —
    // the itemized-ledger swap for those is a later phase.
    var trip = P.scoreTrip(currentPlan());
    $('r-grade').textContent = trip.grade; $('r-grade').style.color = GRADE_COLOR[trip.grade];
    var perfect = trip.gate.clean && trip.grade === 'A';
    var badge = $('r-badge'); badge.textContent = perfect ? (day ? t.badgeDayClean : t.badgePerfect) : ''; badge.classList.toggle('show', perfect);
    if (trip.gate.withheldA) {
      $('r-verdict').textContent = t.gradeGateB(trip.total);
    } else if (day) {
      $('r-verdict').textContent = day.clean ? t.rDayScoreOk(dayLabel(res.segment), trip.total) : t.rDayScoreGaps(dayLabel(res.segment), trip.total, day.gaps);
    } else {
      $('r-verdict').textContent = trip.total + ' / 100 — ' + (sc.reason === 'done' ? t.rDone : t.rIncomplete);
    }
    if (day) {
      $('r-conds').innerHTML = '<span class="cond ' + (day.clean ? 'met' : 'unmet') + '">' + (day.clean ? '✓' : '✗') + ' ' + t.dayTasksLine(day.tasksDone, day.tasksTotal) + '</span>';
      if (res.segment === 'fishday') {
        $('r-conds').innerHTML +=
          '<span class="cond ' + (sc.efficiency === 100 ? 'met' : 'unmet') + '">' + t.rcEff(sc.efficiency) + '</span>' +
          '<span class="cond ' + (sc.idleMin === 0 ? 'met' : 'unmet') + '">' + t.rcIdle(sc.idleMin) + '</span>' +
          '<span class="cond ' + (sc.reworkMin === 0 ? 'met' : 'unmet') + '">' + t.rcRework(sc.reworkMin) + '</span>' +
          (sc.wrongFishCount ? '<span class="cond unmet">🐟 ' + t.rcWrongFish(sc.wrongFishCount) + '</span>' : '') +
          (sc.dinnerMin != null ? '<span class="cond ' + (sc.dinnerMin <= 1080 ? 'met' : 'unmet') + '">' + t.rcDinner(hhmm(sc.dinnerMin)) + '</span>' : '') +
          (sc.handFed ? '<span class="cond unmet">' + t.handFedNote(sc.handFed) + '</span>' : '');
      }
      // §Phase3a — the day-slice line: this segment's earned/max share of the whole-trip 100.
      var b = trip.byBucket[res.segment];
      if (b) $('r-conds').innerHTML += '<span class="cond">' + t.daySliceLine(b.earned, b.maxPts, dayLabel(res.segment)) + '</span>';
    } else {
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
    renderLedger(trip, res.segment);
  }

  // §20 Phase 5: coarse-day (arrival/ops/return) report — scored straight off the authored
  // plan.days arrangement via P.scoreDay, no sim/animation involved. Reuses the same DOM the
  // animated fishday/whole-trip report renders into (renderReport branches to this for res.coarse).
  function renderDayReport(res) {
    var t = T(), seg = res.segment, sc = res.day, plan = currentPlan();
    var hints = P.dayReadiness(plan, seg);
    // §Phase3a — SWITCH: headline grade/score/verdict from the whole-trip ledger (scoreTrip); this
    // day's own 8-category scorecard + fix-list below still read the legacy sc (P.scoreDay)/hints —
    // that swap is a later phase.
    var trip = P.scoreTrip(plan);
    $('r-grade').textContent = trip.grade; $('r-grade').style.color = GRADE_COLOR[trip.grade];
    if (trip.gate.withheldA) {
      $('r-verdict').textContent = t.gradeGateB(trip.total);
    } else {
      $('r-verdict').textContent = sc.clean ? t.rDayScoreOk(dayLabel(seg), trip.total) : t.rDayScoreGaps(dayLabel(seg), trip.total, hints.length);
    }
    var perfectD = trip.gate.clean && trip.grade === 'A';
    var bd = $('r-badge'); bd.textContent = perfectD ? t.badgeDayClean : ''; bd.classList.toggle('show', perfectD);
    // the day-slice line: this segment's earned/max share of the whole-trip 100
    var b = trip.byBucket[seg];
    $('r-conds').innerHTML =
      (b ? '<span class="cond">' + t.daySliceLine(b.earned, b.maxPts, dayLabel(seg)) + '</span>' : '') +
      '<span class="cond ' + (sc.efficiency === 100 ? 'met' : 'unmet') + '">' + t.rcEff(sc.efficiency) + '</span>' +
      '<span class="cond ' + (sc.idleMin === 0 ? 'met' : 'unmet') + '">' + t.rcIdle(sc.idleMin) + '</span>' +
      '<span class="cond ' + (sc.reworkMin === 0 ? 'met' : 'unmet') + '">' + t.rcRework(sc.reworkMin) + '</span>' +
      (sc.dinnerMin != null ? '<span class="cond ' + (sc.dinnerMin <= 1080 ? 'met' : 'unmet') + '">' + t.rcDinner(hhmm(sc.dinnerMin)) + '</span>' : '');
    // the day's own 8-category rule-based score (§20.4) — same renderer + CAT_MAX as the trip scorecard.
    // scoreDay's per-category values are clamped floats (only its total is rounded), unlike score()'s
    // pre-rounded categories — round here at the display layer so the pillar numbers read as whole points.
    $('scorecard').innerHTML = CAT_ORDER.map(function (k) {
      var val = Math.round(sc.categories[k]), max = P.CAT_MAX[k], pct = Math.round(val / max * 100);
      return '<div class="pillar"><div class="pl-top"><span>' + t[CAT_KEY[k]] + '</span><b>' + val + '<small>/' + max + '</small></b></div><div class="pl-bar"><i style="width:' + pct + '%"></i></div></div>';
    }).join('');
    // fix-list: every dayReadiness hint, worded with the same rh* strings the live editor uses
    var segT = P.tasksForSeg(plan, seg);
    function tn(id) { var x = byId(segT, id); return x ? nm(x.name) : id; }
    function cn(id) { var x = byId(plan.infoCards, id); return x ? nm(x.name).split('：')[0].split(':')[0] : id; }
    function hintTxt(h) {
      if (h.type === 'UNPLACED_REQUIRED') return t.rhUnplaced(tn(h.taskId));
      if (h.type === 'DECOY_PLACED') return t.rhDecoy(tn(h.taskId));
      if (h.type === 'MISASSIGNED') return t.rhMisassigned(tn(h.taskId));
      if (h.type === 'MISSING_ARROW') return t.rhMissing(cn(h.cardId), tn(h.taskId));
      if (h.type === 'ARROW_LATE') return t.rhLate(cn(h.cardId), tn(h.taskId), h.lateMin);
      if (h.type === 'WRONG_FISH_RISK') return t.rhWrongFish(cn(h.cardId), tn(h.taskId));
      if (h.type === 'DEP_BROKEN') return t.rhDep(tn(h.taskId), tn(h.depId));
      if (h.type === 'OVERLOAD') { var pp = byId(plan.participants, h.personId); return t.rhOverload(pp ? nm(pp.name) : h.personId); }
      return '';
    }
    if (!hints.length) $('fixpack').innerHTML = '<div class="fix-clean">' + t.fixpackCleanDay(dayLabel(seg)) + '</div>';
    else $('fixpack').innerHTML = hints.map(function (h) {
      return '<div class="fix-row" data-type="' + h.type + '"><div class="fix-main"><div class="fix-body">' + hintTxt(h) + '</div></div></div>';
    }).join('') + '<button class="btn primary" id="btn-day-autofix">' + t.autoArrangeBtn + '</button>';
    $('individuals').innerHTML = '';
    renderLedger(trip, seg);
  }

  // "Auto-arrange the arrows ▶" — the coarse-day analogue of the fishday fix-pack: heal this
  // day's arrows to face-to-face (P.applyDayFix), persist the patch into dayOv, then re-score.
  function applyDayFixAndRerun() {
    var seg = daySel, cfg = P.applyDayFix(buildCfg(), seg);
    var patch = (cfg.overrides.days && cfg.overrides.days[seg] && cfg.overrides.days[seg].handoffs) || {};
    for (var k in patch) dayOv[seg].handoffs[k] = Object.assign({}, dayOv[seg].handoffs[k], patch[k]);
    launch();
  }

  function applyFixAndRerun(fixId) {
    if (fixId && fixed.hasOwnProperty(fixId)) {
      fixed[fixId] = true;
      if (fixId === 'fixHandoffs') fdClearFixConflicts();
      mcClearFixConflicts(fixId);
    }
    if (appMode === 'live') {           // stay in the live experience — never drop into a checkpoint-style run
      liveState = liveState || { fixes: 0, addressed: {}, phase: 'brief', currentGap: null, result: null };
      daySel = 'fishday';
      launchLive();
    } else launch();
  }

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
    clearFinishTimer();
    stopAnim(); sim = null; paused = false; livePausedForFix = false; document.body.classList.remove('running');
    closeModals();
    $('report').classList.add('hidden'); $('run').classList.add('hidden'); $('live-dock').classList.add('hidden'); $('setup').classList.remove('hidden');
    paintSetup();
  }

  function bind() {
    document.querySelectorAll('.lang button').forEach(function (b) { b.addEventListener('click', function () { L = b.getAttribute('data-lang'); applyLang(); }); });
    $('modesw').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]'); if (!b) return;
      var m = b.dataset.mode;
      if (m !== appMode) { enterMode(m); return; }
      // same-mode click: re-enter only when we've drifted off the mode's home screen (report, stale setup)
      if (m === 'live' && $('run').classList.contains('hidden')) enterMode('live');
      else if (m === 'morning' && $('setup').classList.contains('hidden')) enterMode('morning');
    });
    $('cast-open').addEventListener('click', showIntro);
    $('intro-start').addEventListener('click', startFromIntro);
    $('intro-how-btn').addEventListener('click', function () { modalOpening('rules-modal'); $('rules-modal').classList.add('show'); $('rules-close').focus(); });
    $('rules-open').addEventListener('click', function () { modalOpening('rules-modal'); $('rules-modal').classList.add('show'); $('rules-close').focus(); });
    $('rules-close').addEventListener('click', function () { $('rules-modal').classList.remove('show'); modalClosed(); });
    $('rules-modal').addEventListener('click', function (e) { if (e.target === $('rules-modal')) { $('rules-modal').classList.remove('show'); modalClosed(); } });

    $('day-select').addEventListener('click', function (e) {
      var b = e.target.closest('.day-btn'); if (!b) return;
      daySel = b.dataset.day; placingChip = null; removeGhost(); removeDropSlot();
      paintSetup();
    });
    $('editors').addEventListener('change', function (e) {
      var s = e.target.closest('.ed-sel'); if (!s) return;
      fixed[s.dataset.fix] = (s.value === 'on');
      if (s.dataset.fix === 'fixHandoffs' && s.value === 'on') fdClearFixConflicts();
      if (s.dataset.fix === 'grantAuth') {
        if (s.value === 'on') mcClearFixConflicts('grantAuth');
        else mcOv.lines.bl_meals = { approverRoleId: null };
      }
      if (s.dataset.fix === 'fixReserve') {
        if (s.value === 'on') mcClearFixConflicts('fixReserve');
        else { mcOv.reserve = 0; mcOv.resources.res_cash = { planned: 0 }; }
      }
      updatePlanUI();
    });
    $('mission-control').addEventListener('change', function (e) {
      var el = e.target;
      if (el.dataset.mc === 'line') {
        var line = mcOv.lines[el.dataset.line] || (mcOv.lines[el.dataset.line] = {});
        line[el.dataset.field] = el.value || null;
        var p = currentPlan(), m = null; p.budget.lines.forEach(function (ln) { if (ln.id === 'bl_meals') m = ln; });
        fixed.grantAuth = !!(m && m.approverRoleId && m.payMethod);
        updatePlanUI();
      }
    });
    $('mission-control').addEventListener('input', function (e) {
      var el = e.target;
      if (el.dataset.mc === 'resource') {
        var val = parseInt(el.value, 10) || 0;
        if (el.dataset.resource === 'res_cash') { mcOv.reserve = val; fixed.fixReserve = val >= (currentPlan().budget.reserveTarget || 300000); }
        (mcOv.resources[el.dataset.resource] = mcOv.resources[el.dataset.resource] || {}).planned = val;
        updatePlanUI();
      }
    });
    $('org').addEventListener('change', function (e) {
      var s = e.target.closest('.org-sel'); if (!s) return;
      var rid = s.dataset.role, newPid = s.value, oldPid = orgOv[rid];
      if (newPid === oldPid) return;
      var r2 = null;
      for (var rk in orgOv) { if (orgOv[rk] === newPid) { r2 = rk; break; } }
      if (r2) orgOv[r2] = oldPid;   // swap: the seat that used to hold newPid now gets rid's old holder
      orgOv[rid] = newPid;
      updatePlanUI();
    });
    $('btn-auto').addEventListener('click', function () { for (var k in fixed) fixed[k] = true; fdReset(); mcReset(); paintSetup(); });
    $('btn-clear').addEventListener('click', function () { for (var k in fixed) fixed[k] = false; fdReset(); mcReset(); orgSeatReset(); paintSetup(); });
    $('launch').addEventListener('click', launch);

    // day editor: deck chips + drag blocks / draw & edit arrows, on every day tab (§20)
    $('fd-wrap').addEventListener('pointerdown', fdPointerDown);
    document.addEventListener('pointermove', fdPointerMove);
    document.addEventListener('pointerup', fdPointerUp);
    document.addEventListener('pointercancel', fdPointerCancel);
    // the lane name labels ride along when the timeline pans, so rows never go anonymous
    $('fd-scroll').addEventListener('scroll', function () {
      var sl = this.scrollLeft;
      this.querySelectorAll('.fd-lbl').forEach(function (lb) { lb.style.transform = 'translateX(' + sl + 'px)'; });
    });
    $('fd-canvas').addEventListener('click', function (e) {
      var p = e.target.closest && e.target.closest('path[data-h]'); if (p) { openArrowPanel(p.getAttribute('data-h')); return; }
      var slot = e.target.closest && e.target.closest('.fd-slot'); if (slot) commitDropSlot(slot);
    });
    $('fd-arrowlist').addEventListener('click', function (e) { var c = e.target.closest('.fd-ar-chip'); if (c) openArrowPanel(c.dataset.h); });
    $('fd-clear-day').addEventListener('click', clearDayClick);
    $('ar-body') && $('arrow-modal').addEventListener('change', function (e) { if (e.target.closest('.ar-sel') || e.target.closest('.ar-time')) arrowPatch(); });
    $('ar-delete').addEventListener('click', arrowErase);
    $('ar-close').addEventListener('click', function () { arrowEdit = null; $('arrow-modal').classList.remove('show'); modalClosed(); });
    $('arrow-modal').addEventListener('click', function (e) { if (e.target === $('arrow-modal')) { arrowEdit = null; $('arrow-modal').classList.remove('show'); modalClosed(); } });

    // checkpoint inspector (§8)
    $('insp-body').addEventListener('click', function (e) {
      var b = e.target.closest('.ins-send'); if (!b || !sim) return;
      P.intervene(sim, b.dataset.card, b.dataset.role);
      openInspector();
    });
    $('insp-resume').addEventListener('click', closeInspector);
    $('inspect-modal').addEventListener('click', function (e) { if (e.target === $('inspect-modal')) closeInspector(); });

    $('btn-pause').addEventListener('click', function () { paused = !paused; updateRunButtons(); });
    $('btn-guests').addEventListener('click', function () {
      guestsVisible = !guestsVisible; updateRunButtons();   // view.guestsVisible is read fresh every rAF frame — no rebuild needed
    });
    if (!USE_CANVAS) $('btn-guests').style.display = 'none';   // the guests toggle only gates the canvas layer; it's a no-op in the ?dom fallback
    $('btn-drawer').addEventListener('click', function () {
      dashboardOpen = !dashboardOpen;
      $('runwrap').classList.toggle('drawer-closed', !dashboardOpen);
      updateRunButtons();
      refitStage();   // same resize path window-resize uses, so the stage re-fits the new (now full) width immediately
    });
    $('btn-quit').addEventListener('click', function () {
      if (!sim || sim.finished) return;
      sim.finished = 'incomplete';
      if (appMode === 'live' && liveState) { livePausedForFix = false; clearGapFocus(); liveFinish(); }   // stay in the live flow
      else finish();
    });
    $('stations').addEventListener('click', function (e) {
      var sec = e.target.closest('.sec-hot'); if (sec) { openSectionPanel(sec.getAttribute('data-sec')); return; }
      var st = e.target.closest('.station'); if (st) openProblemPanel(st.id.replace('st-', ''));
    });
    $('dash-warnings').addEventListener('click', function (e) { var w = e.target.closest('.warn'); if (w && w.dataset.station) openProblemPanel(w.dataset.station); });
    $('detail-close').addEventListener('click', closeDetail);
    $('detail-modal').addEventListener('click', function (e) { if (e.target === $('detail-modal')) closeDetail(); });

    $('fixpack').addEventListener('click', function (e) {
      var b = e.target.closest('.fix-apply'); if (b) { applyFixAndRerun(b.dataset.fix); return; }
      if (e.target.closest('#btn-day-autofix')) applyDayFixAndRerun();
    });
    // after a LIVE run's report, every action stays in the live experience
    $('btn-tweak').addEventListener('click', function () { if (appMode === 'live') enterMode('morning'); else toSetup(); });
    $('btn-again').addEventListener('click', function () { if (appMode === 'live') startLive(); else launch(); });

    document.querySelectorAll('.spd').forEach(function (b) { b.addEventListener('click', function () { speedMult = parseFloat(b.dataset.spd); document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x === b); }); restartTimer(); }); });

    // ---- keyboard access: Escape closes the TOP modal (visual stacking = DOM order,
    // rules on top); Tab is trapped inside an open dialog; Enter/Space activates targets ----
    function topModal() {
      var order = ['rules-modal', 'inspect-modal', 'arrow-modal', 'detail-modal'];
      for (var i = 0; i < order.length; i++) if ($(order[i]).classList.contains('show')) return order[i];
      return null;
    }
    document.addEventListener('keydown', function (e) {
      var top = topModal();
      if (e.key === 'Escape') {
        if (top === 'rules-modal') $('rules-modal').classList.remove('show');
        else if (top === 'inspect-modal') closeInspector();
        else if (top === 'arrow-modal') { arrowEdit = null; $('arrow-modal').classList.remove('show'); modalClosed(); }
        else if (top === 'detail-modal') closeDetail();
        return;
      }
      if (e.key === 'Tab' && top) {              // aria-modal promises the background is inert — keep focus inside
        var sheet = $(top).querySelector('.sheet');
        var focusables = sheet.querySelectorAll('button, select, input, [tabindex], summary');
        if (!focusables.length) return;
        var first = focusables[0], last = focusables[focusables.length - 1], act = document.activeElement;
        if (!sheet.contains(act)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && act === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && act === last) { e.preventDefault(); first.focus(); }
        return;
      }
      var el = e.target;
      if (!el || !el.classList) return;
      if (e.key === 'Enter' || e.key === ' ') {
        if (el.classList.contains('sec-hot')) { e.preventDefault(); openSectionPanel(el.getAttribute('data-sec')); }
        else if (el.classList.contains('station')) { e.preventDefault(); openProblemPanel(el.id.replace('st-', '')); }
        else if (el.classList.contains('warn') && el.dataset.station) { e.preventDefault(); openProblemPanel(el.dataset.station); }
        else if (el.classList.contains('fd-socket')) { e.preventDefault(); fdSocketTap(el); }
        else if (el.classList.contains('fd-chip')) { e.preventDefault(); toggleChipPlacing(el.dataset.task); }
        else if (el.classList.contains('fd-slot')) { e.preventDefault(); commitDropSlot(el); }
        else if (el.classList.contains('fd-block')) { e.preventDefault(); }   // Space must not scroll the editor away
        return;
      }
      // any day's blocks: ←/→ nudge by the seg's snap · Shift+←/→ resize by the same step
      if (el.classList.contains('fd-block') && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault();
        var plan = currentPlan(), segT = P.tasksForSeg(plan, daySel), tk = byId(segT, el.dataset.task); if (!tk) return;
        var sn = segSnap(daySel), win = segWin(daySel), d = e.key === 'ArrowLeft' ? -sn : sn;
        if (e.shiftKey) writeMove(tk.id, tk.startMin, clamp(tk.durMin + d, sn, win[1] - tk.startMin), tk.assignedIds);
        else writeMove(tk.id, clamp(tk.startMin + d, win[0], win[1] - tk.durMin), tk.durMin, tk.assignedIds);
        reclampArrows(tk.id);
        paintSetup();
        var nb = document.querySelector('.fd-block[data-task="' + tk.id + '"]'); if (nb) nb.focus();
      } else if (el.classList.contains('fd-block') && (e.key === 'Delete' || e.key === 'Backspace')) {
        e.preventDefault();
        if (daySel === 'fishday') return;   // fishday tasks can never be unplaced (§20 Fix A)
        var plan2 = currentPlan(), segT2 = P.tasksForSeg(plan2, daySel), tk2 = byId(segT2, el.dataset.task); if (!tk2) return;
        writeUnplace(tk2.id);
        paintSetup();
      }
    });

    // ---- window resize: rescale every mover + rebuild the pixel-anchored paths (see refitStage) ----
    var rszT = null;
    window.addEventListener('resize', function () {
      if (rszT) clearTimeout(rszT);
      rszT = setTimeout(function () { rszT = null; refitStage(); }, 130);
    });
  }

  // =========================================================================
  // LIVE (play-first) MODE — land inside the running fishing day, pause at each
  // information gap, fix one thing (with a blast-radius preview), watch it resolve.
  // Reuses the engine + renderSim. The classic org/budget/safety decisions are
  // pre-sound, so the live puzzle is purely the temporal information axis.
  // =========================================================================
  var LIVE_CH = ['board', 'chat', 'radio', 'faceToFace'];
  function ldPanel(id) { ['ld-brief', 'ld-prompt', 'ld-spot', 'ld-result'].forEach(function (p) { var e = $(p); if (e) e.classList.toggle('on', p === id); }); }
  function closeModals() { ['detail-modal', 'inspect-modal', 'arrow-modal', 'rules-modal'].forEach(function (m) { var e = $(m); if (e) e.classList.remove('show'); }); lastFocus = null; }
  function clearStationTints() { P.STATIONS.forEach(function (s) { var n = $('st-' + s.id); if (n) n.classList.remove('terr-green', 'terr-amber', 'terr-red'); }); stageTint = null; }
  function chIcon(ch) { return { board: '📋', chat: '💬', radio: '📻', phone: '📞', faceToFace: '🤝' }[ch] || '•'; }
  function personName(task) { var pid = task.assignedIds[0], p = pid && byId(currentPlan().participants, pid); return p ? nm(p.name) : nm(P.role(task.ownerRoleId).name); }

  // the Morning-authored plan survives a Live detour: snapshot on the way in, restore on the way back
  function snapshotMorning() {
    morningSnap = JSON.parse(JSON.stringify({ fixed: fixed, mcOv: mcOv, dayOv: dayOv, daySel: daySel, orgOv: orgOv }));
  }
  function restoreMorning() {
    if (!morningSnap) return;
    fixed = JSON.parse(JSON.stringify(morningSnap.fixed));
    mcOv = JSON.parse(JSON.stringify(morningSnap.mcOv));
    dayOv = JSON.parse(JSON.stringify(morningSnap.dayOv));
    daySel = morningSnap.daySel;
    orgOv = JSON.parse(JSON.stringify(morningSnap.orgOv));
    placingChip = null;
  }
  // =========================================================================
  // INTRO / CAST — a graphic onboarding screen: the premise, the loop, and the
  // playable cast (11 duty-holders) drawn as the same role-coloured pawns the
  // game uses, with names (EN+JP) + role + one-line duty. Shown on first load;
  // reopenable from the header "Cast" button; skipped once "Start" is pressed.
  // =========================================================================
  function introSeen() { try { return localStorage.getItem('prs_intro_seen') === '1'; } catch (e) { return false; } }
  function markIntroSeen() { try { localStorage.setItem('prs_intro_seen', '1'); } catch (e) {} }
  function castCard(p) {
    var r = P.role(p.roleId), t = T(), primary = nm(p.name), alt = (L === 'ja') ? p.name.en : p.name.jp;
    return '<div class="castcard" style="--rc:' + r.color + '">' +
      '<div class="ipawn"><div class="astro" style="--rc:' + r.color + '"><div class="fig"><span class="sh"></span>' +
        '<div class="pw"><span class="lg l"></span><span class="lg r"></span><span class="tr"></span><span class="hd"></span><span class="hat"></span></div></div></div></div>' +
      '<div class="cc-name">' + primary + (alt && alt !== primary ? '<span class="cc-alt">' + alt + '</span>' : '') + '</div>' +
      '<div class="cc-role"><i>' + r.icon + '</i>' + nm(r.name) + '</div>' +
      '<div class="cc-duty">' + (t['duty_' + p.roleId] || '') + '</div>' +
    '</div>';
  }
  function renderIntro() {
    var how = $('intro-how'); if (how) how.innerHTML = T().introHow;    // has <b> markup -> innerHTML, not data-i18n
    var box = $('intro-cast'); if (!box) return;
    var t = T(), parts = P.mergePlan({ seed: 1, overrides: {} }).participants;
    var aibos = parts.filter(function (p) { return p.company !== 'co_chef'; });
    var chefs = parts.filter(function (p) { return p.company === 'co_chef'; });
    box.innerHTML =
      '<div class="cast-group"><div class="cast-h"><b>' + t.introCastAibos + '</b><span>' + t.introCastAibosSub + '</span></div>' +
        '<div class="castgrid">' + aibos.map(castCard).join('') + '</div></div>' +
      '<div class="cast-group"><div class="cast-h"><b>' + t.introCastChefs + '</b><span>' + t.introCastChefsSub + '</span></div>' +
        '<div class="castgrid">' + chefs.map(castCard).join('') + '</div></div>' +
      '<div class="guestcard"><div class="gc-ic" aria-hidden="true">👥</div><div class="gc-txt"><b>' + t.introGuestsT + '</b><p>' + t.introGuestsB + '</p></div></div>';
  }
  function showIntro() {
    if (timer) { clearInterval(timer); timer = null; }
    stopAnim(); closeModals(); document.body.classList.remove('running');
    ['setup', 'run', 'report'].forEach(function (s) { $(s).classList.add('hidden'); });
    $('live-dock').classList.add('hidden');
    renderIntro();
    $('intro').classList.remove('hidden');
    if (window.scrollTo) window.scrollTo(0, 0);
    var s = $('intro-start'); if (s) s.focus();
  }
  function startFromIntro() { markIntroSeen(); $('intro').classList.add('hidden'); enterMode('live'); }

  function enterMode(m) {
    var was = appMode;
    appMode = m;
    var iel = $('intro'); if (iel) iel.classList.add('hidden');   // leaving the intro whenever a real mode is entered
    $('mode-live').classList.toggle('on', m === 'live');
    $('mode-morning').classList.toggle('on', m === 'morning');
    if (timer) { clearInterval(timer); timer = null; }
    clearFinishTimer();
    stopAnim(); closeModals(); $('report').classList.add('hidden');
    if (m === 'live') {
      if (was === 'morning' || !morningSnap) snapshotMorning();
      $('setup').classList.add('hidden'); startLive();
    } else {
      document.body.classList.remove('running'); sim = null; paused = false; livePausedForFix = false;
      if (was === 'live') restoreMorning();     // only a Live detour wiped the plan — same-mode re-entry keeps it
      $('run').classList.add('hidden'); $('live-dock').classList.add('hidden'); $('setup').classList.remove('hidden');
      paintSetup();
    }
  }

  function startLive() {
    for (var k in fixed) fixed[k] = true; fixed.fixHandoffs = false;   // classic decisions sound; the arrows are the puzzle
    fdReset(); mcReset(); daySel = 'fishday'; placingChip = null;
    liveState = { fixes: 0, addressed: {}, phase: 'brief', currentGap: null, result: null };
    launchLive();
  }

  function launchLive() {
    stopAnim(); clearFinishTimer();                       // never stack a second rAF loop across re-runs
    sim = P.createSim({ seed: (Math.floor(Math.random() * 1e9) >>> 0) || 1, overrides: buildCfg().overrides }, 'fishday');
    paused = false; livePausedForFix = false; document.body.classList.add('running');
    closeModals(); speedMult = 2; document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-spd') === '2'); });
    $('setup').classList.add('hidden'); $('report').classList.add('hidden'); $('run').classList.remove('hidden');
    $('figs').innerHTML = ''; $('banner').classList.remove('show'); $('live-dock').classList.remove('hidden');
    var ff = $('fanfare'); if (ff) ff.classList.remove('show');
    animReset(); updateRunButtons(); buildSitemap();
    anim.cascade = P.cascadeTrace(sim.plan); anim.cascade.has = anim.cascade.hasFault;
    buildMotes(sim);
    renderSim(sim); startAnim();
    liveState.phase = 'brief'; renderLivePanel();
    runFn = liveStep; if (timer) clearInterval(timer); timer = setInterval(liveStep, tickMs());
  }

  function liveStep() {
    if (!sim || paused || livePausedForFix) return;
    if (sim.paused && sim.checkpoint) { P.resume(sim); }         // Live ignores the fixed checkpoints
    P.tick(sim); renderSim(sim);
    var gap = nextLiveGap();
    if (gap && (sim.clockMin || 0) >= gap.startMin - 0.001) { livePausedForFix = true; openGap(gap); return; }
    if (sim.finished) liveFinish();
  }

  function nextLiveGap() {
    var plan = currentPlan(), fd = P.fishdaySchedule(plan), out = [];
    fd.missing.forEach(function (m) { out.push({ taskId: m.taskId, cardId: m.cardId, kind: 'missing' }); });
    fd.late.forEach(function (l) { out.push({ taskId: l.taskId, cardId: l.cardId, kind: 'late' }); });
    out = out.filter(function (g) { return !liveState.addressed[g.taskId + '|' + g.cardId]; });
    out.forEach(function (g) { var t = byId(plan.tasks, g.taskId); g.startMin = t ? t.startMin : 9999; });
    out.sort(function (a, b) { return a.startMin - b.startMin; });
    return out[0] || null;
  }

  // the 迷い / 手待ち / 手戻り taxonomy, painted on the frozen crewmate (§1 — never flattened)
  function gapKindState(gap, to) {
    if (gap.kind === 'late') return 'waitInfo';                                   // 手待ち ⏳
    return (to.assumeOn || []).indexOf(gap.cardId) >= 0 ? 'rework' : 'confused';  // 手戻り 🔁 · 迷い ❓
  }
  function clearGapFocus() {
    for (var pid in anim.fig) { var f = anim.fig[pid]; if (f && f.el) f.el.classList.remove('spot'); }
    stageSpotPid = null; stageGapState = null;                    // canvas: drop the spotlight + gap taxonomy
    if (USE_CANVAS && sim) updateStageRoster(sim);               // refresh AT (renderSim doesn't run during a freeze)
  }
  function paintGapFocus(gap) {
    var plan = currentPlan(), to = byId(plan.tasks, gap.taskId); if (!to) return;
    clearStationTints(); var stn = $('st-' + to.station); if (stn) stn.classList.add('terr-red');
    stageTint = {}; stageTint[to.station] = 'red';                // canvas: the gap-focus station goes red
    clearGapFocus();
    var pid = to.assignedIds[0], f = pid && anim.fig[pid];
    if (f) {
      var st2 = gapKindState(gap, to);
      f.el.className = 'astro s-' + st2 + ' spot' + (f.el.className.indexOf('faceL') >= 0 ? ' faceL' : '');
      if (f.bub) f.bub.textContent = BUB[st2] || '⏳';
      f.st = st2; f.el._st = st2;
      stageSpotPid = pid; stageGapState = { pid: pid, state: st2 };  // canvas: gold spotlight + gap taxonomy on this figure
    }
    if (USE_CANVAS && sim) updateStageRoster(sim);               // refresh AT during the freeze (renderSim is paused)
  }
  function openGap(gap) {
    liveState.currentGap = gap; liveState.phase = 'prompt';
    paintGapFocus(gap);
    renderLivePanel(true);
  }

  function renderLivePanel(focusPrompt) {
    var t = T();
    if (liveState.phase === 'brief') {
      $('ld-brief').innerHTML = '<div class="ld-txt"><h3>' + t.ldBriefT + '</h3><p>' + t.ldBriefP + '</p></div><div class="ld-chip">' + t.liveChip(liveState.fixes) + '</div>';
      ldPanel('ld-brief');
    } else if (liveState.phase === 'prompt') {
      var g = liveState.currentGap, plan = currentPlan(), to = byId(plan.tasks, g.taskId);
      var kind = gapKindState(g, to);
      var head = kind === 'waitInfo' ? t.ldLateT : (kind === 'rework' ? t.ldAssumeT : t.ldFrozenT);
      var body = kind === 'waitInfo' ? t.ldLateP : (kind === 'rework' ? t.ldAssumeP : t.ldFrozenP);
      $('ld-prompt').innerHTML = '<div class="ld-txt"><h3>' + head(personName(to)) + '</h3><p>' + body(nm(to.name)) + '</p></div><button class="btn primary glow" id="ld-fix">' + t.ldFixBtn + '</button>';
      $('ld-fix').addEventListener('click', function () { liveState.phase = 'spot'; renderLivePanel(); });
      ldPanel('ld-prompt');
      if (focusPrompt) $('ld-fix').focus();    // the game paused FOR the player — hand them the control
    } else if (liveState.phase === 'spot') { renderSpot(); }
    else if (liveState.phase === 'result') { renderResult(); }
  }

  function renderSpot() {
    var t = T(), g = liveState.currentGap, plan = currentPlan(), to = byId(plan.tasks, g.taskId), from = producerOf(plan, g.cardId), card = byId(plan.infoCards, g.cardId);
    var cname = nm(card.name).split('：')[0].split(':')[0], sendMin = from ? from.startMin + from.durMin : to.startMin;
    var chips = LIVE_CH.map(function (ch) {
      var arr = sendMin + (P.CHANNELS[ch] || 0), onTime = arr <= to.startMin;
      return '<button class="ld-opt ' + (onTime ? 'fast' : 'slow') + '" type="button" data-ch="' + ch + '">' +
        '<span class="oc">' + chIcon(ch) + ' ' + t['ch' + ch.charAt(0).toUpperCase() + ch.slice(1)] + '</span>' +
        '<span class="lat">+' + (P.CHANNELS[ch] || 0) + t.chMin + '</span>' +
        '<span class="verdict">' + (onTime ? t.vInTime : t.vTooLate) + '</span></button>';
    }).join('');
    $('ld-spot').innerHTML =
      '<div class="ld-spot-head"><h3>' + t.spotTitle(cname) + '</h3><p class="ld-sub">' +
      t.spotSub(from ? personName(from) : nm(P.role('chef').name), personName(to), hhmm(to.startMin)) + '</p></div>' +
      '<div class="ld-opts" id="ld-opts">' + chips + '</div>' +
      '<div class="ld-preview" id="ld-preview"><span class="pv-lbl">' + t.pvLbl + '</span><span id="ld-pv-txt">' + t.spotHover + '</span></div>';
    var opts = $('ld-opts');
    opts.querySelectorAll('.ld-opt').forEach(function (b) {
      var ch = b.dataset.ch;
      b.addEventListener('mouseenter', function () { previewChannel(g, ch, false); });
      b.addEventListener('focus', function () { previewChannel(g, ch, false); });
      b.addEventListener('click', function () { opts.querySelectorAll('.ld-opt').forEach(function (x) { x.classList.remove('sel'); }); b.classList.add('sel'); previewChannel(g, ch, true); });
    });
    // hover ends with nothing selected → the hypothetical tints yield back to the real diagnosis
    opts.addEventListener('mouseleave', function () {
      if (!opts.querySelector('.ld-opt.sel') && liveState.currentGap) paintGapFocus(liveState.currentGap);
    });
    ldPanel('ld-spot');
  }

  function hypCfg(g, ch) {
    var cfg = buildCfg(), plan = currentPlan(), to = byId(plan.tasks, g.taskId), from = producerOf(plan, g.cardId);
    var trig = { type: 'onTaskDone', taskId: from ? from.id : null };
    cfg.overrides = cfg.overrides || {}; cfg.overrides.handoffs = cfg.overrides.handoffs || {};
    if (g.kind === 'late') {
      var ex = plan.handoffs.filter(function (h) { return h.cardId === g.cardId && h.toRoleId === to.ownerRoleId; })[0];
      if (ex) cfg.overrides.handoffs[ex.id] = Object.assign({}, ex, { channel: ch, trigger: trig });
    } else if (from) {
      var assume = (to.assumeOn || []).indexOf(g.cardId) >= 0;
      cfg.overrides.handoffs['hlive_' + g.cardId + '_' + to.ownerRoleId] = { cardId: g.cardId, fromRoleId: from.ownerRoleId, fromTaskId: from.id, toRoleId: to.ownerRoleId, toTaskId: to.id, trigger: trig, channel: ch, ifLate: assume ? 'assume' : 'idle', reworkKind: assume ? 'wrongFish' : null, content: { en: '', jp: '' } };
    }
    return cfg;
  }

  function previewChannel(g, ch, persist) {
    var t = T(), cfg = hypCfg(g, ch), plan2 = P.mergePlan(cfg), fd2 = P.fishdaySchedule(plan2);
    var to = byId(plan2.tasks, g.taskId), from = producerOf(plan2, g.cardId);
    var sendMin = from ? from.startMin + from.durMin : to.startMin, arr = sendMin + (P.CHANNELS[ch] || 0), onTime = arr <= to.startMin;
    var assume = (to.assumeOn || []).indexOf(g.cardId) >= 0;
    paintBlast(fd2, plan2);
    var pv = $('ld-preview'), txt = $('ld-pv-txt');
    pv.className = 'ld-preview ' + (onTime ? 'fast' : 'slow');
    txt.innerHTML = onTime ? t.spotOnTime(hhmm(arr)) : (assume ? t.spotLateWrong(hhmm(arr), arr - to.startMin) : t.spotLateIdle(hhmm(arr), arr - to.startMin));
    var old = pv.querySelector('.ld-send'); if (old) old.remove();
    if (persist) {
      var b = document.createElement('button'); b.className = 'btn primary ld-send'; b.type = 'button';
      b.textContent = onTime ? t.spotSend : t.spotSendLate;
      b.addEventListener('click', function () { commitChannel(g, ch); });
      pv.appendChild(b);
    }
  }

  function paintBlast(fd2, plan2) {
    clearStationTints();
    var rank = { green: 1, amber: 2, red: 3 }, m = {};
    function set(st, v) { if (!m[st] || rank[v] > rank[m[st]]) m[st] = v; }
    ['port', 'vessel', 'mess'].forEach(function (st) { set(st, 'green'); });
    fd2.late.forEach(function (x) { var t = byId(plan2.tasks, x.taskId); if (t) set(t.station, 'amber'); });
    fd2.missing.forEach(function (x) { var t = byId(plan2.tasks, x.taskId); if (t) set(t.station, 'amber'); });
    fd2.wrongFish.forEach(function (id) { var t = byId(plan2.tasks, id); if (t) set(t.station, 'red'); });
    for (var st in m) { var n = $('st-' + st); if (n) n.classList.add('terr-' + m[st]); }
    stageTint = m;   // canvas: blast-radius preview tints
  }

  function commitChannel(g, ch) {
    var plan = currentPlan(), to = byId(plan.tasks, g.taskId), from = producerOf(plan, g.cardId);
    if (g.kind !== 'late' && !from) return;      // no producer to send from — nothing to commit
    var trig = { type: 'onTaskDone', taskId: from ? from.id : null };
    if (g.kind === 'late') {
      var ex = plan.handoffs.filter(function (h) { return h.cardId === g.cardId && h.toRoleId === to.ownerRoleId; })[0];
      if (ex) dayOv.fishday.handoffs[ex.id] = Object.assign({}, ex, { channel: ch, trigger: trig });
    } else {
      var assume = (to.assumeOn || []).indexOf(g.cardId) >= 0;
      var id = 'h_' + g.cardId.replace('ic_', '') + '_' + to.ownerRoleId + '_' + (fdUid++);
      dayOv.fishday.handoffs[id] = { cardId: g.cardId, fromRoleId: from.ownerRoleId, fromTaskId: from.id, toRoleId: to.ownerRoleId, toTaskId: to.id, trigger: trig, channel: ch, ifLate: assume ? 'assume' : 'idle', reworkKind: assume ? 'wrongFish' : null, content: { en: '', jp: '' } };
    }
    liveState.addressed[g.taskId + '|' + g.cardId] = true; liveState.fixes++;
    var now = sim.clockMin;
    sim = P.createSim({ seed: sim.cfg.seed, overrides: buildCfg().overrides }, 'fishday');
    sim.paused = false;
    var guard = 0; while ((sim.clockMin || 0) < now && !sim.finished && guard++ < 400) { if (sim.paused) { sim.paused = false; sim.checkpoint = null; } P.tick(sim); }
    anim.cascade = P.cascadeTrace(sim.plan); anim.cascade.has = anim.cascade.hasFault;
    buildMotes(sim);                              // re-plan the flying hand-offs against the patched schedule
    // deliveries that already flew before the freeze must not re-fly — but the one the
    // player just committed SHOULD, as visible feedback for the fix
    for (var mi = 0; mi < anim.motes.length; mi++) {
      var m = anim.motes[mi];
      if (m.send <= now) { m.state = 2; m.noPing = true; }
      if (m.role === to.ownerRoleId && m.card === g.cardId) {
        m.noPing = false;                             // the just-committed delivery SHOULD ping/fly (visible fix feedback)
        if (m.same || RM.matches) { m.state = 2; pingStation(m.toSt, m.late); }
        else { m.state = 1; m.t0 = 0; m.el.classList.add('on'); }
      }
    }
    clearStationTints(); clearGapFocus(); renderSim(sim);
    livePausedForFix = false; liveState.phase = 'brief'; liveState.currentGap = null; renderLivePanel();
  }

  function liveFinish() {
    if (timer) { clearInterval(timer); timer = null; }
    var sc = P.score(sim), fd = P.fishdaySchedule(currentPlan());
    var win = sc.efficiency === 100 && sc.wrongFishCount === 0 && (fd.dinnerMin == null || fd.dinnerMin <= 1080);
    liveState.phase = 'result'; liveState.result = { win: win, sc: sc, fd: fd };
    renderResult();
    if (win && !anim.fanfared) { anim.fanfared = true; fireFanfare(); }   // one beat only — 18:00 already fired it on a clean serve
  }

  function renderResult() {
    var t = T(), r = liveState.result, el = $('ld-result'); if (!r) return;
    if (r.win) {
      el.className = 'ld-panel result win';
      el.innerHTML = '<div class="ld-txt"><h3>' + t.resWinT + '</h3><p>' + t.resWinP(r.sc.efficiency) + '</p></div>' +
        '<div class="ld-actions"><button class="btn primary" id="ld-rerun">' + t.ldRerun + '</button><button class="btn ghost" id="ld-report">' + t.ldReport + '</button></div>';
    } else {
      var fd = r.fd, g = (fd.missing[0] || fd.late[0]), gapText, pl = currentPlan();
      if (g) gapText = '“' + nm(byId(pl.infoCards, g.cardId).name).split('：')[0].split(':')[0] + '” → “' + nm(byId(pl.tasks, g.taskId).name) + '”';
      else gapText = t.resGapLate;
      el.className = 'ld-panel result miss';
      el.innerHTML = '<div class="ld-txt"><h3>' + t.resFailT + '</h3><p>' + t.resFailP(hhmm(fd.dinnerMin || 1110), gapText) + '</p></div>' +
        '<div class="ld-actions"><button class="btn primary" id="ld-rerun">' + t.ldRerun + '</button><button class="btn ghost" id="ld-report">' + t.ldReport + '</button></div>';
    }
    $('ld-rerun').addEventListener('click', startLive);
    $('ld-report').addEventListener('click', liveToReport);
    ldPanel('ld-result');
  }

  function liveToReport() {
    stopAnim(); if (timer) { clearInterval(timer); timer = null; }
    clearFinishTimer(); livePausedForFix = false;
    lastResult = { trip: P.score(sim), day: P.daySummary(sim), segment: 'fishday' };
    document.body.classList.remove('running');
    $('run').classList.add('hidden'); $('live-dock').classList.add('hidden'); $('report').classList.remove('hidden');
    renderReport(lastResult);
  }

  // ---- init ----
  bind(); applyLang();
  // first-time players land on the graphic cast intro; returning players (localStorage) go straight in.
  if (introSeen()) enterMode('live'); else showIntro();
})();
