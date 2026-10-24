# Kazan reconstruction queue

Queue reviewed on 2026-10-24 following the user’s priority update. Schools are priority №1, followed immediately by a separate kindergarten system, then СИЗО на Япеева,16 and the eight КАИ dormitories. The principal КАИ №9 / Технополис and Ансат batch is published, with native visual acceptance pending; school inventory/classification is now active. Orthodox-church tasks, road-interchange follow-ups and construction follow-ups are removed at the user’s request. Previous implementation and verification records remain in Git history. Commit and push each coherent implementation batch and record its publication status immediately.

## Priority №1 — citywide procedural schools and school grounds

**User clarification — visible procedural yards at every school.** The required result includes a shared generator of pull-up/exercise bars, hockey rinks, football pitches and other school sport/play elements across all mapped schools, rather than only inventory or vehicle restrictions. Use a stable per-school seed for varied layouts and amenity selection so yards stay consistent on reload/return. Fit the generated selection to each actual available yard, preserve doors/paths and avoid buildings, roads and other occupied space. Mapped features take precedence; generated positions/layouts remain explicitly estimated. Resolve missing boundaries from source property/enclosure evidence and report actual coverage and remaining gaps; a few showcase schools do not satisfy the request. School and kindergarten yard rules remain separate.

**Active batch — inventory/classification.** The same-source import and compiler now retain255 mapped school sites inside Kazan (289 in the regional game area), separately from432 kindergarten sites (474 regional). There are514/660 associated body identities,44/36 unknown property boundaries and3/3 sites without bodies; these are mapped physical-site counts, not a census. Source membership and estimated plan families stay distinct. The data audit preserves all39 existing geography fields and one physical owner per body; two boundary/deduplication tests pass. All191 tests in41 suites and the release build pass. Inventory batch **7e49a5b** is committed and pushed; publication is pending and will be checked alongside implementation, without waiting for CI. This batch does not complete facade/yard rendering or school traffic exclusion; those remain the next implementation work. Detailed coverage and source anomalies: `docs/kazan-education.md`.

Build one systematic, lightweight procedural representation for schools throughout Kazan, including their yards and sports/play areas. Inventory mapped school sites, property boundaries, teaching bodies, gyms, annexes, entrances and grounds. Deduplicate campuses and distinguish school counts from building counts, kindergartens, universities and other educational facilities. The user’s estimate of roughly 200 or more schools is a planning estimate, not verified coverage; report the actual retained sites, missing coverage and unknown identities.

Identify recurring standard school projects from footprint/wing layout, storeys, roof forms, materials and representative photographs. Where available, record verified project/series identities; otherwise label procedural family assignments as inferred. Reuse parameterised families for main teaching wings, connecting halls, gyms, entrance blocks, brick/panel/plaster facades and glazing; preserve each school’s mapped footprint, proportions, individual paint and entrances. Retain Gymnasium 155 as a comparison/reference case rather than treating it as the template for every school. Distinctive schools need appropriate variants, without separate expensive bespoke renderers.

Generate school grounds through a shared layout system: football pitches/goals, basketball or multipurpose courts/hoops, running tracks where present, play/exercise areas, assembly/paved areas, paths, planting, fences and gates. Prefer mapped/photo-backed features and fit them to the actual property, school doors, terrain and access routes. Where grounds are unmapped, allow conservative explicitly estimated layouts only inside established property boundaries and available space; do not invent a property by proximity or force every amenity into every yard. Keep pitches/courts clear of buildings and vegetation, preserve pedestrian/player access and keep ambient through traffic out through the shared campus/access rules. School grounds and major spectator venues remain separate classifications while reusing compatible court/field generators.

Implement inventory/classification, reusable school families and yard generation as sequential coherent batches, then expand coverage family by family. Use shared spatial batches, bounded visible detail and distant silhouettes; no per-school animation or expensive decorative assets. Verify representative older/modern, compact/large and sloping sites visually, including yards, entrance access, map travel and dense-street performance. Record coverage, observed versus estimated layouts and unresolved identities; do not claim citywide completion from a few showcase schools.

## Native visual acceptance follow-up — КАИ №9 and Ансат

