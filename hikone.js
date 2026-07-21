(function (root, factory) {
  'use strict';
  var engine = root && root.PRS;
  if (!engine && typeof module === 'object' && module.exports && typeof require === 'function') {
    try { engine = require('./engine.js'); } catch (error) { engine = null; }
  }
  var api = factory(engine);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HIKONE = api;
  if (typeof document !== 'undefined') boot(api);
})(typeof window !== 'undefined' ? window : this, function (PRS) {
  'use strict';

  var PHASES = Object.freeze(['arrival', 'plan', 'run', 'observe', 'drive', 'lake', 'home']);
  var PEOPLE = Object.freeze([
    Object.freeze({ id: 'prakhar', engineId: 'p04', en: 'Prakhar', ja: 'プラカール', roleId: 'budgetLead', visual: 'red-cap' }),
    Object.freeze({ id: 'nishinaga', engineId: 'p03', en: 'Nishinaga', ja: '西永', roleId: 'siteLead', visual: 'blue-towel' })
  ]);
  var ITEMS = Object.freeze([
    Object.freeze({ id: 'rods', taskId: 'rods' }),
    Object.freeze({ id: 'worms', taskId: 'bait' }),
    Object.freeze({ id: 'chicken', taskId: 'bait' }),
    Object.freeze({ id: 'tanago-box', taskId: 'fill-box' }),
    Object.freeze({ id: 'suppon-tank', taskId: 'load-carriers' }),
    Object.freeze({ id: 'drinks', taskId: 'drinks' })
  ]);
  var TASKS = Object.freeze([
    Object.freeze({ id: 'confirm-care', item: null, duration: 5, defaultActor: 'prakhar', defaultStart: 350, produces: ['care-plan'], required: true }),
    Object.freeze({ id: 'bait', item: 'worms', duration: 5, defaultActor: 'nishinaga', defaultStart: 350, required: true }),
    Object.freeze({ id: 'rods', item: 'rods', duration: 5, defaultActor: 'prakhar', defaultStart: 355, required: true }),
    Object.freeze({ id: 'load-carriers', item: 'suppon-tank', duration: 10, defaultActor: 'both', defaultStart: 360, cooperative: true, needsInfo: ['care-plan'], deps: ['fill-box'], required: true }),
    Object.freeze({ id: 'fill-box', item: 'tanago-box', duration: 5, defaultActor: 'prakhar', defaultStart: 365, produces: ['box-has-water'], required: true }),
    Object.freeze({ id: 'drinks', item: 'drinks', duration: 5, defaultActor: null, defaultStart: 370, required: true })
  ]);
  var SLOTS = Object.freeze([350, 355, 360, 365, 370, 375]);
  var STORAGE_KEY = 'prs.hikone-planning-tutorial.v3';
  var ACTIONS = Object.freeze({
    START: 'START', MOVE_TASK: 'MOVE_TASK', UNPLACE_TASK: 'UNPLACE_TASK', CONNECT_HANDOFF: 'CONNECT_HANDOFF',
    RUN_PLAN: 'RUN_PLAN', RUN_TICK: 'RUN_TICK', REVISE_PLAN: 'REVISE_PLAN', CONTINUE_PAYOFF: 'CONTINUE_PAYOFF',
    DRIVE_TICK: 'DRIVE_TICK', PAYOFF_TICK: 'PAYOFF_TICK', SET_LANG: 'SET_LANG', RESTART: 'RESTART'
  });

  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function person(id) { return PEOPLE.filter(function (entry) { return entry.id === id; })[0] || null; }
  function taskDefinition(id) { return TASKS.filter(function (entry) { return entry.id === id; })[0] || null; }
  function taskState(definition) { return { id: definition.id, actor: definition.defaultActor, startMin: definition.defaultStart }; }
  function initialPlan() {
    return { connected: false, tasks: TASKS.map(taskState) };
  }
  function rootIssue(code, atMin, taskId, target, detail) {
    return { code: code, atMin: atMin, taskId: taskId || null, focusTarget: target || null, detail: detail || null };
  }
  function normalizePlan(plan) {
    var source = plan && typeof plan === 'object' ? plan : {};
    var rows = Array.isArray(source.tasks) ? source.tasks : [];
    var roots = [], known = {};
    var tasks = TASKS.map(function (definition) {
      known[definition.id] = true;
      var matches = rows.filter(function (row) { return row && row.id === definition.id; });
      if (matches.length !== 1) {
        return { id: definition.id, actor: null, startMin: definition.defaultStart };
      }
      var row = matches[0], actor = row.actor == null ? null : row.actor, startMin = row.startMin;
      var actorOk = actor == null || (definition.cooperative ? actor === 'both' : actor === 'prakhar' || actor === 'nishinaga');
      var timeOk = SLOTS.indexOf(startMin) >= 0;
      if (!actorOk || !timeOk) return { id: definition.id, actor: null, startMin: definition.defaultStart };
      return { id: definition.id, actor: actor, startMin: startMin };
    });
    rows.forEach(function (row) {
      if (!row || !known[row.id]) roots.push(rootIssue('task-unplanned', 350, null, 'run', { reason: 'unknown-task', taskId: row && row.id || null }));
    });
    return { plan: { connected: source.connected === true, tasks: tasks }, roots: roots };
  }
  function eventState(state, type, code, detail) {
    state.lastEvent = { type: type, code: code, detail: detail || null };
    return state;
  }
  function refusal(state, code, detail) { return eventState(copy(state), 'refusal', code, detail); }
  function worldSceneFor(phase) {
    if (phase === 'arrival') return 'arrival';
    if (phase === 'drive') return 'drive';
    if (phase === 'lake') return 'lake';
    if (phase === 'home') return 'home';
    return 'packing';
  }
  function freshState() {
    return {
      phase: 'arrival', scene: 'arrival', language: 'en', plan: initialPlan(), attempt: 0, revision: 0,
      focusTarget: null, run: null, report: null, payoffStep: 0, completed: false,
      clockMinutes: 350, lastEvent: { type: 'status', code: 'arrival', detail: null }
    };
  }
  function getTask(plan, id) {
    return plan && plan.tasks ? plan.tasks.filter(function (task) { return task.id === id; })[0] || null : null;
  }
  function actorIds(task) {
    if (!task || !task.actor) return [];
    return task.actor === 'both' ? ['prakhar', 'nishinaga'] : [task.actor];
  }
  function engineIds(task) {
    return actorIds(task).map(function (id) { return person(id).engineId; });
  }
  function engineRoleFor(task, fallback) {
    var ids = actorIds(task);
    return ids.length ? person(ids[0]).roleId : fallback;
  }
  function engineTask(plan, definition) {
    var placed = getTask(plan, definition.id);
    var assigned = placed && placed.actor ? (definition.cooperative ? ['p03', 'p04'] : engineIds(placed)) : [];
    return {
      id: definition.id,
      name: { en: definition.id, jp: definition.id },
      station: definition.id === 'fill-box' ? 'clinic' : 'lodging',
      ownerRoleId: definition.cooperative ? 'siteLead' : engineRoleFor(placed, definition.defaultActor === 'nishinaga' ? 'siteLead' : 'budgetLead'),
      allowedRoleIds: definition.cooperative ? ['budgetLead'] : [],
      assignedIds: assigned,
      startMin: placed ? placed.startMin : definition.defaultStart,
      durMin: definition.duration,
      baseStartMin: definition.defaultStart,
      deps: (definition.deps || []).slice(), difficulty: 1,
      neededResources: [], neededInfo: (definition.needsInfo || []).slice(),
      produces: (definition.produces || []).slice(), assumeOn: [],
      required: definition.required !== false, guestFacing: false, carries: []
    };
  }
  function buildCampaignPlan(plan) {
    plan = normalizePlan(plan).plan;
    var tasks = TASKS.map(function (definition) { return engineTask(plan, definition); });
    var confirm = tasks.filter(function (task) { return task.id === 'confirm-care'; })[0];
    var load = tasks.filter(function (task) { return task.id === 'load-carriers'; })[0];
    var handoffs = [];
    if (plan.connected && confirm && load && confirm.ownerRoleId !== load.ownerRoleId) {
      handoffs.push({
        id: 'hk-care-handoff', cardId: 'care-plan', fromRoleId: confirm.ownerRoleId, fromTaskId: confirm.id,
        toRoleId: load.ownerRoleId, toTaskId: load.id,
        trigger: { type: 'onTaskDone', taskId: confirm.id }, channel: 'faceToFace', ifLate: 'idle'
      });
    }
    return {
      participants: PEOPLE.map(function (entry) { return { id: entry.engineId, roleId: entry.roleId, name: { en: entry.en, jp: entry.ja } }; }),
      roles: { budgetLead: { holder: 'p04' }, siteLead: { holder: 'p03' } },
      infoCards: [{ id: 'care-plan', ownerRoleId: confirm ? confirm.ownerRoleId : 'budgetLead', name: { en: 'Live transport plan', jp: '生体運搬計画' } }],
      tasks: [], handoffs: [], manifest: [],
      days: { hikone: { tasks: tasks, handoffs: handoffs } }
    };
  }
  function campaignEvidence(plan) {
    var campaignPlan = buildCampaignPlan(plan);
    if (!PRS || typeof PRS.daySchedule !== 'function' || typeof PRS.dayReadiness !== 'function') {
      return { available: false, plan: campaignPlan, schedule: null, rawReadiness: [], readiness: [] };
    }
    try {
      var schedule = PRS.daySchedule(campaignPlan, 'hikone');
      var rawReadiness = PRS.dayReadiness(campaignPlan, 'hikone');
      var readiness = rawReadiness.slice();
      return { available: true, plan: campaignPlan, schedule: schedule, rawReadiness: rawReadiness, readiness: readiness };
    } catch (error) {
      return { available: false, plan: campaignPlan, schedule: null, rawReadiness: [], readiness: [], error: String(error && error.message || error) };
    }
  }
  function overlapMinutes(a, b) {
    return Math.max(0, Math.min(a.startMin + taskDefinition(a.id).duration, b.startMin + taskDefinition(b.id).duration) - Math.max(a.startMin, b.startMin));
  }
  function taskOrder(id) {
    for (var i = 0; i < TASKS.length; i++) if (TASKS[i].id === id) return i;
    return TASKS.length;
  }
  function sortRoots(roots) {
    var rank = { 'bad-order': 0, overlap: 1, 'drinks-missing': 2, 'task-unplanned': 3, 'late-departure': 4 };
    return roots.map(function (root, index) { return { root: root, index: index }; }).sort(function (a, b) {
      var atA = typeof a.root.atMin === 'number' ? a.root.atMin : Infinity;
      var atB = typeof b.root.atMin === 'number' ? b.root.atMin : Infinity;
      var rankA = Object.prototype.hasOwnProperty.call(rank, a.root.code) ? rank[a.root.code] : 99;
      var rankB = Object.prototype.hasOwnProperty.call(rank, b.root.code) ? rank[b.root.code] : 99;
      return atA - atB || rankA - rankB || taskOrder(a.root.taskId) - taskOrder(b.root.taskId) || a.index - b.index;
    }).map(function (entry) { return entry.root; });
  }
  function planRoots(plan) {
    var roots = [];
    var confirm = getTask(plan, 'confirm-care'), load = getTask(plan, 'load-carriers'), fill = getTask(plan, 'fill-box');
    var confirmPlaced = confirm && confirm.actor;
    var loadPlaced = load && load.actor;
    if (confirmPlaced && loadPlaced) {
      var sharedOwner = confirm.actor === 'nishinaga';
      if (!sharedOwner && !plan.connected) {
        return [rootIssue('missing-handoff', load.startMin, 'load-carriers', 'handoff', { from: confirm.actor, to: 'nishinaga' })];
      }
      if (!sharedOwner && plan.connected && confirm.startMin + taskDefinition('confirm-care').duration > load.startMin) {
        return [rootIssue('late-handoff', load.startMin, 'confirm-care', 'confirm-care')];
      }
    }

    if (fill && fill.actor && load && load.actor && fill.startMin + taskDefinition('fill-box').duration > load.startMin) {
      roots.push(rootIssue('bad-order', load.startMin, 'load-carriers', 'fill-box', { dependency: 'fill-box' }));
    }

    var missing = plan.tasks.filter(function (task) {
      var definition = taskDefinition(task.id);
      return definition && definition.required && !task.actor;
    });
    missing.forEach(function (task) {
      roots.push(rootIssue(task.id === 'drinks' ? 'drinks-missing' : 'task-unplanned', task.startMin, task.id, task.id, { taskId: task.id }));
    });

    PEOPLE.forEach(function (entry) {
      var assigned = plan.tasks.filter(function (task) { return actorIds(task).indexOf(entry.id) >= 0; });
      for (var i = 0; i < assigned.length; i++) for (var j = i + 1; j < assigned.length; j++) {
        var minutes = overlapMinutes(assigned[i], assigned[j]);
        var dependencyPair = [assigned[i].id, assigned[j].id].sort().join('|') === 'fill-box|load-carriers';
        if (minutes > 0 && !(dependencyPair && roots.some(function (root) { return root.code === 'bad-order'; }))) {
          roots.push(rootIssue('overlap', Math.max(assigned[i].startMin, assigned[j].startMin), assigned[j].id, assigned[j].id,
            { personId: entry.id, otherId: assigned[i].id, minutes: minutes }));
        }
      }
    });
    return sortRoots(roots);
  }
  function effectiveTasks(plan, roots) {
    var tasks = plan.tasks.filter(function (task) { return !!task.actor; }).map(function (task) {
      var definition = taskDefinition(task.id);
      return { id: task.id, actor: task.actor, startMin: task.startMin, endMin: task.startMin + definition.duration, effectiveStart: task.startMin, effectiveEnd: task.startMin + definition.duration };
    });
    var byId = {}, scheduled = {}, availability = { prakhar: -Infinity, nishinaga: -Infinity };
    tasks.forEach(function (task) { byId[task.id] = task; });
    var unresolvedLoad = roots.some(function (root) { return root.code === 'missing-handoff'; }) ? byId['load-carriers'] : null;
    var pending = tasks.filter(function (task) { return task !== unresolvedLoad; });
    function dependencies(task) {
      var deps = (taskDefinition(task.id).deps || []).slice();
      if (task.id === 'load-carriers' && byId['confirm-care']) deps.push('confirm-care');
      return deps.filter(function (id, index) { return byId[id] && deps.indexOf(id) === index; });
    }
    while (pending.length) {
      var ready = pending.filter(function (task) {
        return dependencies(task).every(function (id) { return !!scheduled[id]; });
      });
      if (!ready.length) ready = pending.slice();
      ready.sort(function (a, b) { return a.startMin - b.startMin || taskOrder(a.id) - taskOrder(b.id); });
      var next = ready[0], start = next.startMin;
      dependencies(next).forEach(function (id) { start = Math.max(start, scheduled[id].effectiveEnd); });
      actorIds(next).forEach(function (id) { start = Math.max(start, availability[id]); });
      next.effectiveStart = start; next.effectiveEnd = start + taskDefinition(next.id).duration; scheduled[next.id] = next;
      actorIds(next).forEach(function (id) { availability[id] = next.effectiveEnd; });
      pending.splice(pending.indexOf(next), 1);
    }
    if (unresolvedLoad) { unresolvedLoad.effectiveStart = 380; unresolvedLoad.effectiveEnd = null; }
    return tasks;
  }
  function itemFrame(tasks, atMin) {
    var items = {};
    ITEMS.forEach(function (item) {
      items[item.id] = { id: item.id, location: item.id === 'drinks' ? 'vending' : 'yard', status: item.id === 'tanago-box' ? 'empty' : 'ready', water: item.id === 'tanago-box' ? 'empty' : null, contains: null };
    });
    function done(id) {
      var task = tasks.filter(function (entry) { return entry.id === id; })[0];
      return !!task && task.effectiveEnd != null && task.effectiveEnd <= atMin;
    }
    if (done('bait')) { items.worms.location = 'trunk'; items.chicken.location = 'trunk'; items.worms.status = items.chicken.status = 'loaded'; }
    if (done('rods')) { items.rods.location = 'trunk'; items.rods.status = 'loaded'; }
    if (done('fill-box')) { items['tanago-box'].location = 'tap'; items['tanago-box'].water = 'full'; items['tanago-box'].status = 'filled'; }
    if (done('load-carriers')) {
      items['tanago-box'].location = 'trunk'; items['tanago-box'].water = 'full'; items['tanago-box'].status = 'loaded';
      items['suppon-tank'].location = 'trunk'; items['suppon-tank'].status = 'loaded';
    }
    if (done('drinks')) { items.drinks.location = 'cabin'; items.drinks.status = 'loaded'; }
    return items;
  }
  function frameCode(atMin, roots, tasks, plan) {
    if (atMin === 350) return 'rehearsal-start';
    var first = roots[0];
    if (first && first.code === 'missing-handoff' && atMin >= first.atMin) return 'handoff-wait';
    if (first && first.code === 'late-handoff' && atMin >= first.atMin) return 'handoff-late';
    if (first && first.code === 'bad-order' && atMin >= first.atMin && atMin < (getTask(plan, 'fill-box').startMin + taskDefinition('fill-box').duration)) return 'empty-box-wait';
    var ending = tasks.filter(function (task) { return task.effectiveEnd === atMin; })[0];
    if (ending && ending.id === 'confirm-care' && plan.connected) return 'handoff-delivered';
    if (ending) return 'task-done';
    return 'clock-advance';
  }
  function makeFrames(plan, roots, tasks) {
    var maxEnd = 380;
    tasks.forEach(function (task) { if (task.effectiveEnd != null) maxEnd = Math.max(maxEnd, task.effectiveEnd); });
    maxEnd = Math.min(400, Math.ceil(maxEnd / 5) * 5);
    var frames = [];
    for (var at = 350; at <= maxEnd; at += 5) {
      var actorState = { prakhar: { status: 'idle', taskId: null }, nishinaga: { status: 'idle', taskId: null }, watanabe: { status: 'waiting', taskId: null } };
      var statusRank = { idle: 0, waiting: 1, working: 2 };
      function showActor(actorId, status, taskId) {
        if (statusRank[status] > statusRank[actorState[actorId].status]) actorState[actorId] = { status: status, taskId: taskId };
      }
      tasks.forEach(function (task) {
        actorIds(task).forEach(function (actorId) {
          if (at >= task.startMin && at < task.effectiveStart) showActor(actorId, 'waiting', task.id);
          if (task.effectiveEnd != null && at >= task.effectiveStart && at < task.effectiveEnd) showActor(actorId, 'working', task.id);
        });
      });
      frames.push({ atMin: at, code: frameCode(at, roots, tasks, plan), actors: actorState, items: itemFrame(tasks, at) });
    }
    frames[frames.length - 1].code = roots.length ? 'run-needs-revision' : 'run-clean';
    return frames;
  }
  function simulatePlan(plan) {
    var normalized = normalizePlan(plan), frozen = normalized.plan;
    var roots = normalized.roots.concat(planRoots(frozen));
    var tasks = effectiveTasks(frozen, roots);
    var latest = null;
    tasks.forEach(function (task) {
      if (task.effectiveEnd != null && (!latest || task.effectiveEnd > latest.effectiveEnd)) latest = task;
    });
    if (latest && latest.effectiveEnd > 380 && !roots.some(function (root) { return root.code === 'missing-handoff' || root.code === 'task-unplanned'; })) {
      roots.push(rootIssue('late-departure', 380, latest.id, latest.id, { readyAt: latest.effectiveEnd }));
    }
    roots = sortRoots(roots);
    var evidence = campaignEvidence(frozen);
    if (!roots.length && !evidence.available) {
      roots.push(rootIssue('engine-unavailable', 350, null, 'run', { error: evidence.error || null }));
    } else if (!roots.length && evidence.readiness.length) {
      var engineIssue = evidence.readiness[0], engineTaskState = getTask(frozen, engineIssue.taskId);
      roots.push(rootIssue('campaign-gap', engineTaskState ? engineTaskState.startMin : 350, engineIssue.taskId || null, engineTaskState ? engineTaskState.id : 'run', { type: engineIssue.type || 'UNKNOWN' }));
    }
    var waitMinutes = 0, detourMinutes = 0;
    tasks.forEach(function (task) { waitMinutes += Math.max(0, task.effectiveStart - task.startMin); });
    roots.forEach(function (root) {
      if (root.code === 'drinks-missing') detourMinutes = 8;
    });
    var hardIncomplete = roots.some(function (root) { return root.code === 'missing-handoff' || root.code === 'engine-unavailable' || root.code === 'campaign-gap' || (root.code === 'task-unplanned' && root.taskId !== 'drinks'); });
    var departureMin = hardIncomplete ? null : Math.max(380, latest ? latest.effectiveEnd : 380);
    var success = roots.length === 0 && evidence.available && evidence.readiness.length === 0;
    return {
      success: success, roots: roots, primaryRoot: roots[0] || null,
      waitMinutes: waitMinutes, detourMinutes: detourMinutes, departureMin: departureMin,
      engineEvidence: evidence, tasks: tasks, frames: makeFrames(frozen, roots, tasks), fingerprint: planFingerprint(frozen)
    };
  }
  function planFingerprint(plan) {
    var source = JSON.stringify(normalizePlan(plan).plan), hash = 2166136261;
    for (var i = 0; i < source.length; i++) { hash ^= source.charCodeAt(i); hash = Math.imul(hash, 16777619); }
    return ('00000000' + (hash >>> 0).toString(16)).slice(-8);
  }
  function derive(state) {
    var preview = simulatePlan(state.plan);
    return {
      phase: state.phase, scene: state.scene, canRun: state.phase === 'plan', canRevise: state.phase === 'observe' && !!state.report && !state.report.success,
      canContinue: state.phase === 'observe' && !!state.report && state.report.success,
      preview: preview, connected: state.plan.connected, completed: state.completed
    };
  }
  function reduce(state, action) {
    state = state || freshState(); action = action || {};
    var next, task, definition, result, nextIndex;
    if (action.type === ACTIONS.RESTART) {
      next = freshState(); next.language = state.language === 'ja' ? 'ja' : 'en';
      return eventState(next, 'status', 'restart');
    }
    if (action.type === ACTIONS.SET_LANG) {
      if (action.language !== 'en' && action.language !== 'ja') return refusal(state, 'invalid-language');
      next = copy(state); next.language = action.language; return eventState(next, 'status', 'language');
    }
    if (action.type === ACTIONS.START) {
      if (state.phase !== 'arrival') return refusal(state, 'wrong-phase');
      next = copy(state); next.phase = 'plan'; next.scene = worldSceneFor(next.phase); next.focusTarget = 'run';
      return eventState(next, 'status', 'plan-opened');
    }
    if (action.type === ACTIONS.MOVE_TASK) {
      if (state.phase !== 'plan') return refusal(state, 'planning-closed');
      definition = taskDefinition(action.taskId);
      if (!definition || SLOTS.indexOf(action.startMin) < 0 || ['prakhar', 'nishinaga', 'both'].indexOf(action.actor) < 0) return refusal(state, 'invalid-placement');
      if (definition.cooperative && action.actor !== 'both') return refusal(state, 'both-required');
      if (!definition.cooperative && action.actor === 'both') return refusal(state, 'single-owner-task');
      next = copy(state); task = getTask(next.plan, action.taskId); if (!task) return refusal(state, 'invalid-plan');
      task.actor = action.actor; task.startMin = action.startMin; next.focusTarget = action.taskId;
      return eventState(next, 'success', 'task-moved', { taskId: action.taskId, actor: action.actor, startMin: action.startMin });
    }
    if (action.type === ACTIONS.UNPLACE_TASK) {
      if (state.phase !== 'plan') return refusal(state, 'planning-closed');
      definition = taskDefinition(action.taskId); if (!definition) return refusal(state, 'unknown-task');
      next = copy(state); task = getTask(next.plan, action.taskId); if (!task) return refusal(state, 'invalid-plan');
      task.actor = null; next.focusTarget = action.taskId;
      return eventState(next, 'success', 'task-unplanned', { taskId: action.taskId });
    }
    if (action.type === ACTIONS.CONNECT_HANDOFF) {
      if (state.phase !== 'plan') return refusal(state, 'planning-closed');
      next = copy(state); next.plan.connected = action.connected !== false; next.focusTarget = 'handoff';
      return eventState(next, 'success', next.plan.connected ? 'handoff-connected' : 'handoff-removed');
    }
    if (action.type === ACTIONS.RUN_PLAN) {
      if (state.phase !== 'plan') return refusal(state, 'wrong-phase');
      result = simulatePlan(state.plan); next = copy(state); next.phase = 'run'; next.scene = worldSceneFor(next.phase); next.attempt += 1; next.focusTarget = null; next.report = null;
      next.plan = copy(normalizePlan(state.plan).plan);
      next.run = { snapshot: copy(next.plan), fingerprint: result.fingerprint, result: result, frameIndex: 0, frame: copy(result.frames[0]) };
      next.clockMinutes = next.run.frame.atMin;
      return eventState(next, 'status', 'run-started', { attempt: next.attempt, fingerprint: result.fingerprint });
    }
    if (action.type === ACTIONS.RUN_TICK) {
      if (state.phase !== 'run' || !state.run) return refusal(state, 'run-not-active');
      next = copy(state); nextIndex = next.run.frameIndex + 1;
      if (nextIndex < next.run.result.frames.length) {
        next.run.frameIndex = nextIndex; next.run.frame = copy(next.run.result.frames[nextIndex]); next.clockMinutes = next.run.frame.atMin;
        return eventState(next, 'status', next.run.frame.code, { atMin: next.clockMinutes });
      }
      next.phase = 'observe'; next.scene = worldSceneFor(next.phase); next.report = copy(next.run.result); next.focusTarget = next.report.primaryRoot ? next.report.primaryRoot.focusTarget : 'continue';
      return eventState(next, next.report.success ? 'success' : 'consequence', next.report.success ? 'report-clean' : 'report-gap');
    }
    if (action.type === ACTIONS.REVISE_PLAN) {
      if (state.phase !== 'observe' || !state.report || state.report.success) return refusal(state, 'nothing-to-revise');
      next = copy(state); next.phase = 'plan'; next.scene = worldSceneFor(next.phase); next.revision += 1; next.focusTarget = next.report.primaryRoot ? next.report.primaryRoot.focusTarget : null; next.run = null;
      return eventState(next, 'status', 'revision-opened', { target: next.focusTarget });
    }
    if (action.type === ACTIONS.CONTINUE_PAYOFF) {
      if (state.phase !== 'observe' || !state.report || !state.report.success) return refusal(state, 'rehearsal-not-clean');
      next = copy(state); next.phase = 'drive'; next.scene = 'drive'; next.payoffStep = 0; next.clockMinutes = 380; next.run = null;
      return eventState(next, 'success', 'drive-started');
    }
    if (action.type === ACTIONS.DRIVE_TICK) {
      if (state.phase !== 'drive') return refusal(state, 'wrong-phase');
      next = copy(state); next.phase = 'lake'; next.scene = 'lake'; next.payoffStep = 0; next.clockMinutes = 426;
      return eventState(next, 'success', 'lake-arrival');
    }
    if (action.type === ACTIONS.PAYOFF_TICK) {
      if (state.phase !== 'lake') return refusal(state, 'wrong-phase');
      next = copy(state); next.payoffStep += 1;
      if (next.payoffStep >= 4) {
        next.phase = 'home'; next.scene = 'home'; next.completed = true; next.clockMinutes = 520;
        return eventState(next, 'complete', 'tutorial-complete');
      }
      return eventState(next, 'success', ['lake-setup', 'tanago-secured', 'suppon-secured'][next.payoffStep - 1] || 'lake-payoff');
    }
    return refusal(state, 'invalid-action');
  }
  function completionEnvelope(state, now) {
    if (!state || !state.completed) return null;
    return { kind: 'hikone-planning-tutorial', version: 3, completed: true, attempts: state.attempt, revisions: state.revision, completedAt: now || new Date().toISOString() };
  }
  function saveCompletion(storage, state, now) {
    var envelope = completionEnvelope(state, now); if (!envelope || !storage || typeof storage.setItem !== 'function') return false;
    try { storage.setItem(STORAGE_KEY, JSON.stringify(envelope)); return true; } catch (error) { return false; }
  }
  function loadCompletion(storage) {
    if (!storage || typeof storage.getItem !== 'function') return null;
    try {
      var value = JSON.parse(storage.getItem(STORAGE_KEY) || 'null');
      return value && value.kind === 'hikone-planning-tutorial' && value.version === 3 && value.completed === true ? value : null;
    } catch (error) { return null; }
  }

  return {
    PHASES: PHASES, PEOPLE: PEOPLE, ITEMS: ITEMS, TASKS: TASKS, SLOTS: SLOTS, ACTIONS: ACTIONS, STORAGE_KEY: STORAGE_KEY,
    freshState: freshState, reduce: reduce, derive: derive, simulatePlan: simulatePlan, buildCampaignPlan: buildCampaignPlan,
    campaignEvidence: campaignEvidence, planFingerprint: planFingerprint, saveCompletion: saveCompletion, loadCompletion: loadCompletion
  };
});

