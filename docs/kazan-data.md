# Kazan data and rendering

## What the original repository actually did

The NYC app did not download Google Earth meshes or photographic textures for each building.

1. `tools/geo-base.mjs` fetched NYC DCP borough boundaries, NYC street centerlines, parks and OpenStreetMap features. It projected coordinates into a local metre-based frame rotated to Manhattan's grid.
2. `tools/geo-streets.mjs` stitched streets; `tools/geo-blocks.mjs` rasterized the land, carved streets out, and eroded blocks into buildable lots. `tools/geo-extra.mjs` supplied shorelines, parks, islands, bridges and other features. `tools/geo-roadgraph.mjs` produced vehicle connections.
3. `tools/build-geodata.mjs` wrote `js/geodata.js`. `js/buildings.js` assigned seeded neighborhood profiles and generated ordinary buildings with plausible storeys and styles. It was not using a comprehensive database of measured building heights.
4. `js/landmarks.js` supplied custom landmark geometry. `js/tsl-materials.js` generated masonry, windows, interior parallax, glass, water and signs with shader math and canvas textures.

The Kazan app reuses the rendering, traffic, controllers, shaders and spatial culling, with a new geographic adapter and geometry builder. The internal `NYC` namespace and `__NYC_APP` inspection API are retained for compatibility with those engine modules.

## Reproducible Kazan pipeline

The checked-in `tools/data/kazan-osm.json.gz` is the complete saved response to `tools/data/q_kazan.overpassql`; its OSM timestamp is preserved in `GEO.source.timestamp`. The query includes buildings, building parts, streets/paths, parks, Kremlin walls and water multipolygons. Geometry is projected to a WGS84 local frame at 55.79° N, 49.108° E: x east, z south, one world unit per metre, true north. There is no Manhattan rotation.

`tools/build-kazan-geodata.mjs` joins multipolygon rings and holes, clips to the intended extent, preserves actual building polygons, associates building parts with their containing outline, and constructs connected driving links using shared OSM node IDs. Private and pedestrian-only roads do not enter the vehicle graph. One-way tags, lane counts, bridge tags and road widths are retained or given explicit class-based defaults.

Run `aube run geodata` to rebuild `js/kazan-geodata.js` offline. The saved extracts are sufficient; the large original height rasters are not runtime dependencies. A rebuild test checks that the generated bundle matches the checked-in artifact.

### Heights

The priority for each polygon is:

1. OSM `height`, including metre/feet conversion.
2. OSM `building:levels × 3 m`, plus a mapped roof height. Three metres per storey is an estimate.
3. Median valid first-band GBA.Height pixel inside the OSM footprint, reprojected into the raster's coordinate system.
4. A type-based fallback, marked `heightSource: "fallback"`.

The current extract has 16,249 building/part polygons: 114 use explicit heights, 9,595 use storeys, 6,061 use GBA, 461 use the type fallback, and 18 inconsistent parts use a marked `fallback-part` extent. Every polygon retains its OSM ID and `heightSource`. Inconsistent records retain a `heightIssue`; a height at or below `min_height` cannot produce a usable solid, so only that part's missing vertical extent is estimated.

`min_height` and `building:min_level` create elevated parts rather than walls extending to the ground. Parts share their outline's foundation. An outline with detailed parts is suppressed. The four Kul Sharif minarets are independent mapped buildings with explicit 58 m OSM heights; they are not lost when the mosque's low outline is suppressed. Suyumbike uses the mapped stepped parts. The Family Center and Epiphany bell tower have simplified custom silhouettes on their mapped sites; their descendants are suppressed to prevent duplicate geometry.

[GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) estimates heights from satellite imagery. These are model predictions, not surveys, and the satellite imagery and current OSM outlines can disagree in age or alignment. Small courtyards, roof structures, towers and demolished/new buildings are particularly uncertain. Source tiles, hashes, extraction method and license are saved in `kazan-heights.json.gz`.

### Elevation and water

[FABDEM V1-2](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/) removes building and forest-height biases from a global 30 m elevation model. The extract uses tiles N55E048 and N55E049. The central grid is sampled every 30 m; the outer landscape is subsampled every 90 m. The latter is lower-detail terrain, not additional measured resolution.

The engine subtracts a **53 m local vertical datum** from DEM elevations. This is an approximate reservoir-level reference, not a surveyed current water level. Water surfaces currently share that level; individual lake levels and seasonal reservoir changes are not modeled. OSM water polygons and island holes cut the terrain and define the actual shorelines, rather than using an ocean plane or NYC islands. The far mesh reaches the Volga's western hills around Verkhniy Uslon. It currently contains terrain and shorelines, without detailed buildings on that bank.

