# Slop Kazan

Explore central Kazan, Tatarstan on foot, by taxi, by bicycle, or by helicopter. This branch adapts [Slop New York](https://github.com/mrdoob/slop-newyork) using real OpenStreetMap building footprints and streets, mapped building parts, satellite-derived height estimates, and FABDEM elevation. The Volga, Kazanka, islands, and opposite-bank hills use Kazan geography.

## Development

Use Node.js 22.12+ and [aube](https://aube.sh):

```sh
aube install --frozen-lockfile
aube run dev
```

Open **http://127.0.0.1:5173**. No rendering flags are needed on a Mac with a supported GPU/browser. Three.js is pinned to a specific development revision because the original engine uses its SunLight and clustered lighting APIs. Browser modules and fonts require internet access.

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

## How the city is made

The original NYC version used real street/shoreline geography but generated most ordinary buildings and facade textures procedurally. This version extrudes actual building polygons and parts. Heights prefer explicit OSM heights, then mapped storeys, then a GlobalBuildingAtlas estimate under the footprint, then a marked fallback. Tagged colors, materials, and roof shapes are retained; most facades still use procedural textures, rather than photographs of the actual building.

FABDEM supplies 30 m ground elevation. The same bilinear sampler positions roads, building foundations, pedestrians, traffic, player vehicles and cameras. A coarser outer mesh extends approximately 32 × 30 km to include the Volga's west bank and Verkhniy Uslon hills. Detailed streets/buildings cover central Kazan, approximately 8 × 9.5 km, rather than the entire municipality. See [sources, accuracy and rebuild instructions](docs/kazan-data.md).

## License and attribution

Code remains [MIT](LICENSE). Data retains separate licenses:

| Data | License |
| --- | --- |
| © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright): geometry, tags and road graph | ODbL 1.0 |
| [GlobalBuildingAtlas GBA.Height](https://doi.org/10.14459/2025mp1782307): extracted height estimates | CC BY-NC 4.0 |
| [FABDEM V1-2](https://doi.org/10.5523/bris.s5hqmjcdj8yo2ibzi9b4ew3sn): extracted terrain | CC BY-NC-SA 4.0 |

The included height and terrain data are for **noncommercial/research use**, as agreed for this branch. The code license does not override those data restrictions. The original NYC source files remain available as pipeline references but are not loaded by the Kazan app.
