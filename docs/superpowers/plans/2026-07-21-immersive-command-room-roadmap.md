# Ogasawara Command Room — Immersive Campaign Roadmap

**Status:** Three-run vertical slice implemented; expansion gated on playtesting
**Date:** 2026-07-21
**Product:** Ogasawara Rehearsal / 実行前シミュレーター
**Implementation state:** Phases 0–4 implemented for Normal → Communications Outage → Principal Unavailable
**Primary outcome:** Turn the current deep planning simulator into a full-screen, emotionally legible, replayable learning campaign.

This document is the durable handoff for future sessions and agents. It is linked near the top of the authoritative [`CLAUDE.md`](../../../CLAUDE.md).

## Implementation checkpoint — 2026-07-21

The recommended vertical slice is now in the product:

- the active rehearsal owns a `100dvh` shell with no document-level run scroll, a stage-owned action dock, and desktop/mobile overlay dashboards;
- the opening presents Guided Lesson, Campaign, Resilience Challenge, and an expert whole-plan shortcut;
- Guided hands only the learner-authored food-route repair into Campaign and never carries its staged canonical fixes;
- a versioned campaign progresses through Normal Load, Communications Outage, and Principal Unavailable episodes using Observe → Diagnose → Edit → Rehearse;
- authored plans are editable between episodes and frozen only after lock/during the run; incidents, scenario evaluation, and recovery never edit the plan;
- failed attempts are free and visibly counted, replay the same seed and pre-episode `RunState`, and cannot consume resources or badges;
- successful carryover is deliberately small and visible: team capacity, intervention tokens, operational debt, and resilience badges;
- intervention can recover the principal-unavailable run at the documented token/wait/debt cost, but awards no resilience badge;
- reports lead with a named person, cause, operational consequence, and response before mastery, efficiency, resilience, and debt;
- principal absence is enacted in the runtime presentation (Matsumoto is unavailable), not introduced only in the report;
- presentation bridges add causal beats, route transitions, named priority-guest/buddy cues, sound-optional semantics, reduced-motion equivalents, and assistive-technology mirrors;
- automated Chrome QA passes at 1440×900, 1280×720, 390×844, 320×568, and a 640×360 short-height/zoom-equivalent stress case with exact viewport-sized documents, no page scroll, no runtime/console errors, stable dashboard overlays, and a Japanese reduced-motion smoke test;
- mobile runs start with the dashboard closed and remove setup-only header actions, leaving the map as the primary surface; run-HUD actions retain high-contrast text and focus treatment.

Storm/no-go and low-catch definitions exist only as deterministic engine hooks. They are intentionally dormant in the player-facing campaign until playtests show that the three-run loop is understood and voluntarily replayed.

An independent, source-free Fable product critique returned a conditional go and shaped the explicit between-run contract, reveal-as-diagnosis framing, free deterministic retries, bounded/provenanced carryover, costly intervention with no badge, and debrief-first teaching emphasis. No private repository source or screenshot was sent to that external reviewer.

The automated release gates are green: all 621 engine checks, UI and audiovisual regressions, eight JavaScript syntax checks, EN/JA key parity, unique-ID validation, whitespace validation, and the target Chrome viewport matrix pass. Remaining evidence is human and operational: run facilitated 20–30 minute playtests, measure whether players can explain cause → consequence without the ledger, and tune pacing/copy from observation before enabling additional incidents.

---

## 1. Owner intent

The requested direction is:

- remove the page-like feeling, including the document scrollbar and partially visible game screen;
- make the experience feel like one immersive command room;
- make it compelling enough that people voluntarily spend time replaying it;
- teach the importance of planning through visible human and operational consequences;
- deepen the game without diluting its existing deterministic, non-blaming thesis.

“Compelling” must come from mastery, consequence, curiosity, and meaningful alternatives—not dark patterns, arbitrary grind, or opaque randomness.

---

## 2. Current diagnosis

### 2.1 The run screen is still a webpage

The current CSS makes vertical scrolling structurally likely:

- [`style.css`](../../../style.css) gives `body` top/bottom padding and only hides horizontal overflow (`style.css:28-36`).
- The header consumes additional height and margin (`style.css:52-56`, with a compact run variant at `style.css:1621-1634`).
- `.sitemap` alone is `clamp(460px, 74vh, 780px)` (`style.css:380-381`).
- The Live dock, legend, run options, controls, and log sit below the map in [`index.html`](../../../index.html) (`index.html:298-335`).
- The dashboard is a sibling column rather than a viewport-owned overlay (`index.html:337-365`).

