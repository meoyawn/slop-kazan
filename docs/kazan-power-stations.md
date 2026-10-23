# Existing Kazan power-station detail

The station sites already exist in the map. Detail their existing mapped bodies and equipment rather than replacing the mapped campuses. The active photographic work begins with Казанская ТЭЦ-1; ТЭЦ-2/3 follow in the same queue.

## ТЭЦ-1

Mapped campus relation/15961248 contains the two principal stack parents way/316538194 and way/316538197. Their red/white building parts retain paint-band starts at 0, 22, 44, 66, 87, 108 and 129 m. Generic fallback heights previously left short disconnected bands ending around 135/132.7 m. The [official historical description](https://kt.tatarstan.ru/opros.htm?pub_id=3378442) gives two reinforced-concrete stacks of 150 m. The model now uses that published height and a continuous tapered open-top shell with the mapped band colours and positions.

The [system-operator station photograph](https://www.so-ups.ru/fileadmin/_migrated/pics/kazan_tec-1.jpg) shows the striped stacks, service galleries, ladders and the grey/white generating halls from the lake. Stack diameters retain their mapped footprints; taper, lining/opening thickness, gallery levels/sections and ladder details remain procedural estimates. No capture date is inferred from the image URL.

The scene checklist `tec1-lakeside-power-station` in the appearance data remains unfinished. Match every visible hall and service volume to its footprint before declaring the view complete. The newer ПГУ equipment is described below; pipe bridges, circular tanks, old halls, low service buildings and the complete background still require individual photographic matching. Candidate existing boiler/turbine footprints are recorded as candidates, not silently certified as photographed identities.

## ТЭЦ-1 ПГУ/ГТУ and cooling equipment

The [Tatenergo press photographs published 25 June 2026](https://www.tatar-inform.ru/news/tvorcy-xudozniki-skulptory-energetiki-cetyre-zarisovki-o-pyati-elektrostanciyax-tatenergo-6031413) show the current blue/white hall palette, large hyperbolic cooling tower, four smaller striped exhausts and surrounding industrial equipment. The older system-operator photograph remains useful for geometry; its grey halls do not verify current paint. The composite aerial also shows circular tanks, pipe bridges and service/background buildings; those remain explicit scene follow-ups.

Existing hall way/1077147084 retains its L-shaped mapped footprint, blue/white panel groups, horizontal glazing, flat roof, plinth and access doors. Its 38 m height and all facade modules, door and roof details are visual estimates. The shared industrial panel family retains separate white, blue, glazing and plinth colours.

Mapped cooling tower way/949900444 uses its own footprint and the [builder's published BG-1600 height of 70 m](https://new.prioritetaward.ru/news/novosti_584.html). It has an open hyperbolic shell, red upper bands, exposed white lattice/hoops, base supports and basin. Neck profile, support count, band boundaries and section dimensions are estimates. Vegetation reserves the mapped footprint and crown margin; collision retains the open lower structure and shell interior.

Mapped exhaust nodes 8793821999, 8793822000, 8860763776 and 10968008992 use the [2023 station inventory's four 60 m stacks](https://fondsmena.ru/media/EGM_publicationfiles_Article/Сборник_ЭЭГМ_2023_том_2.pdf). Each keeps its mapped point; diameters, taper, service galleries, ladder and lattice-frame sections are estimates. Duplicate node/8793821998 points to the existing northern main stack and creates no second body. The operator-backed June 2026 station report distinguishes the northern pair from the 2006 ГТУ phase and western pair from the 2018 ПГУ phase; the older inventory grouped all four as ПГУ.

`tools/import-kazan-power-station-structures.py` now stores 76 actual chimney/cooling/tank and pipe-route records at the three existing station grounds in `tools/data/kazan-power-station-structures.json`. Its extract SHA must match the city and power graph. Only reviewed models render; unknown heights and remaining station structures are retained without fabricating measured dimensions. The queue and appearance-data scene checklist remain open for the whole photographed station.

## ТЭЦ-1 tanks and pipe bridges

Existing large round bodies ways 96705089, 96705130 and 96705138 retain their mapped footprints east of the PGU/cooling tower. The aerial shows pale weathered cylindrical walls and low metal roofs. Their source kind `gasometer` is retained without certifying current contents or operation. The 18 m total height, roof rise, seams, ladder and rail sizes are estimates. Small mapped storage tanks ways 420865697 and 1181005271 use the same windowless surface family at an estimated 8 m height; their own obscured surfaces remain photographic follow-ups. The family disables window openings and surrounds explicitly, rather than shrinking window ratios until antialiasing creates false bands on curved surfaces.

Pipe ways 867311172, 867311173, 1396528010 and 1556647490 retain their actual routes and original location/layer/substance tags. Routes can extend beyond the site that associates them with the station; source geometry is retained. The first two share actual OSM node/8084689601 at (1028.5, 3019.9); coordinate proximity does not join independent source nodes. Shared numeric heights and attachment frames join the estimated parallel conduits at that vertex. Terrain sampling keeps the model clear of the ground; the minimum 7.5 m centreline parameter, two pipes, diameter, 14 m support interval and steel sections are estimates. These are physical pipe routes, distinct from the mapped electrical graph. Unreviewed routes remain data only, and explicitly underground routes are excluded from overhead models. Way/1396528010 has no source location tag; its bridge height uses the stated photographed-family estimate.

Bridge legs have ground-level collision; overhead conduit collision leaves walking space below. Tank footprints and pipe corridors reserve tree/canopy margins. Remaining photographic work includes exact per-route equipment allocation, hidden faces, all old hall/service identities, yard equipment and neighbouring/background buildings.

## Stepped main halls and northern block

The [MarSaf lake photograph dated 26 September 2020 (CC0)](https://commons.wikimedia.org/wiki/File:Казань._Вид_на_ТЭЦ-1_со_стороны_озера_Средний_Кабан.JPG) distinguishes the high western, middle and low eastern sections between the main stacks. Existing ways 96415222, 96415293 and 96415168 retain those individual footprints, estimated 45/36/24 m heights, raised roof light, horizontal glazing and the middle section's red/white/blue panel belt. Compare the June 2026 view for current paint. Roof-light rise, section heights, exact panel/door/vent counts and unexposed faces are estimates; the exterior match does not certify internal boiler/turbine function boundaries.

The northern production building way/96415424 beside the two smaller framed exhausts retains its own footprint, blue/white paint, stepped roof and an estimated 32 m overall height. Mapped ЗРУ 110 kV way/96415367 retains its original footprint and existing 11.7 m GBA height; its low blue/white electrical frontage uses the shared industrial family. Internal switchgear is a separate follow-up.

The 2020 view also shows a foreground rowing judges/finish tower: way/228482607 (mapped 18 m) is a candidate pending comparison with the rowing-centre designer's view. The red mansard fragment, low ABK/service fronts, emblem and hidden panels still require individual matching. Keep these neighbouring buildings in the unfinished scene checklist.

## Actual network entries

Point-in-polygon inspection of the saved station grounds and the shared power graph verifies mapped line endpoints inside each existing campus:

| Station | Existing ground | Mapped line/cable entries |
| --- | --- | --- |
| ТЭЦ-1 | relation/15961248 | ways 96813749, 1204992604, 1552750798; 110 kV |
| ТЭЦ-2 | way/40438423 | ways 96986920, 96986928, 97453673, 97453699, 97728392, 390952618; mostly tagged 110 kV |
| ТЭЦ-3 | way/75871068 | ways 96986910, 96986913, 96986920, 96986929, 96986937, 96986947, 499921462, 499921463, plus buried 866789884/866789885; tagged 110/220 kV |

The existing substations include way/97453664 at ТЭЦ-2 and way/75871062 at ТЭЦ-3; ТЭЦ-1 retains ways 96415347/96415367/1396528011 and node/521355140. These actual route endpoints and shared support identities are already preserved by the power-line system. This demonstrates mapped entries into the station sites, not an invented generator-to-bus electrical diagram. Exact internal switchgear/bus routes and equipment identities remain source/photographic follow-ups.

First stack batch validation: 174 tests passed and production build passed. Native Chromium lake and close views were inspected; 54,024 vertices are finite and all 16 horizontal ray samples at different body levels hit continuous stack geometry. The broader station scene stays active.

ПГУ equipment batch validation: 174 tests passed and production build passed. Three native Chromium views were inspected after final paint refinement. All 117,780 hall/equipment vertices are finite; three horizontal tower-shell rays hit, a centre down ray reaches the basin through the open mouth, all 87,378 regional canopy crowns clear the cooling footprint, and no runtime errors occurred. Published heights are retained as 70 m for the tower and 60 m for the four exhausts; the hall stays a 38 m estimate.

Tank/pipe batch validation: all 174 tests and production build passed. Three native Chromium views were inspected. All 87,312 tank/pipe vertices are finite; 15 tank-body rays hit, two pipe-route roots share 86 actual junction vertices, the lowest conduit-to-terrain sample is 7.134 m, and all four centre-lane walking probes below the bridge have zero displacement. All 87,377 regional canopy crowns clear equipment and pipe margins. Runtime errors: zero. These checks validate this estimated model, not measured plant clearances.

Stepped-hall batch validation: all 174 tests and production build passed. Lake, roof and northern-block native Chromium views were inspected: all 11,028 hall vertices are finite and all 15 horizontal body rays hit; no runtime errors. Separate main roof levels remain 45/36/24 m estimates, north block 32 m estimate and ZRU 11.7 m GBA. Roof/vent details extend slightly above the primary envelopes; no surveyed hall dimensions are claimed.
