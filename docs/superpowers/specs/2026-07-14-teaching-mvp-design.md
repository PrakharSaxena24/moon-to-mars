# Teaching MVP — from plan checker to learning game

**Status:** SHIPPED (2026-07-14) — 431 deterministic engine checks plus
headless browser coverage for curriculum, prediction/debrief, outage repair,
EN/JA rerendering, focus restoration, persistence, and hostile local data.

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

The opening must not claim that `100 = nobody waits`. A 100-point plan is a
sound **rehearsal model**; time efficiency is a separate outcome, and unresolved
external facts may still prevent the plan from being ready for real execution.

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

The existing 100-point ledger measures the **plan artifact**. It is not a
learner-mastery score and must never be described as one.

## 3. Three learning levels

The learning level is orthogonal to the existing Live/Morning application
mode and is persisted locally.

### Learn

- Keeps the guided Live experience, consequence previews, and full fix pack.
- Explains channel feasibility and the missing/late/rework taxonomy.
- Does not require a prediction before a run.

### Practice

- Opens Plan First.
- Requires a prediction before Run: expected root-cause category plus a short
  rationale.
- Hides exact pre-choice verdicts and point deltas where they would give away
  the answer.
- Retains post-run causal feedback.

### Challenge

- Opens Plan First with projected score/readiness answers and auto-fixes hidden
  until the run is submitted.
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

A 100/A rehearsal with unresolved critical assumptions must say that the
rehearsal is complete **pending confirmation**, never `READY TO RUN` or
`ready to run for real`.

The initial critical assumptions are already represented in route data:

- Tokyo-hotel breakfast time;
- inter-island vessel identity and Chichijima connection times;
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
  submission.
- All new controls work with pointer, touch, and keyboard.
- EN/JA keys are added together and parity remains verified.
- Reduced-motion behavior remains unchanged.

## 9. Acceptance contract

### Engine

- Every pre-existing verification check passes.
- Canonical normal plan remains 100/A/clean.
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
- Challenge does not expose answer labels or auto-fixes before submission.
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

## 11. Explicitly deferred

- A multi-scenario resilience score;
- additional storm, low-catch, unavailable-principal, spoilage, and allergy
  scenarios;
- person-skill/stamina effects on assignment;
- a second non-Ogasawara transfer simulation;
- instructor dashboards, network storage, or a backend;
- Word/PDF/Excel execution-pack export.

Those are the next program. This MVP first establishes the curriculum and
assessment loop on the stable existing simulator.
