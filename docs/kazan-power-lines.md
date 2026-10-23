# Regional power-line system

The citywide power-line system now has separate source topology and procedural rendering batches. Photographic support-family verification, detailed substation grounds and generating-station scenes/connections remain active work in `docs/kazan-work-queue.md`.

`tools/import-kazan-power.py` imports the complete coverage rectangle from the same SHA-checked regional PBF as the city. The saved `tools/data/kazan-power.json.gz` contains power nodes, ways and circuit/substation/plant relations, including member geometry for multipolygon grounds. It does not depend on the motor or railway graphs. Reproduce with:

```sh
uv run --python 3.13 --with osmium tools/import-kazan-power.py
aube run geodata
```

The first import contains 4,977 source features. Compiled geography has 175 overhead ways, 30 cable/underground ways, 3,770 unique supports, 3,738 graph spans (668.6 km including cables), 823 substation records and eight circuit relations. All 3,770 support heights and 57 line voltages are untagged; future visual estimates must retain that distinction.

`tools/kazan-power.mjs` clips line/cable geometry to the regional coverage and preserves source node identities. Branching spans share one mapped tower/pole; a geometric crossing alone does not create an electrical connection. A shared support retains all incident line voltages. The compiled data distinguishes voltage, circuit count, conductor count and bundle description, keeping the original tag strings. Missing values remain unknown rather than silently becoming 110 kV or a six-wire line. Mapped support heights, materials, structure/design and attachment/transition tags remain separate from future procedural estimates.

Underground/underwater cables retain their topology and are explicitly marked for exclusion from overhead rendering. Lifecycle tags and the source note `снесли` keep removed/proposed/disused features in an inactive evidence list. Railway catenary masts belong to the already separate rail/tram systems. Substations retain mapped areas or point identities, building/location tags and voltage; indoor kiosks must not become invented outdoor switchyards.

The compiled inspection corridors include mapped way/96813722 through Русско-Немецкая Швейцария, way/99685411 continuing south, and ways/102143200,96813732,294825068 around Компрессорный / veterinary institute. These source identities establish location and connectivity; individual tower appearance still needs photographic review. The clearly removed source way/294824993 remains in `power.inactive`.

Published planning documents on the [city architecture portal](https://kzn.ru/meriya/ispolnitelnyy-komitet/upravlenie-arkhitektury-i-gradostroitelstva-ispolnitelnogo-komiteta-g-kazani/gradostroitelstvo/) describe cable replacements around Восточная/Казанка/Магистральная. A proposed replacement is not evidence that every old overhead span has already disappeared. Retain the mapped state and explicit photographic follow-ups rather than applying a blanket removal from a plan or an older announcement.

The power regression exercises shared-pylon branching, an independent geometric crossing, buried cable topology and lifecycle exclusion. Its compiled-city case failed before the geography integration because the power dataset was absent, then passed for both requested inspection districts.


`js/kazan-power-lines.js` supplies one shared set of support attachments and parabolic span curves. Instanced steel lattice members, concrete/wood/metal pole families, portal/H frames, crossarms, insulator strings and thin conductor strips follow mapped node coordinates and material/design tags where available. Unspecified dimensions, conductor arrangements and bundle layouts remain procedural estimates. Buried cables produce no overhead spans. The runtime has 3,542 overhead spans; regional members are grouped in 1,024 m cells and culled with the moving view.

Nominal support heights come from explicitly estimated families because this extract has no tagged support heights. Sampling every 10 m checks the lower conductor envelopes against rendered terrain/road decks and nearby above-ground rail/tram profiles. Where necessary, the shared unmeasured support height is raised, keeping every incident span attached. The first profile run used 282,681 independent sample points: minimum ground/road clearance 6.209 m, minimum above a sampled railway 11.075 m and above tram tracks 15.550 m. These are model measurements, not surveyed or regulatory clearances. 217 supports required a DEM/structure adjustment, up to 21.286 m; exact heights remain a photographic follow-up.

Bundled wires interpolate a stable frame at shared nodes. A curved-line fixture with double wires demonstrated a discontinuity on the preceding span-local frame and passes after the shared-frame repair. The same runtime regression checks all overhead profiles against real city surfaces and keeps buried cables out of conductor rendering.

`powerAt` indexes only overhead corridors. Nearby trees and distant canopy crowns use the same conductor-width envelope with their own crown margins; cable routes do not cut new forest corridors. Fine insulator shapes, exact steel sections, untagged support designs and missing source support tags remain unverified. Full station/switchyard grounds are the next prioritised implementation, using the already mapped ТЭЦ-1/2/3 sites.
