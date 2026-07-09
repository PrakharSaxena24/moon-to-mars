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

  // ---- fishday tunables (the representative fishing day runs on a minute clock) ----
  var MIN_DT = 5;                // minutes per fine tick
  var DAY_START_MIN = 240;       // 04:00 — window opens (covers the 04:15 pre-dawn intelligence)
  var DAY_END_MIN = 1200;        // 20:00 — window closes
  var IDLE_TOL = 0;              // idle minutes tolerated before handoffTiming fires
  var IDLE_CAP = 60;             // idle charged to a task whose needed arrow was never drawn
  var CHANNELS = { faceToFace: 0, radio: 1, phone: 2, chat: 10, board: 30 }; // send latency, minutes

  // §13.1/refinement-1: species -> allergen CATEGORY map, so the allergy gate checks a real
  // category intersection (ic_food.allergens holds category tokens like 'shellfish') instead
  // of a literal species/category string match. skipjack/mackerel are 'fish' (never intersects
  // a 'shellfish' allergen); shrimp/crab/prawn/lobster are 'shellfish' (correctly FAILS).
  var SPECIES_CATEGORIES = {
    skipjack: ['fish'], mackerel: ['fish'], tuna: ['fish'], sabaFish: ['fish'],
    shrimp: ['shellfish'], crab: ['shellfish'], prawn: ['shellfish'], lobster: ['shellfish']
  };

  // ---- coarse-day (arrival/ops/return) READ-ONLY hour-Gantt tunables (SPEC v2 §ENGINE) ----
  var DAY_HOUR_START = 300;      // 05:00 — coarse-day grid window opens
  var DAY_HOUR_END = 1140;       // 19:00 — coarse-day grid window closes (14h window)
  var HOUR_DT = 60;              // one hour, in minutes — the coarse grid's display granularity

  // ---- §20 authorable all-days tunables (DATA ONLY in this phase — nothing reads these yet) ----
  // SNAP_MIN: per-segment placement-snap granularity for the future draggable editor.
  // DAY_WINDOWS: the authoring window [openMin,closeMin] per segment (mirrors DAY_START_MIN/
  // DAY_END_MIN for fishday and DAY_HOUR_START/DAY_HOUR_END for the coarse days, unified).
  // AUTHORABLE: the segment ids the future deck→arrange→connect editor will cover.
  var SNAP_MIN = { arrival: 60, ops: 60, return: 60, fishday: 15 };
  var DAY_WINDOWS = { fishday: [DAY_START_MIN, DAY_END_MIN], arrival: [DAY_HOUR_START, DAY_HOUR_END],
    ops: [DAY_HOUR_START, DAY_HOUR_END], return: [DAY_HOUR_START, DAY_HOUR_END] };
  var AUTHORABLE = ['arrival', 'ops', 'return', 'fishday'];

  function mulberry32(seed) { var a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function L(en, jp) { return { en: en, jp: jp }; }

  // ---- the site map: zones where characters gather (spec §8 simulation screen) ----
  // Map geography (2026-07-07): LAND on the left (the buildings), OCEAN on the right; Port sits at the shore
  // (land↔water edge), the iso rock island is out in the right-hand ocean. See WORLD.md §4-§5.
  // Map geography (2026-07-07): LAND left, OCEAN right. HINATA is the big command-centre compound (planning +
  // kitchen + rod-check/load + discussion); the old separate Command folds into it (hidden). Finance hidden for
  // now. Port = the shore; the iso rock is out in the ocean. `hub`/`hidden` are render hints (engine ignores them).
  var STATIONS = [
    { id: 'command', name: L('Command', '司令部'), icon: '🏛️', x: 0.30, y: 0.44, hidden: true },  // folded into Hinata
    { id: 'port',    name: L('Port', '港'),         icon: '⚓', x: 0.52, y: 0.56 },  // the shore (land↔ocean edge)
    { id: 'vessel',  name: L('Iso rock', '磯'),     icon: '🪨', x: 0.82, y: 0.72 },  // OCEAN — the iso fishing rock
    { id: 'lodging', name: L('Lodging', '宿'),      icon: '🏨', x: 0.13, y: 0.78 },  // land — lodging, bottom-left
    { id: 'mess',    name: L('Hinata', 'ひなた'),   icon: '🍽️', x: 0.30, y: 0.44, hub: true },     // land — the big Hinata compound (command/kitchen/rods/transport/clinic)
    { id: 'finance', name: L('Finance', '会計'),    icon: '🧮', x: 0.30, y: 0.44, hidden: true },   // hidden for now (folded into the hub)
    { id: 'clinic',  name: L('Clinic', '診療所'),   icon: '⛑️', x: 0.30, y: 0.44, hidden: true }   // folded into Hinata (clinic is also Hinata)
  ];
  function station(id) { for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i]; return STATIONS[0]; }

  // The trip is rehearsed one DAY/segment at a time: pick a day, plan it, run it.
  var SEGMENTS = [
    { id: 'arrival', phaseEn: 'Day 1 · Arrival',              name: L('Day 1 · Arrival', '1日目・到着') },
    { id: 'ops',     phaseEn: 'Days 2–9 · Daily operations',  name: L('Days 2–9 · Operations', '2〜9日目・運営') },
    { id: 'return',  phaseEn: 'Day 10 · Return & shipping',   name: L('Day 10 · Return', '10日目・帰着') },
    { id: 'fishday', phaseEn: 'Day 3 · Fishing day',          name: L('Day 3 · Fishing day (minute-level)', '3日目・代表釣行日（分刻み）') }
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

  // lane order for the coarse-day read-only Gantt (SPEC v2 §ENGINE dayLayout)
  var ROLE_ORDER = ['owner', 'pm', 'siteLead', 'budgetLead', 'safetyLead', 'logi', 'comms', 'specialist', 'chef'];

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
        wrongFishPenaltyMin: o.wfPenalty || 0, guestFacing: !!o.guest };
    }
    // §20.3 — HD() mirrors FD() for the three authorable coarse days (arrival/ops/return):
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
        safetyFlag: !!o.safetyFlag }; // §13.1: decoy debit is safety-flavored (-3) when true, else -2
    }
    // §7/§13.4 P2 seed re-tune — Arrival ships PRE-CLEARED (empty board) as the tutorial: the
    // required tasks below are authored with their full canonical placement (assignedIds/
    // startMin/durMin), captured into arrivalCanonPlacement, then blanked to assignedIds:[] so
    // the SHIPPED template hands the player an empty board. canonDay('arrival')/applyDayFix use
    // arrivalCanonPlacement to restore the placements (not just the handoffs) so the canonical
    // Arrival still reaches its full 15/15 (§13.4 acceptance).
    var arrivalReqTasks = [
      HD('hd_a_ferrycheck',   'Confirm ferry departure & manifest', '船便出港時刻・乗船名簿確認',       'port',    'pm',         ['p02'], 300, 60,  { produces: ['ic_ferry'] }),
      HD('hd_a_board',        'Ferry boarding & assemble',          '乗船確認・集合',                   'port',    'logi',       ['p06'], 360, 60,  { deps: ['hd_a_ferrycheck'], info: ['ic_ferry'] }),
      HD('hd_a_cross',        'Sea crossing & seasickness watch',   '渡航・船酔い対応',                 'vessel',  'siteLead',   ['p03'], 420, 180, { deps: ['hd_a_board'], diff: 3 }),
      HD('hd_a_checkin',      'Check-in & room assignment',         '受付・部屋割り',                   'lodging', 'logi',       ['p06'], 600, 60,  { deps: ['hd_a_cross'], produces: ['ic_rooms'] }),
      HD('hd_a_foodsource',   'Food source & allergy check',        '食材調達・アレルギー確認',         'finance', 'budgetLead', ['p04'], 660, 60,  { produces: ['ic_food'] }),
      HD('hd_a_intake',       'Supply & gear intake (drinks, tackle, food, ice)', '物資・釣具搬入（飲料・釣具・食材・氷）', 'lodging', 'logi', ['p06'], 660, 60, { deps: ['hd_a_checkin'], produces: ['ic_tackle'], res: ['storage'] }),
      HD('hd_a_safety',       'Safety briefing',                    '安全説明会',                       'clinic',  'safetyLead', ['p05'], 660, 60,  { diff: 3 }),
      HD('hd_a_gearstow',     'Gear stow',                          '道具収納',                         'port',    'specialist', ['p08'], 720, 60,  { deps: ['hd_a_intake'], info: ['ic_tackle'] }),
      HD('hd_a_dinnerprep',   'First-night meal prep',              '初日夕食仕込み',                   'mess',    'chef',       ['p09', 'p10'], 720, 120, { deps: ['hd_a_intake'], info: ['ic_food'], res: ['food'], diff: 3 }),
      HD('hd_a_headcount',    'Arrival headcount',                  '到着点呼',                         'port',    'comms',      ['p07'], 840, 60,  { deps: ['hd_a_checkin'], info: ['ic_rooms'] }),
      HD('hd_a_dinnerserve',  'First-night meal service',           '初日夕食提供',                     'mess',    'chef',       ['p09', 'p10', 'p11'], 1080, 60, { deps: ['hd_a_dinnerprep'], res: ['food'], guestFacing: true })
    ];
    var arrivalCanonPlacement = {};
    // §7/§13.4 refinement-3: HALF-clear (not all 11) — leave the early-morning chain placed
    // (ferry check -> board -> cross -> checkin -> intake -> headcount, 6 tasks) and clear the
    // later/independent ones (food source, safety briefing, gear stow, dinner prep/serve, 5
    // tasks), so authoring Arrival (canonDay/applyDayFix) is a ~+7-8 lever, not +14 — fixHandoffs
    // stays the dominant single jump (§1 invariant). canonPlacement still captures ALL 11 so
    // canonDay('arrival')/applyDayFix restore the full roster regardless of what ships blank.
    var ARRIVAL_CLEARED = { hd_a_foodsource: 1, hd_a_safety: 1, hd_a_gearstow: 1, hd_a_dinnerprep: 1, hd_a_dinnerserve: 1 };
    arrivalReqTasks.forEach(function (t) {
      arrivalCanonPlacement[t.id] = { assignedIds: t.assignedIds.slice(), startMin: t.startMin, durMin: t.durMin };
      if (ARRIVAL_CLEARED[t.id]) t.assignedIds = [];   // ships blank — the half-cleared tutorial board
    });
    return {
      project: {
        id: 'ogasawara10',
        name: L('Ogasawara 10-Day Company Retreat', '小笠原10日間 社員イベント'),
        goal: L('Build cross-company bonds over a 10-day shared stay and fishing — safely and within budget.',
                'グループ会社横断メンバーが10日間共に生活し、釣り体験を通じて、安全かつ予算内で結束を深める。'),
        days: DAYS, location: L('Ogasawara (Chichijima)', '小笠原（父島）'), headcount: HEADCOUNT, staff: STAFF, guests: GUESTS, chefs: CHEFS,
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
        { id: 't01', name: L('Ferry boarding & assemble', '乗船確認・集合'),          station: 'port',    phase: pA,   ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 0, dur: 1,   deps: [],          difficulty: 2, neededResources: ['bus'],     neededInfo: ['ic_ferry'],    neededAuthority: null },
        { id: 't02', name: L('Sea crossing & seasickness', '渡航・船酔い対応'),       station: 'vessel',  phase: pA,   ownerRoleId: 'siteLead',   assignedIds: ['p03', 'p05'],        startDay: 0, dur: 1,   deps: ['t01'],     difficulty: 3, neededResources: ['medkit'],  neededInfo: ['ic_ferry'],    neededAuthority: null },
        { id: 't03', name: L('Check-in & room assignment', '受付・部屋割り'),         station: 'lodging', phase: pA,   ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 0, dur: 1.5, deps: ['t02'],     difficulty: 1, neededResources: ['keys'],    neededInfo: ['ic_rooms'],    neededAuthority: null },
        { id: 't_intake', name: L('Supply & gear intake (drinks, tackle, food, ice)', '物資・釣具搬入（飲料・釣具・食材・氷）'), station: 'lodging', phase: pA, ownerRoleId: 'logi', assignedIds: ['p06'], startDay: 0, dur: 1.5, deps: ['t02'], difficulty: 2, neededResources: ['storage'], neededInfo: ['ic_tackle'], neededAuthority: null },
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
        { id: 't_ship', name: L('Ship remaining supplies & teardown', '残置物の発送・撤収'), station: 'port', phase: pR, ownerRoleId: 'logi',     assignedIds: [],                    startDay: 9, dur: 1,   deps: ['t_clean'], difficulty: 3, neededResources: ['shipping'],neededInfo: ['ic_tackle'],   neededAuthority: null }, // GAP G: unstaffed
        { id: 't_settle', name: L('Final settlement & receipts', '最終精算・領収書'),  station: 'finance', phase: pR,   ownerRoleId: 'budgetLead', assignedIds: ['p04'],               startDay: 9, dur: 1,   deps: ['t11'],     difficulty: 2, neededResources: ['cash'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't12', name: L('Return headcount & departure', '帰着点呼・出発'),        station: 'port',    phase: pR,   ownerRoleId: 'comms',      assignedIds: ['p07', 'p03'],        startDay: 9, dur: 1,   deps: ['t_ship'],  difficulty: 2, neededResources: [],          neededInfo: ['ic_return'],   neededAuthority: null },

        // --- Day 3 · THE representative fishing day, minute-level (§5.3, scores 100 as shipped-with-fixes) ---
        // PHASE 0 · pre-dawn intelligence (04:15–05:30)
        FD('t_f_food',       'Confirm supply & allergy list', '食材調達・アレルギー確認', 'finance', 'budgetLead', ['p04'], 255, 30, { produces: ['ic_food'] }),
        FD('t_f_weather',    'Dawn weather & sea check, set abort', '早朝海況確認・中止基準設定', 'clinic', 'safetyLead', ['p05'], 270, 30, { produces: ['ic_weather'], auth: 'abort', diff: 3 }),
        FD('t_f_orgfood',    'Collect organizer dinner requests', '運営の夕食希望とりまとめ', 'command', 'comms', ['p07'], 270, 15, { produces: ['ic_orgfood'], diff: 1 }),
        FD('t_f_menu',       'Menu & portions (18 = 13 guests + 5)', '献立・食数決定（13名＋運営5食）', 'mess', 'chef', ['p09'], 300, 30, { info: ['ic_food', 'ic_weather', 'ic_orgfood'], produces: ['ic_menu'], res: ['food'], diff: 3 }),
        FD('t_f_tackleprep', 'Morning tackle & ice prep', '釣具・氷の朝準備', 'port', 'logi', ['p06'], 300, 30, { produces: ['ic_tackle'], res: ['tackle', 'ice'] }),
        // PHASE 1 · rig to the menu, set the heading (05:30–07:00)
        FD('t_f_gearload',   'Gear pre-check & load boat', '道具最終確認・積込', 'port', 'specialist', ['p08'], 330, 45, { info: ['ic_menu', 'ic_tackle'], produces: ['ic_target'], assumeOn: ['ic_menu'], diff: 3 }),
        FD('t_f_route',      'Route & heading plan (fold in hard return)', '進路・漁場計画（帰港時刻厳守）', 'vessel', 'siteLead', ['p03'], 375, 30, { info: ['ic_menu', 'ic_target', 'ic_weather'], produces: ['ic_ground'], assumeOn: ['ic_menu', 'ic_target'], diff: 3 }),
        FD('t_f_headcount1', 'Departure headcount', '出港点呼', 'port', 'comms', ['p07'], 405, 15, { produces: ['ic_headcount'], diff: 1 }),
        // PHASE 2 · depart & fish (07:00–12:45)
        FD('t_f_depart',     'Depart & transit to ground', '出港・漁場へ移動', 'vessel', 'siteLead', ['p03'], 420, 60, { deps: ['t_f_route'], info: ['ic_ground', 'ic_headcount'], res: ['boat'], diff: 3 }),
        FD('t_f_rig',        'Rig en route', '航行中の仕掛け準備', 'vessel', 'specialist', ['p08'], 420, 60, { deps: ['t_f_gearload'], info: ['ic_ground'], assumeOn: ['ic_ground'] }),
        FD('t_f_seawatch',   'Sea watch (abort authority aboard)', '海上安全監視（中止権限）', 'vessel', 'safetyLead', ['p05'], 420, 420, { info: ['ic_weather'], auth: 'abort', diff: 4 }),
        FD('t_f_triplog',    'Trip log & shore contact', '航海記録・陸上連絡', 'command', 'comms', ['p07'], 420, 330, { diff: 1 }),
        FD('t_f_hold',       'Hold station at the ground', '漁場で操船保持', 'vessel', 'siteLead', ['p03'], 480, 270, { deps: ['t_f_depart'], res: ['boat'], diff: 3 }),
        FD('t_f_fish',       'FISHING — catch to target', '釣り（目標数まで）', 'vessel', 'specialist', ['p08'], 480, 270, { deps: ['t_f_rig'], info: ['ic_ground'], assumeOn: ['ic_ground'], res: ['tackle'], diff: 4 }),
        FD('t_f_lunch',      'Guest lunch service', 'ゲスト昼食提供', 'mess', 'chef', ['p10', 'p11'], 660, 60, { res: ['food'], guest: true }),
        FD('t_f_tally',      'Catch tally & radio relay', '漁獲集計・無線連絡', 'vessel', 'specialist', ['p08'], 750, 15, { deps: ['t_f_fish'], produces: ['ic_catch'], diff: 1 }),
        // PHASE 2b · owner & PM flex/standby (§13.1) — low-stakes, no neededInfo/deps, so they
        // cannot alter the canonical cascade: remote work on another project / join the fishing /
        // help the galley if needed (normally not needed). Gives 8 organizer lanes + galley = 9 exec atoms.
        FD('t_f_flex_owner', 'Owner standby (remote work / join fishing / help galley if needed)', '代表待機（別件のリモート対応・釣り同行・厨房手伝いなど）', 'command', 'owner', ['p01'], 480, 60, { diff: 1 }),
        FD('t_f_flex_pm',    'PM standby (remote coordination / join fishing / help galley if needed)', '総合責任者待機（リモート調整・釣り同行・厨房手伝いなど）', 'command', 'pm', ['p02'], 600, 60, { diff: 1 }),
        // PHASE 3 · relay -> return -> cook backward from 18:00 (12:45–18:45)
        FD('t_f_return',     'Return transit (dockside 14:00)', '帰港（14:00接岸）', 'vessel', 'siteLead', ['p03'], 765, 75, { deps: ['t_f_tally'], res: ['boat'], diff: 3 }),
        FD('t_f_stow',       'Stow gear en route', '帰航中の道具収納', 'vessel', 'specialist', ['p08'], 765, 75, { deps: ['t_f_tally'], diff: 1 }),
        FD('t_f_sideprep',   'Side prep & lock final food count', '副菜仕込み・食数確定', 'mess', 'chef', ['p09', 'p10', 'p11'], 780, 105, { info: ['ic_ground', 'ic_catch'], res: ['food'], diff: 3 }),
        FD('t_f_land',       'Land & deliver catch', '接岸・漁獲引渡し', 'port', 'specialist', ['p08'], 840, 20, { deps: ['t_f_return', 't_f_stow'], diff: 1 }),
        FD('t_f_headcount2', 'Return headcount', '帰着点呼', 'port', 'comms', ['p07'], 840, 15, { deps: ['t_f_return'], info: ['ic_headcount'], diff: 1 }),
        FD('t_f_dock',       'Dock & secure the boat', '係留・船整理', 'port', 'siteLead', ['p03'], 840, 30, { deps: ['t_f_return'], res: ['boat'], diff: 1 }),
        FD('t_f_health',     'Crew health check', '帰港後健康チェック', 'clinic', 'safetyLead', ['p05'], 840, 30, { deps: ['t_f_seawatch'], res: ['medkit'], diff: 1 }),
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
        { id: 'ic_ferry',    name: L('Ferry departure time', '船の出港時刻'),       reason: L('Everyone must reach the boat on time; a miss cascades 24h.', '全員が定刻に乗船する必要。逃すと24時間遅延。'),
          ownerRoleId: 'pm',         recipientRoleIds: ['pm'],                                       shareTiming: L('night before 20:00 + morning', '前日20時＋当日朝'), secrecy: 'all', impactIfUnshared: L('Confusion, missed boat, 24h delay.', '混乱・乗り遅れ・24時間遅延。') }, // GAP C: only PM
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
          ownerRoleId: 'budgetLead', recipientRoleIds: ['siteLead', 'logi', 'budgetLead'],           shareTiming: L('day before', '前日'), secrecy: 'role', impactIfUnshared: L('On-site purchase stalls when cards fail.', 'カード不通時に現地購入が止まる。') }
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
          { id: 'bl_onsite',    name: L('On-site / misc', '現地費'), cap: 300000, spent: 0, approverRoleId: 'siteLead', payMethod: 'cash', receiptRule: 'lenient' }
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
      // §20.3 — plan.days: the three authorable coarse-day rosters (arrival/ops/return),
      // Phase 1 (DATA ONLY — nothing in score()/detect()/createSim/mergePlan reads this
      // yet; Phase 2 wires it up). fishday is intentionally ABSENT — its data stays in
      // plan.tasks/plan.handoffs (frozen, byte-identical to before this change).
      //
      // Each day is { tasks:[HD(...)...], handoffs:[H(...)...], decoys:[taskId...] }.
      // `tasks` holds BOTH the required roster (required:true, the default) and the
      // decoys (required:false); `decoys` is just the id list into that same array.
      // Every day ships fully staffed & wired here on 60-min quanta within [300,1140] —
      // a canonical "would score 100" reference the future scoreDay/canonDay(seg) checks
      // against — mirroring canonHandoffs()'s role for fishday. Each day's handoffs reuse
      // the existing infoCards catalog (ic_ferry/ic_rooms/ic_tackle/ic_food/ic_catch/
      // ic_cash/ic_return — no new cards were needed) and include 2–3 handoffs that are
      // deliberately back-to-back (producer task ends the exact minute the consumer task
      // starts), each drawn on a near-zero-latency channel (faceToFace/radio) so the
      // canonical arrangement is zero-idle — exactly the arrangement a slower channel
      // (chat +10 / board +30) would push late once Phase 2's daySchedule prices it.
      // ===========================================================================
      days: {
        arrival: {
          // required roster ships PRE-CLEARED (assignedIds:[] — see arrivalReqTasks above, §7/§13.4
          // P2); decoys (3, plausible-but-wrong, never in the required set) always start unplaced too.
          tasks: arrivalReqTasks.concat([
            HD('hd_a_dec_nightfish',   'Night beach fishing',      '夜釣り',                   'vessel', 'specialist', [], 1080, 60, { required: false, diff: 3, safetyFlag: true }),
            HD('hd_a_dec_sightseeing', 'Sightseeing detour',       '観光への立ち寄り',         'port',   'logi',       [], 480,  60, { required: false }),
            HD('hd_a_dec_soloTackle',  'Early solo tackle test',   '個人的な早朝釣具テスト',   'port',   'specialist', [], 300,  60, { required: false })
          ]),
          canonPlacement: arrivalCanonPlacement,
          handoffs: [
            H('h_a_ferry', 'ic_ferry',  'pm',         'hd_a_ferrycheck', 'logi',       'hd_a_board',      { type: 'onTaskDone', taskId: 'hd_a_ferrycheck' }, 'faceToFace', 'idle', null,
              'Ferry departs 06:00 sharp · full manifest confirmed', '船便6:00定刻出港・乗船名簿確認済'),
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
            HD('hd_o_weather',     'Weather & safety check',           '天候・安全確認',           'clinic',  'safetyLead', ['p05'], 300, 60,  { produces: ['ic_weather'], diff: 3 }),
            HD('hd_o_tackleprep',  'Tackle prep',                      '釣具準備',                 'port',    'logi',       ['p06'], 300, 60,  { produces: ['ic_tackle'], res: ['tackle'] }),
            HD('hd_o_shorefish',   'Shore-fishing session',            '陸釣り',                   'port',    'specialist', ['p08'], 360, 240, { deps: ['hd_o_weather', 'hd_o_tackleprep'], info: ['ic_weather', 'ic_tackle'], produces: ['ic_catch'], res: ['tackle'], diff: 3 }),
            HD('hd_o_catchhandle', 'Catch handling & ice',             '漁獲処理・保管',           'mess',    'logi',       ['p06'], 600, 60,  { deps: ['hd_o_shorefish'], info: ['ic_catch'], res: ['ice'] }),
            HD('hd_o_foodprep',    'Food prep',                        '食材仕込み',               'mess',    'chef',       ['p09', 'p10'], 300, 120, { res: ['food'], diff: 3 }),
            HD('hd_o_foodsource',  'Food source & allergy check',      '食材調達・アレルギー確認', 'finance', 'budgetLead', ['p04'], 300, 60,  { produces: ['ic_food'] }),
            HD('hd_o_lunch',       'Guest lunch service',              'ゲスト昼食提供',           'mess',    'chef',       ['p09', 'p10', 'p11'], 660, 60, { deps: ['hd_o_foodprep'], res: ['food'], guestFacing: true }),
            HD('hd_o_dinnerprep',  'Dinner prep',                      '夕食仕込み',               'mess',    'chef',       ['p09', 'p10'], 780, 120, { deps: ['hd_o_lunch'], info: ['ic_food'], res: ['food'], diff: 3 }),
            HD('hd_o_dinnerserve', 'Dinner service',                   '夕食提供',                 'mess',    'chef',       ['p09', 'p10', 'p11'], 1080, 60, { deps: ['hd_o_dinnerprep'], res: ['food'], guestFacing: true }),
            HD('hd_o_accounting',  'Daily accounting & reconcile',     '日次精算・領収書',         'finance', 'budgetLead', ['p04'], 720, 60,  { res: ['cash'] }),
            HD('hd_o_report',      'Daily report & catch log',         '日次報告・釣果記録',       'command', 'comms',      ['p07'], 960, 60,  { deps: ['hd_o_catchhandle'], info: ['ic_catch'] }),
            HD('hd_o_clean',       'Cleaning & lodging upkeep',        '清掃・宿泊管理',           'lodging', 'logi',       ['p06'], 900, 60,  {}),
            HD('hd_o_safetywatch', 'Ongoing safety & weather watch',   '安全・天候監視（終日）',   'clinic',  'safetyLead', ['p05'], 600, 480, { diff: 4 }),
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
          tasks: [
            // --- required roster (~9): teardown -> settle -> headcount -> ferry marshal ---
            HD('hd_r_teardown',     'Teardown & pack',                        '撤収・荷造り',               'lodging', 'logi',       ['p06'], 300, 120, {}),
            HD('hd_r_checkout',     'Room checkout',                          '部屋チェックアウト',         'lodging', 'logi',       ['p06'], 420, 60,  { deps: ['hd_r_teardown'] }),
            HD('hd_r_ship',         'Ship remaining supplies',                '残置物の発送',               'port',    'logi',       ['p06'], 480, 60,  { deps: ['hd_r_checkout'], info: ['ic_cash'], res: ['shipping'] }),
            HD('hd_r_settle',       'Final settlement & receipts',            '最終精算・領収書',           'finance', 'budgetLead', ['p04'], 300, 180, { res: ['cash'], produces: ['ic_cash'], diff: 3 }),
            HD('hd_r_sitecash',     'Site-lead cash sign-off',                '現地責任者による現金確認',   'finance', 'siteLead',   ['p03'], 480, 60,  { deps: ['hd_r_settle'], info: ['ic_cash'] }),
            HD('hd_r_headcount',    'Return headcount',                       '帰着点呼',                   'port',    'comms',      ['p07'], 540, 60,  { deps: ['hd_r_ship'], produces: ['ic_return'] }),
            HD('hd_r_ferrymarshal', 'Ferry marshal & departure roll call',    '乗船整理・出発点呼',         'port',    'pm',         ['p02'], 600, 60,  { deps: ['hd_r_headcount'], info: ['ic_return'] }),
            HD('hd_r_boarding',     'Ferry boarding for departure',           '出発乗船',                   'port',    'pm',         ['p02'], 660, 60,  { deps: ['hd_r_ferrymarshal'] }),
            HD('hd_r_finalreport',  'Final report & sign-off',                '最終報告・締め',             'command', 'comms',      ['p07'], 720, 60,  { deps: ['hd_r_boarding'] }),
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
              '24 aboard, headcount confirmed', '24名乗船・点呼確認済')
          ],
          decoys: ['hd_r_dec_sidetrip', 'hd_r_dec_extraservice', 'hd_r_dec_latefish']
        }
      }
    };
  }

  // ---- accessors over a (merged) plan ----
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
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
        else { if (typeof pv.startMin === 'number') dt.startMin = pv.startMin; if (typeof pv.durMin === 'number') dt.durMin = pv.durMin; if (pv.assignedIds) dt.assignedIds = pv.assignedIds.slice(); }
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
        var fd = fishdaySchedule(plan);
        return fd.idleTotal > IDLE_TOL || fd.wrongFish.length > 0 || fd.missing.length > 0 || fd.late.length > 0 || fd.unresolved > 0;
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
  function staticArrival(plan, h) { var s = resolveSendMin(plan, h); return s == null ? null : s + (CHANNELS[h.channel] || 0); }
  function infoArrival(plan, cardId, roleId) { // earliest static arrival over drawn arrows (null = never)
    var hs = arrowsTo(plan, roleId, cardId), best = null;
    for (var i = 0; i < hs.length; i++) { var a = staticArrival(plan, hs[i]); if (a != null && (best == null || a < best)) best = a; }
    return best;
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
  function daySchedule(plan, seg, injections) {
    seg = seg || 'fishday';
    var allSeg = tasksForSeg(plan, seg), fds = [], i, j, k;
    for (i = 0; i < allSeg.length; i++) if (isPlaced(allSeg[i])) fds.push(allSeg[i]);
    var fdById = {}; for (i = 0; i < fds.length; i++) fdById[fds[i].id] = fds[i];
    var segHandoffs = handoffsForSeg(plan, seg);
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
    function arrivalSeg(h) { var s = sendMinSeg(h); return s == null ? null : s + (CHANNELS[h.channel] || 0); }
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
              var hh = hs[k], a;
              if (hh.trigger.type === 'onTaskDone' && fdById[hh.trigger.taskId]) {
                if (!eff[hh.trigger.taskId]) { pend = true; continue; }        // producer not scheduled yet (or cyclic)
                a = eff[hh.trigger.taskId].end + (CHANNELS[hh.channel] || 0);  // DYNAMIC: producer's effective finish
              } else { a = arrivalSeg(hh); }
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
      if (placed) for (j = 0; j < at.assignedIds.length; j++) { var prid = partRole[at.assignedIds[j]]; if (prid && prid !== at.ownerRoleId) { misassigned.push(at.id); break; } }
    }
    var perP = {}, overbookMin = 0;
    for (i = 0; i < fds.length; i++) { var pt = fds[i]; for (j = 0; j < pt.assignedIds.length; j++) { var pk = pt.assignedIds[j]; (perP[pk] = perP[pk] || []).push({ s: pt.startMin, e: pt.startMin + pt.durMin }); } }
    for (var pid in perP) { var seq = perP[pid].sort(function (a, b) { return a.s - b.s; }); for (i = 1; i < seq.length; i++) { var ov = seq[i - 1].e - seq[i].s; if (ov > 0) overbookMin += ov; } }
    var serve = r.eff['t_f_serve'];
    return { byTask: byTask, idleTotal: idleTotal, reworkTotal: reworkTotal, availMin: availMin,
      missing: missing, late: late, wrongFish: r.wrongFish, arrivals: r.arrivals, unresolved: unresolved,
      efficiency: availMin > 0 ? Math.round(100 * availMin / (availMin + idleTotal + reworkTotal)) : 100,
      guestWaitMin: guestWaitMin, dinnerMin: serve ? serve.start : null,
      unplacedRequired: unplacedRequired, decoysPlaced: decoysPlaced, misassigned: misassigned, overbookMin: overbookMin };
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
    for (i = 0; i < STATIONS.length; i++) out[STATIONS[i].id] = 'none';
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

  // ===========================================================================
  // COARSE-DAY READ-ONLY GRID (SPEC v2 §ENGINE) — pure, DOM-free, no RNG/Date.
  // dayLayout/derivedHandoffs are a read-only hour-Gantt lens over the SAME
  // classic (day!=='fishday') task data arrival/ops/return already score from;
  // they never mutate plan.tasks and never touch score()/detect()/fishdaySchedule.
  // ===========================================================================
  function clampInt(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // seg membership over the classic (day-clock) tasks — fishday tasks (day==='fishday')
  // are never in any of these three segs; the app keeps using the minute path for them.
  function inSeg(t, seg) {
    if (t.day === 'fishday') return false;
    if (seg === 'arrival') return t.startDay === 0;
    if (seg === 'return') return t.startDay >= 9;
    if (seg === 'ops') return t.startDay >= 1 && t.startDay < 9;
    return false;
  }

  // stable topological sort of a lane's own tasks, respecting only deps that are
  // ALSO in that lane (deps owned by another role are cross-lane and assumed done
  // for layout purposes — the same convention fishdaySchedule uses for cross-group
  // deps). Tie-break is the incoming (startDay,id) order, so ties stay deterministic.
  function laneTopoOrder(laneTasks) {
    var idSet = {}, i; for (i = 0; i < laneTasks.length; i++) idSet[laneTasks[i].id] = true;
    var placed = {}, out = [], remaining = laneTasks.slice(), guard = 0, maxGuard = remaining.length * remaining.length + 4;
    while (remaining.length && guard++ < maxGuard) {
      var progressed = false;
      for (i = 0; i < remaining.length; i++) {
        var t = remaining[i], ok = true;
        for (var d = 0; d < t.deps.length; d++) { var did = t.deps[d]; if (idSet[did] && !placed[did]) { ok = false; break; } }
        if (ok) { out.push(t); placed[t.id] = true; remaining.splice(i, 1); progressed = true; break; }
      }
      if (!progressed) { for (i = 0; i < remaining.length; i++) { out.push(remaining[i]); placed[remaining[i].id] = true; } remaining = []; }
    }
    return out;
  }

  // dayLayout(plan, seg) -> { lanes, blocks, unstaffed } — read-only hour-Gantt for a
  // coarse day. NEVER sorts/mutates plan.tasks in place (score()/detect() iterate it
  // in original order); all ordering happens on .slice()'d copies.
  function dayLayout(plan, seg) {
    if (seg === 'fishday') return null;
    var segTasks = plan.tasks.slice().filter(function (t) { return inSeg(t, seg); });
    var staffed = segTasks.filter(function (t) { return t.assignedIds.length > 0; });
    var unstaffed = segTasks.filter(function (t) { return t.assignedIds.length === 0; }).map(function (t) { return t.id; });

    var lanes = [], i;
    for (i = 0; i < ROLE_ORDER.length; i++) {
      var rid = ROLE_ORDER[i], has = false;
      for (var j = 0; j < staffed.length; j++) if (staffed[j].ownerRoleId === rid) { has = true; break; }
      if (has) lanes.push(rid);
    }
    var laneIdx = {}; for (i = 0; i < lanes.length; i++) laneIdx[lanes[i]] = i;

    var blocks = [];
    for (i = 0; i < lanes.length; i++) {
      var roleId = lanes[i];
      var laneTasks = staffed.filter(function (t) { return t.ownerRoleId === roleId; })
        .sort(function (a, b) { return a.startDay !== b.startDay ? a.startDay - b.startDay : (a.id < b.id ? -1 : (a.id > b.id ? 1 : 0)); });
      laneTasks = laneTopoOrder(laneTasks);
      var nextSubRow = 0, curSubRow = null, cursor = DAY_HOUR_START;
      for (var k = 0; k < laneTasks.length; k++) {
        var t = laneTasks[k], full = t.dur >= 6;
        var dispH = full ? 14 : clampInt(Math.round(t.dur), 1, 4);
        var durMin = dispH * HOUR_DT, startMin, subRow;
        if (full) {
          subRow = nextSubRow++; startMin = DAY_HOUR_START;
        } else {
          if (curSubRow === null) { curSubRow = nextSubRow++; cursor = DAY_HOUR_START; }
          startMin = Math.max(cursor, DAY_HOUR_START);
          if (startMin + durMin > DAY_HOUR_END) { curSubRow = nextSubRow++; startMin = DAY_HOUR_START; }
          subRow = curSubRow; cursor = startMin + durMin;
        }
        blocks.push({ taskId: t.id, roleId: roleId, laneIndex: laneIdx[roleId], subRow: subRow, startMin: startMin, durMin: durMin });
      }
    }
    return { lanes: lanes, blocks: blocks, unstaffed: unstaffed };
  }

  // derivedHandoffs(plan, seg) -> [{id,cardId,fromRoleId,toRoleId,toTaskId,fromTaskId,incoming}]
  // Read-only view of the info flow the engine already models for the coarse days —
  // it never draws a NEW handoff, only reads task.neededInfo + infoCards + dayLayout
  // block times to show which lane a consumer would logically hear from.
  function derivedHandoffs(plan, seg) {
    var layout = dayLayout(plan, seg);
    if (!layout) return [];
    var segStaffed = plan.tasks.slice().filter(function (t) { return inSeg(t, seg) && t.assignedIds.length > 0; });
    var out = [], seenPairs = {}, i, j;
    for (i = 0; i < segStaffed.length; i++) {
      var task = segStaffed[i], info = task.neededInfo || [];
      var myBlock = null;
      for (j = 0; j < layout.blocks.length; j++) if (layout.blocks[j].taskId === task.id) { myBlock = layout.blocks[j]; break; }
      for (j = 0; j < info.length; j++) {
        var cardId = info[j], card = byId(plan.infoCards, cardId);
        if (!card) continue;
        var fromRoleId = card.ownerRoleId, toRoleId = task.ownerRoleId;
        if (fromRoleId === toRoleId) continue;
        var key = cardId + '|' + task.id; if (seenPairs[key]) continue; seenPairs[key] = true;

        var fromTaskId = null, latestEnd = null, anyFrom = null;
        for (var b = 0; b < layout.blocks.length; b++) {
          var blk = layout.blocks[b]; if (blk.roleId !== fromRoleId) continue;
          if (anyFrom === null) anyFrom = blk.taskId;
          var end = blk.startMin + blk.durMin;
          if (myBlock && end <= myBlock.startMin && (latestEnd === null || end > latestEnd)) { latestEnd = end; fromTaskId = blk.taskId; }
        }
        if (fromTaskId === null) fromTaskId = anyFrom; // no eligible "ends before" block -> any block from that role
        out.push({ id: 'd_' + seg + '_' + cardId + '_' + task.id, cardId: cardId, fromRoleId: fromRoleId, toRoleId: toRoleId,
          toTaskId: task.id, fromTaskId: fromTaskId, incoming: fromTaskId === null });
      }
    }
    return out;
  }

  // Mission Control budget lens: what the setup board teaches. This is a pure
  // pre-run view over envelopes, usable payment paths, reserves, and spend events.
  function budgetReadiness(plan) {
    var target = plan.budget.reserveTarget || 300000;
    var gaps = [], envelopeOut = [], eventOut = [], resourceOut = [], i;
    for (i = 0; i < plan.budget.lines.length; i++) {
      var line = plan.budget.lines[i];
      var ok = !!line.approverRoleId && !!line.payMethod;
      if (line.id === 'bl_meals' && !ok) gaps.push({ type: 'BUDGET_AUTH', lineId: line.id });
      envelopeOut.push({ id: line.id, name: line.name, cap: line.cap, approverRoleId: line.approverRoleId || null,
        payMethod: line.payMethod || null, receiptRule: line.receiptRule || 'required', ok: ok });
    }
    if (plan.budget.reserve < target) gaps.push({ type: 'RESERVE_SHORT', current: plan.budget.reserve, target: target });
    var resources = plan.budget.resources || [];
    for (i = 0; i < resources.length; i++) {
      var r = clone(resources[i]);
      if (r.id === 'res_cash') r.planned = plan.budget.reserve;
      r.ok = r.planned >= r.target;
      resourceOut.push(r);
    }
    var events = plan.budget.spendEvents || [];
    for (i = 0; i < events.length; i++) {
      var ev = events[i], ln = lineById(plan, ev.lineId), roleAuth = plan.roles[ev.actorRoleId] && plan.roles[ev.actorRoleId].authority;
      var methodOk = !!ln && ln.payMethod === ev.requiredMethod;
      var approverOk = !!ln && (!ev.requiresApproval || !!ln.approverRoleId);
      var actorCanPay = !!roleAuth && roleAuth.canPay && roleAuth.payCap >= ev.amount;
      var reserveBackstop = ev.requiredMethod === 'cash' && plan.budget.reserve >= Math.min(target, ev.amount);
      eventOut.push({ id: ev.id, name: ev.name, amount: ev.amount, lineId: ev.lineId, taskId: ev.taskId,
        actorRoleId: ev.actorRoleId, requiredMethod: ev.requiredMethod, methodOk: methodOk,
        approverOk: approverOk, actorCanPay: actorCanPay, reserveBackstop: reserveBackstop,
        receiptRequired: !!ev.receiptRequired, ok: methodOk && approverOk && (actorCanPay || reserveBackstop || !!ln.approverRoleId) });
    }
    return { reserve: plan.budget.reserve, reserveTarget: target, envelopes: envelopeOut,
      resources: resourceOut, events: eventOut, gaps: gaps,
      ready: gaps.length === 0 && eventOut.every(function (ev) { return ev.ok; }) && resourceOut.every(function (r) { return r.ok; }) };
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
      var list = per[pid2].slice().sort(function (a, b) { return a.startMin - b.startMin; });
      for (i = 1; i < list.length; i++) if (list[i].startMin < list[i - 1].startMin + list[i - 1].durMin) out.push({ type: 'OVERLOAD', personId: pid2, taskId: list[i].id, otherId: list[i - 1].id });
    }
    return out;
  }
  // canonDay(seg): the witness that 100 is reachable — force every arrow to face-to-face (0 latency),
  // so by Phase-1 consistency (producer end ≤ consumer start) nothing is late. Also restores any
  // required-task PLACEMENT the seed ships pre-cleared (§7/§13.4 P2 — currently just Arrival, via
  // its canonPlacement) so the day's required roster is back on the board. applyDayFix writes both.
  function canonDay(seg) {
    var tpl = makeTemplate(), dd = tpl.days && tpl.days[seg]; if (!dd) return {};
    var hoff = {}; for (var i = 0; i < dd.handoffs.length; i++) hoff[dd.handoffs[i].id] = { channel: 'faceToFace' };
    var o = { days: {} }; o.days[seg] = { handoffs: hoff };
    if (dd.canonPlacement) o.days[seg].placement = clone(dd.canonPlacement);
    return o;
  }
  function applyDayFix(cfg, seg) {
    cfg = clone(cfg || { seed: 1, overrides: {} }); cfg.overrides = cfg.overrides || {};
    var fix = canonDay(seg); if (!fix.days) return cfg;
    cfg.overrides.days = cfg.overrides.days || {};
    var cur = cfg.overrides.days[seg] || {}; cur.handoffs = cur.handoffs || {}; cur.placement = cur.placement || {};
    for (var id in fix.days[seg].handoffs) cur.handoffs[id] = fix.days[seg].handoffs[id];
    if (fix.days[seg].placement) for (var pid in fix.days[seg].placement) cur.placement[pid] = fix.days[seg].placement[pid];
    cfg.overrides.days[seg] = cur; return cfg;
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
    var grade = total >= 90 ? 'A' : total >= 75 ? 'B' : total >= 60 ? 'C' : 'D';
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
    // §21.8b: fishday is always minute-clock; a coarse day (arrival/ops/return) animates on the minute clock
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
          progress: 0, state: 'pending', stalled: false, problem: null, blocked: false };
      });
    } else {
      tasks = plan.tasks.map(function (t) {
        var ti = phaseSegIndex(t.phase);
        var scope = (sIdx < 0) ? 'in' : (ti < sIdx ? 'pre' : (ti > sIdx ? 'post' : 'in')); // earlier days assumed done; later days hidden
        return { id: t.id, name: t.name, station: t.station, phase: t.phase, ownerRoleId: t.ownerRoleId,
          assignedIds: t.assignedIds.slice(), startDay: t.startDay, dur: t.dur, deps: t.deps.slice(), scope: scope,
          day: t.day || null, startMin: t.startMin, durMin: t.durMin,
          progress: scope === 'pre' ? 1 : 0, state: scope === 'pre' ? 'done' : 'pending', stalled: false, problem: probByTask[t.id] || null, blocked: !!blocked[t.id] };
      });
    }
    var participants = plan.participants.map(function (p) {
      return { id: p.id, name: p.name, roleId: p.roleId, company: p.company, constraints: p.constraints,
        station: 'lodging', x: station('lodging').x, y: station('lodging').y, state: 'idle', fatigue: 0, taskId: null };
    });

    // clock window of the chosen day (or the whole trip)
    var inTasks = tasks.filter(function (t) { return t.scope === 'in'; });
    var d0 = 0, segEnd = DAYS;
    if (sIdx >= 0 && inTasks.length) {
      d0 = Math.min.apply(null, inTasks.map(function (t) { return t.startDay; }));
      segEnd = Math.max.apply(null, inTasks.map(function (t) { return t.startDay + t.dur; }));
    }

    var sim = {
      cfg: { seed: (cfg.seed >>> 0) || 1, overrides: clone(cfg.overrides || {}) },
      plan: plan, rng: mulberry32((cfg.seed >>> 0) || 1),
      segment: segment || 'all', segTaskIds: inTasks.map(function (t) { return t.id; }), segEnd: segEnd,
      day: d0, clock: d0, tick: 0, finished: null, phaseLabel: null,
      tasks: tasks, participants: participants, problems: problems,
      stations: STATIONS.map(function (s) { return { id: s.id, name: s.name, icon: s.icon, x: s.x, y: s.y, crewIds: [], dominantProblem: null }; }),
      budget: { total: plan.budget.total, spent: 0, reserve: plan.budget.reserve },
      events: [], bannerOn: false, bannerEverFired: false
    };
    if (minute) {
      var win = DAY_WINDOWS[segment] || [DAY_START_MIN, DAY_END_MIN];
      sim.mode = 'minute'; sim.clockMin = win[0]; sim.winStart = win[0]; sim.winEnd = win[1]; sim.day = 2; sim.clock = 2;
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
    sim.clock = 2 + (sim.clockMin - (sim.winStart || DAY_START_MIN)) / 1440; sim.day = sim.clock;
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
      var cur = null;
      for (var k = 0; k < sim.tasks.length; k++) {
        t = sim.tasks[k];
        if (t.scope !== 'in' || !rank[t.state] || t.assignedIds.indexOf(p.id) < 0) continue;
        if (!cur || rank[t.state] > rank[cur.state]) cur = t;
      }
      if (!cur) {
        var anyDone = false, anyFuture = false;
        for (var m = 0; m < sim.tasks.length; m++) { var tm = sim.tasks[m]; if (tm.scope === 'in' && tm.assignedIds.indexOf(p.id) >= 0) { if (tm.state === 'done') anyDone = true; if (tm.state === 'pending') anyFuture = true; } }
        p.taskId = null; p.station = 'lodging'; p.state = (anyDone && !anyFuture) ? 'resolved' : 'idle';
      } else {
        p.taskId = cur.id; p.station = cur.station;
        p.state = cur.problem ? cur.problem.state : (cur.state === 'waitinfo' ? 'waitInfo' : cur.state);
      }
      var st = station(p.station); p.x = st.x; p.y = st.y; bucket[p.station].push(p.id);
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
      sim.finished = (gapsForSegment(sim.plan, sim.segment).length === 0) ? 'done' : 'incomplete';
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
      var cur = null;
      for (var k = 0; k < sim.tasks.length; k++) { t = sim.tasks[k]; if (t.assignedIds.indexOf(p.id) >= 0 && (t.state === 'working' || t.state === 'stalled')) { cur = t; break; } }
      if (!cur) { // none active now: any finished work? → done, else idle at lodging
        var anyDone = false; for (var m = 0; m < sim.tasks.length; m++) { if (sim.tasks[m].assignedIds.indexOf(p.id) >= 0 && sim.tasks[m].state === 'done') anyDone = true; }
        p.taskId = null; p.station = 'lodging'; p.state = anyDone ? 'resolved' : 'idle';
      } else {
        p.taskId = cur.id; p.station = cur.station;
        if (cur.stalled) { p.state = cur.problem.state; if (cur.problem.id === 'fatigue') { p.fatigue = Math.min(100, p.fatigue + FATIGUE_RATE); if (p.fatigue > 45) p.state = 'tired'; } }
        else { p.state = (cur.state === 'done') ? 'resolved' : 'working'; }
      }
      var st = station(p.station); p.x = st.x; p.y = st.y;
      bucket[p.station].push(p.id);
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
    var grade = (total >= 90 && clean) ? 'A' : (total >= 75 ? 'B' : (total >= 60 ? 'C' : 'D'));
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
  // §Phase1 — scoreTrip(plan) / tripEfficiency(plan) — the whole-trip 100-point
  // ledger (scoring blueprint §13.2 frozen contract). PURELY ADDITIVE: reads only
  // (mergePlan/tasksForSeg/handoffsForSeg/daySchedule/dayReadiness/detect/makeTemplate),
  // never mutates its `plan` argument, no RNG. score()/scoreDay()/daySchedule() and all
  // task/handoff/detector CONTENT are untouched — this is a new read-only lens over them.
  // Phase 1 shipped structure only (Sigma maxPts === 100, bucket/dimension homing, determinism,
  // purity). Phase 2a (this pass, §13.1/§13.4) wired the 5 "make-real" atoms + the Owner/PM
  // fishday flex lanes to real, genuinely-failable checks: frame_abort_night mirrors rk_sea's
  // abort-criterion gate onto rk_night; frame_hospital_shared checks ic_hospital.recipientRoleIds;
  // fishday_safety_health_check checks t_f_health is placed & staffed; fishday_quality_allergy /
  // _portions read structured fields added to the infoCards (ic_menu.species/portions,
  // ic_food.allergens, ic_orgfood.addOns) rather than free text; the two new t_f_flex_owner/pm
  // tasks give owner/pm a real lane. On the true canonical plan every atom now earns its max.
  // ===========================================================================

  // the 4 wrong-fish-riskable fishday sockets (§3.4/§13.2): 1 "drawn" + 2 "on time" = 3pts
  var FISHDAY_RISKABLE = { 'specialist|ic_menu': 1, 'siteLead|ic_menu': 1, 'siteLead|ic_target': 1, 'specialist|ic_ground': 1 };

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
  // status of a (role,card) socket, read off daySchedule's OWN missing/late arrays (the
  // engine's existing min-over-arrows checker) — never a re-derived arrival calculation.
  function tripSocketStatus(ds, taskIds, cardId, livePlaced) {
    var i, anyPlacedNeed = false;
    for (i = 0; i < taskIds.length; i++) if (livePlaced[taskIds[i]]) anyPlacedNeed = true;
    if (!anyPlacedNeed) return 'missing';
    for (i = 0; i < ds.missing.length; i++) { var m = ds.missing[i]; if (m.cardId === cardId && taskIds.indexOf(m.taskId) >= 0) return 'missing'; }
    for (i = 0; i < ds.late.length; i++) { var l = ds.late[i]; if (l.cardId === cardId && taskIds.indexOf(l.taskId) >= 0) return 'late'; }
    return 'ok';
  }
  function tripSocketAtom(id, bucket, plan, ds, taskIds, roleId, cardId, riskable, livePlaced) {
    var st = tripSocketStatus(ds, taskIds, cardId, livePlaced);
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
  function tripLaneAtom(id, bucket, plan, seg, roleId, taskIds, tmplDur) {
    var all = tasksForSeg(plan, seg), byIdMap = {}, i;
    for (i = 0; i < all.length; i++) byIdMap[all[i].id] = all[i];
    var rd = dayReadiness(plan, seg);
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
    if (!bad) { var mds = daySchedule(plan, seg);
      for (i = 0; i < taskIds.length && !bad; i++) if (mds.misassigned.indexOf(taskIds[i]) >= 0) { bad = true; status = 'broken'; reasonKey = 'scr_exec_misassigned'; }
    }
    if (!bad) for (i = 0; i < rd.length && !bad; i++) {
      var r = rd[i];
      if (r.type === 'TASK_UNSTAFFED' && taskIds.indexOf(r.taskId) >= 0) { bad = true; status = 'missing'; reasonKey = 'scr_exec_unstaffed'; }
      else if (r.type === 'MISASSIGNED' && taskIds.indexOf(r.taskId) >= 0) { bad = true; status = 'broken'; reasonKey = 'scr_exec_misassigned'; }
      else if (r.type === 'DEP_BROKEN' && taskIds.indexOf(r.taskId) >= 0) { bad = true; status = 'broken'; reasonKey = 'scr_exec_broken'; }
      else if (r.type === 'OVERLOAD' && (taskIds.indexOf(r.taskId) >= 0 || taskIds.indexOf(r.otherId) >= 0)) { bad = true; status = 'overlap'; reasonKey = 'scr_exec_overlap'; }
    }
    return { id: id, bucket: bucket, dimension: 'exec', itemRef: { type: 'lane', taskId: taskIds, roleId: roleId },
      maxPts: 1, earned: bad ? 0 : 1, status: status, reasonKey: reasonKey, reasonParams: {} };
  }
  // a binary gate atom (authority / criterion / route) — dimension is caller-supplied
  // (safety | money | people); ok/gapKey come from the fixed §13.3 reason set.
  function tripGateAtom(id, bucket, dimension, maxPts, ok, itemRef, okKey, gapKey) {
    return { id: id, bucket: bucket, dimension: dimension, itemRef: itemRef, maxPts: maxPts,
      earned: ok ? maxPts : 0, status: ok ? 'ok' : 'missing', reasonKey: ok ? okKey : gapKey, reasonParams: {} };
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

  // ---- Trip Frame (14 = Safety 8, Money 5, People 1) — standing, timeless authorities ----
  function tripFrameAtoms(plan) {
    var out = [];
    var sl = plan.roles.safetyLead, sea = byId(plan.risks, 'rk_sea'), night = byId(plan.risks, 'rk_night');
    var seaOk = !!(sl.holder && sl.deputyId && sl.authority && sl.authority.canAbort && sea && sea.ownerRoleId && sea.abortCriterion);
    out.push(tripGateAtom('frame_abort_sea', 'frame', 'safety', 2, seaOk, { type: 'gate', detectorId: 'safety' }, 'scr_safety_ok', 'scr_safety_gap'));
    // MAKE-REAL (§13.1): rk_night.abortCriterion present, mirroring rk_sea's shape exactly
    var nightOk = !!(sl.holder && sl.deputyId && sl.authority && sl.authority.canAbort && night && night.ownerRoleId && night.abortCriterion);
    out.push(tripGateAtom('frame_abort_night', 'frame', 'safety', 2, nightOk, { type: 'gate', detectorId: 'safety' }, 'scr_safety_ok', 'scr_safety_gap'));
    var health = byId(plan.commRules, 'cr_health');
    out.push(tripGateAtom('frame_health_report', 'frame', 'safety', 2, !!(health && health.reportToRoleId), { type: 'gate', detectorId: 'report' }, 'scr_safety_ok', 'scr_safety_gap'));
    // MAKE-REAL (§13.1): ic_hospital.recipientRoleIds ⊇ {pm,siteLead,comms,safetyLead}
    var hosp = byId(plan.infoCards, 'ic_hospital'), hospNeed = ['pm', 'siteLead', 'comms', 'safetyLead'];
    var hospOk = !!hosp && hospNeed.every(function (r) { return hosp.recipientRoleIds.indexOf(r) >= 0; });
    out.push(tripGateAtom('frame_hospital_shared', 'frame', 'safety', 2, hospOk, { type: 'gate', cardId: 'ic_hospital' }, 'scr_safety_ok', 'scr_safety_gap'));
    var meals = byId(plan.budget.lines, 'bl_meals');
    out.push(tripGateAtom('frame_budget_authority', 'frame', 'money', 3, !!(meals && meals.approverRoleId && meals.payMethod), { type: 'gate', detectorId: 'budgetAuth' }, 'scr_money_ok', 'scr_money_gap'));
    out.push(tripGateAtom('frame_reserve_drawrule', 'frame', 'money', 2, plan.budget.reserve >= (plan.budget.reserveTarget || 300000), { type: 'gate', detectorId: 'reserve' }, 'scr_money_ok', 'scr_money_gap'));
    var siteLeadRole = plan.roles.siteLead;
    var reliefOk = !!siteLeadRole.deputyId || loadOf(plan, siteLeadRole.holder) < LOAD_CAP;
    out.push(tripGateAtom('frame_load_relief', 'frame', 'people', 1, reliefOk, { type: 'gate', detectorId: 'fatigue' }, 'scr_exec_ok', 'scr_exec_unstaffed'));
    return out;
  }

  // shared: build the (role,card) socket atoms for one authorable coarse-day seg, priced off
  // the TEMPLATE's required tasks (never the live plan) — used by arrival/ops/return.
  function tripCoarseSocketAtoms(bucket, plan, tmpl, seg, prefix) {
    var out = [], i;
    var reqTasks = tasksForSeg(tmpl, seg).filter(function (t) { return t.required !== false; });
    var cardOwner = {}; for (i = 0; i < tmpl.infoCards.length; i++) cardOwner[tmpl.infoCards[i].id] = tmpl.infoCards[i].ownerRoleId;
    var pairs = tripSocketPairs(reqTasks, cardOwner);
    var ds = daySchedule(plan, seg);
    var liveTasks = tasksForSeg(plan, seg), livePlaced = {};
    for (i = 0; i < liveTasks.length; i++) if (isPlaced(liveTasks[i])) livePlaced[liveTasks[i].id] = 1;
    for (i = 0; i < pairs.length; i++) {
      var p = pairs[i], tids = tripPairTaskIds(reqTasks, p.roleId, p.cardId);
      out.push(tripSocketAtom(prefix + '_info_' + p.roleId + '_' + p.cardId, bucket, plan, ds, tids, p.roleId, p.cardId, false, livePlaced));
    }
    return out;
  }
  function tripLanesFor(bucket, plan, seg, lanes, tmplDur) {
    var out = [];
    for (var i = 0; i < lanes.length; i++) out.push(tripLaneAtom(bucket + '_exec_' + lanes[i][0], bucket, plan, seg, lanes[i][0], lanes[i][1], tmplDur));
    return out;
  }

  // ---- Arrival D1 (15 = Info 4, Exec 7, Safety 1, Quality 2, Money 1) ----
  function tripArrivalAtoms(plan, tmpl, tmplDur) {
    var seg = 'arrival', out = tripCoarseSocketAtoms('arrival', plan, tmpl, seg, 'arrival');
    var lanes = [
      ['pm', ['hd_a_ferrycheck']], ['logi', ['hd_a_board', 'hd_a_checkin', 'hd_a_intake']],
      ['siteLead', ['hd_a_cross']], ['budgetLead', ['hd_a_foodsource']], ['specialist', ['hd_a_gearstow']],
      ['chef', ['hd_a_dinnerprep', 'hd_a_dinnerserve']], ['comms', ['hd_a_headcount']]
    ];
    out = out.concat(tripLanesFor('arrival', plan, seg, lanes, tmplDur));
    var ds = daySchedule(plan, seg);
    out.push(tripQualityAtom('arrival_quality_dinnerprep', 'arrival', plan, seg, 'hd_a_dinnerprep', tmplDur, ds));
    out.push(tripQualityAtom('arrival_quality_dinnerserve', 'arrival', plan, seg, 'hd_a_dinnerserve', tmplDur, ds));
    var all = tasksForSeg(plan, seg), safety = byId(all, 'hd_a_safety');
    var safetyOk = !!(safety && isPlaced(safety) && safety.durMin >= tmplDur.hd_a_safety);
    out.push(tripGateAtom('arrival_safety_briefing', 'arrival', 'safety', 1, safetyOk, { type: 'lane', taskId: 'hd_a_safety' }, 'scr_safety_ok', 'scr_safety_gap'));
    var transport = byId(plan.budget.lines, 'bl_transport');
    out.push(tripGateAtom('arrival_money_transport_auth', 'arrival', 'money', 1, !!(transport && transport.approverRoleId && transport.payMethod), { type: 'gate', detectorId: null }, 'scr_money_ok', 'scr_money_gap'));
    out.push(tripDecoyAtom('arrival_decoy_nightfish', 'arrival', plan, seg, 'hd_a_dec_nightfish', true));
    out.push(tripDecoyAtom('arrival_decoy_sightseeing', 'arrival', plan, seg, 'hd_a_dec_sightseeing', false));
    out.push(tripDecoyAtom('arrival_decoy_solotackle', 'arrival', plan, seg, 'hd_a_dec_soloTackle', false));
    return out;
  }

  // ---- Ops (18 = Info 5, Exec 5, Safety 2, Quality 4, Money 2) — the representative day ----
  function tripOpsAtoms(plan, tmpl, tmplDur) {
    var seg = 'ops', out = tripCoarseSocketAtoms('ops', plan, tmpl, seg, 'ops');
    var lanes = [
      ['logi', ['hd_o_tackleprep', 'hd_o_catchhandle', 'hd_o_clean']], ['specialist', ['hd_o_shorefish']],
      ['chef', ['hd_o_foodprep', 'hd_o_lunch', 'hd_o_dinnerprep', 'hd_o_dinnerserve']],
      ['budgetLead', ['hd_o_foodsource', 'hd_o_accounting']], ['comms', ['hd_o_report']]
    ];
    out = out.concat(tripLanesFor('ops', plan, seg, lanes, tmplDur));
    var all = tasksForSeg(plan, seg);
    var weather = byId(all, 'hd_o_weather'), watch = byId(all, 'hd_o_safetywatch');
    out.push(tripGateAtom('ops_safety_weathercheck', 'ops', 'safety', 1, !!(weather && isPlaced(weather) && weather.durMin >= tmplDur.hd_o_weather), { type: 'lane', taskId: 'hd_o_weather' }, 'scr_safety_ok', 'scr_safety_gap'));
    out.push(tripGateAtom('ops_safety_watch', 'ops', 'safety', 1, !!(watch && isPlaced(watch) && watch.durMin >= tmplDur.hd_o_safetywatch), { type: 'lane', taskId: 'hd_o_safetywatch' }, 'scr_safety_ok', 'scr_safety_gap'));
    var ds = daySchedule(plan, seg);
    out.push(tripQualityAtom('ops_quality_foodprep', 'ops', plan, seg, 'hd_o_foodprep', tmplDur, ds));
    out.push(tripQualityAtom('ops_quality_lunch', 'ops', plan, seg, 'hd_o_lunch', tmplDur, ds));
    out.push(tripQualityAtom('ops_quality_dinnerprep', 'ops', plan, seg, 'hd_o_dinnerprep', tmplDur, ds));
    out.push(tripQualityAtom('ops_quality_dinnerserve', 'ops', plan, seg, 'hd_o_dinnerserve', tmplDur, ds));
    var onsite = byId(plan.budget.lines, 'bl_onsite'), tackleLine = byId(plan.budget.lines, 'bl_tackle');
    out.push(tripGateAtom('ops_money_onsite_auth', 'ops', 'money', 1, !!(onsite && onsite.approverRoleId && onsite.payMethod), { type: 'gate', detectorId: null }, 'scr_money_ok', 'scr_money_gap'));
    out.push(tripGateAtom('ops_money_tackle_auth', 'ops', 'money', 1, !!(tackleLine && tackleLine.approverRoleId && tackleLine.payMethod), { type: 'gate', detectorId: null }, 'scr_money_ok', 'scr_money_gap'));
    out.push(tripDecoyAtom('ops_decoy_sidefish', 'ops', plan, seg, 'hd_o_dec_sidefish', false));
    out.push(tripDecoyAtom('ops_decoy_marketrun', 'ops', plan, seg, 'hd_o_dec_marketrun', false));
    out.push(tripDecoyAtom('ops_decoy_longlunch', 'ops', plan, seg, 'hd_o_dec_longlunch', false));
    return out;
  }

  // ---- Return D10 (12 = Info 3, Exec 4, Safety 3, Quality 0, Money 2) ----
  function tripReturnAtoms(plan, tmpl, tmplDur) {
    var seg = 'return', out = tripCoarseSocketAtoms('return', plan, tmpl, seg, 'return');
    var lanes = [
      ['logi', ['hd_r_teardown', 'hd_r_checkout', 'hd_r_ship']], ['budgetLead', ['hd_r_settle']],
      ['comms', ['hd_r_headcount', 'hd_r_finalreport']], ['pm', ['hd_r_ferrymarshal', 'hd_r_boarding']]
    ];
    out = out.concat(tripLanesFor('return', plan, seg, lanes, tmplDur));
    var ic_return = byId(plan.infoCards, 'ic_return');
    var need = ['pm', 'owner', 'safetyLead', 'comms'], headcountOk = true;
    if (!ic_return) headcountOk = false; else for (var i = 0; i < need.length; i++) if (ic_return.recipientRoleIds.indexOf(need[i]) < 0) headcountOk = false;
    out.push(tripGateAtom('return_safety_headcount_full', 'return', 'safety', 1, headcountOk, { type: 'gate', cardId: 'ic_return' }, 'scr_safety_ok', 'scr_safety_gap'));
    var shipTask = byId(plan.tasks, 't_ship');
    out.push(tripGateAtom('return_safety_ship_staffed', 'return', 'safety', 1, !!(shipTask && shipTask.assignedIds.length > 0), { type: 'gate', detectorId: 'returnLogi' }, 'scr_safety_ok', 'scr_safety_gap'));
    var rkWeather = byId(plan.risks, 'rk_weather');
    out.push(tripGateAtom('return_safety_evac_plan', 'return', 'safety', 1, !!(rkWeather && rkWeather.ownerRoleId && rkWeather.fallback), { type: 'gate', detectorId: null }, 'scr_safety_ok', 'scr_safety_gap'));
    var all = tasksForSeg(plan, seg), sitecash = byId(all, 'hd_r_sitecash'), settle = byId(all, 'hd_r_settle');
    var rd = dayReadiness(plan, seg), sitecashBroken = rd.some(function (r) { return (r.type === 'DEP_BROKEN' || r.type === 'MISASSIGNED') && r.taskId === 'hd_r_sitecash'; });
    out.push(tripGateAtom('return_money_sitecash_signoff', 'return', 'money', 1, !!(sitecash && isPlaced(sitecash) && !sitecashBroken), { type: 'lane', taskId: 'hd_r_sitecash' }, 'scr_money_ok', 'scr_money_gap'));
    out.push(tripGateAtom('return_money_settle_complete', 'return', 'money', 1, !!(settle && isPlaced(settle) && settle.durMin >= tmplDur.hd_r_settle), { type: 'lane', taskId: 'hd_r_settle' }, 'scr_money_ok', 'scr_money_gap'));
    out.push(tripDecoyAtom('return_decoy_sidetrip', 'return', plan, seg, 'hd_r_dec_sidetrip', false));
    out.push(tripDecoyAtom('return_decoy_extraservice', 'return', plan, seg, 'hd_r_dec_extraservice', false));
    out.push(tripDecoyAtom('return_decoy_latefish', 'return', plan, seg, 'hd_r_dec_latefish', true));
    return out;
  }

  // ---- Fishing Day D3 (41 = Info 22, Exec 9, Safety 6, Quality 4) — the heart ----
  function tripFishdayAtoms(plan, tmpl, tmplDur) {
    var seg = 'fishday', out = [];
    var reqTasks = tasksForSeg(tmpl, seg); // every fishday task is required (no decoys on Day 3)
    var cardOwner = {}; var i; for (i = 0; i < tmpl.infoCards.length; i++) cardOwner[tmpl.infoCards[i].id] = tmpl.infoCards[i].ownerRoleId;
    var pairs = tripSocketPairs(reqTasks, cardOwner);
    var ds = daySchedule(plan, seg);
    var liveTasks = tasksForSeg(plan, seg), livePlaced = {};
    for (i = 0; i < liveTasks.length; i++) if (isPlaced(liveTasks[i])) livePlaced[liveTasks[i].id] = 1;
    for (i = 0; i < pairs.length; i++) {
      var p = pairs[i], tids = tripPairTaskIds(reqTasks, p.roleId, p.cardId);
      var riskable = !!FISHDAY_RISKABLE[p.roleId + '|' + p.cardId];
      out.push(tripSocketAtom('fishday_info_' + p.roleId + '_' + p.cardId, 'fishday', plan, ds, tids, p.roleId, p.cardId, riskable, livePlaced));
    }
    var lanes = [
      ['siteLead', ['t_f_route', 't_f_depart', 't_f_hold', 't_f_return', 't_f_dock']],
      ['budgetLead', ['t_f_food', 't_f_accounting']],
      ['safetyLead', ['t_f_weather', 't_f_seawatch', 't_f_health']],
      ['logi', ['t_f_tackleprep', 't_f_icing']],
      ['comms', ['t_f_orgfood', 't_f_headcount1', 't_f_triplog', 't_f_headcount2', 't_f_report']],
      ['specialist', ['t_f_gearload', 't_f_rig', 't_f_fish', 't_f_tally', 't_f_stow', 't_f_land']],
      ['chef', ['t_f_menu', 't_f_lunch', 't_f_sideprep', 't_f_fillet', 't_f_cook', 't_f_plate', 't_f_serve']]
    ];
    out = out.concat(tripLanesFor('fishday', plan, seg, lanes, tmplDur));
    // MAKE-REAL (§13.1): Owner & PM's flex/standby lane (t_f_flex_owner/pm) — a real lane atom now
    // (8 organizer lanes + galley = 9 exec atoms). No neededInfo/deps, so it can't alter the cascade;
    // it earns like any lane atom (placed/staffed on the right role) and loses it if unplaced/misassigned.
    out.push(tripLaneAtom('fishday_exec_owner_flex', 'fishday', plan, seg, 'owner', ['t_f_flex_owner'], tmplDur));
    out.push(tripLaneAtom('fishday_exec_pm_flex', 'fishday', plan, seg, 'pm', ['t_f_flex_pm'], tmplDur));
    var all = tasksForSeg(plan, seg), weather = byId(all, 't_f_weather'), seawatch = byId(all, 't_f_seawatch');
    var sea = byId(plan.risks, 'rk_sea');
    var dawnOk = !!(weather && isPlaced(weather) && weather.durMin >= tmplDur.t_f_weather && sea && sea.abortCriterion);
    out.push(tripGateAtom('fishday_safety_dawn_gonogo', 'fishday', 'safety', 2, dawnOk, { type: 'lane', taskId: 't_f_weather' }, 'scr_safety_ok', 'scr_safety_gap'));
    var abroadOk = !!(seawatch && isPlaced(seawatch) && seawatch.durMin >= tmplDur.t_f_seawatch && seawatch.startMin <= 420);
    out.push(tripGateAtom('fishday_safety_abort_aboard', 'fishday', 'safety', 2, abroadOk, { type: 'lane', taskId: 't_f_seawatch' }, 'scr_safety_ok', 'scr_safety_gap'));
    // MAKE-REAL (§13.1): t_f_health (crew health check) placed & staffed
    var healthTask = byId(all, 't_f_health');
    var healthOk = !!(healthTask && isPlaced(healthTask) && healthTask.durMin >= tmplDur.t_f_health);
    out.push(tripGateAtom('fishday_safety_health_check', 'fishday', 'safety', 2, healthOk, { type: 'lane', taskId: 't_f_health' }, 'scr_safety_ok', 'scr_safety_gap'));
    var cook = byId(all, 't_f_cook');
    var cookOk = !!(cook && isPlaced(cook) && cook.durMin >= tmplDur.t_f_cook && ds.dinnerMin != null && ds.dinnerMin <= 1080);
    out.push({ id: 'fishday_quality_cookblock', bucket: 'fishday', dimension: 'quality', itemRef: { type: 'lane', taskId: 't_f_cook' },
      maxPts: 2, earned: cookOk ? 2 : 0, status: cookOk ? 'ok' : 'compressed', reasonKey: cookOk ? 'scr_qual_ok' : 'scr_qual_fail', reasonParams: {} });
    // MAKE-REAL (§13.1) + refinement-1: allergy respected — the committed menu species
    // (ic_menu.species) is looked up in SPECIES_CATEGORIES to its allergen CATEGORY (e.g.
    // 'shrimp' -> 'shellfish'), which must not intersect ic_food.allergens (category tokens).
    // A real species/category distinction: 'skipjack' (fish) never intersects a 'shellfish'
    // allergen, but 'shrimp' correctly does — the literal-species check this replaced could
    // not tell the two apart.
    var menuCard = byId(plan.infoCards, 'ic_menu'), foodCard = byId(plan.infoCards, 'ic_food');
    var menuCats = (menuCard && SPECIES_CATEGORIES[menuCard.species]) || [];
    var allergyOk = !!(menuCard && menuCard.species) && !(foodCard && foodCard.allergens && foodCard.allergens.some(function (a) { return menuCats.indexOf(a) >= 0; }));
    out.push(tripGateAtom('fishday_quality_allergy', 'fishday', 'quality', 1, allergyOk, { type: 'gate', cardId: 'ic_menu' }, 'scr_qual_ok', 'scr_qual_fail'));
    // MAKE-REAL (§13.1): portions = 13 guests + organizer add-ons, DERIVED and checked — the
    // committed ic_menu.portions must equal GUESTS + ic_orgfood.addOns (two independently-settable
    // structured fields), not a static config read that always agrees with itself.
    var orgfoodCard = byId(plan.infoCards, 'ic_orgfood');
    var expectedPortions = GUESTS + (orgfoodCard && typeof orgfoodCard.addOns === 'number' ? orgfoodCard.addOns : 0);
    var portionsOk = !!(menuCard && menuCard.portions === expectedPortions);
    out.push(tripGateAtom('fishday_quality_portions', 'fishday', 'quality', 1, portionsOk, { type: 'gate', cardId: 'ic_menu' }, 'scr_qual_ok', 'scr_qual_fail'));
    return out;
  }

  function scoreTrip(plan) {
    var tmpl = makeTemplate(), tmplDur = tripTemplateDurMap();
    var atoms = [].concat(
      tripFrameAtoms(plan),
      tripArrivalAtoms(plan, tmpl, tmplDur),
      tripOpsAtoms(plan, tmpl, tmplDur),
      tripFishdayAtoms(plan, tmpl, tmplDur),
      tripReturnAtoms(plan, tmpl, tmplDur)
    );
    var BUCKETS = ['frame', 'arrival', 'ops', 'fishday', 'return'];
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
    var clean = atoms.every(function (a) { return a.maxPts > 0 ? a.earned === a.maxPts : a.earned === 0; });
    var withheldA = total >= 90 && !clean;
    var grade = (total >= 90 && clean) ? 'A' : (total >= 75 ? 'B' : (total >= 60 ? 'C' : 'D'));
    return { total: total, grade: grade, gate: { clean: clean, withheldA: withheldA },
      atoms: atoms, byBucket: byBucket, byDimension: byDimension };
  }

  // minute-weighted Sigma productive / Sigma available across the four modeled days;
  // unplaced tasks contribute neither avail nor idle (daySchedule already excludes them).
  function tripEfficiency(plan) {
    var segs = ['arrival', 'ops', 'fishday', 'return'], avail = 0, cost = 0;
    for (var i = 0; i < segs.length; i++) {
      var ds = daySchedule(plan, segs[i]);
      avail += ds.availMin; cost += ds.idleTotal + ds.reworkTotal + ds.overbookMin;
    }
    return avail > 0 ? Math.round(100 * avail / (avail + cost)) : 100;
  }

  var api = {
    DT: DT, DAYS: DAYS, HEADCOUNT: HEADCOUNT, STATIONS: STATIONS, ROLES: ROLES, COMPANIES: COMPANIES,
    CAT_MAX: CAT_MAX, DETECTORS: DETECTORS,
    SEGMENTS: SEGMENTS, segIndex: segIndex, gapsForSegment: gapsForSegment, daySummary: daySummary,
    mulberry32: mulberry32, makeTemplate: makeTemplate, mergePlan: mergePlan, detect: detect,
    applyFix: applyFix, applyAllFixes: applyAllFixes, createSim: createSim, tick: tick, score: score,
    role: role, station: station, chars: chars,
    // fishday temporal layer (§6/§8)
    CHEFS: CHEFS, GUESTS: GUESTS, MIN_DT: MIN_DT, DAY_START_MIN: DAY_START_MIN, DAY_END_MIN: DAY_END_MIN,
    CHANNELS: CHANNELS, CHECKPOINTS: CHECKPOINTS,
    fishdayTasks: fishdayTasks, resolveSendMin: resolveSendMin, staticArrival: staticArrival, infoArrival: infoArrival,
    tasksForSeg: tasksForSeg, handoffsForSeg: handoffsForSeg, isPlaced: isPlaced, deckFor: deckFor, daySchedule: daySchedule,
    dayReadiness: dayReadiness, scoreDay: scoreDay, projectedDay: projectedDay, canonDay: canonDay, applyDayFix: applyDayFix,
    fishdaySchedule: fishdaySchedule, idleMinutes: idleMinutes, wrongFishTasks: wrongFishTasks,
    reworkMinutes: reworkMinutes, efficiency: efficiency, budgetReadiness: budgetReadiness,
    readiness: readiness, projected: projected,
    resume: resume, intervene: intervene, memberInfo: memberInfo, canonHandoffs: canonHandoffs,
    // Layer 0 cosmetic view helpers (pure, no scoring impact)
    ambientActors: ambientActors, boatState: boatState, stationReadiness: stationReadiness, cascadeTrace: cascadeTrace,
    // coarse-day read-only grid (SPEC v2 §ENGINE, pure, no scoring impact)
    DAY_HOUR_START: DAY_HOUR_START, DAY_HOUR_END: DAY_HOUR_END, HOUR_DT: HOUR_DT,
    dayLayout: dayLayout, derivedHandoffs: derivedHandoffs,
    // §20.3 — authorable all-days rebuild, Phase 1 (data only; nothing reads these yet)
    SNAP_MIN: SNAP_MIN, DAY_WINDOWS: DAY_WINDOWS, AUTHORABLE: AUTHORABLE,
    // scoring blueprint §13.2 — the whole-trip 100-point ledger (Phase 1: structural)
    scoreTrip: scoreTrip, tripEfficiency: tripEfficiency
  };
  global.PRS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
