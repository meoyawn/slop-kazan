## Local follow-up — prepared live traffic graph

Traffic topology is now an offline recipe with5.73MB compressed Float64/Uint32 tables. Native construction3.10s becomes0.357s decode/hydrate; full topology/curve and1,200-step actor parity pass. Local traffic startup is1.05s, but Ready51.95s and Aerial32.19FPS still miss both targets. This removes startup work and retained construction metadata; it does not remove the live traffic/pedestrian CPU budget. The exact terrain-region merge is parked because its32.05FPS sample did not demonstrate a useful gain. Landmarks, buildings, street details, active actor surface queries and static shadow submissions remain separate measured costs.

# Original and Kazan: subsystem comparison

Compared with upstream `12593c9963f141665fe91881b1b4a2290db51d15` and the live original on 24 October 2026. Kazan release includes the published palette checkpoint `4cae9b0` and the still-local deferred-terrain candidate. These are different cities and camera routes: the measurements identify costs, not a claim that their scenes are identical.

## Isolated measurements

One Chrome game at a time, 1728 × 941 viewport, tracing/debugger stopped during FPS measurement. Actual RenderPipeline invocations divided by wall time; Auto-Director Aerial, 20 seconds from camera phase zero. The original: **62.73 FPS**, render CPU P50/P95 **6.7/8.3 ms**. Kazan: **16.89 FPS**, render CPU **22.2/48.6 ms**. Kazan's near-detail generation continues after camera travel, so transient generation remains part of the problem.

Renderer-tracked allocated bytes: original **409,549,676**, Kazan **1,221,357,493**. These include render targets, textures and storage, not just visible geometry. Original vertex attributes 91.9 MB, indices 3.34 MB, instance storage 52.7 MB; Kazan 623.7 MB, 121.0 MB and 67.0 MB respectively. Unique scene CPU-array inventories below are a different metric and must not be added to GPU allocation figures.

Live-original startup phases: renderer26, lighting37, cityGrid590, boroughs220, landmarks66, blocks745, streetDetails633, traffic310, roadPaint45, controllers19, culling150, ui13, postFX24, compile1370, warmup2879, firstFrame0, gpu74 ms. Kazan's recent Ready samples range roughly25–59 seconds. The deferred-terrain candidate saves about0.85 s of terrain construction; it has not established an overall loading improvement.

Temporary six-second Kazan Aerial ablations, each restarting the same camera segment, restore all visibility afterward:

| Visible scene | Rendered FPS | Render CPU P50/P95 |
|---|---:|---:|
| Full | 16.86 | 23.8 / 40.7 ms |
| Hide city grid (terrain/roads/rail/power) | 19.20 | 28.0 / 37.7 ms |
| Hide city buildings | 23.60 | 13.7 / 25.1 ms |
| Hide street details/vegetation | 17.85 | 26.3 / 41.4 ms |

Hiding a renderer does not stop its simulation/background generation. These are diagnostic ablations, never proposed graphics modes. Buildings account for a substantial CPU cost; no single omitted subsystem establishes60 FPS.

## Source correspondence and measured differences

