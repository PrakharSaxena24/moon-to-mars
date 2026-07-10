# UX Phase 1 + Vignette Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec:
> `docs/superpowers/specs/2026-07-10-ux-phase1-vignette-design.md` (read it FULLY first — it is the contract).
> **Execution model:** two waves of two parallel agents. Workers NEVER run `git commit`, never touch files
> outside their task list, and self-check only what their task defines (full verify/E2E is the integrator's
> gate). When plan and spec conflict, the spec wins; report the conflict.

**Goal:** ship the ledger rail (3 surfaces), receipt-as-control planning rows, click/hover pawn inspection,
deterministic idle work-loops, and the 15s cold-open vignette.

**Model allocation (owner-directed):** Fable = W1 rail/receipt + W4 vignette (quality-critical, coupled).
Opus = W3 pawn inspect (interaction + a11y). Sonnet = W2 work-loops (well-defined canvas code).

## Global constraints

- Vanilla ES5 (var, no arrows/let/const/template literals) matching each file's idiom; no build, no libs.
- `engine.js` and `verify.js` are READ-ONLY for every worker. `node verify.js` must stay 258/258.
- Every new i18n key lands in BOTH `en` and `ja` in the same edit (verify's parity check enforces).
- Reduced motion (`RM`): every new animation needs its static branch. Keyboard/touch parity per §18 patterns.
- Determinism: no `Math.random()`/`Date.now()` in any new code path; time comes from the rAF timestamp/`sim`.

## File ownership

| Task | Files (exclusive within its wave) | Model |
|---|---|---|
| W1 rail + receipt | app.js (setup/dashboard/report regions), index.html, style.css, i18n.js | fable |
| W2 work-loops | stage.js ONLY | sonnet |
| W3 pawn inspect | app.js (run-stage pointer layer + popover), index.html, style.css, i18n.js | opus |
| W4 vignette | app.js (intro region), index.html (#intro), style.css, i18n.js — **worktree isolation** | fable |
| Integration | any (tech lead) | — |

---

### W1 — Ledger rail + receipt-as-control (spec §1–§2)

**Interfaces produced (pinned):** `renderRail(mode)` with mode `'setup'|'run'|'report'`; containers
`#rail-setup` (a sticky right column in a new `#setup` 2-col grid ≥1180px, stacking above cards below),
rail content injected into the dashboard replacing the `#dash-ready` big-readout block (keep the
`#dash-ready` id on the new total element — E2E hooks), `#rail-report` card above the `#ledger` card.
i18n keys: `railAim(cur)` "Projected {cur} → aim 100", `railFinal(total,grade)`, `railBuckets` reuse existing
`sb_*`, `rcClose(n)` "Close this gap (+{n})", `rcClosed(n)`, `rcUndo`, `rcRouteFishday`
"Draw the arrows on Fishing Day →", `rcWhy` (reuse existing why-this-matters key if present).

- [ ] **Step 1:** Setup rail. New `renderRail('setup')`: header tense line + 5 bucket rows from
  `P.scoreTrip(P.mergePlan(buildCfg()))` (already computed each edit — hook the same repaint path). Red row
  click: day buckets → the existing day-tab switch; frame → scroll to first open receipt row. Move the
  `#launch` button node into the rail footer (listeners untouched). DELETE `#fd-projected` line + the
  PRE-RUN CHECK chip row (`#plan-ready`). `floatDelta` fires on the rail total on rise.
- [ ] **Step 2:** Receipt rows. Replace each decision card's `<select>` with the spec §2 row (icon + label +
  status chip reusing report ledger chip CSS + points + flip-open stakes from `p_<det>_cause` + action
  button). Close → `fixed[DET_FIX[d]] = true` + repaint; Undo → false. handoffTiming row = route-only.
  Per-decision +N: memoized scoreTrip diff per paint (one pass computes all). Keep Auto-fix-all / Reset.
  Zero `<select>` elements remain in the decisions card.
- [ ] **Step 3:** Run + report rails. Dashboard: replace the readiness big-readout block with rail rows
  (efficiency/idle/budget/warnings untouched); works in Live too (already ledger-fed). Report: summary rows
  above the itemized ledger.
- [ ] **Step 4:** Self-check: `node --check app.js i18n.js`; `node verify.js` still green (engine untouched;
  parity holds); headless screenshot of setup 'all' tab + a day tab + run + report via
  `/Users/tanakai/miniconda3/bin/python3` + playwright — confirm no dropdowns, rail on 3 surfaces, include
  the screenshots' findings in your report. EN and JP both.

### W2 — Deterministic work-loops (spec §4)

**Interface consumed:** `drawFigures` in stage.js; per-figure `p.state`, role via `P.role(p.roleId)`; time `t`.
**Rule:** all gesture phases = pure functions of `(hash(pid), t)` — reuse the existing seeded-hash idiom
(`figSpeedMul` style). No engine reads added. Balanced `ctx.save()/restore()` (run the existing balance
check: count saves/restores match).

- [ ] **Step 1:** Role gesture table (8 gestures, spec §4 list): small limb/prop overlays drawn in the
  figure's local transform while `state === 'working'`: chef chop, specialist rod flick, comms clipboard,
  safetyLead scan, logi lift, budgetLead tally, pm beckon, siteLead/owner survey. Subtle (≤4px amplitudes),
  washi-consistent, ~0.8–1.6s cycles offset per pid.
- [ ] **Step 2:** Bounded idle wander (≤6px radius slow drift around the fan position, seeded per pid) +
  idle fidget (weight shift every few seconds). RM branch: static pose, no wander.
- [ ] **Step 3:** Self-check: `node --check stage.js`; save/restore count balanced; headless screenshot
  mid-fishday-run showing ≥3 pawns mid-gesture (include what you saw); `node verify.js` green.

### W3 — Pawn inspection (spec §3)

**Interfaces consumed:** `anim.fig[pid].cx/cy` (app.js walk cache), `view.hoverPid` (already drawn as name
chip — extend with state word), `P.memberInfo(sim, pid)` (null outside minute mode → degrade),
`#stage-roster` rows. **Produced:** `openPawnCard(pid)` / `closePawnCard()`; popover `#pawn-card`
(role=dialog, one at a time, Escape + click-away, focus restore); i18n keys `pcHeld`, `pcWaiting`,
`pcEta(min)`, `pcNext`, `pcNoMinute`, `pcState` (+ reuse `st*` state words).

- [ ] **Step 1:** Hit-testing on `#sitemap` (pointermove → hoverPid within ~26px of a duty-holder fig;
  click on `#sitemap` background → nearest fig or close). `.station`/`.sec-hot` keep priority (they're above;
  only handle events whose target is the sitemap/canvas itself). Touch tap = click.
- [ ] **Step 2:** The washi popover per spec §3 (anchored near pawn, flip to stay on-screen; sim keeps
  running; re-renders on language switch if open; closes on mode change/finish).
- [ ] **Step 3:** a11y: `#stage-roster` entries become buttons → same popover; dialog semantics per the §18
  modal patterns.
- [ ] **Step 4:** Self-check: `node --check`; verify green; headless: mid-run click a pawn → popover shows a
  held card + waiting-on ETA; whole-trip (non-minute) click → degraded card; JP parity one-liner.

### W4 — Cold-open vignette (spec §5) — worktree isolation

**Produced:** vignette module in app.js intro region: `bootVignette()`, `killVignette()`, handle
`{raf, sim, cv}`; `#vig-canvas` in the intro hero; captions/prompt keys `vg1`, `vg2`, `vg3`, `vgPrompt`,
`vgReplay` (+ reuse skip/start keys). Beats, timings, lifecycle guardrails, RM 3-still fallback, prose diet,
returning-player behavior: exactly spec §5 — implement it clause by clause.

- [ ] **Step 1:** Scripted sim (Live config, fixed seed, `nextLiveGap`-found freeze, real handoff edit on
  click, speed-ramped dedicated loop drawing via `PRS_STAGE.scene` onto `#vig-canvas`).
- [ ] **Step 2:** Captions/prompt/Start/Skip/Replay overlay + the intro text diet (hero prose → one line;
  pull-quote block deleted; cast duty lines → hover/tap reveal).
- [ ] **Step 3:** Lifecycle: `killVignette()` wired into Start, Skip, `enterMode`, cast-close, `applyLang`
  (re-boot); assert no second loop can exist (boot kills first). RM branch: three one-shot `scene()` stills.
- [ ] **Step 4:** Self-check: `node --check`; verify green; headless: fresh-load intro reaches the freeze,
  click completes the beat, Start works at 2s and at end, Skip instant, JP captions, RM page shows 3 stills;
  screenshot each beat and report what you saw.

### Integration (tech lead, after each wave)

- [ ] Wave 1 land: merge W1+W2, `node verify.js`, full headless smoke (existing 19 checks + no-dropdowns +
  rail-on-3-surfaces + gestures visible), commit `feat(ux P1a)`.
- [ ] Wave 2 land: apply W4's worktree diff onto W3's tree (expected conflict: i18n key append — resolve by
  including both), verify + smoke (+ popover + vignette checks), commit `feat(ux P1b)`.
- [ ] Close-out: one adversarial review pass (2 lenses: interaction/a11y regressions incl. §18 hardening; and
  spec-conformance), fix confirmed findings, update CLAUDE.md (§25 as-built) + memory, final commit. Ask
  owner before any push.

## Self-review notes

Spec coverage: §1→W1 s1/s3, §2→W1 s2, §3→W3, §4→W2, §5→W4, §6 testing→per-task self-checks + integration,
§7 exclusions honored (no guests flip, no plan-on-harbor). Interfaces pinned once (rail ids, i18n keys,
popover fns, vignette handle) and repeated in the consuming task briefs. No placeholders: every step names
its exact mechanism or defers explicitly to a spec clause by number.
