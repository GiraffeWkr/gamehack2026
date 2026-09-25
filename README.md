# Zad Archery — Web Port (Combat Vertical Slice)

A mobile-first web rebuild of *Zad Archery* (Samharia Studios), written from the
decompiled original. TypeScript + Vite + PixiJS, no engine.

This is a **vertical slice**: it proves out the render path, the touch control
scheme, the stat system, the level curve and performance on a phone-sized
viewport. Art and audio are placeholder; the numbers are the real ones.

---

## Run it

```bash
npm install
npm run dev        # http://localhost:5173  (also binds 0.0.0.0 for phone testing)
npm run build      # typecheck + production bundle into dist/
npm run preview    # serve the built bundle
npm run verify     # run the headless simulation test suite
```

To test on a phone on the same Wi-Fi, open the `Network:` URL Vite prints.
The game wants **landscape**; portrait phones get a "rotate" prompt.

---

## What is actually implemented

| Area | State |
|---|---|
| Auto-advancing character | ✅ walks, stops to fight when an enemy is in range, resumes when clear |
| Tap / drag to aim | ✅ anywhere on screen, no virtual stick needed |
| Magazine ("arrows") | ✅ finite ammo, regenerates on a timer, shown as pips |
| Arrow-fall damage | ✅ arrows drop in from above onto the aimed point, with an AoE |
| Archer auto-attack | ✅ fires on its own while standing still |
| Enemies | ✅ Claw, Archer, Bat, Warrior, Mage + Run Portal + Guardian, with melee/ranged AI |
| Pack waves | ✅ 8 packs at level 1 scaling to 24, authored spacing and pack widths |
| Run portal | ✅ invulnerable until all packs are down, then a summon countdown and an extra wave |
| Level curve | ✅ real authored tables for levels 1–30, exponential extrapolation to 50 |
| Stats | ✅ the original's `Flat / Additive / Multiplicative` three-layer model |
| Skills | ✅ Multishot (shot), Rapid Fire + Sharp Shooter (buffs with real attack-speed effects) |
| Damage numbers | ✅ crit-aware, pooled DOM floaters |
| Death / respawn | ✅ progress is kept: only uncleared packs respawn |
| Save | ✅ localStorage (level, gold, kills, defeated guardians) |
| Mobile layout | ✅ safe-area insets, thumb-zone controls, ≥48px touch targets |

Deliberately **not** in the slice: crafting, mining, shaping, mastery, talents,
pets, taming, chests, orbs, jobs, the King fight, 14-language localisation,
audio, and the real Spine animations.

---

## Architecture

```
src/
  core/
    math.ts          Rng (seeded), clamping, compact number formatting
    stats.ts         StatBag: the Flat/Additive/Multiplicative model
  content/
    data.ts          Every tuning constant, lifted from the decompiled original
    level.ts         Level curve + run planner (packs, spacing, portal X)
  game/
    game.ts          The whole simulation. No PixiJS import - pure data
    skills.ts        Skill definitions, cooldowns, buffs
    types.ts         Snapshot + event queue the UI reads
  render/
    renderer.ts      PixiJS world, follow camera, parallax, sprite recycling
    placeholder.ts   Procedural baked sprite-sheet animations
  ui/
    hud.ts           DOM HUD, skill wheel, floating damage numbers
    input.ts         Pointer handling: tap and drag-to-aim
  dev/
    verify.ts        Headless test suite (54 checks)
```

Two rules keep this maintainable:

1. **`game/` never imports PixiJS.** The simulation is plain data, so it runs in
   Node for tests and could be rendered by something else entirely.
2. **UI is DOM, world is canvas.** Text, bars and buttons are HTML, which gets
   crisp text at any DPI, native safe-area handling and real hit-testing for
   touch — all things that are tedious to rebuild in a canvas UI layer.

---

## The two things worth knowing before you extend it

### 1. Stat keys are variable names, NOT `functionName`

The original keys its stat dictionary by **variable name alone** and passes the
layer as a separate argument:

```csharp
stats.ChangeAStat("Damage", StatsProperties.Flat, 1.0, IsAdd: true);
stats.Damage.Total.RealValue
```

`StatInfo.functionName` (`"Damage" + "Flat"` = `"DamageFlat"`) is a
**localisation key for tooltips**, not a dictionary key. Getting this wrong makes
every stat's layers unable to find each other and silently returns the flat value.
This port therefore uses:

```ts
stats.change('Damage', StatsProp.Flat, 1, true);
stats.get('Damage');                          // Total
stats.layer('Damage', StatsProp.Flat);        // one layer
```

The formula, copied from `StatsDouble.CalculateTotal`:

```
Total = round( Flat * (1 + Additive/100) * Multiplicative )
```

Below 1000 it rounds to 2dp, above it rounds to whole numbers. `Multiplicative`
is a **running product**, so it starts at 1 — an unset layer would zero the stat.

### 2. The camera clamps on the character, not on itself

The character must be able to walk all the way to the run portal while the portal
itself stays off the right edge until the last pack dies. Clamp the *camera*
instead and the character gets stranded off-screen. The working shape is in
`renderer.updateCamera`:

```ts
const subjectX = Math.max(game.px, game.portalX - CAMERA.maxLead + CAMERA.additionalLimitAfterPortal);
const desired  = subjectX - CAMERA.cameraLeadX;   // character sits right of centre
```

---

## Art and language

### Real art from the shipping build

Everything under `public/art/` was extracted from `Zad Archery_Data` with UnityPy:

| Asset | Source |
|---|---|
| `BG1_*` / `BG2_*` | the 8-layer parallax backgrounds, authored at **1920x600** |
| `Archer_1..5` | the player archer, used as a real walk cycle |
| `Guardian_*`, `bat_swarm_0` | minion art |
| `king_boss` | for the not-yet-ported final fight |
| `T_Arrow`, `T_GlowOrb_Bullet`, `FX_TX_*`, `FX_Ring_AD`, `shockwave`, `orb` | FX |

Because the backgrounds are exactly **1920x600**, that is the project's reference
resolution and the camera keeps a constant 1920 world units visible horizontally.
The vertical extent therefore varies with the device aspect ratio, which is the
same trade the original's orthographic camera makes.

Layer depth comes from the asset names themselves — `BG1_0sky` is furthest,
`BG1_7item` nearest and draws *in front of* the characters. Re-extract any time with:

```bash
python analysis/export_sprites.py     # sliced Sprites -> PNG + manifest
python analysis/export_bg.py          # parallax layers
```

### Language

Chinese is the default. `src/core/i18n.ts` holds a flat key table with `{name}`
placeholders, mirroring the original's `LocalizerManager` shape:

```ts
setLang('zh');
t('level', { n: 3 });          // 第 3 关
t('packs', { done: 2, total: 8 });  // 2/8 波
```

`npm run verify` asserts both languages have no missing keys and that every
placeholder interpolates.

## The one thing to understand before touching the camera

**World Y grows UP and shares the artwork's own space**: ground at `0`, sky at
`+600`. There is deliberately no sign flip between "where the art is" and "where
the game is" — that mismatch is what previously put the entire background above
the viewport.

Pixi's local Y grows *down*, so the renderer negates Y once when placing a
sprite's parent container and again per sprite when writing a world position:

```ts
c.y = groundScreenRow;      // world Y=0 lands on the character's feet row
sprite.y = -worldY;         // world-up -> local-down
```

Do **not** try to fix this with a negative container scale (`c.scale.y = -s`):
it mirrors every sprite.

The camera anchors on the **character**, not on a ground row. The visible world
height depends on the aspect ratio while the ground Y does not, so anchoring on
the ground pushed both the art and the character off-screen on short viewports:

```ts
// screen row of the character's feet:
this.viewH * CAMERA.playerScreenFraction
```

`cameraLeadX` (300) is how far the camera trails him, which puts his feet at
roughly 40% of the screen width — most of the frame is the ground he walks into.

Use `?measure=1` on the running game for a live geometry overlay of every layer's
screen range plus the character's position.
## Mobile notes

- **Landscape only.** It is a side-scroller; portrait shows a rotate prompt.
- **Safe areas** are handled with `env(safe-area-inset-*)` — the original solved
  this in `SafeAreaManager` with hardcoded iPhone insets.
- **Thumb reach.** The only interactive elements are the skill wheel (bottom
  right) and the magazine readout (bottom left). Nothing sits mid-screen, because
  the whole play surface is the aim target.
- **Fixed 60 Hz timestep** via `Game.tick`, so a 120 Hz phone behaves identically
  and a GC hitch cannot teleport the simulation.
- Sprites are **recycled**, not allocated per frame; particles are pooled, and
  floating damage numbers are pooled DOM nodes capped at 128 per frame.

---

## Tests

`npm run verify` compiles and runs `src/dev/verify.ts` under Node — 54 checks
covering the stat formula, the authored level tables, guardian scheduling, the
gameplay loop, portal gating, the death/respawn contract, skills, seed
determinism and world framing. It runs the real simulation with no browser.

Screenshots and geometry probes live in `debug.html` and `probe.html` at the
project root; they are development tools, not part of the shipped bundle.
