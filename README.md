# Ogasawara Rehearsal · 実行前シミュレーター

A browser game that **rehearses a project before you run it**. You set the plan — roles,
authority, information, budget and report routes — press **Run**, and a small crew rehearses
the real **小笠原 (Ogasawara) 10-day / 24-person** company fishing trip on a site map
(8 organizers + 3 chefs + 13 hosted guests). Where the plan has a gap, the characters
**pile up and show why**: ❓ hesitating, 💬 endless huddle, ⏳ waiting on approval or info,
🔁 redoing work, 😣 exhausted, 🔥 in crisis. Every stall is **computed from the plan, never
random**. Fix the gaps, re-run toward 100.

You play the **AIBOS rehearsal lead**, commissioned by AEGIS to prepare the team before anyone
travels. The mission is larger than a clean schedule: bring all 24 people home safely, care for
the hosted guests, strengthen the relationship, and help the team learn without blaming a person
for a system-design failure.

**New — The Hikone Morning / 彦根の朝.** A separate recommended first-play tutorial starts
outside Ryokan Izumi in Yokkaichi. Watanabe-san arrives in his own car and asks two other
travelers to prepare six known items before he drives them to Lake Biwa in Hikone. The learner
turns a `12 / 0` serial queue into two visible parallel owner lanes, checks the loaded trunk, and
sees the same preparations arrive at the lake. It has its own full-viewport page, state, freshwater
visual identity, bilingual copy, keyboard/tap path, and reduced-motion treatment; it does not alter
the Ogasawara campaign or its score. The durable implementation handoff is
[`docs/superpowers/plans/2026-07-21-hikone-tutorial.md`](docs/superpowers/plans/2026-07-21-hikone-tutorial.md).

**New — the representative fishing day (Day 3, whole-hour block planning).** The heart of the game is the
**temporal information axis**: information is only useful if it reaches *the right person
before their task starts*. On the fishday editor you arrange task blocks on a **whole-hour grid** across per-person lanes
and **draw every information handoff as an arrow** (who → whom, sent when, on which channel —
face-to-face +0 · radio +1 · phone +2 · chat +10 · notice board +30 minutes). An arrow that
was **never drawn** makes the crew guess (wrong fish → the galley reworks dinner 🔁); an arrow
that lands **late** makes them idle (手待ち ⏳) and the delay cascades 港→船→食堂 all the way
to dinner time. The run pauses at **checkpoints** (07:00 / 12:00 / 18:00) to inspect every
member — what they hold, what they wait on — and optionally hand a card over on the spot
(which rescues *this* run but leaves the plan gap in place). Beside the plan-mastery score sits
**Efficiency %** — a plan can be complete yet still waste everyone's time.

**New — the whole voyage is the game.** The campaign now starts at a nearby Tokyo hotel on
**Day 0**. Breakfast is at the hotel (time unconfirmed); the group leaves at the confirmed
**10:00**, transfers to Takeshiba, and boards the **Ogasawara-maru** for its confirmed
**11:00** departure. The long-haul crossing takes about one day to Chichijima. There the
group changes to a separate inter-island vessel—whose name and connection times are left
explicitly unconfirmed—for the final leg to Hahajima and Hinata. The outbound main guests are
**Watanabe, Nagatani, Kadou, and Maeda**; each needs a dedicated buddy aboard during Days 0–1 for
four care tasks: Starlink registration on their phone via the company credit card, lunch escort,
dinner escort, and next-morning breakfast escort. Custody mistakes **carry over across both ship handovers**: a jig
case omitted in Tokyo or lost at the Chichijima transfer stalls the fishing-day gear check.
The Day-6 roster exchange is known by name, but its route, timing, and luggage handoff are still
unconfirmed. The return rehearsal uses the reverse route, clearly labeled as an inference with no
claimed timetable. There's also an
ambient **sound layer** (surf, wind, an engine hum aboard, a freeze bell, the hanko *thock*)
behind a 🔊 header toggle — muted by default, and the game never depends on it.
The stage follows six physical identities: Tokyo hotel → Takeshiba terminal → Ogasawara-maru →
Chichijima transfer → unnamed inter-island vessel → Hahajima/Hinata.

The main-guest rotation is explicit and inclusive: **Days 0–5 — Watanabe, Nagatani, Kadou,
Maeda; Days 6–10 — Watanabe, Nagatani, Yamate, Saito.** This four-person priority roster is
separate from the existing 13-person hosted-guest planning/headcount envelope.

