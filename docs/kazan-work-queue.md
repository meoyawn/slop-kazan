# Kazan reconstruction queue

## Active — citywide power-line system / ЛЭП

Implement a systematic power-line network across the entire imported Kazan region. Use mapped overhead lines/minor lines, support nodes, towers/poles, voltage, circuits, conductor counts, underground cable distinctions and substation grounds/buildings where present. Preserve actual mapped routes, branching and shared supports; use reusable support/conductor families with estimated dimensions explicitly separated from source tags. Check terrain clearance, road/rail crossings and vegetation corridors without replacing the whole network with a few landmark pylons.

Begin photographic and browser checks at **Немецкая Швейцария** and **Компрессорный / ветеринарный институт**, then sample the wider city network. Identify every building visible in the selected photographic scenes and retain explicit unresolved details. Finish the current coherent church batch and its relevant checks, commit/push it, then take this item before the remaining photographic requests. Commit and push every coherent work batch, record its status immediately and continue without waiting for CI.

Data/topology batch verified locally: 4,977 source features compile to 175 overhead ways, 30 underground/cable ways, 3,770 unique mapped supports, 3,738 graph spans (668.6 km including cables), 823 substation records and eight circuit relations. One explicitly removed line remains in the inactive evidence list. The compiled-city regression failed before integration and passes for both requested districts; separate cases protect shared pylons, independent crossings and lifecycle handling. Full suite: 160 passing; production build passed. Commit/push and pending publication evidence follow immediately. Source/estimate notes: `docs/kazan-power-lines.md`.

Next coherent batch: procedural mapped towers/poles/portals and conductor spans, shared attachment geometry with terrain/road/rail clearance, then substation grounds and vegetation corridors. Photographic validation of the two requested areas and other city samples remains required; the data import alone does not deliver the system.

## New requests — photographic reconstruction

Review actual photographs and mapped footprints, then make detailed models of the complete scenes and grounds:

- Церковь Параскевы Пятницы: church exterior, roof/domes, bell tower, entrance and every neighbouring building visible in the reference views.
- Собор Казанской иконы Божией Матери and its whole campus: identify and detail every mapped building, enclosure, gate, courtyard and pedestrian approach in the cathedral complex.
- Дворец земледельцев: photographed facade, central arch/tree, wings, roof and the complete surrounding reference scene.
- Every КАИ academic building and dormitory: build an inventory of the mapped buildings and campuses, review photographs for each individual building and retain its own facade, roof, entrance and grounds. The previously reviewed Chetaeva buildings are a starting point; do not treat one facade family as verification of all КАИ buildings.
- СИЗО на Япеева, 16 and the whole complex: identify all mapped prison/administrative buildings, historic facades, walls, gates, roofs and internal volumes; finish the complete complex and surrounding photographed scene. Carry forward the existing SIZO-1 colour-pilot request as part of this work.

Keep observed details separate from estimates, record references and mapped identities in the appearance data, and retain a scene checklist until every visible building has been addressed. These requests are queued. Finish the active implementation batch, record its commit/push and publication status immediately, then continue without waiting for CI.

**After every coherent work batch: run its relevant checks, commit it and push it.** Verify publication/deployment evidence before marking implementation delivered. This applies to each completed chunk of work, not only the final task or the entire queue.

Work on `feat/kazan-tatarstan`; pushing the fork deploys the preview. Preserve the shared Vite and Chromium instances.

## Work order

Keep one active implementation task while working. New messages add requirements to this file without replacing unfinished work. After each coherent work batch, finish its relevant data, implementation and regression/browser checks, then commit and push that batch. Record its commit, push and pending publication status in this queue immediately, then continue with the next task without waiting for CI. Check deployment results alongside subsequent work; mark delivery only after the evidence is available. Move delivered work below and retain explicit photographic or accuracy follow-ups. A researched or implemented item is not yet delivered until it is verified and deployed.

