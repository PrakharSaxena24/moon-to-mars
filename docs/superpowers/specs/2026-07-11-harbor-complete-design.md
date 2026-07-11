# Harbor Complete — master-grade graphics, sprites, cinematics, and the finished one-stage arc

**Status (updated 2026-07-11): SHIPPED — see the matching CLAUDE.md as-built section.** Original status: APPROVED (owner 2026-07-11: master-grade washi + sprites with a dedicated Fable sprite atelier ·
auto-cinematics · full completion incl. backlog · pawns ~30% bigger).
**Constraints (absolute):** offline/no-build/no-libs, vanilla ES5, engine.js + verify.js untouched (258/258),
EN/JP parity, deterministic sim (rendering may use time-based animation but NEVER writes back), reduced-motion
branches everywhere, Live/editor §18 behaviors preserved. One new file is authorized: `sprites.js`
(precedent: stage.js) — everything else lands in existing files.

---

## 1. The sprite atelier — characters become the stars

**New file `sprites.js`** (global `PRS_SPRITES`), authored by a dedicated Fable agent: a hand-crafted **SVG
sprite library** for the 11 duty-holders (+ 1 generic guest body), embedded as SVG strings rendered to
offscreen canvases at boot. Vector = crisp at any scale, tiny on disk, authorable as text, and it can carry
the washi identity (sumi-e brush strokes, indigo coats, gold trim, hanko-red accents) instead of pivoting away
from it.

**Pinned API (stage.js builds against this blindly):**
```js
PRS_SPRITES = {
  ready: false,                      // flips true when all sheets are decoded
  init(cb),                          // decode all SVGs to canvases; cb() once ready (idempotent)
  get(roleId, pose, frame, facing)   // -> HTMLCanvasElement | null
}
// pose: 'idle' | 'walk' | 'work' | 'stall'   frame: 0|1 (walk/work cycle)   facing: 1|-1
// null (or ready=false) => caller falls back to the current procedural pawn — sprites are an
// ENHANCEMENT layer; the game must render perfectly without sprites.js loaded at all.
```
Per-role sprites share a body template with role-differentiated coat/cap/tool (chef's knife, angler's rod,
comms clipboard, safety armband…), a readable face (dot eyes, brow — enough for expression at a squint),
2-frame walk, 2-frame work gesture, an idle stance, and a **stall pose** (slumped shoulders, the diagnostic
star of the game). Drawn at 2× the display size for crispness. Art direction: sumi-e line weight, flat washi
fills, no gradients inside figures (the world owns light), consistent 3-4 color palette per role anchored on
the existing `role().color`.

## 2. Master-grade washi world (stage.js)

Push every environment layer to its ceiling, keeping the identity: layered terrain (elevation bands, inland
shadow, shore wet-sand line), **living water** (2-3 animated wave bands, foam crests, station/lantern
reflections that shimmer, boat wake interacting), full **day-night lighting** (the SKY table drives a global
light tint + long dawn/dusk shadows under pawns/stations + lantern light-pools that bloom at night), drifting
cloud shadows, wind-bent grass tufts, richer station architecture (roof ridge lines, noren curtains at Hinata,
nets and floats at the port), and a **pooled particle system** (chimney smoke at the galley, sea spray,
lantern fireflies at dusk, cook-steam during the cook block). All procedural, all deterministic from `t`,
all reduced-motion-guarded (static frame keeps the lighting but freezes motion).

**Pawn scale +30%** (`FIG_SCALE = 1.3` applied in stage draw); fan-stack spacing, name-chip offsets, and the
app-side hit radius (26px → 34px) scale with it.

## 3. Auto-cinematics (no user camera)

