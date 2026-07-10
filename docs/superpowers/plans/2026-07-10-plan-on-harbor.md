# Plan-on-the-Harbor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec:
> `docs/superpowers/specs/2026-07-10-plan-on-harbor-design.md` — read it FULLY; it is the contract, and its
> §2 object table, §5 legibility contract, and §6 prerequisite are non-negotiable. Workers never commit,
> never leave their file/region lists, self-check only their own scope (integrator owns the full gate).

**Goal:** the setup screen becomes stage-first: a pre-dawn plan stage with a command tray of physical
decision objects (snap-to-valid, three input modes), day editors in a bottom drawer, the receipt/org/finance
cards as a collapsible fallback.

**Model allocation:** Fable = WA (the whole plan-stage/tray surface — one tightly coupled interaction
system; splitting it multiplies integration risk). Opus = WB (day drawer, worktree). Sonnet = WC (authors
the integration E2E suite from the spec, zero repo files).

## Global constraints
ES5, no libs/build; engine.js + verify.js read-only (`node verify.js` 258/258 at every hand-off); EN/JP in
one edit per key; RM/touch/keyboard parity ship WITH each surface; no Math.random/Date.now; Live mode and
the fishday editor internals byte-unchanged; placements instant, plan clock frozen.

## Ownership & pinned interfaces

| Task | Files | Key contracts produced |
|---|---|---|
| WA plan stage + tray (fable, in-place) | app.js, index.html, style.css, i18n.js — but NOT the day-tab click handler / buildDaySelect, NOT `#fd-card` internals | `enterScreen(name)` (§6, mechanical); plan-stage module `bootPlanStage()/killPlanStage()` handle `PSTG{raf,sim,cv}`, canvas `#plan-stage`, chip `#plan-chip`; tray `#cmd-tray` with `.tray-obj[data-det]` buttons; token layer `#plan-tokens` with `.plan-token[data-det]`; pawn glow halos `.pawn-halo` (DOM, fig-cache positioned); the §4 "All settings" collapsible `#all-settings`; an EMPTY drawer shell `#day-drawer > #dd-head(#dd-title,#dd-close) + #dd-body` with `#fd-card` moved permanently INTO `#dd-body` (WB animates/behaves it); i18n: objFlag/objSeal/objFerry/objRoute/objRelief/objParcel/objStrongbox/objSatchel, trayTitle, trayCount(n), planChip, grammarHint, rejLine(name,role,obj,needed), pickTitle(obj), tokenAria(obj,name), allSettings |
| WB day drawer (opus, **worktree**) | app.js (day-tab handler + new drawer module ONLY), style.css, i18n.js (append at block ends) | `openDayDrawer(seg)/closeDayDrawer()` on the WA shell: slide-up ~85vh (full-width <760px), rail stays visible ≥1180px, re-fit `buildDayGrid` on open, focus in/restore out, Escape closes only when `!topModal()` and before the pawn popover, re-click active tab closes, whole-trip tab closes; day tabs otherwise keep ALL current behavior (daySel switch, receipt filtering); i18n: ddTitle(day), ddClose |
| WC E2E author (sonnet) | `/Users/tanakai/.claude/jobs/a20427e0/tmp/e2e_plan_harbor.py` ONLY | The §7 integration suite as a runnable playwright script against the PINNED selectors above; resilient waits; prints PASS/FAIL per check + JS-error count; exits nonzero on failure |
| Integration (tech lead) | any | commit WA → 3-way apply WB → verify + smoke + WC suite → fix → commit; then 2-lens adversarial close-out, §26 docs, memory |

## WA — plan stage + command tray (steps)
- [ ] **1. `enterScreen(name)`** — §6 verbatim: one helper, all existing show/hide call sites delegate,
  zero behavior change; it is also the kill/boot point for the vignette (existing) and the plan stage (new).
- [ ] **2. The plan stage** — §1 verbatim. Reuse the vignette's fake-sim approach (study `vigStillSim`/
  `vigSyncFigs`/`vigView`); pre-dawn sky (the view's night flag + a fixed 04:00 clock); Phase-1 gestures
  animate via a local slow rAF (RM: single static frame); pawns inspectable through the existing
  `#pawn-card` degraded path; `initStage('#plan-stage')` on setup entry, `buildSitemap` re-targets on run
  entry (the vignette precedent).
- [ ] **3. The tray + objects** — §2 table verbatim, all three input modes, glow/toast/token/undo semantics,
  the tray as a pure VIEW of `fixed[]`/`orgOv` (re-derive on every repaint; no second store). Strongbox
  opens the existing Mission-Control panel; satchel opens the fishday drawer via the WB contract
  (`openDayDrawer('fishday')` — call it; WB implements it; a temporary fallback of switching the day tab is
  acceptable until merge). Duty chips swap `orgOv` seats and repaint the org fallback.
- [ ] **4. Legibility + fallback** — §5 signals (grammar hint with localStorage dismiss, cursors, tray
  presence); §4 `#all-settings` collapsible (collapsed ≥1180px, expanded below; receipt/org/resource/spend
  cards inside, all behavior intact).
- [ ] **5. Self-check:** node --check ×2; verify 258/258; headless EN+JP: place/undo every object by drag
  AND tap-tap AND keyboard picker, wrong-target toast text, duty-chip swap visible in the org card,
  strongbox panel, receipt/rail/tray three-way sync, RM static stage, 390px; screenshots described honestly.

## WB — day drawer (steps)
- [ ] **1.** Drawer behavior on the WA shell (or, if building before WA lands in your worktree: create the
  same pinned shell yourself — the 3-way merge reconciles). Slide/refit/focus/Escape/close rules per the
  contract above. The fishday editor inside must be fully usable: drag blocks, draw arrows, keyboard nudge
  (spot-check the §18 behaviors).
- [ ] **2.** Day-tab handler: tab click = daySel switch (existing) + `openDayDrawer(seg)` for the four days,
  `closeDayDrawer()` for whole-trip; active-tab re-click closes.
- [ ] **3.** Self-check: node --check; verify green; headless: open each day's drawer, draw one arrow in the
  fishday drawer and see +N float on the rail, Escape/focus behavior, 1280px (rail visible) and 700px
  (full-width) layouts, JP labels.

## WC — E2E suite (steps)
- [ ] Author the §7 list as ~20 checks against the pinned selectors; include the Live-mode regression run
  (existing win path) and the three-way sync scenario (close a receipt row → tray token appears; drag-place
  an object → receipt row flips + rail ticks; undo from token → both revert).

## Integrator gates
- [ ] WA lands: verify + smoke 22 + quick tray/stage screenshot review → commit `feat(harbor P3a)`.
- [ ] WB merged (3-way): verify + smoke + WC suite full run → fixes → commit `feat(harbor P3b)`.
- [ ] Close-out: 2 adversarial lenses (interaction/§18-regression · spec-conformance/state-sync) → fixes →
  CLAUDE.md §26 + memory → report to owner (push is a separate owner decision).

## Self-review
Spec coverage: §1→WA2, §2→WA3, §3→WB, §4→WA4, §5→WA4, §6→WA1, §7→WC+gates, §8 exclusions honored. The one
cross-task dependency (satchel → openDayDrawer) has an explicit pre-merge fallback. Type consistency: det
ids match Phase-1's DET_FIX keys; selectors pinned once in the ownership table and referenced everywhere.
