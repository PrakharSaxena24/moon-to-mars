# Scoring Rubric v1.0 — the derived constitution

**Status (updated 2026-07-11): SHIPPED — see the matching CLAUDE.md as-built section.** Original status: v1.0 APPROVED (owner sign-off 2026-07-10: Approach A rule-based derivation + keep the matrix).
**Supersedes:** the *enumeration and pricing* of `2026-07-09-scoring-blueprint-design.md` (v0.3). That spec's
principles (§0–§2), grade gate (§6), Efficiency separation (§5), and one-currency rule (§8) are inherited
unchanged and restated here where needed. Where v0.3 and this doc disagree on any count, price, or atom, **this
doc wins**.
**Authority:** this is the reference the engine, verify suite, and UI are built against. The frozen matrix in §2
and the inventory in §4 are asserted by `verify.js`; changing them requires editing this spec first.

---

## 0. Goal (inherited, unchanged)

The 100 is the whole 10-day trip, and every single point is one **named, integer-priced, checkable thing** the
player did — or failed to do. The score is a receipt: hover any point, see its item. Two headlines stay
distinct: **Score** = are the plan's decisions sound (causes); **Efficiency** = does it waste anyone's time
(effects). A late info socket bills both — one fault, two numbers, never two rows in one number.

## 1. Why re-derived (the drift record)

The v0.3 blueprint hand-listed its inventory and the P1–P3 build hand-wrote five bucket builders. They drifted
without reconciliation: the spec claimed 79/~80 atoms while the engine shipped 90; the spec's worked Fishing Day
was 28 atoms with 3+3 safety gates while the code shipped 29 with 2/2/2; the seed landed 54/D and +18 against
targets ~50/D and ~+22; verify pinned only bands, so none of this failed a check. The root cause is structural:
**two hand-maintained copies of one inventory**. v1.0 removes the second copy — atoms are *derived* from the
template data by fixed rules, the spec documents the rules plus the frozen outcome, and verify pins the outcome.
Future content (a NO-GO branch, spoilage, per-guest allergies) re-derives automatically, and the Σ=100 pin
forces every re-balance to be deliberate and spec-first.

## 2. The constitution in one view

**89 atoms** (80 scoring + 9 decoy debits) summing to **exactly 100**, integer prices 1–4, no fractions, no
re-normalization. Frozen matrix (bucket × dimension), asserted on both axes:

| | Info | Exec | Safety | Quality | Money | People | Σ |
|---|---|---|---|---|---|---|---|
| Trip Frame | — | — | 8 | — | 5 | 1 | **14** |
| Arrival (D1) | 4 | 7 | 1 | 2 | 1 | — | **15** |
| Ops (rep. day) | 5 | 5 | 2 | 4 | 2 | — | **18** |
| **Fishing Day (D3)** | **22** | 8 | 7 | 4 | — | — | **41** |
| Return (D10) | 3 | 5 | 2 | — | 2 | — | **12** |
| **Σ** | **34** | **25** | **20** | **10** | **10** | **1** | **100** |

Fishing Day is the heaviest bucket and Information the heaviest dimension because they *contain* the most
clocked atoms under the rules — the thesis (information has a clock) priced honestly, not by multiplier.

**Grade gate (inherited):** A requires total ≥ 90 **and** clean. Clean = every atom at max (decoys at 0) **and
no live classic detector** — the second clause exists because exactly one legacy check (return logistics
staffing, the frame `t_ship` gap fixed by `setReturn`) has no atom home in the frozen matrix; it must still
withhold the A ("zero known gaps") even though it prices at 0. ≥90 but not clean shows the true sum with a
withheld A: "97 · B — an A requires zero known gaps." B ≥ 75 · C ≥ 60 · else D.
One shared `GRADE_BANDS` constant; the legacy per-scorer thresholds and the old !clean→89 cap are retired from
every player-facing number (§7.2).

## 3. Derivation rules (the law)

