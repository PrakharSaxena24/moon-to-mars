# The Hikone Morning — Playable Tutorial Rebuild

**Status:** Playable rebuild implemented; owner playtest and push approval pending
**Updated:** 2026-07-21
**Product relationship:** A standalone first-play tutorial, separate from the Ogasawara campaign
**Working title:** The Hikone Morning / 彦根の朝
**Review gate:** Do not push the rebuild until the owner can play the complete path and approves it

This is the authoritative handoff for future sessions and agents. The owner-provided story facts below
must not be replaced by web research or invented lore.

## Implementation checkpoint — 2026-07-21

- `hikone.html`, `hikone.css`, and `hikone.js` now implement the embodied arrival → packing → drive →
  Lake Biwa → home loop described below.
- The rejected card, effort-number, progress-bar, large-panel, and Next-screen architecture is removed.
- The player directly uses Cap and Towel, fills the empty tanago box, experiences two-person carries,
  may cause the drinks detour, baits/casts/catches both animals, recovers from the wrong container, and
  places the two animals into separate home aquariums.
- `hikone-verify.js` executes the full deterministic success/refusal/recovery path and pins direct
  manipulation, no-scroll, language, reduced-motion, restart, isolation, and old-architecture
  rejection. All 180 tutorial checks pass.
- The existing Ogasawara regression suite remains green with all 621 checks passing.
- Wide and phone environmental-shell renders passed before controller integration. A supported live
  browser binding was unavailable after integration, so a real owner/browser playthrough is still a
  release gate; do not describe the pre-controller screenshots as final gameplay evidence.
- Do not commit, push, or replace the live tutorial until the owner reviews this local rebuild.

## 1. Why the previous version was rejected

The first implementation was an illustrated training presentation, not a game. It used cards, effort
numbers, progress bars, large text panels, validation gates, and repeated Next-style transitions. The
world, people, car, equipment, and animals were decorative. It stopped at readiness instead of letting
the player fish.

Delete that interaction architecture. In particular, do not restore:

- task cards, member lanes, effort values, queue totals, scores, thresholds, or progress bars;
- a forced bad answer followed by a written explanation of the correct answer;
- large modal panels covering the world;
- a sequence where most actions only advance narration;
- a guaranteed success animation disconnected from the player's physical actions;
- a Lake Biwa scene with no baiting, casting, catching, or animal transfer.

The tutorial must use this loop:

> **notice → act on the world → see a physical consequence → revise → succeed**

## 2. Locked owner facts

- Exactly three people travel: **Watanabe-san and two companions**.
- The two companions are temporary visual roles called **Cap** and **Towel** in implementation notes;
  these are not approved real names.
- The player directly uses Cap and Towel to prepare the trip. The player is not a fourth traveler.
- The scene starts before dawn outside **Ryokan Izumi in Yokkaichi**.
- Watanabe-san arrives in **his own car**, proposes going to Hikone, and drives.
- The destination is **Lake Biwa in Hikone**.
- The companions must prepare:
  1. fishing rods;
  2. worms as bait for tanago;
  3. chicken as bait for suppon;
  4. a holding box filled with water for caught tanago;
  5. a separate aquarium transport tank for a suppon; and
  6. drinks for the road.
- Caught tanago and suppon are brought home for **separate aquariums**, not eaten.
- The treatment is symbolic planning fiction, not real animal-care or fishing instruction.
- The exact facade, car model, likenesses, and companion names remain replaceable until the owner
  supplies references.

## 3. Fable consultation — decisive direction

Fable was consulted headlessly at maximum effort without repository access or tools. No private source
or workspace file was shared. Three independent internal reviewers separately reached the same product
diagnosis.

Fable's replacement concept is:

> **THE TRUNK IS THE PLAN — STOW, THEN DEPLOY**

At Ryokan Izumi, the player handles real objects and gets them into Watanabe's trunk. At Lake Biwa,
the same trunk opens with the same arrangement and the player deploys those objects into the world.
Readiness is stored in physical state, not text or numbers:

- the tanago box is visibly empty or full of water;
- the hook is bare, worm-baited, or chicken-baited;
- the tanago and suppon have visibly separate containers;
- forgotten drinks cause an observable roadside delay;
- unused companions visibly wait while the other works.

