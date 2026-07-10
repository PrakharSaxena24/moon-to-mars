# CLAUDE.md — Ogasawara Rehearsal / 実行前シミュレーター（小笠原釣行編）

> **Working title:** Ogasawara Rehearsal · 実行前シミュレーター
> **Product line:** Project Rehearsal Simulator (spec `シミュレーション型プロジェクト管理ゲーム_アプリ概要書_v1.0`)
> **Codename (retired):** moon_to_mars
> **This file is the complete concept + build plan.** It is authoritative; when code and this doc
> disagree during implementation, reconcile toward this doc or update it deliberately.

## User
- **Prakhar Saxena** (`prakhar.saxena@aibos.co.jp`) — primary user / product owner.

---

## 0. One paragraph
An **offline, bilingual (EN/JP), no-build browser game** that **rehearses a project before you run it**.
The player pre-plans a real **小笠原 (Ogasawara) 10-day / 24-person company fishing trip**, presses **Run**,
and watches simple 2D characters walk a site map and execute the plan. A **known perfect plan scores 100**:
if every duty is assigned, every task timed, and — the heart of the game — **every piece of information is
handed to the right person at the right moment**, nobody wastes a minute. Where the plan has a gap, characters
**idle, hesitate, or huddle**, and *the place they stall is the place to fix the plan.* Fix the gaps, re-run
toward 100.

> 止まったキャラクターは、失敗した社員ではない。止まった場所こそが、計画を直すべき場所である。
> The stalled character isn't a failed employee — the place they stalled is the place to fix the plan.

---

## 1. Core thesis (never dilute)
**Responsibility ≠ authority ≠ information — and information has a _clock_.** A fully capable person still
**stalls** the moment a task needs a fact they do not yet hold. The new, load-bearing idea this project adds
to the existing engine is the **temporal information axis**:

- **迷い (confused ❓)** = the plan **never specified** the info (a *structural* gap — no arrow drawn).
- **手待ち (waiting ⏳)** = the plan specified it but **timed it wrong** (a *temporal* gap — arrow arrives late).
- **手戻り (rework 🔁)** = a character **acted on a wrong/late assumption** (e.g. wrong fish) and must redo it.

Every stall is **computed from plan data, never random** (an explainable rule engine, spec §12/§20).

---

## 2. Locked design decisions (2026-07-02 interview)
| # | Decision | Value |
|---|---|---|
| D1 | **Setting** | Ogasawara 10-day fishing trip (keep; drop the "moon→mars" space theme). |
| D2 | **Roster** | 24 = **8 organizers (運営) + 13 guests (ゲスト) + 3 chefs (料理長)**. Chefs cook for the 13 guests; the 8 organizers self-cater but sometimes receive food from chefs. Guests are hosted — they fish for enjoyment, own no duties. |
| D3 | **MVP depth** | Model **one representative fishing-day loop in full, minute-level detail** (cook→angler→boat→cook), inside the 10-day frame. |
| D4 | **Authoring** | **Hybrid timeline + info-arrows**, author-heavy **from a skeleton**: trip facts given; player assigns duties, times task blocks, and **draws every information handoff**. |
| D5 | **Run model** | Mostly **hands-off** (press Run, watch) **+ checkpoints** (pause → inspect each member → optionally intervene → resume). |
| D6 | **Scoring** | Perfect = 100; explainable deductions for wasted time / late-or-missing info / wrong-fish rework / safety. A headline **Efficiency %** sits beside the grade. |
| D7 | **Foundation** | **Extend** the existing verified engine (`window.PRS`) — do **not** rebuild. Add a temporal layer behind a new `fishday` rehearsal target; the 10-day frame is byte-for-byte unchanged. |
| D8 | **Rename/move** | Project folder → **`OgasawaraSim`** at `/Users/tanakai/aibos/OgasawaraSim` (**DONE 2026-07-02**; user renamed the target from the originally planned `ogasawara-rehearsal`). Product/display name stays **Ogasawara Rehearsal · 実行前シミュレーター**. |

---

## 3. The game loop
1. **Read the skeleton** — the Ogasawara trip is pre-built: 24 people, 7 stations, 10-day frame, a **Duty Deck**, a resource list, and an **Info Catalog** (the message types an arrow can carry).
2. **Author the plan** (setup) — assign each duty to a person; drop **task blocks** on per-character timeline lanes (start + duration); **draw an arrow** for every information handoff (choose message, sender, receiver, send-time/trigger, channel). Live readiness hints predict the score before Run.
3. **Run** — press Run and watch. Characters walk the site map and execute. Idle minutes & stalls are **computed from the plan**. It pauses at **checkpoints** for inspect/intervene.
4. **Score** — grade (D→A) + **Efficiency %** + the per-category breakdown + the fix-pack, every deduction named.
5. **Fix & re-run** — apply a fix (draw a missing arrow, re-time a late one, assign a duty) and re-run; the score climbs toward **100 / A / 100% efficiency**.

---

## 4. Setting & roster — the 24 (ロスター)
> **Names/story moved to `WORLD.md` (2026-07-07).** The 11 named people were renamed to the real AEGIS/AIBOS
> roster — see **WORLD.md §7** for the live names (Matsumoto/Inaba/…/Prakhar for the 8 seats; Akiyama/Nao/Kaito
> chefs) and WORLD.md §1–§6 for the world (AEGIS sponsor, external guests Nagatani+Kadou, two ships, Hinata).
> The person names in the table below are the **original template** — role *structure* is what matters here.

**8 organizer seats** map onto the existing role types; **`teamLead` 🚩 is retired from this template** (its
guest-catering work moves to the 3 chefs; its lodging work folds into `logi` 📦). This frees a seat for the
**angler = `specialist` 🎣**, and adds one **new role type `chef` 🍳**.

| # | Person (EN / JP) | Role · icon | Fishing-loop duty | Duty-holder? |
|---|---|---|---|:--:|
| p01 | Tanaka Kenji / 田中 健司 | `owner` 👑 | Final authority, abort call, budget root | Yes |
| p02 | Sato Aoi / 佐藤 葵 | `pm` 📋 | Coordination hub; ferry/schedule owner | Yes |
| p03 | Suzuki Riku / 鈴木 陸 | `siteLead` 🧭 | **Boat operator (船担当)** — positions boat to the target | Yes |
| p04 | Ito Mei / 伊藤 芽衣 | `budgetLead` 🧮 | Meals/boat budget, receipts, reserve, daily reconcile | Yes |
| p05 | Yamamoto Go / 山本 剛 | `safetyLead` ⛑️ | **Safety + medic** — weather/abort authority; angler's deputy | Yes |
| p06 | Nakamura Yui / 中村 結衣 | `logi` 📦 | **Catch & ice (漁獲処理)** — tackle intake, handling, lodging | Yes |
| p07 | Kobayashi Jun / 小林 純 | `comms` 🎧 | Records, daily report, headcount / 点呼 | Yes |
| p08 | Kato Hana / 加藤 花 | `specialist` 🎣 | **Angler / fishing-lead (釣り担当)** — gear pre-check, sets target; shellfish allergy | Yes |
| p09 | Mori Taku / 森 拓 | `chef` 🍳 | **Head cook (料理長)** — owns the menu; consulted on species/qty/cook-time | Yes |
| p10 | Hayashi Ken / 林 健 | `chef` 🍳 | Sous chef — prep + service; chef deputy | Yes |
| p11 | Ono Rin / 小野 凛 | `chef` 🍳 | Chef — prep, sourcing support | Yes |
| pg_guests ×13 | Guests (hosted) / ゲスト | `crew` 🧑 | **Join the fishing for enjoyment; eat chef meals; own no tasks** | **No** |

The **fishing-day duty triangle** the user described maps to: 🎣 Angler (pre-checks & carries gear, sets target)
↔ 🧭 Boat (confirms the target, then sets heading) ↔ 🍳 Chef (says *what* to cook and *how long*, then cooks),
guarded by ⛑️ Safety (go/no-go) and supplied by 📦 Logi (tackle + ice) and 🎧 Comms (headcount + requests).

---

## 5. THE CANONICAL REFERENCE PLAN — one perfect fishing day (Day 3) · scores 100
This is the **single source of truth** the whole game is scored against (満点 = 100). It is
**consistency-verified**: every task's needed info is delivered by a *finished* producer at `atTime ≤ start`,
every dependency finishes before its dependent starts, and no solo duty-holder is double-booked (the 3 chefs
correctly parallelize). Remove any one arrow and the consuming task idles (手待ち) or acts on a wrong assumption
(手戻り) — that is exactly what the gappy template teaches.

### 5.1 Cook-time math — the number the whole day bends around
```
portions P = 13 guests + 5 organizer add-ons = 18   (the other 3 organizers self-cater)
cook rate c = 5 min / portion
COOK BLOCK = c × P = 90 min
dinner service (夕食) 18:00  → cook 16:00–17:30 → fillet done 16:00 → fish at galley 14:45
  → dockside (帰港) by 14:00  ← this becomes the boat's HARD RETURN TIME
```
Every upstream time (return → transit → lines-up → departure → rig → menu) is **scheduled backward from the
stove**. That is why "consult the cook about how much time to cook" is the load-bearing handoff.

### 5.2 The 9 information cards that flow (fishing-day loop)
| id | Card (EN / JP) | Owner → needs it | Why it gates a task |
|---|---|---|---|
| `ic_food` | Supply source + allergy list / 食材・アレルギー | 🧮 → 🍳 | Menu must respect the 1 shellfish allergy before portions are set |
| `ic_weather` | Sea state + GO/NO-GO + **abort criterion** / 海況・中止基準 | ⛑️ → 🍳, 🧭 | Menu commits to caught fish only if the trip is a GO to a reachable ground |
| `ic_orgfood` | Organizer dinner add-on count / 運営夕食希望 | 🎧 → 🍳 | Total portions = 13 guests **+ organizer requests** |
| `ic_menu` | Target species + portions + **per-portion cook min** + service time / 献立 | 🍳 → 🎣, 🧭 | Angler rigs to the species; boat folds the return deadline into the route |
| `ic_tackle` | Tackle/bait inventory + ice staged / 釣具・氷 | 📦 → 🎣 | Angler pre-checks against what actually exists |
| `ic_target` | Operational catch goal: species + qty + size / 狙う魚種 | 🎣 → 🧭 | Boat sets heading to the ground that matches the rig |
| `ic_ground` | Fishing ground + heading + ETA + **hard return time** / 漁場・進路 | 🧭 → 🎣, 🍳 | Angler paces the catch; chef locks cook-start around landing |
| `ic_headcount` | Departure/return 点呼 manifest | 🎧 → 🧭 | Boat may not depart until the manifest is confirmed |
| `ic_catch` | Catch tally: species + count + weight / 漁獲集計 | 🎣 → 🍳, 📦, 🎧 | Chef preps the *right number of portions* before the fish even lands |

### 5.3 ASCII timeline — 04:15 → 20:00  (▸ produces a card · ►► hands a card across)
```
──── PHASE 0 · Pre-dawn intelligence (04:15–05:30) ─────────────────────────────
04:15 │ 🧮 Confirm supply + allergy list ............ finance   ▸ ic_food
04:30 │ ⛑️ Dawn weather/sea-state, set abort ........ clinic    ▸ ic_weather
04:30 │ 🎧 Collect organizer dinner requests ........ command   ▸ ic_orgfood
04:45 │   ►► ic_food    🧮→🍳  "1 shellfish allergy · カツオ landing confirmed"
04:45 │   ►► ic_orgfood 🎧→🍳  "5 organizer portions tonight (3 self-cater)"
05:00 │   ►► ic_weather ⛑️→🍳,🧭  "GO · wind 6 m/s · abort >2 m or >12 m/s"
05:00 │ 🍳 Menu & portions 献立・食数 ............... mess      ▸ ic_menu
05:00 │ 📦 Morning tackle & ice prep ................ port      ▸ ic_tackle

──── PHASE 1 · Rig to the menu, set the heading (05:30–07:00) ──────────────────
05:30 │   ►► ic_menu   🍳→🎣  "カツオ ×18 · 5 min/portion · dinner 18:00"
05:30 │   ►► ic_menu   🍳→🧭  "hard return: dockside 14:00 (90-min cook)"
05:30 │   ►► ic_tackle 📦→🎣  "6 rigs · jigs 60–100 g · bait · 2 coolers + 40 kg ice"
05:30 │ 🎣 Pre-check & LOAD gear to boat 積込 ....... port      ▸ ic_target
06:15 │   ►► ic_target 🎣→🧭  "カツオ schooling · need 18+ keepers 1.5–2 kg"
06:15 │ 🧭 Route & heading planning ................ vessel     ▸ ic_ground
06:45 │   ►► ic_ground 🧭→🎣  "07:00 出港→東島南, lines 08:00–12:30, dock 14:00"
06:45 │   ►► ic_ground 🧭→🍳  "confirmed dockside 14:00 · tally radioed ~12:45"
06:45 │ 🎧 Departure headcount 点呼 ................ port        ▸ ic_headcount

──── PHASE 2 · Depart & fish (07:00–12:45) ─────────────────────────────────────
07:00 │   ►► ic_headcount 🎧→🧭  "3 aboard, lifejackets on; ashore accounted"
07:00 │ 🧭 Depart & transit · 🎣 rig en route · ⛑️ sea-watch (abort auth) · 🎧 trip log
08:00 │ 🧭 Hold station · 🎣 FISHING / catch 釣り ................ vessel  ⟳ to 12:30
11:00 │ 🍳 Guest lunch service ................................... mess
12:30 │ 🎣 Catch tally & radio relay ............................. vessel  ▸ ic_catch

──── PHASE 3 · Relay → return → cook backward from 18:00 (12:45–18:45) ─────────
12:45 │   ►► ic_catch 🎣→🍳  "20 カツオ ~1.6 kg (target +2) → confirm 18 portions"
12:45 │   ►► ic_catch 🎣→📦  "20 fish ~32 kg inbound → stage extra ice + table"
12:45 │   ►► ic_catch 🎣→🎧  "catch logged · ETA dockside 14:00, on schedule"
12:45 │ 🧭 Return transit 帰港 · 🎣 stow gear en route
13:00 │ 🍳 Side prep & LOCK final food count .................... mess   (ic_ground+ic_catch)
14:00 │ 🎣 Land & deliver catch · 🎧 return 点呼 · 🧭 dock & secure · ⛑️ health check
14:20 │ 📦 Catch handling, icing → galley 搬入 .................. mess   (ic_catch)
14:45 │ 🍳 Fillet & portion the catch 捌き ...................... mess   (ic_catch)
16:00 │ 🍳 ▓▓ COOK dinner main — 90 min = 5 × 18 ▓▓ ............. mess
17:30 │ 🍳 Plate 盛付  → 18:00 DINNER SERVICE (13 guests + 5 organizer)  mess

──── PHASE 4 · Close the books (19:00–20:00) ───────────────────────────────────
19:00 │ 🎧 Daily report & catch log · 🧮 Daily accounting & receipts
```