### 3.1 Enumeration sources
Atoms are minted mechanically from: the template's **required tasks** per authorable segment (arrival 11 /
ops 13 / fishday 32 / return 9), their `neededInfo` against the **info-card owner map** (sockets), the
**flag tables** in §3.4 (the deliberate pricing surface), the **classic detectors** (trip-frame gates), and the
**decoy decks** (3/3/0/3). Prices come only from §3.4's tier table. Nothing else may mint an atom.

### 3.2 Atom kinds & earn criteria
- **Exec lane** (1pt) — per (segment, role), covering the role's required tasks *minus* safety-gate tasks
  (§3.3). Earned iff every covered task is placed, staffed on the right role, dep-consistent, non-overlapping,
  and `durMin ≥` the template floor (the floor kills the shrink-the-cook-block exploit). A role whose tasks are
  all safety gates has no lane — its execution is priced in the gates.
- **Info socket** (1pt; riskable 3pts) — per (segment, consuming role, card); full semantics in §5.
- **Safety gate** (1–3pts) — a safety-flagged task placed + staffed + its specific criterion satisfied (the
  go/no-go must carry an explicit abort criterion; the sea-watch must hold abort authority aboard for the whole
  at-sea window; the health check must run on landing; the coarse 1pt gates have no extra criterion — placed +
  staffed on the right role earns them). Trip-frame gates are earned from the classic detectors
  (abort authority named, night criterion set, health-report route, hospital info shared to the standing
  recipient set, budget authority granted, reserve + draw rule, load/relief).
- **Quality check** (1–2pts) — additive on meal/service tasks and the three computed Fishing-Day gates:
  cookblock (duration ≥ 5 min × portions AND dinner ≤ 18:00, 2pts), allergy respected (menu species vs the
  known shellfish allergy, category-based), portions = 13 guests + organizer add-ons. Earned iff the underlying
  task is placed with its floor, idle-free, and unresolved-free.
- **Money check** (1pt additive; frame 2–3) — authority/settlement present on the flagged task.
- **Decoy debit** (maxPts 0) — earns **−2** if the decoy is placed (−3 if safety-flavored). Debits subtract
  from the total (clamped ≥ 0) and render as debit rows in their home cell.

### 3.3 Homing rules
Every atom has exactly one home cell. Dimension is derived, never hand-assigned: socket → Info; safety-gate
flag → Safety (**replace** semantics: the task leaves its lane); quality/money flag → Quality/Money
(**additive** semantics: the task stays in its lane; the check prices an extra property on top of execution);
remaining required tasks → Exec via their role lane; classic-detector gates → Frame. Rationale for
replace-vs-additive: a safety duty's execution *is* the gate — placing the go/no-go means nothing without its
criterion — whereas a meal can be executed (placed, staffed) yet still served late (quality) or unauthorized
(money).

### 3.4 The deliberate pricing surface (flag + tier tables)
This is the one place judgment lives; everything else is mechanical. These flags are template data (SP2 adds
the missing ones to `engine.js` task definitions), reviewed here:

**Safety gates (replace):** `hd_a_safety` 1 · `hd_o_weather` 1 · `hd_o_safetywatch` 1 · `t_f_weather`
(dawn go/no-go) **3** · `t_f_seawatch` (abort aboard) 2 · `t_f_health` 2 · `hd_r_headcount` 1 ·
`hd_r_boarding` 1. The go/no-go is the single most consequential decision of the trip and is priced above
every other gate.
**Quality checks (additive):** `hd_a_dinnerprep` 1 · `hd_a_dinnerserve` 1 · `hd_o_foodprep` 1 · `hd_o_lunch` 1
· `hd_o_dinnerprep` 1 · `hd_o_dinnerserve` 1 · fishday computed: cookblock 2, allergy 1, portions 1.
**Money checks (additive):** `hd_a_board` (transport authority) 1 · `hd_o_foodsource` 1 · `hd_o_tackleprep` 1 ·
`hd_r_sitecash` 1 · `hd_r_settle` 1.
**Frame gates:** abort-at-sea 2 · abort-night criterion 2 · health-report route 2 · hospital info shared 2 ·
budget authority 3 · reserve + draw rule 2 · load/relief 1.
**Tiers:** socket 1 · riskable socket 3 · lane 1 · decoy −2 / safety-flavored −3.