Principal batch **8d4a242** is committed and pushed: white two-storey way/91645204, low peach hall97067333, connector97067338 and the requested blue/white static Ansat on terrain-fitted skids.189 tests and release build pass (`main-BobtEMmt.js`); actual draw-helper geometry has no invalid vertices, both main window tiers hit glazing and16 skid rays reach the runners within0.121 m of ground. Two offline geometry views were inspected; these are not native game screenshots. The existing Chrome tab's Runtime.evaluate timed out after8 seconds, so native appearance/FPS remain unverified. Production JS/CSS and full geography now byte-match the saved release (geography SHA-256 prefix805db5e855f049b1); publication is verified. Native visual acceptance remains a follow-up alongside school work. Source and explicit placement/height/current-photo estimates: `docs/kazan-kai.md`, `docs/kazan-aircraft.md`, scene `kai-ninth-podluzhnaya-ansat-yard`.

## Immediately after schools — separate procedural kindergarten system

Inventory and deduplicate mapped kindergartens, their property boundaries, main bodies, annexes, entrances and outdoor play areas separately from schools. Report actual mapped site/building coverage and unknown identities; the user expects many sites, but relative counts are not verified. Reuse suitable lightweight building/terrain/access primitives while giving kindergartens their own facade and yard families, proportions and palettes.

The principal yard features are age-appropriate play groups, sand/play areas and covered outdoor verandas or shelters against rain, fitted to mapped/photo-backed positions where available. Keep unobserved shelter/game placement explicitly estimated and inside established property boundaries with sufficient clear space. Preserve planting, paths, fences, gates and access to every entrance. Do not apply the school football-pitch, adult exercise-bar or spectator-sports layout to kindergarten yards. Exclude ambient through traffic using the shared educational-property access rules while retaining mapped surfaces and pedestrian/player access. Check representative compact/large, older/modern and sloping sites and performance; then commit/push each coherent coverage batch without waiting for CI.

## Next after schools and kindergartens

1. **СИЗО на Япеева,16 — whole complex, immediately after schools and kindergartens.** Identify all mapped prison/administrative buildings, historic facades, walls, gates, roofs, internal volumes and the surrounding photographed scene. Include the existing СИЗО-1 colour-pilot request.
2. **КАИ dormitories.** Take the eight inventoried dormitories one at a time, retaining each footprint, facade, roof, entrance and essential grounds. Keep them distinct from academic buildings and preserve uncertain identities in the source inventory.
3. **Sports venues as a citywide procedural system.** Replace the current strange/generic forms with recognisable procedural families for football grounds/stadiums, ice arenas, basketball/multipurpose halls and indoor pools. Inventory venue boundaries and component buildings; use each mapped footprint, sport, proportions, roof structure, facade, entrances, stands/bowl and surrounding access/parking. Generate outdoor pitches, court markings, goals/hoops and spectator arrangements through reusable families rather than repeating one stadium shape. Start the photographic review with Basket Hall, Ak Bars Arena, Central Stadium, hockey venues and pools. Preserve Tatneft Arena’s reviewed distinctive roof/exterior. Keep school/campus/community facilities separate from major spectator arenas; retain multi-sport tags and inferred classifications. Share suitable generators with school grounds, spatially batch repeated parts and check representative exterior/grounds views and dense-scene performance before expanding coverage.
4. **Казан Нуры and Кул Шариф mosques.** Finish Казан Нуры’s timber/minaret geometry and obscured apartment elevations in the Lemana Pro reference scene (store reference parent way/222508209). Add a proper Кул Шариф reconstruction using its actual mapped bodies and photographs: characteristic overall silhouette, central dome, minarets, facade/material palette, entrances and essential grounds. Preserve site-specific proportions while reusing suitable procedural parts; record observed dimensions versus estimates and neighbouring photo-scene identities. These two explicit mosque requests remain in scope after removal of the Orthodox-church queue.

## Photographic accuracy follow-ups — separate from principal reconstruction

Keep observed details separate from procedural estimates. For each reference view, identify every visible neighbouring/background footprint and maintain the corresponding `referenceScenes` checklist in `tools/data/kazan-building-observations.json`. These refinements follow the remaining principal requests and must not delay them indefinitely.