## Photographic follow-up — Пятницкая церковь and surrounding photo scene

Identify the mapped church parts and every neighbouring/background building visible in current reference photographs. Record a scene checklist and observed/estimated details, then implement the church, bell tower, roofs/domes, entrances and the complete photographed scene. Commit/push each coherent batch and record its status here immediately; do not wait for CI before continuing.

First batch: photographed church tiers, open belfry/bell, west portico, chapel, memorial shrine, parish office and estimated perimeter/court; separate street-row and apartment facade palettes. Local suite: 155 passing; production build passed. Three Chromium views checked with no runtime errors or invalid coordinates. Published batch commit `91ac962` pushed; [CI run 39988239536](https://github.com/meoyawn/slop-kazan/actions/runs/39988239536) succeeded. Production version `d3d6b2d4ec2c849a`; served church/city/geodata bytes match the built files. The full scene remains active: the palace/cathedral background, distant roof fragments and fine facade details remain in the appearance-data checklist. Subsequent batches below cover the ruin, office and access layout. Technical/reference notes: `docs/kazan-churches.md`.

Second batch verified locally: open portico collision, shared raised landing/treads/rails, gate intervals and deduplicated fence piers; 2024-reviewed ruined round tower, administrative office and projecting apartment balconies. Both access regressions fail on the preceding code and pass after the repair. Chromium covers the entrance, ruin, office, balconies and hill scene: zero displacement through the three central walking lanes and both gates; columns and overhead beam remain solid; rendered tread heights agree within 0.000001 m. Full suite: 157 passing; production build passed. Implementation commit `dca4f31` pushed; [CI run 39992398008](https://github.com/meoyawn/slop-kazan/actions/runs/39992398008) succeeded. Production version `de67eb76196c3ef2`; served church/city/config/facade/geodata bytes match the built files. Continue without waiting for CI.

Third batch verified locally: lower volumes now reach the sampled sloping ground; mapped property, four barrier ways, three entrance/gate openings and the seven-step side approach replace the estimated perimeter. The targeted importer stores 44 monastery/church boundary and gate records with the regional extract SHA. Full suite: 157 passing; the two church access tests also pass after final flight alignment; build passed. Chromium: zero displacement through three main-flight lanes and all three mapped entrance/gate openings; all 25 downhill wall rays hit supporting geometry; main and seven side-stair treads match foot heights within 0.000001 m. No runtime/invalid-coordinate errors. The side approach rise remains a coarse DEM estimate. Implementation commit `f3f2c9f` pushed; [CI run 39993988651](https://github.com/meoyawn/slop-kazan/actions/runs/39993988651) succeeded. Production version `3d9d54143a82c6c1`; served church/geodata bytes match the built files. Continue with power lines without waiting for CI.

Next implementation: the newly prioritised citywide power-line system above. Retain the church scene as unfinished photographic follow-up, including the visible palace/cathedral background and their requested full scenes. Keep the photographic task active until its whole checklist is addressed.

## Existing follow-ups — pending

- Railway photographic detail: all visible buildings in the reviewed station crops are identified and rendered. Exact sculpted heraldry/leopard statues, rear ornament and obscured service doors remain explicitly estimated in the station scene checklists; station heights and structural sections have not been surveyed.

- Airport photographic detail: the reviewed older-terminal palette is a first pass. Retain the aircraft-control tower glazing, curved railway-station roof/red fascia, small airside service-building identities and current terminal extension as explicit scene follow-ups in the appearance data.

- Campus photographic detail: scene identities and observed/inferred details are recorded in `tools/data/kazan-building-observations.json` under `referenceScenes`. Preserve the reviewed repeated facades. Continue the library entrance recess/flags, exact physics relief and terrace balustrade, main-building rear ornament, KAI eighth-building logo/glazing and the unverified second-building facade. These are accuracy follow-ups, not completed photographic detail.

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
