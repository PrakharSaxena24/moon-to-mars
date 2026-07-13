# Ogasawara Rehearsal · 実行前シミュレーター

A browser game that **rehearses a project before you run it**. You set the plan — roles,
authority, information, budget and report routes — press **Run**, and a small crew rehearses
the real **小笠原 (Ogasawara) 10-day / 24-person** company fishing trip on a site map
(8 organizers + 3 chefs + 13 hosted guests). Where the plan has a gap, the characters
**pile up and show why**: ❓ hesitating, 💬 endless huddle, ⏳ waiting on approval or info,
🔁 redoing work, 😣 exhausted, 🔥 in crisis. Every stall is **computed from the plan, never
random**. Fix the gaps, re-run toward 100.

**New — the representative fishing day (Day 3, minute-level).** The heart of the game is the
**temporal information axis**: information is only useful if it reaches *the right person
before their task starts*. On the fishday editor you re-time task blocks on per-person lanes
and **draw every information handoff as an arrow** (who → whom, sent when, on which channel —
face-to-face +0 · radio +1 · phone +2 · chat +10 · notice board +30 minutes). An arrow that
was **never drawn** makes the crew guess (wrong fish → the galley reworks dinner 🔁); an arrow
that lands **late** makes them idle (手待ち ⏳) and the delay cascades 港→船→食堂 all the way
to dinner time. The run pauses at **checkpoints** (07:00 / 12:00 / 18:00) to inspect every
member — what they hold, what they wait on — and optionally hand a card over on the spot
(which rescues *this* run but leaves the plan gap in place). Beside the grade sits
**Efficiency %** — a plan can be "sound" yet still waste everyone's time.

**New — the whole voyage is the game.** The campaign now starts in Tokyo on **Day 0**: a
**Load & Board** morning (pack the manifest → truck to the pier → hold loading → boarding
点呼, all against the fixed 11:00 sailing — *what misses the ship cannot be fixed at sea*)
and a **Ship Day** aboard, where the 4 main guests each need a dedicated buddy who registers
Starlink on their phone via the company credit card and escorts them to ship meals. Loading
mistakes **carry over**: a jig case that never made the truck stalls the fishing day's gear
check three days later. The return is a mirrored **Pack & Sail** day home. There's also an
ambient **sound layer** (surf, wind, an engine hum aboard, a freeze bell, the hanko *thock*)
behind a 🔊 header toggle — muted by default, and the game never depends on it.

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
1. **Read the plan** — the Ogasawara event is pre-built (canvas, org & roles, 10-day timeline).
   The team is **8 AIBOS organizers + 3 contracted chefs** who run it, hosting **13 group-company guests**.
2. **Choose a day** — rehearse **Day 1 (Arrival)**, **Days 2–9 (Operations)**, **Day 3 (Fishing day,
   minute-level)**, or **Day 10 (Return)** one at a time, or the **whole trip**.
3. **Close the gaps** — the demo opens gappy on purpose: **7 classic frame gaps** (ferry-time
   sharing, safety abort-authority, meals budget authority, illness report route, site-lead
   deputy/load, cash reserve, return shipping & headcount), **Arrival shipped half-cleared**
   (half its required tasks unplaced), and — the heaviest lesson — **9 of the fishing day's 14
   information arrows withheld**, including 3 of the 4 riskable "wrong fish" handoffs and one
   tackle-list arrow sent late on a slow chat channel.
4. **Run that day** — watch the site map; gaps make crews pile up at a zone and show the reason.
   The fishing day runs minute-by-minute with checkpoint pauses for inspect / intervene.
5. **Review** — the day's grade (its slice of the trip-wide 100), the itemized **Score Ledger**,
   **trip Efficiency % + idle/rework minutes + dinner time** (fishing day), per-person values,
   and a fix-pack.
6. **Fix & re-run** — apply a fix and re-run that day; the score climbs toward 100, day by day.

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
| Ship Day (Day 0, aboard) | 11 | 船上 |
| Arrival (Day 1) | 12 | 到着日 |
| Operations (Days 2–9) | 13 | 運営日 |
| Fishing day (Day 3, minute-level) | 34 | 釣行日 |
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