**New — cluster-first planning and clean-plan mastery.** Plan First now opens on seven expandable
planning clusters, not a wall of tasks: **Trip Frame 11 · Load & Board 10 · Outbound Voyage 11 ·
Arrival 12 · Operations 13 · Fishing Day 34 · Return 9 = 100**. A collapsed cluster shows its exact
earned/max contribution, mastery state, and root count. Expand it to see each causal root, affected tasks/cards/items,
the human consequence, points unavailable, and **Open plan**. That action—and every report-side
**Take me there** action—opens the exact authoring target: a standing decision, budget line, role,
guest buddy, custody checkbox, task block, information socket, or drawn arrow. Clustering changes
only how evidence is explained; it never changes the 99-atom score.

**100 / 100 means mastery of the clean modeled plan.** It is neither a personnel grade nor a claim
that the real trip is ready. A known modeled gap now costs an existing score atom, and the UI marks
the whole plan mastered only when all seven clusters are full and no causal root remains. There are
no player-facing score-granting auto-fixes: **Take me to the next issue**, **Take me there**, and
**Take me to the first issue** only navigate and focus; the learner must make the authoring change.
Load, Arrival, and Return expose the physical custody chain directly, with per-handover item
checkboxes that must remain complete across the route.

**New — safe sessions, faster runs, and a real Day-3 choice.** Plan First autosaves a versioned local
authoring record. The Plan menu offers explicit **Resume**, confirmed **New rehearsal**, and JSON
**Export/Import**; opening a link never surprise-resumes or starts a run, and invalid, incompatible,
oversize, or partially writable imports are rejected without replacing the visible plan. **Reset
rehearsal** also asks before clearing every authoring surface. Authored
runs default to **Event beats**—starts, handoffs, stalls, recoveries, and outcomes—while skipping
empty clock steps; **Full clock** replays every step with the same deterministic result. Fishing Day's
food/allergy root has three mastery-valid strategies: one fast direct delivery, a delegated two-hop
relay, or two independent redundant paths. They clear the same scored socket but expose different
time margin, coordination work, and failure tolerance.

**新機能 — クラスタ中心の計画と、クリーンな計画のマスタリー。** Plan First は、タスクを一度に
並べる代わりに、**旅行全体 11・積込／乗船 10・往路船上 11・到着 12・運営 13・釣行日 34・
帰着 9 = 100点**の7クラスタから始まります。クラスタを開くと、根本原因、影響を受ける
タスク／情報／物品、人への影響、失う点数が表示され、**計画を開く**で該当する判断・予算・
役割・ゲスト担当・現物引継ぎ・タスク・情報ソケット・矢印へ直接移動します。クラスタ化は
説明方法だけを変え、99個の採点項目は変えません。**100/100 はクリーンなモデル計画の
マスタリー**であり、人事評価でも実旅行の実行準備完了でもありません。自動修正で得点は
入りません。案内ボタンは該当箇所へ移動するだけで、修正は学習者が行います。

Plan First の作成状態はバージョン付きで端末内に自動保存され、明示的な**再開・新規
リハーサル・JSON書出し／読込み**を利用できます。リンクを開いただけで自動再開／自動実行
せず、不正・非互換・容量超過・保存失敗の読込みは現在の計画を置き換えません。実行は標準で
開始・受け渡し・停止・回復・結果だけを進める**重要イベント**表示、必要なら同じ結果の
**全時刻**表示を選べます。3日目の食材／アレルギー情報には、最速の直接伝達、2段階の委任
リレー、独立した二重経路という、時間余裕・調整作業・障害耐性の異なる3つの有効解があります。
直接伝達は04:45到着・余裕15分・送信1回、委任リレーは04:52到着・余裕8分・送信2回／中継1段、
無線＋電話の二重経路は最速04:46到着・余裕14分・送信2回で片方の経路障害に耐えます。3案とも
同じ根本原因を解消し、同じ100点マスタリーへ到達できます。

> 止まったキャラクターは、失敗した社員ではない。止まった場所こそが、計画を直すべき場所である。
> The stalled character isn't a failed employee — the place they stalled is the place to fix the plan.

実行前に計画を仮想実行し、人が止まる場所＝計画の弱点を見つけるアプリ。役割・権限・情報・予算・報告
経路を設計して「実行」を押すと、小笠原10日間イベントをキャラクターがリハーサルする。弱点があると
キャラクターが迷い・合議・確認待ち・疲労・炎上で止まる（すべて計画データから計算）。ギャップを直し、
再実行で100点へ。

---

## ▶️ Run / 実行方法
Open **`index.html`** in any modern browser. No build, no install, no server, no account —
fully offline. / **`index.html`** をブラウザで開くだけ。ビルド・インストール・サーバー・
アカウント不要。完全オフライン。

