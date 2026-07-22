# Bloom Hop

An original mobile-first cozy garden puzzle. Move Momo one tile at a time, push each watering can onto a flowerbed, and enter the flower gate to reach the next garden.

## Run

Open `index.html` directly in a modern browser.

- Mobile: use the large direction pad or swipe across the garden.
- Keyboard: Arrow keys or WASD to move, `Z` to undo, and `R` to restart the current garden.

## Puzzle rules

- Direction input moves immediately. There is no rhythm timing or input queue.
- Watering cans can be pushed but cannot be pulled.
- Filling every flowerbed opens the flower gate.
- Undo and restart have no penalty.
- Three handcrafted gardens introduce the rules gradually.
- Optional sunlight seeds reward exploration without blocking progress.

## Mobile layout

The interface uses dynamic viewport units, safe-area insets, large touch targets, swipe controls, press animation, audio feedback, and vibration where the browser supports it. The primary targets are Galaxy S23-class `360 x 780` CSS viewports and iPhone 16-class `393 x 852` CSS viewports.

## Art

The project uses original generated cartoon assets:

- `assets/garden-sprites.png`: rabbit gardener, forest friends, seeds, watering can, flower portal, and mushroom.
- `assets/garden-clearing.png`: bright magical garden environment.

No proprietary characters, maps, or game assets are reused.

## Repository

GitHub: https://github.com/flylucky25101/necrodancer
