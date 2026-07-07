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
- The chefs cook at a place called **Hinata (ひなた)** — `[TBD: exact spelling]`.
- **All guests eat at Hinata, morning and night**; **AIBOS members serve them** there.
- **AIBOS members stay very close to Hinata — ~15 seconds' walk away.**
- **Lunch:** everyone **carries a packed lunch**, prepared in the morning by the **chefs with help from AIBOS members.**

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

## 7. Rename mapping — real people → engine seats
The engine currently names the 11 (engine.js:239–249). Renaming to the real roster (no role rework yet):

| Engine id | Role | Current name | → Real person |
|---|---|---|---|
| p01 | owner 👑 | Tanaka Kenji | `[TBD — which AIBOS member?]` |
| p02 | pm 📋 | Sato Aoi | `[TBD]` |
| p03 | siteLead 🧭 (boat) | Suzuki Riku | `[TBD]` |
| p04 | budgetLead 🧮 | Ito Mei | `[TBD]` |
| p05 | safetyLead ⛑️ | Yamamoto Go | `[TBD]` |
| p06 | logi 📦 | Nakamura Yui | `[TBD]` |
| p07 | comms 🎧 | Kobayashi Jun | `[TBD]` |
| p08 | specialist 🎣 (angler, shellfish allergy) | Kato Hana | `[TBD]` |
| p09 | chef 🍳 (head) | Mori Taku | **Nao** *(proposed — French pro)* |
| p10 | chef 🍳 (sous) | Hayashi Ken | **Kaito** *(proposed — French pro)* |
| p11 | chef 🍳 | Ono Rin | **Akiyama** *(proposed — AEGIS worker)* |

The **13 guests** are anonymous ambient figures in the engine (`GUESTS = 13`, no individual names), so they
aren't renamed here — the named guests/members in §3 are world reference for a later build pass.

---

## 8. Open questions (owner to confirm)
1. **AIBOS → seat mapping** (§7 p01–p08): which of the 8 fills each role? Which seat is **Prakhar**?
2. **Chef assignment** (§7 p09–p11): confirm Nao = head / Kaito = sous / Akiyama = third (or reorder)?
3. **Name readings / kanji:** 角谷 = "Kadou"? 渡邊 = "Watanabe"? kanji for the AIBOS members, chefs, and the
   AEGIS members (for the bilingual `{en, jp}` labels)?
4. **Hinata** spelling (ひなた / 日向 / …).
5. Anyone missing, or any relationship detail to add.
