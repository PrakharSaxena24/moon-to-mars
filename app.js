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
  var DETS = ['safety', 'budgetAuth', 'info', 'report', 'fatigue', 'reserve', 'returnLogi'];
  var DET_FIX = { safety: 'setSafety', budgetAuth: 'grantAuth', info: 'shareInfo', report: 'setReport', fatigue: 'rebalance', reserve: 'fixReserve', returnLogi: 'setReturn' };
  var DET_ROLE = { safety: 'safetyLead', budgetAuth: 'budgetLead', info: 'pm', report: 'safetyLead', fatigue: 'siteLead', reserve: 'budgetLead', returnLogi: 'logi' };
  // which day(s) each design decision affects (a gap can bite on more than one day)
  var DET_SEG = { safety: ['ops'], budgetAuth: ['ops', 'return'], info: ['arrival', 'ops'], report: ['ops'], fatigue: ['ops', 'return'], reserve: ['ops', 'return'], returnLogi: ['return'] };
  var daySel = 'arrival';   // which day is being planned / rehearsed
  function detsForDay(d) { return (d === 'all') ? DETS.slice() : DETS.filter(function (id) { return DET_SEG[id].indexOf(d) >= 0; }); }
  function dayLabel(seg) { if (seg === 'all') return T().wholeTrip; var s = null; P.SEGMENTS.forEach(function (x) { if (x.id === seg) s = x; }); return s ? nm(s.name) : seg; }
  function dayGapCount(seg) { return P.gapsForSegment(currentPlan(), seg).length; }

  // which design decisions the player has closed (true = fixed)
  var fixed = { setSafety: false, grantAuth: false, shareInfo: false, setReport: false, rebalance: false, fixReserve: false, setReturn: false };
  function buildCfg() { var cfg = { seed: 1, overrides: {} }; DETS.forEach(function (d) { if (fixed[DET_FIX[d]]) cfg = P.applyFix(cfg, DET_FIX[d]); }); return cfg; }
  function currentPlan() { return P.mergePlan(buildCfg()); }
  function activeProblemIds() { return P.detect(currentPlan()).map(function (p) { return p.id; }); }

  var sim = null, timer = null, paused = false, BASE_TICK = 520, speedMult = 1, lastResult = null, figEls = {};
  function tickMs() { return Math.round(BASE_TICK / speedMult); }

  var BUB = { confused: '❓', meeting: '💬', waiting: '⏳', tired: '😣', onFire: '🔥', resolved: '✅', working: '', idle: '' };
  var STATE_KEY = { working: 'stWorking', confused: 'stConfused', meeting: 'stMeeting', waiting: 'stWaiting', tired: 'stTired', onFire: 'stOnFire', resolved: 'stResolved', idle: 'stIdle' };

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
  function paintSetup() { buildDaySelect(); buildCanvas(); buildOrg(); buildTimeline(); buildEditors(); updatePlanUI(); }

  function buildDaySelect() {
    var box = $('day-select'); if (!box) return;
    var opts = P.SEGMENTS.map(function (s) { return s.id; }).concat(['all']);
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
      cell('👥', t.cvHeadcount, pr.headcount + ' (' + t.cvHeadcountNote(pr.staff, pr.guests) + ')') +
      cell('💴', t.cvBudget, '¥' + nf(pl.budget.total)) +
      cell('⚠️', t.cvConstraints, pr.constraints.map(nm).join(' · '), true);
    $('c-conds').innerHTML = '<div class="conds-h">' + t.cvSuccess + '</div>' +
      pr.successConditions.map(function (c) { return '<span class="cond">• ' + nm(c.text) + '</span>'; }).join('');
    function cell(ic, lbl, val, wide) { return '<div class="cv-cell' + (wide ? ' wide' : '') + '"><span class="cv-ic">' + ic + '</span><span class="cv-lbl">' + lbl + '</span><span class="cv-val">' + val + '</span></div>'; }
  }

  function buildOrg() {
    var plan = currentPlan(), box = $('org'); box.innerHTML = '';
    var order = ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'teamLead'];
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
    var raySel = { arrival: function (d) { return d === 1; }, ops: function (d) { return d >= 2 && d <= 9; }, return: function (d) { return d === days; }, all: function () { return true; } }[daySel] || function () { return false; };
    for (var d = 1; d <= days; d++) { var cls = (d === 1) ? 'arr' : (d === days ? 'ret' : 'ops'); rail += '<span class="tl-day ' + cls + (raySel(d) ? ' sel' : '') + '">' + d + '</span>'; }
    var phases = [], seen = {}, segByCls = { arr: 'arrival', ops: 'ops', ret: 'return' };
    plan.tasks.forEach(function (t) { var k = t.phase.en; if (!seen[k]) { seen[k] = { phase: t.phase, tasks: [], cls: '' }; phases.push(seen[k]); } seen[k].tasks.push(t); });
    if (phases[0]) phases[0].cls = 'arr'; if (phases[1]) phases[1].cls = 'ops'; if (phases[2]) phases[2].cls = 'ret';
    var blocks = phases.map(function (ph) {
      var sel = (daySel === 'all' || segByCls[ph.cls] === daySel) ? ' sel' : '';
      var chips = ph.tasks.map(function (t) { return '<span class="tl-chip">' + P.station(t.station).icon + ' ' + nm(t.name) + '</span>'; }).join('');
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
    $('detail-modal').classList.remove('show');
    speedMult = 1; document.querySelectorAll('.spd').forEach(function (x) { x.classList.toggle('on', x.getAttribute('data-spd') === '1'); });
    $('setup').classList.add('hidden'); $('report').classList.add('hidden'); $('run').classList.remove('hidden');
    figEls = {}; $('figs').innerHTML = ''; $('banner').classList.remove('show');
    updateRunButtons(); buildSitemap(); renderSim(sim);
    if (timer) clearInterval(timer); timer = setInterval(step, tickMs());
  }
  function restartTimer() { if (timer) { clearInterval(timer); timer = setInterval(step, tickMs()); } }
  function step() { if (paused || !sim) return; P.tick(sim); renderSim(sim); if (sim.finished) finish(); }

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
    $('nowtag').textContent = T().dayLine(Math.min(P.DAYS, Math.ceil(s.day)), P.DAYS) + (s.phaseLabel ? ' · ' + nm(s.phaseLabel) : '');
    renderDashboard(s);
  }

  function renderDashboard(s) {
    var sc = P.score(s), t = T();
    $('dash-day').textContent = T().dayLine(Math.min(P.DAYS, Math.ceil(s.day)), P.DAYS);
    $('dash-phase').textContent = s.phaseLabel ? nm(s.phaseLabel) : '';
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
      '<span class="lg"><span class="lg-dot done">✓</span>' + t.legResolved + '</span>';
  }
  function updateRunButtons() { $('btn-pause').textContent = paused ? T().resumeBtn : T().pauseBtn; }

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
    $('btn-auto').addEventListener('click', function () { for (var k in fixed) fixed[k] = true; paintSetup(); });
    $('btn-clear').addEventListener('click', function () { for (var k in fixed) fixed[k] = false; paintSetup(); });
    $('launch').addEventListener('click', launch);

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
