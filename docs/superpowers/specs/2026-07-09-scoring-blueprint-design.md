# Scoring Blueprint — Ogasawara Rehearsal

> **Status: v0.3 — APPROVED; Phase‑0 resolutions LOCKED (2026‑07‑09). Build in progress.**
> v0.2 folded in a Fable design review; v0.3 adds §13 (Phase‑0 reconciliations + frozen build contract) after
> a Fable plan‑reconfirm and a Sonnet atom enumeration. This is the authoritative reference the scoring engine
> is built/refactored against. Scoring is *the heart of the game*.

---

## 0. The goal in one sentence
**The 100 is the whole 10‑day trip, and every single point is one named, integer‑priced, checkable thing
the player did — or failed to do.** The score is literally a 100‑point receipt; hover any point, see its item.

---

## 1. What we have today (grounding — do not lose these)
Two headline numbers, side by side (they may legitimately diverge):
- **Score / Grade** (0–100, D→A) — *is the plan sound?*
- **Efficiency %** — *does it waste anyone's time?* = Σ productive ÷ Σ available across duty‑holders.

Today the Score is **8 categories** (`objective 20 / schedule 15 / roles 15 / info 15 / budget 10 / safety 10
/ quality 10 / health 5`), and inside a category points come off *unevenly* — some all‑or‑nothing, some
continuous, some per‑item — so "1 point = 1 concrete thing" does **not** hold. That is the gap this fixes.

**Invariants to preserve:**
- **Thesis.** Responsibility ≠ authority ≠ information, and *information has a clock*. The heart is the
  **temporal‑information axis** (the arrows / handoffs). Scoring must make that the single biggest lever.
- **Determinism.** Seeded; same plan → same score. `verify.js` pins the D→100 gradient.
- **Two numbers stay distinct.** Never collapse Efficiency into the Score.
- **Teaching gradient with a climax.** A gappy plan → D; fixes climb toward 100/A; the *last‑fix jump*
  (drawing the information arrows) is the intended payoff.

---

## 2. Design principles
1. **Whole‑trip 100.** Trip = **Arrival (D1) → Ops (7 generic ops days D2/D4–D9 + the representative Fishing
   Day D3) → Return (D10)**. The 100 is a roll‑up of a fixed atom inventory, not a re‑normalized per‑day 100.