| Subsystem | Original | Kazan | Finding / next boundary |
|---|---|---|---|
| Geography | 1,132,360-byte generated module;2,691 mapped blocks,3,246 roads; procedural boroughs add buildings | 16,939,481-byte gzip,115,858,441 decoded bytes;170,423 building/part records,71,171 roads | 102× decoded size is real. Blocks and individual building records are different units. Compact regional blueprints and streamed detail are preferable to expanding the entire region at startup. Keep the airport and mapped landmarks. |
| Terrain and streets | Flat core slabs/strips; static geometry merged by material | FABDEM terrain, exact terrain-facet road projection, whole-region streets/structures built eagerly | CPU scene grid arrays ~522 MB versus80.6 MB original; indexed bytes ~107 MB versus1.97 MB. Exact grade-separated roads need local detail, not whole-world eagerly resident detail. |
| Road markings | Four-vertex flat strips and shader dash patterns;45 ms construction | Terrain-sampled strips,1 mm simplification, shader patterns,1024 m batches | Original92,840 vertices/~5.76 MB; Kazan2.20 M/~142 MB resident buffers. Bake/stream the existing geometry or bound construction geographically; do not restore individual dash meshes. |
| Buildings/facades | Six procedural material families on core instances; borough instances per region with per-building parameters | Exact nearby footprints and reviewed models; independent1024 m distant facade meshes with nine per-instance attributes | Kazan has1,082 massing meshes alone, versus26 meshes for the original core. Nearby and distant parameters must stay attached to their instance through tile lifecycle. First renderer change: share regional facade instances while retaining1024 m detail ownership. |
| Collisions | Detailed core and regional proxy colliders | Converts raw building polygons into BLOCKS, then builds oriented colliders and base heights for all buildings | Data size itself is not a per-frame GPU cost; eager polygon/collider expansion creates startup work and residency. Precompute compact bounds/OBBs, then stream exact nearby collision/detail together. |
| Vegetation | Same procedural tree geometry/shader/LOD families | Same tree renderer plus streamed landcover sites and regional forest crowns | No evidence that every tree is doubled.28k capacities no longer receive redundant identity writes.471 forest canopy meshes/87,747 crowns remain globally resident; regional canopy/blueprint representation still needs comparison. |
| Repeated static parts | Shared unit parts and material collectors; instanced spatial culling | Shared palette boxes, plus BatchedMesh collections of unique surfaces | WebGPU BatchedMesh still submits each piece. Palette sharing reduces material bindings but does not make a multi-draw become one draw. Prior plain-mesh regional merge regressed and was rejected. |
| Rail/trams | Bridge/viaduct part collectors, limited rail scenery | Whole-region rail/tram beds, near sleepers/catenary and moving vehicles | Rail/sign grouping was fixed and published in514d914 (fixture batches271→102; earlier dense-road FPS16.76→26.39). This did not solve all rail costs. Dynamic trams/sign phases and streamed ownership must remain independent. |
| Power | No equivalent regional network; lamps and repeated infrastructure use shared collectors |1,317 power-support meshes across the full region | Same repeated-part/region problem as rails and facades, not a separate bespoke renderer. |
| Traffic/pedestrians | Bounded instanced actors on core graph | Same actor rendering families on a much larger height-aware graph | Do not confuse graph edge count with active actor count. Separate graph/index construction from per-frame nearby queries and simulation. |
| Culling | Spatial instance chunks and shadow proxies | Mostly the same upstream culling plus mutable static batches | Groups do not provide automatic spatial hierarchy culling. Whole-map object traversal remains even when geometry is outside the view. Reuse regional ownership for facade/part collections and bounded residency. |
| Post-processing/engine | Four-sample MRT, SSR, bloom, filmic; exact upstream engine | Same engine/post pipeline | Reducing quality is not the selected solution. Kazan also limits outstanding submitted frames; throughput must not be inflated by an unbounded GPU backlog. |
| Loading/cache | Compact source, cheap generation, shared shader pipelines; no persistent mesh/IndexedDB cache found | Large JSON expansion, whole-map construction, background12 ms detail/vegetation tasks interleaved with startup | There is no discovered magic original mesh cache to copy. Gate and budget generation; move invariant blueprint work out of startup and fetch region detail as required. Never hide the loading screen before the visible world is ready. |

## Implementation order

1. Regional shared facade instance storage: implemented locally,1,082 distant meshes→118 regions. Native comparison preserves every active matrix, all nine facade attributes and nearby geometry through nine travel/eviction/return states. The first candidate exposed stale GPU transforms after bootstrap replaced an existing storage attribute; this caused overlapping roofs in the user's screenshot. The corrected path retains storage attributes and refreshes the currently bound buffers on owner changes. The regression fails before that repair. GPU parity against independent meshes is byte-exact for six hide/evict/return states (8,192 pixels each). Corrected release `main-XiWIrgy9.js`: Ready23.83 s;20-second Aerial27.99 FPS, render CPU15.0/21.2 ms. Screenshots checked after movement, airport teleport and city return; no captured runtime warnings/errors. Do not use the erroneous pre-repair31 FPS sample as acceptance evidence. Loading and60 FPS remain unmet.
2. Compact/precomputed regional world blueprint: remove repeated defaults/metadata from the hot representation, precompute bounds/foundations/OBBs and keep full provenance separately. Preserve all existing landmark identities and the airport.
3. Stream/bake exact local roads, markings and terrain/detail, with lightweight procedural outskirts. A smaller download alone is not an FPS improvement: bound scene objects, submitted geometry and collision residency as well.

Both acceptance goals remain unmet: visible world under20 seconds and60 rendered gameplay FPS without rendering regressions.
