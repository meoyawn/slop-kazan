# Upstream technical sync — 2026-10-23

Source: [mrdoob/slop-newyork at 12593c9](https://github.com/mrdoob/slop-newyork/commit/12593c9), 23 commits after the fork's shared base `0049a49`.

## Included technical changes

- Native ES modules, explicit dependencies and module preloading. The startup module loads the engine and Kazan geography before evaluating the city graph. The geography loader rejects a payload whose city identity is not Kazan. Optional sky, clustered-lighting, SSR and bloom modules remain outside lightweight startup.
- Standard gamepad input for all four travel modes, analog steering/look/zoom, mode and camera cycling and map controls. Keyboard/touch input blending, focus loss, disconnect and held-button suppression remain consistent with Kazan's super boost.
- Synthesized spatial motors, bicycles, rotor, footsteps, conversations, horns and collision audio, with building obstruction/reflections and bounded voice pools. Street emitters follow road/connector elevations; footsteps and wind use local terrain. No NYC crossing-signal sites are introduced: Kazan has no verified sound-emitting signal inventory, so those sources remain empty. `kazan-sound` stores the preference.
- Saved stationary positions for all travel modes, restored through the controller's collision-aware teleport placement, including aircraft altitude. `kazan-player-state` is city-tagged and bounded to the regional frame; foreign, malformed and unavailable storage is ignored.
- Preserve the fork's vehicle physics at `ad468c1`: pedestrian, car, bicycle and helicopter motion-update methods match the fork after adapting native import bindings. The incoming upstream coasting/braking model is excluded at the user's request. Double W or double Up toggles super boost; double Shift no longer toggles it. Held Shift remains ordinary boost. Slopes, helipad landings and polygon/gate collisions remain intact.
- A smaller police/taxi/bus share, police yielding while passing red signals, replenishment of distant populations and connected pedestrian routes/conversations. Kazan's two-millisecond pedestrian placement budget remains in place.
- Rear indicators at the outer lamp edges; more accurate, lower-cost SSR with roughness masking; physical road-paint geometry retained before traffic routing filters and joined through bends. Paint keeps each mapped road identity and its interpolated terrain/bridge/tunnel elevation.

## City-specific decisions

The Manhattan northern-road expansion in `12593c9` is intentionally excluded. The dormant NYC geography, generator and original city-specific modules remain byte-for-byte at their preceding fork versions and are absent from the application module graph and production output. Shared consumers import `kazan-config.js` and the Kazan runtime; world builders import `kazan-city.js`. The later concurrent church refinements and citywide power-network data from `ad468c1` are retained, including their compressed geography, appearance records and regressions; no NYC geographic data is introduced.

The pinned Three.js revision remains `2bd920c3a604a3b847d9187b0a1c21e33807ecb3`; its TSL exports and SSR binary refinement support the incoming renderer changes.

Production JavaScript/CSS use Vite content hashes. Compressed geography stays separate; its cache key includes both the source data and lightweight-data compiler. The Pages deployment command defaults to `feat/kazan-tatarstan`; `KAZAN_PAGES_BRANCH` can select an isolated preview under the same project/account.

## Verification

The pre-merge suite passed 155 tests. The first merged suite passed 162. Gamepad, terrain-aware audio and saved-position checks were added; the elevated-audio regression fails against upstream's sea-level source collector (zero nearby motors instead of one) and passes after adaptation. Native startup checks exercise split gzip headers, HTTP-decoded JSON, lightweight downloads, optional-effect exclusion, failure recovery and wrong-city rejection.

The integrated suite passed 173 tests before the final physics/input revision. The final restoration and forward-double-tap change passed 49 controller, touch, gamepad and helicopter-landing checks; all four motion-update methods were compared directly with the fork. An isolated WebGPU preview reached the rendered city without runtime warnings/errors. Further renderer work/checks were explicitly deferred by the user. Published commit/deployment evidence is recorded in the work queue. The existing port-5173 server was unreachable and was not started or restarted; use the isolated Pages build for browser checks.