function boot(HIKONE) {
  'use strict';
  var COPY = {
    en: {
      actors: { prakhar: 'Prakhar', nishinaga: 'Nishinaga', watanabe: 'Watanabe-san' },
      actorShort: { prakhar: 'Prakhar', nishinaga: 'Nishinaga', both: 'Both' },
      items: { rods: 'fishing rods', worms: 'worms', chicken: 'chicken bait', 'tanago-box': 'tanago water box', 'suppon-tank': 'suppon carrier', drinks: 'drinks' },
      tasks: {
        'confirm-care': ['Confirm live transport', 'Separate aquariums; never food'], bait: ['Gather both baits', 'Worms for tanago · chicken for suppon'],
        rods: ['Gather fishing rods', 'Check reels and stow together'], 'load-carriers': ['Load both carriers', 'A two-person lift; water box must be full'],
        'fill-box': ['Fill tanago box', 'Prepare water before loading'], drinks: ['Get road drinks', 'Bring them into the car plan']
      },
      location: { arrival: 'Ryokan Izumi · Yokkaichi', packing: 'Ryokan Izumi · Yokkaichi', drive: 'Yokkaichi → Hikone', lake: 'Lake Biwa · Hikone', home: 'Separate aquarium room' },
      loop: ['Plan', 'Run', 'Observe', 'Revise'],
      arrivalSpeech: 'Hikone, Lake Biwa. I’ll drive my car. We leave at 06:20. Bring the tanago and suppon home alive, in separate aquariums—never as food. Prakhar, Nishinaga: prepare everything.',
      arrivalObjective: 'Watanabe-san arrives outside Ryokan Izumi.', arrivalHint: 'Open the shared morning plan.', start: 'Open the plan',
      planObjective: 'Build the morning before anyone moves.', planHint: 'Drag a task, or select it and choose a highlighted slot. Set people, time and information—then rehearse even if the plan is incomplete.',
      planTitle: 'Hikone morning plan', planKicker: '05:50–06:20 · Ryokan Izumi', deck: 'Unplanned work', deckEmpty: 'Everything is on the timeline', remove: 'Move selected task to deck',
      connection: 'Information handoff', connect: 'Connect face to face', connected: 'Connected · face to face', sameOwner: 'Already with Nishinaga', connectionHint: '“Live transport plan” must reach the person loading the carriers before that work starts.',
      runPlan: 'Run rehearsal', frozen: 'Plan frozen for this run', runObjective: 'Watch the authored plan execute.',
      runStatus: { idle: 'ready', working: 'working', waiting: 'waiting' },
      observeObjective: 'Read the first cause, then return to its exact plan control.', reportKicker: 'Rehearsal evidence',
      revise: 'Show in plan', reload: 'Reload tutorial', continue: 'Continue to Lake Biwa',
      cleanTitle: 'The rehearsal is clean.', cleanSummary: 'Both people finish the trunk by 06:20. The plan—not a last-second rescue—made the trip ready.',
      roots: {
        'missing-handoff': ['Nishinaga waited at the trunk', 'The live-transport plan stayed with Prakhar. Draw a timed face-to-face handoff, or give the confirming task to the person who loads.'],
        'late-handoff': ['The information arrived too late', 'Confirm the transport plan earlier, or move loading later.'],
        'bad-order': ['The carrier reached the trunk empty', 'Filling the tanago box is planned after loading. Move Fill before Load; more than one schedule can work.'],
        'drinks-missing': ['Drinks never entered the plan', 'The run would need an eight-minute roadside stop. Put Drinks on a person’s timeline.'],
        'task-unplanned': ['Required work is still in the deck', 'Place that task on a person and a time before the next rehearsal.'],
        overlap: ['One person has two jobs at once', 'Move or reassign one block. The rehearsal will not invent a second copy of that person.'],
        'late-departure': ['The plan misses the 06:20 departure', 'Move or reassign the last task so the trunk is ready before Watanabe-san must drive.'],
        'campaign-gap': ['The campaign engine found another plan gap', 'Return to the highlighted task and repair the campaign readiness evidence before continuing.'],
        'engine-unavailable': ['The rehearsal engine is unavailable', 'Reload the tutorial so the same engine used by the Ogasawara campaign can verify this plan.']
      },
      evidence: 'Evidence', wait: 'Wait', detour: 'Detour', departure: 'Trunk ready', minutes: 'min', also: 'Also observed',
      driveSpeech: 'The trunk matches the plan. I’ll drive.', driveObjective: 'Yokkaichi → Lake Biwa, Hikone',
      lakeLines: ['The same prepared trunk opens at Lake Biwa.', 'Rods and bait deploy in the planned order.', 'Tanago goes straight into the water-filled box.', 'Suppon stays in its separate carrier.'],
      homeObjective: 'The plan carried through to two separate aquariums.', complete: 'Plan → Run → Observe → Revise. This is the same loop you will use for Ogasawara.',
      replay: 'Replay tutorial', campaign: 'Start Ogasawara campaign', soundOff: 'Sound off', soundOn: 'Sound on', exit: 'Exit',
      event: {
        'plan-opened': 'The world is the evidence. The timeline is the control surface.', 'task-moved': 'Task placed on the shared timeline.', 'task-unplanned': 'Task returned to the deck.',
        'selection-cancelled': 'Task move cancelled.',
        'handoff-connected': 'Face-to-face handoff drawn.', 'handoff-removed': 'Handoff removed.', 'run-started': 'The plan is frozen. Rehearsal started.',
        'handoff-wait': 'Nishinaga is waiting: the transport plan never arrived.', 'handoff-late': 'The transport plan arrived after loading was due.',
        'empty-box-wait': 'Loading waits. The tanago box is still empty.', 'handoff-delivered': 'The live-transport plan reaches Nishinaga.',
        'run-needs-revision': 'The rehearsal found a plan gap.', 'run-clean': 'The rehearsal reaches 06:20 cleanly.', 'report-gap': 'Observe the cause, then revise the plan.',
        'report-clean': 'The rehearsal is clean.', 'revision-opened': 'The exact plan control is highlighted.', 'drive-started': 'The clean plan becomes the real trip.',
        'lake-arrival': 'Lake Biwa. The prepared plan is ready to deploy.', 'lake-setup': 'Rods and bait deploy from the trunk.', 'tanago-secured': 'Tanago is secured in the water-filled box.',
        'suppon-secured': 'Suppon is secured separately.', 'tutorial-complete': 'The animals arrive at two separate aquariums.',
        'both-required': 'Loading the carriers uses both people.', 'single-owner-task': 'Choose one person for this task.', 'planning-closed': 'Return to the plan before editing.'
      }
    },
    ja: {
      actors: { prakhar: 'プラカール', nishinaga: '西永', watanabe: '渡邊さん' },
      actorShort: { prakhar: 'プラカール', nishinaga: '西永', both: '二人' },
      items: { rods: '釣り竿', worms: 'ミミズ', chicken: '鶏肉のエサ', 'tanago-box': 'タナゴ用水箱', 'suppon-tank': 'スッポン用ケース', drinks: '飲み物' },
      tasks: {
        'confirm-care': ['生体運搬を確認', '別々の水槽へ。食用ではない'], bait: ['二つのエサを用意', 'タナゴはミミズ・スッポンは鶏肉'],
        rods: ['釣り竿を用意', 'リールを確認してまとめる'], 'load-carriers': ['二つのケースを積む', '二人で運ぶ。水箱には先に水が必要'],
        'fill-box': ['タナゴ用水箱に水', '積み込む前に水を準備'], drinks: ['道中の飲み物', '車の計画に入れる']
      },
      location: { arrival: '旅館いずみ・四日市', packing: '旅館いずみ・四日市', drive: '四日市 → 彦根', lake: '琵琶湖・彦根', home: '別々の水槽の部屋' },
      loop: ['計画', '実行', '観察', '修正'],
      arrivalSpeech: '彦根の琵琶湖へ行こう。私の車で、運転は私。06:20出発だ。タナゴとスッポンは生きたまま別々の水槽へ迎える。食用ではない。プラカール、西永、二人で全部準備して。',
      arrivalObjective: '渡邊さんが旅館いずみ前に到着。', arrivalHint: '共有の朝計画を開きます。', start: '計画を開く',
      planObjective: '人が動く前に、朝を組み立てます。', planHint: '仕事をドラッグ、または選択して強調枠へ配置。人・時刻・情報を決め、不完全でも実行します。',
      planTitle: '彦根の朝計画', planKicker: '05:50–06:20・旅館いずみ', deck: '未配置の仕事', deckEmpty: 'すべてタイムライン上にあります', remove: '選択中の仕事を未配置へ',
      connection: '情報の受け渡し', connect: '対面でつなぐ', connected: '接続済み・対面', sameOwner: 'すでに西永が保有', connectionHint: '「生体運搬計画」はケース積込の開始前に担当者へ届く必要があります。',
      runPlan: 'リハーサル実行', frozen: 'この実行では計画を固定', runObjective: '作成した計画が動く様子を観察します。',
      runStatus: { idle: '待機', working: '作業中', waiting: '手待ち' },
      observeObjective: '最初の原因を読み、該当する計画箇所へ戻ります。', reportKicker: 'リハーサルの証拠', revise: '計画で確認', reload: 'チュートリアルを再読込', continue: '琵琶湖へ進む',
      cleanTitle: 'クリーンなリハーサルです。', cleanSummary: '二人が06:20までに積込を完了。直前の救済ではなく、計画によって準備できました。',
      roots: {
        'missing-handoff': ['西永がトランク前で手待ち', '生体運搬計画がプラカールの手元に残りました。時間のある対面連絡を引くか、確認作業を積込担当へ移します。'],
        'late-handoff': ['情報の到着が遅い', '生体運搬の確認を早めるか、積込を後ろへ移します。'],
        'bad-order': ['空の水箱がトランクへ', 'タナゴ用水箱への給水が積込より後です。給水を先へ。正解は一つではありません。'],
        'drinks-missing': ['飲み物が計画にない', '道中で8分の寄り道が必要になります。飲み物を人と時刻に配置します。'],
        'task-unplanned': ['必要な仕事が未配置です', '次の実行前に、人と時刻を決めます。'],
        overlap: ['一人に同時刻の仕事が二つ', '片方を移動または再担当。リハーサルは人を分身させません。'],
        'late-departure': ['06:20の出発に間に合いません', '最後の仕事を移動または再担当し、渡邊さんの出発前にトランクを準備します。'],
        'campaign-gap': ['キャンペーンエンジンが別の不備を検出', '強調された仕事に戻り、次へ進む前に準備判定を修正します。'],
        'engine-unavailable': ['リハーサルエンジンを利用できません', '再読み込みし、小笠原キャンペーンと同じエンジンで計画を確認します。']
      },
      evidence: '証拠', wait: '手待ち', detour: '寄り道', departure: 'トランク準備', minutes: '分', also: 'ほかの観察',
      driveSpeech: 'トランクが計画どおりだ。運転は私に任せて。', driveObjective: '四日市 → 彦根・琵琶湖',
      lakeLines: ['琵琶湖で同じトランクが開きます。', '竿とエサを計画した順に使います。', 'タナゴは水入りの箱へ。', 'スッポンは別のケースへ。'],
      homeObjective: '計画は二つの別々の水槽までつながりました。', complete: '計画 → 実行 → 観察 → 修正。小笠原でも同じ流れを使います。',
      replay: 'もう一度', campaign: '小笠原キャンペーンへ', soundOff: '音声オフ', soundOn: '音声オン', exit: '退出',
      event: {
        'plan-opened': '世界が証拠、タイムラインが操作面です。', 'task-moved': '仕事を共有タイムラインへ配置しました。', 'task-unplanned': '仕事を未配置へ戻しました。',
        'selection-cancelled': '仕事の移動を取り消しました。',
        'handoff-connected': '対面の情報線を引きました。', 'handoff-removed': '情報線を外しました。', 'run-started': '計画を固定して実行開始。',
        'handoff-wait': '西永が手待ち：生体運搬計画が届いていません。', 'handoff-late': '生体運搬計画の到着が積込開始より後です。',
        'empty-box-wait': '積込が停止。タナゴ用水箱はまだ空です。', 'handoff-delivered': '生体運搬計画が西永へ届きました。',
        'run-needs-revision': 'リハーサルが計画の弱点を発見。', 'run-clean': '06:20までクリーンに到達。', 'report-gap': '原因を観察し、計画を修正します。',
        'report-clean': 'クリーンなリハーサルです。', 'revision-opened': '該当する計画箇所を強調しました。', 'drive-started': 'クリーンな計画が実際の旅になります。',
        'lake-arrival': '琵琶湖。準備した計画を使います。', 'lake-setup': 'トランクから竿とエサを展開。', 'tanago-secured': 'タナゴを水入りの箱へ。',
        'suppon-secured': 'スッポンを別のケースへ。', 'tutorial-complete': '二匹が別々の水槽へ到着。',
        'both-required': 'ケース積込には二人が必要です。', 'single-owner-task': 'この仕事は一人を選びます。', 'planning-closed': '編集するには計画へ戻ります。'
      }
    }
  };

  var app = document.getElementById('hk-app'), stage = document.getElementById('hk-stage');
  var scene = document.getElementById('hk-scene'), planPanel = document.getElementById('hk-plan'), runPanel = document.getElementById('hk-run'), reportPanel = document.getElementById('hk-report');
  var objective = document.getElementById('hk-objective'), hint = document.getElementById('hk-hint'), speech = document.getElementById('hk-speech'), speaker = document.getElementById('hk-speaker');
  var toast = document.getElementById('hk-toast'), actions = document.getElementById('hk-actions'), clock = document.getElementById('hk-clock'), locationLabel = document.getElementById('hk-location');
  var live = document.getElementById('hk-live'), langEn = document.getElementById('hk-lang-en'), langJa = document.getElementById('hk-lang-ja'), soundButton = document.getElementById('hk-sound'), exit = document.querySelector('.hk-exit');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var state = HIKONE.freshState(), selectedTask = null, sound = false, audioContext = null, timers = {}, drag = null, suppressClickUntil = 0, lastFocusedTarget = null, lastReportFocusKey = null, pendingPlanFocus = null;
  document.body.classList.remove('no-js');

  function c() { return COPY[state.language]; }
  function esc(value) { return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]; }); }
  function formatClock(total) { var hour = Math.floor(total / 60) % 24, minute = total % 60; return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute; }
  function setText(element, value) { value = String(value == null ? '' : value); if (element.textContent !== value) element.textContent = value; }
  function announce(message) { live.textContent = ''; window.setTimeout(function () { live.textContent = message; }, 10); }
  function tone(kind) {
    if (!sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      var oscillator = audioContext.createOscillator(), gain = audioContext.createGain();
      oscillator.frequency.value = kind === 'wait' ? 190 : kind === 'complete' ? 720 : 430;
      gain.gain.setValueAtTime(.0001, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.045, audioContext.currentTime + .01); gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .16);
      oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .18);
    } catch (error) { sound = false; }
  }
  function showEvent(event) {
    var text = c().event[event.code]; if (!text) return;
    toast.textContent = text; toast.classList.add('is-visible'); announce(text);
    window.clearTimeout(timers.toast); timers.toast = window.setTimeout(function () { toast.textContent = ''; toast.classList.remove('is-visible'); }, reducedMotion.matches ? 1300 : 2100);
    tone(event.type === 'refusal' || event.type === 'consequence' || /wait|gap/.test(event.code) ? 'wait' : event.type === 'complete' ? 'complete' : 'success');
  }
  function loopStrip(active) {
    return '<ol class="hk-loop" aria-label="' + esc(c().loop.join(' → ')) + '">' + c().loop.map(function (label, index) {
      var steps = ['plan', 'run', 'observe', 'revise'], status = steps[index] === active ? ' is-current' : '';
      if ((active === 'run' && index === 0) || (active === 'observe' && index < 2) || (active === 'revise' && index < 3)) status += ' is-done';
      return '<li class="' + status.trim() + '"><span>' + (index + 1) + '</span><b>' + esc(label) + '</b></li>';
    }).join('') + '</ol>';
  }
  function buildWorld() {
    scene.innerHTML = '';
    ['prakhar', 'nishinaga', 'watanabe'].forEach(function (id) {
      var element = document.createElement('div'); element.className = 'hk-person hk-actor'; element.dataset.person = id; element.dataset.actor = id; element.dataset.name = c().actors[id]; element.setAttribute('role', 'img'); element.setAttribute('aria-label', c().actors[id]); scene.appendChild(element);
    });
    HIKONE.ITEMS.forEach(function (definition) {
      var element = document.createElement('div'); element.className = 'hk-prop hk-item'; element.dataset.card = definition.id; element.dataset.object = definition.id; element.dataset.item = definition.id; element.setAttribute('role', 'img'); element.setAttribute('aria-label', c().items[definition.id]);
      element.innerHTML = '<span class="hk-sr-label">' + esc(c().items[definition.id]) + '</span>'; scene.appendChild(element);
    });
    var tanago = document.createElement('span'); tanago.className = 'hk-catch hk-catch-tanago'; tanago.dataset.catch = 'tanago'; tanago.setAttribute('role', 'img'); tanago.setAttribute('aria-label', 'Tanago / タナゴ'); scene.appendChild(tanago);
    var suppon = document.createElement('span'); suppon.className = 'hk-catch hk-catch-suppon'; suppon.dataset.catch = 'suppon'; suppon.setAttribute('role', 'img'); suppon.setAttribute('aria-label', 'Suppon / スッポン'); scene.appendChild(suppon);
  }
  function defaultItems() {
    var out = {}; HIKONE.ITEMS.forEach(function (item) { out[item.id] = { id: item.id, location: item.id === 'drinks' ? 'vending' : 'yard', status: item.id === 'tanago-box' ? 'empty' : 'ready', water: item.id === 'tanago-box' ? 'empty' : null, contains: null }; }); return out;
  }
  function physicalItems() {
    if ((state.phase === 'run' || state.phase === 'observe') && state.run && state.run.frame) return state.run.frame.items;
    var items = defaultItems();
    if (state.phase === 'drive') return items;
    if (state.phase === 'lake' || state.phase === 'home') {
      ['rods', 'worms', 'chicken', 'tanago-box', 'suppon-tank'].forEach(function (id) { items[id].location = 'trunk'; items[id].status = 'loaded'; });
      items['tanago-box'].water = 'full'; items.drinks.location = 'cabin'; items.drinks.status = 'loaded';
      if (state.payoffStep >= 1 || state.phase === 'home') items.rods.location = 'jetty';
      if (state.payoffStep >= 2 || state.phase === 'home') { items['tanago-box'].contains = 'tanago'; items['tanago-box'].status = 'occupied'; }
      if (state.payoffStep >= 3 || state.phase === 'home') { items['suppon-tank'].contains = 'suppon'; items['suppon-tank'].status = 'occupied'; }
      if (state.phase === 'home') { items['tanago-box'].location = 'home-tanago'; items['suppon-tank'].location = 'home-suppon'; }
    }
    return items;
  }
  function actorFrame() {
    if (state.phase === 'run' && state.run && state.run.frame) return state.run.frame.actors;
    return { prakhar: { status: 'idle', taskId: null }, nishinaga: { status: 'idle', taskId: null }, watanabe: { status: 'waiting', taskId: null } };
  }
  function setVisible(element, visible) { element.hidden = !visible; element.setAttribute('aria-hidden', visible ? 'false' : 'true'); }
  function renderWorld() {
    app.dataset.scene = state.scene; app.dataset.mode = state.phase; stage.dataset.phase = state.phase; document.documentElement.lang = state.language;
    locationLabel.textContent = c().location[state.scene] || c().location.packing; clock.textContent = formatClock(state.clockMinutes);
    var actors = actorFrame();
    scene.querySelectorAll('[data-person]').forEach(function (element) {
      var id = element.dataset.person, info = actors[id] || { status: 'waiting' }; element.dataset.name = c().actors[id]; element.setAttribute('aria-label', c().actors[id]); element.dataset.status = info.status;
      element.classList.toggle('is-working', info.status === 'working'); element.classList.toggle('is-waiting', info.status === 'waiting'); element.dataset.task = info.taskId || '';
      setVisible(element, state.phase !== 'drive' && state.phase !== 'home');
    });
    var items = physicalItems();
    scene.querySelectorAll('[data-object]').forEach(function (element) {
      var item = items[element.dataset.object]; element.dataset.location = item.location; element.dataset.state = item.water === 'full' ? 'filled' : item.status; element.dataset.filled = item.water === 'full' ? 'true' : 'false'; element.setAttribute('aria-label', c().items[item.id]);
      var visible = ['plan', 'run', 'observe', 'lake'].indexOf(state.phase) >= 0 || (state.phase === 'home' && (item.id === 'tanago-box' || item.id === 'suppon-tank'));
      setVisible(element, visible);
    });
    var tanago = scene.querySelector('[data-catch="tanago"]'), suppon = scene.querySelector('[data-catch="suppon"]');
    setVisible(tanago, state.phase === 'lake' && state.payoffStep >= 2); setVisible(suppon, state.phase === 'lake' && state.payoffStep >= 3);
    var home = document.querySelector('.hk-home-aquariums'); home.classList.toggle('has-tanago', state.phase === 'home'); home.classList.toggle('has-suppon', state.phase === 'home');
  }
  function taskCopy(id) { return c().tasks[id] || [id, '']; }
  function planFocusKey(element) {
    if (!element || typeof element.closest !== 'function' || !planPanel.contains(element)) return null;
    var task = element.closest('[data-task]'), slot = element.closest('[data-slot]');
    if (task) return { type: 'task', id: task.dataset.task };
    if (slot) return { type: 'slot', person: slot.dataset.person, minute: slot.dataset.minute };
    if (element.closest('[data-deck-drop]')) return { type: 'deck-drop' };
    if (element.closest('[data-connect]')) return { type: 'handoff' };
    if (element.closest('[data-run-plan]')) return { type: 'run' };
    return null;
  }
  function findPlanFocus(key) {
    if (!key) return null;
    if (key.type === 'task') return Array.prototype.slice.call(planPanel.querySelectorAll('[data-task]')).filter(function (element) { return element.dataset.task === key.id; })[0] || null;
    if (key.type === 'slot') return Array.prototype.slice.call(planPanel.querySelectorAll('[data-slot]')).filter(function (element) { return element.dataset.person === key.person && element.dataset.minute === key.minute; })[0] || null;
    if (key.type === 'deck-drop') return planPanel.querySelector('[data-deck-drop]');
    if (key.type === 'handoff') return planPanel.querySelector('[data-connect]');
    if (key.type === 'run') return planPanel.querySelector('[data-run-plan]');
    return null;
  }
  function revealAndFocus(target, pulse) {
    if (!target) return;
    if (pulse) target.classList.add('is-focus-target');
    window.setTimeout(function () {
      try { target.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch (error) {}
      try { target.focus({ preventScroll: true }); } catch (error) { target.focus(); }
    }, 20);
  }
  function taskBlock(task, laneId, mirror) {
    var def = HIKONE.TASKS.filter(function (entry) { return entry.id === task.id; })[0], text = taskCopy(task.id), col = HIKONE.SLOTS.indexOf(task.startMin) + 2, span = Math.max(1, def.duration / 5);
    if (col < 2) col = 2;
    if (mirror) return '<span class="hk-task-block is-coop is-mirror" aria-hidden="true" style="grid-column:' + col + '/span ' + span + '"><b>' + esc(text[0]) + '</b></span>';
    return '<button type="button" class="hk-task-block' + (task.actor === 'both' ? ' is-coop' : '') + (selectedTask === task.id ? ' is-selected' : '') + '" data-task="' + esc(task.id) + '" data-fix-target="' + esc(task.id) + '" style="grid-column:' + col + '/span ' + span + '" tabindex="' + (selectedTask && selectedTask !== task.id ? '-1' : '0') + '" aria-pressed="' + (selectedTask === task.id ? 'true' : 'false') + '"><b>' + esc(text[0]) + '</b><small>' + formatClock(task.startMin) + ' · ' + def.duration + c().minutes + '</small></button>';
  }
  function laneHtml(personId) {
    var personTasks = state.plan.tasks.filter(function (task) { return task.actor === personId || (task.actor === 'both' && personId === 'prakhar'); });
    var mirrors = state.plan.tasks.filter(function (task) { return task.actor === 'both' && personId === 'nishinaga'; });
    var slots = HIKONE.SLOTS.map(function (minute, index) {
      var selectedDefinition = selectedTask ? HIKONE.TASKS.filter(function (entry) { return entry.id === selectedTask; })[0] : null;
      var targetName = selectedDefinition && selectedDefinition.cooperative ? c().actorShort.both : c().actors[personId];
      var label = selectedTask ? (state.language === 'ja' ? taskCopy(selectedTask)[0] + 'を' + targetName + 'の' + formatClock(minute) + 'へ移動' : 'Move ' + taskCopy(selectedTask)[0] + ' to ' + targetName + ' at ' + formatClock(minute)) : c().actors[personId] + ' · ' + formatClock(minute);
      return '<button type="button" class="hk-slot' + (selectedTask ? ' is-armed' : '') + '" data-slot data-person="' + personId + '" data-minute="' + minute + '" style="grid-column:' + (index + 2) + '" tabindex="' + (selectedTask ? '0' : '-1') + '" aria-label="' + esc(label) + '"></button>';
    }).join('');
    return '<div class="hk-lane" data-person-lane="' + personId + '"><div class="hk-lane-label"><span class="hk-lane-avatar ' + personId + '"></span><strong>' + esc(c().actors[personId]) + '</strong></div>' + personTasks.map(function (task) { return taskBlock(task, personId, false); }).join('') + mirrors.map(function (task) { return taskBlock(task, personId, true); }).join('') + slots + '</div>';
  }
  function renderPlan() {
    setVisible(planPanel, state.phase === 'plan'); if (state.phase !== 'plan') return;
    var oldRail = planPanel.querySelector('.hk-timeline-scroll'), oldScrollLeft = oldRail ? oldRail.scrollLeft : 0;
    var restoreFocus = pendingPlanFocus || planFocusKey(document.activeElement); pendingPlanFocus = null;
    var unplanned = state.plan.tasks.filter(function (task) { return !task.actor; });
    var deck = unplanned.length ? unplanned.map(function (task) { var text = taskCopy(task.id); return '<button type="button" class="hk-deck-task' + (selectedTask === task.id ? ' is-selected' : '') + '" data-task="' + task.id + '" data-fix-target="' + task.id + '" aria-pressed="' + (selectedTask === task.id ? 'true' : 'false') + '"><b>' + esc(text[0]) + '</b><small>' + esc(text[1]) + '</small></button>'; }).join('') : '<span class="hk-deck-empty">' + esc(c().deckEmpty) + '</span>';
    var confirm = state.plan.tasks.filter(function (task) { return task.id === 'confirm-care'; })[0], sourceName = confirm && confirm.actor ? c().actorShort[confirm.actor] : '—';
    var sharedOwner = !!(confirm && confirm.actor === 'nishinaga'), handoffSatisfied = state.plan.connected || sharedOwner;
    planPanel.innerHTML = '<div class="hk-planner-head">' + loopStrip(state.revision ? 'revise' : 'plan') + '<div><span>' + esc(c().planKicker) + '</span><h2>' + esc(c().planTitle) + '</h2></div></div>' +
      '<div class="hk-plan-body"><aside class="hk-deck" id="hk-deck" data-deck><strong>' + esc(c().deck) + '</strong><div>' + deck + '</div><button type="button" class="hk-deck-drop" data-deck-drop' + (selectedTask ? '' : ' disabled') + '>' + esc(c().remove) + '</button></aside>' +
      '<div class="hk-timeline-scroll"><div class="hk-timeline" id="hk-timeline"><div class="hk-time-axis"><span></span>' + HIKONE.SLOTS.map(function (minute) { return '<b>' + formatClock(minute) + '</b>'; }).join('') + '</div>' + laneHtml('prakhar') + laneHtml('nishinaga') + '</div></div></div>' +
      '<div class="hk-connect-row"><div><strong>' + esc(c().connection) + '</strong><small>' + esc(c().connectionHint) + '</small></div><button type="button" id="hk-handoff" class="hk-handoff' + (handoffSatisfied ? ' is-connected' : '') + '" data-connect data-fix-target="handoff" aria-pressed="' + (handoffSatisfied ? 'true' : 'false') + '"' + (sharedOwner ? ' disabled' : '') + '><span>' + esc(sourceName) + '</span><i>→</i><span>' + esc(c().actors.nishinaga) + '</span><b>' + esc(sharedOwner ? c().sameOwner : (state.plan.connected ? c().connected : c().connect)) + '</b></button>' +
      '<button type="button" class="hk-run-plan" id="hk-run-plan" data-run-plan><span>▶</span><b>' + esc(c().runPlan) + '</b><small>' + esc(c().frozen) + '</small></button></div>';
    var newRail = planPanel.querySelector('.hk-timeline-scroll'); if (newRail) newRail.scrollLeft = oldScrollLeft;
    if (!focusPlanTarget() && restoreFocus) revealAndFocus(findPlanFocus(restoreFocus), false);
  }
  function focusPlanTarget() {
    if (!state.focusTarget || lastFocusedTarget === state.revision + ':' + state.focusTarget) return false;
    var selector = state.focusTarget === 'run' ? '#hk-run-plan' : '[data-fix-target="' + state.focusTarget + '"]';
    var target = planPanel.querySelector(selector); if (!target) return false;
    lastFocusedTarget = state.revision + ':' + state.focusTarget; revealAndFocus(target, true); return true;
  }
  function renderRun() {
    setVisible(runPanel, state.phase === 'run'); if (state.phase !== 'run' || !state.run) return;
    var frame = state.run.frame, rows = ['prakhar', 'nishinaga'].map(function (id) { var info = frame.actors[id], task = info.taskId ? taskCopy(info.taskId)[0] : ''; return '<div class="hk-run-person is-' + info.status + '"><span class="hk-run-avatar ' + id + '"></span><strong>' + esc(c().actors[id]) + '</strong><b>' + esc(c().runStatus[info.status]) + '</b><small>' + esc(task) + '</small></div>'; }).join('');
    runPanel.innerHTML = loopStrip('run') + '<div class="hk-run-head"><span>' + esc(c().frozen) + ' · #' + state.attempt + '</span><strong>' + formatClock(frame.atMin) + '</strong></div><div class="hk-run-people">' + rows + '</div>';
  }
  function rootCopy(root) { return root && c().roots[root.code] ? c().roots[root.code] : [root ? root.code : '', '']; }
  function renderReport() {
    setVisible(reportPanel, state.phase === 'observe'); if (state.phase !== 'observe' || !state.report) return;
    var report = state.report, primary = report.primaryRoot, copyRoot = rootCopy(primary), secondary = report.roots.slice(1);
    var title = report.success ? c().cleanTitle : formatClock(primary.atMin) + ' · ' + copyRoot[0], summary = report.success ? c().cleanSummary : copyRoot[1];
    var secondaryHtml = secondary.length ? '<div class="hk-report-also"><strong>' + esc(c().also) + '</strong>' + secondary.map(function (root) { return '<span>' + formatClock(root.atMin) + ' · ' + esc(rootCopy(root)[0]) + '</span>'; }).join('') + '</div>' : '';
    var reportAction = report.success ? 'continue' : (primary.code === 'engine-unavailable' ? 'reload' : 'revise');
    var reportActionLabel = reportAction === 'continue' ? c().continue : (reportAction === 'reload' ? c().reload : c().revise);
    var reportActionId = reportAction === 'continue' ? 'hk-continue' : (reportAction === 'reload' ? 'hk-reload' : 'hk-revise-plan');
    reportPanel.innerHTML = loopStrip('observe') + '<div class="hk-report-copy"><span class="hk-report-kicker">' + esc(c().reportKicker) + ' · #' + state.attempt + '</span><h2 tabindex="-1" id="hk-report-title">' + esc(title) + '</h2><p>' + esc(summary) + '</p>' + secondaryHtml + '</div>' +
      '<div class="hk-report-evidence"><strong>' + esc(c().evidence) + '</strong><span><b>' + esc(c().wait) + '</b>' + report.waitMinutes + c().minutes + '</span><span><b>' + esc(c().detour) + '</b>' + report.detourMinutes + c().minutes + '</span><span><b>' + esc(c().departure) + '</b>' + (report.departureMin == null ? '—' : formatClock(report.departureMin)) + '</span></div>' +
      '<button type="button" class="hk-report-action" id="' + reportActionId + '" data-report-action="' + reportAction + '">' + esc(reportActionLabel) + '<span>→</span></button>';
    var reportFocusKey = state.attempt + ':' + report.fingerprint;
    if (lastReportFocusKey !== reportFocusKey) {
      lastReportFocusKey = reportFocusKey;
      window.setTimeout(function () { var titleEl = document.getElementById('hk-report-title'); if (titleEl) titleEl.focus({ preventScroll: true }); }, 20);
    }
  }
  function renderCopy() {
    langEn.setAttribute('aria-pressed', state.language === 'en' ? 'true' : 'false'); langJa.setAttribute('aria-pressed', state.language === 'ja' ? 'true' : 'false');
    soundButton.setAttribute('aria-pressed', sound ? 'true' : 'false'); soundButton.title = sound ? c().soundOn : c().soundOff; soundButton.querySelector('b').textContent = soundButton.title; exit.querySelector('b').textContent = c().exit;
    var speakerText = '', speechText = '', objectiveText = '', hintText = '', actionMarkup = '';
    if (state.phase === 'arrival') { speakerText = c().actors.watanabe; speechText = c().arrivalSpeech; objectiveText = c().arrivalObjective; hintText = c().arrivalHint; actionMarkup = '<button type="button" id="hk-start" data-action="start">' + esc(c().start) + '</button>'; }
    if (state.phase === 'plan') { objectiveText = c().planObjective; hintText = c().planHint; }
    if (state.phase === 'run') objectiveText = c().runObjective;
    if (state.phase === 'observe') objectiveText = c().observeObjective;
    if (state.phase === 'drive') { speakerText = c().actors.watanabe; speechText = c().driveSpeech; objectiveText = c().driveObjective; }
    if (state.phase === 'lake') { speakerText = c().actors.watanabe; speechText = c().lakeLines[Math.min(state.payoffStep, c().lakeLines.length - 1)]; objectiveText = c().location.lake; }
    if (state.phase === 'home') { speakerText = c().actors.watanabe; speechText = c().complete; objectiveText = c().homeObjective; actionMarkup = '<button type="button" id="hk-replay" data-action="replay">' + esc(c().replay) + '</button><a id="hk-campaign" href="index.html">' + esc(c().campaign) + '</a>'; }
    setText(speaker, speakerText); setText(speech, speechText); setText(objective, objectiveText); setText(hint, hintText);
    if (actions.innerHTML !== actionMarkup) actions.innerHTML = actionMarkup;
  }
  function render() { renderWorld(); renderPlan(); renderRun(); renderReport(); renderCopy(); syncTimers(); }
  function dispatch(action, quiet) {
    var previous = state; state = HIKONE.reduce(state, action); if (action.type === 'MOVE_TASK' || action.type === 'UNPLACE_TASK') selectedTask = null;
    render();
    var repeatableFeedback = action.type === 'MOVE_TASK' || action.type === 'UNPLACE_TASK' || action.type === 'CONNECT_HANDOFF' || state.lastEvent.type === 'refusal';
    if (!quiet && (repeatableFeedback || state.lastEvent.code !== previous.lastEvent.code)) showEvent(state.lastEvent);
    if (state.completed && !previous.completed) HIKONE.saveCompletion(window.localStorage, state);
  }
  function duration(ms) { return reducedMotion.matches ? Math.min(180, ms) : ms; }
  function schedule(key, ms, action) { if (timers[key]) return; timers[key] = window.setTimeout(function () { timers[key] = null; dispatch(action); }, duration(ms)); }
  function syncTimers() {
    if (state.phase === 'run' && state.run) schedule('run-' + state.run.frameIndex, 620, { type: 'RUN_TICK' });
    if (state.phase === 'drive') schedule('drive', 1900, { type: 'DRIVE_TICK' });
    if (state.phase === 'lake') schedule('lake-' + state.payoffStep, 1450, { type: 'PAYOFF_TICK' });
  }
  function handlePlanClick(target) {
    var task = target.closest('[data-task]'), slot = target.closest('[data-slot]');
    if (task) {
      selectedTask = task.dataset.task;
      var selectedState = state.plan.tasks.filter(function (entry) { return entry.id === selectedTask; })[0];
      pendingPlanFocus = { type: 'slot', person: selectedState && selectedState.actor === 'nishinaga' ? 'nishinaga' : 'prakhar', minute: String(selectedState ? selectedState.startMin : HIKONE.SLOTS[0]) };
      renderPlan(); return;
    }
    if (slot && selectedTask) {
      var def = HIKONE.TASKS.filter(function (entry) { return entry.id === selectedTask; })[0];
      pendingPlanFocus = { type: 'task', id: selectedTask };
      dispatch({ type: 'MOVE_TASK', taskId: selectedTask, actor: def.cooperative ? 'both' : slot.dataset.person, startMin: Number(slot.dataset.minute) }); return;
    }
    if (target.closest('[data-deck-drop]') && selectedTask) { pendingPlanFocus = { type: 'task', id: selectedTask }; dispatch({ type: 'UNPLACE_TASK', taskId: selectedTask }); return; }
    if (target.closest('[data-connect]')) { dispatch({ type: 'CONNECT_HANDOFF', connected: !state.plan.connected }); return; }
    if (target.closest('[data-run-plan]')) { dispatch({ type: 'RUN_PLAN' }); }
  }
  function clearDrag() {
    planPanel.classList.remove('is-pointer-dragging');
    if (!drag) return;
    drag.element.classList.remove('is-dragging'); drag.element.style.translate = '';
    if (drag.ghost && drag.ghost.parentNode) drag.ghost.parentNode.removeChild(drag.ghost);
    drag = null;
  }
  function moveDragGhost(event) {
    if (!drag.ghost) {
      drag.ghost = drag.element.cloneNode(true); drag.ghost.removeAttribute('id'); drag.ghost.removeAttribute('data-fix-target'); drag.ghost.removeAttribute('aria-pressed'); drag.ghost.setAttribute('aria-hidden', 'true'); drag.ghost.tabIndex = -1; drag.ghost.classList.add('hk-drag-ghost');
      drag.ghost.style.width = drag.rect.width + 'px'; drag.ghost.style.height = drag.rect.height + 'px'; document.body.appendChild(drag.ghost);
    }
    drag.ghost.style.left = (event.clientX - drag.offsetX) + 'px'; drag.ghost.style.top = (event.clientY - drag.offsetY) + 'px';
  }
  planPanel.addEventListener('pointerdown', function (event) {
    var task = event.target.closest('[data-task]'); if (!task) return;
    var rect = task.getBoundingClientRect();
    drag = { pointerId: event.pointerId, element: task, taskId: task.dataset.task, x: event.clientX, y: event.clientY, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top, rect: rect, ghost: null, moved: false };
    if (task.setPointerCapture) task.setPointerCapture(event.pointerId);
  });
  planPanel.addEventListener('pointermove', function (event) {
    if (!drag || drag.pointerId !== event.pointerId) return; var dx = event.clientX - drag.x, dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
    if (drag.moved) {
      planPanel.classList.add('is-pointer-dragging');
      drag.element.classList.add('is-dragging'); moveDragGhost(event);
      var rail = planPanel.querySelector('.hk-timeline-scroll'); if (rail) { var bounds = rail.getBoundingClientRect(), edge = Math.min(52, bounds.width * .2); if (event.clientX < bounds.left + edge) rail.scrollLeft -= 9; if (event.clientX > bounds.right - edge) rail.scrollLeft += 9; }
    }
  });
  planPanel.addEventListener('pointerup', function (event) {
    if (!drag || drag.pointerId !== event.pointerId) return; var source = drag, moved = drag.moved;
    source.element.style.pointerEvents = 'none'; var target = document.elementFromPoint(event.clientX, event.clientY); source.element.style.pointerEvents = ''; clearDrag();
    if (!moved) return;
    event.preventDefault(); suppressClickUntil = Date.now() + 300; var slot = target && target.closest('[data-slot]'), deck = target && target.closest('[data-deck]');
    if (slot) { var def = HIKONE.TASKS.filter(function (entry) { return entry.id === source.taskId; })[0]; pendingPlanFocus = { type: 'task', id: source.taskId }; dispatch({ type: 'MOVE_TASK', taskId: source.taskId, actor: def.cooperative ? 'both' : slot.dataset.person, startMin: Number(slot.dataset.minute) }); }
    else if (deck) { pendingPlanFocus = { type: 'task', id: source.taskId }; dispatch({ type: 'UNPLACE_TASK', taskId: source.taskId }); }
  });
  planPanel.addEventListener('pointercancel', clearDrag); planPanel.addEventListener('lostpointercapture', function () { if (drag && drag.moved) clearDrag(); });
  planPanel.addEventListener('click', function (event) { if (Date.now() < suppressClickUntil) { event.preventDefault(); return; } handlePlanClick(event.target); });
  planPanel.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || !selectedTask) return;
    var cancelledTask = selectedTask; selectedTask = null; pendingPlanFocus = { type: 'task', id: cancelledTask }; event.preventDefault(); renderPlan(); showEvent({ type: 'status', code: 'selection-cancelled' });
  });
  actions.addEventListener('click', function (event) {
    var action = event.target.closest('[data-action]'); if (!action) return;
    if (action.dataset.action === 'start') dispatch({ type: 'START' });
    if (action.dataset.action === 'replay') { Object.keys(timers).forEach(function (key) { window.clearTimeout(timers[key]); timers[key] = null; }); selectedTask = null; lastFocusedTarget = null; lastReportFocusKey = null; dispatch({ type: 'RESTART' }); }
  });
  reportPanel.addEventListener('click', function (event) {
    var action = event.target.closest('[data-report-action]'); if (!action) return;
    if (action.dataset.reportAction === 'revise') dispatch({ type: 'REVISE_PLAN' });
    if (action.dataset.reportAction === 'continue') dispatch({ type: 'CONTINUE_PAYOFF' });
    if (action.dataset.reportAction === 'reload') window.location.reload();
  });
  langEn.addEventListener('click', function () { dispatch({ type: 'SET_LANG', language: 'en' }, true); buildWorld(); render(); });
  langJa.addEventListener('click', function () { dispatch({ type: 'SET_LANG', language: 'ja' }, true); buildWorld(); render(); });
  soundButton.addEventListener('click', function () { sound = !sound; renderCopy(); announce(sound ? c().soundOn : c().soundOff); if (sound) tone('success'); });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener('change', render);
  buildWorld(); render();
}
