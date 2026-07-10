# Scoring Rubric v1.0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
> **Execution model (owner-directed):** Wave 1's three tasks run as PARALLEL agents on disjoint files;
> the integrator (tech lead) merges, measures, pins, and commits. Workers NEVER run `git commit` and never
> touch files outside their task's file list.

**Goal:** Replace the hand-written scoreTrip atom builders with a rule-based deriver per the v1.0 constitution
(spec: `docs/superpowers/specs/2026-07-10-scoring-rubric-v1-design.md`), pin the constitution in verify, and
migrate every player-facing surface (Live mode included) onto the ledger.

**Architecture:** engine.js gains flag tables + one generic deriver replacing five bucket builders (89 atoms,
frozen matrix). verify.js's scoreTrip blocks are rewritten to exact pins. app.js/i18n.js complete the P4
migration (Live win = fishday 41/41, scoreDay demoted, labeled efficiency, complete chip taxonomy).

**Tech Stack:** vanilla ES5, no build, no libraries, Node-runnable engine (`node verify.js` is the gate).

## Global Constraints (from spec + CLAUDE.md §11)

- No build step, no server, no new runtime files; ES5 only (`var`, no arrow functions/template literals/let/const in shipped js).
- Bilingual EN/JP full parity in i18n.js; entity labels via `L(en,jp)`.
- Deterministic: no RNG in the scoring path; `scoreTrip` pure (no plan mutation, never calls `score()`).
- The frozen matrix (both axes) and 89-atom count are LAW: bucket {frame 14, arrival 15, ops 18, fishday 41, return 12}, dimension {info 34, exec 25, safety 20, quality 10, money 10, people 1}.
- `scoreTrip(plan)` return shape is UNCHANGED: `{total, grade, gate:{clean,withheldA}, atoms[], byBucket, byDimension}`; atom shape `{id, bucket, dimension, itemRef, maxPts, earned, status, reasonKey, reasonParams}`.
- All 30 fishday tasks, all 14 canonical handoffs, the gappy seed, CHANNELS, checkpoints, `score()`, `scoreDay()`, `daySchedule`, `dayReadiness` internals: UNTOUCHED except where a task explicitly says otherwise.

## File ownership map (Wave 1 is conflict-free by construction)

| Task | Files (exclusive) |
|---|---|
| W1-T1 engine | `engine.js` only |
| W1-T2 verify | `verify.js` only |
| W1-T3 UI | `app.js`, `i18n.js`, `index.html`, `style.css` only |
| W2 integration | any (tech lead) |
| W4 docs | `README.md`, `CLAUDE.md` |

---

### Task W1-T1: engine.js — the rule-based atom deriver

**Files:** Modify: `engine.js` (scoring section ~1651–2030; task data for flags; exports ~2021–2026)