The result is a tall document containing a game, rather than a game viewport containing temporary panels.

### 2.2 The strongest loop is focused, but the product expands too quickly

Guided Live has a strong teaching beat: one missing handoff creates a visible stall, the player repairs it, and the simulation resumes. After that, the learner enters a much denser planner containing:

- seven causal clusters;
- a plan stage and command tray;
- a chapter browser;
- day drawers and All Settings;
- a score rail and several disclosure surfaces.

These are valuable expert tools, but they compete as mental models when exposed together.

### 2.3 Replayability falls after the canonical plan is learned

The engine is a strong deterministic mastery puzzle, but only `normal` and `comms-outage` scenarios exist today. The three Day-3 food strategies are the best prototype for replayable planning because they trade time margin, coordination effort, and redundancy while reaching the same mastery ceiling.

### 2.4 The mission promises people, but reports lead with machinery

The product story is about safe return, guest care, trust, and learning. Reports currently emphasize score, ledger, fix-pack, and role metrics before the named human consequence. The simulation already contains the evidence needed to reverse that order.

---

## 3. North star

### Ogasawara Command Room

A full-screen, deterministic planning campaign in which every decision visibly affects named people across one continuous expedition.

The target loop is:

> **Observe → Predict → Plan → Lock → Reveal incident → Run → Recover at a cost → Debrief → Carry consequences forward**

The map is the world. Controls, explanations, and reports temporarily slide over it instead of pushing it down the page.

---

## 4. Non-negotiable product principles

1. **Deterministic and explainable.** The same plan plus the same scenario produces the same result.
2. **Planning—not reflex—is the skill.** Presentation may be tense; input timing must not become the learning gate.
3. **100/100 remains plan mastery.** Do not replace or inflate the frozen 99-atom, 100-point constitution.
4. **Resilience is a separate lens.** Scenario badges or a profile may sit beside mastery; they must not become a competing plan score.
5. **Diagnose systems, never grade people.** Temporary capacity can affect execution, but avoid personality/skill ratings that imply employee blame.
6. **Multiple sound plans.** Important problems should allow at least two viable strategies with different costs and vulnerabilities.
7. **Immersion and reflection have different jobs.** The run should feel immediate; the debrief should step back and explain.
8. **Bilingual, keyboard-accessible, reduced-motion safe, and sound-optional.** These are release gates, not later polish.
9. **Offline-first remains valid.** Do not require a backend to prove the campaign loop.

---

## 5. Program phases

## Phase 0 — Full-screen game shell

### Objective

Eliminate document scrolling during active play and make the complete operational picture visible at once.

### Layout model

- `body.screen-run` owns exactly one dynamic viewport (`100dvh`) and hides document overflow.
- The run header becomes a compact HUD row or overlay.
- `#run`, `.runwrap`, `.run-main`, and the map column form a `min-height: 0` height chain.
- `.sitemap` becomes the flexible remaining area instead of using a fixed `74vh` height.
- The dashboard becomes a right overlay drawer on desktop and a bottom sheet on narrow screens.
- The Live decision dock overlays the bottom of the stage and reserves only the space it actually needs.
- Only drawers/sheets may scroll internally. The stage and document stay fixed.
- Safe-area insets are honored on mobile.
- An optional Fullscreen API control may hide browser chrome, but the layout must work correctly without it.
- Planning and report screens should progressively adopt the same stage-owned shell after the run view is stable.

### Acceptance criteria

- No page scrollbar on the run screen at 1440×900, 1280×720, 390×844, or 320×568.
- The entire map remains visible while the primary action is available.
- Opening the dashboard does not resize the map unpredictably or move the player away from the active incident.
- A dashboard longer than the viewport scrolls internally.
- Browser zoom at 200% retains a usable keyboard path; accessibility may permit controlled internal scrolling.
- Mobile browser toolbar expansion/collapse does not crop the action dock (`100dvh`, not only `100vh`).
- Reduced-motion mode receives equivalent static focus and state cues.

---

## Phase 1 — One coherent journey and chapter campaign

### Objective

Replace overlapping mode choices and the “everything at once” planner transition with a clear progression.

### Entry choices

Present three user-goal choices:

1. **Guided Lesson** — recommended first play; one focused causal repair.
2. **Campaign** — plan and master chapters in sequence.
3. **Resilience Challenge** — advanced stress tests against mastered plans.

Treat Live/Plan First and Learn/Practice/Challenge as implementation state behind these choices rather than two independent player-facing taxonomies.

