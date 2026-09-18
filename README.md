# Meridian — Port Edition

Prototype of the node-to-network situational intelligence platform, scoped to one
terminal and its community. See `../PSA_MERIDIAN_Port_Edition_Build_Plan.html`.

    npm install
    npm run dev

Then open the URL Vite prints.

## What is here

    packages/contracts   FROZEN. Types, the scenario models, plate calibration,
                         the shared world spec and the mock kernel.
    packages/ui          The design lock: tokens.css plus HUD primitives.
    apps/meridian        The scenario console.

## The console

Pose a disturbance, watch it propagate, pick an adaptation, compare it against
doing nothing. Three scenarios, one per simulation scale:

    1  Monsoon — crane sway      asset, milliseconds
    2  Vessel arrives late       terminal, hours
    3  Reroute the AGV fleet     fleet, minutes

Keys: 1-3 scenario, arrow keys move the disturbance, S schematic, M motion,
L lens, space play/pause. Click a link in the propagation chain to play the
shot that shows it.

Nothing in a chain is written by hand. Each model reads state the previous one
wrote, so moving the slider somewhere the rehearsal never went still computes.

## Rules for every agent

1. You own one directory. Do not write outside it.
2. `packages/contracts` is frozen. Import from it, never edit it. Need a change?
   Stop and ask — do not widen a type or cast around it.
3. Build against `@meridian/contracts/mock` until the real kernel lands at G1.
4. No bare numbers in UI. Every displayed value is a `Fact<T>`.
5. No `Math.random()`, no `Date.now()`. Randomness comes from the injected seeded
   PRNG; time comes from `SimInstant`.

## Deviations from the plan document, and why

- **npm workspaces, not pnpm.** pnpm is not installed on the target machine and
  npm workspaces is sufficient. Switch later if you want the disk savings.
- **Plain CSS with custom properties, not Tailwind.** The whole product is a HUD
  built from a small token set; `packages/ui/src/tokens.css` IS the design system
  and is easier to review, hand to a designer and diff than utility classes.
- **No three.js at all.** The stage is a photoreal plate with a calibrated 2D
  canvas overlay. The same overlay drawn on a dark ground IS the schematic view,
  so there is one geometry to maintain rather than two. Bundle went from 694 kB
  to 216 kB.

## Plates and registration

`packages/contracts/src/plate.ts` holds a calibration per weather state:
horizon, quay edge, crane positions, berth spans, the yard quad. The plates the
video model produced are NOT pixel-aligned with each other — it gave a slow
dolly rather than a locked shot — so each state carries its own calibration and
the console uses a still per state. Switching weather swaps still and
calibration together, and the overlay stays put.

The plate is drawn with `object-fit: cover`, so every overlay point goes through
`coverFit()` in `stage/overlay.ts`. Skip that and the data sits in the wrong
place. Weather severity is drawn in-engine from the modelled wind, not baked
into the plate, so the rain gets heavier when you move the slider.
