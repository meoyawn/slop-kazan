# Slop Kazan

Explore Kazan and its surroundings, Tatarstan on foot, by taxi, by bicycle, or by helicopter. This branch adapts [Slop New York](https://github.com/mrdoob/slop-newyork) using real OpenStreetMap building footprints and streets, mapped building parts, satellite-derived height estimates, and FABDEM elevation. The Volga, Kazanka, islands, and opposite-bank hills use Kazan geography.

## Development

Use Node.js 22.12+ and [aube](https://aube.sh):

```sh
aube install --frozen-lockfile
aube run dev
```

Open **http://127.0.0.1:5173**. No rendering flags are needed on a Mac with a supported GPU/browser. Three.js is pinned to a specific development revision because the original engine uses its SunLight and clustered lighting APIs. Browser modules and fonts require internet access.

Phones automatically use lighter graphics: a smaller geography download, coarser regional terrain and road meshes, fewer trees and traffic, and direct lighting without shadow atlases or post-processing. All mapped buildings, roads, destinations and native hill elevation patches are retained. WebGL 2 is used when WebGPU is unavailable. The loading screen reports download size, percentage and construction stages; failed loads offer retry and a lighter-graphics link. Production city scripts and geography are cached by asset version.

Touch controls use left-side steering and right-side gas/brake pedals for driving and cycling, and a movement joystick for walking and flying. Hold Boost/Sprint for ordinary boost; tap Super to toggle super boost. Drag the scene to look and pinch to zoom. The fullscreen button includes the HUD and touch controls and requests landscape orientation where supported.

Use `?graphics=lite` to select the phone graphics profile on any device, `?renderer=webgl` to exercise the WebGL fallback, or `?graphics=full` to opt into desktop detail. For a device that struggles to start, use `?graphics=lite&renderer=webgl`.

For a CPU development machine:

```sh
aube run dev -- --software
```

This opt-in preview halves render resolution, disables sun shadows, SSR and bloom, and compiles only the visible scene. Geography, building heights, terrain, and movement stay identical. The browser still needs a WebGPU adapter; headless Linux can use Chromium's SwiftShader adapter (see [development notes](docs/kazan-data.md#software-browser-loop)). The flag affects development HTML only; production builds always use the normal rendering settings.

Vite reloads classic city scripts automatically and updates CSS in place. The port is fixed so accidentally starting another instance fails clearly.

```sh
aube test
aube run build       # static site in dist/
aube run preview
aube run geodata     # offline rebuild from the saved source extracts
```

## Deployment

Production is [kazan.adelnz.com](https://kazan.adelnz.com), hosted by the `slop-kazan` Cloudflare Pages project in the Personal account (`7f1bb3dfed48a390e1bcf9e1ac54305c`). Pushes to `feat/kazan-tatarstan` run tests, build the site, and deploy it through GitHub Actions. Pull requests run the same checks without deployment credentials.

The workflow reads `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` from repository secrets. The deployment token has Pages Write access in Personal and expires on October 23, 2027. Rotate it in GitHub Actions and the local credential file before then.

For a local deployment, put a Personal Pages Write token in `.cloudflare/pages.env` as `CLOUDFLARE_API_TOKEN=...`, restrict the file to your user, and run:

```sh
aube run deploy
```

The credential file, Wrangler state, and migration backups are gitignored. Keep the aube-managed `cf` CLI global for account, domain, and DNS management. Build uploads use the Wrangler version pinned in `package.json`, because `cf` currently does not upload Pages builds.

## How the city is made

The original NYC version used real street/shoreline geography but generated most ordinary buildings and facade textures procedurally. This version extrudes actual building polygons and parts. Heights prefer explicit OSM heights, then mapped storeys, then a GlobalBuildingAtlas estimate under the footprint, then a marked fallback. Tagged colors, materials, and roof shapes are retained; most facades still use procedural textures, rather than photographs of the actual building.

The map spans approximately 40 × 46 km: Novaya Tura and the Zelenodolsk industrial park in the west, Samosyrovskoye cemetery in the east, the airport in the south and the M7 in the north. It includes Aviastroitelny, Zilantov Monastery and the Volga's opposite bank. About 170,000 building/part polygons come from a regional OSM extract. Nearby buildings use their mapped footprints; distant buildings use simplified massing, with detail loaded as you move.

[ESA WorldCover 2021](https://esa-worldcover.org/en/data-access) supplies land-cover classes for fields, grass and woods across the region. Coordinate-seeded procedural vegetation follows those classes and the terrain, with streamed nearby trees and lightweight distant forest canopies. Individual positions, species and heights are approximations.

FABDEM supplies ground elevation on a 30 m regional grid, with the original 1 arcsecond samples retained around Zilantova Gora, the Kremlin, Sokolka and Skotskie Gory. At Kazan this source grid is about 17 × 31 m. Terrain, roads, foundations and movement share one height sampler. Finer mesh interpolation preserves the hills but does not supply survey detail. The atlas has a relief layer with named terrain checks and approximate elevations. See [the relief audit](docs/kazan-relief.md) and [sources, accuracy and rebuild instructions](docs/kazan-data.md).

## License and attribution

Code remains [MIT](LICENSE). Data retains separate licenses:

| Data | License |
| --- | --- |
| © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright): geometry, tags and road graph | ODbL 1.0 |
| [GlobalBuildingAtlas GBA.Height](https://doi.org/10.14459/2025mp1782307): extracted height estimates | CC BY-NC 4.0 |
| [ESA WorldCover 2021 v200](https://doi.org/10.5281/zenodo.7254221): land cover | CC BY 4.0 |
| [FABDEM V1-2](https://doi.org/10.5523/bris.s5hqmjcdj8yo2ibzi9b4ew3sn): extracted terrain | CC BY-NC-SA 4.0 |

WorldCover attribution: © ESA WorldCover project 2021 / Contains modified Copernicus Sentinel data (2021) processed by ESA WorldCover consortium.

The included height and terrain data are for **noncommercial/research use**, as agreed for this branch. The code license does not override those data restrictions. The original NYC source files remain available as pipeline references but are not loaded by the Kazan app.
