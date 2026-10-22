# Kazan data and rendering

## What the original repository actually did

The NYC app did not download Google Earth meshes or photographic textures for each building.

1. `tools/geo-base.mjs` fetched NYC DCP borough boundaries, NYC street centerlines, parks and OpenStreetMap features. It projected coordinates into a local metre-based frame rotated to Manhattan's grid.
2. `tools/geo-streets.mjs` stitched streets; `tools/geo-blocks.mjs` rasterized the land, carved streets out, and eroded blocks into buildable lots. `tools/geo-extra.mjs` supplied shorelines, parks, islands, bridges and other features. `tools/geo-roadgraph.mjs` produced vehicle connections.
3. `tools/build-geodata.mjs` wrote `js/geodata.js`. `js/buildings.js` assigned seeded neighborhood profiles and generated ordinary buildings with plausible storeys and styles. It was not using a comprehensive database of measured building heights.
4. `js/landmarks.js` supplied custom landmark geometry. `js/tsl-materials.js` generated masonry, windows, interior parallax, glass, water and signs with shader math and canvas textures.

The Kazan app reuses the rendering, traffic, controllers, shaders and spatial culling, with a new geographic adapter and geometry builder. The internal `NYC` namespace and `__NYC_APP` inspection API are retained for compatibility with those engine modules.

## Reproducible Kazan pipeline

