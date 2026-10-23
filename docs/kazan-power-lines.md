# Regional power-line system

This is the first data/topology batch for the citywide power-line request. Rendering, photographic support-family verification, sag/clearance checks, substation grounds and vegetation corridors remain active work in `docs/kazan-work-queue.md`.

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