- **КАИ and university campuses:** unknown property boundaries and auxiliary-site identities; library entrance recess/flags, physics relief and terrace balustrade, main-building rear ornament. Individual КАИ scene checklists in `docs/kazan-kai.md` retain: №1 capitals/emblem and hidden elevations; №2 current signage, facade, furniture and paving; №3 emblem, plaques, lanterns, restoration finish and garden; №4 enclosure/gates, side stair, forecourt and wear; №5 sculpture/capitals, courtyard and square; №6 current photographs, ancillary grounds and the separate Дементьева 2 candidate way/228447742; №7 logo, canopy fins, equipment and court; №8 current branding/mullions, rear/auxiliary identities, planting, ramps and furniture. Hidden elevations and photographed neighbours remain explicit rather than assumed verified. Shared pedestrians and gentle flag motion are optional ideas, not a required animation subsystem.
- **Aircraft reference scenes:** retain exact signage/enclosures, hidden museum surfaces, connector levels and residential/factory backgrounds for `kai-tu144-chetaeva-museum`; administration ornament, concealed elevations, entrance hardware/ramps/landscaping and background factory identities for `aviastroitelny-tu22-plant-administration`. Source notes: `docs/kazan-aircraft.md`.
- **Дворец земледельцев:** horses/winged-bar sculptures, reliefs/capitals, rear facades, square planting and photographed apartment/ruin backgrounds in `farmers-palace-central-and-corner-fronts`; notes: `docs/kazan-palace.md`.

## Other remaining requests and follow-ups

- **Facade colours:** finish Chistopolskaya 53 and the modern СИЗО-2 frontage; СИЗО-1 is part of the whole-complex task above. Continue close review of obscured Sibgata Khakima/Bereg/Sovremennik, Savin/Kozina and Chistopolskaya 55/57 facades; project-family membership does not verify individual paint.

## Work order

Keep one active implementation task while working. Apply the sequential, proportionate-detail rule in `AGENTS.md`; finish the principal visible result and move on, retaining unresolved fine detail explicitly. New messages add requirements to this file without replacing unfinished work. After each coherent work batch, finish its relevant data, implementation and regression/browser checks, then commit and push that batch. Record its commit, push and pending publication status in this queue immediately, then continue with the next task without waiting for CI. Check deployment results alongside subsequent work; mark delivery only after the evidence is available. Move delivered work below and retain explicit photographic or accuracy follow-ups. A researched or implemented item is not yet delivered until it is verified and deployed.

## Photographic follow-up — Пятницкая церковь and surrounding photo scene

Identify the mapped church parts and every neighbouring/background building visible in current reference photographs. Record a scene checklist and observed/estimated details, then implement the church, bell tower, roofs/domes, entrances and the complete photographed scene. Commit/push each coherent batch and record its status here immediately; do not wait for CI before continuing.

