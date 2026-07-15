# Teaching MVP — from plan checker to learning game

**Status:** SHIPPED + 2026-07-15 mastery refinement — 513 deterministic checks
plus headless browser coverage for curriculum, causal clusters, exact editor
routing, prediction/debrief, outage repair, versioned authoring persistence,
event pacing, EN/JA rerendering, focus restoration, and hostile local data.

This specification adds a learning layer to Ogasawara Rehearsal without
replacing its deterministic simulation, whole-trip score ledger, authoring
editor, or Canvas stage. The simulation continues to diagnose the plan. The
new layer must establish whether the learner can diagnose the next plan with
less help.

## 1. Product and learner contract

The learner is the **AIBOS rehearsal lead**, commissioned by AEGIS to prepare
the team before the real Ogasawara trip.

The human outcomes are:

1. all 24 people return safely;
2. hosted guests are cared for and never abandoned by the operating plan;
3. the relationship with the invited counterparties is strengthened;
4. the AIBOS team can execute, communicate, adapt, and learn without blaming
   an individual for a system-design failure.

The operational thesis remains:

> Responsibility is not authority, authority is not information, and
> information has a clock.

The opening must not claim that `100 = nobody waits`. **100 means mastery of the
clean modeled plan**; time efficiency is a separate outcome, and unresolved
external facts may still prevent the plan from being ready for real execution.
Plan mastery is not a personnel rating or a direct rating of the learner as a
person.

## 2. Measurable learning objectives

After completing the Teaching MVP, a learner should be able to:

1. distinguish a missing fact, a late fact, missing authority, missing
   capacity, and a missing physical resource;
2. predict where a plan will stall and cite evidence from the plan;
3. select a feasible communication channel for the sender/receiver context;
4. explain why a repair changes the causal chain rather than merely identifying
   the button that raises the score;
5. apply the same diagnosis to a communications-outage variation;
6. name one analogous risk in the learner's own project.

The existing 100-point ledger measures **mastery of the plan artifact**:
`100 / 100 + clean + zero causal roots` is Plan Mastery. It is not an employee
performance score and does not independently certify the learner's general
competence beyond this modeled plan.

## 3. Three learning levels

The learning level is orthogonal to the existing Live/Morning application
mode and is persisted locally.

### Learn

- Keeps the guided Live experience, consequence previews, and causal fix pack.
- Explains channel feasibility and the missing/late/rework taxonomy.
- Does not require a prediction before a run.
- May reveal the cause, but all scored authoring changes remain manual.

### Practice

- Opens Plan First.
- Requires a prediction before Run: expected root-cause category plus a short
  rationale.
- Hides exact pre-choice verdicts and point deltas where they would give away
  the answer.
- Retains post-run causal feedback.

### Challenge

- Opens Plan First with projected score/readiness answers hidden until the run
  is submitted. There is no score-granting auto-fix in any level.
- Requires a prediction.
- Applies the deterministic Communications Outage scenario.
- Opens on Fishing Day and layers an unavailable phone onto the at-sea catch
  relay until the learner explicitly chooses a fallback; that layer is confined
  to Challenge and never mutates the normal authored plan.
- Does not label a channel choice correct/incorrect before commitment.
- Shows full evidence and debrief only after the run.

## 4. Prediction, debrief, and local attempts

Practice and Challenge runs require one prediction record:

```js
{
  level,
  segment,
  scenarioId,
  cause,       // missing-info | late-info | authority | capacity | resource
  rationale,
  createdAt
}
```

The report adds an after-action review:

- the learner's prediction;
- the first observed causal category and evidence;
- why the chosen repair works;
- where the pattern could occur in another project.

The last five completed attempts are kept in `localStorage`. Free text is
local-only, escaped before rendering, and never affects simulation or score.

## 5. Rehearsal completion versus execution readiness

`scoreTrip` remains the stable 100-point plan ledger. Unknown owner-supplied
route facts do not create invented point deductions.

The engine adds:

```js
criticalAssumptions(plan) -> Assumption[]
executionReadiness(plan) -> {
  status,
  rehearsalComplete,
  realExecutionReady,
  assumptions,
  unresolved,
  unresolvedCount
}
```

Statuses are:

- `rehearsal-incomplete`
- `rehearsal-complete`
- `real-execution-ready`

A 100/clean mastered rehearsal with unresolved critical assumptions must say that the
rehearsal is complete **pending confirmation**, never `READY TO RUN` or
`ready to run for real`.

The initial critical assumptions are already represented in route data:

- Tokyo-hotel breakfast time;
- inter-island vessel identity and Chichijima connection times;
- Day-6 guest-exchange route, timing, and luggage-handoff owner attestation;
- return timetable.

## 6. Channel feasibility

The existing numeric `CHANNELS` latency API remains compatible. Feasibility is
an additional pure check:

```js
channelFeasibility(plan, handoff, segment?) -> {
  ok,
  reason,
  channel,
  segment,
  fromContext,
  toContext
}
```