`tools/data/kazan-coverage.json` defines a 48.78–49.42° E, 55.57–55.98° N rectangle, approximately 40 × 46 km. It contains the administrative Kazan bounds and all requested outer checkpoints: Aviastroitelny, Novaya Tura, the Zelenodolsk industrial park, Samosyrovskoye cemetery, the airport and M7. The industrial park is the site near Novaya Tura; its [operator gives coordinates 55.852888, 48.842936](https://prom-tehnopark.ru/). Zilantov Monastery is at 55.8075694, 49.0571245, OSM relation 3867929.

The checked-in `tools/data/kazan-osm.json.gz` comes from the [OSM France Tatarstan regional PBF](https://download.openstreetmap.fr/extracts/russia/volga_federal_district/), snapshot **2026-10-21T00:47:51Z**. `tools/import-kazan-osm.py` imports complete ways and assembles multipolygon members before selecting the area. Large Overpass requests failed, so they are not a dependency of this refresh process. The PBF boundary truncates the Kuibyshev reservoir relation; the importer retains its complete earlier geometry from `kazan-water.json.gz`. Both timestamps and the PBF hash are saved. The import reports zero other incomplete selected relations.

Geometry is projected to a WGS84 local frame at 55.79° N, 49.108° E: x east, z south, one world unit per metre, true north. `tools/build-kazan-geodata.mjs` joins multipolygon rings and holes, clips roads and footprints to the extent, associates building parts with outlines, and constructs driving links using shared OSM node IDs. Public unnamed service roads provide access to outlying sites. Private and pedestrian-only roads do not enter the driving graph. One-way tags, lane counts, bridges and widths are retained or given explicit class defaults. Forests, cemeteries, airport aprons, taxiways and runways are included.

Run `aube run geodata` to rebuild `js/kazan-geodata.js` and `js/kazan-geodata.json.gz` offline. The small bootstrap names the compressed payload; startup decodes it before configuration and controllers run. Both raw gzip and HTTP-decoded responses work. The payload is approximately **14.8 MiB compressed / 94 MiB decoded**. The large source TIFFs are not runtime dependencies. A rebuild test checks the generated data against the checked-in artifact.

The current world contains **170,423 building/part polygons, 64,873 road/path pieces, 85,589 drivable links, 1,064 parks and 547 water bodies**. A polygon count includes garages, outbuildings and mapped parts; it is not a count of distinct addresses.

Detailed building geometry streams in 1,024 m cells around the camera and is disposed as it moves away. All physical building footprints remain available for collision; distant visual massing uses oriented boxes. Terrain switches between 30 m and 90 m meshes, while the hill patches stay detailed. These levels of detail make the expanded world usable without constructing every roof at startup. They do not change the underlying terrain sampler or building heights.

### Heights

The priority for each polygon is:

1. OSM `height`, including metre/feet conversion; reviewed published height observations take priority over storey/GBA estimates.
2. OSM `building:levels × 3 m`, plus a mapped roof height. Three metres per storey is an estimate.
3. Median valid first-band GBA.Height pixel inside the OSM footprint, reprojected into the raster's coordinate system.
4. A type-based fallback, marked `heightSource: "fallback"`.

The current extract has 170,423 building/part polygons: 172 use explicit OSM heights, two use published heights, four use reviewed visual height estimates, 45,823 use storeys, 105,332 use GBA, 19,072 use the type fallback, and 18 inconsistent parts use a marked `fallback-part` extent. GBA extraction currently handles way footprints; multipolygon buildings without OSM height information may use the fallback. Every polygon retains its OSM ID and `heightSource`. Inconsistent records retain a `heightIssue`; a height at or below `min_height` cannot produce a usable solid, so only that part's missing vertical extent is estimated.

`min_height` and `building:min_level` create elevated parts rather than walls extending to the ground. Parts share their outline's foundation. An outline with detailed parts is suppressed. The four Kul Sharif minarets are independent mapped buildings with explicit 58 m OSM heights; they are not lost when the mosque's low outline is suppressed. Suyumbike uses the mapped stepped parts. The Family Center and Epiphany bell tower have simplified custom silhouettes on their mapped sites; their descendants are suppressed to prevent duplicate geometry.

[GlobalBuildingAtlas](https://github.com/zhu-xlab/GlobalBuildingAtlas) estimates heights from satellite imagery. These are model predictions, not surveys, and the satellite imagery and current OSM outlines can disagree in age or alignment. Small courtyards, roof structures, towers and demolished/new buildings are particularly uncertain. Source tiles, hashes, extraction method and license are saved in `kazan-heights.json.gz`.

### Elevation and water

[FABDEM V1-2](https://research-information.bris.ac.uk/en/datasets/fabdem-v1-2/) removes building and forest-height biases from a global 30 m elevation model. The extract uses tiles N55E048 and N55E049. The regional grid is reprojected bilinearly every 30 m; the padded outer landscape uses 90 m. Around the Kremlin, Zilantov Monastery, Sokolka and Skotskie Gory, native 1 arcsecond source samples are preserved (about 17.4 m east–west × 30.9 m north–south). Their 15 m display mesh interpolates those measurements; it adds no observed resolution. Patch edges blend over 60 m into the regional grid.

The engine subtracts a **53 m local vertical datum** from DEM elevations. This is an approximate reservoir-level reference, not a surveyed current water level. Water surfaces currently share that level; individual lake levels and seasonal reservoir changes are not modeled. OSM water polygons and island holes cut the terrain and define the actual shorelines, rather than using an ocean plane or NYC islands. The far mesh reaches the Volga's western hills around Verkhniy Uslon. Mapped buildings on the opposite bank are included inside the expanded rectangle.

The [Zilantov terrain audit](../tools/data/kazan-terrain-audit.json) compares five independent coordinates with SRTM V3 through [Open Topo Data](https://www.opentopodata.org/datasets/srtm/). FABDEM puts the monastery at 69.1 m ASL and its northern foot at 51.9 m; SRTM gives 72 m and 48 m. Both preserve the hill, while their differences remain visible in the audit. SRTM measures a radar surface; FABDEM removes building/forest bias. Neither source is a local topographic survey. The [diocese's site description](https://www.tatmitropolia.ru/mesyaceslov/zilantov/) confirms the hilltop location. The runtime uses FABDEM consistently rather than substituting a visually convenient summit height.

All ground meshes use the shared elevation sampler. Road strips and markings are sampled every six metres; park colors are painted directly onto the terrain texture so large park triangles cannot flatten hills. Buildings stand on a level foundation at the highest sampled footprint corner, with foundation walls filling downhill gaps. Players, planted feet, traffic, wheels, lamps and trees use the same ground; vehicles incline to local grade. Flying altitude is displayed above the local surface.

Pitched roofs are tessellated inside the actual footprint, including courtyard holes. Building collision uses those polygons as well, so an enclosing bounding box cannot block an open courtyard. Foundation collision extends to the downhill ground, and Kremlin wall segments follow the terrain every six metres.

A 30 m DEM cannot resolve a curb, individual stair, underpass, retaining wall or narrow embankment. Bridge decks use a smooth estimated profile between their endpoints because the ground DEM does not provide surveyed deck elevations. Traffic signal phases, road widths without tags, street furniture and trees within parks remain approximations.

[ESA WorldCover 2021 v200](https://esa-worldcover.org/en/data-access) adds classified tree cover, shrubland, grass, cropland and built surfaces. `tools/fetch-kazan-landcover.py` reprojects the publisher's N54E048 tile to a 10 m grid with nearest-neighbor sampling, preserving categorical classes. Run-length encoding stores the 4,017 × 4,567 classes in a 1.3 MiB gzip extract; runtime expands them into a byte array. Source hash, epoch, license and attribution are retained. These classes describe land cover in 2021, not facade colors or a current inventory of tree trunks.

The ground texture and `js/kazan-vegetation.js` use these classes across the expanded map. A coordinate hash generates repeatable broadleaf groves in tree-cover pixels, sparse planting in shrubland, and occasional trees on grass within mapped parks. Current mapped roads, buildings and water exclude planting. Roots use the shared terrain sampler; very steep faces are excluded. Species, individual positions and heights are proxies. No Zilant-specific planting coordinates or rules are used.

Nearby planting streams in 512 m cells within 1.5 km of the camera, with a fixed 28,000-tree render capacity and at most 100 cached cells. Eviction and interrupted travel preserve the same coordinates and sizes on returning. The original procedural tree meshes, generated leaf atlas and three detail levels are reused, with added canopy fill for woodland. Beyond the detailed trees, 90 m samples of tree cover supply lightweight, spatially culled crown masses; their transition follows the committed nearby planting. The 2021 classification can miss later clearing or construction, and isolated street trees outside classified cover/parks remain incomplete.

The monastery's published plan and photographs separately inform simplified blue roofs, white walls, gilded domes and the gate tower. Published observations and visual height estimates remain separate `heightSource` values in the bundle.

Refresh land cover with:

```sh
uv run --no-project --python 3.13 --with rasterio tools/fetch-kazan-landcover.py
aube run geodata
```

See the [relief research and cross-bank audit](kazan-relief.md), with fifteen representative controls, native Sokolka samples and the eastern watershed coverage.

### Materials and textures

The roof helipad beside the National Library is at TAIF, Pushkina 80: OSM way/1052138179 on building way/694568818. [ENKA's completed-building record](https://www.enka.com/ru/portfolio-item/taif-business-center-2/) publishes a total height of 33.5 m. The stepped glass volumes are a visual approximation; the mapped landing polygon and shared building foundation set the deck elevation. [Photographs of the completed building and an actual helicopter arrival](https://realnoevremya.ru/articles/257622-biznes-centr-taif-mesto-gde-vse-sozdano-dlya-effektivnoy-raboty) establish the red deck, yellow circle and white H. Reference images stay external. The site is in the destination/camera menus and map search.

Helicopters can descend onto mapped pads, rest without flight bob and take off again. Landing requires the full 6.2 m aircraft clearance inside the polygon and an approach from above. A roof cannot pull an aircraft up through the building. Ordinary wall collision remains active below the roof. Fly mode uses Q/C to descend and Space/E to climb. Ground pads and roof pads share the same surface API; unmeasured components and paint colors remain approximations.

OSM `building:material`, `building:colour`, `colour`, `roof:material`, `roof:colour` and roof shapes are used when mapped. A building part without its own facade color or material inherits that attribute from its associated outline; explicit part attributes take priority. Roof attributes remain independent. Gabled roofs follow the footprint's main orientation; curved and other pitched roofs use simplified geometry. Rich window/interior textures are procedural. Most buildings do not have mapped facade materials/colors, and the app does not claim a photographic reconstruction. The removed NYC-specific night-water reflections are replaced by actual scene reflections and sky lighting.

#### Facade color audit, 2026-10-22

The original NYC renderer's `facades` array in `js/buildings.js` contains six preset materials: buff masonry, red/terracotta brick, brown masonry, and three glass styles. Neighborhood profiles and seeded choices provide variety. These are artistic building styles, without individual building photo matching or measured facade colors.

The Kazan renderer currently gives untagged masonry the same base color, window spacing and shader seed in `facadeMaterial` in `js/kazan-city.js`. The shared shader does support separate wall and trim colors, but our adapter only supplies a fixed trim color. Recovering NYC's variety alone would still leave the real colors unknown.

The initial core snapshot audited before regional expansion contained 16,200 building/part records, compiled into 16,249 polygons. Only 153 records have `building:colour` (about 0.94%); 1,118 have `building:material` and 97 have `roof:colour`. The seven records with generic `colour` already have a building color as well. The [OSM definition](https://wiki.openstreetmap.org/wiki/Key:building:colour) describes facade colors, separately from roof colors.

Before outline inheritance, suppressing outlines with detailed parts discarded a known facade color for 71 otherwise uncolored parts and a known material for 141 parts. For example, parts of the buildings named Severnaya Amerika, Yuzhnaya Amerika, Evropa and Aziya now inherit their mapped yellow color. This repair uses existing observations; it adds no invented colors.

The initial core snapshot also had useful image-discovery references: 162 records with `wikidata`, 128 with `wikipedia`, five with `wikimedia_commons`, and one with `image`. These fields, addresses and the 3,944 `start_date` tags are not yet emitted into the runtime bundle. An offline enrichment tool can read them directly from the snapshot. A construction date can inform an estimated style, but does not establish the paint color.

#### Image sources checked

[Wikimedia Commons' Kazan building categories](https://commons.wikimedia.org/wiki/Category:Buildings_in_Kazan) contain address-specific photographs, including houses on Bauman, Karl Marx and Profsoyuznaya streets. They are a useful starting point for linking images to buildings. Each image's identity, capture date, author and license must be read from its own record; a category match alone does not prove that every pictured wall belongs to the target building.

The [Panoramax federated catalog](https://docs.panoramax.fr/federated-catalog/) exposes georeferenced image metadata and per-image licenses. This [bounding-box request](https://api.panoramax.xyz/api/search?bbox=49.055,55.75,49.185,55.835&limit=1000) returned four records, no continuation link, all at 49.166094° E, 55.820006° N and captured on 2019-07-25. It does not provide broad coverage of our area at this audit date.

[Mapillary provides an imagery API](https://help.mapillary.com/hc/en-us/articles/360010234680-Accessing-imagery-and-data-through-the-Mapillary-API); access uses a token. Its Kazan coverage has not been verified here. Do not treat any candidate imagery source as citywide coverage before measuring it.

#### Proposed offline appearance enrichment

This pipeline is a design for the next enrichment stage; image matching and color inference are not implemented yet.

1. Keep mapped appearance attributes and stable `way/<id>` or `relation/<id>` keys. Read linked Commons/Wikidata images first, then search available street imagery. Preserve source URL, author/license, capture date and retrieval date.
2. Match the visible facade to its footprint using an explicit building link or verified address, or camera position, bearing and visibility against the mapped geometry. Proximity alone can assign a neighbor's facade. Queue ambiguous matches for review.
3. Separate wall surfaces from windows, sky, vegetation, signs and vehicles. Estimate wall colors with illumination and white-balance checks, compare multiple views where available, and retain uncertainty. A dark shadow is not a dark paint color.
4. Store wall, trim, plinth and roof colors separately. Support colors on individual parts/facades or patterned sections where evidence requires them. Averaging red brick and white trim into one pink color cannot reconstruct that building. Color extraction also does not recover window spacing, ornaments or a photographic texture.
5. Compile a compact appearance table into the existing geometry/material pipeline. Keep evidence and confidence in an offline report; unknown colors remain distinguishable from observed colors. Material- or age-based fallbacks remain estimates. Full facade photographs or an atlas are a later option for prominent close-up buildings, after image alignment is reliable.
6. Validate a pilot of 30–50 ordinary neighboring buildings before scaling. Compare source-photo and rendered views in neutral daylight, inspect roof/wall separation and different facade directions, and measure coverage, wrong-building matches and color errors. Include yellow plaster, red/white masonry, panel housing and repainted buildings. The extraction can run as offline CPU jobs; it need not add live image requests or inference to the browser.

Overhead imagery is mainly evidence for visible roof surfaces. The existing satellite-derived height dataset supplies no facade-color observations, so it cannot fill this gap by itself.

### Refreshing the source rasters

`tools/fetch-kazan-enrichment.py` requires Python 3.11+, rasterio, numpy and shapely. For example:

```sh
uv run --python 3.13 --with rasterio --with shapely tools/fetch-kazan-enrichment.py
aube run geodata
```

The script uses HTTP/FTP byte ranges to extract only the named tiles from the publishers' large ZIP archives, checks their ZIP CRCs, and caches the TIFFs outside the repository. `--terrain-only` refreshes only terrain; `--heights-only` refreshes heights. The current extent uses two FABDEM TIFFs and fifteen GBA tiles. Source URLs and SHA-256 hashes are saved in each extract. Public GBA download credentials in the script are the publisher's published anonymous download credentials.

Refresh OSM before refreshing heights:

```sh
uv run --python 3.13 --with osmium tools/import-kazan-osm.py
uv run --python 3.13 --with rasterio --with shapely tools/fetch-kazan-enrichment.py
aube run geodata
```

`--source /path/to/tatarstan.osm.pbf` selects an already downloaded PBF. The default caches it under `/tmp/slop-kazan-region/`; remove that cached file when intentionally downloading a newer snapshot. Review incomplete-relation diagnostics before accepting a refresh. `q_kazan.overpassql` is the historical core query retained for the original water snapshot, not the full-region importer.

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

Before regional expansion, on 2026-10-22, `aube test` passed all 103 tests, `aube run build` succeeded, and `aube check` verified the installed dependency links. Playwright reused one Chromium instance through CDP and one Vite instance. All eight destinations were checked in all four travel modes; all twelve cameras produced finite positions. Driving advanced approximately 98 m while tracking the ground. A vertical ray into the Junker School courtyard confirmed that no building roof covered the open space. A 390 px layout check found no horizontal overflow.

The production build was also loaded without the Vite software flag: full pixel ratio, sun shadows, and the SSR/bloom/color pipeline were enabled, and rendered pixels were read successfully with no browser errors. Chromium still used SwiftShader launch flags on this machine; this was a CPU rendering check, not a hardware GPU benchmark. Native WebGPU canvas presentation remained black in headless Chromium, so the production image was inspected through an offscreen readback. The Mac's GPU performance and browser presentation still need validation there.

The regional expansion passes **105 tests**, including real buildings/roads at the named outer locations, the actual industrial building and cemetery boundary, airport runways, all fifteen safe arrivals, preservation of native hill samples and asynchronous compressed-data startup. The old bundle reproduces the Novaya Tura coverage failure; the old sampler loses approximately 0.47 m at a checked native hill pixel. These checks protect coverage and sample preservation, not survey accuracy. All seven outer destinations were inspected in one Chromium/Vite session: nearby detail loaded, previous cells unloaded, arrivals stayed on dry ground and the airport runways appeared. No page errors were recorded. The whole-region atlas fit check includes every requested edge. The expanded browser heap was approximately 1.8–1.9 GB; Mac GPU performance remains unmeasured.