The standalone first-play tutorial can also be opened directly at **`hikone.html`**. /
独立した初回チュートリアルは **`hikone.html`** から直接開けます。

---

## 🔁 The loop / 基本フロー
1. **Choose a learning level** — **Learn** guides the Live experience; **Practice** and
   **Challenge** begin Plan First and require a diagnosis before Run. Challenge adds a deterministic
   at-sea communications outage and opens Fishing Day with one phone relay that needs a feasible
   fallback; leaving Challenge restores the underlying normal plan unchanged.
2. **Start safely** — begin fresh or explicitly resume/import a saved authoring session. Plan edits
   autosave locally; opening the app never auto-runs or silently replaces the fresh plan.
3. **Read the clusters** — the Ogasawara event is pre-built (canvas, org & roles, 10-day timeline).
   The seven collapsed clusters show exact contributions to 100, mastery state, and root count instead
   of exposing every task at once; expanding one reveals its causal roots. The team is **8 AIBOS organizers + 3 chefs/cooking staff** who run it,
   with **13 hosted guest records** in the planning envelope.
4. **Open a phase** — rehearse **Day 0 (hotel → Takeshiba)**, **Days 0–1 (Ogasawara-maru)**,
   **Day 1 (Chichijima transfer → Hahajima/Hinata)**, **Days 2–9 (Operations)**, **Day 3 (Fishing day, whole-hour blocks)**,
   or **Day 10 (Return)** one at a time, or run the **whole trip**.
5. **Close the gaps manually** — the demo opens gappy on purpose: **7 classic frame gaps** (ferry-time
   sharing, safety abort-authority, meals budget authority, illness report route, site-lead
   deputy/load, cash reserve, return shipping & headcount), **Arrival shipped half-cleared**
   (half its required tasks unplaced), and — the heaviest lesson — **9 of the fishing day's 14
   information arrows withheld**, including 3 of the 4 riskable "wrong fish" handoffs and one
   tackle-list arrow sent late on a slow chat channel. Navigation hints focus the right editor but
   never write the scored answer. Custody is authored item by item at each physical handover.
6. **Choose a food route** — direct-fast reaches the chef at **04:45** with **15 min** margin and one
   transmission; delegated relay reaches at **04:52** with **8 min** margin, two transmissions, and
   one real relay step; redundant radio + phone reaches first at **04:46** with **14 min** margin,
   two transmissions, and tolerance for one path failure. All three can reach the same mastery result.
7. **Predict, then run** — Practice and Challenge ask for the expected root cause and evidence from
   the plan. Watch the site map; gaps make crews pile up at a zone and show the reason. Event beats
   are the default; Full clock is optional. Fishing Day retains detailed wait/delivery evidence and
   pauses at checkpoints for inspect / intervene.
8. **Review and explain** — compare the prediction with the first modeled evidence, explain why a
   repair addresses the causal chain, and name where the pattern could transfer to another project.
   The report also shows the day's mastery contribution (its slice of the trip-wide 100), the itemized **Score Ledger**,
   **trip Efficiency % + idle/rework minutes + dinner time** (fishing day), per-person values,
   and a condensed fix-pack. Open a cluster root or use **Take me there** on a report issue to return
   to the exact authoring target.
9. **Fix & re-run** — make the change and re-run that phase; the plan score climbs toward clean-plan
   mastery at 100.

The authoring autosave, learning level, and most recent five completed attempts stay on this device;
no learner text is sent anywhere or used by the simulator's score. Live / Plan First and the learning
level remain separate state. / 計画の自動保存、学習レベル、直近5回の振り返りはこの端末内だけに
保存されます。学習者の文章は送信されず、採点にも使われません。Live / Plan First と学習レベルは
別々の状態です。

---

## 🧩 What it teaches / 学び
**Responsibility ≠ authority ≠ information.** A task needs an owner *and* a deputy, the
authority to decide/pay/abort, the right info in the right hands, a budget route, and a
report path. Miss any one and capable people still stall — and the rehearsal makes that
visible *before* the real event. 責任・権限・情報は別物。どれか一つ欠けても人は止まる。

---

## 🏅 Scoring / スコアリング — the scoreTrip ledger
Every point is a **named, checkable thing you did or didn't do**. `window.PRS.scoreTrip(plan)`
prices the whole trip — Tokyo departure to Tokyo return — as **99 atoms**, each worth a fixed
1–3 points, summing to **exactly 100** — no category weighting, no rounding. It reads as
a receipt, not a curve.