One owner requirement strengthens Fable's proposal: Cap and Towel remain directly player-controlled.
The player gives normal objects to either companion so both can work at the same time. Heavy prepared
containers require both companions. There is no character-selection form; assignment happens by
touching and dragging people and objects in the scene.

## 4. Core play grammar

### Canonical input

- Pointer/touch: drag an object to Cap, Towel, or a valid world target.
- Tap/keyboard fallback: select an object, then activate the person or target.
- Native semantic controls and visible focus are required.
- A direct manipulation should produce feedback within 100 ms.
- Invalid actions must bounce/refuse visibly and point toward the next useful target; never show a
  generic error modal.

### Preparation actions

- Give rods, worms, chicken bait, and drinks to Cap or Towel.
- The chosen companion physically checks/carries the object to the trunk or cabin.
- Both companions may work concurrently.
- Trying to load the empty tanago box produces a hollow `kon-kon`, returns it, and highlights the tap.
- Place the box under the tap to fill it; the waterline must visibly rise and slosh.
- The filled box is heavy and requires both companions to carry it.
- The separate suppon tank also requires both companions.
- The preparation area visibly empties as the trunk fills.
- Watanabe remains beside his car and is never an assignment target.
- The car may leave without drinks so the player can experience the omission; all fishing equipment and
  containers are required before departure.

### Planning lesson

The lesson is not “balance two numbers.” The player learns:

1. translate Watanabe's intent into visible things and states;
2. give real work to both available people so one does not stand idle;
3. test readiness through physical evidence;
4. experience the downstream cost of an omission;
5. use the same prepared plan when circumstances change at the lake.

No score, capacity puzzle, countdown, visible timer, or single perfect assignment is required.

## 5. Target first-play flow

### 0:00–0:18 — Arrival

- Predawn Ryokan Izumi. Cap and Towel wait in the gravel forecourt.
- Watanabe's light-colored wagon arrives, suspension settles, and the hatch opens.
- Watanabe says only the equivalent of: **“Lake Biwa—let's go. I'll drive; you two prepare.”**
- Tanago, suppon, and aquarium-not-food meaning are communicated with restrained visual thought cues.
- If the player waits six seconds, one legal object glints once.

### 0:18–1:40 — Pack the real trunk

The player uses Cap and Towel on six physical preparations: rod bundle, worm jar, chicken bait tray,
empty clear tanago box beside the outdoor tap, separate suppon tank, and drinks at the vending machine.

- After the first assignment, the other idle companion gives a subtle hand cue toward another object.
- Normal jobs run concurrently when both companions are used.
- Empty-box refusal teaches that naming an item is not enough; its state matters.
- Filled box and suppon tank use a short two-person carry.
- Trunk positions remain stable so the player builds a spatial memory of the plan.
- Departure is a physical action on the hatch/car, not a Next button.

### 1:40–2:00 — Yokkaichi to Hikone

- A short one-way side-scrolling trip connects the two places.
- If drinks were packed, a bottle is passed forward and Watanabe gives a relieved sigh.
- If drinks were forgotten, Watanabe pulls over at a roadside machine. The player watches a short delay
  caused by their omission; the run continues without failure.
- A wordless beat makes clear that tanago and suppon are going to aquariums, not a meal.

### 2:00–3:20 — Use the plan at Lake Biwa

- The hatch reopens and holds for a beat, showing the same object arrangement.
- Move rods to the jetty.
- A bare-hook shallow cast makes tanago inspect and refuse it; the worm jar pulses.
- Put a worm on the hook, cast to shallow water, react to the bobber, and land a tanago.
- Drag the tanago into the water-filled box; it settles and swims calmly.
- Put chicken bait on the hook. A shallow cast is refused and the deeper suppon ripple pulses.
- Cast deep and complete a short hold/tap struggle to land the suppon.
- If the suppon is dragged to the tanago box, the fish scatter, the suppon snaps at the outside, and the
  separate tank glows. It then bounces back safely.
- Move the suppon into its separate tank.
- Missed bite/fight timing gives a deterministic retry within four seconds, never a loss screen.

### 3:20–3:35 — Payoff