## 4. The full 89-atom inventory (derived output, frozen)

Generated by running the §3 rules over the template; verify asserts this table's sums. Ids follow
`<bucket>_<dim>_<key>`.

**Trip Frame — 14 pts, 7 atoms:** abort_sea 2 · abort_night 2 · health_report 2 · hospital_shared 2 ·
budget_authority 3 · reserve_drawrule 2 · load_relief 1 (dimension People, with People-specific reason keys).

**Arrival — 15 pts, 15 atoms + 3 debits:** Info: logi×ic_ferry, specialist×ic_tackle, chef×ic_food,
comms×ic_rooms (1 each). Exec lanes ×7: pm, logi(3 tasks), siteLead, budgetLead, specialist, chef(2), comms.
Safety: hd_a_safety 1. Quality: dinnerprep 1, dinnerserve 1. Money: hd_a_board 1. Decoys: nightfish(safety),
sightseeing, soloTackle.

**Ops — 18 pts, 18 atoms + 3 debits:** Info: specialist×ic_weather, specialist×ic_tackle, logi×ic_catch,
chef×ic_food, comms×ic_catch (1 each). Exec lanes ×5: logi(3), specialist, chef(4), budgetLead(2), comms.
Safety: hd_o_weather 1, hd_o_safetywatch 1. Quality: foodprep, lunch, dinnerprep, dinnerserve (1 each).
Money: hd_o_tackleprep 1, hd_o_foodsource 1. Decoys: sidefish, marketrun, longlunch.

**Fishing Day — 41 pts, 28 atoms:** Info ×14 sockets = 22: chef×ic_food 1, chef×ic_weather 1, chef×ic_orgfood 1,
**specialist×ic_menu 3**, specialist×ic_tackle 1, **siteLead×ic_menu 3**, **siteLead×ic_target 3**,
siteLead×ic_weather 1, siteLead×ic_headcount 1, **specialist×ic_ground 3**, chef×ic_ground 1, chef×ic_catch 1,
logi×ic_catch 1, comms×ic_catch 1. Exec lanes ×8: budgetLead(2), comms(5), chef(7), logi(2), specialist(6),
siteLead(5), owner(1 flex), pm(1 flex) — **no safetyLead lane** (its whole day is the three gates).
Safety: t_f_weather 3, t_f_seawatch 2, t_f_health 2. Quality: cookblock 2, allergy 1, portions 1.

**Return — 12 pts, 12 atoms + 3 debits:** Info: logi×ic_cash, siteLead×ic_cash, pm×ic_return (1 each).
Exec lanes ×5: logi(3), budgetLead, siteLead, pm, comms. Safety: hd_r_headcount 1, hd_r_boarding 1.
Money: hd_r_sitecash 1, hd_r_settle 1. Decoys: sidetrip, extraservice, latefish.

## 5. Socket semantics

- **Keyed (role × card), not per wire and not per task.** One drawn arrow is one player decision; redundant
  arrows can't inflate the score, and one arrow feeding two tasks of the same role isn't billed twice.
- **Self-owned pairs are excluded** (producer role = consumer role — the role holds its own cards from
  DAY_START; no arrow can exist). Fishday's 20 task-level pairs reduce to 14 sockets: 4 self-owned excluded,
  2 collapsed (specialist×ic_ground feeds rig+fish; chef×ic_catch feeds sideprep+fillet).
- **Collapsed consumers — the worst consumer decides:** the socket is on time iff *every* consuming task has
  the card by its own scheduled start (matches the engine's per-task min-over-arrows checker).
- **Riskable** iff the card appears in any consuming task's `assumeOn` (data-driven; yields exactly
  specialist×ic_menu, siteLead×ic_menu, siteLead×ic_target, specialist×ic_ground). Price 3, split 1 "specified"
  (an arrow exists → not 迷い) + 2 "on time" (→ not 手待ち/wrong-fish). Never drawn loses 3; drawn-but-late
  loses 2 (status `present-but-late`, earns 1). Standard socket: on time 1, late or missing 0.