**Interfaces:**
- Consumes: existing `tasksForSeg`, `handoffsForSeg`, `daySchedule`, `dayReadiness`, `deckFor`, `detect`, `mergePlan`, `makeTemplate`, the existing per-gate check logic in the current builders (port it, don't reinvent).
- Produces: `scoreTrip(plan)` with exactly 89 atoms under the v1.0 id scheme; new exported constant `GRADE_BANDS = { A: 90, B: 75, C: 60 }` used by `scoreTrip`, `scoreDay`, `score`.

- [ ] **Step 1 — flag data.** Add to the template task definitions (the `HD(...)`/`FD(...)` rosters) the spec §3.4 flags as task fields:
  - `safetyGate: <pts>` on: `hd_a_safety:1`, `hd_o_weather:1`, `hd_o_safetywatch:1`, `t_f_weather:3`, `t_f_seawatch:2`, `t_f_health:2`, `hd_r_headcount:1`, `hd_r_boarding:1`.
  - `qualityCheck: 1` on: `hd_a_dinnerprep`, `hd_a_dinnerserve`, `hd_o_foodprep`, `hd_o_lunch`, `hd_o_dinnerprep`, `hd_o_dinnerserve`.
  - `moneyCheck: 1` on: `hd_a_board`, `hd_o_foodsource`, `hd_o_tackleprep`, `hd_r_sitecash`, `hd_r_settle`.
  (Where a task builder's opts object doesn't pass through unknown fields, extend it — verify by `node -e` printing the merged task.)
- [ ] **Step 2 — the deriver.** Replace `tripFrameAtoms/tripArrivalAtoms/tripOpsAtoms/tripFishdayAtoms/tripReturnAtoms` with one `deriveTripAtoms(plan)` implementing this validated reference algorithm (adapt to ES5 + engine idiom; FRAME/TIER inline):

```js
// per seg in ['arrival','ops','fishday','return'] over REQUIRED template tasks:
// 1. sockets: key (consumerRole|card) from neededInfo, skip cardOwner[card]===role;
//    riskable (3pts) iff card in ANY consuming task's assumeOn; else 1pt.
//    id: seg+'_info_'+role+'_'+card. Earn = existing tripSocketStatus logic
//    (daySchedule missing[]/late[]; worst consumer decides; unplaced consumer => missing;
//    riskable late => earned 1, status 'present-but-late').
// 2. safetyGate tasks REPLACE lane membership: mint seg+'_safety_'+taskId at flag pts;
//    earn = port the existing gate checks (dawn_gonogo criterion, seawatch window/authority,
//    health placed+staffed; coarse gates: placed+staffed on right role).
// 3. qualityCheck/moneyCheck tasks stay in lanes AND mint seg+'_quality_'+taskId /
//    seg+'_money_'+taskId (port tripQualityAtom / existing money checks).
// 4. lanes: per role over non-safetyGate required tasks -> seg+'_exec_'+role, 1pt
//    (port tripLaneAtom criteria: placed+staffed+right-role+dep-consistent+non-overlap+durMin floor).
// 5. fishday computed quality gates keep ids: fishday_quality_cookblock(2)/allergy(1)/portions(1).
// 6. decoys: seg+'_decoy_'+taskId, maxPts 0, earned -2 placed (-3 if safety-flavored).
// frame: 7 atoms unchanged ids/pts: frame_abort_sea 2, frame_abort_night 2, frame_health_report 2,
//    frame_hospital_shared 2, frame_budget_authority 3, frame_reserve_drawrule 2, frame_load_relief 1.
```

- [ ] **Step 3 — perf + correctness fixes folded in:** compute `daySchedule(plan,seg)` and `dayReadiness(plan,seg)` ONCE per segment per scoreTrip call and pass them into the atom earn functions (today they're recomputed per lane atom). `fishday_quality_cookblock` failure status: `'late'` when dinner > 1080, `'compressed'` only when durMin < 5×portions. `frame_load_relief` reasonKeys become `scr_people_ok`/`scr_people_overload`. Grade thresholds: single `GRADE_BANDS` const consumed by `scoreTrip` (A additionally requires clean), `scoreDay`, `score`.
- [ ] **Step 4 — dead-code retirement (§21.8a):** delete `dayLayout`, `derivedHandoffs`, `HOUR_DT`, and helpers only they use (`clampInt`, standalone `inSeg`, `laneTopoOrder`, `ROLE_ORDER`); remove their exports. KEEP `DAY_WINDOWS`, `DAY_HOUR_START/END`. Fix stale comments (engine.js:53 "nothing reads these yet"; api "Phase 1: structural").
- [ ] **Step 5 — self-check (do NOT run full verify; it pairs with W1-T2 at integration):**

```bash
node -e "var P=require('./engine.js');var t=P.scoreTrip(P.mergePlan({seed:1}));
var s=0;t.atoms.forEach(function(a){s+=a.maxPts});
console.log(t.atoms.length,s,JSON.stringify(t.byBucket),JSON.stringify(t.byDimension),t.total,t.grade);"
```
Expected: `89 100` · byBucket maxPts {frame:14,arrival:15,ops:18,fishday:41,return:12} · byDimension maxPts {info:34,exec:25,safety:20,quality:10,money:10,people:1} · gappy total in 45–60 grading D. Also assert canonical (applyAllFixes + applyDayFix×3) → 100/A/clean, and `node --check engine.js`.

### Task W1-T2: verify.js — the pinned constitution

**Files:** Modify: `verify.js` (scoreTrip blocks ~529–707; delete §19 block 264–292)

**Interfaces:**
- Consumes: W1-T1's atom id scheme (above) and `GRADE_BANDS`. New ids for previously-hand-named atoms: `fishday_exec_owner_flex→fishday_exec_owner`, `fishday_exec_pm_flex→fishday_exec_pm`, `fishday_safety_health_check→fishday_safety_t_f_health`, `arrival_safety_briefing→arrival_safety_hd_a_safety`, `fishday_safety_dawn_gonogo→fishday_safety_t_f_weather`, `fishday_safety_abort_aboard→fishday_safety_t_f_seawatch`, money atoms → `arrival_money_hd_a_board`, `ops_money_hd_o_foodsource`, `ops_money_hd_o_tackleprep`, `return_money_hd_r_sitecash`, `return_money_hd_r_settle`; `return_safety_evac_plan` DELETED, `return_safety_hd_r_boarding` + `return_exec_siteLead` NEW; decoy ids `<seg>_decoy_<taskId>`.
- Produces: a `PINS` object at the top of the scoreTrip section holding every exact seed value, initially the pre-measured estimates below, finalized by W2.

- [ ] **Step 1 — delete** the §19 grid block (16 checks, lines 264–292) and any `dayLayout`/`derivedHandoffs`/`HOUR_DT` references.
- [ ] **Step 2 — update** the SEVEN named-atom list (622–623) and all changed ids; add `scr_people_ok`/`scr_people_overload` to the RK reasonKey set (581) and assert `frame_load_relief` uses them; extend the itemRef.type set if the deriver adds none (stays {lane,socket,gate,decoy,frame}).
- [ ] **Step 3 — the new §8 pins**, each an `ok(...)`:
  1. `atoms.length === 89` (gappy AND canonical).
  2. Σ maxPts === 100 both plans (keep existing).
  3. Both matrix axes exact (keep existing values).
  4. **Σ earned (clamped 0) === total** on gappy, canonical, and each ladder step.
  5. `PINS = { gappySeed: <measured>, gappyBuckets: {...}, fixHandoffsJump: <measured>, tripEffGappy: <measured> }` — assert exact equality. Pre-measured estimates from the reference derivation: gappySeed 54, jump +18, tripEffGappy 81; W2 finalizes.
  6. Cumulative monotone ladder: apply the 8 classic fixes then fixHandoffs then applyDayFix(arrival/ops/return) cumulatively; assert each step's scoreTrip total is ≥ previous and final === 100/A/clean.
  7. **withheldA**: canonical minus one 1pt return arrow (`overrides.days.return.handoffs` one id → null) ⇒ total 99, clean false, grade 'B', gate.withheldA true; verdict-ready.
  8. **drawn-but-late riskable**: canonical + retime `h_menu_angler` to `{trigger:{type:'atMinute',value:330},channel:'board'}` (arrival 360 > gearload start 330) ⇒ atom `fishday_info_specialist_ic_menu` earned 1, status 'present-but-late', reasonKey 'scr_info_drawn_late'.
  9. **redundant-arrow non-inflation**: canonical + a duplicate faster arrow on an already-ok socket ⇒ total still 100 and that atom's maxPts unchanged.
  10. **i18n parity**: `require('./i18n.js')` — same key sets in EN and JA (symmetric difference empty). W1-T3 adds the Node export to i18n.js (see below); write the check assuming `require('./i18n.js')` returns the STR object.
  11. tripEfficiency: pinned exact on gappy (PINS) and 100 on canonical; determinism (two calls identical).
- [ ] **Step 4 — self-check:** `node --check verify.js` passes; count of `ok(` calls printed for the report. Full run happens at W2.

### Task W1-T3: app.js/i18n.js/index.html/style.css — ledger everywhere (SP3)

**Files:** Modify: `app.js` (~1462–1905, 2425–2460, 482–515), `i18n.js`, `index.html` (~192–210), `style.css` (ledger row classes)

**Interfaces:**
- Consumes: `P.scoreTrip`, `P.tripEfficiency`, `P.daySchedule(plan,seg).efficiency`, stable atom/ledger API. New atom ids per W1-T2's list (LEDGER_ITEM_NM shrinks: keep `frame_abort_sea`/`frame_abort_night` labels; DELETE `arrival_money_transport_auth`, `ops_money_onsite_auth`, `ops_money_tackle_auth`, `return_safety_evac_plan` entries — those atoms are now task-homed and `ledgerItemName` must resolve `itemRef.taskId` through `tasksForSeg` names, falling back to the existing humanizer).
- Produces: i18n keys (EN + JA, full parity): `ledgerTitle` (move LEDGER_TITLE out of app.js:1671), `sst_partial` ("Partial"/"部分点"), `scr_people_ok`, `scr_people_overload`, `effTripLbl` ("Trip efficiency"/"旅程全体の稼働効率"), `effDayLbl(day)` (function-valued: "<day> efficiency"/"<day>の稼働効率"), `resWinP2(pts,max)` ("Fishing Day: {pts} of its {max} trip points — dinner 18:00, nobody waited."/JA parity), removing stale `resWinP`. Also add a Node export tail to i18n.js (same guarded UMD pattern engine.js uses: `if (typeof module !== 'undefined') module.exports = STR;`) so verify's parity check can `require` it.

- [ ] **Step 1 — Live migration (spec §7.1):** `liveFinish`/win test (app.js:2425–2432): win = `trip.byBucket.fishday.earned === trip.byBucket.fishday.maxPts && dinnerMin <= 1080` where `trip = P.scoreTrip(currentPlan())`. `renderResult` win panel uses `resWinP2` with the fishday slice; soft-fail unchanged (names the surviving gap). Dashboard (1469–1471): remove the Live bypass — Live reads the ledger like every mode, showing the fishday slice + day efficiency labeled via `effDayLbl`. Live blast-radius preview (`previewChannel`/`renderSpot` projection line): display the projected **fishday slice** (run scoreTrip on the hypothetical cfg) instead of the legacy projection number.
- [ ] **Step 2 — scoreDay demotion (§7.2):** day reports + coarse live dashboard show the trip slice (`daySliceLine`) + labeled day efficiency; no scoreDay grade/score/89-cap anywhere player-facing (renderDayReport 1844–1895, renderDashboard 1465–1466). Efficiency chips in reports source `daySchedule(seg).efficiency` for day scope, `tripEfficiency` for trip scope — same scope as the headline beside them (§7.3). Fix the mixed-scorer sentence at app.js:1795 (verdict uses ledger data only). Setup projections (`buildFdReady` 482–515): "Projected: X of Y trip points · efficiency Z%" from scoreTrip on the hypothetical plan + `projectedDay`-free.
- [ ] **Step 3 — chips + cleanup (§7.4):** `LEDGER_STATUS_KEY` maps `'present-but-late'→'sst_partial'` with the partial row tint; delete the hidden-scorecard rebuild (1817–1820, 1870–1873) and the `#scorecard` card from index.html:203 (fix-pack/individuals stay); `applyDayFixAndRerun` (1899–1904) persists BOTH the handoffs AND placement patches from `P.applyDayFix`.
- [ ] **Step 4 — self-check:** `node --check app.js`, `node --check i18n.js`; i18n EN/JA key-set symmetry via a quick `node -e` diff; grep proves no player-facing `scoreDay(` grade usage remains (`grep -n "scoreDay" app.js` — allowed only where explicitly internal per Step 2).

### Task W2 (integrator/tech lead — inline, after Wave 1): merge, measure, pin, commit

- [ ] Run `node verify.js`; fix integration breaks (owner of last resort on any cross-file mismatch).
- [ ] Measure the real seed values (`node -e` scoreTrip on seed + ladder), write them into `PINS`, re-run to green.
- [ ] Headless smoke: fishday run EN+JP, Live win path, Live soft-fail, coarse-day report, full-trip report — zero JS errors (headless Chrome script).
- [ ] Commit in two commits: `feat(rubric v1 SP2): rule-based atom deriver + pinned constitution` (engine.js, verify.js) and `feat(rubric v1 SP3): ledger everywhere — Live migration, labeled efficiency, chip taxonomy` (app.js, i18n.js, index.html, style.css).

### Task W3 (parallel QA fan-out, after W2): adversarial review

- [ ] 4 parallel review lenses over the full diff (spec-conformance / correctness / UI+i18n / verify-coverage), each instructed to REFUTE the implementation against the spec §2–§8; integrator fixes confirmed findings, re-runs verify + smoke.

### Task W4 (parallel, after W3): docs + close-out

- [ ] README rewrite (ledger-era scoring section, real check count, new gradient, file list incl. stage.js/WORLD.md/docs) — one agent.
- [ ] CLAUDE.md: §15 status refresh (real check count, §21–23 shipped), new §24 "Rubric v1.0 as-built" with measured numbers, §23 marked superseded-on-enumeration by the v1.0 spec; v0.3 spec gets a superseded banner — second agent (CLAUDE.md + the v0.3 spec file).
- [ ] Final `node verify.js` + commit `docs(rubric v1 SP4): README + CLAUDE.md §24 + spec tombstones`. Ask owner about GitHub Pages push.

## Self-review notes

Spec coverage: §3/§4→W1-T1; §5 socket semantics→W1-T1 step 2 + W1-T2 pins 8/9; §6/§8→W1-T2 + W2; §7.1–7.4→W1-T3; §9 SP4→W4; §10 deltas encoded in the id-change list; §21.8a→W1-T1 step 4 + W1-T2 step 1. Type consistency: atom shape/id scheme repeated identically in T1/T2/T3. The one cross-file exception (i18n UMD export tail for the parity check) is explicitly assigned to W1-T2 with a guard.
