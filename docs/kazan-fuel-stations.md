# Citywide fuel-station system

Active work: replace the current station placeholders across the full city, using shared procedural canopy/pump/shop families and automatic network branding. The renderer and brand registry are **not yet implemented**; this first batch restores the source coverage needed for them. Elevated and underground crossings follow this system; the unfinished KAI/dormitory/landmark queue remains intact.

The regional PBF snapshot is21 October2026 at00:47:51Z, SHA-256 `0cb842ad557815d185603525a3590ea506632b7b1089a9e05da32b4bc1832452`. `tools/import-kazan-osm.py` now retains `amenity=fuel` and `man_made=fuel_pump` nodes/ways with their complete mapped tags, node IDs and geometry. It uses the same cached source at `/tmp/slop-kazan-region/tatarstan.osm.pbf`; the repeatable command is `uv run --python 3.13 --with osmium tools/import-kazan-osm.py`.

The audit compares old and new source objects by typed OSM identity: **259,684 previous objects retained without a missing or changed object**,259 added. The resulting source has222 fuel features (196 nodes and26 ways) and39 separately mapped pump features. There are no fuel relations in this snapshot. These counts describe source features, not distinct operating sites: group duplicate node/area representations by mapped containment/identity, retain separate adjacent gas/liquid stations and opposite road directions, and preserve private/disused/unknown status explicitly. Do not merge stations by proximity alone.

| Mapped brand/operator/name group | Raw fuel features |
| --- | ---: |
| ТАИФ-НК |63|
| Татнефть / ТАТНЕФТЬ |38|
| IRBIS / Irbis |21|
| Teboil |15|
| Лукойл |14|
| Газпромнефть |8|
| Газпром / Газпром сжиженный газ and legal-name variants |9|
| Башнефть |3|
| Other identities, including10 without name/brand/operator |51|

Brand resolution must be shared and automatic across the city. Prefer explicit `brand`/`brand:wikidata`, then documented operator or explicit network-name aliases; keep the selected source field and confidence. An operator can carry several brands, so do not overwrite an explicit mapped brand with its operator's other network. Unknown/unreviewed paint gets the neutral family while preserving the actual mapped identity. All station/canopy/pump dimensions and placements inferred from footprints or recurring families must remain labelled estimates; use actual pump nodes where available, and do not assert an estimated pump count as mapped fact.

Inspected photo references:

- [Tatneft, Pobedy105A, MarSaf own photograph,1 October2023](https://commons.wikimedia.org/wiki/File:Казань._Автозаправочная_станция_«Татнефть»_-_проспект_Победы,_105А_(2).JPG): broad white canopy with red/green fascia wave, white posts with red bases, visible pump islands and a separately mapped low shop. Exact paint/layout at other network sites is a procedural family, not a claim of a site-specific photo inspection.
- [IRBIS operator, renewed Kazan stations,15 January2026](https://azsirbis.ru/news/34), [actual operator image](https://api.azsirbis.ru/public/uploads/news/2025/cf61e9a4df3098ece258d26718c76ca7.jpg): charcoal fascia/soffit and shop, lime bands/pillars, red circular identity, dark dispensers, hoses and red bins. The article names Dubravnaya8A and Pobedy194A; resolve which site the image depicts before claiming an individual photo match. The apartment/background identities remain a scene checklist.
- [TAIF-NK operator, Mikhail Milya57 opening,13 January2025](https://taifazs.ru/news/otkrytie-azs-taif-nk-/), [actual operator photograph/poster](https://taifazs.ru/upload/iblock/b9a/9vfa3dopj8sxutfx94mno19tyjumjhbn/3kayv.png): cream/gold canopy/vertical ribs, green crown/sign panels, pale dispensers and glass-front shop. Promotional prices are historical and must not be rendered as current fuel prices. Resolve all mapped scene footprints before an individual scene-completion claim.

Next implementation: inventory/associate mapped canopy roofs, station polygons, pump nodes and shops; replace associated solid roof placeholders with open clearances, thin roofs, posts and pump islands. Preserve vehicle access, terrain contact and vegetation clearance. Apply verified livery families to every matching station; record unknown/ambiguous sites and remaining network-photo families. Verify representative brands/sizes and citywide import/render coverage, commit/push each coherent batch, and track publication alongside the following task without waiting for CI.

Validation of the source-coverage batch: importer syntax passes; the rebuilt complete city geography is byte-identical to the preceding aircraft-plant release (SHA-256 `04c0c7c6961cd9339c1e99216aefcdf6824c8d1dda667ee116daa97109b0921e`). The independently compared source objects show zero missing/changed pre-existing records. The renderer/brand registry and station-site deduplication remain active work.
