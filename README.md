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
3. **Close that day's gaps** — eight decisions ship intentionally missing (the demo opens gappy):
   ferry-time sharing (arrival), safety abort-authority, meals budget authority, illness report route,
   site-lead deputy/load (operations), cash reserve, return shipping & headcount (return), and the
   **fishing-day info handoffs** (two menu arrows undrawn + a tackle list sent late on a slow channel).
4. **Run that day** — watch the site map; gaps make crews pile up at a zone and show the reason.
   The fishing day runs minute-by-minute with checkpoint pauses for inspect / intervene.
5. **Review** — the day's grade + tasks, an overall 8-category trip score, **Efficiency % + idle/rework
   minutes + dinner time** (fishing day), per-person values, and a fix-pack.
6. **Fix & re-run** — apply a fix and re-run that day; the score climbs toward 100, day by day.

---

## 🧩 What it teaches / 学び
**Responsibility ≠ authority ≠ information.** A task needs an owner *and* a deputy, the
authority to decide/pay/abort, the right info in the right hands, a budget route, and a
report path. Miss any one and capable people still stall — and the rehearsal makes that
visible *before* the real event. 責任・権限・情報は別物。どれか一つ欠けても人は止まる。

---

## 🏅 Scoring / スコアリング (spec §16)
Eight categories, computed deterministically — every deduction is tied to a named gap:

| Category | Max | カテゴリ |
|---|---|---|
| Goal achievement | 20 | 目的達成度 |
| Schedule | 15 | スケジュール |
| Roles & authority | 15 | 役割・権限 |
| Info & comms | 15 | 情報・報連相 |
| Budget & resources | 10 | 予算・資源 |
| Safety & risk | 10 | 安全・リスク |
| Quality & satisfaction | 10 | 品質・満足度 |
| Team health | 5 | チーム健康度 |

A clean plan (no gaps, everyone moves) earns an **A**. `A ≥ 90 · B ≥ 75 · C ≥ 60`. The
report also shows the six **individual performance values** (spec §17): 行動可能度 /
判断可能度 / 負荷指数 / 疲労値 / 連携値 / 貢献値 — treated as project-state values, not
personnel evaluations.

---

## 📁 Files / ファイル構成
```
OgasawaraSim/
├─ index.html   screens (canvas/editors → site map + dashboard → report)
├─ style.css    calm light business theme + site map + character states
├─ engine.js    window.PRS — deterministic sim: data model, detectors, scoring (no DOM)
├─ i18n.js      all EN/JP strings (full parity)
├─ app.js       wires PRS + i18n to the DOM (setup / run / report / fix-and-rerun)
├─ verify.js    Node-only headless test of the teaching gradient (not loaded by the page)
├─ README.md
└─ archive/moon_to_mars/   the earlier "Moon → Mars" prototype (kept, not loaded)
```

`engine.js` is deterministic (seeded RNG) and runs in the browser **and** Node, so the
teaching gradient is **headless-verified**: `node verify.js` (53 checks) asserts the gappy
Ogasawara plan grades **D**, each fix removes its detector and raises its category, the
fishday temporal block behaves (gappy → 220 idle min, 2 wrong-fish events, 91% efficiency,
dinner 18:30; fixed → zero idle, 100%, dinner 18:00; a task's idle is the **max** of its late
inputs, never the sum), and the same seed reproduces the same score. Verified gradient:

```
gappy          D   8 /100  gaps=8
+setSafety     D  25 /100  gaps=7
+grantAuth     D  35 /100  gaps=6
+shareInfo     D  40 /100  gaps=5
+setReport     D  43 /100  gaps=4
+rebalance     D  52 /100  gaps=3
+fixReserve    D  57 /100  gaps=2
+setReturn     C  64 /100  gaps=1
+fixHandoffs   A 100 /100  gaps=0   ← the temporal information axis is the last, biggest lesson
```

`engine.js` は決定的（シード乱数）でブラウザでも Node でも動き、学びの勾配を `node verify.js`
で検証済み：ギャップだらけの計画はD、各修正で対応カテゴリが上昇、全修正できれいなA(100)、同一シード
で同一スコアを再現。

---

## 🗺️ Scope (MVP) / 範囲
This is the **MVP** the spec recommends starting from (§24) plus the fishday temporal layer
(CLAUDE.md §12): the guided Ogasawara rehearsal, eight problem detectors mapped to character
behaviors, the minute-level representative fishing day with the timeline + info-arrow editor,
checkpoints with intervene, Efficiency %, the 8-category score + individual values, and the
on-screen improvement pack. **Out of scope** (spec Phase 2/3 & CLAUDE.md §13): NO-GO/abort
branches, low-catch resilience, channel outages, seasickness deputy handover, spoilage clock,
AI task/risk generation, replay timeline, post-execution comparison, and Word/PDF/Excel export.

> Built from the spec `シミュレーション型プロジェクト管理ゲーム_アプリ概要書_v1.0`. The on-screen
> report stands in for the spec's "最終実行パック" (final execution pack) in this demo.