- Watanabe claps, hands out the prepared drinks, and the three share a small `kanpai`.
- Wide Lake Biwa view: tanago in its water box, suppon in its separate tank, car and Hikone horizon.
- Minimal text: **“Good prep.” / 「いい準備だ。」**
- Crossfade to the two separate home aquariums, followed by a quiet continuation/replay choice.

Target completion time is three to five minutes. No single non-interactive beat should exceed 20 seconds.

## 6. World and visual direction

- The physical scene owns the viewport. No dashboard, card tray, or large reading panel.
- Fixed logical stage around 960×600, uniformly scaled to fit the browser; portrait may recompose to
  600×960 while preserving the same objects and relationships.
- Full-height `100dvh` shell with no document scrollbar or horizontally clipped essential content.
- Predawn indigo, warm ryokan light, freshwater turquoise, reed green, sunrise peach, and cream car.
- Cap wears a red cap; Towel wears a blue towel/scarf; Watanabe stays anchored to the driver side/key.
- Do not put A/B/W letters on their chests.
- Props use strong CSS/HTML silhouettes and thick outlines: rods/reels, lidded worm jar, sealed chicken
  bait, transparent box with waterline, latched/pumped separate tank, bottle carrier, hook/bobber,
  tanago, and suppon.
- Hit areas are at least 64 px for core world objects.
- Contextual speech/objective copy is one or two short lines and never covers the main action.
- Physical sound is optional and always paired with a visual response.

## 7. Deterministic state boundary

Suggested serializable state:

```text
scene: arrival | packing | drive | lake | home
actors.cap: idle | working | carrying | helping
actors.towel: idle | working | carrying | helping
items.<id>.location: bench | tap | actor | trunk | cabin | shore | hook | container
tanagoBox.filled: boolean
hook.bait: bare | worm | chicken
tanago: water | hooked | landed | box
suppon: water | hooked | landed | tank
drinksPacked: boolean
drinkDetourSeen: boolean
```

- Use a finite scene state machine and pure drop/action rules where practical.
- Every scene owns and clears its timers.
- Do not use `Math.random()` in the playable path.
- Preserve a dedicated, versioned local completion key and never touch Ogasawara campaign state.
- Reduced-motion mode preserves direct user dragging but replaces autonomous travel/carry/camera motion
  with clear before/after states and crossfades.

## 8. Acceptance gates

### Product comprehension

- 9/10 cold players begin a useful interaction within 10 seconds of control.
- 8/10 infer the tap after the empty-box refusal.
- 8/10 infer worms after the bare-hook refusal.
- 8/10 move the tanago into the water-filled box without explanatory prose.
- 10/10 reroute the suppon after the wrong-container refusal.
- A text-blanked build remains completable within 15% of normal completion time.
- After play, most players can explain: prepare before leaving; both companions can work; the tanago
  box needed water; the animals need separate containers; forgetting drinks caused the stop; the
  animals are for aquariums.

### Technical and accessibility

- Complete by pointer drag, tap-only, keyboard-only, one-thumb portrait, English, and Japanese.
- Every failed action exposes an actionable next cue within three seconds.
- Reduced motion and muted sound preserve all information.
- No page scrollbar at 1440×900, 1280×720, 390×844, 320×568, and 640×360.
- No console/runtime errors, uncaught timers, random outcomes, dead-end states, or campaign-state writes.
- Automated verification must specifically fail the rejected cards/effort/progress/Next architecture.
- A real visual playthrough must cover: normal path, empty-box refusal, missing-drinks detour,
  bare-hook refusal, wrong suppon container, portrait, short landscape, and reduced motion.

## 9. Implementation surface

- `hikone.html` — standalone semantic shell and controls.
- `hikone.css` — full-screen world, objects, characters, responsive/reduced-motion presentation.
- `hikone.js` — deterministic model, scene controller, direct manipulation, sound, bilingual copy.
- `hikone-verify.js` — static and pure-state contract verifier for the playable loop.
- `index.html` / `i18n.js` / `style.css` — existing standalone entry from the journeys menu.

Vanilla HTML, CSS, and JavaScript are sufficient. The rejected version failed because of its interaction
model, not its technology stack. Consider a more complex engine only after this embodied vertical slice
proves fun and the team needs larger maps, physics, content tooling, or many additional campaigns.
