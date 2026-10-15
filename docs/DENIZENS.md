# Webagotchi — Denizens (creature design)

*Knobs, not pins. Priority: get the denizens right; environment depth later.
Companion to `DESIGN.md` (UI/stats today), `NORNS_DIRECTION.md` (spine), and the
ranch body (`norn-ranch/napkin/body.py`, `creatures-port/biochem_proof.py`).
Browser-first, stdlib/zero-install. 2026-10-15.*

---

## Principle

**You touch knobs, never pin values.**

Keeper actions change the **world** or offer **stimuli**. They never write a
drive, need, or bar. Hunger moves only after food is noticed, wanted,
approached, eaten, and digested. Boredom falls only when the creature chooses
to engage. The UI is a set of knobs on the room; the creature is a small
chemical machine that may or may not care.

**Why:** The prototype (`Webagotchi.dc.html` `renderVals` actions) pins stats
directly — Feed does `hunger += 30`, Pet does `fun += 10`, Warm does
`temp += 20`. That makes a responsive toy, not a denizen. Ranch invariant:
influence enters as **emitters**, never pokes (`napkin/body.py` docstring;
`Body.emit`; `SPEC.md` §8). Same rule here, in the browser.

Anti-goal this note does **not** solve yet: rich places, Park/Beach, breeding.
Denizen pathway first.

---

## Prototype actions → world → pathway → chemistry

Six sidebar actions today (`Webagotchi.dc.html` ~415–420): **Feed, Play, Sleep,
Pet, Warm, Cool**. Current code pins values in `feed` / `playCmd` / `sleepCmd` /
`petCmd` / `warm` / `cool` (~365–382). Target behaviour below.

| Action | World-side (knob) | Creature pathway | Chemical that eventually moves |
|---|---|---|---|
| **Feed** | Place a **food** object in the scene (visible, finite). Does not touch hunger. | Notice → want (hunger high enough) → approach → eat → digest. Refusal if stuffed, asleep, or too miserable. Overeat → vomit path (world clears food; creature emits punishment-side effects via reactions, not a UI `hunger -= 30`). | Emit **FOOD** into the body; reaction cancels **HUNGER** (`REACTIONS` food×hunger in `napkin/body.py` ~77). Digestion can also nudge energy via a later product chem if needed — still not a UI write. |
| **Play** | Wave or toss a **ball** (or favourite toy). Ball is a stimulus in the world. | Notice → mood/energy gate → choose engage → play bout. No engagement ⇒ boredom unchanged. Too tired / asleep / lonely-miserable ⇒ ignore or glance only. | Engagement emits **NOVELTY** (and small cost emitters, e.g. toward sleepiness/hunger pressure); reaction cancels **BOREDOM** (`REACTIONS` novelty×boredom). Maps prototype “fun” to inverted boredom. |
| **Sleep** | Offer a **quiet nest / lights-dim** affordance (or “tuck in” as world state: nest available). Never `energy += 40`. | Creature chooses **sleep** when sleepiness dominates (`Body.choose` pattern). Nest present biases toward sleep; forcing “Sleep” button only improves the nest knob, does not set `sleeping=true` as a pin — at most a gentle stimulus (“yawn cue”) the body may refuse. | While asleep, body emits **REST** (`Body.tick` asleep branch); reaction cancels **SLEEPINESS**. Maps prototype “energy” to inverted sleepiness. |
| **Pet** | Keeper **presence / touch stimulus** in range (hand near bleb). Clears “away” for loneliness *clock* only as world fact (“keeper here”), not `fun += 10`. | Notice company → if not recoiling, accept contact → brief content bout. Clingy vs independent traits change approach distance and whether petting is wanted. | Emit **COMPANY**; reaction cancels **LONELINESS**. Optional tiny **NOVELTY** if contact is rare — still via emit, not bar writes. |
| **Warm** | Raise **ambient heat** in the room (knob on environment). | Body reads ambient each tick; discomfort rises if too hot; creature may pant, seek cool, or idle. No `temp += 20` on the pet. | Ambient is an external emitter into a **HEAT** (or temp) chemical / sensor; drives and face react. Prototype `temp` becomes room→body coupling, not a pinned pet field. |
| **Cool** | Lower ambient (or place a cool object). Same pathway, opposite knob. | Same. | Same heat chemical, opposite emit. |

**Loneliness today** is `Date.now() - lastInteraction > 900000` plus `touch()` on
every action (`isLonely` / `touch`). Under this design, “interaction” is
**creature-accepted contact or shared attention**, not “button clicked.”
Keeper presence can be a world flag (cf. ranch wishlist keeper-presence idea);
loneliness chemistry still only moves through **COMPANY** emits and time
**PRESSURE**, not `lastInteraction` stamps from the UI.

---

## Minimal body-lite chemistry

Port the **arithmetic only** (browser JS, no Python runtime). Provenance:

| Piece | Source | Role |
|---|---|---|
| `EVERY`, `MULTIPLIERS`, `decay_chemical` | `creatures-port/biochem_proof.py`; same tables in `napkin/body.py` | Tick decay |
| `add_sat` / `sub_sat` / `mul_sat`, `run_chemical_reaction` / `run_reaction` | proof + `body.py` | Reactions |
| Drive indices + molecules | `body.py`: `HUNGER, SLEEPINESS, LONELINESS, BOREDOM`; `FOOD, REST, COMPANY, NOVELTY` (+ optional HEAT) | Sparse slots, not full 256 unless useful |
| `REACTIONS` | `body.py` ~77–81: food→hunger, rest→sleepiness, company→loneliness, novelty→boredom | Digestion / relief |
| `PRESSURE` | `body.py` ~84: slow drive rise while awake | Time as weather |
| `emit(chem, amount, source)` | `Body.emit` — **only** world→body write | Knobs call emit on *world objects’ effects when the creature acts*, never on click |
| `tick` → reactions → decay | `Body.tick` | One biotick per UI tick (or N:1) |
| `choose` / verbs | `Body.choose`, `INNATE`, `VERBS` — **simplify for v1** | See attention below |
| UI bars | Derive display from `needs()`-style inversion (`Body.needs`: full drive ⇒ empty need) | Bars are readouts, not stores |

**v1 verb set (bleb-sized):** `notice` (internal), `approach`/`move`, `eat`, `play`,
`sleep`, `idle` — not ranch `speak`/`listen`/`dream` (text-automata). Habit table
can wait; innate weights are enough to start (`INNATE` shape, fewer verbs).

Benchmark reminder: biochem is cheap (`biochem_proof.py` sparse ~170k
creature-ticks/s on desktop). One bleb in JS is free.

---

## Attention → approach → decision (simple)

Per tick, while awake:

1. **Sense** world objects in range (food, ball, nest, hand, ambient).
2. **Salience** = f(drive, trait, object kind). Hungry + food nearby ≫ ball.
3. **Choose** one verb (softargmax / noisy argmax like `Body.choose`: top drive
   full vote, others fractional). If all drives below idle threshold → `idle`
   (`IDLE_BELOW` idea).
4. **Act** in the world (move toward, eat, engage ball, curl in nest).
5. **Emit** from the act’s outcome (ate → FOOD; played → NOVELTY; slept → REST
   via asleep tick). Then `tick()` runs reactions + decay.
6. **Face / log** read chemicals + verb; never the button that was pressed.

Starvation reflex (optional later): ranch `STARVE` + food underfoot forces eat
(`body.py` / ranch tick). Same idea — still creature-side, not UI pin.

---

## Traits (vary response, not pins)

Keep PILOT’s small trait set (hardy/delicate, clingy/independent, greedy/dainty,
playful/solemn, warm/cool-loving, chatty/quiet). They **scale knobs inside the
creature**:

- salience weights (greedy notices food sooner; playful notices ball),
- pressure multipliers (ranch `Body.pressure` genome),
- refuse thresholds (dainty rejects food when only mildly hungry),
- ambient comfort band (warm-loving tolerates higher HEAT).

Traits never let the UI write drives. They change how the same food object is
treated. Drift from lived history comes later (neglect marks, etc.).

---

## Anti-patterns (reject in review)

- Any button handler that assigns `hunger` / `energy` / `fun` / `temp` /
  loneliness directly (today’s `feed`, `petCmd`, `warm`, `cool`, end-of-play
  stat bundle in the tick).
- “Feed” that skips object + eat verb.
- “Play” that sets `playing=true` and later pins `fun += 30` with no engage
  choice.
- Using `touch()` / `lastInteraction` as a substitute for COMPANY chemistry.
- Calling `emit` from the click itself for FOOD/NOVELTY **without** a creature
  act (that is a poke wearing an emitter badge).
- Porting NapNorn / babel / phone ranch into the page — wrong layer
  (`NORNS_DIRECTION.md`: phenotype in browser; sim core can stay tiny JS).

---

## Build order (denizens first)

1. **Body-lite JS module** — tables + `emit` / `tick` / `drives` / display
   `needs`; unit-check decay/reaction against `biochem_proof.py` self-check idea
   (same seed → same trajectory).
2. **World objects v0** — food pellet, ball, nest flag, ambient heat scalar;
   buttons only spawn/adjust these.
3. **Loop** — sense → choose → act → emit → tick; rewrite Feed/Play/Sleep/Pet/
   Warm/Cool handlers to knobs only.
4. **Face + log** from chemicals/verbs; retire pinned stat writes.
5. **Traits v0** — scale salience / pressure / refuse; hatch assigns them.
6. **Then** environment depth (locations, travel) — after denizens feel alive.

Gate: a keeper can place food and watch the bleb *decide* to eat (or not). If
bars jump on click, the build failed the principle.