### Chapter structure

After Guided, activate one mission instead of opening every system:

> **Load & Board:** Get all 24 people and the jig case aboard before departure.

Each chapter follows four visible states:

1. **Observe** — watch or inspect the symptom without revealing the answer.
2. **Diagnose** — predict the cause and evidence.
3. **Edit** — expose only the relevant authoring surfaces.
4. **Rehearse** — run and compare the result.

Suggested chapter order:

1. Load & Board
2. Outbound Voyage
3. Arrival
4. Operations
5. Fishing Day
6. Return
7. Whole-trip mastery

Keep **View whole plan** for experienced players.

### Progress payoff

Persist and display:

- chapters mastered (`3 / 7`);
- best result for each chapter;
- planning strategies discovered;
- resilience badges earned;
- prediction accuracy or Challenge completion;
- one unambiguous next action.

### Acceptance criteria

- A first-time player makes a meaningful decision within 45 seconds.
- Guided completion leads to one next mission, not the complete control surface.
- A chapter can be completed in roughly 5–8 minutes during a normal first playtest.
- Every screen has one visually dominant next action.
- Expert users can reach the existing full planner without replaying onboarding.

---

## Phase 2 — Deterministic resilience campaign

### Objective

Create replayability by testing the same authored plan under changing, reproducible constraints.

### Scenario grammar

Generalize the existing `SCENARIOS` / `applyScenario` surface in [`engine.js`](../../../engine.js) into composable modifiers such as:

- weather and time-window changes;
- communication/payment/vessel availability;
- low catch or increased resource demand;
- principal or role unavailability;
- guest and safety constraints;
- pre-run versus checkpoint revelation.

Curated scenario IDs remain the primary content unit. A seed may select a documented, reproducible modifier set, but must never create opaque dice-driven failure.

### First scenario set

1. **Communications outage** — already shipped; use it as the compatibility anchor.
2. **Storm / no-go** — proceed with safeguards, postpone, or activate a shore/fallback plan.
3. **Principal unavailable** — test whether authority, deputy assignment, and information were truly shared.
4. **Low catch** — choose fallback supply, menu substitution, or a budget/quality tradeoff.
5. **Final resilience test** — combine two known constraints only after the player has learned each separately.

### Resilience display

Prefer named badges/profile rows over another percentage:

- Communications resilient
- Weather resilient
- Delegation resilient
- Supply resilient

Plan mastery remains `100 / 100` and does not change merely because a scenario is selected.

### Generalized strategy sockets

Turn the three Day-3 food routes into a reusable data-driven pattern. Add a small number of high-value decision families:

- rough-sea response;
- cash/payment contingency;
- guest-care/watch allocation;
- return custody/transfer strategy.

Each option should expose a measurable vector such as:

```text
time margin · coordination work · cash cost · fatigue load · redundancy · scenario vulnerability
```

### Acceptance criteria

- Every scenario is deterministic and pure.
- At least two strategies can succeed in each scenario, with different costs.
- No one strategy dominates normal plus all contingency scenarios.
- Scenario application never mutates the caller's plan/configuration.
- The normal canonical plan and frozen mastery ledger remain unchanged.
- Scenario results are exportable/replayable by ID and seed.

---

## Phase 3 — Stateful execution and costly recovery

### Objective

Make whole-trip execution strategically different from static plan repair.

### Minimal `RunState`

Carry only a few legible values across segments at first:

```js
{
  cashReserve,
  teamCapacity,
  criticalInventory,
  guestWait,
  interventionTokens,
  operationalDebt,
  resilienceBadges
}
```

Possible later additions include ice, food/fuel buffers, fatigue by role group, and inventory condition. Do not begin with a large resource economy.

### Recovery rules

An intervention must consume or displace something:

- spend reserve;
- consume an intervention token;
- add coordination workload;
- move or delay another task;
- consume a redundant path;
- accept guest wait or later fatigue.

The report distinguishes:

- **plan repair** — changes the next rehearsal;
- **live recovery** — saves this run but incurs debt;
- **carryover consequence** — affects a later chapter.

### Acceptance criteria

- The same starting plan and scenario produce the same carried state.
- A live rescue never silently edits the mastered plan.
- At least one early decision has a visible later-day consequence.
- Carryover values remain few enough to explain in one compact panel.
- Saved/imported campaign state has an explicit version and migration path.

---

## Phase 4 — Human stakes and premium presentation

### Objective

