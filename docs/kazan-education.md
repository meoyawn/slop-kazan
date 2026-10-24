# School and kindergarten systems

Work order: school inventory/classification, shared school facade families, school yards and access, then a **separate kindergarten facade/play-yard system**, followed by СИЗО на Япеева,16. Commit and push each coherent batch and record publication immediately without waiting for CI. A data inventory does not complete either rendering system.

## Source and physical sites

`tools/import-kazan-education.py` reads the same saved regional OSM PBF as the city, verifies its SHA-256 and imports educational identities, mapped property multipolygons, entrances, fences/gates and nearby mapped play/sport features. The snapshot is dated2026-10-21. Nearby features are only candidates; the compiler binds them to actual property/footprint membership. It retains school, kindergarten, university/college and other educational tags for classification, without treating every educational record as a school.

`tools/kazan-education.mjs` compiles `GEO.education`. A physical property combines its school/childcare POIs, teaching bodies, sports halls, service buildings, unclassified annexes and mapped building parts. A tagged multipolygon and its tagged perimeter count once; property holes exclude foreign buildings and play areas. Coincident equivalent property records are aliases. A school POI in a building without a known yard boundary can identify that building, while the property remains unknown. No boundary or affiliation is invented from proximity. Distinct institutions sharing a physical site are not a verified institution count.

Counts distinguish the full regional game bounds from the mapped Kazan municipal boundary (relation3437391), sites from bodies/parts, known properties from unknown ones, and schools from kindergartens. Names, mapped storeys/roof forms/materials, height/colour evidence and existing reviewed facade models remain separate. Source tags distinguish teaching and sports/service uses; otherwise annex roles stay unknown. Block/winged/courtyard and brick/panel/plaster families are procedural inferences. The existing Gymnasium155 footprint-template match remains evidence of a recurring plan, with no invented catalogue/series number and no transfer of its paint to every school.

## Rendering work still required

- Implement school classroom wings, halls, gyms, entrance blocks and facades through a few shared families while retaining actual footprints, storeys, roofs, paint and reviewed exceptions. Compare representative old/modern, compact/large and sloping sites with photographs; preserve mapped dimensions versus estimates.
- Bind the established school properties to the shared ambient-traffic exclusion. Keep mapped road/path surfaces and player/pedestrian access. Add source-backed fences, gates and doors without blocking approaches.
- Generate football/basketball or multipurpose fields, goals/hoops, mapped tracks and exercise/play areas, paths/assembly areas and planting inside the real available yard. Fit terrain and keep buildings, doors, paths and courts clear. Unknown layouts need conservative explicit estimates, with no generated yard outside established property boundaries.
- After the school system, implement separate kindergarten facades and age-appropriate play groups, sand/play areas and **covered verandas or rain shelters**. Share geometry/terrain/access primitives but use separate yard rules. Do not copy the school football/adult exercise-bar/spectator layout into kindergartens. Record source anomalies and uncertain shared-property assignments before generating amenities.
- Check native representative views, entrance access, map travel/return and dense-scene performance before claiming citywide delivery or60 FPS. The current inventory changes no building or yard renderer.

## Verification and coverage

Inventory verification, final retained counts, commit/push and publication evidence are recorded with each batch below. Unnamed sites, unknown properties, missing bodies/entrances, inferred families and unresolved source geometries remain explicit rather than counted as delivered scenes.


The first retained inventory contains4,468 supplemental source records and zero incomplete source relations. Counts below describe mapped physical sites, not a verified census of operating institutions; names such as the education/holiday centre «Дуслык» and «Печищинская школа» need source-classification review before assuming an ordinary school or kindergarten layout.

| Coverage | Schools | Kindergartens |
|---|---:|---:|
| Sites inside Kazan municipal boundary |255|432|
| Sites in the full regional game bounds |289|474|
| Regional sites with mapped property boundary |245|438|
| Regional sites with unknown property boundary |44|36|
| Associated main/auxiliary body identities |514|660|
| Sites without an associated mapped body |3|3|
| Mapped outdoor pitch/track/play/exercise records |267|15|

The compiler retains1,221 body/part bindings with one physical owner per reference.306 school and460 kindergarten bodies have teaching identity evidence;185/189 respectively are unclassified annexes rather than invented gyms. Only three school sports halls have explicit sport/leisure tags. Eight school bodies match the existing155 footprint template; other massing/material families remain inferred.23 school and31 kindergarten sites are unnamed. Missing-body school sites are `way/1080485027` (№69), `way/1445941290` (посёлок Октябрьский) and `way/175326249` (Дуслык); kindergarten sites are `node/13253052652`, `way/1339482156` and `way/161848605` (№28). Their absence remains explicit.

Both owning-boundary tests pass: POI/property/body deduplication, separate kindergarten play areas, foreign-neighbour exclusion, unknown-property preservation and mapped entrance retention; and multipolygon/perimeter aliases with foreign buildings/play areas excluded by the property hole. The multipolygon case demonstrably failed with two sites before canonical-property grouping and passes with one afterward. The full-data audit confirms one body owner, zero geometry issues and exact preservation of all39 pre-existing geography fields. This inventory does not alter existing building, yard, water, road or traffic rendering. Verification logs: `/tmp/kazan-education-tests.log`, `/tmp/kazan-education-before-dedup.log`, `/tmp/kazan-education-audit.json`.


Final inventory validation: **191 tests in41 suites pass**, including both new education cases and the existing repeated-school-plan/campus circulation checks. Release build passes (`main-BobtEMmt.js`; only the geography payload changes), and the saved release snapshot is `/tmp/kazan-education-ready-dist`. No native/FPS claim is made for this data-only batch. School facade/yard rendering and educational-property traffic exclusion remain required next work; the kindergarten renderer follows the school system.


Inventory batch **7e49a5b** is committed and pushed. Publication is pending and will be checked alongside subsequent work, without waiting for CI. The saved release is `/tmp/kazan-education-7e49a5b-dist`. Next coherent work connects real school/kindergarten properties to ambient-traffic exclusion, then continues school facades and yards; the separate kindergarten renderer remains after schools.
