# Plan-on-the-Harbor — the stage becomes the planning surface

**Status (updated 2026-07-11): SHIPPED — see the matching CLAUDE.md as-built section.** Original status: APPROVED (owner 2026-07-10: "proceed to build"). Design source: the Fable one-stage architecture
verdict (2026-07-10) with its two locked amendments — (1) the persistent spine is the LEDGER RAIL + the cast,
not the map pixels: day editors and finance stay panel-shaped, anchored to the stage; (2) no fake depth —
binary decisions get **snap-to-valid one-move placement** with teaching rejection copy, never wrong-target
consequences. Scope = the unifier's Phase 3 only; report-on-stage (dusk/stall-markers/hanko stamp) stays
deferred (Phase 4).
**Constraints (absolute):** no build/libs, vanilla ES5, engine.js + verify.js untouched (258/258 stays),
EN/JP parity, deterministic, reduced-motion + touch + keyboard parity SHIP WITH this (not after). Live mode
byte-unchanged. Placements are instant; the plan clock is frozen — no "planning takes time" mechanics, ever.

---

## 1. The plan stage (setup becomes stage-first)

`#setup` gains a full-width **plan-stage panel** above everything: its own `<canvas id="plan-stage">`
(~46vh), rendered with `PRS_STAGE.scene()` using the vignette's proven fake-sim pattern (`vigStillSim`-style
static minute-sim at **04:00 pre-dawn**, distinct sky, pawns at home stations with the Phase-1 idle gestures
via a lightweight local rAF loop — same lifecycle guardrails as the vignette: one handle, killed on every
screen exit, RM = one static frame). A **mode chip** reads "Planning · 計画中" where the run clock would sit.
Pawns on the plan stage are hover/click-inspectable via the existing `#pawn-card` (degraded card: name, role,
duties, currently-assigned seat). The rail column stays exactly as Phase 1 built it; the tense line is the
mode signal in the rail. Entering setup targets `initStage` at `#plan-stage`; entering run re-targets `#stage`
(the `buildSitemap` re-init that the vignette already relies on).

## 2. The command tray — decisions become objects you hand to people

A tray docks along the stage's bottom edge (RTS command-card position), holding one object per unresolved
frame decision plus the duty chips. **The grammar rule (shown once as a hint line): "You never move people —
you hand things to them."** Objects exist only in plan mode; pawns are never draggable anywhere.

| Object | i18n name (EN/JP) | Decision (det) | Valid target | Writes |
|---|---|---|---|---|
| 🚩 abort flag | Abort authority / 中止権限の旗 | safety | Safety Lead pawn | `applyReceiptFix('safety', true)` |
| 🖃 hanko seal | Budget seal / 予算の判子 | budgetAuth | Budget Lead pawn | `applyReceiptFix('budgetAuth', true)` |
| 🎫 ferry card | Ferry info card / 船便情報カード | info | any glowing recipient pawn (one drop completes the share — one decision, one move) | `applyReceiptFix('info', true)` |
| 🏥 illness route | Illness report route / 体調報告ルート | report | Safety Lead pawn (the clinic contact) | `applyReceiptFix('report', true)` |
| ⚖ relief token | Load relief / 負荷分散トークン | fatigue | Site Lead pawn | `applyReceiptFix('fatigue', true)` |
| 📦 shipping parcel | Return shipping / 返送手配の小包 | returnLogi | Logistics pawn | `applyReceiptFix('returnLogi', true)` |
| 💴 strongbox | Cash strongbox / 現金金庫 | reserve (+ finance) | not draggable — sits at Hinata; click opens the Mission-Control panel (sliders/spend drills stay form-shaped inside, per amendment 1); a "fill the reserve" button inside = `applyReceiptFix('reserve', true)` |
| 🎣 arrows satchel | The info arrows / 情報の矢筒 | handoffTiming | not draggable — click opens the **Fishing Day drawer** (§3); shows the +18 prize; never a one-click |
| 8 duty chips | the role names | org seats | any organizer pawn — dropping duty X on the pawn holding Y **swaps seats** (orgOv stays a bijection) | `orgOv` swap + repaint |

