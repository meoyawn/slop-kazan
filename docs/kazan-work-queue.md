# Kazan reconstruction queue

Work on `feat/kazan-tatarstan`; pushing the fork deploys the preview. Preserve the shared Vite and Chromium instances.

## In progress

- Kishmish visibility correction: the cafe belongs at the Yamasheva end of the Musina shopping row. Move the cafe entrance and signage to that end and verify the street-level view; the row and rounded parking garage already exist.
- Kiosks and small retail pavilions: correct the false four-storey towers on Musina opposite Kishmish. Prefer mapped storeys/heights; classify small shops and kiosks separately from residential buildings, and audit inherited generic/satellite heights before applying a low-rise default citywide.
- Citywide road levels: preserve mapped connections, tunnels, ramps and turning loops; share the same road height between geometry, paint, vehicles and player movement. Check Millennium, Amirkhan/Yamasheva, Amirkhan/Chistopolskaya, the Amirkhan underpasses, Pobedy near Mega and the Nazarbayeva interchange. Do not implement each junction as a separate traffic exception.
- Distant rendering: retain facade colours, windows and roof materials on instanced buildings; restore the original sky-coloured aerial perspective while keeping the opposite Volga hills readable.
- School typologies: match the footprint and storeys of Gymnasium 155 against other mapped schools. Share facade construction rules, preserve school-specific paint and mark unverified matches as inferred.

## Requested, still to complete

- Construction sites as a system: distinguish planned height from the actual stage, with excavation, piles/pile-driving equipment and open structural frames. Correct the two future towers on the partly sandy, partly vegetated beach behind Tatneft Arena to the current piling stage reported by the user. Inspect the present construction at Chekhov Market as the second example. Buildings under construction must not render as completed apartment blocks.
- University campuses as a system: mapped pedestrian grounds, internal access restrictions, connected buildings and stairs on real terrain. Detail KFU's historic main building, second academic building (the “dvoika”), physics building, the library behind the second building and the hillside stairway. Research the “Skovorodka” university square and place its actual Lenin statue at the main-building exit. Also inspect KAI on Chetaeva. Public streets bordering a campus must keep their traffic.
- Four Kazanka crossings: Millennium, Kirov dam, Kremlin/Lenin dam and the third transport dam toward Kompressorny. Detail the actual structures and approaches.
- URAM: mapped outdoor bowls, pump tracks and courts under/by Millennium, plus the indoor centre. Use actual completed-building photographs and terrain-aware surfaces.
- Complete the colour pilot: Chistopolskaya 53, the historic SIZO-1 at Yapeyeva 16 and the modern SIZO-2 frontage. Preserve the already detailed surviving Makary Church.
- Continue scene-wide photographic review around the completed landmarks. Citywide inferred facade families are a first pass, not evidence that every background building's paint has been verified.

## Delivered foundations

- Regional map including Aviastroitelny, Novaya Tura/Zelenodolsk industrial site, Samosyrovo, the airport, M7, eastern hills and Verkhniy Uslon.
- FABDEM relief with native-resolution hill patches; repeatable landcover-driven vegetation.
- Citywide parking areas separate from ambient through traffic, with a bounded number of stationary vehicles.
- Facade families and partial-building body repair; reviewed commercial landmarks including Tandem, Bakhetle, Kishmish and the rounded Musina garage.
- Tatneft Arena, Park House, Riviera observation wheel, Magellan orange palette, TAIF helipad and surviving Makary Church exterior.
