(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HIKONE = api;
  if (typeof document !== 'undefined') boot(api);
})(typeof window !== 'undefined' ? window : this, function () {
  'use strict';

  var SCENES = ['arrival', 'packing', 'drive', 'lake', 'home'];
  SCENES.ARRIVAL = 'arrival'; SCENES.PACKING = 'packing'; SCENES.DRIVE = 'drive'; SCENES.LAKE = 'lake'; SCENES.HOME = 'home';
  Object.freeze(SCENES);
  var ACTORS = Object.freeze(['cap', 'towel']);
  var ITEMS = Object.freeze([
    Object.freeze({ id: 'rods', normal: true, minutes: 4 }),
    Object.freeze({ id: 'worms', normal: true, minutes: 3 }),
    Object.freeze({ id: 'chicken', normal: true, minutes: 3 }),
    Object.freeze({ id: 'tanago-box', normal: false, minutes: 4 }),
    Object.freeze({ id: 'suppon-tank', normal: false, minutes: 5 }),
    Object.freeze({ id: 'drinks', normal: true, minutes: 2 })
  ]);
  var ACTIONS = Object.freeze({
    START: 'START', ASSIGN_ITEM: 'ASSIGN_ITEM', COMPLETE_JOB: 'COMPLETE_JOB',
    MOVE_ITEM: 'MOVE_ITEM', FILL_COMPLETE: 'FILL_COMPLETE', COMPLETE_COOP: 'COMPLETE_COOP',
    DEPART: 'DEPART', DETOUR_COMPLETE: 'DETOUR_COMPLETE', ARRIVE_LAKE: 'ARRIVE_LAKE',
    BAIT_HOOK: 'BAIT_HOOK', CAST: 'CAST', REEL: 'REEL', MOVE_CATCH: 'MOVE_CATCH',
    GO_HOME: 'GO_HOME', PLACE_HOME: 'PLACE_HOME', SET_LANG: 'SET_LANG', RESTART: 'RESTART'
  });

  function itemDefinition(id) { return ITEMS.filter(function (item) { return item.id === id; })[0] || null; }
  function itemState(id) {
    return {
      id: id, location: id === 'drinks' ? 'vending' : 'yard', status: id === 'tanago-box' ? 'empty' : 'ready', owner: null,
      water: id === 'tanago-box' ? 'empty' : null, contains: null
    };
  }
  function freshState() {
    var items = {};
    ITEMS.forEach(function (item) { items[item.id] = itemState(item.id); });
    return {
      scene: SCENES.ARRIVAL, language: 'en', selected: null, clockMinutes: 285,
      assignments: { cap: [], towel: [] },
      actors: {
        cap: { status: 'idle', current: null, queue: [], workMinutes: 0 },
        towel: { status: 'idle', current: null, queue: [], workMinutes: 0 }
      },
      items: items,
      packing: { coopItem: null, stationMinutes: 0, coopMinutes: 0 },
      drive: { detour: false, detourComplete: false },
      lake: { hookBait: null, castZone: null, tanago: 'waiting', suppon: 'waiting' },
      home: { tanagoPlaced: false, supponPlaced: false },
      completed: false,
      lastEvent: { type: 'status', code: 'arrival' }
    };
  }
  function copy(state) { return JSON.parse(JSON.stringify(state)); }
  function withEvent(state, type, code, detail) {
    state.lastEvent = { type: type, code: code, detail: detail || null };
    return state;
  }
  function refusal(state, code, detail) { return withEvent(copy(state), 'refusal', code, detail); }
  function updatePackingClock(state) {
    state.clockMinutes = 285 + Math.max(state.actors.cap.workMinutes, state.actors.towel.workMinutes, state.packing.stationMinutes) + state.packing.coopMinutes;
  }
  function beginQueuedJob(state, actorId) {
    var actor = state.actors[actorId];
    if (!actor || actor.status !== 'idle' || !actor.queue.length) return;
    var itemId = actor.queue.shift();
    actor.status = 'working';
    actor.current = itemId;
    state.items[itemId].status = 'working';
    state.items[itemId].location = 'carried';
  }
  function startCooperativeCarry(state, itemId) {
    if (state.actors.cap.status !== 'idle' || state.actors.towel.status !== 'idle' || state.packing.coopItem) return false;
    state.packing.coopItem = itemId;
    state.actors.cap.status = state.actors.towel.status = 'working';
    state.actors.cap.current = state.actors.towel.current = 'coop:' + itemId;
    state.items[itemId].status = 'moving';
    state.items[itemId].location = 'carried';
    state.items[itemId].owner = 'both';
    return true;
  }
  function derive(state) {
    var loaded = ITEMS.filter(function (item) { return ['trunk', 'cabin'].indexOf(state.items[item.id].location) >= 0; }).map(function (item) { return item.id; });
    var essentials = ['rods', 'worms', 'chicken', 'tanago-box', 'suppon-tank'];
    var actorsIdle = ACTORS.every(function (id) { return state.actors[id].status === 'idle' && !state.actors[id].queue.length; });
    var essentialsLoaded = essentials.every(function (id) { return loaded.indexOf(id) >= 0; });
    return {
      loaded: loaded,
      missing: ITEMS.map(function (item) { return item.id; }).filter(function (id) { return loaded.indexOf(id) < 0; }),
      essentialsLoaded: essentialsLoaded,
      drinksLoaded: loaded.indexOf('drinks') >= 0,
      actorsIdle: actorsIdle,
      canDepart: state.scene === SCENES.PACKING && essentialsLoaded && actorsIdle && !state.packing.coopItem,
      canGoHome: state.scene === SCENES.LAKE && state.lake.tanago === 'boxed' && state.lake.suppon === 'tanked',
      hookReady: state.lake.hookBait !== null,
      homeComplete: state.home.tanagoPlaced && state.home.supponPlaced,
      completed: state.completed
    };
  }

  function reduce(state, action) {
    state = state || freshState();
    action = action || {};
    var next, actor, item, definition;

    if (action.type === ACTIONS.RESTART) {
      next = freshState(); next.language = state.language === 'ja' ? 'ja' : 'en';
      return withEvent(next, 'status', 'restart');
    }
    if (action.type === ACTIONS.SET_LANG) {
      if (action.language !== 'en' && action.language !== 'ja') return refusal(state, 'invalid-language');
      next = copy(state); next.language = action.language; return withEvent(next, 'status', 'language');
    }
    if (action.type === ACTIONS.START) {
      if (state.scene !== SCENES.ARRIVAL) return refusal(state, 'wrong-scene');
      next = copy(state); next.scene = SCENES.PACKING; return withEvent(next, 'status', 'packing-started');
    }
    if (action.type === ACTIONS.ASSIGN_ITEM) {
      definition = itemDefinition(action.item);
      if (state.scene !== SCENES.PACKING || ACTORS.indexOf(action.actor) < 0 || !definition) return refusal(state, 'invalid-assignment');
      item = state.items[action.item];
      if (!definition.normal) {
        if (action.item === 'tanago-box' && item.water !== 'full') return refusal(state, 'empty-box');
        if (item.status !== 'ready' || ['yard', 'tap'].indexOf(item.location) < 0) return refusal(state, 'item-unavailable');
        next = copy(state);
        if (!startCooperativeCarry(next, action.item)) return refusal(state, 'both-needed');
        return withEvent(next, 'success', 'cooperative-carry', { item: action.item, requestedBy: action.actor });
      }
      if (!item || ['yard', 'vending'].indexOf(item.location) < 0 || item.status !== 'ready') return refusal(state, 'item-unavailable');
      next = copy(state); actor = next.actors[action.actor]; item = next.items[action.item];
      item.owner = action.actor; item.status = 'queued'; item.location = 'assigned';
      actor.queue.push(action.item); next.assignments[action.actor].push(action.item); beginQueuedJob(next, action.actor);
      return withEvent(next, 'success', 'item-assigned', { actor: action.actor, item: action.item });
    }
    if (action.type === ACTIONS.COMPLETE_JOB) {
      if (state.scene !== SCENES.PACKING || ACTORS.indexOf(action.actor) < 0) return refusal(state, 'invalid-job');
      actor = state.actors[action.actor];
      if (!actor || actor.status !== 'working' || !actor.current || actor.current.indexOf('coop:') === 0) return refusal(state, 'invalid-job');
      next = copy(state); actor = next.actors[action.actor]; definition = itemDefinition(actor.current); item = next.items[actor.current];
      item.location = item.id === 'drinks' ? 'cabin' : 'trunk'; item.status = 'loaded'; actor.workMinutes += definition.minutes; actor.current = null; actor.status = 'idle';
      beginQueuedJob(next, action.actor); updatePackingClock(next);
      return withEvent(next, 'success', 'item-loaded', { actor: action.actor, item: item.id });
    }
    if (action.type === ACTIONS.MOVE_ITEM) {
      item = state.items[action.item];
      if (!item) return refusal(state, 'unknown-item');
      if (state.scene === SCENES.PACKING && action.item === 'tanago-box' && action.target === 'tap') {
        if (item.location !== 'yard' || item.water !== 'empty') return refusal(state, 'item-unavailable');
        next = copy(state); next.items['tanago-box'].location = 'tap'; next.items['tanago-box'].status = 'filling';
        return withEvent(next, 'success', 'box-filling');
      }
      if (state.scene === SCENES.PACKING && action.target === 'trunk') {
        if (action.item === 'tanago-box' && item.water !== 'full') return refusal(state, 'empty-box');
        if (action.item !== 'tanago-box' && action.item !== 'suppon-tank') return refusal(state, 'choose-person');
        if (item.status !== 'ready' || (item.location !== 'yard' && item.location !== 'tap')) return refusal(state, 'item-unavailable');
        next = copy(state);
        if (!startCooperativeCarry(next, action.item)) return refusal(state, 'both-needed');
        return withEvent(next, 'success', 'cooperative-carry', { item: action.item });
      }
      if (state.scene === SCENES.LAKE && action.item === 'rods' && action.target === 'jetty') {
        if (item.location !== 'trunk') return refusal(state, 'item-unavailable');
        next = copy(state); next.items.rods.location = 'jetty'; next.items.rods.status = 'ready';
        return withEvent(next, 'success', 'rods-at-jetty');
      }
      return refusal(state, 'invalid-move');
    }
    if (action.type === ACTIONS.FILL_COMPLETE) {
      item = state.items['tanago-box'];
      if (state.scene !== SCENES.PACKING || item.status !== 'filling' || item.location !== 'tap') return refusal(state, 'invalid-fill');
      next = copy(state); item = next.items['tanago-box']; item.water = 'full'; item.status = 'ready'; next.packing.stationMinutes = 3; updatePackingClock(next);
      return withEvent(next, 'success', 'box-filled');
    }
    if (action.type === ACTIONS.COMPLETE_COOP) {
      if (state.scene !== SCENES.PACKING || !state.packing.coopItem) return refusal(state, 'invalid-cooperative-job');
      next = copy(state); item = next.items[next.packing.coopItem]; definition = itemDefinition(item.id);
      item.location = 'trunk'; item.status = 'loaded'; next.packing.coopMinutes += definition.minutes; next.packing.coopItem = null;
      ACTORS.forEach(function (id) { next.actors[id].status = 'idle'; next.actors[id].current = null; beginQueuedJob(next, id); });
      updatePackingClock(next); return withEvent(next, 'success', 'cooperative-loaded', { item: item.id });
    }
    if (action.type === ACTIONS.DEPART) {
      if (!derive(state).canDepart) return refusal(state, 'not-ready');
      next = copy(state); next.scene = SCENES.DRIVE; next.drive.detour = !derive(state).drinksLoaded;
      return withEvent(next, next.drive.detour ? 'consequence' : 'success', next.drive.detour ? 'drinks-detour' : 'direct-drive');
    }
    if (action.type === ACTIONS.DETOUR_COMPLETE) {
      if (state.scene !== SCENES.DRIVE || !state.drive.detour || state.drive.detourComplete) return refusal(state, 'invalid-detour');
      next = copy(state); next.drive.detourComplete = true; next.items.drinks.location = 'cabin'; next.items.drinks.status = 'loaded'; next.items.drinks.owner = 'watanabe'; next.clockMinutes += 8;
      return withEvent(next, 'consequence', 'detour-complete');
    }
    if (action.type === ACTIONS.ARRIVE_LAKE) {
      if (state.scene !== SCENES.DRIVE || (state.drive.detour && !state.drive.detourComplete)) return refusal(state, 'drive-pending');
      next = copy(state); next.scene = SCENES.LAKE; next.clockMinutes += 46;
      return withEvent(next, 'success', 'lake-arrival');
    }
    if (action.type === ACTIONS.BAIT_HOOK) {
      if (state.scene !== SCENES.LAKE || ['worms', 'chicken'].indexOf(action.item) < 0) return refusal(state, 'invalid-bait');
      if (state.items.rods.location !== 'jetty') return refusal(state, 'rods-first');
      if (state.lake.hookBait) return refusal(state, 'hook-occupied');
      if (state.items[action.item].location !== 'trunk') return refusal(state, 'bait-unavailable');
      if (action.item === 'chicken' && state.lake.tanago !== 'boxed') return refusal(state, 'tanago-first');
      next = copy(state); next.lake.hookBait = action.item; next.items[action.item].location = 'hook'; next.items[action.item].status = 'baited';
      return withEvent(next, 'success', 'hook-baited', { item: action.item });
    }
    if (action.type === ACTIONS.CAST) {
      if (state.scene !== SCENES.LAKE || ['shallows', 'deep'].indexOf(action.zone) < 0) return refusal(state, 'invalid-cast');
      if (state.items.rods.location !== 'jetty') return refusal(state, 'rods-first');
      if (!state.lake.hookBait) return refusal(state, 'bare-hook');
      if ((state.lake.hookBait === 'worms' && action.zone !== 'shallows') || (state.lake.hookBait === 'chicken' && action.zone !== 'deep')) return refusal(state, 'wrong-water');
      next = copy(state); next.lake.castZone = action.zone;
      if (next.lake.hookBait === 'worms') next.lake.tanago = 'bite'; else next.lake.suppon = 'fighting';
      next.items[next.lake.hookBait].location = 'used'; next.items[next.lake.hookBait].status = 'used'; next.lake.hookBait = null;
      return withEvent(next, 'success', action.zone === 'shallows' ? 'tanago-bite' : 'suppon-fight');
    }
    if (action.type === ACTIONS.REEL) {
      if (state.scene !== SCENES.LAKE) return refusal(state, 'invalid-reel');
      next = copy(state);
      if (state.lake.tanago === 'bite') { next.lake.tanago = 'caught'; return withEvent(next, 'success', 'tanago-caught'); }
      if (state.lake.suppon === 'fighting') { next.lake.suppon = 'caught'; return withEvent(next, 'success', 'suppon-caught'); }
      return refusal(state, 'nothing-on-line');
    }
    if (action.type === ACTIONS.MOVE_CATCH) {
      if (state.scene !== SCENES.LAKE || ['tanago', 'suppon'].indexOf(action.catch) < 0) return refusal(state, 'invalid-catch');
      if (action.catch === 'suppon' && action.target === 'tanago-box') return refusal(state, 'wrong-container');
      if (action.catch === 'tanago' && action.target !== 'tanago-box') return refusal(state, 'wrong-container');
      if (action.catch === 'suppon' && action.target !== 'suppon-tank') return refusal(state, 'wrong-container');
      if (state.lake[action.catch] !== 'caught') return refusal(state, 'catch-unavailable');
      if (action.catch === 'tanago' && state.items['tanago-box'].water !== 'full') return refusal(state, 'empty-box');
      next = copy(state); next.lake[action.catch] = action.catch === 'tanago' ? 'boxed' : 'tanked';
      item = next.items[action.target]; item.contains = action.catch; item.status = 'occupied';
      return withEvent(next, 'success', action.catch === 'tanago' ? 'tanago-boxed' : 'suppon-tanked');
    }
    if (action.type === ACTIONS.GO_HOME) {
      if (!derive(state).canGoHome) return refusal(state, 'animals-not-secure');
      next = copy(state); next.scene = SCENES.HOME; next.clockMinutes += 46;
      return withEvent(next, 'success', 'home-arrival');
    }
    if (action.type === ACTIONS.PLACE_HOME) {
      if (state.scene !== SCENES.HOME) return refusal(state, 'wrong-scene');
      if (action.item === 'tanago-box' && action.target === 'home-tanago') {
        next = copy(state); next.items['tanago-box'].location = 'home-tanago'; next.home.tanagoPlaced = true;
      } else if (action.item === 'suppon-tank' && action.target === 'home-suppon') {
        next = copy(state); next.items['suppon-tank'].location = 'home-suppon'; next.home.supponPlaced = true;
      } else return refusal(state, 'wrong-home');
      if (next.home.tanagoPlaced && next.home.supponPlaced) next.completed = true;
      return withEvent(next, 'success', next.completed ? 'tutorial-complete' : 'home-placed', { item: action.item });
    }
    return refusal(state, 'invalid-action');
  }

  return { SCENES: SCENES, ACTORS: ACTORS, ITEMS: ITEMS, ACTIONS: ACTIONS, freshState: freshState, reduce: reduce, derive: derive };
});