A camera transform inside `scene()` (`view.cam = {x, y, zoom}`, default identity) used ONLY during
interaction-suspended moments, always returning to identity:
- **Freeze punch-in:** when a Live freeze or coarse `cp_stall` pause lands, ease to ~1.35× centered on the
  stalled pawn over ~600ms; ease back on resume. (Interaction during a freeze is the live-dock/inspector —
  DOM overlays that don't need canvas hit mapping; station hotspots are disabled-tolerant during the hold.)
- **Dinner pull-back + fanfare:** on an on-time serve, a slow 1.0→0.94 breathe-out as the fanfare fires.
- **Vignette dawn drift:** the intro vignette gets a slow lateral drift + punch-in on its freeze beat.
- **Report dusk settle:** entering report-on-stage, a gentle settle from 1.05→1.0.
Rules: while `cam` ≠ identity, the DOM hotspot/token/halo layers hide or freeze (they re-sync on return);
reduced-motion = no camera at all; the camera NEVER moves during normal interactive play.

## 4. Phase 4 — report-on-stage (the arc completes)

After a run, the report keeps its cards (rail summary + ledger + fix-pack) but gains the stage above them in
**dusk mode**: the same harbor at evening light; **stall markers** glow at the stations where idle/rework
actually accrued (engine already tags idle by station + infoId — read from the run's `daySchedule`/sim
read-offs, no engine change), each marker a DOM hotspot: click → jumps to the fixing surface (the receipt row,
or the day drawer scrolled to the hollow socket — reusing the rail jump-link machinery). The **grade lands as
a hanko stamp** on the stage corner (stamped once, thock, slight ink bleed; RM = static). Pawns stand at their
end-of-day stations, inspectable (their popover shows the day's summary: idle minutes, cards they waited on —
`memberInfo` at final minute). "Fix & re-run" keeps markers as shortcuts until fixed.

## 5. Completion backlog (closes with this program)

- **Live convergence grouping:** `nextLiveGap` groups gaps by convergence cluster (pre-departure info:
  everything gating `t_f_menu`→`t_f_gearload`/`t_f_route`; catch relay: the `ic_catch` fan-out). One freeze
  presents its cluster as 2-4 cards fixed in one spotlight session (each still individually priced/committed);
  freeze count drops from ~10 to ~4-5 meatier decisions. Deterministic, same engine calls.
- **Coarse-day life:** info motes fly on arrival/ops/return runs (from `handoffsForSeg` send-times), and the
  boat makes its arrival/return crossing arc on those days (cosmetic segment-aware `boatState` interpretation
  in the view layer — engine untouched).
- **Dead CSS/keys cleanup:** `.scorecard`/`.pillar` rules, `scorecardTitle` key (both languages).

## 6. Testing & rollout

verify 258/258 untouched (parity covers new i18n keys if any — expect ~6: report-stage labels, marker aria,
stamp aria). Smoke + the 52-check harbor E2E stay green. New ephemeral checks: sprites load + fallback path
(delete sprites.js from a scratch copy → game still renders procedurally), freeze punch-in reverts to
identity, report stage shows ≥1 marker on the gappy seed and marker-click lands on the right receipt row/
socket, hanko stamp renders, Live grouped-freeze commits all its cluster's arrows, coarse motes visible,
RM sweeps, JP pass, 390px. Performance gate: full-speed fishday run stays smooth (frame budget ≤8ms
mid-complexity scene on the reference laptop — measure before/after; particle pools capped).

## 7. Execution shape

Wave 1 (parallel, file-disjoint): **S1 sprite atelier** (Fable — sprites.js only, new file) ∥ **S2 world art
+ camera mechanics + pawn scale + view contracts** (Fable — stage.js only; implements sprite consumption
against the §1 API with procedural fallback, the §3 cam transform, and the §4 render layers `view.dusk`,
`view.stallMarkers`, `view.stamp`) ∥ **S3 report-on-stage app side** (Opus — app.js report region + index/css/
i18n: builds `view.dusk/stallMarkers/stamp` from the finished sim, marker hotspots + jumps, report layout) ∥
**S4 E2E suite extension** (Sonnet — tmp file only).
Wave 2 (after Wave 1 merges): **S5 Live convergence grouping + cinematic triggers + coarse motes/boat + CSS
cleanup** (Opus — app.js live/mote regions) — sequenced because it shares app.js with S3.
Wave 3: integrator drives the merged UI (the standing lesson), 2-lens adversarial close-out, perf
measurement, docs §27, push (owner pre-authorized: "push and complete everything").

## 8. Out of scope

User-controlled pan/zoom; per-guest sprite individuality; WebGL; any engine/scoring change; wrong-holder
placement consequences; new gameplay content (§13 contingency branches).
