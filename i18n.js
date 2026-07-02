/* ============================================================================
 * i18n.js — every UI string in English (en) and Japanese (ja).
 * KEEP EN AND JA IN PARITY: every key must exist in both. Entity labels
 * (participant/role/task/card names) live on the data in engine.js as {en,jp}.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var STR = {
    en: {
      // --- header ---
      title: 'Ogasawara Rehearsal',
      subtitle: 'Rehearse before you run',
      tagline: 'Set roles, authority, info, budget and report routes — then press Run and watch where people stall. Every stall is a gap in the plan, not a bad employee. Fix the gaps, re-run toward 100.',
      rulesBtn: 'How it works',
      closeBtn: 'Close',

      // --- setup ---
      canvasTitle: 'Project canvas',
      cvDays: 'Period', cvDaysUnit: 'days',
      cvLocation: 'Location', cvHeadcount: 'Participants', cvBudget: 'Budget cap', cvConstraints: 'Constraints', cvSuccess: 'Success conditions',
      cvHeadcountNote: function (s, g, c) { return s + ' organizers · ' + (c || 0) + ' chefs · ' + g + ' guests'; }, guestsShort: 'guests',
      orgTitle: 'Org & roles',
      orgHint: 'Who is responsible for what. A role with no deputy or unclear authority is where people stall.',
      timelineTitle: 'Timeline (10 days)',
      designTitle: 'Design decisions — close the gaps',
      designHint: 'Each control below is a design decision the plan is missing. Make the right call to close the gap; leave it and characters will stall there when you run.',
      readyTitle: 'Pre-run check:',
      autoBtn: 'Auto-fix all', clearBtn: 'Reset to gappy',
      launchBtn: 'Run rehearsal ▶',
      wholeTrip: 'Whole trip',
      runDayBtn: function (d) { return 'Run ' + d + ' ▶'; },
      planDayLine: function (d, n) { return 'Planning ' + d + ' — ' + n + ' decision' + (n === 1 ? '' : 's') + ' for this day.'; },
      hintReadyDay: function (d) { return '✅ ' + d + ' is ready — run it to confirm.'; },
      rDayDone: function (d) { return d + ' ran clean — everyone could move.'; },
      rDayGaps: function (d) { return d + ' stalled — close the gaps and re-run.'; },
      badgeDayClean: '✓ DAY READY',
      dayTasksLine: function (done, total) { return done + ' / ' + total + ' of the day’s tasks ran clean'; },
      fixpackCleanDay: function (d) { return '✅ ' + d + ' has no gaps — ready to run for real.'; },

      // --- run ---
      overallLbl: 'Overall readiness', budgetLbl: 'Budget used', warningsLbl: 'Live warnings', perfLbl: 'Performance',
      speedLbl: 'Speed', pauseBtn: 'Pause', resumeBtn: 'Resume', quitBtn: 'End & review',
      noWarnings: 'No warnings — the plan is running clean.',
      bannerText: '⛔ The rehearsal froze — a critical gap stopped the team',
      legWorking: 'working', legStuck: 'stalled (a gap)', legResolved: 'done',
      logStart: 'Rehearsal started: Ogasawara, day 1.',

      // --- report ---
      gradeLbl: 'Rehearsal grade',
      rDone: 'The plan runs — everyone could move, no one stalled.',
      rIncomplete: 'Weaknesses surfaced — people stalled where the plan has gaps.',
      badgePerfect: '⭐ READY TO RUN ⭐',
      scorecardTitle: 'Scorecard — 8 categories',
      fixpackTitle: 'Fix-pack — fix a gap & re-run',
      fixpackHint: 'These are the gaps that stalled the rehearsal (worst first). Apply a fix and re-run — the score climbs toward 100.',
      fixpackClean: '✅ No gaps left — the plan is ready to run for real.',
      individualsTitle: 'Individual performance values',
      applyFixBtn: 'Apply fix & re-run',
      editBtn: 'Edit plan', againBtn: 'Run again',

      // --- 8 categories (spec §16) ---
      catObjective: 'Goal achievement', catSchedule: 'Schedule', catRoles: 'Roles & authority', catInfo: 'Info & comms',
      catBudget: 'Budget & resources', catSafety: 'Safety & risk', catQuality: 'Quality & satisfaction', catHealth: 'Team health',

      // --- 6 individual values (spec §17) ---
      ivName: 'Member', ivAction: 'Can-act', ivDecision: 'Can-decide', ivLoad: 'Load', ivFatigue: 'Fatigue', ivCoop: 'Coordination', ivContribution: 'Contribution',

      // --- character states (spec §9 + fishday §8) ---
      stWorking: 'Working', stConfused: 'Hesitating', stMeeting: 'Endless huddle', stWaiting: 'Waiting on approval',
      stTired: 'Exhausted', stOnFire: 'In crisis', stResolved: 'Resolved', stIdle: 'Idle',
      stWaitInfo: 'Waiting on info (手待ち)', stRework: 'Redoing — wrong assumption (手戻り)',
      legWaitInfo: 'waiting on info', legRework: 'rework',

      // --- fishday editor (§7) ---
      fdTitle: 'Fishing-day plan — timeline & info handoffs',
      fdHint: 'Day 3 runs minute by minute. Drag a block to re-time it (5-min snap), drag its right edge to resize. Every hollow socket ● is a fact a task needs — draw an arrow from a producing port ○ (or tap the socket) so the info lands BEFORE the task starts. Channels add minutes: face-to-face +0 · radio +1 · phone +2 · chat +10 · board +30.',
      fdArrowsLbl: 'Information handoffs (click an arrow to re-time it)',
      fdReadyLbl: 'Ready-check:',
      fdProjected: function (score, eff) { return 'Projected: ' + score + ' / 100 · efficiency ' + eff + '%'; },
      fdReadyOk: '✓ Every handoff lands on time.',
      fdDayLine: function (tm) { return 'Day 3 · ' + tm; },
      rhMissing: function (card, task) { return '● “' + card + '” never handed to “' + task + '” — draw the arrow'; },
      rhLate: function (card, task, n) { return '⚑ “' + card + '” lands ' + n + ' min after “' + task + '” starts'; },
      rhWrongFish: function (card, task) { return '🐟 “' + task + '” will guess “' + card + '” — wrong-fish rework'; },
      rhDep: function (task, dep) { return '⛓ “' + task + '” starts before “' + dep + '” finishes'; },
      rhOverload: function (who) { return '⚠ ' + who + ' is double-booked'; },
      rhUnstaffed: function (task) { return '⚠ “' + task + '” has nobody assigned'; },
      rhDuty: function (role) { return '⚠ duty “' + role + '” is unassigned'; },
      arFrom: 'From', arTo: 'To', arTrigger: 'Send when', arChannel: 'Channel (adds minutes)',
      arTrigDone: 'when the producing task finishes', arTrigAt: 'at a set time',
      arriveOk: function (tm) { return '✓ arrives ' + tm + ' — in time'; },
      arriveLate: function (tm, n) { return '⚑ arrives ' + tm + ' — ' + n + ' min LATE'; },
      arriveAssume: 'If late, the crew proceeds on a guess → wrong-fish rework.',
      arDelete: 'Erase arrow',
      chFaceToFace: 'Face-to-face 対面', chRadio: 'Radio 無線', chPhone: 'Phone 電話', chChat: 'Chat チャット', chBoard: 'Notice board 掲示板',

      // --- run: efficiency readouts ---
      effLbl: 'Efficiency 稼働効率',
      idleLine: function (i, r) { return 'idle ' + i + ' min · rework ' + r + ' min'; },

      // --- checkpoint inspector (§8 関所) ---
      inspTitle: 'Checkpoint',
      inspSub: 'Inspect each member: what they hold, what they wait on, what comes next. “Send now” hands a card over to unblock THIS run — the plan gap stays until you fix the plan.',
      inspNowDoing: 'now', inspNext: 'next', inspIdleFree: 'not waiting on anything',
      sendNow: 'Send now', inspResume: 'Resume ▶',
      handFedNote: function (n) { return 'hand-fed ' + n + '× this run (plan unchanged)'; },

      // --- fishday report chips ---
      rcEff: function (e) { return 'Efficiency ' + e + '%'; },
      rcIdle: function (n) { return 'Idle ' + n + ' min'; },
      rcRework: function (n) { return 'Rework ' + n + ' min'; },
      rcDinner: function (tm) { return 'Dinner served ' + tm; },
      rcWrongFish: function (n) { return n + ' wrong-fish event' + (n === 1 ? '' : 's'); },

      // --- detectors / gaps (title · cause · fix · needed role) + setup editor copy ---
      p_safety_title: 'Safety lead has no abort authority',
      p_safety_cause: 'Yamamoto is the safety lead, but nobody is empowered to call an abort on rough sea or night and there is no deputy — so fishing freezes in a crisis.',
      p_safety_fix: 'Give the safety lead abort authority and a deputy, and set abort criteria for rough sea and night.',
      p_safety_need: 'Safety Lead',
      e_safety_label: 'Safety authority (sea / night)', e_safety_off: 'Named, but no authority', e_safety_on: 'Abort authority + deputy + criteria',

      p_budgetAuth_title: 'Meals has no budget authority',
      p_budgetAuth_cause: 'Meal buyers cannot pay without an approver, so they pile up at finance waiting on a decision.',
      p_budgetAuth_fix: 'Set a daily cap and an approver for meal purchases (Budget Lead).',
      p_budgetAuth_need: 'Budget Lead',
      e_budgetAuth_label: 'Meals budget approver', e_budgetAuth_off: '— none —', e_budgetAuth_on: 'Budget Lead (with daily cap)',

      p_info_title: 'Ferry time known only to the PM',
      p_info_cause: 'Team leads don’t know the departure time, so they hesitate and check phones at the port.',
      p_info_fix: 'Share the ferry departure time with every team lead the night before at 20:00 and again that morning.',
      p_info_need: 'PM (card owner)',
      e_info_label: 'Ferry-time card sharing', e_info_off: 'PM only', e_info_on: 'Shared to all leads (night + morning)',

      p_report_title: 'No illness report route',
      p_report_cause: 'When someone falls ill there is no agreed report path, so the problem grows unmanaged elsewhere.',
      p_report_fix: 'Route illness reports Safety lead → PM → Owner, immediately.',
      p_report_need: 'Safety → PM → Owner',
      e_report_label: 'Illness report route', e_report_off: '— none —', e_report_on: 'Safety → PM → Owner (immediate)',

      p_fatigue_title: 'Site lead overloaded',
      p_fatigue_cause: 'The site lead carries crossing, fishing and teardown alone with no deputy, and burns out mid-trip.',
      p_fatigue_fix: 'Add a deputy and split movement, fishing and comms across more people.',
      p_fatigue_need: 'Site Lead deputy',
      e_fatigue_label: 'Site-lead deputy & load', e_fatigue_off: 'No deputy (overloaded)', e_fatigue_on: 'Deputy Mori + spread the load',

      p_reserve_title: 'No cash reserve',
      p_reserve_cause: 'If cards or comms fail on the island there is no cash buffer, and on-site spending stalls.',
      p_reserve_fix: 'Set a cash reserve for when comms fail or cards are not accepted.',
      p_reserve_need: 'Budget Lead',
      e_reserve_label: 'Cash reserve', e_reserve_off: '¥0 (none)', e_reserve_on: '¥300,000',

      p_returnLogi_title: 'Return shipping & headcount unowned',
      p_returnLogi_cause: 'On the last day no one owns shipping out the remaining drinks, tackle and ice, or confirming the return headcount — supplies get left and people scatter at the port.',
      p_returnLogi_fix: 'Assign a return-logistics owner (Logistics + crew) to ship the remaining supplies, and confirm the return headcount Comms → PM before departure.',
      p_returnLogi_need: 'Logistics + Comms',
      e_returnLogi_label: 'Return shipping & headcount', e_returnLogi_off: '— unowned —', e_returnLogi_on: 'Logistics + crew + headcount route',

      p_handoffTiming_title: 'Info handoffs missing or late (fishing day)',
      p_handoffTiming_cause: 'The cook consult (menu → angler & boat) was never handed over, and the tackle list goes out morning-of on a slow channel — the angler idles at the port and the boat heads for the wrong fish, so the galley reworks dinner.',
      p_handoffTiming_fix: 'Draw the menu arrows to the angler and the boat, and hand the tackle list over face-to-face when prep finishes (05:30).',
      p_handoffTiming_need: 'Chef → Angler & Boat',
      e_handoffTiming_label: 'Fishing-day info handoffs', e_handoffTiming_off: 'Menu arrows undrawn · tackle list late', e_handoffTiming_on: 'All arrows drawn & on time',

      // --- problem panel + fixpack labels ---
      pnCause: 'Why it stalls', pnNeeded: 'Needed', pnFix: 'The fix', pnStation: 'Stalls at',
      fixGapLbl: 'gap', fixGapLblN: 'gaps',
      detailDecoy: 'Running clean — no gap here.',

      // --- rules ---
      rulesTitle: 'How it works',
      rConceptT: '🎯 Rehearse before you run',
      rConceptB: 'A great plan on paper is not the same as a plan people can actually move through. Here you set the design, press Run, and a small crew rehearses your Ogasawara event. Where they stall is where the plan needs work.',
      rRunT: '▶ Press Run, then watch the site map',
      rRunB: 'Characters walk between zones — port, vessel, lodging, mess, finance, command, clinic. When a design gap hits a task, its crew pile up at that zone and show why: ❓ hesitating, 💬 endless huddle, ⏳ waiting on approval, 😣 exhausted, 🔥 in crisis. Every stall is computed from the plan, never random.',
      rGapsT: '🧩 Responsibility ≠ authority ≠ information',
      rGapsB: 'A task needs an owner AND a deputy, the authority to decide/pay/abort, the right info in the right hands, a budget route, and a report path. Miss any one and people stall — even capable people. The stalled character is not a failed employee; the place they stalled is the place to fix the plan.',
      rFixT: '🛠️ Fix the gaps, re-run toward 100',
      rFixB: 'Close each gap on the setup screen (or from the fix-pack after a run) and re-run. The rehearsal is meant to be run many times before the real event — fail here so you don’t fail there.',
      rScoreT: '🏅 How you’re scored',
      rScoreB: 'Eight categories score the plan (spec §16): Goal 20 · Schedule 15 · Roles & authority 15 · Info & comms 15 · Budget 10 · Safety 10 · Quality 10 · Team health 5 = 100. Every deduction is tied to a named gap, and a clean plan (no gaps, everyone moves) earns an A. A ≥ 90 · B ≥ 75 · C ≥ 60.',

      // --- function-valued (counts) ---
      dayLine: function (d, t) { return 'Day ' + d + ' / ' + t; },
      budgetTxt: function (pct) { return pct + '% of cap'; },
      gapCount: function (n) { return n + ' design gap' + (n === 1 ? '' : 's') + ' stalled the rehearsal.'; },
      hintGaps: function (n) { return '⚠️ ' + n + ' gap' + (n === 1 ? '' : 's') + ' still open — characters will stall there. Close them, or run to see what happens.'; },
      hintReady: '✅ All gaps closed — the plan should run clean for an A. Press Run to confirm.',
      scoreLine: function (s) { return s + ' / 100'; }
    },

    ja: {
      // --- header ---
      title: '実行前シミュレーター',
      subtitle: '実行前に、一度失敗させる',
      tagline: '役割・権限・情報・予算・報告経路を設計し、「実行」を押して人が止まる場所を見る。止まるのは社員が悪いのではなく、計画の弱点。ギャップを直し、再実行で100点へ。',
      rulesBtn: '遊び方',
      closeBtn: '閉じる',

      // --- setup ---
      canvasTitle: 'プロジェクトキャンバス',
      cvDays: '期間', cvDaysUnit: '日間',
      cvLocation: '場所', cvHeadcount: '参加人数', cvBudget: '予算上限', cvConstraints: '制約', cvSuccess: '成功条件',
      cvHeadcountNote: function (s, g, c) { return '運営' + s + '名・料理' + (c || 0) + '名・ゲスト' + g + '名'; }, guestsShort: 'ゲスト',
      orgTitle: '体制・役割',
      orgHint: '誰が何の責任者か。代理がいない・権限が曖昧な役割こそ、人が止まる場所。',
      timelineTitle: 'タイムライン（10日間）',
      designTitle: '設計判断——ギャップを閉じる',
      designHint: '下の各項目は、計画に欠けている設計判断。正しく選べばギャップが閉じる。放置すると、実行時にその場所で人が止まる。',
      readyTitle: '発進前チェック：',
      autoBtn: '全ギャップ自動修正', clearBtn: '全て未修正に',
      launchBtn: 'リハーサル実行 ▶',
      wholeTrip: '通し（全日）',
      runDayBtn: function (d) { return d + ' を実行 ▶'; },
      planDayLine: function (d, n) { return d + ' を計画——この日の判断 ' + n + ' 件。'; },
      hintReadyDay: function (d) { return '✅ ' + d + ' は準備OK——実行で確認しましょう。'; },
      rDayDone: function (d) { return d + ' はうまく回りました——全員が動けました。'; },
      rDayGaps: function (d) { return d + ' で停止——ギャップを閉じて再実行。'; },
      badgeDayClean: '✓ この日OK',
      dayTasksLine: function (done, total) { return 'この日のタスク ' + done + ' / ' + total + ' が順調'; },
      fixpackCleanDay: function (d) { return '✅ ' + d + ' はギャップなし——本番で実行できます。'; },

      // --- run ---
      overallLbl: '全体準備度', budgetLbl: '予算消化', warningsLbl: 'リアルタイム警告', perfLbl: 'パフォーマンス',
      speedLbl: '速度', pauseBtn: '一時停止', resumeBtn: '再開', quitBtn: '終了して講評',
      noWarnings: '警告なし——計画は順調に進行中。',
      bannerText: '⛔ リハーサル停止——重大なギャップでチームが止まりました',
      legWorking: '作業中', legStuck: '停止（ギャップ）', legResolved: '完了',
      logStart: 'リハーサル開始：小笠原・1日目。',

      // --- report ---
      gradeLbl: 'リハーサル評価',
      rDone: '計画は回りました——全員が動け、誰も止まりませんでした。',
      rIncomplete: '弱点が露呈——計画のギャップで人が止まりました。',
      badgePerfect: '⭐ 実行可能な計画 ⭐',
      scorecardTitle: 'スコアカード——8項目',
      fixpackTitle: '改善パック——ギャップを直して再実行',
      fixpackHint: 'リハーサルを止めたギャップ（重要度順）。修正を適用して再実行すると、点数が100へ近づきます。',
      fixpackClean: '✅ ギャップなし——本番で実行できる計画です。',
      individualsTitle: '個別パフォーマンス値',
      applyFixBtn: '修正して再実行',
      editBtn: '計画を編集', againBtn: 'もう一度',

      // --- 8 categories ---
      catObjective: '目的達成度', catSchedule: 'スケジュール', catRoles: '役割・権限', catInfo: '情報・報連相',
      catBudget: '予算・資源', catSafety: '安全・リスク', catQuality: '品質・満足度', catHealth: 'チーム健康度',

      // --- 6 individual values ---
      ivName: 'メンバー', ivAction: '行動可能度', ivDecision: '判断可能度', ivLoad: '負荷指数', ivFatigue: '疲労値', ivCoop: '連携値', ivContribution: '貢献値',

      // --- character states ---
      stWorking: '作業中', stConfused: '迷い', stMeeting: '合議地獄', stWaiting: '確認待ち',
      stTired: '疲労', stOnFire: '炎上', stResolved: '解決', stIdle: '待機',
      stWaitInfo: '手待ち（情報待ち）', stRework: '手戻り（思い込みのやり直し）',
      legWaitInfo: '手待ち', legRework: '手戻り',

      // --- fishday editor (§7) ---
      fdTitle: '釣行日の計画——タイムラインと情報の受け渡し',
      fdHint: '3日目は分刻みで動きます。ブロックをドラッグで移動（5分刻み）、右端で長さ変更。空いたソケット●は、そのタスクに必要な情報。生産ポート○から矢印を引く（またはソケットをタップ）と、タスク開始「前」に情報が届きます。伝達手段の遅延：対面+0・無線+1・電話+2・チャット+10・掲示板+30分。',
      fdArrowsLbl: '情報の受け渡し（矢印をクリックで調整）',
      fdReadyLbl: '準備チェック：',
      fdProjected: function (score, eff) { return '予測：' + score + ' / 100・稼働効率 ' + eff + '%'; },
      fdReadyOk: '✓ すべての受け渡しが間に合っています。',
      fdDayLine: function (tm) { return '3日目・' + tm; },
      rhMissing: function (card, task) { return '●「' + card + '」が「' + task + '」に未伝達——矢印を引く'; },
      rhLate: function (card, task, n) { return '⚑「' + card + '」が「' + task + '」開始の' + n + '分後に到着'; },
      rhWrongFish: function (card, task) { return '🐟「' + task + '」が「' + card + '」を推測で実行——魚違いの手戻り'; },
      rhDep: function (task, dep) { return '⛓「' + task + '」が「' + dep + '」完了前に開始'; },
      rhOverload: function (who) { return '⚠ ' + who + ' の時間が重複'; },
      rhUnstaffed: function (task) { return '⚠「' + task + '」の担当者が未割当'; },
      rhDuty: function (role) { return '⚠ 役割「' + role + '」が未割当'; },
      arFrom: '送り手', arTo: '受け手', arTrigger: '送るタイミング', arChannel: '伝達手段（遅延）',
      arTrigDone: '生産タスクの完了時', arTrigAt: '時刻指定',
      arriveOk: function (tm) { return '✓ ' + tm + ' 着——間に合う'; },
      arriveLate: function (tm, n) { return '⚑ ' + tm + ' 着——' + n + '分遅い'; },
      arriveAssume: '遅れると推測で進行→魚違いの手戻りになります。',
      arDelete: '矢印を消す',
      chFaceToFace: '対面', chRadio: '無線', chPhone: '電話', chChat: 'チャット', chBoard: '掲示板',

      // --- run: efficiency readouts ---
      effLbl: '稼働効率',
      idleLine: function (i, r) { return '手待ち ' + i + '分・手戻り ' + r + '分'; },

      // --- checkpoint inspector (関所) ---
      inspTitle: 'チェックポイント',
      inspSub: '各メンバーの保有情報・待ち情報・次のタスクを確認。「今すぐ渡す」はこの実行だけを解除——計画のギャップは残ります。',
      inspNowDoing: '現在', inspNext: '次', inspIdleFree: '待ち情報なし',
      sendNow: '今すぐ渡す', inspResume: '再開 ▶',
      handFedNote: function (n) { return 'この実行で手渡し' + n + '回（計画は未修正）'; },

      // --- fishday report chips ---
      rcEff: function (e) { return '稼働効率 ' + e + '%'; },
      rcIdle: function (n) { return '手待ち ' + n + '分'; },
      rcRework: function (n) { return '手戻り ' + n + '分'; },
      rcDinner: function (tm) { return '夕食提供 ' + tm; },
      rcWrongFish: function (n) { return '魚違い ' + n + '件'; },

      // --- detectors / gaps + editor copy ---
      p_safety_title: '安全責任者に中止権限がない',
      p_safety_cause: '山本が安全責任者だが、時化・夜間の中止を判断する権限がなく、代理もいない——危機で釣行が凍りつく。',
      p_safety_fix: '安全責任者に中止権限と代理者を与え、時化・夜間の中止基準を決める。',
      p_safety_need: '安全責任者',
      e_safety_label: '安全の権限（海・夜間）', e_safety_off: '任命済みだが権限なし', e_safety_on: '中止権限＋代理＋基準',

      p_budgetAuth_title: '食事に予算権限がない',
      p_budgetAuth_cause: '食事の支払いに承認者がなく、会計で判断待ちの行列ができる。',
      p_budgetAuth_fix: '食事購入の1日上限と承認者（予算責任者）を設定する。',
      p_budgetAuth_need: '予算責任者',
      e_budgetAuth_label: '食事の予算承認者', e_budgetAuth_off: '— なし —', e_budgetAuth_on: '予算責任者（上限つき）',

      p_info_title: '出港時刻をPMだけが保有',
      p_info_cause: 'チームリーダーが出港時刻を知らず、港で迷い・スマホ確認で止まる。',
      p_info_fix: '出港時刻を前日20時と当日朝に、全チームリーダーへ共有する。',
      p_info_need: 'PM（カード所有者）',
      e_info_label: '出港時刻カードの共有', e_info_off: 'PMのみ', e_info_on: '全リーダーへ共有（前日＋朝）',

      p_report_title: '体調不良の報告先が未設定',
      p_report_cause: '体調不良時の報告経路がなく、別の場所で問題が放置・拡大する。',
      p_report_fix: '体調不良は 安全責任者→PM→オーナー の順に即時報告する。',
      p_report_need: '安全→PM→オーナー',
      e_report_label: '体調不良の報告先', e_report_off: '— なし —', e_report_on: '安全→PM→オーナー（即時）',

      p_fatigue_title: '現地責任者に負荷集中',
      p_fatigue_cause: '現地責任者が渡航・釣行・撤収を一人で抱え、代理もなく途中で消耗する。',
      p_fatigue_fix: '代理を立て、移動・釣行・連絡を複数人で分担する。',
      p_fatigue_need: '現地責任者の代理',
      e_fatigue_label: '現地責任者の代理・負荷', e_fatigue_off: '代理なし（過負荷）', e_fatigue_on: '代理 森＋負荷分散',

      p_reserve_title: '現金予備費がない',
      p_reserve_cause: '離島でカード・通信が不調だと現金の余裕がなく、現地の支出が止まる。',
      p_reserve_fix: '通信不良・カード不可に備え、現金予備費を設定する。',
      p_reserve_need: '予算責任者',
      e_reserve_label: '現金予備費', e_reserve_off: '¥0（なし）', e_reserve_on: '¥300,000',

      p_returnLogi_title: '帰りの発送・点呼に責任者がいない',
      p_returnLogi_cause: '最終日、残った飲料・釣具・氷の発送と帰着点呼の責任者がなく、物資が残され、港で人が散る。',
      p_returnLogi_fix: '帰りの物流責任者（ロジ＋クルー）を立てて残置物を発送し、出発前に 連絡→PM で点呼を確認する。',
      p_returnLogi_need: 'ロジ＋連絡',
      e_returnLogi_label: '帰りの発送・点呼', e_returnLogi_off: '— 未割当 —', e_returnLogi_on: 'ロジ＋クルー＋点呼経路',

      p_handoffTiming_title: '情報の受け渡しが未設定・遅延（釣行日）',
      p_handoffTiming_cause: '料理長への相談（献立→釣り担当・船）が未伝達のうえ、釣具リストが当日朝に遅い手段で届く——釣り担当は港で手待ち、船は違う魚へ向かい、厨房で夕食の手戻りが起きる。',
      p_handoffTiming_fix: '献立の矢印を釣り担当と船へ引き、釣具リストは準備完了時（05:30）に対面で渡す。',
      p_handoffTiming_need: '料理長→釣り担当・船',
      e_handoffTiming_label: '釣行日の情報受け渡し', e_handoffTiming_off: '献立未伝達・釣具リスト遅延', e_handoffTiming_on: '全矢印を定刻どおりに',

      // --- problem panel + fixpack ---
      pnCause: '止まる理由', pnNeeded: '必要な役割', pnFix: '修正', pnStation: '停止場所',
      fixGapLbl: '件', fixGapLblN: '件',
      detailDecoy: '順調——ここにギャップはありません。',

      // --- rules ---
      rulesTitle: '遊び方',
      rConceptT: '🎯 実行前に、リハーサルする',
      rConceptB: '紙の上で立派な計画と、現場で人が動ける計画は別物。ここで設計を入力し「実行」を押すと、小笠原イベントを小さなクルーがリハーサルする。人が止まる場所が、直すべき場所。',
      rRunT: '▶ 実行を押し、サイトマップを見る',
      rRunB: 'キャラクターがゾーン間（港・船・宿・食堂・会計・司令部・診療所）を歩く。設計ギャップがタスクに当たると、そのクルーがそのゾーンに集まり理由を示す：❓迷い、💬合議地獄、⏳確認待ち、😣疲労、🔥炎上。すべて計画から計算され、ランダムではない。',
      rGapsT: '🧩 責任・権限・情報は別物',
      rGapsB: 'タスクには責任者と代理、判断・支払・中止の権限、適切な人への適切な情報、予算経路、報告先が必要。どれか一つ欠けても人は止まる——有能な人でも。止まったキャラクターは失敗した社員ではない。止まった場所こそ、計画を直すべき場所。',
      rFixT: '🛠️ ギャップを直し、再実行で100へ',
      rFixB: '設定画面（または実行後の改善パック）で各ギャップを閉じ、再実行する。リハーサルは本番前に何度も回すもの——ここで失敗して、本番で失敗しない。',
      rScoreT: '🏅 評価のしくみ',
      rScoreB: '計画は8項目で評価（仕様§16）：目的達成20・スケジュール15・役割権限15・情報報連相15・予算10・安全10・品質10・チーム健康5＝100。各減点は必ず特定のギャップに紐づき、ギャップゼロで全員動ける「きれいな計画」はA評価。A≧90・B≧75・C≧60。',

      // --- function-valued ---
      dayLine: function (d, t) { return d + '日目 / ' + t; },
      budgetTxt: function (pct) { return '上限の' + pct + '%'; },
      gapCount: function (n) { return '設計ギャップ ' + n + ' 件がリハーサルを止めました。'; },
      hintGaps: function (n) { return '⚠️ 未修正のギャップが ' + n + ' 件——そこで人が止まります。閉じるか、実行して確認を。'; },
      hintReady: '✅ 全ギャップ解消——きれいに回ってA評価のはず。実行で確認しましょう。',
      scoreLine: function (s) { return s + ' / 100'; }
    }
  };

  global.STR = STR;
  if (typeof module !== 'undefined' && module.exports) module.exports = STR;
})(typeof window !== 'undefined' ? window : globalThis);
