# Webagotchi — Design Reference

Web port of the MLPet 2.0 terminal Tamagotchi. Single-page static site, all persistence in `localStorage`. The prototype (`Webagotchi.dc.html`) is functional — this doc captures its design system, layout, mechanics, and behaviors for implementation.

## Aesthetic

Soft & cute, pastel, rounded, modern toy-like. The blob is the saturated focal point against muted warm neutrals. One dark element (the log) as terminal-nostalgia contrast.

### Fonts
- **UI:** Nunito (Google Fonts) — weights 500/700/800/900. Heavy weights everywhere; 900 for names/headings, 700–800 for labels.
- **Log & stat numbers:** IBM Plex Mono 400/500.

### Core palette
| Role | Hex |
|---|---|
| Page background | `#faf5ee` (warm cream) |
| Panel background | `#ffffff`, borders `2px solid #f0e6dc` |
| Body text | `#4a4152` |
| Muted text | `#a79bb0` / `#8d7f97` / label caps `#b3a7bd` |
| Scene card | vertical gradient `#fdf3f5 → #f7ecf3 → #f0e7f4`, border `#f3e4e6` |
| Log card | `#3b3346` (dark plum), text `#d8cfe6`, timestamps `#7f7292` |
| Primary button | `#f8a8c6` bg, `#6e3a52` text |

### Pet colors (random at birth, one per pet)
`#f8a8c6` pink · `#9cd0ee` blue · `#a8dcb0` green · `#f6c66a` yellow · `#c3aef0` lavender · `#f5a98f` coral · `#8fd9d0` teal. Dead pets render `#c9c2cf` (gray).

### Stat bar colors
Hunger `#f6c66a` · Energy `#c3aef0` · Fun `#f8a8c6` · Temp is dynamic: `#f5a98f` when >70, `#9cd0ee` when <30, else `#b9d6a8`.

### Log line colors (semantic)
Positive/green `#a8dcb0` · warm/food `#f6c66a` · play/affection `#f8a8c6` · sleep `#c3aef0` · warning/heat/death `#f5a98f` · cold `#9cd0ee` · chatter/system `#8d80a0` · away-summary `#c3aef0`.

### Shape language
Radii: panels 24px, cards/inputs 14–18px, chips/pills 999px. Borders 2px, often dashed for locked/soon items. Shadows only on overlays (`0 12–20px 32–60px rgba(90,70,110,.14–.25)`).

## Layout

Full-viewport grid, two rows: header + content. No page scroll.

```
┌──────────────────────────────────────────────────┐
│ HEADER: mood chip + name/mood/age │ 4 stat bars  │
├───────────────────────────────┬──────────────────┤
│ SCENE (flex:1)                │ SIDEBAR (270px)  │
│  location chips (top-left)    │  "Actions" label │
│  blob (scales, max 240px)     │  6 action btns   │
│  status pill                  │  (spacer)        │
├───────────────────────────────┤  Graveyard (n)   │
│ LOG (170px, scrolls, mono)    │  release pet…    │
└───────────────────────────────┴──────────────────┘
```

- Stat bars: 150px wide, 12px tall rounded track `#f1eae2`, colored fill with `width .5s` transition, overlaid `repeating-linear-gradient` white stripes for a segmented █░ feel. Label row: stat name + mono percentage.
- Blob must shrink with viewport height (fixed-size SVG clips on short screens — wrap in `flex:1; min-height:0` and size by height with `aspect-ratio`).
- Location chips: "Home" active (solid white), "Park · soon" / "Beach · soon" dashed + faded — affordance for future locations feature.
- Action buttons: icon tile (36px rounded square, pastel bg per action) + bold label + tiny effect description (e.g. "Feed — +hunger, +energy"). Hover: pink-tinted bg + 1px lift; active: scale .97. Disabled: opacity .45.
- Log: newest at bottom, auto-scroll to bottom (`scrollTop = scrollHeight`, never `scrollIntoView`), keep last ~120 lines, `HH:MM` timestamps.

## The blob

SVG, viewBox `0 0 200 185`. Simple shapes only: body ellipse (cx100 cy102 rx64 ry60), 2 stubby rotated arm ellipses, 2 leg ellipses, soft white highlight ellipse top-left, pink cheek ellipses (`#f791b5`), ground shadow ellipse. Big kirby-style eyes: dark `#332b3a` circles r12 with white highlight dots.