Coordinate existing art, animation, sound, and simulation evidence into emotionally timed cause-and-effect moments.

### Causal micro-scene contract

For every important stall and repair:

1. A named person visibly stops.
2. Camera, lighting, and sound focus attention.
3. The missing information/item/authority becomes visible.
4. The player chooses a repair or recovery.
5. The handoff or resource visibly travels.
6. The recipient reacts, recovers, and resumes.
7. Downstream stations visibly settle or remain at risk.

Target 1–2 seconds for the presentation beat after the engine state changes. Never delay control long enough to feel like an unskippable cutscene. Reduced-motion mode receives a static equivalent.

### Named relationships

- Make the four priority guests visually distinct.
- Show buddy pairs during boarding and meals.
- Make the Day-6 guest exchange visible.
- Let reports name the affected person and downstream consequence.

Example report lead:

> The missing allergy note stopped Kimura, delayed dinner 30 minutes, and forced the kitchen to redo its work. Your radio route removed that wait.

Then show mastery, efficiency, resilience, and the next mission.

### Route signatures

Use the existing scene-change detection for restrained location transitions:

- pullback/crossfade/title beat;
- location-specific ambient blend;
- a clear arrival/departure cue;
- no sound-only information.

### Acceptance criteria

- A playtester can explain cause → consequence after watching without opening the ledger.
- The report's first paragraph names a person, cause, operational effect, and player repair.
- Every audio cue has an equivalent visual/state cue.
- Presentation never changes engine outcomes.

---

## 6. Recommended first vertical slice

Do not build the whole roadmap at once. Prove this compact three-run mini-campaign first:

### Run 1 — Normal

- Full-screen shell.
- Existing missing food handoff.
- Guided repair and human-first report.

### Run 2 — Communications outage

- Carry the same authored plan forward.
- Ask the player to choose direct, delegated, or redundant delivery.
- Award the Communications Resilient badge when appropriate.

### Run 3 — Principal unavailable

- Reveal the incident after plan lock.
- Test deputy authority plus information sharing.
- Give one intervention token; using it saves the run but records operational debt.

### Vertical-slice definition of done

- No document scroll during any run.
- One continuous campaign state connects all three runs.
- At least two viable planning approaches exist.
- Each run produces a named human consequence.
- The final debrief shows mastery, efficiency, resilience badges, intervention debt, and one transfer question.
- A player can replay from Run 1 with a different strategy.

Only after this loop feels replayable should the campaign expand to storm, low catch, full cross-day resources, or additional route chapters.

---

## 7. Target screen flow

```text
Poster / mission choice
        ↓
Guided Lesson ───────────────┐
        ↓                    │
Campaign Map                 │
        ↓                    │
Chapter Brief → Observe → Diagnose → Edit
                                  ↓
                           Lock + Incident
                                  ↓
                         Full-screen Rehearsal
                                  ↓
                        Human-first Debrief
                                  ↓
                     Carryover + Next Chapter

Expert shortcut: Poster → View whole plan
Advanced route: Campaign mastery → Resilience Challenge
```

---

## 8. Technical entry points

| Area | Current entry point | Expected work |
|---|---|---|
| Viewport shell | `style.css`, `index.html` | `100dvh` run shell, height chain, overlay drawer/sheet, safe areas |
| Screen state | `app.js` body `screen-*` / `mode-*` classes | unify player-facing entries and chapter progression |
| Guided handoff | `app.js` Guided Live functions | preserve as the first campaign lesson |
| Clusters | `engine.js:planClusters`, `app.js:buildPlanClusters` | chapter gating and focused target presentation |
| Scenarios | `engine.js:SCENARIOS`, `applyScenario` | composable deterministic scenario definitions |
| Strategy prototype | `engine.js:DAY3_FOOD_*`, `applyDay3FoodStrategy` | data-driven strategy families and consequence vectors |
| Recovery | `engine.js:intervene` | explicit recovery costs and operational debt |
| Carryover | simulation creation/summary APIs | versioned `RunState` folded between segments |
| Presentation | `stage.js`, stage bridges in `app.js` | deterministic causal beat contract and named relationships |
| Sound | `sound.js` | state-aligned cues and route blends; never sole signal |
| Language | `i18n.js` | EN/JA parity for every new state and report sentence |
| Verification | `verify.js`, `ui-regressions.js`, `visual-regressions.js` | invariants, scenario purity, viewport/interaction probes |

---

## 9. Playtest measures

These are product targets, not scoring rules:

- first meaningful decision within 45 seconds;
- first completed run within 5–8 minutes;
- zero page scroll during active play at target viewports;
- player can name the root cause after the run without reading the full ledger;
- player voluntarily retries at least one scenario with a different strategy;
- at least two strategies are observed across a small playtest group;
- players distinguish plan mastery, execution efficiency, and resilience;
- players can explain one transfer lesson for a different real project.

Because the product is offline-first, early measurement can be facilitator observation and a local, explicitly exportable playtest summary. Do not add telemetry before consent and product need are clear.

---

## 10. Do not prioritize yet

- more static task cards or roster size;
- more decorative particles, textures, or maps before the shell and loop are fixed;
- a second 0–100 resilience score;
- pure random incidents;
- individual personality/skill ratings that risk employee blame;
- AI-generated risks or plans;
- multiplayer, cloud saves, instructor dashboards, or a backend;
- Word/PDF/Excel export;
- a large resource economy;
- additional control panels that compete with the stage.

---

## 11. Verification gates for every phase

1. `node verify.js` remains green.
2. EN/JA key parity remains exact.
3. Normal canonical mastery stays 100/100 with the frozen atom count and maxima.
4. Scenarios and carryover are deterministic and do not mutate caller-owned data.
5. Keyboard, focus restoration, reduced motion, and sound-off paths remain equivalent.
6. Target viewport screenshots or browser checks cover desktop and mobile.
7. The run screen has no document-level overflow.
8. New drawers/sheets expose correct dialog/expanded semantics and keep focus visible.
9. Saved state is versioned, bounded, validated, and migrated deliberately.
10. Presentation code never writes scoring or simulation truth.

---

## 12. Delivery sequence

Each step should be independently reviewable and shippable:

1. **Shell:** full-screen run viewport and overlay dashboard.
2. **Journey:** three entry choices and one chapter after Guided.
3. **Payoff:** human-first report plus persistent chapter progress.
4. **Campaign:** three-run normal/outage/unavailable-principal vertical slice.
5. **Tradeoffs:** generalized strategy sockets and resilience badges.
6. **State:** limited carryover and costly recovery.
7. **Feel:** causal micro-scenes, named relationships, and route signatures.
8. **Expansion:** storm, low catch, and additional campaign chapters.

Do not start step 8 until playtests show that players understand and voluntarily replay steps 1–7.

---

## 13. Recommended defaults for open product choices

| Choice | Recommended default |
|---|---|
| Mobile dashboard | Bottom sheet over a persistent map |
| Desktop dashboard | Right overlay drawer, collapsible |
| Incident reveal | After plan lock; objective known, exact failure withheld in Challenge |
| Scenario selection | Curated deterministic episode IDs; optional shareable seed |
| Resilience feedback | Named badges/profile, not another percentage |
| First carryover values | reserve, team capacity, critical inventory, intervention tokens |
| Fullscreen API | Optional enhancement; never required for correct layout |
| Session length | 5–8 minutes per chapter; 20–30 minutes for the first mini-campaign |
| Help model | symptom → guided question → target navigation; no score-granting auto-fix |

---

## 14. Design references

- Project scope and explicitly deferred next program: [`README.md`](../../../README.md), “Scope (Teaching MVP)”.
- Current authoritative product history and contingency designs: [`CLAUDE.md`](../../../CLAUDE.md), especially §§13, 16, 31, and 32.
- Subset Games' *Into the Breach* postmortem frames feature cutting, difficulty, and RNG as explicit design decisions: <https://gdcvault.com/play/1026333/-Into-the-Breach-Design>
- A 2025 serious-game study reports that immediate visible outcomes, realistic resource conflict, iterative rounds, and reflection supported memorable and shareable learning: <https://www.frontiersin.org/journals/water/articles/10.3389/frwa.2025.1539080/full>
- A serious role-playing framework argues for separating immersive enactment from reflection so learners can adopt a third-person perspective: <https://www.frontiersin.org/journals/computer-science/articles/10.3389/fcomp.2020.00028/full>

---

## 15. Agent handoff instruction

When a future session is asked to “make Ogasawara more immersive,” “remove scrolling,” “add replayability,” or “take the game to the next level”:

1. Read this document in full.
2. Read the current owner amendments at the top of [`CLAUDE.md`](../../../CLAUDE.md).
3. Inspect the current code and git history; do not assume this proposal is already implemented.
4. Work from the earliest incomplete delivery-sequence step.
5. Preserve the non-negotiable principles and verification gates above.
6. Update this roadmap deliberately when a product decision changes.