**Grade gate.** `A` requires **total ≥ 90 AND clean** — *clean* means every atom sits at its max
and no classic problem detector is still live. Score ≥ 90 with one surviving gap shows its true
number with the A withheld, e.g. `97 · B — an A requires zero known gaps.` There's no hidden cap
anymore — the number on screen is the number you earned.

**Two headlines, deliberately different questions.** **Score** (`scoreTrip`) asks *is the plan
sound* — causes, plan decisions. **Efficiency** (`tripEfficiency`) asks *does it waste anyone's
time* — effects, wasted minutes across the four modeled days. One fault (a late info arrow) can
dock both — the Score row, because information has a clock, and Efficiency, because of the idle
minutes it caused — but never twice inside a single number.

The report renders an itemized **Score Ledger**: bucket → dimension → atom, each row a name, a
status chip (OK / Missing / Late / Partial 部分点 / Broken / Overlap / Compressed / Decoy), a
reason (迷い "never specified" / 手待ち "arrived late" / on time), and earned/max points. The
report also still shows the six **individual performance values** (spec §17): 行動可能度 /
判断可能度 / 負荷指数 / 疲労値 / 連携値 / 貢献値 — treated as project-state values, not
personnel evaluations.

---

## 📁 Files / ファイル構成
```
OgasawaraSim/
├─ index.html   screens (canvas/editors → site map + dashboard → report)
├─ style.css    calm light business theme + site map + character states
├─ engine.js    window.PRS — deterministic sim: data model, detectors, scoreTrip ledger (no DOM)
├─ stage.js     window.PRS_STAGE — the Canvas 2D harbor renderer (reads sim state, writes nothing back)
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
teaching curve is **headless-verified**: `node verify.js` (323 checks) pins the atom count (99),
both matrix axes (bucket totals 11/10/11/12/13/**34**/9 across frame · load · voyage · arrival ·
ops · **fishing day** · return, dimension totals **37**/29/21/7/5/1 for info/exec/safety/quality/
money/people), that earned atoms always sum to the shown total, the exact seed scores below, a
monotone fix ladder, carryover purity (everything aboard = byte-identical days; a missing jig
case stalls the fishday gear check), a battery of constructed edge cases (withheld-A, skip-a-fix,
drawn-but-late, redundant-arrow, collapsed-socket, decoy/overlap/dep-broken/compressed), and
full EN/JA i18n parity. Verified seed curve:

```
gappy plan                          D    53 /100   trip efficiency  83%
  bucket earned → frame 0 · load 5 · voyage 8 · arrival 6 · ops 11 · fishday 15 · return 8
  … classic fixes + authoring the coarse days raise it step by step, monotonically …
+fixHandoffs (draw every fishing-  +16 — the single largest jump of any individual fix
 day information arrow)
canonical (every classic fix +      A   100 /100   clean · trip efficiency 100%
 every arrow + every authored day)
```

`engine.js` は決定的（シード乱数）でブラウザでも Node でも動き、学びの曲線を `node verify.js`
（323チェック）で検証済み：ギャップだらけの計画は53点・D（旅程効率83%）、情報の矢印を描く修正
（+fixHandoffs）が単独最大の+16点、全修正で100点・A・clean（旅程効率100%）。同一シードで
同一結果を再現。

---

## 🗺️ Scope (MVP) / 範囲
This is the **MVP** the spec recommends starting from (§24) plus the fishday temporal layer
(CLAUDE.md §12) and the whole-trip **scoreTrip** ledger (CLAUDE.md §23): the guided Ogasawara
rehearsal, eight problem detectors mapped to character behaviors, all four days authorable
(hour-level Arrival/Ops/Return, minute-level Fishing day with the timeline + info-arrow editor),
checkpoints with intervene, trip Efficiency %, the 89-atom Score Ledger + individual values, and
the on-screen improvement pack. **Out of scope** (spec Phase 2/3 & CLAUDE.md §13): NO-GO/abort
branches, low-catch resilience, channel outages, seasickness deputy handover, spoilage clock,
AI task/risk generation, replay timeline, post-execution comparison, and Word/PDF/Excel export.

> Built from the spec `シミュレーション型プロジェクト管理ゲーム_アプリ概要書_v1.0`. The on-screen
> report stands in for the spec's "最終実行パック" (final execution pack) in this demo.
