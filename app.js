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
  // Rail/ledger bucket label. sb_load/sb_voyage are not in i18n yet (W2a's pinned key list predates
  // the Voyage program's two new scored buckets), so fall back to a clean bilingual label — and prefer
  // the i18n key the moment W2a adds it. Never renders "undefined"/"sb_load".
  var SB_FALLBACK = { load: { en: 'Load & Board', jp: '積込・乗船' }, voyage: { en: 'Ship Day', jp: '船上' } };
  function sbLabel(bk) { var v = T()['sb_' + bk]; if (typeof v === 'string') return v; return SB_FALLBACK[bk] ? nm(SB_FALLBACK[bk]) : ('sb_' + bk); }

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
  // Voyage §3 VIP buddies: overrides.buddies {guestId: pid|null}. Empty = template default
  // (byte-identical-default invariant, mirrors orgOv/mcOv — an untouched care shelf adds NOTHING
  // to cfg.overrides). Person-based (pid), so a buddy composes with a seat swap: the SAME person
  // still escorts the VIP after the seats move. mergePlan re-homes the auto-instantiated care
  // tasks onto the buddy and enforces the 2-VIP-per-organizer cap; the UI rejects before writing.
  var buddyOv = {};
  function buddyReset() { buddyOv = {}; }
  // VIP care count on a merged plan: how many other VIPs (≠ exceptGid) a person already buddies.
  function buddyLoadOf(plan, pid, exceptGid) {
    var n = 0, gs = plan.guests || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].vip && gs[i].id !== exceptGid && plan.buddies[gs[i].id] === pid) n++;
    return n;
  }
  // §20 authorable-days editor state — ONE deck→arrange→connect override store for all four
  // day tabs. Fishday's sub-object keeps the LEGACY timing/staffing/handoffs channels (so its
  // verify/E2E anchors stay byte-identical); arrival/ops/return use the unified placement/handoffs
  // schema that buildCfg folds into overrides.days[seg] (§20.3).
  function freshDayOv(seg) { return seg === 'fishday' ? { timing: {}, staffing: {}, handoffs: {} } : { placement: {}, handoffs: {} }; }
  var dayOv = { load: freshDayOv('load'), voyage: freshDayOv('voyage'), arrival: freshDayOv('arrival'), ops: freshDayOv('ops'), 'return': freshDayOv('return'), fishday: freshDayOv('fishday') };
  // Reset ALL four days (not just fishday) — "Reset to gappy" / "Auto-fix all" must clear coarse-day
  // deck authoring too, or a hand-authored arrival/ops/return arrangement would survive underneath a
  // reset button that visibly claims to start over.
  function fdReset() { dayOv = { load: freshDayOv('load'), voyage: freshDayOv('voyage'), arrival: freshDayOv('arrival'), ops: freshDayOv('ops'), 'return': freshDayOv('return'), fishday: freshDayOv('fishday') }; }
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
    ['load', 'voyage', 'arrival', 'ops', 'return'].forEach(function (seg) {
      var ov = dayOv[seg], hasP = Object.keys(ov.placement).length, hasH = Object.keys(ov.handoffs).length;
      if (!hasP && !hasH) return;
      o.days = o.days || {}; var od = o.days[seg] = o.days[seg] || {};
      if (hasP) { od.placement = od.placement || {}; for (k in ov.placement) od.placement[k] = ov.placement[k]; }
      if (hasH) { od.handoffs = od.handoffs || {}; for (k in ov.handoffs) od.handoffs[k] = ov.handoffs[k]; }
    });
    if (!isDefaultSeats()) { o.seats = {}; for (k in orgOv) o.seats[k] = orgOv[k]; }
    if (Object.keys(buddyOv).length) { o.buddies = {}; for (k in buddyOv) o.buddies[k] = buddyOv[k]; }   // Voyage §3
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
  // W3 pawn inspection: hover feeds the canvas name chip; the click popover is anchored near a pawn
  var hoverPid = null;                     // nearest pawn under the pointer -> view.hoverPid (canvas name chip)
  var pawnCardPid = null;                  // the pawn whose popover is open (null = closed)
  var pawnCardInvoker = null;              // element focus is restored to when the popover closes
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
    if (!$('intro').classList.contains('hidden')) { renderIntro(); bootVignette(vigLastAuto); }   // cast grid re-render + vignette re-boot (§W4 lifecycle) in the new language
    if (!$('setup').classList.contains('hidden')) {
      bootPlanStage();   // re-mount the plan stage (chip/aria in the new language); paintSetup above already repainted the tray
      // §18 parity: imperatively-written surfaces re-render in the new language too —
      // the open drawer's title (its accessible name) and an open plan-stage pawn card
      if (drawerSeg) { var ddl = $('dd-title'); if (ddl) ddl.textContent = T().ddTitle(dayLabel(drawerSeg)); var ddc = $('dd-close'); if (ddc) ddc.setAttribute('aria-label', T().ddClose); }
      if (pawnCardPid && pawnCardOpen()) openPlanPawnCard(pawnCardPid);
    }
    // mid-run: rebuild station labels but keep every walker where it stands (no teleport)
    if (!$('run').classList.contains('hidden') && sim && anim) { buildSitemap(true); renderSim(sim); if (pawnCardPid && pawnCardOpen()) openPawnCard(pawnCardPid); }
    if (appMode === 'live' && liveState && !$('run').classList.contains('hidden')) {
      renderLivePanel();
      if (livePausedForFix && liveState.currentGap) paintGapFocus(liveState.currentGap);   // keep the freeze visuals
    }
    if (!$('report').classList.contains('hidden') && lastResult) {
      renderReport(lastResult);   // re-boots the report stage (chip/markers/stamp aria) in the new language
      if (pawnCardPid && pawnCardOpen() && RSTG.sim) openReportPawnCard(pawnCardPid);
    }
    // open modals re-render in the new language (their content is built, not data-i18n)
    if ($('inspect-modal').classList.contains('show')) openInspector();
    if ($('arrow-modal').classList.contains('show') && arrowEdit) openArrowPanel(arrowEdit);
    if ($('detail-modal').classList.contains('show') && lastDetailStation) openProblemPanel(lastDetailStation);
  }

  // =========================================================================
  // §6 SCREEN-STATE CONSOLIDATION — one show/hide helper for {intro,setup,run,report}.
  // Mechanical: each caller still owns its own stopAnim/closeModals/render; this owns ONLY
  // visibility + body.running + the live-dock's run-only rule + the two canvas lifecycles
  // (vignette on intro, plan stage on setup) + the drawer's clean reset on leaving setup.
  // =========================================================================
  function enterScreen(name) {
    var screens = ['intro', 'setup', 'run', 'report'], i;
    killVignette();                                                  // the intro vignette dies on every transition (idempotent)
    killPlanStage();                                                 // ...as does the plan-stage rAF (idempotent)
    killReportStage();                                               // ...and the report-stage rAF (§S3; renderReport re-boots it)
    if (name !== 'report') rsStampKey = null;                        // leaving the report re-arms the hanko thock for the NEXT report
    if (typeof closeDayDrawer === 'function') closeDayDrawer();      // the drawer worker asked for a clean reset when leaving setup
    for (i = 0; i < screens.length; i++) $(screens[i]).classList.toggle('hidden', screens[i] !== name);
    if (name !== 'run') $('live-dock').classList.add('hidden');      // the live dock only ever shows INSIDE run (callers show it)
    if (name !== 'run' && window.PRS_SOUND) window.PRS_SOUND.ambient(null);   // ambient bed stop, run-exit (sound.js §W3)
    document.body.classList.toggle('running', name === 'run');
    if (name === 'setup') bootPlanStage();                           // (re)mount the pre-dawn plan stage + its local rAF
  }

  // =========================================================================
  // SETUP
  // =========================================================================
  function paintSetup() { buildDaySelect(); buildCanvas(); buildOrg(); buildBuddyCard(); buildTimeline(); buildMissionControl(); buildEditors(); buildDayGrid(); updatePlanUI(); }

  function buildDaySelect() {
    var box = $('day-select'); if (!box) return;
    var opts = ['load', 'voyage', 'arrival', 'ops', 'fishday', 'return', 'all'];   // chronological display order
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

  // Voyage §3 — the All-settings fallback for the care shelf: one <select> per VIP over the 8
  // organizers (+ "none"), writing the SAME overrides.buddies as the tray. The cap is enforced in
  // the change handler (a 3rd VIP on one organizer is rejected + reverted), mirroring the tray.
  function buildBuddyCard() {
    var box = $('buddy-card'); if (!box) return;
    var t = T(), plan = currentPlan();
    var ttl = $('buddy-title'); if (ttl) ttl.textContent = t.gdBuddyLbl;
    var vips = (plan.guests || []).filter(function (g) { return g.vip; });
    var orgs = plan.participants.filter(function (p) { return SEAT_ROLES.indexOf(p.roleId) >= 0; });
    box.innerHTML = vips.map(function (g) {
      var bpid = plan.buddies[g.id] || '';
      var opts = '<option value="">' + t.gdNone + '</option>' + orgs.map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === bpid ? ' selected' : '') + '>' + nm(p.name) + '</option>';
      }).join('');
      return '<label class="buddy-row"><span class="buddy-nm">' + t.gdBuddyOf(nm(g.name)) + '</span>' +
        '<select class="buddy-sel mc-sel" data-guest="' + g.id + '" aria-label="' + t.gdBuddyOf(nm(g.name)) + '">' + opts + '</select></label>';
    }).join('');
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
      // spec §2: the strongbox's one-tap "fill the reserve" lives on the cash row itself
      var fill = (r.id === 'res_cash' && !fixed.fixReserve)
        ? '<button type="button" class="btn sm primary mc-fill-reserve">' + t.rcClose(Math.max(0, receiptAltTotal('reserve') - P.scoreTrip(P.mergePlan(buildCfg())).total)) + '</button>' : '';
      return '<div class="mc-res' + (r.ok ? '' : ' bad') + '"><div class="mc-res-top"><b>' + nm(r.name) + '</b><span>' + nf(r.planned) + ' / ' + nf(r.target) + ' ' + nm(r.unit) + '</span></div>' +
        '<input class="mc-range" type="range" min="0" max="' + Math.max(r.target * 2, r.planned, 1) + '" step="' + (r.unit.en === 'yen' ? 10000 : 1) + '" value="' + r.planned + '" data-mc="resource" data-resource="' + r.id + '">' +
        '<div class="mc-res-bar"><i style="width:' + pct + '%"></i></div>' + fill + '</div>';
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

  // §W1 receipt-as-control: each design decision is a receipt ROW (icon + label + status chip +
  // points + flip-open stakes + one action), not a <select>. buildEditors lays the static skeleton;
  // paintReceiptRows (via updatePlanUI) fills every dynamic part, so the "why" <details> open state
  // survives repaints exactly like the old cards did.
  function buildEditors() {
    var t = T(), box = $('editors'); box.innerHTML = '';
    var head = $('ed-head'); if (head) head.textContent = t.planDayLine(dayLabel(daySel), detsForDay(daySel).length);
    detsForDay(daySel).forEach(function (d) {
      var rr = P.role(DET_ROLE[d]);
      var c = document.createElement('div'); c.className = 'editor-card rc'; c.id = 'ed-' + d;
      c.innerHTML =
        '<div class="ed-top"><span class="ed-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
          '<span class="ed-label">' + t['e_' + d + '_label'] + '</span><span class="lg-chip" id="chip-' + d + '"></span><span class="rc-pts" id="pts-' + d + '"></span></div>' +
        '<div class="rc-state" id="state-' + d + '"></div>' +
        '<details class="ed-more" id="cause-' + d + '"><summary>' + t.whyBtn + '</summary><div>' + t['p_' + d + '_cause'] + '</div></details>' +
        '<div class="rc-act" id="act-' + d + '"></div>';
      box.appendChild(c);
    });
  }

  // "+N per decision" = scoreTrip with this fix toggled vs. the current plan — the REAL apply path
  // (toggle `fixed`, rebuild cfg), computed once per paint per visible row (≤9 scoreTrip calls,
  // setup-only; measured ~a few ms total, see W1 self-check).
  function receiptAltTotal(d) {
    var fixId = DET_FIX[d], was = fixed[fixId];
    fixed[fixId] = !was;
    // mirror the real close path's Mission-Control coupling (applyReceiptFix runs
    // mcClearFixConflicts on close) — otherwise a leftover undo side-channel (null approver /
    // zero reserve) overrides the previewed fix in buildCfg and the +N reads 0 (a lying receipt)
    var savedMeals, savedReserve, savedCash, touched = false;
    if (!was) {
      if (fixId === 'grantAuth' && mcOv.lines.bl_meals) { savedMeals = mcOv.lines.bl_meals; delete mcOv.lines.bl_meals; touched = true; }
      if (fixId === 'fixReserve' && (mcOv.reserve !== null || mcOv.resources.res_cash)) {
        savedReserve = mcOv.reserve; savedCash = mcOv.resources.res_cash;
        mcOv.reserve = null; delete mcOv.resources.res_cash; touched = true;
      }
    }
    var total = P.scoreTrip(P.mergePlan(buildCfg())).total;
    fixed[fixId] = was;
    if (touched) {
      if (fixId === 'grantAuth') mcOv.lines.bl_meals = savedMeals;
      if (fixId === 'fixReserve') { mcOv.reserve = savedReserve; if (savedCash) mcOv.resources.res_cash = savedCash; }
    }
    return total;
  }
  function paintReceiptRows(open, baseTotal) {
    var t = T();
    detsForDay(daySel).forEach(function (d) {
      var card = $('ed-' + d); if (!card) return;
      var isOpen = !!open[d], hasFlag = fixed[DET_FIX[d]];
      var chip = $('chip-' + d), state = $('state-' + d), pts = $('pts-' + d), act = $('act-' + d), cause = $('cause-' + d);
      var delta = null;
      if (isOpen) delta = Math.max(0, receiptAltTotal(d) - baseTotal);            // the prize for closing it
      else if (hasFlag) delta = Math.max(0, baseTotal - receiptAltTotal(d));      // what this closed row earns
      card.classList.toggle('closed', !isOpen);
      if (chip) { chip.textContent = isOpen ? ('⛔ ' + t.sst_missing) : ('✓ ' + t.sst_ok); chip.className = 'lg-chip ' + (isOpen ? 'zero' : 'full'); }
      if (state) state.textContent = t['e_' + d + (isOpen ? '_off' : '_on')];
      if (pts) { pts.textContent = delta == null ? '✓' : (isOpen ? '+' + delta : '✓ +' + delta); pts.className = 'rc-pts ' + (isOpen ? 'zero' : 'full'); }
      if (cause) cause.style.display = isOpen ? 'block' : 'none';
      if (act) {
        // the fishday-arrows row NEVER fakes a one-click — it routes to the real editor (spec §2)
        if (isOpen && d === 'handoffTiming') act.innerHTML = '<button type="button" class="btn sm rc-route" data-det="' + d + '">' + t.rcRouteFishday + '</button>';
        else if (isOpen) act.innerHTML = '<button type="button" class="btn sm primary rc-close" data-det="' + d + '">' + t.rcClose(delta) + '</button>';
        else act.innerHTML = '<span class="rc-earned">' + (delta != null && delta > 0 ? t.rcClosed(delta) : '✓') + '</span>' +
          (hasFlag ? '<button type="button" class="btn sm ghost rc-undo" data-det="' + d + '">' + t.rcUndo + '</button>' : '');
      }
    });
  }
  // one tap closes/reopens a gap through the SAME buildCfg→applyFix path the old <select> used,
  // keeping the mcOv coupling (grantAuth/fixReserve) and the fixHandoffs conflict-clear byte-identical
  function applyReceiptFix(d, on) {
    var fixId = DET_FIX[d];
    fixed[fixId] = on;
    if (fixId === 'fixHandoffs' && on) fdClearFixConflicts();
    if (fixId === 'grantAuth') {
      if (on) mcClearFixConflicts('grantAuth');
      else mcOv.lines.bl_meals = { approverRoleId: null };
    }
    if (fixId === 'fixReserve') {
      if (on) mcClearFixConflicts('fixReserve');
      else { mcOv.reserve = 0; mcOv.resources.res_cash = { planned: 0 }; }
    }
    updatePlanUI();
    // keep keyboard flow alive across the innerHTML swap: land on the row's new action
    var nb = document.querySelector((on ? '.rc-undo' : '.rc-close') + '[data-det="' + d + '"]');
    if (nb) nb.focus();
  }

  // ---- §W1 ledger rail: ONE renderer, three surfaces (setup #rail-body · run #rail-run · report #rail-report) ----
  var railLastSetup = null;
  function railRowsHtml(trip, t, clickable) {
    return LEDGER_BUCKETS.map(function (bk) {
      var b = trip.byBucket[bk] || { earned: 0, maxPts: 0 };
      var short = b.earned < b.maxPts;
      var inner = '<span class="rail-nm">' + sbLabel(bk) + '</span><span class="rail-pts">' + b.earned + ' / ' + b.maxPts + '</span>';
      return clickable
        ? '<button type="button" class="rail-row' + (short ? ' short' : '') + '" data-bucket="' + bk + '">' + inner + '</button>'
        : '<div class="rail-row' + (short ? ' short' : '') + '">' + inner + '</div>';
    }).join('');
  }
  function railGateHtml(trip, t) {
    if (trip.gate && trip.gate.clean) return '';
    return '<div class="rail-gate' + (trip.gate && trip.gate.withheldA ? ' hot' : '') + '">' + t.railGate + '</div>';
  }
  function renderRail(mode, tripIn) {
    var t = T(), trip, box, i;
    if (mode === 'setup') {
      box = $('rail-body'); if (!box) return;
      trip = tripIn || P.scoreTrip(currentPlan());
      box.innerHTML = '<div class="dash-lbl">' + t.railLbl + '</div>' +
        '<div class="rail-tense" id="rail-tense">' + t.railAim(trip.total) + '</div>' +
        '<div class="rail-rows">' + railRowsHtml(trip, t, true) + '</div>' + railGateHtml(trip, t);
      if (railLastSetup != null && trip.total > railLastSetup && !$('setup').classList.contains('hidden')) {
        var te = $('rail-tense');
        floatDelta(te, '+' + (trip.total - railLastSetup));
        if (window.PRS_SOUND) window.PRS_SOUND.cue('gain');   // the rail +N float (sound.js §W3)
        if (!RM.matches) { te.classList.add('bump'); setTimeout(function () { te.classList.remove('bump'); }, 620); }
      }
      railLastSetup = trip.total;
    } else if (mode === 'run') {
      box = $('rail-run'); if (!box || !tripIn) return;
      trip = tripIn;
      // rebuilt only when the ledger actually moves, so per-tick repaints don't thrash the DOM
      var sig = L;
      for (i = 0; i < LEDGER_BUCKETS.length; i++) { var bb = trip.byBucket[LEDGER_BUCKETS[i]]; sig += '|' + bb.earned + '/' + bb.maxPts; }
      sig += '|' + (trip.gate.clean ? 'c' : (trip.gate.withheldA ? 'w' : 'o'));
      if (box._sig === sig) return;
      box._sig = sig;
      box.innerHTML = railRowsHtml(trip, t, false) + railGateHtml(trip, t);
    } else {
      box = $('rail-report'); if (!box) return;
      trip = tripIn || P.scoreTrip(currentPlan());
      box.innerHTML = '<div class="rail-tense" style="color:' + GRADE_COLOR[trip.grade] + '">' + t.railFinal(trip.total, trip.grade) + '</div>' +
        '<div class="rail-rows">' + railRowsHtml(trip, t, false) + '</div>' + railGateHtml(trip, t);
    }
  }

  function updatePlanUI() {
    var open = {}; activeProblemIds().forEach(function (id) { open[id] = true; });
    var t = T(), dayDets = detsForDay(daySel), gaps = 0;
    dayDets.forEach(function (d) { if (open[d]) gaps++; });
    var trip = P.scoreTrip(currentPlan());
    paintReceiptRows(open, trip.total);
    buildOrg();
    buildBuddyCard();
    $('plan-hint').textContent = gaps ? t.hintGaps(gaps) : t.hintReadyDay(dayLabel(daySel));
    $('plan-hint').className = 'planhint' + (gaps ? '' : ' good');
    buildDaySelect();
    $('launch').textContent = t.runDayBtn(dayLabel(daySel));
    buildMissionControl();
    buildDayGrid();
    renderRail('setup', trip);
    renderTray();          // the tray/tokens are a VIEW of fixed[]/orgOv — repaint on every edit
    syncPlanStage();       // a seat swap re-homes pawns; other edits leave positions put
    psPositionOverlays();
  }

  // =========================================================================
  // DAY EDITOR — ONE deck→arrange→connect editor for all four day tabs (§20).
  // Fishday keeps its per-participant minute-level authoring exactly as before;
  // Arrival/Ops/Return now share the identical renderer + drag/wire machinery,
  // reading P.tasksForSeg/P.handoffsForSeg and writing dayOv[seg] (§20.3).
  // =========================================================================
  var PXM = 0.8, FD_T0 = P.DAY_START_MIN, FD_T1 = P.DAY_END_MIN, LANE_H = 40, LBL_W = 108, RULER_H = 26;
  var fdDrag = null, fdWire = null, fdGhost = null, arrowEdit = null, arrowEditSeg = null, placingChip = null, fdUid = 1;
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
    function mn(id) { var x = byId(plan.manifest || [], id); return x ? nm(x.name) : id; }   // Voyage §2 manifest item name
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
      else if (h.type === 'CARRY_GAP') chips.push(chip(h.type, t.rhCarryGap(mn(h.itemId))));
    });
    $('fd-ready').innerHTML = '<span class="pr-lbl">' + t.fdReadyLbl + '</span>' +
      (chips.length ? chips.slice(0, 8).join('') + (chips.length > 8 ? '<span class="pr-item bad">+' + (chips.length - 8) + '</span>' : '')
                    : '<span class="pr-item ok">' + t.fdReadyOk + '</span>');
    // §W1: the per-day projection line moved into the ledger rail (renderRail('setup') — the day's
    // bucket row IS the projection); updatePlanUI repaints it in the same pass as this ready-check.
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
  // fan spacing tracks the sprite-era pawn size (PRS_STAGE.FIG_SCALE = 1.3) so bigger pawns don't overlap
  var FIGK = (window.PRS_STAGE && window.PRS_STAGE.FIG_SCALE) || 1.3;
  var FAN_COL = Math.round(23 * FIGK), FAN_ROW = Math.round(24 * FIGK), FEET_BASE = 36;   // (× stageScale)
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

  // =========================================================================
  // §3 AUTO-CINEMATIC CAMERA (freeze punch-in / dinner breathe-out).
  // Preferred path: PRS_STAGE.camTo/camReset (the eased, RM-safe module API). If
  // S2's export of those helpers has not landed yet, drive the SAME transform via
  // the documented view.cam per-frame contract (camFrame: "explicit per-frame
  // override wins") with app-side easing off the rAF clock. Exactly ONE path is
  // ever active — camAnim is set only when the module API is absent, so the two
  // never fight. Reduced motion = no camera, ever (also enforced inside stage.js).
  // =========================================================================
  var camAnim = null;   // fallback ease state (canvas CSS px + zoom): {fx,fy,fz,cx,cy,cz,tx,ty,tz,t0,dur}
  function camApi() { return (window.PRS_STAGE && typeof PRS_STAGE.camTo === 'function' && typeof PRS_STAGE.camReset === 'function') ? PRS_STAGE : null; }
  function camMoveTo(cx, cy, zoom, ms) {
    if (RM.matches) return;                                  // reduced motion: never move the camera
    document.getElementById('sitemap') && $('sitemap').classList.add('cam-hold');
    var api = camApi();
    if (api) { api.camTo({ x: cx, y: cy, zoom: zoom }, ms); camAnim = null; return; }
    var cur = camAnim ? { x: camAnim.cx, y: camAnim.cy, z: camAnim.cz } : { x: cx, y: cy, z: 1 };
    camAnim = { fx: cur.x, fy: cur.y, fz: cur.z, cx: cur.x, cy: cur.y, cz: cur.z,
                tx: cx, ty: cy, tz: zoom, t0: -1, dur: (ms > 0 ? ms : 0) };   // dur in ms (frame() clock)
  }
  // release back to identity. ms<=0 = snap (safety: animReset / mode-exit / quit).
  function camReleaseSafe(ms) {
    var api = camApi();
    if (api) api.camReset(ms > 0 ? ms : 0);
    if (!(ms > 0)) { camAnim = null; if ($('sitemap')) $('sitemap').classList.remove('cam-hold'); return; }
    if (camAnim) camAnim = { fx: camAnim.cx, fy: camAnim.cy, fz: camAnim.cz, cx: camAnim.cx, cy: camAnim.cy, cz: camAnim.cz,
                             tx: camAnim.cx, ty: camAnim.cy, tz: 1, t0: -1, dur: ms, releasing: true };   // dur in ms
    else if ($('sitemap')) {
      // API-driven ease: keep the hotspot hold until the camera actually reaches identity
      // (spec §3: DOM layers stay frozen while the world is drawn off-identity)
      setTimeout(function () { var m = $('sitemap'); if (m) m.classList.remove('cam-hold'); }, ms + 40);
    }
  }
  // per-frame fallback resolve (called from frame()); returns {x,y,zoom} or null (identity)
  function camFallbackFrame(ts) {
    if (RM.matches || camApi() || !camAnim) return null;     // module API drives itself; RM = no camera
    if (camAnim.t0 < 0) camAnim.t0 = ts;
    var k = camAnim.dur > 0 ? Math.min(1, (ts - camAnim.t0) / camAnim.dur) : 1, e = k * k * (3 - 2 * k);
    camAnim.cx = camAnim.fx + (camAnim.tx - camAnim.fx) * e;
    camAnim.cy = camAnim.fy + (camAnim.ty - camAnim.fy) * e;
    camAnim.cz = camAnim.fz + (camAnim.tz - camAnim.fz) * e;
    if (k >= 1 && camAnim.releasing) { camAnim = null; if ($('sitemap')) $('sitemap').classList.remove('cam-hold'); return null; }
    return Math.abs(camAnim.cz - 1) < 0.0005 ? null : { x: camAnim.cx, y: camAnim.cy, zoom: camAnim.cz };
  }
  // px center of the pawn holding a stalled task (fall back to its station, then map center)
  function stallCenterPx(taskId, plan) {
    var to = taskId && byId((plan || currentPlan()).tasks, taskId);
    if (!to && sim) to = byId(sim.tasks, taskId);
    var pid = to && to.assignedIds && to.assignedIds[0], f = pid && anim.fig[pid];
    if (f && typeof f.cx === 'number') return { x: f.cx, y: f.cy };
    var st = to && P.station(to.station);
    if (st) return { x: st.x * anim.w, y: st.y * anim.h };
    return { x: anim.w / 2, y: anim.h / 2 };
  }
  function camPunchGap(gap) { var p = stallCenterPx(gap && gap.taskId, currentPlan()); camMoveTo(p.x, p.y, 1.35, 600); }

  function animReset() {
    anim = { running: false, raf: null, last: 0, w: 0, h: 0, fig: {}, guest: {}, boat: null, wakes: [], hotPts: [],
      cascade: { hops: [], has: false }, ghost: [], trail: [], strikeSeg: -1, chain: [], chainOn: false,
      motes: [], acts: null, actsAt: -1, tweens: {}, fanfared: false, skyKey: '' };
    // §21.4 bridge state is module-scoped: clear it per run so a frozen gap's tint/spotlight can't leak into the next cold-open
    stageTint = null; stageSpotPid = null; stageGapState = null;
    camReleaseSafe(0);   // §3 safety: no camera offset survives a (re-)run start
    if ($('sitemap')) $('sitemap').classList.remove('cam-hold');
    stageTrail.length = 0; stageChain = []; stageGhost = [{}, {}, {}];
    // dashboard readouts carry tween state on the DOM node — a fresh run must not
    // tween from (or float a delta against) the previous run's final value
    ['dash-eff', 'dash-ready'].forEach(function (id) {
      var el = $(id); if (el) { el._v = null; el._shown = null; if (el.parentNode) el.parentNode.classList.remove('gold'); }
    });
    // §W1: the run rail's rebuild signature also lives on the DOM node — a fresh run must repaint
    var rr = $('rail-run'); if (rr) rr._sig = '';
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
  // §5 coarse-day life: motes fly EVERY animated day. Generalized to handoffsForSeg(plan, seg) /
  // tasksForSeg(plan, seg) with send-minutes resolved WITHIN the segment (a coarse day's arrows +
  // tasks live in plan.days[seg], not plan.tasks). The fishday path is byte-identical: for
  // seg==='fishday' tasksForSeg is the fishday subset of plan.tasks and sendOf reproduces
  // P.resolveSendMin / P.staticArrival exactly, so the 220/91% anchors are untouched.
  function buildMotes(s) {
    var box = $('motes'); if (box) box.innerHTML = '';
    anim.motes = [];
    if (!box || !s || s.mode !== 'minute') return;
    var seg = s.segment, plan = s.plan, coarse = seg !== 'fishday';
    var tasks = P.tasksForSeg(plan, seg), handoffs = P.handoffsForSeg(plan, seg);
    if (!handoffs || !handoffs.length) return;
    var tById = {}; for (var ti = 0; ti < tasks.length; ti++) tById[tasks[ti].id] = tasks[ti];
    function sendOf(h) {   // mirrors engine.sendMinSeg: resolve within the seg, then plan.tasks
      var tt, tr = h.trigger || {};
      if (tr.type === 'atMinute') return (typeof tr.value === 'number' && isFinite(tr.value)) ? tr.value : null;
      if (tr.type === 'onTaskDone') { tt = tById[tr.taskId] || byId(plan.tasks, tr.taskId); return (tt && typeof tt.startMin === 'number') ? tt.startMin + tt.durMin : null; }
      if (tr.type === 'beforeTaskStart') { tt = tById[tr.taskId || h.toTaskId] || byId(plan.tasks, tr.taskId || h.toTaskId); return (tt && typeof tt.startMin === 'number') ? tt.startMin - (tr.leadMin || 0) : null; }
      return null;
    }
    var pairs = {};
    handoffs.forEach(function (h) {
      var to = tById[h.toTaskId], from = tById[h.fromTaskId];
      if (!to || !from) return;                     // both endpoints must live in this segment
      // coarse days only fly PLACED→PLACED (matches the animated cast); fishday keeps its original reach
      if (coarse && (!(from.assignedIds || []).length || !(to.assignedIds || []).length ||
                     typeof from.startMin !== 'number' || typeof to.startMin !== 'number')) return;
      var send = sendOf(h); if (send == null) return;
      var arr = send + (P.CHANNELS[h.channel] || 0);
      var key = h.toRoleId + '|' + h.cardId;
      if (!pairs[key] || arr < pairs[key].arr) pairs[key] = { arr: arr, send: send, h: h, from: from, to: to };
    });
    Object.keys(pairs).forEach(function (k) {
      var b = pairs[k], A = P.station(b.from.station), B = P.station(b.to.station);
      if (!A || !B) return;
      // late if ANY consuming task of this role needs the card before the winning arrival
      var late = false;
      tasks.forEach(function (tk) {
        if (tk.ownerRoleId === b.h.toRoleId && (tk.assignedIds || []).length &&
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

  // §5 coarse-day life (view layer only; engine.boatState stays fishday-only per §21.12): give the
  // animated arrival / return days their crossing arc. Arrival = the ship comes IN (sea→dock, param 1→0),
  // return = it heads OUT (dock→sea, param 0→1); ops keeps the boat docked. Fishday delegates to the
  // engine untouched, so its 220/91%/dinner anchors are byte-identical.
  function boatViewState(s) {
    if (!s || s.mode !== 'minute' || s.segment === 'fishday') return P.boatState(s);
    var seg = s.segment;
    if (seg !== 'arrival' && seg !== 'return') return P.boatState(s);   // ops etc. — docked
    var ws = s.winStart, we = s.winEnd;
    if (!(we > ws)) return P.boatState(s);
    var frac = Math.max(0, Math.min(1, ((s.clockMin || 0) - ws) / (we - ws)));
    var param = seg === 'arrival' ? (1 - frac) : frac;
    return { phase: seg === 'arrival' ? 'inbound' : 'outbound', param: param, atSea: param > 0.02 };
  }

  function launch() {
    stopAnim(); clearFinishTimer();                       // never stack a second rAF loop or a stale report reveal
    // §21.8b: every authored day now ANIMATES on the minute clock — the coarse days (arrival/ops/return)
    // opt into the minute-sim via {animate:true} so people walk + comment + PAUSE-on-stall like the fishday.
    // The run ends in the whole-trip ledger report (finish()→renderDayReport); the plan gaps that caused
    // the pauses are exactly what mark the day slice down. Whole-trip ('all') is not authorable → classic clock.
    sim = P.createSim({ seed: (Math.floor(Math.random() * 1e9) >>> 0) || 1, overrides: buildCfg().overrides }, daySel, { animate: true });
    if (window.PRS_SOUND) window.PRS_SOUND.ambient(daySel, sim.clockMin);   // ambient bed start, run-enter (sound.js §W3)
    paused = false; livePausedForFix = false; document.body.classList.add('running');
    closeModals();
    $('live-dock').classList.add('hidden');               // a morning run never shows the live dock
    speedMult = 1; document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-spd') === '1'); });
    enterScreen('run');
    $('figs').innerHTML = ''; $('banner').classList.remove('show');
    var ff = $('fanfare'); if (ff) ff.classList.remove('show');
    animReset(); updateRunButtons(); buildSitemap();
    // the cascade comet traces the fishday fault chain (港→船→食堂); it's fishday-specific, so a coarse
    // animated day shows no comet (its stalls surface as ⏳ pauses + the day-slice ledger report instead)
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
    if (sim.paused && sim.checkpoint) {
      if (window.PRS_SOUND) window.PRS_SOUND.cue('freeze');   // coarse/fishday-morning freeze point (sound.js §W3)
      if (sim.checkpoint.id === 'cp_stall') camPunchStall(sim);   // §3: punch in on the coarse-day stall
      openInspector();
    }
    if (sim.finished) finish();
  }
  // find whoever just stalled (waitinfo/rework, in-scope) and punch the camera in on them
  function camPunchStall(s) {
    for (var i = 0; i < s.tasks.length; i++) {
      var x = s.tasks[i];
      if (x.scope === 'in' && (x.state === 'waitinfo' || x.state === 'rework')) { camPunchGap({ taskId: x.id }); return; }
    }
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
      var bs = boatViewState(sim), b = anim.boat;
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
        hoverPid: hoverPid, spotlightPid: stageSpotPid, tintMap: stageTint, gapState: stageGapState,
        hoverWord: (function () { if (!hoverPid) return '';
          var hp = null, hi; for (hi = 0; hi < sim.participants.length; hi++) if (sim.participants[hi].id === hoverPid) hp = sim.participants[hi];
          return hp ? (T()[STATE_KEY[hp.state]] || hp.state) : ''; })(),
        fig: anim.fig, guest: anim.guest, boat: anim.boat, wakes: anim.wakes,
        motes: anim.motes, cascade: anim.cascade,
        ghost: stageGhost, trail: stageTrail, chain: stageChain, hotPts: anim.hotPts,
        frozen: !!(paused || livePausedForFix || (sim && sim.paused))
      };
      // §3 camera: when S2's camTo export isn't present we drive the transform via the
      // documented view.cam per-frame contract (null => stage.js uses identity/module CAM)
      stageView.cam = camFallbackFrame(ts);
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
      // W3 a11y: each row is a button opening the same popover (the keyboard path to inspection)
      return '<li><button type="button" class="sr-pawn" data-pid="' + p.id + '">' +
        P.role(p.roleId).icon + ' ' + nm(p.name) + ' — ' + (t[STATE_KEY[pst]] || pst) + '</button></li>';
    });
    var sig = L + '|' + lines.join('¦');
    if (el._sig === sig) return;
    el._sig = sig;
    el.innerHTML = '<h2>' + t.rosterHeading + '</h2><ul>' + lines.join('') + '</ul>';
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
    if (window.PRS_SOUND) window.PRS_SOUND.cue('fanfare');   // on-time dinner fanfare (sound.js §W3)
    ff.textContent = T().fanfareText; ff.classList.remove('show'); void ff.offsetWidth; ff.classList.add('show');
    setTimeout(function () { ff.classList.remove('show'); }, 2600);
    // §3 auto-cinematic: a slow breathe-out (1.0 → 0.94) as the dinner fanfare fires, then settle back
    if (!RM.matches) { camMoveTo(anim.w / 2, anim.h / 2, 0.94, 900); setTimeout(function () { camReleaseSafe(1100); }, 1500); }
  }

  function renderDashboard(s) {
    var t = T(), minute = s.mode === 'minute';
    // §7.2/§7.3: EVERY mode (Live included) reads the whole-trip ledger for the headline grade/score;
    // a day-scoped (minute) run reads that day's own daySchedule efficiency, labeled with the day name.
    // scoreDay/projectedDay are no longer consulted here (they are internal-only per §7.2).
    var trip = P.scoreTrip(s.plan);
    var ds = minute ? P.daySchedule(s.plan, s.segment) : null;
    // team-performance bars come from the classic score(); a coarse animated day has no per-team block,
    // so only fetch it for a fishday-minute run or the whole-trip (non-minute) run.
    var wantTeam = !(minute && s.segment !== 'fishday');
    var team = wantTeam ? P.score(s).team : null;
    $('dash-day').textContent = minute ? (s.segment === 'fishday' ? t.fdDayLine(hhmm(s.clockMin)) : dayLabel(s.segment) + ' · ' + hhmm(s.clockMin)) : T().dayLine(Math.min(P.DAYS, Math.ceil(s.day)), P.DAYS);
    $('dash-phase').textContent = s.phaseLabel ? nm(s.phaseLabel) : '';
    // day-scoped Efficiency % beside the grade (§7.3) + idle/rework minutes
    $('dash-fd').classList.toggle('hidden', !minute);
    if (minute) {
      var effVal = ds.efficiency;
      var effLblEl = $('dash-eff-lbl'); if (effLblEl) effLblEl.textContent = t.effDayLbl(dayLabel(s.segment));
      tweenNum($('dash-eff'), effVal, '%');
      $('dash-eff-bar').style.width = effVal + '%';
      $('dash-eff-bar').className = effVal >= 98 ? 'ok' : (effVal >= 90 ? 'mid' : 'bad');
      // idle accrued SO FAR (climbs live as the clock passes each waiting task's start)
      var idleSoFar = 0;
      if (s.sched) s.tasks.forEach(function (tk) {
        if (tk.scope !== 'in') return; var e = s.sched.byTask[tk.id]; if (!e) return;
        idleSoFar += Math.max(0, Math.min(s.clockMin, e.start) - tk.startMin) * Math.max(1, tk.assignedIds.length);
      });
      $('dash-idle').textContent = t.idleLine(Math.round(idleSoFar), ds.reworkTotal);
      var ib = $('dash-idle-bar');
      if (ib) { var iw = Math.min(100, idleSoFar / 2.2); ib.style.width = iw + '%'; ib.className = idleSoFar <= 0 ? 'ok' : (iw > 40 ? 'bad' : 'mid'); }
    }
    // §W1: the readiness meter is now the ledger rail — the ticking total (E2E hook #dash-ready
    // kept on the total element) + grade + the 5 bucket rows + the grade-gate line.
    var readyVal = trip.total;
    tweenNum($('dash-ready'), readyVal, '');
    $('dash-ready').style.color = GRADE_COLOR[trip.grade];
    var gEl = $('dash-grade'); if (gEl) { gEl.textContent = trip.grade; gEl.style.color = GRADE_COLOR[trip.grade]; }
    renderRail('run', trip);
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
    // team performance (6 values) — classic score() only (team computed above); a coarse animated day
    // has no per-team block, so team is null there and the bars are cleared rather than crashing.
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
    updateSoundButton();
  }
  // header 🔊 toggle label — lives outside #run (works on every screen), so it gets its own
  // small updater; called from updateRunButtons() (itself called by applyLang() at every
  // language switch + init) and directly after the click that flips window.PRS_SOUND.
  function updateSoundButton() {
    var sb = $('snd-toggle'); if (!sb) return;
    var on = !!(window.PRS_SOUND && window.PRS_SOUND.enabled);
    sb.textContent = on ? T().sndOff : T().sndOn;
    sb.setAttribute('aria-label', T().sndAria);
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
  function closeInspector() { $('inspect-modal').classList.remove('show'); camReleaseSafe(480); if (sim && sim.paused) P.resume(sim); modalClosed(); }

  // =========================================================================
  // W3 — inspectable cast: click / tap / roster any duty-holder -> washi popover
  // (hover feeds the canvas name chip via hoverPid; click opens P.memberInfo).
  // The sim NEVER pauses; one popover at a time; Escape / click-away closes.
  // =========================================================================
  // pointer px (client) -> the anim.fig cache space (CSS px inside #sitemap)
  function sitemapPt(e) {
    var map = $('sitemap'); if (!map) return null;
    var r = map.getBoundingClientRect();
    var sw = r.width || anim.w || 1, sh = r.height || anim.h || 1;
    return { x: (e.clientX - r.left) * ((anim.w || sw) / sw), y: (e.clientY - r.top) * ((anim.h || sh) / sh) };
  }
  // nearest duty-holder whose cached feet position is within the hit radius (cache, not the wandered pixel)
  function pawnAt(e) {
    if (!sim || !anim) return null;
    var pt = sitemapPt(e); if (!pt) return null;
    var R = 26 * FIGK * (USE_CANVAS ? stageScaleNow() : 1), best = null, bestD = R * R;   // radius grows with the sprite-era pawn scale
    sim.participants.forEach(function (p) {
      var f = anim.fig[p.id]; if (!f) return;
      var dx = f.cx - pt.x, dy = f.cy - pt.y, d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = p.id; }
    });
    return best;
  }
  function shortCard(id) { var c = byId(sim.plan.infoCards, id); return nm(c ? c.name : id).split('：')[0].split(':')[0]; }

  function pawnCardHTML(p) {
    var t = T(), rr = P.role(p.roleId), mi = P.memberInfo(sim, p.id);
    // §21.4 parity: during a Live freeze the taxonomy state the app painted wins over the raw engine state
    var pst = (stageGapState && stageGapState.pid === p.id) ? stageGapState.state : (mi ? mi.state : p.state);
    var jp = (p.name && p.name.jp) ? p.name.jp : '';
    var head = '<button class="pc-x" id="pc-close" aria-label="' + t.closeBtn + '">×</button>' +
      '<div class="pc-head"><span class="pc-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
      '<div class="pc-id"><b id="pc-name">' + nm(p.name) + '</b>' +
      (jp && jp !== nm(p.name) ? '<span class="pc-jp">' + jp + '</span>' : '') +
      '<span class="pc-role">' + rr.icon + ' ' + nm(rr.name) + '</span></div></div>';
    // the 迷い/手待ち/手戻り taxonomy line = state bubble + the st* word (already carries the taxonomy)
    var stateRow = '<div class="pc-state pc-s-' + pst + '"><span class="pc-bub">' + (BUB[pst] || '') + '</span>' +
      '<span class="pc-sw">' + t.pcState + ': ' + (t[STATE_KEY[pst]] || pst) + '</span></div>';
    if (!mi) {   // whole-trip classic clock: no minute schedule -> name / role / duty / state only
      return head + stateRow + '<div class="pc-duty">' + (t['duty_' + p.roleId] || '') + '</div>' +
        '<div class="pc-note">' + t.pcNoMinute + '</div>';
    }
    var now = sim.clockMin || 0;
    var held = mi.held.map(function (hc) {
      return '<span class="ins-card ok">' + shortCard(hc.cardId) + ' <i>' + (hc.own ? '◉' : hhmm(hc.atMin)) + '</i></span>';
    }).join('');
    var seen = {};
    var waits = mi.waiting.map(function (w) {
      seen[w.cardId] = 1;
      var idle = Math.max(0, Math.round(w.etaMin - now));
      return '<span class="ins-card wait">⏳ ' + shortCard(w.cardId) + ' <i>' + t.pcEta(hhmm(w.etaMin)) + (idle > 0 ? ' · ' + t.pcIdle(idle) : '') + '</i></span>';
    }).join('');
    waits += mi.waitsOn.filter(function (w) { return w.cardId && !seen[w.cardId]; }).map(function (w) {
      return '<span class="ins-card wait">⏳ ' + shortCard(w.cardId) + ' <i>' + (w.missing ? t.inspMissing : t.pcEta(hhmm(w.until))) + '</i></span>';
    }).join('');
    var ctk = mi.currentTaskId ? byId(sim.tasks, mi.currentTaskId) : null;
    var ntk = mi.nextTaskId ? byId(sim.tasks, mi.nextTaskId) : null;
    var cur = ctk ? nm(ctk.name) : '—';
    var nxt = ntk ? nm(ntk.name) + (mi.nextAtMin != null ? ' (' + hhmm(mi.nextAtMin) + ')' : '') : '—';
    return head + stateRow +
      '<div class="pc-sec"><span class="pc-h">' + t.pcHeld + '</span><div class="ins-cards">' + (held || '<span class="ins-none">—</span>') + '</div></div>' +
      (waits ? '<div class="pc-sec"><span class="pc-h">' + t.pcWaiting + '</span><div class="ins-cards">' + waits + '</div></div>'
             : '<div class="pc-sec pc-free">' + t.inspIdleFree + '</div>') +
      '<div class="pc-tasks"><div class="pc-line">' + t.inspNowDoing + ': ' + cur + '</div>' +
      '<div class="pc-line">' + t.pcNext + ': ' + nxt + '</div></div>';
  }

  function positionPawnCard(pid) {
    var card = $('pawn-card'), f = anim && anim.fig[pid], map = $('sitemap'); if (!f || !map) return;
    var r = map.getBoundingClientRect();
    var sc = USE_CANVAS ? stageScaleNow() : 1;
    var sx = r.left + f.cx * (r.width / (anim.w || r.width));
    var sy = r.top + f.cy * (r.height / (anim.h || r.height));   // feet
    card.style.left = '0px'; card.style.top = '0px';             // measure at origin
    var cw = card.offsetWidth, ch = card.offsetHeight, M = 8;
    var headY = sy - 40 * sc;                                    // roughly the pawn's head
    var left = sx - cw / 2, top = headY - ch - 10;               // default: above the head
    if (top < M) top = sy + 14 * sc;                             // flip below if there's no room above
    if (left < M) left = M;
    if (left + cw > window.innerWidth - M) left = window.innerWidth - M - cw;
    if (top + ch > window.innerHeight - M) top = window.innerHeight - M - ch;
    card.style.left = Math.round(left) + 'px'; card.style.top = Math.round(top) + 'px';
  }

  function openPawnCard(pid) {
    if (!sim) return;
    var p = byId(sim.participants, pid); if (!p) return;
    var card = $('pawn-card'); if (!card) return;
    var freshOpen = card.classList.contains('hidden');
    if (freshOpen) { var a = document.activeElement; pawnCardInvoker = (a && a !== document.body) ? a : null; }
    pawnCardPid = pid;
    card.innerHTML = pawnCardHTML(p);
    card.setAttribute('aria-label', nm(p.name) + ' · ' + nm(P.role(p.roleId).name));
    card.classList.remove('hidden');
    positionPawnCard(pid);
    if (freshOpen) { try { card.focus(); } catch (e) { } }       // don't steal focus on a live re-render
  }
  function closePawnCard() {
    var card = $('pawn-card'); if (!card || card.classList.contains('hidden')) return;
    card.classList.add('hidden'); card.innerHTML = '';
    var inv = pawnCardInvoker; pawnCardPid = null; pawnCardInvoker = null;
    if (inv && document.body.contains(inv)) { try { inv.focus(); } catch (e) { } }
  }
  function pawnCardOpen() { var c = $('pawn-card'); return c && !c.classList.contains('hidden'); }

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
    camReleaseSafe(0);                            // §3 safety: no camera offset carries into the report stage
    // §7.2: a coarse animated day (arrival/ops/return) report reads the whole-trip ledger (scoreTrip)
    // + that day's daySchedule/dayReadiness in renderDayReport — no scoreDay grade/score is rendered,
    // so res.day is unused for the coarse path.
    if (sim.mode === 'minute' && sim.segment !== 'fishday') {
      lastResult = { trip: null, day: null, segment: sim.segment, coarse: true };
    } else {
      lastResult = { trip: P.score(sim), day: (sim.segment !== 'all' ? P.daySummary(sim) : null), segment: sim.segment };
    }
    var simAt = sim;
    clearFinishTimer();
    finishTimer = setTimeout(function () {
      finishTimer = null;
      if (sim !== simAt) return;      // a mode/screen change won the race — don't pop the report over it
      closePawnCard();
      stopAnim(); enterScreen('report'); renderReport(lastResult);
    }, 700);
  }

  var GRADE_COLOR = { A: 'var(--build)', B: 'var(--leader)', C: 'var(--idle)', D: 'var(--wait)' };

  // =========================================================================
  // §Phase3b — SCORE LEDGER: the whole-trip 100 (P.scoreTrip) rendered as a
  // list where every point is a named, reasoned row, grouped bucket -> dimension
  // -> atom. Reads only trip.atoms/byBucket (engine.js §13.2/§13.3); never writes.
  // =========================================================================
  var LEDGER_BUCKETS = ['frame', 'load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];
  var LEDGER_DIMS = ['info', 'exec', 'safety', 'quality', 'money', 'people'];
  var LEDGER_SEGS = ['load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];
  // a coarse/fishday single-day report shows that bucket + the trip-wide 'frame' bucket
  // (frame atoms are standing authorities, not tied to one day); 'all' shows all five.
  function ledgerBucketsFor(segment) {
    if (segment === 'all') return LEDGER_BUCKETS;
    return segment === 'frame' ? ['frame'] : ['frame', segment];
  }
  // a few gate atoms carry neither a cardId nor a taskId nor a truthy detectorId — humanize the
  // atom id as a last resort so every row still names something (strip the bucket_/dimension_
  // prefixes it was built with).
  function ledgerHumanizeId(id, bucket) {
    var s = id || '';
    var bp = bucket + '_'; if (s.indexOf(bp) === 0) s = s.slice(bp.length);
    for (var i = 0; i < LEDGER_DIMS.length; i++) { var dp = LEDGER_DIMS[i] + '_'; if (s.indexOf(dp) === 0) { s = s.slice(dp.length); break; } }
    s = s.replace(/_/g, ' ');
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : id;
  }
  // explicit bilingual labels only for the two frame abort gates, which share one detector label
  // ("Safety authority (sea / night)") — name them apart here (sea vs night). Every other gate is
  // now task-homed (money/safety atoms carry an itemRef.taskId per the v1.0 constitution), so
  // ledgerItemName resolves them from task data and this list stays tiny.
  var LEDGER_ITEM_NM = {
    frame_abort_sea: { en: 'Rough-sea abort authority', jp: '時化時の中止権限' },
    frame_abort_night: { en: 'Night-sea abort authority', jp: '夜間の中止権限' }
  };
  // find a task by id across every authorable segment (a task-homed atom's itemRef.taskId belongs
  // to its bucket's segment, but searching all four is robust to any homing surprise).
  function ledgerTaskAcrossSegs(plan, tid) {
    for (var i = 0; i < LEDGER_SEGS.length; i++) { var tk = byId(P.tasksForSeg(plan, LEDGER_SEGS[i]), tid); if (tk) return tk; }
    return null;
  }
  // resolve a bilingual display name for one atom's itemRef, off the SAME arrays the atom
  // was priced against: socket/gate-with-card -> the info card; lane/gate-with-task/decoy ->
  // the task(s) via P.tasksForSeg (all four segs, fishday included); gate-with-detector -> the
  // existing problem-panel label (e_<id>_label); else the humanized id.
  function ledgerItemName(plan, atom) {
    var ref = atom.itemRef, bucket = atom.bucket, roleName, tids, names, i, tk, card;
    if (LEDGER_ITEM_NM[atom.id]) return nm(LEDGER_ITEM_NM[atom.id]);
    if (!ref) return ledgerHumanizeId(atom.id, bucket);
    if (ref.cardId) {
      card = byId(plan.infoCards, ref.cardId);
      roleName = ref.roleId ? nm(P.role(ref.roleId).name) : '';
      return (card ? nm(card.name) : ref.cardId) + (roleName ? ' → ' + roleName : '');
    }
    if (ref.taskId) {
      tids = Array.isArray(ref.taskId) ? ref.taskId : [ref.taskId];
      names = [];
      for (i = 0; i < tids.length; i++) { tk = ledgerTaskAcrossSegs(plan, tids[i]); names.push(tk ? nm(tk.name) : ledgerHumanizeId(atom.id, bucket)); }
      roleName = ref.roleId ? nm(P.role(ref.roleId).name) : '';
      return (roleName ? roleName + ': ' : '') + names.join(' · ');
    }
    if (ref.detectorId) return T()['e_' + ref.detectorId + '_label'] || ref.detectorId;
    return ledgerHumanizeId(atom.id, bucket);
  }
  // status -> {sst_*} chip label; 'present-but-late' (a riskable socket drawn but late, 1/3 partial
  // credit) gets its own "Partial / 部分点" chip (§7.4) + the amber 'partial' row tint (ledgerTier).
  var LEDGER_STATUS_KEY = { ok: 'ok', missing: 'missing', late: 'late', broken: 'broken', overlap: 'overlap', compressed: 'compressed', decoy: 'decoy', 'present-but-late': 'partial' };
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
    var titleEl = $('ledger-title'); if (titleEl) titleEl.textContent = T().ledgerTitle;
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
      return '<div class="lg-bucket"><div class="lg-bhead"><span>' + sbLabel(bk) + '</span><b>' + bStat.earned + ' / ' + bStat.maxPts + '</b></div>' + dimHtml + '</div>';
    }).join('');
  }

  function renderReport(res) {
    // the individuals table has no coarse-day analogue — hide its card for a coarse report, and
    // restore it for the animated fishday/whole-trip paths (idempotent either way).
    var indivCard = $('individuals').closest('.card');
    if (res.coarse) { if (indivCard) indivCard.classList.add('hidden'); renderDayReport(res); return; }
    if (indivCard) indivCard.classList.remove('hidden');
    var t = T(), sc = res.trip, day = res.day;
    // §7.2 — the headline grade/score/verdict all come from the whole-trip ledger (scoreTrip) — one
    // currency across the trip. A single-day (fishday) run sees that day's SLICE of the trip 100 (the
    // day-slice line below); a whole-trip ('all') run sees the full total. The verdict reads ledger
    // data only (no mixing with score()'s .reason). The fix-pack/individuals panels below still read
    // the legacy per-run scorer (sc) for their own content — never its total/grade.
    var trip = P.scoreTrip(currentPlan());
    $('r-grade').textContent = trip.grade; $('r-grade').style.color = GRADE_COLOR[trip.grade];
    var perfect = trip.gate.clean && trip.grade === 'A';
    var badge = $('r-badge'); badge.textContent = perfect ? (day ? t.badgeDayClean : t.badgePerfect) : ''; badge.classList.toggle('show', perfect);
    if (trip.gate.withheldA) {
      $('r-verdict').textContent = t.gradeGateB(trip.total);
    } else if (day) {
      $('r-verdict').textContent = day.clean ? t.rDayScoreOk(dayLabel(res.segment), trip.total) : t.rDayScoreGaps(dayLabel(res.segment), trip.total, day.gaps);
    } else {
      $('r-verdict').textContent = trip.total + ' / 100 — ' + (trip.gate.clean ? t.rDone : t.rIncomplete);
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
      // whole-trip ('all') run: a trip-scoped efficiency chip (§7.3) + the classic condition list.
      $('r-conds').innerHTML = '<span class="cond">' + t.effTripLbl + ' ' + P.tripEfficiency(currentPlan()) + '%</span>' +
        sc.conditions.map(function (c) {
          return '<span class="cond ' + (c.met ? 'met' : 'unmet') + '">' + (c.met ? '✓' : '✗') + ' ' + nm(c.text) + '</span>';
        }).join('');
    }
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
    renderRail('report', trip);
    renderLedger(trip, res.segment);
    bootReportStage(res, trip);   // §S3 report-on-stage: the harbor at dusk above the cards
  }

  // §20 Phase 5: coarse-day (arrival/ops/return) report — scored straight off the authored
  // plan.days arrangement, no sim/animation involved. Reuses the same DOM the animated fishday/
  // whole-trip report renders into (renderReport branches to this for res.coarse).
  function renderDayReport(res) {
    var t = T(), seg = res.segment, plan = currentPlan();
    var hints = P.dayReadiness(plan, seg), ds = P.daySchedule(plan, seg);
    // §7.2 — headline grade/score/verdict come from the whole-trip ledger (scoreTrip); the day's own
    // efficiency chips come from that day's daySchedule (§7.3); the fix-list is dayReadiness. scoreDay's
    // grade/score/89-cap and its 8-category scorecard are gone from this player-facing path.
    var trip = P.scoreTrip(plan);
    var dayClean = hints.length === 0 && ds.unresolved === 0;
    $('r-grade').textContent = trip.grade; $('r-grade').style.color = GRADE_COLOR[trip.grade];
    if (trip.gate.withheldA) {
      $('r-verdict').textContent = t.gradeGateB(trip.total);
    } else {
      $('r-verdict').textContent = dayClean ? t.rDayScoreOk(dayLabel(seg), trip.total) : t.rDayScoreGaps(dayLabel(seg), trip.total, hints.length);
    }
    var perfectD = trip.gate.clean && trip.grade === 'A';
    var bd = $('r-badge'); bd.textContent = perfectD ? t.badgeDayClean : ''; bd.classList.toggle('show', perfectD);
    // the day-slice line: this segment's earned/max share of the whole-trip 100
    var b = trip.byBucket[seg];
    $('r-conds').innerHTML =
      (b ? '<span class="cond">' + t.daySliceLine(b.earned, b.maxPts, dayLabel(seg)) + '</span>' : '') +
      '<span class="cond ' + (ds.efficiency === 100 ? 'met' : 'unmet') + '">' + t.rcEff(ds.efficiency) + '</span>' +
      '<span class="cond ' + (ds.idleTotal === 0 ? 'met' : 'unmet') + '">' + t.rcIdle(ds.idleTotal) + '</span>' +
      '<span class="cond ' + (ds.reworkTotal === 0 ? 'met' : 'unmet') + '">' + t.rcRework(ds.reworkTotal) + '</span>' +
      (ds.dinnerMin != null ? '<span class="cond ' + (ds.dinnerMin <= 1080 ? 'met' : 'unmet') + '">' + t.rcDinner(hhmm(ds.dinnerMin)) + '</span>' : '');
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
    renderRail('report', trip);
    renderLedger(trip, seg);
    bootReportStage(res, trip);   // §S3 report-on-stage (coarse animated day): same dusk harbor
  }

  // "Auto-arrange the arrows ▶" — the coarse-day analogue of the fishday fix-pack: heal this
  // day's arrows to face-to-face AND place any unplaced required tasks (P.applyDayFix), persist
  // BOTH patches into dayOv (so a gappy day can reach 100, not cap ~92 on a dropped placement),
  // then re-score.
  function applyDayFixAndRerun() {
    var seg = daySel, cfg = P.applyDayFix(buildCfg(), seg);
    var d = (cfg.overrides.days && cfg.overrides.days[seg]) || {};
    var hpatch = d.handoffs || {}, ppatch = d.placement || {};
    for (var k in hpatch) dayOv[seg].handoffs[k] = Object.assign({}, dayOv[seg].handoffs[k], hpatch[k]);
    for (var pk in ppatch) dayOv[seg].placement[pk] = ppatch[pk];
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
  // §HarborComplete S3 — REPORT-ON-STAGE: after a run the report opens with the
  // SAME harbor at dusk. Stall markers (DOM hotspots) glow at the stations where
  // idle/rework actually accrued — each click-through routes to the surface that
  // fixes it (frame gap → its receipt row; day gap → the day drawer, pre-scrolled
  // to the hollow socket). The grade lands as a hanko stamp. Pawns stand at their
  // end-of-day stations, inspectable via the shared #pawn-card (memberInfo at the
  // final minute). Pure presentation: reads the finished sim / daySchedule
  // read-offs, never writes to sim state. Lifecycle mirrors the plan stage:
  // bootReportStage() creates the canvas ctx + local rAF, killReportStage()
  // (enterScreen, idempotent) destroys them — never merely hidden.
  // view.dusk / view.stallMarkers / view.stamp are the S2 render contracts; the
  // canvas dusk grade no-ops until stage.js's layers land (DOM overlays carry
  // the feature on their own until then).
  // =========================================================================
  var RSTG = { raf: null, sim: null, ctx: null, cv: null, host: null, w: 0, h: 0, sc: 1,
    fig: {}, boat: null, hoverPid: null, last: 0, markers: [], seg: 'fishday', stamp: null };
  var rsStampKey = null;   // grade|total|segment of the last stamped report — a language re-render never re-thocks

  function rsDims() {
    var host = $('report-stage-wrap');
    var w = (host && host.clientWidth) || 900;
    var h = (host && host.clientHeight) || 340;
    return { w: w, h: h };
  }
  // the visible anchor for a task's station: the hidden stations (command/finance/clinic)
  // are folded into the Hinata hub on the map, so their stalls glow there too
  function rsAnchorStation(stId) {
    var st = P.station(stId);
    return (st && st.hidden) ? 'mess' : (st ? st.id : 'mess');
  }
  function rsShortCard(cid) {
    var c = RSTG.sim ? byId(RSTG.sim.plan.infoCards, cid) : null;
    return nm(c ? c.name : cid).split('：')[0].split(':')[0];
  }
  // ---- stall aggregation: daySchedule byTask idle/rework → task.station (sev by person-minutes);
  // classic frame gaps (t.problem → hard stall) count their whole blocked block ----
  function rsStalls() {
    var s = RSTG.sim, agg = {}, order = [], i, j;
    if (!s) return [];
    var sch = s.sched || null;
    // primary pick = the marker's click-through target: a NAMEABLE gap (an info card socket or
    // a frame decision) always outranks a bare dep-chain wait — the drawer-with-socket / receipt
    // row is the fixing surface, "upstream delay" is only a fallback. Minutes break ties in rank.
    function itemRank(it) { return (it.kind === 'frame' || it.cardId) ? 1 : 0; }
    function add(stId, min, item) {
      var a = agg[stId];
      if (!a) { a = agg[stId] = { stationId: stId, min: 0, primary: null, _pMin: -1, _pRank: -1 }; order.push(a); }
      a.min += min;
      if (item) {
        var rk = itemRank(item);
        if (rk > a._pRank || (rk === a._pRank && min > a._pMin)) { a._pRank = rk; a._pMin = min; a.primary = item; }
      }
    }
    for (i = 0; i < s.tasks.length; i++) {
      var t = s.tasks[i];
      if (t.scope !== 'in') continue;
      var n = Math.max(1, (t.assignedIds || []).length);
      var anchor = rsAnchorStation(t.station);
      if (t.problem) {   // classic design gap: the task never completes — bill its whole block
        var bm = Math.round((t.durMin || 60) * n);
        add(anchor, bm, { kind: 'frame', det: t.problem.id, taskId: t.id });
        continue;
      }
      var e = sch && sch.byTask[t.id]; if (!e) continue;
      var lost = Math.round((e.idleMin + e.extension) * n);
      if (lost <= 0 && !e.wrongFish) continue;
      var item = null, w;
      for (j = 0; j < (e.waits || []).length; j++) {
        w = e.waits[j];
        if (w.cardId) { item = { kind: 'day', taskId: t.id, cardId: w.cardId, late: !w.missing }; break; }
      }
      if (!item && e.wrongFish && sch) {   // a wrong-assumption task: the fix is the arrow that should have fed it
        for (j = 0; j < sch.missing.length; j++) if (sch.missing[j].taskId === t.id) { item = { kind: 'day', taskId: t.id, cardId: sch.missing[j].cardId, late: false }; break; }
        if (!item) for (j = 0; j < sch.late.length; j++) if (sch.late[j].taskId === t.id) { item = { kind: 'day', taskId: t.id, cardId: sch.late[j].cardId, late: true }; break; }
      }
      if (!item) item = { kind: 'day', taskId: t.id, cardId: null };   // dep-chain wait: route to the day drawer itself
      if (lost <= 0) lost = 15;   // a wrong-fish source with no local minutes still deserves a visible marker
      add(anchor, lost, item);
    }
    var out = [];
    for (i = 0; i < order.length; i++) {
      var a = order[i];
      a.sev = a.min >= 120 ? 'high' : (a.min >= 45 ? 'mid' : 'low');   // DOM hotspot class
      a.sevN = a.min >= 120 ? 1 : (a.min >= 45 ? 0.6 : 0.3);           // canvas light: 0..1 (stage grades amber→hanko)
      out.push(a);
    }
    return out;
  }
  function rsGapText(it) {
    var t = T();
    if (!it) return '';
    if (it.kind === 'frame') return t.rsGapFrame(t['e_' + it.det + '_label'] || it.det);
    if (it.cardId) return it.late ? t.rsGapLate(rsShortCard(it.cardId)) : t.rsGapMissing(rsShortCard(it.cardId));
    return t.rsGapDep;
  }
  // ---- pawn end-of-day placement: fan-stack per station (figTargets' rule on RSTG dims) ----
  function rsTargets(s) {
    var pos = {}, bucket = {};
    s.stations.forEach(function (st) { bucket[st.id] = []; });
    s.participants.forEach(function (p) { if (bucket[p.station]) bucket[p.station].push(p); });
    var colGap = 23 * FIGK * RSTG.sc, rowGap = 24 * FIGK * RSTG.sc, feet = 36 * RSTG.sc;   // fan tracks sprite-era pawn size
    s.stations.forEach(function (st) {
      var sd = P.station(st.id), n = bucket[st.id].length;
      bucket[st.id].forEach(function (p, i2) {
        var col = i2 % 4, row = Math.floor(i2 / 4), rowN = Math.min(4, n - row * 4);
        pos[p.id] = { x: sd.x * RSTG.w + (col - (rowN - 1) / 2) * colGap, y: sd.y * RSTG.h + feet + row * rowGap };
      });
    });
    return pos;
  }
  function rsSyncFigs() {
    if (!RSTG.sim) return;
    var pos = rsTargets(RSTG.sim);
    RSTG.sim.participants.forEach(function (p) {
      var t2 = pos[p.id]; if (!t2) return;
      RSTG.fig[p.id] = { pid: p.id, cx: t2.x, cy: t2.y, tx: t2.x, ty: t2.y, walking: false, faceL: false, spdMul: figSpeedMul(p.id) };
    });
  }
  // the per-frame view bundle (mirrors psView) + the S2 render contracts
  function rsView(rm) {
    var s = RSTG.sim, hw = '';
    if (RSTG.hoverPid) { var hp = byId(s.participants, RSTG.hoverPid); if (hp) hw = T()[STATE_KEY[hp.state]] || hp.state; }
    return { w: RSTG.w, h: RSTG.h, scale: RSTG.sc, lang: L, rm: !!rm,
      night: s.mode === 'minute' && (s.clockMin < 330 || s.clockMin >= 1110),
      speedMult: 1, guestsVisible: false, hoverPid: RSTG.hoverPid, hoverWord: hw,
      spotlightPid: null, tintMap: null, gapState: null,
      fig: RSTG.fig, guest: {}, boat: RSTG.boat, wakes: [],
      motes: [], cascade: { hops: [], has: false },
      ghost: [{}, {}, {}], trail: [], chain: [], hotPts: [], frozen: false,
      // S2 render contracts (spec §4): stage.js draws the dusk grade, the marker LIGHT
      // (numeric sev 0..1, amber→hanko) and the hanko stamp; the DOM side (below) owns
      // only the hotspots + aria + the person-minute chips.
      dusk: 1,
      stallMarkers: RSTG.markers.map(function (m) { return { stationId: m.stationId, sev: m.sevN }; }),
      stamp: RSTG.stamp };
  }
  function bootReportStage(res, trip) {
    killReportStage();
    if (!window.PRS_STAGE || $('report').classList.contains('hidden')) return;
    var cv = $('report-stage'), host = $('report-stage-wrap'); if (!cv || !host) return;
    var t = T(), d = rsDims();
    RSTG.host = host; RSTG.cv = cv; RSTG.w = d.w; RSTG.h = d.h;
    RSTG.sc = clamp(Math.min(d.w / 1000, d.h / 520), 0.6, 1.25);
    RSTG.boat = { cx: DOCK.x * d.w, cy: DOCK.y * d.h };
    // which day stands on the stage: the run's own minute-modeled day. A whole-trip ('all')
    // run has no minute sim — show the fishday (THE minute-modeled day) rebuilt headlessly
    // from the current plan and ticked to its end; a per-day picker is deferred (spec §4).
    var wholeTrip = false;
    if (sim && sim.mode === 'minute' && sim.sched) { RSTG.sim = sim; RSTG.seg = sim.segment; }
    else {
      wholeTrip = true; RSTG.seg = 'fishday';
      var s = P.createSim({ seed: 1, overrides: buildCfg().overrides }, 'fishday'), g = 0;
      while (!s.finished && g++ < 600) { if (s.paused) { s.paused = false; s.checkpoint = null; } P.tick(s); }
      RSTG.sim = s;
    }
    cv.setAttribute('aria-label', t.rsChip);
    RSTG.ctx = PRS_STAGE.initStage(cv, { w: d.w, h: d.h });
    RSTG.fig = {}; rsSyncFigs();
    RSTG.markers = rsStalls();
    // a clean day lost no time — the chip must not claim it did (deep-check finding)
    $('rs-chip').textContent = RSTG.markers.length ? t.rsChip : t.rsClean;
    var note = $('rs-note');
    if (note) {
      if (wholeTrip) { note.textContent = t.rsWholeTrip; note.classList.remove('hidden'); note.classList.remove('good'); }
      else if (!RSTG.markers.length) { note.textContent = t.rsClean; note.classList.remove('hidden'); note.classList.add('good'); }
      else { note.classList.add('hidden'); note.classList.remove('good'); }
    }
    rsBuildMarkers();
    rsBuildRoster();
    // hanko stamp: lands once per fresh report (thock); a re-render (language switch) keeps it seated
    var stampEl = $('rs-stamp');
    var key = trip.grade + '|' + trip.total + '|' + (res.segment || '') + (res.coarse ? '|c' : '');
    var fresh = key !== rsStampKey;
    rsStampKey = key;
    if (stampEl) {
      stampEl.textContent = trip.grade;
      stampEl.setAttribute('aria-label', t.rsStampAria(trip.grade, trip.total));
      stampEl.classList.remove('hidden');
      stampEl.classList.remove('thock');
      if (fresh && !RM.matches) { void stampEl.offsetWidth; stampEl.classList.add('thock'); }
    }
    if (fresh && window.PRS_SOUND) window.PRS_SOUND.cue('thock');   // the hanko stamp (sound.js §W3)
    RSTG.stamp = { grade: trip.grade, at: fresh ? (window.performance ? performance.now() : 0) / 1000 : 0 };
    if (RM.matches) { PRS_STAGE.scene(RSTG.ctx, RSTG.sim, 1, rsView(true)); rsPositionOverlays(); return; }
    RSTG.last = 0; RSTG.raf = requestAnimationFrame(rsFrame);
  }
  function killReportStage() {
    if (RSTG.raf) cancelAnimationFrame(RSTG.raf);
    RSTG.raf = null; RSTG.sim = null; RSTG.ctx = null; RSTG.cv = null; RSTG.host = null;
    RSTG.fig = {}; RSTG.boat = null; RSTG.hoverPid = null; RSTG.last = 0;
    RSTG.markers = []; RSTG.stamp = null;
    var mk = $('rs-markers'); if (mk) mk.innerHTML = '';
    var ro = $('rs-roster'); if (ro) ro.innerHTML = '';
    var w = $('report-stage-wrap'); if (w) w.classList.remove('pawn-hover');
  }
  function rsFrame(ts) {
    if (!RSTG.raf) return;
    RSTG.raf = requestAnimationFrame(rsFrame);
    if ($('report').classList.contains('hidden') || !RSTG.sim) { killReportStage(); return; }
    var host = $('report-stage-wrap');
    if (host && host.clientWidth && Math.abs(host.clientWidth - RSTG.w) > 4) rsResize();
    PRS_STAGE.scene(RSTG.ctx, RSTG.sim, ts / 1000, rsView(false));
  }
  function rsResize() {
    var d = rsDims(); if (!RSTG.cv) return;
    RSTG.w = d.w; RSTG.h = d.h;
    RSTG.sc = clamp(Math.min(d.w / 1000, d.h / 520), 0.6, 1.25);
    RSTG.boat = { cx: DOCK.x * d.w, cy: DOCK.y * d.h };
    PRS_STAGE.initStage(RSTG.cv, { w: d.w, h: d.h });
    rsSyncFigs();
    rsPositionOverlays();
    if (RM.matches && RSTG.ctx && RSTG.sim) PRS_STAGE.scene(RSTG.ctx, RSTG.sim, 1, rsView(true));
  }
  function rsBuildMarkers() {
    var box = $('rs-markers'), t = T(); if (!box) return;
    var html = '';
    for (var i = 0; i < RSTG.markers.length; i++) {
      var mk = RSTG.markers[i], st = P.station(mk.stationId);
      var aria = t.rsMarkerAria(nm(st.name), mk.min, rsGapText(mk.primary)).replace(/"/g, '&quot;');
      html += '<button type="button" class="rs-marker sev-' + mk.sev + '" data-idx="' + i + '" data-station="' + mk.stationId + '"' +
        ' aria-label="' + aria + '" title="' + aria + '">' +
        '<span class="rs-mk-min">' + t.rsMin(mk.min) + '</span></button>';
    }
    box.innerHTML = html;
    rsPositionOverlays();
  }
  function rsPositionOverlays() {
    var box = $('rs-markers'); if (!box) return;
    var els = box.querySelectorAll('.rs-marker');
    for (var i = 0; i < els.length; i++) {
      var mk = RSTG.markers[parseInt(els[i].getAttribute('data-idx'), 10)]; if (!mk) continue;
      var st = P.station(mk.stationId);
      els[i].style.left = Math.round(st.x * RSTG.w) + 'px';
      els[i].style.top = Math.round(st.y * RSTG.h) + 'px';
    }
    if (pawnCardOpen() && pawnCardPid && RSTG.fig[pawnCardPid] && !$('report').classList.contains('hidden')) positionReportPawnCard(pawnCardPid);
  }
  // the offscreen a11y roster (keyboard path to end-of-day pawn inspection)
  function rsBuildRoster() {
    var el = $('rs-roster'); if (!el || !RSTG.sim) return;
    var t = T();
    el.innerHTML = '<h2>' + t.rosterHeading + '</h2><ul>' + RSTG.sim.participants.map(function (p) {
      return '<li><button type="button" class="sr-pawn" data-pid="' + p.id + '">' +
        P.role(p.roleId).icon + ' ' + nm(p.name) + ' — ' + (t[STATE_KEY[p.state]] || p.state) + '</button></li>';
    }).join('') + '</ul>';
  }
  // ---- marker click-through: reuse the rail jump machinery (frame → receipt row; day → drawer socket) ----
  function reportMarkerJump(idx) {
    var mk = RSTG.markers[idx]; if (!mk || !mk.primary) return;
    var it = mk.primary, seg = RSTG.seg;
    closePawnCard();
    if (appMode === 'live') enterMode('morning'); else toSetup();   // the report's own btn-tweak routing
    if (it.kind === 'frame') {
      // frame gap → its receipt row (the rail's 'frame' jump-link pattern): the row may be
      // filtered off the current day tab — fall back to the 'all' tab where every row exists
      if (!$('ed-' + it.det)) { daySel = 'all'; placingChip = null; removeGhost(); removeDropSlot(); paintSetup(); }
      expandAllSettings();
      var card = $('ed-' + it.det);
      if (card) {
        if (card.scrollIntoView) card.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' });
        var fb = card.querySelector('.rc-close, .rc-route, .rc-undo');
        if (fb) { try { fb.focus({ preventScroll: true }); } catch (e2) { fb.focus(); } }
      }
    } else {
      // day gap → the day's drawer, pre-scrolled to the hollow (or late) socket
      openDayDrawer(seg, null);
      var go = function () {
        if (!it.cardId) return;   // dep-chain wait: the drawer itself is the fixing surface
        var sock = document.querySelector('#fd-canvas .fd-socket[data-task="' + it.taskId + '"][data-card="' + it.cardId + '"]');
        if (!sock) return;
        if (sock.scrollIntoView) sock.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center', inline: 'center' });
        try { sock.focus({ preventScroll: true }); } catch (e3) { sock.focus(); }
      };
      if (RM.matches) go(); else setTimeout(go, 90);   // let the drawer's slide land before scrolling inside it
    }
  }
  // ---- pawn hit-test + end-of-day inspection (shared #pawn-card) ----
  function rsPawnAt(cx, cy) {
    var wrap = $('report-stage-wrap'); if (!wrap || !RSTG.sim) return null;
    var r = wrap.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    var R = 30 * RSTG.sc, best = null, bestD = R * R;
    RSTG.sim.participants.forEach(function (p) {
      var f = RSTG.fig[p.id]; if (!f) return;
      var dx = f.cx - x, dy = (f.cy - 14 * RSTG.sc) - y, d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = p.id; }
    });
    return best;
  }
  // the day's account for one duty-holder: idle/rework person-minutes + the cards they waited on
  function rsPidSummary(pid) {
    var s = RSTG.sim, idle = 0, rework = 0, cards = {}, i, j;
    if (!s || !s.sched) return null;
    for (i = 0; i < s.tasks.length; i++) {
      var t = s.tasks[i];
      if (t.scope !== 'in' || t.assignedIds.indexOf(pid) < 0) continue;
      var e = s.sched.byTask[t.id]; if (!e) continue;
      idle += e.idleMin; rework += e.extension;
      for (j = 0; j < (e.waits || []).length; j++) if (e.waits[j].cardId) cards[e.waits[j].cardId] = 1;
    }
    return { idle: Math.round(idle), rework: Math.round(rework), cards: Object.keys(cards) };
  }
  function rsPawnCardHTML(p) {
    var t = T(), rr = P.role(p.roleId), jp = (p.name && p.name.jp) ? p.name.jp : '';
    var head = '<button class="pc-x" id="pc-close" aria-label="' + t.closeBtn + '">×</button>' +
      '<div class="pc-head"><span class="pc-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
      '<div class="pc-id"><b id="pc-name">' + nm(p.name) + '</b>' +
      (jp && jp !== nm(p.name) ? '<span class="pc-jp">' + jp + '</span>' : '') +
      '<span class="pc-role">' + rr.icon + ' ' + nm(rr.name) + '</span></div></div>';
    var stateRow = '<div class="pc-state pc-s-' + p.state + '"><span class="pc-bub">' + (BUB[p.state] || '') + '</span>' +
      '<span class="pc-sw">' + t.pcState + ': ' + (t[STATE_KEY[p.state]] || p.state) + '</span></div>';
    var sum = rsPidSummary(p.id), chips = '';
    if (sum) {
      if (sum.idle > 0) chips += '<span class="ins-card wait">⏳ ' + t.rsPawnIdle(sum.idle) + '</span>';
      if (sum.rework > 0) chips += '<span class="ins-card wait">🔁 ' + t.rsPawnRework(sum.rework) + '</span>';
    }
    var day = '<div class="pc-sec"><span class="pc-h">' + t.rsPawnDay + '</span><div class="ins-cards">' +
      (chips || '<span class="ins-none">' + t.rsPawnClean + '</span>') + '</div></div>';
    var waited = (sum && sum.cards.length) ? '<div class="pc-sec"><span class="pc-h">' + t.rsPawnWaited + '</span><div class="ins-cards">' +
      sum.cards.map(function (cid) { return '<span class="ins-card wait">' + rsShortCard(cid) + '</span>'; }).join('') + '</div></div>' : '';
    var mi = P.memberInfo(RSTG.sim, p.id);   // at the final minute: what they ended the day holding
    var held = mi ? mi.held.map(function (hc) {
      return '<span class="ins-card ok">' + rsShortCard(hc.cardId) + ' <i>' + (hc.own ? '◉' : hhmm(hc.atMin)) + '</i></span>';
    }).join('') : '';
    var holds = held ? '<div class="pc-sec"><span class="pc-h">' + t.pcHeld + '</span><div class="ins-cards">' + held + '</div></div>' : '';
    return head + stateRow + day + waited + holds;
  }
  function positionReportPawnCard(pid) {
    var card = $('pawn-card'), f = RSTG.fig[pid], wrap = $('report-stage-wrap'); if (!f || !wrap) return;
    var r = wrap.getBoundingClientRect();
    var sx = r.left + f.cx * (r.width / (RSTG.w || r.width));
    var sy = r.top + f.cy * (r.height / (RSTG.h || r.height));
    card.style.left = '0px'; card.style.top = '0px';
    var cw = card.offsetWidth, ch = card.offsetHeight, M = 8;
    var left = sx - cw / 2, top = sy - 44 * RSTG.sc - ch - 10;
    if (top < M) top = sy + 14 * RSTG.sc;
    if (left < M) left = M;
    if (left + cw > window.innerWidth - M) left = window.innerWidth - M - cw;
    if (top + ch > window.innerHeight - M) top = window.innerHeight - M - ch;
    card.style.left = Math.round(left) + 'px'; card.style.top = Math.round(top) + 'px';
  }
  function openReportPawnCard(pid) {
    if (!RSTG.sim) return;
    var p = byId(RSTG.sim.participants, pid); if (!p) return;
    var card = $('pawn-card'); if (!card) return;
    var fresh = card.classList.contains('hidden');
    if (fresh) { var a = document.activeElement; pawnCardInvoker = (a && a !== document.body) ? a : null; }
    pawnCardPid = pid;
    card.innerHTML = rsPawnCardHTML(p);
    card.setAttribute('aria-label', nm(p.name) + ' · ' + nm(P.role(p.roleId).name));
    card.classList.remove('hidden');
    positionReportPawnCard(pid);
    if (fresh) { try { card.focus(); } catch (e) { } }
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
    stopAnim(); sim = null; paused = false; livePausedForFix = false;
    closeModals();
    enterScreen('setup');
    paintSetup();
  }

  // =========================================================================
  // WB — the day drawer. The deck→arrange→connect editor (#fd-card, byte-
  // unchanged inside) rides a bottom sheet that a day tab (or the arrows
  // satchel) slides up over the plan stage. Non-modal: the ledger rail stays
  // live beside it (≥1180px, where the drawer leaves the rail's column).
  // The tray/plan-stage worker (WA) ships the shell in index.html with
  // #fd-card already inside #dd-body; when it isn't present yet (this
  // worktree), we build the identical shell here and the 3-way merge
  // reconciles the duplicate.
  // =========================================================================
  var drawerSeg = null;         // the day currently shown in the drawer, or null when closed
  var drawerInvoker = null;     // the control to restore focus to on close (usually the day tab)

  function ensureDrawerShell() {
    if ($('day-drawer')) return;                        // WA's index.html shell is already present (post-merge)
    var host = $('setup') || document.body;
    var d = document.createElement('div');
    d.id = 'day-drawer'; d.className = 'day-drawer';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'false');              // non-modal: the rail beside it stays interactive
    d.setAttribute('aria-labelledby', 'dd-title');
    d.innerHTML =
      '<div id="dd-head" class="dd-head">' +
        '<h2 id="dd-title" class="dd-title"></h2>' +
        '<div id="dd-tabs" class="dd-tabs"></div>' +
        '<button id="dd-close" class="dd-close" type="button">×</button>' +
      '</div>' +
      '<div id="dd-body" class="dd-body"></div>';
    host.appendChild(d);
    var card = $('fd-card');                            // move the existing editor subtree into the drawer body
    if (card) $('dd-body').appendChild(card);
  }

  function drawerIsOpen() { return drawerSeg !== null; }

  function openDayDrawer(seg, invoker) {
    if (seg === 'all' || !seg) { closeDayDrawer(); return; }
    ensureDrawerShell();
    var d = $('day-drawer'); if (!d) return;
    // remember the invoking control (the day tab, or the satchel via activeElement) to restore
    // focus to on close — but never a control that already lives inside the drawer
    var inv = invoker || document.activeElement;
    if (inv && inv !== document.body && !d.contains(inv)) drawerInvoker = inv;
    if (daySel !== seg) { daySel = seg; placingChip = null; removeGhost(); removeDropSlot(); paintSetup(); }
    drawerSeg = seg;
    var ttl = $('dd-title'); if (ttl) ttl.textContent = T().ddTitle(dayLabel(seg));
    var cl = $('dd-close'); if (cl) cl.setAttribute('aria-label', T().ddClose);
    // in-drawer day switching (spec §3's tab-hop promise — the bottom day-bar is covered
    // by an open drawer, so the drawer header carries its own compact day tabs + whole-trip)
    var tabs = $('dd-tabs');
    if (tabs) {
      var segs = ['load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];
      var html = '';
      for (var ti = 0; ti < segs.length; ti++) {
        html += '<button type="button" class="btn sm dd-tab' + (segs[ti] === seg ? ' on' : '') + '" data-dseg="' + segs[ti] + '" data-day="' + segs[ti] + '">' +
          dayLabel(segs[ti]) + '</button>';
      }
      html += '<button type="button" class="btn sm ghost dd-tab" data-dseg="all" data-day="all">' + T().wholeTrip + '</button>';
      tabs.innerHTML = html;
    }
    // integration seam: the shell ships aria-hidden="true" and a display:none guard keys off it —
    // flip it (and force a reflow) BEFORE .open so the slide transition starts from the base state
    d.setAttribute('aria-hidden', 'false');
    void d.offsetHeight;
    d.classList.add('open');
    if (window.PRS_SOUND) window.PRS_SOUND.cue('drawer');   // day-drawer open (sound.js §W3)
    buildDayGrid();                                     // re-fit now it's visible so fd-scroll sizes correctly
    if (cl) { try { cl.focus(); } catch (e) { } }
  }

  function closeDayDrawer() {
    var d = $('day-drawer');
    var wasOpen = drawerIsOpen();
    if (d) { d.classList.remove('open'); d.setAttribute('aria-hidden', 'true'); }
    if (wasOpen && window.PRS_SOUND) window.PRS_SOUND.cue('drawer');   // day-drawer close (sound.js §W3)
    if (!drawerIsOpen()) { drawerSeg = null; return; }
    drawerSeg = null;
    var inv = drawerInvoker; drawerInvoker = null;
    var target = null;
    // paintSetup rebuilds the day-select buttons, so a stored day tab is detached by now —
    // re-resolve the live tab from its day id; otherwise restore the stored control (e.g. satchel)
    if (inv && inv.dataset && inv.dataset.day) target = document.querySelector('.day-btn[data-day="' + inv.dataset.day + '"]');
    if (!target && inv && document.body.contains(inv)) target = inv;
    if (target) { try { target.focus(); } catch (e) { } }
  }

  function bind() {
    ensureDrawerShell();
    document.querySelectorAll('.lang button').forEach(function (b) { b.addEventListener('click', function () { L = b.getAttribute('data-lang'); applyLang(); }); });
    // header 🔊 toggle: the ONE real user-gesture handler allowed to resume the AudioContext (sound.js §W3)
    var sndBtn = $('snd-toggle');
    if (sndBtn) sndBtn.addEventListener('click', function () { if (window.PRS_SOUND) window.PRS_SOUND.toggle(); updateSoundButton(); });
    $('modesw').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]'); if (!b) return;
      var m = b.dataset.mode;
      if (m !== appMode) { enterMode(m); return; }
      // same-mode click: re-enter only when we've drifted off the mode's home screen (report, stale setup)
      if (m === 'live' && $('run').classList.contains('hidden')) enterMode('live');
      else if (m === 'morning' && $('setup').classList.contains('hidden')) enterMode('morning');
    });
    $('cast-open').addEventListener('click', function () { showIntro(false); });   // reopen -> Replay poster, never autoplay (§W4)
    $('intro-start').addEventListener('click', startFromIntro);
    $('vig-skip').addEventListener('click', vigSkip);
    $('intro-how-btn').addEventListener('click', function () { modalOpening('rules-modal'); $('rules-modal').classList.add('show'); $('rules-close').focus(); });
    $('rules-open').addEventListener('click', function () { modalOpening('rules-modal'); $('rules-modal').classList.add('show'); $('rules-close').focus(); });
    $('rules-close').addEventListener('click', function () { $('rules-modal').classList.remove('show'); modalClosed(); });
    $('rules-modal').addEventListener('click', function (e) { if (e.target === $('rules-modal')) { $('rules-modal').classList.remove('show'); modalClosed(); } });

    $('day-select').addEventListener('click', function (e) {
      var b = e.target.closest('.day-btn'); if (!b) return;
      var seg = b.dataset.day;
      // re-clicking the tab whose drawer is already open closes it (whole-trip has no drawer)
      var reclick = (seg !== 'all' && seg === daySel && drawerSeg === seg);
      daySel = seg; placingChip = null; removeGhost(); removeDropSlot();
      paintSetup();
      if (seg === 'all' || reclick) closeDayDrawer();   // whole-trip closes any drawer; the stage IS that surface
      else openDayDrawer(seg, b);                        // the four days each slide their editor up
    });
    // §WB drawer chrome: close button, and Escape (capture-phase so the drawer wins over the pawn
    // popover, but never over an open modal — a modal owns its own Escape via the bubbling handler)
    $('dd-close').addEventListener('click', closeDayDrawer);
    // in-drawer day tabs: hop between day drawers without closing; whole-trip / active re-click closes
    $('dd-head').addEventListener('click', function (e) {
      var b = e.target.closest('.dd-tab'); if (!b) return;
      var s2 = b.getAttribute('data-dseg');
      if (s2 === 'all') { daySel = 'all'; placingChip = null; removeGhost(); removeDropSlot(); paintSetup(); closeDayDrawer(); return; }
      if (s2 === daySel && drawerSeg === s2) { closeDayDrawer(); return; }   // spec §3: active-tab re-click closes
      daySel = s2; placingChip = null; removeGhost(); removeDropSlot(); paintSetup();
      openDayDrawer(s2, b);
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape' || !drawerIsOpen()) return;
      if (topModal()) return;                           // a dialog is open → let it own the keypress
      e.stopImmediatePropagation();                     // drawer precedence over the pawn popover
      closeDayDrawer();
    }, true);
    // §W1 receipt rows: Close / Undo / route-to-fishday (the dropdowns are gone)
    $('editors').addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || !b.dataset.det) return;
      if (b.classList.contains('rc-close')) applyReceiptFix(b.dataset.det, true);
      else if (b.classList.contains('rc-undo')) applyReceiptFix(b.dataset.det, false);
      else if (b.classList.contains('rc-route')) openFishdayEditor();   // satchel behavior (openDayDrawer when WB lands, tab-switch fallback)
    });
    // §W1 rail bucket rows are jump-links: a day bucket switches to that day's tab; the frame
    // bucket scrolls to the first still-open receipt row (falling back to the 'all' tab if the
    // current tab filters every frame decision out)
    $('rail-body').addEventListener('click', function (e) {
      var r = e.target.closest('.rail-row'); if (!r || !r.dataset.bucket) return;
      var bk = r.dataset.bucket;
      if (bk === 'frame') {
        expandAllSettings();   // the receipt rows live in the collapsible fallback — open it before scrolling there
        var oc = document.querySelector('#editors .editor-card:not(.closed)');
        if (!oc && daySel !== 'all') {
          daySel = 'all'; placingChip = null; removeGhost(); removeDropSlot(); paintSetup();
          oc = document.querySelector('#editors .editor-card:not(.closed)');
        }
        var tgt = oc || $('editors');
        if (tgt.scrollIntoView) tgt.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' });
        var fb = tgt.querySelector && tgt.querySelector('.rc-close, .rc-route');
        if (fb) { try { fb.focus({ preventScroll: true }); } catch (e2) { fb.focus(); } }
      } else {
        if (bk !== daySel) { daySel = bk; placingChip = null; removeGhost(); removeDropSlot(); paintSetup(); }
        var ds = $('day-select');
        if (ds && ds.scrollIntoView) ds.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' });
      }
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
    $('mission-control').addEventListener('click', function (e) {
      if (e.target.closest('.mc-fill-reserve')) applyReceiptFix('reserve', true);
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
    // Voyage §3: the All-settings buddy fallback — write overrides.buddies, cap-guarded like the tray.
    $('buddy-card').addEventListener('change', function (e) {
      var s = e.target.closest('.buddy-sel'); if (!s) return;
      var gid = s.dataset.guest, pid = s.value;
      if (!pid) { buddyOv[gid] = null; updatePlanUI(); return; }
      var plan = currentPlan();
      if (plan.buddies[gid] !== pid && buddyLoadOf(plan, pid, gid) >= 2) {
        var p = byId(plan.participants, pid); showTrayToast(T().gdRejCap(p ? nm(p.name) : pid));
        buildBuddyCard(); return;                       // revert the <select> to the real state
      }
      buddyOv[gid] = pid; updatePlanUI();
    });
    $('btn-auto').addEventListener('click', function () { for (var k in fixed) fixed[k] = true; fdReset(); mcReset(); paintSetup(); });
    $('btn-clear').addEventListener('click', function () { for (var k in fixed) fixed[k] = false; fdReset(); mcReset(); orgSeatReset(); buddyReset(); paintSetup(); });
    $('launch').addEventListener('click', launch);

    // §2 COMMAND TRAY — three input modes share the select/resolve/reject grammar.
    // click: keyboard activation (detail 0) opens the target picker; a pointer tap is
    // handled by pointerup (tap-tap select); dock objects (strongbox/satchel) act on any click.
    $('cmd-tray').addEventListener('click', function (e) {
      var care = e.target.closest('.tray-care-card');
      if (care) {
        if (traySuppressClick) return;               // a drag already resolved on the stage
        var gid = care.getAttribute('data-guest');
        if (care.classList.contains('assigned')) { unassignBuddy(gid); return; }   // click assigned card -> unassign
        if (e.detail === 0) openPicker({ kind: 'care', guestId: gid });            // keyboard -> modal picker
        return;
      }
      var b = e.target.closest('.tray-obj, .tray-duty'); if (!b) return;
      if (b.classList.contains('dock')) { trayObjAction(b.getAttribute('data-det')); return; }
      if (traySuppressClick) return;                 // a drag already resolved on the stage
      if (e.detail === 0) {                          // keyboard (Enter/Space) -> modal picker
        openPicker(b.classList.contains('tray-duty') ? { kind: 'duty', role: b.getAttribute('data-role') } : { kind: 'obj', det: b.getAttribute('data-det') });
      }
    });
    $('cmd-tray').addEventListener('pointerdown', trayPointerDown);
    document.addEventListener('pointermove', trayPointerMove);
    document.addEventListener('pointerup', trayPointerUp);
    document.addEventListener('pointercancel', function () { if (trayDrag) { if (trayDrag.ghost && trayDrag.ghost.parentNode) trayDrag.ghost.parentNode.removeChild(trayDrag.ghost); trayDrag = null; trayDeselect(); } });
    $('tray-hint-x').addEventListener('click', dismissTrayHint);

    // plan-stage pawn inspection + tap-tap resolution
    (function () {
      var wrap = $('plan-stage-wrap');
      wrap.addEventListener('pointermove', function (e) {
        if ($('setup').classList.contains('hidden') || !PSTG.sim || trayDrag) return;
        var pid = psPawnAt(e.clientX, e.clientY);
        if (pid !== PSTG.hoverPid) { PSTG.hoverPid = pid; wrap.classList.toggle('pawn-hover', !!pid && !traySel); }
      });
      wrap.addEventListener('pointerleave', function () { if (PSTG.hoverPid) { PSTG.hoverPid = null; wrap.classList.remove('pawn-hover'); } });
      wrap.addEventListener('click', function (e) {
        if (traySuppressClick || !PSTG.sim) return;
        if (e.target.closest('.plan-token')) return;   // tokens own their own click (undo)
        var pid = psPawnAt(e.clientX, e.clientY);
        if (traySel) { trayResolve(traySel, pid, true); return; }   // tap-tap: keep armed on a wrong pawn
        if (pid) openPlanPawnCard(pid); else closePawnCard();
      });
      $('plan-tokens').addEventListener('click', function (e) {
        var tk = e.target.closest('.plan-token'); if (tk) undoToken(tk.getAttribute('data-det'));
      });
    })();
    // keyboard: token chips undo; picker rows resolve
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      var el = e.target; if (!el || !el.classList) return;
      if (el.classList.contains('plan-token')) { e.preventDefault(); undoToken(el.getAttribute('data-det')); }
    });
    $('pick-body').addEventListener('click', function (e) {
      var b = e.target.closest('.pick-row'); if (!b || b.disabled || !pickSel) return;
      var sel = pickSel; closePicker(); trayResolve(sel, b.getAttribute('data-pid'), false);
    });
    $('pick-close').addEventListener('click', closePicker);
    $('pick-modal').addEventListener('click', function (e) { if (e.target === $('pick-modal')) closePicker(); });

    // §4 "All settings" collapsible: collapsed by default ≥1180px, expanded below
    if (window.innerWidth >= 1180) { $('all-settings').classList.add('collapsed'); $('all-settings-toggle').setAttribute('aria-expanded', 'false'); }
    $('all-settings-toggle').addEventListener('click', function () {
      var as = $('all-settings'), open = as.classList.toggle('collapsed');
      this.setAttribute('aria-expanded', open ? 'false' : 'true');
    });

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
      if (appMode === 'live' && liveState) { livePausedForFix = false; clearGapFocus(); camReleaseSafe(0); liveFinish(); }   // stay in the live flow
      else finish();
    });
    $('stations').addEventListener('click', function (e) {
      // the shown affordance wins: a pointer click while a pawn is visibly hovered (cursor +
      // name chip) inspects THAT pawn, even when its body overlaps the station hotspot.
      // e.detail > 0 = real pointer click; keyboard activation (detail 0) keeps station priority.
      if (hoverPid && e.detail > 0 && !$('run').classList.contains('hidden')) { openPawnCard(hoverPid); return; }
      var sec = e.target.closest('.sec-hot'); if (sec) { openSectionPanel(sec.getAttribute('data-sec')); return; }
      var st = e.target.closest('.station'); if (st) openProblemPanel(st.id.replace('st-', ''));
    });
    // W3 inspectable cast — hover feeds the canvas name chip; click/tap opens the popover.
    // .station / .sec-hot sit above and keep first claim: only background/pawn targets are ours.
    (function () {
      var map = $('sitemap');
      map.addEventListener('pointermove', function (e) {
        if (!sim || $('run').classList.contains('hidden')) return;
        if (map.classList.contains('cam-hold')) return;   // off-identity camera: screen->world mapping is wrong (§3)
        var pid = pawnAt(e);
        if (pid !== hoverPid) { hoverPid = pid; map.classList.toggle('pawn-hover', !!pid); }
      });
      map.addEventListener('pointerleave', function () { if (hoverPid) { hoverPid = null; map.classList.remove('pawn-hover'); } });
      map.addEventListener('click', function (e) {
        if (!sim) return;
        if (map.classList.contains('cam-hold')) return;   // pawn hit-testing is camera-unaware — hold clicks too (§3)
        if (e.target.closest('.station') || e.target.closest('.sec-hot')) return;   // hotspots keep first claim
        var astro = e.target.closest && e.target.closest('.astro[data-pid]');       // DOM-stage pawn (?dom)
        var pid = astro ? astro.getAttribute('data-pid') : pawnAt(e);               // canvas: hit-test the cache
        if (pid) openPawnCard(pid); else closePawnCard();                           // background click closes
      });
    })();
    // the offscreen a11y roster: each row-button opens the same popover (keyboard path)
    $('stage-roster').addEventListener('click', function (e) {
      var b = e.target.closest('.sr-pawn'); if (b) openPawnCard(b.getAttribute('data-pid'));
    });
    // §S3 report-on-stage: hover feeds the canvas name chip; click inspects a pawn's day;
    // markers keep first claim (they sit above the canvas) and route to their fixing surface
    (function () {
      var wrap = $('report-stage-wrap'); if (!wrap) return;
      wrap.addEventListener('pointermove', function (e) {
        if (!RSTG.sim || $('report').classList.contains('hidden')) return;
        var pid = rsPawnAt(e.clientX, e.clientY);
        if (pid !== RSTG.hoverPid) {
          RSTG.hoverPid = pid; wrap.classList.toggle('pawn-hover', !!pid);
          if (RM.matches && RSTG.ctx) PRS_STAGE.scene(RSTG.ctx, RSTG.sim, 1, rsView(true));   // no loop under RM — repaint the chip
        }
      });
      wrap.addEventListener('pointerleave', function () {
        if (!RSTG.hoverPid) return;
        RSTG.hoverPid = null; wrap.classList.remove('pawn-hover');
        if (RM.matches && RSTG.ctx && RSTG.sim) PRS_STAGE.scene(RSTG.ctx, RSTG.sim, 1, rsView(true));
      });
      wrap.addEventListener('click', function (e) {
        if (!RSTG.sim) return;
        if (e.target.closest('.rs-marker')) return;                       // markers keep first claim
        var pid = rsPawnAt(e.clientX, e.clientY);
        if (pid) openReportPawnCard(pid); else closePawnCard();           // background click closes
      });
      $('rs-markers').addEventListener('click', function (e) {
        var b = e.target.closest('.rs-marker'); if (b) reportMarkerJump(parseInt(b.getAttribute('data-idx'), 10));
      });
      $('rs-roster').addEventListener('click', function (e) {
        var b = e.target.closest('.sr-pawn'); if (b) openReportPawnCard(b.getAttribute('data-pid'));
      });
    })();
    // popover: its own close button; Escape; and click-away (clicks inside #sitemap/#stage-roster
    // are owned by their handlers above, which switch or close the popover themselves)
    $('pawn-card').addEventListener('click', function (e) { if (e.target.closest('#pc-close')) closePawnCard(); });
    // Escape closes the popover only when it is the top layer — an open modal takes the keypress
    // (the §18 top-modal handler below closes it; one Escape must never dismiss two layers)
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && pawnCardOpen() && !topModal()) closePawnCard(); });
    document.addEventListener('pointerdown', function (e) {
      if (!pawnCardOpen()) return;
      if (e.target.closest('#pawn-card') || e.target.closest('#sitemap') || e.target.closest('#stage-roster') || e.target.closest('#plan-stage-panel') || e.target.closest('#report-stage-panel')) return;
      closePawnCard();
    });
    window.addEventListener('resize', function () { if (pawnCardOpen()) { if (!$('setup').classList.contains('hidden') && PSTG.fig[pawnCardPid]) positionPlanPawnCard(pawnCardPid); else if (!$('report').classList.contains('hidden') && RSTG.fig[pawnCardPid]) positionReportPawnCard(pawnCardPid); else positionPawnCard(pawnCardPid); } });
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
      var order = ['rules-modal', 'pick-modal', 'inspect-modal', 'arrow-modal', 'detail-modal'];
      for (var i = 0; i < order.length; i++) if ($(order[i]).classList.contains('show')) return order[i];
      return null;
    }
    document.addEventListener('keydown', function (e) {
      var top = topModal();
      if (e.key === 'Escape') {
        if (top === 'rules-modal') $('rules-modal').classList.remove('show');
        else if (top === 'pick-modal') closePicker();
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
      rszT = setTimeout(function () {
        rszT = null; refitStage();
        // the non-RM plan stage re-fits itself each frame; under RM (no loop) re-fit here
        if (RM.matches && PSTG.ctx && !$('setup').classList.contains('hidden')) { psResize(); psPositionOverlays(); }
        // same for the report stage (its rAF loop self-resizes; RM has no loop)
        if (RM.matches && RSTG.ctx && !$('report').classList.contains('hidden')) rsResize();
      }, 130);
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
  function closeModals() { ['detail-modal', 'inspect-modal', 'arrow-modal', 'rules-modal', 'pick-modal'].forEach(function (m) { var e = $(m); if (e) e.classList.remove('show'); }); closePawnCard(); lastFocus = null; }
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
    // §W4 text diet: the one-line duty moves to a hover/tap reveal (tabindex -> :focus-within on touch;
    // the text stays in the DOM, so screen readers keep reading it either way)
    return '<div class="castcard" style="--rc:' + r.color + '" tabindex="0">' +
      '<div class="ipawn"><div class="astro" style="--rc:' + r.color + '"><div class="fig"><span class="sh"></span>' +
        '<div class="pw"><span class="lg l"></span><span class="lg r"></span><span class="tr"></span><span class="hd"></span><span class="hat"></span></div></div></div></div>' +
      '<div class="cc-name">' + primary + (alt && alt !== primary ? '<span class="cc-alt">' + alt + '</span>' : '') + '</div>' +
      '<div class="cc-role"><i>' + r.icon + '</i>' + nm(r.name) + '</div>' +
      '<div class="cc-duty">' + (t['duty_' + p.roleId] || '') + '</div>' +
    '</div>';
  }
  function renderIntro() {
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
  // auto === true (first load only) autoplays the vignette; the Cast-button reopen
  // gets a Replay ▶ poster instead (spec §5 returning-player behavior)
  function showIntro(auto) {
    if (timer) { clearInterval(timer); timer = null; }
    stopAnim(); closeModals();
    renderIntro();
    enterScreen('intro');
    if (auto !== true) vigLastFinal = false;   // a fresh cast-reopen offers the beat-1 poster
    bootVignette(auto === true);
    if (window.scrollTo) window.scrollTo(0, 0);
    var s = $('intro-start'); if (s) s.focus();
  }
  function startFromIntro() { killVignette(); markIntroSeen(); $('intro').classList.add('hidden'); enterMode('live'); }

  // =========================================================================
  // §W4 COLD-OPEN VIGNETTE — a ~15s scripted, deterministic mini-run on the
  // real stage renderer (spec §5), inside the intro hero. It drives its OWN
  // P.createSim (the Live config: classic fixes sound, arrows gappy, seed 1)
  // with a DEDICATED rAF loop and draws via PRS_STAGE.scene onto its own
  // canvas — it never reads or writes the shared anim/sim/fixed/dayOv state.
  // Beats: walk-in (caption 1) → the seed's first info gap freezes the
  // consuming pawn ❓ (caption 2 + glowing "hand him the card" prompt,
  // auto-fires after ~4s) → a real handoff edit on the vignette's own cfg
  // (the same overrides.handoffs merge shape Live's commitChannel writes),
  // gold motes fly, the mini rail row flips red→green with a +N float
  // (caption 3) → hold, Start ▶ pulses.
  // LIFECYCLE (the §18 rAF-leak class): ONE module-scoped handle
  // {raf, sim, cv}; killVignette() runs on Start, Skip, enterMode and
  // applyLang (which re-boots); boot always kills any prior instance; the
  // loop self-kills if #run ever becomes visible. Canvas + loop are
  // destroyed, never hidden. Reduced motion: three static captioned stills
  // via one-shot scene() calls — no loop at all.
  // =========================================================================
  var VIG = { raf: null, sim: null, cv: null, ctx: null, host: null, prompt: null,
    fig: {}, motes: [], boat: null, cfg: null, plan: null, trip1: null, trip2: null,
    gap: null, gapPid: null, gapState: null, gapTint: null,
    phase: '', last: 0, lastTick: 0, ticks: 0, promptAt: 0, fixAt: 0, holdMin: 0,
    w: 0, h: 0, sc: 1 };
  var vigLastAuto = true;              // last boot mode, so a language switch re-boots into the same face
  var vigLastFinal = false;            // which poster face a non-autoplay boot restores (skip = the final one)

  // the Live config, scoped to the vignette (startLive's fixed[] pattern: every
  // classic fix true, fixHandoffs false) — never touches the player's `fixed`/dayOv
  function vigCfg() {
    var cfg = { seed: 1, overrides: {} };
    DETS.forEach(function (d) { if (DET_FIX[d] !== 'fixHandoffs') cfg = P.applyFix(cfg, DET_FIX[d]); });
    return cfg;
  }
  // nextLiveGap's ordering logic against an explicit plan (no liveState involved)
  function vigGaps(plan) {
    var fd = P.fishdaySchedule(plan), out = [];
    fd.missing.forEach(function (m) { out.push({ taskId: m.taskId, cardId: m.cardId, kind: 'missing' }); });
    fd.late.forEach(function (l) { out.push({ taskId: l.taskId, cardId: l.cardId, kind: 'late' }); });
    out.forEach(function (g) { var t = byId(plan.tasks, g.taskId); g.startMin = t ? t.startMin : 9999; });
    out.sort(function (a, b) { return a.startMin - b.startMin; });
    return out;
  }
  function vigBuildData() {
    VIG.cfg = vigCfg(); VIG.plan = P.mergePlan(VIG.cfg);
    VIG.trip1 = P.scoreTrip(VIG.plan); VIG.trip2 = null;
    VIG.gap = vigGaps(VIG.plan)[0] || null;
    VIG.gapPid = null; VIG.gapState = null; VIG.gapTint = null;
    if (VIG.gap) {
      var to = byId(VIG.plan.tasks, VIG.gap.taskId);
      if (to) {
        VIG.gapPid = (to.assignedIds || [])[0] || null;
        if (VIG.gapPid) VIG.gapState = { pid: VIG.gapPid, state: gapKindState(VIG.gap, to) };
        VIG.gapTint = {}; VIG.gapTint[to.station] = 'red';
      }
    }
  }
  // "hand him the card": commit face-to-face handoffs for EVERY open card of the frozen
  // task (one gesture must truly unfreeze the pawn), through the same overrides.handoffs
  // shape commitChannel writes — but into the vignette's own cfg only
  function vigApplyFix() {
    var plan = VIG.plan, to = byId(plan.tasks, VIG.gap.taskId), handed = [];
    if (!to) return handed;
    var all = vigGaps(plan).filter(function (g) { return g.taskId === VIG.gap.taskId; });
    var o = VIG.cfg.overrides; o.handoffs = o.handoffs || {};
    all.forEach(function (g) {
      var from = producerOf(plan, g.cardId); if (!from) return;
      var trig = { type: 'onTaskDone', taskId: from.id };
      if (g.kind === 'late') {
        var ex = plan.handoffs.filter(function (h) { return h.cardId === g.cardId && h.toRoleId === to.ownerRoleId; })[0];
        if (ex) o.handoffs[ex.id] = Object.assign({}, ex, { channel: 'faceToFace', trigger: trig });
      } else {
        var assume = (to.assumeOn || []).indexOf(g.cardId) >= 0;
        o.handoffs['hvig_' + g.cardId + '_' + to.ownerRoleId] = { cardId: g.cardId, fromRoleId: from.ownerRoleId, fromTaskId: from.id, toRoleId: to.ownerRoleId, toTaskId: to.id, trigger: trig, channel: 'faceToFace', ifLate: assume ? 'assume' : 'idle', reworkKind: assume ? 'wrongFish' : null, content: { en: '', jp: '' } };
      }
      handed.push({ fromPid: (from.assignedIds || [])[0] || null, fromSt: from.station, toSt: to.station });
    });
    return handed;
  }
  // fan-stacked px targets per duty-holder (figTargets' rule, on the vignette's own dims)
  function vigTargets(s) {
    var pos = {}, bucket = {};
    s.stations.forEach(function (st) { bucket[st.id] = []; });
    s.participants.forEach(function (p) { if (bucket[p.station]) bucket[p.station].push(p); });
    var colGap = 23 * FIGK * VIG.sc, rowGap = 24 * FIGK * VIG.sc, feet = 36 * VIG.sc;   // fan tracks sprite-era pawn size
    s.stations.forEach(function (st) {
      var sd = P.station(st.id), n = bucket[st.id].length;
      bucket[st.id].forEach(function (p, i) {
        var col = i % 4, row = Math.floor(i / 4), rowN = Math.min(4, n - row * 4);
        pos[p.id] = { x: sd.x * VIG.w + (col - (rowN - 1) / 2) * colGap, y: sd.y * VIG.h + feet + row * rowGap };
      });
    });
    return pos;
  }
  function vigSyncFigs(snap) {
    var pos = vigTargets(VIG.sim);
    VIG.sim.participants.forEach(function (p) {
      var t2 = pos[p.id]; if (!t2) return;
      var f = VIG.fig[p.id];
      if (!f) f = VIG.fig[p.id] = { pid: p.id, cx: t2.x, cy: t2.y, tx: t2.x, ty: t2.y, walking: false, faceL: false, spdMul: figSpeedMul(p.id) };
      f.tx = t2.x; f.ty = t2.y;
      if (snap) { f.cx = t2.x; f.cy = t2.y; f.walking = false; }
    });
  }
  function vigWalk(dt) {
    var speed = Math.max(70, VIG.w * 0.16);
    for (var pid in VIG.fig) {
      var f = VIG.fig[pid], dx = f.tx - f.cx, dy = f.ty - f.cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1.2) { f.cx = f.tx; f.cy = f.ty; f.walking = false; continue; }
      var stp = speed * f.spdMul * dt; if (stp > d) stp = d;
      f.cx += dx / d * stp; f.cy += dy / d * stp;
      f.walking = true; if (Math.abs(dx) > 2) f.faceL = dx < 0;
    }
  }
  // the hand-built per-frame view bundle PRS_STAGE.scene needs (mirrors frame()'s stageView,
  // minus everything the vignette doesn't stage: guests, wakes, cascade, hub hotspots)
  function vigView(rm, showFreeze) {
    return { w: VIG.w, h: VIG.h, scale: VIG.sc, lang: L, rm: !!rm,
      night: VIG.sim.mode === 'minute' && (VIG.sim.clockMin < 330 || VIG.sim.clockMin >= 1110),
      speedMult: 1, guestsVisible: false, hoverPid: null,
      spotlightPid: showFreeze ? VIG.gapPid : null,
      tintMap: showFreeze ? VIG.gapTint : null,
      gapState: showFreeze ? VIG.gapState : null,
      fig: VIG.fig, guest: {}, boat: VIG.boat, wakes: [],
      motes: VIG.motes, cascade: { hops: [], has: false },
      ghost: [{}, {}, {}], trail: [], chain: [], hotPts: [],
      cam: rm ? null : VIG.cam,          // §3: dawn drift + freeze-beat punch-in (self-contained, via view.cam)
      frozen: !!showFreeze };
  }
  // §3 vignette camera: a slow lateral dawn drift throughout, punching in on the gap pawn at the
  // freeze beat. Self-contained (its own eased state on VIG) so it never touches the shared module
  // CAM — the intro canvas is independent of the run stage. Reduced motion = no camera.
  function vigCam(showFreeze) {
    if (RM.matches) { VIG.camZ = null; return null; }
    var w = VIG.w, h = VIG.h, tx, ty, tz, f;
    if (showFreeze && VIG.gapPid && (f = VIG.fig[VIG.gapPid])) { tx = f.cx; ty = f.cy; tz = 1.34; }
    else { var drift = Math.sin((VIG.last || 0) / 1000 * 0.17); tx = w * (0.5 + 0.055 * drift); ty = h * 0.46; tz = 1.08; }
    if (VIG.camZ == null) { VIG.camX = tx; VIG.camY = ty; VIG.camZ = tz; }
    else { var k = 1 - Math.exp(-3.6 * (VIG._dt || 0.016)); VIG.camX += (tx - VIG.camX) * k; VIG.camY += (ty - VIG.camY) * k; VIG.camZ += (tz - VIG.camZ) * k; }
    return Math.abs(VIG.camZ - 1) < 0.002 ? null : { x: VIG.camX, y: VIG.camY, zoom: VIG.camZ };
  }
  function vigTickOnce() {   // Live ignores the fixed checkpoints — so does the vignette
    if (VIG.sim.paused) { VIG.sim.paused = false; VIG.sim.checkpoint = null; }
    P.tick(VIG.sim);
  }
  function vigCaption(n) {
    var c = $('vig-caption'); if (!c) return;
    c.textContent = T()['vg' + n] || '';
    if (!RM.matches) { c.classList.remove('capin'); void c.offsetWidth; c.classList.add('capin'); }
  }
  // the MINI rail row in the caption strip: the Fishing-Day bucket, red while short,
  // flipping green (+N float) when the card is handed — same ledger currency as the real rail
  function vigRailRow(ok, withFloat) {
    var el = $('vig-rail'); if (!el) return;
    var t = T(), trip = ok ? VIG.trip2 : VIG.trip1; if (!trip) return;
    var b = trip.byBucket.fishday || { earned: 0, maxPts: 0 };
    el.classList.remove('hidden');
    el.innerHTML = '<div class="vig-row ' + (ok ? 'ok' : 'short') + '"><span class="rail-nm">' + t.sb_fishday + '</span><span class="rail-pts">' + b.earned + ' / ' + b.maxPts + '</span></div>';
    if (ok && withFloat && VIG.trip1) floatDelta(el, '+' + (VIG.trip2.total - VIG.trip1.total));
  }
  function vigMount(host) {
    host.innerHTML = '';
    var w = host.clientWidth || 820, h = Math.max(240, Math.min(430, Math.round(w * 0.5)));
    VIG.host = host; VIG.w = w; VIG.h = h;
    VIG.sc = clamp(Math.min(w / 1000, h / 560), 0.6, 1.2);
    VIG.boat = { cx: DOCK.x * w, cy: DOCK.y * h };
    var cv = document.createElement('canvas'); cv.id = 'vig-canvas';
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', T().vgAria);
    host.appendChild(cv);
    VIG.cv = cv; VIG.ctx = PRS_STAGE.initStage(cv, { w: w, h: h });
    var pr = document.createElement('button'); pr.type = 'button';
    pr.className = 'btn primary glow vig-prompt hidden'; pr.id = 'vig-prompt';
    pr.textContent = T().vgPrompt;
    pr.addEventListener('click', function () { vigFix(VIG.last || 0); });
    host.appendChild(pr);
    VIG.prompt = pr;
  }
  function vigStart() {
    var host = $('vig-stage'); if (!host) return;
    vigBuildData();
    VIG.sim = P.createSim({ seed: 1, overrides: VIG.cfg.overrides }, 'fishday');
    vigMount(host);
    VIG.fig = {}; VIG.motes = [];
    vigSyncFigs(true);                       // everyone starts on their pre-dawn station and walks out from there
    vigCaption(1);
    VIG.phase = 'walk'; VIG.last = 0; VIG.lastTick = 0; VIG.ticks = 0;
    VIG.raf = requestAnimationFrame(vigFrame);
  }
  function vigFrame(ts) {
    if (!VIG.raf) return;
    VIG.raf = requestAnimationFrame(vigFrame);
    // hard lifecycle guards: the vignette never runs while #run is visible, and dies with the intro
    if ($('intro').classList.contains('hidden') || !$('run').classList.contains('hidden')) { killVignette(); return; }
    if (!VIG.last) { VIG.last = ts; VIG.lastTick = ts; }
    var dt = Math.min(0.1, (ts - VIG.last) / 1000); VIG.last = ts; VIG._dt = dt;
    if (VIG.host && VIG.host.clientWidth && Math.abs(VIG.host.clientWidth - VIG.w) > 4) vigResize();
    if (VIG.phase === 'walk') {
      // beat 1 speed ramp: two slow establishing ticks, then brisk — the freeze lands ~4s in
      var due = VIG.ticks < 2 ? 620 : 260;
      if (ts - VIG.lastTick >= due) {
        VIG.lastTick = ts; VIG.ticks++;
        vigTickOnce();
        if (VIG.gap && (VIG.sim.clockMin || 0) >= VIG.gap.startMin - 0.001) VIG.phase = 'freezing';
        else if (!VIG.gap && (VIG.sim.clockMin || 0) >= 420) vigHold();   // defensive: gap-free seed -> just hold
      }
    } else if (VIG.phase === 'freezing') {
      // beat 2 waits for the consuming pawn to actually reach the gap station before freezing
      var ff = VIG.gapPid && VIG.fig[VIG.gapPid];
      if (!ff || !ff.walking) {
        VIG.phase = 'frozen'; VIG.promptAt = ts;
        vigCaption(2); vigRailRow(false, false);
        if (VIG.prompt) VIG.prompt.classList.remove('hidden');
      }
    } else if (VIG.phase === 'frozen') {
      if (ts - VIG.promptAt > 4000) vigFix(ts);         // auto-advance if the player never clicks
    } else if (VIG.phase === 'handoff') {
      for (var mi = 0; mi < VIG.motes.length; mi++) { var m = VIG.motes[mi]; if (m.state === 0 && ts >= m.armAt) { m.state = 1; m.t0 = ts; } }
      if (ts - VIG.fixAt > 1250) {                       // motes landed -> unfreeze, flip the rail, caption 3
        VIG.phase = 'resume'; VIG.lastTick = ts;
        VIG.holdMin = (VIG.sim.clockMin || 0) + 25;      // stop just before the seed's NEXT gap bites
        vigCaption(3); vigRailRow(true, true);
      }
    } else if (VIG.phase === 'resume') {
      if (ts - VIG.lastTick >= 420) {
        VIG.lastTick = ts;
        vigTickOnce();
        if ((VIG.sim.clockMin || 0) >= VIG.holdMin) vigHold();
      }
    }
    vigSyncFigs(false);
    vigWalk(dt);
    var showFreeze = VIG.phase === 'freezing' || VIG.phase === 'frozen' || VIG.phase === 'handoff';
    VIG.cam = vigCam(showFreeze);          // §3: eased dawn drift / freeze-beat punch-in for this frame
    if (VIG.prompt && !VIG.prompt.classList.contains('hidden') && VIG.gapPid) {
      var fp = VIG.fig[VIG.gapPid];
      if (fp) {
        // the prompt is a DOM overlay in canvas coords — project it through the camera so it tracks the zoomed pawn
        var px = fp.cx, py = fp.cy - 66 * VIG.sc, c = VIG.cam;
        if (c) { px = c.x + (fp.cx - c.x) * c.zoom; py = c.y + (fp.cy - 66 * VIG.sc - c.y) * c.zoom; }
        VIG.prompt.style.left = Math.round(px) + 'px'; VIG.prompt.style.top = Math.round(py) + 'px';
      }
    }
    PRS_STAGE.scene(VIG.ctx, VIG.sim, ts / 1000, vigView(false, showFreeze));
  }
  // beat 3: apply the REAL handoff edit (vignette-scoped cfg), rebuild + fast-forward the sim
  // to the current minute (commitChannel's pattern), and fly gold motes producer→consumer
  function vigFix(ts) {
    if (VIG.phase !== 'frozen' && VIG.phase !== 'freezing') return;
    var handed = vigApplyFix();
    var now = VIG.sim.clockMin || 0;
    VIG.plan = P.mergePlan(VIG.cfg);
    VIG.trip2 = P.scoreTrip(VIG.plan);
    VIG.sim = P.createSim({ seed: 1, overrides: VIG.cfg.overrides }, 'fishday');
    var guard = 0;
    while ((VIG.sim.clockMin || 0) < now && !VIG.sim.finished && guard++ < 400) vigTickOnce();
    var toF = VIG.gapPid && VIG.fig[VIG.gapPid];
    VIG.motes = [];
    for (var i = 0; i < handed.length; i++) {
      var fromF = handed[i].fromPid && VIG.fig[handed[i].fromPid];
      var fs = P.station(handed[i].fromSt), tn = P.station(handed[i].toSt);
      VIG.motes.push({ state: i === 0 ? 1 : 0, t0: ts, armAt: ts + i * 300, late: false, noPing: false,
        ax: fromF ? fromF.cx / VIG.w : fs.x, ay: fromF ? (fromF.cy - 20 * VIG.sc) / VIG.h : fs.y,
        bx: toF ? toF.cx / VIG.w : tn.x, by: toF ? (toF.cy - 20 * VIG.sc) / VIG.h : tn.y,
        toSt: handed[i].toSt, dur: 1000 });
    }
    VIG.fixAt = ts; VIG.phase = 'handoff';
    if (VIG.prompt) VIG.prompt.classList.add('hidden');
  }
  function vigHold() {
    VIG.phase = 'hold';                                   // ambience keeps breathing; the clock rests
    var st = $('intro-start'); if (st && !RM.matches) st.classList.add('vig-pulse');
  }
  function vigResize() {
    var host = VIG.host; if (!host || !VIG.cv) return;
    var w = host.clientWidth || VIG.w, h = Math.max(240, Math.min(430, Math.round(w * 0.5)));
    var sx = VIG.w ? w / VIG.w : 1, sy = VIG.h ? h / VIG.h : 1;
    VIG.w = w; VIG.h = h; VIG.sc = clamp(Math.min(w / 1000, h / 560), 0.6, 1.2);
    VIG.boat = { cx: DOCK.x * w, cy: DOCK.y * h };
    PRS_STAGE.initStage(VIG.cv, { w: w, h: h });
    for (var pid in VIG.fig) { var f = VIG.fig[pid]; f.cx *= sx; f.cy *= sy; f.tx *= sx; f.ty *= sy; }
  }
  // one-shot still of a beat: 1 = walk-in settled (pre-gap) · 2 = frozen ❓ · 3 = fixed & moving.
  // Beat 3 WRITES the fix into VIG.cfg (call it last).
  function vigStillSim(beat) {
    var trip2 = null;
    if (beat === 3 && VIG.gap) { vigApplyFix(); VIG.plan = P.mergePlan(VIG.cfg); trip2 = P.scoreTrip(VIG.plan); }
    var sim = P.createSim({ seed: 1, overrides: VIG.cfg.overrides }, 'fishday');
    var base = VIG.gap ? VIG.gap.startMin : 300;
    var upTo = beat === 1 ? base - 15 : beat === 2 ? base : base + 25;
    var guard = 0;
    while ((sim.clockMin || 0) < upTo && !sim.finished && guard++ < 400) { if (sim.paused) { sim.paused = false; sim.checkpoint = null; } P.tick(sim); }
    return { sim: sim, trip2: trip2 };
  }
  // reduced motion: three static captioned frames, one-shot scene() calls, NO loop
  function vigStills() {
    var host = $('vig-stage'); if (!host) return;
    VIG.host = host; host.innerHTML = ''; host.classList.add('stills');
    vigBuildData();
    var t = T(), wrap = document.createElement('div'); wrap.className = 'vig-stills';
    host.appendChild(wrap);
    for (var b = 1; b <= 3; b++) {
      var cell = document.createElement('div'); cell.className = 'vig-still';
      var cv = document.createElement('canvas');
      cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', t.vgAria);
      var cap = document.createElement('div'); cap.className = 'vig-still-cap'; cap.textContent = t['vg' + b] || '';
      cell.appendChild(cv); cell.appendChild(cap); wrap.appendChild(cell);
      var w = Math.max(180, cell.clientWidth || 260), h = Math.max(140, Math.round(w * 0.62));
      var ctx = PRS_STAGE.initStage(cv, { w: w, h: h });
      var still = vigStillSim(b);
      VIG.sim = still.sim; VIG.w = w; VIG.h = h;
      VIG.sc = clamp(Math.min(w / 1000, h / 560), 0.45, 1);
      VIG.boat = { cx: DOCK.x * w, cy: DOCK.y * h };
      VIG.fig = {}; vigSyncFigs(true);
      PRS_STAGE.scene(ctx, still.sim, 1, vigView(true, b === 2));
    }
    VIG.sim = null;                                       // nothing live to keep — stills are done
  }
  // static poster + Replay ▶: final=true (Skip) shows the fixed end-state + caption 3;
  // final=false (Cast-button reopen) shows the beat-1 harbor + caption 1
  function vigPoster(final) {
    var host = $('vig-stage'); if (!host) return;
    vigBuildData();
    var still = vigStillSim(final ? 3 : 1);
    vigMount(host);
    VIG.sim = still.sim;
    VIG.fig = {}; VIG.motes = [];
    vigSyncFigs(true);
    vigCaption(final ? 3 : 1);
    if (final && still.trip2) { VIG.trip2 = still.trip2; vigRailRow(true, false); }
    PRS_STAGE.scene(VIG.ctx, VIG.sim, 1, vigView(true, false));
    VIG.phase = 'poster';
    var rp = document.createElement('button'); rp.type = 'button';
    rp.className = 'btn primary vig-replay'; rp.id = 'vig-replay';
    rp.textContent = T().vgReplay;
    rp.addEventListener('click', function () { bootVignette(true); });   // full boot: re-shows Skip + sets the re-boot mode
    host.appendChild(rp);
  }
  function vigSkip() {
    if ($('intro').classList.contains('hidden')) return;
    vigLastAuto = false;   // a skipped vignette must re-boot as the poster (e.g. on language switch), never re-autoplay
    vigLastFinal = true;   // ...and as the FINAL poster face, matching what skip showed
    killVignette();
    if (RM.matches) { vigStills(); return; }              // nothing to skip under RM — re-render the stills
    vigPoster(true);
    var sk = $('vig-skip'); if (sk) sk.classList.add('hidden');   // a poster has nothing left to skip (Replay re-shows it)
  }
  function bootVignette(autoplay) {
    killVignette();
    if (!window.PRS_STAGE || !$('vig-stage')) return;
    if ($('intro').classList.contains('hidden')) return;
    if (!$('run').classList.contains('hidden')) return;   // never while the run stage is visible
    vigLastAuto = !!autoplay;
    var sk = $('vig-skip'); if (sk) sk.classList.toggle('hidden', RM.matches || !autoplay);
    if (RM.matches) { vigStills(); return; }
    if (!autoplay) { vigPoster(vigLastFinal); return; }
    vigStart();
  }
  function killVignette() {
    if (VIG.raf) cancelAnimationFrame(VIG.raf);
    VIG.raf = null; VIG.sim = null; VIG.cv = null; VIG.ctx = null; VIG.prompt = null;
    VIG.fig = {}; VIG.motes = []; VIG.boat = null;
    VIG.cfg = null; VIG.plan = null; VIG.trip1 = null; VIG.trip2 = null;
    VIG.gap = null; VIG.gapPid = null; VIG.gapState = null; VIG.gapTint = null;
    VIG.phase = ''; VIG.last = 0; VIG.lastTick = 0; VIG.ticks = 0;
    var vs = $('vig-stage'); if (vs) { vs.innerHTML = ''; vs.classList.remove('stills'); }  // destroyed, not hidden
    var st = $('intro-start'); if (st) st.classList.remove('vig-pulse');
    var vr = $('vig-rail'); if (vr) { vr.classList.add('hidden'); vr.innerHTML = ''; }
    var vc = $('vig-caption'); if (vc) { vc.textContent = ''; vc.classList.remove('capin'); }
    VIG.host = null;
  }

  // =========================================================================
  // §1/§2 PLAN STAGE + COMMAND TRAY — setup becomes stage-first (plan WA).
  // The setup screen opens on the pre-dawn harbor: a static fishday minute-sim
  // held at 04:00 (never ticked -> indigo sky, calm, no gap tints), the 11
  // duty-holders standing at their role-home stations with the Phase-1 idle
  // gestures, drawn by PRS_STAGE.scene onto its OWN canvas via a local rAF —
  // the exact vignette pattern (one handle, killed on every screen exit, RM =
  // one static frame). Docked along the bottom is the COMMAND TRAY: one draggable
  // object per unresolved frame decision (+ the 8 duty chips). The tray is a pure
  // VIEW of fixed[]/orgOv — placing/undoing writes the SAME applyReceiptFix / seat
  // paths the receipt-row fallback uses, so tray, tokens, receipt rows and rail
  // always agree. Three input modes ship together (drag / tap-tap / keyboard
  // picker). Pawns are never draggable; you only ever hand things to people.
  // =========================================================================
  var PSTG = { raf: null, sim: null, cv: null, ctx: null, host: null, fig: {}, boat: null,
    w: 0, h: 0, sc: 1, last: 0, hoverPid: null };
  // Hand-tuned per-role podium positions (normalized) so the 11 pawns spread into
  // distinct, targetable spots — command/finance/clinic are hidden stations folded
  // onto Hinata's single coord, so a station-home map would pile 8 pawns on one point,
  // and an un-ticked sim parks every idle holder at lodging. roleId is re-derived from
  // seats by mergePlan, so a duty swap glides the pawn to the new role's spot.
  var PS_POS = {
    comms:      { x: 0.20, y: 0.32 }, owner:     { x: 0.33, y: 0.28 }, pm:         { x: 0.30, y: 0.46 },
    budgetLead: { x: 0.13, y: 0.52 }, safetyLead:{ x: 0.19, y: 0.68 }, chef:       { x: 0.42, y: 0.34 },
    logi:       { x: 0.50, y: 0.50 }, specialist:{ x: 0.495, y: 0.70 }, siteLead:  { x: 0.80, y: 0.66 }
    // specialist casts from the waterline (was 0.60/0.62 — open water); siteLead stands at his boat
  };
  var SEAT_ROLES = ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'specialist'];
  // the tray catalog (spec §2 order). drag:false objects dock but open a panel/drawer instead.
  var TRAY_OBJ = [
    { det: 'safety',        ic: '🚩', key: 'objFlag',      drag: true },
    { det: 'budgetAuth',    ic: '🖃', key: 'objSeal',      drag: true },
    { det: 'info',          ic: '🎫', key: 'objFerry',     drag: true },
    { det: 'report',        ic: '🏥', key: 'objRoute',     drag: true },
    { det: 'fatigue',       ic: '⚖',  key: 'objRelief',    drag: true },
    { det: 'returnLogi',    ic: '📦', key: 'objParcel',    drag: true },
    { det: 'reserve',       ic: '💴', key: 'objStrongbox', drag: false, opens: 'finance' },
    { det: 'handoffTiming', ic: '🎣', key: 'objSatchel',   drag: false, opens: 'fishday' }
  ];
  var TRAY_OBJ_BY_DET = {}; TRAY_OBJ.forEach(function (o) { TRAY_OBJ_BY_DET[o.det] = o; });
  // static single-role targets; 'info' (ferry) is read from the engine fix (ferryTargetRoles)
  var TRAY_TARGET_ROLE = { safety: ['safetyLead'], budgetAuth: ['budgetLead'], report: ['safetyLead'],
    fatigue: ['siteLead'], returnLogi: ['logi'] };
  var traySel = null;        // {kind:'obj'|'duty', det?, role?} currently lifted (drag) or selected (tap-tap)
  var trayDrag = null;       // in-flight pointer drag state
  var traySuppressClick = false;   // a drag that ended on the stage must not also fire a stage click
  var tokenAnchor = {};      // cosmetic det->pid: which valid pawn a token rests on (truth stays fixed[])
  var _ferryTargets = null;

  // the recipient roles the shareInfo fix ACTUALLY adds to ic_ferry (read from the engine, no hardcode)
  function ferryTargetRoles() {
    if (_ferryTargets) return _ferryTargets;
    var base = P.mergePlan({ seed: 1, overrides: {} });
    var withFix = P.mergePlan(P.applyFix({ seed: 1, overrides: {} }, 'shareInfo'));
    var b = byId(base.infoCards, 'ic_ferry'), w = byId(withFix.infoCards, 'ic_ferry');
    var have = {}; (b ? b.recipientRoleIds : []).forEach(function (r) { have[r] = 1; });
    _ferryTargets = (w ? w.recipientRoleIds : []).filter(function (r) { return have[r] !== 1; });
    return _ferryTargets;
  }
  function targetRolesFor(det) { return det === 'info' ? ferryTargetRoles() : (TRAY_TARGET_ROLE[det] || []); }
  function targetPidsFor(det) {
    var roles = targetRolesFor(det), out = [];
    if (!PSTG.sim) return out;
    PSTG.sim.participants.forEach(function (p) { if (roles.indexOf(p.roleId) >= 0) out.push(p.id); });
    return out;
  }
  // where a placed token rests: the remembered drop pawn if still valid, else the canonical holder
  function tokenPidFor(det) {
    var valid = targetPidsFor(det);
    if (tokenAnchor[det] && valid.indexOf(tokenAnchor[det]) >= 0) return tokenAnchor[det];
    return valid[0] || null;
  }

  // ---- the plan stage (pre-dawn harbor) ----
  // positions are grouped by ROLE (not station): everyone solo at their podium, the
  // 3 chefs fanned horizontally around theirs. Halos/tokens map role -> pawn the same way.
  function psTargets(s) {
    var pos = {}, byRole = {};
    s.participants.forEach(function (p) { (byRole[p.roleId] = byRole[p.roleId] || []).push(p); });
    var colGap = 27 * FIGK * PSTG.sc, feet = 30 * PSTG.sc;   // fan tracks sprite-era pawn size
    for (var rid in byRole) {
      var a = PS_POS[rid] || { x: 0.5, y: 0.5 }, arr = byRole[rid], n = arr.length;
      arr.forEach(function (p, i) { pos[p.id] = { x: a.x * PSTG.w + (i - (n - 1) / 2) * colGap, y: a.y * PSTG.h + feet }; });
    }
    return pos;
  }
  function psSyncFigs(snap) {
    if (!PSTG.sim) return;
    var pos = psTargets(PSTG.sim);
    PSTG.sim.participants.forEach(function (p) {
      var t2 = pos[p.id]; if (!t2) return;
      var f = PSTG.fig[p.id];
      if (!f) f = PSTG.fig[p.id] = { pid: p.id, cx: t2.x, cy: t2.y, tx: t2.x, ty: t2.y, walking: false, faceL: false, spdMul: figSpeedMul(p.id) };
      f.tx = t2.x; f.ty = t2.y;
      if (snap) { f.cx = t2.x; f.cy = t2.y; f.walking = false; }
    });
  }
  function psWalk(dt) {
    var speed = Math.max(60, PSTG.w * 0.14);
    for (var pid in PSTG.fig) {
      var f = PSTG.fig[pid], dx = f.tx - f.cx, dy = f.ty - f.cy, d = Math.sqrt(dx * dx + dy * dy);
      if (d < 1.2) { f.cx = f.tx; f.cy = f.ty; f.walking = false; continue; }
      var stp = speed * f.spdMul * dt; if (stp > d) stp = d;
      f.cx += dx / d * stp; f.cy += dy / d * stp;
      f.walking = true; if (Math.abs(dx) > 2) f.faceL = dx < 0;
    }
  }
  function psView(rm) {
    return { w: PSTG.w, h: PSTG.h, scale: PSTG.sc, lang: L, rm: !!rm,
      night: true, speedMult: 1, guestsVisible: false, hoverPid: PSTG.hoverPid,
      spotlightPid: null, tintMap: null, gapState: null,
      fig: PSTG.fig, guest: {}, boat: PSTG.boat, wakes: [],
      motes: [], cascade: { hops: [], has: false },
      ghost: [{}, {}, {}], trail: [], chain: [], hotPts: [], frozen: false };
  }
  function psDims() {
    var host = $('plan-stage-wrap');
    var w = (host && host.clientWidth) || 900;
    var h = (host && host.clientHeight) || 380;
    return { w: w, h: h };
  }
  function psBuildSim() {
    // a fresh fishday sim sits at 04:00 (never ticked): indigo pre-dawn sky, all tasks
    // pending (no gap tints), everyone idle. Positions come from psTargets (role podiums).
    PSTG.sim = P.createSim({ seed: 1, overrides: buildCfg().overrides }, 'fishday');
  }
  function bootPlanStage() {
    killPlanStage();
    if (!window.PRS_STAGE || $('setup').classList.contains('hidden')) return;
    var cv = $('plan-stage'), host = $('plan-stage-wrap'); if (!cv || !host) return;
    var d = psDims();
    PSTG.host = host; PSTG.cv = cv; PSTG.w = d.w; PSTG.h = d.h;
    PSTG.sc = clamp(Math.min(d.w / 1000, d.h / 520), 0.6, 1.25);
    PSTG.boat = { cx: DOCK.x * d.w, cy: DOCK.y * d.h };
    cv.setAttribute('aria-label', T().planStageAria);
    PSTG.ctx = PRS_STAGE.initStage(cv, { w: d.w, h: d.h });
    psBuildSim();
    PSTG.fig = {}; psSyncFigs(true);
    $('plan-chip').textContent = T().planChip;
    renderTray();
    if (RM.matches) { PRS_STAGE.scene(PSTG.ctx, PSTG.sim, 1, psView(true)); psPositionOverlays(); return; }
    PSTG.last = 0; PSTG.raf = requestAnimationFrame(psFrame);
  }
  function killPlanStage() {
    if (PSTG.raf) cancelAnimationFrame(PSTG.raf);
    PSTG.raf = null; PSTG.sim = null; PSTG.ctx = null; PSTG.fig = {}; PSTG.boat = null;
    PSTG.host = null; PSTG.cv = null; PSTG.hoverPid = null; PSTG.last = 0;
    trayDeselect();
    var pt = $('plan-tokens'); if (pt) pt.innerHTML = '';
    var ph = $('plan-halos'); if (ph) ph.innerHTML = '';
    var w = $('plan-stage-wrap'); if (w) w.classList.remove('pawn-hover');
  }
  function psFrame(ts) {
    if (!PSTG.raf) return;
    PSTG.raf = requestAnimationFrame(psFrame);
    if ($('setup').classList.contains('hidden') || !PSTG.sim) { killPlanStage(); return; }
    if (!PSTG.last) PSTG.last = ts;
    var dt = Math.min(0.1, (ts - PSTG.last) / 1000); PSTG.last = ts;
    var host = $('plan-stage-wrap');
    if (host && host.clientWidth && Math.abs(host.clientWidth - PSTG.w) > 4) psResize();
    psWalk(dt);
    PRS_STAGE.scene(PSTG.ctx, PSTG.sim, ts / 1000, psView(false));
    psPositionOverlays();
  }
  function psResize() {
    var d = psDims(); if (!PSTG.cv) return;
    var sx = PSTG.w ? d.w / PSTG.w : 1, sy = PSTG.h ? d.h / PSTG.h : 1;
    PSTG.w = d.w; PSTG.h = d.h; PSTG.sc = clamp(Math.min(d.w / 1000, d.h / 520), 0.6, 1.25);
    PSTG.boat = { cx: DOCK.x * d.w, cy: DOCK.y * d.h };
    PRS_STAGE.initStage(PSTG.cv, { w: d.w, h: d.h });
    for (var pid in PSTG.fig) { var f = PSTG.fig[pid]; f.cx *= sx; f.cy *= sy; f.tx *= sx; f.ty *= sy; }
    if (RM.matches) PRS_STAGE.scene(PSTG.ctx, PSTG.sim, 1, psView(true));
  }
  // rebuild the plan-stage sim from the current plan (a seat swap re-homes pawns). Keeps
  // fig positions so non-seat edits don't jump; a swap glides the moved pawns to new stations.
  function syncPlanStage() {
    if (!PSTG.ctx || $('setup').classList.contains('hidden')) return;
    psBuildSim(); psSyncFigs(false);
    if (RM.matches) { PRS_STAGE.scene(PSTG.ctx, PSTG.sim, 1, psView(true)); psPositionOverlays(); }
  }

  // ---- pawn hit-test + inspection (degraded #pawn-card: name/role/duty/seat) ----
  function psPawnAt(cx, cy) {
    var wrap = $('plan-stage-wrap'); if (!wrap || !PSTG.sim) return null;
    var r = wrap.getBoundingClientRect(), x = cx - r.left, y = cy - r.top;
    var R = 30 * PSTG.sc, best = null, bestD = R * R;
    PSTG.sim.participants.forEach(function (p) {
      var f = PSTG.fig[p.id]; if (!f) return;
      var dx = f.cx - x, dy = (f.cy - 14 * PSTG.sc) - y, d = dx * dx + dy * dy;
      if (d <= bestD) { bestD = d; best = p.id; }
    });
    return best;
  }
  function planPawnCardHTML(p) {
    var t = T(), rr = P.role(p.roleId), jp = (p.name && p.name.jp) ? p.name.jp : '';
    var head = '<button class="pc-x" id="pc-close" aria-label="' + t.closeBtn + '">×</button>' +
      '<div class="pc-head"><span class="pc-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
      '<div class="pc-id"><b id="pc-name">' + nm(p.name) + '</b>' +
      (jp && jp !== nm(p.name) ? '<span class="pc-jp">' + jp + '</span>' : '') +
      '<span class="pc-role">' + rr.icon + ' ' + nm(rr.name) + '</span></div></div>';
    var held = [];
    TRAY_OBJ.forEach(function (o) { if (fixed[DET_FIX[o.det]] && tokenPidFor(o.det) === p.id) held.push(o.ic + ' ' + t[o.key]); });
    var duty = '<div class="pc-duty">' + (t['duty_' + p.roleId] || '') + '</div>';
    var note = '<div class="pc-note">' + t.planSeat(nm(rr.name)) + '</div>';
    var holds = held.length ? '<div class="pc-sec"><span class="pc-h">' + t.trayTitle + '</span><div class="ins-cards">' +
      held.map(function (h) { return '<span class="ins-card ok">' + h + '</span>'; }).join('') + '</div></div>' : '';
    return head + duty + note + holds;
  }
  function positionPlanPawnCard(pid) {
    var card = $('pawn-card'), f = PSTG.fig[pid], wrap = $('plan-stage-wrap'); if (!f || !wrap) return;
    var r = wrap.getBoundingClientRect();
    var sx = r.left + f.cx * (r.width / (PSTG.w || r.width));
    var sy = r.top + f.cy * (r.height / (PSTG.h || r.height));
    card.style.left = '0px'; card.style.top = '0px';
    var cw = card.offsetWidth, ch = card.offsetHeight, M = 8;
    var left = sx - cw / 2, top = sy - 44 * PSTG.sc - ch - 10;
    if (top < M) top = sy + 14 * PSTG.sc;
    if (left < M) left = M;
    if (left + cw > window.innerWidth - M) left = window.innerWidth - M - cw;
    if (top + ch > window.innerHeight - M) top = window.innerHeight - M - ch;
    card.style.left = Math.round(left) + 'px'; card.style.top = Math.round(top) + 'px';
  }
  function openPlanPawnCard(pid) {
    if (!PSTG.sim) return;
    var p = byId(PSTG.sim.participants, pid); if (!p) return;
    var card = $('pawn-card'); if (!card) return;
    var fresh = card.classList.contains('hidden');
    if (fresh) { var a = document.activeElement; pawnCardInvoker = (a && a !== document.body) ? a : null; }
    pawnCardPid = pid;
    card.innerHTML = planPawnCardHTML(p);
    card.setAttribute('aria-label', nm(p.name) + ' · ' + nm(P.role(p.roleId).name));
    card.classList.remove('hidden');
    positionPlanPawnCard(pid);
    if (fresh) { try { card.focus(); } catch (e) { } }
  }

  // ---- the tray view (pure function of fixed[]/orgOv) ----
  function unresolvedCount() { var n = 0; TRAY_OBJ.forEach(function (o) { if (!fixed[DET_FIX[o.det]]) n++; }); return n; }
  function renderTray() {
    var t = T(), box = $('tray-objs'); if (!box) return;
    // grammar hint (dismissible once)
    var hint = $('tray-hint'), hx = $('tray-hint-x'), htx = $('tray-hint-txt');
    if (hint) hint.classList.toggle('hidden', trayHintSeen());
    if (htx) htx.textContent = t.grammarHint;
    if (hx) hx.setAttribute('aria-label', t.trayHintClose);
    var objs = TRAY_OBJ.map(function (o) {
      var on = fixed[DET_FIX[o.det]];
      if (o.drag && on) return '';   // placed draggable objects live at a pawn as a token, not in the tray
      var extra = '';
      if (o.det === 'handoffTiming') { var d = Math.max(0, receiptAltTotal('handoffTiming') - P.scoreTrip(currentPlan()).total); if (!on && d > 0) extra = '<span class="to-prize">+' + d + '</span>'; }
      var cls = 'tray-obj' + (o.drag ? ' drag' : ' dock') + (on ? ' done' : '') + (traySel && traySel.kind === 'obj' && traySel.det === o.det ? ' sel' : '');
      var aria = t[o.key] + (on ? ' ✓' : '');
      return '<button type="button" class="' + cls + '" data-det="' + o.det + '" aria-label="' + aria + '">' +
        '<span class="to-ic">' + o.ic + '</span><span class="to-nm">' + t[o.key] + '</span>' + extra +
        (on ? '<span class="to-done">✓</span>' : '') + '</button>';
    }).join('');
    var plan = currentPlan();
    var duties = SEAT_ROLES.map(function (rid) {
      var rr = P.role(rid), holder = plan.roles[rid] && plan.roles[rid].holder ? byId(plan.participants, plan.roles[rid].holder) : null;
      var cls = 'tray-duty' + (traySel && traySel.kind === 'duty' && traySel.role === rid ? ' sel' : '');
      return '<button type="button" class="' + cls + '" data-role="' + rid + '" aria-label="' + nm(rr.name) + ' · ' + (holder ? nm(holder.name) : '') + '">' +
        '<span class="td-ic" style="background:' + rr.color + '">' + rr.icon + '</span><span class="td-nm">' + nm(rr.name) + '</span></button>';
    }).join('');
    box.innerHTML =
      '<div class="tray-count">' + t.trayCount(unresolvedCount()) + '</div>' +
      '<div class="tray-row tray-decisions">' + objs + '</div>' +
      '<div class="tray-row tray-dutychips">' + duties + '</div>' +
      careShelfHtml(plan, t);
  }
  // Voyage §3 — the VIP CARE SHELF: the 4 VIP guest cards in the same grammar as duty chips.
  // An UNASSIGNED card is drag/tap-tap/keyboard-picker onto ORGANIZER pawns only; an ASSIGNED
  // card shows its buddy and is click-to-unassign. Cards never become tokens (they stay in the
  // shelf as the VIP roster) — the shelf header counts the still-unbuddied VIPs (gdCount).
  var CARE_IC = '🎩';
  function unbuddiedVips(plan) {
    var n = 0, gs = plan.guests || [];
    for (var i = 0; i < gs.length; i++) if (gs[i].vip && !plan.buddies[gs[i].id]) n++;
    return n;
  }
  function careShelfHtml(plan, t) {
    var vips = (plan.guests || []).filter(function (g) { return g.vip; });
    if (!vips.length) return '';
    var cards = vips.map(function (g) {
      var bpid = plan.buddies[g.id], buddy = bpid ? byId(plan.participants, bpid) : null, assigned = !!buddy;
      var seld = traySel && traySel.kind === 'care' && traySel.guestId === g.id;
      var cls = 'tray-care-card' + (assigned ? ' assigned' : '') + (seld ? ' sel' : '');
      var buddyTxt = assigned ? ('⇄ ' + nm(buddy.name)) : t.gdBuddyLbl;
      var aria = t.gdCardAria(nm(g.name), assigned ? nm(buddy.name) : t.gdNone) + (assigned ? ' · ' + t.gdUnassign : '');
      return '<button type="button" class="' + cls + '" data-guest="' + g.id + '"' + (assigned ? ' title="' + t.gdUnassign + '"' : '') + ' aria-label="' + aria + '">' +
        '<span class="tc-ic">' + CARE_IC + '</span>' +
        '<span class="tc-body"><span class="tc-nm">' + nm(g.name) + '</span><span class="tc-buddy">' + buddyTxt + '</span></span>' +
        (assigned ? '<span class="tc-x" aria-hidden="true">×</span>' : '') + '</button>';
    }).join('');
    return '<div class="tray-care">' +
      '<div class="tray-care-h">' + t.gdShelfTitle + ' <span class="tray-care-count">' + t.gdCount(unbuddiedVips(plan)) + '</span></div>' +
      '<div class="tray-row tray-carecards">' + cards + '</div></div>';
  }
  // position halos (valid targets while an object is lifted) + tokens (placed objects) from the fig cache
  function psPositionOverlays() {
    var halos = $('plan-halos'), tokens = $('plan-tokens'), t = T();
    if (!halos || !tokens || !PSTG.sim) return;
    // halos
    var want = {};
    if (traySel) ((traySel.kind === 'duty' || traySel.kind === 'care') ? PSTG.sim.participants.filter(function (p) { return SEAT_ROLES.indexOf(p.roleId) >= 0; }).map(function (p) { return p.id; }) : targetPidsFor(traySel.det)).forEach(function (pid) { want[pid] = 1; });
    for (var pid in want) {
      var h = halos.querySelector('.pawn-halo[data-pid="' + pid + '"]');
      if (!h) { h = document.createElement('div'); h.className = 'pawn-halo'; h.setAttribute('data-pid', pid); halos.appendChild(h); }
      var f = PSTG.fig[pid]; if (f) { h.style.left = Math.round(f.cx) + 'px'; h.style.top = Math.round(f.cy) + 'px'; }
    }
    var hs = halos.querySelectorAll('.pawn-halo');
    for (var i = 0; i < hs.length; i++) { if (!want[hs[i].getAttribute('data-pid')]) hs[i].parentNode.removeChild(hs[i]); }
    // tokens — one per placed draggable object, at its anchor pawn's feet
    var placed = {};
    TRAY_OBJ.forEach(function (o) {
      if (!o.drag || !fixed[DET_FIX[o.det]]) return;
      var pid2 = tokenPidFor(o.det); if (!pid2) return;
      placed[o.det] = pid2;
      var p = byId(PSTG.sim.participants, pid2), tk = tokens.querySelector('.plan-token[data-det="' + o.det + '"]');
      if (!tk) { tk = document.createElement('button'); tk.type = 'button'; tk.className = 'plan-token'; tk.setAttribute('data-det', o.det); tokens.appendChild(tk); }
      tk.innerHTML = '<span class="pt-ic">' + o.ic + '</span>';
      tk.setAttribute('aria-label', t.tokenAria(t[o.key], p ? nm(p.name) : ''));
      var f2 = PSTG.fig[pid2];
      if (f2) {
        // co-located tokens (e.g. abort flag + illness route both on the Safety Lead) fan
        // horizontally so every token stays visible and click-to-undo reachable
        var stackN = 0, det2;
        for (det2 in placed) { if (placed[det2] === pid2 && det2 !== o.det) stackN++; }
        tk.style.left = Math.round(f2.cx + stackN * 20 * PSTG.sc) + 'px';
        tk.style.top = Math.round(f2.cy + 8 * PSTG.sc) + 'px';
      }
    });
    var tks = tokens.querySelectorAll('.plan-token');
    for (var j = 0; j < tks.length; j++) { if (!placed[tks[j].getAttribute('data-det')]) tks[j].parentNode.removeChild(tks[j]); }
    if (pawnCardOpen() && pawnCardPid && PSTG.fig[pawnCardPid] && !$('setup').classList.contains('hidden')) positionPlanPawnCard(pawnCardPid);
  }
  function trayHintSeen() { try { return localStorage.getItem('prs_trayhint_seen') === '1'; } catch (e) { return false; } }
  function dismissTrayHint() { try { localStorage.setItem('prs_trayhint_seen', '1'); } catch (e) { } var h = $('tray-hint'); if (h) h.classList.add('hidden'); }

  // ---- placement grammar: select / resolve / reject (shared by drag, tap-tap, keyboard) ----
  function trayDeselect() {
    traySel = null;
    var g = $('tray-ghost'); if (g && g.parentNode) g.parentNode.removeChild(g);
    var w = $('plan-stage-wrap'); if (w) w.classList.remove('placing');
    renderTray(); psPositionOverlays();
  }
  function traySelect(sel) {
    if (traySel && traySel.kind === sel.kind && traySel.det === sel.det && traySel.role === sel.role && traySel.guestId === sel.guestId) { trayDeselect(); return; }
    traySel = sel;
    var w = $('plan-stage-wrap'); if (w) w.classList.add('placing');
    renderTray(); psPositionOverlays();
  }
  function selObjName(sel) {
    if (sel.kind === 'duty') return nm(P.role(sel.role).name) + (L === 'ja' ? 'の担当' : ' duty');
    if (sel.kind === 'care') { var g = byId(currentPlan().guests || [], sel.guestId); return g ? nm(g.name) : sel.guestId; }
    return T()[TRAY_OBJ_BY_DET[sel.det].key];
  }
  function selNeeded(sel) {
    if (sel.kind === 'duty' || sel.kind === 'care') return T().trayOrganizer;
    if (sel.det === 'info') return T().trayFerryNeeded;
    return nm(P.role(targetRolesFor(sel.det)[0]).name);
  }
  var trayToastT = null;
  function showTrayToast(msg) {
    var toast = $('tray-toast'); if (!toast) return;
    toast.textContent = msg;
    toast.classList.remove('hidden'); toast.classList.remove('show'); void toast.offsetWidth; toast.classList.add('show');
    if (trayToastT) clearTimeout(trayToastT);
    trayToastT = setTimeout(function () { toast.classList.remove('show'); toast.classList.add('hidden'); }, 3600);
  }
  function trayReject(p, sel) { showTrayToast(T().rejLine(nm(p.name), nm(P.role(p.roleId).name), selObjName(sel), selNeeded(sel))); }
  // Voyage §3 rejection copy: not-an-organizer vs. already-has-2-VIPs (the bijection-ish cap).
  function careReject(p, capped) { showTrayToast(capped ? T().gdRejCap(nm(p.name)) : T().gdRejNotOrganizer(nm(p.name))); }
  // resolve a selection against a pawn. keepOnReject=true (tap-tap) leaves the selection armed.
  function trayResolve(sel, pid, keepOnReject) {
    if (!pid || !PSTG.sim) { trayDeselect(); return; }
    var p = byId(PSTG.sim.participants, pid); if (!p) { trayDeselect(); return; }
    if (sel.kind === 'care') {
      if (SEAT_ROLES.indexOf(p.roleId) < 0) { careReject(p, false); if (!keepOnReject) trayDeselect(); return; }
      var cpl = currentPlan();
      if (cpl.buddies[sel.guestId] === p.id) { trayDeselect(); return; }             // already this buddy — no-op
      if (buddyLoadOf(cpl, p.id, sel.guestId) >= 2) { careReject(p, true); if (!keepOnReject) trayDeselect(); return; }
      buddyOv[sel.guestId] = p.id;
      if (window.PRS_SOUND) window.PRS_SOUND.cue('place');   // care-shelf placement commit (sound.js §W3)
      trayDeselect();   // W2 gate nit: full deselect (clears .placing cursor state), then repaint
      updatePlanUI();
      var cc = $('tray-objs').querySelector('.tray-care-card[data-guest="' + sel.guestId + '"]');
      if (cc) { try { cc.focus(); } catch (e) { } }
      return;
    }
    if (sel.kind === 'duty') {
      if (SEAT_ROLES.indexOf(p.roleId) < 0) { trayReject(p, sel); if (!keepOnReject) trayDeselect(); return; }
      if (window.PRS_SOUND) window.PRS_SOUND.cue('place');   // duty-seat placement commit (sound.js §W3)
      swapSeats(sel.role, p.roleId); trayDeselect(); updatePlanUI(); return;
    }
    if (targetRolesFor(sel.det).indexOf(p.roleId) < 0) { trayReject(p, sel); if (!keepOnReject) trayDeselect(); return; }
    tokenAnchor[sel.det] = pid;
    traySel = null;
    if (window.PRS_SOUND) window.PRS_SOUND.cue('place');   // resource-token placement commit (sound.js §W3)
    applyReceiptFix(sel.det, true);   // -> updatePlanUI -> renderTray + tokens (three-way sync)
    var tk = $('plan-tokens').querySelector('.plan-token[data-det="' + sel.det + '"]');
    if (tk) { try { tk.focus(); } catch (e) { } }
  }
  function swapSeats(roleX, roleY) {
    if (roleX === roleY) return;
    var tmp = orgOv[roleX]; orgOv[roleX] = orgOv[roleY]; orgOv[roleY] = tmp;
  }
  function undoToken(det) {
    tokenAnchor[det] = null;
    applyReceiptFix(det, false);
    var b = $('tray-objs').querySelector('.tray-obj[data-det="' + det + '"]');
    if (b) { try { b.focus(); } catch (e) { } }
  }
  // Voyage §3: click-to-unassign an assigned VIP care card (buddyOv[gid]=null → mergePlan drops it,
  // even a template-seeded one). Keeps keyboard flow on the now-empty card.
  function unassignBuddy(gid) {
    buddyOv[gid] = null; traySel = null;
    updatePlanUI();
    var cc = $('tray-objs').querySelector('.tray-care-card[data-guest="' + gid + '"]');
    if (cc) { try { cc.focus(); } catch (e) { } }
  }
  function openFishdayEditor() {
    daySel = 'fishday'; placingChip = null; removeGhost(); removeDropSlot(); paintSetup();
    if (typeof openDayDrawer === 'function') { openDayDrawer('fishday'); return; }
    var fc = $('fd-card'); if (fc && fc.scrollIntoView) fc.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'start' });
  }
  function expandAllSettings() {
    var as = $('all-settings'), tg = $('all-settings-toggle');
    if (as) as.classList.remove('collapsed');
    if (tg) tg.setAttribute('aria-expanded', 'true');
  }
  function openFinancePanel() {
    expandAllSettings();
    var mc = $('mission-control'); if (mc && mc.scrollIntoView) mc.scrollIntoView({ behavior: RM.matches ? 'auto' : 'smooth', block: 'center' });
  }
  function trayObjAction(det) {   // dock objects: strongbox -> finance panel, satchel -> fishday editor
    if (det === 'reserve') openFinancePanel();
    else if (det === 'handoffTiming') openFishdayEditor();
  }

  // ---- keyboard target picker (#pick-modal) ----
  var pickSel = null;
  function openPicker(sel) {
    pickSel = sel;
    var t = T(), body = $('pick-body');
    $('pick-title').textContent = t.pickTitle(selObjName(sel));
    $('pick-sub').textContent = t.pickValidNote;
    var isCare = sel.kind === 'care';
    var validRoles = (sel.kind === 'duty' || isCare) ? SEAT_ROLES : targetRolesFor(sel.det);
    var carePlan = isCare ? currentPlan() : null;
    var people = PSTG.sim ? PSTG.sim.participants.slice() : currentPlan().participants.filter(function (p) { return p.company !== 'guest'; });
    var rows = people.filter(function (p) { return p.roleId !== 'crew'; }).map(function (p) {
      var ok = validRoles.indexOf(p.roleId) >= 0, rr = P.role(p.roleId), why = '';
      if (isCare) {
        if (!ok) why = t.gdRejNotOrganizer(nm(p.name));                                                    // not an organizer
        else if (carePlan.buddies[sel.guestId] !== p.id && buddyLoadOf(carePlan, p.id, sel.guestId) >= 2) { ok = false; why = t.gdRejCap(nm(p.name)); }   // already 2 VIPs
      } else if (!ok) why = t.rejLine(nm(p.name), nm(rr.name), selObjName(sel), selNeeded(sel));
      return { ok: ok, html: '<button type="button" class="pick-row' + (ok ? '' : ' bad') + '" data-pid="' + p.id + '"' + (ok ? '' : ' disabled aria-disabled="true"') + '>' +
        '<span class="td-ic" style="background:' + rr.color + '">' + rr.icon + '</span>' +
        '<span class="pick-nm">' + nm(p.name) + '</span><span class="pick-role">' + nm(rr.name) + '</span>' +
        (ok ? '' : '<span class="pick-why">' + why + '</span>') + '</button>' };
    });
    rows.sort(function (a, b) { return (a.ok === b.ok) ? 0 : (a.ok ? -1 : 1); });
    body.innerHTML = rows.map(function (r) { return r.html; }).join('');
    modalOpening('pick-modal'); $('pick-modal').classList.add('show');
    var f = body.querySelector('.pick-row:not([disabled])'); if (f) f.focus();
  }
  function closePicker() { pickSel = null; $('pick-modal').classList.remove('show'); modalClosed(); }

  // ---- pointer drag (also handles tap-tap-select when the pointer doesn't move) ----
  function trayPointerDown(e) {
    var care = e.target.closest && e.target.closest('.tray-care-card');
    if (care) {
      if (care.classList.contains('assigned')) return;   // assigned = click-to-unassign, not draggable
      trayDrag = { sel: { kind: 'care', guestId: care.getAttribute('data-guest') }, x0: e.clientX, y0: e.clientY, moved: false };
      return;
    }
    var b = e.target.closest && e.target.closest('.tray-obj, .tray-duty'); if (!b) return;
    if (b.classList.contains('dock')) return;   // strongbox/satchel: not draggable (click handles them)
    var sel = b.classList.contains('tray-duty')
      ? { kind: 'duty', role: b.getAttribute('data-role') }
      : { kind: 'obj', det: b.getAttribute('data-det') };
    trayDrag = { sel: sel, x0: e.clientX, y0: e.clientY, moved: false };
  }
  function trayPointerMove(e) {
    if (!trayDrag) return;
    var dx = e.clientX - trayDrag.x0, dy = e.clientY - trayDrag.y0;
    if (!trayDrag.moved) {
      if (dx * dx + dy * dy < 36) return;
      trayDrag.moved = true;
      traySel = trayDrag.sel;
      var w = $('plan-stage-wrap'); if (w) w.classList.add('placing');
      renderTray(); psPositionOverlays();
      if (!RM.matches) {
        var g = document.createElement('div'); g.className = 'tray-ghost'; g.id = 'tray-ghost';
        g.textContent = trayDrag.sel.kind === 'duty' ? P.role(trayDrag.sel.role).icon : trayDrag.sel.kind === 'care' ? CARE_IC : TRAY_OBJ_BY_DET[trayDrag.sel.det].ic;
        document.body.appendChild(g); trayDrag.ghost = g;
      }
    }
    if (trayDrag.ghost) { trayDrag.ghost.style.left = e.clientX + 'px'; trayDrag.ghost.style.top = e.clientY + 'px'; }
  }
  function trayPointerUp(e) {
    if (!trayDrag) return;
    var td = trayDrag; trayDrag = null;
    if (td.ghost && td.ghost.parentNode) td.ghost.parentNode.removeChild(td.ghost);
    if (td.moved) {
      traySuppressClick = true; setTimeout(function () { traySuppressClick = false; }, 0);
      var wrap = $('plan-stage-wrap'), inside = false;
      if (wrap) { var r = wrap.getBoundingClientRect(); inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom; }
      var pid = inside ? psPawnAt(e.clientX, e.clientY) : null;
      if (pid) trayResolve(td.sel, pid, false);
      else trayDeselect();   // dropped on water / off-stage: silent return
    } else {
      // a tap (no drag) = tap-tap select on the stage
      traySelect(td.sel);
    }
  }

  function enterMode(m) {
    var was = appMode;
    appMode = m;
    killVignette();                                               // §W4 lifecycle: the vignette dies with the intro (enterScreen repeats this; idempotent)
    $('mode-live').classList.toggle('on', m === 'live');
    $('mode-morning').classList.toggle('on', m === 'morning');
    if (timer) { clearInterval(timer); timer = null; }
    clearFinishTimer();
    stopAnim(); closeModals(); camReleaseSafe(0);   // §3 safety: a mode switch never inherits a camera offset
    if (m === 'live') {
      if (was === 'morning' || !morningSnap) snapshotMorning();
      startLive();                              // -> launchLive -> enterScreen('run')
    } else {
      sim = null; paused = false; livePausedForFix = false;
      if (was === 'live') restoreMorning();     // only a Live detour wiped the plan — same-mode re-entry keeps it
      enterScreen('setup');
      paintSetup();
    }
  }

  function startLive() {
    for (var k in fixed) fixed[k] = true; fixed.fixHandoffs = false;   // classic decisions sound; the arrows are the puzzle
    fdReset(); mcReset(); buddyReset(); daySel = 'fishday'; placingChip = null;
    liveState = { fixes: 0, addressed: {}, phase: 'brief', currentGap: null, currentCluster: null, clusterIdx: 0, result: null };
    launchLive();
  }

  function launchLive() {
    stopAnim(); clearFinishTimer();                       // never stack a second rAF loop across re-runs
    sim = P.createSim({ seed: (Math.floor(Math.random() * 1e9) >>> 0) || 1, overrides: buildCfg().overrides }, 'fishday');
    if (window.PRS_SOUND) window.PRS_SOUND.ambient('fishday', sim.clockMin);   // ambient bed start, run-enter (sound.js §W3)
    paused = false; livePausedForFix = false; document.body.classList.add('running');
    closeModals(); speedMult = 2; document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-spd') === '2'); });
    enterScreen('run');
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
    var cl = nextLiveGap();
    if (cl && (sim.clockMin || 0) >= cl.startMin - 0.001) { livePausedForFix = true; openGap(cl); return; }
    if (sim.finished) liveFinish();
  }

  // §5 convergence grouping: gaps are keyed by their CONVERGENCE point so one freeze presents a
  // whole cluster (pre-departure info → menu/gearload/route; the ic_catch relay fan-out), each card
  // still individually priced + committed. Everything else stays a solo freeze. This drops the
  // seed's freeze count from 11 per-arrow stops to 5 meatier decisions (predep ×6, catch ×2, 3 solo
  // ic_ground). Pure & deterministic — same engine calls, just clustered ordering.
  var PREDEP_CONSUMERS = { t_f_menu: 1, t_f_gearload: 1, t_f_route: 1 };
  function gapClusterKey(g) {
    if (PREDEP_CONSUMERS[g.taskId]) return 'predep';           // everything gating menu → gearload/route
    if (g.cardId === 'ic_catch') return 'catch';               // the catch-relay fan-out
    return 'solo:' + g.taskId + '|' + g.cardId;                // anything else = its own freeze
  }
  // returns the next CLUSTER to freeze on: { key, gaps:[…startMin-sorted], startMin }, or null.
  function nextLiveGap() {
    var plan = currentPlan(), fd = P.fishdaySchedule(plan), out = [];
    fd.missing.forEach(function (m) { out.push({ taskId: m.taskId, cardId: m.cardId, kind: 'missing' }); });
    fd.late.forEach(function (l) { out.push({ taskId: l.taskId, cardId: l.cardId, kind: 'late' }); });
    out = out.filter(function (g) { return !liveState.addressed[g.taskId + '|' + g.cardId]; });
    out.forEach(function (g) { var t = byId(plan.tasks, g.taskId); g.startMin = t ? t.startMin : 9999; });
    out.sort(function (a, b) { return a.startMin - b.startMin; });
    if (!out.length) return null;
    var key = gapClusterKey(out[0]);
    var gaps = out.filter(function (g) { return gapClusterKey(g) === key; });   // already startMin-sorted
    return { key: key, gaps: gaps, startMin: gaps[0].startMin };
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
    if (window.PRS_SOUND) window.PRS_SOUND.cue('freeze');   // Live freeze point (sound.js §W3)
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
  // open a whole cluster (spec §5): freeze once, present its cards in sequence. cl = { key, gaps, startMin }.
  function openGap(cl) {
    liveState.currentCluster = cl; liveState.clusterIdx = 0;
    liveState.currentGap = cl.gaps[0]; liveState.phase = 'prompt';
    paintGapFocus(liveState.currentGap);
    camPunchGap(liveState.currentGap);            // §3 auto-cinematic: punch in on the stalled pawn
    renderLivePanel(true);
  }
  // move to the next un-addressed card in the frozen cluster, or resume the run when the cluster is done
  function advanceCluster() {
    var cl = liveState.currentCluster, next = null, ni = -1, i;
    if (cl) for (i = 0; i < cl.gaps.length; i++) {
      var gg = cl.gaps[i];
      if (!liveState.addressed[gg.taskId + '|' + gg.cardId]) { next = gg; ni = i; break; }
    }
    if (next) {
      liveState.clusterIdx = ni; liveState.currentGap = next; liveState.phase = 'spot';
      paintGapFocus(next); camPunchGap(next);     // re-center on the next stalled crewmate
      renderLivePanel();
    } else {                                       // cluster cleared — release the freeze and the camera
      clearStationTints(); clearGapFocus(); camReleaseSafe(520);
      livePausedForFix = false; liveState.phase = 'brief';
      liveState.currentGap = null; liveState.currentCluster = null;
      renderLivePanel();
    }
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
      var cl = liveState.currentCluster, note = (cl && cl.gaps.length > 1) ? '<p class="ld-cluster">' + t.ldClusterNote(cl.gaps.length) + '</p>' : '';
      $('ld-prompt').innerHTML = '<div class="ld-txt"><h3>' + head(personName(to)) + '</h3><p>' + body(nm(to.name)) + '</p>' + note + '</div><button class="btn primary glow" id="ld-fix">' + t.ldFixBtn + '</button>';
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
    var cl = liveState.currentCluster, step = (cl && cl.gaps.length > 1) ? '<span class="ld-step">' + t.spotStep(liveState.clusterIdx + 1, cl.gaps.length) + '</span>' : '';
    $('ld-spot').innerHTML =
      '<div class="ld-spot-head">' + step + '<h3>' + t.spotTitle(cname) + '</h3><p class="ld-sub">' +
      t.spotSub(from ? personName(from) : nm(P.role('chef').name), personName(to), hhmm(to.startMin)) + '</p></div>' +
      '<div class="ld-opts" id="ld-opts">' + chips + '</div>' +
      '<div class="ld-preview" id="ld-preview"><span class="pv-lbl">' + t.pvLbl + '</span><span id="ld-pv-txt">' + t.spotHover + '</span><span class="pv-slice" id="ld-pv-slice"></span></div>';
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
    // §7.1: the blast-radius preview shows the projected Fishing-Day SLICE of the trip 100 for this
    // hypothetical channel choice (run scoreTrip on the merged hypothetical plan) — ledger currency.
    var slice = $('ld-pv-slice'), fb = P.scoreTrip(plan2).byBucket.fishday;
    if (slice) slice.textContent = t.daySliceLine(fb.earned, fb.maxPts, dayLabel('fishday'));
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
    renderSim(sim);
    // §5: stay frozen and step to the next card in this convergence cluster; only when the whole
    // cluster is committed does advanceCluster() release the freeze + camera and resume the run.
    advanceCluster();
  }

  function liveFinish() {
    if (timer) { clearInterval(timer); timer = null; }
    camReleaseSafe(0);                            // §3 safety: no punch-in survives into the result/report
    // §7.1: win = the Fishing-Day bucket is fully earned in the ledger AND dinner is served by 18:00.
    var trip = P.scoreTrip(currentPlan()), fd = P.fishdaySchedule(currentPlan()), fb = trip.byBucket.fishday;
    var win = fb.earned === fb.maxPts && (fd.dinnerMin == null || fd.dinnerMin <= 1080);
    liveState.phase = 'result'; liveState.result = { win: win, trip: trip, fd: fd };
    renderResult();
    if (win && !anim.fanfared) { anim.fanfared = true; fireFanfare(); }   // one beat only — 18:00 already fired it on a clean serve
  }

  function renderResult() {
    var t = T(), r = liveState.result, el = $('ld-result'); if (!r) return;
    if (r.win) {
      var fb = r.trip.byBucket.fishday;
      el.className = 'ld-panel result win';
      el.innerHTML = '<div class="ld-txt"><h3>' + t.resWinT + '</h3><p>' + t.resWinP2(fb.earned, fb.maxPts) + '</p></div>' +
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
    enterScreen('report');
    renderReport(lastResult);
  }

  // ---- init ----
  bind(); applyLang();
  // first-time players land on the graphic cast intro; returning players (localStorage) go straight in.
  if (introSeen()) enterMode('live'); else showIntro(true);   // first load autoplays the vignette (§W4)
})();
