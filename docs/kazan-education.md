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


Inventory batch **7e49a5b** is committed and pushed. Publication is pending and will be checked alongside subsequent work, without waiting for CI. The saved release is `/tmp/kazan-education-7e49a5b-dist`. The next coherent access batch connects real school/kindergarten properties to ambient-traffic exclusion; the main required result remains the geometry-driven school-yard generator and facades. The separate kindergarten renderer remains after schools.


The user clarified the yard generator's mechanism: **derive layouts from fixed property geometry and every building footprint, not random choices or seeds**. Subtract buildings, mapped activities and entrance/path circulation, then fit suitable football/hockey/court/exercise elements into the remaining zones. Preserve positions across reload/return through identical geometric inputs. The mechanism should later accept a kindergarten-specific play/shelter palette. Whole-city coverage and unknown-boundary gaps must be measured, rather than inferred from showcases.


Shared access batch: the same canonical property compiler now feeds road-access splitting before ambient routes are built. Campus scopes grow from50 to732, including244 school,435 kindergarten and3 other educational properties in addition to existing university/college grounds. Unknown boundaries stay unknown. Road/path surfaces remain, split into71,504 pieces (previous71,171); ambient links are53,223 (previous53,239). Fifteen mapped stair ways newly use the existing shared campus-tread renderer/player surface.35 other geography fields remain exact, including the complete education inventory; upper/underground crossing geometry is unchanged and its split-road indices are rebound.

The actual-route regression failed before this change on residential way70000487 inside school property way70000525, and passes after it. The independent route query includes every inventoried school/kindergarten property and ignores only a0.15 m uncertainty band around0.1 m compiled fence coordinates; external KAI/KGASU approaches remain checked. Four focused education/campus tests pass and the release build passes. The parallel full suite passed190 tests; the offline reproducibility child reached its30-second timeout under concurrent checks. That test then passed in isolation, reproducing the full saved geography exactly. Logs: `/tmp/kazan-education-traffic-focused.log`, `/tmp/kazan-education-before-traffic-final-test.log`, `/tmp/kazan-education-traffic-full-tests.log`, `/tmp/kazan-education-traffic-rebuild-test.log`, `/tmp/kazan-education-traffic-audit.json`. Native appearance/FPS remain unverified; this access batch does not satisfy the requested visible sports/exercise-yard generator.

Inventory7e49a5b publication is verified: all production native assets and full geography byte-match its saved build (geography SHA-256 prefix3c941521f0767246), log `/tmp/kazan-education-production.log`.
