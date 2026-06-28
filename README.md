# Moon → Mars · Mission Director
### 月 → 火星 · ミッション・ディレクター

A ~2-minute browser game about running a team well, framed as one repeatable
**director's loop — ① PLAN the timeline · ② ASSIGN the right specialist · ③ CHECK the
risky work · ④ STEER the leader bottleneck.** Plan it right and no one is wasted and you
reach Mars early for a grade **A**. Plan it wrong and the mission stalls — or people stand
around idle and you cap out at B.

チーム運営を学ぶ約2分のブラウザゲーム。一つの繰り返せる**ディレクターの4手——① タイムラインを計画・
② 適材を配置・③ リスク工程を検査・④ ボトルネックを統制**として設計。正しく計画すればムダな人がなく、
前倒しで火星に到達して**A評価**。誤れば任務は停滞し、人が遊び、評価はB止まり。

---

## ▶️ How to run / 実行方法

Open **`index.html`** in any modern browser. No build, no install, no internet — fully offline.

**`index.html`** をブラウザで開くだけ。ビルド・インストール・ネット不要。完全オフライン。

---

## 🧭 What you do / やること

You are the **Mission Director**. On the briefing screen you:

あなたは**ミッション・ディレクター**。ブリーフィング画面で：

1. **Read the task list.** It mixes real ROAD tasks (Survey, Haul, Foundation, Pave,
   Commission) with **unrelated busywork "decoys"** (Catalogue moon rocks, Photograph
   Earthrise, Reorganize the depot). Only road tasks reach Mars. /
   **タスク一覧を読む。** 道路タスクと、無関係な雑務（おとり）が混在。道路タスクだけが火星に届く。
2. **Build the timeline.** Put each road task in a **stage**. A task can only start once
   its **prerequisites are done**, so the order matters; independent tasks placed in the
   same stage run **in parallel**. /
   **タイムラインを組む。** 各道路タスクを**ステージ**に配置。前提条件が完了して初めて開始でき、
   依存のないタスクは同じステージで**並行実行**。
3. **Assign who does what.** There are **four roles** — **Scout** (Survey), **Hauler**
   (Haul), **Builder** (Foundation *and* Paving), **Engineer** (Commission). Put the
   matching role on each road task. /
   **誰が何をするか割り当てる。** 役割は4つ——**偵察**（調査）・**輸送兵**（輸送）・
   **建設兵**（基礎・舗装）・**技師**（検収）。各タスクに合う役割を。
4. **Checkpoint the risky tasks** (the high-risk ones make more defects). /
   **リスクのあるタスクを検査する**（高リスクほど欠陥が多い）。