First batch: photographed church tiers, open belfry/bell, west portico, chapel, memorial shrine, parish office and estimated perimeter/court; separate street-row and apartment facade palettes. Local suite: 155 passing; production build passed. Three Chromium views checked with no runtime errors or invalid coordinates. Published batch commit `91ac962` pushed; [CI run 39988239536](https://github.com/meoyawn/slop-kazan/actions/runs/39988239536) succeeded. Production version `d3d6b2d4ec2c849a`; served church/city/geodata bytes match the built files. The full scene remains active: the palace/cathedral background, distant roof fragments and fine facade details remain in the appearance-data checklist. Subsequent batches below cover the ruin, office and access layout. Technical/reference notes: `docs/kazan-churches.md`.

Second batch verified locally: open portico collision, shared raised landing/treads/rails, gate intervals and deduplicated fence piers; 2024-reviewed ruined round tower, administrative office and projecting apartment balconies. Both access regressions fail on the preceding code and pass after the repair. Chromium covers the entrance, ruin, office, balconies and hill scene: zero displacement through the three central walking lanes and both gates; columns and overhead beam remain solid; rendered tread heights agree within 0.000001 m. Full suite: 157 passing; production build passed. Implementation commit `dca4f31` pushed; [CI run 39992398008](https://github.com/meoyawn/slop-kazan/actions/runs/39992398008) succeeded. Production version `de67eb76196c3ef2`; served church/city/config/facade/geodata bytes match the built files. Continue without waiting for CI.

Third batch verified locally: lower volumes now reach the sampled sloping ground; mapped property, four barrier ways, three entrance/gate openings and the seven-step side approach replace the estimated perimeter. The targeted importer stores 44 monastery/church boundary and gate records with the regional extract SHA. Full suite: 157 passing; the two church access tests also pass after final flight alignment; build passed. Chromium: zero displacement through three main-flight lanes and all three mapped entrance/gate openings; all 25 downhill wall rays hit supporting geometry; main and seven side-stair treads match foot heights within 0.000001 m. No runtime/invalid-coordinate errors. The side approach rise remains a coarse DEM estimate. Implementation commit `f3f2c9f` pushed; [CI run 39993988651](https://github.com/meoyawn/slop-kazan/actions/runs/39993988651) succeeded. Production version `3d9d54143a82c6c1`; served church/geodata bytes match the built files. Continue with power lines without waiting for CI.

Next implementation: the newly prioritised citywide power-line system above. Retain the church scene as unfinished photographic follow-up, including the visible palace/cathedral background and their requested full scenes. Keep the photographic task active until its whole checklist is addressed.

## Existing follow-ups — pending

- Railway photographic detail: all visible buildings in the reviewed station crops are identified and rendered. Exact sculpted heraldry/leopard statues, rear ornament and obscured service doors remain explicitly estimated in the station scene checklists; station heights and structural sections have not been surveyed.

- Airport photographic detail: the reviewed older-terminal palette is a first pass. Retain the aircraft-control tower glazing, curved railway-station roof/red fascia, small airside service-building identities and current terminal extension as explicit scene follow-ups in the appearance data.

- Campus photographic detail: scene identities and observed/inferred details are recorded in `tools/data/kazan-building-observations.json` under `referenceScenes`. Preserve the reviewed repeated facades. Continue the library entrance recess/flags, exact physics relief and terrace balustrade, main-building rear ornament, current fine branding/mullion details and hidden elevations/grounds of KAI buildings №2/№8, whose principal exteriors are now implemented above. These are accuracy follow-ups, not completed photographic detail.

- Sibgata Khakima facade cohorts: the first 97 building/part records now distinguish western Bereg/light cladding, eastern ochre/brown and Sovremennik variants, the Savin developments on Kozina and the Chistopolskaya 55/57 panel family. Continue the close photographic review of obscured faces and the other buildings in each reference scene; project-family membership stays separate from individual paint verification.
- Citywide road levels: continue checking complicated ramps and turning loops at Pobedy near Mega and the Nazarbayeva interchange. Shared road profiles, short-link connectivity, bridge slabs and supports, approach embankments and open tunnel portals now cover the imported motor-road network. Browser checks cover both Amirkhan intersections, its southern tunnel and the northern elevated section. Exact structural dimensions remain estimated.
- Distant rendering: retain facade colours, windows and roof materials on instanced buildings; restore the original sky-coloured aerial perspective while keeping the opposite Volga hills readable.
- School typologies: match the footprint and storeys of Gymnasium 155 against other mapped schools. Share facade construction rules, preserve school-specific paint and mark unverified matches as inferred.

## Requested, still to complete

- Sports venues as a citywide system: import venue boundaries and distinguish football grounds/stadiums, ice arenas, basketball/multipurpose halls and indoor swimming pools. Use mapped footprint, sport, roof, entrances, stands and surrounding access/parking rather than a single generic stadium shape. Start the photographic review with Basket Hall, Ak Bars Arena, Central Stadium, the hockey venues and pool buildings. Preserve Tatneft Arena's current reviewed exterior; migrate it to shared generators when they can retain its distinctive roof and facade. Keep campus/community facilities distinct from major spectator arenas, retain multi-sport tags and mark uncertain classifications as inferred.
- Construction follow-up: check newer stage photographs as projects progress. The two beach tower outlines (`relation/20028892`) now use the user's reported piling stage, with planned height kept separately; Chekhov Market (`way/95046265`) retains its shell during renovation. Exact temporary layout and machinery positions remain estimated.
- Kazanka crossings still to detail: Kirov dam, Kremlin/Lenin dam and the third transport dam toward Kompressorny. Preserve the reviewed Millennium pylon, cables and shared deck/support system while completing the remaining structures and approaches.
- Lemana Pro on Amirkhan, `way/222508209`: browser-checked current pale/beige store envelope, entrance, new signage and forecourt. Continue the neighbouring Kazan Nury mosque's timber/minaret geometry and the obscured apartment elevations in the reference scene.
- Complete the colour pilot: Chistopolskaya 53, the historic SIZO-1 at Yapeyeva 16 and the modern SIZO-2 frontage. Preserve the already detailed surviving Makary Church.
- Continue scene-wide photographic review around the completed landmarks. Citywide inferred facade families are a first pass, not evidence that every background building's paint has been verified.

## Upstream technical sync — delivered

Merged `mrdoob/slop-newyork` through `12593c9` (23 commits): native modules, gamepads, spatial audio, saved positions, traffic/pedestrian improvements, rear indicators, SSR and joined road markings adapted to Kazan. Manhattan geographic updates are excluded. Concurrent church refinements, power-network data and generating-station priorities are preserved.

Per the user's final instructions, restore the fork's vehicle physics at `ad468c1` exactly in all four motion-update methods (with native import binding adaptation). Double **W** or double **↑** toggles super boost; double Shift no longer toggles it. Held Shift remains ordinary boost. Further renderer work/checks are deferred at the user's request.

Verification: the integrated suite passed 173 tests; the final physics/input revision passed 49 controller/touch/gamepad/helipad checks, and the four motion-update methods were compared directly with the fork. Final production build passed. Earlier isolated WebGPU preview reached the city with no runtime warnings/errors. The configured port-5173 server was unreachable and was not started or restarted.

Implementation integration `caeef83` and publication-status commit `2c0fafb` are pushed. Production deployment [a5ecdc76](https://a5ecdc76.slop-kazan.pages.dev) serves `assets/main-Dt2EtCnD.js`; production HTML, CSS, bootstrap, engine module and both compressed Kazan geography payloads were byte-verified against the local build at `https://kazan.adelnz.com/`. [CI run 39996478332](https://github.com/meoyawn/slop-kazan/actions/runs/39996478332) remains in progress; local deployment is verified, so do not wait for CI. Technical notes: `docs/kazan-upstream-sync.md`.

## Delivered foundations

- Regional map including Aviastroitelny, Novaya Tura/Zelenodolsk industrial site, Samosyrovo, the airport, M7, eastern hills and Verkhniy Uslon.
- FABDEM relief with native-resolution hill patches; repeatable landcover-driven vegetation.
- Citywide parking areas separate from ambient through traffic, with a bounded number of stationary vehicles.
- Facade families and partial-building body repair; reviewed commercial landmarks including Tandem, Bakhetle, Kishmish and the rounded Musina garage.
- Kishmish in separate corner footprint `263308228`, Samsa No. 1 in adjoining row `129741570`; corrected view verified in Chromium. Four reviewed Musina pavilions are one storey, with conservative low-rise estimates for otherwise untyped small outlines.
- Construction state separates planned floors from present volume, including inherited building parts, bounded pile-driving detail, terrain excavations and renovation scaffolds. Unreviewed construction stages remain unknown.
- Tatneft Arena, Park House, Riviera observation wheel, Magellan orange palette, TAIF helipad and surviving Makary Church exterior.

- M-shaped structures: browser-checked Millennium pylon and separate Orenburgsky Trakt entrance arch, including night lighting. Positions follow the mapped support/installation, with separate light-concrete/gold-cable and silver-metal palettes. Structural section sizes and the entrance arch's dimensions remain estimated.
- URAM: browser-checked the mapped outdoor bowls, pump tracks and courts under/by Millennium, plus the blue indoor centre. Internal obstacle layouts and heights are procedural estimates from completed-park photographs. Future riding physics are separate from the current static visual equipment.

### University campuses — delivered

- [x] Identify mapped KFU main building, second academic building, physics tower, modern library and KAI Chetaeva buildings; inspect university photographs and the campus map.
- [x] Import 50 mapped university/college grounds and monument nodes from the cached regional extract. Exclude 165 internal service-road pieces from ambient traffic and retain 28 campus stair ways.
- [x] Implement boundary-based exclusion of internal campus service roads from ambient traffic while retaining access geometry and public streets.
- [x] Verify the traffic behavior against KFU and KAI, including roads crossing a campus boundary. The regression fails on the previous bundle (three internal KFU links) and passes with the repaired graph.
- [x] Add terrain-aware mapped steps, connected pedestrian grounds and the library hillside approach. Visible horizontal treads and pedestrian heights share one surface; the previous engine fails the stair regression.
- [x] Add the photographed facade structures of KFU main building, dvoika, physics tower/podium and modern library; add the mapped student Ulyanov statue and Skovorodka seating/paving. Scene identities and accuracy follow-ups are retained below. The main colonnade has separate lower/overhead collision shapes; browser checks keep the portico open and the wall/upper part solid.
- [x] Inspect KAI Chetaeva campus appearance and retain an explicit scene checklist. Reviewed the eighth building entrance; warm tile/blue plinth family recorded. The second building exterior remains unverified.
- [x] Verified in Chromium, 145 tests passing, production build and deployment successful. Commit `a7338e1`, [CI run 39940518504](https://github.com/meoyawn/slop-kazan/actions/runs/39940518504), production asset version `fa32fcafe54362f5`; served campus/config/city/geodata bytes match the local build. Browser checks cover main, second, library, physics, hillside steps and KAI.

### Spasskaya Tower and mapped gate passages — delivered

- [x] Identify actual pedestrian and destination-vehicle gate passages and reviewed tower parts.
- [x] Implement photographed white tower parts, three clock faces, open belfry, white tent/spire and star; retain the green pitched roof on the western church wing. Review neighbouring Junker School, Prisutstvennye Mesta, Bratsky wing and Guardhouse facades through shared families. Mapped wall envelopes and white defensive towers use fortification geometry instead of generic windowed buildings; mapped wall heights are retained alongside the explicit photographed visible-height corrections near the gate.
- [x] Compile shared arch volumes for mapped building passages and fortress-wall intersections. The compiled regression keeps the main opening, eastern vehicle gate, adjacent pier and full overhead masonry consistent. Chromium controller sweeps over the complete mapped routes report zero displacement for pedestrian and car; the adjacent solid pier still pushes the actor away.
- [x] Published commit `8c79d13`; [CI run 39947411993](https://github.com/meoyawn/slop-kazan/actions/runs/39947411993) succeeded. Production version `9d1a50c7ca74b311`; served gate/city/facade/geodata files match the local build. Destination/delivery/customer-only routes no longer feed ambient through traffic; geometry stays available to the player. All final Chromium views pass, with zero collision displacement along both player routes. Full suite: 148 passing tests; production build passed.

### Airport system — delivered

- [x] Confirm the active runway, former parallel runway/taxiway and mapped apron surfaces from current/source records.
- [x] Use dedicated aircraft-pavement materials and distinct runway/taxiway/stand markings, including the light surfaces shown in the user screenshot.
- [x] Keep vegetation off runways, taxiways and aircraft stands; keep public landside access separate.
- [x] Review actual terminal reference appearance, inspect airport-wide and close views in the existing Chromium session, test/build, push and verify deployment.

Verified locally: 226 mapped airfield features (five runway records, 187 taxiways, seven aprons and 27 stand positions); 47 service-road pieces on aprons leave ambient traffic. Both normal and lightweight CPU views inspected; the final golden-hour runway/apron views use the revised darker pavement. Forest-crown check: 90,458 visible crowns, zero overlap with paved aircraft surfaces. Full suite: 148 passing; production build passed. Published commit `589ebd0`; [CI run 39953484014](https://github.com/meoyawn/slop-kazan/actions/runs/39953484014) succeeded. Production version `27c34d235dc33567`; served airport/vegetation/geodata bytes match the local build.

### Courtyard traffic system — delivered

- [x] Import mapped residential land-use boundaries and classify internal access using those boundaries and living-street/driveway tags.
- [x] Remove internal courtyard links from ambient through traffic, preserving public streets, the player's access and existing bounded parked cars.
- [x] Reproduce Vagapova in a compiled regression, check other residential districts and boundary cases, inspect in Chromium, test/build and deploy.

Verified locally: 17,318 classified access pieces; Vagapova regression fails on the preceding bundle and passes after boundary splitting. Both the nearby public residential streets and the roughly 17 m of external approaches remain connected. Chromium traffic simulation reports zero courtyard-edge vehicles while public traffic remains present; regional samples include Vagapova, Novo-Savinovsky and Aviastroitelny. Full suite: 149 passing; production build passed. Published commit `14f61ac`; [CI run 39955346171](https://github.com/meoyawn/slop-kazan/actions/runs/39955346171) succeeded. Production version `daa5e30d344861a8`; served geography bytes match the local build.

### Rotating San Andreas-style radar — delivered

- [x] Add a circular radar with readable land, water and roads, rotating the shared cached geography with player heading.
- [x] Keep the player marker stable, move true north around the rim, preserve waypoint/camera alignment and full-map controls.
- [x] Check a complete rotation, resize, HiDPI and mobile layout in Chromium; run regression/tests/build.

- [x] Publish and verify production assets.

Verified locally: 150 tests passing; production build passed. The heading-up coordinate regression fails on the preceding renderer and passes through all eight bearings plus wraparound at DPR 1/2. Chromium confirms circular desktop/narrow/portrait/landscape layouts, no overlap with touch buttons or the brand/camera HUD, working full-map open/close and a 440 px backing canvas for a 220 CSS px Retina radar. The same cached geography is reused during rotation. Live shared Chromium preview restored.

Published commit `3373b25`; [CI run 39958569448](https://github.com/meoyawn/slop-kazan/actions/runs/39958569448) succeeded. Production version `802881c423195ba2`; served radar JavaScript, compiled stylesheet and HTML version match the local build.

### Heavy-rail system — delivered

- [x] Import the regional heavy-rail network independently of motor traffic, retaining mapped gauge, track count, electrification, service/access and bridge/tunnel levels.
- [x] Include both main passenger stations, approaches, sidings, Yudino yard, junctions, the airport branch and the actual Shveytsarsky Forest boundary corridor.
- [x] Generate rails, sleepers, ballast, platforms, bridge/tunnel structures and catenary from shared profiles. Keep exposed corridors free of trees and show railways on the radar/full map.
- [x] Inspect station references and mapped footprints; render both terminals and the visible Narimanova 2 neighbour, retaining explicit detail estimates in the appearance data.
- [x] Verify regressions, Chromium views, tests/build and production assets.

Verified locally: 939 track ways (571.3 track-km), 43 stations/halts, 66 platforms and 1,251 switches/crossings/buffers/signals. The topology regression fails on the preceding geography; shared-node heights and mapped tunnel entrance/interior checks pass. Chromium covers both stations, the actual forest-edge corridor, a separate southern tunnel and Yudino yard: zero runtime errors, invalid rail vertices or railway overlap among 89,253 forest crowns. Full suite: 152 passing; production build passed. Exact station ornament and unexposed elevations remain photographic follow-ups above. Technical/source notes: `docs/kazan-railways.md`.

Published commit `6b98a7f`; [CI run 39972839401](https://github.com/meoyawn/slop-kazan/actions/runs/39972839401) succeeded. Production version `203d4e3d0104e58d`; served railway/station/config/city/vegetation/map/geodata bytes match the local build.

### Tram system — delivered

Published commit `defbf84`; [CI run 39985114187](https://github.com/meoyawn/slop-kazan/actions/runs/39985114187) succeeded. Production version `1d7e14c6c11121f3`; served tram/railway/config/city/road-structure/traffic/main/vegetation/map/geodata bytes match the local build. Local checks: 155 passing tests and production build; 186 mapped ways, 16 continuous directed routes, 212 stop/stop-position records and 59 platforms. Chromium covers Yamasheva, embedded station-area tracks, the Siberian bridge and underpasses: all 32 demonstration vehicles advance, zero runtime/invalid-coordinate errors, 432 underpass body-clearance rays without structural hits and zero tram overlap among 89,119 forest crowns. Shared geometry includes reserved/embedded beds, connected terminal returns, stop dwell, estimated white-T signals and road/player clearance. Source/estimate notes: `docs/kazan-trams.md`.

Fuel compiler checkpoint `ec2eb27` and the procedural-city rule `1cf33e5` are pushed through merged `8ec0717`, preserving concurrent shared-sign shader fix `60ad966`. Three compiler/geography checks pass, including the complete default-path rebuild in a checkout with spaces/non-ASCII characters; the following renderer build and28 targeted checks pass locally. Publication remains pending; continue without waiting for CI.

Pedestrian source/topology checkpoint `a0b992d` is committed and pushed. Two topology/classification tests and the full compiler pass; previous compiled city fields are unchanged. Native appearance/publication remain pending; the shared visible generator and walkable profiles continue without a CI wait.