2. **Bottom‑up integer atoms (the core rule).** The 100 is authored as a fixed inventory of ~80 **atoms**,
   each a concrete checkable unit priced **1–4 integer points**, summing to **exactly 100**. Buckets and
   dimensions are *sums over the inventory*, never top‑down multipliers. This is what makes a *point* map to
   a *thing* (v0.1's even‑division minted fractional atoms like 0.27 pts — the opposite of legible).
3. **Causes, not consequences.** The 100 prices only **plan decisions** (a duty placed, an arrow drawn on
   time, a gate owned). **Effects** — idle minutes, rework, dinner delay, guest wait — are *annotations* on
   the causing atom and live in **Efficiency**. This prevents billing one fault twice inside one number.
4. **One currency.** There is exactly one "100" (the trip). A day report shows a *slice* of it ("Fishing Day:
   33 of its 41 trip points"), never a second 100.
5. **The heart is heaviest — honestly.** The Fishing Day and Information carry the most points because they
   *contain the most clocked atoms*, not because of an arbitrary weight.
6. **Legible losses.** Every atom has a one‑line reason and points at its item on the map / timeline / arrow.

---

## 3. The model — five buckets, dimensions, integer atoms

### 3.1 The atom
```
atom = { id, bucket, dimension, item, maxPts (int 1–4), earned (int), status, reason }
status ∈ ok | missing | late | present-but-late | decoy | broken | overlap | compressed
```
**Pricing rules (uniform, integer, from the *template's required set* — never the player's plan):**
- **Execution atom** = each *required* task **placed on the right role, dep‑consistent, not overlapping,
  and `durMin ≥ template durMin`** = **1 pt**. (The `durMin` floor kills the "shrink the cook block to
  dodge idle" exploit; "no wishful compression".)
- **Information atom = the socket** — one *(card × consuming task that needs it)* pair — **not the drawn
  wire**. This matches the engine's min‑over‑arrows checker, so redundant extra arrows are harmless by
  construction. Standard socket = **1 pt** (on time or not). The four **wrong‑fish‑riskable** fishday
  sockets (`h_menu_angler`, `h_menu_boat`, `h_target`, `h_ground_angler` — the `ifLate:'assume'` set) =
  **3 pts** each, split **1 "specified" (an arrow exists → not 迷い) + 2 "on time" (arrives before the
  consumer starts → not 手待ち/wrong‑fish)**. This prices the taxonomy: never‑drawn loses 3, late loses 2.
- **Gate atom** (go/no‑go, abort authority, budget authority, reserve, allergy) = **2–4 pts**, binary.
- **Decoy atom** = a **debit row** if a decoy task is placed (−2, safety‑flavored −3), floored at its cell.
- **Everything binary** except nothing — there is no graded atom (idle magnitude lives in Efficiency).
- **Integer policy:** all values integers; the ledger sums exactly with **no rounding step**.

### 3.2 The five buckets + the homing rule
Four **phase** buckets (Arrival / Ops / Fishing Day / Return) hold clocked, when‑specific atoms. A fifth
**Trip Frame** bucket holds **standing, timeless** decisions that belong to no single day — the abort &
budget *authorities*, the cash reserve, the health‑report route, hospital info, load/relief. (These are
today's trip‑scoped classic detectors; without a Frame bucket a single missing budget authority would print
a row in *every* phase's roll‑up.) **Homing rule: every atom has exactly one home cell.** The Frame bucket
also teaches the thesis structurally — *authority is timeless (frame), information has a clock (phase)*.

### 3.3 The weight table (every cell is a sum of real atoms; both axes total 100)
| Bucket | Info | Execution | Safety | Quality | Money | People | **Total** |
|---|--:|--:|--:|--:|--:|--:|--:|
| **Trip Frame** (standing) | — | — | 8 | — | 5 | 1 | **14** |
| **Arrival** D1 | 4 | 7 | 1 | 2 | 1 | — | **15** |
| **Ops** (rep. day, scored **once**) | 5 | 5 | 2 | 4 | 2 | — | **18** |
| **Fishing Day** D3 | 22 | 9 | 6 | 4 | — | — | **41** |
| **Return** D10 | 3 | 4 | 3 | — | 2 | — | **12** |
| **Trip total** | **34** | **25** | **20** | **10** | **10** | **1** | **100** |

Auditable cell contents: **Frame‑Safety 8** = abort authority named (4) + health‑report route (2) + hospital
info shared (2). **Frame‑Money 5** = budget authority (3) + reserve & draw rule (2). **Frame‑People 1** =
load/relief. Phase cells are sums of that phase's required tasks + sockets + gates (see §3.4 for the fully
worked Fishing Day; other phases enumerated in Appendix A).

Emphasis, justified by the thesis: **Information 34** is the largest dimension (the lever); the **Fishing Day
41** is the heaviest phase and is **54% information internally** (the heart of the heart); **Safety 20**
doubles today's 10 (the trip's real stakes — abort authority, everyone home — were under‑priced);
**Schedule leaves the Score entirely** and becomes Efficiency's territory (§5). Grand total: **79 atoms, 100
points, zero fractions.**

### 3.4 Worked inventory — the Fishing Day (41 pts, 28 atoms), grounded in the canonical §5 plan
**Information — 22 pts (14 socket atoms).** The 9 cards fan out to **14 consuming sockets**:
`ic_food→🍳(1)`, `ic_weather→🍳,🧭(2)`, `ic_orgfood→🍳(1)`, `ic_tackle→🎣(1)`, `ic_ground→🍳(1)` (cook‑lock),
`ic_headcount→🧭(1)`, `ic_catch→🍳,📦,🎧(3)` = **10 standard sockets × 1 = 10**; plus the **4 riskable**
`ic_menu→🎣`, `ic_menu→🧭`, `ic_target→🧭`, `ic_ground→🎣` **× 3 = 12**. (10 + 12 = 22.)
**Execution — 9 pts (9 lane atoms):** the 8 organizer lanes + 1 galley lane (the 3 chefs parallelize) each
run their required tasks placed/staffed/dep‑consistent/uncompressed = 1 each.
**Safety — 6 pts (2 gate atoms):** dawn go/no‑go *with an explicit abort criterion* (3) + abort authority
held aboard 07:00–14:00 (3).
**Quality — 4 pts (3 atoms):** cook block ≥ 5×portions **and** ends ≤ 18:00 service (2) + allergy respected
(1) + portions = 13 guests + organizer add‑ons (1).
> Remove the `ic_menu→🎣` arrow: lose its 3 info pts (or 2 if merely late) **and** watch the wrong‑fish
> rework poison the cook block — but that rework costs **Efficiency**, not a second Score row. *One fault,
> two lenses = two numbers, never two rows in one number.*

---

## 4. The atomic ledger (the player‑facing payoff)
The score is computed as the **atom list** itself. The report renders the full ledger grouped
bucket → dimension, every point accounted for; hovering a point (earned or lost) **highlights its item** on
the map / timeline / arrow. "87 / 100" always expands to the exact rows that cost the other 13.

---

## 5. Efficiency — the second headline (causes vs effects)
`Score = plan decisions (causes)`; `Efficiency = time outcomes (effects)`. Efficiency stays **separate** and
is the **minute‑weighted** aggregate of idle/rework over the four modeled days (not an average of
percentages). **Theorem:** all 100 atoms earned ⇒ zero idle ⇒ Efficiency 100. The converse is deliberately
false — a plan can be time‑efficient yet unsound (the §9 "91 % but D" divergence), which is why the two
numbers exist.

---

## 6. Rules & exploit closures
- **Grade gate, not a numeric cap.** Drop the old "cap total at 89". Keep the *gate*: **A requires clean AND
  ≥ 90**; a surviving gap shows the true sum with a withheld A — "97 · B — an A requires zero known gaps."
  (A capped number creates phantom points a ledger cannot itemize.) Bands: A ≥90 & clean · B ≥75 · C ≥60 · D.
- **Template denominators.** Atom counts/prices come from the template's required set, so you can't own a
  cell by placing one task or drawing one arrow.
- **`durMin` floor** on execution atoms (no wishful compression); the fishday **cook block ≥ 5×P** is the
  marquee instance.
- **Decoy debits** (§3.1), floored at the cell — "a thing you did wrong" is as legible as a thing you missed.
- **Socket‑not‑wire** info atoms (§3.1) — redundant/slow extra arrows can't inflate the score.

---

## 7. Seeding & the teaching gradient (⚠ HARD DEPENDENCY — ships with the model)
Under a causal itemized 100, the current seed earns most atoms *for free* (coarse days ship fully wired;
12 of 14 fishday arrows pre‑drawn) → the gappy plan would land ~C, not the pinned **8 / D**, and the
draw‑the‑arrows climax would shrink. **Required seeding changes (both already half‑mooted in CLAUDE.md):**
1. **Pre‑clear Arrival** as the tutorial (CLAUDE.md §20.8 deferred item).
2. **Withhold most Fishing‑Day arrows from the seed** (pre‑drawing 12/14 undermines the core mechanic anyway).
Result: gappy ≈ **50 / D**, and "draw the information arrows" is again the single biggest jump (~ +22).
**Live mode's gap pacing (`nextLiveGap`) must be retuned with the new seed.** This section is a hard
dependency of the model, not a migration afterthought.

---

## 8. One currency (day reports)
`scoreDay` stays as the day‑report drill‑in but is **re‑denominated**: it reports the day's slice of the trip
100 ("Fishing Day: 33 of its 41 trip points"), never a fresh 0–100. There is one currency across the game.

---

## 9. Migration
1. Build a new pure `scoreTrip(plan) → { total, grade, atoms[], byBucket, byDimension }` beside today's
   `score()` / `scoreDay()`.
2. Keep the 100‑anchors: the `canonHandoffs` + `canonDay` witnesses become "**all atoms earned**".
3. Re‑seed the gappy template (§7) and **re‑pin the gradient numerically** in `verify.js`.
4. Migrate Live's `projected` / `previewChannel` pre‑Run mirror to read the ledger.
5. `scoreDay` remains only as the re‑denominated day drill‑in.

---

## 10. Determinism & verification (non‑negotiable)
The ledger is a **pure function of the plan** (no RNG in the score path). `verify.js` asserts: **Σ maxPts =
100** exactly, **Σ earned = displayed score** byte‑exact, each phase/frame keeps its all‑atoms‑earned anchor,
and the re‑pinned gappy→fixed gradient stays monotonic with the arrow‑draw as the largest single jump.

---

## 11. Alternatives considered (why this shape won)
- **Matrix as the *minting* mechanism (v0.1 even‑division)** — rejected: produces fractional, plan‑sensitive
  atoms; self‑refutes "one point = one thing". Kept only as the *report grouping*.
- **Trip‑wide dimension pools** — simpler, but a point no longer says *when*, and the heart isn't weighted.
- **Outcome checklist** — most player‑legible, but drifts from the plan‑the‑arrows mechanic and hides the
  temporal‑information lesson behind outcomes.
- **Winner:** bottom‑up integer atoms grouped by bucket × dimension — "when × what × which item"
  traceability, the heart weighted because it *contains* the most clocked atoms, rolls up to one honest sum.

---

## 12. Open decisions for the owner
1. **Trip Frame bucket — adopt it?** (Recommended.) *Fallback if rejected:* home each frame atom in the phase
   where it first bites → Arrival 22 / Ops 21 / Fishing Day 45 / Return 12; same dimension totals, sums to
   100, but the ledger reads worse ("budget authority" filed under Arrival is a convention to learn).
2. **Phase emphasis** — Fishing Day at **41** (≈ the recommended ceiling; higher makes the coarse days noise).
3. **Safety at 20** (doubled from today) — agree the trip's real stakes were under‑priced?
4. **Grade gate replaces the 89 cap** — agree?
5. **The §7 re‑seeding** (pre‑clear Arrival + withhold fishday arrows) ships *with* this model — agree it's in
   scope, since the teaching gradient depends on it?

---

## Appendix A — atom inventory status
The **Fishing Day** inventory is fully worked in §3.4 (28 atoms → 41 pts) against the frozen §5 plan. The
**Arrival / Ops / Return / Trip‑Frame** inventories are specified at the cell level in §3.3 with their atom
*kinds* and counts; their exact per‑atom ids + final integer prices (summing to the cell, and the cells to
100) are the **first task of the implementation plan**, read mechanically off `plan.days[seg].tasks`,
`handoffsForSeg`, and the classic detectors. The pricing *rules* (§3.1) are fixed now; only the enumeration
is deferred, and `verify.js`'s "Σ = 100" assertion is the backstop that the enumeration is complete.

---

## 13. Phase‑0 resolutions & frozen build contract (LOCKED 2026‑07‑09)
A Sonnet enumeration produced the full 80‑atom inventory (sums to exactly 100; both axes match §3.3) and
surfaced the gaps between the locked table and what's checkable in code. A Fable plan‑reconfirm returned GO
with a Phase‑0 gate. The rulings below are LOCKED; builders follow them without improvising.

### 13.1 Owner rulings
- **Free‑point atoms → make them real.** The 5 atoms that can't fail today get real checks so each can fail
  on a bad plan (faithful to §0): **hospital‑info shared** (`ic_hospital.recipientRoleIds ⊇ {pm,siteLead,
  comms,safetyLead}`); **night abort‑criterion** (`rk_night.abortCriterion` present, mirroring `rk_sea`);
  **allergy respected** (a real gate: the committed menu species must not intersect a guest allergen —
  needs a structured menu‑species field/flag the engine can read, not free text); **portions correct**
  (`= 13 guests + organizer add‑ons`, derived/checked, not a static config read); **crew health‑check**
  (`t_f_health` placed & done → priced as a Fishing‑Day Safety atom).
- **Owner & PM get a fishing‑day activity.** `p01`/`p02` today own zero `t_f_*` tasks (only 7 active lanes).
  Give each a real **flex/standby** fishing‑day task — *remote work on another project, or join the fishing,
  or help the galley if needed (normally not needed)* — so they're active lanes (and not idle on the map).
  Result: **8 organizer lanes + galley = 9 Execution atoms**, Fishing Day stays 41. (Low‑stakes tasks: no
  `neededInfo`, no deps; they must be placed on the right role and not overlap, like any Execution atom.)
- **Late standard info‑socket → loses its point** (information has a clock; the idle it causes also shows in
  Efficiency — one fault, two *numbers*). Riskable sockets keep the 1 "drawn" + 2 "on time" split.
- **`score()` stays internal‑only** — it still provides `individuals`/`team`/`conditions` + the classic
  fix‑pack to `renderReport`, but its total/grade stop being a headline and its headline verify pins retire.
- **Decoy safety‑flag** wired onto `hd_a_dec_nightfish` + `hd_r_dec_latefish` (−3, safety‑flavored); other
  decoys stay −2.
- **Live pacing** — group the (now ~12–14) freeze prompts by the two convergence points (pre‑departure info;
  catch relay) so it's a rhythm, not a nag. Finalized at the seed phase against a measured freeze count.
- **Return Safety/Money split** is content‑based (the Return roster has no `safetyLead`/`chef` task) — accepted.

### 13.2 Frozen API contract (builders implement exactly this)
```
scoreTrip(plan) -> {
  total,            // int 0..100 = Σ atoms.earned
  grade,            // A (>=90 && gate.clean) | B >=75 | C >=60 | D
  gate: { clean, withheldA },   // grade gate replaces the 89 cap
  atoms: [ {
    id, bucket, dimension,
    itemRef: { type:'lane'|'socket'|'gate'|'decoy'|'frame', taskId?, cardId?, handoffId?, detectorId? },
    maxPts,           // int
    earned,           // int
    status,           // ok | missing | late | present-but-late | broken | overlap | compressed | decoy
    reasonKey,        // one of the fixed §13.3 keys (NOT free text)
    reasonParams      // {} for i18n interpolation
  } ],
  byBucket,           // { frame,arrival,ops,fishday,return } -> {maxPts, earned}
  byDimension         // { info,exec,safety,quality,money,people } -> {maxPts, earned}
}
tripEfficiency(plan) -> int %   // minute‑weighted Σ productive / Σ available over the 4 modeled days;
                                // unplaced tasks contribute neither avail nor idle
```
Pure functions (no RNG, no plan mutation), exported on the engine `api`.

### 13.3 Fixed reason‑template keys (so i18n is bounded & parallel)
`scr_info_ok · scr_info_late · scr_info_missing · scr_info_drawn_late` (riskable partial) · `scr_exec_ok ·
scr_exec_unstaffed · scr_exec_misassigned · scr_exec_overlap · scr_exec_compressed · scr_exec_broken ·
scr_safety_ok · scr_safety_gap · scr_qual_ok · scr_qual_fail · scr_money_ok · scr_money_gap · scr_decoy`.
Plus bucket names (`sb_frame/arrival/ops/fishday/return`), dimension names (`sd_info/exec/safety/quality/
money/people`), the grade‑gate line (`gradeGateB` = "{n} · B — an A requires zero known gaps"), and the
day‑slice line (`daySliceLine(earned,max,phase)` = "{phase}: {earned} of its {max} trip points").

### 13.4 Verify split (Fable) & phase‑sequencing note
- **P1 (with `scoreTrip`) — structural:** Σ maxPts = 100 exactly; `byBucket` maxPts = {14,15,18,41,12};
  `byDimension` maxPts = {34,25,20,10,10,1}; determinism (two calls equal); purity (doesn't perturb `score()`
  or mutate the plan). The existing 196 checks stay green (P1 changes **no** content/seed).
- **P2 (with the seed re‑tune) — numeric:** the all‑fixes + `canonDay` plan earns 100/A; gappy ≈ 50/D;
  monotone fix ladder; **arrow‑draw is the largest single jump**; migrate the old 220/91%/18:30 pins into
  Efficiency vs atom anchors.
- **Sequencing:** the content additions (owner/PM flex tasks, the 5 make‑real checks, decoy flags) + seed
  re‑tune + `canonDay` **placement‑restore** land together in **P2**. In **P1**, `scoreTrip`'s inventory
  references those atoms but they simply score `earned:0` until P2 — so `Σ maxPts = 100` holds structurally
  from day one, while "canonical earns 100" is a P2 anchor.
