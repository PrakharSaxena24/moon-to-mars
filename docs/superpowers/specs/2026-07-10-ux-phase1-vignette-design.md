# UX Phase 1 + Stage Vignette — ledger rail, receipt-as-control, living inspectable cast, cold-open intro

**Status:** APPROVED (owner picks 2026-07-10: Phase 1 full build · intro = full 15s stage vignette ·
plan-on-the-harbor deferred until Phase 1 is playable).
**Design inputs:** 3-track design panel (planning/intro/stage) + Fable one-stage-architecture verdict, both
2026-07-10. This spec is the buildable subset; the plan-on-harbor architecture (command tray, physical
decision objects, day drawers) is deliberately NOT in scope — Phase 1 is identical under both candidate
architectures, so nothing here is throwaway.
**Constraints (absolute, CLAUDE.md §11):** no build step, no libraries, vanilla ES5, few plain files,
deterministic, full EN/JP parity, engine + 258-check verify untouched (everything here is app.js / stage.js /
index.html / style.css / i18n.js; the one engine read used everywhere already exists: `P.scoreTrip`,
`P.memberInfo`).

---

## 1. The ledger rail — the receipt becomes the progress spine

One renderer, three surfaces. `renderRail(mode)` produces: a **header** stating the score's tense —
setup: "Projected 54 → aim 100" · run: the live ticking total · report: "Final: 54 · D" — followed by
**5 bucket rows** (Trip Frame / Arrival / Ops / Fishing Day / Return), each `earned/max` with a red tint when
short, then the **grade-gate line** when relevant ("an A requires zero known gaps").

- **Setup:** the rail replaces the `#fd-projected` line and the PRE-RUN CHECK chip row entirely. Bucket rows
  are **jump-links**: a red day-bucket row switches to that day's tab; the frame row scrolls to the first open
  receipt row (§2). The Run button moves into the rail footer (the existing `#launch` node relocates, handlers
  unchanged). Data: `P.scoreTrip(P.mergePlan(buildCfg()))` — already computed on every edit; rows re-render in
  the same pass; the existing `floatDelta` "+N" pop fires on the rail total when it rises.
- **Run:** the dashboard's "Overall readiness" big-readout block is replaced by the rail header + bucket rows
  (efficiency / idle / budget / warnings blocks stay). Live mode included — it reads the same ledger.
- **Report:** the rail header + bucket rows render above the existing itemized ledger as its summary
  (the full 89-atom `renderLedger` below is unchanged).

## 2. Receipt-as-control — the dropdowns die

The "Design decisions" card keeps its day-tab filtering but every decision renders as a **receipt row**, not a
`<select>`:

```
⛑️  Abort authority (sea / night)     ⛔ 迷い — never specified          +4
    ▸ why this matters (flips open: the stakes text, p_<det>_cause)
    [ Close this gap (+4) ]
```

- One tap on **"Close this gap (+N)"** applies the existing binary fix (`fixed[DET_FIX[d]] = true` through the
  untouched `buildCfg`→`P.applyFix` path). The row flips to ✓ with the earned points and a quiet **undo** link
  (sets it back); the rail ticks with the +N float.
- **+N per decision** = `scoreTrip(cfg with fix).total − scoreTrip(cfg without).total`, computed in one
  memoized pass per paint (~8 extra scoreTrip calls, setup-only, acceptable — measure once and note).
