# Neverending Tunnel III: Infinity Wave

Ride an endless barrel, round the other surfers and the sharks, towards the
light. The way out is at the end of the barrel. You never reach it.

The tunnel is water now: a tube of green sea curling over you, thick in the
face, thin and glowing where the lip throws over and the curtain falls, with
foam dragged round it by the flow and daylight at the far end. You see it
over the nose of your board. Like Neverending Tunnel II it's drawn with
WebGPU where the browser has it and WebGL 2 where it doesn't, with the same
shaders written for each (WGSL in `src/shaders`, GLSL in `src/shaders/gl`).

![Title screen: the barrel curling away to the light, over the nose of the board](docs/screenshots/title.png)

| | |
|---|---|
| ![A surfer, a shark fin, a jellyfish and a loose board ahead](docs/screenshots/things.png) | ![A shark leaping across the barrel](docs/screenshots/shark.png) |
| A surfer, a fin, a jellyfish, a loose board | A shark leaping across |
| ![A pack of surfers across the face, and a turtle](docs/screenshots/pack.png) | |
| A pack, and a turtle | |

## Run

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/
```

Needs WebGPU or WebGL 2 (any current browser). `?renderer=webgl` or
`?renderer=webgpu` pins one, and `?particles=40000` sets how much foam and
spray there is (it otherwise starts at 90,000, or 40,000 on phones, and
thins itself out if frames run slow).

## Controls

- ← → / A D: carve round the wave, from the curtain's foot, round the bottom and up the face until it hangs over you
- ↑ / W / Space: pop an air
- Drag: carve, on a phone; tap or flick up: air
- Space / tap: drop in, paddle back out
- P: pause, M: sound

## In the wave

- Surfers, crouched on their boards, carving up and down the face
- Packs of surfers right across the face, with one gap
- Shark fins circling: go round, or air over them
- Sharks leaping clean across the barrel
- Turtles at the surface
- Loose longboards cartwheeling through the tube
- Jellyfish, swept round with the water

Passing close is a near miss: you'll hear it go by.

## Sound

All made as it plays, with Web Audio, no samples: an instrumental surf band
from about 1962. The lead guitar picks out the tune low and twangy over
Am G F E, then tremolo-picks the chorus up high; a rhythm guitar chops on the
backbeat, the bass walks and the drums keep a surf beat and break into a tom
roll, with a slide down the low string into it, all through spring reverb.
The guitars are plucked strings (Karplus-Strong). When you wipe out the lead
dives off the end of the whammy bar. Under the band: the roar of the barrel,
the hiss of the board over the water, spray, and drops pinging off the board.

## Layout

- `src/shaders/tube.wgsl`: the barrel, its whole mesh made up from the vertex index
- `src/shaders/particles.wgsl`: foam and spray, every particle made up from its index
- `src/shaders/things.wgsl`: surfers, boards, sharks, turtles and jellyfish
- `src/shaders/sky.wgsl`: the light at the end
- `src/shaders/post.wgsl`: tone mapping, vignette, flash and fade
- `src/shaders/gl/`: the same five for WebGL 2
- `src/gpu.js`, `src/gl.js`: the WebGPU and WebGL 2 renderers; `src/renderer.js` picks one
- `src/frame.js`: packs each frame's uniforms once for either renderer
- `src/game.js`: riding, carving, airs, the things in the wave, collisions and near misses
- `src/meshes.js`: the sphere, box, surfboard and shark everything is built from
- `src/main.js`: the frame loop
- `src/input.js`, `src/hud.js`, `src/sound.js`: controls, HUD, the band and the sea
- `src/constants.js`, `src/math.js`: shared numbers and helpers