**Placement grammar, all three input modes (ships together):**
- **Drag:** lift an object → every valid target pawn glows gold; drop on a valid pawn = placed; drop near a
  wrong pawn = the object flies back + a **teaching rejection toast**, one function-valued key:
  `rejLine(personName, personRole, objectName, neededRole)` → "Kaito is a chef — the abort flag needs the
  Safety Lead." / 「カイトは料理長です——中止権限の旗は安全管理者に。」 Drop on empty water = silent return.
- **Tap-tap (touch):** tap object → selected + targets glow → tap a pawn (wrong pawn = same toast).
- **Keyboard:** tray objects are buttons; Enter opens a small target-picker listing the 11 pawns (valid
  first, invalid disabled with the rejection line as their description); the §18 dialog patterns apply.
- **Placed state:** a small DOM token chip rests at the target pawn's feet (absolutely positioned from the
  fig cache like the station badges, aria-labeled "Abort flag — held by Martin"). Clicking a token **returns
  it to the tray** (undo → `applyReceiptFix(det, false)`). Tray shows a count badge of unresolved objects.
- Every placement/undo repaints the receipt rows + rail (they read the same `fixed[]`), floats the +N, and
  the tray/token state re-derives from `fixed[]` — the tray is a VIEW of the plan, never a second store.

## 3. Day drawers — the timeline editors anchor to the stage

Clicking a day tab (arrival/ops/fishday/return) slides a **bottom drawer** (~85vh) up over the stage,
hosting that day's existing deck→arrange→connect editor **byte-unchanged inside** (the current `#fd-card`
DOM subtree moves into the drawer container; all ids/handlers intact; a re-fit call on open handles sizing
and `fd-scroll`). The ledger rail stays visible beside the drawer; committing an arrow floats "+N" onto the
rail exactly as today. Close = drawer handle, Escape (top-layer rules), or re-clicking the active tab.
The whole-trip tab closes any drawer — the stage IS the whole-trip surface. Below 760px the drawer is
full-width over everything. Focus moves into the drawer on open and restores on close.

## 4. The "All settings" fallback (the reversibility clause)

The Phase-1 receipt rows, org chart, resources and spend-drill cards remain COMPLETE below the stage in a
collapsible **"All settings / 詳細設定"** section — collapsed by default ≥1180px, expanded below. Everything
the tray can do, the fallback can do (they write the same paths); a player who never touches the tray loses
nothing. This is also the promoted retreat path if playtests reject the stage-plan mode.

## 5. Mode legibility contract

Five signals, one grammar: (1) draggable things exist only in plan mode and are only objects/chips, never
pawns; (2) the tray's presence IS the mode (absent in run/report); (3) sky + mode chip ("Planning · 計画中"
vs the running clock); (4) the rail header's tense ("Projected → aim" vs live vs "Final"); (5) cursor:
objects show grab, pawns always show the inspect pointer. The hint line under the tray teaches the grammar
once; a dismissed hint stays dismissed (localStorage).

## 6. Screen-state consolidation (prerequisite, minimal)

Before any of the above: the scattered `classList` show/hide of {intro, setup, run, report} × {live, morning}
consolidates into one `enterScreen(name)` helper that all existing call sites delegate to — mechanical, zero
behavior change, every §18 mode-aware button preserved. This is the unifier's named prerequisite; the plan
stage's canvas lifecycle hangs off it (kill/boot on screen transitions, like the vignette).

## 7. Testing & i18n

Engine untouched → verify stays 258/258 (incl. i18n parity with ~22 new keys: 9 object names, tray title +
count, mode chip, grammar hint, `rejLine(…)`, target-picker title, drawer open/close labels, allSettings,
token aria pattern). Integration E2E (ephemeral): tray drag-place-undo for each object; wrong-target toast
text; tap-tap path; keyboard target-picker; ferry-card multi-recipient glow; duty-chip seat swap reflected
in the org chart fallback; strongbox → finance panel → reserve fix; satchel → fishday drawer; drawer
open/edit-arrow/+N-on-rail/close/focus-restore; whole-trip tab closes drawers; receipt/rail/tray three-way
sync after mixed edits; Live mode untouched (win path still green); RM (static stage, no glow animation,
toast persists); 390px touch; JP full pass.

## 8. Out of scope

Report-on-stage (Phase 4); wrong-holder simulation consequences (engine work, deliberately backlogged);
moving the finance sliders out of their panel; guests on the plan stage; any change to Live mode, the
engine, or the scoring constitution.
