(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HIKONE = api;
  if (typeof document !== 'undefined') boot(api);
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var PEOPLE = [
    { id: 'watanabe', label: { en: 'Watanabe-san', ja: '渡辺さん' }, assignable: false, driver: true },
    { id: 'member-a', label: { en: 'Member A', ja: 'メンバーA' }, assignable: true, driver: false },
    { id: 'member-b', label: { en: 'Member B', ja: 'メンバーB' }, assignable: true, driver: false }
  ];

  var CARDS = [
    { id: 'rods', icon: '╱╱', effort: 2, group: 'tanago', label: { en: 'Fishing rods', ja: '釣り竿' }, proof: { en: 'rods secured', ja: '竿を固定' } },
    { id: 'worms-tanago', icon: '◌', effort: 1, group: 'tanago', label: { en: 'Worms for tanago', ja: 'タナゴ用のミミズ' }, proof: { en: 'worm tub closed', ja: 'ミミズ容器を確認' } },
    { id: 'chicken-bait-suppon', icon: '▱', effort: 1, group: 'suppon', label: { en: 'Chicken bait for suppon', ja: 'スッポン用の鶏肉（エサ）' }, proof: { en: 'bait pack labelled', ja: 'エサ袋を表示' } },
    { id: 'water-filled-tanago-box', icon: '▣', effort: 3, group: 'tanago', label: { en: 'Water-filled tanago holding box', ja: 'タナゴ用の水入りケース' }, proof: { en: 'waterline visible', ja: '水入りを確認' } },
    { id: 'suppon-aquarium-transport', icon: '⬡', effort: 4, group: 'suppon', label: { en: 'Suppon aquarium transport', ja: 'スッポンの観賞用運搬準備' }, proof: { en: 'separate carrier ready', ja: '別の運搬準備を確認' } },
    { id: 'road-drinks', icon: '⌇⌇⌇', effort: 1, group: 'shared', label: { en: 'Drinks for the road', ja: '道中の飲み物' }, proof: { en: 'three drinks in cabin', ja: '3人分を車内へ' } }
  ];

  var BASELINE = Object.freeze({ totalEffort: 12, laneLoads: Object.freeze({ 'member-a': 12, 'member-b': 0 }) });

  function freshState() { return { assignments: {} }; }

  function assign(state, cardId, laneId) {
    var next = { assignments: Object.assign({}, state && state.assignments || {}) };
    var validCard = CARDS.some(function (card) { return card.id === cardId; });
    if (!validCard || (laneId !== 'member-a' && laneId !== 'member-b')) return next;
    next.assignments[cardId] = laneId;
    return next;
  }

  function derive(state) {
    var assignments = state && state.assignments || {};
    var loads = { 'member-a': 0, 'member-b': 0, a: 0, b: 0 };
    var assignedCount = 0;
    var assignedEffort = 0;
    CARDS.forEach(function (card) {
      var lane = assignments[card.id];
      if (lane === 'member-a' || lane === 'member-b') {
        loads[lane] += card.effort;
        assignedCount++;
        assignedEffort += card.effort;
      }
    });
    loads.a = loads['member-a'];
    loads.b = loads['member-b'];
    var bothUsed = loads['member-a'] > 0 && loads['member-b'] > 0;
    var allAssigned = assignedCount === CARDS.length;
    var balancedEnough = Math.max(loads['member-a'], loads['member-b']) <= 7;
    return {
      loads: loads,
      laneLoads: loads,
      assignedCount: assignedCount,
      assignedEffort: assignedEffort,
      allAssigned: allAssigned,
      bothUsed: bothUsed,
      balancedEnough: balancedEnough,
      ready: allAssigned && bothUsed && balancedEnough,
      canBegin: allAssigned && bothUsed && balancedEnough,
      pass: allAssigned && bothUsed && balancedEnough
    };
  }

  return { PEOPLE: PEOPLE, CARDS: CARDS, BASELINE: BASELINE, freshState: freshState, assign: assign, derive: derive };
});

