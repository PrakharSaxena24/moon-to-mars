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

**New — the representative fishing day (Day 3, whole-hour block planning).** The heart of the game is the
**temporal information axis**: information is only useful if it reaches *the right person
before their task starts*. On the fishday editor you arrange task blocks on a **whole-hour grid** across per-person lanes
and **draw every information handoff as an arrow** (who → whom, sent when, on which channel —
face-to-face +0 · radio +1 · phone +2 · chat +10 · notice board +30 minutes). An arrow that
was **never drawn** makes the crew guess (wrong fish → the galley reworks dinner 🔁); an arrow
that lands **late** makes them idle (手待ち ⏳) and the delay cascades 港→船→食堂 all the way
to dinner time. The run pauses at **checkpoints** (07:00 / 12:00 / 18:00) to inspect every
member — what they hold, what they wait on — and optionally hand a card over on the spot
(which rescues *this* run but leaves the plan gap in place). Beside the grade sits
**Efficiency %** — a plan can be "sound" yet still waste everyone's time.

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

---

## 🔁 The loop / 基本フロー
1. **Choose a learning level** — **Learn** guides the Live experience; **Practice** and
   **Challenge** begin Plan First and require a diagnosis before Run. Challenge adds a deterministic
   at-sea communications outage and opens Fishing Day with one phone relay that needs a feasible
   fallback; leaving Challenge restores the underlying normal plan unchanged.
2. **Read the plan** — the Ogasawara event is pre-built (canvas, org & roles, 10-day timeline).
   The team is **8 AIBOS organizers + 3 chefs/cooking staff** who run it, with **13 hosted guest records** in the planning envelope.
3. **Choose a day** — rehearse **Day 0 (hotel → Takeshiba)**, **Days 0–1 (Ogasawara-maru)**,
   **Day 1 (Chichijima transfer → Hahajima/Hinata)**, **Days 2–9 (Operations)**, **Day 3 (Fishing day, whole-hour blocks)**,
   or **Day 10 (Return)** one at a time, or run the **whole trip**.
4. **Close the gaps** — the demo opens gappy on purpose: **7 classic frame gaps** (ferry-time
   sharing, safety abort-authority, meals budget authority, illness report route, site-lead
   deputy/load, cash reserve, return shipping & headcount), **Arrival shipped half-cleared**
   (half its required tasks unplaced), and — the heaviest lesson — **9 of the fishing day's 14
   information arrows withheld**, including 3 of the 4 riskable "wrong fish" handoffs and one
   tackle-list arrow sent late on a slow chat channel.
5. **Predict, then run** — Practice and Challenge ask for the expected root cause and evidence from
   the plan. Watch the site map; gaps make crews pile up at a zone and show the reason.
   Fishing Day is authored in whole-hour blocks; its deterministic rehearsal retains detailed wait and delivery evidence and pauses at checkpoints for inspect / intervene.
6. **Review and explain** — compare the prediction with the first modeled evidence, explain why a
   repair addresses the causal chain, and name where the pattern could transfer to another project.
   The report also shows the day's grade (its slice of the trip-wide 100), the itemized **Score Ledger**,
   **trip Efficiency % + idle/rework minutes + dinner time** (fishing day), per-person values,
   and a fix-pack.
7. **Fix & re-run** — apply a fix and re-run that day; the plan score climbs toward 100, day by day.

The learning level is separate from the existing Live / Plan First application mode and is saved
on this device. The most recent five completed attempts are also stored locally; no learner text is
sent anywhere or used by the simulator's score. / 学習レベルと直近5回の振り返りは、この端末内だけに保存されます。

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

**Grade gate.** `A` requires **total ≥ 90 AND clean** — *clean* means every atom sits at its max,
no classic problem detector is live, and no authorable-day readiness gap remains (including custody
or overload). Score ≥ 90 with one surviving gap shows its true
number with the A withheld, e.g. `97 · B — an A requires zero known gaps.` There's no hidden cap
anymore — the number on screen is the number you earned.

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
├─ app.js       wires PRS + PRS_STAGE + i18n to the DOM (setup / run / report / fix-and-rerun)
├─ verify.js    Node-only headless test of the teaching curve (not loaded by the page)
├─ CLAUDE.md    the concept + build plan — authoritative design doc
├─ WORLD.md     the roster's real names & story (AEGIS/AIBOS cast, sponsor, ships)
├─ docs/superpowers/   scoring specs & plans behind the scoreTrip rubric (design history)
├─ README.md
└─ archive/moon_to_mars/   the earlier "Moon → Mars" prototype (kept, not loaded)
```

`engine.js` is deterministic (seeded RNG) and runs in the browser **and** Node, so the
teaching curve is **headless-verified**: `node verify.js` (431/431 checks passed) pins the atom count (99),
both matrix axes (bucket totals 11/10/11/12/13/**34**/9 across frame · load · voyage · arrival ·
ops · **fishing day** · return, dimension totals **37**/29/21/7/5/1 for info/exec/safety/quality/
money/people), that earned atoms always sum to the shown total, the exact seed scores below, a
monotone fix ladder, carryover purity (everything aboard = byte-identical days; a missing jig
case stalls the fishday gear check), a battery of constructed edge cases (withheld-A, skip-a-fix,
drawn-but-late, redundant-arrow, collapsed-socket, decoy/overlap/dep-broken/compressed), and
full EN/JA i18n parity, execution-readiness separation, channel feasibility, and the deterministic
communications-outage scenario. Verified seed curve:

```
gappy plan                          D    52 /100   trip efficiency  86%
  bucket earned → frame 0 · load 5 · voyage 8 · arrival 5 · ops 11 · fishday 15 · return 8
  +applyDayFix(Arrival)             +7
  … classic fixes + authoring the other coarse days raise it step by step, monotonically …
+fixHandoffs (draw every fishing-  +16 — the single largest jump of any individual fix
 day information arrow)
canonical (every classic fix +      A   100 /100   clean · trip efficiency 100%
 every arrow + every authored day)
```

`engine.js` は決定的（シード乱数）でブラウザでも Node でも動き、学びの曲線を `node verify.js`
（431/431チェック合格）で検証済み：ギャップだらけの計画は52点・D（旅程効率86%）、情報の矢印を描く修正
（+fixHandoffs）が単独最大の+16点、全修正で100点・A・clean（旅程効率100%）。同一シードで
同一結果を再現。

---

## 🗺️ Scope (Teaching MVP) / 範囲
This is the original simulation MVP plus its **Teaching MVP** learning layer: the fishday temporal layer
(CLAUDE.md §12) and the whole-trip **scoreTrip** ledger (CLAUDE.md §23): the guided Ogasawara
rehearsal, eight problem detectors mapped to character behaviors, all six campaign segments authorable
(with Day 3 on a whole-hour grid in the shared timeline + info-arrow editor),
six route-aware physical scenes plus a Whole Trip overview, checkpoints with intervene, trip Efficiency %, the 99-atom
Score Ledger, the Learn/Practice/Challenge curriculum, prediction/debrief/history, execution-readiness
contract, channel feasibility, and one deterministic communications-outage challenge.

**Explicitly deferred:** a multi-scenario resilience score; storm, low-catch, unavailable-principal,
spoilage and allergy branches; person-skill/stamina assignment effects; a second transfer simulation;
instructor dashboards or network storage; AI task/risk generation; post-execution comparison; and
Word/PDF/Excel execution-pack export.

> Built from the spec `シミュレーション型プロジェクト管理ゲーム_アプリ概要書_v1.0`. The on-screen
> report stands in for the spec's "最終実行パック" (final execution pack) in this demo.
