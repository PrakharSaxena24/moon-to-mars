/* ============================================================================
 * Project Rehearsal Simulator — engine (window.PRS), pure sim, browser + Node.
 *
 * Rehearse a project BEFORE you run it. You hold a plan (goal, roles, tasks,
 * info cards, budget, risks, report routes). Press Run: simple characters walk a
 * site map and reveal the plan's weaknesses — they hesitate (迷い), huddle with no
 * decision (合議), wait on approval (確認待ち), sit exhausted (疲労), or go into
 * crisis (炎上). Every stall is COMPUTED from a plan-data gap, never random
 * (spec §12/§20: an explainable rule engine). Fix the gaps, re-run toward 100.
 *
 * The validation scenario is the real 小笠原 (Ogasawara) 10-day / 24-person event.
 * The TEMPLATE ships intentionally GAPPY so the first run fails and teaches; each
 * applyFix() writes the canonical correction so the score climbs.
 *
 * Deterministic (seeded RNG): a plan reproduces the same run. Node-runnable so the
 * teaching gradient is headless-verified (verify.js).
 * ==========================================================================*/
(function (global) {
  'use strict';

  // ---- tunables ----
  var DT = 0.25;                 // days per tick (10 days -> 40 ticks)
  var DAYS = 10;
  var HEADCOUNT = 24;            // total people on the trip
  var STAFF = 8;                 // AIBOS organizers who actually run the event
  var CHEFS = 3;                 // contracted cooks (料理長＋2) — cook for the guests
  var GUESTS = HEADCOUNT - STAFF - CHEFS; // 13 group-company guests being hosted (don't work)
  var LOAD_CAP = 3;              // tasks on one person before fatigue concentrates
  var FATIGUE_RATE = 9;         // per active task-tick on an overloaded person
  // shared grade thresholds (rubric v1.0 §2) — consumed by scoreTrip (A also requires clean),
  // scoreDay, and score. B >= 75 · C >= 60 · else D.
  var GRADE_BANDS = { A: 90, B: 75, C: 60 };

  // ---- fishday tunables (hour-block authoring; detailed rehearsal math stays minute-precise) ----
  var MIN_DT = 5;                // minutes per fine tick
  var DAY_START_MIN = 240;       // 04:00 — window opens (covers the 04:15 pre-dawn intelligence)
  var DAY_END_MIN = 1200;        // 20:00 — window closes
  var IDLE_TOL = 0;              // idle minutes tolerated before handoffTiming fires
  var IDLE_CAP = 60;             // idle charged to a task whose needed arrow was never drawn
  var CHANNELS = { faceToFace: 0, radio: 1, phone: 2, chat: 10, board: 30 }; // send latency, minutes

  // One controlled Day-3 learning root has three authored, fully deterministic
  // solutions. The score still prices the food->menu SOCKET once; these ids only
  // let the editor author different operational paths and compare their trade-offs.
  var DAY3_FOOD_STRATEGY_IDS = ['direct-fast', 'delegated-relay', 'redundant-paths'];
  var DAY3_FOOD_ROOT = { segment: 'fishday', taskId: 't_f_menu', cardId: 'ic_food' };
  var DAY3_FOOD_HANDOFF_IDS = [
    'h_food', 'h_food_relay_intake', 'h_food_relay_delivery',
    'h_food_primary_radio', 'h_food_backup_phone'
  ];
  var DAY3_FOOD_RECIPE_HANDOFFS = {
    'direct-fast': ['h_food'],
    'delegated-relay': ['h_food_relay_intake', 'h_food_relay_delivery'],
    'redundant-paths': ['h_food_primary_radio', 'h_food_backup_phone']
  };
  var DAY3_FOOD_HANDOFF_STRATEGY = {
    h_food: 'direct-fast',
    h_food_relay_intake: 'delegated-relay', h_food_relay_delivery: 'delegated-relay',
    h_food_primary_radio: 'redundant-paths', h_food_backup_phone: 'redundant-paths'
  };

  // §13.1/refinement-1: species -> allergen CATEGORY map, so the allergy gate checks a real
  // category intersection (ic_food.allergens holds category tokens like 'shellfish') instead
  // of a literal species/category string match. skipjack/mackerel are 'fish' (never intersects
  // a 'shellfish' allergen); shrimp/crab/prawn/lobster are 'shellfish' (correctly FAILS).
  var SPECIES_CATEGORIES = {
    skipjack: ['fish'], mackerel: ['fish'], tuna: ['fish'], sabaFish: ['fish'],
    shrimp: ['shellfish'], crab: ['shellfish'], prawn: ['shellfish'], lobster: ['shellfish']
  };

  // ---- default island-day bounds (Ops and other local days) — feed DAY_WINDOWS below ----
  var DAY_HOUR_START = 300;      // 05:00 — coarse-day authoring window opens
  var DAY_HOUR_END = 1140;       // 19:00 — coarse-day authoring window closes (14h window)

  // ---- §20 authorable all-days tunables (the deck→arrange→connect editor + minute clock read these) ----
  // SNAP_MIN: per-segment placement-snap granularity for the future draggable editor.
  // DAY_WINDOWS: the authoring window [openMin,closeMin] per segment (mirrors DAY_START_MIN/
  // DAY_END_MIN for fishday and DAY_HOUR_START/DAY_HOUR_END for the coarse days, unified).
  // AUTHORABLE: the segment ids the future deck→arrange→connect editor will cover.
  var SNAP_MIN = { load: 30, voyage: 60, arrival: 60, ops: 60, return: 60, fishday: 60 };
  // Authoritative outbound anchors supplied by the trip owner. Breakfast has NO confirmed
  // time; 08:00 below is only the left edge of the rehearsal canvas and is never exposed as
  // a fact (the breakfast task carries timeStatus:'unknown'). Hotel departure and the
  // Ogasawara-maru sailing are confirmed at 10:00 and 11:00. The long-haul close is an
  // APPROXIMATE +24h boundary, not a claimed arrival timetable.
  var LOAD_CANVAS_START_MIN = 480, HOTEL_DEPART_MIN = 600, SAIL_MIN = 660;
  var VOYAGE_APPROX_MIN = 1440, VOYAGE_END_MIN = SAIL_MIN + VOYAGE_APPROX_MIN;
  // Arrival uses sequence anchors after the approximate long-haul boundary. Every inter-island
  // task is explicitly marked timeStatus:'unknown'; the numbers keep the rehearsal engine
  // deterministic without inventing a published connection. Return is the inferred reverse
  // sequence and therefore has no confirmed timetable either.
  var ARRIVAL_END_MIN = VOYAGE_END_MIN + 600, RETURN_END_MIN = 2580;
  var DAY_WINDOWS = { fishday: [DAY_START_MIN, DAY_END_MIN], arrival: [VOYAGE_END_MIN, ARRIVAL_END_MIN],
    ops: [DAY_HOUR_START, DAY_HOUR_END], return: [DAY_HOUR_START, RETURN_END_MIN],
    load: [LOAD_CANVAS_START_MIN, SAIL_MIN], voyage: [SAIL_MIN, VOYAGE_END_MIN] };
  var AUTHORABLE = ['load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];

  function mulberry32(seed) { var a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function L(en, jp) { return { en: en, jp: jp }; }

  // ---- deterministic teaching scenarios --------------------------------------
  // A modifier is one small, declarative constraint. Curated scenarios compose
  // those constraints; they never patch the authored plan or roll hidden dice.
  // This keeps normal mastery frozen while giving the campaign a separate,
  // explainable resilience result. The legacy `unavailableAtSea` field remains on
  // every composed scenario because channelFeasibility has shipped that contract.
  var SCENARIO_MODIFIERS = {
    'at-sea-comms-loss': {
      id: 'at-sea-comms-loss', unavailableAtSea: ['phone', 'chat', 'board'],
      tags: ['communications', 'at-sea']
    },
    'storm-weather': {
      id: 'storm-weather', weatherState: 'storm', fishingAllowed: false,
      tags: ['weather', 'safety']
    },
    'principal-offline': {
      id: 'principal-offline', unavailableRoleIds: ['owner'],
      tags: ['delegation', 'authority']
    },
    'low-catch-yield': {
      id: 'low-catch-yield', catchYieldPct: 35,
      resourceDemand: { fallbackFood: 1 }, tags: ['supply', 'guest-care']
    }
  };
  function scenarioAddUnique(out, values) {
    values = values || [];
    for (var i = 0; i < values.length; i++) if (out.indexOf(values[i]) < 0) out.push(values[i]);
  }
  // Public pure composer. Unknown modifier ids are retained as evidence but have
  // no effect, so imported future content fails safely instead of inventing rules.
  function composeScenario(modifierIds, meta) {
    modifierIds = Array.isArray(modifierIds) ? modifierIds.slice() : [];
    meta = meta || {};
    var out = {
      id: meta.id || 'custom', name: clone(meta.name || L('Custom rehearsal', 'カスタムリハーサル')),
      modifierIds: [], unknownModifierIds: [], unavailableAtSea: [], unavailableRoleIds: [],
      weatherState: 'normal', fishingAllowed: true, catchYieldPct: 100,
      resourceDemand: {}, tags: [], revealPhase: meta.revealPhase || 'pre-run',
      badgeId: meta.badgeId || null, strategyIds: (meta.strategyIds || []).slice()
    };
    for (var i = 0; i < modifierIds.length; i++) {
      var id = modifierIds[i], m = SCENARIO_MODIFIERS[id];
      if (out.modifierIds.indexOf(id) >= 0 || out.unknownModifierIds.indexOf(id) >= 0) continue;
      if (!m) { out.unknownModifierIds.push(id); continue; }
      out.modifierIds.push(id);
      scenarioAddUnique(out.unavailableAtSea, m.unavailableAtSea);
      scenarioAddUnique(out.unavailableRoleIds, m.unavailableRoleIds);
      scenarioAddUnique(out.tags, m.tags);
      if (m.weatherState) out.weatherState = m.weatherState;
      if (m.fishingAllowed === false) out.fishingAllowed = false;
      if (typeof m.catchYieldPct === 'number') out.catchYieldPct = Math.min(out.catchYieldPct, m.catchYieldPct);
      if (m.resourceDemand) for (var k in m.resourceDemand) {
        if (!Object.prototype.hasOwnProperty.call(m.resourceDemand, k)) continue;
        out.resourceDemand[k] = (out.resourceDemand[k] || 0) + m.resourceDemand[k];
      }
    }
    out.modifierIds.sort(); out.unknownModifierIds.sort();
    out.unavailableAtSea.sort(); out.unavailableRoleIds.sort(); out.tags.sort();
    return out;
  }

  // Strategy vectors are deliberately data, not score. The campaign can compare
  // coordination, reserve, fatigue, delay, and redundancy without minting another
  // percentage or changing any of the frozen 99 mastery atoms.
  var SCENARIO_STRATEGIES = {
    normal: {
      'standard-plan': { id: 'standard-plan', label: L('Run the authored plan', '作成済み計画を実行'),
        vector: { coordinationWork: 0, cashCost: 0, fatigueLoad: 0, guestWaitMin: 0, redundancy: 0 }, runStateDelta: {} }
    },
    'comms-outage': {
      'radio-route': { id: 'radio-route', label: L('Use the marine-radio route', '船舶無線ルートを使う'),
        vector: { coordinationWork: 1, cashCost: 0, fatigueLoad: 2, guestWaitMin: 0, redundancy: 0 }, runStateDelta: { teamCapacity: -2 } },
      'redundant-paths': { id: 'redundant-paths', label: L('Use independent redundant paths', '独立した冗長経路を使う'),
        vector: { coordinationWork: 2, cashCost: 0, fatigueLoad: 4, guestWaitMin: 0, redundancy: 1 }, runStateDelta: { teamCapacity: -4 } }
    },
    'storm-no-go': {
      'shore-fallback': { id: 'shore-fallback', label: L('Activate the shore fallback', '陸上フォールバックを発動'),
        vector: { coordinationWork: 2, cashCost: 0, fatigueLoad: 8, guestWaitMin: 0, redundancy: 1 }, runStateDelta: { teamCapacity: -8, operationalDebt: 1 } },
      postpone: { id: 'postpone', label: L('Postpone and extend lodging', '延期して宿泊を延長'),
        vector: { coordinationWork: 1, cashCost: 60000, fatigueLoad: 2, guestWaitMin: 240, redundancy: 1 },
        runStateDelta: { cashReserve: -60000, teamCapacity: -2, guestWait: 240, operationalDebt: 1 } },
      'guarded-departure': { id: 'guarded-departure', label: L('Depart with extra safeguards', '追加安全策で出港'),
        vector: { coordinationWork: 3, cashCost: 0, fatigueLoad: 20, guestWaitMin: 0, redundancy: 0 }, runStateDelta: { teamCapacity: -20, operationalDebt: 3 } }
    },
    'principal-unavailable': {
      'deputy-command': { id: 'deputy-command', label: L('Activate the named deputy', '指名済みの代理を起動'),
        vector: { coordinationWork: 1, cashCost: 0, fatigueLoad: 4, guestWaitMin: 0, redundancy: 1 }, runStateDelta: { teamCapacity: -4 } },
      'distributed-command': { id: 'distributed-command', label: L('Use distributed decision authority', '分散した意思決定権限を使う'),
        vector: { coordinationWork: 3, cashCost: 0, fatigueLoad: 8, guestWaitMin: 0, redundancy: 2 }, runStateDelta: { teamCapacity: -8 } },
      'intervention-token': { id: 'intervention-token', label: L('Escalate with one intervention', '介入を1回使ってエスカレート'),
        liveRecovery: true, awardsBadge: false,
        vector: { coordinationWork: 2, cashCost: 0, fatigueLoad: 3, guestWaitMin: 15, redundancy: 0 },
        runStateDelta: { interventionTokens: -1, guestWait: 15, operationalDebt: 2 } }
    },
    'low-catch': {
      'fallback-supply': { id: 'fallback-supply', label: L('Buy the planned fallback supply', '計画済みの代替食材を購入'),
        vector: { coordinationWork: 2, cashCost: 60000, fatigueLoad: 2, guestWaitMin: 0, redundancy: 1 },
        runStateDelta: { cashReserve: -60000, teamCapacity: -2 } },
      'menu-substitution': { id: 'menu-substitution', label: L('Use the backup menu', '代替献立に切り替える'),
        vector: { coordinationWork: 2, cashCost: 0, fatigueLoad: 4, guestWaitMin: 0, redundancy: 1 },
        runStateDelta: { criticalInventory: -1, teamCapacity: -4 } },
      'quality-tradeoff': { id: 'quality-tradeoff', label: L('Accept a delayed simplified service', '遅れを受け入れ簡易提供にする'),
        vector: { coordinationWork: 1, cashCost: 0, fatigueLoad: 2, guestWaitMin: 60, redundancy: 0 },
        runStateDelta: { teamCapacity: -2, guestWait: 60, operationalDebt: 1 } }
    }
  };

  var SCENARIOS = {
    normal: composeScenario([], { id: 'normal', name: L('Normal rehearsal', '通常リハーサル'),
      strategyIds: ['standard-plan'] }),
    'comms-outage': composeScenario(['at-sea-comms-loss'], { id: 'comms-outage',
      name: L('At-sea communications outage', '海上通信障害'), revealPhase: 'checkpoint',
      badgeId: 'communications-resilient', strategyIds: ['radio-route', 'redundant-paths'] }),
    'storm-no-go': composeScenario(['storm-weather'], { id: 'storm-no-go',
      name: L('Storm / fishing no-go', '嵐・出漁不可'), revealPhase: 'after-lock',
      badgeId: 'weather-resilient', strategyIds: ['shore-fallback', 'postpone', 'guarded-departure'] }),
    'principal-unavailable': composeScenario(['principal-offline'], { id: 'principal-unavailable',
      name: L('Principal unavailable', '責任者が対応不可'), revealPhase: 'after-lock',
      badgeId: 'delegation-resilient', strategyIds: ['deputy-command', 'distributed-command', 'intervention-token'] }),
    'low-catch': composeScenario(['low-catch-yield'], { id: 'low-catch',
      name: L('Low catch', '不漁'), revealPhase: 'checkpoint',
      badgeId: 'supply-resilient', strategyIds: ['fallback-supply', 'menu-substitution', 'quality-tradeoff'] })
  };
  function scenarioProfile(id) { return clone(SCENARIOS[id] || SCENARIOS.normal); }
  function scenarioStrategy(scenarioId, strategyId) {
    var family = SCENARIO_STRATEGIES[scenarioId] || {};
    return family[strategyId] ? clone(family[strategyId]) : null;
  }
  function applyScenario(cfg, id, strategyId) {
    var out = clone(cfg || { seed: 1, overrides: {} });
    out.overrides = out.overrides || {};
    out.scenarioId = SCENARIOS[id] ? id : 'normal';
    delete out.scenarioStrategyId;
    if (strategyId && SCENARIO_STRATEGIES[out.scenarioId] && SCENARIO_STRATEGIES[out.scenarioId][strategyId]) {
      out.scenarioStrategyId = strategyId;
    }
    return out;
  }

  // ---- minimal versioned carryover + costly recovery -------------------------
  // RunState is intentionally small. It is campaign/execution state, never plan
  // authoring data; every reducer returns a new object and cannot repair score.
  var RUN_STATE_VERSION = 1;
  var RUN_STATE_LIMITS = {
    cashReserve: [0, 10000000], teamCapacity: [0, 100], criticalInventory: [0, 99],
    guestWait: [0, 10080], interventionTokens: [0, 20], operationalDebt: [0, 999]
  };
  function runStateNumber(value, fallback, bounds) {
    if (typeof value !== 'number' || !isFinite(value)) return fallback;
    return Math.max(bounds[0], Math.min(bounds[1], value));
  }
  function runStateBadges(value) {
    var out = [];
    if (!Array.isArray(value)) return out;
    for (var i = 0; i < value.length; i++) {
      if (typeof value[i] !== 'string' || !value[i] || value[i].length > 80 || out.indexOf(value[i]) >= 0) continue;
      out.push(value[i]);
    }
    return out;
  }
  function createRunState(values) {
    values = values || {};
    return {
      version: RUN_STATE_VERSION,
      cashReserve: runStateNumber(values.cashReserve, 300000, RUN_STATE_LIMITS.cashReserve),
      teamCapacity: runStateNumber(values.teamCapacity, 100, RUN_STATE_LIMITS.teamCapacity),
      criticalInventory: runStateNumber(values.criticalInventory, 2, RUN_STATE_LIMITS.criticalInventory),
      guestWait: runStateNumber(values.guestWait, 0, RUN_STATE_LIMITS.guestWait),
      interventionTokens: runStateNumber(values.interventionTokens, 1, RUN_STATE_LIMITS.interventionTokens),
      operationalDebt: runStateNumber(values.operationalDebt, 0, RUN_STATE_LIMITS.operationalDebt),
      resilienceBadges: runStateBadges(values.resilienceBadges)
    };
  }
  function validateRunState(raw) {
    var errors = [], fields = Object.keys(RUN_STATE_LIMITS), i, key, value, bounds;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      return { ok: false, errors: ['not-an-object'], state: null };
    }
    if (raw.version !== RUN_STATE_VERSION) errors.push('unsupported-version');
    for (i = 0; i < fields.length; i++) {
      key = fields[i]; value = raw[key]; bounds = RUN_STATE_LIMITS[key];
      if (typeof value !== 'number' || !isFinite(value) || value < bounds[0] || value > bounds[1]) errors.push('invalid-' + key);
    }
    if (!Array.isArray(raw.resilienceBadges)) errors.push('invalid-resilienceBadges');
    else {
      var seen = {};
      for (i = 0; i < raw.resilienceBadges.length; i++) {
        value = raw.resilienceBadges[i];
        if (typeof value !== 'string' || !value || value.length > 80 || seen[value]) {
          errors.push('invalid-resilienceBadges'); break;
        }
        seen[value] = true;
      }
    }
    return { ok: errors.length === 0, errors: errors, state: errors.length ? null : createRunState(raw) };
  }
  // Version 0 was the short-lived prototype vocabulary. Missing versions import
  // through this explicit mapping; unknown future versions fail closed as null.
  function migrateRunState(raw) {
    if (raw == null) return createRunState();
    if (typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (raw.version === RUN_STATE_VERSION) return validateRunState(raw).state;
    if (raw.version == null || raw.version === 0) {
      return createRunState({
        cashReserve: raw.cashReserve != null ? raw.cashReserve : raw.reserve,
        teamCapacity: raw.teamCapacity != null ? raw.teamCapacity : raw.capacity,
        criticalInventory: raw.criticalInventory != null ? raw.criticalInventory : raw.inventory,
        guestWait: raw.guestWait != null ? raw.guestWait : raw.wait,
        interventionTokens: raw.interventionTokens != null ? raw.interventionTokens : raw.tokens,
        operationalDebt: raw.operationalDebt != null ? raw.operationalDebt : raw.debt,
        resilienceBadges: raw.resilienceBadges != null ? raw.resilienceBadges : raw.badges
      });
    }
    return null;
  }
  function runStateFromPlan(plan, values) {
    var base = {}, k;
    if (plan && plan.budget && typeof plan.budget.reserve === 'number' && isFinite(plan.budget.reserve)) {
      base.cashReserve = plan.budget.reserve;
    }
    if (values && typeof values === 'object') for (k in values) if (Object.prototype.hasOwnProperty.call(values, k)) base[k] = values[k];
    return createRunState(base);
  }
  function applyRunStateDelta(runState, delta, badgeId) {
    var before = migrateRunState(runState);
    if (!before) return { ok: false, reason: 'unsupported-run-state-version', state: null, appliedDelta: {} };
    if (delta == null) delta = {};
    if (typeof delta !== 'object' || Array.isArray(delta)) {
      return { ok: false, reason: 'invalid-run-state-delta', state: before, appliedDelta: {} };
    }
    var next = createRunState(before), applied = {}, fields = Object.keys(RUN_STATE_LIMITS);
    for (var i = 0; i < fields.length; i++) {
      var key = fields[i];
      if (!Object.prototype.hasOwnProperty.call(delta, key)) continue;
      var amount = delta[key];
      if (typeof amount !== 'number' || !isFinite(amount)) {
        return { ok: false, reason: 'invalid-run-state-delta', state: before, appliedDelta: {} };
      }
      var value = before[key] + amount, bounds = RUN_STATE_LIMITS[key];
      if (value < bounds[0]) return { ok: false, reason: 'insufficient-' + key, state: before, appliedDelta: {} };
      if (value > bounds[1]) return { ok: false, reason: 'run-state-limit-' + key, state: before, appliedDelta: {} };
      next[key] = value; applied[key] = amount;
    }
    if (badgeId && next.resilienceBadges.indexOf(badgeId) < 0) next.resilienceBadges.push(badgeId);
    return { ok: true, reason: 'applied', state: next, appliedDelta: applied };
  }
  var RECOVERY_ACTIONS = {
    'reserve-purchase': { id: 'reserve-purchase', label: L('Spend reserve on an emergency purchase', '予備費で緊急購入'),
      runStateDelta: { cashReserve: -60000, operationalDebt: 1 } },
    'use-intervention': { id: 'use-intervention', label: L('Use one intervention token', '介入トークンを1つ使う'),
      runStateDelta: { interventionTokens: -1, operationalDebt: 1 } },
    'coordination-surge': { id: 'coordination-surge', label: L('Pull the team into a coordination surge', 'チームを緊急調整に投入'),
      runStateDelta: { teamCapacity: -10, operationalDebt: 2 } },
    'consume-backup': { id: 'consume-backup', label: L('Consume one critical backup', '重要な予備を1つ消費'),
      runStateDelta: { criticalInventory: -1 } },
    'accept-guest-wait': { id: 'accept-guest-wait', label: L('Accept a 30-minute guest wait', 'ゲストの30分待機を受け入れる'),
      runStateDelta: { guestWait: 30, operationalDebt: 1 } }
  };
  function applyRecovery(runState, recoveryId) {
    var action = RECOVERY_ACTIONS[recoveryId];
    if (!action) {
      var unchanged = migrateRunState(runState);
      return { ok: false, reason: 'unknown-recovery', recoveryId: recoveryId || null,
        state: unchanged, appliedDelta: {}, planChanged: false };
    }
    var result = applyRunStateDelta(runState, action.runStateDelta);
    result.recoveryId = recoveryId; result.planChanged = false;
    return result;
  }

  function planWithScenario(plan, id) {
    var out = {}, k;
    plan = plan || makeTemplate();
    for (k in plan) if (Object.prototype.hasOwnProperty.call(plan, k)) out[k] = plan[k];
    out.scenarioId = SCENARIOS[id] ? id : 'normal';
    return out;
  }
  function scenarioRoleForHolder(plan, holderId) {
    for (var id in plan.roles) if (plan.roles[id] && plan.roles[id].holder === holderId) return id;
    return null;
  }
  function scenarioDecisionReady(plan, roleId) {
    var roleDef = plan.roles && plan.roles[roleId];
    return !!(roleDef && roleDef.holder && roleDef.authority && roleDef.authority.canDecide === true);
  }
  function scenarioRiskReady(plan, riskId) {
    var risk = byId(plan.risks || [], riskId);
    return !!(risk && risk.ownerRoleId && risk.abortCriterion && risk.fallback);
  }
  function scenarioCardShared(plan, cardId, roleIds) {
    var card = byId(plan.infoCards || [], cardId), recipients = card && card.recipientRoleIds;
    if (!Array.isArray(recipients)) return false;
    for (var i = 0; i < roleIds.length; i++) if (recipients.indexOf(roleIds[i]) < 0) return false;
    return true;
  }
  function scenarioBaseResult(plan, scenarioId, strategyId) {
    var evidence = [], success = false, ds, food, owner, deputyRole, card, event, line, resource;
    if (scenarioId === 'normal') {
      var normalScore = scoreTrip(planWithScenario(plan, 'normal'));
      success = normalScore.total === 100 && normalScore.gate.clean;
      evidence.push(success ? 'mastered-plan' : 'plan-needs-repair');
    } else if (scenarioId === 'comms-outage') {
      ds = daySchedule(plan, 'fishday');
      success = ds.missing.length === 0 && ds.late.length === 0 && ds.unresolved === 0;
      if (strategyId === 'redundant-paths') {
        food = day3FoodStrategy(plan);
        success = success && food.singlePathFailureTolerance >= 1;
        evidence.push(food.singlePathFailureTolerance >= 1 ? 'independent-backup-path' : 'no-independent-backup-path');
      } else {
        var seaRelays = handoffsForSeg(plan, 'fishday').filter(function (h) {
          var f = channelFeasibility(plan, h, 'fishday');
          return f.ok && (f.fromContext.atSea || f.toContext.atSea) && h.channel === 'radio';
        });
        success = success && seaRelays.length > 0;
        evidence.push(seaRelays.length > 0 ? 'marine-radio-route' : 'no-marine-radio-route');
      }
      evidence.push(ds.unresolved === 0 ? 'all-required-information-delivered' : 'information-path-unresolved');
    } else if (scenarioId === 'storm-no-go') {
      var riskReady = scenarioRiskReady(plan, 'rk_sea');
      if (strategyId === 'shore-fallback') {
        success = riskReady && dayReadiness(plan, 'ops').length === 0;
        evidence.push(riskReady ? 'rough-sea-owner-and-abort-set' : 'rough-sea-governance-missing');
        evidence.push(dayReadiness(plan, 'ops').length === 0 ? 'shore-program-ready' : 'shore-program-not-ready');
      } else if (strategyId === 'postpone') {
        success = riskReady && (scenarioDecisionReady(plan, 'pm') || scenarioDecisionReady(plan, 'owner'));
        evidence.push(riskReady ? 'postpone-fallback-authored' : 'postpone-fallback-not-governed');
        evidence.push(success ? 'decision-authority-available' : 'decision-authority-missing');
      } else {
        success = false; evidence.push('hard-no-go-prohibits-departure');
      }
    } else if (scenarioId === 'principal-unavailable') {
      owner = plan.roles && plan.roles.owner;
      if (strategyId === 'deputy-command') {
        deputyRole = owner && owner.deputyId ? scenarioRoleForHolder(plan, owner.deputyId) : null;
        card = byId(plan.infoCards || [], 'ic_return');
        success = !!(deputyRole && scenarioDecisionReady(plan, deputyRole) && card && card.recipientRoleIds.indexOf(deputyRole) >= 0);
        evidence.push(deputyRole ? 'named-deputy-' + deputyRole : 'named-deputy-missing');
        evidence.push(success ? 'deputy-has-authority-and-information' : 'deputy-lacks-authority-or-information');
      } else if (strategyId === 'distributed-command') {
        var site = plan.roles && plan.roles.siteLead, safety = plan.roles && plan.roles.safetyLead;
        var authorityReady = scenarioDecisionReady(plan, 'siteLead') && scenarioDecisionReady(plan, 'safetyLead') &&
          scenarioDecisionReady(plan, 'budgetLead') && !!(site && site.deputyId && safety && safety.deputyId);
        var infoRoutes = [
          { cardId: 'ic_ferry', roleIds: ['siteLead'] },
          { cardId: 'ic_weather', roleIds: ['siteLead', 'safetyLead'] },
          { cardId: 'ic_cash', roleIds: ['siteLead', 'budgetLead'] }
        ], infoReady = true;
        for (var ir = 0; ir < infoRoutes.length; ir++) {
          var shared = scenarioCardShared(plan, infoRoutes[ir].cardId, infoRoutes[ir].roleIds);
          if (!shared) infoReady = false;
          evidence.push('distributed-route-' + infoRoutes[ir].cardId + (shared ? '-ready' : '-missing'));
        }
        success = authorityReady && infoReady;
        evidence.push(authorityReady ? 'distributed-authority-and-deputies-ready' : 'distributed-authority-or-deputy-gap');
        evidence.push(infoReady ? 'distributed-information-routes-ready' : 'distributed-information-route-gap');
      } else {
        success = true; evidence.push('live-escalation-requested');
      }
    } else if (scenarioId === 'low-catch') {
      if (strategyId === 'fallback-supply') {
        event = byId((plan.budget && plan.budget.spendEvents) || [], 'sp_fallback');
        line = event ? byId(plan.budget.lines || [], event.lineId) : null;
        card = byId(plan.infoCards || [], 'ic_cash');
        success = !!(event && line && line.approverRoleId && line.payMethod === event.requiredMethod && card &&
          card.recipientRoleIds.indexOf(event.actorRoleId) >= 0);
        evidence.push(success ? 'fallback-purchase-authorized-and-informed' : 'fallback-purchase-blocked');
      } else if (strategyId === 'menu-substitution') {
        resource = byId((plan.budget && plan.budget.resources) || [], 'res_food');
        card = byId(plan.infoCards || [], 'ic_food');
        success = !!(resource && resource.planned >= resource.target && card && card.recipientRoleIds.indexOf('chef') >= 0);
        evidence.push(success ? 'backup-menu-inputs-ready' : 'backup-menu-inputs-missing');
      } else {
        success = true; evidence.push('simplified-service-with-explicit-wait');
      }
    }
    return { success: success, evidence: evidence };
  }
  // Pure scenario fold. Mastery is always read against the normal authored plan;
  // resilience, recovery cost, and carried consequences are reported separately.
  function evaluateScenario(plan, scenarioId, strategyId, runState, seed) {
    scenarioId = SCENARIOS[scenarioId] ? scenarioId : 'normal';
    var profile = scenarioProfile(scenarioId), family = SCENARIO_STRATEGIES[scenarioId] || {};
    var explicitStrategy = strategyId != null;
    if (!strategyId && plan && plan.scenarioStrategyId && family[plan.scenarioStrategyId]) strategyId = plan.scenarioStrategyId;
    strategyId = family[strategyId] ? strategyId : null;
    if (!strategyId && !explicitStrategy && profile.strategyIds.length) strategyId = profile.strategyIds[0];
    var strategy = strategyId ? family[strategyId] : null;
    var before = runState == null ? runStateFromPlan(plan) : migrateRunState(runState);
    var masteryScore = scoreTrip(planWithScenario(plan, 'normal'));
    var replaySeed = (typeof seed === 'number' && isFinite(seed) ? seed : 1) >>> 0;
    if (!replaySeed) replaySeed = 1;
    var base = strategy ? scenarioBaseResult(planWithScenario(plan, scenarioId), scenarioId, strategyId) :
      { success: false, evidence: ['unknown-strategy'] };
    var badgeEligible = !!(strategy && strategy.awardsBadge !== false && profile.badgeId);
    var transition = before && base.success ? applyRunStateDelta(before, strategy.runStateDelta,
      badgeEligible ? profile.badgeId : null) :
      { ok: !!before, reason: before ? 'scenario-requirements-not-met' : 'unsupported-run-state-version', state: before, appliedDelta: {} };
    var success = base.success && transition.ok;
    var recoveredWithDebt = !!(success && strategy && strategy.liveRecovery === true);
    return {
      version: 1,
      replay: { scenarioId: scenarioId, seed: replaySeed, strategyId: strategyId,
        modifierIds: profile.modifierIds.slice() },
      scenario: profile, strategy: strategy ? clone(strategy) : null,
      success: success, status: success ? (recoveredWithDebt ? 'recovered-with-debt' : 'resilient') : 'blocked',
      reason: success ? (recoveredWithDebt ? 'live-recovery-with-operational-debt' : 'scenario-recovered') :
        (base.success ? transition.reason : 'scenario-requirements-not-met'),
      evidence: base.evidence.slice(), appliedDelta: clone(transition.appliedDelta || {}),
      runStateBefore: before ? clone(before) : null, runStateAfter: transition.state ? clone(transition.state) : null,
      badgeAwarded: success && badgeEligible ? profile.badgeId : null,
      resilienceEarned: success && badgeEligible, recoveredWithDebt: recoveredWithDebt,
      planMastery: { score: masteryScore.total, grade: masteryScore.grade, clean: masteryScore.gate.clean,
        atomCount: masteryScore.atoms.length }
    };
  }

  // ---- physical route vocabulary -------------------------------------------------
  // This is the factual route layer. It deliberately separates PHYSICAL places and
  // vessels from logical work stations such as "finance" or "mess", so renderers and
  // reports never have to guess that a generic `port` means Chichijima, Hahajima, or
  // Takeshiba. Null minutes are intentional unknowns, never zeroes.
  var PHYSICAL_STOPS = [
    { id: 'tokyo-hotel', name: L('Nearby Tokyo hotel', '東京の近隣ホテル'), kind: 'hotel', area: 'tokyo', island: null },
    { id: 'takeshiba-terminal', name: L('Takeshiba Passenger Ship Terminal', '竹芝客船ターミナル'), kind: 'terminal', area: 'tokyo', island: null },
    { id: 'ogasawara-maru', name: L('Ogasawara-maru', 'おがさわら丸'), kind: 'vessel', area: 'at-sea', island: null, vesselId: 'ogasawara-maru' },
    { id: 'chichijima-transfer', name: L('Chichijima ship transfer', '父島での船の乗り換え'), kind: 'transfer', area: 'ogasawara', island: 'chichijima' },
    { id: 'interisland-ferry', name: L('Inter-island vessel (name not confirmed)', '島間船（船名未確認）'), kind: 'vessel', area: 'ogasawara', island: null, vesselId: 'interisland-vessel' },
    { id: 'hahajima-hinata', name: L('Hahajima · Hinata', '母島・ひなた'), kind: 'base', area: 'ogasawara', island: 'hahajima' }
  ];
  var VESSELS = [
    { id: 'ogasawara-maru', name: L('Ogasawara-maru', 'おがさわら丸'), kind: 'long-haul-ferry', knownName: true,
      fromStopId: 'takeshiba-terminal', toStopId: 'chichijima-transfer', outboundDepartMin: SAIL_MIN,
      outboundDurationMin: VOYAGE_APPROX_MIN, durationStatus: 'approximate' },
    { id: 'interisland-vessel', name: L('Inter-island vessel (name not confirmed)', '島間船（船名未確認）'), kind: 'inter-island-vessel', knownName: false,
      fromStopId: 'chichijima-transfer', toStopId: 'hahajima-hinata', outboundDepartMin: null,
      outboundDurationMin: null, durationStatus: 'unknown' },
    // Local fishing boats are separate identities; they are not either route ferry.
    { id: 'nobu-fishing-boat', name: L("Nobu-san's fishing boat", 'ノブさんの釣り船'), kind: 'local-fishing-boat', knownName: true },
    { id: 'kimura-fishing-boat', name: L("Kimura-san's fishing boat", '木村さんの釣り船'), kind: 'local-fishing-boat', knownName: true }
  ];
  function physicalStop(id) { for (var i = 0; i < PHYSICAL_STOPS.length; i++) if (PHYSICAL_STOPS[i].id === id) return PHYSICAL_STOPS[i]; return null; }
  function vessel(id) { for (var i = 0; i < VESSELS.length; i++) if (VESSELS[i].id === id) return VESSELS[i]; return null; }

  // Confirmed outbound facts followed by an explicitly inferred reverse route. `departMin`
  // is present only for confirmed clocks; `durationMin` is present only for the supplied
  // "about one day" long-haul duration. Inter-island and return timetable fields stay null.
  var ITINERARY = [
    { id: 'out-breakfast', direction: 'outbound', order: 0, kind: 'meal', fromStopId: 'tokyo-hotel', toStopId: 'tokyo-hotel', sceneId: 'tokyo-hotel', vesselId: null,
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: true, inferred: false,
      name: L('Breakfast at the nearby Tokyo hotel (time not confirmed)', '東京の近隣ホテルで朝食（時刻未確認）') },
    { id: 'out-hotel-takeshiba', direction: 'outbound', order: 1, kind: 'ground-transfer', fromStopId: 'tokyo-hotel', toStopId: 'takeshiba-terminal', sceneId: 'takeshiba-terminal', vesselId: null,
      departMin: HOTEL_DEPART_MIN, arriveMin: null, durationMin: null, timeStatus: 'confirmed-departure-only', confirmed: true, inferred: false,
      name: L('Leave the hotel at 10:00 and transfer to Takeshiba', '10:00にホテルを出発し竹芝へ移動') },
    { id: 'out-ogasawara-maru', direction: 'outbound', order: 2, kind: 'long-haul-voyage', fromStopId: 'takeshiba-terminal', toStopId: 'chichijima-transfer', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru',
      departMin: SAIL_MIN, arriveMin: null, durationMin: VOYAGE_APPROX_MIN, timeStatus: 'confirmed-departure-approx-duration', confirmed: true, inferred: false,
      name: L('Ogasawara-maru: Takeshiba 11:00 → Chichijima (about one day)', 'おがさわら丸：竹芝11:00発→父島（約1日）') },
    { id: 'out-chichijima-transfer', direction: 'outbound', order: 3, kind: 'ship-transfer', fromStopId: 'chichijima-transfer', toStopId: 'chichijima-transfer', sceneId: 'chichijima-transfer', vesselId: null,
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: true, inferred: false,
      name: L('Disembark and change ships at Chichijima (connection time not confirmed)', '父島で下船・船を乗り換え（接続時刻未確認）') },
    { id: 'out-interisland', direction: 'outbound', order: 4, kind: 'inter-island-voyage', fromStopId: 'chichijima-transfer', toStopId: 'hahajima-hinata', sceneId: 'interisland-ferry', vesselId: 'interisland-vessel',
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: true, inferred: false,
      name: L('Separate inter-island vessel: Chichijima → Hahajima (name/times not confirmed)', '別の島間船：父島→母島（船名・時刻未確認）') },
    { id: 'out-hinata', direction: 'outbound', order: 5, kind: 'arrival', fromStopId: 'hahajima-hinata', toStopId: 'hahajima-hinata', sceneId: 'hahajima-hinata', vesselId: null,
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: true, inferred: false,
      name: L('Arrive on Hahajima and continue to Hinata', '母島に到着し、ひなたへ') },
    { id: 'return-hinata', direction: 'return', order: 0, kind: 'departure', fromStopId: 'hahajima-hinata', toStopId: 'hahajima-hinata', sceneId: 'hahajima-hinata', vesselId: null,
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: false, inferred: true,
      name: L('Leave Hinata on Hahajima (reverse route inferred; timetable not confirmed)', '母島のひなたを出発（逆順ルートの推定・時刻未確認）') },
    { id: 'return-interisland', direction: 'return', order: 1, kind: 'inter-island-voyage', fromStopId: 'hahajima-hinata', toStopId: 'chichijima-transfer', sceneId: 'interisland-ferry', vesselId: 'interisland-vessel',
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: false, inferred: true,
      name: L('Inter-island vessel: Hahajima → Chichijima (inferred; name/times not confirmed)', '島間船：母島→父島（推定・船名／時刻未確認）') },
    { id: 'return-chichijima-transfer', direction: 'return', order: 2, kind: 'ship-transfer', fromStopId: 'chichijima-transfer', toStopId: 'chichijima-transfer', sceneId: 'chichijima-transfer', vesselId: null,
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: false, inferred: true,
      name: L('Change ships at Chichijima (inferred; connection not confirmed)', '父島で船を乗り換え（推定・接続未確認）') },
    { id: 'return-ogasawara-maru', direction: 'return', order: 3, kind: 'long-haul-voyage', fromStopId: 'chichijima-transfer', toStopId: 'takeshiba-terminal', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru',
      departMin: null, arriveMin: null, durationMin: VOYAGE_APPROX_MIN, timeStatus: 'unknown-timetable-approx-duration', confirmed: false, inferred: true,
      name: L('Ogasawara-maru: Chichijima → Takeshiba (inferred; timetable not confirmed)', 'おがさわら丸：父島→竹芝（推定・時刻未確認）') },
    { id: 'return-takeshiba', direction: 'return', order: 4, kind: 'arrival', fromStopId: 'takeshiba-terminal', toStopId: 'takeshiba-terminal', sceneId: 'takeshiba-terminal', vesselId: null,
      departMin: null, arriveMin: null, durationMin: null, timeStatus: 'unknown', confirmed: false, inferred: true,
      name: L('Arrive at Takeshiba (inferred; timetable not confirmed)', '竹芝に到着（推定・時刻未確認）') }
  ];
  function itineraryLeg(id) { for (var i = 0; i < ITINERARY.length; i++) if (ITINERARY[i].id === id) return ITINERARY[i]; return null; }

  // ---- the site map: zones where characters gather (spec §8 simulation screen) ----
  // Map geography (2026-07-07): LAND on the left (the buildings), OCEAN on the right; Port sits at the shore
  // (land↔water edge), the iso rock island is out in the right-hand ocean. See WORLD.md §4-§5.
  // Map geography (2026-07-07): LAND left, OCEAN right. HINATA is the big command-centre compound (planning +
  // kitchen + rod-check/load + discussion); the old separate Command folds into it (hidden). Finance hidden for
  // now. Port = the shore; the iso rock is out in the ocean. `hub`/`hidden` are render hints (engine ignores them).
  var STATIONS = [
    { id: 'command', name: L('Command', '司令部'), icon: '🏛️', x: 0.30, y: 0.44, hidden: true },  // folded into Hinata
    { id: 'port',    name: L('Hahajima port', '母島の港'), icon: '⚓', x: 0.52, y: 0.56 },  // base map = Hahajima; route scenes override this label
    { id: 'vessel',  name: L('Iso rock', '磯'),     icon: '🪨', x: 0.82, y: 0.72 },  // OCEAN — the iso fishing rock
    { id: 'lodging', name: L('Hinata lodging', 'ひなた（宿）'), icon: '🏨', x: 0.13, y: 0.78 },  // Hahajima — lodging, bottom-left
    { id: 'mess',    name: L('Hinata', 'ひなた'),   icon: '🍽️', x: 0.30, y: 0.44, hub: true },     // land — the big Hinata compound (command/kitchen/rods/transport/clinic)
    { id: 'finance', name: L('Finance', '会計'),    icon: '🧮', x: 0.30, y: 0.44, hidden: true },   // hidden for now (folded into the hub)
    { id: 'clinic',  name: L('Clinic', '診療所'),   icon: '⛑️', x: 0.30, y: 0.44, hidden: true }   // folded into Hinata (clinic is also Hinata)
  ];
  // ---- the SHIP map (Voyage spec §3): the 'voyage' segment defines its own station set, positioned
  // over the water side of the map (nx > 0.55) — stations are data; the stage already renders at-sea
  // crews aboard hulls, so the ship day reads as shipboard life without new stage architecture.
  var VOYAGE_STATIONS = [
    { id: 'hold',   name: L('Hold', '船倉'),               icon: '📦', x: 0.60, y: 0.72 },
    { id: 'cabins', name: L('Cabins', '船室'),             icon: '🛏️', x: 0.66, y: 0.50 },
    { id: 'dining', name: L('Dining saloon', '船内食堂'),  icon: '🍽️', x: 0.78, y: 0.62 },
    { id: 'deck',   name: L('Deck', 'デッキ'),             icon: '🌊', x: 0.88, y: 0.42 },
    { id: 'purser', name: L("Purser's desk", '事務長窓口'), icon: '🛎️', x: 0.72, y: 0.30 }
  ];
  function station(id) {
    var i;
    for (i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i];
    for (i = 0; i < VOYAGE_STATIONS.length; i++) if (VOYAGE_STATIONS[i].id === id) return VOYAGE_STATIONS[i];
    return STATIONS[0];
  }

  // The trip is rehearsed one DAY/segment at a time: pick a day, plan it, run it.
  var SEGMENTS = [
    // Physical chronology: Tokyo setup → long-haul ship → Chichijima transfer/Hahajima →
    // island operations/Fishing Day → inferred reverse return.
    { id: 'load',    phaseEn: 'Day 0 · Tokyo hotel to Takeshiba', name: L('Day 0 · Tokyo hotel → Takeshiba', '0日目・東京のホテル→竹芝'),
      routeLegIds: ['out-breakfast', 'out-hotel-takeshiba'], sceneIds: ['tokyo-hotel', 'takeshiba-terminal'] },
    { id: 'voyage',  phaseEn: 'Day 0–1 · Ogasawara-maru', name: L('Day 0–1 · Ogasawara-maru (about one day)', '0〜1日目・おがさわら丸（約1日）'),
      routeLegIds: ['out-ogasawara-maru'], sceneIds: ['ogasawara-maru'] },
    { id: 'arrival', phaseEn: 'Day 1 · Arrival', routePhaseEn: 'Day 1 · Chichijima transfer to Hahajima', name: L('Day 1 · Chichijima transfer → Hahajima/Hinata', '1日目・父島乗換→母島／ひなた'),
      routeLegIds: ['out-chichijima-transfer', 'out-interisland', 'out-hinata'], sceneIds: ['chichijima-transfer', 'interisland-ferry', 'hahajima-hinata'] },
    { id: 'ops',     phaseEn: 'Days 2–9 · Daily operations',  name: L('Days 2–9 · Operations', '2〜9日目・運営') },
    { id: 'fishday', phaseEn: 'Day 3 · Fishing day',          name: L('Day 3 · Fishing day (hour blocks)', '3日目・代表釣行日（時間単位）') },
    { id: 'return',  phaseEn: 'Day 10 · Return & shipping', routePhaseEn: 'Day 10 · Return route (inferred)', name: L('Day 10 · Reverse return route (timetable unconfirmed)', '10日目・逆順の帰路（時刻未確認）'),
      routeLegIds: ['return-hinata', 'return-interisland', 'return-chichijima-transfer', 'return-ogasawara-maru', 'return-takeshiba'],
      sceneIds: ['hahajima-hinata', 'interisland-ferry', 'chichijima-transfer', 'ogasawara-maru', 'takeshiba-terminal'], inferred: true }
  ];

  // fishday checkpoints (関所): the minute-clock run pauses here for inspect / intervene (§8)
  var CHECKPOINTS = [
    { id: 'cp_predep', min: 420,  name: L('07:00 · Pre-departure check', '07:00・出港前確認') },
    { id: 'cp_relay',  min: 720,  name: L('12:00 · Midday / catch relay', '12:00・昼・釣果連絡') },
    { id: 'cp_dinner', min: 1080, name: L('18:00 · Dinner service', '18:00・夕食提供') }
  ];
  function segIndex(id) { for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i].id === id) return i; return -1; }
  function phaseSegIndex(phase) { for (var i = 0; i < SEGMENTS.length; i++) if (SEGMENTS[i].phaseEn === phase.en) return i; return -1; }
  function gapsForSegment(plan, segId) {
    var idx = segIndex(segId); if (idx < 0) return detect(plan);
    var inSeg = {}; plan.tasks.forEach(function (t) { if (phaseSegIndex(t.phase) === idx) inSeg[t.id] = 1; });
    return detect(plan).filter(function (p) { for (var i = 0; i < p.taskIds.length; i++) if (inSeg[p.taskIds[i]]) return true; return false; });
  }

  // ---- the 9 role types (spec §10) ----
  var ROLES = [
    { id: 'owner',      name: L('Project Owner', 'プロジェクトオーナー'), icon: '👑', color: '#b8892b' },
    { id: 'pm',         name: L('PM / Lead', '総合責任者 / PM'),          icon: '📋', color: '#3d5a6c' },
    { id: 'siteLead',   name: L('Site Lead', '現地責任者'),               icon: '🧭', color: '#5b6b45' },
    { id: 'budgetLead', name: L('Budget Lead', '予算責任者'),             icon: '🧮', color: '#7a4a68' },
    { id: 'safetyLead', name: L('Safety Lead', '安全責任者'),             icon: '⛑️', color: '#a13d2f' },
    { id: 'logi',       name: L('Logistics', 'ロジ担当'),                 icon: '📦', color: '#b5622e' },
    { id: 'comms',      name: L('Comms / Records', '連絡・記録'),         icon: '🎧', color: '#2f6b63' },
    { id: 'specialist', name: L('Angler / Specialist', '釣り担当'),       icon: '🎣', color: '#c17a1f' },
    { id: 'chef',       name: L('Chef', '料理長・調理'),                  icon: '🍳', color: '#8a6a3a' },
    { id: 'crew',       name: L('Crew / Guest', 'ゲスト'),                icon: '🧑', color: '#8c7f65' }
  ];
  function role(id) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i]; return ROLES[ROLES.length - 1]; }

  var COMPANIES = {
    co_aibos: L('AIBOS (organizer)', 'AIBOS（運営）'),
    co_hd:  L('Holdings (HQ)', 'ホールディングス（本社）'),
    co_mar: L('Marine Div.', 'マリン事業部'),
    co_fin: L('Finance Co.', 'ファイナンス社'),
    co_hr:  L('HR & Admin', '人事総務社'),
    co_it:  L('IT Solutions', 'ITソリューションズ社'),
    co_chef: L('Catering (contract)', '料理担当（委託）')
  };

  // ===========================================================================
  // FISHDAY HANDOFFS — the timed information arrows (§6.1). canonHandoffs() is the
  // zero-idle reference set the whole day is scored against; the TEMPLATE ships the
  // gappy variant (two cook-consult arrows missing, tackle list late on a slow channel).
  // trigger: atMinute {value} | onTaskDone {taskId} | beforeTaskStart {taskId, leadMin}.
  // ifLate 'idle' -> the consumer waits (手待ち); 'assume' -> it proceeds on a wrong
  // default (アジ/サバ instead of カツオ) -> wrong-fish rework (手戻り).
  // ===========================================================================
  function H(id, cardId, fromRole, fromTask, toRole, toTask, trigger, channel, ifLate, reworkKind, en, jp) {
    return { id: id, cardId: cardId, fromRoleId: fromRole, fromTaskId: fromTask, toRoleId: toRole, toTaskId: toTask,
      trigger: trigger, channel: channel, ifLate: ifLate, reworkKind: reworkKind || null, content: L(en, jp) };
  }
  function canonHandoffs() {
    return [
      // convergence 1 — everything lands before the boat leaves (§6.3)
      H('h_food',         'ic_food',      'budgetLead', 't_f_food',       'chef',       't_f_menu',     { type: 'onTaskDone', taskId: 't_f_food' },       'faceToFace', 'idle',   null,
        '1 shellfish allergy · skipjack landing confirmed', '貝アレルギー1名・カツオ入荷確認'),
      H('h_orgfood',      'ic_orgfood',   'comms',      't_f_orgfood',    'chef',       't_f_menu',     { type: 'onTaskDone', taskId: 't_f_orgfood' },    'phone',      'idle',   null,
        '5 organizer portions tonight (3 self-cater)', '運営追加5食（3名は自炊）'),
      H('h_weather_chef', 'ic_weather',   'safetyLead', 't_f_weather',    'chef',       't_f_menu',     { type: 'onTaskDone', taskId: 't_f_weather' },    'faceToFace', 'idle',   null,
        'GO · wind 6 m/s · abort if waves >2 m or wind >12 m/s', '出航可・風6m/s・中止基準：波2m／風12m/s超'),
      H('h_weather_boat', 'ic_weather',   'safetyLead', 't_f_weather',    'siteLead',   't_f_route',    { type: 'onTaskDone', taskId: 't_f_weather' },    'faceToFace', 'idle',   null,
        'GO · abort criterion set · sea window to 14:00', '出航可・中止基準設定済・14:00まで海況良好'),
      H('h_menu_angler',  'ic_menu',      'chef',       't_f_menu',       'specialist', 't_f_gearload', { type: 'onTaskDone', taskId: 't_f_menu' },       'faceToFace', 'assume', 'wrongFish',
        'Skipjack ×18 · 5 min/portion · dinner 18:00', 'カツオ×18・1食5分・夕食18:00'),
      H('h_menu_boat',    'ic_menu',      'chef',       't_f_menu',       'siteLead',   't_f_route',    { type: 'onTaskDone', taskId: 't_f_menu' },       'radio',      'assume', 'wrongFish',
        'Hard return: dockside 14:00 (the 90-min cook block)', '厳守：14:00帰港（調理90分から逆算）'),
      H('h_tackle',       'ic_tackle',    'logi',       't_f_tackleprep', 'specialist', 't_f_gearload', { type: 'onTaskDone', taskId: 't_f_tackleprep' }, 'faceToFace', 'idle',   null,
        '6 rigs · jigs 60–100 g · bait · 2 coolers + 40 kg ice', '竿6・ジグ60〜100g・餌・クーラー2・氷40kg'),
      H('h_target',       'ic_target',    'specialist', 't_f_gearload',   'siteLead',   't_f_route',    { type: 'onTaskDone', taskId: 't_f_gearload' },   'faceToFace', 'assume', 'wrongFish',
        'Skipjack schooling · need 18+ keepers 1.5–2 kg', 'カツオ回遊・1.5〜2kgを18尾以上'),
      H('h_ground_angler','ic_ground',    'siteLead',   't_f_route',      'specialist', 't_f_rig',      { type: 'onTaskDone', taskId: 't_f_route' },      'faceToFace', 'assume', 'wrongFish',
        '07:00 depart → SE ground · lines 08:00–12:30 · dock 14:00', '07:00出港→東島南・実釣08:00〜12:30・14:00帰港'),
      H('h_ground_chef',  'ic_ground',    'siteLead',   't_f_route',      'chef',       't_f_sideprep', { type: 'onTaskDone', taskId: 't_f_route' },      'radio',      'idle',   null,
        'Dockside 14:00 confirmed · tally radioed ~12:45', '14:00帰港確定・12:45頃に釣果無線'),
      H('h_headcount',    'ic_headcount', 'comms',      't_f_headcount1', 'siteLead',   't_f_depart',   { type: 'onTaskDone', taskId: 't_f_headcount1' }, 'faceToFace', 'idle',   null,
        '3 aboard, lifejackets on · shore party accounted', '乗船3名・救命胴衣着用・陸上も点呼済'),
      // convergence 2 — the catch count reaches the galley before the chefs size the meal (§6.3)
      H('h_catch_chef',   'ic_catch',     'specialist', 't_f_tally',      'chef',       't_f_sideprep', { type: 'onTaskDone', taskId: 't_f_tally' },      'radio',      'idle',   null,
        '20 skipjack ~1.6 kg (target +2) → confirm 18 portions', 'カツオ20尾・約1.6kg（目標+2）→18食確定'),
      H('h_catch_logi',   'ic_catch',     'specialist', 't_f_tally',      'logi',       't_f_icing',    { type: 'onTaskDone', taskId: 't_f_tally' },      'radio',      'idle',   null,
        '20 fish ~32 kg inbound → stage extra ice & table', '20尾・約32kg入港→氷と作業台を増強'),
      H('h_catch_comms',  'ic_catch',     'specialist', 't_f_tally',      'comms',      't_f_report',   { type: 'onTaskDone', taskId: 't_f_tally' },      'radio',      'idle',   null,
        'Catch logged · ETA dockside 14:00 on schedule', '釣果記録・帰港予定14:00 定刻')
    ];
  }

  // Authoring recipes for the food->menu socket. `requiresHandoffId` is an
  // additive relay prerequisite understood by the delivery resolver below: the
  // forwarding send is valid only after its intake actually arrives. Therefore
  // the delegated option is a real two-hop path, not decorative metadata.
  function day3FoodStrategyHandoffs(strategyId) {
    var h, out = [];
    if (strategyId === 'direct-fast') {
      h = canonHandoffs().filter(function (x) { return x.id === 'h_food'; })[0];
      h.strategyId = strategyId; out.push(h);
    } else if (strategyId === 'delegated-relay') {
      h = H('h_food_relay_intake', 'ic_food', 'budgetLead', 't_f_food', 'comms', 't_f_orgfood',
        { type: 'onTaskDone', taskId: 't_f_food' }, 'radio', 'idle', null,
        'Food and allergy list to the communications relay', '食材・アレルギー一覧を連絡担当へ中継');
      h.strategyId = strategyId; h.pathId = 'food-relay'; h.relayRoleId = 'comms'; out.push(h);
      h = H('h_food_relay_delivery', 'ic_food', 'comms', 't_f_orgfood', 'chef', 't_f_menu',
        { type: 'atMinute', value: 290 }, 'phone', 'idle', null,
        'Communications relay confirms the list with the chef', '連絡担当が料理担当へ一覧を確認');
      h.strategyId = strategyId; h.pathId = 'food-relay'; h.relayRoleId = 'comms';
      h.requiresHandoffId = 'h_food_relay_intake'; out.push(h);
    } else if (strategyId === 'redundant-paths') {
      h = H('h_food_primary_radio', 'ic_food', 'budgetLead', 't_f_food', 'chef', 't_f_menu',
        { type: 'onTaskDone', taskId: 't_f_food' }, 'radio', 'idle', null,
        'Primary food and allergy confirmation by radio', '食材・アレルギー確認を無線で送信');
      h.strategyId = strategyId; h.pathId = 'food-primary'; out.push(h);
      h = H('h_food_backup_phone', 'ic_food', 'budgetLead', 't_f_food', 'chef', 't_f_menu',
        { type: 'onTaskDone', taskId: 't_f_food' }, 'phone', 'idle', null,
        'Independent backup food and allergy confirmation by phone', '食材・アレルギー確認を電話でも予備送信');
      h.strategyId = strategyId; h.pathId = 'food-backup'; out.push(h);
    }
    return out;
  }

  // Pure config applicator used by UI choices. Known sibling recipes are cleared
  // before the selected path is written, so switching choices cannot silently
  // retain an old backup and overstate resilience. Unknown ids are a no-op clone.
  function applyDay3FoodStrategy(cfg, strategyId) {
    var out = clone(cfg || { seed: 1, overrides: {} });
    out.overrides = out.overrides || {};
    if (DAY3_FOOD_STRATEGY_IDS.indexOf(strategyId) < 0) return out;
    var ho = out.overrides.handoffs = out.overrides.handoffs || {};
    for (var i = 0; i < DAY3_FOOD_HANDOFF_IDS.length; i++) ho[DAY3_FOOD_HANDOFF_IDS[i]] = null;
    var authored = day3FoodStrategyHandoffs(strategyId);
    for (i = 0; i < authored.length; i++) ho[authored[i].id] = authored[i];
    return out;
  }
  // §7/§13.4 P2 seed re-tune: withhold MOST of the 14 canonical arrows — today's ~12/14
  // pre-drawn made the arrows a footnote; the gappy seed should make "draw the information
  // arrows" the core puzzle (the single biggest lever toward 100, §7). Ships only 4 pre-drawn
  // on-time examples (KEPT_ONTIME) + 1 pre-drawn but LATE arrow (h_tackle, the classic
  // 迷い-vs-手待ち contrast) — the other 9 of 14 are never drawn until the player (or
  // fixHandoffs/canonHandoffs) draws them.
  var GAPPY_KEPT_ONTIME = { h_food: 1, h_headcount: 1, h_catch_chef: 1, h_target: 1 };
  var GAPPY_LATE = { h_tackle: { trigger: { type: 'atMinute', value: 360 }, channel: 'chat' } }; // 06:00 on chat -> 06:10, 40 min late
  function gappyHandoffs() {
    var out = [];
    canonHandoffs().forEach(function (h) {
      if (GAPPY_LATE[h.id]) { for (var k in GAPPY_LATE[h.id]) h[k] = GAPPY_LATE[h.id][k]; out.push(h); return; }
      if (GAPPY_KEPT_ONTIME[h.id]) { out.push(h); return; }
      // withheld: never drawn (迷い) — the other 9 canonical arrows, incl. 3 of the 4
      // wrong-fish-riskable sockets (h_menu_angler, h_menu_boat, h_ground_angler)
    });
    return out;
  }

  // ===========================================================================
  // TEMPLATE — the pre-built Ogasawara plan, shipped GAPPY (spec §19/§24).
  // Fields marked  // GAP  are the seeded weaknesses the player must fix.
  // ===========================================================================
  function makeTemplate() {
    var pA = L('Day 1 · Arrival', '1日目・到着'),
        pOps = L('Days 2–9 · Daily operations', '2〜9日目・運営'),
        pR = L('Day 10 · Return & shipping', '10日目・帰着・発送'),
        pF = L('Day 3 · Fishing day', '3日目・代表釣行日');
    // fishday task builder — carries BOTH day-clock fields (startDay/dur, so the 10-day
    // frame still runs it) and minute-clock fields (startMin/durMin, the temporal layer).
    // opts: deps, diff, res, info, auth, produces, assumeOn (cards this task GUESSES when
    // missing/late -> wrong-fish rework instead of waiting), wfPenalty (extra cook minutes
    // if the day's catch is the wrong species), guest (guest-facing: lateness -> quality).
    function FD(id, en, jp, st, roleId, ids, startMin, durMin, o) {
      o = o || {};
      return { id: id, name: L(en, jp), station: st, phase: pF, day: 'fishday', ownerRoleId: roleId,
        assignedIds: ids.slice(), startDay: 2, dur: Math.max(0.01, durMin / 1440),
        startMin: startMin, durMin: durMin, baseStartMin: startMin, // baseStartMin = the promised time; guests judge lateness against it, not against a re-dragged block
        deps: o.deps || [], difficulty: o.diff || 2, neededResources: o.res || [], neededInfo: o.info || [],
        neededAuthority: o.auth || null, produces: o.produces || [], assumeOn: o.assumeOn || [],
        wrongFishPenaltyMin: o.wfPenalty || 0, guestFacing: !!o.guest,
        // rubric v1.0 §3.4 pricing flags (scoreTrip derives atoms from these; 0/falsy = none)
        safetyGate: o.safetyGate || 0, qualityCheck: o.qualityCheck || 0, moneyCheck: o.moneyCheck || 0,
        // Voyage repack: flex:true = a deliberately low-stakes standby task, exempt from exec-lane
        // pricing (§3.3 amendment — the two owner/pm fishday standbys; behavior untouched)
        flex: !!o.flex };
    }
    // §20.3 — HD() mirrors FD() for the authorable route/coarse days:
    // same output shape as a fishday task (minus the day-clock startDay/dur/phase/day fields
    // FD carries only so the legacy 10-day frame can run fishday), so a future daySchedule(plan,seg)
    // can treat HD and FD tasks identically. Adds `required` (default true; false = a decoy —
    // a plausible-but-wrong card the deck offers that must NOT end up in the canonical/scored set).
    // opts: {deps, info, produces, assumeOn, guestFacing, baseStartMin, required, res, diff}.
    function HD(id, en, jp, st, roleId, ids, startMin, durMin, o) {
      o = o || {};
      return { id: id, name: L(en, jp), station: st, ownerRoleId: roleId, assignedIds: ids.slice(),
        startMin: startMin, durMin: durMin,
        baseStartMin: (typeof o.baseStartMin === 'number') ? o.baseStartMin : startMin, // promised time; see FD's comment above
        deps: o.deps || [], difficulty: o.diff || 2, neededResources: o.res || [], neededInfo: o.info || [],
        produces: o.produces || [], assumeOn: o.assumeOn || [],
        required: o.required === false ? false : true, guestFacing: !!o.guestFacing,
        safetyFlag: !!o.safetyFlag, // §13.1: decoy debit is safety-flavored (-3) when true, else -2
        // rubric v1.0 §3.4 pricing flags (scoreTrip derives atoms from these; 0/falsy = none)
        safetyGate: o.safetyGate || 0, qualityCheck: o.qualityCheck || 0, moneyCheck: o.moneyCheck || 0,
        // Voyage additions (spec §2/§3), all inert on days that don't use them:
        //   carries[]  — manifest item ids this task moves (custody legs + Pack & Sail mirror)
        //   custody    — an OUTBOUND custody leg (packed→transferred to Takeshiba→in hold); carryState folds these
        //   care       — careGuestId: a per-outbound-guest care task (starlink/escort); exempt from exec lanes,
        //                priced by the per-guest care atom; buddies auto-staff + re-home ownerRoleId
        //   flex       — exempt from exec-lane pricing (see FD)
        carries: o.carries ? o.carries.slice() : [], custody: !!o.custody,
        transferCustody: !!o.transferCustody, returnCustody: !!o.returnCustody,
        carrySegment: o.carrySegment || null,
        careGuestId: o.care || null, flex: !!o.flex,
        // Factual route annotations. Numeric startMin/durMin remain deterministic rehearsal
        // anchors; `timeStatus` tells every consumer whether that clock is confirmed,
        // approximate, or sequence-only because the real timetable has not been supplied.
        routeLegId: o.routeLegId || null, sceneId: o.sceneId || null,
        fromSceneId: o.fromSceneId || null, toSceneId: o.toSceneId || null,
        locationId: o.locationId || o.sceneId || null, vesselId: o.vesselId || null,
        timeStatus: o.timeStatus || 'planned', timeKnown: o.timeKnown !== false,
        confirmedStartMin: (typeof o.confirmedStartMin === 'number') ? o.confirmedStartMin : null,
        confirmedEndMin: (typeof o.confirmedEndMin === 'number') ? o.confirmedEndMin : null,
        durationStatus: o.durationStatus || (o.timeKnown === false ? 'sequence-only' : 'planned'),
        inferred: !!o.inferred };
    }
    // §7/§13.4 P2 seed re-tune — Arrival ships PARTLY CLEARED as the tutorial: the
    // required tasks below are authored with their full canonical placement (assignedIds/
    // startMin/durMin), captured into arrivalCanonPlacement, then blanked to assignedIds:[] so
    // the SHIPPED template hands the player an incomplete board. canonDay('arrival')/applyDayFix use
    // arrivalCanonPlacement to restore the placements (not just the handoffs) so the canonical
    // Arrival still reaches its full 15/15 (§13.4 acceptance).
    // The internal minutes after VOYAGE_END_MIN are SEQUENCE ANCHORS, not a published
    // inter-island timetable. Every such task says timeStatus:'unknown'. This preserves a
    // runnable causal rehearsal while keeping the owner's unknown connection/name/duration
    // unknown in the data and UI.
    var arrivalReqTasks = [
      HD('hd_a_disembark',    'Disembark Ogasawara-maru at Chichijima and account for baggage', '父島でおがさわら丸を下船・荷物確認', 'port', 'logi', ['p06'], 2100, 60,
        { routeLegId: 'out-chichijima-transfer', sceneId: 'chichijima-transfer', vesselId: 'ogasawara-maru', timeStatus: 'approximate-boundary', timeKnown: false }),
      HD('hd_a_ferrycheck',   'Confirm the inter-island connection and manifest (time/name not supplied)', '島間船の接続・名簿確認（時刻・船名未提供）', 'port', 'pm', ['p02'], 2100, 60,
        { produces: ['ic_ferry'], routeLegId: 'out-chichijima-transfer', sceneId: 'chichijima-transfer', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_a_transfer',     'Transfer baggage and manifest between ships at Chichijima', '父島で船間の荷物・積荷を引き継ぎ', 'port', 'logi', ['p06'], 2160, 60,
        { deps: ['hd_a_disembark'], routeLegId: 'out-chichijima-transfer', sceneId: 'chichijima-transfer', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_a_board',        'Board the separate inter-island vessel', '別の島間船へ乗船', 'port', 'logi', ['p06'], 2220, 60,
        { deps: ['hd_a_ferrycheck', 'hd_a_transfer'], info: ['ic_ferry'], routeLegId: 'out-interisland', fromSceneId: 'chichijima-transfer', toSceneId: 'interisland-ferry', sceneId: 'chichijima-transfer', vesselId: 'interisland-vessel', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_a_cross',        'Inter-island crossing from Chichijima to Hahajima', '父島から母島への島間航海', 'vessel', 'siteLead', ['p03'], 2280, 120,
        { deps: ['hd_a_board'], diff: 3, routeLegId: 'out-interisland', sceneId: 'interisland-ferry', vesselId: 'interisland-vessel', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_a_checkin',      'Arrive on Hahajima, unload, and transfer to Hinata', '母島到着・荷下ろし・ひなたへ移動', 'lodging', 'logi', ['p06'], 2400, 60,
        { deps: ['hd_a_cross'], produces: ['ic_rooms'], res: ['luggage'], routeLegId: 'out-hinata', fromSceneId: 'interisland-ferry', toSceneId: 'hahajima-hinata', sceneId: 'hahajima-hinata', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_a_foodsource',   'Food source & allergy check at Hinata', 'ひなたで食材調達・アレルギー確認', 'finance', 'budgetLead', ['p04'], 2400, 60,
        { produces: ['ic_food'], routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' }),
      HD('hd_a_intake',       'Supply & gear intake at Hinata (drinks, tackle, food, ice)', 'ひなたで物資・釣具搬入（飲料・釣具・食材・氷）', 'lodging', 'logi', ['p06'], 2460, 60,
        { deps: ['hd_a_checkin'], produces: ['ic_tackle'], res: ['storage', 'tackle'], routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' }),
      HD('hd_a_safety',       'Hahajima / Hinata safety briefing', '母島・ひなた安全説明会', 'clinic', 'safetyLead', ['p05'], 2400, 60,
        { diff: 3, safetyGate: 1, routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' }),
      HD('hd_a_gearstow',     'Stow gear at Hinata', 'ひなたで道具収納', 'port', 'specialist', ['p08'], 2520, 60,
        { deps: ['hd_a_intake'], info: ['ic_tackle'], routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' }),
      HD('hd_a_dinnerprep',   'First-night meal prep at Hinata', 'ひなたで初日夕食仕込み', 'mess', 'chef', ['p09', 'p10'], 2520, 120,
        { deps: ['hd_a_intake'], info: ['ic_food'], res: ['food'], diff: 3, routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' }),
      HD('hd_a_headcount',    'Hahajima / Hinata arrival headcount', '母島・ひなた到着点呼', 'port', 'comms', ['p07'], 2460, 60,
        { deps: ['hd_a_checkin'], info: ['ic_rooms'], routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' }),
      HD('hd_a_dinnerserve',  'First-night meal service at Hinata', 'ひなたで初日夕食提供', 'mess', 'chef', ['p09', 'p10', 'p11'], 2640, 60,
        { deps: ['hd_a_dinnerprep'], res: ['food'], guestFacing: true, routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' })
    ];
    var arrivalCanonPlacement = {};
    // §7/§13.4 refinement-3: leave the physical transfer chain and intake/headcount placed
    // (8 of 13 tasks) and clear the
    // later/independent ones (food source, safety briefing, gear stow, dinner prep/serve, 5
    // tasks), so authoring Arrival (canonDay/applyDayFix) is a ~+7-8 lever, not +14 — fixHandoffs
    // stays the dominant single jump (§1 invariant). canonPlacement still captures ALL 13 so
    // canonDay('arrival')/applyDayFix restore the full roster regardless of what ships blank.
    var ARRIVAL_CLEARED = { hd_a_foodsource: 1, hd_a_safety: 1, hd_a_gearstow: 1, hd_a_dinnerprep: 1, hd_a_dinnerserve: 1 };
    arrivalReqTasks.forEach(function (t) {
      arrivalCanonPlacement[t.id] = { assignedIds: t.assignedIds.slice(), startMin: t.startMin, durMin: t.durMin };
      if (ARRIVAL_CLEARED[t.id]) t.assignedIds = [];   // ships blank — the half-cleared tutorial board
    });

    // =========================================================================
    // VOYAGE PROGRAM (spec 2026-07-13) — Day-0 content: named guests, the physical
    // manifest, and the Load & Board / Ship Day rosters. W1a ships them CANONICALLY
    // complete with the spec-§4 seed gaps; the W2a content wave enriches (decoys,
    // richer rosters).
    // =========================================================================
    // 13 named guest records (WORLD.md §2/§3). This is the master hosted/non-duty
    // catalog, NOT a claim that every named record is a main guest on every day. The
    // four-person main-guest waves live in guestRotations below. `voyageCare` marks the
    // Day-0 outbound cohort whose Starlink/meal-escort tasks are scored; `vip` remains a
    // compatibility alias for older consumers and must never be used as a day roster.
    // Kanji appears only where WORLD.md confirms it (渡邊 / 角谷); other guests stay
    // katakana pending the owner's kanji pass. Natsuki (cameraman) remains outside the
    // 13-record compatibility catalog until the physical headcount is reconciled.
    function GD(id, en, jp, voyageCare, party) {
      return { id: id, name: L(en, jp), voyageCare: !!voyageCare, vip: !!voyageCare, party: party };
    }
    var guests = [
      GD('gd_watanabe', 'Watanabe', '渡邊',     true,  'aegis'),
      GD('gd_nagatani', 'Nagatani', 'ナガタニ', true,  'external'),
      GD('gd_kadou',    'Kadou',    '角谷',     true,  'external'),
      GD('gd_maeda',    'Maeda',    'マエダ',   true,  'aegis'),
      GD('gd_yamate',   'Yamate',   'ヤマテ',   false, 'aegis'),
      GD('gd_saito',    'Saito',    'サイトウ', false, 'aegis'),
      GD('gd_nobuaki',  'Nobuaki',  'ノブアキ', false, 'aegis'),
      GD('gd_shimura',  'Shimura',  'シムラ',   false, 'aegis'),
      GD('gd_tamaya',   'Tamaya',   'タマヤ',   false, 'aegis'),
      GD('gd_nate',     'Nate',     'ネイト',   false, 'aegis'),
      GD('gd_daisuke',  'Daisuke',  'ダイスケ', false, 'aegis'),
      GD('gd_miki',     'Miki',     'ミキ',     false, 'aegis'),
      GD('gd_megu',     'Megu',     'メグ',     false, 'aegis')
    ];
    // Owner-facing campaign days are inclusive. The formal program is Days 1–10;
    // the simulator additionally models Day 0 Tokyo staging and departure.
    var guestRotations = [
      { id: 'days-0-5', startDay: 0, endDay: 5,
        guestIds: ['gd_watanabe', 'gd_nagatani', 'gd_kadou', 'gd_maeda'] },
      { id: 'days-6-10', startDay: 6, endDay: 10,
        guestIds: ['gd_watanabe', 'gd_nagatani', 'gd_yamate', 'gd_saito'] }
    ];
    // The physical manifest (spec §2). resourceId binds an item to the EXISTING
    // neededResources tokens downstream: a resource with no manifest item is never
    // carry-bound (inert — 'boat', 'storage', 'keys', …), and a task needing a bound
    // resource stalls (手待ち-style) in any segment where a backing item is 'missing'.
    function MI(id, en, jp, kind, resourceId, forSeg, returnRequired, outboundRequired) {
      return { id: id, name: L(en, jp), kind: kind, resourceId: resourceId, forSeg: forSeg,
        outboundRequired: outboundRequired !== false, returnRequired: returnRequired !== false };
    }
    var manifest = [
      MI('mi_rods',       'Rod sets ×6',           '竿セット×6',             'gear',    'tackle',  'fishday'),
      MI('mi_jigcase',    'Jig case (60–100 g)',   'ジグケース（60〜100g）', 'gear',    'jigs',    'fishday'),
      MI('mi_coolers',    'Coolers ×2',            'クーラーボックス×2',     'gear',    'ice',     'fishday'),
      MI('mi_ice',        'Ice blocks 40 kg',      '氷40kg',                 'gear',    'ice',     'fishday', false),
      MI('mi_foodcrates', 'Food crates',           '食材ケース',             'food',    'food',    'ops', false),
      MI('mi_medkit',     'Medkit',                '救急セット',             'safety',  'medkit',  'ops'),
      MI('mi_cashbox',    'Cash box',              '現金ボックス',           'money',   'cash',    'return'),
      MI('mi_lug_gd_watanabe', "Watanabe's luggage", '渡邊様の荷物',         'luggage', 'luggage', 'voyage'),
      MI('mi_lug_gd_nagatani', "Nagatani's luggage", 'ナガタニ様の荷物',     'luggage', 'luggage', 'voyage'),
      MI('mi_lug_gd_kadou',    "Kadou's luggage",    '角谷様の荷物',         'luggage', 'luggage', 'voyage', false),
      MI('mi_lug_gd_maeda',    "Maeda's luggage",    'マエダ様の荷物',       'luggage', 'luggage', 'voyage', false),
      MI('mi_lug_gd_yamate',   "Yamate's return luggage", 'ヤマテ様の帰路荷物', 'luggage', 'luggage', 'return', true, false),
      MI('mi_lug_gd_saito',    "Saito's return luggage",  'サイトウ様の帰路荷物', 'luggage', 'luggage', 'return', true, false)
    ];
    var OUTBOUND_ITEMS = manifest.filter(function (m) { return m.outboundRequired; }).map(function (m) { return m.id; });
    var RETURN_ITEMS = manifest.filter(function (m) { return m.returnRequired; }).map(function (m) { return m.id; });
    // The Chichijima ship change is a second, explicit custody chain. It is added only
    // after the manifest exists so every physical item can be checked off at disembark,
    // transfer, inter-island loading/crossing, and Hahajima unloading.
    var transferTaskIds = { hd_a_disembark: 1, hd_a_transfer: 1, hd_a_board: 1, hd_a_cross: 1, hd_a_checkin: 1 };
    arrivalReqTasks.forEach(function (t) {
      if (transferTaskIds[t.id]) {
        t.transferCustody = true; t.carries = OUTBOUND_ITEMS.slice();
        if (arrivalCanonPlacement[t.id]) arrivalCanonPlacement[t.id].carries = OUTBOUND_ITEMS.slice();
      }
    });
    // --- Day 0 · TOKYO HOTEL → TAKESHIBA (confirmed 10:00 departure / 11:00 sailing) ---
    // Custody chain (custody:true): packed → transferred from the hotel to Takeshiba → in the hold. carryState folds
    // this chain into per-item availability for every later segment.
    var loadReqTasks = [
      // The canvas anchor is sequence-only: the owner supplied breakfast PLACE but not TIME.
      HD('hd_l_breakfast', 'Breakfast at the nearby Tokyo hotel (time not confirmed)', '東京の近隣ホテルで朝食（時刻未確認）', 'mess', 'owner', ['p01'], 480, 60,
        { flex: true, guestFacing: true, routeLegId: 'out-breakfast', sceneId: 'tokyo-hotel', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_l_pack',      'Check luggage and the physical manifest at the Tokyo hotel', '東京のホテルで荷物・積荷の現物照合', 'command', 'logi', ['p06'], 480, 60,
        { produces: ['ic_manifest'], custody: true, carries: OUTBOUND_ITEMS, moneyCheck: 1, routeLegId: 'out-breakfast', sceneId: 'tokyo-hotel', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_l_cabins',    'Prepare the Ogasawara-maru cabin assignment list', 'おがさわら丸の船室割当リスト作成', 'command', 'pm', ['p02'], 480, 60,
        { produces: ['ic_cabins'], routeLegId: 'out-breakfast', sceneId: 'tokyo-hotel', timeStatus: 'unknown', timeKnown: false }),
      HD('hd_l_truck',     'Leave the hotel at 10:00 and transfer people/luggage to Takeshiba', '10:00ホテル出発・人員／荷物を竹芝へ移動', 'port', 'siteLead', ['p03'], HOTEL_DEPART_MIN, 30,
        { deps: ['hd_l_pack'], info: ['ic_manifest'], custody: true, carries: OUTBOUND_ITEMS, routeLegId: 'out-hotel-takeshiba', fromSceneId: 'tokyo-hotel', toSceneId: 'takeshiba-terminal', sceneId: 'takeshiba-terminal', timeStatus: 'confirmed-start-only', timeKnown: false, confirmedStartMin: HOTEL_DEPART_MIN }),
      HD('hd_l_hold',      'Takeshiba baggage handoff and Ogasawara-maru hold check', '竹芝で荷物引き渡し・おがさわら丸船倉照合', 'port', 'siteLead', ['p03'], 630, 30,
        { deps: ['hd_l_truck'], info: ['ic_manifest'], custody: true, carries: OUTBOUND_ITEMS, diff: 3, safetyGate: 2, routeLegId: 'out-ogasawara-maru', sceneId: 'takeshiba-terminal', vesselId: 'ogasawara-maru', timeStatus: 'unknown-before-fixed-sailing', timeKnown: false }),
      HD('hd_l_headcount', 'Takeshiba boarding headcount before the 11:00 Ogasawara-maru sailing', 'おがさわら丸11:00出港前の竹芝乗船点呼', 'port', 'comms', ['p07'], 630, 30,
        { deps: ['hd_l_truck'], info: ['ic_cabins'], safetyGate: 2, routeLegId: 'out-ogasawara-maru', sceneId: 'takeshiba-terminal', vesselId: 'ogasawara-maru', timeStatus: 'unknown-before-fixed-sailing', timeKnown: false })
    ];
    var loadDecoys = [
      HD('hd_l_dec_souvenir', 'Last-minute Tokyo souvenir run', '出発前の東京土産購入',   'command', 'logi',     [], 480, 60, { required: false }),
      HD('hd_l_dec_pierfish', 'A few casts off the pier',       '埠頭でちょい投げ',       'port',    'specialist', [], 540, 60, { required: false, safetyFlag: true }),
      // W2a content: a plausible-but-inert admin distraction — feels like "work" but moves
      // nothing on the manifest chain, so placing it only ever costs the exec-lane decoy debit.
      HD('hd_l_dec_socialpost', 'Post departure photos to the office chat', '出発の様子を社内チャットに投稿', 'command', 'comms', [], 390, 30, { required: false })
    ];
    var loadCanonPlacement = {};
    loadReqTasks.forEach(function (t) {
      loadCanonPlacement[t.id] = { assignedIds: t.assignedIds.slice(), startMin: t.startMin, durMin: t.durMin };
      if (t.custody) loadCanonPlacement[t.id].carries = t.carries.slice();
    });
    // SEED GAP L1 (spec §4): the jig case is never assigned to the hotel→Takeshiba transfer — it misses the ship,
    // and on Day 3 the gear check stalls on it ("what misses the ship cannot be fixed at sea").
    for (var lri = 0; lri < loadReqTasks.length; lri++) if (loadReqTasks[lri].id === 'hd_l_truck') {
      loadReqTasks[lri].carries = loadReqTasks[lri].carries.filter(function (id) { return id !== 'mi_jigcase'; });
    }
    var loadCanonArrows = [
      H('h_l_manifest', 'ic_manifest', 'logi', 'hd_l_pack',   'siteLead', 'hd_l_truck',     { type: 'onTaskDone', taskId: 'hd_l_pack' },   'faceToFace', 'idle', null,
        '11 items packed & verified — manifest to the hotel-to-terminal transfer', '積荷11点確認済・ホテルから港への移動班へ引き渡し'),
      H('h_l_cabins',   'ic_cabins',   'pm',   'hd_l_cabins', 'comms',    'hd_l_headcount', { type: 'onTaskDone', taskId: 'hd_l_cabins' }, 'faceToFace', 'idle', null,
        'Cabin list final — check boarders off against it', '船室割当確定・点呼で照合')
    ];
    // SEED GAP L2 (spec §4): the cabin list is UNSHARED (h_l_cabins withheld) — the boarding
    // headcount idles past the fixed 11:00 sailing and the boarding gate fails on the seed.
    var loadHandoffs = [clone(loadCanonArrows[0])];
    // --- Day 0–1 · OGASAWARA-MARU (11:00 departure, about one day aboard) ---
    // The 16 outbound-care tasks (t_v_star_/t_v_esc_l_/t_v_esc_d_/t_v_esc_b_) ship UNSTAFFED; assigning a
    // buddy (plan.buddies / overrides.buddies) auto-staffs them onto the buddy (mergePlan).
    var careStarMin = { gd_watanabe: 780, gd_nagatani: 840, gd_kadou: 900, gd_maeda: 960 };
    var voyageTasks = [
      HD('hd_v_luggage',   'Ogasawara-maru departure and luggage runs to cabins', 'おがさわら丸出港・手荷物を船室へ', 'cabins', 'logi', ['p06'], SAIL_MIN, 120,
        { info: ['ic_cabins'], res: ['luggage'], routeLegId: 'out-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', timeStatus: 'confirmed-start-only', timeKnown: false, confirmedStartMin: SAIL_MIN }),
      HD('hd_v_watch',     'Day deck watch & seasickness rounds', '日中のデッキ監視・船酔い巡回', 'deck', 'safetyLead', ['p05'], 720, 420,
        { diff: 3, safetyGate: 2, routeLegId: 'out-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', timeStatus: 'planned' }),
      HD('hd_v_watch_night', 'Overnight watch and welfare rounds', '夜間当直・体調巡回', 'deck', 'siteLead', ['p03'], 1140, 420,
        { diff: 3, flex: true, routeLegId: 'out-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', timeStatus: 'planned' }),
      HD('hd_v_watch_morning', 'Next-morning watch and welfare rounds', '翌朝の当直・体調巡回', 'deck', 'safetyLead', ['p05'], 1560, 420,
        { diff: 3, flex: true, routeLegId: 'out-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', timeStatus: 'planned' }),
      HD('hd_v_brief',     'Brief the Chichijima ship change (arrival is approximate)', '父島での船乗換ブリーフィング（到着は概算）', 'deck', 'pm', ['p02'], 1980, 60,
        { routeLegId: 'out-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', timeStatus: 'approximate', timeKnown: false }),
      HD('hd_v_headcount', 'Arrival-approach roll call aboard Ogasawara-maru', 'おがさわら丸・到着前点呼', 'deck', 'comms', ['p07'], 2040, 60,
        { routeLegId: 'out-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', timeStatus: 'approximate', timeKnown: false })
    ];
    var voyageDecoys = [
      HD('hd_v_dec_sternfish', 'Fishing off the stern underway', '航行中の船尾釣り',   'deck',   'specialist', [], 900, 60, { required: false, safetyFlag: true }),
      HD('hd_v_dec_karaoke',   'Saloon karaoke hour',            '船内カラオケ大会',   'dining', 'comms',      [], 960, 60, { required: false }),
      // W2a content: a third plausible-but-inert distraction, on the cabins station so the
      // deck has one of each flavor (no outbound-care task loses its lane, decoy debit only).
      HD('hd_v_dec_nap',       'Afternoon nap in the cabin',      '船室で昼寝',         'cabins', 'logi',       [], 780, 60, { required: false })
    ];
    guests.forEach(function (g) {
      if (!g.voyageCare) return;
      voyageTasks.push(
        HD('t_v_star_' + g.id,  'Starlink registration — ' + g.name.en, 'スターリンク登録（' + g.name.jp + '様）', 'purser', 'pm', [], careStarMin[g.id], 60, { care: g.id }),
        HD('t_v_esc_l_' + g.id, 'Lunch escort — ' + g.name.en,          '昼食エスコート（' + g.name.jp + '様）',   'dining', 'pm', [], 720, 60,  { care: g.id, guestFacing: true }),
        HD('t_v_esc_d_' + g.id, 'Dinner escort — ' + g.name.en,         '夕食エスコート（' + g.name.jp + '様）',   'dining', 'pm', [], 1080, 60, { care: g.id, guestFacing: true }),
        HD('t_v_esc_b_' + g.id, 'Next-morning breakfast escort — ' + g.name.en, '翌朝食エスコート（' + g.name.jp + '様）', 'dining', 'pm', [], 1860, 60,
          { care: g.id, guestFacing: true, routeLegId: 'out-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', timeStatus: 'planned' })
      );
    });
    voyageTasks.forEach(function (t) {
      if (!t.routeLegId) t.routeLegId = 'out-ogasawara-maru';
      if (!t.sceneId) { t.sceneId = 'ogasawara-maru'; t.locationId = 'ogasawara-maru'; }
      if (!t.vesselId) t.vesselId = 'ogasawara-maru';
    });
    var voyageCanonPlacement = {};
    voyageTasks.forEach(function (t) {
      if (!t.careGuestId) voyageCanonPlacement[t.id] = { assignedIds: t.assignedIds.slice(), startMin: t.startMin, durMin: t.durMin };
    });
    var voyageCanonArrows = [
      H('h_v_cabins', 'ic_cabins', 'pm', null, 'logi', 'hd_v_luggage', { type: 'atMinute', value: 660 }, 'faceToFace', 'idle', null,
        'Cabin list re-shared at boarding — run the luggage by it', '乗船時に船室割当を再共有・荷物を配送')
    ];
    var voyageHandoffs = [clone(voyageCanonArrows[0])];   // drawn in the seed — voyage's seed gaps are the buddies + the card authority

    return {
      project: {
        id: 'ogasawara10',
        name: L('Ogasawara 10-Day Company Retreat', '小笠原10日間 社員イベント'),
        goal: L('Build cross-company bonds over a 10-day shared stay and fishing — safely and within budget.',
                'グループ会社横断メンバーが10日間共に生活し、釣り体験を通じて、安全かつ予算内で結束を深める。'),
        days: DAYS, location: L('Hahajima, Ogasawara (Hinata)', '小笠原・母島（ひなた）'), headcount: HEADCOUNT, staff: STAFF, guests: GUESTS, chefs: CHEFS,
        homeBaseStopId: 'hahajima-hinata',
        // The owner confirmed WHO changes at the Day-6 boundary, but not how the two
        // departing and two arriving guests (or their luggage) make that exchange.
        // This stays outside rehearsal scoring and blocks only real-execution readiness.
        guestRotationExchange: { day: 6, logisticsAttested: false },
        route: { outboundLegIds: ['out-breakfast', 'out-hotel-takeshiba', 'out-ogasawara-maru', 'out-chichijima-transfer', 'out-interisland', 'out-hinata'],
          returnLegIds: ['return-hinata', 'return-interisland', 'return-chichijima-transfer', 'return-ogasawara-maru', 'return-takeshiba'],
          returnConfirmed: false, returnStatus: 'inferred-reverse-route-timetable-unknown' },
        // dinner math (§5.1): chefs serve the 13 guests + 5 organizer add-ons = 18 portions @5 min = the 90-min cook block
        portions: { guests: GUESTS, organizers: STAFF, chefs: CHEFS, servedByChef: GUESTS, organizerAddOns: 5, cookMinPerPortion: 5 },
        successConditions: [
          { id: 's_safe',   text: L('All 24 return safely (0 incidents).', '参加者24名が全員無事に帰着（事故0件）。') },
          { id: 's_fish',   text: L('Fishing trips run on plan.', '釣行が計画どおり実施される。') },
          { id: 's_budget', text: L('Stays within budget; receipts reconciled.', '予算内・領収書精算が完了。') },
          { id: 's_flow',   text: L('No one stalled > 30 min waiting on a decision.', '判断待ちで30分以上停止する人がいない。') }
        ],
        constraints: [
          L('Remote island: 24h+ ferry, no same-day evacuation.', '離島：本土まで船24時間以上、即日避難不可。'),
          L('Card / comms unreliable on site.', '現地は通信・カード決済が不安定。'),
          L('Night sea / night movement is high-risk.', '夜間の海・移動は高リスク。')
        ]
      },

      // The 11 duty-holders who RUN the event: 8 AIBOS organizers + 3 contracted chefs.
      // The other 13 are group-company guests being hosted — they fish/eat/rest, they don't work.
      participants: [
        { id: 'p01', name: L('Matsumoto', '松本'), company: 'co_aibos', roleId: 'owner',      skill: { lead: 5 },                stamina: 4, constraints: {} },
        { id: 'p02', name: L('Inaba', '稲葉'),       company: 'co_aibos', roleId: 'pm',         skill: { plan: 5, coord: 5 },      stamina: 4, constraints: {} },
        { id: 'p03', name: L('Nishinaga', '西永'),    company: 'co_aibos', roleId: 'siteLead',   skill: { field: 5, fishing: 4 },   stamina: 5, constraints: {} },
        { id: 'p04', name: L('Prakhar', 'プラカル'),      company: 'co_aibos', roleId: 'budgetLead', skill: { finance: 5 },             stamina: 3, constraints: {} },
        { id: 'p05', name: L('Martin', 'マーティン'),    company: 'co_aibos', roleId: 'safetyLead', skill: { fishing: 5, firstAid: 4 },stamina: 5, constraints: {} },
        { id: 'p06', name: L('Kevin', 'ケビン'), company: 'co_aibos', roleId: 'logi',       skill: { logistics: 4, drive: 3 }, stamina: 4, constraints: {} },
        { id: 'p07', name: L('Andrew', 'アンドリュー'),  company: 'co_aibos', roleId: 'comms',      skill: { record: 4 },              stamina: 3, constraints: {} },
        { id: 'p08', name: L('Ambrose', 'アンブローズ'),      company: 'co_aibos', roleId: 'specialist', skill: { fishing: 5, coord: 4 },   stamina: 4, constraints: { allergy: 'shellfish' } },
        { id: 'p09', name: L('Akiyama', '秋山'),        company: 'co_chef',  roleId: 'chef',       skill: { cook: 5 },                stamina: 4, constraints: {} },
        { id: 'p10', name: L('Nao', 'ナオ'),      company: 'co_chef',  roleId: 'chef',       skill: { cook: 4 },                stamina: 4, constraints: {} },
        { id: 'p11', name: L('Kaito', 'カイト'),        company: 'co_chef',  roleId: 'chef',       skill: { cook: 4, buy: 3 },        stamina: 3, constraints: {} }
      ],

      // role instances. The 8 staff fill all 8 roles. GAPs are missing AUTHORITY / DEPUTY /
      // INFO / BUDGET / REPORT routes — responsibility present, but not yet made workable.
      roles: {
        owner:      { holder: 'p01', authority: { canDecide: true, canPay: true,  payCap: Infinity, canAbort: true  }, deputyId: 'p02', reportTo: null,       neededInfo: ['ic_return'],   decisionDeadline: 'sameDay' },
        pm:         { holder: 'p02', authority: { canDecide: true, canPay: true,  payCap: 50000,    canAbort: false }, deputyId: 'p03', reportTo: 'owner',    neededInfo: ['ic_ferry'],    decisionDeadline: '30min' },
        siteLead:   { holder: 'p03', authority: { canDecide: true, canPay: false, payCap: 0,        canAbort: false }, deputyId: null,  reportTo: 'pm',       neededInfo: ['ic_ferry'],    decisionDeadline: '5min' },   // GAP E: no deputy + overloaded
        budgetLead: { holder: 'p04', authority: { canDecide: true, canPay: true,  payCap: 100000,   canAbort: false }, deputyId: 'p02', reportTo: 'pm',       neededInfo: ['ic_food'],     decisionDeadline: '30min' },
        safetyLead: { holder: 'p05', authority: { canDecide: true, canPay: true,  payCap: 30000,    canAbort: true  }, deputyId: null,  reportTo: 'pm',       neededInfo: ['ic_hospital'], decisionDeadline: 'immediate' }, // GAP A: named but no deputy / abort authority on the risks
        logi:       { holder: 'p06', authority: { canDecide: false,canPay: true,  payCap: 20000,    canAbort: false }, deputyId: 'p08', reportTo: 'siteLead', neededInfo: ['ic_tackle'],   decisionDeadline: '30min' },
        comms:      { holder: 'p07', authority: { canDecide: false,canPay: false, payCap: 0,        canAbort: false }, deputyId: 'p02', reportTo: 'pm',       neededInfo: ['ic_return'],   decisionDeadline: 'immediate' },
        specialist: { holder: 'p08', authority: { canDecide: true, canPay: false, payCap: 0,        canAbort: false }, deputyId: 'p05', reportTo: 'siteLead', neededInfo: ['ic_menu', 'ic_tackle', 'ic_ground'], decisionDeadline: '5min' },
        chef:       { holder: 'p09', authority: { canDecide: true, canPay: true,  payCap: 20000,    canAbort: false }, deputyId: 'p10', reportTo: 'pm',       neededInfo: ['ic_food', 'ic_orgfood', 'ic_catch'], decisionDeadline: '30min' }
      },

      tasks: [
        // --- Day 1: arrival ---
        { id: 't01', name: L('Disembark Ogasawara-maru and change ships at Chichijima', '父島でおがさわら丸を下船・船を乗り換え'), station: 'port', phase: pA, ownerRoleId: 'logi', assignedIds: ['p06'], startDay: 1, dur: 0.25, deps: [], difficulty: 2, neededResources: [], neededInfo: ['ic_ferry'], neededAuthority: null,
          routeLegId: 'out-chichijima-transfer', sceneId: 'chichijima-transfer', timeStatus: 'unknown', timeKnown: false },
        { id: 't02', name: L('Separate inter-island vessel: Chichijima to Hahajima', '別の島間船で父島から母島へ'), station: 'vessel', phase: pA, ownerRoleId: 'siteLead', assignedIds: ['p03', 'p05'], startDay: 1.25, dur: 0.25, deps: ['t01'], difficulty: 3, neededResources: ['medkit'], neededInfo: ['ic_ferry'], neededAuthority: null,
          routeLegId: 'out-interisland', sceneId: 'interisland-ferry', vesselId: 'interisland-vessel', timeStatus: 'unknown', timeKnown: false },
        { id: 't03', name: L('Hahajima arrival and Hinata check-in / room assignment', '母島到着・ひなた受付／部屋割り'), station: 'lodging', phase: pA, ownerRoleId: 'logi', assignedIds: ['p06'], startDay: 1.5, dur: 0.25, deps: ['t02'], difficulty: 1, neededResources: ['keys'], neededInfo: ['ic_rooms'], neededAuthority: null,
          routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'unknown', timeKnown: false },
        { id: 't_intake', name: L('Supply & gear intake at Hinata (drinks, tackle, food, ice)', 'ひなたで物資・釣具搬入（飲料・釣具・食材・氷）'), station: 'lodging', phase: pA, ownerRoleId: 'logi', assignedIds: ['p06'], startDay: 1.5, dur: 0.25, deps: ['t02'], difficulty: 2, neededResources: ['storage'], neededInfo: ['ic_tackle'], neededAuthority: null,
          routeLegId: 'out-hinata', sceneId: 'hahajima-hinata', timeStatus: 'planned' },
        // --- Days 2–9: daily operations ---
        { id: 't_safety', name: L('Safety & weather watch', '安全・天候監視'),        station: 'clinic',  phase: pOps, ownerRoleId: 'safetyLead', assignedIds: ['p05'],               startDay: 1, dur: 8,   deps: [],          difficulty: 4, neededResources: ['medkit'],  neededInfo: ['ic_hospital'], neededAuthority: 'abort' }, // GAP A: no abort authority
        { id: 't_health', name: L('Health-issue response', '体調不良対応'),           station: 'clinic',  phase: pOps, ownerRoleId: 'safetyLead', assignedIds: ['p05'],               startDay: 1, dur: 8,   deps: [],          difficulty: 3, neededResources: ['medkit'],  neededInfo: ['ic_hospital'], neededAuthority: null },
        { id: 't06', name: L('Tackle prep', '釣具準備'),                             station: 'port',    phase: pOps, ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 1, dur: 1,   deps: ['t_intake'],difficulty: 2, neededResources: ['tackle'],  neededInfo: ['ic_tackle'],   neededAuthority: null },
        { id: 't07', name: L('Fishing trip (boat)', '釣行（船上）'),                 station: 'vessel',  phase: pOps, ownerRoleId: 'siteLead',   assignedIds: ['p03', 'p05'],        startDay: 2, dur: 6,   deps: ['t06'],     difficulty: 4, neededResources: ['boat', 'tackle'], neededInfo: ['ic_ferry'], neededAuthority: 'abort' },
        { id: 't08', name: L('Catch handling & ice', '漁獲処理・保管'),              station: 'mess',    phase: pOps, ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 2, dur: 6,   deps: ['t07'],     difficulty: 2, neededResources: ['ice'],     neededInfo: [],              neededAuthority: null },
        { id: 't_prep', name: L('Food prep', '食材仕込み'),                          station: 'mess',    phase: pOps, ownerRoleId: 'chef',       assignedIds: ['p09', 'p10'],        startDay: 1, dur: 8,   deps: ['t_intake'],difficulty: 3, neededResources: ['food'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't04', name: L('Serving meals & allergies', '食事提供・アレルギー対応'), station: 'mess',  phase: pOps, ownerRoleId: 'chef',       assignedIds: ['p09', 'p11'],        startDay: 1, dur: 8,   deps: ['t_prep'],  difficulty: 3, neededResources: ['food'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't_clean', name: L('Cleaning & lodging upkeep', '清掃・宿泊管理'),       station: 'lodging', phase: pOps, ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 1, dur: 8,   deps: [],          difficulty: 1, neededResources: [],          neededInfo: [],              neededAuthority: null },
        { id: 't11', name: L('Daily accounting & reconcile', '日次精算・領収書'),     station: 'finance', phase: pOps, ownerRoleId: 'budgetLead', assignedIds: ['p04'],               startDay: 1, dur: 8,   deps: [],          difficulty: 2, neededResources: ['cash'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't_report', name: L('Daily report & headcount', '日次報告・点呼'),       station: 'command', phase: pOps, ownerRoleId: 'comms',      assignedIds: ['p07', 'p02'],        startDay: 1, dur: 8,   deps: [],          difficulty: 2, neededResources: [],          neededInfo: ['ic_return'],   neededAuthority: null },
        // --- Day 10: return & shipping ---
        { id: 't_ship', name: L('Pack out at Hinata for the inferred reverse return route', 'ひなたで撤収・推定逆順ルートの帰路準備'), station: 'port', phase: pR, ownerRoleId: 'logi', assignedIds: [], startDay: 9, dur: 1, deps: ['t_clean'], difficulty: 3, neededResources: ['shipping'], neededInfo: ['ic_tackle'], neededAuthority: null,
          routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }, // GAP G: unstaffed
        { id: 't_settle', name: L('Final settlement & receipts', '最終精算・領収書'),  station: 'finance', phase: pR,   ownerRoleId: 'budgetLead', assignedIds: ['p04'],               startDay: 9, dur: 1,   deps: ['t11'],     difficulty: 2, neededResources: ['cash'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't12', name: L('Return-route headcount (reverse route inferred; timetable unconfirmed)', '帰路点呼（逆順ルートの推定・時刻未確認）'), station: 'port', phase: pR, ownerRoleId: 'comms', assignedIds: ['p07', 'p03'], startDay: 9, dur: 1, deps: ['t_ship'], difficulty: 2, neededResources: [], neededInfo: ['ic_return'], neededAuthority: null,
          routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false },

        // --- Day 3 · THE representative fishing day (hour-block authoring; detailed timing math retained) ---
        // PHASE 0 · pre-dawn intelligence (04:15–05:30)
        FD('t_f_food',       'Confirm supply & allergy list', '食材調達・アレルギー確認', 'finance', 'budgetLead', ['p04'], 255, 30, { produces: ['ic_food'] }),
        // Voyage repack: safety-gate prices trimmed (3/2/2 -> 2/1/1) so the fishday bucket lands ~30
        // while staying the heaviest; flag values are scoreTrip pricing only — zero behavior change.
        FD('t_f_weather',    'Dawn weather & sea check, set abort', '早朝海況確認・中止基準設定', 'clinic', 'safetyLead', ['p05'], 270, 30, { produces: ['ic_weather'], auth: 'abort', diff: 3, safetyGate: 2 }),
        FD('t_f_orgfood',    'Collect organizer dinner requests', '運営の夕食希望とりまとめ', 'command', 'comms', ['p07'], 270, 15, { produces: ['ic_orgfood'], diff: 1 }),
        FD('t_f_menu',       'Menu & portions (18 = 13 guests + 5)', '献立・食数決定（13名＋運営5食）', 'mess', 'chef', ['p09'], 300, 30, { info: ['ic_food', 'ic_weather', 'ic_orgfood'], produces: ['ic_menu'], res: ['food'], diff: 3 }),
        FD('t_f_tackleprep', 'Morning tackle & ice prep', '釣具・氷の朝準備', 'port', 'logi', ['p06'], 300, 30, { produces: ['ic_tackle'], res: ['tackle', 'ice'] }),
        // PHASE 1 · rig to the menu, set the heading (05:30–07:00)
        // Voyage §2: the gear check pre-checks the JIGS the Tokyo load day was supposed to put aboard
        // ('jigs' is backed by manifest item mi_jigcase). Resources were previously unconsulted, so
        // this is behavior-neutral until carryState says the item missed the ship.
        FD('t_f_gearload',   'Gear pre-check & load boat', '道具最終確認・積込', 'port', 'specialist', ['p08'], 330, 45, { info: ['ic_menu', 'ic_tackle'], produces: ['ic_target'], assumeOn: ['ic_menu'], res: ['jigs'], diff: 3 }),
        FD('t_f_route',      'Route & heading plan (fold in hard return)', '進路・漁場計画（帰港時刻厳守）', 'vessel', 'siteLead', ['p03'], 375, 30, { info: ['ic_menu', 'ic_target', 'ic_weather'], produces: ['ic_ground'], assumeOn: ['ic_menu', 'ic_target'], diff: 3 }),
        FD('t_f_headcount1', 'Departure headcount', '出港点呼', 'port', 'comms', ['p07'], 405, 15, { produces: ['ic_headcount'], diff: 1 }),
        // PHASE 2 · depart & fish (07:00–12:45)
        FD('t_f_depart',     'Depart & transit to ground', '出港・漁場へ移動', 'vessel', 'siteLead', ['p03'], 420, 60, { deps: ['t_f_route'], info: ['ic_ground', 'ic_headcount'], res: ['boat'], diff: 3 }),
        FD('t_f_rig',        'Rig en route', '航行中の仕掛け準備', 'vessel', 'specialist', ['p08'], 420, 60, { deps: ['t_f_gearload'], info: ['ic_ground'], assumeOn: ['ic_ground'] }),
        FD('t_f_seawatch',   'Sea watch (abort authority aboard)', '海上安全監視（中止権限）', 'vessel', 'safetyLead', ['p05'], 420, 420, { info: ['ic_weather'], auth: 'abort', diff: 4, safetyGate: 1 }),
        FD('t_f_triplog',    'Trip log & shore contact', '航海記録・陸上連絡', 'command', 'comms', ['p07'], 420, 330, { diff: 1 }),
        FD('t_f_hold',       'Hold station at the ground', '漁場で操船保持', 'vessel', 'siteLead', ['p03'], 480, 270, { deps: ['t_f_depart'], res: ['boat'], diff: 3 }),
        FD('t_f_fish',       'FISHING — catch to target', '釣り（目標数まで）', 'vessel', 'specialist', ['p08'], 480, 270, { deps: ['t_f_rig'], info: ['ic_ground'], assumeOn: ['ic_ground'], res: ['tackle'], diff: 4 }),
        FD('t_f_lunch',      'Guest lunch service', 'ゲスト昼食提供', 'mess', 'chef', ['p10', 'p11'], 660, 60, { res: ['food'], guest: true }),
        FD('t_f_tally',      'Catch tally & radio relay', '漁獲集計・無線連絡', 'vessel', 'specialist', ['p08'], 750, 15, { deps: ['t_f_fish'], produces: ['ic_catch'], diff: 1 }),
        // PHASE 2b · owner & PM flex/standby (§13.1) — low-stakes, no neededInfo/deps, so they
        // cannot alter the canonical cascade: remote work on another project / join the fishing /
        // help the galley if needed (normally not needed). Gives 8 organizer lanes + galley = 9 exec atoms.
        // Voyage repack: flex-flagged -> exempt from exec-lane pricing (fishday 8 lanes -> 6; §3.3
        // amendment reversing the §10-delta that added them for lane count). Tasks themselves stay.
        FD('t_f_flex_owner', 'Owner standby (remote work / join fishing / help galley if needed)', '代表待機（別件のリモート対応・釣り同行・厨房手伝いなど）', 'command', 'owner', ['p01'], 480, 60, { diff: 1, flex: true }),
        FD('t_f_flex_pm',    'PM standby (remote coordination / join fishing / help galley if needed)', '総合責任者待機（リモート調整・釣り同行・厨房手伝いなど）', 'command', 'pm', ['p02'], 600, 60, { diff: 1, flex: true }),
        // PHASE 3 · relay -> return -> cook backward from 18:00 (12:45–18:45)
        FD('t_f_return',     'Return transit (dockside 14:00)', '帰港（14:00接岸）', 'vessel', 'siteLead', ['p03'], 765, 75, { deps: ['t_f_tally'], res: ['boat'], diff: 3 }),
        FD('t_f_stow',       'Stow gear en route', '帰航中の道具収納', 'vessel', 'specialist', ['p08'], 765, 75, { deps: ['t_f_tally'], diff: 1 }),
        FD('t_f_sideprep',   'Side prep & lock final food count', '副菜仕込み・食数確定', 'mess', 'chef', ['p09', 'p10', 'p11'], 780, 105, { info: ['ic_ground', 'ic_catch'], res: ['food'], diff: 3 }),
        FD('t_f_land',       'Land & deliver catch', '接岸・漁獲引渡し', 'port', 'specialist', ['p08'], 840, 20, { deps: ['t_f_return', 't_f_stow'], diff: 1 }),
        FD('t_f_headcount2', 'Return headcount', '帰着点呼', 'port', 'comms', ['p07'], 840, 15, { deps: ['t_f_return'], info: ['ic_headcount'], diff: 1 }),
        FD('t_f_dock',       'Dock & secure the boat', '係留・船整理', 'port', 'siteLead', ['p03'], 840, 30, { deps: ['t_f_return'], res: ['boat'], diff: 1 }),
        FD('t_f_health',     'Crew health check', '帰港後健康チェック', 'clinic', 'safetyLead', ['p05'], 840, 30, { deps: ['t_f_seawatch'], res: ['medkit'], diff: 1, safetyGate: 1 }),
        FD('t_f_icing',      'Catch handling & icing to galley', '漁獲処理・氷詰め搬入', 'mess', 'logi', ['p06'], 860, 25, { deps: ['t_f_land'], info: ['ic_catch'], res: ['ice'] }),
        FD('t_f_fillet',     'Fillet & portion the catch', '捌き・切り分け', 'mess', 'chef', ['p09', 'p10', 'p11'], 885, 75, { deps: ['t_f_icing', 't_f_sideprep'], info: ['ic_catch'], diff: 3 }),
        FD('t_f_cook',       'COOK dinner main — 90 min = 5 × 18', '夕食メイン調理（90分＝5分×18食）', 'mess', 'chef', ['p09', 'p10', 'p11'], 960, 90, { deps: ['t_f_fillet'], info: ['ic_menu'], res: ['food'], wfPenalty: 30, diff: 3 }),
        FD('t_f_plate',      'Plate dinner', '盛り付け', 'mess', 'chef', ['p09', 'p10', 'p11'], 1050, 30, { deps: ['t_f_cook'], diff: 1 }),
        FD('t_f_serve',      'DINNER SERVICE 18:00 (13 guests + 5)', '夕食提供 18:00（13名＋運営5食）', 'mess', 'chef', ['p09', 'p10', 'p11'], 1080, 45, { deps: ['t_f_plate'], guest: true }),
        // PHASE 4 · close the books (19:00–20:00)
        FD('t_f_report',     'Daily report & catch log', '日次報告・釣果記録', 'command', 'comms', ['p07'], 1140, 60, { info: ['ic_catch'], diff: 1 }),
        FD('t_f_accounting', 'Daily accounting & receipts', '日次精算・領収書', 'finance', 'budgetLead', ['p04'], 1140, 60, { res: ['cash'], diff: 1 })
      ],

      infoCards: [
        { id: 'ic_ferry',    name: L('Vessel route & connection plan', '船の経路・乗換計画'),
          reason: L('Ogasawara-maru leaves Takeshiba at 11:00; the separate Chichijima→Hahajima vessel still needs its name and connection time confirmed.', 'おがさわら丸は竹芝11:00発。父島→母島の別船は船名と接続時刻の確認が必要。'),
          ownerRoleId: 'pm', recipientRoleIds: ['pm'], shareTiming: L('before hotel departure and again at the Chichijima transfer', 'ホテル出発前＋父島乗換時'), secrecy: 'all',
          impactIfUnshared: L('Confusion or a missed long-haul sailing / inter-island connection.', '長距離便・島間接続の混乱や乗り遅れ。'),
          known: { outboundHotelDepartMin: HOTEL_DEPART_MIN, outboundOgasawaraDepartMin: SAIL_MIN, outboundDurationMin: VOYAGE_APPROX_MIN },
          unknown: ['interislandVesselName', 'interislandDepartMin', 'interislandArriveMin', 'returnTimetable'] }, // GAP C: only PM
        { id: 'ic_rooms',    name: L('Room assignment', '部屋割り'),                 reason: L('Check-in flow and key handout.', 'チェックインと鍵配布のため。'),
          ownerRoleId: 'logi',       recipientRoleIds: ['siteLead', 'comms', 'logi'],                shareTiming: L('on arrival', '到着時'), secrecy: 'all', impactIfUnshared: L('Check-in chaos.', 'チェックイン混乱。') },
        { id: 'ic_hospital', name: L('Emergency hospital / evac', '緊急病院・搬送先'), reason: L('Needed instantly on injury/illness.', '負傷・体調不良時に即必要。'),
          ownerRoleId: 'safetyLead', recipientRoleIds: ['pm', 'siteLead'],                          shareTiming: L('day before', '前日'), secrecy: 'all', impactIfUnshared: L('Delayed care, safety risk.', '手当遅延・安全リスク。') }, // GAP H3 (refinement-2): under-shared — comms/safetyLead missing -> frame_hospital_shared fails
        { id: 'ic_food',     name: L('Food source & allergy list', '食材調達先・アレルギー一覧'), reason: L('Avoid allergic reactions / diet errors.', 'アレルギー・食事ミスの防止。'),
          ownerRoleId: 'budgetLead', recipientRoleIds: ['specialist', 'chef', 'budgetLead'],         shareTiming: L('day before', '前日'), secrecy: 'all', impactIfUnshared: L('Allergic incident, satisfaction drop.', 'アレルギー事故・満足度低下。'),
          allergens: ['shellfish'] }, // §13.1 make-real: machine-readable allergen list (was free text only)
        { id: 'ic_tackle',   name: L('Fishing tackle list', '釣り道具リスト'),       reason: L('Right gear per boat / spot.', '船・ポイント別の適切な道具。'),
          ownerRoleId: 'logi',       recipientRoleIds: ['siteLead', 'specialist', 'logi'],           shareTiming: L('day before', '前日'), secrecy: 'all', impactIfUnshared: L('Missing gear, trip delayed.', '道具不足・釣行遅延。') },
        { id: 'ic_return',   name: L('Return headcount confirmation', '帰着確認'),   reason: L('Confirm everyone is accounted for.', '帰着時に全員の所在を確認。'),
          ownerRoleId: 'comms',      recipientRoleIds: ['pm', 'owner', 'safetyLead', 'comms'],       shareTiming: L('on return', '帰着時'), secrecy: 'role', impactIfUnshared: L('Someone left behind unnoticed.', '置き去りに気づけない。') },
        // --- fishday loop cards (§5.2) — the 9 messages whose TIMING the fishday rehearses ---
        { id: 'ic_weather',  name: L('Sea state, GO/NO-GO & abort criterion', '海況・出航可否・中止基準'), reason: L('Menu commits to caught fish only if the trip is a GO.', '出航できる場合のみ献立を釣果前提にできる。'),
          ownerRoleId: 'safetyLead', recipientRoleIds: ['chef', 'siteLead', 'safetyLead'],           shareTiming: L('dawn, before menu', '早朝・献立決定前'), secrecy: 'all', impactIfUnshared: L('Menu gambles on an unreachable catch.', '実現不能な釣果前提の献立になる。') },
        { id: 'ic_orgfood',  name: L('Organizer dinner add-on count', '運営の夕食追加数'), reason: L('Total portions = 13 guests + organizer requests.', '食数＝ゲスト13＋運営の希望数。'),
          ownerRoleId: 'comms',      recipientRoleIds: ['chef', 'comms'],                            shareTiming: L('dawn, before menu', '早朝・献立決定前'), secrecy: 'all', impactIfUnshared: L('Portion count wrong at dinner.', '夕食の食数が合わない。'),
          addOns: 5 }, // §13.1 make-real: machine-readable organizer add-on count (was free text only)
        { id: 'ic_menu',     name: L('Menu: species, portions, cook-min, service time', '献立：魚種・食数・調理分数・提供時刻'), reason: L('Angler rigs to the species; boat folds the return deadline into the route.', '釣り担当は魚種に合わせ、船は帰港期限を計画に織り込む。'),
          ownerRoleId: 'chef',       recipientRoleIds: ['specialist', 'siteLead', 'chef'],           shareTiming: L('before gear load 05:30', '積込前 05:30'), secrecy: 'all', impactIfUnshared: L('Wrong fish rigged & targeted — rework at the galley.', '狙う魚がズレて手戻り（魚違い）。'),
          species: 'skipjack', portions: 18 }, // §13.1 make-real: committed species + portions (machine-readable, was free text only)
        { id: 'ic_target',   name: L('Operational catch goal: species, qty, size', '狙う魚種・数量・サイズ'), reason: L('Boat sets heading to the ground that matches the rig.', '仕掛けに合う漁場へ進路を取るため。'),
          ownerRoleId: 'specialist', recipientRoleIds: ['siteLead', 'specialist'],                   shareTiming: L('at gear load 06:15', '積込完了 06:15'), secrecy: 'all', impactIfUnshared: L('Boat guesses the ground — wrong fish.', '船が漁場を推測→魚違い。') },
        { id: 'ic_ground',   name: L('Fishing ground, heading, ETA & hard return', '漁場・進路・帰港時刻'), reason: L('Angler paces the catch; chef locks cook-start around landing.', '釣りの配分と調理開始の確定に必要。'),
          ownerRoleId: 'siteLead',   recipientRoleIds: ['specialist', 'chef', 'siteLead'],           shareTiming: L('before departure 06:45', '出港前 06:45'), secrecy: 'all', impactIfUnshared: L('Galley cannot time the cook block.', '調理開始時刻が組めない。') },
        { id: 'ic_headcount',name: L('Departure/return headcount manifest', '出港・帰着点呼名簿'), reason: L('Boat may not depart until the manifest is confirmed.', '点呼確認まで出港できない。'),
          ownerRoleId: 'comms',      recipientRoleIds: ['siteLead', 'comms'],                        shareTiming: L('at departure 07:00', '出港時 07:00'), secrecy: 'all', impactIfUnshared: L('Departure without accounting for everyone.', '所在未確認のまま出港。') },
        { id: 'ic_catch',    name: L('Catch tally: species, count, weight', '漁獲集計：魚種・尾数・重量'), reason: L('Chef preps the right portions before the fish even lands.', '接岸前に正しい食数で仕込めるため。'),
          ownerRoleId: 'specialist', recipientRoleIds: ['chef', 'logi', 'comms', 'specialist'],      shareTiming: L('radioed ~12:45 at sea', '海上から12:45頃無線'), secrecy: 'all', impactIfUnshared: L('3 chefs idle at the galley; wrong portions.', '料理3名が手待ち・食数ミス。') },
        { id: 'ic_cash',     name: L('Cash reserve location & draw rule', '現金予備費の保管場所・使用ルール'), reason: L('Cards/comms unreliable on site — cash backstops ice, bait, fuel.', 'カード不安定な現地で氷・餌・燃料の裏付け。'),
          ownerRoleId: 'budgetLead', recipientRoleIds: ['siteLead', 'logi', 'budgetLead'],           shareTiming: L('day before', '前日'), secrecy: 'role', impactIfUnshared: L('On-site purchase stalls when cards fail.', 'カード不通時に現地購入が止まる。') },
        // --- Voyage Day-0 cards (spec §1/§4) ---
        { id: 'ic_manifest', name: L('Route manifest: items & custody at both ship handovers', '経路積荷リスト（両方の船の引き渡し）'), reason: L('The hotel→Takeshiba movement and the Chichijima ship change must transfer exactly what was packed.', 'ホテル→竹芝の移動と父島での船の乗換で、積荷を確実に引き継ぐ必要がある。'),
          ownerRoleId: 'logi', recipientRoleIds: ['siteLead', 'logi'], shareTiming: L('at hotel pack-out and again at the Chichijima transfer', 'ホテル荷造り時＋父島乗換時'), secrecy: 'all', impactIfUnshared: L('Items miss the Ogasawara-maru or are lost/delayed during the ship change.', 'おがさわら丸への積み漏れ、または船の乗換時の紛失・遅延。') },
        { id: 'ic_cabins',   name: L('Cabin assignment list', '船室割当リスト'), reason: L('Boarding roll call and the luggage runs work off the cabin list.', '乗船点呼と荷物搬入は船室割当が前提。'),
          ownerRoleId: 'pm', recipientRoleIds: ['comms', 'logi', 'pm'], shareTiming: L('before Ogasawara-maru boarding', 'おがさわら丸乗船前'), secrecy: 'all', impactIfUnshared: L('Boarding stalls; luggage piles up unsorted.', '点呼が停滞・荷物が仕分け不能。') }
      ],

      // --- fishday handoffs (§6.1): the drawn arrows. Ships GAPPY like everything else:
      //   GAP H1 — the two cook-consult arrows (ic_menu -> angler / boat) were never drawn -> wrong-fish rework.
      //   GAP H2 — the tackle list goes out morning-of on chat -> arrives 06:10, 40 min late -> the angler idles.
      handoffs: gappyHandoffs(),

      budget: {
        total: 4800000,
        lines: [
          { id: 'bl_transport', name: L('Transport', '交通'),  cap: 1600000, spent: 0, approverRoleId: 'pm',         payMethod: 'card', receiptRule: 'required' },
          { id: 'bl_lodging',   name: L('Lodging', '宿'),      cap: 1100000, spent: 0, approverRoleId: 'pm',         payMethod: 'card', receiptRule: 'required' },
          { id: 'bl_meals',     name: L('Meals', '食事'),      cap: 700000,  spent: 0, approverRoleId: null,         payMethod: 'cash', receiptRule: 'required' }, // GAP B: no approver
          { id: 'bl_boat',      name: L('Boat charter', '船'), cap: 600000,  spent: 0, approverRoleId: 'budgetLead', payMethod: 'card', receiptRule: 'required' },
          { id: 'bl_tackle',    name: L('Gear / tackle', '道具'), cap: 200000, spent: 0, approverRoleId: 'logi',     payMethod: 'cash', receiptRule: 'photo' },
          { id: 'bl_onsite',    name: L('On-site / misc', '現地費'), cap: 300000, spent: 0, approverRoleId: 'siteLead', payMethod: 'cash', receiptRule: 'lenient' },
          // Voyage §3: the company-card envelope the 4 outbound-care Starlink registrations draw on.
          { id: 'bl_card',      name: L('Company card / ship Wi-Fi', '会社カード・船上Wi-Fi'), cap: 100000, spent: 0, approverRoleId: null, payMethod: 'card', receiptRule: 'required' } // SEED GAP V2 (spec §4): no card authority
        ],
        reserve: 0,   // GAP F: no cash reserve
        reserveTarget: 300000,
        resources: [
          { id: 'res_cash', name: L('Cash reserve', '現金予備費'), unit: L('yen', '円'), planned: 0, target: 300000, ownerRoleId: 'budgetLead' },
          { id: 'res_ice', name: L('Ice for catch', '漁獲用の氷'), unit: L('kg', 'kg'), planned: 40, target: 40, ownerRoleId: 'logi' },
          { id: 'res_fuel', name: L('Boat fuel buffer', '船の燃料余裕'), unit: L('hours', '時間'), planned: 2, target: 2, ownerRoleId: 'siteLead' },
          { id: 'res_food', name: L('Dinner portions', '夕食の食数'), unit: L('portions', '食'), planned: 18, target: 18, ownerRoleId: 'chef' }
        ],
        spendEvents: [
          { id: 'sp_meals', lineId: 'bl_meals', taskId: 't_f_food', name: L('Morning food buy', '朝の食材購入'), amount: 85000, actorRoleId: 'chef', requiredMethod: 'cash', requiresApproval: true, receiptRequired: true },
          { id: 'sp_ice', lineId: 'bl_tackle', taskId: 't_f_icing', name: L('Extra ice after catch tally', '釣果後の氷追加'), amount: 18000, actorRoleId: 'logi', requiredMethod: 'cash', requiresApproval: false, receiptRequired: true },
          { id: 'sp_fallback', lineId: 'bl_onsite', taskId: 't_f_sideprep', name: L('Fallback food if catch is low', '不漁時の代替食材'), amount: 60000, actorRoleId: 'siteLead', requiredMethod: 'cash', requiresApproval: true, receiptRequired: true },
          { id: 'sp_fuel', lineId: 'bl_boat', taskId: 't_f_depart', name: L('Fuel / dock fee', '燃料・港使用料'), amount: 45000, actorRoleId: 'siteLead', requiredMethod: 'card', requiresApproval: true, receiptRequired: true }
        ]
      },

      risks: [
        { id: 'rk_sea',     name: L('Rough sea during fishing', '釣行中の時化'),  trigger: L('Wave > 2m or wind > 12m/s', '波高2m超 or 風速12m/s超'), impact: 'high', ownerRoleId: null, fallback: L('Shore fishing / postpone', '陸釣り／延期'), abortCriterion: null, recoveryHours: 4 }, // GAP A
        { id: 'rk_night',   name: L('Night sea / movement', '夜間の海・移動'),    trigger: L('Any water activity after sunset', '日没後の水辺活動'),      impact: 'high', ownerRoleId: null, fallback: L('No night water activity', '夜間水上活動禁止'), abortCriterion: null, recoveryHours: 0 }, // GAP A
        { id: 'rk_health',  name: L('Participant illness/injury', '体調不良・怪我'), trigger: L('Fever, injury, severe seasickness', '発熱・負傷・船酔い重症'), impact: 'high', ownerRoleId: 'safetyLead', fallback: L('Clinic → ferry evac', '診療所→船で搬送'), abortCriterion: L('Evac if vitals unstable', 'バイタル不安定なら搬送'), recoveryHours: 24 },
        { id: 'rk_weather', name: L('Ferry cancellation (typhoon)', '船欠航（台風）'), trigger: L('Operator cancels sailing', '運航会社が欠航'),         impact: 'med',  ownerRoleId: 'pm', fallback: L('Extend lodging, re-plan', '宿泊延長・日程再調整'), abortCriterion: null, recoveryHours: 48 },
        { id: 'rk_cash',    name: L('On-site cash shortage', '現地現金不足'),     trigger: L('Cards/comms down, cash spent', 'カード不可・現金枯渇'),       impact: 'med',  ownerRoleId: 'budgetLead', fallback: L('Draw on cash reserve', '現金予備費から補填'), abortCriterion: null, recoveryHours: 6 }
      ],

      commRules: [
        { id: 'cr_delay',  condition: L('Delay ≥ 10 min', '10分以上の遅延'),         reporterRoleId: 'siteLead',   reportToRoleId: 'pm',    decisionDeadline: '5min',     channel: 'radio' },
        { id: 'cr_budget', condition: L('Overspend ≥ ¥10,000', '予算1万円以上超過'),  reporterRoleId: 'budgetLead', reportToRoleId: 'pm',    decisionDeadline: '30min',    channel: 'chat' },
        { id: 'cr_health', condition: L('Participant illness/injury', '参加者の体調不良'), reporterRoleId: 'safetyLead', reportToRoleId: null, decisionDeadline: 'immediate', channel: 'phone' }, // GAP D: no report route
        { id: 'cr_change', condition: L('Schedule change', '予定変更'),              reporterRoleId: 'pm',         reportToRoleId: 'owner', decisionDeadline: 'sameDay',  channel: 'board' },
        { id: 'cr_return', condition: L('Return headcount', '帰着確認'),            reporterRoleId: 'comms',      reportToRoleId: 'pm',    decisionDeadline: 'immediate',channel: 'board' }
      ],

      // ===========================================================================
      // §20.3 — plan.days: the authorable route/day rosters (load/voyage/arrival/ops/return),
      // Phase 1 (DATA ONLY — nothing in score()/detect()/createSim/mergePlan reads this
      // yet; Phase 2 wires it up). fishday is intentionally ABSENT — its data stays in
      // plan.tasks/plan.handoffs (frozen, byte-identical to before this change).
      //
      // Each day is { tasks:[HD(...)...], handoffs:[H(...)...], decoys:[taskId...] }.
      // `tasks` holds BOTH the required roster (required:true, the default) and the
      // decoys (required:false); `decoys` is just the id list into that same array.
      // Each day carries deterministic rehearsal anchors within DAY_WINDOWS; route tasks whose
      // real clocks are unknown say timeKnown:false/timeStatus:'unknown'. These anchors are a
      // canonical "would score 100" sequence, never a substitute published timetable. scoreDay/canonDay(seg) checks
      // against — mirroring canonHandoffs()'s role for fishday. Each day's handoffs reuse
      // the existing infoCards catalog (ic_ferry/ic_rooms/ic_tackle/ic_food/ic_catch/
      // ic_cash/ic_return — no new cards were needed) and include 2–3 handoffs that are
      // deliberately back-to-back (producer task ends the exact minute the consumer task
      // starts), each drawn on a near-zero-latency channel (faceToFace/radio) so the
      // canonical arrangement is zero-idle — exactly the arrangement a slower channel
      // (chat +10 / board +30) would push late once Phase 2's daySchedule prices it.
      // ===========================================================================

      // --- Voyage program: named guests, outbound-care buddies, and the physical manifest (spec §2/§3) ---
      guests: guests,
      guestRotations: guestRotations,
      // buddies {guestId: pid} — template default. SEED GAP V1 (spec §4): 2 of the 4 care buddies
      // are unassigned — and they are Nagatani & Kadou, the counterparties the trip exists for.
      buddies: { gd_watanabe: 'p01', gd_maeda: 'p04' },
      manifest: manifest,
      itinerary: clone(ITINERARY),
      physicalStops: clone(PHYSICAL_STOPS),
      vessels: clone(VESSELS),

      days: {
        load: {
          tasks: loadReqTasks.concat(loadDecoys),
          canonPlacement: loadCanonPlacement,
          canonHandoffs: loadCanonArrows,   // full canonical arrow set (canonDay draws withheld ones)
          handoffs: loadHandoffs,           // seed ships h_l_manifest only (h_l_cabins withheld — GAP L2)
          decoys: ['hd_l_dec_souvenir', 'hd_l_dec_pierfish', 'hd_l_dec_socialpost']   // W2a: extended to 3
        },
        voyage: {
          tasks: voyageTasks.concat(voyageDecoys),
          canonPlacement: voyageCanonPlacement,
          canonHandoffs: voyageCanonArrows,
          handoffs: voyageHandoffs,
          decoys: ['hd_v_dec_sternfish', 'hd_v_dec_karaoke', 'hd_v_dec_nap']   // W2a: extended to 3
        },
        arrival: {
          // required roster ships PARTLY CLEARED (see ARRIVAL_CLEARED above, §7/§13.4 P2);
          // decoys (3, plausible-but-wrong, never in the required set) always start unplaced too.
          tasks: arrivalReqTasks.concat([
            HD('hd_a_dec_nightfish',   'Night beach fishing', '夜釣り', 'vessel', 'specialist', [], 2640, 60, { required: false, diff: 3, safetyFlag: true, sceneId: 'hahajima-hinata' }),
            HD('hd_a_dec_sightseeing', 'Sightseeing detour during the ship change', '船の乗換中に観光へ立ち寄り', 'port', 'logi', [], 2160, 60, { required: false, sceneId: 'chichijima-transfer', timeStatus: 'unknown', timeKnown: false }),
            HD('hd_a_dec_soloTackle',  'Solo tackle test during the transfer', '乗換中の個人的な釣具テスト', 'port', 'specialist', [], 2160, 60, { required: false, sceneId: 'chichijima-transfer', timeStatus: 'unknown', timeKnown: false })
          ]),
          canonPlacement: arrivalCanonPlacement,
          handoffs: [
            H('h_a_ferry', 'ic_ferry',  'pm',         'hd_a_ferrycheck', 'logi',       'hd_a_board',      { type: 'onTaskDone', taskId: 'hd_a_ferrycheck' }, 'faceToFace', 'idle', null,
              'Inter-island connection and manifest confirmed for boarding · published time/name remain external facts', '島間船の接続・名簿を乗船班へ共有・公表時刻／船名は外部確認事項'),
            H('h_a_tackle', 'ic_tackle', 'logi',       'hd_a_intake',     'specialist', 'hd_a_gearstow',   { type: 'onTaskDone', taskId: 'hd_a_intake' }, 'radio', 'idle', null,
              'Tackle & ice landed and staged at the port shed', '釣具・氷を港の倉庫に搬入・配置済'),
            H('h_a_food', 'ic_food',    'budgetLead', 'hd_a_foodsource', 'chef',       'hd_a_dinnerprep', { type: 'onTaskDone', taskId: 'hd_a_foodsource' }, 'faceToFace', 'idle', null,
              'Supplier confirmed · 1 shellfish allergy on file', '仕入先確認済・貝アレルギー1名'),
            H('h_a_rooms', 'ic_rooms',  'logi',       'hd_a_checkin',    'comms',      'hd_a_headcount',  { type: 'onTaskDone', taskId: 'hd_a_checkin' }, 'chat', 'idle', null,
              'All 24 checked in and keyed to rooms', '24名全員チェックイン・鍵配布済')
          ],
          decoys: ['hd_a_dec_nightfish', 'hd_a_dec_sightseeing', 'hd_a_dec_soloTackle']
        },

        ops: {
          tasks: [
            // --- required roster (~12): a representative non-fishing ops day ---
            HD('hd_o_weather',     'Weather & safety check',           '天候・安全確認',           'clinic',  'safetyLead', ['p05'], 300, 60,  { produces: ['ic_weather'], diff: 3, safetyGate: 1 }),
            // Voyage repack: ops money flags + the three non-guest-facing quality flags retired
            // (bucket 18 -> 13; dinner service keeps its guest-facing quality check). Pricing-only.
            HD('hd_o_tackleprep',  'Tackle prep',                      '釣具準備',                 'port',    'logi',       ['p06'], 300, 60,  { produces: ['ic_tackle'], res: ['tackle'] }),
            HD('hd_o_shorefish',   'Shore-fishing session',            '陸釣り',                   'port',    'specialist', ['p08'], 360, 240, { deps: ['hd_o_weather', 'hd_o_tackleprep'], info: ['ic_weather', 'ic_tackle'], produces: ['ic_catch'], res: ['tackle'], diff: 3 }),
            HD('hd_o_catchhandle', 'Catch handling & ice',             '漁獲処理・保管',           'mess',    'logi',       ['p06'], 600, 60,  { deps: ['hd_o_shorefish'], info: ['ic_catch'], res: ['ice'] }),
            HD('hd_o_foodprep',    'Food prep',                        '食材仕込み',               'mess',    'chef',       ['p09', 'p10'], 300, 120, { res: ['food'], diff: 3 }),
            HD('hd_o_foodsource',  'Food source & allergy check',      '食材調達・アレルギー確認', 'finance', 'budgetLead', ['p04'], 300, 60,  { produces: ['ic_food'] }),
            HD('hd_o_lunch',       'Guest lunch service',              'ゲスト昼食提供',           'mess',    'chef',       ['p09', 'p10', 'p11'], 660, 60, { deps: ['hd_o_foodprep'], res: ['food'], guestFacing: true }),
            HD('hd_o_dinnerprep',  'Dinner prep',                      '夕食仕込み',               'mess',    'chef',       ['p09', 'p10'], 780, 120, { deps: ['hd_o_lunch'], info: ['ic_food'], res: ['food'], diff: 3 }),
            HD('hd_o_dinnerserve', 'Dinner service',                   '夕食提供',                 'mess',    'chef',       ['p09', 'p10', 'p11'], 1080, 60, { deps: ['hd_o_dinnerprep'], res: ['food'], guestFacing: true, qualityCheck: 1 }),
            HD('hd_o_accounting',  'Daily accounting & reconcile',     '日次精算・領収書',         'finance', 'budgetLead', ['p04'], 720, 60,  { res: ['cash'] }),
            HD('hd_o_report',      'Daily report & catch log',         '日次報告・釣果記録',       'command', 'comms',      ['p07'], 960, 60,  { deps: ['hd_o_catchhandle'], info: ['ic_catch'] }),
            HD('hd_o_clean',       'Cleaning & lodging upkeep',        '清掃・宿泊管理',           'lodging', 'logi',       ['p06'], 900, 60,  {}),
            HD('hd_o_safetywatch', 'Ongoing safety & weather watch',   '安全・天候監視（終日）',   'clinic',  'safetyLead', ['p05'], 600, 480, { diff: 4, safetyGate: 1 }),
            // --- decoys (3) ---
            HD('hd_o_dec_sidefish',  'Solo fishing side-trip',        '個人的な釣行',           'vessel',  'specialist', [], 600, 60, { required: false }),
            HD('hd_o_dec_marketrun', 'Unscheduled market run',        '予定外の買い出し',       'finance', 'budgetLead', [], 480, 60, { required: false }),
            HD('hd_o_dec_longlunch', 'Extended lunch social hour',    '延長ランチ交流会',       'mess',    'chef',       [], 720, 60, { required: false })
          ],
          handoffs: [
            H('h_o_weather', 'ic_weather', 'safetyLead', 'hd_o_weather',    'specialist', 'hd_o_shorefish',   { type: 'onTaskDone', taskId: 'hd_o_weather' }, 'faceToFace', 'idle', null,
              'Wind 5 m/s · GO for shore casting', '風5m/s・陸釣り実施可'),
            H('h_o_tackle', 'ic_tackle',  'logi',       'hd_o_tackleprep', 'specialist', 'hd_o_shorefish',   { type: 'onTaskDone', taskId: 'hd_o_tackleprep' }, 'radio', 'idle', null,
              '2 rods + bait staged at the point', '竿2・餌をポイントに配置済'),
            H('h_o_catch', 'ic_catch',    'specialist', 'hd_o_shorefish',  'logi',       'hd_o_catchhandle', { type: 'onTaskDone', taskId: 'hd_o_shorefish' }, 'radio', 'idle', null,
              '6 fish ~4 kg landed → ice now', '魚6尾・約4kg→即氷詰め'),
            H('h_o_food', 'ic_food',      'budgetLead', 'hd_o_foodsource', 'chef',       'hd_o_dinnerprep',  { type: 'onTaskDone', taskId: 'hd_o_foodsource' }, 'phone', 'idle', null,
              'Dinner stock confirmed · no new allergies', '夕食用食材確認済・新規アレルギーなし'),
            H('h_o_catchreport', 'ic_catch', 'specialist', 'hd_o_shorefish', 'comms',    'hd_o_report',      { type: 'onTaskDone', taskId: 'hd_o_shorefish' }, 'board', 'idle', null,
              'Catch logged for the daily report', '日次報告用に釣果を記録')
          ],
          decoys: ['hd_o_dec_sidefish', 'hd_o_dec_marketrun', 'hd_o_dec_longlunch']
        },

        'return': {
          // Return is the explicitly INFERRED reverse route; no published departure, connection,
          // or arrival clock has been supplied. Internal minutes are sequence anchors only. The
          // physical chain is Hahajima → inter-island vessel → Chichijima ship change →
          // Ogasawara-maru (~one day) → Takeshiba, never a direct five-hour Hahajima→Tokyo sail.
          tasks: [
            HD('hd_r_teardown', 'Teardown and pack at Hinata on Hahajima', '母島のひなたで撤収・荷造り', 'lodging', 'logi', ['p06'], 300, 120,
              { carries: RETURN_ITEMS, returnCustody: true, routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_checkout', 'Hinata room checkout', 'ひなた部屋チェックアウト', 'lodging', 'logi', ['p06'], 420, 60,
              { deps: ['hd_r_teardown'], routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_ship', 'Ship remaining supplies from Hahajima', '母島から残置物を発送', 'port', 'logi', ['p06'], 480, 60,
              { deps: ['hd_r_checkout'], info: ['ic_cash'], res: ['shipping'], routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_settle', 'Final settlement & receipts at Hinata', 'ひなたで最終精算・領収書', 'finance', 'budgetLead', ['p04'], 300, 180,
              { res: ['cash'], produces: ['ic_cash'], diff: 3, routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_sitecash', 'Site-lead cash sign-off at Hinata', 'ひなたで現地責任者による現金確認', 'finance', 'siteLead', ['p03'], 480, 60,
              { deps: ['hd_r_settle'], info: ['ic_cash'], routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_headcount', 'Hahajima departure headcount', '母島出発点呼', 'port', 'comms', ['p07'], 540, 60,
              { deps: ['hd_r_ship'], produces: ['ic_return'], safetyGate: 1, routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_ferrymarshal', 'Confirm inferred reverse connection and marshal at Hahajima', '推定逆順ルートの接続確認・母島で乗船整理', 'port', 'pm', ['p02'], 600, 60,
              { deps: ['hd_r_headcount'], info: ['ic_return'], routeLegId: 'return-hinata', sceneId: 'hahajima-hinata', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_hold', 'Load baggage onto the inter-island vessel at Hahajima', '母島で島間船へ荷物積込', 'port', 'siteLead', ['p03'], 600, 60,
              { deps: ['hd_r_ship'], carries: RETURN_ITEMS, returnCustody: true, routeLegId: 'return-interisland', sceneId: 'hahajima-hinata', vesselId: 'interisland-vessel', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_boarding', 'Board the inter-island vessel at Hahajima', '母島で島間船に乗船', 'port', 'pm', ['p02'], 660, 60,
              { deps: ['hd_r_ferrymarshal', 'hd_r_hold'], carries: RETURN_ITEMS, returnCustody: true, routeLegId: 'return-interisland', fromSceneId: 'hahajima-hinata', toSceneId: 'interisland-ferry', sceneId: 'hahajima-hinata', vesselId: 'interisland-vessel', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_interisland', 'Inter-island crossing from Hahajima to Chichijima', '母島から父島への島間航海', 'vessel', 'siteLead', ['p03'], 720, 120,
              { deps: ['hd_r_boarding'], carries: RETURN_ITEMS, returnCustody: true, routeLegId: 'return-interisland', sceneId: 'interisland-ferry', vesselId: 'interisland-vessel', inferred: true, timeStatus: 'unknown', timeKnown: false, diff: 3 }),
            HD('hd_r_chichi_transfer', 'Change ships and transfer baggage at Chichijima', '父島で船の乗換・荷物引き継ぎ', 'port', 'logi', ['p06'], 840, 120,
              { deps: ['hd_r_interisland'], carries: RETURN_ITEMS, returnCustody: true, routeLegId: 'return-chichijima-transfer', sceneId: 'chichijima-transfer', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_ogasawara_board', 'Board Ogasawara-maru at Chichijima', '父島でおがさわら丸に乗船', 'port', 'pm', ['p02'], 960, 60,
              { deps: ['hd_r_chichi_transfer'], carries: RETURN_ITEMS, returnCustody: true, routeLegId: 'return-ogasawara-maru', fromSceneId: 'chichijima-transfer', toSceneId: 'ogasawara-maru', sceneId: 'chichijima-transfer', vesselId: 'ogasawara-maru', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_sail', 'Ogasawara-maru voyage from Chichijima to Takeshiba (about one day)', 'おがさわら丸で父島から竹芝へ（約1日）', 'vessel', 'siteLead', ['p03'], 1020, VOYAGE_APPROX_MIN,
              { deps: ['hd_r_ogasawara_board'], carries: RETURN_ITEMS, returnCustody: true, routeLegId: 'return-ogasawara-maru', sceneId: 'ogasawara-maru', vesselId: 'ogasawara-maru', inferred: true, timeStatus: 'unknown-timetable-approx-duration', timeKnown: false, diff: 3 }),
            HD('hd_r_tokyocount', 'Takeshiba arrival headcount (timetable not confirmed)', '竹芝到着点呼（時刻未確認）', 'port', 'comms', ['p07'], 2460, 60,
              { deps: ['hd_r_sail'], routeLegId: 'return-takeshiba', sceneId: 'takeshiba-terminal', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            HD('hd_r_finalreport', 'Final report after the Takeshiba headcount', '竹芝点呼後の最終報告・締め', 'command', 'comms', ['p07'], 2520, 60,
              { deps: ['hd_r_tokyocount'], routeLegId: 'return-takeshiba', sceneId: 'takeshiba-terminal', inferred: true, timeStatus: 'unknown', timeKnown: false }),
            // --- decoys (3) ---
            HD('hd_r_dec_sidetrip',     'Last-day sightseeing detour',   '最終日の観光立ち寄り', 'port',    'siteLead',   [], 300, 60, { required: false }),
            HD('hd_r_dec_extraservice', 'Extra souvenir shopping run',   'お土産追加購入',       'finance', 'budgetLead', [], 600, 60, { required: false }),
            HD('hd_r_dec_latefish',     'One more cast before the ferry','出港前のもう一投',     'vessel',  'specialist', [], 660, 60, { required: false, safetyFlag: true })
          ],
          handoffs: [
            H('h_r_cash_site', 'ic_cash',  'budgetLead', 'hd_r_settle',    'siteLead', 'hd_r_sitecash',    { type: 'onTaskDone', taskId: 'hd_r_settle' }, 'faceToFace', 'idle', null,
              'All receipts reconciled · reserve intact', '領収書精算完了・予備費残高確認'),
            H('h_r_cash_ship', 'ic_cash',  'budgetLead', 'hd_r_settle',    'logi',     'hd_r_ship',        { type: 'onTaskDone', taskId: 'hd_r_settle' }, 'radio', 'idle', null,
              'Shipping cash draw approved', '発送費の現金使用承認済'),
            H('h_r_return',    'ic_return', 'comms',     'hd_r_headcount', 'pm',       'hd_r_ferrymarshal', { type: 'onTaskDone', taskId: 'hd_r_headcount' }, 'faceToFace', 'idle', null,
              '24 accounted for on Hahajima · reverse-route connection still requires operator confirmation', '母島で24名点呼済・逆順ルートの接続は運航確認が必要')
          ],
          decoys: ['hd_r_dec_sidetrip', 'hd_r_dec_extraservice', 'hd_r_dec_latefish']
        }
      }
    };
  }

  // ---- accessors over a (merged) plan ----
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function isOrganizerParticipant(plan, pid) {
    var p = plan && plan.participants && byId(plan.participants, pid);
    return !!(p && ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'specialist'].indexOf(p.roleId) >= 0);
  }
  // Resolve the four-person main/priority roster for an explicit owner-facing trip day.
  // This intentionally does not infer a day from a broad segment (`ops` crosses the Day-6
  // boundary) or from createSim's internal dayBase. Invalid/out-of-campaign days are empty.
  function guestRosterForDay(plan, tripDay) {
    if (!plan || !Array.isArray(plan.guests) || !Array.isArray(plan.guestRotations) ||
        typeof tripDay !== 'number' || !isFinite(tripDay) || Math.floor(tripDay) !== tripDay) return [];
    var wave = null, i, guest;
    for (i = 0; i < plan.guestRotations.length; i++) {
      var candidate = plan.guestRotations[i];
      if (tripDay >= candidate.startDay && tripDay <= candidate.endDay) { wave = candidate; break; }
    }
    if (!wave || !Array.isArray(wave.guestIds)) return [];
    var out = [];
    for (i = 0; i < wave.guestIds.length; i++) {
      guest = byId(plan.guests, wave.guestIds[i]);
      if (guest) out.push(guest);
    }
    return out;
  }
  // Shared authoring quantizer. Hour-block Day 3 uses 60-minute steps while the
  // deterministic rehearsal is free to retain finer evidence internally.
  function snapAuthoringMinute(seg, minute, direction) {
    var win = DAY_WINDOWS[seg], step = SNAP_MIN[seg] || 60;
    if (!win || typeof minute !== 'number' || !isFinite(minute)) return null;
    var units = (minute - win[0]) / step;
    units = direction === 'ceil' ? Math.ceil(units) : (direction === 'floor' ? Math.floor(units) : Math.round(units));
    return Math.max(win[0], Math.min(win[1], win[0] + units * step));
  }
  // Coarse editor projection for a detailed rehearsal task. Its start/end round
  // outward to containing authoring blocks. The detailed
  // template remains untouched until the player actually moves/resizes a block.
  function authoringTaskBlock(seg, startMin, durMin) {
    var win = DAY_WINDOWS[seg], step = SNAP_MIN[seg] || 60;
    if (!win || typeof startMin !== 'number' || !isFinite(startMin) ||
        typeof durMin !== 'number' || !isFinite(durMin) || durMin <= 0) return null;
    var start = snapAuthoringMinute(seg, startMin, 'floor');
    var end = snapAuthoringMinute(seg, startMin + durMin, 'ceil');
    if (end <= start) end = Math.min(win[1], start + step);
    var duration = end - start;
    if (duration < step) {
      start = Math.max(win[0], win[1] - step);
      duration = win[1] - start;
    }
    return { startMin: start, durMin: duration, endMin: start + duration };
  }
  // Pure display layout for projected authoring blocks. A task belongs to the
  // lane of its primary assignee (`assignedIds[0]`). Within each participant's
  // lane, projected blocks are ordered deterministically and greedily placed on
  // the lowest track whose previous half-open interval has ended.
  function authoringLaneLayout(seg, tasks) {
    if (!Array.isArray(tasks)) return [];
    var groups = [], i, j, task, participantId, block, group;
    for (i = 0; i < tasks.length; i++) {
      task = tasks[i];
      if (!task || !Array.isArray(task.assignedIds) || !task.assignedIds.length) continue;
      block = authoringTaskBlock(seg, task.startMin, task.durMin);
      if (!block) continue;
      participantId = task.assignedIds[0];
      group = null;
      for (j = 0; j < groups.length; j++) if (groups[j].participantId === participantId) { group = groups[j]; break; }
      if (!group) { group = { participantId: participantId, records: [] }; groups.push(group); }
      group.records.push({ taskId: task.id, participantId: participantId,
        startMin: block.startMin, durMin: block.durMin, endMin: block.endMin });
    }
    function cmpValue(a, b) {
      var as = String(a), bs = String(b);
      return as < bs ? -1 : (as > bs ? 1 : 0);
    }
    groups.sort(function (a, b) { return cmpValue(a.participantId, b.participantId); });
    var out = [];
    for (i = 0; i < groups.length; i++) {
      group = groups[i];
      group.records.sort(function (a, b) {
        return a.startMin - b.startMin || a.endMin - b.endMin || cmpValue(a.taskId, b.taskId);
      });
      var trackEnds = [];
      for (j = 0; j < group.records.length; j++) {
        var record = group.records[j], track = 0;
        while (track < trackEnds.length && trackEnds[track] > record.startMin) track++;
        trackEnds[track] = record.endMin;
        record.track = track;
        out.push(record);
      }
    }
    return out;
  }
  // Pure reducer shared by pointer and keyboard task editing. Boundary clamping lands
  // only on whole blocks, so an action never becomes a partial sub-block move.
  function editAuthoringTaskBlock(seg, startMin, durMin, deltaMin, resize) {
    var block = authoringTaskBlock(seg, startMin, durMin), win = DAY_WINDOWS[seg], step = SNAP_MIN[seg] || 60;
    if (!block || !win || typeof deltaMin !== 'number' || !isFinite(deltaMin) || deltaMin % step !== 0) return block;
    if (resize) {
      var nextDur = Math.max(step, Math.min(win[1] - block.startMin, block.durMin + deltaMin));
      return { startMin: block.startMin, durMin: nextDur, endMin: block.startMin + nextDur };
    }
    var nextStart = Math.max(win[0], Math.min(win[1] - block.durMin, block.startMin + deltaMin));
    return { startMin: nextStart, durMin: block.durMin, endMin: nextStart + block.durMin };
  }
  // Manual or automatically re-clamped sends use the same day-level authoring grid
  // and can never precede the producer's detailed completion time.
  function authoringSendMinute(seg, requestedMin, producerFinishMin) {
    if (typeof producerFinishMin !== 'number' || !isFinite(producerFinishMin)) return null;
    var requested = typeof requestedMin === 'number' && isFinite(requestedMin) ? requestedMin : producerFinishMin;
    return snapAuthoringMinute(seg, Math.max(requested, producerFinishMin), 'ceil');
  }
  function lineById(plan, id) { return byId(plan.budget.lines, id); }
  function loadOf(plan, pid) { var n = 0; for (var i = 0; i < plan.tasks.length; i++) if (plan.tasks[i].assignedIds.indexOf(pid) >= 0) n++; return n; }

  // remap each task's assignedIds pids through a substitution map (used by the §seats pass in mergePlan)
  function remapAssignees(tasks, sub) {
    for (var i = 0; i < tasks.length; i++) {
      var a = tasks[i].assignedIds;
      if (a && a.length) tasks[i].assignedIds = a.map(function (pid) { return sub[pid] !== undefined ? sub[pid] : pid; });
    }
  }

  // ---- merge the player's overrides onto the gappy TEMPLATE ----
  function mergePlan(cfg) {
    var plan = makeTemplate(), o = (cfg && cfg.overrides) || {};
    var k;
    // Scenario selection is metadata on the merged plan. The normal/no-scenario
    // paths remain behaviorally identical; channelFeasibility reads this field.
    if (cfg && cfg.scenarioId && SCENARIOS[cfg.scenarioId]) {
      plan.scenarioId = cfg.scenarioId;
      if (cfg.scenarioStrategyId && SCENARIO_STRATEGIES[cfg.scenarioId] &&
          SCENARIO_STRATEGIES[cfg.scenarioId][cfg.scenarioStrategyId]) {
        plan.scenarioStrategyId = cfg.scenarioStrategyId;
      }
    }
    // capture the template's DEFAULT seat holders (before any override mutates them) for the §seats remap below
    var SEAT_ROLES = ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'specialist'];
    var SEAT_DEFAULT_HOLDER = {}, SEAT_DEFAULT_PIDS = {};
    for (var sdi = 0; sdi < SEAT_ROLES.length; sdi++) { var _sh = plan.roles[SEAT_ROLES[sdi]].holder; SEAT_DEFAULT_HOLDER[SEAT_ROLES[sdi]] = _sh; SEAT_DEFAULT_PIDS[_sh] = 1; }
    if (o.roles) for (k in o.roles) if (plan.roles[k]) for (var rk in o.roles[k]) plan.roles[k][rk] = o.roles[k][rk];
    if (o.staffing) for (k in o.staffing) { var t = byId(plan.tasks, k); if (t) t.assignedIds = o.staffing[k].slice(); }
    if (o.info) for (k in o.info) { var c = byId(plan.infoCards, k); if (c) for (var ck in o.info[k]) c[ck] = o.info[k][ck]; }
    if (o.budget) {
      if (o.budget.lines) for (k in o.budget.lines) { var bl = lineById(plan, k); if (bl) for (var lk in o.budget.lines[k]) bl[lk] = o.budget.lines[k][lk]; }
      if (typeof o.budget.reserve === 'number') plan.budget.reserve = o.budget.reserve;
      if (typeof o.budget.reserveTarget === 'number') plan.budget.reserveTarget = o.budget.reserveTarget;
      if (o.budget.resources) for (k in o.budget.resources) { var br = byId(plan.budget.resources || [], k); if (br) for (var bk in o.budget.resources[k]) br[bk] = o.budget.resources[k][bk]; }
      if (o.budget.spendEvents) for (k in o.budget.spendEvents) { var se = byId(plan.budget.spendEvents || [], k); if (se) for (var sk in o.budget.spendEvents[k]) se[sk] = o.budget.spendEvents[k][sk]; }
    }
    if (o.risks) for (k in o.risks) { var rk2 = byId(plan.risks, k); if (rk2) for (var xk in o.risks[k]) rk2[xk] = o.risks[k][xk]; }
    if (o.comms) for (k in o.comms) { var cr = byId(plan.commRules, k); if (cr) for (var mk in o.comms[k]) cr[mk] = o.comms[k][mk]; }
    if (o.timing) for (k in o.timing) { var tt = byId(plan.tasks, k); if (tt) { if (typeof o.timing[k].startMin === 'number') tt.startMin = o.timing[k].startMin; if (typeof o.timing[k].durMin === 'number') tt.durMin = o.timing[k].durMin; } }
    if (o.handoffs) for (k in o.handoffs) {
      var hh = byId(plan.handoffs, k);
      if (o.handoffs[k] === null) { if (hh) plan.handoffs.splice(plan.handoffs.indexOf(hh), 1); } // erase an arrow
      else if (hh) { for (var hk in o.handoffs[k]) hh[hk] = clone(o.handoffs[k][hk]); }           // patch by id
      else { var nh = clone(o.handoffs[k]); nh.id = k; plan.handoffs.push(nh); }                  // draw a new arrow
    }
    // §20 authorable days: placement moves/clears a task on its lane; handoffs patch/erase/draw
    // per-day arrows (same schema). Never touches plan.tasks/plan.handoffs (the classic + fishday
    // frozen anchors), so score()/detect() are untouched.
    if (o.days && plan.days) for (var seg in o.days) {
      var dd = plan.days[seg]; if (!dd) continue; var od = o.days[seg];
      if (od.placement) for (var pid in od.placement) {
        var dt = byId(dd.tasks, pid); if (!dt) continue; var pv = od.placement[pid];
        if (pv === null) { dt.assignedIds = []; }                                                 // back to the deck (unplaced)
        else { if (typeof pv.startMin === 'number') dt.startMin = pv.startMin; if (typeof pv.durMin === 'number') dt.durMin = pv.durMin; if (pv.assignedIds) dt.assignedIds = pv.assignedIds.slice(); if (pv.carries) dt.carries = pv.carries.slice(); } // carries: route custody edits (for example, an item omitted from a transfer)
      }
      if (od.handoffs) for (var dh in od.handoffs) {
        var eh = byId(dd.handoffs, dh);
        if (od.handoffs[dh] === null) { if (eh) dd.handoffs.splice(dd.handoffs.indexOf(eh), 1); }
        else if (eh) { for (var ek in od.handoffs[dh]) eh[ek] = clone(od.handoffs[dh][ek]); }
        else { var ndh = clone(od.handoffs[dh]); ndh.id = dh; dd.handoffs.push(ndh); }
      }
    }
    // ---- player SEAT assignment: overrides.seats = {roleId: pid}, a bijection over the 8 organizer seats.
    // Runs LAST (after roles/staffing/days) so it also relabels applyFix's canonical default-holder pids.
    // IDENTITY holders => pure no-op (verify stays byte-identical). Remaps every default-organizer pid in
    // assignedIds + deputyId to the CURRENT seat holder and re-derives each organizer's participant.roleId from
    // the seating; chefs/guests untouched. Contract: every ORGANIZER pid (p01-p08) in a task's assignedIds —
    // template AND applyFix staffing alike — follows its seat; but a player's explicit per-day deck PLACEMENT is
    // already authored in current-holder pids (it read the merged plan), so those tasks are EXEMPT from the remap.
    // A malformed overrides.seats (not a bijection over p01-p08) is ignored — the default seating stands.
    if (o.seats) for (k in o.seats) if (plan.roles[k]) plan.roles[k].holder = o.seats[k];
    var seatRemap = {}, seatOfPid = {}, seatsChanged = false, seatOk = true, sri, sr, curH;
    for (sri = 0; sri < SEAT_ROLES.length; sri++) {
      sr = SEAT_ROLES[sri]; curH = plan.roles[sr].holder;
      if (!SEAT_DEFAULT_PIDS[curH] || seatOfPid[curH]) seatOk = false;   // not a known organizer pid, or double-booked
      seatOfPid[curH] = sr;
      seatRemap[SEAT_DEFAULT_HOLDER[sr]] = curH;
      if (SEAT_DEFAULT_HOLDER[sr] !== curH) seatsChanged = true;
    }
    if (!seatOk) {   // defensive: ignore a non-bijection, restore the default holders
      for (sri = 0; sri < SEAT_ROLES.length; sri++) plan.roles[SEAT_ROLES[sri]].holder = SEAT_DEFAULT_HOLDER[SEAT_ROLES[sri]];
      seatsChanged = false;
    }
    if (seatsChanged) {
      for (sri = 0; sri < plan.participants.length; sri++) { var sp = plan.participants[sri]; if (seatOfPid[sp.id]) sp.roleId = seatOfPid[sp.id]; }
      for (k in plan.roles) { var sd = plan.roles[k].deputyId; if (sd && seatRemap[sd] !== undefined) plan.roles[k].deputyId = seatRemap[sd]; }
      remapAssignees(plan.tasks, seatRemap);
      // coarse-day tasks: remap only the template-seeded assignees, NOT ones the player explicitly placed
      // (those already carry current-holder pids from the merged plan — remapping them would double-shift).
      if (plan.days) for (var sseg in plan.days) {
        var dseg = plan.days[sseg]; if (!dseg || !dseg.tasks) continue;
        var placedIds = (o.days && o.days[sseg] && o.days[sseg].placement) || {};
        remapAssignees(dseg.tasks.filter(function (t) { return !(placedIds[t.id] && placedIds[t.id].assignedIds); }), seatRemap);
      }
    }
    // ---- Voyage §3: outbound-care buddies. plan.buddies {guestId: pid} (template seeds 2 of the 4);
    // overrides.buddies assigns (pid) or clears (null) per guest. Assigning a buddy AUTO-INSTANTIATES
    // that guest's four voyage care tasks onto the buddy: assignedIds = [pid] and ownerRoleId re-homed
    // to the buddy's CURRENT role, so ANY organizer may hold the duty without a misassignment.
    // Runs LAST (after the seats pass) so participant.roleId is final — buddies are person-ids, not
    // seats, so they never remap. Guards: only the 8 organizer pids are accepted; one organizer may
    // buddy at most 2 care guests (excess assignments are dropped deterministically in guest order);
    // an unbuddied care guest's tasks stay unstaffed — the existing machinery prices that.
    if (o.buddies && plan.buddies && plan.guests) for (k in o.buddies) {
      var bg = byId(plan.guests, k);
      if (!bg || !bg.voyageCare) continue;
      if (o.buddies[k] === null) delete plan.buddies[k];
      else plan.buddies[k] = o.buddies[k];
    }
    if (plan.buddies && plan.guests && plan.days && plan.days.voyage) {
      var vTasks = plan.days.voyage.tasks, roleOfPid = {}, buddyLoad = {}, bi, bj;
      for (bi = 0; bi < plan.participants.length; bi++) roleOfPid[plan.participants[bi].id] = plan.participants[bi].roleId;
      // Care cards are authored only through the dedicated-buddy control. Discard any
      // generic day-placement override first so hand-placing four different organizers
      // cannot masquerade as one guest's continuous buddy relationship.
      for (bi = 0; bi < vTasks.length; bi++) if (vTasks[bi].careGuestId) vTasks[bi].assignedIds = [];
      for (bi = 0; bi < plan.guests.length; bi++) {
        var bGuest = plan.guests[bi]; if (!bGuest.voyageCare) continue;
        var bPid = plan.buddies[bGuest.id];
        if (!bPid || !SEAT_DEFAULT_PIDS[bPid]) { delete plan.buddies[bGuest.id]; continue; } // organizers (p01–p08) only
        buddyLoad[bPid] = (buddyLoad[bPid] || 0) + 1;
        if (buddyLoad[bPid] > 2) { delete plan.buddies[bGuest.id]; continue; } // at most 2 care guests per organizer
        var bPre = ['t_v_star_', 't_v_esc_l_', 't_v_esc_d_', 't_v_esc_b_'];
        for (bj = 0; bj < bPre.length; bj++) {
          var bTask = byId(vTasks, bPre[bj] + bGuest.id);
          if (bTask) { bTask.assignedIds = [bPid]; bTask.ownerRoleId = roleOfPid[bPid] || bTask.ownerRoleId; }
        }
      }
    }
    return plan;
  }

  // ===========================================================================
  // detect(plan) — the explainable rule engine (spec §13). Pure: reads only data.
  // Returns the active problems; each names a station to pile up at and a fixId.
  // ===========================================================================
  var DETECTORS = [
    {
      id: 'safety', category: 'safety', state: 'onFire', station: 'clinic', roleId: 'safetyLead',
      fixId: 'setSafety', severity: 'high', taskIds: ['t_safety', 't07', 't_f_weather', 't_f_seawatch'],
      test: function (plan) {
        var sl = plan.roles.safetyLead, sea = byId(plan.risks, 'rk_sea'), night = byId(plan.risks, 'rk_night');
        return !sl.holder || !sl.deputyId || !sea.ownerRoleId || !sea.abortCriterion || !night.ownerRoleId;
      }
    },
    {
      id: 'budgetAuth', category: 'budget', state: 'waiting', station: 'finance', roleId: 'budgetLead',
      fixId: 'grantAuth', severity: 'high', taskIds: ['t_prep', 't04', 't11', 't_settle'],
      test: function (plan) { var m = lineById(plan, 'bl_meals'); return !m.approverRoleId || !m.payMethod; }
    },
    {
      id: 'info', category: 'info', state: 'confused', station: 'port', roleId: 'pm',
      fixId: 'shareInfo', severity: 'med', taskIds: ['t01', 't02', 't07'],
      test: function (plan) {
        var f = byId(plan.infoCards, 'ic_ferry'), need = ['siteLead', 'specialist', 'chef', 'logi', 'safetyLead'];
        for (var i = 0; i < need.length; i++) if (f.recipientRoleIds.indexOf(need[i]) < 0) return true;
        return false;
      }
    },
    {
      id: 'report', category: 'info', state: 'meeting', station: 'command', roleId: 'safetyLead',
      fixId: 'setReport', severity: 'med', taskIds: ['t_report', 't_health'],
      test: function (plan) { var h = byId(plan.commRules, 'cr_health'); return !h.reportToRoleId; }
    },
    {
      id: 'fatigue', category: 'health', state: 'tired', station: 'vessel', roleId: 'siteLead',
      fixId: 'rebalance', severity: 'med', taskIds: ['t07', 't12'],
      test: function (plan) { var s = plan.roles.siteLead; return !s.deputyId && loadOf(plan, s.holder) >= LOAD_CAP; }
    },
    {
      id: 'reserve', category: 'budget', state: 'waiting', station: 'finance', roleId: 'budgetLead',
      fixId: 'fixReserve', severity: 'low', taskIds: ['t11', 't_settle'],
      test: function (plan) { return !(plan.budget.reserve >= (plan.budget.reserveTarget || 300000)); }
    },
    {
      id: 'returnLogi', category: 'roles', state: 'confused', station: 'port', roleId: 'logi',
      fixId: 'setReturn', severity: 'med', taskIds: ['t_ship', 't12'],
      test: function (plan) { var s = byId(plan.tasks, 't_ship'); return !s || s.assignedIds.length === 0; }
    },
    { // the temporal information axis (§1): an arrow missing, late, or guessed-on
      id: 'handoffTiming', category: 'info', state: 'waiting', station: 'port', roleId: 'specialist',
      fixId: 'fixHandoffs', severity: 'high', taskIds: ['t_f_gearload', 't_f_route', 't_f_cook', 't_f_plate', 't_f_serve'],
      test: function (plan) {
        // static arrow-DESIGN faults only (missing / late-by-design / un-runnable). Raw idle and
        // wrongFish are execution OUTCOMES: a carry stall (the jig case that missed the ship) also
        // idles people and makes an 'assume' task guess wrong with every arrow soundly drawn — that
        // is a Load-day custody gap billed to its own bucket + Efficiency, and "draw the arrows"
        // must never be a dead-end prescription for it. A design-caused wrong-fish always appears
        // in missing/late too (its assumed card is the one missing or late), so nothing is lost.
        var fd = fishdaySchedule(plan);
        return fd.missing.length > 0 || fd.late.length > 0 || fd.unresolved > 0;
      }
    }
  ];

  function detect(plan) {
    var out = [];
    for (var i = 0; i < DETECTORS.length; i++) { var d = DETECTORS[i]; if (d.test(plan)) out.push(d); }
    return out;
  }

  // ===========================================================================
  // applyFix(cfg, fixId) — writes the canonical correction into cfg.overrides.
  // ===========================================================================
  function ensure(o, k) { if (!o[k]) o[k] = {}; return o[k]; }
  function applyFix(cfg, fixId) {
    cfg = clone(cfg || { seed: 1, overrides: {} }); var o = cfg.overrides || (cfg.overrides = {});
    if (fixId === 'setSafety') {
      ensure(o, 'roles').safetyLead = { deputyId: 'p06' };
      ensure(o, 'staffing').t_safety = ['p05', 'p06'];
      var R = ensure(o, 'risks'); R.rk_sea = { ownerRoleId: 'safetyLead', abortCriterion: true }; R.rk_night = { ownerRoleId: 'safetyLead', abortCriterion: true };
    } else if (fixId === 'grantAuth') {
      ensure(ensure(o, 'budget'), 'lines').bl_meals = { approverRoleId: 'budgetLead', payMethod: 'cash' };
    } else if (fixId === 'shareInfo') {
      var INFO = ensure(o, 'info');
      INFO.ic_ferry = { recipientRoleIds: ['pm', 'siteLead', 'specialist', 'chef', 'logi', 'safetyLead'] };
      // refinement-2: also restore ic_hospital's under-shared recipient list (GAP H3) so
      // shareInfo becomes a real +2 fix (frame_hospital_shared) instead of a dead +0.
      INFO.ic_hospital = { recipientRoleIds: ['pm', 'siteLead', 'comms', 'safetyLead'] };
    } else if (fixId === 'setReport') {
      ensure(o, 'comms').cr_health = { reportToRoleId: 'pm' };
    } else if (fixId === 'rebalance') {
      ensure(o, 'roles').siteLead = { deputyId: 'p02' };
      var S = ensure(o, 'staffing'); S.t07 = ['p05']; S.t12 = ['p07'];
    } else if (fixId === 'fixReserve') {
      ensure(o, 'budget').reserve = 300000;
    } else if (fixId === 'setReturn') {
      ensure(o, 'staffing').t_ship = ['p06', 'p08'];
      ensure(o, 'info').ic_return = { recipientRoleIds: ['pm', 'owner', 'safetyLead', 'comms', 'siteLead'] };
    } else if (fixId === 'fixHandoffs') {
      // restore the FULL canonical arrow set (§5.3): re-times the tackle list, draws the two
      // cook-consult arrows, and heals any hand-erased or hand-slowed canonical arrow, so the
      // fix always returns the fishday to its zero-idle anchor no matter what the editor did.
      var HO = ensure(o, 'handoffs'), canon = canonHandoffs();
      for (var hi = 0; hi < canon.length; hi++) HO[canon[hi].id] = canon[hi];
    }
    return cfg;
  }
  function applyAllFixes(cfg) { var ids = ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn', 'fixHandoffs']; for (var i = 0; i < ids.length; i++) cfg = applyFix(cfg, ids[i]); return cfg; }

  // ---- which tasks are blocked (a problem hits them, or a dep is blocked) ----
  function blockedTasks(plan, problems) {
    var blocked = {}, i, p;
    for (i = 0; i < problems.length; i++) { p = problems[i]; for (var j = 0; j < p.taskIds.length; j++) blocked[p.taskIds[j]] = true; }
    var changed = true;
    while (changed) { // propagate down the dependency chain
      changed = false;
      for (i = 0; i < plan.tasks.length; i++) { var t = plan.tasks[i]; if (blocked[t.id]) continue; for (var d = 0; d < t.deps.length; d++) if (blocked[t.deps[d]]) { blocked[t.id] = true; changed = true; break; } }
    }
    return blocked;
  }

  // ===========================================================================
  // TEMPORAL LAYER (fishday) — pure, plan-derived, no RNG (§6). Arrows are
  // machine-checked deliveries: arrival = trigger time + channel latency. A late
  // 'idle' arrow makes its consumer WAIT (手待ち); a late/missing card the task
  // must guess on (assumeOn) causes wrong-fish REWORK (手戻り). onTaskDone arrows
  // resolve against the producer's EFFECTIVE finish, so one late arrow cascades
  // 港 → 船 → 食堂 all the way to dinner.
  // ===========================================================================
  function fishdayTasks(plan) { return plan.tasks.filter(function (t) { return t.day === 'fishday'; }); }
  // seg accessors — fishday lives in plan.tasks/plan.handoffs (frozen anchors); the authorable
  // coarse days live in plan.days[seg] (§20). A task is "placed" once a person is on its lane.
  function tasksForSeg(plan, seg) { if (seg === 'fishday') return fishdayTasks(plan); return (plan.days && plan.days[seg]) ? plan.days[seg].tasks : []; }
  function handoffsForSeg(plan, seg) { if (seg === 'fishday') return plan.handoffs; return (plan.days && plan.days[seg]) ? plan.days[seg].handoffs : []; }
  function isPlaced(t) { return !!(t.assignedIds && t.assignedIds.length > 0); }
  function deckFor(plan, seg) {
    var all = tasksForSeg(plan, seg), req = [], dec = [], un = [];
    for (var i = 0; i < all.length; i++) { var t = all[i]; if (t.required === false) dec.push(t.id); else req.push(t.id); if (!isPlaced(t)) un.push(t.id); }
    return { required: req, decoys: dec, unplaced: un };
  }
  function arrowsTo(plan, roleId, cardId) {
    var out = [];
    for (var i = 0; i < plan.handoffs.length; i++) { var h = plan.handoffs[i]; if (h.cardId === cardId && h.toRoleId === roleId) out.push(h); }
    return out;
  }
  // Resolve a handoff's segment without requiring callers to know which of the
  // classic fishday or authorable-day collections owns it.
  function handoffSegment(plan, h, seg) {
    if (seg) return seg;
    if (!h) return null;
    var i, k, hs;
    for (i = 0; i < (plan.handoffs || []).length; i++) if (plan.handoffs[i] === h || plan.handoffs[i].id === h.id) return 'fishday';
    for (k in (plan.days || {})) {
      hs = (plan.days[k] && plan.days[k].handoffs) || [];
      for (i = 0; i < hs.length; i++) if (hs[i] === h || hs[i].id === h.id) return k;
    }
    return null;
  }
  function handoffTask(plan, seg, id) {
    var tasks = seg ? tasksForSeg(plan, seg) : [];
    return byId(tasks, id) || byId(plan.tasks || [], id);
  }
  // A delivery is evidence, not just a matching card/recipient label. Direct
  // arrows must originate at a placed task in the same authored day, that task
  // must belong to the claimed sender, and it must actually produce the card.
  // A relay hop derives provenance from its validated inbound prerequisite; its
  // forwarding task still has to be real, placed, and owned by the forwarding
  // role. The sole cross-day exception is the cabin list prepared on Load and
  // re-shared at the start of Voyage.
  function isVoyageCabinExternal(h, seg) {
    return seg === 'voyage' && !!h && h.id === 'h_v_cabins' && h.cardId === 'ic_cabins' &&
      h.fromRoleId === 'pm' && h.fromTaskId == null && h.toRoleId === 'logi' &&
      h.toTaskId === 'hd_v_luggage';
  }
  function handoffProvenance(plan, h, seg) {
    seg = handoffSegment(plan, h, seg);
    if (!h || !seg) return { ok: false, reason: 'missing-handoff' };
    var sourceSeg = seg, source = null, relay = !!h.requiresHandoffId;
    if (isVoyageCabinExternal(h, seg)) {
      sourceSeg = 'load';
      source = byId(tasksForSeg(plan, sourceSeg), 'hd_l_cabins');
    } else {
      source = byId(tasksForSeg(plan, seg), h.fromTaskId);
    }
    if (!source) return { ok: false, reason: 'missing-producer' };
    if (!isPlaced(source)) return { ok: false, reason: 'producer-unplaced' };
    if (source.ownerRoleId !== h.fromRoleId) return { ok: false, reason: 'producer-role-mismatch' };
    // A forwarding task holds the card only through requiresHandoffId. The
    // prerequisite topology and arrival boundary are checked by the caller.
    if (!relay && (source.produces || []).indexOf(h.cardId) < 0) {
      return { ok: false, reason: 'producer-card-mismatch' };
    }
    if (typeof source.startMin !== 'number' || !isFinite(source.startMin) ||
        typeof source.durMin !== 'number' || !isFinite(source.durMin) || source.durMin < 0) {
      return { ok: false, reason: 'unresolved-producer' };
    }
    return { ok: true, reason: 'ok', task: source, segment: sourceSeg,
      relay: relay, external: sourceSeg !== seg,
      producerFinish: source.startMin + source.durMin };
  }
  function handoffMinute(plan, h, seg, endpoint) {
    var t, tr = h.trigger || {};
    if (endpoint === 'to') {
      t = handoffTask(plan, seg, h.toTaskId);
      return t && typeof t.startMin === 'number' && isFinite(t.startMin) ? t.startMin : null;
    }
    if (tr.type === 'atMinute') return typeof tr.value === 'number' && isFinite(tr.value) ? tr.value : null;
    t = handoffTask(plan, seg, tr.taskId || h.fromTaskId);
    if (!t || typeof t.startMin !== 'number' || !isFinite(t.startMin)) return null;
    if (tr.type === 'onTaskDone') return t.startMin + t.durMin;
    if (tr.type === 'beforeTaskStart') return t.startMin - (tr.leadMin || 0);
    return t.startMin;
  }
  function handoffContext(plan, h, seg, endpoint) {
    var id = endpoint === 'from' ? ((h.trigger && h.trigger.taskId) || h.fromTaskId) : h.toTaskId;
    var t = handoffTask(plan, seg, id), minute = handoffMinute(plan, h, seg, endpoint);
    // The whole Voyage board takes place aboard Ogasawara-maru. Other route
    // boards identify an underway endpoint with the physical vessel station;
    // Fishing Day needs the finer dock-edge rule below because its vessel tasks
    // span both briefing/boarding and actual time offshore.
    var atSea = seg === 'voyage' || (seg !== 'fishday' && !!t && t.station === 'vessel');
    // Fishing-day vessel work becomes physically at sea at departure and remains so
    // until the return transit ends. A route-planning block at the dock therefore
    // remains co-located, while a noon catch tally does not.
    if (seg === 'fishday' && t && t.station === 'vessel') {
      var dep = handoffTask(plan, seg, 't_f_depart'), ret = handoffTask(plan, seg, 't_f_return');
      var seaStart = dep && typeof dep.startMin === 'number' ? dep.startMin : 420;
      var seaEnd = ret && typeof ret.startMin === 'number' ? ret.startMin + ret.durMin : 840;
      // The exact departure minute is the final dockside briefing/boarding edge;
      // physical separation begins only after that edge.
      atSea = minute != null && minute > seaStart && minute < seaEnd;
    }
    return { taskId: id || null, station: t ? t.station : null, minute: minute, atSea: atSea, place: atSea ? 'sea' : 'shore' };
  }
  // Backward-compatible channel validator. CHANNELS remains the canonical numeric
  // latency table; feasibility is a separate, pure lens over physical context and
  // the optional deterministic scenario.
  function channelFeasibility(plan, handoff, seg) {
    seg = handoffSegment(plan, handoff, seg);
    var channel = handoff && handoff.channel;
    var from = handoffContext(plan, handoff || {}, seg, 'from');
    var to = handoffContext(plan, handoff || {}, seg, 'to');
    var base = { channel: channel || null, segment: seg, fromContext: from, toContext: to };
    function result(ok, reason) {
      return { ok: ok, reason: reason, channel: base.channel, segment: base.segment,
        fromContext: base.fromContext, toContext: base.toContext };
    }
    if (!Object.prototype.hasOwnProperty.call(CHANNELS, channel)) return result(false, 'unknown-channel');
    if (seg === 'fishday' && from.atSea !== to.atSea && (channel === 'faceToFace' || channel === 'board')) {
      return result(false, 'requires-colocation');
    }
    var scenario = SCENARIOS[plan.scenarioId || 'normal'] || SCENARIOS.normal;
    if ((from.atSea || to.atSea) && scenario.unavailableAtSea.indexOf(channel) >= 0) {
      return result(false, 'scenario-channel-unavailable');
    }
    return result(true, 'ok');
  }
  // plan-time (static) send/arrival — what the editor's readiness panel shows (§7.2).
  // A trigger that cannot resolve to a finite minute (missing task, or a day-clock task
  // with no startMin) returns null — NaN must never masquerade as an on-time delivery.
  function resolveSendMin(plan, h) {
    var t;
    if (h.trigger.type === 'atMinute') return (typeof h.trigger.value === 'number' && isFinite(h.trigger.value)) ? h.trigger.value : null;
    if (h.trigger.type === 'onTaskDone') { t = byId(plan.tasks, h.trigger.taskId); return (t && typeof t.startMin === 'number') ? (t.startMin + t.durMin) : null; }
    if (h.trigger.type === 'beforeTaskStart') { t = byId(plan.tasks, h.trigger.taskId || h.toTaskId); return (t && typeof t.startMin === 'number') ? (t.startMin - (h.trigger.leadMin || 0)) : null; }
    return null;
  }
  // Planned end-to-end delivery for either a direct arrow or a validated relay
  // chain. This is presentation-safe evidence: every failure has a stable reason,
  // and caller-owned handoffs/seen maps are never modified.
  function plannedHandoffPath(plan, h, seg, seen) {
    seg = handoffSegment(plan, h, seg);
    if (!h || !seg) return { feasible: false, reason: 'missing-handoff', sendMin: null, arrivalMin: null, handoffIds: [], channels: [] };
    var key = seg + '|' + h.id, trail = {}, k;
    for (k in (seen || {})) trail[k] = seen[k];
    if (trail[key]) return { feasible: false, reason: 'relay-cycle', sendMin: null, arrivalMin: null, handoffIds: [], channels: [] };
    trail[key] = 1;
    var f = channelFeasibility(plan, h, seg);
    if (!f.ok) return { feasible: false, reason: f.reason, sendMin: null, arrivalMin: null, handoffIds: [h.id], channels: [h.channel] };
    var provenance = handoffProvenance(plan, h, seg);
    if (!provenance.ok) return { feasible: false, reason: provenance.reason, sendMin: null,
      arrivalMin: null, handoffIds: [h.id], channels: [h.channel] };
    var send = handoffMinute(plan, h, seg, 'from');
    if (send == null || !isFinite(send)) return { feasible: false, reason: 'unresolved-trigger', sendMin: null, arrivalMin: null, handoffIds: [h.id], channels: [h.channel] };
    if (!provenance.relay && send < provenance.producerFinish) {
      return { feasible: false, reason: 'premature-handoff', sendMin: send,
        arrivalMin: null, handoffIds: [h.id], channels: [h.channel] };
    }
    var ids = [], channels = [];
    if (h.requiresHandoffId) {
      var dep = byId(handoffsForSeg(plan, seg), h.requiresHandoffId);
      if (!dep) return { feasible: false, reason: 'missing-prerequisite', sendMin: send, arrivalMin: null, handoffIds: [h.id], channels: [h.channel] };
      if (dep.cardId !== h.cardId || dep.toRoleId !== h.fromRoleId) {
        return { feasible: false, reason: 'relay-mismatch', sendMin: send, arrivalMin: null,
          handoffIds: [dep.id, h.id], channels: [dep.channel, h.channel] };
      }
      var prior = plannedHandoffPath(plan, dep, seg, trail);
      if (!prior.feasible) return { feasible: false, reason: prior.reason, sendMin: send, arrivalMin: null,
        handoffIds: prior.handoffIds.concat([h.id]), channels: prior.channels.concat([h.channel]) };
      if (prior.arrivalMin > send) return { feasible: false, reason: 'relay-not-ready', sendMin: send, arrivalMin: null,
        handoffIds: prior.handoffIds.concat([h.id]), channels: prior.channels.concat([h.channel]) };
      ids = prior.handoffIds.slice(); channels = prior.channels.slice();
    }
    ids.push(h.id); channels.push(h.channel);
    return { feasible: true, reason: 'ok', sendMin: send, arrivalMin: send + CHANNELS[h.channel],
      handoffIds: ids, channels: channels };
  }
  function staticArrival(plan, h) {
    var path = plannedHandoffPath(plan, h, 'fishday');
    return path.feasible ? path.arrivalMin : null;
  }
  function infoArrival(plan, cardId, roleId) { // earliest static arrival over drawn arrows (null = never)
    var hs = arrowsTo(plan, roleId, cardId), best = null;
    for (var i = 0; i < hs.length; i++) { var a = staticArrival(plan, hs[i]); if (a != null && (best == null || a < best)) best = a; }
    return best;
  }

  // UI-facing trade-off lens for the controlled Day-3 food->menu root. It reads
  // authored topology and the same feasibility/schedule/cluster engines used for
  // scoring; it does not infer points from strategy labels. Consequently custom
  // direct/relay/redundant paths project honestly too.
  function day3FoodStrategy(plan) {
    plan = plan || makeTemplate();
    var menu = byId(fishdayTasks(plan), DAY3_FOOD_ROOT.taskId), menuStart = menu ? menu.startMin : null;
    var segHandoffs = handoffsForSeg(plan, 'fishday');
    var hs = segHandoffs.filter(function (h) {
      return h.cardId === DAY3_FOOD_ROOT.cardId && h.toRoleId === 'chef' && h.toTaskId === DAY3_FOOD_ROOT.taskId;
    });
    var paths = [], allIds = [], allChannels = [], senderWorkload = {}, i, j;
    for (i = 0; i < hs.length; i++) {
      var h = hs[i], path = plannedHandoffPath(plan, h, 'fishday'), onTime = path.feasible && menuStart != null && path.arrivalMin <= menuStart;
      var relayRoleId = path.handoffIds.length > 1 ? (h.relayRoleId || h.fromRoleId || null) : null;
      paths.push({ id: h.pathId || h.id, kind: path.handoffIds.length > 1 ? 'relay' : 'direct',
        channel: h.channel || null, channels: path.channels.slice(), arrivalMin: path.arrivalMin,
        feasible: path.feasible, onTime: onTime, reason: path.feasible ? (onTime ? 'ok' : 'late') : path.reason,
        relayRoleId: relayRoleId, handoffIds: path.handoffIds.slice() });
      for (j = 0; j < path.handoffIds.length; j++) {
        var ph = byId(segHandoffs, path.handoffIds[j]);
        if (allIds.indexOf(path.handoffIds[j]) < 0) {
          allIds.push(path.handoffIds[j]);
          if (ph) senderWorkload[ph.fromRoleId] = (senderWorkload[ph.fromRoleId] || 0) + 1;
        }
      }
      for (j = 0; j < path.channels.length; j++) if (allChannels.indexOf(path.channels[j]) < 0) allChannels.push(path.channels[j]);
    }
    paths.sort(function (a, b) { return a.id < b.id ? -1 : (a.id > b.id ? 1 : 0); });
    allIds.sort(); allChannels.sort();
    var feasiblePaths = paths.filter(function (p) { return p.feasible; });
    var onTimePaths = paths.filter(function (p) { return p.onTime; });
    var earliest = null, shortest = null, maxRelay = 0;
    for (i = 0; i < feasiblePaths.length; i++) if (earliest == null || feasiblePaths[i].arrivalMin < earliest) earliest = feasiblePaths[i].arrivalMin;
    for (i = 0; i < onTimePaths.length; i++) {
      var plen = onTimePaths[i].handoffIds.length;
      if (shortest == null || plen < shortest) shortest = plen;
      if (plen - 1 > maxRelay) maxRelay = plen - 1;
    }
    // Maximum count of mutually handoff-disjoint on-time paths (small authored
    // graph, exhaustive subsets). Shared relay intake therefore never masquerades
    // as independent redundancy.
    var independent = 0, n = onTimePaths.length;
    if (n <= 15) for (var mask = 1; mask < (1 << n); mask++) {
      var used = {}, count = 0, disjoint = true;
      for (i = 0; i < n && disjoint; i++) if (mask & (1 << i)) {
        count++;
        for (j = 0; j < onTimePaths[i].handoffIds.length; j++) {
          var hid = onTimePaths[i].handoffIds[j]; if (used[hid]) { disjoint = false; break; } used[hid] = 1;
        }
      }
      if (disjoint && count > independent) independent = count;
    } else independent = onTimePaths.length ? 1 : 0;
    var topologyStrategyId = null;
    if (independent >= 2) topologyStrategyId = 'redundant-paths';
    else if (onTimePaths.some(function (p) { return p.kind === 'relay'; })) topologyStrategyId = 'delegated-relay';
    else if (onTimePaths.length) topologyStrategyId = 'direct-fast';

    // Recipe identity is authored intent, not the topology that happens to
    // survive a failure. Read all controlled food handoffs (including the relay
    // intake, which is not itself a menu endpoint). A known handoff carrying the
    // wrong recipe tag, an unknown tag, or more than one tag is an invalid mixed
    // identity and fails closed to null. Untagged legacy/custom plans retain the
    // topology fallback for backwards compatibility.
    var authoredIds = [], metadataInvalid = false, metadataSeen = false;
    for (i = 0; i < segHandoffs.length; i++) {
      var mh = segHandoffs[i];
      if (mh.cardId !== DAY3_FOOD_ROOT.cardId || mh.strategyId == null) continue;
      metadataSeen = true;
      if (DAY3_FOOD_STRATEGY_IDS.indexOf(mh.strategyId) < 0 || DAY3_FOOD_HANDOFF_STRATEGY[mh.id] !== mh.strategyId) {
        metadataInvalid = true; continue;
      }
      if (authoredIds.indexOf(mh.strategyId) < 0) authoredIds.push(mh.strategyId);
    }
    authoredIds.sort();
    var metadataConflict = metadataInvalid || authoredIds.length > 1;
    var strategyId = metadataConflict ? null : (authoredIds.length === 1 ? authoredIds[0] : topologyStrategyId);
    var ds = daySchedule(plan, 'fishday');
    var socketMissing = ds.missing.some(function (x) { return x.taskId === DAY3_FOOD_ROOT.taskId && x.cardId === DAY3_FOOD_ROOT.cardId; });
    var socketLate = ds.late.some(function (x) { return x.taskId === DAY3_FOOD_ROOT.taskId && x.cardId === DAY3_FOOD_ROOT.cardId; });
    var socketResolved = onTimePaths.length > 0 && !socketMissing && !socketLate;
    var recipeComplete = false;
    if (!metadataConflict && strategyId) {
      if (!metadataSeen) recipeComplete = topologyStrategyId === strategyId && socketResolved;
      else recipeComplete = DAY3_FOOD_RECIPE_HANDOFFS[strategyId].every(function (id) {
        var rh = byId(segHandoffs, id); return !!rh && rh.strategyId === strategyId;
      });
    }
    var degraded = metadataConflict || !recipeComplete || !socketResolved ||
      (strategyId != null && topologyStrategyId !== strategyId);
    var clusters = planClusters(plan), fishCluster = clusters.filter(function (c) { return c.id === 'fishday'; })[0];
    var foodRoots = fishCluster ? fishCluster.rootIssues.filter(function (r) {
      return r.cardIds.indexOf(DAY3_FOOD_ROOT.cardId) >= 0 && r.taskIds.indexOf(DAY3_FOOD_ROOT.taskId) >= 0;
    }) : [];
    var trip = scoreTrip(plan), actualMenuStart = ds.byTask[DAY3_FOOD_ROOT.taskId] ? ds.byTask[DAY3_FOOD_ROOT.taskId].start : null;
    var producer = byId(fishdayTasks(plan), 't_f_food'), producerFinish = producer ? producer.startMin + producer.durMin : null;
    return { root: clone(DAY3_FOOD_ROOT), strategyId: strategyId, topologyStrategyId: topologyStrategyId,
      recipeComplete: recipeComplete, degraded: degraded, resolved: socketResolved,
      rootCleared: foodRoots.length === 0, mastered: trip.total === 100 && trip.gate.clean === true,
      wholePlanScore: trip.total, clusterEarned: fishCluster ? fishCluster.earned : 0,
      clusterMaxPts: fishCluster ? fishCluster.maxPts : 0,
      arrivalMin: earliest, latencyMin: earliest == null || producerFinish == null ? null : earliest - producerFinish,
      menuStartMin: menuStart, marginMin: earliest == null || menuStart == null ? null : menuStart - earliest,
      transmissions: allIds.length, coordinationWorkload: allIds.length, senderWorkload: senderWorkload,
      relaySteps: maxRelay, pathCount: paths.length, feasiblePathCount: feasiblePaths.length,
      onTimePathCount: onTimePaths.length, channelCount: allChannels.length,
      singlePathFailureTolerance: Math.max(0, independent - 1),
      redundancyEffort: onTimePaths.length > 1 && shortest != null ? Math.max(0, allIds.length - shortest) : 0,
      timingDisplacementMin: actualMenuStart == null || menuStart == null ? null : actualMenuStart - menuStart,
      paths: paths };
  }

  // The cascade: effective start = max(planned start, deps' effective ends, waited-on
  // arrivals) — so a task's idle is the MAX of its late inputs, never the sum. Runs to
  // a fixpoint, then once more if wrong-fish extends the cook block. injections =
  // checkpoint hand-feeds (sim-local; score() never sees them — the plan gap survives
  // a clean re-run, §8). Classic detector blocks are deliberately IGNORED here so a
  // safety gap never double-bills as handoff idle (§9 no-double-count rule).
  // Generalized cascade (§20.2): fishday delegates here so its 220/91%/dinner anchors stay
  // byte-identical, while the authorable coarse days run the same machine over plan.days[seg].
  // Only PLACED tasks schedule; arrows/producers resolve within the seg. Adds four authoring
  // read-offs (unplacedRequired / decoysPlaced / misassigned / overbookMin) the fishday path
  // simply reports as empty/0.
  function fishdaySchedule(plan, injections) { return daySchedule(plan, 'fishday', injections); }
  function daySchedule(plan, seg, injections, internalOpts) {
    seg = seg || 'fishday';
    var allSeg = tasksForSeg(plan, seg), fds = [], i, j, k;
    for (i = 0; i < allSeg.length; i++) if (isPlaced(allSeg[i])) fds.push(allSeg[i]);
    var fdById = {}; for (i = 0; i < fds.length; i++) fdById[fds[i].id] = fds[i];
    var segHandoffs = handoffsForSeg(plan, seg);
    // Voyage §2 — manifest carryover consult. Pure and INTERNAL (no signature change): a task
    // needing a resource whose backing item missed the ship stalls here, in the same visible
    // language as a missing information arrow (wait to startMin + IDLE_CAP). Three guards keep the
    // canonical all-aboard path byte-identical to the pre-Voyage engine: no manifest / the origin
    // 'load' segment / no placed task needing a manifest-bound resource => carry is never computed;
    // and an 'aboard' (or 'late'-but-aboard) item adds nothing to the cascade.
    var carryByRes = null, carrySt = null;
    if (!(internalOpts && internalOpts.skipCarry) && seg !== 'load' && plan.manifest && plan.manifest.length) {
      var resMap = {}, needCarry = false, mri, mrj;
      for (mri = 0; mri < plan.manifest.length; mri++) {
        var mIt = plan.manifest[mri];
        if (seg === 'return' ? mIt.returnRequired === false : mIt.outboundRequired === false) continue;
        (resMap[mIt.resourceId] = resMap[mIt.resourceId] || []).push(mIt.id);
      }
      for (mri = 0; mri < fds.length && !needCarry; mri++) { var mNr = fds[mri].neededResources || []; for (mrj = 0; mrj < mNr.length; mrj++) if (resMap[mNr[mrj]]) { needCarry = true; break; } }
      if (needCarry) { carryByRes = resMap; carrySt = carryState(plan); }   // carryState -> daySchedule(plan,'load') only; 'load' never consults carry, so recursion terminates
    }
    var owner = {}; for (i = 0; i < plan.infoCards.length; i++) owner[plan.infoCards[i].id] = plan.infoCards[i].ownerRoleId;
    var partRole = {}; for (i = 0; i < plan.participants.length; i++) partRole[plan.participants[i].id] = plan.participants[i].roleId;
    // seg-scoped arrow lookup + send/arrival (producer resolved within the seg, then plan.tasks)
    function arrowsToSeg(roleId, cardId) { var o = []; for (var x = 0; x < segHandoffs.length; x++) { var h = segHandoffs[x]; if (h.cardId === cardId && h.toRoleId === roleId) o.push(h); } return o; }
    function sendMinSeg(h) {
      var t;
      if (h.trigger.type === 'atMinute') return (typeof h.trigger.value === 'number' && isFinite(h.trigger.value)) ? h.trigger.value : null;
      if (h.trigger.type === 'onTaskDone') { t = fdById[h.trigger.taskId] || byId(plan.tasks, h.trigger.taskId); return (t && typeof t.startMin === 'number') ? (t.startMin + t.durMin) : null; }
      if (h.trigger.type === 'beforeTaskStart') { t = fdById[h.trigger.taskId || h.toTaskId] || byId(plan.tasks, h.trigger.taskId || h.toTaskId); return (t && typeof t.startMin === 'number') ? (t.startMin - (h.trigger.leadMin || 0)) : null; }
      return null;
    }
    function deliverySeg(h, eff, dynamic, seen) {
      if (!h) return { arrival: null, pending: false, reason: 'missing-handoff' };
      var trail = {}, sk; for (sk in (seen || {})) trail[sk] = seen[sk];
      var key = seg + '|' + h.id;
      if (trail[key]) return { arrival: null, pending: true, reason: 'relay-cycle' };
      trail[key] = 1;
      var feasible = channelFeasibility(plan, h, seg);
      if (!feasible.ok) return { arrival: null, pending: false, reason: feasible.reason };
      var provenance = handoffProvenance(plan, h, seg);
      if (!provenance.ok) return { arrival: null, pending: false, reason: provenance.reason };
      var tr = h.trigger || {}, source = null, send = null;
      if (tr.type === 'onTaskDone') {
        source = fdById[tr.taskId] || byId(plan.tasks, tr.taskId);
        if (dynamic && fdById[tr.taskId]) {
          if (!eff || !eff[tr.taskId]) return { arrival: null, pending: true, reason: 'producer-pending' };
          send = eff[tr.taskId].end;
        } else if (source && typeof source.startMin === 'number') send = source.startMin + source.durMin;
      } else if (tr.type === 'atMinute') {
        if (typeof tr.value === 'number' && isFinite(tr.value)) send = tr.value;
      } else if (tr.type === 'beforeTaskStart') {
        source = fdById[tr.taskId || h.toTaskId] || byId(plan.tasks, tr.taskId || h.toTaskId);
        if (source && typeof source.startMin === 'number') send = source.startMin - (tr.leadMin || 0);
      }
      if (send == null || !isFinite(send)) return { arrival: null, pending: false, reason: 'unresolved-trigger' };
      if (!provenance.relay) {
        var producerFinish = provenance.producerFinish;
        // Same-day production follows the effective cascade, not merely the
        // block painted on the board. An atMinute/beforeTaskStart arrow cannot
        // smuggle a card out while its producer is still waiting or working.
        if (dynamic && !provenance.external) {
          if (!eff || !eff[provenance.task.id]) {
            return { arrival: null, pending: true, reason: 'producer-pending' };
          }
          producerFinish = eff[provenance.task.id].end;
        }
        if (send < producerFinish) return { arrival: null, pending: false, reason: 'premature-handoff' };
      }
      if (h.requiresHandoffId) {
        var dep = byId(segHandoffs, h.requiresHandoffId);
        if (!dep) return { arrival: null, pending: false, reason: 'missing-prerequisite' };
        if (dep.cardId !== h.cardId || dep.toRoleId !== h.fromRoleId) {
          return { arrival: null, pending: false, reason: 'relay-mismatch' };
        }
        var prior = deliverySeg(dep, eff, dynamic, trail);
        if (prior.pending) return prior;
        if (prior.arrival == null) return prior;
        if (prior.arrival > send) return { arrival: null, pending: false, reason: 'relay-not-ready' };
      }
      return { arrival: send + CHANNELS[h.channel], pending: false, reason: 'ok' };
    }
    function arrivalSeg(h) {
      var delivery = deliverySeg(h, null, false);
      return delivery.arrival;
    }
    // static design lens (billed to info, §9), per (consuming task, card) pair — the §6.2
    // checker's unit. Delivery = the EARLIEST drawn arrow, so a redundant slow arrow never
    // bills a pair another (faster) arrow already feeds, and drawing a faster duplicate is
    // a legitimate alternate fix for a late handoff.
    var missing = [], late = [];
    for (i = 0; i < fds.length; i++) {
      var t0 = fds[i];
      for (j = 0; j < t0.neededInfo.length; j++) {
        var cid0 = t0.neededInfo[j];
        if (owner[cid0] === t0.ownerRoleId) continue;                 // owner holds own cards from DAY_START
        var hs0 = arrowsToSeg(t0.ownerRoleId, cid0), best0 = null, bestH0 = null;
        for (k = 0; k < hs0.length; k++) { var a0 = arrivalSeg(hs0[k]); if (a0 != null && (best0 == null || a0 < best0)) { best0 = a0; bestH0 = hs0[k]; } }
        if (best0 == null) missing.push({ taskId: t0.id, cardId: cid0 });                 // no arrow (or none resolvable)
        else if (best0 > t0.startMin) late.push({ id: bestH0.id, cardId: cid0, taskId: t0.id, lateMin: best0 - t0.startMin });
      }
    }
    function runCascade(extendWF) {
      var eff = {}, wrongFish = [], arrivals = {}, guard = 0, changed = true;
      while (changed && guard++ < 80) {
        changed = false;
        for (i = 0; i < fds.length; i++) {
          var t = fds[i]; if (eff[t.id]) continue;
          var start = t.startMin, waits = [], ready = true, wf = false;
          for (j = 0; j < t.deps.length; j++) {
            var did = t.deps[j]; if (!fdById[did]) continue;          // deps outside the fishday: assumed done
            if (!eff[did]) { ready = false; break; }
            if (eff[did].end > start) { start = eff[did].end; waits.push({ depId: did, until: eff[did].end }); }
          }
          if (!ready) continue;
          for (j = 0; j < t.neededInfo.length; j++) {
            var cid = t.neededInfo[j];
            if (owner[cid] === t.ownerRoleId) continue;
            var hs = arrowsToSeg(t.ownerRoleId, cid), best = null, bestH = null, pend = false;
            for (k = 0; k < hs.length; k++) {
              var hh = hs[k], delivery = deliverySeg(hh, eff, true), a = delivery.arrival;
              if (delivery.pending) { pend = true; continue; }
              if (a != null && isFinite(a) && (best == null || a < best)) { best = a; bestH = hh; }
            }
            if (injections) for (k = 0; k < injections.length; k++) { var inj = injections[k]; if (inj.cardId === cid && inj.toRoleId === t.ownerRoleId && (best == null || inj.min < best)) { best = inj.min; bestH = null; } }
            // defer only if an unresolved arrow could still change the outcome — an arrow that
            // already feeds the pair on time makes any pending sibling irrelevant (min-over-arrows)
            if (pend && !(best != null && best <= start)) { ready = false; break; }
            if (best == null) {                                       // arrow never drawn (迷い-side gap)
              if (t.assumeOn.indexOf(cid) >= 0) wf = true;            // guesses the habitual wrong default
              else { var capTo = t.startMin + IDLE_CAP; waits.push({ cardId: cid, missing: true, until: capTo }); if (capTo > start) start = capTo; }
            } else if (best > start) {                                // arrives after the task could begin
              if ((bestH && bestH.ifLate === 'assume') || t.assumeOn.indexOf(cid) >= 0) wf = true;
              else { waits.push({ cardId: cid, until: best }); start = best; }
            }
            if (best != null) { if (!arrivals[t.ownerRoleId]) arrivals[t.ownerRoleId] = {}; var cur = arrivals[t.ownerRoleId][cid]; if (cur == null || best < cur) arrivals[t.ownerRoleId][cid] = best; }
          }
          if (!ready) continue;
          // Voyage §2: physical availability — a needed resource whose backing manifest item is
          // 'missing' for this segment stalls the task like an undrawn arrow (手待ち, capped).
          // Billed to Efficiency and the visible run only; scoreTrip never reads these waits.
          if (carrySt) for (j = 0; j < (t.neededResources || []).length; j++) {
            var crIds = carryByRes[t.neededResources[j]];
            if (!crIds) continue;
            for (k = 0; k < crIds.length; k++) {
              var carrySeg = t.carrySegment || seg;
              if ((carrySt[crIds[k]] || {})[carrySeg] === 'missing') {
                var capR = t.startMin + IDLE_CAP;
                waits.push({ resourceId: t.neededResources[j], itemId: crIds[k], missing: true, until: capR });
                if (capR > start) start = capR;
              }
            }
          }
          var ext = (extendWF && t.wrongFishPenaltyMin) ? t.wrongFishPenaltyMin : 0;
          if (wf) wrongFish.push(t.id);
          eff[t.id] = { start: start, end: start + t.durMin + ext, idleMin: start - t.startMin, waits: waits, extension: ext, wrongFish: wf };
          changed = true;
        }
      }
      for (i = 0; i < fds.length; i++) if (!eff[fds[i].id]) { var tu = fds[i]; eff[tu.id] = { start: tu.startMin, end: tu.startMin + tu.durMin, idleMin: 0, waits: [], extension: 0, unresolved: true }; }
      return { eff: eff, wrongFish: wrongFish, arrivals: arrivals };
    }
    var r = runCascade(false);
    if (r.wrongFish.length) r = runCascade(true);                     // wrong catch -> the galley switches dishes (+cook time)
    var idleTotal = 0, reworkTotal = 0, availMin = 0, guestWaitMin = 0, unresolved = 0, byTask = {};
    for (i = 0; i < fds.length; i++) {
      var td = fds[i], e = r.eff[td.id], n = Math.max(1, td.assignedIds.length);
      availMin += td.durMin * n; idleTotal += e.idleMin * n; reworkTotal += e.extension * n;
      if (e.unresolved) unresolved++;
      // guests judge lateness against the PROMISED time — re-dragging the block later doesn't hide it
      if (td.guestFacing) guestWaitMin += Math.max(0, e.start - (td.baseStartMin != null ? td.baseStartMin : td.startMin));
      byTask[td.id] = e;
    }
    // authoring read-offs (empty/0 on the fully-placed, correctly-staffed fishday plan)
    var unplacedRequired = [], decoysPlaced = [], misassigned = [];
    for (i = 0; i < allSeg.length; i++) {
      var at = allSeg[i], placed = isPlaced(at);
      if (at.required !== false && !placed) unplacedRequired.push(at.id);
      if (at.required === false && placed) decoysPlaced.push(at.id);
      // careGuestId tasks are exempt from misassignment — ANY organizer may buddy a care guest (Voyage §3;
      // the buddies merge re-homes ownerRoleId anyway, this guards direct deck placements too)
      if (placed && !at.careGuestId) for (j = 0; j < at.assignedIds.length; j++) { var prid = partRole[at.assignedIds[j]]; if (prid && prid !== at.ownerRoleId) { misassigned.push(at.id); break; } }
    }
    var perP = {}, overbookMin = 0;
    for (i = 0; i < fds.length; i++) { var pt = fds[i]; for (j = 0; j < pt.assignedIds.length; j++) { var pk = pt.assignedIds[j]; (perP[pk] = perP[pk] || []).push({ s: pt.startMin, e: pt.startMin + pt.durMin }); } }
    // Exact wall-clock time during which a person has two or more live tasks.
    // Pairwise-neighbour subtraction overcounts nested intervals (a 04:00–14:00
    // task containing a 05:00–09:00 task used to report 9 hours, not 4) and can
    // double-count triple overlaps. A grouped sweep counts each overloaded
    // minute exactly once per person, including nesting and chained intervals.
    for (var pid in perP) {
      var events = [], seq = perP[pid];
      for (i = 0; i < seq.length; i++) {
        if (!isFinite(seq[i].s) || !isFinite(seq[i].e) || seq[i].e <= seq[i].s) continue;
        events.push({ at: seq[i].s, delta: 1 }); events.push({ at: seq[i].e, delta: -1 });
      }
      events.sort(function (a, b) { return a.at - b.at; });
      var active = 0, prev = null, ei = 0;
      while (ei < events.length) {
        var at = events[ei].at;
        if (prev != null && active > 1) overbookMin += at - prev;
        var delta = 0;
        while (ei < events.length && events[ei].at === at) { delta += events[ei].delta; ei++; }
        active += delta; prev = at;
      }
    }
    var serve = r.eff['t_f_serve'];
    return { byTask: byTask, idleTotal: idleTotal, reworkTotal: reworkTotal, availMin: availMin,
      missing: missing, late: late, wrongFish: r.wrongFish, arrivals: r.arrivals, unresolved: unresolved,
      efficiency: availMin > 0 ? Math.round(100 * availMin / (availMin + idleTotal + reworkTotal)) : 100,
      guestWaitMin: guestWaitMin, dinnerMin: serve ? serve.start : null,
      unplacedRequired: unplacedRequired, decoysPlaced: decoysPlaced, misassigned: misassigned, overbookMin: overbookMin };
  }
  // ===========================================================================
  // PHYSICAL MANIFEST CARRYOVER (pure, RNG-free, exported).
  //
  // There are three independent custody chains instead of one magic "aboard forever"
  // flag: Tokyo hotel→Takeshiba→Ogasawara-maru, the Chichijima ship change, and the
  // inferred return chain through BOTH vessels. A missing/unplaced carry leg can now
  // strand an item specifically at the transfer. `late` means the physical item remains
  // available but the rehearsal sequence slipped; only `missing` blocks a consumer.
  // Consumables (food/ice) report `not-required` on return rather than pretending they
  // must be shipped back.
  // ===========================================================================
  function custodyTasksFor(plan, seg, flag) {
    return tasksForSeg(plan, seg).filter(function (t) { return !!t[flag]; });
  }
  function custodyGaps(plan, seg, flag, items) {
    var gaps = [], custody = custodyTasksFor(plan, seg, flag), i, j;
    items = items || plan.manifest || [];
    for (i = 0; i < items.length; i++) {
      var itemId = typeof items[i] === 'string' ? items[i] : items[i].id;
      var bad = custody.length === 0;
      for (j = 0; j < custody.length && !bad; j++) {
        if (!isPlaced(custody[j]) || (custody[j].carries || []).indexOf(itemId) < 0) bad = true;
      }
      if (bad) gaps.push(itemId);
    }
    return gaps;
  }
  function manifestChainGaps(plan) {
    return custodyGaps(plan, 'load', 'custody', (plan.manifest || []).filter(function (m) { return m.outboundRequired !== false; }));
  }
  function manifestTransferGaps(plan) {
    return custodyGaps(plan, 'arrival', 'transferCustody', (plan.manifest || []).filter(function (m) { return m.outboundRequired !== false; }));
  }
  function manifestReturnGaps(plan) {
    var returnItems = (plan.manifest || []).filter(function (m) { return m.returnRequired !== false; });
    return custodyGaps(plan, 'return', 'returnCustody', returnItems);
  }
  function custodyStageState(plan, seg, flag, items, deadlineMin) {
    var out = {}, gaps = {}, i, j;
    custodyGaps(plan, seg, flag, items).forEach(function (id) { gaps[id] = 1; });
    // skipCarry prevents arrival/return schedule inspection from recursing back here.
    var ds = daySchedule(plan, seg, null, { skipCarry: true });
    var custody = custodyTasksFor(plan, seg, flag).filter(isPlaced);
    for (i = 0; i < items.length; i++) {
      var itemId = typeof items[i] === 'string' ? items[i] : items[i].id;
      var st = gaps[itemId] ? 'missing' : null, delayed = false, end = -Infinity;
      for (j = 0; j < custody.length && !st; j++) {
        if ((custody[j].carries || []).indexOf(itemId) < 0) continue;
        var e = ds.byTask[custody[j].id];
        if (!e || e.unresolved) { st = 'missing'; break; }
        end = Math.max(end, e.end);
        if (e.idleMin > 0) delayed = true;
      }
      if (!st && typeof deadlineMin === 'number' && end > deadlineMin) st = 'missing';
      out[itemId] = st || (delayed ? 'late' : 'aboard');
    }
    return out;
  }
  function carryState(plan) {
    var out = {}, items = plan.manifest || [], i;
    if (!items.length) return out;
    var outboundItems = items.filter(function (m) { return m.outboundRequired !== false; });
    var returnItems = items.filter(function (m) { return m.returnRequired !== false; });
    var loadSt = custodyStageState(plan, 'load', 'custody', outboundItems, SAIL_MIN);
    var transferSt = custodyStageState(plan, 'arrival', 'transferCustody', outboundItems, null);
    var returnSt = custodyStageState(plan, 'return', 'returnCustody', returnItems, null);
    function combine(a, b) { return a === 'missing' || b === 'missing' ? 'missing' : (a === 'late' || b === 'late' ? 'late' : 'aboard'); }
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.outboundRequired === false) {
        out[it.id] = { load: 'not-applicable', voyage: 'not-applicable', arrival: 'not-applicable',
          ops: 'joins-day-6', fishday: 'not-applicable', 'return': returnSt[it.id] || 'missing' };
        continue;
      }
      var longHaul = loadSt[it.id] || 'missing', hahajima = combine(longHaul, transferSt[it.id] || 'missing');
      var ret = it.returnRequired === false ? 'not-required' : combine(hahajima, returnSt[it.id] || 'missing');
      out[it.id] = { load: longHaul, voyage: longHaul, arrival: hahajima, ops: hahajima, fishday: hahajima, 'return': ret };
    }
    return out;
  }

  // Route-scene resolver shared by Canvas, DOM fallback, reports, and audio. Boundaries
  // come from the SOLVED task schedule: moving a crossing moves the scenery; unplacing it
  // leaves the group at the last physical stop instead of teleporting on a decorative clock.
  function routeSceneId(plan, seg, minute) {
    if (seg === 'all') return 'route-overview';
    if (seg === 'ops' || seg === 'fishday') return 'hahajima-hinata';
    if (seg === 'voyage') return 'ogasawara-maru';
    var ds = daySchedule(plan, seg, null, { skipCarry: true });
    function edge(id) { return ds.byTask[id] || null; }
    if (seg === 'load') {
      var move = edge('hd_l_truck');
      return move && minute >= move.start ? 'takeshiba-terminal' : 'tokyo-hotel';
    }
    if (seg === 'arrival') {
      var disembark = edge('hd_a_disembark'), cross = edge('hd_a_cross');
      if (!disembark || minute < disembark.start) return 'ogasawara-maru';
      if (!cross || minute < cross.start) return 'chichijima-transfer';
      return minute < cross.end ? 'interisland-ferry' : 'hahajima-hinata';
    }
    if (seg === 'return') {
      var inter = edge('hd_r_interisland'), sail = edge('hd_r_sail');
      if (!inter || minute < inter.start) return 'hahajima-hinata';
      if (minute < inter.end) return 'interisland-ferry';
      if (!sail || minute < sail.start) return 'chichijima-transfer';
      return minute < sail.end ? 'ogasawara-maru' : 'takeshiba-terminal';
    }
    return 'hahajima-hinata';
  }
  function routeState(plan, seg, minute) {
    var sceneId = routeSceneId(plan, seg, minute), stop = physicalStop(sceneId);
    return { sceneId: sceneId, stop: stop, vessel: stop && stop.vesselId ? vessel(stop.vesselId) : null,
      segment: seg, minute: minute, inferred: seg === 'return' };
  }

  function idleMinutes(plan) { var fd = fishdaySchedule(plan); return { total: fd.idleTotal, byTask: fd.byTask }; }
  function wrongFishTasks(plan) { return fishdaySchedule(plan).wrongFish; }
  function reworkMinutes(plan) { return fishdaySchedule(plan).reworkTotal; }
  function efficiency(plan) { return fishdaySchedule(plan).efficiency; }

  // ===========================================================================
  // Layer 0 — "Living Harbor" COSMETIC VIEW HELPERS (pure, read-only, DOM-free).
  // These feed the renderer only. They NEVER touch score()/fishdaySchedule and
  // never consume the score-path RNG, so the teaching gradient is untouched
  // (verify.js asserts they are additive). All outputs are deterministic given
  // their inputs (same seed+phase / same sim => same picture).
  // ===========================================================================

  // 13 hosted guests as seeded ambient wanderers. They own no duties and are
  // outside the efficiency denominator (unchanged), so animating them cannot move
  // any score — pure life on the map. `phase` advances with wall-clock in the
  // renderer; the function itself is pure. Returns normalized map coords [0..1].
  function ambientActors(seed, phase) {
    var out = [], base = (seed >>> 0) || 1, ph = phase || 0;
    for (var i = 0; i < GUESTS; i++) {
      var r = mulberry32((base ^ ((0x9E3779B9 * (i + 1)) >>> 0)) >>> 0);
      var hx = 0.28 + r() * 0.46;                 // home x in the central "promenade/beach" band
      var hy = 0.50 + r() * 0.22;                 // home y (below the edge stations)
      var rad = 0.02 + r() * 0.05;               // wander radius
      var f1 = 0.35 + r() * 0.8, f2 = 0.4 + r() * 0.8, p1 = r() * 6.2832, p2 = r() * 6.2832;
      var actR = r();
      var x = hx + rad * Math.cos(ph * f1 + p1);
      var y = hy + rad * 0.6 * Math.sin(ph * f2 + p2);
      out.push({ id: 'g' + i, x: x, y: y, home: { x: hx, y: hy },
        act: actR < 0.16 ? 'cast' : (actR < 0.4 ? 'chat' : 'stroll') });
    }
    return out;
  }

  // Where the fishing boat is, DERIVED from the depart/return task states already
  // solved in sim.sched — a cosmetic read of engine truth, no new state. param:
  // 0 = docked at the port, 1 = out at the ground. Only meaningful on the minute
  // clock; other segments keep the boat docked.
  function boatState(sim) {
    if (!sim || sim.mode !== 'minute' || !sim.sched) return { phase: 'dock', param: 0, atSea: false };
    var now = sim.clockMin || 0, bt = sim.sched.byTask;
    var dep = bt['t_f_depart'], ret = bt['t_f_return'], param = 0, ph = 'dock';
    if (dep && now >= dep.start) {
      if (ret && now >= ret.start) {
        var dr = ret.end - ret.start; param = dr > 0 ? 1 - Math.max(0, Math.min(1, (now - ret.start) / dr)) : 0;
        ph = param > 0.02 ? 'inbound' : 'dock';
      } else if (now < dep.end) {
        var dd = dep.end - dep.start; param = dd > 0 ? Math.max(0, Math.min(1, (now - dep.start) / dd)) : 1; ph = 'outbound';
      } else { param = 1; ph = 'ground'; }
    }
    return { phase: ph, param: param, atSea: param > 0.02 };
  }

  // Per-station "territory" status from the CURRENT live task states (changes tick
  // to tick, so the map colours in as the day runs, then greens as waits resolve).
  // red = a task here is stalled / redoing (手戻り); amber = someone is waiting on
  // info (手待ち); green = working or done; none = nothing in scope yet.
  function stationReadiness(sim) {
    var out = {}, rank = { none: 0, green: 1, amber: 2, red: 3 }, i;
    // read the sim's OWN station set (the voyage sim plays on the ship map); a land sim's set
    // mirrors STATIONS, so existing output is byte-identical
    var base = (sim && sim.stations && sim.stations.length) ? sim.stations : STATIONS;
    for (i = 0; i < base.length; i++) out[base[i].id] = 'none';
    if (!sim || !sim.tasks) return out;
    for (i = 0; i < sim.tasks.length; i++) {
      var t = sim.tasks[i]; if (t.scope !== 'in') continue;
      var v = null;
      if (t.state === 'stalled' || t.state === 'rework') v = 'red';
      else if (t.state === 'waitinfo') v = 'amber';
      else if (t.state === 'working' || t.state === 'done') v = 'green';
      if (v && rank[v] > rank[out[t.station]]) out[t.station] = v;
    }
    return out;
  }

  // The signature cascade (見せ場): the ordered station hops a seeded fault ripples
  // through (港→船→食堂), derived from the solved schedule — every idle/late/missing/
  // wrong-fish task in start-time order, de-duplicated by station. hasFault=false on
  // a clean plan (the ripple simply doesn't play, and the map greens instead).
  function cascadeTrace(plan) {
    var fd = fishdaySchedule(plan), fds = fishdayTasks(plan), byId = {}, i;
    for (i = 0; i < fds.length; i++) byId[fds[i].id] = fds[i];
    var aff = {};
    fd.wrongFish.forEach(function (id) { aff[id] = 1; });
    fd.missing.forEach(function (m) { aff[m.taskId] = 1; });
    fd.late.forEach(function (l) { aff[l.taskId] = 1; });
    for (i = 0; i < fds.length; i++) { var e = fd.byTask[fds[i].id]; if (e && e.idleMin > 0) aff[fds[i].id] = 1; }
    var hops = Object.keys(aff).filter(function (id) { return byId[id]; }).map(function (id) {
      var e = fd.byTask[id];
      return { taskId: id, station: byId[id].station, atMin: (e && e.start != null) ? e.start : byId[id].startMin };
    }).sort(function (a, b) { return a.atMin - b.atMin; });
    var out = [];
    hops.forEach(function (h) { if (!out.length || out[out.length - 1].station !== h.station) out.push(h); });
    return { hops: out, hasFault: fd.wrongFish.length > 0 || fd.missing.length > 0 || fd.late.length > 0 };
  }

  // Mission Control budget lens: what the setup board teaches. This is a pure
  // pre-run view over envelopes, usable payment paths, reserves, and spend events.
  function budgetReadiness(plan) {
    var budget = plan && plan.budget && typeof plan.budget === 'object' ? plan.budget : {};
    var planRoles = plan && plan.roles && typeof plan.roles === 'object' ? plan.roles : {};
    var methods = Object.create(null), canonicalRoles = Object.create(null), taskIds = Object.create(null);
    var requiredLineIds = Object.create(null), requiredResourceIds = Object.create(null), requiredEventIds = Object.create(null);
    var requiredLineList = ['bl_transport', 'bl_lodging', 'bl_meals', 'bl_boat', 'bl_tackle', 'bl_onsite', 'bl_card'];
    var requiredResourceList = ['res_cash', 'res_ice', 'res_fuel', 'res_food'];
    var requiredEventList = ['sp_meals', 'sp_ice', 'sp_fallback', 'sp_fuel'];
    var gaps = [], envelopeOut = [], eventOut = [], resourceOut = [], i, k;
    methods.cash = methods.card = methods.invoice = 1;
    for (i = 0; i < ROLES.length; i++) canonicalRoles[ROLES[i].id] = 1;
    for (i = 0; i < requiredLineList.length; i++) requiredLineIds[requiredLineList[i]] = 1;
    for (i = 0; i < requiredResourceList.length; i++) requiredResourceIds[requiredResourceList[i]] = 1;
    for (i = 0; i < requiredEventList.length; i++) requiredEventIds[requiredEventList[i]] = 1;
    function own(o, id) { return !!o && Object.prototype.hasOwnProperty.call(o, id); }
    function finiteNonnegative(v) { return typeof v === 'number' && isFinite(v) && v >= 0; }
    function nonemptyId(v) { return typeof v === 'string' && v.length > 0; }
    function knownRole(id) {
      return nonemptyId(id) && own(canonicalRoles, id) && own(planRoles, id) &&
        !!planRoles[id] && typeof planRoles[id] === 'object';
    }
    function supportedMethod(method) { return typeof method === 'string' && own(methods, method); }
    function shallowRecord(value) {
      var out = {}, key;
      if (!value || typeof value !== 'object') return out;
      for (key in value) if (own(value, key)) out[key] = value[key];
      return out;
    }

    // Top-level amounts are part of the same trust boundary. Preserve the old
    // 300k default only when reserveTarget is genuinely absent; malformed
    // present values never coerce or fall back to a plausible number.
    var reserve = budget.reserve;
    var target = typeof budget.reserveTarget === 'undefined' ? 300000 : budget.reserveTarget;
    var reserveOk = finiteNonnegative(reserve), targetOk = finiteNonnegative(target);
    var totalOk = finiteNonnegative(budget.total);
    var budgetRelationshipOk = reserveOk && targetOk && totalOk && reserve <= budget.total && target <= budget.total;

    var linesArrayOk = Array.isArray(budget.lines), lines = linesArrayOk ? budget.lines : [];
    var lineCounts = Object.create(null), capSum = 0, capSumFinite = true;
    for (i = 0; i < lines.length; i++) {
      var countLine = lines[i] && typeof lines[i] === 'object' ? lines[i] : {};
      if (nonemptyId(countLine.id)) lineCounts[countLine.id] = (lineCounts[countLine.id] || 0) + 1;
      if (finiteNonnegative(countLine.cap)) capSum += countLine.cap; else capSumFinite = false;
    }
    var lineSchemaComplete = lines.length === requiredLineList.length;
    for (i = 0; i < requiredLineList.length; i++) if (lineCounts[requiredLineList[i]] !== 1) lineSchemaComplete = false;
    var capsWithinTotal = totalOk && capSumFinite && capSum <= budget.total;
    var validLineById = Object.create(null);
    for (i = 0; i < lines.length; i++) {
      var line = lines[i] && typeof lines[i] === 'object' ? lines[i] : {};
      var lineIdOk = nonemptyId(line.id) && own(requiredLineIds, line.id) && lineCounts[line.id] === 1;
      var capOk = finiteNonnegative(line.cap), spentOk = finiteNonnegative(line.spent);
      var lineRelationshipOk = capOk && spentOk && line.spent <= line.cap && totalOk && line.cap <= budget.total && capsWithinTotal;
      var lineApproverOk = knownRole(line.approverRoleId), lineMethodOk = supportedMethod(line.payMethod);
      var lineOk = lineIdOk && lineRelationshipOk && lineApproverOk && lineMethodOk;
      var lineOut = { id: line.id, name: line.name, cap: line.cap,
        approverRoleId: line.approverRoleId == null ? null : line.approverRoleId,
        payMethod: line.payMethod == null ? null : line.payMethod,
        receiptRule: line.receiptRule || 'required', ok: lineOk };
      envelopeOut.push(lineOut);
      if (lineOk) validLineById[line.id] = line;
      // Preserve the original teaching gaps. Other malformed envelopes fail
      // through their own ok flag without changing the established gap count.
      if (line.id === 'bl_meals' && (!lineApproverOk || !lineMethodOk)) {
        gaps.push({ type: 'BUDGET_AUTH', lineId: line.id });
      }
    }
    if (reserveOk && targetOk && reserve < target) gaps.push({ type: 'RESERVE_SHORT', current: reserve, target: target });

    var resourcesArrayOk = Array.isArray(budget.resources), resources = resourcesArrayOk ? budget.resources : [];
    var resourceCounts = Object.create(null);
    for (i = 0; i < resources.length; i++) {
      var countResource = resources[i] && typeof resources[i] === 'object' ? resources[i] : {};
      if (nonemptyId(countResource.id)) resourceCounts[countResource.id] = (resourceCounts[countResource.id] || 0) + 1;
    }
    var resourceSchemaComplete = resources.length === requiredResourceList.length;
    for (i = 0; i < requiredResourceList.length; i++) if (resourceCounts[requiredResourceList[i]] !== 1) resourceSchemaComplete = false;
    for (i = 0; i < resources.length; i++) {
      var sourceResource = resources[i] && typeof resources[i] === 'object' ? resources[i] : {};
      var r = shallowRecord(sourceResource);
      var resourceIdOk = nonemptyId(sourceResource.id) && own(requiredResourceIds, sourceResource.id) && resourceCounts[sourceResource.id] === 1;
      var rawPlannedOk = finiteNonnegative(sourceResource.planned), resourceTargetOk = finiteNonnegative(sourceResource.target);
      var resourceOwnerOk = knownRole(sourceResource.ownerRoleId);
      // Cash readiness is intentionally driven by the single reserve control,
      // but a malformed stored planned value still invalidates the resource.
      if (sourceResource.id === 'res_cash' && reserveOk) r.planned = reserve;
      var effectivePlannedOk = finiteNonnegative(r.planned);
      var resourceStructuralOk = resourceIdOk && rawPlannedOk && effectivePlannedOk && resourceTargetOk && resourceOwnerOk;
      r.ok = resourceStructuralOk && r.planned >= r.target;
      resourceOut.push(r);
    }

    // Event ids and task references are also structural evidence. Tasks may
    // live in either the legacy plan.tasks collection or an authored day.
    var legacyTasks = plan && Array.isArray(plan.tasks) ? plan.tasks : [];
    for (i = 0; i < legacyTasks.length; i++) if (legacyTasks[i] && nonemptyId(legacyTasks[i].id)) taskIds[legacyTasks[i].id] = 1;
    var planDays = plan && plan.days && typeof plan.days === 'object' ? plan.days : {};
    for (k in planDays) if (own(planDays, k) && planDays[k] && Array.isArray(planDays[k].tasks)) {
      for (i = 0; i < planDays[k].tasks.length; i++) {
        var dayTask = planDays[k].tasks[i]; if (dayTask && nonemptyId(dayTask.id)) taskIds[dayTask.id] = 1;
      }
    }
    var eventsArrayOk = Array.isArray(budget.spendEvents), events = eventsArrayOk ? budget.spendEvents : [];
    var eventCounts = Object.create(null), plannedByLine = Object.create(null);
    for (i = 0; i < events.length; i++) {
      var countEvent = events[i] && typeof events[i] === 'object' ? events[i] : {};
      if (nonemptyId(countEvent.id)) eventCounts[countEvent.id] = (eventCounts[countEvent.id] || 0) + 1;
      if (nonemptyId(countEvent.lineId) && finiteNonnegative(countEvent.amount)) {
        plannedByLine[countEvent.lineId] = (plannedByLine[countEvent.lineId] || 0) + countEvent.amount;
      }
    }
    var eventSchemaComplete = events.length === requiredEventList.length;
    for (i = 0; i < requiredEventList.length; i++) if (eventCounts[requiredEventList[i]] !== 1) eventSchemaComplete = false;
    for (i = 0; i < events.length; i++) {
      var ev = events[i] && typeof events[i] === 'object' ? events[i] : {};
      var eventIdOk = nonemptyId(ev.id) && own(requiredEventIds, ev.id) && eventCounts[ev.id] === 1;
      var amountOk = finiteNonnegative(ev.amount), eventLine = validLineById[ev.lineId] || null;
      var eventLineOk = !!eventLine, actorRoleOk = knownRole(ev.actorRoleId);
      var requiredMethodOk = supportedMethod(ev.requiredMethod);
      var flagsOk = typeof ev.requiresApproval === 'boolean' && typeof ev.receiptRequired === 'boolean';
      var taskOk = nonemptyId(ev.taskId) && !!taskIds[ev.taskId];
      var methodOk = eventLineOk && requiredMethodOk && eventLine.payMethod === ev.requiredMethod;
      var approverOk = eventLineOk && flagsOk && (!ev.requiresApproval || knownRole(eventLine.approverRoleId));
      var roleAuth = actorRoleOk && planRoles[ev.actorRoleId] && planRoles[ev.actorRoleId].authority;
      var payCapOk = !!roleAuth && (roleAuth.payCap === Infinity || finiteNonnegative(roleAuth.payCap));
      var actorOk = actorRoleOk && !!roleAuth && typeof roleAuth.canPay === 'boolean' && payCapOk;
      var actorCanPay = actorOk && roleAuth.canPay === true && amountOk && roleAuth.payCap >= ev.amount;
      var reserveBackstop = requiredMethodOk && ev.requiredMethod === 'cash' && reserveOk && targetOk && amountOk &&
        reserve >= Math.min(target, ev.amount);
      var lineCapacityOk = eventLineOk && amountOk && finiteNonnegative(eventLine.spent) &&
        eventLine.spent + (plannedByLine[ev.lineId] || 0) <= eventLine.cap;
      var eventStructuralOk = eventIdOk && amountOk && eventLineOk && actorOk && requiredMethodOk && flagsOk && taskOk;
      var eventOk = eventStructuralOk && methodOk && approverOk && lineCapacityOk &&
        (actorCanPay || reserveBackstop || knownRole(eventLine.approverRoleId));
      eventOut.push({ id: ev.id, name: ev.name, amount: ev.amount, lineId: ev.lineId, taskId: ev.taskId,
        actorRoleId: ev.actorRoleId, requiredMethod: ev.requiredMethod, methodOk: methodOk,
        approverOk: approverOk, actorCanPay: actorCanPay, reserveBackstop: reserveBackstop,
        receiptRequired: ev.receiptRequired === true, ok: eventOk });
    }

    var structuralOk = !!(plan && plan.budget && typeof plan.budget === 'object') &&
      linesArrayOk && lineSchemaComplete && resourcesArrayOk && resourceSchemaComplete &&
      eventsArrayOk && eventSchemaComplete && budgetRelationshipOk && capsWithinTotal;
    var ready = structuralOk && gaps.length === 0 && envelopeOut.every(function (item) { return item.ok; }) &&
      eventOut.every(function (item) { return item.ok; }) && resourceOut.every(function (item) { return item.ok; });
    return { reserve: reserve, reserveTarget: target, envelopes: envelopeOut,
      resources: resourceOut, events: eventOut, gaps: gaps, ok: ready, ready: ready };
  }

  // live readiness hints for the authoring screen (§7.2/§20) — pure, recomputed per edit.
  // fishday delegates so its hint set is byte-identical; coarse days add the deck-authoring hints.
  function readiness(plan) { return dayReadiness(plan, 'fishday'); }
  function dayReadiness(plan, seg) {
    seg = seg || 'fishday';
    var out = [], fd = daySchedule(plan, seg), all = tasksForSeg(plan, seg), i, j;
    var placedTasks = []; for (i = 0; i < all.length; i++) if (isPlaced(all[i])) placedTasks.push(all[i]);
    var segById = {}; for (i = 0; i < all.length; i++) segById[all[i].id] = all[i];
    var segHo = handoffsForSeg(plan, seg), hoById = {}; for (i = 0; i < segHo.length; i++) hoById[segHo[i].id] = segHo[i];
    if (seg === 'fishday') {
      for (var rk in plan.roles) if (!plan.roles[rk].holder) out.push({ type: 'DUTY_UNASSIGNED', roleId: rk });
      for (i = 0; i < all.length; i++) if (all[i].assignedIds.length === 0) out.push({ type: 'TASK_UNSTAFFED', taskId: all[i].id });
    } else {
      for (i = 0; i < fd.unplacedRequired.length; i++) out.push({ type: 'UNPLACED_REQUIRED', taskId: fd.unplacedRequired[i] });
      for (i = 0; i < fd.decoysPlaced.length; i++) out.push({ type: 'DECOY_PLACED', taskId: fd.decoysPlaced[i] });
      for (i = 0; i < fd.misassigned.length; i++) out.push({ type: 'MISASSIGNED', taskId: fd.misassigned[i] });
      // Physical custody gaps are attributed to the exact handover where they occur.
      var cgap = seg === 'load' ? manifestChainGaps(plan) : (seg === 'arrival' ? manifestTransferGaps(plan) : (seg === 'return' ? manifestReturnGaps(plan) : []));
      for (i = 0; i < cgap.length; i++) out.push({ type: 'CARRY_GAP', itemId: cgap[i], stage: seg });
    }
    for (i = 0; i < fd.missing.length; i++) {
      var m = fd.missing[i], mt = segById[m.taskId];
      out.push({ type: (mt && mt.assumeOn && mt.assumeOn.indexOf(m.cardId) >= 0) ? 'WRONG_FISH_RISK' : 'MISSING_ARROW', taskId: m.taskId, cardId: m.cardId });
    }
    for (i = 0; i < fd.late.length; i++) {
      var l = fd.late[i], lt = segById[l.taskId], lh = hoById[l.id];
      var wf = (lh && lh.ifLate === 'assume') || (lt && lt.assumeOn && lt.assumeOn.indexOf(l.cardId) >= 0);
      out.push({ type: wf ? 'WRONG_FISH_RISK' : 'ARROW_LATE', handoffId: l.id, taskId: l.taskId, cardId: l.cardId, lateMin: l.lateMin });
    }
    for (i = 0; i < placedTasks.length; i++) for (j = 0; j < placedTasks[i].deps.length; j++) {
      var dp = segById[placedTasks[i].deps[j]];
      if (dp && isPlaced(dp) && dp.startMin + dp.durMin > placedTasks[i].startMin) out.push({ type: 'DEP_BROKEN', taskId: placedTasks[i].id, depId: dp.id });
    }
    var per = {};
    for (i = 0; i < placedTasks.length; i++) for (j = 0; j < placedTasks[i].assignedIds.length; j++) { var pid = placedTasks[i].assignedIds[j]; (per[pid] = per[pid] || []).push(placedTasks[i]); }
    for (var pid2 in per) {
      var list = per[pid2].slice().sort(function (a, b) {
        return a.startMin - b.startMin || (b.startMin + b.durMin) - (a.startMin + a.durMin);
      });
      var covering = list[0], coveringEnd = covering ? covering.startMin + covering.durMin : null;
      for (i = 1; i < list.length; i++) {
        var listEnd = list[i].startMin + list[i].durMin;
        if (list[i].startMin < coveringEnd) {
          out.push({ type: 'OVERLOAD', personId: pid2, taskId: list[i].id, otherId: covering.id });
        }
        if (listEnd > coveringEnd) { covering = list[i]; coveringEnd = listEnd; }
      }
    }
    return out;
  }
  // canonDay(seg): the witness that 100 is reachable — force every arrow to face-to-face (0 latency),
  // so by Phase-1 consistency (producer end ≤ consumer start) nothing is late. Also restores any
  // required-task PLACEMENT the seed ships pre-cleared (§7/§13.4 P2 — currently just Arrival, via
  // its canonPlacement) so the day's required roster is back on the board. applyDayFix writes both.
  function canonDay(seg) {
    var tpl = makeTemplate(), dd = tpl.days && tpl.days[seg]; if (!dd) return {};
    var hoff = {}, i;
    // Voyage days keep their full canonical arrow set on the day (canonHandoffs), so the fix can
    // DRAW arrows the seed withheld (h_l_cabins), not just re-time existing ones. Legacy days keep
    // the §20 channel-patch behavior (their seeds never withhold arrows).
    if (dd.canonHandoffs) for (i = 0; i < dd.canonHandoffs.length; i++) hoff[dd.canonHandoffs[i].id] = clone(dd.canonHandoffs[i]);
    else for (i = 0; i < dd.handoffs.length; i++) hoff[dd.handoffs[i].id] = { channel: 'faceToFace' };
    var o = { days: {} }; o.days[seg] = { handoffs: hoff };
    if (dd.canonPlacement) o.days[seg].placement = clone(dd.canonPlacement);
    // Voyage §3: authoring the ship day canonically = the 4 outbound-care buddies (one distinct organizer
    // each, staggered purser windows already in the template) + the company-card authority.
    if (seg === 'voyage') {
      o.buddies = { gd_watanabe: 'p01', gd_nagatani: 'p02', gd_kadou: 'p07', gd_maeda: 'p04' };
      o.budget = { lines: { bl_card: { approverRoleId: 'budgetLead', payMethod: 'card' } } };
    }
    return o;
  }
  function applyDayFix(cfg, seg) {
    cfg = clone(cfg || { seed: 1, overrides: {} }); cfg.overrides = cfg.overrides || {};
    var fix = canonDay(seg); if (!fix.days) return cfg;
    cfg.overrides.days = cfg.overrides.days || {};
    var cur = cfg.overrides.days[seg] || {}; cur.handoffs = cur.handoffs || {}; cur.placement = cur.placement || {};
    for (var id in fix.days[seg].handoffs) cur.handoffs[id] = fix.days[seg].handoffs[id];
    if (fix.days[seg].placement) for (var pid in fix.days[seg].placement) cur.placement[pid] = fix.days[seg].placement[pid];
    cfg.overrides.days[seg] = cur;
    if (fix.buddies) { cfg.overrides.buddies = cfg.overrides.buddies || {}; for (var bgid in fix.buddies) cfg.overrides.buddies[bgid] = fix.buddies[bgid]; }
    if (fix.budget && fix.budget.lines) {
      cfg.overrides.budget = cfg.overrides.budget || {}; cfg.overrides.budget.lines = cfg.overrides.budget.lines || {};
      for (var blid in fix.budget.lines) cfg.overrides.budget.lines[blid] = fix.budget.lines[blid];
    }
    return cfg;
  }
  // scoreDay(plan, seg) — rule-based day score (§20.4). Perfect = every required task placed on the
  // right role, deps ordered, cards delivered on time, nobody double-booked, no decoys; folds the
  // seg-relevant classic detectors so a day only tops out when the plan is also sound.
  function scoreDay(plan, seg) {
    var ds = daySchedule(plan, seg), deck = deckFor(plan, seg), rd = dayReadiness(plan, seg);
    var R = deck.required.length || 1, act = {}, probs = detect(plan);
    for (var i = 0; i < probs.length; i++) act[probs[i].id] = true;
    var safDecoys = 0, dp2 = tasksForSeg(plan, seg);
    for (i = 0; i < ds.decoysPlaced.length; i++) { var dt = byId(dp2, ds.decoysPlaced[i]); if (dt && dt.safetyFlag) safDecoys++; }
    function cl(v, mx) { return Math.max(0, Math.min(mx, v)); }
    // completion fraction — the authoring categories scale with how much of the required work is
    // actually placed, so a cleared/half-built day can't coast on unviolated (because empty) categories.
    var cf = (deck.required.length - ds.unplacedRequired.length) / R;
    var cats = {};
    cats.objective = cl(20 * cf, 20);
    cats.schedule = cl(15 * cf * (1 - Math.min(1, (ds.idleTotal + ds.overbookMin) / Math.max(1, ds.availMin))) - 2 * ds.decoysPlaced.length - (act.fatigue ? 2 : 0) - (seg === 'return' && act.returnLogi ? 2 : 0), 15);
    cats.roles = cl(15 * cf - 3 * ds.misassigned.length, 15);
    cats.info = cl(15 * cf - 5 * ds.missing.length - 3 * ds.late.length, 15);
    cats.budget = cl(10 - (act.budgetAuth ? 6 : 0) - (act.reserve ? 4 : 0), 10);
    cats.safety = cl(10 - (act.safety ? 10 : 0) - 3 * safDecoys, 10);
    cats.quality = cl(10 * cf - 4 * ds.wrongFish.length - Math.min(4, Math.floor(ds.guestWaitMin / 15)), 10);
    cats.health = cl(5 - (act.fatigue ? 5 : 0), 5);
    var total = cats.objective + cats.schedule + cats.roles + cats.info + cats.budget + cats.safety + cats.quality + cats.health;
    var clean = rd.length === 0 && ds.unresolved === 0;
    if (!clean) total = Math.min(total, 89);
    total = Math.round(total);
    var grade = total >= GRADE_BANDS.A ? 'A' : total >= GRADE_BANDS.B ? 'B' : total >= GRADE_BANDS.C ? 'C' : 'D';
    return { seg: seg, score: total, grade: grade, clean: clean, categories: cats,
      efficiency: ds.availMin > 0 ? Math.round(100 * ds.availMin / (ds.availMin + ds.idleTotal + ds.reworkTotal + ds.overbookMin)) : 100,
      idleMin: ds.idleTotal, reworkMin: ds.reworkTotal, overbookMin: ds.overbookMin, dinnerMin: ds.dinnerMin,
      unplacedRequired: ds.unplacedRequired.length, decoysPlaced: ds.decoysPlaced.length, misassigned: ds.misassigned.length };
  }
  function projectedDay(cfg, seg) { return scoreDay(mergePlan(cfg), seg); }

  // ===========================================================================
  // createSim / tick — the animated rehearsal over the 10-day clock.
  // ===========================================================================
  function createSim(cfg, segment, opts) {
    cfg = cfg || { seed: 1, overrides: {} };
    var plan = mergePlan(cfg);
    var sIdx = segIndex(segment);  // -1 = whole trip; otherwise rehearse just this day
    // §21.8b: fishday is always minute-clock; another authorable segment animates on the minute clock
    // ONLY when the caller opts in (opts.animate) — verify.js's 2-arg createSim never does, so the classic
    // day-clock / daySummary anchors + the fishdaySchedule façade stay untouched.
    var coarseMin = AUTHORABLE.indexOf(segment) >= 0 && segment !== 'fishday' && !!(opts && opts.animate);
    var minute = segment === 'fishday' || coarseMin;                           // fine clock (§8)
    var problems = (sIdx < 0) ? detect(plan) : gapsForSegment(plan, segment);  // only the chosen day's gaps animate
    // on the minute clock, handoffTiming animates through the cascade (late starts,
    // ⏳ pile-ups) rather than hard-stalling its tasks like a classic gap would
    var stallProbs = minute ? problems.filter(function (p) { return p.id !== 'handoffTiming'; }) : problems;
    var probByTask = {};
    stallProbs.forEach(function (p) { p.taskIds.forEach(function (tid) { if (!probByTask[tid]) probByTask[tid] = p; }); });
    var blocked = blockedTasks(plan, stallProbs);

    var tasks;
    if (coarseMin) {
      // animate the AUTHORED coarse day (plan.days[seg]) on the minute clock — HD tasks have no phase, so
      // build them directly with scope 'in'; states are driven each tick from sim.sched (daySchedule).
      // Only PLACED tasks (assigned to someone) schedule — mirror daySchedule's isPlaced filter so
      // sim.tasks and sim.sched.byTask stay in lock-step (an unscheduled task has no byTask entry).
      tasks = tasksForSeg(plan, segment).filter(function (t) { return t.assignedIds && t.assignedIds.length > 0; }).map(function (t) {
        return { id: t.id, name: t.name, station: t.station, phase: null, ownerRoleId: t.ownerRoleId,
          assignedIds: (t.assignedIds || []).slice(), startDay: null, dur: null, deps: (t.deps || []).slice(), scope: 'in',
          day: t.day || segment, startMin: t.startMin, durMin: t.durMin,
          routeLegId: t.routeLegId || null, sceneId: t.sceneId || null, fromSceneId: t.fromSceneId || null, toSceneId: t.toSceneId || null,
          locationId: t.locationId || null, vesselId: t.vesselId || null, timeStatus: t.timeStatus || 'planned', timeKnown: t.timeKnown !== false, inferred: !!t.inferred,
          confirmedStartMin: t.confirmedStartMin, confirmedEndMin: t.confirmedEndMin, durationStatus: t.durationStatus || 'planned',
          progress: 0, state: 'pending', stalled: false, problem: null, blocked: false };
      });
    } else {
      tasks = plan.tasks.map(function (t) {
        var ti = phaseSegIndex(t.phase);
        var scope = (sIdx < 0) ? 'in' : (ti < sIdx ? 'pre' : (ti > sIdx ? 'post' : 'in')); // earlier days assumed done; later days hidden
        return { id: t.id, name: t.name, station: t.station, phase: t.phase, ownerRoleId: t.ownerRoleId,
          assignedIds: t.assignedIds.slice(), startDay: t.startDay, dur: t.dur, deps: t.deps.slice(), scope: scope,
          day: t.day || null, startMin: t.startMin, durMin: t.durMin,
          routeLegId: t.routeLegId || null, sceneId: t.sceneId || null, fromSceneId: t.fromSceneId || null, toSceneId: t.toSceneId || null,
          locationId: t.locationId || null, vesselId: t.vesselId || null, timeStatus: t.timeStatus || 'planned', timeKnown: t.timeKnown !== false, inferred: !!t.inferred,
          confirmedStartMin: t.confirmedStartMin, confirmedEndMin: t.confirmedEndMin, durationStatus: t.durationStatus || 'planned',
          progress: scope === 'pre' ? 1 : 0, state: scope === 'pre' ? 'done' : 'pending', stalled: false, problem: probByTask[t.id] || null, blocked: !!blocked[t.id] };
      });
    }
    // Voyage §3: the ship day plays on its own station set (stations are data — the stage already
    // renders at-sea crews aboard hulls); everyone idles in the cabins instead of the lodging.
    var stationSet = (segment === 'voyage') ? VOYAGE_STATIONS : STATIONS;
    var idleStation = (segment === 'voyage') ? 'cabins' : 'lodging';
    // Scenarios may remove a role-holder from the rehearsal without rewriting
    // the authored plan.  Keep this as runtime-only participant metadata: the
    // resilience evaluator tests whether authority/information were delegated,
    // while scoreTrip continues to read the unchanged normal plan.
    var runtimeScenario = SCENARIOS[plan.scenarioId || 'normal'] || SCENARIOS.normal;
    var unavailableRoleIds = (runtimeScenario.unavailableRoleIds || []).slice();
    var unavailableParticipantIds = [];
    var participants = plan.participants.map(function (p) {
      var unavailableRoleId = unavailableRoleIds.indexOf(p.roleId) >= 0 ? p.roleId : null;
      if (unavailableRoleId) unavailableParticipantIds.push(p.id);
      return { id: p.id, name: p.name, roleId: p.roleId, company: p.company, constraints: p.constraints,
        station: idleStation, x: station(idleStation).x, y: station(idleStation).y,
        state: unavailableRoleId ? 'unavailable' : 'idle', fatigue: 0, taskId: null,
        scenarioUnavailable: !!unavailableRoleId, unavailableRoleId: unavailableRoleId };
    });

    // clock window of the chosen day (or the whole trip)
    var inTasks = tasks.filter(function (t) { return t.scope === 'in'; });
    var d0 = 0, segEnd = DAYS;
    if (sIdx >= 0 && inTasks.length) {
      d0 = Math.min.apply(null, inTasks.map(function (t) { return t.startDay; }));
      segEnd = Math.max.apply(null, inTasks.map(function (t) { return t.startDay + t.dur; }));
    }

    var replayCfg = { seed: (cfg.seed >>> 0) || 1, overrides: clone(cfg.overrides || {}) };
    if (cfg.scenarioId && SCENARIOS[cfg.scenarioId]) {
      replayCfg.scenarioId = cfg.scenarioId;
      if (cfg.scenarioStrategyId && SCENARIO_STRATEGIES[cfg.scenarioId] &&
          SCENARIO_STRATEGIES[cfg.scenarioId][cfg.scenarioStrategyId]) {
        replayCfg.scenarioStrategyId = cfg.scenarioStrategyId;
      }
    }
    var replayState = cfg.runState == null ? null : migrateRunState(cfg.runState);
    if (replayState) replayCfg.runState = clone(replayState);
    var sim = {
      cfg: replayCfg,
      plan: plan, rng: mulberry32((cfg.seed >>> 0) || 1),
      runState: replayState ? clone(replayState) : null,
      segment: segment || 'all', segTaskIds: inTasks.map(function (t) { return t.id; }), segEnd: segEnd,
      day: d0, clock: d0, tick: 0, finished: null, phaseLabel: null, idleStation: idleStation,
      tasks: tasks, participants: participants, problems: problems,
      scenarioState: { id: runtimeScenario.id, modifierIds: (runtimeScenario.modifierIds || []).slice(),
        unavailableRoleIds: unavailableRoleIds, unavailableParticipantIds: unavailableParticipantIds },
      stations: stationSet.map(function (s) { return { id: s.id, name: s.name, icon: s.icon, x: s.x, y: s.y, crewIds: [], dominantProblem: null }; }),
      budget: { total: plan.budget.total, spent: 0, reserve: plan.budget.reserve },
      events: [], bannerOn: false, bannerEverFired: false
    };
    if (minute) {
      var win = DAY_WINDOWS[segment] || [DAY_START_MIN, DAY_END_MIN];
      var dayBase = { load: 0, voyage: 0, arrival: 1, ops: 2, fishday: 2, 'return': 9 }[segment];
      if (typeof dayBase !== 'number') dayBase = 0;
      sim.mode = 'minute'; sim.clockMin = win[0]; sim.winStart = win[0]; sim.winEnd = win[1]; sim.dayBase = dayBase; sim.day = dayBase; sim.clock = dayBase;
      sim.sched = (segment === 'fishday') ? fishdaySchedule(plan) : daySchedule(plan, segment);
      sim.injections = []; sim.handFed = 0; sim.paused = false; sim.checkpoint = null; sim.cpDone = {}; sim.stallSeen = {};
    }
    return sim;
  }

  function chars(sim) { return sim.participants; } // render alias

  // ---- minute-clock tick (fishday, §8): replay the cascade; pause at checkpoints ----
  function tickMinute(sim) {
    if (sim.finished || sim.paused) return sim;
    sim.tick++; sim.clockMin = Math.min((sim.winEnd || DAY_END_MIN), sim.clockMin + MIN_DT);
    sim.clock = (typeof sim.dayBase === 'number' ? sim.dayBase : 2) + (sim.clockMin - (sim.winStart || DAY_START_MIN)) / 1440; sim.day = sim.clock;
    var i, t, p, now = sim.clockMin;

    for (i = 0; i < sim.tasks.length; i++) {
      t = sim.tasks[i];
      if (t.scope !== 'in') continue;                        // other days are 'pre' (done) in this rehearsal
      var e = sim.sched.byTask[t.id]; if (!e) continue;
      if (t.problem) {                                       // classic gap -> hard stall, never completes
        t.state = now >= (t.startMin || DAY_START_MIN) ? 'stalled' : 'pending'; t.stalled = t.state === 'stalled'; t.progress = 0; continue;
      }
      if (now >= e.end) { t.state = 'done'; t.stalled = false; t.progress = 1; }
      else if (now >= e.start) {
        var inRework = e.extension > 0 && now >= e.end - e.extension;
        t.state = inRework ? 'rework' : 'working'; t.stalled = false;
        t.progress = Math.min(1, (now - e.start) / Math.max(1, e.end - e.start));
      }
      else if (now >= t.startMin) { t.state = 'waitinfo'; t.stalled = true; t.progress = 0; }  // 手待ち: due but inputs not in
      else { t.state = 'pending'; t.stalled = false; t.progress = 0; }
    }

    // participants: follow the most urgent live task (stalled > rework > working > waiting)
    var bucket = {}; sim.stations.forEach(function (s) { bucket[s.id] = []; });
    var rank = { stalled: 4, rework: 3, working: 2, waitinfo: 1 };
    for (i = 0; i < sim.participants.length; i++) {
      p = sim.participants[i];
      if (p.scenarioUnavailable) {
        p.taskId = null; p.station = sim.idleStation || 'lodging'; p.state = 'unavailable';
        var unavailableStation = station(p.station); p.x = unavailableStation.x; p.y = unavailableStation.y;
        (bucket[p.station] || (bucket[p.station] = [])).push(p.id);
        continue;
      }
      var cur = null;
      for (var k = 0; k < sim.tasks.length; k++) {
        t = sim.tasks[k];
        if (t.scope !== 'in' || !rank[t.state] || t.assignedIds.indexOf(p.id) < 0) continue;
        if (!cur || rank[t.state] > rank[cur.state]) cur = t;
      }
      if (!cur) {
        var anyDone = false, anyFuture = false;
        for (var m = 0; m < sim.tasks.length; m++) { var tm = sim.tasks[m]; if (tm.scope === 'in' && tm.assignedIds.indexOf(p.id) >= 0) { if (tm.state === 'done') anyDone = true; if (tm.state === 'pending') anyFuture = true; } }
        p.taskId = null; p.station = sim.idleStation || 'lodging'; p.state = (anyDone && !anyFuture) ? 'resolved' : 'idle';
      } else {
        p.taskId = cur.id; p.station = cur.station;
        p.state = cur.problem ? cur.problem.state : (cur.state === 'waitinfo' ? 'waitInfo' : cur.state);
      }
      var st = station(p.station); p.x = st.x; p.y = st.y; (bucket[p.station] || (bucket[p.station] = [])).push(p.id);
    }
    for (i = 0; i < sim.stations.length; i++) {
      var s = sim.stations[i]; s.crewIds = bucket[s.id]; s.dominantProblem = null;
      for (var q = 0; q < sim.problems.length; q++) if (sim.problems[q].station === s.id) { s.dominantProblem = sim.problems[q]; break; }
    }
    var hot = false; for (i = 0; i < sim.stations.length; i++) { var sp = sim.stations[i]; if (sp.dominantProblem && sp.dominantProblem.severity === 'high' && sp.crewIds.length) hot = true; }
    sim.bannerOn = hot; if (hot) sim.bannerEverFired = true;

    sim.phaseLabel = null;
    for (i = 0; i < sim.tasks.length; i++) { t = sim.tasks[i]; if (t.scope === 'in' && rank[t.state]) { sim.phaseLabel = t.phase; break; } }

    var spent = 0, nIn = 0; for (i = 0; i < sim.tasks.length; i++) { t = sim.tasks[i]; if (t.scope !== 'in') continue; nIn++; if (t.state === 'done') spent += 1; }
    sim.budget.spent = Math.round(sim.budget.total * 0.62 * (spent / Math.max(1, nIn)));

    var END = sim.winEnd || DAY_END_MIN;
    if (now >= END) {
      sim.paused = false; sim.checkpoint = null;
      if (AUTHORABLE.indexOf(sim.segment) >= 0) {
        var allDone = sim.tasks.every(function (rt) { return rt.scope !== 'in' || rt.state === 'done'; });
        sim.finished = dayReadiness(sim.plan, sim.segment).length === 0 && sim.sched.unresolved === 0 && allDone ? 'done' : 'incomplete';
      } else sim.finished = (gapsForSegment(sim.plan, sim.segment).length === 0) ? 'done' : 'incomplete';
      return sim;
    }
    if (sim.segment === 'fishday') {
      for (i = 0; i < CHECKPOINTS.length; i++) {                 // 関所: pause for inspect / intervene
        var cp = CHECKPOINTS[i];
        if (!sim.cpDone[cp.id] && now >= cp.min) { sim.cpDone[cp.id] = 1; sim.paused = true; sim.checkpoint = { id: cp.id, min: cp.min, name: cp.name }; break; }
      }
    } else {
      // §21.8b coarse pause-on-stall: pause the moment someone FIRST stalls on a gap (手待ち／手戻り),
      // once per task (stallSeen), so the player can inspect + intervene + resume. The plan's gap still
      // stands, so scoreDay marks the day down — pauses ⇒ a lower score, as designed.
      for (i = 0; i < sim.tasks.length; i++) {
        var tstall = sim.tasks[i];
        if (tstall.scope === 'in' && (tstall.state === 'waitinfo' || tstall.state === 'rework') && !sim.stallSeen[tstall.id]) {
          sim.stallSeen[tstall.id] = 1; sim.paused = true;
          sim.checkpoint = { id: 'cp_stall', min: now, name: L('Stall — someone is blocked', '停止——手待ち／手戻り発生') };
          break;
        }
      }
    }
    return sim;
  }
  function resume(sim) { sim.paused = false; sim.checkpoint = null; return sim; }
  // one-shot runtime patch: hand the card over NOW. Unblocks the live run only —
  // score() reads the plan, so the gap survives a clean re-run (§8).
  function intervene(sim, cardId, toRoleId) {
    if (sim.mode !== 'minute') return sim;
    sim.injections.push({ cardId: cardId, toRoleId: toRoleId, min: sim.clockMin });
    sim.sched = (sim.segment === 'fishday') ? fishdaySchedule(sim.plan, sim.injections) : daySchedule(sim.plan, sim.segment, sim.injections);
    sim.handFed = (sim.handFed || 0) + 1;
    return sim;
  }
  // checkpoint inspector data: what this member holds, waits on (with ETA), does next.
  // Minute-clock sims only — a coarse (day-clock) sim has no schedule to inspect.
  function memberInfo(sim, pid) {
    if (sim.mode !== 'minute' || !sim.sched) return null;
    var plan = sim.plan, p = byId(sim.participants, pid); if (!p) return null;
    var rid = p.roleId, now = sim.clockMin || 0, held = [], waiting = [], i;
    var arrForRole = (sim.sched && sim.sched.arrivals[rid]) || {};
    for (i = 0; i < plan.infoCards.length; i++) {
      var c = plan.infoCards[i];
      if (c.ownerRoleId === rid) { held.push({ cardId: c.id, atMin: DAY_START_MIN, own: true }); continue; }
      var arr = arrForRole[c.id]; if (arr == null) continue;
      if (arr <= now) held.push({ cardId: c.id, atMin: arr }); else waiting.push({ cardId: c.id, etaMin: arr });
    }
    var cur = null, next = null;
    for (i = 0; i < sim.tasks.length; i++) {
      var t = sim.tasks[i];
      if (t.scope !== 'in' || t.assignedIds.indexOf(pid) < 0) continue;
      if (t.state === 'working' || t.state === 'stalled' || t.state === 'waitinfo' || t.state === 'rework') { if (!cur) cur = t; }
      else if (t.state === 'pending') { var e = sim.sched.byTask[t.id]; if (!next || (e && e.start < (sim.sched.byTask[next.id] || {}).start)) next = t; }
    }
    var waitsOn = [];
    if (cur && cur.state === 'waitinfo') { var ce = sim.sched.byTask[cur.id]; if (ce) waitsOn = ce.waits.filter(function (w) { return w.until > now; }); }
    return { id: pid, name: p.name, roleId: rid, state: p.state, station: p.station, held: held, waiting: waiting,
      currentTaskId: cur ? cur.id : null, waitsOn: waitsOn,
      nextTaskId: next ? next.id : null, nextAtMin: next && sim.sched.byTask[next.id] ? sim.sched.byTask[next.id].start : null };
  }

  function tick(sim) {
    if (sim.mode === 'minute') return tickMinute(sim);
    if (sim.finished) return sim;
    sim.tick++; sim.clock = Math.min(sim.segEnd, sim.clock + DT); sim.day = sim.clock;
    var i, t, p;

    // tasks: activate by day window + deps; stalled ones never progress
    for (i = 0; i < sim.tasks.length; i++) {
      t = sim.tasks[i];
      if (t.scope === 'post') continue;     // a later day — not part of this rehearsal
      if (t.state === 'done') continue;
      var active = sim.clock >= t.startDay && t.state !== 'done';
      var depsOk = true; for (var d = 0; d < t.deps.length; d++) { var dep = byId(sim.tasks, t.deps[d]); if (!dep || dep.state !== 'done') depsOk = false; }
      if (!active || !depsOk) { t.state = 'pending'; t.stalled = false; continue; }
      if (t.problem) { t.state = 'stalled'; t.stalled = true; continue; }      // computed weakness → never completes
      t.state = 'working'; t.stalled = false;
      t.progress = Math.min(1, t.progress + DT / Math.max(DT, t.dur));
      if (t.progress >= 1 - 1e-9) t.state = 'done';
    }

    // participants follow their current task; stalled tasks pull them to the gap station
    var bucket = {}; sim.stations.forEach(function (s) { bucket[s.id] = []; });
    for (i = 0; i < sim.participants.length; i++) {
      p = sim.participants[i];
      if (p.scenarioUnavailable) {
        p.taskId = null; p.station = sim.idleStation || 'lodging'; p.state = 'unavailable';
        var unavailableStation = station(p.station); p.x = unavailableStation.x; p.y = unavailableStation.y;
        (bucket[p.station] || (bucket[p.station] = [])).push(p.id);
        continue;
      }
      var cur = null;
      for (var k = 0; k < sim.tasks.length; k++) { t = sim.tasks[k]; if (t.assignedIds.indexOf(p.id) >= 0 && (t.state === 'working' || t.state === 'stalled')) { cur = t; break; } }
      if (!cur) { // none active now: any finished work? → done, else idle at lodging
        var anyDone = false; for (var m = 0; m < sim.tasks.length; m++) { if (sim.tasks[m].assignedIds.indexOf(p.id) >= 0 && sim.tasks[m].state === 'done') anyDone = true; }
        p.taskId = null; p.station = sim.idleStation || 'lodging'; p.state = anyDone ? 'resolved' : 'idle';
      } else {
        p.taskId = cur.id; p.station = cur.station;
        if (cur.stalled) { p.state = cur.problem.state; if (cur.problem.id === 'fatigue') { p.fatigue = Math.min(100, p.fatigue + FATIGUE_RATE); if (p.fatigue > 45) p.state = 'tired'; } }
        else { p.state = (cur.state === 'done') ? 'resolved' : 'working'; }
      }
      var st = station(p.station); p.x = st.x; p.y = st.y;
      (bucket[p.station] || (bucket[p.station] = [])).push(p.id);
    }
    // station crew + dominant problem
    for (i = 0; i < sim.stations.length; i++) {
      var s = sim.stations[i]; s.crewIds = bucket[s.id];
      s.dominantProblem = null;
      for (var q = 0; q < sim.problems.length; q++) if (sim.problems[q].station === s.id) { s.dominantProblem = sim.problems[q]; break; }
    }

    // banner if any high-severity problem is actively stalling crew
    var hot = false; for (i = 0; i < sim.stations.length; i++) { var sp = sim.stations[i]; if (sp.dominantProblem && sp.dominantProblem.severity === 'high' && sp.crewIds.length) hot = true; }
    sim.bannerOn = hot; if (hot) sim.bannerEverFired = true;

    // current phase label = phase of an active task (for the dashboard)
    sim.phaseLabel = null;
    for (i = 0; i < sim.tasks.length; i++) { t = sim.tasks[i]; if (t.state === 'working' || t.state === 'stalled') { sim.phaseLabel = t.phase; break; } }

    // budget consumption tracks completed in-scope tasks (illustrative)
    var spent = 0, nIn = 0; for (i = 0; i < sim.tasks.length; i++) { t = sim.tasks[i]; if (t.scope !== 'in') continue; nIn++; if (t.state === 'done') spent += 1; }
    sim.budget.spent = Math.round(sim.budget.total * 0.62 * (spent / Math.max(1, nIn)));

    if (sim.clock >= sim.segEnd - 1e-9) sim.finished = (gapsForSegment(sim.plan, sim.segment).length === 0) ? 'done' : 'incomplete';
    return sim;
  }

  // per-day result (for the rehearse-a-day flow): how that day ran + its gaps.
  function daySummary(sim) {
    // Animated coarse-day sims execute plan.days[segment], whose task ids do not
    // exist in the legacy ten-day plan.tasks array. Summarize those authored
    // tasks directly and combine plan quality with actual runtime completion.
    // The legacy day-clock branch below remains byte-for-byte behaviorally
    // compatible for its established Arrival/Ops/Return report flow.
    if (sim && sim.mode === 'minute' && AUTHORABLE.indexOf(sim.segment) >= 0 && sim.segment !== 'fishday') {
      var authored = tasksForSeg(sim.plan, sim.segment).filter(function (t) { return t.required !== false; });
      var required = {}, liveDone = {};
      authored.forEach(function (t) { required[t.id] = 1; });
      (sim.tasks || []).forEach(function (t) { if (required[t.id] && t.state === 'done') liveDone[t.id] = 1; });
      var authoredDone = Object.keys(liveDone).length, authoredTotal = authored.length;
      var completion = authoredTotal ? authoredDone / authoredTotal : 0;
      var planned = scoreDay(sim.plan, sim.segment), readinessGaps = dayReadiness(sim.plan, sim.segment);
      var executionComplete = authoredTotal > 0 && authoredDone === authoredTotal && sim.finished === 'done';
      var authoredClean = planned.clean && executionComplete;
      var authoredScore = Math.min(planned.score, Math.round(100 * completion));
      if (!authoredClean && authoredScore > 89) authoredScore = 89;
      var authoredGrade = authoredScore >= 90 && authoredClean ? 'A' :
        (authoredScore >= 75 ? 'B' : (authoredScore >= 60 ? 'C' : 'D'));
      var authoredFixes = readinessGaps.map(function (gap, index) {
        return { id: 'authored_' + String(gap.type || 'gap').toLowerCase() + '_' + index,
          fixId: null, category: 'schedule', severity: 'med', station: null, roleId: null,
          hint: clone(gap) };
      });
      if (!executionComplete) authoredFixes.push({ id: 'authored_execution_incomplete', fixId: null,
        category: 'schedule', severity: 'high', station: null, roleId: null });
      return { segment: sim.segment, score: authoredScore, grade: authoredGrade, clean: authoredClean,
        tasksDone: authoredDone, tasksTotal: authoredTotal,
        gaps: authoredFixes.length, fixes: authoredFixes,
        reason: sim.finished };
    }
    var plan = sim.plan, problems = detect(plan), blocked = blockedTasks(plan, problems);
    var ids = sim.segTaskIds, inSeg = {}; ids.forEach(function (id) { inSeg[id] = 1; });
    var segTasks = plan.tasks.filter(function (t) { return inSeg[t.id]; });
    var doneCount = 0; segTasks.forEach(function (t) { if (!blocked[t.id]) doneCount++; });
    var frac = segTasks.length ? doneCount / segTasks.length : 1;
    var gaps = problems.filter(function (p) { for (var i = 0; i < p.taskIds.length; i++) if (inSeg[p.taskIds[i]]) return true; return false; });
    var clean = gaps.length === 0 && frac >= 0.999;
    var score = Math.round(100 * frac); if (!clean && score > 89) score = 89;
    var grade = (score >= 90 && clean) ? 'A' : (score >= 75 ? 'B' : (score >= 60 ? 'C' : 'D'));
    var fixes = gaps.slice().sort(function (a, b) { return sevRank(b.severity) - sevRank(a.severity); })
      .map(function (p) { return { id: p.id, fixId: p.fixId, category: p.category, severity: p.severity, station: p.station, roleId: p.roleId }; });
    return { segment: sim.segment, score: score, grade: grade, clean: clean, tasksDone: doneCount, tasksTotal: segTasks.length, gaps: gaps.length, fixes: fixes, reason: sim.finished };
  }

  // ===========================================================================
  // score — 8 categories (spec §16) + 6 individual values (§17). Deterministic
  // and explainable: every deduction is tied to an active detector.
  // ===========================================================================
  var CAT_MAX = { objective: 20, schedule: 15, roles: 15, info: 15, budget: 10, safety: 10, quality: 10, health: 5 };

  function score(sim) {
    var plan = sim.plan, problems = detect(plan);
    var act = {}; problems.forEach(function (p) { act[p.id] = p; });
    var blocked = blockedTasks(plan, problems);
    var realTasks = plan.tasks.length, doneTasks = 0;
    for (var i = 0; i < plan.tasks.length; i++) if (!blocked[plan.tasks[i].id]) doneTasks++;
    var goalPct = realTasks ? doneTasks / realTasks : 1;

    // temporal costs (§9): schedule & info become minute/handoff-derived; quality
    // takes wrong-fish events + guest waiting. One late arrow bills info (design
    // flaw) AND schedule (the idle it produced) — one fault, two lenses.
    var fd = fishdaySchedule(plan);
    var waste = fd.availMin > 0 ? Math.min(1, fd.idleTotal / fd.availMin) : 0;

    var cat = {
      objective: 20 * goalPct,
      schedule:  15 * goalPct * (1 - waste) - (act.fatigue ? 2 : 0) - (act.returnLogi ? 2 : 0),
      roles:     15 - (act.safety ? 5 : 0) - (act.budgetAuth ? 4 : 0) - (act.returnLogi ? 3 : 0),
      info:      15 - (act.info ? 8 : 0) - (act.report ? 7 : 0) - 5 * fd.missing.length - 3 * fd.late.length,
      budget:    10 - (act.budgetAuth ? 6 : 0) - (act.reserve ? 4 : 0),
      safety:    10 - (act.safety ? 10 : 0),
      quality:   10 * goalPct - 4 * fd.wrongFish.length - Math.min(4, Math.floor(fd.guestWaitMin / 15)),
      health:    5 - (act.fatigue ? 5 : 0)
    };
    var total = 0, categories = {};
    for (var k in CAT_MAX) { var v = Math.max(0, Math.min(CAT_MAX[k], cat[k])); categories[k] = Math.round(v); total += v; }
    total = Math.round(total);

    var clean = problems.length === 0 && sim.finished === 'done' && goalPct >= 0.999;
    var grade = (total >= GRADE_BANDS.A && clean) ? 'A' : (total >= GRADE_BANDS.B ? 'B' : (total >= GRADE_BANDS.C ? 'C' : 'D'));
    if (!clean && total > 89) total = 89;

    // success conditions met (for the report)
    var conds = plan.project.successConditions.map(function (c) {
      var met = true;
      if (c.id === 's_safe') met = !act.safety && !act.report;
      else if (c.id === 's_fish') met = !blocked['t07'];
      else if (c.id === 's_budget') met = !act.budgetAuth && !act.reserve;
      else if (c.id === 's_flow') met = problems.length === 0;
      return { id: c.id, text: c.text, met: met };
    });

    // 6 individual performance values per participant (§17), 0..100
    var individuals = plan.participants.map(function (pp) {
      var sim_p = byId(sim.participants, pp.id) || { fatigue: 0 };
      var rid = pp.roleId, prob = null;
      for (var z = 0; z < problems.length; z++) if (problems[z].roleId === rid) { prob = problems[z]; break; }
      var load = loadOf(plan, pp.id), over = load >= LOAD_CAP;
      var act_ = 100 - (prob && (prob.id === 'info' || prob.id === 'budgetAuth') ? 45 : 0) - (over ? 15 : 0);
      var dec = 100 - (prob && (prob.id === 'safety' || prob.id === 'report' || prob.id === 'budgetAuth') ? 50 : 0);
      var loadIdx = Math.min(100, 30 + load * 22 + (rid === 'siteLead' && act.fatigue ? 25 : 0));
      var fat = Math.round(sim_p.fatigue) + (over && act.fatigue ? 35 : 0);
      var coop = 100 - (act.report && (rid === 'safetyLead' || rid === 'comms') ? 40 : 0) - (act.info ? 10 : 0);
      var contrib = Math.round(100 * goalPct) - (prob ? 20 : 0);
      function c100(n) { return Math.max(0, Math.min(100, Math.round(n))); }
      return { id: pp.id, name: pp.name, roleId: rid,
        action: c100(act_), decision: c100(dec), load: c100(loadIdx), fatigue: c100(fat), coop: c100(coop), contribution: c100(contrib) };
    });
    var team = { action: 0, decision: 0, load: 0, fatigue: 0, coop: 0, contribution: 0 };
    individuals.forEach(function (iv) { for (var f in team) team[f] += iv[f]; });
    for (var f2 in team) team[f2] = Math.round(team[f2] / Math.max(1, individuals.length));

    // ordered fix-pack = remediation report (§18/§21)
    var fixes = problems.slice().sort(function (a, b) { return sevRank(b.severity) - sevRank(a.severity); })
      .map(function (p) { return { id: p.id, fixId: p.fixId, category: p.category, severity: p.severity, station: p.station, roleId: p.roleId }; });

    return {
      score: total, grade: grade, clean: clean, reason: sim.finished || 'incomplete',
      goalPct: Math.round(goalPct * 100), categories: categories, pillars: categories,
      individuals: individuals, team: team, conditions: conds, fixes: fixes,
      problemCount: problems.length, day: Math.round(sim.day * 10) / 10,
      budgetSpent: sim.budget.spent, budgetTotal: sim.budget.total,
      // fishday temporal headline (§9): Efficiency % sits beside the grade
      efficiency: fd.efficiency, idleMin: fd.idleTotal, reworkMin: fd.reworkTotal,
      wrongFishCount: fd.wrongFish.length, arrowsMissing: fd.missing.length, arrowsLate: fd.late.length,
      dinnerMin: fd.dinnerMin, guestWaitMin: fd.guestWaitMin, handFed: sim.handFed || 0
    };
  }
  function sevRank(s) { return s === 'high' ? 3 : s === 'med' ? 2 : 1; }

  // plan-time projection (§7.2): the pre-Run mirror of the post-Run score
  function projected(cfg) {
    var plan = mergePlan(cfg || { seed: 1, overrides: {} });
    return score({ plan: plan, participants: [], finished: detect(plan).length === 0 ? 'done' : 'incomplete',
      budget: { spent: 0, total: plan.budget.total }, day: 0, handFed: 0 });
  }

  // ===========================================================================
  // scoreTrip(plan) / tripEfficiency(plan) — the whole-trip 100-point ledger, the
  // rubric v1.0 "derived constitution" (spec docs/…/2026-07-10-scoring-rubric-v1-design.md).
  // PURELY ADDITIVE + read-only: reads only
  // (tasksForSeg/handoffsForSeg/daySchedule/dayReadiness/makeTemplate + plan fields),
  // never mutates its `plan` argument, no RNG, never calls score()/scoreDay(). All
  // task/handoff/detector CONTENT is untouched — this is a lens over them.
  //
  // v1.0 change (§1/§3): the five hand-written bucket builders are replaced by ONE generic
  // deriver (deriveSegAtoms) that MINTS atoms mechanically from the template's required tasks,
  // their neededInfo sockets, and the §3.4 pricing flags now carried as task fields
  // (safetyGate/qualityCheck/moneyCheck). The frame's 7 detector-derived gates stay hand-listed
  // (they have no owning task). Voyage repack (spec 2026-07-13 §4): the matrix now spans 7 buckets
  // (frame 12 · load 11 · voyage 12 · arrival 12 · ops 13 · fishday 30 · return 10 = 100, fishday
  // heaviest, Information the heaviest dimension) — 94 atoms (85 scoring + 9 decoy debits); the
  // exact frozen values are re-pinned by the W1b verify wave.
  //
  // Homing rules (§3.3): socket→Info; a safetyGate-flagged task LEAVES its exec lane and becomes
  // a Safety atom (replace); a qualityCheck/moneyCheck task STAYS in its lane and ALSO mints an
  // additive Quality/Money atom; every other required task → its role's Exec lane.
  // ===========================================================================

  // template-derived durMin floor per task id, across fishday + all authorable coarse days
  function tripTemplateDurMap() {
    var tmpl = makeTemplate(), map = {}, i;
    for (i = 0; i < tmpl.tasks.length; i++) map[tmpl.tasks[i].id] = tmpl.tasks[i].durMin;
    for (var seg in tmpl.days) { var dt = tmpl.days[seg].tasks; for (i = 0; i < dt.length; i++) map[dt[i].id] = dt[i].durMin; }
    return map;
  }

  // (roleId,cardId) consuming pairs across a fixed set of required tasks, deduped — the
  // "socket" universe, priced from the TEMPLATE's required set (never the live plan), so
  // maxPts is invariant no matter what the player has placed/drawn (§6 template denominators).
  function tripSocketPairs(reqTasks, cardOwner) {
    var seen = {}, out = [], i, j;
    for (i = 0; i < reqTasks.length; i++) {
      var t = reqTasks[i];
      for (j = 0; j < (t.neededInfo || []).length; j++) {
        var cid = t.neededInfo[j];
        if (cardOwner[cid] === t.ownerRoleId) continue; // owner holds its own card — no socket
        var key = t.ownerRoleId + '|' + cid;
        if (!seen[key]) { seen[key] = 1; out.push({ roleId: t.ownerRoleId, cardId: cid }); }
      }
    }
    return out;
  }
  function tripPairTaskIds(reqTasks, roleId, cardId) {
    var out = [];
    for (var i = 0; i < reqTasks.length; i++) { var t = reqTasks[i]; if (t.ownerRoleId === roleId && (t.neededInfo || []).indexOf(cardId) >= 0) out.push(t.id); }
    return out;
  }
  // a socket is riskable (3pts) iff ANY consuming task of that (role,card) lists the card in its
  // assumeOn (data-driven, §5) — the task will GUESS the card if it's late -> wrong-fish rework.
  // On the template this yields exactly the 4 fishday sockets (specialist×ic_menu, siteLead×ic_menu,
  // siteLead×ic_target, specialist×ic_ground); coarse tasks carry no assumeOn.
  function tripPairRiskable(reqTasks, roleId, cardId) {
    for (var i = 0; i < reqTasks.length; i++) {
      var t = reqTasks[i];
      if (t.ownerRoleId === roleId && (t.neededInfo || []).indexOf(cardId) >= 0 && (t.assumeOn || []).indexOf(cardId) >= 0) return true;
    }
    return false;
  }
  // status of a (role,card) socket, read off daySchedule's OWN missing/late arrays (the
  // engine's existing min-over-arrows checker) — never a re-derived arrival calculation.
  function tripSocketStatus(ds, taskIds, cardId, livePlaced) {
    // §5 worst-consumer rule: EVERY consuming task must be placed and fed — one unplaced
    // consumer voids the whole socket (daySchedule's arrays only cover placed tasks, so an
    // unplaced consumer would otherwise silently fall through to 'ok' on collapsed sockets).
    var i;
    for (i = 0; i < taskIds.length; i++) if (!livePlaced[taskIds[i]]) return 'missing';
    for (i = 0; i < ds.missing.length; i++) { var m = ds.missing[i]; if (m.cardId === cardId && taskIds.indexOf(m.taskId) >= 0) return 'missing'; }
    for (i = 0; i < ds.late.length; i++) { var l = ds.late[i]; if (l.cardId === cardId && taskIds.indexOf(l.taskId) >= 0) return 'late'; }
    return 'ok';
  }
  function tripSocketAtom(id, bucket, plan, ds, taskIds, roleId, cardId, riskable, livePlaced) {
    var st = tripSocketStatus(ds, taskIds, cardId, livePlaced);
    // Voyage §4.1 (senior-dev gate ruling): the riskable tier STAYS 3 — the 1 "specified" +
    // 2 "on time" split is the thesis's own pricing (rubric-v1 §3.4, frozen). Drawn-but-late
    // riskable earns 1 of 3.
    var maxPts = riskable ? 3 : 1, earned, status, reasonKey;
    if (st === 'missing') { earned = 0; status = 'missing'; reasonKey = 'scr_info_missing'; }
    else if (st === 'late') {
      if (riskable) { earned = 1; status = 'present-but-late'; reasonKey = 'scr_info_drawn_late'; }
      else { earned = 0; status = 'late'; reasonKey = 'scr_info_late'; }
    } else { earned = maxPts; status = 'ok'; reasonKey = 'scr_info_ok'; }
    return { id: id, bucket: bucket, dimension: 'info',
      itemRef: { type: 'socket', cardId: cardId, taskId: taskIds, roleId: roleId },
      maxPts: maxPts, earned: earned, status: status, reasonKey: reasonKey, reasonParams: {} };
  }
  // one execution atom per role-lane: EVERY required task of that role in this seg must be
  // placed, staffed on the right role, dep-consistent, non-overlapping, durMin >= template.
  // ds/rd are precomputed once per seg per scoreTrip call (perf fix §3/§9 SP2) and passed in.
  function tripLaneAtom(id, bucket, plan, seg, roleId, taskIds, tmplDur, ds, rd) {
    var all = tasksForSeg(plan, seg), byIdMap = {}, i;
    for (i = 0; i < all.length; i++) byIdMap[all[i].id] = all[i];
    var bad = false, status = 'ok', reasonKey = 'scr_exec_ok';
    for (i = 0; i < taskIds.length && !bad; i++) {
      var t = byIdMap[taskIds[i]];
      if (!t || !isPlaced(t)) { bad = true; status = 'missing'; reasonKey = 'scr_exec_unstaffed'; }
    }
    if (!bad) for (i = 0; i < taskIds.length && !bad; i++) {
      var t2 = byIdMap[taskIds[i]], floor = tmplDur[taskIds[i]];
      if (typeof floor === 'number' && t2.durMin < floor) { bad = true; status = 'compressed'; reasonKey = 'scr_exec_compressed'; }
    }
    // wrong-role placement (§3.1 "on the right role"): read the schedule's own misassigned[]
    // directly — dayReadiness surfaces MISASSIGNED on coarse segs only, never on fishday.
    if (!bad) {
      for (i = 0; i < taskIds.length && !bad; i++) if (ds.misassigned.indexOf(taskIds[i]) >= 0) { bad = true; status = 'broken'; reasonKey = 'scr_exec_misassigned'; }
    }
    if (!bad) for (i = 0; i < rd.length && !bad; i++) {
      var r = rd[i];
      if (r.type === 'TASK_UNSTAFFED' && taskIds.indexOf(r.taskId) >= 0) { bad = true; status = 'missing'; reasonKey = 'scr_exec_unstaffed'; }
      else if (r.type === 'MISASSIGNED' && taskIds.indexOf(r.taskId) >= 0) { bad = true; status = 'broken'; reasonKey = 'scr_exec_misassigned'; }
      else if (r.type === 'DEP_BROKEN' && taskIds.indexOf(r.taskId) >= 0) { bad = true; status = 'broken'; reasonKey = 'scr_exec_broken'; }
      // hd_r_headcount is priced as a safety gate rather than a Comms execution
      // lane. Its direct prerequisite, hd_r_ship, belongs to Return Logistics;
      // bind that one cross-class dependency break to the existing 1-point Logi
      // lane so delaying shipping past headcount can never display 100. This is
      // intentionally exact: other dependency consumers already belong to their
      // own priced lane/gate, and broad producer charging would double-bill them.
      else if (r.type === 'DEP_BROKEN' && seg === 'return' && roleId === 'logi' &&
          r.taskId === 'hd_r_headcount' && r.depId === 'hd_r_ship' && taskIds.indexOf(r.depId) >= 0) {
        bad = true; status = 'broken'; reasonKey = 'scr_exec_broken';
      }
      else if (r.type === 'OVERLOAD' && (taskIds.indexOf(r.taskId) >= 0 || taskIds.indexOf(r.otherId) >= 0)) { bad = true; status = 'overlap'; reasonKey = 'scr_exec_overlap'; }
    }
    // 100 means mastery: three modeled handover duties that used to live only in the
    // zero-known-gaps clean gate now bind to an EXISTING execution atom. No atom or
    // point is minted, so the frozen 99-row / 100-point constitution is unchanged.
    // - Arrival Logistics owns the Chichijima physical transfer custody chain.
    // - Return Site Lead owns the inferred reverse-route custody chain.
    // - Return Logistics also owns the legacy whole-trip ship-out/headcount duty
    //   surfaced by the returnLogi detector (t_ship). A plan cannot display 100 while
    //   any of these concrete duties is unresolved.
    if (!bad && seg === 'arrival' && roleId === 'logi' && manifestTransferGaps(plan).length > 0) {
      bad = true; status = 'broken'; reasonKey = 'scr_exec_broken';
    }
    if (!bad && seg === 'return' && roleId === 'siteLead' && manifestReturnGaps(plan).length > 0) {
      bad = true; status = 'broken'; reasonKey = 'scr_exec_broken';
    }
    if (!bad && seg === 'return' && roleId === 'logi') {
      var legacyShip = byId(plan.tasks || [], 't_ship');
      if (!legacyShip || !legacyShip.assignedIds || legacyShip.assignedIds.length === 0) {
        bad = true; status = 'missing'; reasonKey = 'scr_exec_unstaffed';
      }
    }
    return { id: id, bucket: bucket, dimension: 'exec', itemRef: { type: 'lane', taskId: taskIds, roleId: roleId },
      maxPts: 1, earned: bad ? 0 : 1, status: status, reasonKey: reasonKey, reasonParams: {} };
  }
  // a binary gate atom (authority / criterion / route) — dimension is caller-supplied
  // (safety | money | people); ok/gapKey come from the fixed §13.3 reason set.
  function tripGateAtom(id, bucket, dimension, maxPts, ok, itemRef, okKey, gapKey, failStatus) {
    return { id: id, bucket: bucket, dimension: dimension, itemRef: itemRef, maxPts: maxPts,
      earned: ok ? maxPts : 0, status: ok ? 'ok' : (failStatus || 'missing'),
      reasonKey: ok ? okKey : gapKey, reasonParams: {} };
  }
  // a quality atom gated on the day cascade's own idle read-off (no idle => on-time/uncompressed)
  function tripQualityAtom(id, bucket, plan, seg, taskId, tmplDur, ds) {
    var all = tasksForSeg(plan, seg), t = byId(all, taskId);
    var placed = !!(t && isPlaced(t));
    var ok = !!(placed && t.durMin >= tmplDur[taskId] && ds.byTask[taskId] && ds.byTask[taskId].idleMin === 0 && !ds.byTask[taskId].unresolved);
    var status = ok ? 'ok' : (!placed ? 'missing' : (t.durMin < tmplDur[taskId] ? 'compressed' : 'late'));
    return { id: id, bucket: bucket, dimension: 'quality', itemRef: { type: 'lane', taskId: taskId },
      maxPts: 1, earned: ok ? 1 : 0, status: status, reasonKey: ok ? 'scr_qual_ok' : 'scr_qual_fail', reasonParams: {} };
  }
  // a decoy debit row (§3.1/§13.1): maxPts is always 0 (decoys never ADD to the 100), earned
  // goes negative only if the player actually placed the decoy onto the board.
  function tripDecoyAtom(id, bucket, plan, seg, taskId, safetyFlavored) {
    var all = tasksForSeg(plan, seg), t = byId(all, taskId);
    var placed = !!(t && isPlaced(t));
    var penalty = safetyFlavored ? -3 : -2;
    return { id: id, bucket: bucket, dimension: safetyFlavored ? 'safety' : 'exec',
      itemRef: { type: 'decoy', taskId: taskId }, maxPts: 0, earned: placed ? penalty : 0,
      status: placed ? 'decoy' : 'ok', reasonKey: placed ? 'scr_decoy' : 'scr_exec_ok', reasonParams: {} };
  }

  // ---- Trip Frame (Voyage repack: 12 = Safety 8, Money 3, People 1) — standing authorities ----
  function tripFrameAtoms(plan) {
    var out = [];
    var sl = plan.roles.safetyLead, sea = byId(plan.risks, 'rk_sea'), night = byId(plan.risks, 'rk_night');
    var seaOk = !!(sl.holder && sl.deputyId && sl.authority && sl.authority.canAbort && sea && sea.ownerRoleId && sea.abortCriterion);
    out.push(tripGateAtom('frame_abort_sea', 'frame', 'safety', 2, seaOk, { type: 'gate', detectorId: 'safety' }, 'scr_safety_ok', 'scr_safety_gap'));
    // MAKE-REAL (§13.1): rk_night.abortCriterion present, mirroring rk_sea's shape exactly
    var nightOk = !!(sl.holder && sl.deputyId && sl.authority && sl.authority.canAbort && night && night.ownerRoleId && night.abortCriterion);
    out.push(tripGateAtom('frame_abort_night', 'frame', 'safety', 1, nightOk, { type: 'gate', detectorId: 'safety' }, 'scr_safety_ok', 'scr_safety_gap'));   // Voyage §4.1: 2->1 (sea abort keeps 2)
    var health = byId(plan.commRules, 'cr_health');
    out.push(tripGateAtom('frame_health_report', 'frame', 'safety', 2, !!(health && health.reportToRoleId), { type: 'gate', detectorId: 'report' }, 'scr_safety_ok', 'scr_safety_gap'));
    // MAKE-REAL (§13.1): ic_hospital.recipientRoleIds ⊇ {pm,siteLead,comms,safetyLead}
    var hosp = byId(plan.infoCards, 'ic_hospital'), hospNeed = ['pm', 'siteLead', 'comms', 'safetyLead'];
    var hospOk = !!hosp && hospNeed.every(function (r) { return hosp.recipientRoleIds.indexOf(r) >= 0; });
    // The existing 2-point critical-information gate covers BOTH emergency access and
    // the route brief. The classic `info` detector already models ic_ferry distribution;
    // binding it here removes the former 100/B state without changing weights or rows.
    var ferry = byId(plan.infoCards, 'ic_ferry'), ferryNeed = ['siteLead', 'specialist', 'chef', 'logi', 'safetyLead'];
    var ferryOk = !!ferry && ferryNeed.every(function (r) { return ferry.recipientRoleIds.indexOf(r) >= 0; });
    var sharedPrimary = !ferryOk ? 'ic_ferry' : 'ic_hospital';
    out.push(tripGateAtom('frame_hospital_shared', 'frame', 'safety', 2, hospOk && ferryOk,
      { type: 'gate', detectorId: 'info', cardId: sharedPrimary, cardIds: ['ic_hospital', 'ic_ferry'] },
      'scr_safety_ok', 'scr_safety_gap'));
    // Voyage repack: budget authority 3 -> 2, reserve 2 -> 1 (frame 14 -> 12).
    var meals = byId(plan.budget.lines, 'bl_meals');
    out.push(tripGateAtom('frame_budget_authority', 'frame', 'money', 2, !!(meals && meals.approverRoleId && meals.payMethod), { type: 'gate', detectorId: 'budgetAuth' }, 'scr_money_ok', 'scr_money_gap'));
    out.push(tripGateAtom('frame_reserve_drawrule', 'frame', 'money', 1, plan.budget.reserve >= (plan.budget.reserveTarget || 300000), { type: 'gate', detectorId: 'reserve' }, 'scr_money_ok', 'scr_money_gap'));
    var siteLeadRole = plan.roles.siteLead;
    var reliefOk = !!siteLeadRole.deputyId || loadOf(plan, siteLeadRole.holder) < LOAD_CAP;
    out.push(tripGateAtom('frame_load_relief', 'frame', 'people', 1, reliefOk, { type: 'gate', detectorId: 'fatigue' }, 'scr_people_ok', 'scr_people_overload'));
    return out;
  }

  // a safetyGate-flagged task priced at its flag pts (§3.2/§3.4). Coarse gates (hd_a_safety,
  // hd_o_weather, hd_o_safetywatch, hd_r_headcount, hd_r_boarding) earn on placed + right role +
  // durMin floor. The three fishday gates add a specific criterion: t_f_weather needs an explicit
  // abort criterion on rk_sea; t_f_seawatch must hold abort authority aboard for the whole at-sea
  // window (start <= 07:00); t_f_health just runs on landing.
  function tripSafetyGateAtom(bucket, plan, seg, task, tmplDur, ds) {
    var all = tasksForSeg(plan, seg), live = byId(all, task.id), floor = tmplDur[task.id];
    // §7.4 taxonomy: the fail status names the actual cause — unplaced 'missing', floor
    // 'compressed', wrong role 'broken'; an absent criterion stays 'missing' (never specified).
    var fail = 'missing';
    if (live && isPlaced(live)) {
      if (typeof floor === 'number' && live.durMin < floor) fail = 'compressed';
      else if (ds.misassigned.indexOf(task.id) >= 0) fail = 'broken';
    }
    var placedRight = !!(live && isPlaced(live) && (typeof floor !== 'number' || live.durMin >= floor) && ds.misassigned.indexOf(task.id) < 0);
    var ok = placedRight;
    if (task.id === 't_f_weather') { var sea = byId(plan.risks, 'rk_sea'); ok = placedRight && !!(sea && sea.abortCriterion); }
    else if (task.id === 't_f_seawatch') { ok = placedRight && live.startMin <= 420; }
    // Voyage load-day gates (spec §4 flag table):
    else if (task.id === 'hd_l_hold') {
      // the HOLD MANIFEST CHECK — you count the crates in the hold and find what never made the
      // hotel-to-terminal transfer. Earns only when every item's outbound custody chain is complete.
      ok = placedRight && manifestChainGaps(plan).length === 0;
    } else if (task.id === 'hd_l_headcount') {
      // the SAILING-TIME BOARDING GATE — the 11:00 sailing is fixed; boarding must FINISH by it
      // on the solved schedule (idle from an unshared cabin list blows straight through this).
      var eB = ds.byTask[task.id];
      ok = placedRight && !!eB && !eB.unresolved && eB.end <= SAIL_MIN;
      if (placedRight && eB && eB.end > SAIL_MIN) fail = 'late';
    }
    return tripGateAtom(bucket + '_safety_' + task.id, bucket, 'safety', task.safetyGate, ok,
      { type: 'gate', taskId: task.id }, 'scr_safety_ok', 'scr_safety_gap', fail);
  }
  // a moneyCheck-flagged task priced additively (§3.2/§3.4) — the authority/settlement property
  // on top of the task's execution. Task-homed id + itemRef.taskId so the ledger name resolves
  // from the task (§10 delta #4). Each check ports its as-built earn criterion verbatim.
  function tripMoneyCheckAtom(bucket, plan, seg, task, tmplDur, ds, rd) {
    // Voyage repack pruned the retired money flags' branches (hd_a_board / hd_o_foodsource /
    // hd_o_tackleprep / hd_r_sitecash — see the template migration notes); the settle check stays
    // and the load day adds the cash-box packing check.
    var ok = false, fail = 'missing';
    if (task.id === 'hd_l_pack') {
      // the CASH BOX travels: earned iff the pack-out is placed and actually carries mi_cashbox
      var pk = byId(tasksForSeg(plan, seg), 'hd_l_pack');
      ok = !!(pk && isPlaced(pk) && (pk.carries || []).indexOf('mi_cashbox') >= 0);
    } else if (task.id === 'hd_r_settle') {
      var all2 = tasksForSeg(plan, seg), st = byId(all2, 'hd_r_settle');
      ok = !!(st && isPlaced(st) && st.durMin >= tmplDur.hd_r_settle);
      if (st && isPlaced(st) && st.durMin < tmplDur.hd_r_settle) fail = 'compressed';
    }
    return tripGateAtom(bucket + '_money_' + task.id, bucket, 'money', task.moneyCheck, ok,
      { type: 'gate', taskId: task.id }, 'scr_money_ok', 'scr_money_gap', fail);
  }
  // the three COMPUTED Fishing-Day quality gates (§3.2/§4) — priced beyond a single task's
  // placement: cookblock (dur >= 5min × portions AND dinner <= 18:00, 2pts), allergy respected
  // (menu species category vs the shellfish allergy, 1pt), portions = 13 guests + org add-ons (1pt).
  function tripFishdayQualityGates(plan, tmplDur, ds) {
    var out = [], all = tasksForSeg(plan, 'fishday');
    // cookblock — status fix (§7.4): 'compressed' ONLY when durMin under the 5×portions floor;
    // a late dinner reports 'late' (not the old blanket 'compressed').
    var cook = byId(all, 't_f_cook');
    var cookPlaced = !!(cook && isPlaced(cook));
    var cookFloorOk = cookPlaced && cook.durMin >= tmplDur.t_f_cook;
    var dinnerOk = ds.dinnerMin != null && ds.dinnerMin <= 1080;
    var cookOk = cookFloorOk && dinnerOk;
    var cookStatus = !cookPlaced ? 'missing' : (!cookFloorOk ? 'compressed' : (!dinnerOk ? 'late' : 'ok'));
    // Voyage repack: cookblock 2 -> 1 and the portions gate retired (it was a defensive atom that
    // could not fail on a well-formed plan — rubric §13.4 note); allergy (a §13 showcase) stays.
    out.push({ id: 'fishday_quality_cookblock', bucket: 'fishday', dimension: 'quality', itemRef: { type: 'lane', taskId: 't_f_cook' },
      maxPts: 1, earned: cookOk ? 1 : 0, status: cookStatus, reasonKey: cookOk ? 'scr_qual_ok' : 'scr_qual_fail', reasonParams: {} });
    // allergy — committed menu species -> allergen CATEGORY (SPECIES_CATEGORIES) must not intersect
    // ic_food.allergens (category tokens); 'skipjack'(fish) never hits a 'shellfish' allergen.
    var menuCard = byId(plan.infoCards, 'ic_menu'), foodCard = byId(plan.infoCards, 'ic_food');
    var menuCats = (menuCard && SPECIES_CATEGORIES[menuCard.species]) || [];
    var allergyOk = !!(menuCard && menuCard.species) && !(foodCard && foodCard.allergens && foodCard.allergens.some(function (a) { return menuCats.indexOf(a) >= 0; }));
    out.push(tripGateAtom('fishday_quality_allergy', 'fishday', 'quality', 1, allergyOk, { type: 'gate', cardId: 'ic_menu' }, 'scr_qual_ok', 'scr_qual_fail'));
    return out;
  }

  // Flex/standby tasks intentionally do not mint their own execution lane, but they
  // are still required authored work. Bind their completion/capacity evidence to one
  // existing safety-readiness atom per segment so "free lane" never means a hidden
  // 100-point gap. The anchor ids are stable and no maxima/atom counts change.
  function tripApplyFlexCoverage(atoms, plan, seg, reqTasks, tmplDur, ds, rd) {
    var anchorId = { load: 'load_safety_hd_l_headcount', voyage: 'voyage_safety_hd_v_watch',
      fishday: 'fishday_safety_t_f_seawatch' }[seg];
    if (!anchorId) return;
    var flex = reqTasks.filter(function (t) { return !!t.flex; });
    if (!flex.length) return;
    var anchor = null, i, j, live, fault = null;
    for (i = 0; i < atoms.length; i++) if (atoms[i].id === anchorId) { anchor = atoms[i]; break; }
    if (!anchor) return;
    var refs = pcList(anchor.itemRef.taskId);
    for (i = 0; i < flex.length; i++) pcAdd(refs, flex[i].id);
    anchor.itemRef.taskId = refs;
    for (i = 0; i < flex.length && !fault; i++) {
      live = byId(tasksForSeg(plan, seg), flex[i].id);
      if (!live || !isPlaced(live)) fault = { status: 'missing' };
      else if (typeof tmplDur[flex[i].id] === 'number' && live.durMin < tmplDur[flex[i].id]) fault = { status: 'compressed' };
      else if (ds.misassigned.indexOf(flex[i].id) >= 0) fault = { status: 'broken' };
    }
    for (i = 0; i < rd.length && !fault; i++) {
      var rr = rd[i], touches = false;
      for (j = 0; j < flex.length && !touches; j++) touches = rr.taskId === flex[j].id || rr.otherId === flex[j].id;
      if (!touches) continue;
      if (rr.type === 'OVERLOAD') fault = { status: 'overlap' };
      else if (rr.type === 'DEP_BROKEN' || rr.type === 'MISASSIGNED') fault = { status: 'broken' };
      else if (rr.type === 'UNPLACED_REQUIRED' || rr.type === 'TASK_UNSTAFFED') fault = { status: 'missing' };
    }
    if (fault && anchor.earned === anchor.maxPts) {
      anchor.earned = 0; anchor.status = fault.status; anchor.reasonKey = 'scr_safety_gap';
    }
  }

  // THE GENERIC DERIVER (§3) — mints every non-frame atom for one segment from the template's
  // required tasks + the §3.4 flags. ds/rd are computed ONCE here and threaded into the earn
  // functions (perf/correctness fix, §9 SP2). Atom order: sockets, then per-task safety/quality/
  // money, then role-lanes (first-appearance role order), then fishday computed gates, then decoys.
  function deriveSegAtoms(plan, tmpl, tmplDur, seg, bucket) {
    var out = [], i;
    var reqTasks = tasksForSeg(tmpl, seg).filter(function (t) { return t.required !== false; });
    var cardOwner = {}; for (i = 0; i < tmpl.infoCards.length; i++) cardOwner[tmpl.infoCards[i].id] = tmpl.infoCards[i].ownerRoleId;
    var ds = daySchedule(plan, seg), rd = dayReadiness(plan, seg);
    var liveTasks = tasksForSeg(plan, seg), livePlaced = {};
    for (i = 0; i < liveTasks.length; i++) if (isPlaced(liveTasks[i])) livePlaced[liveTasks[i].id] = 1;

    // 1. sockets (Info) — keyed (consumerRole|card), self-owned excluded, collapsed consumers.
    var pairs = tripSocketPairs(reqTasks, cardOwner);
    for (i = 0; i < pairs.length; i++) {
      var p = pairs[i], tids = tripPairTaskIds(reqTasks, p.roleId, p.cardId);
      var riskable = tripPairRiskable(reqTasks, p.roleId, p.cardId);
      out.push(tripSocketAtom(bucket + '_info_' + p.roleId + '_' + p.cardId, bucket, plan, ds, tids, p.roleId, p.cardId, riskable, livePlaced));
    }

    // 2/3. classify required tasks: safetyGate REPLACES lane membership; qualityCheck/moneyCheck
    //      are ADDITIVE (task also stays in its lane). Collect lane tasks per role, in the order
    //      the roles first appear (deterministic — sums are order-independent).
    var laneOrder = [], laneTasks = {};
    for (i = 0; i < reqTasks.length; i++) {
      var t = reqTasks[i];
      if (t.safetyGate) { out.push(tripSafetyGateAtom(bucket, plan, seg, t, tmplDur, ds)); }
      // Voyage §3.3 amendments: flex standbys and per-guest care tasks are exempt from exec-lane
      // pricing (care tasks are priced by the per-guest care atoms below; flex is deliberately free)
      else if (!t.flex && !t.careGuestId) {
        if (!laneTasks[t.ownerRoleId]) { laneTasks[t.ownerRoleId] = []; laneOrder.push(t.ownerRoleId); }
        laneTasks[t.ownerRoleId].push(t.id);
      }
      if (t.qualityCheck) out.push(tripQualityAtom(bucket + '_quality_' + t.id, bucket, plan, seg, t.id, tmplDur, ds));
      if (t.moneyCheck) out.push(tripMoneyCheckAtom(bucket, plan, seg, t, tmplDur, ds, rd));
    }

    // 4. role-lanes (Exec).
    for (i = 0; i < laneOrder.length; i++) {
      var rid = laneOrder[i];
      out.push(tripLaneAtom(bucket + '_exec_' + rid, bucket, plan, seg, rid, laneTasks[rid], tmplDur, ds, rd));
    }

    // 5. fishday computed quality gates (cookblock/allergy) — no owning single task.
    if (seg === 'fishday') out = out.concat(tripFishdayQualityGates(plan, tmplDur, ds));

    // 5b. voyage computed atoms (Voyage §3/§4): one 1-pt CARE atom per outbound care guest — earned iff all
    // of that guest's care tasks (starlink + lunch/dinner/next-morning breakfast escorts) are staffed at template floor
    // (the worst task decides, like a collapsed socket). A DOUBLE-BOOKED buddy is deliberately NOT
    // billed here — spec §3 maps it to "overload/idle", i.e. the generic per-person overlap
    // machinery (overbookMin / OVERLOAD readiness / efficiency), never a second Score row. The id
    // is task-homed on the guest's starlink task (the constitution's convention for derivable ids);
    // itemRef carries the guest + all four task ids for the ledger.
    if (seg === 'voyage') {
      var careBy = {}, careOrder = [], liveById = {};
      for (i = 0; i < liveTasks.length; i++) liveById[liveTasks[i].id] = liveTasks[i];
      for (i = 0; i < reqTasks.length; i++) {
        var cT = reqTasks[i];
        if (!cT.careGuestId) continue;
        if (!careBy[cT.careGuestId]) { careBy[cT.careGuestId] = []; careOrder.push(cT.careGuestId); }
        careBy[cT.careGuestId].push(cT.id);
      }
      for (i = 0; i < careOrder.length; i++) {
        var gid = careOrder[i], cTids = careBy[gid], cOk = true, cSt = 'ok', cj;
        var cBuddy = plan.buddies && plan.buddies[gid];
        if (!cBuddy || !isOrganizerParticipant(plan, cBuddy)) { cOk = false; cSt = 'missing'; }
        for (cj = 0; cj < cTids.length && cOk; cj++) {
          var cLive = liveById[cTids[cj]], cFloor = tmplDur[cTids[cj]];
          if (!cLive || !isPlaced(cLive)) { cOk = false; cSt = 'missing'; }
          else if (cLive.assignedIds.length !== 1 || cLive.assignedIds[0] !== cBuddy) { cOk = false; cSt = 'broken'; }
          else if (typeof cFloor === 'number' && cLive.durMin < cFloor) { cOk = false; cSt = 'compressed'; }
        }
        // A continuous care assignment cannot be mastered by double-booking its buddy.
        // This used to survive at 100 with only the clean gate withheld. The already-
        // existing per-guest CARE atom now reads dayReadiness's exact overlap evidence.
        if (cOk) for (cj = 0; cj < rd.length; cj++) {
          var cRd = rd[cj];
          if (cRd.type === 'OVERLOAD' && (cTids.indexOf(cRd.taskId) >= 0 || cTids.indexOf(cRd.otherId) >= 0)) {
            cOk = false; cSt = 'overlap'; break;
          }
        }
        out.push({ id: 'voyage_quality_t_v_star_' + gid, bucket: 'voyage', dimension: 'quality',
          itemRef: { type: 'gate', guestId: gid, taskId: cTids }, maxPts: 1, earned: cOk ? 1 : 0,
          status: cSt, reasonKey: cOk ? 'scr_qual_ok' : 'scr_qual_fail', reasonParams: {} });
      }
      var cardLine = byId(plan.budget.lines, 'bl_card');
      out.push(tripGateAtom('voyage_money_bl_card', 'voyage', 'money', 1,   // Voyage §4.1: 2->1
        !!(cardLine && cardLine.approverRoleId && cardLine.payMethod),
        { type: 'gate', lineId: 'bl_card' }, 'scr_money_ok', 'scr_money_gap'));
    }

    // 6. decoy debits — from the template deck (fishday has none).
    var decoyIds = (tmpl.days && tmpl.days[seg]) ? (tmpl.days[seg].decoys || []) : [];
    for (i = 0; i < decoyIds.length; i++) {
      var dtmpl = byId(tasksForSeg(tmpl, seg), decoyIds[i]);
      out.push(tripDecoyAtom(bucket + '_decoy_' + decoyIds[i], bucket, plan, seg, decoyIds[i], !!(dtmpl && dtmpl.safetyFlag)));
    }
    tripApplyFlexCoverage(out, plan, seg, reqTasks, tmplDur, ds, rd);
    return out;
  }

  function deriveTripAtoms(plan) {
    var tmpl = makeTemplate(), tmplDur = tripTemplateDurMap();
    return [].concat(
      tripFrameAtoms(plan),
      deriveSegAtoms(plan, tmpl, tmplDur, 'load', 'load'),
      deriveSegAtoms(plan, tmpl, tmplDur, 'voyage', 'voyage'),
      deriveSegAtoms(plan, tmpl, tmplDur, 'arrival', 'arrival'),
      deriveSegAtoms(plan, tmpl, tmplDur, 'ops', 'ops'),
      deriveSegAtoms(plan, tmpl, tmplDur, 'fishday', 'fishday'),
      deriveSegAtoms(plan, tmpl, tmplDur, 'return', 'return')
    );
  }

  function scoreTrip(plan) {
    var atoms = deriveTripAtoms(plan);
    var BUCKETS = ['frame', 'load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];
    var DIMS = ['info', 'exec', 'safety', 'quality', 'money', 'people'];
    var byBucket = {}, byDimension = {}, i;
    for (i = 0; i < BUCKETS.length; i++) byBucket[BUCKETS[i]] = { maxPts: 0, earned: 0 };
    for (i = 0; i < DIMS.length; i++) byDimension[DIMS[i]] = { maxPts: 0, earned: 0 };
    var rawTotal = 0;
    for (i = 0; i < atoms.length; i++) {
      var a = atoms[i];
      byBucket[a.bucket].maxPts += a.maxPts; byBucket[a.bucket].earned += a.earned;
      byDimension[a.dimension].maxPts += a.maxPts; byDimension[a.dimension].earned += a.earned;
      rawTotal += a.earned;
    }
    var total = Math.max(0, Math.min(100, Math.round(rawTotal)));
    // clean = every atom at max AND no known modeled gap. Classic detectors and the
    // item-level custody chains include gaps that do not each own a separately weighted atom;
    // either still withholds the A under the "zero known gaps" rule.
    var custodyClean = manifestChainGaps(plan).length === 0 && manifestTransferGaps(plan).length === 0 &&
      manifestReturnGaps(plan).length === 0;
    var readinessClean = AUTHORABLE.every(function (seg) { return dayReadiness(plan, seg).length === 0; });
    var clean = atoms.every(function (a) { return a.maxPts > 0 ? a.earned === a.maxPts : a.earned === 0; }) &&
      detect(plan).length === 0 && custodyClean && readinessClean;
    var withheldA = total >= GRADE_BANDS.A && !clean;
    var grade = (total >= GRADE_BANDS.A && clean) ? 'A' : (total >= GRADE_BANDS.B ? 'B' : (total >= GRADE_BANDS.C ? 'C' : 'D'));
    return { total: total, grade: grade, gate: { clean: clean, withheldA: withheldA },
      atoms: atoms, byBucket: byBucket, byDimension: byDimension };
  }

  // planClusters(plan) — the cluster-first, causal projection of scoreTrip.
  //
  // This is deliberately a LENS over the existing score/readiness engines. It never
  // mints points, re-runs a different rubric, or mutates the authored plan. The seven
  // returned clusters are in frozen trip order, and their earned/maxPts values are the
  // exact scoreTrip.byBucket values. Within a cluster, every failed score atom is placed
  // in exactly one stable rootIssue; detailed day-readiness hints and the classic
  // clean-gate detectors are also partitioned once so a UI can open one causal group
  // instead of rendering dozens of flat warnings.
  //
  // A downstream Fishing-Day `late` atom is folded into an information root only when
  // daySchedule's own wait/dependency graph traces it to exactly ONE failed socket. If
  // two plausible upstream sockets contribute, the symptom keeps its own task root —
  // this is the important "never invent causality" boundary.
  var PLAN_CLUSTER_IDS = ['frame', 'load', 'voyage', 'arrival', 'ops', 'fishday', 'return'];

  function pcList(v) { return v == null ? [] : (Array.isArray(v) ? v.slice() : [v]); }
  function pcAdd(a, v) { if (v != null && a.indexOf(v) < 0) a.push(v); }
  function pcAddAll(a, values) { values = pcList(values); for (var i = 0; i < values.length; i++) pcAdd(a, values[i]); }
  function pcTask(plan, bucket, id) {
    var t = bucket !== 'frame' ? byId(tasksForSeg(plan, bucket), id) : null;
    return t || byId(plan.tasks || [], id);
  }
  function pcTaskIds(ref) { return ref ? pcList(ref.taskId) : []; }
  function pcAtomLost(a) { return a.maxPts - a.earned; }
  function pcAtomHasTask(a, id) { return pcTaskIds(a.itemRef).indexOf(id) >= 0; }
  function pcReadinessKey(r) {
    // Fixed field order (rather than JSON object insertion order) makes unknown/future
    // readiness records deterministic too; unrecognised fields never crash grouping.
    var f = ['type', 'taskId', 'otherId', 'depId', 'cardId', 'roleId', 'itemId', 'guestId',
      'personId', 'handoffId', 'stage', 'lateMin'], out = [];
    for (var i = 0; i < f.length; i++) if (r[f[i]] != null) out.push(f[i] + '=' + String(r[f[i]]));
    return out.join('|');
  }
  function pcReadinessConsequence(type) {
    // Keys already present in i18n.js; no English consequence copy lives in the engine.
    var keys = {
      MISSING_ARROW: 'rhMissing', ARROW_LATE: 'rhLate', WRONG_FISH_RISK: 'rhWrongFish',
      DEP_BROKEN: 'rhDep', OVERLOAD: 'rhOverload', TASK_UNSTAFFED: 'rhUnstaffed',
      DUTY_UNASSIGNED: 'rhDuty', UNPLACED_REQUIRED: 'rhUnplaced', DECOY_PLACED: 'rhDecoy',
      MISASSIGNED: 'rhMisassigned', CARRY_GAP: 'rhCarryGap'
    };
    return keys[type] || 'scr_exec_broken';
  }
  function pcStatusForReadiness(type) {
    if (type === 'DECOY_PLACED') return 'decoy';
    if (type === 'ARROW_LATE') return 'late';
    if (type === 'DEP_BROKEN' || type === 'MISASSIGNED') return 'broken';
    if (type === 'OVERLOAD') return 'overlap';
    if (type === 'WRONG_FISH_RISK') return 'missing';
    if (type === 'MISSING_ARROW' || type === 'TASK_UNSTAFFED' || type === 'DUTY_UNASSIGNED' ||
        type === 'UNPLACED_REQUIRED' || type === 'CARRY_GAP') return 'missing';
    return 'attention';
  }
  function pcStatusRank(status) {
    var rank = { decoy: 90, missing: 80, broken: 70, overlap: 65, compressed: 60,
      'present-but-late': 55, late: 50, attention: 10, ok: 0 };
    return rank[status] == null ? 10 : rank[status];
  }
  function pcDesc(key, kind, fields) {
    var d = { key: key, kind: kind };
    fields = fields || {};
    for (var k in fields) d[k] = fields[k];
    return d;
  }
  function pcInfoDesc(plan, bucket, atom) {
    var ref = atom.itemRef || {}, tids = pcTaskIds(ref), unplaced = [];
    for (var i = 0; i < tids.length; i++) {
      var t = pcTask(plan, bucket, tids[i]);
      if (!t || !isPlaced(t)) unplaced.push(tids[i]);
    }
    // An absent consumer is a task-placement root, not an invented missing-arrow root.
    if (unplaced.length) return pcDesc('task|' + unplaced[0], 'task', {
      primaryTaskId: unplaced[0], taskIds: tids, cardIds: pcList(ref.cardId), roleIds: pcList(ref.roleId)
    });
    return pcDesc('info|' + (ref.roleId || 'unknown') + '|' + (ref.cardId || 'unknown'), 'handoff', {
      primaryTaskId: tids[0] || null, primaryCardId: ref.cardId || null, primaryRoleId: ref.roleId || null,
      taskIds: tids, cardIds: pcList(ref.cardId), roleIds: pcList(ref.roleId)
    });
  }
  function pcCustodyContext(plan, bucket, itemIds) {
    var flag = bucket === 'load' ? 'custody' : (bucket === 'arrival' ? 'transferCustody' :
      (bucket === 'return' ? 'returnCustody' : null));
    var tasks = flag ? tasksForSeg(plan, bucket).filter(function (t) { return !!t[flag]; }) : [];
    var ids = [], primary = null, i, j, t;
    itemIds = pcList(itemIds);
    for (i = 0; i < tasks.length; i++) {
      t = tasks[i]; pcAdd(ids, t.id);
      for (j = 0; j < itemIds.length; j++) {
        if (!isPlaced(t) || (t.carries || []).indexOf(itemIds[j]) < 0) { if (!primary) primary = t.id; break; }
      }
    }
    return { taskIds: ids, primaryTaskId: primary || ids[0] || null };
  }
  function pcTaskAtomDesc(plan, bucket, atom, rd, tmplDur) {
    var ref = atom.itemRef || {}, tids = pcTaskIds(ref), bad = [], i, r, t;
    if (atom.status === 'missing') {
      for (i = 0; i < tids.length; i++) { t = pcTask(plan, bucket, tids[i]); if (!t || !isPlaced(t)) bad.push(tids[i]); }
    } else if (atom.status === 'compressed') {
      for (i = 0; i < tids.length; i++) { t = pcTask(plan, bucket, tids[i]); if (t && typeof tmplDur[t.id] === 'number' && t.durMin < tmplDur[t.id]) bad.push(t.id); }
    } else if (atom.status === 'broken' || atom.status === 'overlap') {
      for (i = 0; i < rd.length; i++) {
        r = rd[i];
        if ((atom.status === 'overlap' && r.type !== 'OVERLOAD') ||
            (atom.status === 'broken' && r.type !== 'DEP_BROKEN' && r.type !== 'MISASSIGNED')) continue;
        if (tids.indexOf(r.taskId) >= 0) pcAdd(bad, r.taskId);
        if (tids.indexOf(r.otherId) >= 0) pcAdd(bad, r.otherId);
        if (bucket === 'return' && r.type === 'DEP_BROKEN' && r.taskId === 'hd_r_headcount' &&
            r.depId === 'hd_r_ship' && tids.indexOf(r.depId) >= 0) pcAdd(bad, r.depId);
      }
    }
    var primary = bad[0] || (tids.length === 1 ? tids[0] : null);
    var key = primary ? 'task|' + primary : 'lane|' + atom.id;
    return pcDesc(key, 'task', { primaryTaskId: primary || tids[0] || null,
      taskIds: tids, roleIds: pcList(ref.roleId) });
  }
  function pcAtomDesc(plan, bucket, atom, rd, tmplDur) {
    var ref = atom.itemRef || {}, tids = pcTaskIds(ref), gaps;
    if (ref.type === 'socket') return pcInfoDesc(plan, bucket, atom);
    if (ref.type === 'decoy') return pcDesc('decoy|' + (tids[0] || atom.id), 'task', {
      primaryTaskId: tids[0] || null, taskIds: tids
    });
    if (ref.guestId) return pcDesc('guest|' + ref.guestId, 'guest', {
      primaryGuestId: ref.guestId, guestIds: [ref.guestId], taskIds: tids
    });
    if (ref.lineId) return pcDesc('budget|' + ref.lineId, 'budget', {
      primaryLineId: ref.lineId, lineIds: [ref.lineId]
    });
    if (ref.detectorId) return pcDesc('detector|' + ref.detectorId, 'detector', {
      primaryDetectorId: ref.detectorId
    });
    if (ref.cardId && !tids.length) return pcDesc('card|' + ref.cardId, 'card', {
      primaryCardId: ref.cardId, cardIds: [ref.cardId]
    });
    // Existing-atom bindings for formerly unpriced clean gates keep the causal
    // editor target on the actual detector/item, rather than on an innocent lane task.
    if (atom.id === 'return_exec_logi') {
      var legacyShip = byId(plan.tasks || [], 't_ship');
      if (!legacyShip || !legacyShip.assignedIds || legacyShip.assignedIds.length === 0) {
        return pcDesc('detector|returnLogi', 'detector', {
          primaryDetectorId: 'returnLogi', primaryRoleId: 'logi', roleIds: ['logi'], taskIds: tids.concat(['t_ship'])
        });
      }
    }
    if (atom.id === 'arrival_exec_logi' && manifestTransferGaps(plan).length) {
      gaps = manifestTransferGaps(plan);
      var arrivalCustody = pcCustodyContext(plan, 'arrival', gaps);
      return pcDesc(gaps.length === 1 ? 'item|arrival|' + gaps[0] : 'custody|arrival', 'manifest', {
        primaryItemId: gaps[0], itemIds: gaps, primaryTaskId: arrivalCustody.primaryTaskId,
        taskIds: tids.concat(arrivalCustody.taskIds)
      });
    }
    if (atom.id === 'return_exec_siteLead' && manifestReturnGaps(plan).length) {
      gaps = manifestReturnGaps(plan);
      var returnCustody = pcCustodyContext(plan, 'return', gaps);
      return pcDesc(gaps.length === 1 ? 'item|return|' + gaps[0] : 'custody|return', 'manifest', {
        primaryItemId: gaps[0], itemIds: gaps, primaryTaskId: returnCustody.primaryTaskId,
        taskIds: tids.concat(returnCustody.taskIds)
      });
    }
    // The load hold gate is explicitly a custody-chain check. Attribute it to the
    // exact missing manifest item(s), never merely to the visible checking task.
    if (atom.id === 'load_safety_hd_l_hold') {
      gaps = manifestChainGaps(plan);
      if (gaps.length) {
        var loadCustody = pcCustodyContext(plan, 'load', gaps);
        return pcDesc(gaps.length === 1 ? 'item|load|' + gaps[0] : 'custody|load', 'manifest', {
          primaryItemId: gaps[0], itemIds: gaps, primaryTaskId: loadCustody.primaryTaskId,
          taskIds: tids.concat(loadCustody.taskIds)
        });
      }
    }
    // The cash-box money check reads a concrete carried item; its root can be exact.
    if (atom.id === 'load_money_hd_l_pack' && manifestChainGaps(plan).indexOf('mi_cashbox') >= 0) {
      var cashCustody = pcCustodyContext(plan, 'load', ['mi_cashbox']);
      return pcDesc('item|load|mi_cashbox', 'manifest', {
        primaryItemId: 'mi_cashbox', itemIds: ['mi_cashbox'], primaryTaskId: 'hd_l_pack',
        taskIds: tids.concat(cashCustody.taskIds)
      });
    }
    if (tids.length || ref.type === 'lane' || (ref.type === 'gate' && ref.taskId)) {
      return pcTaskAtomDesc(plan, bucket, atom, rd, tmplDur);
    }
    return pcDesc('atom|' + atom.id, 'task', { primaryTaskId: tids[0] || null, taskIds: tids });
  }
  function pcSocketHome(failed, homes, taskId, cardId) {
    for (var i = 0; i < failed.length; i++) {
      var a = failed[i], ref = a.itemRef || {};
      if (ref.type === 'socket' && ref.cardId === cardId && pcAtomHasTask(a, taskId)) return homes[a.id] || null;
    }
    return null;
  }
  function pcCascadeTrace(plan, bucket, ds, failed, homes, startTaskIds) {
    var sources = {}, visited = {}, self = {};
    function addDirect(taskId, cardId) {
      var h = pcSocketHome(failed, homes, taskId, cardId);
      if (h && h.kind === 'handoff') { sources[h.key] = h; return true; }
      return false;
    }
    // A socket can be sound at PLAN time yet arrive late dynamically because its
    // producing task was delayed upstream. Follow only the engine's drawn,
    // feasible onTaskDone arrows whose solved arrival is actually after the
    // consumer's effective start; this proves produced-card ancestry without
    // guessing from names or chronology.
    function walkDynamicProducer(taskId, cardId, consumerStart) {
      var task = pcTask(plan, bucket, taskId), hs = handoffsForSeg(plan, bucket), best = null, producers = [], i;
      for (i = 0; i < hs.length; i++) {
        var h = hs[i];
        if (h.cardId !== cardId || h.toTaskId !== taskId) continue;
        if (task && h.toRoleId !== task.ownerRoleId) continue;
        if (!channelFeasibility(plan, h, bucket).ok || !h.trigger || h.trigger.type !== 'onTaskDone') continue;
        var producerId = h.trigger.taskId || h.fromTaskId, pe = ds.byTask[producerId];
        if (!pe || pe.unresolved) continue;
        var arrival = pe.end + (CHANNELS[h.channel] || 0);
        if (best == null || arrival < best) { best = arrival; producers = [producerId]; }
        else if (arrival === best) pcAdd(producers, producerId);
      }
      if (best != null && best > consumerStart) for (i = 0; i < producers.length; i++) walk(producers[i]);
    }
    function walk(taskId) {
      if (!taskId || visited[taskId]) return;
      visited[taskId] = 1;
      var i, x, e = ds.byTask[taskId], task = pcTask(plan, bucket, taskId);
      for (i = 0; i < ds.missing.length; i++) { x = ds.missing[i]; if (x.taskId === taskId) addDirect(taskId, x.cardId); }
      for (i = 0; i < ds.late.length; i++) { x = ds.late[i]; if (x.taskId === taskId) addDirect(taskId, x.cardId); }
      if (!e) return;
      for (i = 0; i < (e.waits || []).length; i++) {
        x = e.waits[i];
        if (x.cardId && !addDirect(taskId, x.cardId)) walkDynamicProducer(taskId, x.cardId, e.start);
        if (x.depId) walk(x.depId);
        // A resource wait is intentionally NOT converted into a same-cluster info
        // root. Its custody cause lives in another bucket and is not interchangeable.
      }
      if (e.wrongFish && task) for (i = 0; i < (task.assumeOn || []).length; i++) {
        var cid = task.assumeOn[i], direct = false, z;
        for (z = 0; z < ds.missing.length; z++) if (ds.missing[z].taskId === taskId && ds.missing[z].cardId === cid) direct = true;
        for (z = 0; z < ds.late.length; z++) if (ds.late[z].taskId === taskId && ds.late[z].cardId === cid) direct = true;
        if (!direct) walkDynamicProducer(taskId, cid, e.start);
      }
      // Some downstream work (notably t_f_cook) carries a rework extension when
      // ANY wrong-fish assumption occurred upstream; the extended task itself is
      // intentionally not marked wrongFish. The schedule exposes both facts, so
      // follow the exact wrongFish task set and let the unique-source rule decide.
      if (e.extension > 0) for (i = 0; i < (ds.wrongFish || []).length; i++) walk(ds.wrongFish[i]);
    }
    for (var i = 0; i < startTaskIds.length; i++) walk(startTaskIds[i]);
    for (var k in sources) self[k] = sources[k];
    return { sources: self, taskIds: Object.keys(visited).sort() };
  }
  function pcRootForReadiness(plan, bucket, r, failed, homes) {
    var i, a, ref, t, roleId, exact;
    if (r.type === 'MISSING_ARROW' || r.type === 'ARROW_LATE' || r.type === 'WRONG_FISH_RISK') {
      exact = pcSocketHome(failed, homes, r.taskId, r.cardId);
      if (exact) return exact;
      t = pcTask(plan, bucket, r.taskId); roleId = t ? t.ownerRoleId : null;
      return pcDesc('info|' + (roleId || 'unknown') + '|' + (r.cardId || 'unknown'), 'handoff', {
        primaryTaskId: r.taskId || null, primaryCardId: r.cardId || null, primaryRoleId: roleId,
        taskIds: pcList(r.taskId), cardIds: pcList(r.cardId), roleIds: pcList(roleId)
      });
    }
    if (r.type === 'CARRY_GAP') {
      // A gate/lane may collapse several missing custody items into one point. Reuse
      // that atom's aggregate manifest root when present so the readiness rows do not
      // split away into misleading zero-point siblings.
      for (i = 0; i < failed.length; i++) {
        var carryHome = homes[failed[i].id];
        if (carryHome && carryHome.kind === 'manifest' && pcList(carryHome.itemIds).indexOf(r.itemId) >= 0) return carryHome;
      }
      return pcDesc('item|' + bucket + '|' + r.itemId, 'manifest', {
        primaryItemId: r.itemId, itemIds: pcList(r.itemId)
      });
    }
    if (r.type === 'DUTY_UNASSIGNED') return pcDesc('role|' + r.roleId, 'role', {
      primaryRoleId: r.roleId, roleIds: pcList(r.roleId)
    });
    // Prefer an already-failed atom whose status is the precise readiness cause.
    var wanted = { UNPLACED_REQUIRED: 'missing', TASK_UNSTAFFED: 'missing', MISASSIGNED: 'broken',
      DEP_BROKEN: 'broken', OVERLOAD: 'overlap', DECOY_PLACED: 'decoy' }[r.type];
    for (i = 0; i < failed.length; i++) {
      a = failed[i]; ref = a.itemRef || {};
      if (wanted && a.status !== wanted) continue;
      if (r.type === 'DECOY_PLACED' && ref.type !== 'decoy') continue;
      if (pcAtomHasTask(a, r.taskId) || pcAtomHasTask(a, r.otherId) ||
          (bucket === 'return' && r.type === 'DEP_BROKEN' && r.taskId === 'hd_r_headcount' &&
           r.depId === 'hd_r_ship' && pcAtomHasTask(a, r.depId))) return homes[a.id];
    }
    var primary = r.taskId || r.otherId || r.depId || null;
    return pcDesc('readiness|' + pcReadinessKey(r), primary ? 'task' : 'role', {
      primaryTaskId: primary, taskIds: [r.taskId, r.otherId, r.depId].filter(function (x) { return x != null; }),
      primaryRoleId: r.roleId || null, roleIds: pcList(r.roleId)
    });
  }
  function pcMakeRoot(bucket, desc, order) {
    return { id: bucket + ':' + desc.key, bucket: bucket, kind: desc.kind, status: 'attention',
      consequenceKey: null, earned: 0, maxPts: 0, lostPoints: 0,
      atomIds: [], reasonKeys: [], readiness: [], detectorIds: [],
      taskIds: pcList(desc.taskIds), cardIds: pcList(desc.cardIds), roleIds: pcList(desc.roleIds),
      itemIds: pcList(desc.itemIds), guestIds: pcList(desc.guestIds), handoffIds: [], lineIds: pcList(desc.lineIds),
      editorTarget: null, _key: desc.key, _order: order, _statuses: [],
      _primaryTaskId: desc.primaryTaskId || null, _primaryCardId: desc.primaryCardId || null,
      _primaryRoleId: desc.primaryRoleId || null, _primaryItemId: desc.primaryItemId || null,
      _primaryGuestId: desc.primaryGuestId || null, _primaryDetectorId: desc.primaryDetectorId || null,
      _primaryLineId: desc.primaryLineId || null };
  }
  function pcMergeDesc(root, desc) {
    pcAddAll(root.taskIds, desc.taskIds); pcAddAll(root.cardIds, desc.cardIds);
    pcAddAll(root.roleIds, desc.roleIds); pcAddAll(root.itemIds, desc.itemIds);
    pcAddAll(root.guestIds, desc.guestIds); pcAddAll(root.lineIds, desc.lineIds);
    if (!root._primaryTaskId) root._primaryTaskId = desc.primaryTaskId || null;
    if (!root._primaryCardId) root._primaryCardId = desc.primaryCardId || null;
    if (!root._primaryRoleId) root._primaryRoleId = desc.primaryRoleId || null;
    if (!root._primaryItemId) root._primaryItemId = desc.primaryItemId || null;
    if (!root._primaryGuestId) root._primaryGuestId = desc.primaryGuestId || null;
    if (!root._primaryDetectorId) root._primaryDetectorId = desc.primaryDetectorId || null;
    if (!root._primaryLineId) root._primaryLineId = desc.primaryLineId || null;
  }
  function pcEnsureRoot(ctx, desc, order) {
    var root = ctx.roots[desc.key];
    if (!root) { root = pcMakeRoot(ctx.id, desc, order); ctx.roots[desc.key] = root; ctx.rootList.push(root); }
    else { pcMergeDesc(root, desc); if (order < root._order) root._order = order; }
    return root;
  }
  function pcAddTaskContext(root, plan, bucket, taskId) {
    if (!taskId) return;
    pcAdd(root.taskIds, taskId);
    var t = pcTask(plan, bucket, taskId);
    if (t) {
      pcAdd(root.roleIds, t.ownerRoleId);
      for (var i = 0; i < (t.neededInfo || []).length; i++) {
        if (root.kind === 'handoff' && root.cardIds.indexOf(t.neededInfo[i]) >= 0) pcAdd(root.cardIds, t.neededInfo[i]);
      }
    }
  }
  function pcAddAtom(root, atom, plan, bucket, cascadeTaskIds) {
    pcAdd(root.atomIds, atom.id); root.maxPts += atom.maxPts; root.earned += atom.earned;
    root.lostPoints += pcAtomLost(atom); pcAdd(root.reasonKeys, atom.reasonKey); pcAdd(root._statuses, atom.status);
    var ref = atom.itemRef || {}, tids = pcTaskIds(ref), i;
    for (i = 0; i < tids.length; i++) pcAddTaskContext(root, plan, bucket, tids[i]);
    for (i = 0; i < (cascadeTaskIds || []).length; i++) pcAddTaskContext(root, plan, bucket, cascadeTaskIds[i]);
    pcAdd(root.cardIds, ref.cardId); pcAddAll(root.cardIds, ref.cardIds); pcAdd(root.roleIds, ref.roleId);
    pcAdd(root.itemIds, ref.itemId); pcAdd(root.guestIds, ref.guestId); pcAdd(root.lineIds, ref.lineId);
    if (ref.cardId) { var card = byId(plan.infoCards || [], ref.cardId); if (card) pcAdd(root.roleIds, card.ownerRoleId); }
  }
  function pcAddReadiness(root, r, plan, bucket) {
    root.readiness.push(clone(r)); pcAdd(root._statuses, pcStatusForReadiness(r.type));
    pcAddTaskContext(root, plan, bucket, r.taskId); pcAddTaskContext(root, plan, bucket, r.otherId);
    pcAddTaskContext(root, plan, bucket, r.depId); pcAdd(root.cardIds, r.cardId);
    pcAdd(root.roleIds, r.roleId); pcAdd(root.itemIds, r.itemId); pcAdd(root.guestIds, r.guestId);
    pcAdd(root.handoffIds, r.handoffId);
    if (r.cardId) { var card = byId(plan.infoCards || [], r.cardId); if (card) pcAdd(root.roleIds, card.ownerRoleId); }
  }
  function pcFindHandoffs(root, plan, bucket) {
    if (root.kind !== 'handoff' || bucket === 'frame') return;
    var hs = handoffsForSeg(plan, bucket), i, h, to;
    for (i = 0; i < hs.length; i++) {
      h = hs[i]; to = pcTask(plan, bucket, h.toTaskId);
      if (root.cardIds.indexOf(h.cardId) < 0) continue;
      if (root.taskIds.length && root.taskIds.indexOf(h.toTaskId) < 0) continue;
      if (root._primaryRoleId && h.toRoleId !== root._primaryRoleId && (!to || to.ownerRoleId !== root._primaryRoleId)) continue;
      pcAdd(root.handoffIds, h.id);
    }
  }
  function pcEditorTarget(root) {
    var segment = root.bucket === 'frame' ? undefined : root.bucket, t;
    if (root.kind === 'handoff') {
      t = { kind: 'handoff', segment: segment, taskId: root._primaryTaskId || root.taskIds[0] || undefined,
        cardId: root._primaryCardId || root.cardIds[0] || undefined,
        handoffId: root.handoffIds[0] || undefined, roleId: root._primaryRoleId || root.roleIds[0] || undefined };
    } else if (root.kind === 'manifest') {
      t = { kind: 'manifest', segment: segment, itemId: root._primaryItemId || root.itemIds[0] || undefined,
        taskId: root._primaryTaskId || root.taskIds[0] || undefined };
    } else if (root.kind === 'guest') {
      t = { kind: 'guest', segment: segment, guestId: root._primaryGuestId || root.guestIds[0] || undefined };
    } else if (root.kind === 'budget') {
      t = { kind: 'budget', segment: segment, detectorId: root._primaryDetectorId || undefined,
        lineId: root._primaryLineId || root.lineIds[0] || undefined };
    } else if (root.kind === 'card') {
      t = { kind: 'card', segment: segment, cardId: root._primaryCardId || root.cardIds[0] || undefined };
    } else if (root.kind === 'role') {
      t = { kind: 'role', segment: segment, roleId: root._primaryRoleId || root.roleIds[0] || undefined };
    } else if (root.kind === 'detector') {
      t = { kind: 'detector', segment: segment, detectorId: root._primaryDetectorId || root.detectorIds[0] || undefined,
        roleId: root._primaryRoleId || root.roleIds[0] || undefined };
    } else {
      t = { kind: 'task', segment: segment, taskId: root._primaryTaskId || root.taskIds[0] || undefined };
    }
    // JSON-safe discriminated unions omit irrelevant optional fields entirely.
    for (var k in t) if (t[k] === undefined) delete t[k];
    return t;
  }
  function pcFinalizeRoot(root, plan) {
    var arrays = ['atomIds', 'reasonKeys', 'detectorIds', 'taskIds', 'cardIds', 'roleIds',
      'itemIds', 'guestIds', 'handoffIds', 'lineIds'];
    for (var i = 0; i < arrays.length; i++) {
      root[arrays[i]].sort();
      root[arrays[i]] = root[arrays[i]].filter(function (v, at, all) { return at === 0 || v !== all[at - 1]; });
    }
    root.readiness.sort(function (a, b) { var aa = pcReadinessKey(a), bb = pcReadinessKey(b); return aa < bb ? -1 : (aa > bb ? 1 : 0); });
    var best = 'attention';
    for (i = 0; i < root._statuses.length; i++) if (pcStatusRank(root._statuses[i]) > pcStatusRank(best)) best = root._statuses[i];
    root.status = best;
    root.consequenceKey = root.reasonKeys[0] || (root.detectorIds.length ? 'p_' + root.detectorIds[0] + '_cause' :
      (root.readiness.length ? pcReadinessConsequence(root.readiness[0].type) : 'scr_exec_broken'));
    pcFindHandoffs(root, plan, root.bucket); root.handoffIds.sort();
    root.editorTarget = pcEditorTarget(root);
    delete root._key; delete root._order; delete root._statuses;
    delete root._primaryTaskId; delete root._primaryCardId; delete root._primaryRoleId;
    delete root._primaryItemId; delete root._primaryGuestId; delete root._primaryDetectorId; delete root._primaryLineId;
    return root;
  }
  function planClusters(plan) {
    plan = plan || makeTemplate();
    var trip = scoreTrip(plan), tmplDur = tripTemplateDurMap(), contexts = {}, atomIndex = {}, i, j;
    for (i = 0; i < trip.atoms.length; i++) atomIndex[trip.atoms[i].id] = i;

    for (i = 0; i < PLAN_CLUSTER_IDS.length; i++) {
      var id = PLAN_CLUSTER_IDS[i], bucketScore = trip.byBucket[id], rd = id === 'frame' ? [] : dayReadiness(plan, id);
      var atoms = trip.atoms.filter(function (a) { return a.bucket === id; });
      var failed = atoms.filter(function (a) { return a.earned < a.maxPts; });
      var ctx = { id: id, score: bucketScore, failed: failed, rd: rd, roots: {}, rootList: [], homes: {}, cascade: {} };
      contexts[id] = ctx;
      for (j = 0; j < failed.length; j++) ctx.homes[failed[j].id] = pcAtomDesc(plan, id, failed[j], rd, tmplDur);

      // The only cross-atom causal fold: a late task/gate proven to have one (and
      // only one) upstream failed socket in the actual solved cascade. Fishing Day
      // also follows delayed produced-card ancestry (menu -> target -> catch); the
      // same exact wait proof folds coarse-day gates such as Load headcount.
      if (id !== 'frame' && failed.length) {
        var fds = daySchedule(plan, id);
        for (j = 0; j < failed.length; j++) {
          var fa = failed[j];
          if (fa.dimension === 'info' || fa.status !== 'late') continue;
          var trace = pcCascadeTrace(plan, id, fds, failed, ctx.homes, pcTaskIds(fa.itemRef));
          var sourceKeys = Object.keys(trace.sources).sort();
          if (sourceKeys.length === 1) { ctx.homes[fa.id] = trace.sources[sourceKeys[0]]; ctx.cascade[fa.id] = trace.taskIds; }
        }
      }

      // Failed atoms first: scoreTrip order is the stable root ordering backbone.
      for (j = 0; j < failed.length; j++) {
        var atom = failed[j], home = ctx.homes[atom.id];
        var root = pcEnsureRoot(ctx, home, atomIndex[atom.id]);
        pcAddAtom(root, atom, plan, id, ctx.cascade[atom.id]);
      }
      // Then partition every detailed readiness hint once. Readiness-only issues carry
      // zero lost points but can still produce mastered-with-warning on legacy clean gates.
      for (j = 0; j < rd.length; j++) {
        var rh = pcRootForReadiness(plan, id, rd[j], failed, ctx.homes);
        var rr = pcEnsureRoot(ctx, rh, trip.atoms.length + j);
        pcAddReadiness(rr, rd[j], plan, id);
      }
    }

    // Classic detectors are clean-gate evidence. Attribute each active detector once:
    // standing authorities -> frame, returnLogi -> return, handoffTiming -> the first
    // concrete Fishing-Day handoff root (or a detector fallback if no detailed root exists).
    var active = detect(plan);
    for (i = 0; i < active.length; i++) {
      var det = active[i], bucket = det.id === 'returnLogi' ? 'return' : (det.id === 'handoffTiming' ? 'fishday' : 'frame');
      var dctx = contexts[bucket], droot = null;
      if (det.id === 'handoffTiming') {
        for (j = 0; j < dctx.rootList.length; j++) if (dctx.rootList[j].kind === 'handoff') { droot = dctx.rootList[j]; break; }
      }
      if (!droot) {
        var ddesc = pcDesc('detector|' + det.id, det.category === 'budget' ? 'budget' : 'detector', {
          primaryDetectorId: det.id, primaryRoleId: det.roleId || null, roleIds: pcList(det.roleId), taskIds: pcList(det.taskIds)
        });
        droot = pcEnsureRoot(dctx, ddesc, trip.atoms.length + 1000 + i);
      }
      pcAdd(droot.detectorIds, det.id);
      // handoffTiming is an aggregate detector over all concrete Fishing-Day
      // sockets. Its broad task list is not evidence that the first socket caused
      // every symptom, so coverage is recorded without polluting affected IDs.
      if (!(det.id === 'handoffTiming' && droot.kind === 'handoff')) {
        pcAdd(droot.roleIds, det.roleId); pcAddAll(droot.taskIds, det.taskIds);
      }
      if (!droot._primaryDetectorId) droot._primaryDetectorId = det.id;
      if (!droot._primaryRoleId) droot._primaryRoleId = det.roleId || null;
    }

    var out = [];
    for (i = 0; i < PLAN_CLUSTER_IDS.length; i++) {
      var cid = PLAN_CLUSTER_IDS[i], c = contexts[cid];
      c.rootList.sort(function (a, b) { return a._order - b._order || (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)); });
      var issues = c.rootList.map(function (root) { return pcFinalizeRoot(root, plan); });
      var earned = c.score.earned, maxPts = c.score.maxPts, mastered = earned === maxPts;
      out.push({ id: cid, earned: earned, maxPts: maxPts, lostPoints: maxPts - earned,
        mastered: mastered, status: mastered ? (issues.length ? 'mastered-with-warning' : 'mastered') :
          (earned > 0 ? 'in-progress' : 'needs-work'), rootIssues: issues });
    }
    return out;
  }

  // minute-weighted Sigma productive / Sigma available across the six modeled days;
  // unplaced tasks contribute neither avail nor idle (daySchedule already excludes them).
  function tripEfficiency(plan) {
    var segs = ['load', 'voyage', 'arrival', 'ops', 'fishday', 'return'], avail = 0, cost = 0;
    for (var i = 0; i < segs.length; i++) {
      var ds = daySchedule(plan, segs[i]);
      avail += ds.availMin; cost += ds.idleTotal + ds.reworkTotal + ds.overbookMin;
    }
    return avail > 0 ? Math.round(100 * avail / (avail + cost)) : 100;
  }

  // Critical external facts are deliberately OUTSIDE scoreTrip: the rehearsal can
  // be internally perfect while published/operator facts are still unconfirmed.
  // This prevents a 100-point plan from being mislabeled ready for real execution.
  function criticalAssumptions(plan) {
    plan = plan || makeTemplate();
    var legs = plan.itinerary || ITINERARY, vessels = plan.vessels || VESSELS;
    var breakfast = byId(legs, 'out-breakfast');
    var longHaul = byId(legs, 'out-ogasawara-maru');
    var inter = byId(legs, 'out-interisland');
    var interVessel = byId(vessels, 'interisland-vessel');
    var exchange = plan.project && plan.project.guestRotationExchange;
    var returnLegs = legs.filter(function (x) { return x.direction === 'return'; });
    var returnConfirmed = !!(plan.project && plan.project.route && plan.project.route.returnConfirmed) && returnLegs.length > 0 &&
      returnLegs.every(function (x) {
        return x.confirmed === true && ((typeof x.departMin === 'number' && isFinite(x.departMin)) ||
          (typeof x.arriveMin === 'number' && isFinite(x.arriveMin)));
      });
    function assumption(id, en, jp, resolved, routeLegIds, fields) {
      return { id: id, label: L(en, jp), status: resolved ? 'resolved' : 'unresolved', critical: true,
        routeLegIds: routeLegIds, fields: fields };
    }
    return [
      assumption('hotel-breakfast-time', 'Confirm the Tokyo hotel breakfast time', '東京ホテルの朝食時刻を確認',
        !!breakfast && typeof breakfast.departMin === 'number' && isFinite(breakfast.departMin),
        ['out-breakfast'], ['out-breakfast.departMin']),
      assumption('interisland-vessel-name', 'Confirm the inter-island vessel name', '島間船の船名を確認',
        !!interVessel && interVessel.knownName === true,
        ['out-interisland'], ['interisland-vessel.knownName']),
      assumption('chichijima-connection-time', 'Confirm the Chichijima connection timetable', '父島での乗継時刻を確認',
        !!longHaul && typeof longHaul.arriveMin === 'number' && isFinite(longHaul.arriveMin) &&
          !!inter && typeof inter.departMin === 'number' && isFinite(inter.departMin),
        ['out-ogasawara-maru', 'out-chichijima-transfer', 'out-interisland'],
        ['out-ogasawara-maru.arriveMin', 'out-interisland.departMin']),
      assumption('day-6-guest-exchange',
        'Obtain owner attestation for the Day-6 guest exchange route, timing, and luggage handoff',
        '6日目のゲスト交代ルート・時刻・荷物引継ぎについて主催者確認を得る',
        !!exchange && exchange.day === 6 && exchange.logisticsAttested === true,
        [], ['project.guestRotationExchange.logisticsAttested']),
      assumption('return-timetable', 'Confirm the complete return timetable', '帰路全体の時刻表を確認',
        returnConfirmed,
        returnLegs.map(function (x) { return x.id; }), ['project.route.returnConfirmed', 'return.*.departMin|arriveMin'])
    ];
  }
  function executionReadiness(plan) {
    plan = plan || makeTemplate();
    var assumptions = criticalAssumptions(plan);
    var unresolved = assumptions.filter(function (x) { return x.status === 'unresolved'; });
    var trip = scoreTrip(plan), rehearsalComplete = trip.total === 100 && trip.gate.clean === true;
    var realExecutionReady = rehearsalComplete && unresolved.length === 0;
    return { status: realExecutionReady ? 'real-execution-ready' : (rehearsalComplete ? 'rehearsal-complete' : 'rehearsal-incomplete'),
      rehearsalComplete: rehearsalComplete, realExecutionReady: realExecutionReady,
      assumptions: assumptions, unresolved: unresolved, unresolvedCount: unresolved.length };
  }

  var api = {
    DT: DT, DAYS: DAYS, HEADCOUNT: HEADCOUNT, STATIONS: STATIONS, ROLES: ROLES, COMPANIES: COMPANIES,
    CAT_MAX: CAT_MAX, GRADE_BANDS: GRADE_BANDS, DETECTORS: DETECTORS,
    SEGMENTS: SEGMENTS, segIndex: segIndex, gapsForSegment: gapsForSegment, daySummary: daySummary,
    mulberry32: mulberry32, makeTemplate: makeTemplate, mergePlan: mergePlan, detect: detect,
    applyFix: applyFix, applyAllFixes: applyAllFixes, createSim: createSim, tick: tick, score: score,
    role: role, station: station, chars: chars,
    // fishday temporal layer (§6/§8)
    CHEFS: CHEFS, GUESTS: GUESTS, MIN_DT: MIN_DT, DAY_START_MIN: DAY_START_MIN, DAY_END_MIN: DAY_END_MIN,
    CHANNELS: CHANNELS, CHECKPOINTS: CHECKPOINTS,
    SCENARIO_MODIFIERS: clone(SCENARIO_MODIFIERS), SCENARIO_STRATEGIES: clone(SCENARIO_STRATEGIES),
    SCENARIOS: clone(SCENARIOS), composeScenario: composeScenario, scenarioProfile: scenarioProfile,
    scenarioStrategy: scenarioStrategy, applyScenario: applyScenario, evaluateScenario: evaluateScenario,
    channelFeasibility: channelFeasibility,
    RUN_STATE_VERSION: RUN_STATE_VERSION, RUN_STATE_LIMITS: clone(RUN_STATE_LIMITS),
    RECOVERY_ACTIONS: clone(RECOVERY_ACTIONS), createRunState: createRunState,
    validateRunState: validateRunState, migrateRunState: migrateRunState,
    runStateFromPlan: runStateFromPlan, applyRunStateDelta: applyRunStateDelta, applyRecovery: applyRecovery,
    DAY3_FOOD_STRATEGY_IDS: DAY3_FOOD_STRATEGY_IDS.slice(), DAY3_FOOD_ROOT: clone(DAY3_FOOD_ROOT),
    applyDay3FoodStrategy: applyDay3FoodStrategy, day3FoodStrategy: day3FoodStrategy,
    fishdayTasks: fishdayTasks, resolveSendMin: resolveSendMin, staticArrival: staticArrival, infoArrival: infoArrival,
    tasksForSeg: tasksForSeg, handoffsForSeg: handoffsForSeg, isPlaced: isPlaced, deckFor: deckFor, daySchedule: daySchedule,
    dayReadiness: dayReadiness, scoreDay: scoreDay, projectedDay: projectedDay, canonDay: canonDay, applyDayFix: applyDayFix,
    fishdaySchedule: fishdaySchedule, idleMinutes: idleMinutes, wrongFishTasks: wrongFishTasks,
    reworkMinutes: reworkMinutes, efficiency: efficiency, budgetReadiness: budgetReadiness,
    readiness: readiness, projected: projected,
    resume: resume, intervene: intervene, memberInfo: memberInfo, canonHandoffs: canonHandoffs,
    // Layer 0 cosmetic view helpers (pure, no scoring impact)
    ambientActors: ambientActors, boatState: boatState, stationReadiness: stationReadiness, cascadeTrace: cascadeTrace,
    // coarse-day window bounds (feed DAY_WINDOWS; the read-only Gantt they once served is retired)
    DAY_HOUR_START: DAY_HOUR_START, DAY_HOUR_END: DAY_HOUR_END,
    // §20.3 — authorable all-days tunables (the deck→arrange→connect editor + minute clock read these)
    SNAP_MIN: SNAP_MIN, DAY_WINDOWS: DAY_WINDOWS, AUTHORABLE: AUTHORABLE,
    // rubric v1.0 — the whole-trip 100-point derived ledger + trip-wide efficiency
    scoreTrip: scoreTrip, planClusters: planClusters, PLAN_CLUSTER_IDS: PLAN_CLUSTER_IDS.slice(), tripEfficiency: tripEfficiency,
    criticalAssumptions: criticalAssumptions, executionReadiness: executionReadiness,
    // Physical route model: factual outbound chain + explicitly inferred reverse return.
    PHYSICAL_STOPS: PHYSICAL_STOPS, VESSELS: VESSELS, ITINERARY: ITINERARY,
    physicalStop: physicalStop, vessel: vessel, itineraryLeg: itineraryLeg,
    guestRosterForDay: guestRosterForDay, snapAuthoringMinute: snapAuthoringMinute,
    authoringTaskBlock: authoringTaskBlock, authoringLaneLayout: authoringLaneLayout,
    editAuthoringTaskBlock: editAuthoringTaskBlock,
    authoringSendMinute: authoringSendMinute,
    HOTEL_DEPART_MIN: HOTEL_DEPART_MIN, SAIL_MIN: SAIL_MIN,
    VOYAGE_APPROX_MIN: VOYAGE_APPROX_MIN, VOYAGE_END_MIN: VOYAGE_END_MIN,
    routeSceneId: routeSceneId, routeState: routeState,
    // Voyage/manifest program: ship map plus separate outbound, transfer, and return custody chains.
    VOYAGE_STATIONS: VOYAGE_STATIONS,
    carryState: carryState, manifestChainGaps: manifestChainGaps,
    manifestTransferGaps: manifestTransferGaps, manifestReturnGaps: manifestReturnGaps
  };
  global.PRS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