The same 100 points slice two ways, both exact:

| Bucket (where) | Max | 区分 |
|---|---|---|
| Trip frame | 11 | 旅行全体の枠 |
| Load & Board (Day 0, Tokyo) | 10 | 積込・乗船 |
| Outbound Voyage (Days 0–1, aboard) | 11 | 船上 |
| Arrival (Day 1) | 12 | 到着日 |
| Operations (Days 2–9) | 13 | 運営日 |
| Fishing day (Day 3, whole-hour blocks) | 34 | 釣行日 |
| Return — Pack & Sail (Day 10) | 9 | 帰着日 |

| Dimension (what) | Max | 観点 |
|---|---|---|
| Information (the handoff arrows) | 37 | 情報 |
| Execution (tasks placed & staffed) | 29 | 実行 |
| Safety (gates & authority) | 21 | 安全 |
| Quality | 7 | 品質 |
| Money | 5 | 予算 |
| People | 1 | 人 |

Fishing day is the heaviest bucket and Information the heaviest dimension — clocked information,
not raw task completion, is this game's thesis, so it's priced that way.

**Mastery gate.** **100 / 100 = mastery of the clean modeled plan.** The cluster UI requires all
seven exact maxima and no surviving causal root before it says Mastered. *Clean* means every positive
atom sits at its max, no decoy debit is live, no classic problem detector is live, and no authorable-day
readiness gap remains. Anything below 100 is shown as progress toward mastery, without a player-facing
letter grade or hidden numeric cap. The current constitution also binds every newly explicit modeled
requirement to an **existing** atom, without changing 99 atoms or 100 points:

- the Frame's existing two-point critical-information gate requires both hospital access and ferry/
  connection sharing;
- Load's hold gate, Arrival Logistics' execution lane, and Return Site Lead's execution lane require
  complete physical custody at their respective handovers;
- Return Logistics' existing execution lane requires a named owner for ship-out/headcount work;
- each outbound guest's existing care atom fails when the assigned buddy is double-booked; and
- required flex/standby work is covered by the existing Load headcount, Voyage watch, or Fishing-Day
  sea-watch safety atom instead of becoming an unscored loophole.

Player-facing help never awards those points. It expands a causal root or moves focus to its editor;
mastery is earned only by an explicit planning choice, task/arrow edit, buddy assignment, or custody
selection.

**Two headlines, deliberately different questions.** **Score** (`scoreTrip`) asks *is the plan
sound* — causes, plan decisions. **Efficiency** (`tripEfficiency`) asks *does it waste anyone's
time* — effects, wasted minutes across the six modeled campaign segments. One fault (a late info arrow) can
dock both — the Score row, because information has a clock, and Efficiency, because of the idle
minutes it caused — but never twice inside a single number.

There is a third, deliberately separate question: **is the real trip ready to execute?** A
`100 / A / clean` plan completes the modeled rehearsal, but it is not real-world ready while
critical owner-supplied facts remain unconfirmed: the Tokyo-hotel breakfast time, the inter-island
vessel identity, the Chichijima connection timetable, the Day-6 guest-exchange route/timing/luggage
handoff, and the return timetable. These facts do not invent score deductions;
`executionReadiness(plan)` reports them beside the rehearsal result.

The report renders an itemized **Score Ledger**: bucket → dimension → atom, each row a name, a
status chip (OK / Missing / Late / Partial 部分点 / Broken / Overlap / Compressed / Decoy), a
reason (迷い "never specified" / 手待ち "arrived late" / on time), and earned/max points. The
report also still shows six **conditions experienced by each role/member** (spec §17): 行動可能度 /
判断可能度 / 負荷指数 / 疲労値 / 連携値 / 貢献値 — treated as project-state values, not
personnel evaluations.

---

## 📁 Files / ファイル構成
```
OgasawaraSim/
├─ index.html   screens (canvas/editors → site map + dashboard → report)
├─ style.css    calm light business theme + site map + character states
├─ engine.js    window.PRS — deterministic sim, score/readiness, channel and scenario APIs (no DOM)
├─ stage.js     window.PRS_STAGE — six route-aware Canvas worlds + route overview (presentation-only)
├─ sprites.js   window.PRS_SPRITES — the SVG sprite cast (optional enhancement; game runs without it)
├─ sound.js     window.PRS_SOUND — procedural WebAudio ambience + cues (optional; muted by default)
├─ rubric.html  the public 100-point scoring framework page (renders live from engine.js)
├─ i18n.js      all EN/JP strings (full parity)
├─ app.js       wires PRS + PRS_STAGE + i18n to the DOM (plan / run / report / revise)
├─ verify.js    Node-only headless test of the teaching curve (not loaded by the page)
├─ ui-regressions.js      dependency-free UI helper probes run by verify.js
├─ visual-regressions.js  dependency-free audiovisual probes run by verify.js
├─ CLAUDE.md    the concept + build plan — authoritative design doc
├─ WORLD.md     the roster's real names & story (AEGIS/AIBOS cast, sponsor, ships)
├─ docs/superpowers/   scoring specs & plans behind the scoreTrip rubric (design history)
├─ README.md
└─ archive/moon_to_mars/   the earlier "Moon → Mars" prototype (kept, not loaded)
```

