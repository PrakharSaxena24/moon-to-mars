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

## 9. Scoring — Efficiency + the 8 categories (採点)
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
**Concept: COMPLETE. Implementation: MVP SHIPPED 2026-07-02. Layer 0 "Living Harbor" SHIPPED 2026-07-03.**
All §12.6 phases done at `/Users/tanakai/aibos/OgasawaraSim`. The engine is headless-verified (`node verify.js`,
**91 checks**: the classic gradient D→A, the fishday temporal block — gappy = 8/D, 91% efficiency, 220 idle min,
2 wrong-fish, dinner 18:30; all fixes = 100/A, 100%, zero idle, dinner 18:00 — plus the Layer 0 cosmetic-helper
block) and DOM-verified. §13 contingency branches and Layers 1–4 (§16) remain the backlog.

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