All ground meshes use the shared elevation sampler. Road strips and markings are sampled every six metres; park colors are painted directly onto the terrain texture so large park triangles cannot flatten hills. Buildings stand on a level foundation at the highest sampled footprint corner, with foundation walls filling downhill gaps. Players, planted feet, traffic, wheels, lamps and trees use the same ground; vehicles incline to local grade. Flying altitude is displayed above the local surface.

Pitched roofs are tessellated inside the actual footprint, including courtyard holes. Building collision uses those polygons as well, so an enclosing bounding box cannot block an open courtyard. Foundation collision extends to the downhill ground, and Kremlin wall segments follow the terrain every six metres.

A 30 m DEM cannot resolve a curb, individual stair, underpass, retaining wall or narrow embankment. Bridge decks use a smooth estimated profile between their endpoints because the ground DEM does not provide surveyed deck elevations. Traffic signal phases, road widths without tags, street furniture and trees within parks remain approximations.

### Materials and textures

OSM `building:material`, `building:colour`, `colour`, `roof:material`, `roof:colour` and roof shapes are used when mapped. Gabled roofs follow the footprint's main orientation; curved and other pitched roofs use simplified geometry. Rich window/interior textures are procedural. Most buildings do not have mapped facade materials/colors, and the app does not claim a photographic reconstruction. The removed NYC-specific night-water reflections are replaced by actual scene reflections and sky lighting.

### Refreshing the source rasters

`tools/fetch-kazan-enrichment.py` requires Python 3.11+, rasterio, numpy and shapely. For example:

```sh
uv run --python 3.13 --with rasterio --with shapely tools/fetch-kazan-enrichment.py
aube run geodata
```

The script uses HTTP/FTP byte ranges to extract only the named tiles from the publishers' large ZIP archives, checks their ZIP CRCs, and caches the TIFFs outside the repository. `--terrain-only` refreshes only the terrain. Source URLs and SHA-256 hashes are saved in each extract. Public GBA download credentials in the script are the publisher's published anonymous download credentials.

To refresh OSM, submit the checked-in Overpass query, confirm the response has no `remark` or missing geometry, and save its complete JSON response as `kazan-osm.json.gz`. Refresh height extraction after changing footprints. Do not replace the snapshot with a partial or failed API response.

## Software browser loop

Run a single Vite instance with `aube run dev -- --software`. It changes preview quality only and does not force an adapter through JavaScript. A CPU-only Linux browser may need software adapter flags; a GPU Mac uses plain `aube run dev`.

For a headless Chromium development session, the relevant launch options are:

```text
--headless=new --enable-unsafe-webgpu --enable-unsafe-swiftshader
--enable-features=Vulkan --use-vulkan=swiftshader
--use-webgpu-adapter=swiftshader --use-angle=swiftshader
--disable-vulkan-surface --remote-debugging-port=9222
```

Connect Playwright with `chromium.connectOverCDP('http://127.0.0.1:9222')` to reuse that browser. Keep one page pointed at Vite, inspect browser errors and screenshots after reload, and use the existing `__NYC_APP` API for camera, controller and geometry diagnostics. Queue backpressure prevents software WebGPU from accumulating many stale frames.

The software preview reads the rendered image from an offscreen WebGPU target and displays it in a 2D canvas. This avoids black canvas presentation observed with headless SwiftShader on this CPU machine, and makes screenshots useful. Input is attached to the visible canvas. Default GPU rendering does not read frames back to the CPU.

The default development server does not set the preview flag, and `aube run build` never injects it. The generated build includes all classic city scripts despite their dynamic ordered loader. Plain static hosting remains supported.

### Validation on the CPU development machine

On 2026-10-22, `aube test` passed all 103 tests, `aube run build` succeeded, and `aube check` verified the installed dependency links. Playwright reused one Chromium instance through CDP and one Vite instance. All eight destinations were checked in all four travel modes; all twelve cameras produced finite positions. Driving advanced approximately 98 m while tracking the ground. A vertical ray into the Junker School courtyard confirmed that no building roof covered the open space. A 390 px layout check found no horizontal overflow.

The production build was also loaded without the Vite software flag: full pixel ratio, sun shadows, and the SSR/bloom/color pipeline were enabled, and rendered pixels were read successfully with no browser errors. Chromium still used SwiftShader launch flags on this machine; this was a CPU rendering check, not a hardware GPU benchmark. Native WebGPU canvas presentation remained black in headless Chromium, so the production image was inspected through an offscreen readback. The Mac's GPU performance and browser presentation still need validation there.
