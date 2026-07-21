# The Hikone Morning — Campaign-Aligned Tutorial

**Status:** Campaign-aligned rebuild implemented locally; automated gates pass; owner/browser playtest pending
**Updated:** 2026-07-21
**Product relationship:** A separate first-play story that teaches the Ogasawara campaign's real interaction grammar
**Working title:** The Hikone Morning / 彦根の朝

This is the authoritative handoff for future sessions and agents. Read this file before changing
`hikone.html`, `hikone.css`, `hikone.js`, or `hikone-verify.js`. The owner-provided story facts in
section 2 must not be replaced by web research or invented lore.

## 1. Product decision

The earlier physical-adventure rebuild was substantially more playable than the rejected slideshow,
but it still taught the wrong product. It asked the player to drag gear, fill a box, bait a hook,
cast, reel, and place animals. The Ogasawara campaign instead asks the player to:

> **plan → freeze the plan → run automatically → observe causal evidence → jump to the exact plan
> control → revise → rerun**

The Hikone tutorial must use that same grammar. The Ryokan, people, car, trunk, road, Lake Biwa, and
aquariums remain, but the physical world is now **execution evidence**, not a separate adventure-game
control system. The timeline is the control surface.

The hard semantic-parity gate is:

> After completing Hikone, the campaign may introduce more content and complexity, but it must not
> introduce a new core interaction verb.

The tutorial player must already know how to place/assign/time work, connect information, Run, read a
person's status, open a causal report, return to the implicated edit, revise, and rerun.

## 2. Locked owner facts and names

- Exactly three people travel:
  - **Watanabe-san / 渡邊さん** — authoritative Kanji: `WORLD.md:50,156`;
  - **Prakhar / プラカール** — authoritative Japanese: `WORLD.md:125`;
  - **Nishinaga / 西永** — authoritative Kanji: `WORLD.md:124`.
- Prakhar uses the prior red-cap visual cue. Nishinaga uses the prior blue-towel/scarf visual cue.
  Those are accessories, not player-facing names or model IDs.
- The player controls the plan for Prakhar and Nishinaga. The player is not a fourth traveler.
- Watanabe-san owns and drives a **Mercedes-Benz G-Class / Geländewagen (ゲレンデ)**. Its exact
  generation and color remain unspecified. He states the intent and departure deadline, waits
  during preparation, and is never an assignment lane or an automatic problem solver.
- The story begins before dawn outside **Ryokan Izumi in Yokkaichi**.
- The destination is **Lake Biwa in Hikone**.
- Preparation covers:
  1. fishing rods;
  2. worms for tanago;
  3. chicken bait for suppon;
  4. a water-filled tanago transport box;
  5. a separate suppon carrier/tank; and
  6. drinks for the road.
- Tanago and suppon are brought home alive for **separate aquariums**, never for food.
- This is symbolic planning fiction, not fishing or animal-care instruction.

## 3. Exact shared gameplay grammar

The standalone tutorial mirrors these campaign concepts:

| Campaign | Hikone tutorial |
|---|---|
| `#fd-deck` unplanned task chips | `#hk-deck` unplanned morning work |
| per-person authored lanes | Prakhar and Nishinaga lanes |
| scheduled task blocks | 05:50–06:20 five-minute blocks |
| information sockets/arrows | live-transport plan face-to-face handoff |
| `#launch` freezes a plan snapshot | `#hk-run-plan` freezes a deep copy and fingerprint |
| automatic clock simulation | deterministic morning runner and actor statuses |
| waits/stalls on the world stage | Nishinaga waits at the trunk; empty box blocks loading |
| causal report/fix pack | first-root report with timestamp and evidence |
| `navigateToFault()` | `#hk-revise-plan` focuses the exact handoff/task control |
| rerun preserves authoring | revisions keep the player's plan and increment the attempt |

`engine.js` is loaded before `hikone.js`. The tutorial builds a minimal `plan.days.hikone` object and
calls the campaign's exported `daySchedule()` and `dayReadiness()` functions. The shared scheduler's
explicit `allowedRoleIds` contract models the cooperative cross-role carrier lift without suppressing
readiness evidence. A small tutorial-domain adapter remains only for the visible empty-water-box
consequence, because the full Ogasawara simulator and geography are not generic.

Do not use `P.createSim()`, `P.scoreTrip()`, `P.planClusters()`, or the Ogasawara stage renderer for
Hikone. Those are tied to the 10-day Ogasawara template and geography.