- **The fishday-arrows row never fakes a one-click.** It renders the gap ("9 arrows undrawn · tackle list
  late") with the action **"Draw the arrows on Fishing Day →"** (switches to the fishday tab). The coarse
  `fixHandoffs` auto-fix remains reachable only via the existing "Auto-fix all" button.
- "Auto-fix all" and "Reset to gappy" stay as the veteran fast-path. Resources sliders and Spend drills are
  NOT in scope (they are already direct-manipulation, not dropdowns).
- Reuses verbatim: `e_<det>_label/_on/_off`, `p_<det>_cause` strings; ledger chip/tier styling from the report.

## 3. Inspectable cast — click or hover any pawn

- **Hover (desktop):** pointer-move hit-test against the live `anim.fig[pid]` positions (nearest within
  ~26px), sets `view.hoverPid` — the canvas already draws a name chip for the hovered pawn; extend the chip to
  include the state word (手待ち ⏳ etc.).
- **Click / tap:** opens a **washi popover** anchored near the pawn (flipping to stay on-screen): name + JP,
  role icon + name, current state with the 迷い/手待ち/手戻り taxonomy line, **held info cards with arrival
  times, what they're waiting on with ETA + predicted idle, next task** — exactly `P.memberInfo(sim, pid)`.
  No Send-now button (interventions stay checkpoint/Live-only). The sim does NOT pause. Escape or click-away
  closes; only one popover at a time.
- **Degradation:** `memberInfo` returns null outside minute mode (the whole-trip classic clock) — the popover
  then shows name/role/duty + current state only.
- **Event plumbing:** listeners attach to `#sitemap` (not the `pointer-events:none` canvas); the 7 `.station`
  hotspots and Hinata `.sec-hot` sit higher and keep first claim on clicks — a click reaching `#sitemap`
  itself is a pawn/background click. Touch: tap = click path (no hover dependency).
- **a11y:** the existing offscreen `#stage-roster` rows become buttons opening the same popover (keyboard
  path); popover gets `role=dialog`, focus restore, Escape (matching the modal patterns from §18).

## 4. Never-frozen harbor — deterministic idle work-loops

In `drawFigures` (stage.js), while a pawn's task state is `working`, draw a small **role-flavored work
gesture** driven purely by `(pid, t)` — no RNG, no engine reads beyond the existing `state`:
chef: chop/stir arm · specialist: rod flick · comms: clipboard flip · safetyLead: horizon scan (head turn) ·
logi: crate lift · budgetLead: tally count · pm: point/beckon · siteLead/owner: survey stance.
Plus a **bounded local wander** (≤6px radius, slow drift, seeded per pid like `figSpeedMul`) on the fanned
station position, and a subtle fidget cycle while idle — so several pawns are visibly in motion at any moment.
All inside balanced `ctx.save()/restore()`; reduced-motion renders the static pose. Guests stay behind their
toggle (owner may flip later; the "juice the diagnosis" law wins for now).

## 5. The cold-open vignette — the intro shows the game in 15 seconds

Replaces the intro hero's paragraph block. A canvas in the hero runs a **scripted, deterministic vignette on
the real stage renderer**:

1. **0–4s** — dawn harbor fades in, the 11 pawns walk to stations (sped-up minute sim). Caption: *"Everyone
   has a job." / 「全員に役割がある。」*
2. **4–8s** — the sim reaches the seed's first info gap; the consuming pawn freezes red with ❓. Caption:
   *"But information has a clock." / 「だが、情報には時刻がある。」* A single glowing prompt appears on the
   frozen pawn: **"Hand him the card / カードを渡す"**.
3. **click (or auto after 4s)** — the gold mote flies, the pawn unfreezes and walks; a mini rail row flips
   red→green with a +N float. Caption: *"The place they stall is the place to fix the plan. 100 = nobody
   waits." / 「止まった場所こそ、計画を直す場所。100点＝誰も待たない。」*
4. **hold** — **Start ▶** pulses (always visible from 0s, as is **Skip**).

- **Implementation:** a real `P.createSim` with the Live config (classic fixes sound, arrows gappy, fixed
  seed) ticked by a dedicated vignette loop with a scripted speed ramp; the freeze point found with the
  existing `nextLiveGap` logic; the "hand the card" moment applies a real handoff edit through the same merge
  path Live's commit uses. Fully deterministic — same frames every time.
- **Lifecycle guardrails (the §18 bug class, named):** one module-scoped handle `{raf, sim, canvas}`;
  `killVignette()` runs on Start, Skip, `enterMode`, intro close, and language switch (which re-boots it);
  the vignette never runs while `#run` is visible; its canvas and loop are destroyed, not hidden.
- **Reduced motion:** three static captioned frames (one-shot `scene()` calls at the three beats) with the
  same captions — no loop at all.
- **Text diet for the rest of the intro:** hero prose reduces to the one-line premise; the pull-quote is
  ABSORBED by caption 3 (deleted as a separate block); "Meet the crew" cards keep name + role visible but the
  duty sentence moves to hover/tap reveal.
- **Returning players:** `prs_intro_seen` still skips straight to Live; the header Cast button reopens the
  intro where the vignette offers a **Replay ▶** instead of autoplaying.

## 6. i18n & testing

- New keys (~35, EN+JP in one edit, parity enforced by the existing verify assertion): rail tense lines,
  bucket short-names, receipt row actions (close/undo/route), popover field labels, vignette captions/prompt,
  replay/skip.
- `node verify.js` stays 258/258 untouched (no engine edits). Ephemeral Playwright per wave: rail on all three
  surfaces + jump-links; a receipt row closes → rail ticks → undo reopens; zero `<select>` left in the
  decisions card; pawn click opens a popover showing a held card + waiting-on ETA mid-run; vignette reaches
  the freeze, click completes it, Start works from every beat, Skip works instantly, JP parity, reduced-motion
  fallback renders 3 frames; language switch mid-vignette re-boots cleanly.

## 7. Out of scope (decided)

Plan-on-the-harbor (command tray, physical objects, day drawers, mode state machine) — revisit after Phase 1
ships. Guests-visible-by-default. Setup cast strip. Wrong-target placement consequences (needs engine work).
Resources/spend-drill redesign. Convergence-grouped Live pacing (still backlog).

## 8. Execution shape (for the implementation plan)

Wave 1 (parallel, disjoint files): **W1 rail + receipt** (app.js setup/dashboard/report regions + index.html +
style.css + i18n.js — Fable) ∥ **W2 work-loops** (stage.js only — Sonnet). Wave 2 (parallel after W1 lands,
still disjoint): **W3 pawn inspect** (app.js run-stage pointer layer + popover — Opus) ∥ **W4 vignette**
(intro region of app.js/index.html/css/i18n — Fable; W3/W4 both touch app.js → W4 executes against W3's file
regions only after a region map is fixed in the plan, or sequentially if the plan judges the collision risk
real). Integrator (me) merges, runs verify + ephemeral E2E + headless screenshots per wave, commits per wave.
