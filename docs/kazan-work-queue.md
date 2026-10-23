# Kazan reconstruction queue

Work on `feat/kazan-tatarstan`; pushing the fork deploys the preview. Preserve the shared Vite and Chromium instances.

## Work order

Keep exactly one active implementation task. New messages add requirements to this file without replacing unfinished work. Complete its data, implementation, regression/browser checks and push before starting the next task. Move delivered work below and retain explicit photographic or accuracy follow-ups. A researched or implemented item is not yet delivered until it is verified and deployed.

## Active — university campuses

- [x] Identify mapped KFU main building, second academic building, physics tower, modern library and KAI Chetaeva buildings; inspect university photographs and the campus map.
- [x] Import 50 mapped university/college grounds and monument nodes from the cached regional extract. Exclude 165 internal service-road pieces from ambient traffic and retain 28 campus stair ways.
- [x] Implement boundary-based exclusion of internal campus service roads from ambient traffic while retaining access geometry and public streets.
- [x] Verify the traffic behavior against KFU and KAI, including roads crossing a campus boundary. The regression fails on the previous bundle (three internal KFU links) and passes with the repaired graph.
- [x] Add terrain-aware mapped steps, connected pedestrian grounds and the library hillside approach. Visible horizontal treads and pedestrian heights share one surface; the previous engine fails the stair regression.
- [x] Add the photographed facade structures of KFU main building, dvoika, physics tower/podium and modern library; add the mapped student Ulyanov statue and Skovorodka seating/paving. Scene identities and accuracy follow-ups are retained below. The main colonnade has separate lower/overhead collision shapes; browser checks keep the portico open and the wall/upper part solid.
- [x] Inspect KAI Chetaeva campus appearance and retain an explicit scene checklist. Reviewed the eighth building entrance; warm tile/blue plinth family recorded. The second building exterior remains unverified.
- [ ] Finish final Chromium views, push and verify deployment. Full suite: 145 passing tests; production build passed. Browser checks cover main, second, library, physics, hillside steps and KAI, with no internal ambient vehicles in the sampled simulations. Both previously saved local processes had exited; restored one Vite at :5173 and the same Chromium profile at :9222.

## Next — do one at a time

1. **Spasskaya Tower and Kremlin exit.** Inspect actual front/rear photographs and mapped gate passages. Add the detailed white tower, clock faces, belfry, spire and star. Create real openings with matching wall/building collision geometry and prove walking/driving through the exit; retain adjacent solid walls. Mapped pedestrian and destination access must not create an unrestricted stream of ambient cars in the Kremlin.
2. **Airport system.** Fix the runway/taxiway/apron material mix-up shown in the user's screenshot. Import actual surfaces and distinct runway, taxiway and stand markings; remove inappropriate sidewalk patterns and vegetation from paved aircraft areas. Verify the status of the parallel former runway before labelling it as an active runway. Review terminal/neighboring building appearance from actual photographs.
3. **Courtyard traffic system.** The user's Vagapova courtyard has heavy back-and-forth through traffic. Classify internal residential access from mapped roads, access tags and land-use/yard geometry. Keep public streets connected, exclude through routes from yards and allow only very sparse local/destination movement. Reuse the shared area-boundary splitting approach and the existing bounded parked-car budget. Inspect Vagapova as a regression example; no street/block-specific blanket disabling.
4. **Rotating San Andreas-style minimap.** Make the radar turn with the player/camera heading, with a stable player marker, readable streets/land/water and a rotating north indicator. Preserve full-map controls and mobile use; keep the existing shared canvas/render loop and validate turning through a full rotation.

## Existing follow-ups — pending

- Campus photographic detail: scene identities and observed/inferred details are recorded in `tools/data/kazan-building-observations.json` under `campusScenes`. Preserve the reviewed repeated facades. Continue the library entrance recess/flags, exact physics relief and terrace balustrade, main-building rear ornament, KAI eighth-building logo/glazing and the unverified second-building facade. These are accuracy follow-ups, not completed photographic detail.

