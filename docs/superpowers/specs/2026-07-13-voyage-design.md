# The Voyage — the full-trip campaign (Load & Board · Ship Day · carryover · named guests · sound)

**Status:** APPROVED (owner picks 2026-07-13: Shape A full voyage · real carryover · named guests + buddies ·
the 4 main guests each get a dedicated member who registers Starlink on their phone via the company credit
card and escorts them to ship meals · sound is the only "completeness" item · owner: "go ahead and execute").
**Allocation (standing rule):** Sonnet executes · **Opus is the senior dev — every wave's final code needs an
Opus approval** · Fable ONLY for the V1 engine core and the program-end everything-check.
**Constraints (absolute):** offline/no-build/no-libs, ES5, deterministic, EN/JP parity, the §11 charter.
Two new files authorized by precedent: none for V1/V2 (engine/app absorb it); **`sound.js`** in V3.

---

## 1. The campaign — seven phases, one receipt

`AUTHORABLE` grows to **`['load','voyage','arrival','ops','fishday','return']`** (+ the frame). The player
plans the WHOLE journey:

| Seg | Day · window | The plan | Signature lesson |
|---|---|---|---|
| `load` *(new)* | Day 0 · 06:00–11:00 Tokyo, hour-level | pack manifest → truck to the pier → hold loading → cabin list → boarding 点呼 — against the **fixed 11:00 sailing** | what misses the ship cannot be fixed at sea |
| `voyage` *(new)* | Day 0 · 11:00–21:00 aboard, hour-level | the 4 **VIP Starlink registrations** (buddy + company card), **meal escorts** (lunch 12:00 / dinner 18:00 windows), luggage-to-cabin runs, arrival briefing | care is a schedule; a double-booked buddy is a stalled guest |
| `arrival` | *(exists; its ferry-boarding tasks re-read naturally as the island docking morning)* | | |
| `ops` / `fishday` | *(exist; fishday remains the heart)* | | |
| `return` | **reshaped to Pack & Sail**: settle books → pack → hold loading → sail home → Tokyo headcount (keeps 7 buckets, not 8) | close the loop you opened |

## 2. The manifest & real carryover (V1 — the Fable core)

- **`plan.manifest`**: physical items `{id, name{en,jp}, kind, forSeg}` — rod sets, jig case, coolers, ice,
  food crates, the medkit, the cash box, and per-VIP luggage. Load-day tasks carry custody
  (packed → trucked → in hold → aboard); Pack & Sail mirrors it home.
- **`carryState(plan)`** — a pure, RNG-free function folding the ordered segments' `daySchedule` outcomes
  into item availability per segment. Downstream binding uses the EXISTING `neededResources` field: a task
  needing an item that never made the ship stalls (`waitinfo`-style) or reworks — the same visible language
  as information gaps. `daySchedule(plan, seg)` gains the carry input internally; its signature and all
  existing single-day behavior stay byte-compatible when every item is aboard (the canonical case — pinned).
- **Scoring stays principled (causes not consequences):** the Load/Pack tasks, hand-offs and gates are priced
  by the §3 derivation rules in their own buckets; a downstream stall from a missing item bills **Efficiency
  and the visible run only** — never double-billed in the Score.

## 3. Named guests & the care roster (V1 core + V2 surface)

- **`plan.guests`**: 13 entries, WORLD.md-consistent. The **4 VIPs** (Nagatani, Kadou + the two most senior
  rotation guests per WORLD.md §3) carry needs: `starlink` (register on THEIR phone, paid via the **company
  credit card** — a new `bl_card` budget envelope with approver + payMethod) and `escort` (each ship meal
  window). The other 9 stay light (name + party only).
- **`overrides.buddies` `{guestId: pid}`** — assigning a buddy auto-instantiates that VIP's voyage tasks
  (registration in a fixed purser-desk window; lunch/dinner escorts) assigned to the buddy. No buddy → the
  tasks are unstaffed (existing machinery prices it); a buddy double-booked at a window → overload/idle; no
  card authority → the money gate fails. One organizer may buddy at most 2 VIPs (bijection-ish guard).
- **V2 surface:** a **care shelf** on the command tray — the 4 VIP guest cards, handed to organizer pawns in
  the same grammar ("you hand things to people"); the All-settings fallback gets a buddy card (selects).
- **Ship map = data:** the voyage segment defines its own stations (Hold · Cabins · Dining saloon · Deck ·
  Purser's desk) positioned over the water — the existing over-water rendering already puts crews aboard
  hulls, so the ship day reads as shipboard life without new stage architecture (V3 polishes a deck backdrop).

## 4. The constitution re-derives (spec-first, as designed)

The §3 derivation rules of `2026-07-10-scoring-rubric-v1-design.md` absorb the new content unchanged
(sockets from neededInfo, lanes per role, flag tables for the new gates: sailing-time boarding gate, hold
manifest check, card authority, per-VIP starlink+escort quality checks, cabin list socket). **Targets** for
the re-packed matrix (exact frozen values land at integration and are pinned in verify, like PINS):
frame ~12 · load ~11 · voyage ~12 · arrival ~12 · ops ~14 · **fishday ~30 (must stay the heaviest)** ·
return ~9 = **100**; Information stays the heaviest dimension. Grade gate, clean rule, riskable pricing
unchanged. **Seed gaps** extend the ladder: load ships with the jig case never assigned to the truck run +
the cabin list unshared; voyage ships with 2 VIP buddies unassigned + the card authority missing.
**`fixHandoffs` must remain the strictly largest single jump** (the thesis) — verified at integration.

## 5. Sound (V3 — `sound.js`, the one completeness item)

Procedural WebAudio, zero audio files: a quiet **ambient bed** (waves + wind, gull calls by day, lantern-era
crickets at dusk; a low engine hum on the voyage day) and **event cues** — a soft freeze/stall cue, a wooden
tick for placements/+N, the hanko **thock**, a warm dinner-fanfare layer, drawer slide. Starts **muted**
(browser autoplay policy) behind a 🔊 header toggle, preference in localStorage; fully silent under
reduced-motion unless explicitly enabled; never load-bearing (the game communicates everything visually).

## 6. Verification & process

verify grows: new-seg schedule anchors, carryover cases (canonical = everything aboard = zero carry effects,
pinned; a constructed missing-jig-case plan stalls the fishday gear check), buddy atoms, the re-pinned matrix
+ extended cumulative ladder, i18n parity. All UI suites extend. **Process per the standing rule:** Sonnet
builds → **Opus senior-dev approval on every wave's final code before I commit** → integrator drives the
merged UI → **Fable runs the program-end everything-check** and reports anything wrong.

## 7. Out of scope (this program)

PWA/share-links/save-slots/daily-challenge (owner: sound only, for now); leaderboards/backends (permanently,
per §11); multiplayer; per-guest sprites; the §13 weather/scenario branches (next program after this).
