# Existing Kazan power-station detail

The station sites already exist in the map. Detail their existing mapped bodies and equipment rather than replacing the mapped campuses. The active photographic work begins with Казанская ТЭЦ-1; ТЭЦ-2/3 follow in the same queue.

## ТЭЦ-1

Mapped campus relation/15961248 contains the two principal stack parents way/316538194 and way/316538197. Their red/white building parts retain paint-band starts at 0, 22, 44, 66, 87, 108 and 129 m. Generic fallback heights previously left short disconnected bands ending around 135/132.7 m. The [official historical description](https://kt.tatarstan.ru/opros.htm?pub_id=3378442) gives two reinforced-concrete stacks of 150 m. The model now uses that published height and a continuous tapered open-top shell with the mapped band colours and positions.

The [system-operator station photograph](https://www.so-ups.ru/fileadmin/_migrated/pics/kazan_tec-1.jpg) shows the striped stacks, service galleries, ladders and the grey/white generating halls from the lake. Stack diameters retain their mapped footprints; taper, lining/opening thickness, gallery levels/sections and ladder details remain procedural estimates. No capture date is inferred from the image URL.

The scene checklist `tec1-lakeside-power-station` in the appearance data remains unfinished. Match every visible hall and service volume to its footprint before declaring the view complete. The newer ПГУ equipment is described below; pipe bridges, circular tanks, old halls, low service buildings and the complete background still require individual photographic matching. Candidate existing boiler/turbine footprints are recorded as candidates, not silently certified as photographed identities.

## ТЭЦ-1 ПГУ and cooling equipment

The [Tatenergo press photographs published 25 June 2026](https://www.tatar-inform.ru/news/tvorcy-xudozniki-skulptory-energetiki-cetyre-zarisovki-o-pyati-elektrostanciyax-tatenergo-6031413) show the current blue/white hall palette, large hyperbolic cooling tower, four smaller striped exhausts and surrounding industrial equipment. The older system-operator photograph remains useful for geometry; its grey halls do not verify current paint. The composite aerial also shows circular tanks, pipe bridges and service/background buildings; those remain explicit scene follow-ups.

Existing hall way/1077147084 retains its L-shaped mapped footprint, blue/white panel groups, horizontal glazing, flat roof, plinth and access doors. Its 38 m height and all facade modules, door and roof details are visual estimates. The shared industrial panel family retains separate white, blue, glazing and plinth colours.

Mapped cooling tower way/949900444 uses its own footprint and the [builder's published BG-1600 height of 70 m](https://new.prioritetaward.ru/news/novosti_584.html). It has an open hyperbolic shell, red upper bands, exposed white lattice/hoops, base supports and basin. Neck profile, support count, band boundaries and section dimensions are estimates. Vegetation reserves the mapped footprint and crown margin; collision retains the open lower structure and shell interior.

Mapped exhaust nodes 8793821999, 8793822000, 8860763776 and 10968008992 use the [2023 station inventory's four 60 m stacks](https://fondsmena.ru/media/EGM_publicationfiles_Article/Сборник_ЭЭГМ_2023_том_2.pdf). Each keeps its mapped point; diameters, taper, service galleries, ladder and lattice-frame sections are estimates. Duplicate node/8793821998 points to the existing northern main stack and creates no second body.

`tools/import-kazan-power-station-structures.py` stores 20 actual chimney/cooling records inside the three existing station grounds in `tools/data/kazan-power-station-structures.json`. Its extract SHA must match the city and power graph. Only reviewed models render; unknown heights and remaining station structures are retained without fabricating measured dimensions. The queue and appearance-data scene checklist remain open for the whole photographed station.

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