Stable reasons:

- `ok`
- `unknown-channel`
- `requires-colocation`
- `scenario-channel-unavailable`

At minimum, face-to-face and a notice board cannot carry a Fishing-Day
sea-to-shore message. Canonical radio relays remain valid. An infeasible
delivery is unresolved; the UI may explain it but may not silently award an
on-time socket.

## 7. Deterministic Communications Outage

The engine exposes `SCENARIOS` and:

```js
applyScenario(cfg, id) -> clonedCfg
```

`normal` preserves every shipped score and schedule anchor.

`comms-outage` makes phone, chat, and notice-board delivery unavailable for
at-sea communication; radio remains available. It is deterministic, pure, and
contains no probability. It exists to test whether the learner understood
channel context rather than memorized the lowest latency.

## 8. Feedback and privacy guardrails

- A stalled person remains evidence of a plan condition, never an employee
  grade.
- Learner-facing copy uses "conditions experienced by each role/member" rather
  than implying a personality or performance appraisal.
- Learn may reveal an answer; Practice delays it; Challenge withholds it until
  submission. Revealing or focusing an answer never mutates the scored plan.
- All new controls work with pointer, touch, and keyboard.
- EN/JA keys are added together and parity remains verified.
- Reduced-motion behavior remains unchanged.

## 9. Acceptance contract

### Engine

- Every pre-existing verification check passes.
- Canonical normal plan remains 100/clean and mastered.
- Critical assumptions are deterministic and do not mutate the plan.
- A 100 plan with unknown route facts is rehearsal-complete but not
  real-execution-ready.
- Sea-to-shore face-to-face is infeasible.
- Under outage, phone/chat/board fail at sea and radio succeeds.
- Applying a scenario does not mutate its input configuration.

### UI

- First-run mission identifies the learner and human outcomes.
- Learn, Practice, and Challenge persist and remain separate from Live/Morning.
- Practice/Challenge cannot launch without a prediction.
- Challenge does not expose answer labels before submission; no level exposes
  a score-granting auto-fix.
- The report renders prediction, actual evidence, reflection fields, and the
  last five escaped attempt records.
- A 100 rehearsal with unknown facts never displays real-world-ready copy.
- The active rules explain the current 99-atom, seven-bucket, six-dimension
  ledger and Score/Efficiency distinction.
- EN and JA flows, keyboard focus, Escape, reduced motion, and the existing
  Live/Morning paths remain functional.

## 10. Progressive onboarding refinement (2026-07-14)

The first-session presentation follows progressive disclosure without removing
any curriculum or planning capability:

- Opening a link shows a stable, non-autoplay poster, one guided-rehearsal
  primary action, and a secondary route to the full plan.
- The guided path starts from the canonical Day 3 plan with only the food-menu
  handoff removed. The learner observes that single stall, chooses a feasible
  channel, sees one recovery beat, and reaches the result without waiting for
  the rest of the simulated day to animate.
- Guided channel choices use qualitative pace and before/after-deadline
  feedback. Minute math and projected points remain internal until the result.
- A successful guided report headlines the clean Fishing Day result and causal
  repair; whole-trip scoring and detailed assumptions remain optional detail.
- The success state offers progression into planning as the primary action,
  with review and replay secondary.
- Mission options, cast, advanced settings, score anatomy, ledger detail, and
  role-by-role results remain available through named native disclosures.
- Live mode initially prioritizes the map, the current problem, and the repair;
  telemetry and dashboard detail do not compete with that decision.
- Plan readiness exposes the first three actionable issues and keeps every
  additional issue in an expandable list instead of discarding evidence.
- The full planner preserves Practice/Challenge, starts at the first relevant
  chapter, scopes the command tray to that day, and collapses the whole-trip
  score preview and expert settings.
- Learn keeps the full reflection form collapsed for a calm first report, but
  preserves the observed pre-repair gap and shows one compact causal takeaway;
  Practice and Challenge open the prediction/evidence comparison because it is
  part of their required loop.

This is a presentation rule, not a reduced model: the full six-segment planner,
99-atom ledger, execution-readiness distinction, bilingual strings, and all
deterministic scoring behavior remain intact.

## 11. Cluster-first mastery refinement (2026-07-15)

This section supersedes §10's “first three actionable issues” planner rule. The
planner now discloses the whole campaign as seven score-conserving clusters,
then expands one causal root at a time.

### 11.1 Seven-cluster experience

`planClusters(plan)` is a pure lens over `scoreTrip`, `dayReadiness`, and the
classic detectors. It returns, in trip order:

| Cluster | Exact maximum |
|---|---:|
| Trip Frame | 11 |
| Load & Board | 10 |
| Outbound Voyage | 11 |
| Arrival | 12 |
| Operations | 13 |
| Fishing Day | 34 |
| Return | 9 |

