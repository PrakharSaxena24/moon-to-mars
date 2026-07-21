# The Hikone Morning — Standalone Tutorial Plan

**Status:** Standalone vertical slice implemented; live browser viewport matrix pending  
**Date:** 2026-07-21  
**Product relationship:** A separate first-play tutorial beside, not inside, the Ogasawara campaign  
**Working title:** The Hikone Morning / 彦根の朝

This is the durable handoff for future sessions and agents implementing the first-play tutorial.
Owner-provided story facts in this document are authoritative. Do not replace them with assumptions
from web research.

## Implementation checkpoint — 2026-07-21

- `hikone.html`, `hikone.css`, and `hikone.js` implement the complete arrival → brief → serial
  baseline → causal reveal → two-lane assignment → parallel rehearsal → trunk proof → road vignette
  → Lake Biwa unload → debrief loop.
- The page uses code-native environment, vehicle, character, route, prop, trunk, and lake art with no
  external runtime or generated likeness assets.
- A freshwater-styled, bilingual, recommended-first card in `index.html` links to the standalone
  tutorial without loading or mutating the Ogasawara engine.
- `hikone.js` exposes a pure `HIKONE` model for deterministic card assignment and workload testing.
  Tutorial completion alone persists under a versioned, independent local-storage envelope.
- `hikone-verify.js` pins 100 story, workload, flow, isolation, viewport, input, accessibility, and
  reduced-motion contracts. All 100 pass, along with the existing 621 engine checks and UI/visual
  regression suites.
- Live browser inspection and screenshots were not fabricated: the session browser runtime reported
  no available in-app browser or Chrome binding. A future session should run the viewport matrix in
  section 9 before treating visual QA as complete.

## 1. Locked owner facts

- Exactly three travelers take the trip: **Watanabe-san, Member A, and Member B**.
- The player is the rehearsal lead and controls the preparation assignments for Member A and Member B;
  the player is not a fourth traveler.
- The scene begins outside **Ryokan Izumi in Yokkaichi**.
- Watanabe-san arrives in **his own car**, announces the trip, and remains the driver.
- The destination is **Lake Biwa in Hikone**.
- The two assignable members must prepare:
  1. fishing rods;
  2. worms for tanago;
  3. chicken bait for suppon;
  4. a water-filled holding box for caught tanago;
  5. separate aquarium-transport preparation for a suppon; and
  6. drinks for the road.
- Tanago and suppon are intended for separate aquariums, not food.
- The two members' names and appearances, Watanabe-san's exact car, and the exact ryokan facade are
  not yet supplied. Use neutral, clearly replaceable visual placeholders without blocking development.
- Keep the animal and transport treatment symbolic. This tutorial teaches planning; it is not
  real-world animal-handling guidance.

## 2. Fable review and design decision

Fable was asked, without repository access or tools, to challenge the lesson, flow, interaction,
graphics, mobile treatment, and emotional payoff. Its decisive recommendation was to replace the
earlier deadline/backward-planning concept with one simpler causal lesson:

> Turn a spoken request into visible tasks, give the work clear owners who can act in parallel, and
> confirm the evidence before saying the preparation is complete.

The implementation combines that recommendation with an independent learning-design review:

- all six requirements are stated up front, so the game does not manufacture a forgotten-item gotcha;
- the first rehearsal deliberately places the complete bundle with one member, showing a `12 / 0`
  serial queue while the other member remains available;
- the player repairs the **assignment**, not the people or the task durations;
- both member lanes then execute simultaneously;
- success is proven by the same six objects appearing in the car and again at Lake Biwa.

The teaching line is:

> **The list was complete. The assignment was not.**

The success line is:

> **Same people. Same work. Earlier departure.**

## 3. One causal mechanic

Preparation cards carry abstract **effort beats**. These are game values for comparing queues, not
claims about real preparation time.

| Preparation | Effort beats | Visible proof |
|---|---:|---|
| Fishing rods | 2 | Rod bundle secured in trunk |
| Worms for tanago | 1 | Labelled tub closed and loaded |
| Chicken bait for suppon | 1 | Sealed, clearly labelled bait pack loaded away from drinks |
| Water-filled tanago holding box | 3 | Translucent blue box with visible waterline and closed lid |
| Suppon aquarium transport preparation | 4 | Separate symbolic carrier marked for aquarium transport |
| Drinks for the road | 1 | Three-bottle carrier placed in the cabin |

Total work is 12 beats.

- Baseline: `12 / 0`; one long queue, one unused lane.
- The player must assign every card and use both members.
- A passing first plan has neither lane above 7 beats.
- Several assignments can pass; the tutorial never forces a job stereotype or a single memorized split.
- Each lane runs top to bottom and both lanes advance at the same time.
- A non-passing split identifies where work remains queued without blaming a person or moving a card
  automatically.

Reference balanced split:

- Member A: suppon transport `4` + chicken bait `1` + drinks `1` = `6`.
- Member B: tanago box `3` + rods `2` + worms `1` = `6`.

## 4. Target 5–8 minute flow