function boot(HIKONE) {
  'use strict';
  var STORAGE_KEY = 'prs.hikone-tutorial.v1';
  var COPY = {
    en: {
      actors: { cap: 'Cap', towel: 'Towel', watanabe: 'Watanabe-san' },
      items: { rods: 'fishing rods', worms: 'worms', chicken: 'chicken bait', 'tanago-box': 'tanago water box', 'suppon-tank': 'suppon tank', drinks: 'drinks' },
      zones: { tap: 'water tap', trunk: 'open trunk', jetty: 'jetty', hook: 'hook', shallows: 'tanago shallows', deep: 'deep water', 'home-tanago': 'tanago aquarium', 'home-suppon': 'suppon aquarium' },
      location: { arrival: 'Ryokan Izumi · Yokkaichi', packing: 'Ryokan Izumi · Yokkaichi', drive: 'Yokkaichi → Hikone', lake: 'Lake Biwa · Hikone', home: 'Aquarium room' },
      arrivalSpeech: 'I’ll drive my car to Hikone. You two load the rods, worms, chicken bait, water box, suppon tank—and remember drinks. The tanago and suppon are for separate aquariums, never food.',
      arrivalObjective: 'Watanabe-san has arrived outside Ryokan Izumi.', arrivalHint: 'Take the car key to begin packing.', key: '🔑 Pack the car',
      packingObjective: 'Use Cap and Towel to prepare Watanabe-san’s car.', packingHint: 'Tap a person, then an item—or drag an item onto them. Either person will call the other for a heavy container.',
      depart: 'Close the hatch & go',
      driveDirect: 'Everything is aboard. Straight to Lake Biwa.', driveDetour: 'No drinks. We have to stop on the way.', detourDone: 'Drinks collected. The missed item cost us a detour.',
      lakeObjective: 'Use the equipment you packed.', lakeHint: 'Move rods to the jetty. Put bait on the hook, then choose the water.',
      reel: 'Reel!', goodPrep: 'Good prep. Drinks up—kanpai!', home: 'Drive home', homeObjective: 'Bring each animal to its own aquarium.', homeHint: 'Move the water box and tank to their matching aquariums.',
      replay: '↻ Replay', back: 'Journeys', complete: 'Both animals are safely in separate aquariums. Planning carried through to the end.',
      soundOff: 'Sound off', soundOn: 'Sound on', exit: 'Exit',
      event: {
        'packing-started': 'Choose Cap or Towel and give each person work.', 'item-assigned': 'Work assigned.', 'item-loaded': 'Loaded into the trunk.',
        'empty-box': 'The tanago box is empty. Fill it at the tap first.', 'box-filling': 'Water runs into the tanago box…', 'box-filled': 'The water box is full—and now too heavy for one person.',
        'both-needed': 'Both people must be free for that heavy container.', 'cooperative-carry': 'Cap and Towel lift together.', 'cooperative-loaded': 'Heavy container loaded together.',
        'not-ready': 'Fishing equipment is still missing.', 'drinks-detour': 'The car leaves—but nobody loaded the drinks.', 'direct-drive': 'No missing stop. Straight to Hikone.',
        'detour-complete': 'Drinks collected during the detour.', 'lake-arrival': 'Lake Biwa. Open the same trunk and use what you packed.',
        'rods-first': 'Take the rods to the jetty first.', 'rods-at-jetty': 'Rods ready at the jetty.', 'bare-hook': 'A bare hook will not attract anything.',
        'tanago-first': 'Catch and secure the tanago first.', 'hook-baited': 'Bait is on the hook.', 'wrong-water': 'That bait belongs in the other fishing spot.',
        'tanago-bite': 'The float dips in the shallows!', 'suppon-fight': 'Something heavy pulls from the deep—hold the line!',
        'tanago-caught': 'Tanago caught. Put it straight into the water box.', 'suppon-caught': 'Suppon brought to shore. Choose its container carefully.',
        'wrong-container': 'Not the fish box. The suppon needs its separate tank.', 'tanago-boxed': 'The tanago swims in the prepared water box.', 'suppon-tanked': 'The suppon is secured in its separate tank.',
        'animals-not-secure': 'Secure both animals before driving home.', 'home-arrival': 'Back home. Two animals, two separate aquariums.', 'wrong-home': 'That is the other animal’s aquarium.',
        'home-placed': 'One aquarium is ready.', 'tutorial-complete': 'Complete: both aquarium homes are ready.', 'choose-person': 'Choose Cap or Towel to carry that item.',
        'item-unavailable': 'That item is already being handled.', 'invalid-move': 'That does not belong there.', 'nothing-on-line': 'Nothing is pulling the line yet.'
      }
    },
    ja: {
      actors: { cap: 'キャップ', towel: 'タオル', watanabe: '渡辺さん' },
      items: { rods: '釣り竿', worms: 'ミミズ', chicken: '鶏肉のエサ', 'tanago-box': 'タナゴ用水箱', 'suppon-tank': 'スッポン用ケース', drinks: '飲み物' },
      zones: { tap: '水道', trunk: '開いたトランク', jetty: '桟橋', hook: '針', shallows: 'タナゴの浅瀬', deep: '深場', 'home-tanago': 'タナゴ水槽', 'home-suppon': 'スッポン水槽' },
      location: { arrival: '旅館いずみ・四日市', packing: '旅館いずみ・四日市', drive: '四日市 → 彦根', lake: '琵琶湖・彦根', home: '水槽の部屋' },
      arrivalSpeech: '私の車で彦根へ行きます。二人で竿、ミミズ、鶏肉のエサ、水箱、スッポン用ケースを積んで。飲み物も忘れずに。タナゴとスッポンは別々の水槽へ迎え、食用ではありません。',
      arrivalObjective: '渡辺さんが旅館いずみ前に到着しました。', arrivalHint: '車の鍵から準備を始めます。', key: '🔑 車に積む',
      packingObjective: 'キャップとタオルで渡辺さんの車を準備します。', packingHint: '人をタップしてから物をタップ。ドラッグでも操作できます。重いケースではもう一人を呼びます。',
      depart: 'ハッチを閉めて出発',
      driveDirect: '全部あります。琵琶湖へ直行します。', driveDetour: '飲み物がない。途中で寄り道です。', detourDone: '飲み物を購入。忘れ物で寄り道になりました。',
      lakeObjective: '積んだ道具を実際に使います。', lakeHint: '竿を桟橋へ。針にエサを付け、釣る場所を選びます。',
      reel: '引き上げる！', goodPrep: 'いい準備だ。飲み物で乾杯！', home: '家へ帰る', homeObjective: 'それぞれ別の水槽へ迎えます。', homeHint: '水箱とケースを正しい水槽へ。',
      replay: '↻ もう一度', back: '旅を選ぶ', complete: 'タナゴとスッポンを別々の水槽へ迎えました。計画が最後までつながりました。',
      soundOff: '音声オフ', soundOn: '音声オン', exit: '退出',
      event: {
        'packing-started': 'キャップかタオルを選び、準備を分担します。', 'item-assigned': '担当を決めました。', 'item-loaded': 'トランクへ積みました。',
        'empty-box': 'タナゴ用の箱が空です。先に水道で水を入れます。', 'box-filling': 'タナゴ用の箱に水を入れています…', 'box-filled': '水が入り、一人では重くなりました。',
        'both-needed': '重いケースには二人の手が必要です。', 'cooperative-carry': '二人で持ち上げます。', 'cooperative-loaded': '二人で重いケースを積みました。',
        'not-ready': 'まだ釣り道具が足りません。', 'drinks-detour': '出発しましたが、飲み物を積んでいません。', 'direct-drive': '忘れ物なし。彦根へ直行です。',
        'detour-complete': '寄り道で飲み物を用意しました。', 'lake-arrival': '琵琶湖です。同じトランクの道具を使います。',
        'rods-first': 'まず竿を桟橋へ。', 'rods-at-jetty': '竿を桟橋に用意しました。', 'bare-hook': 'エサのない針では釣れません。',
        'tanago-first': '先にタナゴを釣って水箱へ。', 'hook-baited': '針にエサを付けました。', 'wrong-water': 'そのエサはもう一方の釣り場で使います。',
        'tanago-bite': '浅瀬でウキが沈みました！', 'suppon-fight': '深場から強い引き。糸を保って！',
        'tanago-caught': 'タナゴを釣りました。水入りの箱へ。', 'suppon-caught': 'スッポンを岸へ。正しいケースを選びます。',
        'wrong-container': '魚の箱ではありません。スッポンは別のケースへ。', 'tanago-boxed': 'タナゴが水箱で泳いでいます。', 'suppon-tanked': 'スッポンを別のケースに確保しました。',
        'animals-not-secure': '両方を安全にケースへ入れてから帰ります。', 'home-arrival': '帰宅。二匹には別々の水槽があります。', 'wrong-home': 'それはもう一方の水槽です。',
        'home-placed': '一つの水槽へ迎えました。', 'tutorial-complete': '完了：両方の水槽へ迎えました。', 'choose-person': 'キャップかタオルを担当に選びます。',
        'item-unavailable': 'その物はすでに運んでいます。', 'invalid-move': 'そこには置けません。', 'nothing-on-line': 'まだ引きはありません。'
      }
    }
  };

  var app = document.getElementById('hk-app');
  var stage = document.getElementById('hk-stage');
  var scene = document.getElementById('hk-scene') || document.getElementById('hk-world');
  var objective = document.getElementById('hk-objective');
  var hint = document.getElementById('hk-hint');
  var speech = document.getElementById('hk-speech');
  var speaker = document.getElementById('hk-speaker');
  var toast = document.getElementById('hk-toast');
  var actions = document.getElementById('hk-actions');
  var clock = document.getElementById('hk-clock');
  var locationLabel = document.getElementById('hk-location');
  var live = document.getElementById('hk-live');
  var langEn = document.getElementById('hk-lang-en');
  var langJa = document.getElementById('hk-lang-ja');
  var soundButton = document.getElementById('hk-sound');
  var exit = document.querySelector('.hk-exit');
  var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  var state = HIKONE.freshState();
  var selected = null;
  var sound = false;
  var timers = {};
  var audioContext = null;
  var drag = null;
  var suppressClickUntil = 0;
  document.body.classList.remove('no-js');

  function c() { return COPY[state.language]; }
  function labelItem(id) { return c().items[id] || id; }
  function announce(message) { live.textContent = ''; window.setTimeout(function () { live.textContent = message; }, 10); }
  function tone(kind) {
    if (!sound) return;
    try {
      audioContext = audioContext || new (window.AudioContext || window.webkitAudioContext)();
      var oscillator = audioContext.createOscillator(); var gain = audioContext.createGain();
      oscillator.frequency.value = kind === 'refusal' ? 190 : kind === 'complete' ? 720 : 430;
      gain.gain.setValueAtTime(.0001, audioContext.currentTime); gain.gain.exponentialRampToValueAtTime(.05, audioContext.currentTime + .01); gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + .16);
      oscillator.connect(gain).connect(audioContext.destination); oscillator.start(); oscillator.stop(audioContext.currentTime + .18);
    } catch (error) { sound = false; }
  }
  function showEvent(event) {
    var text = c().event[event.code] || event.code.replace(/-/g, ' ');
    toast.textContent = text; toast.classList.add('is-visible'); announce(text);
    window.clearTimeout(timers.toast); timers.toast = window.setTimeout(function () { toast.textContent = ''; toast.classList.remove('is-visible'); }, reducedMotion.matches ? 1800 : 2400);
    tone(event.type === 'refusal' ? 'refusal' : event.code === 'tutorial-complete' ? 'complete' : 'success');
    if (event.type === 'refusal') {
      var reject = null, cue = null;
      if (event.code === 'empty-box') { reject = scene.querySelector('[data-object="tanago-box"]'); cue = scene.querySelector('[data-zone="tap"]'); }
      if (event.code === 'bare-hook') cue = scene.querySelector('[data-object="' + (state.lake.tanago === 'boxed' ? 'chicken' : 'worms') + '"]');
      if (event.code === 'wrong-container') { reject = scene.querySelector('[data-object="tanago-box"]'); cue = scene.querySelector('[data-object="suppon-tank"]'); }
      if (event.code === 'wrong-water') cue = scene.querySelector('[data-zone="' + (state.lake.hookBait === 'worms' ? 'shallows' : 'deep') + '"]');
      if (reject) { reject.classList.add('is-reject'); window.setTimeout(function () { reject.classList.remove('is-reject'); }, 700); }
      if (cue) { cue.classList.add('is-missing', 'is-target'); window.setTimeout(function () { cue.classList.remove('is-missing', 'is-target'); }, 1500); }
    }
  }
  function formatClock(total) { var hour = Math.floor(total / 60) % 24; var minute = total % 60; return (hour < 10 ? '0' : '') + hour + ':' + (minute < 10 ? '0' : '') + minute; }
  function button(markup) { var holder = document.createElement('div'); holder.innerHTML = markup.trim(); return holder.firstChild; }
  function buildWorld() {
    scene.innerHTML = '';
    ['cap', 'towel', 'watanabe'].forEach(function (id) {
      scene.appendChild(button('<button type="button" class="hk-person hk-actor" data-person="' + id + '" data-actor="' + id + '" data-name="' + c().actors[id] + '" aria-label="' + c().actors[id] + '"></button>'));
    });
    HIKONE.ITEMS.forEach(function (definition) {
      scene.appendChild(button('<button type="button" class="hk-prop hk-item" data-card="' + definition.id + '" data-object="' + definition.id + '" data-item="' + definition.id + '" aria-label="' + labelItem(definition.id) + '"><span class="hk-sr-label">' + labelItem(definition.id) + '</span></button>'));
    });
    ['tap', 'trunk', 'jetty', 'hook', 'shallows', 'deep', 'home-tanago', 'home-suppon'].forEach(function (id) {
      scene.appendChild(button('<button type="button" class="hk-zone" data-zone="' + id + '" aria-label="' + c().zones[id] + '">' + c().zones[id] + '</button>'));
    });
    scene.appendChild(button('<button type="button" class="hk-catch hk-catch-tanago" data-catch="tanago" aria-label="Tanago / タナゴ">🐟</button>'));
    scene.appendChild(button('<button type="button" class="hk-catch hk-catch-suppon" data-catch="suppon" aria-label="Suppon / スッポン">🐢</button>'));
  }
  function setVisible(element, visible) { element.hidden = !visible; element.setAttribute('aria-hidden', visible ? 'false' : 'true'); }
  function renderWorld() {
    app.dataset.scene = state.scene; stage.dataset.phase = state.scene;
    document.documentElement.lang = state.language; locationLabel.textContent = c().location[state.scene]; clock.textContent = formatClock(state.clockMinutes);
    scene.querySelectorAll('[data-person]').forEach(function (element) {
      var id = element.dataset.person; element.dataset.name = c().actors[id]; element.setAttribute('aria-label', c().actors[id]);
      var actorState = state.actors[id]; element.dataset.status = actorState ? actorState.status : 'waiting';
      element.classList.toggle('is-working', !!actorState && actorState.status === 'working'); element.classList.toggle('is-selected', !!selected && selected.kind === 'actor' && selected.id === id);
      element.classList.toggle('is-target', state.scene === 'packing' && id !== 'watanabe' && !!selected && selected.kind === 'item');
      setVisible(element, state.scene !== 'drive' && state.scene !== 'home'); element.disabled = id === 'watanabe' || state.scene !== 'packing';
    });
    scene.querySelectorAll('[data-object]').forEach(function (element) {
      var id = element.dataset.object; var item = state.items[id];
      element.setAttribute('aria-label', labelItem(id)); element.dataset.location = item.location; element.dataset.state = id === 'tanago-box' && item.water === 'full' ? 'filled' : item.status; element.dataset.filled = id === 'tanago-box' && item.water === 'full' ? 'true' : 'false'; element.dataset.owner = item.owner || '';
      element.classList.toggle('is-selected', !!selected && selected.kind === 'item' && selected.id === id);
      element.classList.toggle('is-target', state.scene === 'lake' && !!selected && selected.kind === 'catch' && ['tanago-box', 'suppon-tank'].indexOf(id) >= 0);
      element.classList.toggle('is-loaded', ['trunk', 'cabin'].indexOf(item.location) >= 0); element.classList.toggle('is-ready', item.status === 'ready' || item.status === 'occupied');
      element.classList.toggle('is-missing', state.scene === 'packing' && state.lastEvent.code === 'not-ready' && ['trunk', 'cabin'].indexOf(item.location) < 0);
      var visible = state.scene === 'packing' || (state.scene === 'lake' && item.location !== 'used') || (state.scene === 'home' && (id === 'tanago-box' || id === 'suppon-tank'));
      setVisible(element, visible); element.disabled = !visible || item.status === 'working' || item.status === 'moving' || item.status === 'filling';
    });
    scene.querySelectorAll('[data-zone]').forEach(function (element) {
      var zone = element.dataset.zone; var visible = state.scene === 'packing' ? (zone === 'tap' || zone === 'trunk') : state.scene === 'lake' ? ['jetty', 'hook', 'shallows', 'deep'].indexOf(zone) >= 0 : state.scene === 'home' ? zone.indexOf('home-') === 0 : false;
      var targetable = false;
      if (visible && selected && selected.kind === 'item') {
        if (state.scene === 'packing') targetable = (selected.id === 'tanago-box' && state.lastEvent.code === 'empty-box' && zone === 'tap') || (['tanago-box', 'suppon-tank'].indexOf(selected.id) >= 0 && zone === 'trunk');
        if (state.scene === 'lake') targetable = (selected.id === 'rods' && zone === 'jetty') || (['worms', 'chicken'].indexOf(selected.id) >= 0 && zone === 'hook');
        if (state.scene === 'home') targetable = (selected.id === 'tanago-box' && zone === 'home-tanago') || (selected.id === 'suppon-tank' && zone === 'home-suppon');
      }
      if (visible && !selected && state.scene === 'lake' && state.items.rods.location === 'jetty') {
        targetable = (state.lake.tanago === 'waiting' && zone === 'shallows') || (state.lake.tanago === 'boxed' && state.lake.suppon === 'waiting' && zone === 'deep');
      }
      setVisible(element, visible); element.classList.toggle('is-target', targetable); element.classList.toggle('is-active', (zone === 'hook' && !!state.lake.hookBait) || (zone === 'jetty' && state.items.rods.location === 'jetty'));
    });
    var tanagoCatch = scene.querySelector('[data-catch="tanago"]'); var supponCatch = scene.querySelector('[data-catch="suppon"]');
    setVisible(tanagoCatch, state.scene === 'lake' && state.lake.tanago === 'caught'); setVisible(supponCatch, state.scene === 'lake' && state.lake.suppon === 'caught');
    tanagoCatch.classList.toggle('is-selected', !!selected && selected.kind === 'catch' && selected.id === 'tanago'); supponCatch.classList.toggle('is-selected', !!selected && selected.kind === 'catch' && selected.id === 'suppon');
    var homeWorld = document.querySelector('.hk-home-aquariums');
    homeWorld.classList.toggle('has-tanago', state.home.tanagoPlaced); homeWorld.classList.toggle('has-suppon', state.home.supponPlaced);
  }
  function renderCopy() {
    langEn.setAttribute('aria-pressed', state.language === 'en' ? 'true' : 'false'); langJa.setAttribute('aria-pressed', state.language === 'ja' ? 'true' : 'false');
    soundButton.setAttribute('aria-pressed', sound ? 'true' : 'false'); soundButton.title = sound ? c().soundOn : c().soundOff; var soundText = soundButton.querySelector('b'); if (soundText) soundText.textContent = soundButton.title;
    var exitText = exit && exit.querySelector('b'); if (exitText) exitText.textContent = c().exit;
    actions.innerHTML = '';
    if (state.scene === 'arrival') { speaker.textContent = c().actors.watanabe; speech.textContent = c().arrivalSpeech; objective.textContent = c().arrivalObjective; hint.textContent = c().arrivalHint; actions.appendChild(button('<button type="button" id="hk-start" data-action="start">' + c().key + '</button>')); }
    if (state.scene === 'packing') {
      speaker.textContent = ''; speech.textContent = ''; objective.textContent = c().packingObjective; hint.textContent = c().packingHint;
      actions.appendChild(button('<button type="button" id="hk-depart" data-action="depart">' + c().depart + '</button>'));
    }
    if (state.scene === 'drive') { speaker.textContent = c().actors.watanabe; speech.textContent = state.drive.detour && !state.drive.detourComplete ? c().driveDetour : state.drive.detour ? c().detourDone : c().driveDirect; objective.textContent = c().location.drive; hint.textContent = ''; }
    if (state.scene === 'lake') {
      speaker.textContent = ''; speech.textContent = ''; objective.textContent = c().lakeObjective; hint.textContent = c().lakeHint;
      if (state.lake.tanago === 'bite' || state.lake.suppon === 'fighting') actions.appendChild(button('<button type="button" id="hk-reel" data-action="reel">🎣 ' + c().reel + '</button>'));
      if (HIKONE.derive(state).canGoHome) { speaker.textContent = c().actors.watanabe; speech.textContent = c().goodPrep; hint.textContent = ''; actions.appendChild(button('<button type="button" id="hk-home" data-action="home">' + c().home + '</button>')); }
    }
    if (state.scene === 'home') {
      speaker.textContent = state.completed ? c().actors.watanabe : ''; speech.textContent = state.completed ? c().complete : ''; objective.textContent = c().homeObjective; hint.textContent = state.completed ? '' : c().homeHint;
      if (state.completed) { actions.appendChild(button('<button type="button" id="hk-replay" data-action="replay">' + c().replay + '</button>')); actions.appendChild(button('<a id="hk-back" href="index.html">' + c().back + '</a>')); }
    }
  }
  function render() { renderWorld(); renderCopy(); syncTimers(); }
  function persist() { try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ kind: 'hikone-tutorial', version: 2, completed: true, completedAt: new Date().toISOString() })); } catch (error) { /* play remains complete */ } }
  function dispatch(action, quiet) {
    var previous = state; state = HIKONE.reduce(state, action); selected = null; render();
    if (!quiet && (state.lastEvent.code !== previous.lastEvent.code || state.lastEvent.type === 'refusal' || action.type)) showEvent(state.lastEvent);
    if (state.completed && !previous.completed) persist();
  }
  function duration(key, ms) {
    if (!reducedMotion.matches) return ms;
    if (key === 'detour' || key === 'arrive') return Math.min(1400, ms);
    return Math.min(420, ms);
  }
  function schedule(key, ms, action) { if (timers[key]) return; timers[key] = window.setTimeout(function () { timers[key] = null; dispatch(action); }, duration(key, ms)); }
  function syncTimers() {
    ['cap', 'towel'].forEach(function (id) {
      var actor = state.actors[id]; if (state.scene === 'packing' && actor.status === 'working' && actor.current && actor.current.indexOf('coop:') !== 0) schedule('actor-' + id, 1550, { type: 'COMPLETE_JOB', actor: id });
    });
    if (state.scene === 'packing' && state.items['tanago-box'].status === 'filling') schedule('fill', 1450, { type: 'FILL_COMPLETE' });
    if (state.scene === 'packing' && state.packing.coopItem) schedule('coop', 1900, { type: 'COMPLETE_COOP' });
    if (state.scene === 'drive') {
      if (state.drive.detour && !state.drive.detourComplete) schedule('detour', 4800, { type: 'DETOUR_COMPLETE' });
      else schedule('arrive', 2200, { type: 'ARRIVE_LAKE' });
    }
  }
  function assign(actorId, itemId) { dispatch({ type: 'ASSIGN_ITEM', actor: actorId, item: itemId }); }
  function useItemOnZone(itemId, zoneId) {
    if (state.scene === 'packing') dispatch({ type: 'MOVE_ITEM', item: itemId, target: zoneId });
    else if (state.scene === 'lake' && itemId === 'rods' && zoneId === 'jetty') dispatch({ type: 'MOVE_ITEM', item: itemId, target: zoneId });
    else if (state.scene === 'lake' && (itemId === 'worms' || itemId === 'chicken') && zoneId === 'hook') dispatch({ type: 'BAIT_HOOK', item: itemId });
    else if (state.scene === 'home') dispatch({ type: 'PLACE_HOME', item: itemId, target: zoneId });
    else dispatch({ type: 'MOVE_ITEM', item: itemId, target: zoneId });
  }
  function handleClick(target) {
    var action = target.closest('[data-action]');
    if (action) {
      if (action.dataset.action === 'start') dispatch({ type: 'START' });
      if (action.dataset.action === 'depart') dispatch({ type: 'DEPART' });
      if (action.dataset.action === 'reel') dispatch({ type: 'REEL' });
      if (action.dataset.action === 'home') dispatch({ type: 'GO_HOME' });
      if (action.dataset.action === 'replay') { Object.keys(timers).forEach(function (key) { window.clearTimeout(timers[key]); timers[key] = null; }); dispatch({ type: 'RESTART' }); }
      return;
    }
    var actor = target.closest('[data-actor]'); var item = target.closest('[data-object]'); var zone = target.closest('[data-zone]'); var caught = target.closest('[data-catch]');
    if (actor && actor.dataset.actor !== 'watanabe') {
      if (selected && selected.kind === 'item') assign(actor.dataset.actor, selected.id); else { selected = { kind: 'actor', id: actor.dataset.actor }; render(); }
      return;
    }
    if (item) {
      if (selected && selected.kind === 'actor') { assign(selected.id, item.dataset.object); return; }
      if (selected && selected.kind === 'catch') { dispatch({ type: 'MOVE_CATCH', catch: selected.id, target: item.dataset.object }); return; }
      selected = { kind: 'item', id: item.dataset.object }; render(); return;
    }
    if (caught) { selected = { kind: 'catch', id: caught.dataset.catch }; render(); return; }
    if (zone) {
      if (selected && selected.kind === 'item') useItemOnZone(selected.id, zone.dataset.zone);
      else if (selected && selected.kind === 'catch') dispatch({ type: 'MOVE_CATCH', catch: selected.id, target: zone.dataset.zone });
      else if (state.scene === 'lake' && (zone.dataset.zone === 'shallows' || zone.dataset.zone === 'deep')) dispatch({ type: 'CAST', zone: zone.dataset.zone });
    }
  }
  function drop(source, target) {
    if (!target) return;
    var actor = target.closest('[data-actor]'); var zone = target.closest('[data-zone]'); var item = target.closest('[data-object]');
    if (source.kind === 'item' && actor) assign(actor.dataset.actor, source.id);
    else if (source.kind === 'item' && zone) useItemOnZone(source.id, zone.dataset.zone);
    else if (source.kind === 'catch' && item) dispatch({ type: 'MOVE_CATCH', catch: source.id, target: item.dataset.object });
  }
  scene.addEventListener('pointerdown', function (event) {
    var source = event.target.closest('[data-object],[data-catch]'); if (!source || source.disabled) return;
    drag = { pointerId: event.pointerId, element: source, kind: source.dataset.object ? 'item' : 'catch', id: source.dataset.object || source.dataset.catch, x: event.clientX, y: event.clientY, moved: false };
    source.setPointerCapture && source.setPointerCapture(event.pointerId);
  });
  scene.addEventListener('pointermove', function (event) {
    if (!drag || drag.pointerId !== event.pointerId) return; var dx = event.clientX - drag.x; var dy = event.clientY - drag.y;
    if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
    if (drag.moved) { drag.element.classList.add('is-dragging'); drag.element.style.translate = dx + 'px ' + dy + 'px'; }
  });
  scene.addEventListener('pointerup', function (event) {
    if (!drag || drag.pointerId !== event.pointerId) return; var source = drag; drag = null;
    source.element.classList.remove('is-dragging'); source.element.style.translate = ''; source.element.style.pointerEvents = 'none'; var target = document.elementFromPoint(event.clientX, event.clientY); source.element.style.pointerEvents = '';
    if (source.moved) { event.preventDefault(); suppressClickUntil = Date.now() + 300; drop(source, target); }
  });
  scene.addEventListener('pointercancel', function () {
    if (!drag) return; drag.element.classList.remove('is-dragging'); drag.element.style.translate = ''; drag = null;
  });
  scene.addEventListener('click', function (event) { if (Date.now() < suppressClickUntil) { event.preventDefault(); return; } handleClick(event.target); });
  actions.addEventListener('click', function (event) { handleClick(event.target); });
  langEn.addEventListener('click', function () { dispatch({ type: 'SET_LANG', language: 'en' }, true); buildWorld(); render(); });
  langJa.addEventListener('click', function () { dispatch({ type: 'SET_LANG', language: 'ja' }, true); buildWorld(); render(); });
  soundButton.addEventListener('click', function () { sound = !sound; renderCopy(); announce(sound ? c().soundOn : c().soundOff); if (sound) tone('success'); });
  reducedMotion.addEventListener && reducedMotion.addEventListener('change', render);

  buildWorld(); render();
}
