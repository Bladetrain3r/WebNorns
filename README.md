# Webagotchi

A small creature (a bleb) in the browser. Static HTML and vanilla JavaScript: no build step, no packages. Open the files, or serve the folder as-is.

## The rule

You touch knobs, never pin values.

Keeper actions change the room or offer a stimulus. They never write a drive. The Hunger, Energy, and Fun bars are readouts of a small chemistry: a full drive shows an empty need, so the Hunger bar rises when the hunger chemical falls. Temperature is a heat chemical that follows the air in the room.

| Action | What the button does | When a bar actually moves |
|---|---|---|
| Feed | Puts a pellet on the floor | Hunger eases after Bleb notices it, wants it, walks over, eats, and digests |
| Play | Tosses a ball | Boredom eases only if Bleb chooses to play |
| Sleep | Offers a nest and a dim light | Sleepiness eases only while Bleb is actually asleep |
| Pet | Offers a hand nearby | The Social bar rises only if Bleb accepts the contact |
| Warm / Cool | Raise or lower the room | Felt temperature trails the air; the creature is not assigned a new temperature |

If Bleb is full, asleep, too tired, or simply not interested, the object sits there until it goes stale. Clicking again does not bump a bar.

An earlier prototype added to the bars inside the buttons. That path is gone.

## Traits

Each norn carries a seven-byte genome: appetite, playfulness, sociability, warmth, metabolism, sleepiness, and a quiet or chatty voice. 128 on a gene is the even temperament. The genes change how strongly a pellet, a ball, a hand, or the nest pulls, how fast the drives weather in, and when the norn refuses. A dainty norn leaves food that a greedy one eats. Hatch starts a new norn at birth chemistry and leaves the room's temperature alone. It does not edit the norn that was already there.

The creature packet stores that genome as `g`, seven numbers from 0 to 255, so a later bookmark can carry it in the URL. The expressed trait table is derived, not stored.

## Run it

Open `index.html` in a browser. A server is optional; the page is plain scripts, so a local file works.

```bash
python3 -m http.server
```

Then visit `http://localhost:8000/`.

Bleb ticks about once every 0.7s. Feed, and watch whether they walk to the pellet. The Hunger bar should stay put until they chew.

## Checks

```bash
node js/checks.js
```

Or open `test.html` in a browser. The checks cover decay and reaction arithmetic (the same numbers as the Creatures-style reference), that a sparse chemistry matches a full one, that Feed / Play / Sleep / Pet / Warm / Cool do not write the body, and that the genome changes those choices.

## Files

- `js/chem.js` — decay, reactions, `emit`, drive readouts
- `js/genome.js` — seven-byte genome, expression, a small inheritance step
- `js/world.js` — pellet, ball, nest, hand, ambient heat
- `js/bleb.js` — sense, choose, act, hatch
- `js/face.js` — mood, status, and the trait line
- `js/ui.js` — the page
- `docs/DENIZENS.md`, `docs/DESIGN.md` — the design notes this slice follows
- `docs/AUDIENCE_AND_LIFECYCLE.md`, `docs/WEEKLY_ROUTINE.md` — later notes, not built

Other rooms stay a seam (`place` on the world). `exportState` / `importState` pack the creature, including `g`, and leave the room behind. Each tick asks a lifecycle policy. The only policy is stasis, which does not end the creature. Mortality is not plugged in. A child genome can be rolled from a parent; there is no mate button yet.