`engine.js` is deterministic (seeded RNG) and runs in the browser **and** Node, so the
teaching curve is **headless-verified** by the full `node verify.js` suite, which pins the atom count (99),
both matrix axes (bucket totals 11/10/11/12/13/**34**/9 across frame · load · voyage · arrival ·
ops · **fishing day** · return, dimension totals **37**/29/21/7/5/1 for info/exec/safety/quality/
money/people), that earned atoms always sum to the shown total, the exact seed scores below, a
monotone fix ladder, carryover purity (everything aboard = byte-identical days; a missing jig
case stalls the fishday gear check), a battery of constructed edge cases (withheld-A, skip-a-fix,
drawn-but-late, redundant-arrow, collapsed-socket, decoy/overlap/dep-broken/compressed), and
full EN/JA i18n parity, execution-readiness separation, channel feasibility, and the deterministic
communications-outage scenario. It also pins cluster conservation/root partitioning/editor targets,
the 100=mastery audit gates, and all three Day-3 food strategies. The UI quality pass separately
covers event-jump/full-clock equivalence, versioned persistence/import rejection, manual custody
authoring, navigation-only help, and exact return-to-fault behavior. Verified seed curve:

```
gappy plan                               51 /100   trip efficiency  86%
  bucket earned → frame 0 · load 5 · voyage 8 · arrival 5 · ops 11 · fishday 15 · return 7
  +applyDayFix(Arrival)             +7
  … classic fixes + authoring the other coarse days raise it step by step, monotonically …
+fixHandoffs (draw every fishing-  +16 — the single largest jump of any individual fix
 day information arrow)
canonical (every classic fix +          100 /100   mastered · clean · trip efficiency 100%
 every arrow + every authored day)
```

`engine.js` は決定的（シード乱数）でブラウザでも Node でも動き、学びの曲線を `node verify.js`
の全テストで検証済み：99項目・合計100点、7クラスタの点数保存と根本原因の分割、
100点＝クリーンな計画のマスタリー、正確な修正箇所への移動、バージョン付き保存／安全な読込み、
現物引継ぎの手動編集、重要イベント／全時刻の同一結果、3種類の食材情報経路を固定しています。
ギャップだらけの計画は51/100（マスタリー未達・旅程効率86%）、情報の矢印を描く修正
（+fixHandoffs）が単独最大の+16点、全修正で100/100・マスタリー・clean（旅程効率100%）。同一シードで
同一結果を再現。

---

## 🗺️ Scope (Teaching MVP) / 範囲
This is the original simulation MVP plus its **Teaching MVP** learning layer: the fishday temporal layer
(CLAUDE.md §12) and the whole-trip **scoreTrip** ledger (CLAUDE.md §23): the guided Ogasawara
rehearsal, eight problem detectors mapped to character behaviors, all six campaign segments authorable
(with Day 3 on a whole-hour grid in the shared timeline + info-arrow editor),
six route-aware physical scenes plus a Whole Trip overview, checkpoints with intervene, trip Efficiency %, the 99-atom
Score Ledger, the Learn/Practice/Challenge curriculum, prediction/debrief/history, execution-readiness
contract, channel feasibility, one deterministic communications-outage challenge, the seven-cluster causal
planner, safe local plan sessions, event-beat pacing, manual three-chain custody authoring, exact fault routing,
and the three mastery-valid Day-3 food-information strategies.

**Explicitly deferred:** a multi-scenario resilience score; storm, low-catch, unavailable-principal,
spoilage and allergy branches; person-skill/stamina assignment effects; a second transfer simulation;
instructor dashboards or network storage; AI task/risk generation; post-execution comparison; and
Word/PDF/Excel execution-pack export.

> Built from the spec `シミュレーション型プロジェクト管理ゲーム_アプリ概要書_v1.0`. The on-screen
> report stands in for the spec's "最終実行パック" (final execution pack) in this demo.