| Time | Scene and player action |
|---:|---|
| 0:00–0:20 | Cold open outside Ryokan Izumi. Watanabe-san's car arrives and the trunk opens. |
| 0:20–0:50 | Watanabe-san says they are going from Yokkaichi to Lake Biwa at Hikone, that he will drive, and names all six preparations. |
| 0:50–1:55 | A short deterministic baseline gives the bundled request to Member A. Member B remains visibly available while Watanabe-san and the car wait. |
| 1:55–2:25 | Causal freeze: `12 / 0`. Reveal: the list was complete, but ownership was not. |
| 2:25–4:10 | Player assigns the six illustrated cards to the two member lanes. Tap-card then tap-lane is primary; drag is optional. Live lane totals make the consequence predictable. |
| 4:10–5:00 | Rehearsal shows both members working concurrently and alternating deliveries to six trunk proof slots. A poor split can be revised free of charge. |
| 5:00–5:35 | Passing plan closes the trunk. Watanabe-san drives; a stylized route ribbon moves Yokkaichi → Lake Biwa, Hikone without asserting exact roads or journey time. |
| 5:35–6:25 | Lake Biwa payoff: the two members unload the exact objects they owned into separate tanago, suppon, and shared zones. Drinks stay with the travelers. |
| 6:25–7:05 | Debrief compares the serial and parallel queues, then asks one transfer question. Finish returns to the journeys menu; replay is secondary. |

The lake scene demonstrates preparedness, not a guaranteed catch. If animals appear, tanago are a calm
school or ripple and suppon is an underwater silhouette/bubbles. No trophy pose, food, cooking, or
unverified handling technique appears.

## 5. Opening dialogue

English draft:

> “Good morning. We're going from Yokkaichi to Lake Biwa at Hikone. I'll drive.”
>
> “You two prepare the rods and worms for tanago, chicken bait for suppon, a water-filled holding box
> for any tanago we catch, the separate aquarium transport setup for a suppon, and drinks for the road.”
>
> “The tanago and suppon are for aquariums, not food. Tell me when everything is loaded.”

Japanese draft:

> 「おはよう。これから四日市から彦根の琵琶湖へ行きます。運転は私がします。」
>
> 「二人で、タナゴ用の竿とミミズ、スッポン用の鶏肉、釣れたタナゴを入れる水入りケース、
> スッポンを観賞用に連れ帰るための別の運搬準備、それから道中の飲み物を用意してください。」
>
> 「タナゴもスッポンも食用ではなく観賞用です。全部、車に積めたら教えてください。」

Final bilingual copy needs owner review for tone, but the facts above must not change.

## 6. Visual and audio direction

The tutorial must not inherit the Ogasawara command-room look. Use its own freshwater identity:

- predawn blue, freshwater turquoise, reed green, and sunrise peach;
- a stylized ryokan entrance with an `Izumi / 泉` sign, small forecourt, and generic cream car;
- Watanabe-san visually anchored to the driver/car, never presented as an assignable destination;
- tactile field-note cards floating over the same live scene rather than a spreadsheet page;
- fish-scale, turtle-shell, and bottle symbols in addition to color;
- distinct prop silhouettes: long rod bundle, round worm tub, sealed labelled chicken-bait pack,
  translucent water box, low green transport carrier, and three-bottle drinks caddy;
- an open-trunk grid that receives each prepared object and preserves visible ownership;
- a short route ribbon and freshwater horizon as the emotional reward;
- restrained gravel, car, hatch, case click, water, bottle, road, wind, and lake cues, all optional.

The first vertical slice should use code-native HTML/CSS/SVG/Canvas shapes. Final likeness/environment
art should wait for approved reference material; generated art must not invent a real facade, vehicle,
or person.

## 7. Interaction, accessibility, and viewport rules

- One viewport owns the experience: `100dvh`, no document scrollbar during the tutorial.
- Internal panels may scroll only as a last-resort short-height/zoom accessibility fallback.
- Mobile uses a 2×3 card tray and two large member destinations; it never requires dragging.
- Every card is keyboard reachable; Space/Enter selects and the two member controls assign it.
- Minimum touch target is 44×44 CSS pixels; core text remains at least 16px on narrow screens.
- Status changes are mirrored to a polite live region, never communicated by animation or color alone.
- Reduced motion replaces the arriving car, card travel, worker motion, and route animation with
  equivalent before/after cuts; workload evidence and dialogue remain unchanged.
- Optional sound has an independent control and is never required to understand state.

## 8. Technical boundary

- Standalone no-build page and assets: `hikone.html`, `hikone.css`, `hikone.js`.
- Entry from the existing journeys menu may be a normal link; the Ogasawara runtime and engine are not
  dependencies of the tutorial.
- Use a separate, versioned local-storage key such as `prs.hikone-tutorial.v1`.
- Persist only tutorial completion/preferences; never mutate Ogasawara campaign state or score.
- Core state should be deterministic and serializable: scene, selected card, ordered assignments,
  lane loads, baseline/retry status, and completion.
- Expose pure workload validation for automated tests when practical.

## 9. Release gates

- All locked facts and all six items appear accurately in English and Japanese.
- There are exactly three travelers in story and visuals.
- Watanabe-san cannot receive a task and is clearly the driver/owner of the car.
- Baseline proves `12 / 0`; passing plans use both lanes and cap each at 7.
- A failed split is deterministic, blame-free, replayable, and costs nothing.
- The trunk and Lake Biwa scenes preserve all six prepared objects.
- Aquarium purpose is explicit; food/cooking and real handling instruction are absent.
- No horizontal or document-level vertical scrollbar at 1440×900, 1280×720, 390×844, 320×568,
  and 640×360; core controls remain reachable.
- Keyboard-only, touch/tap, Japanese, and reduced-motion paths complete the tutorial.
- No runtime or console errors; local state is separate from Ogasawara.

## 10. Deferred owner inputs

These improve fidelity but do not block the vertical slice:

- names and visual identities for Member A and Member B;
- Watanabe-san's car type/color and whether it should be recognizable;
- approved facade/sign reference for Ryokan Izumi;
- approved Watanabe-san likeness if desired;
- final Japanese dialogue tone;
- whether the Lake Biwa vignette should show only readiness or a restrained catch outcome.