- Sockets are priced from the **template's** required set; the denominator never changes with the player's plan.
  An unplaced consumer task makes its socket `missing`.

## 6. Seed & teaching-gradient contract

The seed (gappy fishday arrows — 9 of 14 withheld incl. 3 of 4 riskable + 1 late on chat — plus half-cleared
Arrival and the 7 classic frame gaps) is retained. Requirements: the gappy seed grades **D** (target band
45–60); the true canonical (all classic fixes + all arrows + all three days authored) scores **100/A/clean**
with `tripEfficiency` 100; **`fixHandoffs` is strictly the largest single jump** from the seed — larger than
authoring Arrival and every classic fix; the cumulative fix ladder is monotone. After SP2 lands, the measured
values (seed total, per-bucket earned, the jump) are **pinned exactly** in verify — band assertions are
retired. Re-tuning the seed thereafter requires changing the pins deliberately, spec-first.

## 7. Player-facing contracts

### 7.1 Live mode (the unshipped "P4", now specified)
Live plays the Fishing Day with classic fixes pre-sounded and canonical placements; only arrows are in play.
**Win = Fishing Day bucket earned 41/41 and dinner served ≤ 18:00.** The result panel states it in ledger
currency — "Fishing Day: 41 of its 41 trip points · dinner 18:00" — plus day efficiency. The stale
"Efficiency N%, score 100 · A" string is deleted. Soft-fail keeps naming the surviving gap (card → task),
never a person. The Live dashboard reads the ledger like every other mode; `liveToReport` already recomputes
the full trip report. Gap pacing stays per-arrow this release; convergence-grouping remains backlog.

### 7.2 scoreDay demoted, the 89 cap dies everywhere
`scoreDay`/`projectedDay` leave the player-facing surface entirely: day reports and the coarse-day live
dashboard show the day's **trip slice** ("Fishing Day: 33 of its 41 trip points") from `scoreTrip.byBucket`
plus that day's labeled efficiency; setup projections preview the same slice by running `scoreTrip` on the
hypothetical plan. The engine-side 8-category machinery (`score()`, `scoreDay`) remains internal where it still
feeds the fix-pack, individuals, and team panels, but its totals, grades, and the !clean→89 cap may not be
rendered. SP3 removes `scoreDay`'s grade/cap from the UI; verify's old scoreDay-grade anchors are rewritten to
ledger-slice equivalents (e.g. canonDay(arrival) ⇒ arrival earned 15/15).

### 7.3 One efficiency per screen, always labeled
Trip-scoped runs show `tripEfficiency` labeled trip-wide; day-scoped runs show that day's `daySchedule`
efficiency labeled with the day name. The two never appear unlabeled or mixed in one sentence; report chips and
dashboard must draw from the same scope as their headline.

### 7.4 Status → chip → reason taxonomy (complete)
Statuses: `ok` · `missing` (迷い — never specified) · `late` (手待ち — arrived late, 0 earned) ·
`present-but-late` (**new chip "Partial / 部分点"** — riskable socket drawn but late, 1 of 3) · `broken` (dep
order / misassigned) · `overlap` (double-booked) · `compressed` (durMin under the template floor — **only**
that; a late dinner on the cookblock atom reports `late`, fixing the current mislabel) · `decoy`. Every
dimension uses its own reason-key family (`scr_people_*` added for load_relief — no more borrowed exec keys).
`LEDGER_TITLE` moves into i18n; i18n EN/JA key parity becomes a verify assertion.

## 8. Verification contract (the pins)

