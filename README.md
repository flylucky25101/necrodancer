# Bloom Hop

An original mobile-first cozy rhythm puzzle garden. Queue up to three directions at any time, then watch Momo the rabbit take one relaxed step on each beat.

## Run

Open `index.html` directly in a modern browser. Audio starts after pressing the start button because of browser autoplay rules.

Keyboard controls: arrow keys or WASD to queue movement, Space to pause. Mobile uses the on-screen direction pad.

## Play design

- Any input during the beat is accepted and reserved for the next step.
- Up to three future steps can be queued.
- Missing a beat has no penalty; the rabbit simply rests.
- Inputs near the flower bonus zone grant extra seeds and score but are never required.
- Friendly collisions cancel only that step and preserve the remaining queue.
- Three handcrafted watering-can puzzles introduce mechanics gradually.

## Art

The project uses original generated cartoon assets:

- `assets/garden-sprites.png`: rabbit gardener, forest friends, seeds, watering can, flower portal, and mushroom.
- `assets/garden-clearing.png`: bright magical garden environment.

No proprietary characters, maps, or game assets are reused.