### 5.4 Why it scores 100 (zero-idle proof)
- **Schedule (15):** every `consumesInfo` is satisfied by a handoff at `atTime ≤ start`, produced by an already-finished task → no character ever holds `waiting`/`confused`. Verified across all **30 tasks / 14 handoffs** (implementation count; the plan's "~35" estimate resolved to 30 real tasks — `node verify.js` asserts the zero-idle / 100 / A anchor).
- **Info・報連相 (15):** all 9 cards reach their consumers before use; the two shore↔sea relays (`ic_ground`, `ic_catch`) close the loop both ways.
- **Safety (10):** ⛑️ owns `ic_weather` with an explicit **abort criterion** (>2 m / >12 m/s) and holds abort authority aboard for the whole 07:00–14:00 window.
- **Wrong-fish rework = 0:** the species decision (`ic_menu`) precedes rigging, heading, and portioning, so the catch matches the menu and the 90-min cook finishes at 17:30 for an on-time 18:00 dinner.

---

## 6. The information model — "the arrows" (the heart)
Today an `infoCard` is `{id, name, ownerRoleId, recipientRoleIds[], shareTiming(text), secrecy, impactIfUnshared}`
and the lone `info` detector only asks a **binary** question ("is the role a recipient?"); `shareTiming` is
decorative text the sim never reads. The new layer **keeps every existing field** and adds
**machine-checkable, timed deliveries** — the arrows the player draws. One card can fan out into several arrows,
each aimed at one *consuming task* whose scheduled start is the deadline.

### 6.1 Canonical handoff schema (one object per drawn arrow)
```js
handoff = {
  id, cardId,                         // which message, e.g. 'ic_target' (狙う魚種)
  fromRoleId, fromTaskId,             // producer (source of truth) → output port ○
  toRoleId,   toTaskId,               // consumer whose neededInfo this feeds → input socket ●
  trigger: { type:'atMinute'|'onTaskDone'|'beforeTaskStart', value?, taskId?, leadMin? },
  channel: 'faceToFace'|'radio'|'phone'|'chat'|'board',   // sets transmission latency
  ifLate:  'idle' | 'assume',         // late → wait (idle minutes), or proceed on a (wrong) default
  reworkKind: null|'wrongFish'|'portionMismatch'|'spoilage',
  content: { en, jp },                // the human message text
  arrivalMin                          // runtime = resolve(trigger) + latency(channel)
}
```
**Trigger resolution (pure):** `atMinute → value` · `onTaskDone → producer.startMin + producer.durMin` ·
`beforeTaskStart → consumer.startMin − (leadMin||0)`.

**Channel latency (canonical, minutes):** `対面 faceToFace 0 · 無線 radio 1 · 電話 phone 2 · チャット chat 10 · 掲示板 board 30`.
A correct fact on too slow a channel for a tight deadline is *itself* a late arrow — this is where 報連相
channel choice earns or loses points.

### 6.2 The checker (runs once per consuming task, at its scheduled start)
```
needBy = task.startMin
for each info in task.neededInfo:
  arrival = min over its handoffs of ( resolve(trigger) + latency(channel) )   // owner holds own cards from DAY_START
  if no arrow drawn:            if safety → hardStall(❓)         // structural gap (迷い)
                               elif ifLate=='assume' → applyRework(reworkKind)  // wrong assumption (手戻り)
                               else → idle += cap                // waits (手待ち)
  elif arrival <= needBy:       ok, 0 cost
  elif ifLate=='idle':          idle += (arrival - needBy)       // late → 手待ち minutes
  else /* 'assume' */:          applyRework(reworkKind)          // late but must act → 手戻り
```
`applyRework`: `wrongFish` → catch species ≠ menu, galley must switch dishes (+cook-time, quality−, safety gate
if it hits an allergen); `portionMismatch` → served ≠ required; `spoilage` → usable yield ×0.6. **The current
binary detector is just the "arrow not drawn" case;** the new value is the third state — *drawn but late* — which
produces measured idle minutes or a wrong assumption.

### 6.3 The two convergences
- **Convergence 1 — everything lands before the boat leaves** (`ic_food, ic_weather, ic_orgfood → ic_menu → ic_tackle, ic_target → ic_ground → ic_headcount`). The dawn bite window is short; any late arrow here idles someone at the 港 — **except** `ic_target`/`ic_ground` are `ifLate:'assume'` (the boat leaves and guesses → wrong-fish).
- **Convergence 2 — the catch count reaches the galley before the chefs can size/time the meal** (`ic_catch (+ic_ground) → side-prep, fillet, cook`). `ic_catch` late → 3 chefs idle at the 食堂 (idle-min × 3); missing → wrong portion count.

---

## 7. Authoring UX — hybrid timeline + info-arrows (作成画面)
One screen, three moves. The player is handed the **skeleton** (read-only trip facts) and authors a **runnable
plan** on top.

**Given (read-only):** the 24 people (only the **11 duty-holders** get lanes; the 13 guests are auto-placed);
the 7 stations; the 10-day frame focused on the **代表釣行日**; the **Duty Deck** (draggable role chips); the
**Resource list** (`boat, tackle, ice, food, cash, medkit, keys, storage, shipping`); the **Info Catalog**.

**Built — three moves:**
- **A · Assign each duty** — drag a duty chip onto a person → writes `overrides.staffing` + role `holder`/`deputyId`. A duty left in the Deck stays red; the sim will 合議 (huddle) at that station.
- **B · Place task blocks** — each duty-holder has a horizontal **lane**; drag a task onto it to make a `{start, dur}` block, snapped to a 5/15/30-min grid. Right-edge handle resizes. Faint ties show `deps`; a block that starts before its prerequisite finishes flags red.
- **C · Draw a handoff arrow** — each task shows an **output port** ○ and, per `neededInfo`, an **input socket** ● (hollow if unfed). Drag ○→● to create an arrow; a panel sets message / sender / receiver / trigger / channel and shows **arrival = sendTime + latency vs. consumer start** (✓ / ⚑ late).

### 7.1 ASCII mockup
```
┌─ SETUP · 代表釣行日 Representative Fishing Day ───────────────── ⚑ Ready-check: 2 ─┐
│ PEOPLE 人材     │  TIME →  05:00   05:30   06:00   06:30   07:00 ······· 14:00   17:00 │
│ 🎣 Kato         │        ○ output port   ● input socket                               │
│ 🧭 Suzuki       │ 📦 Nakamura │[Tackle prep]○·····(前夜)              [Catch+Ice]      │
│ 🍳 Chef 1·2·3   │            │      ①↓ ic_tackle 05:30 ✓                              │
│ 📦 Nakamura     │ 🎣 Kato    │●[Gear✓]○→[Load]○   [========= Fish =========]          │
│ DUTY DECK 役割   │            │  ②↓ ic_target 06:15 ✓ →                                │
│ [🎣][🧭][🍳]     │ 🧭 Suzuki  │        ●[Route]○  [======= Operate ========]           │
│ [⛑️][📦][🎧]     │            │            ③↓ ic_menu 05:30 ✓                          │
│ [🧮][📋][👑]     │ 🍳 Chef 1  │     ●[Cook prep]              [== Cook 16:00–17:30 ==]  │
│ RESOURCES 資源   │ ARROWS 情報の受け渡し (drag ○→● to add)                              │
│ boat tackle ice │ ① 釣具リスト  📦→🎣 05:30 board ✓   ② 狙う魚 🎣→🧭 06:15 radio ✓      │
│ food cash medkit│ ③ 献立      🍳→🎣,🧭 05:30 board ✓   ⑨ 漁獲    🎣→🍳 12:45 radio ✓    │
│ [ Save ][ Load ]│                                                                       │
├─────────────────┴──────────────────────────────────────────────────────────────────┤
│ READINESS  ⚑ 2  • ⑨ if on 'board' at sea → NEVER delivered (use radio)                │
│                 • 🧭 Boat lane load 3, no deputy      [ Run ▶ 代表釣行日 · projected 100 ] │
└──────────────────────────────────────────────────────────────────────────────────────┘
```

### 7.2 Live readiness hints (`readiness(plan)` — pure, recomputed on every edit)
`DUTY_UNASSIGNED` · `TASK_UNSTAFFED` · `MISSING_ARROW` (hollow socket) · `ARROW_LATE` (+N min chip) ·
`WRONG_FISH_RISK` · `DEP_BROKEN` · `OVERLOAD` · `RESOURCE_GAP`. The bottom bar shows the count and gates the
Run label: `⚑ 3 gaps — projected ~72` → flips to `✓ Ready — projected 100` only when every socket is fed on time.
This is the **pre-Run mirror of the post-Run score** — draw an arrow, watch a red socket turn green, projection rises.

**Data the editor emits:** the existing `overrides.{staffing,roles,info}` **+** `overrides.timing[taskId]` (`startMin`/`durMin`)
**+** `overrides.handoffs[id]` (the arrows). No server, no DB, no build — optional `localStorage` autosave + download/load `plan.json`.

---

## 8. Run model & checkpoints (実行)
Press **Run** and step back; nothing is random. Extends the existing `createSim()`/`tick()` (which advances tasks
by day-window + `deps` and pulls stalled characters to a gap station) — it does **not** replace it.

- **Two clocks.** The 10-day frame keeps `DT = 0.25 day`. The representative day runs a **fine minute clock** (`MIN_DT = 5`, window **04:00→20:00** — widened from the draft's 05:00 so the §5.3 pre-dawn tasks at 04:15 fit) only when `segment === 'fishday'`. Fixed `MIN_DT` ⇒ deterministic.
- **Idle minutes (手待ち) — the core cost.** Per fine tick, a duty-holder whose due task can't start (dep not done, or needed info not arrived) accrues `idleMin += MIN_DT`, tagged with the exact missing `infoId`/`depId`, and is drawn **waiting at that task's station** (visible pile-up). Clears the instant the info arrives — the map shows waiting *resolve in real time* as upstream catches up.
- **Wrong-fish rework (手戻り).** A per-task knob `onMissingInfo: 'wait' | 'assume'`. `'assume'` tasks (a boat at sea *must* head somewhere) proceed on a **defined wrong default** → reproducible rework; when the correcting info lands, spent progress is discarded and `reworkMin` accrues, poisoning downstream consumers (the cascade).
- **Stall-reason → character-state map** (reuse existing states; **add two**):

| Cause | State (id / 表示) |
|---|---|
| Info designed but not yet arrived / arrived late | **`waitInfo` / 手待ち ⏳** (NEW) |
| Acted on a wrong/stale target, now redoing | **`rework` / 手戻り 🔁** (NEW) |
| Info **never designed** (no arrow) / ambiguous | `confused` / 迷い ❓ |
| No decider / overlapping authority | `meeting` / 合議 |
| Needs approval/authority absent | `waiting` / 確認待ち |
| Overload, no relief | `tired` / 疲労 |
| Risky task, no abort criterion/owner | `onFire` / 炎上 |

- **Checkpoints (関所).** At defined moments — implemented as **`cp_predep` 07:00 · `cp_relay` 12:00 · `cp_dinner` 18:00** (the §12.5 times; the draft's cp_briefing/cp_precook names were folded into these three) — `tick()` sets `paused=true` and returns. The player **inspects each member**: info held (with arrival time), what they wait on (+predicted idle), next task. Then **intervenes**:
  - **Runtime patch** (one-shot): inject an ad-hoc delivery into the live sim — the character unblocks now, but the *plan gap remains*, so a clean re-run stalls again (and repeated rescues are logged: "hand-fed 3×").
  - **Plan edit** (persisted): written into `cfg.overrides` (same channel `applyFix()` uses) — the intended path to 100.
  - `resume()` clears the pause. Between checkpoints the run is fully hands-off.

---

## 9. Scoring — Efficiency + the 8 categories (採点) ⟶ headline score SUPERSEDED by §23
> **Superseded 2026-07-09 by §23:** the headline "Score / Grade" below is no longer the internal
> `score()`'s 8-category total — it's `window.PRS.scoreTrip(plan)`, a whole-trip 100 authored as ~90
> integer-priced named atoms (see the blueprint spec `docs/superpowers/specs/2026-07-09-scoring-blueprint-design.md`).
> `score()` and its 8 categories are **retained internally** (still feed `individuals`/`team`/`conditions`
> + the classic fix-pack to `renderReport`) but their total/grade are no longer shown as the headline. The
> worked example in §9.1 below is the **pre-refactor** ledger; kept for history. Efficiency (this section's
> other headline) is unchanged in spirit, now computed by `tripEfficiency(plan)` — see §23.

**Two headline numbers, side by side** (they may diverge — a plan can waste 4% of time yet be un-shippable
because the abort authority is unassigned):

| Headline | Measures | Range |
|---|---|---|
| **Grade / Score** 総合点 | *Is the plan sound?* — the existing 8-category, 100-pt model | 0–100 · D→A |
| **Efficiency** 稼働効率 | *Does it waste anyone's time?* — `Σ productive / Σ available` across duty-holders (guests excluded from the denominator) | 0–100 % |

The **8 categories and `CAT_MAX` are unchanged** (`objective 20 / schedule 15 / roles 15 / info 15 / budget 10 /
safety 10 / quality 10 / health 5`) — `verify.js` protects them. What changes: schedule & info become
**minute/handoff-derived**, and two event counts feed quality.

| New cost | Category | Rule (deterministic) |
|---|---|---|
| Idle + blocked minutes (待機・依存待ち) | **schedule** | `15 × (1 − (idle+blocked)/available)` (then existing −2 if fatigue) |
| **Missing** handoff (未共有) | **info** | −5 each |
| **Late** handoff (情報遅延) | **info** | −3 each → `info = 15 − 5·MISS − 3·LATE`, floored 0 |
| Wrong-fish rework (魚違い手戻り) | **quality** | −4 per event; its minutes also enter `rework` |
| Guest waiting at mess (ゲスト手待ち) | **quality** | via a guest-idle→satisfaction curve (never Efficiency — guests aren't workers) |
| Overload / fatigue · Safety-abort gap · Missing approver/reserve | health/schedule · safety/roles · budget/roles | existing detectors, unchanged |

Rules that prevent double-counting: a **late** handoff bills **info** (design flaw) *and* **schedule** (idle it
produced) — one fault, two lenses, both explained. A missing **decision authority** bills **safety+roles**, not
info. The existing **`clean` cap** is kept — *any surviving gap caps the total at 89* — a deliberate teaching
moment.

### 9.1 Worked example — the verified ledger (D→A)
The seeded fishday faults are: **B** = the two cook-consult arrows (`ic_menu`→angler, `ic_menu`→boat) never
drawn → wrong-fish rework ×2; **C** = the tackle list sent morning-of at 06:00 on **chat** (+10 min) → arrives
06:10, **40 min late** → the angler idles at the port; plus the 7 classic template gaps (safety, budget, …).
The gappy fishday costs **220 idle person-min + 90 rework person-min → 91% efficiency**, and the wrong fish
pushes dinner to **18:30**. The implemented, `verify.js`-asserted gradient (replacing the draft's illustrative
numbers) is:

| | Run 0 (gappy, 8 gaps) | +7 classic fixes | +`fixHandoffs` |
|---|---|---|---|
| **Score / Grade** | **8 / D** | **64 / C** | **100 / A** |
| **Efficiency** | **91%** | **91%** | **100%** |
| Idle / rework | 220 / 90 min | 220 / 90 min | **0 / 0** |
| Dinner | 18:30 | 18:30 | **18:00** |

The last-fix jump (64→100) is the intended climax: the whole plan is "sound" on paper, yet the **temporal
information axis** is what still blocks the day. Efficiency stays flat at 91% through every classic fix and
only reaches 100% when the arrows are drawn and re-timed — the two headline numbers deliberately diverge.
Seeded `mulberry32` guarantees the same plan reproduces the same ledger.

---

## 10. Canonical naming (so every part agrees)
The design sections initially drifted on names; **these are authoritative** (the completeness critic's #1 ask):
- **Info cards:** the 9 in §5.2 + trip-frame `ic_ferry, ic_hospital, ic_rooms, ic_return` (existing) + `ic_cash` (new; ties to the reserve gap).
- **Handoff schema & latency table:** §6.1 (RUNTIME superset + `content{en,jp}` + `ifLate`/`reworkKind`; latency 対面0/radio1/phone2/chat10/board30).
- **`teamLead` is retired** in this template (globally): catering → `chef`; lodging/keys → `logi`; `ic_ferry`/`ic_food` recipient lists and the `info` detector's `need` array replace `teamLead` with `specialist`/`chef`; drop 🚩 from the Duty Deck.
- **Wrong-fish default:** correct = **カツオ** (skipjack); habitual wrong default = **アジ/サバ**, explicitly non-substitutable for the planned dish → reproducible, unusable rework.
- **Canonical departure = 07:00**, canonical portions = **13 guests + 5 organizer add-ons = 18** (3 organizers self-cater; at-sea crew on bento are counted among the served). Freeze §5 as the single 100/A anchor; `verify.js` asserts it.

---

## 11. Core constraints (never change)
- **No auth, no database, no server, no build step** — open `index.html` in a browser, fully offline.
- **Few plain HTML/CSS/JS files only** (no new files for the MVP — edits land in the existing ones).
- **Bilingual EN/JP** throughout (full parity in `i18n.js`; entity labels via `L(en,jp)`).
- **Deterministic** (seeded `mulberry32`); the engine runs in **Node** so the teaching gradient is headless-verified.

---

## 12. MVP build plan — extend the engine, don't rebuild
Every existing field, detector, fix, and `verify.js` assertion stays working; the temporal layer is **additive**,
behind `day:'fishday'`, so whole-trip / per-day (arrival・ops・return) behavior is byte-for-byte unchanged.

### 12.1 Task #1 — the rename/move (⚠ nested git) — ✅ DONE 2026-07-02
Executed: dirty state committed inside the nested repo (`c6cf778`), then
`mv …/jp2enkotoba/moon_to_mars /Users/tanakai/aibos/OgasawaraSim` (nested `.git` travelled → history/origin/branch
preserved; remote is still `PrakharSaxena24/moon-to-mars.git`). The outer `jp2enkotoba` repo never tracked the
path (untracked, no `.gitmodules`) so no outer-repo cleanup was needed. `node verify.js` green at the new path
(all 31 checks). No source-path edits were needed (relative loads). **GitHub repo name & Pages URL remain out of
MVP scope** (a separate `gh repo rename`).

### 12.2 Engine additions (`engine.js`)
- **Constants:** `CHEFS=3`; recompute `GUESTS = HEADCOUNT − STAFF − CHEFS = 13`. New tunables `MIN_DT=5`, `DAY_START_MIN=240` (04:00 — widened so §5.3's 04:15 tasks fit; the draft said 300), `DAY_END_MIN=1200`, `IDLE_TOL=0`, `IDLE_CAP=60`, `CHANNELS` latency map.
- **Roster:** add role `chef` 🍳 (before `crew`, keep `crew` last as `role()` fallback); add `co_chef`; add participants `p09–p11`; re-hat `p08` `teamLead → specialist`; add `roles.chef` + `roles.specialist`, delete the `teamLead` instance; `project.portions = { guests:13, organizers:8, chefs:3, servedByChef:13, organizerAddOns:5 }`. Migrate the mechanical `teamLead` references (§10).
- **Segment:** add a 4th `SEGMENTS` entry `fishday` (代表的な釣行日／分刻み) so the minute clock never touches the day-clock segments.
- **Tasks:** the **30** `fishday` tasks from §5, each with optional `startMin`/`durMin`/`day:'fishday'`/`produces[]`/`assumeOn[]` alongside the existing day-based fields (absent → behaves as today).
- **`handoffs[]`** (new top-level array) per §6.1; ship it **gappy** (one arrow late, one missing) exactly as the template already ships gappy.
- **Pure helpers:** `fishdayTasks`, `resolveSendMin`, `infoArrival`, `idleMinutes`, `wrongFishTasks`, `reworkMinutes`, `efficiency` (all DOM-free, exported on `api`).
- **New detector** `handoffTiming` (`category:'info'`, `state:'waiting'`, fits the existing 9-field `DETECTORS[]` contract → auto-participates in `detect`/`blockedTasks`/`daySummary`/badges/fix-pack): `test = idleMinutes(plan).total > IDLE_TOL || wrongFishTasks(plan).length > 0`.
- **`mergePlan`:** one clause to merge `overrides.handoffs` (patch by id, or push a new arrow). **`applyFix('fixHandoffs')`** writes the canonical arrows; add it to `applyAllFixes`.
- **`tick`/`createSim`:** a `mode:'minute'` branch (advance by `MIN_DT`, gate on `startMin` + info arrival, accrue `idleMin`); reuse bucketing/station/banner. `score()`: fold `handoffTiming` into schedule/quality and expose `efficiency`/`idleMin`/`reworkMin`.

### 12.3 UI additions
- **Timeline+arrows editor** (setup, shown when `fishday` selected): per-role lanes + draggable/resizable task blocks (vanilla Pointer Events, no lib) + an SVG overlay of handoff arrows (green on-time / red late, click-to-edit trigger+channel, drag ○→● to add). Writes `overrides.timing`/`overrides.handoffs`.
- **Checkpoint inspector** (`#inspect-modal`, mirrors `#detail-modal`): per-member state / info-held / waiting-on-ETA / next-task, an **Intervene ("Send now")** sim-local injection, and **Resume**.
- **Playback:** minute-mode `#nowtag` HH:MM; dashboard gains **Efficiency (効率)** + **Idle (待機 N分)** readouts.
- **i18n:** EN+JP for `dayloopTitle/Hint`, `cp*`, `effLbl`, `idleLbl`, `p_handoffTiming_*`, `e_handoffTiming_*`, `fishday`.

### 12.4 `verify.js`
Update `individuals.length 8 → 11` (the single breaking edge). Add a `fishday` block asserting: gappy →
`handoffTiming` present, `idleMin>0`, `efficiency<100`, grade D; `applyAllFixes` → `idleMin===0`,
`efficiency===100`, no `handoffTiming`, grade A; `efficiency` climbs monotonically; task idle = **max** (not sum)
of its late inputs. Keep every existing assertion. Gate on `node verify.js` exit 0.

### 12.5 Scope — IN vs OUT
**IN:** the one representative fishing day in minute detail; `handoffs[]` + `handoffTiming` detector + idle/efficiency;
`chef` role + 3 chefs + portions + organizer-add-on flow; timeline+arrows editor; checkpoints at 07:00/12:00/18:00;
Efficiency/Idle on dashboard+report; bilingual strings; extended `verify.js`.
**OUT (deferred):** minute-modeling of other days; free authoring of new tasks/roles from scratch (player edits the
seeded skeleton); save/load, AI generation, replay-scrubbing, multi-scenario templates; per-guest individuality;
GitHub repo rename; any server/DB/build tooling (permanently out by constraint).

### 12.6 Phased task list — ✅ ALL DONE 2026-07-02
0. ✅ **Move & baseline** — §12.1; `node verify.js` green at the new path.
1. ✅ **Data model** — constants, chef role + p09–p11, 30 `fishday` tasks + `handoffs[]` (gappy 12 of canonical 14); `verify.js` individuals 8→11.
2. ✅ **Temporal engine** — tunables + `fishday` segment; pure helpers (`fishdaySchedule` cascade, `readiness`, `projected`…); `handoffTiming` detector + `fixHandoffs` + merge clauses; minute-clock branch + checkpoints + `intervene`/`memberInfo`; score fold (schedule waste, info −5/−3, quality −4/guest-wait, Efficiency headline).
3. ✅ **Verify the new gradient** — fishday block: gappy D/idle 220/91%/2 wrong-fish, all-fixes → A 100/0 idle/100%/dinner 18:00, monotone efficiency, idle=max-not-sum, intervene-preserves-plan-gap, editor merge surface. **53 checks total.**
4. ✅ **Authoring UI** — per-person lanes + draggable/resizable blocks (Pointer Events, 5-min snap) + SVG arrow overlay (green/red, ○→● drag + socket-tap draw, click-to-edit trigger/channel, erase) + ready-check chips + live projection; `buildCfg` folds `timing`/`handoffs`.
5. ✅ **Playback UI** — minute `#nowtag` HH:MM; Efficiency % + idle/rework dashboard readouts; checkpoint inspector (held cards with arrival times, waits with ETA, Send-now intervene, Resume); report efficiency/dinner/wrong-fish chips; ⏳/🔁 states + legend.
6. ✅ **Close-out** — 32-check Playwright DOM pass (editor, arrows, checkpoints, intervene, A/100% path, JA parity) + multi-agent adversarial review; `node verify.js` green.

---

## 13. Contingency branches / Phase-2 depth (from the completeness critic)
Not required for the MVP, but the concept is only *complete* with these. Each is **deterministic** (driven by a
plan flag, never RNG) and ships as a scenario variant so the branch is playable, not a checkbox.
- **NO-GO / abort (時化).** `ic_weather = hold/abort` by `cp_predep` → chef switches to a frozen/procured fallback menu (from `ic_food`), boat branches to shore-fishing/stand-down; a mid-trip abort recomputes `ic_ground`→re-times the cook plan.
- **Low catch / 不漁.** `yield = f(rig-correct × minutes-on-ground × sea-factor)` — a late departure (upstream idle) *causes* a shortfall; a plan that drew a fallback-supply arrow (`ic_catch → backstop → ic_food`/`ic_cash`) scores higher. Teaches resilience, not just timing.
- **Comms/card outage (通信・カード不通).** Model channel **availability**, not only latency: at sea, `chat`/`board` are *unavailable* (an arrow on them is **missing**, not late) → radio is the winning move for `ic_catch`. Card-down makes `ic_cash` load-bearing for ice/bait/fuel.
- **Seasickness → deputy-without-information.** A per-person `available` flag (seasick if sea marginal AND stamina<4). On drop, reassign to `deputyId` **and** check each held `infoId` was also delivered to the deputy — if not, the capable deputy still stalls (the core thesis in one scene).
- **Per-guest allergies safety gate.** Give `pg_guests` an aggregate dietary field; a SAFETY-gated `ic_catch → chef` check hard-stalls `t_serve` if the caught species intersects a guest allergen — the strongest safety teaching moment.
- **Cold-chain spoilage clock.** `t08` gets a spoilage deadline (`land→ice gap > SPOIL_MIN` → `reworkKind:'spoilage'`); needed ice = `catchKg × ICE_RATIO`, so a late `ic_catch` weight under-stages ice → partial spoilage.
- **Fuel/bait, guest boarding, at-sea headcount.** `fuel`/`bait` as gated resources (bait qty from `ic_target`); `ic_boarding` (capacity + lifejacket check) as a safety gate on depart; a ground-departure 点呼 (man-overboard).
- **End-of-day gear return.** `t_gearreturn` produces `ic_tackle_delta` seeding tomorrow's `ic_tackle` — skip it and the next day's gear check stalls on stale inventory (a **day↔frame carryover** teaching moment).
- **Day ↔ 10-day carryover.** End-of-day exports `{fatigueDelta, cashSpent, inventoryDelta, tackleState}` into the coarse frame to seed the next ops day (at minimum, feed the representative day's fatigue into the existing health path).

### The strongest teaching moments to showcase (見せ場)
1. **Backward-from-the-stove scheduling** — the 90-min cook block propagates all the way up to when the boat must leave.
2. **The cascade** — one un-drawn `ic_target` → wrong ground → wrong fish → chef re-preps: a visible wave of ⏳ moving 港→船→食堂.
3. **迷い vs 手待ち** — structural (❓, no arrow) vs temporal (⏳, arrow timed late) — two icons, two distinct fixes.
4. **Deputy-without-information** — a capable deputy still stalls if the principal's cards were never re-shared.
5. **The clean-cap moment** — 97 raw but 89/B because one late arrow survives.

---

## 14. Files
```
OgasawaraSim/                   (at /Users/tanakai/aibos/OgasawaraSim — moved 2026-07-02)
├─ index.html   screens: setup (canvas/org/timeline+arrows editor) → site map + dashboard → report
├─ style.css    calm light business theme + site map + character states (+ lane/arrow/checkpoint classes)
├─ engine.js    window.PRS — deterministic sim: data model, detectors, scoring (no DOM, Node-runnable)
├─ i18n.js      all EN/JP strings (full parity)
├─ app.js       wires PRS + i18n to the DOM (setup / run / report / fix-and-rerun)
├─ verify.js    Node-only headless test of the teaching gradient (node verify.js)
├─ README.md
├─ CLAUDE.md    ← this concept + build plan
└─ archive/moon_to_mars/   earlier "Moon → Mars" prototype (kept, not loaded)
```
Design source (kept out of git via `.gitignore`): `シミュレーション型プロジェクト管理ゲーム_アプリ概要書_v1.0.docx`.

---

## 15. Status
**Concept: COMPLETE. MVP SHIPPED 2026-07-02. Layer 0 "Living Harbor" 2026-07-03 (§16). Play-first two-mode
rebuild 2026-07-03 (§17). Polish pass 2026-07-05 (§18). All-day grid 2026-07-06 (§19, superseded). Authorable
hour-level all-days rebuild SHIPPED 2026-07-06 (§20). Canvas 2D stage + coarse-day animation + graphic
onboarding SHIPPED 2026-07-07/08 (§21.11/§21.12/§22). Whole-trip scoreTrip ledger SHIPPED 2026-07-09 (§23),
re-derived as scoring rubric v1.0 SHIPPED 2026-07-10 (§24).**
**LIVE on GitHub Pages: https://prakharsaxena24.github.io/moon-to-mars/** (pushed 2026-07-06; `main` → Pages
serves `main`/root, auto-deploys on push; `gh` authed as PrakharSaxena24 — §23/§24 not yet pushed).
Headless-verified `node verify.js` **258 checks** (classic D→A gradient; the fishday temporal block — gappy
plan idleTotal 1450 person-min, fishday-day efficiency 68%; the rubric v1.0 constitution — 89 atoms Σ=100,
gappy trip 54/D, canonical 100/A/clean, arrow-draw the largest single fix jump; Layer 0 helpers; the §20
authorable-day anchors: per-day 100 via canonDay, cleared→D, monotone gradient, channel-at-hour pricing,
façade equality, purity). Prior DOM passes: **69-check Playwright E2E** (§20.8) + headless-Chrome screenshot
passes for §21/§22 + a 19-check runtime smoke for §24. Next: §13 contingency branches, Layers 2–4 (§16), and
the §23/§24 "Deferred / known" items (Live gap convergence-grouping, coarse `applyDayFix` cap) remain the
backlog.

---

## 16. Feel pass — "Age of Empires / Nobunaga's Ambition" direction (2026-07-03)
The shipped MVP read as a *precomputed Gantt-replay with 11 dots* (three independent code-reads scored its
"aliveness" 2/5). A design pass reframed the roadmap as five additive layers that inject the command/empire
FEELING **without diluting the thesis** — governed by one law: **juice the diagnosis, never the reflex; surprise
≠ randomness; 100 stays sacred; morale is an output not an input; live command is debt.** Full plan + the
three-proposal synthesis (Living Harbor / Chronicle / Sea-as-adversary) live in the session history.

- **Layer 0 — "Living Harbor" (✅ SHIPPED 2026-07-03).** Pure-cosmetic, zero thesis risk. See §16.1.
- **Layer 2 — "The sea fights back":** deterministic adversary via `applyScenario` through the one `mergePlan`
  choke point (comms-outage → seasickness/deputy → storm-day boss). *Backlog.*
- **Layers 3–4 — characters + campaign:** named-people stat cards (traits + morale/loyalty as *read-offs*),
  optional debt-logged live command, 10-day carryover ledger, ambition tiers, expedition chronicle. *Backlog.*
- **Cut for now:** fog-of-war (user declined 2026-07-03).

### 16.1 Layer 0 as built (additive — no engine/score/determinism change)
- **Engine (`engine.js`): four DOM-free, deterministic, read-only helpers on `window.PRS`, none touching
  `score()`/`fishdaySchedule`/score-path RNG** (`verify.js` asserts purity):
  `ambientActors(seed,phase)` → 13 seeded guest positions; `boatState(sim)` → boat param 0..1 derived from the
  depart/return task states; `stationReadiness(sim)` → per-station green/amber/red from *live* task states;
  `cascadeTrace(plan)` → the ordered fault hops (港→船→食堂), `hasFault=false` on a clean plan.
- **Renderer (`app.js`): a `requestAnimationFrame` loop** replaces the 0.6s teleport-slides — the 11 duty-holders
  now **walk** continuously toward their engine-assigned station (engine still owns *which* station). It also
  drives **13 wandering guests** (hushed + frozen near a stalled holder — bustle sharpens the diagnostic),
  a **boat that sails** port→sea→port, and the **cascade comet**. The engine remains the single source of truth;
  the loop is pure presentation and never writes back to the sim.
- **Feel HUD:** stations tint **green/amber/red "territory"** (Nobunaga's map-turns-your-colour, live); a minute-mode
  **18:00 dinner countdown** ("dinner in 07:40 · 30 min late at this rate"); a **climbing idle meter**; the
  **cascade comet** rolls 港→船→食堂 while a fault is live; a **dinner-served fanfare** fires once on an on-time
  clean serve; **floating "+N"** deltas pop over the projection when an editor arrow-draw raises the score.
- **Ambience (`style.css`):** sea shelf + shimmer, drifting gulls, jumping fish; new keyframes are all
  reduced-motion-guarded. **Layers:** sealayer z0 · paths z1 · ambient(guests+boat) z2 · stations z3 · figs z4 ·
  cascade z5 · chips z6 · banner z7 · fanfare z9.
- **i18n:** `dinnerIn/dinnerWillLate/dinnerOnNow/dinnerLateNow/fanfareText` added with full EN/JP parity.
- **Verified:** `node verify.js` = **91 checks** green; headless-Chrome DOM screenshots of the fishday run in
  EN (gappy + clean) and JP show no JS errors, the living map, and correct territory/countdown/idle behaviour.

---

## 17. Play-first rebuild — two modes (2026-07-03, on `main`; plan-first era preserved on branch `planfirst`, pushed to GitHub)
Layer 0 made the run *prettier* but the user's verdict held: still not exciting, and **"the barrier to start feels
large."** A multi-agent studio (PM, cold-open, systems, UI, reference analyst + 2 critics, on Sonnet) converged
unanimously: **invert the funnel — Play First, Plan Second** — and both critics added a second load-bearing pillar
(**close the slow feedback loop**) and an honest recalibration (**target Into-the-Breach / Papers-Please-grade
deterministic thriller**, not literal AoE/Nobunaga, given the fixed 24-person single-map design). Approved via an
interactive mockup (`artifact revamp-coldopen-v1`). Stakes decision: **soft-fail** (a run can visibly lose, but the
failure always names the PLAN GAP, never a person). Engine is **unchanged** (verify.js still 91/91).

**A header mode switch chooses the front door:**
- **▶ Live (default, play-first):** on load you land *inside* the running fishing day. The classic org/budget/safety
  decisions are pre-sound (`startLive` sets all classic fixes, leaves `fixHandoffs` off), so the puzzle is purely the
  **temporal information axis**. The sim runs; at each info-arrow gap (`nextLiveGap`, in time order) it **auto-pauses**
  (no clock pressure on first contact) and the consuming crewmate freezes red. One tap → a scoped **spotlight**
  (`renderSpot`): pick the hand-off channel; a **blast-radius preview** (`previewChannel`→`hypCfg` runs a hypothetical
  `mergePlan`+`fishdaySchedule`+`projected`) paints the downstream stations and states the *local* consequence BEFORE
  you commit. Commit (`commitChannel`) writes a real `overrides.handoffs` plan edit, re-solves, and continues from the
  current minute. The day ends in a **win** (dinner 18:00, 100/A, fanfare) or a **soft-fail** (`liveFinish`) that names
  the surviving gap. All deterministic; reuses `createSim`/`tick`/`renderSim`/`cascadeTrace`.
- **📋 Plan first (Morning):** the preserved classic setup→run→report authoring board (the `planfirst` experience).

**Implementation:** additive to `app.js` (mode system: `appMode`/`enterMode`/`startLive`/`launchLive`/`liveStep`/
`nextLiveGap`/`openGap`/`renderSpot`/`hypCfg`/`previewChannel`/`paintBlast`/`commitChannel`/`liveFinish`/`renderResult`/
`liveToReport`; `runFn` makes the tick loop mode-aware; banner suppressed in Live), `index.html` (header `.modesw` +
`#live-dock` panels), `style.css` (mode switch + live-dock/spotlight/blast/result), `i18n.js` (live-mode strings, full
EN/JP parity). **Verified** headless (EN): land-running, freeze prompt, spotlight + blast-radius, clean 100%/win, and
the Morning toggle. **Backlog / next:** a 2nd verified "voyage" (§13 branch) for replayability; Layer-2 adversary
(`applyScenario`). (Map-callout on the frozen crewmate + morning-plan preservation on toggle: ✅ shipped in §18.)

---

## 18. Polish pass — audited bug sweep + graphics/movement overhaul (2026-07-05, commit `145fa0d`)
A 7-lens multi-agent audit (65 findings → 36 verified adversarially → **31 confirmed**) plus a design-judge
ranking of 29 polish proposals drove one combined pass. Engine untouched (`verify.js` still **91/91**).

**Correctness (all 31 confirmed findings fixed):** rAF-loop leak on Live re-run; `finish()`'s unguarded 700 ms
report reveal; quit/again/tweak/fix-apply are now **mode-aware** (a Live report never drops into a
checkpoint-style morning run; the header `▶ Live` button re-enters from the report); the Morning-authored plan
is **snapshotted across a Live detour** (`snapshotMorning`/`restoreMorning`); `.figs` no longer blocks station
clicks; `arrowPatch` stores the **full merged arrow** (fix-provided arrows survive channel edits);
`atMinute` is clamped to the producer's finish (no physically-impossible sends); `fdClearFixConflicts` also
clears endpoint re-timings (the fix-pack button always works); editor pointer capture + `pointercancel` +
stuck-drag self-heal; late/ok socket tap opens the feeding arrow (`feedArrow`); wire drops get 14 px slop and
never mint duplicates onto on-time sockets; window-resize rescaling; language switch keeps walkers mid-stride,
keeps the live freeze visuals, and re-renders open modals; i18n holes closed (receipt rules, standalone gap
chip, hardcoded `L==='ja'` ternaries → `chMin/vInTime/vTooLate/pvLbl`; 6 dead keys removed; parity 265/265);
keyboard access (Escape closes modals; stations/warnings/sockets/blocks are focusable and operable; dialog ARIA).

**Graphics & movement ("Living Harbor+"):** every mover is GPU-composited (`translate3d` via `setXY`, no
left/top writes); frame-rate-independent easing (`1−e^(−k·dt)`), **constant-speed walking** with facing flip and
a real 2-leg walk cycle; characters are **role-coloured pawns** (coat + cap = identity; state = foot-aura +
washi bubble chip with pop; names on demand — hover/stall/spotlight; 4-wide arc formations kill label pile-ups);
**time-of-day sky** interpolated from the minute clock (`SKY` stops 04:00→20:00; `.night` lantern glow); a real
west-coast **sea band** with foam edge; **information motes (P21)** — every handoff flies its path as a
gold/red mote with an arrival ping, so 報連相 is the visible layer; CSS **skiff** on a quadratic bay arc with
wake puffs and a return-leg flip; cascade comet gained trail ghosts, eased hops, and a per-hop station strike;
guests wear seeded yukata colours and act out the engine's `cast/chat/stroll`; dashboard readouts tween with
signed floats (gold pulse reserved for exactly 100); the live freeze paints the **迷い ❓ / 手待ち ⏳ / 手戻り 🐟**
taxonomy in copy + state + spotlight ring. `prefers-reduced-motion` is honoured in JS too (snap positions,
static cascade chain, ping-only motes).

**Verified:** `node verify.js` 91/91 · **45-check Playwright E2E** (live win path, rAF-leak rate measurement,
quit/rerun/mode routing, morning snapshot round-trip, editor socket-tap/clamp/keyboard-nudge, 3 checkpoints →
A-grade clean report, JP mid-freeze switch, reduced-motion page, resize) — all green, zero JS errors.

---

## 19. All-day timeline grid (2026-07-06) — the editor now renders on every day tab  ⟶ SUPERSEDED by §20
> **Superseded 2026-07-06 by §20:** the read-only coarse Gantt described here was replaced by the
> authorable deck→arrange→connect editor; `dayLayout`/`derivedHandoffs` and the read-only path are retired.
> Kept for history.

The timeline+info-arrow grid used to be Day-3-only and hard-hidden off it (§7's `daySel!=='fishday'`
gate — the "I can't find it" bug). It now renders on **every day tab**. Day 3 stays the full
minute-level drag-and-drop authoring editor; **Arrival / Ops / Return are a read-only hour-level
Gantt** derived from data the engine already holds — no invented reference plans, coarse-day scoring
unchanged. Locked with a Fable design gut-check (caught: arrows evaporate on coarse days, view-only
drag reads as fake, two determinism traps) → **PROCEED-WITH-CHANGES**, all applied.

- **Engine (`engine.js`), additive + pure (verify.js asserts score()/tasks unchanged):**
  `DAY_HOUR_START=300`, `DAY_HOUR_END=1140`, `HOUR_DT=60`; `dayLayout(plan,seg)` →
  `{lanes[roleId], blocks[{taskId,roleId,laneIndex,subRow,startMin,durMin}], unstaffed[taskId]}`
  (per-ROLE lanes, dep-topo order on a `.slice()`, hour placement, sub-row stacking for the all-day
  ops bars; `null` for fishday); `derivedHandoffs(plan,seg)` → info arrows from `neededInfo` ×
  `infoCard.ownerRoleId`, with a resolved `fromTaskId` or `incoming:true` (line-less chip) when the
  sender owns no task that day. Seg predicate: `day!=='fishday'` + startDay (0 / 1–8 / ≥9).
- **App (`app.js`):** `buildFishday`→`buildDayGrid` dispatcher; separate coarse renderer
  (`buildCoarseGrid`/`drawCoarseArrows`/`cx`) reusing the fd-* DOM/CSS; **coarse days are read-only**
  (no ports/drag/resize/keyboard; pointer + keyboard handlers gated on `daySel==='fishday'`, so the
  fishday overrides can never be written from a coarse day); info arrows are inspect-only (hover
  tooltip); the `pm`-sourced cards render as incoming chips; `unstaffed` tasks (e.g. Return's GAP-G
  `t_ship`) surface as a "⚠ nobody assigned" note; whole-trip tab stays grid-less. Hard-hide removed
  → grid visible on entering Morning (discoverability fixed).
- **Deferred (needs sign-off):** making the coarse days *authorable & scored* (their own 100-anchor)
  = three hand-authored, consistency-verified hour-level reference plans — the "full puzzle per day".
- **Verified:** `node verify.js` **107/107** (+16 grid block: shape, in-window, per-row non-overlap,
  t_ship unstaffed, ops arrows well-formed, return empty, pure) · Playwright **50/50** (+5: read-only
  grid on all coarse tabs, real ops arrows, return unstaffed note, coarse drag inert, whole-trip
  hidden) — zero JS errors; Day 3 authoring + Live mode unaffected.
- **Orchestration:** Opus managed/integrated + wrote the coupled `app.js`/verify; Sonnet built the
  pure engine helpers (Exec A); Fable ×1 design gut-check. (i18n/verify authored inline when the
  agent classifier was briefly unavailable.)
- **Review round (commit `ae637cf`):** 4 Sonnet lenses → refute → Fable synthesis over `f7b6784`
  confirmed 7 (2 refuted). Fixed: coarse info-arrows sliced diagonally across lanes (coincident
  all-day blocks have no L→R order → now a clean vertical connector at a shared x, raised above the
  portless blocks; horizontal arrow kept only for true precedence); arrow hover was a dangling
  `cursor:help` (added escaped `<title>`); lane labels didn't grow with stacked sub-rows (now take
  the lane height). Accepted-not-fixed: per-tick coarse rebuild in `updatePlanUI` (tiny; skipping
  would make an assign-duty edit go stale). Renderer-only fix — verify.js still 107/107, E2E 50/50.

**Review round (same pass):** a 5-lens adversarial review of the diff confirmed **21 further defects — all
fixed**: same-mode Morning re-entry no longer restores a stale snapshot over the authored plan (the one high);
motes judge lateness per (role, card) pair with the engine's min-over-arrows (a superseded slow arrow no longer
flies red over a clean plan) and `commitChannel` re-flies only the just-committed hand-off; resize mid-freeze
re-paints the gap taxonomy; the boat wake selector actually matches (`.ambient .wk`); the gold-100 pulse lives
on `.bigreadout`; reduced-motion pings get a static ring instead of being animation-killed; the RM cascade
chain survives language switches/resizes; night lanterns no longer mask a stalled station's red glow; the port
hit-halo no longer covers the resize handle and socket halos can't steal a neighbour's tap; `fdClearFixConflicts`
resets ALL fishday re-timings (dep-chain idles included); `feedArrow` prefers the tapped task's own arrow;
`atMinute` sends re-clamp when their producer is re-timed; second-finger/wire-hijack and pointercancel-storm
guards; warnings keep keyboard focus across ticks; Escape follows visual modal stacking; dialogs got a Tab trap
+ focus restore; the live freeze focuses its Fix button and the dock is `aria-live`. Re-verified: 91/91 + 45/45.

---

## 20. Authorable all-days rebuild — hour-level, draggable, choose→arrange (2026-07-06, PLAN APPROVED)
The owner's direction: **every day (incl. Day 3) becomes hour-level and draggable**, with a two-step
authoring flow — **choose the required tasks, then arrange them on per-person hour lanes and wire the
information connections** — scored toward 100. Planned by a Fable architect pass; owner signed off on the
pivotal calls. This supersedes §19's "coarse days are read-only" decision.

### 20.1 Locked decisions (owner sign-off 2026-07-06)
- **Direction:** build the authorable days (full plan), not scenario branches.
- **Day 3 granularity:** hour ruler + **15-min placement snap** (NOT literal 60-min). Keeps the 90-min
  cook block (5×18), the 0–30 min channel-latency lesson, and **all fishday verify anchors byte-intact**.
  Other days snap 60 min. `SNAP_MIN = {arrival:60, ops:60, return:60, fishday:15}`.
- **Scoring identity:** **rule-based** — any consistent arrangement can score 100 (required tasks placed &
  staffed on the right role, deps ordered, every needed card delivered on time over a priced channel, no
  double-booking, no decoys). The hidden per-day reference plan is only verify's witness that 100 is reachable.
- **Day open state:** template stays **fully seeded**; Morning gets a **"Clear day"** action for deck-first
  authoring (Arrival pre-cleared to half as the tutorial). Protects Live + all anchors.
- **Live mode:** unchanged, fishday-only this release.

### 20.2 Architecture spine — "blocks quantize, information doesn't"
Snap constrains **edits**, not the latency math (which stays minute-precise) — so authoring in hours still
lets minutes leak in (the thesis restated). **Additive engine** (D7 survives): a new `plan.days` container
that `score()`/`detect()`/the classic 10-day frame **never read** (91 core anchors stay byte-identical);
`fishdaySchedule` generalizes to one pure `daySchedule(plan,seg)` (fishday delegates, verify pins equality);
a new rule-based `scoreDay(plan,seg)` beside `score()`. The day-grid **UI is a real rewrite** into one
deck→arrange→connect editor. §19's `dayLayout`/`derivedHandoffs` + read-only coarse path are retired.

### 20.3 Data model (engine.js)
- Constants (on `api`): `SNAP_MIN`, `DAY_WINDOWS = {fishday:[240,1200], arrival:[300,1140], ops:[300,1140],
  return:[300,1140]}`, `AUTHORABLE = ['arrival','ops','return','fishday']`.
- `plan.days = { arrival:{tasks:[HD…], handoffs:[…], decoys:[id…]}, ops:{…}, return:{…} }` — fishday stays
  in `plan.tasks`/`plan.handoffs` (frozen). `HD(id,en,jp,station,roleId,ids,startMin,durMin,opts)` mirrors
  `FD()` minus startDay/dur, plus `required:true|false`. ~10/12/9 required + 3 decoys per day, 60-min quanta,
  each with 2–3 deliberately **back-to-back critical handoffs** (board=30 idle, chat=10, radio/phone≈0).
- `overrides.days = { <seg>:{ placement:{taskId:{startMin,durMin,assignedIds[]}|null}, handoffs:{id:h|null} } }`
  merged by one new `mergePlan` clause. Fishday keeps its legacy `timing`/`staffing`/`handoffs` channels
  (app.js façade routes by seg; `placement:null` on a fishday task ⇒ `staffing[id]=[]`).
- New pure helpers (DOM-free, on `api`): `tasksForSeg`, `handoffsForSeg`, `deckFor(plan,seg)→{required,decoys,
  unplaced}`, `daySchedule(plan,seg,inj?)` (generalized cascade + new read-offs `overbookMin`, `misassigned[]`,
  `unplacedRequired[]`, `decoysPlaced[]`; `fishdaySchedule` = one-line delegate, pinned equal), `dayReadiness`
  (adds `UNPLACED_REQUIRED`/`DECOY_PLACED`/`MISASSIGNED`), `scoreDay`, `projectedDay`, `canonDay(seg)` +
  `applyDayFix(cfg,seg)` (per-day analogue of canonHandoffs/fixHandoffs). `createSim` minute branch
  generalizes: `minute = AUTHORABLE.indexOf(seg)>=0`, window from `DAY_WINDOWS`, checkpoints fishday-only.
- Untouched: plan.tasks, plan.handoffs, all 30 FD tasks + canonical/gappy arrows, CHANNELS, CHECKPOINTS,
  the 8 detectors, applyFix/applyAllFixes, score(), CAT_MAX, Layer-0 helpers, budgetReadiness, intervene.

### 20.4 Scoring formula (deterministic; R = required tasks, ds = daySchedule(plan,seg)) ⟶ SUPERSEDED by §23
> **Superseded 2026-07-09 by §23:** `scoreDay` is no longer a fresh 0–100 per day — it's re-denominated to
> report the day's **slice of the trip 100** (e.g. "Fishing Day: 33 of its 41 trip points"), reading off the
> same `scoreTrip` atom ledger. The formula below is the **pre-refactor** per-day 8-category model; kept for
> history (`score()`'s 8 categories, described here, remain the internal provider — see §9's note and §23).

`objective = 20×(|R|−|unplacedRequired|)/|R|` · `schedule = 15×(1−min(1,(idle+overbook)/avail)) −2×decoysPlaced
−(fatigue?2) −(seg==='return'&&returnLogi?2)` · `roles = 15 −3×|misassigned| −classic-roles` · `info = 15
−5×|missing| −3×|late|` · `budget = 10 −(budgetAuth?6)−(reserve?4)` · `safety = 10 −(safety?10)−3×safety-decoys`
· `quality = 10 −4×|wrongFish| −min(4,⌊guestWait/15⌋)` · `health = 5 −(fatigue?5)`. Floored 0, capped CAT_MAX;
`clean = dayReadiness==∅ && unresolved==0`; **!clean caps total at 89**; `efficiency = round(100×avail/(avail+
idle+rework+overbook))`. `scoreDay(plan,'fishday')` reproduces today's fishday numbers (pinned).

### 20.5 verify.js strategy → ~126 checks
~91 survive untouched (classic gradient, Mission Control, the full fishday temporal block incl. 220/91%/40-late/
dinner 18:30→18:00/CHANNELS/IDLE_CAP/max-not-sum/intervene, Layer 0, determinism). Retire the 16 §19 grid
checks (delete `dayLayout`/`derivedHandoffs` last). Add ~35: three per-day 100-anchors via `canonDay`; cleared-day
D/objective-0; monotone authoring gradient; channel pricing survives at hour quanta (one tight arrow per day:
board→30 idle, info−3); decoy/misassign/double-book penalties; façade equality `daySchedule('fishday')===
fishdaySchedule()===220`; merge-surface + `applyDayFix` heal; purity (no perturb of score()/plan.tasks/plan.days).

### 20.6 Phase plan (agent tier · acceptance = `node verify.js` exit 0 each phase)
0. ✅ Spec memo (this §20) — Opus.
1. **Day data** (Sonnet, bounded): `plan.days` rosters + decoys + canonical handoffs + `canonDay` + SNAP/WINDOWS
   + EN/JP names; self-check each reference set internally consistent. Accept: 107 still green + consistency assert.
2. **Temporal core** (Opus, coupled/heavy): `daySchedule` (fishday delegates), new read-offs, `mergePlan` days
   clause, tasksForSeg/handoffsForSeg/deckFor, scoreDay/projectedDay/dayReadiness, canonDay/applyDayFix,
   createSim windows. Accept: all 107 old + new anchors (100-per-day, façade equality 220, channel-at-hour).
3. **Verify build-out** (Sonnet): full new block; retire the 16 grid checks; delete dayLayout/derivedHandoffs.
   Accept: ~126/126.
4. **Editor unification** (Opus, coupled/heavy): Task Deck rail + placement drag + per-seg snap + authorable
   arrows on all days; delete read-only coarse path; `dayOv`/buildCfg routing; snapshot/restore + fix-conflict
   extension; keyboard/touch parity. Accept: Playwright — author an arrival day cleared→100; Day-3 editor E2E
   green (nudge 5→15); Live win path green.
5. **Run/report + i18n + style** (Sonnet): coarse-day minute playback polish, day report via scoreDay, ~45 new
   EN/JP keys, deck CSS + reduced-motion. Accept: headless EN+JP run of a coarse day, zero errors, i18n parity.
6. **Integration + adversarial close-out** (Opus + 1 Fable synthesis): multi-lens review, decoy tuning, mark §19
   superseded, full verify + E2E. Accept: ~126 verify + E2E green, no Live regression.

### 20.7 Top risks (Fable)
Cascade drift in Phase 2 (mitigated by delegation-not-duplication + pinned equality) · the hour-day channel
lesson is weaker by construction (reference plans MUST include tight back-to-back handoffs) · content authoring
(3 consistency-verified reference plans) is the real schedule cost · fd-* editor carries ~30 §18 hardening fixes
— the existing Playwright suite must stay green as the guardrail, not be rewritten to match.

### 20.8 As-built (SHIPPED 2026-07-06, Phases 1–5 committed)
All four days are now one **deck→arrange→connect** editor. Choose required tasks from the **Task Deck**
rail (3 hidden decoys per coarse day), drag them onto per-person hour lanes, wire the information arrows;
live projection + ready-check as you build; **"Clear day"** authors from an empty board. **Day 3** keeps its
15-min snap, minute channel-latency lesson, and every anchor byte-identical; Arrival/Ops/Return snap 60.
Rule-based `scoreDay` grades any consistent arrangement toward 100 (perfect 100/A → half ~66/C → cleared 25/D,
monotone). A **coarse-day Run → `scoreDay` report** (grade + 8-category scorecard + dayReadiness fix-pack +
"Auto-arrange the arrows" `applyDayFix` + Edit/Run-again).
- **Verified:** `node verify.js` **148/148** (+41 authorable-day anchors: per-day 100 via canonDay, cleared→D,
  monotone gradient, channel-at-hour pricing, decoy/misassign/double-book, façade equality 220/91, purity) ·
  Playwright E2E **62/62** (+12) · i18n EN/JA **281/281** · fishday + Live confirmed unaffected.
- **Model use (owner's allocation):** Opus managed + wrote the coupled Phase-2 cascade/scorer & integration;
  Sonnet did Phases 1/3/4/5 execution; Fable ×3 (plan → [reserved] → final review synthesis). Each phase gated
  on verify + E2E staying green.
- **Deferred (this release):** animated playback of an authored *coarse* day (Run shows a scored report; the
  animated "watch people stall" stays fishday/Live, per §20.1). Cleanup: retire the dead §19
  `dayLayout`/`derivedHandoffs` + their verify checks. Optional: pre-clear Arrival as a tutorial.

---

## 21. Graphics & motion upgrade — Tier 2 Canvas 2D stage (APPROVED 2026-07-07 · build spec; NOT yet built)
Owner wants character movement and overall graphics "much better," on a **bigger screen**. Decisions are now
**locked** (owner sign-off 2026-07-07, §21.1); this section is the build spec, grounded by a 6-surface codebase
recon (render inventory · interaction/a11y · layout/CSS · verify · i18n · dead-code). Two facts still frame it:
- **The engine, `scoreDay`, and all 155 verify checks are safe under ANY render change** — rendering only *reads*
  deterministic sim state, never writes back (confirmed: `renderSim`/`frame` are pure over `sim`, app.js:1208;
  `verify.js` imports only `engine.js`, so its 155 are structurally immune, and §Section-10 already pins the four
  cosmetic helpers the scene consumes). Risk lives **entirely** in the presentation layer.
- **No shortcut exists** under §11 (no build / no CDN / offline / few plain files): "better graphics" =
  hand-crafted procedural **Canvas 2D** art. No library, no asset packs.

### 21.1 Locked decisions (owner sign-off 2026-07-07)
| Axis | Decision |
|---|---|
| Render tier | **Tier 2 — hand-rolled Canvas 2D** `scene(ctx, sim, t)` under a DOM HUD; new `stage.js`, vanilla ES5, no library |
| Art direction | **Richer washi/lacquer** — evolve the indigo-night + gold/hanko identity (procedural gradients, contact shadows, lantern light-pools, footstep dust, rim light) |
| Screen / layout | **Full-width stage + collapsible dashboard drawer** (`.wrap` → ~1440–1600, `#sitemap` → ~70–80vh) |
| Cast on stage | **11 duty-holders only** (8 organizers + 3 chefs); the 13 guests **hidden by default with a "Show guests" toggle**; `👥 13 ゲスト` legend kept as a text reminder |
| Characters | "Bigger screen" = **larger scene, not bigger people** — the 11 pawns keep relative scale |
| Tests | `verify.js` stays the committed guardrail (155, passes trivially); Playwright E2E stays an **ephemeral** per-phase gate — **nothing pushed to GitHub** (§21.7) |
| Coarse-day animation | **Deferred** — recon shows it needs an *engine* change (§21.8b), out of Tier 2's zero-engine-behaviour-risk scope |

### 21.2 Invariants & guardrails (do not violate)
- **Engine behaviour untouched.** No edits to `engine.js` scoring/sim logic; `scene()` only *reads* (§21.3
  read-list). The one allowed engine touch is the §21.8a **dead-code deletion** (removing already-unreferenced,
  verified-single-use `dayLayout`/`derivedHandoffs` + helpers) — a zero-*behaviour*-risk removal, not a logic change.
- **`verify.js` stays green** every phase (155 → 139 after §21.8a; the printed total is *+N* once the new i18n
  parity assertions land in phase 4, §21.6/§21.7). It never imports render code.
- **`frame()` motion math is preserved**, not rewritten — only its *output* changes (setXY → canvas, §21.3).
- **Offline / no-build / vanilla ES5 / no library / few plain files** (§11) holds. `stage.js` is one new plain file.
- **fishday + Live must not regress** — the canonical Day-3 minute run and the Live cold-open path are the
  behavioural anchors (existing Playwright win-path + `verify.js` §Section-7/§Section-13).

### 21.3 Architecture — new `stage.js` render layer
**Module boundary.** New global `PRS_STAGE` (mirrors the `window.PRS` style) exposing:
- `initStage(canvasEl, dims)` — grab `getContext('2d')`, size the backing store to `dims.w*dpr × dims.h*dpr`,
  `ctx.setTransform(dpr,0,0,dpr,0,0)` so **all existing `normalized×anim.w/anim.h` math is reused verbatim** (DPR
  is absent today — the DOM stage gets crispness free; canvas must add it or text/edges blur).
- `scene(ctx, sim, t, view)` — one `clearRect` + full redraw per frame, bottom→top (order below). **`view` is the
  per-frame render-state bundle** the scene needs beyond `sim`: the interpolated caches (`fig`/`guest`/`boat`/
  `wake`/`mote`/`cascade`/`ghost`/`trail`/`chain`/`hotPts`/`tweens`) **plus** the flags `guestsVisible`,
  `hoverPid`, `spotlightPid`, and the per-station `tintMap`. This param is **required**: the eased `cx/cy` walk
  positions are *not* recomputable from `sim` (that is the "people walk, not teleport" feature), and `anim` is
  closure-private to app.js's IIFE — so the caches must be handed in, not re-derived. (Equivalently, ownership of
  the caches could move into `PRS_STAGE` behind a `PRS_STAGE.update(...)`; passing `view` is the smaller change.)
- `resizeStage(dims, dpr)` — reallocate the backing store on the debounced resize (app.js:1746) and on dpr change (monitor move).
- internal **pooled particle/effect list** (`{t0, duration, kind, …}`) + a **camera** — the phase-1 camera is the
  **identity transform** (no pan/zoom; "larger scene, not bigger people"); parallax/pan is deferred to a later phase.

**Integration point.** `frame()` (app.js:1028) and `renderSim` (app.js:1208) **keep every computation** —
`figTargets`→`f.tx/ty`, the `anim.fig[pid].cx/cy` walk, guest easing (`kAmb`), the boat quadratic bay-arc,
`updateMotes`/`updateCascade`/`updateTweens`, the `RM` snaps, participant `state`, `hotPts`, and the territory
`tintMap` — and **drop every DOM mutation**, routing the results into `view` instead. That means removing not just
`setXY(el,…)` but *all* render-side DOM writes: the `.astro` `innerHTML` creation + `nm`/`className`/`bub` writes,
the `ring`/`badge`/`stalled` text/class writes (except the badge chip, §21.4), and the per-frame `walking`/`faceL`/
`hushed`/`sailing` classes + `wake.style.opacity` + cascade `ghost.show`/opacity + station `.strike` toggles.
Nothing writes back to `sim`. `startAnim`/`stopAnim` lifecycle (leak-guarded per §18; halts when `#run` is hidden,
app.js:1030) is reused. `buildSitemap` (app.js:833) **stops injecting the `#sealayer` and `#ambient` DOM layers**
(their sea/gulls/fish/guests/boat/wakes art now lives in `scene()`; keep the `#guests-tag` legend) and instead
allocates/sizes the canvas right after `anim.w/anim.h` are set (line 843); the `anim.guest`/`anim.boat`/`anim.wakes`
caches carry **positions only, no `.el`**. On `keepActors` rebuilds (language switch, app.js:105) the canvas
**persists** (resize only → no flicker).

**Draw order** (flattens today's stage layers — territory halo `z-1` up through the `z5` *stage* art like the
cascade — into one canvas; the `z5` HUD chips `.st-badge`/`.nowtag`/`.guests-tag` and everything above stay DOM, §21.5):
1. **ground** — radial island base + stipple noise + inner vignette; inset red ring when `sim.bannerOn`.
2. **sea band** — bay-silhouette water fill + shore inner-shadow + dashed gold foam + animated shimmer stripes (`t`).
3. **sea life** — 3 gulls (sweep left→right, sin bob) + 3 jumping fish (7 s arc); deterministic from `t`.
4. **roads** — 8 dashed `ADJ` segments, `lineDashOffset` marching from `t`.
5. **skytint** — full-cover day-phase gradient from the **SKY 10-stop table** interpolated on `sim.clockMin`, drawn
   **under** actors so day-tint never darkens pawns (preserve today's z1 < z3); minute-mode only.
6. **guests** (*gated by the Show-guests toggle, OFF by default*) — 13 yukata pawns from
   `P.ambientActors(seed, t/2600)`, cast-guests at fixed shore homes, **hush** (dim+freeze within `HUSH_R2` of a stalled holder's station).
7. **boat + wakes** — composite skiff (hull path + mast + sail + hinomaru) at `P.boatState(sim).param` through the
   DOCK→BOATC→SEA quadratic bezier; sin bob, extra rock at sea, flip on outbound/ground; pooled gold wake puffs fading 900 ms.
8. **stations ×7** — per-id landmark glyph (roof / awning+lantern / red-cross / coin / dock-planks / wave-arcs),
   icon disc + emoji + bilingual name, **territory halo + border tint** from `P.stationReadiness(sim)`
   (green/amber/red), crew-count ring, pulsing stalled ring, night lantern glow (red overrides). *(The `⛔`
   problem badge stays a DOM chip — §21.4/§21.5 — so its problem-title text stays in the a11y tree; not canvas-drawn.)*
9. **figures ×11** — role-coloured pawns (`P.role(id).color`) at `figTargets` fan-stacks (rows of 4, +36 px feet
   offset): contact shadow, swing-phase legs while walking, torso/head/cap, **state foot-aura**
   (red/amber/blue/green from `p.state`), speech-bubble chip (`BUB` map) with pop-on-change, name chip on
   stall/spot/hover, Live **spotlight** ring (gold) on the gap-focus pid.
10. **motes** — gold/red handoff dots flying `A→B` on a smoothstep arc when `sim.clockMin` crosses their send-min,
    pinging the target station on arrival (minute-mode, fishday handoffs).
11. **cascade** — red comet along `P.cascadeTrace` hops (1000 ms/seg) + 3 fading ghost dots + per-hop strike ring;
    **RM fork** → static red chain markers above affected stations.

**Ported constants** (today split across CSS + JS → all become `stage.js` JS constants): SKY 10-stop table
(app.js:1176); figure state→aura + territory colours + YUKATA palette + `BUB` emoji map (app.js:93);
`DOCK`/`SEA`/`BOATC` + `HUSH_R2` (app.js:799–800); effect durations (ping 560 / strike 340 / bubpop / wake 900 /
mote flight 650–1550 / cascade hop 1000) — CSS-class+`setTimeout` effects become timed pooled entries.

**Scene reads (never writes) — the safe contract:** `P.STATIONS`/`P.station`, `P.role().color`,
`sim.participants[].{state,station,name,roleId,id}`, `sim.stations[].{crewIds,dominantProblem}`,
`P.stationReadiness(sim)`, `P.boatState(sim)`, `P.ambientActors(sim.cfg.seed, phase)`, `P.cascadeTrace(sim.plan)`,
`P.resolveSendMin`/`P.staticArrival` + `plan.handoffs`, `sim.clockMin`/`sim.sched`, `speedMult`, `sim.bannerOn`,
`RM.matches`, `L`. (`verify.js` §Section-10 already pins determinism + score-purity of the four cosmetic helpers.)

### 21.4 Accessibility shadow (real cost #1 — smaller than first feared)
**Key recon insight:** the *only* click/keyboard-inspectable thing inside `#sitemap` is the 7 `.station` nodes
(click delegation on `#stations` app.js:1673 + Enter/Space app.js:1717 → `openProblemPanel`). The `.astro` figures
are **not** clickable (only CSS hover-name + `data-pid`). Therefore:
- **Keep `#stations` AS the shadow.** `buildSitemap` (app.js:839) emits an **art-less** `.station` box — keep the
  node + `id`/`data-st`/`tabindex=0`/`role=button`/`class` and the `.terr-*` tint class, but **drop the `.st-arch`/
  `.st-ic`/`.st-halo`/`.st-ring`/`.st-nm` children** (their art moves to `scene()`; leaving them double-draws over
  the canvas). The box stays transparent + focusable **over** the canvas, so the click delegation (1673), keyboard
  (1717), `openProblemPanel`, and the territory-tint class stay **byte-identical** → zero interaction rewrite.
  Mirrors `.warn[data-station]`'s accessible contract. **The `#badge-<id>` DOM chip stays** (renderSim's badge
  write, app.js:1245, is unchanged) so the problem-title text remains in the a11y tree.
- **Offscreen roster** (new): a visually-hidden `aria-live=polite` list of the 11 duty-holders — `nm(name)` + role
  icon + state text (via the `st*` i18n keys, §21.6) — since canvas figures have no DOM. **Hover-name** (optional):
  transparent per-figure hotspots synced to `figTargets` px (carrying `.astro`/`data-pid` for the E2E hook) with
  `pointer-events:auto` + `pointerover`/`pointerout` setting `view.hoverPid`; the name chip is drawn canvas-side
  keyed on `hoverPid`/stall/spot (the old pure-CSS `.fig:hover ~ .nm` path dies with the DOM figure). If hover-name
  is cut for simplicity, drop it from scope and rely on the roster + always-on stall/spot name reveal.
- **Re-point the Live coupling.** `paintBlast` (app.js:1959), `paintGapFocus` (app.js:1862) and `renderSim`'s
  territory tint (app.js:1246) currently toggle DOM classes on `#st-<id>`/`.astro`; re-point them to canvas
  draw-state (a per-station tint map + a spotlighted-pid flag) **and** fold the tint / frozen status into the
  station hotspot `aria-label` + roster, or the blast-radius + frozen-spotlight teaching moment is lost to AT.
- **Keep as DOM overlays:** `#nowtag`/`#dinnertag`/`#banner`/`#fanfare` (clock + dinner countdown as `aria-live`).
- **Reduced motion:** `scene()` draws ONE static frame and stops scheduling rAF (mirror today's `RM` branches);
  add an `RM.addEventListener('change')` when wiring (absent today).

### 21.5 Screen / layout — full-width stage + dashboard drawer
- **Widen** `body.running .wrap` `1180 → ~1440–1600` (scope to `.running` so #setup/#report keep their column;
  verify #report's 2-col scorecard still reads at the new width). **Map height** `#sitemap` clamp → `~70–80vh`.
- **Drawer:** toggle a class on `.runwrap` (owns `grid-template-columns:1fr 312px`, style.css:217) → `1fr` when
  closed (**reuse the existing `@media(max-width:760px)` collapse pattern**); the `#dashboard` aside slides off as
  an overlay. **Add a toggle control** to `#run` markup (none exists) — drive its label imperatively
  (`drawerShow`/`drawerHide`, §21.6), mirroring `updateRunButtons` (app.js:1342).
- **Guests toggle:** add a second control to `#run` markup (beside the `#guests-tag` legend), backed by a
  **default-OFF** `guestsVisible` state var that `frame()` copies into `view.guestsVisible` to gate draw-order item 6;
  label flips `guestsShow`/`guestsHide` imperatively (§21.6). Hiding guests does **not** affect `hotPts` (computed in
  renderSim from duty-holder `STALL_STATES`, app.js:1237; only *consumed* by the guest layer, app.js:1061).
- **Canvas insertion:** `<canvas id="stage">` `position:absolute;inset:0` inside `#sitemap`, `z` **below** the
  `.station` shadow + all kept HUD chips (`.st-badge` z5 / `.guests-tag` z5 / `.nowtag` z5 / `.dinnertag` z6 /
  `.banner` z8 / `.fanfare` z9 — unchanged; the emptied `#skytint`/`#paths` DOM layers at z1 are removed).
  **Vignette: draw it on the canvas** (one layer, no z-juggling) and drop `.sitemap::after` (z1) so no stale art sits above.
- **DPR + resize** wired at `buildSitemap` (app.js:843) and the debounced resize (app.js:1746) — reallocate the
  backing store + re-apply the dpr transform; recompute dpr (monitor move), not just w/h. Movers already rescale.
- **Responsive:** add rules above 1180; reproduce the 640px `.station{60px}` / `.astro scale(.88)` shrink as canvas
  draw-scaling (those DOM rules stop applying once drawn); add map-height breakpoints; `#live-dock` stays a
  `.runwrap` sibling (may need its own treatment under the taller map).

### 21.6 i18n additions (append to BOTH `en` and `ja` in the same edit)
Flat `STR{en,ja}` namespace; state-toggle labels follow the `pauseBtn`/`resumeBtn` two-key + imperative pattern
(`data-i18n` only fills `textContent` for the current language, so it can't flip by state):
- **Drawer:** `drawerShow` / `drawerHide` / `drawerAria`.
- **Guests:** `guestsShow` / `guestsHide` / `guestsToggleAria` (the toggle gates the canvas guest-layer draw; reuse `guestsShort` for the count tag).
- **a11y cluster** (function-valued where a name is injected, resolved via `nm()`): `figAria(name, role, state)`,
  `stationAria(name, status)`, readiness words `readyGreen`/`readyAmber`/`readyRed`, `rosterHeading`, `stageAria`.
- **New plumbing:** this is the **first** code that writes `aria-label` from i18n — re-apply it on language switch
  (fold into the existing `buildSitemap(true)`+`renderSim` relabel branch, app.js:105). Mind the `en/ja` (i18n) vs
  `en/jp` (entity data via `nm()`) key asymmetry.
- **Make parity real:** add a symmetric-keys assertion to `verify.js` (it can `require('./i18n.js')`) so 281/281→N/N
  becomes an enforced anchor — today parity is convention-only (nothing checks it).

### 21.7 Tests
- **`verify.js`** — unaffected by the render swap; stays 155 (→139 after §21.8a) **+ the new i18n parity check**.
  Committed guardrail, runs `node verify.js`.
- **Playwright E2E (ephemeral, nothing pushed).** Survive unchanged: all HUD / dashboard / controls / live-dock /
  modal / report hooks (outside `#sitemap`). Re-point the `#sitemap`-interior hooks — station assertions land on the
  shadow hotspots (`.station`/`#st-<id>`/`data-st`/`.terr-*` preserved); figure assertions on the roster or
  `data-pid` hotspots; keep `#nowtag`/`#dinnertag`/`#banner`/`#fanfare` as DOM. Purely-decorative selectors
  (`#boat`, `.mote`, `#paths`, guests, sea, cascade, sky) get `data-testid` stubs or roster/pixel assertions.
  Regenerate → run → discard each phase.

### 21.8 Deferred-item fold-in — one includes, one stays deferred
- **(a) Retire dead `dayLayout`/`derivedHandoffs` — INCLUDE (safe, verify-only).** Already gone from `app.js`
  (§20 Phase-4). Delete from `engine.js` the two functions (979–1016, 1022–1051), their exports (line 1530), the
  `HOUR_DT` const **and its export on line 1529** (careful: line 1529 also exports the *kept* `DAY_HOUR_START/END` —
  remove only `HOUR_DT`), and the helpers only they use (`clampInt` / the standalone `inSeg` fn / `laneTopoOrder` /
  `ROLE_ORDER`). Delete the `verify.js` §19 grid block (252–280, 16 checks → **155 − 16 = 139**). **Keep**
  `DAY_WINDOWS` (live via `segWin`, app.js:287) and `DAY_HOUR_START/END` (referenced by the coarse-day windows in
  `DAY_WINDOWS`, engine.js:50–51). Zero behaviour change; do it last (delete the checks with the functions).
- **(b) Animate authored coarse-day runs — ✅ SHIPPED 2026-07-08 (§21.12).** Was deferred from Tier 2 as engine
  work; built as the planned follow-on. The coarse days (arrival/ops/return) now animate on the minute clock and
  **pause-on-stall** just like the fishday, ending in the rule-based `scoreDay` report. See **§21.12** for the
  as-built. The open content decisions were resolved: coarse days show the Efficiency/Idle HUD (from `scoreDay`,
  not classic `score()`), the dinner-countdown/fanfare and info-motes/cascade-comet stay **fishday-only** (a coarse
  day has no 18:00 dinner and its arrows live in `plan.days[seg]`), and the boat idles at dock (a real Arrival/Return
  boat arc remains deferred — cosmetic).

### 21.9 Phase plan (agent tier · acceptance = `node verify.js` green + ephemeral E2E green each phase)
0. ✅ Spec (this §21) + 6-surface grounded recon — Opus.
1. **`stage.js` scaffold** (Opus render core): canvas + DPR + resize + camera + a *static* `scene()` reading sim
   state, behind a flag so the DOM stage still works. Accept: static frame matches station/figure layout; 155 green.
2. **Port motion** (Opus core + Sonnet scene pieces): the `sim`-driven draw layers (ground / sea / roads / skytint /
   guests / boat / stations / figures / motes / cascade), road-follow gait + easing + 4-way facing + crowd
   separation (motion wins §21.10), RM static frame. Flip the default to canvas. Accept: visual parity-plus over the
   DOM stage; fishday confirmed; 155 green. *(The Live-only overlays — blast radius, gold gap-focus spotlight,
   gap-focus tint — need the phase-3 draw-state bridge, so "Live visually confirmed" is a phase-3 acceptance.)*
3. **a11y shadow + E2E rewrite** (Opus a11y + Sonnet E2E): art-less `#stations`-as-shadow + offscreen roster +
   re-point `paintBlast`/`paintGapFocus`/tint to `view` draw-state (spotlightPid + tintMap). Accept: ephemeral E2E
   green (win path, click-to-inspect, keyboard, JA parity); **Live overlays visually confirmed**; screen-reader roster verified.
4. **Layout + art + i18n** (Sonnet + Opus art pass): drawer + widen + map height + responsive; richer-washi
   procedural art (contact shadows, lantern pools, dust, rim light); new i18n keys + parity check. Accept:
   responsive at 640/760/1180/1600; 155 (+parity) green; E2E green.
5. **Dead-code retirement + adversarial close-out** (Sonnet delete + Opus/Fable multi-lens review): §21.8a delete
   (→139); full review for regressions. Accept: 139 (+parity) verify + E2E green, no fishday/Live regression.
   *(Coarse-day animation §21.8b is a separate follow-on, not in this plan.)*
Effort estimate (from §21.10): ~1.5–2 sessions.

### 21.10 Decision record — alternatives considered (2026-07-07)
- **Tier 1 (upgrade the DOM stage):** bigger map, road-follow, richer CSS pawns; ~½ session, a11y/E2E untouched.
  Rejected — ceiling is "nicer flat diagram."
- **Tier 3 (canvas + embedded sprite art):** Tier 2 + illustrated/pixel `data:`-URI art; ~2.5–3 sessions,
  dominated by art-making + an aesthetic pivot. Deferred — can layer on top of Tier 2's canvas later.
- **Tier 4 (WebGL):** GPU shaders (refractive water, bloom); overkill for ~11 pawns (24 with guests toggled on) on a static map, and to be
  pleasant wants a library (breaks §11). Rejected.
- **Layout alternatives:** full-bleed (most cinematic, hardest responsive) · just-bigger (keep the 312px sidebar).
  Chose the drawer as the balance.
- **Art alternatives:** pixel-art · illustrated/vector — both an aesthetic pivot; chose richer-washi (safest,
  cohesive with the shipped indigo-night + gold/hanko identity).
- **Motion wins (adopted into Tier 2):** road-follow instead of beelines · accel/settle easing + per-person speed +
  crowd separation · 4-way facing + idle fidgets · richer environmental life.
- Live samples of each tier (animated) + an effort table were pitched earlier as an artifact (`graphics-tiers-v1`).

### 21.11 As-built (SHIPPED 2026-07-07 · canvas is the default)
Built via multi-agent orchestration (Fable art-foundation + many Sonnet draw layers + Opus motion/review). The
Canvas 2D stage (`stage.js`, `window.PRS_STAGE` = `initStage`/`resizeStage`/`scene`) is now the **default** run
stage; **`?dom`** forces the legacy DOM stage, **`?canvas`** no longer needed. Shipped:
- **Render:** `scene(ctx, sim, t, view)` — 11 layers (ground/sea/gulls+fish/roads/sky/guests/boat/stations/
  figures/motes/cascade) in richer washi (contact shadows, lantern light-pools, gold-leaf beveled discs, rim
  light, paper texture), DPR-correct, `view.scale` sizing (canvas only; DOM layout unchanged).
- **Motion (§21.3/§21.10):** road-follow along the `ADJ` graph (BFS route + waypoints) + accel/settle easing +
  per-person speed + facing (`advanceWalker`/`routeWaypoints`/`figTargets` in app.js).
- **Live bridge (§21.4):** `stageSpotPid`/`stageTint`/`stageGapState` (set in `paintGapFocus`/`paintBlast`,
  cleared in `clearGapFocus`/`clearStationTints`, reset in `animReset`) feed the gold spotlight + gap/blast tints
  + 迷い/手待ち/手戻り taxonomy onto the canvas; `drawFigures`/`drawStations` honor them.
- **a11y:** `#stations` are art-less transparent hotspots (click/keyboard → `openProblemPanel` byte-identical);
  `aria-label` = station name + live problem status; offscreen `#stage-roster` (aria-live) mirrors the 11
  duty-holders' name/role/state (+ gap taxonomy during a freeze).
- **Layout/UI (§21.5/§21.6):** wider running stage (`.wrap` 1500, `#sitemap` 74vh) + collapsible dashboard
  drawer (`#btn-drawer` → `.runwrap.drawer-closed` → `refitStage`) + guests toggle (`#btn-guests`, guests hidden
  by default, hidden in `?dom`) + 7 new i18n keys (EN/JA parity **288/288**).
- **Verified:** `node verify.js` **155/155** (engine untouched) · runtime smoke 7/7 · headless render confirmed
  (canvas default + `?dom` fallback) · ctx save/restore balanced (53/53) · Opus 3-lens review, all findings fixed.
- **NOT done (still open):** §21.8a dead-code retirement (`dayLayout`/`derivedHandoffs` still present) · ephemeral
  Playwright E2E (not run this pass; covered by verify + smoke + headless screenshots) · deferred perf nits
  (offscreen-cache the static ground; stop building the hidden DOM stage in canvas mode). *(§21.8b — animate
  coarse-day runs — is now DONE, see §21.12.)*
- **Commits (main):** spec `669eb04` · P1 `ec2aee8` · `?canvas` preview `74ae0ab` · bigger stage `572ad8a` · art
  pass `91fd042` · canvas-default + Live bridge + UI `c39cea1` · review fixes `0a2a1a6`.

## 21.12 Coarse-day animation + pause-on-stall (SHIPPED 2026-07-08 — the deferred §21.8b, built)
Owner's direction: *"after Run, the simulation should run and I can see people moving with comments etc, and if
something is wrong the sim stops"* — applied to the **coarse authored days** (Arrival / Ops / Return), which until
now jumped straight to a static `scoreDay` report. Owner also chose (AskUserQuestion): **animate the coarse days
too (full fix)** + **pause-and-stall, then let pauses reduce the score.** Built to be **verify-safe**: the minute
behaviour is behind an opt-in 3rd arg, so `verify.js`'s ≤2-arg `createSim` never flips → **170/170 unchanged**.

- **Engine (`engine.js`), all gated so fishday stays byte-identical:**
  - `createSim(cfg, segment, opts)` — new `opts.animate`. `coarseMin = AUTHORABLE.has(seg) && seg!=='fishday' &&
    opts.animate`; `minute = fishday || coarseMin`. For a coarse-minute sim, `sim.tasks` is built from
    `tasksForSeg(plan,seg)` **filtered to placed tasks** (mirrors `daySchedule`'s `isPlaced`, so `sim.tasks` and
    `sim.sched.byTask` stay in lock-step); window from `DAY_WINDOWS[seg]` (`sim.winStart`/`sim.winEnd`);
    `sim.sched = daySchedule(plan, seg)`; `sim.stallSeen = {}`.
  - `tickMinute` — clock cap + day-fraction generalized to `sim.winEnd`/`sim.winStart`; finish flag reads
    `gapsForSegment(sim.plan, sim.segment)`; the `CHECKPOINTS` (関所) loop is now **fishday-only**, with a coarse
    `else` branch: **pause-on-stall** — the first time an in-scope task enters `waitinfo`/`rework` it pauses once
    (rising-edge via `sim.stallSeen`) with a `cp_stall` checkpoint so the player can inspect → intervene → resume.
  - `intervene` — re-solves with `daySchedule(sim.plan, sim.segment, injections)` (fishday still via the façade).
- **App (`app.js`):** `launch()` drops the coarse→`runDayReport` divert and passes `{animate:true}` (whole-trip
  `'all'` is not authorable → still the classic day clock); `runDayReport` deleted (dead). `finish()` grades a
  coarse animated day with **`P.scoreDay(sim.plan, seg)`** (the plan gaps that stalled the run are exactly what
  mark it down — so pauses ⇒ lower score, as asked), not classic `score()`/`daySummary`. `renderDashboard` sources
  the live grade/efficiency from `scoreDay` for coarse (and **guards `sc.team`** — scoreDay has no per-team block).
  `openInspector` looks tasks up in `sim.tasks` (coarse `hd_*` ids aren't in `plan.tasks`). `nowtag`/`dash-day`
  use `dayLabel(seg)` for coarse (not the fishday "Day 3" line). `updatePressure` (dinner countdown/fanfare),
  `buildMotes` and the cascade comet are all **gated to `segment==='fishday'`** (a coarse day has no dinner, and
  its arrows live in `plan.days[seg]`). The boat idles at dock (`boatState` returns dock for a coarse sim).
- **Verified:** `node verify.js` **196/196** — the prior 170 (engine 2-arg path + fishday façade untouched) **+ a
  new committed 26-check coarse-animate block**: per-seg `{animate:true}`⇒minute + `2-arg stays classic` (the
  verify-safe gate), `sim.tasks`↔`byTask` lock-step, seeded days pause on `cp_stall`, auto-arranged days run with
  **0 pauses** at 100% efficiency, `intervene` re-solves + increments `handFed`, fishday untouched · headless-Chrome screenshot of the
  Arrival day mid-run: correct "Day 1 · Arrival · 05:00" clock, 11 duty-holders animating, Efficiency 100% / idle
  0 live, the "Ferry time known only to the PM" gap as a live warning, Performance cleared, **zero JS errors**.
- **Deferred (cosmetic):** a real Arrival/Return boat arc; coarse info-motes from `handoffsForSeg`.

## 22. Graphic onboarding — the cast/intro screen (SHIPPED 2026-07-08)
Owner: *"a nice graphic introduction with characters and their names, so it's easier to onboard and play."*
Built a full-screen `#intro` welcome screen shown on first load.
- **Content:** an indigo hero (kicker · title · one-line premise · the play loop `plan → Run → watch stalls → fix → 100`
  with `Start ▶` / `How it works`), the core-thesis pull-quote, then **"Meet the crew"** — the 11 playable
  duty-holders as cards grouped **AIBOS · 8 organizers** and **3 chefs**, plus a **+13 guests** note. Each card = a
  role-coloured pawn (the SAME in-game `.astro .fig` art, scaled up inside `.ipawn`), name (EN + JP), role icon +
  name, and a one-line duty. Fully bilingual (EN/JP), re-renders on language switch.
- **Flow:** first load → intro (`localStorage 'prs_intro_seen'` gates it; returning players go straight to Live);
  `Start ▶` → `markIntroSeen()` + `enterMode('live')`; a header **👥 Cast** button reopens it anytime; `enterMode`
  hides `#intro` whenever a real mode is entered.
- **Code:** `#intro` section + header Cast button (`index.html`); `showIntro`/`renderIntro`/`castCard`/
  `startFromIntro`/`introSeen`/`markIntroSeen` (`app.js`, cast built from `mergePlan().participants` + `P.role`);
  intro/`duty_<role>`/`btnCast` keys EN+JP (`i18n.js`); hero + cast-grid + `.ipawn` pawn-reuse CSS (`style.css`).
- **Verified:** `node verify.js` still **196/196** (engine untouched); headless-Chrome screenshots of the intro in
  EN and JP (full role-coloured pawns, correct names/roles/duties, clean layout); a DOM check that `Start ▶`
  transitions intro→`#run` (`body.running`) with **zero JS errors**.

---

## 23. Whole-trip scoring — the scoreTrip ledger (SHIPPED 2026-07-09)
> **Superseded 2026-07-10 by §24:** this section's principles (whole-trip 100, integer atoms, causes-not-
> consequences, two distinct headlines) stand — the pinned 54/D → 100/A/clean numbers below carried forward
> unchanged — but its **enumeration** (the hand-authored ~90-atom count) was replaced by a **rule-based
> deriver** (89 atoms) with a tightened clean-gate and a Live/scoreDay/efficiency migration, per
> `docs/superpowers/specs/2026-07-10-scoring-rubric-v1-design.md`, the current constitution. Kept for history.

Owner direction: make the 100 a **whole-trip receipt** — every point one named, checkable thing the player
did or didn't do — with the temporal-information axis (the arrows) as the heaviest, honest lever. Fully
specified in the blueprint spec `docs/superpowers/specs/2026-07-09-scoring-blueprint-design.md` (read §0/§3/§13
for the authoritative model); this is the as-built summary. Supersedes the headline numbers in §9 and the
per-day formula in §20.4 (both marked above; `score()`/`scoreDay` are retained as internal machinery, not dead).

- **The model.** `window.PRS.scoreTrip(plan)` prices the **whole 10-day trip** as ~90 named, integer-priced
  atoms summing to **exactly 100** — no fractional points, no top-down re-normalization. Every atom is one of:
  a required task placed & staffed on the right role (**Execution**), an info-card→consuming-task socket
  delivered on time (**Information** — priced on the socket, not the drawn wire, so redundant arrows can't
  inflate the score), a gate owned (go/no-go, abort/budget authority, allergy, health-check — **Safety/
  Money/Quality**), or a decoy debit if a decoy task got placed. Atoms group into **5 buckets** (Trip Frame ·
  Arrival · Ops · Fishing Day · Return) × **6 dimensions** (Information 34 / Execution 25 / Safety 20 /
  Quality 10 / Money 10 / People 1) — both axes sum to 100. **Fishing Day (41 pts, 54% information) is the
  heaviest bucket** and Information is the heaviest dimension, because the thesis says clocked information
  is the heart, not by arbitrary weight.
- **Two headlines stay distinct.** `scoreTrip` = *is the plan sound?* (causes — plan decisions). The
  companion `tripEfficiency(plan)` = *does it waste anyone's time?* (effects — minute-weighted Σproductive/
  Σavailable over the 4 modeled days). A late info-socket bills **both**: the Score row (information has a
  clock) and Efficiency (the idle it caused) — one fault, two numbers, never two rows in one number.
- **Grade gate replaces the old cap.** The pre-refactor "!clean caps total at 89" is gone. Now: **A requires
  total ≥ 90 AND clean** (zero known gaps); a plan that scores high but has a surviving gap shows its **true**
  sum with a withheld A — `"97 · B — an A requires zero known gaps."` A number no longer lies to hide a cap.
- **The seed was re-tuned** so the climax still lands under the new honest pricing: **9 of the 14 fishday
  information arrows are withheld** and **Arrival is half-cleared**, so the gappy seed scores **54/D**; the
  true canonical (all classic fixes + `applyDayFix`×3, drawing every arrow) scores **100/A/clean**; and
  **drawing the information arrows is still the single biggest jump (+18)** — bigger than any classic fix or
  authoring Arrival — the intended teaching payoff, preserved.
- **The report** now renders an itemized **Score Ledger — every point, named**: grouped bucket → dimension →
  atom, each row = item name + status chip + reason (迷い "never specified" / 手待ち "arrived late" / on time)
  + earned/max. `scoreDay` is retained but **re-denominated** to a day-slice of the trip 100 ("Fishing Day: 33
  of its 41 trip points") rather than a fresh 0–100. `score()`/`scoreDay`'s 8-category totals stay internal-only
  — they still feed `individuals`/`team`/`conditions` + the classic fix-pack to `renderReport`, just not the
  headline.
- **Built in 3 phases (P1–P3), each Opus-QA-gated:** P1 landed `scoreTrip`/`tripEfficiency` structurally
  alongside the legacy scorers (Σ maxPts = 100 asserted from day one, atoms scoring 0 until content existed) —
  commit `b82fbf7`. P2 made the free-point atoms real (hospital-info routing, night abort-criterion, allergy
  gate, portions check, crew health-check) and re-tuned the seed — commit `214d716`. P3 switched the
  report/dashboard to read `scoreTrip` + the itemized ledger as the headline — commit `1063c3d`. Opus QA
  caught and fixed a fishday-misassignment false-credit bug along the way, confirmed migrated reference-plan
  pins were still correct, and reconciled the rendered ledger to `scoreTrip`'s sum exactly.
- **Verified:** `node verify.js` **236/236** — structural (Σ maxPts = 100 exactly, `byBucket`/`byDimension`
  totals match the §3.3 table, determinism, purity vs `score()`/plan mutation) + numeric (gappy 54/D, canonical
  100/A/clean, monotone fix ladder, arrow-draw = largest single jump, both beating every other fix). Not yet
  pushed to GitHub.
- **Deferred / known:** Live mode's gap pacing (`nextLiveGap`) was retuned for ~10 arrow gaps under the new
  seed but may want convergence-grouping (pre-departure info / catch relay) in a later pass; the coarse
  "Auto-arrange the arrows" button (`applyDayFix`) drops its placement patch on a gappy day, capping that
  path ~92 — pre-existing behavior, not a regression, future pass; allergy/portions/health-check gates are
  defensive atoms (rarely fail on a well-formed plan) by design, not a gap in the model.

---

## 24. Scoring rubric v1.0 — the derived constitution (SHIPPED 2026-07-10)
A post-§23 survey found real drift (engine shipped 90 atoms vs the spec's ~80; Live mode never actually
switched to `scoreTrip`; the retired 89-cap still lived inside `scoreDay`/`score()`; verify pinned only a
40–60 band, not exact values). Owner ruling: **don't patch the drift — re-derive the whole inventory fresh,
by fixed rule, from the flagged template data**, and make every number in it pin-exact in `verify.js`.

- **The derivation.** Atoms are no longer hand-listed; they're **computed** from the template by fixed rules
  (spec §3): one info-socket atom per (consuming role × info card) — the 4 riskable sockets worth 3 pts each —
  one execution-lane atom per (segment, role) pair, a safety-gate atom that *replaces* its segment's lane where
  a gate applies, additive quality/money checks, and −2/−3 decoy debits. This yields **89 atoms** (80 scoring +
  9 decoy) instead of the prior ~90 hand-authored ones, Σ `maxPts` still exactly **100**.
- **The frozen matrix (unchanged from §23's intent, now pinned):** buckets **Trip Frame 14 / Arrival 15 /
  Ops 18 / Fishing Day 41 / Return 12**; dimensions **Info 34 / Execution 25 / Safety 20 / Quality 10 /
  Money 10 / People 1** — both axes sum to 100, asserted by `verify.js`, not just documented.
- **Clean-gate amendment.** "Clean" is now precisely: every atom at its max **AND** zero live classic
  detectors. A ≥90-but-unclean plan shows its true sum with a withheld grade (`"97 · B — an A requires zero
  known gaps"`) — the old `!clean→89` cap is gone from **every** player-facing surface, engine included
  (it had survived inside `scoreDay`/`score()` after §23).
- **Migrations closed.** Live mode's win check now reads `scoreTrip` (not legacy `score()`), its win string
  is "Fishing Day: 41 of its 41 trip points" (the hardcoded "score 100 · A" is gone); `scoreDay`/
  `projectedDay` are demoted to internal machinery whose only outward face is a day-labeled trip-slice +
  efficiency; every on-screen efficiency number is now labeled by scope (day vs trip) so the three
  previously-unlabeled efficiency numbers can't be confused for one another; the ledger UI gained a full
  status-chip taxonomy (OK/Missing/Late/Partial 部分点/Broken/Overlap/Compressed/Decoy).
- **QA wave caught and fixed real bugs**, not just drift: a collapsed-socket atom was crediting the *best*
  feeding consumer instead of the *worst* (now worst-consumer-wins, matching the thesis — one late arrow
  should not be hidden by another timely one); safety-gate statuses were reporting "Missing" when the true
  cause was a gate owned by the wrong role (now an honest "Broken" chip); 6 further behavioral cases were
  added to verify as regression guards for both.
- **Verified:** `node verify.js` **258/258** — the pinned constitution (exact atom count, both matrix axes,
  Σearned≡total, exact seed pins: gappy 54/D, canonical 100/A/clean, monotone fix ladder, arrow-draw the
  strictly-largest single jump, i18n EN/JA parity 361/361) + constructed edge cases (withheld-A, skip-Return,
  drawn-but-late, redundant-arrow, collapsed-socket, decoy/overlap/dep-broken/compressed) + a **19-check
  runtime smoke** exercising the live report/dashboard/Live-mode surfaces. §21.8a dead code
  (`dayLayout`/`derivedHandoffs`/`HOUR_DT`) retired.
- **Built by parallel worker agents** (engine / verify / UI) plus adversarial QA lenses, integrated and
  QA-gated by a tech-lead pass. Authoritative docs: spec
  `docs/superpowers/specs/2026-07-10-scoring-rubric-v1-design.md` (the constitution) + plan
  `docs/superpowers/plans/2026-07-10-scoring-rubric-v1.md`. Commits: `8e742c6` spec, `7664836` plan,
  `2020925` engine+verify, `e306a63` UI/Live migration, `f3651ee` spec amendments, `9ca9dbd` QA fixes.
  Pushed to GitHub Pages 2026-07-10 (cfe049d..9c7a4ad).

## 25. UX Phase 1 + cold-open vignette — the receipt becomes the game (SHIPPED 2026-07-10)
Owner asks: planning should stop being dropdown boxes; a less text-heavy introduction; many characters moving
at once; hover/click a character to know their state. Designed via a 3-track design panel + a Fable
architecture verdict (one persistent harbor stage carrying plan/run/report — Phases 1–2 built now; the full
"plan on the harbor" command-tray mode is DEFERRED until the owner plays this phase). Spec
`docs/superpowers/specs/2026-07-10-ux-phase1-vignette-design.md` · plan
`docs/superpowers/plans/2026-07-10-ux-phase1-vignette.md`.
- **Ledger rail (one renderer, three surfaces).** `renderRail(mode)`: setup `#rail-setup` (sticky right
  column ≥1180px, "Projected 54 → aim 100", 5 clickable bucket jump-links, gate line, `#launch` in the rail
  footer; `#fd-projected` + PRE-RUN chips deleted), run (replaces the dashboard readiness block, `#dash-ready`
  id kept), report `#rail-report` above the itemized ledger.
- **Receipt-as-control.** The 8 planning `<select>`s are GONE: each decision is a receipt row — status chip,
  flip-open stakes (`p_<det>_cause`), one-tap "Close this gap (+N)" + quiet Undo — writing through the
  byte-identical `fixed[]`→`buildCfg`→`applyFix` path (incl. the mcOv coupling). Per-decision +N = memoized
  pure scoreTrip diff; the fishday-arrows row routes to the day editor showing the +18 prize (never a fake
  one-click).
- **Inspectable living cast.** Hover a pawn → canvas name chip + localized state word (`view.hoverWord`);
  click/tap → washi popover (`#pawn-card`, `P.memberInfo`: held cards + arrival times, waiting-on + ETA +
  predicted idle, next task; degrades on the classic clock); keyboard path via `#stage-roster` buttons.
  Stage: 8 deterministic role work-gestures + ≤6px seeded wander + idle sway (stage.js), all suppressed on
  stalled pawns and under reduced motion; ctx save/restore 70/70.
- **The 15s cold-open vignette.** A scripted real `createSim` (Live config) on the stage inside `#intro`:
  walk-in → first-gap freeze (~5.7s, chef ❓) → "Hand him the card" → gold mote, mini rail chip 23/41→25/41
  (+2) → "The place they stall is the place to fix the plan. 100 = nobody waits." Hard lifecycle
  (`killVignette` on Start/Skip/enterMode/applyLang; 5× open/close leak check = 0 stray rAF), RM = 3 stills,
  mobile 390px OK. Intro prose cut to one line; pull-quote absorbed; cast duties hover-reveal.
- **Verified:** `node verify.js` **258/258** (engine untouched throughout) · smoke **22/22** + 9 dedicated
  vignette/popover checks + reviewer-scenario re-checks, zero JS errors, EN/JP parity (i18n symmetric).
  2-lens adversarial close-out found 4 real defects, all fixed: affordance-wins pawn clicks over station
  hotspots (pointer only; keyboard keeps station priority), honest +N after undo for grantAuth/fixReserve
  (mcOv mirroring in `receiptAltTotal`), Escape closes only the top layer, skipped vignette re-boots as the
  FINAL poster on language switch.
- **Execution:** 2 waves × 2 parallel agents — Fable (rail/receipt, vignette), Opus (pawn inspect), Sonnet
  (work-loops); W4 built in an isolated worktree, 3-way-merged cleanly. Commits: spec `222f60f` · plan
  `8b56b69` · P1a `3f566a1` · P1b-1 `6dc1c47` · P1b-2 `76158a9` · QA `a480a58`.
- **Deferred:** plan-on-the-harbor (command tray, physical decision objects, day drawers) — owner decides
  after playing this phase; guests-visible-by-default; the Ambient-Live-Peek intro variant.

## 26. Plan-on-the-Harbor — planning becomes the stage (SHIPPED 2026-07-10)
The Fable unifier architecture's Phase 3, owner-greenlit after playing Phase 1 ("proceed to build"). Spec
`docs/superpowers/specs/2026-07-10-plan-on-harbor-design.md` · plan `docs/superpowers/plans/2026-07-10-plan-on-harbor.md`.
The §25 receipt rows remain as the complete "All settings / 詳細設定" fallback (collapsed ≥1180px) — the
reversibility clause holds.
- **The plan stage.** `#setup` is stage-first: a pre-dawn harbor canvas (`#plan-stage`, vignette-pattern
  fake-sim at 04:00 held un-ticked, per-role podium positions, Phase-1 idle gestures, RM = one still, lifecycle
  via the new `enterScreen(name)` consolidation) with a "Planning · 計画中" chip; pawns hover/click-inspectable
  (degraded card: name/role/duty/seat).
- **The command tray.** 6 draggable decision objects (abort flag ⛑️, budget seal, ferry card, illness route,
  relief token, shipping parcel) + 2 dock objects (strongbox → finance panel with a one-tap "Close this gap
  (+N)" reserve fill; satchel → the Fishing-Day drawer, +18 prize, never a one-click) + 8 duty chips (drop on a
  pawn = bijective orgOv seat swap). Three input modes ship together: pointer drag (ghost + threshold), tap-tap,
  and a keyboard target-picker (valid-first, invalid rows disabled with the teaching line). Wrong-target drops
  toast `rejLine(name, role, obj, neededRole)` ("Kaito is a chef — the abort flag needs the Safety Lead"). The
  tray is a pure VIEW of `fixed[]`/`orgOv` — tray, tokens at holders' feet (fanned when co-located), receipt
  rows and rail always agree; ferry recipients read live off the engine's shareInfo fix diff.
- **Day drawers.** Day tabs slide the existing deck→arrange→connect editor up as an ~85vh drawer over the
  stage (`#day-drawer`, `#fd-card` hosted in `#dd-body` permanently); the rail stays visible ≥1180px; drawing
  an arrow floats +N onto the rail; Escape yields to modals and beats the pawn popover; focus in/out per §18.
- **Integration seams (found by driving the merged UI, all fixed):** WB's `.open` vs WA's `aria-hidden`
  display guard left the drawer permanently invisible post-merge; the `.open` rule needed an explicit
  zero-delay visibility transition; `#dd-close` carried `.btn`'s `transition:all` which delayed INHERITED
  visibility and silently no-opped the open-time `focus()` (WB's worktree shell used a transition-free class —
  why it passed in isolation). Close-out lenses added: drawer title + plan pawn-card re-localize on language
  switch; co-located tokens fan apart; the strongbox one-tap.
- **Verified:** `node verify.js` **258/258** (engine/verify byte-untouched, `git diff -- engine.js verify.js`
  empty) · smoke 22/22 · a new committed-in-spirit **52-check plan-harbor E2E** (per-object place/undo via all
  three input modes, rejection toasts EN/JP, seat-swap bijection under rapid swaps, three-way sync, Live
  regression, RM/touch/JP contexts) · zero JS errors throughout. rAF-leak measured stable across 6 mode cycles.
- **Execution:** WA plan-stage+tray (Opus retry at high effort after the Fable worker hit its session limit
  pre-edit; enriched brief carried WB's integration contracts) ∥ WB drawers (Opus, worktree, 3-way merged) ∥
  WC E2E authoring (Sonnet) — integrated, seam-fixed and QA-gated by the tech lead. Commits: docs `1fc6d97` ·
  P3a `201a6ee` · P3b `136222f` · QA `4c654c8`.
- **Deferred:** Phase 4 report-on-stage (dusk, stall markers as click-through fixes, hanko grade stamp);
  wrong-holder placement consequences (engine work); pawn at-rest name legibility at the pre-dawn zoom
  (hover/click covers it); guests on the plan stage.
