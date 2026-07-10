# Harbor Complete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Spec:
> `docs/superpowers/specs/2026-07-11-harbor-complete-design.md` — read FULLY; its §1 sprite API, §3 camera
> rules, and §4 view contracts are the cross-worker interfaces. Workers never commit, never leave their file
> list, self-check their own scope only. When plan and spec conflict, the spec wins; report it.

**Goal:** master-grade washi world + SVG sprite characters + auto-cinematics + report-on-stage + the full
backlog close (Live convergence grouping, coarse motes/boat, dead CSS).

**Model allocation (owner: "use all agents liberally including fable"):** S1/S2/S3/S5 = fable (effort high;
S2 xhigh), S4 = sonnet. Close-out lenses = fable.

## Global constraints
ES5, offline/no-build/no-libs; engine.js + verify.js read-only (258/258 at every hand-off); EN/JP in one
edit; RM branches for all new animation; rendering never writes to `sim`; Live/editor §18 behaviors intact;
`sprites.js` is the ONE new file allowed. Headless browser: /Users/tanakai/miniconda3/bin/python3 +
playwright on file:///Users/tanakai/aibos/OgasawaraSim/index.html.

## Ownership & pinned interfaces

| Task | Files (exclusive) | Produces |
|---|---|---|
| S1 sprite atelier (fable) | `sprites.js` (NEW) + one `<script src="sprites.js">` line in index.html before stage.js | `PRS_SPRITES` per spec §1 exactly: `{ready, init(cb), get(roleId,pose,frame,facing)}`; 11 roles + 'guest'; poses idle/walk/work/stall × frames 0-1 × facing ±1; 2× resolution offscreen canvases; sumi-e washi art keyed to `role().color`; total file target ≤ ~180KB |
| S2 world + camera + contracts (fable, xhigh) | `stage.js` only | Terrain/water/lighting/particles per spec §2; `FIG_SCALE=1.3` pawn scale; sprite consumption via `PRS_SPRITES.get()` with FULL procedural fallback (game perfect without sprites.js); camera per spec §3 (`view.cam {x,y,zoom}`, identity default, ease helpers exported as `PRS_STAGE.camTo/camReset`); new render layers reading `view.dusk` (dusk light grade), `view.stallMarkers` `[ {stationId, sev} ]` (glow pulses), `view.stamp` `{grade, at}` (hanko, RM static); perf: pooled particles, offscreen-cache the static ground, ≤8ms/frame mid-scene |
| S3 report-on-stage (fable) | app.js (report region), index.html (#report), style.css, i18n.js | Spec §4: dusk stage panel atop the report cards; build `view.dusk/stallMarkers/stamp` from the finished sim's `daySchedule` read-offs (idle byTask → station via task.station); DOM marker hotspots → jump to receipt row / day drawer socket (reuse rail jump machinery); end-of-day pawn inspection (memberInfo at final minute); "Fix & re-run" keeps markers; ~6 i18n keys EN+JA; graceful before S2 merges (markers/stamp as DOM overlays; the dusk canvas grade may no-op until S2's layer lands — say so in your report) |
| S4 E2E extension (sonnet) | `/Users/tanakai/.claude/jobs/a20427e0/tmp/e2e_harbor_complete.py` ONLY | Spec §6's new checks as a runnable suite (sprite fallback via a scratch copy with sprites.js deleted; punch-in reverts; report markers + click-through; stamp; grouped Live freeze; coarse motes; RM/JP/390px), defensive selectors, PASS/FAIL summary, nonzero exit on failure; py_compile is the only required self-run |
| S5 (Wave 2, after merge) | app.js (live + mote regions), style.css cleanup, i18n.js | Live convergence grouping per spec §5 (cluster = gaps sharing a convergence point; one spotlight fixes the cluster, each arrow individually committed); freeze punch-in + dinner pull-back + vignette drift triggers calling `PRS_STAGE.camTo/camReset` (RM = never); coarse-day motes from `handoffsForSeg` + segment-aware boat crossing in the view layer; delete `.scorecard`/`.pillar` CSS + `scorecardTitle` key (both langs) |
| Integration (tech lead) | any | After Wave 1: merge order S1→S2→S3 are file-disjoint (no worktrees needed) — run verify + smoke 22 + harbor E2E 52 + S4 suite, drive the merged UI personally (the standing lesson), fix seams, commit `feat(complete W1)`. Then launch S5; gate again; commit. Then 2 fable close-out lenses; fixes; perf measure; CLAUDE.md §27 + memory; push (owner pre-authorized). |

## Task step lists

**S1:** (1) study stage.js drawFigures (the art it replaces/augments: coat/cap colors from P.role, facing
flip, walk cycle) + the washi palette in CLAUDE.md §16/§21; (2) design the body template + per-role
differentiation (tool, cap, coat trim, silhouette); (3) author the SVG set (string templates with role color
injection beat 44 hand-written files — but hand-tune where a role needs character); (4) loader: decode via
Image + `data:image/svg+xml`, draw to 2× canvases, `ready` flip + cb; decode failure → `ready` stays false
(fallback contract); (5) self-check: a scratch HTML page drawing every (role×pose×frame×facing) grid via the
API — screenshot it and describe each role's readability; node --check; verify untouched.

**S2:** (1) layer-by-layer art pass per spec §2 with before/after screenshots at 06:00/12:00/18:00/20:00
sim times; (2) FIG_SCALE + fan/chip plumbing (report the app.js hit-radius line for the integrator: 26→34);
(3) sprite consumption: `PRS_SPRITES && PRS_SPRITES.ready ? drawImage(get(...)) : proceduralPawn()` — sprite
draw inherits the same shadow/aura/bubble/nameplate stack; (4) camera: world layers under one save/transform;
HUD layers (chips, nowtag) OUTSIDE it; `camTo({x,y,zoom},ms)`/`camReset(ms)` eased, RM = snap-to-identity
no-ops; (5) `view.dusk/stallMarkers/stamp` layers; (6) perf: ground offscreen cache, particle pool caps,
measure scene() ms at fishday noon complexity before/after and report both numbers; (7) ctx save/restore
balance counts before/after; node --check; verify green.

**S3:** (1) report flow: after `finish()`, mount the dusk stage panel (reusing the run canvas pattern — a
report-owned canvas + its own light loop, killed on report exit via enterScreen); (2) markers from the run's
sched read-offs (station → px via the stage geometry already exported); DOM hotspots with aria-labels naming
the gap; click routing (frame gaps → receipt row scroll/focus; day gaps → openDayDrawer(seg) pre-scrolled);
(3) hanko stamp element (CSS animation, RM static) + grade; (4) pawn end-of-day popovers; (5) i18n keys both
langs; (6) self-check headless: gappy run → ≥1 marker, click lands on the right surface, stamp visible, JP
pass, RM pass; verify green.

**S5:** (1) cluster map: build once from the canonical handoff set (group by consumer convergence — the spec
names the two clusters; anything ungrouped stays a solo freeze); `nextLiveGap` returns the cluster; the
spotlight iterates its cards (existing per-arrow preview/commit loop, §17 machinery); freeze count on the
seed becomes 4-6 — report the exact number; (2) camera triggers at the named moments, always paired with a
reset path (resume/finish/mode-exit → camReset(0) safety in animReset); (3) coarse motes: buildMotes
generalized to `handoffsForSeg(plan, seg)` send-minutes; boat: segment-aware crossing param for
arrival/return in the view build (engine untouched); (4) CSS/key cleanup; (5) self-check: Live full win path
with grouped freezes EN+JP, coarse run shows motes + boat, no camera drift after quit-mid-punch-in; verify
green; smoke + both E2E suites.

## Self-review
Spec coverage: §1→S1, §2→S2(1-3), §3→S2(4)+S5(2), §4→S2(5)+S3, §5→S5, §6→S4+gates, §7 honored (S3 runs
in-place because S1/S2/S3 are file-disjoint; S5 sequenced). Cross-interfaces pinned once in the ownership
table. The one soft seam (S3's dusk grade before S2 lands) is explicitly allowed to no-op pre-merge.