verify.js asserts, in addition to all surviving anchors: (1) atom count === 89; (2) Σ maxPts === 100 on gappy
AND canonical; (3) byBucket === {frame 14, arrival 15, ops 18, fishday 41, return 12} and byDimension ===
{info 34, exec 25, safety 20, quality 10, money 10, people 1}; (4) **Σ atoms.earned === total** (clamped) on
gappy, canonical, and every ladder step; (5) exact seed pins — gappy total/grade, per-bucket earned, the
fixHandoffs jump value, cumulative monotone ladder to 100/A/clean; (6) a constructed **withheld-A** case
(≥90, not clean, grade B, gate.withheldA true); (7) a constructed **drawn-but-late riskable** socket earning
1/3 with status `present-but-late`; (8) redundant-arrow non-inflation at the atom level; (9) determinism +
purity (scoreTrip mutates nothing, never calls score()); (10) i18n symmetric-key parity; (11) tripEfficiency
pinned on seed and canonical. The 16 dead §19 grid checks and `dayLayout`/`derivedHandoffs`/`HOUR_DT` are
deleted (the outstanding §21.8a retirement).

## 9. Implementation program

- **SP2 — engine + verify** (Opus builds, Sonnet supports, Fable QA-gates): the generic deriver replaces the
  five hand builders; flag data added per §3.4; shared `GRADE_BANDS`; cookblock/people fixes per §7.4;
  `daySchedule` computed once per segment per `scoreTrip` call (today it's recomputed per lane atom); §8 pins;
  dead-code retirement. Acceptance: `node verify.js` exit 0 with the new constitution; the report UI still
  renders (money/safety atom ids change — `ledgerItemName` resolves task-homed atoms automatically, shrinking
  the hand-kept `LEDGER_ITEM_NM` list).
- **SP3 — UI/Live migration** (Sonnet, Opus on Live): §7.1–§7.4 in full; also stop rebuilding the hidden 8-cat
  scorecard each render, and `applyDayFixAndRerun` persists the placement patch (closing the known ~92 cap on
  "Auto-arrange the arrows"). Acceptance: verify green + headless EN/JP runs of Live win, Live soft-fail, a
  coarse-day report, and the full-trip report, zero JS errors.
- **SP4 — docs + close-out** (Sonnet, Fable review): README rewritten for the ledger era; CLAUDE.md §15
  refreshed and a §24 as-built added; v0.3 blueprint marked superseded-by-this-doc; multi-lens adversarial
  review; owner decides the GitHub Pages push.

## 10. Deliberate deltas vs the shipped as-built (the record)

1. **Dawn go/no-go 3pts** (was 2) — the trip's heaviest gate, restoring v0.3 §3.4's intent.
2. **No safetyLead Fishing-Day exec lane** (was 1pt) — all three of its tasks are safety gates; uniform
   replace semantics forbid double-billing. Fishday exec 9→8 atoms.
3. **`return_safety_evac_plan` retired** — it re-billed `frame_hospital_shared`. Replaced by
   `return_safety_hd_r_boarding` (boarding confirmed), and Return gains the siteLead exec lane. Return
   composition: exec 4→5, safety 3→2.
4. **Money atoms are task-homed** with derivable ids (`arrival_money_hd_a_board` vs the hand-named
   `transport_auth`) so their ledger names resolve from task data.
5. Atom count 90 → **89**. All other prices, all 26 sockets, the riskable set, frame gates, decoy debits, and
   both matrix axes are unchanged from the as-built.
6. *(integration amendment)* Retiring `return_safety_ship_staffed` de-priced the classic `returnLogi` gap; the
   clean gate gained the no-live-detector clause (§2) so that gap withholds the A instead of vanishing.
   Verified by a constructed skip-setReturn case (100 points, grade B, withheldA).
7. *(as-built note)* Coarse quality/safety/money atom ids are task-homed like every derived atom
   (`arrival_quality_hd_a_dinnerprep`, `ops_safety_hd_o_weather`, …), and `return_safety_hd_r_headcount` is a
   plain coarse gate (the `ic_return` delivery is priced by the `return_info_pm_ic_return` socket, not the gate).

## 11. Out of scope

Convergence-grouped Live pacing; new content atoms (NO-GO branch, spoilage, per-guest allergies — each lands
by re-running §3 and re-balancing spec-first under the Σ=100 pin); GitHub repo rename; any server/DB/build
tooling (permanent §11 core constraint).
