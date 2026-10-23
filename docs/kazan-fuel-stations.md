# Citywide fuel-station system

Active work: replace the current station placeholders across the full city, using shared procedural canopy/pump/shop families and automatic network branding. The source coverage, compiled site associations and shared brand registry are implemented; the principal procedural renderer is implemented; native browser/publication checks remain pending. Elevated and underground crossings follow this system; the unfinished KAI/dormitory/landmark queue remains intact.

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

Validation of the source-coverage batch: importer syntax passes; the rebuilt complete city geography is byte-identical to the preceding aircraft-plant release (SHA-256 `04c0c7c6961cd9339c1e99216aefcdf6824c8d1dda667ee116daa97109b0921e`). The independently compared source objects show zero missing/changed pre-existing records. The principal renderer is now implemented; see verification below.

Explicit user emphasis: Lukoil must be included as a citywide network family, alongside the other major networks. The14 mapped Lukoil and15 mapped Teboil fuel features remain distinct brand identities; do not infer a rebrand at an individual site without evidence.

Source checkpoint `6797407` is pushed through integrated `1ad2e6a`; CI run40038016771 succeeded. The integrated14 relevant checks and release build pass. Production byte receipt remains pending; this does not mark station rendering delivered.

The compiler now emits222 separate mapped fuel sites (no node/area duplicate pairs in this snapshot),198 mapped canopies,44 explicitly estimated canopy layouts and95 associated shops. Every one of39 mapped pump points is retained:30 have an associated site,9 retain unresolved parent identities and render independently. Partial pump mapping is supplemented with explicitly estimated positions, separated from mapped points. Existing geography is unchanged after removing the new fuel fields and building-role annotations. Association by containment is distinguished from nearest-site estimates; review these uncertain matches through photographs.

Shared livery families cover all14 Lukoil,38 Tatneft,63 TAIF-NK,22 IRBIS,15 Teboil,8 Gazpromneft and3 Bashneft mapped identities. IRBIS includes an additional name-resolved station. The59 other/unreviewed identities remain neutral. The registry preserves the selected source field and does not use accepted payment cards as branding evidence.

Additional inspected references:
- [Lukoil Kazan, TASS/Yegor Aleyev photograph syndicated by Caixin,6 October2023](https://companies.caixin.com/2023-10-07/102114315.html): white fascia/posts and red side trim, lettering and column-base accents. Trees are the backdrop; station address/individual footprint unresolved, so use as a network family only.
- [Teboil own career photograph](https://azs.teboil.ru/career/): white canopy/columns, blue fascia with red identity panels, blue pump bodies, black hoses, glazed shop. This is a network reference outside an identified Kazan scene; restaurant/shop/background identities are unassigned and not claimed completed.
- [Gazpromneft station signage manufacturer's project](https://azsrpk.ru/proekty/kompleksnoe-oformlenie-azs/reklamnoe-oborudovanie-dlya-azs-gazpromneft/): silver/white canopy with blue edge and column bases, blue dispensers, glazed low shop. This is a family reference, not a confirmed individual Kazan site.
- [Bashneft news photograph,2 July2020](https://www.kommersant.ru/doc/4399492): white fascia with green/magenta diagonal panels, green posts and pale dispensers. The photographed Ufa site is a family reference only; individual Kazan layouts remain estimates.

Source-only production receipt: CI40038016771 succeeded and every served JS/CSS bundle plus the full geography byte-matches the saved `1ad2e6a` release. Main `main-cWg8gmjz.js`,565,953bytes, SHA-256 prefix564db0c810c7b0ff; geography SHA-256 `04c0c7c6961cd9339c1e99216aefcdf6824c8d1dda667ee116daa97109b0921e`. No CI wait blocked implementation.

Latest user direction: prioritise a convincing lightweight procedural city and60 FPS; stop further brand/logo research. Existing inexpensive colour aliases remain shared. Fine signage, individual photo layouts and backgrounds are explicit follow-ups, not blockers for moving to crossings. The compiler `ec2eb27` and AGENTS rule `1cf33e5` are pushed through `8ec0717` after integrating the concurrent shared-sign shader repair. Compiler/geography checks pass; publication remains pending without a CI wait.

Principal renderer: thin elevated mapped canopy roofs, open posts, small pump islands/screens/hoses, low mapped shop bodies and shared network colours. Associated generic roof/store blocks are suppressed, including distant massing; canopy footprints no longer count as solid building interiors for access. Posts/pumps sample their own ground height; roof colliders begin overhead. Mapped forecourt paving stays at ground level; no raised station platform is introduced. Trees are excluded from the forecourt. No per-site lights, imported image assets or bespoke logos are added.

Fuel geometry uses the shared spatial material/box batches, with2048m parent regions hidden outside2400m from their bounds and visibility updated only on256m movement cells. This avoids traversing every station's detailed meshes in every city view;60 FPS remains unverified and the existing performance task stays open.

Local validation: the complete176-test suite passed before the final mapped-pump layout/culling adjustment;9 relevant startup/vegetation/fuel checks pass after the layout fix, and the strengthened mapped-pair regression fails on `ec2eb27` for inserting a pump into the gap, then passes on the repaired compiler. The release build passes. Actual Three.js geometry, existing city draw helpers, real terrain and the production collision controller were exercised offline:222 stations,390,573 finite vertices, zero invalid coordinates and1,777 collision shapes. Of1,868 walking probes,1,867 are clear; one intentionally coarse midpoint probe meets a legitimate fallback support at the small estimated canopy of `node/5740987221`. This is not a blanket claim that every access route was surveyed. A mapped pair is kept open, and the Lukoil pump remains solid (0.655m displacement). Three offline geometry previews (Lukoil/IRBIS/TAIF) were inspected; these omit text/shadows/backgrounds and are not native WebGPU or production screenshots.

The user's existing Chrome accepts CDP attachment but has not answered Runtime/Debugger commands during this check. Native WebGPU appearance, runtime errors, map travel and FPS acceptance remain explicit follow-ups; no browser/server restart was performed. Do not hold the sequential queue for extra branding or fine site detail. Publication/served-byte verification is pending without waiting for CI.