The collapsed state shows earned/max, Mastered/Needs work, and root count.
Expansion shows grouped causal roots with affected task/card/role/item/guest,
the human consequence, and points unavailable. The sum of cluster maxima is
100, the sum earned is the displayed trip total, and every failed atom belongs
to exactly one root. Clustering must never create a second score.

Each root carries a JSON-safe `editorTarget`: detector, budget, role, guest,
manifest, task, handoff, or card. **Open plan**, **Take me there**, report stage
markers, and next-issue navigation must reopen the owning cluster/day drawer
and focus the exact editable control. Reports show one actionable issue row
first and keep the remaining rows under an explicit “more issues” disclosure;
each row carries its own exact navigation target.

### 11.2 Plan mastery and existing-atom bindings

The whole-plan Mastered state requires all of:

```js
scoreTrip(plan).total === 100
scoreTrip(plan).gate.clean === true
clusters.every(c => c.earned === c.maxPts && c.rootIssues.length === 0)
```

The constitution remains 99 atoms with Σ `maxPts === 100`. Newly explicit
requirements close former “100 but unclean” loopholes by gating existing atoms:

- the Frame's 2-point critical-information atom requires both hospital access
  and ferry/connection sharing;
- Load hold safety, Arrival Logistics execution, and Return Site Lead execution
  require complete physical custody at their respective handovers;
- Return Logistics execution requires ownership of ship-out/headcount work;
- an outbound guest's care atom fails when the buddy's care work overlaps; and
- required flex/standby work gates the existing Load headcount, Voyage watch,
  or Fishing-Day sea-watch atom when incomplete or overloaded.

No point or row is added. Efficiency and real-execution readiness remain
separate. A 100 plan may therefore be mastered and rehearsal-complete while
still pending five external confirmations.

Player-facing progress uses only earned/max and Mastered/Needs work. Any legacy
letter-grade field retained by the engine is compatibility/history data and
must not reappear as a competing mastery scale in the planner, report, or
public rubric.

### 11.3 Manual authoring and session safety

All player-facing former Auto-fix/Auto-arrange actions are navigation-only.
Hints may explain or focus; only explicit learner authoring may change score.
Load, Arrival, and Return expose every manifest item on every custody task, and
editing a checkbox writes that task's `carries[]`.

Morning state autosaves after a debounce in a v1 envelope under
`prs_authoring_plan`. Opening the app discovers but never applies it. The menu
provides explicit Resume, confirmed New rehearsal, Export, and Import. Import
is limited to 1 MiB and validates exact schema keys plus every task/person/
role/card/item/channel reference, seat uniqueness, buddy cap, and relay link.
Unknown versions, hostile shapes, and partial writes fail closed; the current
visible plan and previous saved record remain unchanged.

The in-planner Reset rehearsal action is independently confirmed and clears all
six day overrides plus frame, budget, role, buddy, custody, and selected-day
state before the fresh state is autosaved.

### 11.4 Event-beat pacing

Event beats is the default for every authored run. It advances through empty
clock ticks until a task state, handoff, stall/recovery, checkpoint/banner, or
finish event changes. Full clock exposes every ordinary tick. Both controls
must produce byte-equivalent final schedule evidence and the same score/result;
they change presentation only.

### 11.5 Day-3 food strategies

The food/allergy-list root (`ic_food → t_f_menu`) has three authored solutions:

| Choice | Consequence |
|---|---|
| Direct and fast | Face-to-face, 04:45 arrival, 15-minute margin, one transmission, no path-failure tolerance |
| Delegated relay | Budget Lead → Comms by radio → Chef by phone, 04:52 arrival, 8-minute margin, two transmissions and one real relay prerequisite |
| Redundant paths | Independent radio + phone, first arrival 04:46, 14-minute margin, two transmissions, tolerates loss of either one path |

All three clear the same causal root and can retain 34/34 Fishing Day and
100/100 plan mastery. Redundancy never adds score; losing both paths restores
one root, not two penalties.

### 11.6 Acceptance additions

- `node verify.js` passes **513/513**.
- Cluster maxima/root partition/editor targets are deterministic, pure, and
  score-conserving on gappy, partially fixed, and canonical plans.
- Every modeled custody, return-ownership, ferry-sharing, care-overlap, and
  flex gap debits an existing atom; canonical remains exactly 99 atoms / 100
  maximum points.
- Navigation assistance never changes Score; custody edits do.
- Persistence rejects invalid/oversize/incompatible input atomically and never
  surprise-resumes.
- Event beats and Full clock converge on the same result.
- The three food routes expose distinct consequence vectors and the same
  mastery ceiling.
- EN/JA text and keyboard focus behavior remain equivalent.

## 12. Explicitly deferred

- A multi-scenario resilience score;
- additional storm, low-catch, unavailable-principal, spoilage, and allergy
  scenarios;
- person-skill/stamina effects on assignment;
- a second non-Ogasawara transfer simulation;
- instructor dashboards, network storage, or a backend;
- Word/PDF/Excel execution-pack export.

Those are the next program. This MVP first establishes the curriculum and
assessment loop on the stable existing simulator.