- Sibgata Khakima facade cohorts: the first 97 building/part records now distinguish western Bereg/light cladding, eastern ochre/brown and Sovremennik variants, the Savin developments on Kozina and the Chistopolskaya 55/57 panel family. Continue the close photographic review of obscured faces and the other buildings in each reference scene; project-family membership stays separate from individual paint verification.
- Citywide road levels: continue checking complicated ramps and turning loops at Pobedy near Mega and the Nazarbayeva interchange. Shared road profiles, short-link connectivity, bridge slabs and supports, approach embankments and open tunnel portals now cover the imported motor-road network. Browser checks cover both Amirkhan intersections, its southern tunnel and the northern elevated section. Exact structural dimensions remain estimated.
- Distant rendering: retain facade colours, windows and roof materials on instanced buildings; restore the original sky-coloured aerial perspective while keeping the opposite Volga hills readable.
- School typologies: match the footprint and storeys of Gymnasium 155 against other mapped schools. Share facade construction rules, preserve school-specific paint and mark unverified matches as inferred.

## Requested, still to complete

- High priority — railway system: import the city's actual railway network, both main passenger stations, station approaches, sidings, yards, junctions and the railway corridor by Shveytsarsky Forest. Preserve mapped gauge, number of tracks, electrification and bridge/tunnel levels. Generate rails, sleepers, ballast, platforms and catenary through shared rules; keep train routes separate from the motor-traffic graph. Review actual current station photographs and mapped footprints before detailing the terminals.
- High priority — tram system, separate from heavy rail: import tram tracks, switches, stops/platforms and route continuity, beginning with Yamasheva Avenue. Distinguish reserved track beds from tracks embedded in the roadway; respect real grades, crossings, stops, directions and access. Share appropriate track geometry utilities with railways while retaining tram-specific vehicles, signals and service behavior.
- Sports venues as a citywide system: import venue boundaries and distinguish football grounds/stadiums, ice arenas, basketball/multipurpose halls and indoor swimming pools. Use mapped footprint, sport, roof, entrances, stands and surrounding access/parking rather than a single generic stadium shape. Start the photographic review with Basket Hall, Ak Bars Arena, Central Stadium, the hockey venues and pool buildings. Preserve Tatneft Arena's current reviewed exterior; migrate it to shared generators when they can retain its distinctive roof and facade. Keep campus/community facilities distinct from major spectator arenas, retain multi-sport tags and mark uncertain classifications as inferred.
- Construction follow-up: check newer stage photographs as projects progress. The two beach tower outlines (`relation/20028892`) now use the user's reported piling stage, with planned height kept separately; Chekhov Market (`way/95046265`) retains its shell during renovation. Exact temporary layout and machinery positions remain estimated.
- University campuses: see the single active task above; do not restart its research or skip its unfinished checks.
- Four Kazanka crossings: Millennium, Kirov dam, Kremlin/Lenin dam and the third transport dam toward Kompressorny. Detail the actual structures and approaches.
- M-shaped structures: browser-checked Millennium pylon and separate Orenburgsky Trakt entrance arch, including night lighting. Positions follow the mapped support/installation, with separate light-concrete/gold-cable and silver-metal palettes. Structural section sizes and the entrance arch's dimensions remain estimated.
- Lemana Pro on Amirkhan, `way/222508209`: browser-checked current pale/beige store envelope, entrance, new signage and forecourt. Continue the neighbouring Kazan Nury mosque's timber/minaret geometry and the obscured apartment elevations in the reference scene.
- URAM: browser-checked the mapped outdoor bowls, pump tracks and courts under/by Millennium, plus the blue indoor centre. Internal obstacle layouts and heights are procedural estimates from completed-park photographs. Future riding physics are separate from the current static visual equipment.
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