### Face states
| State | Eyes | Mouth (quad curve) | Extras |
|---|---|---|---|
| happy / playing | open, blinking | big smile | cheeks at .7 opacity |
| content | open | small smile | |
| grumpy | open | flat line | |
| miserable / dying / lonely | open | frown | tear drop (animated drip) under left eye |
| sleeping | closed arcs | tiny smile | floating "z z" letters |
| dead | X-crosses | flat line | gray body, R.I.P. overlay |
| hot (temp>70) | — | — | sweat drop top-right |
| cold (temp<30) | — | — | body shivers (translateX ±2px, .35s) |

### Animations (CSS keyframes)
- `squish` 3s idle breathing (scale 1→1.04,.955), origin bottom-center; 5s while sleeping; none when dead.
- `squishFast` .7s bouncy hop while playing (+ translateY −6px); a small wobbling ball appears beside them.
- `blink` 4.6s (scaleY dip at 92–95%).
- Cheap CSS-only; no canvas/JS animation needed.

## Mechanics (deltas vs terminal script)

Stats 0–100: hunger, energy, fun, temp. Tick every 1s.

- **Decay per second (halved from script — deliberately slower):** hunger 0.015, energy 0.01, fun 0.025.
- Temp drifts toward 50 at 0.1/s. Temp>70: +0.075 energy decay (panting msgs). Temp<30: +0.075 hunger decay (shivering msgs).
- **Lonely** after 15 min without interaction → fun decay ×2, lonely mood/face.
- **Mood** = avg of 4 stats: >70 happy, >50 content, >30 grumpy, >10 miserable, else dying. Lonely overrides.
- **Sleep:** 30s → +40 energy, −5 temp (min 30). Interrupt after 5s elapsed → +0.5 energy/s slept, "sleep interrupted". Feed/play interrupts sleep.
- **Play:** 20s → +30 fun, −15 energy, −10 hunger, +5 temp (max 80). Manual = random game; auto = favorite game. Games: fetch 🎾 / puzzle 🧩 / chase 🏃 (favorite assigned at birth).
- **Auto-actions** (skipped if fun=0 AND lonely — too depressed): energy<15 → auto-sleep; fun<20 and energy>30 → auto-play favorite.
- **Actions:** Feed +30 hunger +10 energy (if hunger≥90: vomit, −30 hunger −20 fun −10 energy) · Play · Sleep · Pet +10 fun, clears loneliness · Warm +20 temp · Cool −20 temp. All actions set `lastInteraction`.
- **Deaths:** hunger=0 starvation · energy=0 while awake exhaustion · temp≤10 hypothermia · temp≥90 heatstroke · fun=0 + lonely, 0.5%/tick broken heart.

### Offline catch-up
On load, elapsed since `lastUpdate` decays at **25% rate**, simulated in 60s chunks so auto-sleep/auto-play still fire and deaths get correct causes. Log a summary: "while you were away (3.2h): napped 2×, played fetch 1×". Skip if away <2 min.

### Random chatter
~2%/tick, min 30s apart, only while awake/idle: `💭 {status line}` in muted color. Status line composes adjectives (starving/hungry/stuffed, exhausted/tired/hyperactive, bored/ecstatic, freezing/overheating, lonely) at same thresholds as script.

## Flows

- **Hatching (first visit / after death):** blur-backdrop modal, wobbling spotted egg SVG, name input (placeholder "Blob", max 14, Enter submits), "Hatch! 🐣" button. Assigns random color + favorite game, stats all 50, logs birth message.
- **Death:** overlay card inside scene (translucent cream backdrop): 🪦, "{name} has passed away", cause + lifespan, buttons [Visit graveyard] [Hatch a new pet]. Memorial appended to graveyard (name, ISO date, days lived ≥1, cause, favorite, color), capped at 100.
- **Graveyard:** modal list, newest first — gray dot in the pet's color, name, "loved {game} · lived {n} days", cause pill. Empty state: "No pets have died yet."
- **Release:** small ghost-text button, `confirm()` guard, deletes state and reopens hatch modal.

## Persistence
- `localStorage['mlpet.state']` — pet object: name, color, favorite, 4 stats, alive, cause, sleeping/playing + start timestamps, playGame, birth, lastUpdate, lastInteraction. Saved every tick and on every action.
- `localStorage['mlpet.graveyard']` — memorial array, last 100.

## Tweaks in prototype (dev-only)
`simSpeed` 1–60× multiplier on decay (activities/loneliness stay real-time) and `quiet` to mute chatter — useful for testing deaths.

## Future affordances (do not build yet)
- Locations: chip row in scene is the entry point (Park, Beach locked).
- Action sub-options: sidebar buttons could expand to sub-menus (e.g. Feed → meal choices); the icon-tile + label + description row layout leaves room.

## Emoji
Used deliberately (inherited from the terminal script's voice): in log messages, action icons, and modal accents. Keep them there; don't spread further.