## 4. Seed plan and learning path

### Briefing

Watanabe-san arrives at Ryokan Izumi and says, in effect:

> “Hikone, Lake Biwa. I'll drive my G-Class. We leave at 06:20. Bring the tanago and suppon home
> alive, in separate aquariums—never as food. Prakhar, Nishinaga: prepare everything.”

### Transparent initial plan

The player sees the complete authored data; no hidden fact is sprung after Run.

| Time | Prakhar | Nishinaga |
|---|---|---|
| 05:50 | Confirm live transport | Gather worms + chicken |
| 05:55 | Gather rods | — |
| 06:00 | Load both carriers — cooperative span across both people |
| 06:05 | Fill tanago box | — |
| 06:10 | — | drinks begin in the unplanned deck |

The live-transport confirmation produces one information fact. Loading needs that fact. The initial
plan has no arrow. The tanago box's Fill task is also visibly scheduled after Load, and Drinks are
visibly unplanned.

An expert may repair all visible gaps before the first Run. There is no forced bad choice or locked
wrong answer.

### Canonical three-run learning path

1. **Run 1 — information wait**
   - The plan is deep-copied and fingerprinted.
   - At 06:00, Nishinaga waits at the trunk because the live-transport plan stayed with Prakhar.
   - The first-root report explains the person, place, time, and missing handoff.
   - **Show in plan** focuses the handoff control. The player may draw the face-to-face arrow or
     reassign the confirming task to the loading owner.

2. **Run 2 — dependency/order consequence**
   - The information reaches loading.
   - Loading then waits because Fill is scheduled after Load; the box is visibly still empty.
   - Drinks are also reported as unplanned and would cause an eight-minute roadside detour.
   - **Show in plan** focuses the Fill block. The player moves Fill before Load, moves conflicting
     work or reassigns it, and places Drinks from the deck.

3. **Run 3 — clean rehearsal**
   - A valid example is: Confirm/ Bait at 05:50, Fill/Rods at 05:55, both-person Load at 06:00,
     Drinks at 06:10.
   - Alternative non-overlapping schedules are valid. There is no single magic answer.
   - Both people finish the trunk by 06:20. The report says the rehearsal is clean.

### Payoff

A clean report unlocks the physical story:

- Watanabe-san drives his G-Class from Yokkaichi to Hikone.
- The same prepared trunk opens at Lake Biwa.
- A short authored montage deploys rods and bait, places tanago in the water-filled box, and keeps
  suppon in its separate carrier.
- The final view shows two separate home aquariums.
- The transfer line explicitly says that Ogasawara uses the same Plan → Run → Observe → Revise loop.

There is no gameplay-critical bait-drag/cast/reel/catch FSM. Fishing is the emotional payoff for a
clean plan, not a second unrelated tutorial game.

## 5. State boundary

The pure CommonJS/browser seam exports:

```text
PHASES, PEOPLE, ITEMS, TASKS, SLOTS, ACTIONS, STORAGE_KEY
freshState(), reduce(), derive(), simulatePlan()
buildCampaignPlan(), campaignEvidence(), planFingerprint()
saveCompletion(), loadCompletion()
```

Lifecycle:

```text
arrival → plan → run → observe ──revise──> plan
                          └──clean───────> drive → lake → home
```

Key contracts:

- Run accepts incomplete plans. A pre-run validation wall must never hide the lesson.
- `RUN_PLAN` freezes a deep copy and stable fingerprint. Later authoring cannot mutate the active
  run or report.
- Outcomes contain no `Math.random()` and do not change with display speed or reduced motion.
- Unknown actions and illegal phase jumps fail closed and never mutate caller-owned state.
- Reports preserve the authored plan. **Show in plan** navigates; it never auto-fixes.
- Watanabe-san is visible but absent from the controllable `PEOPLE` array.
- Completion is stored only under `prs.hikone-planning-tutorial.v3`, with matching envelope version 3.
- No campaign, authoring, learning-history, or sound storage key may be read, written, or removed.

## 6. Input and accessibility

- Pointer/touch: drag a task block or deck task onto a visible lane/time slot.
- Tap/keyboard: select a native task button, then activate a native lane/time slot.
- Both paths dispatch the same `MOVE_TASK` reducer action.
- Pointer cancel/lost capture cannot edit the plan.
- The handoff, Run, report, language, sound, replay, and campaign actions are native controls.
- Core task/slot controls are at least 44–48 px; primary actions are at least 52–64 px.
- Focus is visible. **Show in plan** moves focus to and pulses the exact implicated edit.
- Actor `working`, `waiting`, and `idle` states have text/live-region equivalents; color and motion
  are never the only evidence.