function boot(HIKONE) {
  'use strict';

  var STORAGE_KEY = 'prs.hikone-tutorial.v1';
  var PHASES = ['arrival', 'brief', 'baseline', 'reveal', 'assign', 'prep', 'trunk', 'route', 'lake', 'debrief', 'complete'];
  var COPY = {
    en: {
      exit: 'Exit', soundOff: 'Sound off', soundOn: 'Sound on',
      hudLabel: 'Tutorial controls', progressA11y: 'Tutorial progress', worldA11y: 'Outside Ryokan Izumi and the journey to Lake Biwa',
      captionPlace: 'Outside Ryokan Izumi', captionCity: 'Yokkaichi', routeStart: 'Yokkaichi', routeEnd: 'Hikone · Lake Biwa', effortWord: 'effort', maxWord: 'max',
      locationStart: 'Ryokan Izumi · Yokkaichi', locationRoad: 'Yokkaichi → Hikone', locationLake: 'Lake Biwa · Hikone',
      progress: { arrival: 'Arrival', brief: 'The request', baseline: 'First rehearsal', reveal: 'Find the cause', assign: 'Make the plan', prep: 'Parallel preparation', trunk: 'Visible proof', route: 'On the road', lake: 'Lake Biwa', debrief: 'Debrief', complete: 'Complete' },
      arrivalKicker: '04:45 · Outside Ryokan Izumi · Yokkaichi',
      arrivalTitle: 'The Hikone Morning',
      arrivalLead: 'Three travelers are waiting. Watanabe-san arrives in his own car with a destination—but the preparation work has no owners yet.',
      arrivalMicro: 'Standalone tutorial · about 5–8 minutes · no score',
      begin: 'Meet Watanabe-san',
      briefKicker: 'Watanabe-san · driver', briefTitle: '“We are going to Hikone.”',
      briefQuote: 'Good morning. We’re going from Yokkaichi to Lake Biwa at Hikone. I’ll drive. You two prepare the rods and worms for tanago, chicken bait for suppon, a water-filled holding box for any tanago we catch, the separate aquarium transport setup for a suppon, and drinks for the road. The tanago and suppon are for aquariums, not food. Tell me when everything is loaded.',
      aquariumPurpose: 'Two separate aquarium destinations · never food',
      watchFirst: 'Rehearse the first response',
      baselineKicker: 'First rehearsal · bundled request', baselineTitle: 'One person accepts everything.',
      baselineLead: 'All six preparations form one serial queue. Member A works one-by-one while Member B remains available and Watanabe-san waits beside the car.',
      totalQueue: '12 effort beats', available: 'available', serial: 'Serial queue',
      revealQueue: 'Reveal the waiting',
      revealKicker: 'Causal freeze · 12 / 0', revealTitle: 'The list was complete. The assignment was not.',
      revealLead: 'Nothing is missing and nobody is too slow. Six known preparations became one queue because visible ownership was never shared.',
      revealRule: 'Planning repair: decompose the request, use both people, and keep either queue at 7 effort beats or less.',
      makePlan: 'Give the work owners',
      assignKicker: 'Your turn · retry has no penalty', assignTitle: 'Build two parallel preparation lanes.',
      assignLead: 'Tap a preparation card, then tap Member A or Member B. Each lane runs top-to-bottom; both lanes run at the same time.',
      assigned: 'assigned', effortCap: 'Target · 7 or less', selectCard: 'Select a card to assign', noTasks: 'No preparation owned yet',
      reset: 'Reset plan', rehearse: 'Rehearse this plan', unassigned: 'Unassigned',
      feedbackStart: 'Assign every card and use both members.',
      feedbackOneLane: 'Use both people. One long queue recreates the first rehearsal.',
      feedbackOver: 'This split still leaves one queue above 7. Revise it freely—there is no cost or penalty.',
      feedbackReady: 'Ready to test. Both lanes can finish by effort beat {max}.',
      selectedFor: 'Selected {task}. Choose an owner.', assignedTo: '{task} assigned to {member}.',
      prepKicker: 'Second rehearsal · same work', prepTitle: 'Two lanes move at the same time.',
      prepLead: 'The tasks themselves did not become faster. Clear ownership lets Member A and Member B prepare in parallel while Watanabe-san remains ready to drive.',
      parallelRule: 'Lane A and Lane B advance together', completePrep: 'Check the open trunk',
      trunkKicker: 'Trunk check · visible proof', trunkTitle: 'Everything named in Yokkaichi is loaded.',
      trunkLead: 'Each object carries its owner and its completion evidence. The water-filled tanago box, suppon aquarium carrier, bait, rods, worms, and road drinks all travel with the group.',
      successLine: 'Same people. Same work. Earlier departure.', drive: 'Watanabe-san drives to Hikone',
      routeKicker: 'Route vignette · no planning claims about road or time', routeTitle: 'Yokkaichi → Lake Biwa, Hikone',
      routeLead: 'Watanabe-san drives his car. The two members travel with the preparation they owned; the checklist stays folded because the proof is already in the trunk.',
      arriveLake: 'Arrive at Lake Biwa',
      lakeKicker: 'Lake Biwa · Hikone', lakeTitle: 'The plan arrives with the people.',
      lakeLead: 'Member A and Member B unload the exact preparations they owned into separate tanago, suppon, and shared journey zones.',
      tanagoZone: 'Tanago preparation', supponZone: 'Suppon preparation', sharedZone: 'For the travelers',
      aquariumReady: 'Prepared for two separate aquariums. This scene shows readiness, not a promised catch.',
      reflect: 'See what the plan changed',
      debriefKicker: 'Debrief · one causal lesson', debriefTitle: 'Planning made simultaneous work visible.',
      debriefLead: 'The people and the six preparations never changed. Only ownership changed—turning a 12-beat serial wait into two queues that finish together.',
      before: 'Before · bundled', after: 'After · shared', transfer: 'Transfer question: What could two people prepare at the same time on your next trip or plan?',
      transferPlaceholder: 'Your thought stays on this screen and is not saved.', finish: 'Finish tutorial',
      completeKicker: 'Tutorial complete', completeTitle: 'You turned a request into a plan.',
      completeLead: 'You decomposed six known preparations, gave them visible owners, tested the queues, and confirmed the evidence before departure.',
      stamp: 'BOTH\nREADY', back: 'Return to journeys', replay: 'Replay tutorial',
      ownerA: 'Member A', ownerB: 'Member B', loadedBy: 'Loaded by {member}',
      statusPhase: 'Opened {phase}.', statusReset: 'The assignment board was reset.', statusComplete: 'Tutorial completed. Prepared for both aquariums.'
    },
    ja: {
      exit: '退出', soundOff: '音声オフ', soundOn: '音声オン',
      hudLabel: 'チュートリアル操作', progressA11y: 'チュートリアルの進行', worldA11y: '旅館いずみ前から彦根の琵琶湖までの旅',
      captionPlace: '旅館いずみ前', captionCity: '四日市', routeStart: '四日市', routeEnd: '彦根・琵琶湖', effortWord: '作業量', maxWord: '最大',
      locationStart: '旅館いずみ・四日市', locationRoad: '四日市 → 彦根', locationLake: '琵琶湖・彦根',
      progress: { arrival: '到着', brief: '依頼', baseline: '最初のリハーサル', reveal: '原因を発見', assign: '計画を作る', prep: '並行準備', trunk: '見える証拠', route: '移動中', lake: '琵琶湖', debrief: '振り返り', complete: '完了' },
      arrivalKicker: '04:45・旅館いずみ前・四日市', arrivalTitle: '彦根の朝',
      arrivalLead: '旅に出るのは3人。渡辺さんが自分の車で到着し、行き先を伝えます。しかし、準備の担当はまだ決まっていません。',
      arrivalMicro: '独立チュートリアル・約5〜8分・得点なし', begin: '渡辺さんを迎える',
      briefKicker: '渡辺さん・運転担当', briefTitle: '「彦根へ行きます。」',
      briefQuote: 'おはよう。これから四日市から彦根の琵琶湖へ行きます。運転は私がします。二人で、タナゴ用の竿とミミズ、スッポン用の鶏肉、釣れたタナゴを入れる水入りケース、スッポンを観賞用に連れ帰るための別の運搬準備、それから道中の飲み物を用意してください。タナゴもスッポンも食用ではなく観賞用です。全部、車に積めたら教えてください。',
      aquariumPurpose: '別々の水槽へ迎える準備・食用ではありません', watchFirst: '最初の対応をリハーサル',
      baselineKicker: '最初のリハーサル・依頼をひとまとめ', baselineTitle: '一人がすべてを引き受けます。',
      baselineLead: '6つの準備が一つの直列待ちになります。メンバーAが一つずつ進める間、メンバーBは空いており、渡辺さんは車の横で待ちます。',
      totalQueue: '作業量 12', available: '対応可能', serial: '直列の待ち', revealQueue: '待ちの原因を見る',
      revealKicker: '原因で停止・12 / 0', revealTitle: 'リストは完全でした。担当が決まっていませんでした。',
      revealLead: '忘れ物はなく、誰かが遅いわけでもありません。担当を見える形で分けなかったため、6つの既知の準備が一つの待ちになりました。',
      revealRule: '計画の修正：依頼を分解し、二人を使い、どちらの作業量も7以下にします。', makePlan: '準備の担当を決める',
      assignKicker: 'あなたの番・やり直しは減点なし', assignTitle: '二つの並行準備レーンを作ります。',
      assignLead: '準備カードをタップし、メンバーAまたはBをタップします。各レーンは上から順に進み、二つは同時に動きます。',
      assigned: '件を割り当て', effortCap: '目標・7以下', selectCard: 'カードを選んで担当を決める', noTasks: '担当する準備はまだありません',
      reset: '計画をリセット', rehearse: 'この計画をリハーサル', unassigned: '未割当', feedbackStart: 'すべてのカードを割り当て、二人とも使ってください。',
      feedbackOneLane: '二人を使いましょう。一つの長い待ちは最初のリハーサルと同じです。',
      feedbackOver: 'まだ一方の作業量が7を超えています。無料で何度でも見直せます。減点はありません。',
      feedbackReady: 'テスト可能です。二つのレーンは作業量{max}までに完了できます。', selectedFor: '「{task}」を選択。担当者を選んでください。', assignedTo: '「{task}」を{member}に割り当てました。',
      prepKicker: '2回目のリハーサル・同じ作業', prepTitle: '二つのレーンが同時に動きます。',
      prepLead: '作業そのものが速くなったのではありません。担当が明確になり、メンバーAとBが並行して準備します。渡辺さんは運転の準備をします。',
      parallelRule: 'レーンAとBは同時に進行', completePrep: '開いたトランクを確認',
      trunkKicker: 'トランク確認・見える証拠', trunkTitle: '四日市で挙げたものがすべて載りました。',
      trunkLead: '各物品に担当と完了の証拠があります。タナゴ用の水入りケース、スッポンの観賞用運搬準備、エサ、竿、ミミズ、道中の飲み物が一緒に移動します。',
      successLine: '同じ人。同じ作業。より早い出発。', drive: '渡辺さんの運転で彦根へ',
      routeKicker: '移動の情景・道路や所要時間はモデル化しません', routeTitle: '四日市 → 彦根・琵琶湖',
      routeLead: '渡辺さんが自分の車を運転します。二人は自分が担当した準備と一緒に移動します。証拠はすでにトランクにあるため、チェック表は閉じたままです。', arriveLake: '琵琶湖に到着',
      lakeKicker: '琵琶湖・彦根', lakeTitle: '計画も人と一緒に到着しました。',
      lakeLead: 'メンバーAとBが、自分で担当した準備を、タナゴ、スッポン、共通の道中用品の三つに分けて降ろします。',
      tanagoZone: 'タナゴの準備', supponZone: 'スッポンの準備', sharedZone: '3人の道中用', aquariumReady: '二つの別々の水槽を迎える準備ができました。これは準備の完了であり、釣果を約束するものではありません。', reflect: '計画が変えたものを見る',
      debriefKicker: '振り返り・一つの因果', debriefTitle: '計画によって同時に進める作業が見えました。',
      debriefLead: '3人も6つの準備も変わっていません。変えたのは担当だけです。作業量12の直列待ちが、同時に完了できる二つのレーンになりました。',
      before: '修正前・ひとまとめ', after: '修正後・分担', transfer: '応用する質問：次の旅行や計画で、二人が同時に準備できることは何ですか？', transferPlaceholder: '考えた内容は保存・送信されません。', finish: 'チュートリアルを完了',
      completeKicker: 'チュートリアル完了', completeTitle: '依頼を計画に変えました。',
      completeLead: '6つの既知の準備を分解し、見える担当を決め、二つの待ちをテストし、出発前に証拠を確認しました。',
      stamp: '二人とも\n準備完了', back: '旅を選ぶ画面へ', replay: 'もう一度プレイ', ownerA: 'メンバーA', ownerB: 'メンバーB', loadedBy: '{member}が準備',
      statusPhase: '「{phase}」を開きました。', statusReset: '割り当てをリセットしました。', statusComplete: 'チュートリアル完了。二つの水槽を迎える準備ができました。'
    }
  };

  var app = document.getElementById('hk-app');
  var panel = document.getElementById('hk-panel');
  var live = document.getElementById('hk-live');
  var progressLabel = document.getElementById('hk-progress-label');
  var progressBar = document.getElementById('hk-progress-bar');
  var locationLabel = document.getElementById('hk-location');
  var langEn = document.getElementById('hk-lang-en');
  var langJa = document.getElementById('hk-lang-ja');
  var soundButton = document.getElementById('hk-sound');
  var exitLink = document.querySelector('.hk-exit');
  var hud = document.querySelector('.hk-hud');
  var progress = document.getElementById('hk-progress');
  var world = document.getElementById('hk-world');
  var captionPlace = document.getElementById('hk-caption-place');
  var captionCity = document.getElementById('hk-caption-city');
  var routeStart = document.getElementById('hk-route-start');
  var routeEnd = document.getElementById('hk-route-end');
  var reducedMotionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var state = { phase: 'arrival', lang: document.documentElement.lang === 'ja' ? 'ja' : 'en', plan: HIKONE.freshState(), selected: null, sound: false, reflection: '' };
  var audioContext = null;
  document.body.classList.remove('no-js');

  function t(key) { return COPY[state.lang][key]; }
  function textOf(value) { return value[state.lang] || value.en; }
  function format(template, values) {
    return Object.keys(values || {}).reduce(function (result, key) { return result.replace(new RegExp('\\{' + key + '\\}', 'g'), values[key]); }, template);
  }
  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, function (char) { return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]; });
  }
  function memberName(id) { return id === 'member-a' ? t('ownerA') : t('ownerB'); }
  function cardsFor(lane) { return HIKONE.CARDS.filter(function (card) { return state.plan.assignments[card.id] === lane; }); }
  function phaseIndex() { return Math.max(0, PHASES.indexOf(state.phase)); }
  function announce(message) { live.textContent = ''; window.setTimeout(function () { live.textContent = message; }, 10); }
  function focusPhase() {
    panel.scrollTop = 0;
    window.setTimeout(function () {
      var heading = document.getElementById('hk-phase-title');
      if (heading) heading.focus({ preventScroll: true });
    }, reducedMotionQuery.matches ? 0 : 60);
  }
  function playTone(kind) {
    if (!state.sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      var oscillator = audioContext.createOscillator();
      var gain = audioContext.createGain();
      oscillator.type = kind === 'success' ? 'sine' : 'triangle';
      oscillator.frequency.value = kind === 'success' ? 660 : 390;
      gain.gain.setValueAtTime(.0001, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(.06, audioContext.currentTime + .015);
      gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .18);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(); oscillator.stop(audioContext.currentTime + .2);
    } catch (error) { state.sound = false; renderHud(); }
  }

  function renderHud() {
    document.documentElement.lang = state.lang;
    document.title = state.lang === 'ja' ? '彦根の朝 · 計画チュートリアル' : 'The Hikone Morning · Planning tutorial';
    hud.setAttribute('aria-label', t('hudLabel'));
    progress.setAttribute('aria-label', t('progressA11y'));
    world.setAttribute('aria-label', t('worldA11y'));
    langEn.setAttribute('aria-pressed', state.lang === 'en' ? 'true' : 'false');
    langJa.setAttribute('aria-pressed', state.lang === 'ja' ? 'true' : 'false');
    soundButton.setAttribute('aria-pressed', state.sound ? 'true' : 'false');
    soundButton.setAttribute('aria-label', state.sound ? t('soundOn') : t('soundOff'));
    soundButton.textContent = state.sound ? t('soundOn') : t('soundOff');
    soundButton.title = soundButton.textContent;
    exitLink.textContent = t('exit');
    progressLabel.textContent = COPY[state.lang].progress[state.phase];
    progressBar.style.width = Math.max(7, (phaseIndex() / (PHASES.length - 1)) * 100) + '%';
    locationLabel.textContent = state.phase === 'route' ? t('locationRoad') : (phaseIndex() >= PHASES.indexOf('lake') ? t('locationLake') : t('locationStart'));
    captionPlace.textContent = t('captionPlace');
    captionCity.textContent = t('captionCity');
    routeStart.textContent = t('routeStart');
    routeEnd.textContent = t('routeEnd');
  }

  function syncWorld() {
    Array.prototype.forEach.call(document.querySelectorAll('.hk-prop[data-card]'), function (prop) {
      prop.dataset.owner = state.plan.assignments[prop.dataset.card] || '';
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-en][data-ja]'), function (label) {
      label.textContent = label.getAttribute('data-' + state.lang);
    });
  }

  function miniCards() {
    return '<div class="hk-card-strip">' + HIKONE.CARDS.map(function (card) {
      return '<div class="hk-mini-card"><span aria-hidden="true">' + card.icon + '</span><b>' + escapeHtml(textOf(card.label)) + '</b></div>';
    }).join('') + '</div>';
  }

  function renderArrival() {
    return '<div class="hk-panel-head"><div><p class="hk-kicker">' + t('arrivalKicker') + '</p><h1 id="hk-phase-title" tabindex="-1">' + t('arrivalTitle') + '</h1></div></div>' +
      '<p class="hk-lead">' + t('arrivalLead') + '</p><p class="hk-micro">' + t('arrivalMicro') + '</p>' +
      '<div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('begin') + '</button></div>';
  }
  function renderBrief() {
    return '<p class="hk-kicker">' + t('briefKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('briefTitle') + '</h2>' +
      '<div class="hk-dialogue"><div class="hk-portrait" aria-hidden="true">渡</div><blockquote><cite>Watanabe-san / 渡辺さん</cite>“' + t('briefQuote') + '”</blockquote></div>' +
      '<div class="hk-purpose"><i aria-hidden="true">⌂</i>' + t('aquariumPurpose') + '</div>' + miniCards() +
      '<div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('watchFirst') + '</button></div>';
  }
  function lanePreview(id, load, idle) {
    return '<div class="hk-lane-preview' + (idle ? ' idle' : '') + '"><header><b>' + memberName(id) + '</b><span>' + load + '</span></header><div class="hk-load-track"><i style="width:' + Math.min(100, load / 12 * 100) + '%"></i></div><small>' + (idle ? t('available') : t('serial')) + '</small></div>';
  }
  function renderBaseline() {
    return '<p class="hk-kicker">' + t('baselineKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('baselineTitle') + '</h2><p class="hk-lead">' + t('baselineLead') + '</p>' +
      '<div class="hk-baseline">' + lanePreview('member-a', 12, false) + '<div class="hk-vs">' + t('totalQueue') + '</div>' + lanePreview('member-b', 0, true) + '</div>' +
      '<div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('revealQueue') + '</button></div>';
  }
  function renderReveal() {
    return '<p class="hk-kicker">' + t('revealKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('revealTitle') + '</h2><p class="hk-lead">' + t('revealLead') + '</p><div class="hk-reveal-line">' + t('revealRule') + '</div>' +
      '<div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('makePlan') + '</button></div>';
  }
  function taskCard(card) {
    var owner = state.plan.assignments[card.id];
    var selected = state.selected === card.id;
    return '<button type="button" class="hk-task-card' + (owner ? ' is-assigned' : '') + '" data-card="' + card.id + '" aria-pressed="' + (selected ? 'true' : 'false') + '">' +
      '<span class="hk-task-icon" aria-hidden="true">' + card.icon + '</span><span><b>' + escapeHtml(textOf(card.label)) + '</b><small>' + escapeHtml(textOf(card.proof)) + '</small></span><span class="hk-effort" aria-label="' + card.effort + ' ' + t('effortWord') + '">' + card.effort + '</span>' +
      (owner ? '<span class="hk-owner-chip">' + memberName(owner) + '</span>' : '') + '</button>';
  }
  function memberLane(id, derived) {
    var cards = cardsFor(id);
    var load = derived.loads[id];
    var over = load > 7;
    return '<button type="button" class="hk-member-lane' + (state.selected ? ' is-target' : '') + (over ? ' is-over' : '') + '" data-lane="' + id + '">' +
      '<header><strong>' + memberName(id) + '</strong><span>' + load + '</span></header><small class="hk-lane-cap">' + t('effortCap') + '</small>' +
      (cards.length ? '<span class="hk-lane-stack">' + cards.map(function (card) { return '<span><i aria-hidden="true">' + card.icon + '</i>' + escapeHtml(textOf(card.label)) + '</span>'; }).join('') + '</span>' : '<span class="hk-lane-empty">' + (state.selected ? t('selectCard') : t('noTasks')) + '</span>') + '</button>';
  }
  function assignmentFeedback(derived) {
    if (derived.ready) return { cls: 'good', text: format(t('feedbackReady'), { max: Math.max(derived.loads['member-a'], derived.loads['member-b']) }) };
    if (derived.allAssigned && !derived.bothUsed) return { cls: 'warn', text: t('feedbackOneLane') };
    if (derived.allAssigned && !derived.balancedEnough) return { cls: 'warn', text: t('feedbackOver') };
    return { cls: '', text: t('feedbackStart') };
  }
  function renderAssignment() {
    var derived = HIKONE.derive(state.plan);
    var feedback = assignmentFeedback(derived);
    return '<div class="hk-assignment-summary"><div><p class="hk-kicker">' + t('assignKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('assignTitle') + '</h2><p>' + t('assignLead') + '</p></div><span class="hk-assigned-count"><strong>' + derived.assignedCount + '/6</strong> ' + t('assigned') + '</span></div>' +
      '<div class="hk-assignment-grid"><div class="hk-task-bank">' + HIKONE.CARDS.map(taskCard).join('') + '</div><div class="hk-member-lanes">' + memberLane('member-a', derived) + memberLane('member-b', derived) + '</div><div class="hk-plan-feedback ' + feedback.cls + '" role="status" aria-live="polite" aria-atomic="true">' + feedback.text + '</div></div>' +
      '<div class="hk-actions"><button class="hk-button compact" type="button" data-action="reset">' + t('reset') + '</button><button class="hk-button primary" type="button" data-action="rehearse"' + (derived.ready ? '' : ' disabled') + '>' + t('rehearse') + '</button></div>';
  }
  function workStream(id) {
    var derived = HIKONE.derive(state.plan);
    return '<section class="hk-work-stream"><header><b>' + memberName(id) + '</b><span>' + derived.loads[id] + ' / 7</span></header><div class="hk-work-items">' + cardsFor(id).map(function (card) { return '<span class="hk-work-item"><i aria-hidden="true">' + card.icon + '</i>' + escapeHtml(textOf(card.label)) + '</span>'; }).join('') + '</div></section>';
  }
  function renderPrep() {
    return '<p class="hk-kicker">' + t('prepKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('prepTitle') + '</h2><p class="hk-lead">' + t('prepLead') + '</p><div class="hk-parallel-stage">' + workStream('member-a') + workStream('member-b') + '</div><div class="hk-parallel-rule"><i></i>' + t('parallelRule') + '<i></i></div>' +
      '<div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('completePrep') + '</button></div>';
  }
  function renderTrunk() {
    return '<p class="hk-kicker">' + t('trunkKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('trunkTitle') + '</h2><p>' + t('trunkLead') + '</p><div class="hk-trunk-grid">' + HIKONE.CARDS.map(function (card) {
      var owner = state.plan.assignments[card.id];
      return '<div class="hk-trunk-slot"><span aria-hidden="true">' + card.icon + '</span><b>' + escapeHtml(textOf(card.label)) + '</b><small>' + format(t('loadedBy'), { member: memberName(owner) }) + '</small></div>';
    }).join('') + '</div><div class="hk-success-line">' + t('successLine') + '</div><div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('drive') + '</button></div>';
  }
  function renderRoute() {
    return '<p class="hk-kicker">' + t('routeKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('routeTitle') + '</h2><p class="hk-lead">' + t('routeLead') + '</p><div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('arriveLake') + '</button></div>';
  }
  function zone(group, title) {
    var cards = HIKONE.CARDS.filter(function (card) { return card.group === group; });
    return '<section class="hk-lake-zone"><h3><span aria-hidden="true">' + (group === 'tanago' ? '≈' : group === 'suppon' ? '⬡' : '⌇') + '</span>' + title + '</h3><div class="hk-zone-items">' + cards.map(function (card) { return '<span>' + card.icon + ' ' + escapeHtml(textOf(card.label)) + ' · ' + memberName(state.plan.assignments[card.id]) + '</span>'; }).join('') + '</div></section>';
  }
  function renderLake() {
    return '<p class="hk-kicker">' + t('lakeKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('lakeTitle') + '</h2><p class="hk-lead">' + t('lakeLead') + '</p><div class="hk-lake-zones">' + zone('tanago', t('tanagoZone')) + zone('suppon', t('supponZone')) + zone('shared', t('sharedZone')) + '</div><div class="hk-aquarium-note"><i aria-hidden="true">≈ ◌ · ⬡</i>' + t('aquariumReady') + '</div>' +
      '<div class="hk-actions"><button class="hk-button primary" type="button" data-action="next">' + t('reflect') + '</button></div>';
  }
  function renderDebrief() {
    var derived = HIKONE.derive(state.plan);
    var max = Math.max(derived.loads['member-a'], derived.loads['member-b']);
    return '<p class="hk-kicker">' + t('debriefKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('debriefTitle') + '</h2><p class="hk-lead">' + t('debriefLead') + '</p><div class="hk-compare"><div class="hk-compare-card"><strong>' + t('before') + '</strong><b>12 / 0</b></div><span class="hk-compare-arrow" aria-hidden="true">→</span><div class="hk-compare-card good"><strong>' + t('after') + '</strong><b>' + derived.loads['member-a'] + ' / ' + derived.loads['member-b'] + '</b><small>' + t('maxWord') + ' ' + max + '</small></div></div>' +
      '<label class="hk-transfer">' + t('transfer') + '<textarea maxlength="180" placeholder="' + t('transferPlaceholder') + '">' + escapeHtml(state.reflection) + '</textarea></label><div class="hk-actions"><button class="hk-button primary" type="button" data-action="finish">' + t('finish') + '</button></div>';
  }
  function renderComplete() {
    return '<div class="hk-complete"><div class="hk-stamp" aria-hidden="true">' + t('stamp').replace('\n', '<br>') + '</div><p class="hk-kicker">' + t('completeKicker') + '</p><h2 id="hk-phase-title" tabindex="-1">' + t('completeTitle') + '</h2><p class="hk-lead">' + t('completeLead') + '</p><div class="hk-actions" style="justify-content:center"><button class="hk-button" type="button" data-action="replay">' + t('replay') + '</button><a class="hk-button primary" href="index.html">' + t('back') + '</a></div></div>';
  }

  function focusSelector(selector) {
    window.setTimeout(function () {
      var target = panel.querySelector(selector) || document.querySelector(selector);
      if (target) {
        target.scrollIntoView({ block: 'nearest', inline: 'nearest' });
        target.focus({ preventScroll: true });
      }
    }, 0);
  }
  function render(focusTarget) {
    app.dataset.scene = state.phase;
    panel.className = 'hk-panel' + (state.phase === 'assign' ? ' is-assignment' : '') + (['brief', 'prep', 'trunk', 'lake'].indexOf(state.phase) >= 0 ? ' is-wide' : '');
    var renderers = { arrival: renderArrival, brief: renderBrief, baseline: renderBaseline, reveal: renderReveal, assign: renderAssignment, prep: renderPrep, trunk: renderTrunk, route: renderRoute, lake: renderLake, debrief: renderDebrief, complete: renderComplete };
    panel.innerHTML = renderers[state.phase]();
    renderHud();
    syncWorld();
    if (focusTarget === false) return;
    if (typeof focusTarget === 'string') focusSelector(focusTarget);
    else focusPhase();
  }

  function setPhase(phase) {
    state.phase = phase;
    state.selected = null;
    render();
    announce(format(t('statusPhase'), { phase: COPY[state.lang].progress[phase] }));
    playTone(phase === 'trunk' || phase === 'complete' ? 'success' : 'step');
  }
  function nextPhase() {
    var index = PHASES.indexOf(state.phase);
    if (index >= 0 && index < PHASES.length - 1) setPhase(PHASES[index + 1]);
  }
  function persistCompletion() {
    var envelope = { kind: 'hikone-tutorial', version: 1, completed: true, completedAt: new Date().toISOString() };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope)); } catch (error) { /* completion still works without storage */ }
  }

  panel.addEventListener('click', function (event) {
    var cardButton = event.target.closest('[data-card]');
    if (cardButton) {
      state.selected = cardButton.dataset.card;
      render('[data-lane="member-a"]');
      announce(format(t('selectedFor'), { task: textOf(HIKONE.CARDS.filter(function (card) { return card.id === state.selected; })[0].label) }));
      return;
    }
    var laneButton = event.target.closest('[data-lane]');
    if (laneButton) {
      if (!state.selected) { announce(t('selectCard')); return; }
      var card = HIKONE.CARDS.filter(function (item) { return item.id === state.selected; })[0];
      var assignedCardId = state.selected;
      state.plan = HIKONE.assign(state.plan, state.selected, laneButton.dataset.lane);
      var message = format(t('assignedTo'), { task: textOf(card.label), member: memberName(laneButton.dataset.lane) });
      state.selected = null;
      var feedbackAfterAssignment = assignmentFeedback(HIKONE.derive(state.plan)).text;
      render('[data-card="' + assignedCardId + '"]'); announce(message + ' ' + feedbackAfterAssignment); playTone('step');
      return;
    }
    var actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    var action = actionButton.dataset.action;
    if (action === 'next') nextPhase();
    if (action === 'reset') { state.plan = HIKONE.freshState(); state.selected = null; render('[data-card="rods"]'); announce(t('statusReset')); }
    if (action === 'rehearse') { if (HIKONE.derive(state.plan).ready) setPhase('prep'); }
    if (action === 'finish') { persistCompletion(); setPhase('complete'); announce(t('statusComplete')); }
    if (action === 'replay') { state.plan = HIKONE.freshState(); state.reflection = ''; setPhase('arrival'); }
  });
  panel.addEventListener('input', function (event) {
    if (event.target.matches('.hk-transfer textarea')) state.reflection = event.target.value;
  });
  langEn.addEventListener('click', function () { state.lang = 'en'; render(false); announce(COPY.en.progress[state.phase]); });
  langJa.addEventListener('click', function () { state.lang = 'ja'; render(false); announce(COPY.ja.progress[state.phase]); });
  soundButton.addEventListener('click', function () { state.sound = !state.sound; renderHud(); if (state.sound) playTone('success'); });
  reducedMotionQuery.addEventListener && reducedMotionQuery.addEventListener('change', function () { render(false); });

  render();
}
