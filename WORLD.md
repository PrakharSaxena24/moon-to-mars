# WORLD.md — Ogasawara Rehearsal: story, roster & operations (world bible)

> Split out of CLAUDE.md (2026-07-07) to keep the build doc lean. **This is the narrative / world source
> of truth** — the real people, organizations, ships, fishing, and meals the game's Ogasawara trip is
> modeled on. CLAUDE.md stays the build/engine spec; new world & roster facts go **here**.
>
> **Scope decision (2026-07-07):** WORLD.md is the world bible; **rename the game's 11 named people** to
> the real names below — **no structural rework yet** (the engine still models 24 = 8 + 13 + 3 on one map;
> the richer world — two ships, iso vs jigging, Hinata, the Day-5 guest swap — is documented here for a
> later build pass). `[TBD]` marks something still to be supplied by the owner.

---

## 1. The setup
- A **10-day Ogasawara trip**, **organized and sponsored by the AEGIS group**.
- Business purpose: **AEGIS is courting / negotiating with Nagatani and his junior Kadou (角谷)** — the key
  *external* guests the whole trip is built around. (In the original brief "Sadou" = **Kadou** = the same person.)
- **AIBOS** is a **new company funded by AEGIS**; its **8 members plan and run the trip** (the players' team):
  organize logistics, **serve the guests** at meals, join the fishing, and help the chefs.

---

## 2. Organizations

### AEGIS group — the sponsor / host
Leadership, in seniority order: **Watanabe (head) → Yamate → Saito → Maeda.**
Other AEGIS members on the trip: **Nobuaki · Shimura · Tamaya · Nate\* · Daisuke · Miki · Megu.**
Plus the chef **Akiyama** (an AEGIS company worker who also cooks) and everyone else not listed as an exception.
- \* **Nate** is **both AEGIS and AIBOS**; on this trip he acts **more as AEGIS**.
- **The only people NOT part of AEGIS:** the 2 French chefs **Nao & Kaito**, and the cameraman **Natsuki**.

### External guests AEGIS is courting (the negotiation)
- **Nagatani** and his junior **Kadou (角谷)** — **not AEGIS**; they are the counterparties the trip exists to
  negotiate with. Kadou is present **Days 1–5** (then leaves — see §3).

### AIBOS — the players' company (funded by AEGIS)
The **8 members who plan the trip**: **Matsumoto · Inaba · Nishinaga · Prakhar · Martin · Kevin · Andrew · Ambrose.**
(Nate is a 9th AIBOS-affiliated person but is counted with AEGIS here.) See §7 for the role mapping.

### Chefs — cook the meals at Hinata
- **Nao & Kaito** — a couple who run a **French restaurant**; invited on the trip specifically to cook (not AEGIS).
- **Akiyama** — an **AEGIS** company worker who also cooks.

---

## 3. Guests / VIPs (hosted; served at meals)
| Period | Main guests present |
|---|---|
| **Days 1–5** | Watanabe (渡邊) · Nagatani · **Kadou (角谷)** · Maeda |
| **After Day 5** | **Maeda & Kadou leave**; **Yamate & Saito join** |
| **Days 6–10** | Watanabe · Nagatani · Yamate · Saito |

Other members present (AEGIS unless noted): **Nobuaki · Shimura · Tamaya · Nate · Daisuke · Miki & Megu
(ladies) · Natsuki (cameraman, not AEGIS).**

---

## 4. Ships & fishing (two boats, daily)
Two boats operate: **Nobu-san's ship** and **Kimura-san's ship.** Not everyone fishes every day — of the
8 AIBOS members, **2–3 stay back each day** for other work.

### Nobu-san's ship — iso (磯 / rock) fishing
- Regulars: **Watanabe + Nobuaki** go **iso fishing**, together with **AIBOS members**.
- **Watanabe, Nobuaki, + maybe 1–2 more members, with Natsuki (cameraman)** get **dropped onto the rocks
  (iso)** and stay there to fish.
- The **other AIBOS members stay aboard Nobu-san's boat** and fish from the boat.

### Kimura-san's ship — jigging
- **Nagatani + other AEGIS members** go **jigging**.
- **Occasionally one AIBOS member** joins the jigging boat.

---

## 5. Meals & Hinata (the base)
- The chefs cook at a place called **Hinata (ひなた)** (hiragana).
- **All guests eat at Hinata, morning and night**; **AIBOS members serve them** there.
- **AIBOS members stay very close to Hinata — ~15 seconds' walk away.**
- **Lunch:** everyone **carries a packed lunch**, prepared in the morning by the **chefs with help from AIBOS members.**

### Hinata's three interactive sections (the map hotspots on the big Hinata compound)
Hinata folds in the command/finance/clinic roles and shows three clickable sections that stand for the daily prep flow:
- **🍱 Food** — the **kitchen**: the chefs (Akiyama · Nao · Kaito) cook and serve meals morning and night, and make the packed lunches each morning.
- **🎣 Fishing/Gear** — the **supply & assignment point**: all the fishing gear is prepared here and it's **decided who carries what**; the **food, drinks, medicine** and the rest of the kit are **packed here** too, ready to move out.
- **🚤 Transport** — **loading & haul-out**: everything is loaded onto the **small trucks** and carried down to the **port, where the boats wait** (Nobu-san → the iso rock; Kimura-san → the jigging grounds).

---

## 6. Role ↔ fishing-day duty (the engine's 8 organizer seats + 3 chefs)
Migrated from CLAUDE.md §4 — the duty each role carries in the modeled fishing day. The 8 AIBOS members fill
these 8 seats; the 3 chefs fill the 3 cook seats. (`teamLead` is retired; angler = `specialist`, `chef` added.)

| Seat (role · icon) | Fishing-day duty |
|---|---|
| `owner` 👑 | Final authority, abort call, budget root |
| `pm` 📋 | Coordination hub; ferry/schedule owner |
| `siteLead` 🧭 | **Boat operator (船担当)** — positions the boat to the target |
| `budgetLead` 🧮 | Meals/boat budget, receipts, reserve, daily reconcile |
| `safetyLead` ⛑️ | **Safety + medic** — weather/abort authority; angler's deputy |
| `logi` 📦 | **Catch & ice (漁獲処理)** — tackle intake, handling, lodging |
| `comms` 🎧 | Records, daily report, headcount / 点呼 |
| `specialist` 🎣 | **Angler / fishing-lead (釣り担当)** — gear pre-check, sets target; **shellfish allergy** |
| `chef` 🍳 ×3 | Head cook owns the menu (species/qty/cook-time), + sous/prep |

---

## 7. Rename mapping — real people → engine seats (APPLIED 2026-07-07, engine.js:239–249)

| Engine id | Role | Real person (applied) |
|---|---|---|
| p01 | owner 👑 | **Matsumoto** (松本) |
| p02 | pm 📋 | **Inaba** (稲葉) |
| p03 | siteLead 🧭 (boat) | **Nishinaga** (西永) |
| p04 | budgetLead 🧮 | **Prakhar** (プラカール) |
| p05 | safetyLead ⛑️ | **Martin** (マーティン) |
| p06 | logi 📦 | **Kevin** (ケビン) |
| p07 | comms 🎧 | **Andrew** (アンドリュー) |
| p08 | specialist 🎣 (angler · shellfish allergy) | **Ambrose** (アンブローズ) |
| p09 | chef 🍳 (head · Japanese food) | **Akiyama** (秋山) |
| p10 | chef 🍳 (French) | **Nao** (ナオ) |
| p11 | chef 🍳 (French) | **Kaito** (カイト) |

> **Design intent (2026-07-07): the PLAYER assigns the seats/duties — who does what is a gameplay choice, not
> fixed.** So this person→seat table is only the **default starting roster** shipped in the engine; the 8 AIBOS
> members (incl. the angler / boat / owner seats) are a **pool the player re-assigns during planning**.
> **BUILT 2026-07-07** — the Setup "Org & roles" panel now has a per-seat dropdown ("pick who sits in each
> seat"; swap-on-pick keeps it a bijection). It writes `overrides.seats`; `mergePlan` remaps holders +
> `participant.roleId` + every task's `assignedIds` + deputies to the chosen people (identity = no-op; verified
> person-agnostic — 15 anchors in `verify.js`, 170/170). Chefs are out of scope. Japanese labels: kanji for JP
> surnames + katakana for Western names (秋山 confident; **ナオ/カイト stay katakana — final, by owner's call**).

The **13 guests** are anonymous ambient figures in the engine (`GUESTS = 13`, no individual names), so they
aren't renamed — the named guests/members in §3 are world reference for a later build pass.

---

## 8. Backlog / open questions
1. ✅ **Player-assigned seats — DONE (built 2026-07-07, §7).** The Setup Org panel lets the player pick who
   holds each of the 8 seats; the engine remaps duties/tasks/holders/deputies + `participant.roleId` accordingly,
   person-agnostic and default-preserving (verify 170/170). *(Deferred: a person can't yet be given TWO seats
   or left seat-less — it's a strict 8↔8 bijection; and chef seats aren't player-assigned.)*
2. **Name kanji (optional):** kanji for the AIBOS surnames + AEGIS members if wanted; confirm 角谷 = "Kadou",
   渡邊 = "Watanabe". *(Nao/Kaito stay ナオ/カイト katakana — decided.)*
3. Anyone missing, or any relationship detail to add.

*(Resolved: Hinata = ひなた · Sadou = Kadou (角谷) · Nagatani+Kadou are external · Akiyama = AEGIS.)*