- EN/JA switching changes visible names and copy without resetting the plan.
- Reduced motion shortens autonomous transitions but preserves the exact state/outcome.

## 7. Full-screen and responsive presentation

- `html, body`, `.hk-app`, and `.hk-stage` own the viewport with `overflow:hidden`.
- Use `100vh` plus `100dvh`; honor all safe-area insets.
- No document-level horizontal or vertical scrollbar.
- The planner/report/run dock is a fixed internal overlay. Narrow timelines pan within an invisible
  internal rail (`scrollbar-width:none` / WebKit scrollbar hidden), never by expanding the page.
- Wide view: world above, planner roughly the bottom 46%.
- Portrait: world roughly 51%, planner 49%; the task timeline pans horizontally inside the panel.
- Short landscape: the planner may use up to 64% height so controls remain usable; the world remains
  visible as execution context.

Required viewport gates when a supported browser is available:

- 1440×900
- 1280×720
- 390×844
- 320×568
- 640×360

At each size: `scrollWidth <= innerWidth`, `scrollHeight <= innerHeight`, Plan/Run/Report controls are
reachable, and resize/orientation changes do not reset state.

## 8. Acceptance gates

### Semantic parity

- Player uses deck → arrange → connect → Run → report → exact fix → rerun.
- Run visibly follows authored owners and times.
- An incomplete plan can run.
- The active run reads only its frozen snapshot.
- A report names the first cause rather than blaming a person.
- **Show in plan** focuses the exact handoff or task.
- No auto-fix is present.
- No tutorial-only fishing interaction dominates or contradicts campaign play.

### Pure model

- Initial Run reports `missing-handoff` first.
- Adding the handoff reveals `bad-order`, plus `drinks-missing`.
- Moving Fill/Rods to a valid non-overlapping 05:55 arrangement and placing Drinks at 06:10 clears
  all roots and yields a 06:20 clean plan.
- Same plan JSON yields byte-equal simulation output.
- Moving a caller-owned plan after `RUN_PLAN` cannot change the frozen fingerprint/result.
- One-person overlap becomes causal evidence; a balanced valid plan has no overlap.
- Completion cannot persist after a failed run.

### Names and purpose

- Visible cast is exactly Watanabe-san/渡邊さん, Prakhar/プラカール, Nishinaga/西永.
- No player-facing Cap, Towel, キャップ, タオル labels remain.
- Watanabe-san is never assignable.
- Tanago and suppon visibly have separate transport/home containers and are explicitly not food.

### Technical

- `node hikone-verify.js` passes all 216 tutorial contract checks (2026-07-21).
- `node verify.js` passes all 622 Ogasawara regression checks and invokes the Hikone verifier
  (2026-07-21).
- JavaScript syntax checks and `git diff --check` are clean (2026-07-21).
- No console/runtime errors, dead-end states, random outcomes, stale timers, or campaign-state writes.

## 9. Implementation surface

- `hikone.html` — full-screen world plus semantic Plan/Run/Report overlay mounts; loads `engine.js`
  before `hikone.js`.
- `hikone.css` — world, two-lane planner, task deck/blocks, handoff, run dock, causal report,
  portrait/short-landscape/reduced-motion behavior.
- `hikone.js` — pure tutorial reducer, campaign-day adapter, deterministic runner, bilingual renderer,
  pointer/tap/keyboard input, dedicated completion storage.
- `hikone-verify.js` — hostile source and pure-model contract for the shared grammar.
- `verify.js` — single project gate that must also execute `hikone-verify.js`.
- `i18n.js`, `README.md`, `CLAUDE.md` — journey entry and durable documentation.

Vanilla HTML/CSS/JavaScript remains sufficient. The important complexity is causal simulation and
interaction parity, not a framework or 3D engine.

## 10. External design supervision status

The owner invited a Claude Code/Fable review and allowed relevant project context. Authentication was
available, but the managed approval reviewer classified the non-public design/workflow context as an
external data export and blocked the call before anything was transmitted. The owner was informed of
that specific risk and asked to reply **“approved for Fable”** if they want the external export. Until
that informed approval is received, no Fable claim may be made and no workaround may be attempted.

The local campaign audit independently produced the implementation above from `app.js`, `engine.js`,
`style.css`, `WORLD.md`, and the existing tutorial.