During the run you can **slow it down or speed it up** (0.5× / 1× / 2×), and **tap any
worksite to open its detail panel** — its prerequisites, the crew there, and a live
item checklist (e.g. the truck's cargo manifest) ticking off as the work proceeds.

実行中は**速度調整**（0.5×／1×／2×）でき、**現場をタップ**すると詳細パネル（前提条件・
そこのクルー・進行に応じて埋まる項目チェックリスト＝例：トラックの積荷リスト）が開きます。

---

## ✅ The clean plan = grade A / きれいな計画 = A評価

An **A demands a clean plan**: every road task on its specialist, the timeline parallelized
along the critical path, nobody idle, no busywork, the risky work checked, and nothing
escaped. Any single slip caps you at **B**, so each mistake shows up exactly one grade down.

**A評価には「きれいな計画」が必要**：全道路タスクに適材、クリティカルパスに沿って並行化、手待ちなし、
雑務なし、リスク工程を検査、流出ゼロ。ひとつでも崩れると**B止まり**——ミスはちょうど1段下に表れる。

| If you… | …then |
|---|---|
| Build a **correct timeline** (prerequisites first, independent tasks in parallel) | Work flows stage to stage and finishes early — the **Speed** bonus rewards it. / 前提を先に、独立タスクは並行→前倒しで完了、**速度**加点。 |
| Schedule a task **before its prerequisites** | It **STALLS** — its crew stand idle, everything behind it stops, deadline slips → **D**. / **停止**——後続もろとも全停止、締切超過→**D**。 |
| Put every task in its **own stage** (no parallel) | Valid but **slow** — you lose the free parallel time → capped at **B**. / 有効だが**遅い**——タダの並行時間を失う→**B止まり**。 |
| Put the **right specialist** on **every** road task, nobody idle, no decoys | No one is wasted — fast, on-time, **clean A**. / 誰もムダにならず、速く・期限内・**きれいなA**。 |
| Put someone on a **decoy** (busywork) | Their effort never reaches Mars and a road task goes short → slower, "crew used" drops → **B**. / 労力は火星に届かず道路タスクが手薄→遅く・有効活用低下→**B**。 |
| Leave a road task with **no one** | That task never finishes → **mission stalls** → **D**; a single idle person caps you at **B**. / そのタスクは終わらず**停滞**→**D**；手待ち1人で**B止まり**。 |
| Put the **wrong specialist** on a task | Slow work, a flood of questions to the leader (bottleneck), and **more defects** → **B**. / 作業が遅く、隊長へ質問殺到（ボトルネック）、**欠陥増**→**B**。 |

---

## 🔍 Checkpoints — you run them / チェックポイントはあなたが実施

When a checkpointed task finishes, work pauses and **you personally run its inspection
checklist** — tap each item to find defects (✓ clean / ⚠ defect), then sign off.

検査付きタスクが完了すると作業が止まり、**あなた自身が点検チェックリストを実施**——各項目を
タップして欠陥を探し（✓異常なし／⚠欠陥）、署名する。

- **Caught** defects are cheap, local rework. / **捕捉**した欠陥は安く・その場で手直し。
- **Skipped** → defects ESCAPE to the final goal inspection, where they cost ~15× as much
  and blow the deadline. / **省く**と欠陥は最終検査まで流出し、約15倍のコストで締切超過。
- Don't inspect everything — it wastes time. Inspect where the risk is. /
  全部は検査しない（時間の無駄）。リスクのある所を。

Mismatched workers make **more** defects, so a sloppy plan needs checkpoints most.

専門違いの人ほど欠陥を多く出すため、雑な計画ほど検査が要る。

---

## ⏳ The leader bottleneck & your levers / リーダー・ボトルネックとレバー

Questions funnel to one **Commander** (one at a time). Matched specialists barely ask;
mismatches flood the line until **everything stops**. Two levers (mid-run):
**Empower** (workers self-resolve) and **Delegate** (add a 2nd Commander).

質問は1人の**隊長**に集中（同時に1人）。専門が合えばほぼ質問せず、専門違いは列を溢れさせ
**全停止**に。実行中の2レバー：**権限委譲**（自己解決）と**委任**（隊長2人目）。

Difficulty: **Easy** (clean work) · **Medium** (some defects) · **Hard** (10% of orders
ignored, many defects — checkpoint and use your levers). /
難易度：**やさしい**（きれい）・**ふつう**（欠陥少々）・**むずかしい**（指示10%無視・欠陥多数）。

---

## 📁 Files / ファイル構成

```
moon_to_mars/
├─ index.html   structure / 画面構造
├─ style.css    universe theme + animations / 宇宙テーマ＋アニメーション
├─ engine.js    pure simulation, no DOM / 純粋なシミュレーション（DOM非依存）
├─ i18n.js      all EN/JP strings / 英日の全テキスト
├─ app.js       briefing/assignment UI + render loop / ブリーフィング/配置UI＋描画ループ
└─ README.md
```

`engine.js` is deterministic (seeded RNG) and runs in the browser and Node, so the teaching
**gradient is verified by a headless multi-seed sweep**: the clean optimal plan reaches grade
**A** with crew-used ~100%; every soft mistake is capped at **B** with its failing pillar
visibly low (a decoy/mismatch drops "crew used" to ~57–70%, serial loses the Speed bonus);
and the catastrophes fail at **D** — a task before its prerequisites stalls to 0%, an
unstaffed task never finishes, and on Hard, skipping checkpoints on risky tasks fails from
escaped-defect rework while a smart plan succeeds.

`engine.js` は決定的（シード乱数）でブラウザでも Node でも動き、学びの**勾配を複数シードのヘッドレス
スイープで検証済み**：きれいな最適計画は有効活用 ~100% で **A** 評価；ソフトなミスは失敗した柱が
はっきり下がって **B** 止まり（おとり／専門違いは「有効活用」が ~57〜70% に低下、直列は速度加点を失う）；
破滅的なミスは **D** で失敗——前提前のタスクは 0% で停止、未配置タスクは未完、むずかしいではリスク工程の
検査を省くと流出欠陥で失敗、賢い計画なら成功。
