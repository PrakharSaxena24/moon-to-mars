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
  var STAFF = 8;                 // AIBOS members who actually run the event
  var GUESTS = HEADCOUNT - STAFF; // 16 group-company guests being hosted (don't work)
  var LOAD_CAP = 3;              // tasks on one person before fatigue concentrates
  var FATIGUE_RATE = 9;         // per active task-tick on an overloaded person

  function mulberry32(seed) { var a = seed >>> 0; return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; var t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function L(en, jp) { return { en: en, jp: jp }; }

  // ---- the site map: zones where characters gather (spec §8 simulation screen) ----
  var STATIONS = [
    { id: 'command', name: L('Command', '司令部'), icon: '🏛️', x: 0.50, y: 0.20 },
    { id: 'port',    name: L('Port', '港'),         icon: '⚓', x: 0.16, y: 0.40 },
    { id: 'vessel',  name: L('Vessel', '船'),       icon: '🚢', x: 0.16, y: 0.78 },
    { id: 'lodging', name: L('Lodging', '宿'),      icon: '🏨', x: 0.45, y: 0.78 },
    { id: 'mess',    name: L('Mess hall', '食堂'),  icon: '🍽️', x: 0.74, y: 0.78 },
    { id: 'finance', name: L('Finance', '会計'),    icon: '🧮', x: 0.84, y: 0.40 },
    { id: 'clinic',  name: L('Clinic', '診療所'),   icon: '⛑️', x: 0.84, y: 0.20 }
  ];
  function station(id) { for (var i = 0; i < STATIONS.length; i++) if (STATIONS[i].id === id) return STATIONS[i]; return STATIONS[0]; }

  // The trip is rehearsed one DAY/segment at a time: pick a day, plan it, run it.
  var SEGMENTS = [
    { id: 'arrival', phaseEn: 'Day 1 · Arrival',              name: L('Day 1 · Arrival', '1日目・到着') },
    { id: 'ops',     phaseEn: 'Days 2–9 · Daily operations',  name: L('Days 2–9 · Operations', '2〜9日目・運営') },
    { id: 'return',  phaseEn: 'Day 10 · Return & shipping',   name: L('Day 10 · Return', '10日目・帰着') }
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
    { id: 'owner',      name: L('Project Owner', 'プロジェクトオーナー'), icon: '👑', color: '#caa53b' },
    { id: 'pm',         name: L('PM / Lead', '総合責任者 / PM'),          icon: '📋', color: '#3a6ea5' },
    { id: 'siteLead',   name: L('Site Lead', '現地責任者'),               icon: '🧭', color: '#2f9e6f' },
    { id: 'budgetLead', name: L('Budget Lead', '予算責任者'),             icon: '🧮', color: '#9b6dd6' },
    { id: 'safetyLead', name: L('Safety Lead', '安全責任者'),             icon: '⛑️', color: '#d9534f' },
    { id: 'logi',       name: L('Logistics', 'ロジ担当'),                 icon: '📦', color: '#c77d2e' },
    { id: 'comms',      name: L('Comms / Records', '連絡・記録'),         icon: '🎧', color: '#3a9ad6' },
    { id: 'teamLead',   name: L('Team Lead', 'チームリーダー'),           icon: '🚩', color: '#56923e' },
    { id: 'specialist', name: L('Specialist', '専門担当'),                icon: '🎣', color: '#7a869a' },
    { id: 'crew',       name: L('Crew', '一般メンバー'),                  icon: '🧑', color: '#8a93a6' }
  ];
  function role(id) { for (var i = 0; i < ROLES.length; i++) if (ROLES[i].id === id) return ROLES[i]; return ROLES[ROLES.length - 1]; }

  var COMPANIES = {
    co_aibos: L('AIBOS (organizer)', 'AIBOS（運営）'),
    co_hd:  L('Holdings (HQ)', 'ホールディングス（本社）'),
    co_mar: L('Marine Div.', 'マリン事業部'),
    co_fin: L('Finance Co.', 'ファイナンス社'),
    co_hr:  L('HR & Admin', '人事総務社'),
    co_it:  L('IT Solutions', 'ITソリューションズ社')
  };

  // ===========================================================================
  // TEMPLATE — the pre-built Ogasawara plan, shipped GAPPY (spec §19/§24).
  // Fields marked  // GAP  are the seeded weaknesses the player must fix.
  // ===========================================================================
  function makeTemplate() {
    var pA = L('Day 1 · Arrival', '1日目・到着'),
        pOps = L('Days 2–9 · Daily operations', '2〜9日目・運営'),
        pR = L('Day 10 · Return & shipping', '10日目・帰着・発送');
    return {
      project: {
        id: 'ogasawara10',
        name: L('Ogasawara 10-Day Company Retreat', '小笠原10日間 社員イベント'),
        goal: L('Build cross-company bonds over a 10-day shared stay and fishing — safely and within budget.',
                'グループ会社横断メンバーが10日間共に生活し、釣り体験を通じて、安全かつ予算内で結束を深める。'),
        days: DAYS, location: L('Ogasawara (Chichijima)', '小笠原（父島）'), headcount: HEADCOUNT, staff: STAFF, guests: GUESTS,
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

      // The 8 AIBOS members who actually RUN the event (one per management role).
      // The other 16 are group-company guests being hosted — they fish/eat/rest, they don't work.
      participants: [
        { id: 'p01', name: L('Tanaka Kenji', '田中 健司'), company: 'co_aibos', roleId: 'owner',      skill: { lead: 5 },                stamina: 4, constraints: {} },
        { id: 'p02', name: L('Sato Aoi', '佐藤 葵'),       company: 'co_aibos', roleId: 'pm',         skill: { plan: 5, coord: 5 },      stamina: 4, constraints: {} },
        { id: 'p03', name: L('Suzuki Riku', '鈴木 陸'),    company: 'co_aibos', roleId: 'siteLead',   skill: { field: 5, fishing: 4 },   stamina: 5, constraints: {} },
        { id: 'p04', name: L('Ito Mei', '伊藤 芽衣'),      company: 'co_aibos', roleId: 'budgetLead', skill: { finance: 5 },             stamina: 3, constraints: {} },
        { id: 'p05', name: L('Yamamoto Go', '山本 剛'),    company: 'co_aibos', roleId: 'safetyLead', skill: { fishing: 5, firstAid: 4 },stamina: 5, constraints: {} },
        { id: 'p06', name: L('Nakamura Yui', '中村 結衣'), company: 'co_aibos', roleId: 'logi',       skill: { logistics: 4, drive: 3 }, stamina: 4, constraints: {} },
        { id: 'p07', name: L('Kobayashi Jun', '小林 純'),  company: 'co_aibos', roleId: 'comms',      skill: { record: 4 },              stamina: 3, constraints: {} },
        { id: 'p08', name: L('Kato Hana', '加藤 花'),      company: 'co_aibos', roleId: 'teamLead',   skill: { coord: 4, cook: 3 },      stamina: 4, constraints: { allergy: 'shellfish' } }
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
        teamLead:   { holder: 'p08', authority: { canDecide: false,canPay: false, payCap: 0,        canAbort: false }, deputyId: 'p06', reportTo: 'siteLead', neededInfo: ['ic_rooms'],    decisionDeadline: '5min' }
      },

      tasks: [
        // --- Day 1: arrival ---
        { id: 't01', name: L('Ferry boarding & assemble', '乗船確認・集合'),          station: 'port',    phase: pA,   ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 0, dur: 1,   deps: [],          difficulty: 2, neededResources: ['bus'],     neededInfo: ['ic_ferry'],    neededAuthority: null },
        { id: 't02', name: L('Sea crossing & seasickness', '渡航・船酔い対応'),       station: 'vessel',  phase: pA,   ownerRoleId: 'siteLead',   assignedIds: ['p03', 'p05'],        startDay: 0, dur: 1,   deps: ['t01'],     difficulty: 3, neededResources: ['medkit'],  neededInfo: ['ic_ferry'],    neededAuthority: null },
        { id: 't03', name: L('Check-in & room assignment', '受付・部屋割り'),         station: 'lodging', phase: pA,   ownerRoleId: 'teamLead',   assignedIds: ['p08'],               startDay: 0, dur: 1.5, deps: ['t02'],     difficulty: 1, neededResources: ['keys'],    neededInfo: ['ic_rooms'],    neededAuthority: null },
        { id: 't_intake', name: L('Supply & gear intake (drinks, tackle, food, ice)', '物資・釣具搬入（飲料・釣具・食材・氷）'), station: 'lodging', phase: pA, ownerRoleId: 'logi', assignedIds: ['p06'], startDay: 0, dur: 1.5, deps: ['t02'], difficulty: 2, neededResources: ['storage'], neededInfo: ['ic_tackle'], neededAuthority: null },
        // --- Days 2–9: daily operations ---
        { id: 't_safety', name: L('Safety & weather watch', '安全・天候監視'),        station: 'clinic',  phase: pOps, ownerRoleId: 'safetyLead', assignedIds: ['p05'],               startDay: 1, dur: 8,   deps: [],          difficulty: 4, neededResources: ['medkit'],  neededInfo: ['ic_hospital'], neededAuthority: 'abort' }, // GAP A: no abort authority
        { id: 't_health', name: L('Health-issue response', '体調不良対応'),           station: 'clinic',  phase: pOps, ownerRoleId: 'safetyLead', assignedIds: ['p05'],               startDay: 1, dur: 8,   deps: [],          difficulty: 3, neededResources: ['medkit'],  neededInfo: ['ic_hospital'], neededAuthority: null },
        { id: 't06', name: L('Tackle prep', '釣具準備'),                             station: 'port',    phase: pOps, ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 1, dur: 1,   deps: ['t_intake'],difficulty: 2, neededResources: ['tackle'],  neededInfo: ['ic_tackle'],   neededAuthority: null },
        { id: 't07', name: L('Fishing trip (boat)', '釣行（船上）'),                 station: 'vessel',  phase: pOps, ownerRoleId: 'siteLead',   assignedIds: ['p03', 'p05'],        startDay: 2, dur: 6,   deps: ['t06'],     difficulty: 4, neededResources: ['boat', 'tackle'], neededInfo: ['ic_ferry'], neededAuthority: 'abort' },
        { id: 't08', name: L('Catch handling & ice', '漁獲処理・保管'),              station: 'mess',    phase: pOps, ownerRoleId: 'logi',       assignedIds: ['p06'],               startDay: 2, dur: 6,   deps: ['t07'],     difficulty: 2, neededResources: ['ice'],     neededInfo: [],              neededAuthority: null },
        { id: 't_prep', name: L('Food prep', '食材仕込み'),                          station: 'mess',    phase: pOps, ownerRoleId: 'teamLead',   assignedIds: ['p08', 'p04'],        startDay: 1, dur: 8,   deps: ['t_intake'],difficulty: 3, neededResources: ['food'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't04', name: L('Serving meals & allergies', '食事提供・アレルギー対応'), station: 'mess',  phase: pOps, ownerRoleId: 'teamLead',   assignedIds: ['p08'],               startDay: 1, dur: 8,   deps: ['t_prep'],  difficulty: 3, neededResources: ['food'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't_clean', name: L('Cleaning & lodging upkeep', '清掃・宿泊管理'),       station: 'lodging', phase: pOps, ownerRoleId: 'teamLead',   assignedIds: ['p08'],               startDay: 1, dur: 8,   deps: [],          difficulty: 1, neededResources: [],          neededInfo: [],              neededAuthority: null },
        { id: 't11', name: L('Daily accounting & reconcile', '日次精算・領収書'),     station: 'finance', phase: pOps, ownerRoleId: 'budgetLead', assignedIds: ['p04'],               startDay: 1, dur: 8,   deps: [],          difficulty: 2, neededResources: ['cash'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't_report', name: L('Daily report & headcount', '日次報告・点呼'),       station: 'command', phase: pOps, ownerRoleId: 'comms',      assignedIds: ['p07', 'p02'],        startDay: 1, dur: 8,   deps: [],          difficulty: 2, neededResources: [],          neededInfo: ['ic_return'],   neededAuthority: null },
        // --- Day 10: return & shipping ---
        { id: 't_ship', name: L('Ship remaining supplies & teardown', '残置物の発送・撤収'), station: 'port', phase: pR, ownerRoleId: 'logi',     assignedIds: [],                    startDay: 9, dur: 1,   deps: ['t_clean'], difficulty: 3, neededResources: ['shipping'],neededInfo: ['ic_tackle'],   neededAuthority: null }, // GAP G: unstaffed
        { id: 't_settle', name: L('Final settlement & receipts', '最終精算・領収書'),  station: 'finance', phase: pR,   ownerRoleId: 'budgetLead', assignedIds: ['p04'],               startDay: 9, dur: 1,   deps: ['t11'],     difficulty: 2, neededResources: ['cash'],    neededInfo: ['ic_food'],     neededAuthority: 'pay' },
        { id: 't12', name: L('Return headcount & departure', '帰着点呼・出発'),        station: 'port',    phase: pR,   ownerRoleId: 'comms',      assignedIds: ['p07', 'p03'],        startDay: 9, dur: 1,   deps: ['t_ship'],  difficulty: 2, neededResources: [],          neededInfo: ['ic_return'],   neededAuthority: null }
      ],

      infoCards: [
        { id: 'ic_ferry',    name: L('Ferry departure time', '船の出港時刻'),       reason: L('Everyone must reach the boat on time; a miss cascades 24h.', '全員が定刻に乗船する必要。逃すと24時間遅延。'),
          ownerRoleId: 'pm',         recipientRoleIds: ['pm'],                                       shareTiming: L('night before 20:00 + morning', '前日20時＋当日朝'), secrecy: 'all', impactIfUnshared: L('Confusion, missed boat, 24h delay.', '混乱・乗り遅れ・24時間遅延。') }, // GAP C: only PM
        { id: 'ic_rooms',    name: L('Room assignment', '部屋割り'),                 reason: L('Check-in flow and key handout.', 'チェックインと鍵配布のため。'),
          ownerRoleId: 'teamLead',   recipientRoleIds: ['siteLead', 'comms', 'teamLead'],            shareTiming: L('on arrival', '到着時'), secrecy: 'all', impactIfUnshared: L('Check-in chaos.', 'チェックイン混乱。') },
        { id: 'ic_hospital', name: L('Emergency hospital / evac', '緊急病院・搬送先'), reason: L('Needed instantly on injury/illness.', '負傷・体調不良時に即必要。'),
          ownerRoleId: 'safetyLead', recipientRoleIds: ['pm', 'siteLead', 'comms', 'safetyLead'],    shareTiming: L('day before', '前日'), secrecy: 'all', impactIfUnshared: L('Delayed care, safety risk.', '手当遅延・安全リスク。') },
        { id: 'ic_food',     name: L('Food source & allergy list', '食材調達先・アレルギー一覧'), reason: L('Avoid allergic reactions / diet errors.', 'アレルギー・食事ミスの防止。'),
          ownerRoleId: 'budgetLead', recipientRoleIds: ['specialist', 'teamLead', 'budgetLead'],     shareTiming: L('day before', '前日'), secrecy: 'all', impactIfUnshared: L('Allergic incident, satisfaction drop.', 'アレルギー事故・満足度低下。') },
        { id: 'ic_tackle',   name: L('Fishing tackle list', '釣り道具リスト'),       reason: L('Right gear per boat / spot.', '船・ポイント別の適切な道具。'),
          ownerRoleId: 'logi',       recipientRoleIds: ['siteLead', 'specialist', 'logi'],           shareTiming: L('day before', '前日'), secrecy: 'all', impactIfUnshared: L('Missing gear, trip delayed.', '道具不足・釣行遅延。') },
        { id: 'ic_return',   name: L('Return headcount confirmation', '帰着確認'),   reason: L('Confirm everyone is accounted for.', '帰着時に全員の所在を確認。'),
          ownerRoleId: 'comms',      recipientRoleIds: ['pm', 'owner', 'safetyLead', 'comms'],       shareTiming: L('on return', '帰着時'), secrecy: 'role', impactIfUnshared: L('Someone left behind unnoticed.', '置き去りに気づけない。') }
      ],

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
        reserve: 0   // GAP F: no cash reserve
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
      ]
    };
  }

  // ---- accessors over a (merged) plan ----
  function byId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i]; return null; }
  function lineById(plan, id) { return byId(plan.budget.lines, id); }
  function loadOf(plan, pid) { var n = 0; for (var i = 0; i < plan.tasks.length; i++) if (plan.tasks[i].assignedIds.indexOf(pid) >= 0) n++; return n; }

  // ---- merge the player's overrides onto the gappy TEMPLATE ----
  function mergePlan(cfg) {
    var plan = makeTemplate(), o = (cfg && cfg.overrides) || {};
    var k;
    if (o.roles) for (k in o.roles) if (plan.roles[k]) for (var rk in o.roles[k]) plan.roles[k][rk] = o.roles[k][rk];
    if (o.staffing) for (k in o.staffing) { var t = byId(plan.tasks, k); if (t) t.assignedIds = o.staffing[k].slice(); }
    if (o.info) for (k in o.info) { var c = byId(plan.infoCards, k); if (c) for (var ck in o.info[k]) c[ck] = o.info[k][ck]; }
    if (o.budget) {
      if (o.budget.lines) for (k in o.budget.lines) { var bl = lineById(plan, k); if (bl) for (var lk in o.budget.lines[k]) bl[lk] = o.budget.lines[k][lk]; }
      if (typeof o.budget.reserve === 'number') plan.budget.reserve = o.budget.reserve;
    }
    if (o.risks) for (k in o.risks) { var rk2 = byId(plan.risks, k); if (rk2) for (var xk in o.risks[k]) rk2[xk] = o.risks[k][xk]; }
    if (o.comms) for (k in o.comms) { var cr = byId(plan.commRules, k); if (cr) for (var mk in o.comms[k]) cr[mk] = o.comms[k][mk]; }
    return plan;
  }

  // ===========================================================================
  // detect(plan) — the explainable rule engine (spec §13). Pure: reads only data.
  // Returns the active problems; each names a station to pile up at and a fixId.
  // ===========================================================================
  var DETECTORS = [
    {
      id: 'safety', category: 'safety', state: 'onFire', station: 'clinic', roleId: 'safetyLead',
      fixId: 'setSafety', severity: 'high', taskIds: ['t_safety', 't07'],
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
        var f = byId(plan.infoCards, 'ic_ferry'), need = ['siteLead', 'teamLead', 'logi', 'safetyLead'];
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
      test: function (plan) { return !(plan.budget.reserve > 0); }
    },
    {
      id: 'returnLogi', category: 'roles', state: 'confused', station: 'port', roleId: 'logi',
      fixId: 'setReturn', severity: 'med', taskIds: ['t_ship', 't12'],
      test: function (plan) { var s = byId(plan.tasks, 't_ship'); return !s || s.assignedIds.length === 0; }
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
      ensure(o, 'info').ic_ferry = { recipientRoleIds: ['pm', 'siteLead', 'teamLead', 'logi', 'safetyLead'] };
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
    }
    return cfg;
  }
  function applyAllFixes(cfg) { var ids = ['setSafety', 'grantAuth', 'shareInfo', 'setReport', 'rebalance', 'fixReserve', 'setReturn']; for (var i = 0; i < ids.length; i++) cfg = applyFix(cfg, ids[i]); return cfg; }

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
  // createSim / tick — the animated rehearsal over the 10-day clock.
  // ===========================================================================
  function createSim(cfg, segment) {
    cfg = cfg || { seed: 1, overrides: {} };
    var plan = mergePlan(cfg);
    var sIdx = segIndex(segment);  // -1 = whole trip; otherwise rehearse just this day
    var problems = (sIdx < 0) ? detect(plan) : gapsForSegment(plan, segment);  // only the chosen day's gaps animate
    var probByTask = {};
    problems.forEach(function (p) { p.taskIds.forEach(function (tid) { if (!probByTask[tid]) probByTask[tid] = p; }); });
    var blocked = blockedTasks(plan, problems);

    var tasks = plan.tasks.map(function (t) {
      var ti = phaseSegIndex(t.phase);
      var scope = (sIdx < 0) ? 'in' : (ti < sIdx ? 'pre' : (ti > sIdx ? 'post' : 'in')); // earlier days assumed done; later days hidden
      return { id: t.id, name: t.name, station: t.station, phase: t.phase, ownerRoleId: t.ownerRoleId,
        assignedIds: t.assignedIds.slice(), startDay: t.startDay, dur: t.dur, deps: t.deps.slice(), scope: scope,
        progress: scope === 'pre' ? 1 : 0, state: scope === 'pre' ? 'done' : 'pending', stalled: false, problem: probByTask[t.id] || null, blocked: !!blocked[t.id] };
    });
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

    return {
      cfg: { seed: (cfg.seed >>> 0) || 1, overrides: clone(cfg.overrides || {}) },
      plan: plan, rng: mulberry32((cfg.seed >>> 0) || 1),
      segment: segment || 'all', segTaskIds: inTasks.map(function (t) { return t.id; }), segEnd: segEnd,
      day: d0, clock: d0, tick: 0, finished: null, phaseLabel: null,
      tasks: tasks, participants: participants, problems: problems,
      stations: STATIONS.map(function (s) { return { id: s.id, name: s.name, icon: s.icon, x: s.x, y: s.y, crewIds: [], dominantProblem: null }; }),
      budget: { total: plan.budget.total, spent: 0, reserve: plan.budget.reserve },
      events: [], bannerOn: false, bannerEverFired: false
    };
  }

  function chars(sim) { return sim.participants; } // render alias

  function tick(sim) {
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

    var cat = {
      objective: 20 * goalPct,
      schedule:  15 * goalPct - (act.fatigue ? 2 : 0) - (act.returnLogi ? 2 : 0),
      roles:     15 - (act.safety ? 5 : 0) - (act.budgetAuth ? 4 : 0) - (act.returnLogi ? 3 : 0),
      info:      15 - (act.info ? 8 : 0) - (act.report ? 7 : 0),
      budget:    10 - (act.budgetAuth ? 6 : 0) - (act.reserve ? 4 : 0),
      safety:    10 - (act.safety ? 10 : 0),
      quality:   10 * goalPct,
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
      budgetSpent: sim.budget.spent, budgetTotal: sim.budget.total
    };
  }
  function sevRank(s) { return s === 'high' ? 3 : s === 'med' ? 2 : 1; }

  var api = {
    DT: DT, DAYS: DAYS, HEADCOUNT: HEADCOUNT, STATIONS: STATIONS, ROLES: ROLES, COMPANIES: COMPANIES,
    CAT_MAX: CAT_MAX, DETECTORS: DETECTORS,
    SEGMENTS: SEGMENTS, segIndex: segIndex, gapsForSegment: gapsForSegment, daySummary: daySummary,
    mulberry32: mulberry32, makeTemplate: makeTemplate, mergePlan: mergePlan, detect: detect,
    applyFix: applyFix, applyAllFixes: applyAllFixes, createSim: createSim, tick: tick, score: score,
    role: role, station: station, chars: chars
  };
  global.PRS = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
