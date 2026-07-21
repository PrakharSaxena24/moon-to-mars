'use strict';

// Focused browser-glue contracts that can run in Node without a DOM. These
// execute exact pure helpers from app.js and inspect source-owned semantics.
// They are source/VM contracts, not screenshots or a substitute for browser QA.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const htmlSource = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const styleSource = fs.readFileSync(path.join(__dirname, 'style.css'), 'utf8');
const i18n = require('./i18n.js');
const engine = require('./engine.js');

function between(startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  const end = source.indexOf(endNeedle, start + startNeedle.length);
  assert(start >= 0 && end > start, `missing app.js section: ${startNeedle}`);
  return source.slice(start, end).trim();
}

function elementById(tag, id) {
  const pattern = new RegExp("<" + tag + "\\b[^>]*\\bid=[\"']" + id + "[\"'][^>]*>", 'i');
  const match = htmlSource.match(pattern);
  assert.ok(match, `missing <${tag}> #${id}`);
  return match[0];
}

function assertSourceIncludes(haystack, needle, message) {
  assert.ok(haystack.indexOf(needle) >= 0, message + ` (missing ${needle})`);
}

function nativeJourneyEntryRegression() {
  ['intro-start', 'intro-campaign', 'intro-resilience', 'intro-plan'].forEach(function (id) {
    const tag = elementById('button', id);
    assert.ok(/\btype=["']button["']/.test(tag), `${id} must be a native non-submit button`);
    assert.ok(!/\srole=/.test(tag), `${id} must retain native button semantics without a role override`);
  });
}

function campaignTranslationParityRegression() {
  const enKeys = Object.keys(i18n.en).filter(function (key) { return /^(journey|campaign)/.test(key); }).sort();
  const jaKeys = Object.keys(i18n.ja).filter(function (key) { return /^(journey|campaign)/.test(key); }).sort();
  assert.deepStrictEqual(jaKeys, enKeys, 'all journey/campaign copy keys must exist in both EN and JA');
  assert.ok(enKeys.length >= 60, 'campaign copy surface unexpectedly lost keys');
  enKeys.forEach(function (key) {
    assert.strictEqual(typeof i18n.ja[key], typeof i18n.en[key], `EN/JA campaign copy type differs for ${key}`);
  });
  const boundKeys = [];
  htmlSource.replace(/data-i18n=["']((?:journey|campaign)[^"']+)["']/g, function (_, key) {
    if (boundKeys.indexOf(key) < 0) boundKeys.push(key);
    return _;
  });
  boundKeys.forEach(function (key) {
    assert.ok(Object.prototype.hasOwnProperty.call(i18n.en, key), `English copy missing for bound key ${key}`);
    assert.ok(Object.prototype.hasOwnProperty.call(i18n.ja, key), `Japanese copy missing for bound key ${key}`);
  });
}

function journeyModeSwitchRegression() {
  const chromeSource = between('function renderCampaignChrome()', 'function setCampaignGuidance(step, announce)');
  assertSourceIncludes(chromeSource, "document.body.classList.toggle('journey-' + journey, campaignState.journey === journey)",
    'journey chrome must project its selected path onto the body');
  const hiddenModes = styleSource.match(/body\.campaign-active \.learning-hub,body\.campaign-active \.topbar \.modesw,\s*body\.journey-guided \.topbar \.modesw\s*\{([^}]*)\}/);
  assert.ok(hiddenModes && /display\s*:\s*none/.test(hiddenModes[1]),
    'guided and campaign journeys must hide the expert mode switch until the learner explicitly enters expert mode');
}

function campaignStorageRegression() {
  const campaignSource = between('var CAMPAIGN_STORAGE_KEY', '// Learning level is deliberately orthogonal');
  const stored = {
    prs_campaign_state_v1: JSON.stringify({
      kind: 'ogasawara-campaign',
      version: 1,
      state: {
        journey: 'campaign', currentEpisode: 999, guidanceStep: 'rehearse',
        attempts: { normal: 999999, 'comms-outage': -20, 'principal-unavailable': 4 },
        discoveredStrategies: ['radio-route', 'radio-route', 'not-real', 'deputy-command'],
        badges: ['communications-resilient', 'communications-resilient', 'not-real'],
        revealedEpisodes: ['normal', 'normal', 'not-real', 'principal-unavailable'],
        provenance: Array.from({ length: 30 }, function (_, i) {
          return { episodeId: i % 2 ? 'normal' : 'not-real', at: i, attempt: 999999,
            planFingerprint: 'x'.repeat(100), status: 'recovered-with-debt', reason: 'r'.repeat(200),
            recoveredWithDebt: true, badgeAwarded: 'not-real', executionComplete: false, efficiency: 999,
            debtBefore: -20, debtAfter: 99999, interventionsBefore: 999, interventionsAfter: -4,
            guestWaitBefore: -5, guestWaitAfter: 99999 };
        }),
        fixed: { setSafety: true }, dayOv: { shouldNotPersist: true }
      }
    }),
    prs_campaign_run_state_v1: 'null',
    prs_authoring_plan: JSON.stringify({ sentinel: 'authoring-must-remain-separate' })
  };
  const reads = [], writes = [];
  const context = {
    localStorage: {
      getItem: function (key) { reads.push(key); return Object.prototype.hasOwnProperty.call(stored, key) ? stored[key] : null; },
      setItem: function (key, value) { writes.push([key, value]); stored[key] = value; }
    },
    P: {
      migrateRunState: function () { return null; },
      createRunState: function () { return { version: 1 }; }
    },
    JSON: JSON,
    Date: Date,
    Math: Math,
    Number: Number,
    isFinite: isFinite
  };
  vm.runInNewContext(`${campaignSource}\nthis.__campaignQA = {\n` +
    `  key: CAMPAIGN_STORAGE_KEY, runKey: CAMPAIGN_RUN_STATE_KEY, kind: CAMPAIGN_KIND, version: CAMPAIGN_VERSION,\n` +
    `  state: campaignState, sanitize: sanitizeCampaignState, migrate: migrateCampaignEnvelope, persist: persistCampaignState\n` +
    `};`, context, { filename: 'app.js#campaign-storage' });
  const qa = context.__campaignQA;
  assert.strictEqual(qa.key, 'prs_campaign_state_v1', 'campaign progress key must be explicitly versioned');
  assert.strictEqual(qa.runKey, 'prs_campaign_run_state_v1', 'campaign carryover key must be explicitly versioned');
  assert.notStrictEqual(qa.key, qa.runKey, 'progress and carryover must use separate stores');
  assert.strictEqual(qa.migrate({ kind: qa.kind, version: qa.version + 1, state: {} }), null,
    'unknown future campaign schemas must fail closed');
  const migratedLegacy = qa.migrate({ version: 0, state: { journey: 'campaign' } });
  assert.ok(migratedLegacy && migratedLegacy.version === qa.version && migratedLegacy.kind === qa.kind,
    'the explicitly supported legacy campaign schema must migrate into the current envelope');
  assert.ok(reads.indexOf('prs_authoring_plan') < 0, 'campaign loading must not read or claim the authoring-plan store');
  assert.strictEqual(qa.state.currentEpisode, 2, 'campaign episode index must be bounded');
  assert.strictEqual(qa.state.attempts.normal, 9999, 'campaign attempts must be bounded');
  assert.strictEqual(qa.state.attempts['comms-outage'], 0, 'negative campaign attempts must clamp to zero');
  assert.deepStrictEqual(Array.from(qa.state.discoveredStrategies), ['radio-route', 'deputy-command'],
    'campaign strategies must be allow-listed and deduplicated');
  assert.deepStrictEqual(Array.from(qa.state.badges), ['communications-resilient'],
    'campaign badges must be allow-listed and deduplicated');
  assert.deepStrictEqual(Array.from(qa.state.revealedEpisodes), ['normal', 'principal-unavailable'],
    'revealed incidents must be allow-listed and deduplicated');
  assert.strictEqual(qa.state.provenance.length, 10, 'campaign replay provenance must stay bounded');
  assert.ok(qa.state.provenance.every(function (entry) { return entry.planFingerprint.length <= 32; }),
    'campaign provenance fingerprints must stay bounded');
  assert.ok(qa.state.provenance.every(function (entry) {
    return entry.reason.length <= 100 && entry.efficiency === 100 && entry.debtBefore === 0 && entry.debtAfter === 999 &&
      entry.interventionsBefore === 20 && entry.interventionsAfter === 0 &&
      entry.guestWaitBefore === 0 && entry.guestWaitAfter === 10080 && entry.badgeAwarded === null;
  }), 'enriched idempotency provenance must clamp every persisted metric and reject unknown badges');
  assert.ok(!Object.prototype.hasOwnProperty.call(qa.state, 'fixed') && !Object.prototype.hasOwnProperty.call(qa.state, 'dayOv'),
    'campaign sanitizer must strip authoring fields');
  qa.persist();
  const persisted = JSON.parse(writes.filter(function (row) { return row[0] === qa.key; }).pop()[1]);
  assert.strictEqual(persisted.kind, qa.kind, 'persisted campaign envelope must identify its kind');
  assert.strictEqual(persisted.version, qa.version, 'persisted campaign envelope must identify its schema version');
  assert.ok(persisted.state && !persisted.state.fixed && !persisted.state.dayOv,
    'persisted campaign progress must not contain authoring state');
  const runState = engine.createRunState();
  assert.strictEqual(runState.version, 1, 'separate campaign carryover must also carry an explicit schema version');
  assert.strictEqual(engine.validateRunState(runState).ok, true, 'default versioned campaign carryover must validate');
}

function scenarioAuthoringPurityRegression() {
  const cfg = engine.applyDayFix(engine.applyAllFixes({ seed: 7, overrides: {} }), 'load');
  const cfgBefore = JSON.stringify(cfg);
  const scenarioCfg = engine.applyScenario(cfg, 'principal-unavailable', 'intervention-token');
  assert.strictEqual(JSON.stringify(cfg), cfgBefore, 'applyScenario must not mutate authored configuration');
  assert.notStrictEqual(scenarioCfg, cfg, 'applyScenario must return a fresh configuration');

  const plan = engine.mergePlan(cfg);
  const planBefore = JSON.stringify(plan);
  const runState = engine.createRunState({ interventionTokens: 2, teamCapacity: 90 });
  const runBefore = JSON.stringify(runState);
  const result = engine.evaluateScenario(plan, 'principal-unavailable', 'intervention-token', runState, 19);
  assert.strictEqual(JSON.stringify(plan), planBefore, 'scenario evaluation must not mutate the authored plan');
  assert.strictEqual(JSON.stringify(runState), runBefore, 'scenario evaluation must not mutate caller carryover state');
  assert.strictEqual(result.planMastery.score, engine.scoreTrip(plan).total,
    'scenario resilience must report normal-plan mastery without changing it');

  const recovery = engine.applyRecovery(runState, 'use-intervention');
  assert.strictEqual(JSON.stringify(runState), runBefore, 'recovery must not mutate caller carryover state');
  assert.strictEqual(recovery.planChanged, false, 'recovery must explicitly declare that authoring did not change');
  assert.strictEqual(recovery.state.interventionTokens, 1, 'recovery must charge its documented execution cost');
  assert.ok(!Object.prototype.hasOwnProperty.call(recovery, 'plan'), 'recovery must not return a replacement authored plan');
}

function frozenRunSnapshotRegression() {
  const helperSource = between('function makeMinuteSim(seg, seed', 'function wholeSegmentResult(s)');
  let captured = null;
  const context = {
    campaignCopy: function (value) { return JSON.parse(JSON.stringify(value)); },
    seededCfg: function (seed) { return { seed: seed, source: 'live-authoring' }; },
    P: {
      createSim: function (cfg, segment, opts) {
        captured = { cfg: cfg, segment: segment, opts: opts };
        return captured;
      }
    },
    JSON: JSON
  };
  vm.runInNewContext(`${helperSource}\nthis.__makeMinuteSim = makeMinuteSim;`, context, {
    filename: 'app.js#make-minute-sim'
  });
  const locked = { seed: 2, source: 'locked-snapshot', overrides: { nested: { value: 7 } }, scenarioId: 'principal-unavailable' };
  const before = JSON.stringify(locked);
  context.__makeMinuteSim('return', 41, locked);
  assert.strictEqual(JSON.stringify(locked), before, 'launching a frozen campaign configuration must not mutate it');
  assert.notStrictEqual(captured.cfg, locked, 'the simulator must receive a defensive clone of the frozen configuration');
  assert.strictEqual(captured.cfg.source, 'locked-snapshot', 'the simulator must use the locked snapshot, not rebuild current authoring');
  assert.strictEqual(captured.cfg.seed, 41, 'the replay seed must be written only to the cloned run configuration');
  assert.strictEqual(captured.cfg.overrides.nested.value, 7, 'the locked authored overrides must reach the simulator intact');
  assert.strictEqual(captured.segment, 'return');
  assert.strictEqual(captured.opts.animate, true, 'campaign chapters must use the animated deterministic runner');
  context.__makeMinuteSim('load', 9);
  assert.strictEqual(captured.cfg.source, 'live-authoring', 'non-campaign runs must keep the normal seeded configuration path');
}

function campaignFreezeScopeRegression() {
  const predicateSource = between('function campaignPlanFrozen()', 'function setCampaignAuthoringInert(frozen)');
  const context = {};
  vm.runInNewContext(`
    var active = false, incidentShown = false, runHidden = true;
    var campaignPendingLaunch = null, campaignActiveRun = null;
    function campaignIsActive() { return active; }
    function $(id) {
      return { classList: { contains: function (name) {
        if (id === 'campaign-incident-modal' && name === 'show') return incidentShown;
        if (id === 'run' && name === 'hidden') return runHidden;
        return false;
      } } };
    }
    ${predicateSource}
    this.__freezeQA = {
      set: function (values) {
        active = values.active; incidentShown = values.incidentShown; runHidden = values.runHidden;
        campaignPendingLaunch = values.pending ? {} : null; campaignActiveRun = values.running ? {} : null;
      },
      read: campaignPlanFrozen
    };
  `, context, { filename: 'app.js#campaign-freeze' });
  const qa = context.__freezeQA;
  qa.set({ active: false, pending: true, incidentShown: true, running: true, runHidden: false });
  assert.strictEqual(qa.read(), false, 'non-campaign authoring must never be frozen by stale campaign state');
  qa.set({ active: true, pending: false, incidentShown: false, running: false, runHidden: true });
  assert.strictEqual(qa.read(), false, 'campaign setup/edit state must remain authorable');
  qa.set({ active: true, pending: true, incidentShown: true, running: false, runHidden: true });
  assert.strictEqual(qa.read(), true, 'the after-lock incident reveal must freeze authoring');
  qa.set({ active: true, pending: false, incidentShown: false, running: true, runHidden: false });
  assert.strictEqual(qa.read(), true, 'the active campaign run must freeze authoring');
  qa.set({ active: true, pending: false, incidentShown: false, running: true, runHidden: true });
  assert.strictEqual(qa.read(), false, 'report/setup must release authoring even before transient run data is cleared');
  const enterScreenSource = between('function enterScreen(name)', '// =========================================================================\n  // SETUP');
  assertSourceIncludes(enterScreenSource, "if (name !== 'run') setCampaignAuthoringInert(false)",
    'leaving the run must explicitly release campaign authoring');
}

function restartAttemptRegression() {
  assert.ok(/restart(?:s|ing)? are free/i.test(i18n.en.campaignAttemptCount(2)),
    'English attempt copy must state that restarts are free');
  assert.ok(/\u518d\u30b9\u30bf\u30fc\u30c8.*\u6e1b\u70b9\u306a\u3057/.test(i18n.ja.campaignAttemptCount(2)),
    'Japanese attempt copy must state that restarts have no penalty');
  const prepareSource = between('function prepareCampaignLaunch()', 'function campaignShouldRevealIncident(run)');
  assertSourceIncludes(prepareSource, 'boundedInt(campaignState.attempts[ep.id] + 1, 1, 9999, 1)',
    'each prepared replay must derive and clamp the next attempt number');
  assert.ok(!/campaignState\.attempts\[ep\.id\]\s*=/.test(prepareSource),
    'merely opening an incident reveal must not consume an attempt');
  assertSourceIncludes(prepareSource, 'var seed = failed ? failed.seed',
    'a failed restart must replay the same deterministic incident seed');
  assertSourceIncludes(prepareSource, 'retryMatches ? retry.runState : campaignRunState',
    'a failed restart must replay from the same pre-episode carryover state');
  const launchSource = between('function launch()', 'function restartTimer()');
  assertSourceIncludes(launchSource, 'campaignState.attempts[preparedCampaignRun.episodeId] = preparedCampaignRun.attempt',
    'an attempt must be recorded only when the locked run actually launches');
  const transitionSource = between('function commitCampaignTransition(res)', 'function campaignEvidenceText(items)');
  assertSourceIncludes(transitionSource, 'p.transitionId === run.transitionId',
    'campaign result commits must use a replay idempotency key');
  assertSourceIncludes(transitionSource, 'campaignState.provenance = campaignState.provenance.slice(0, 10)',
    'campaign replay provenance must remain bounded after repeated restarts');
  assert.ok(/if \(success && scenarioResult && scenarioResult\.runStateAfter\)/.test(transitionSource),
    'failed restarts must not consume carryover resources or operational capacity');
}

function incidentDialogRegression() {
  const sheet = htmlSource.match(/<div class="sheet campaign-incident-sheet"[^>]*>/);
  assert.ok(sheet, 'campaign incident must use the shared modal sheet');
  assert.ok(/role="dialog"/.test(sheet[0]) && /aria-modal="true"/.test(sheet[0]),
    'campaign incident must expose modal dialog semantics');
  assert.ok(/aria-labelledby="campaign-incident-title"/.test(sheet[0]) && /aria-describedby="campaign-incident-body"/.test(sheet[0]),
    'campaign incident must name and describe itself');
  const status = elementById('div', 'campaign-incident-status');
  assert.ok(/role="status"/.test(status) && /aria-live="assertive"/.test(status) && /aria-atomic="true"/.test(status),
    'incident reveal must have one concise atomic live announcement');

  const topSource = between('function topModal()', 'function makeMinuteSim(seg, seed');
  const incidentAt = topSource.indexOf("'campaign-incident-modal'");
  const predictionAt = topSource.indexOf("'prediction-modal'");
  assert.ok(incidentAt >= 0 && predictionAt > incidentAt, 'campaign incident must win the shared top-modal ordering');
  const openSource = between('function openCampaignIncident()', 'function acceptCampaignIncident()');
  assert.ok(openSource.indexOf("modalOpening('campaign-incident-modal')") < openSource.indexOf("classList.add('show')"),
    'incident reveal must capture its focus invoker before becoming visible');
  assertSourceIncludes(openSource, "$('campaign-incident-status').textContent", 'incident reveal must update its live region');
  assertSourceIncludes(openSource, 'setCampaignAuthoringInert(true)', 'incident reveal must make authoring inert');
  assert.ok(/campaign-incident-run[\s\S]*focus\(\{ preventScroll: true \}\)/.test(openSource),
    'incident reveal must move focus to its explicit continuation without scrolling the world');
  assert.ok(source.indexOf("if (top === 'campaign-incident-modal') return") >= 0,
    'Escape must not dismiss a locked incident behind its one explicit continuation');
  assert.ok(source.indexOf("if (e.key === 'Tab' && top)") >= 0 && source.indexOf("if (!sheet.contains(act))") >= 0,
    'the shared modal keyboard handler must trap focus inside the top dialog');
  assert.ok(/@media\(prefers-reduced-motion:reduce\)\{[^}]*[\s\S]*?\.campaign-incident-sheet\{animation:none;\}/.test(styleSource),
    'reduced motion must replace the incident entrance animation with a static reveal');
}

function dashboardSemanticsRegression() {
  const button = elementById('button', 'btn-drawer');
  assert.ok(/aria-controls="dashboard"/.test(button) && /aria-expanded="true"/.test(button),
    'dashboard trigger must expose its controlled panel and initial expanded state');
  const setterSource = between('function setDashboardOpen(open, shouldRefit)', 'function updateRunButtons()');
  let refits = 0;
  function fakeNode() {
    return {
      attrs: {}, textContent: '',
      classList: { toggles: [], toggle: function (name, value) { this.toggles.push([name, value]); } },
      setAttribute: function (key, value) { this.attrs[key] = String(value); },
      removeAttribute: function (key) { delete this.attrs[key]; }
    };
  }
  const nodes = { runwrap: fakeNode(), dashboard: fakeNode(), 'btn-drawer': fakeNode() };
  const context = {
    dashboardOpen: true,
    $: function (id) { return nodes[id] || null; },
    T: function () { return { drawerHide: 'Hide', drawerShow: 'Show', drawerAria: 'Toggle dashboard' }; },
    refitStage: function () { refits++; }
  };
  vm.runInNewContext(`${setterSource}\nthis.__setDashboardOpen = setDashboardOpen;`, context, {
    filename: 'app.js#dashboard-state'
  });
  context.__setDashboardOpen(false, true);
  assert.strictEqual(nodes['btn-drawer'].attrs['aria-expanded'], 'false', 'closed dashboard trigger must expose aria-expanded=false');
  assert.strictEqual(nodes.dashboard.attrs['aria-hidden'], 'true', 'closed dashboard must expose aria-hidden=true');
  assert.ok(Object.prototype.hasOwnProperty.call(nodes.dashboard.attrs, 'inert'), 'closed dashboard must be removed from keyboard interaction');
  assert.deepStrictEqual(nodes.runwrap.classList.toggles.pop(), ['drawer-closed', true], 'closed dashboard must use the matching visual class');
  assert.strictEqual(refits, 1, 'an interactive dashboard toggle must refit the stage once');
  context.__setDashboardOpen(true, false);
  assert.strictEqual(nodes['btn-drawer'].attrs['aria-expanded'], 'true', 'open dashboard trigger must expose aria-expanded=true');
  assert.strictEqual(nodes.dashboard.attrs['aria-hidden'], 'false', 'open dashboard must expose aria-hidden=false');
  assert.ok(!Object.prototype.hasOwnProperty.call(nodes.dashboard.attrs, 'inert'), 'open dashboard must rejoin keyboard interaction');
  assert.strictEqual((source.match(/drawer-closed/g) || []).length, 1,
    'all dashboard visual-state changes must flow through the accessible setter');
}

function campaignReportOrderRegression() {
  const cardStart = htmlSource.indexOf('id="campaign-report-card"');
  const reportStageStart = htmlSource.indexOf('id="report-stage-panel"');
  const legacyStart = htmlSource.indexOf('<div class="card report">', cardStart);
  const summaryAt = htmlSource.indexOf('id="campaign-report-summary"', cardStart);
  const metricsAt = htmlSource.indexOf('id="campaign-report-metrics"', cardStart);
  assert.ok(cardStart >= 0 && reportStageStart > cardStart,
    'named human campaign debrief must precede the score-focused report stage');
  assert.ok(legacyStart > cardStart, 'campaign debrief must precede the legacy score report');
  assert.ok(summaryAt > cardStart && metricsAt > summaryAt, 'human consequence summary must precede campaign metrics in DOM order');
  const renderSource = between('function renderCampaignReport(res)', 'function campaignReportContinue()');
  assert.ok(renderSource.indexOf("$('campaign-report-summary').textContent") < renderSource.indexOf("$('campaign-report-metrics').innerHTML"),
    'campaign renderer must establish the human-first summary before score/resilience metrics');
  const masteryAt = renderSource.indexOf('t.campaignMasteryLabel');
  const efficiencyAt = renderSource.indexOf('t.campaignEfficiencyLabel');
  const resilienceAt = renderSource.indexOf('t.campaignResilienceLabel');
  const debtAt = renderSource.indexOf('t.campaignOperationalDebtLabel');
  assert.ok(masteryAt >= 0 && efficiencyAt > masteryAt && resilienceAt > efficiencyAt && debtAt > resilienceAt,
    'campaign metrics must read mastery, efficiency, resilience, then operational debt');
  assert.ok(/\.campaign-report-metrics\s*\{[^}]*grid-template-columns\s*:\s*repeat\(4,minmax\(0,1fr\)\)/.test(styleSource),
    'the four campaign metrics must share one balanced desktop row');
  assert.ok(/@media\(max-width:760px\)\{[\s\S]*?\.campaign-report-metrics\s*\{grid-template-columns\s*:\s*1fr;\}/.test(styleSource),
    'the campaign metrics must collapse to one readable mobile column');
}

function campaignHumanNarrativeRegression() {
  const narrativeSource = between('function campaignNamedPerson(plan, pid, fallback)', 'function campaignResilienceText(outcome, strings)');
  const context = {
    L: 'en',
    T: function () { return i18n.en; },
    byId: function (items, id) { return (items || []).filter(function (item) { return item.id === id; })[0] || null; },
    nm: function (name) { return context.L === 'ja' ? (name.jp || name.en || '') : (name.en || name.jp || ''); }
  };
  vm.runInNewContext(`${narrativeSource}\nthis.__humanNarrative = campaignHumanNarrative;`, context, {
    filename: 'app.js#campaign-human-narrative'
  });
  const plan = engine.mergePlan({ seed: 1, overrides: {} });
  const before = JSON.stringify(plan);
  const normal = context.__humanNarrative({ episodeId: 'normal', success: true, executionComplete: true }, {}, plan, i18n.en);
  assert.ok(/Andrew/.test(normal.title) && /Andrew/.test(normal.summary),
    'normal campaign report must lead with the named person responsible for boarding evidence');
  const comms = context.__humanNarrative({ episodeId: 'comms-outage', success: false, executionComplete: true }, {}, plan, i18n.en);
  assert.ok(/Akiyama/.test(comms.title) && /Akiyama/.test(comms.summary),
    'communications report must lead with the named person who needed the at-sea brief');
  const principal = context.__humanNarrative({ episodeId: 'principal-unavailable', success: true, executionComplete: true },
    { strategyId: 'deputy-command' }, plan, i18n.en);
  assert.ok(/Inaba/.test(principal.title) && /Matsumoto/.test(principal.title),
    'delegation report must name both the acting deputy and unavailable principal');
  const debt = context.__humanNarrative({ episodeId: 'principal-unavailable', success: true, executionComplete: true, recoveredWithDebt: true },
    { strategyId: 'intervention-token' }, plan, i18n.en);
  assert.ok(/Inaba/.test(debt.title) && /operational debt/i.test(debt.summary),
    'live intervention report must name its actor and human/carryover cost');
  const incomplete = context.__humanNarrative({ episodeId: 'principal-unavailable', success: false, executionComplete: false },
    { strategyId: 'deputy-command' }, plan, i18n.en);
  assert.ok(/not evaluated/i.test(incomplete.summary) && /no badge/i.test(incomplete.summary),
    'an incomplete Return rehearsal must say the authority route was not evaluated and award no badge');
  assert.ok(/makes no claim that the command route failed/i.test(incomplete.summary),
    'an incomplete rehearsal must not falsely diagnose the authored command route');
  context.L = 'ja';
  const japanese = context.__humanNarrative({ episodeId: 'comms-outage', success: true, executionComplete: true }, {}, plan, i18n.ja);
  assert.ok(/秋山/.test(japanese.title) && /秋山/.test(japanese.summary),
    'Japanese campaign narrative must preserve the same named-human consequence');
  const japaneseIncomplete = context.__humanNarrative({ episodeId: 'principal-unavailable', success: false, executionComplete: false },
    { strategyId: 'deputy-command' }, plan, i18n.ja);
  assert.ok(/評価していない/.test(japaneseIncomplete.summary) && /失敗したとも判断しません/.test(japaneseIncomplete.summary),
    'Japanese incomplete copy must preserve the same neutral not-evaluated conclusion');
  assert.strictEqual(JSON.stringify(plan), before, 'campaign narrative projection must not mutate its frozen plan input');

  const completionSource = between('function campaignExecutionComplete(res)', 'function campaignRunEfficiency(run, res)');
  const completionContext = { Number: Number, isFinite: isFinite };
  vm.runInNewContext(`${completionSource}\nthis.__campaignExecutionComplete = campaignExecutionComplete;`, completionContext, {
    filename: 'app.js#campaign-execution-complete'
  });
  assert.strictEqual(completionContext.__campaignExecutionComplete({}), false,
    'missing execution evidence must never earn campaign success');
  assert.strictEqual(completionContext.__campaignExecutionComplete({ executionIncomplete: true, execution: { tasksDone: 5, tasksTotal: 5 } }), false,
    'an explicitly stopped rehearsal must never earn campaign success');
  assert.strictEqual(completionContext.__campaignExecutionComplete({ execution: { tasksDone: 4, tasksTotal: 5 } }), false,
    'partial task completion must never earn campaign success');
  assert.strictEqual(completionContext.__campaignExecutionComplete({ execution: { tasksDone: 5, tasksTotal: 5 } }), true,
    'complete execution evidence may advance to the planning/scenario gates');
  const transitionSource = between('function commitCampaignTransition(res)', 'function campaignEvidenceText(items)');
  assert.ok(/else if \(executionComplete && typeof P\.evaluateScenario === 'function'\)/.test(transitionSource),
    'scenario success and carryover cost must be gated on complete execution evidence');
}

function campaignTransitionOutcomeRegression() {
  const transitionSource = between('function campaignChapterEvidence(plan, trip, segment, res)', 'function campaignEvidenceText(items)');

  function harness(evaluator) {
    let evaluations = 0;
    let runStatePersists = 0;
    let progressPersists = 0;
    const initialRunState = { version: 1, cashReserve: 300000, teamCapacity: 100, criticalInventory: 2,
      guestWait: 0, interventionTokens: 1, operationalDebt: 0, resilienceBadges: [] };
    const context = {
      P: {
        mergePlan: function (cfg) { return JSON.parse(JSON.stringify(cfg || {})); },
        dayReadiness: function () { return []; },
        daySchedule: function () { return { unresolved: 0, efficiency: 91 }; },
        evaluateScenario: function () {
          evaluations++;
          return evaluator.apply(null, arguments);
        },
        migrateRunState: function (state) { return JSON.parse(JSON.stringify(state)); }
      },
      campaignCopy: function (value) { return JSON.parse(JSON.stringify(value)); },
      campaignState: {
        provenance: [], bestResults: { normal: null, 'comms-outage': null, 'principal-unavailable': null },
        chapterProgress: { load: { status: 'mastered', bestResult: 100 }, voyage: { status: 'mastered', bestResult: 100 },
          arrival: { status: 'mastered', bestResult: 100 }, ops: { status: 'mastered', bestResult: 100 },
          fishday: { status: 'mastered', bestResult: 100 }, return: { status: 'available', bestResult: null } },
        discoveredStrategies: [], badges: [], currentEpisode: 2, guidanceStep: 'rehearse'
      },
      campaignRunState: JSON.parse(JSON.stringify(initialRunState)),
      campaignRetrySnapshots: {},
      CAMPAIGN_CHAPTERS: ['load', 'voyage', 'arrival', 'ops', 'fishday', 'return'],
      CAMPAIGN_EPISODES: [{ id: 'normal' }, { id: 'comms-outage' }, { id: 'principal-unavailable' }],
      sanitizeCampaignResult: function (value) { return JSON.parse(JSON.stringify(value)); },
      persistCampaignRunState: function () { runStatePersists++; },
      persistCampaignState: function () { progressPersists++; },
      clamp: function (value, lo, hi) { return Math.max(lo, Math.min(hi, value)); },
      Date: Date,
      JSON: JSON,
      Math: Math,
      Number: Number,
      String: String,
      Array: Array,
      Object: Object,
      isFinite: isFinite
    };
    vm.runInNewContext(`${transitionSource}\nthis.__campaignTransitionQA = { commit: commitCampaignTransition };`, context, {
      filename: 'app.js#campaign-transition'
    });
    return {
      context: context,
      commit: context.__campaignTransitionQA.commit,
      evaluations: function () { return evaluations; },
      persistence: function () { return { runState: runStatePersists, progress: progressPersists }; }
    };
  }

  function runFor(transitionId, strategyId) {
    return { transitionId: transitionId, episodeId: 'principal-unavailable', episodeIndex: 2, attempt: 1,
      seed: 317, segment: 'return', strategyId: strategyId, planFingerprint: 'frozen-return-plan', planCfg: {},
      masterySnapshot: { total: 100, byBucket: { return: { earned: 15, maxPts: 15 } } },
      runState: { version: 1, cashReserve: 300000, teamCapacity: 100, criticalInventory: 2,
        guestWait: 0, interventionTokens: 1, operationalDebt: 0, resilienceBadges: [] } };
  }

  const incompleteHarness = harness(function () {
    throw new Error('evaluateScenario must not run for incomplete execution');
  });
  const incomplete = incompleteHarness.commit({ _campaignRun: runFor('return-14-of-15', 'deputy-command'),
    execution: { tasksDone: 14, tasksTotal: 15 } });
  assert.strictEqual(incompleteHarness.evaluations(), 0,
    'a principal-unavailable Return result at 14/15 tasks must never call evaluateScenario');
  assert.strictEqual(incomplete.executionComplete, false, '14/15 required Return tasks must remain execution-incomplete');
  assert.strictEqual(incomplete.success, false, 'incomplete execution must not pass the scenario gate');
  assert.strictEqual(incomplete.status, 'blocked', 'incomplete execution must use the neutral blocked status');
  assert.strictEqual(incomplete.badgeAwarded, null, 'incomplete execution must never award a resilience badge');
  assert.strictEqual(incomplete.reason, 'execution-incomplete', 'incomplete execution must retain a non-diagnostic reason');
  assert.strictEqual(incompleteHarness.context.campaignState.badges.length, 0,
    'incomplete execution must not mutate the badge collection');

  const interventionHarness = harness(function (_plan, episodeId, strategyId, runState) {
    assert.strictEqual(episodeId, 'principal-unavailable');
    assert.strictEqual(strategyId, 'intervention-token');
    const before = JSON.parse(JSON.stringify(runState));
    const after = JSON.parse(JSON.stringify(runState));
    after.interventionTokens = 0;
    after.guestWait = 15;
    after.operationalDebt = 2;
    return { success: true, status: 'recovered-with-debt', reason: 'intervention-recovery',
      badgeAwarded: null, recoveredWithDebt: true, evidence: ['intervention-used'],
      runStateBefore: before, runStateAfter: after,
      appliedDelta: { interventionTokens: -1, guestWait: 15, operationalDebt: 2 } };
  });
  const interventionRun = runFor('return-intervention-once', 'intervention-token');
  const first = interventionHarness.commit({ _campaignRun: interventionRun,
    execution: { tasksDone: 15, tasksTotal: 15 } });
  assert.strictEqual(first.success, true);
  assert.strictEqual(first.recoveredWithDebt, true, 'intervention recovery must be distinguished from badge resilience');
  assert.strictEqual(first.status, 'recovered-with-debt');
  assert.strictEqual(first.debtDelta, 2, 'the first intervention must record its +2 operational debt');
  assert.strictEqual(first.badgeAwarded, null, 'intervention recovery must award no badge');
  assert.strictEqual(interventionHarness.context.campaignState.badges.length, 0,
    'intervention recovery must not add a badge to campaign progress');
  assert.strictEqual(interventionHarness.evaluations(), 1, 'the completed transition must be evaluated exactly once');
  const persistedAfterFirst = interventionHarness.persistence();
  const replay = interventionHarness.commit({ _campaignRun: JSON.parse(JSON.stringify(interventionRun)),
    execution: { tasksDone: 15, tasksTotal: 15 } });
  assert.strictEqual(interventionHarness.evaluations(), 1,
    'replaying a committed transition id must not re-run scenario evaluation or its reducer');
  assert.deepStrictEqual(interventionHarness.persistence(), persistedAfterFirst,
    'replaying a committed transition must not persist a second carryover delta');
  assert.strictEqual(interventionHarness.context.campaignState.provenance.length, 1,
    'idempotent replay must not append duplicate provenance');
  assert.strictEqual(interventionHarness.context.campaignRunState.operationalDebt, 2,
    'idempotent replay must not reapply operational debt');
  assert.strictEqual(interventionHarness.context.campaignRunState.guestWait, 15,
    'idempotent replay must not reapply guest waiting cost');
  assert.strictEqual(interventionHarness.context.campaignRunState.interventionTokens, 0,
    'idempotent replay must not consume another intervention token');
  assert.strictEqual(replay.recoveredWithDebt, true, 'idempotent restoration must preserve recovered-with-debt');
  assert.strictEqual(replay.status, 'recovered-with-debt', 'idempotent restoration must preserve the outcome status');
  assert.strictEqual(replay.debtBefore, 0);
  assert.strictEqual(replay.debtAfter, 2);
  assert.strictEqual(replay.debtDelta, 2, 'idempotent restoration must report the original +2 debt, not a synthetic zero');
  assert.strictEqual(replay.appliedDelta.operationalDebt, 2,
    'idempotent restoration must reconstruct the original debt delta without applying it');
  assert.strictEqual(replay.badgeAwarded, null, 'idempotent intervention restoration must remain badge-free');
}

function stageAssistiveParitySurfaceRegression() {
  const status = elementById('div', 'stage-presentation-status');
  assert.ok(/role="status"/.test(status) && /aria-live="polite"/.test(status) && /aria-atomic="true"/.test(status),
    'causal stage beats need a concise atomic assistive-technology mirror');
  const relationships = elementById('div', 'stage-relationships');
  assert.ok(/aria-label=/.test(relationships), 'visible relationship cues need an accessible named mirror');
}

const buddySource = between(
  'function buddyAssignmentsWithinCap(defaults, overrides, cap)',
  'function validDayState(v, seg, domain)'
);
const buddyContext = {};
vm.runInNewContext(`${buddySource}\nthis.checkBuddyCap = buddyAssignmentsWithinCap;`, buddyContext);

const defaults = { gd_watanabe: 'p01', gd_maeda: 'p04' };
assert.strictEqual(
  buddyContext.checkBuddyCap(defaults, { gd_nagatani: 'p01', gd_kadou: 'p01' }, 2),
  false,
  'seeded and override buddies must share the same per-person cap'
);
assert.strictEqual(
  buddyContext.checkBuddyCap(defaults, { gd_watanabe: null, gd_nagatani: 'p01', gd_kadou: 'p01' }, 2),
  true,
  'a null override must remove its seeded buddy before load counting'
);

const validationSource = between(
  'function validateAuthoringState(v)',
  'function validatePlanEnvelope(v)'
);
assert(
  validationSource.includes('buddyAssignmentsWithinCap(domain.template.buddies, v.buddyOv, 2)'),
  'authoring import validation must check the effective seeded-plus-override buddy map'
);

const verdictSource = between(
  'function reportReadinessVerdict(plan, rehearsalComplete)',
  'function appendAssumptionCondition(plan, compact)'
);
const verdictContext = {};
vm.runInNewContext(`
  var readiness;
  function executionReadiness() { return readiness; }
  function T() {
    return {
      rehearsalFactsPending: function (n) { return 'pending:' + n; },
      realExecutionReady: 'ready',
      rehearsalComplete: 'complete'
    };
  }
  ${verdictSource}
  this.setReadiness = function (value) { readiness = value; };
  this.verdict = reportReadinessVerdict;
`, verdictContext);

verdictContext.setReadiness({ rehearsalComplete: false, realExecutionReady: false, unresolvedCount: 5, unresolved: [] });
assert.strictEqual(
  verdictContext.verdict({}, true),
  null,
  'a caller-local success cannot override an engine-incomplete whole rehearsal'
);
verdictContext.setReadiness({ rehearsalComplete: true, realExecutionReady: false, unresolvedCount: 5, unresolved: [] });
assert.strictEqual(verdictContext.verdict({}, true), 'pending:5');
verdictContext.setReadiness({ rehearsalComplete: true, realExecutionReady: true, unresolvedCount: 0, unresolved: [] });
assert.strictEqual(verdictContext.verdict({}, true), 'ready');

nativeJourneyEntryRegression();
campaignTranslationParityRegression();
journeyModeSwitchRegression();
campaignStorageRegression();
scenarioAuthoringPurityRegression();
frozenRunSnapshotRegression();
campaignFreezeScopeRegression();
restartAttemptRegression();
incidentDialogRegression();
dashboardSemanticsRegression();
campaignReportOrderRegression();
campaignHumanNarrativeRegression();
campaignTransitionOutcomeRegression();
stageAssistiveParitySurfaceRegression();

console.log('UI regression checks passed.');
