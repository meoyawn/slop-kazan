# Kazan reconstruction queue

Work on `feat/kazan-tatarstan`; pushing the fork deploys the preview. Preserve the shared Vite and Chromium instances.

## Work order

Keep one active implementation task while working. New messages add requirements to this file without replacing unfinished work. Complete its data, implementation, regression/browser checks and push before starting the next task. Move delivered work below and retain explicit photographic or accuracy follow-ups. A researched or implemented item is not yet delivered until it is verified and deployed.

## Active — tram system

Heavy rail is delivered below. Next implement the separate tram system, beginning with Yamasheva Avenue: mapped tracks/switches/stops, reserved and embedded beds, continuous routes, grades/crossings and tram-specific service/vehicles/signals. Keep all remaining requests and photographic follow-ups below.

## Existing follow-ups — pending

- Railway photographic detail: all visible buildings in the reviewed station crops are identified and rendered. Exact sculpted heraldry/leopard statues, rear ornament and obscured service doors remain explicitly estimated in the station scene checklists; station heights and structural sections have not been surveyed.

- Airport photographic detail: the reviewed older-terminal palette is a first pass. Retain the aircraft-control tower glazing, curved railway-station roof/red fascia, small airside service-building identities and current terminal extension as explicit scene follow-ups in the appearance data.

- Campus photographic detail: scene identities and observed/inferred details are recorded in `tools/data/kazan-building-observations.json` under `referenceScenes`. Preserve the reviewed repeated facades. Continue the library entrance recess/flags, exact physics relief and terrace balustrade, main-building rear ornament, KAI eighth-building logo/glazing and the unverified second-building facade. These are accuracy follow-ups, not completed photographic detail.

- Sibgata Khakima facade cohorts: the first 97 building/part records now distinguish western Bereg/light cladding, eastern ochre/brown and Sovremennik variants, the Savin developments on Kozina and the Chistopolskaya 55/57 panel family. Continue the close photographic review of obscured faces and the other buildings in each reference scene; project-family membership stays separate from individual paint verification.
- Citywide road levels: continue checking complicated ramps and turning loops at Pobedy near Mega and the Nazarbayeva interchange. Shared road profiles, short-link connectivity, bridge slabs and supports, approach embankments and open tunnel portals now cover the imported motor-road network. Browser checks cover both Amirkhan intersections, its southern tunnel and the northern elevated section. Exact structural dimensions remain estimated.
- Distant rendering: retain facade colours, windows and roof materials on instanced buildings; restore the original sky-coloured aerial perspective while keeping the opposite Volga hills readable.
- School typologies: match the footprint and storeys of Gymnasium 155 against other mapped schools. Share facade construction rules, preserve school-specific paint and mark unverified matches as inferred.

## Requested, still to complete

- High priority — tram system, separate from heavy rail: import tram tracks, switches, stops/platforms and route continuity, beginning with Yamasheva Avenue. Distinguish reserved track beds from tracks embedded in the roadway; respect real grades, crossings, stops, directions and access. Share appropriate track geometry utilities with railways while retaining tram-specific vehicles, signals and service behavior.
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
