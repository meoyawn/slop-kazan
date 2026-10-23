# Kazan facade process

The original Manhattan generator in `js/buildings.js` has a small material library (buff masonry, red brick, brownstone and several curtain walls), neighborhood/avenue weights, and a reproducible seed per block. It creates a plausible architectural distribution; it does not recover every real building's paint from photographs. Kazan keeps the procedural-material approach while using the imported footprints and recorded appearance evidence.

`tools/kazan-facades.mjs` assigns a family to every mapped apartment/residential/dormitory outline. The initial build covers 8,701 outlines and inherited parts. Photographic observations take precedence over single mapped colours. Otherwise explicit OSM colours are retained, material tags select a material family, and construction era provides a preliminary panel classification. A construction year alone never adds red inserts. Unidentified mineral facades retain a neutral fallback and `facadeConfidence: low`; these are not photographically verified colours.

`facadeProfiles` in `tools/data/kazan-building-observations.json` holds reusable white brick, red brick, white/red brick, panel, painted panel, plaster and parking families. Per-building observations select a family and override dimensions, colours or accent widths. A new reference normally needs data changes rather than another building-specific shader. `js/kazan-facades.js` draws metric brick joints, panel joints, distinct paint zones, plinths, balcony glazing, window frames and night lighting. It shares cached materials and adds no window geometry or photograph downloads at runtime.

## Project groups along Sibgata Khakima

The three user-identified areas have separate families, with variants inside each area. `facadeCohorts` records membership by mapped project identity and street addresses. Distance, construction year and developer name alone never assign a finish. All members and mapped parts carry the cohort and reference into the compiled geography; inferred project-wide paint remains `facadeConfidence: inferred`. An individual photographic observation still wins, and explicit part glazing and mapped paint remain intact.

| Area | Reusable finish and evidence |
| --- | --- |
| West of Amirkhan | Bereg at Meridiannaya 1, 2, 4 and Musina 1: buff brick, dark balcony glazing and pale floor bands, anchored by [the completed Meridiannaya 1 photograph](https://photobuildings.com/photo/6475/). The pale panel/cladding group at Sibgata Khakima 3, 5, 5A and 7 has separate grey spandrels and balcony strips; [the street photograph](https://img.dmclk.ru/q80/65/6b/656b0787ee0ba06cc2a96df17a6bae10ec3f7f0a.jpg) resolves 3 and 7. Paint on 5/5A and exact Bereg sibling elevations remains inferred. The individually reviewed orange Magellan buildings keep their palette. |
| East of Amirkhan | The user's yellow/brown group at 31–43 and the adjoining Nigmatullina courtyard uses ochre render and brown vertical zones. [The register entry for 31](https://domscanner.ru/houses/respublika-tatarstan/kazan/ul-sibgata-hakima-cdd6053/31-06fbe72b/) identifies insulated render rather than exposed structural brick. Sovremennik at 40–52, 60 and Kozina 3A/3B/5/7 uses a related but distinct light-render variant: [the river view](https://domophoto.ru/photo/44836/) and [60's close view](https://domophoto.ru/photo/125769/) show grey spandrels, glazed balconies and yellow inserts restricted to the lower floors. |
| Kozina / Savin | [The completed 2025 photograph](https://domophoto.ru/photo/328501/) distinguishes Savin House's tall white sections from its lower brown wings, and neighbouring brown/white developments. Mapped part storeys select the House variants. Savin Family and Premier have separate brick/composite variants; [Premier's facade contractor](https://ronson-group.ru/obekty/zhk-savin-premier/) supplies close photographs of the arched windows and the brick/composite finish. They do not recolour UNO, Stolichny or the neighbouring hospital. |

The material system adds continuous window spandrels, height-limited paint bands and optional arched openings. Near and distant instances carry the same palette, spandrel width and paint-height range. All distant facade attributes remain interleaved in one buffer; no per-window geometry is added.

The first cohort pass addresses 93 building/part records. Source colours and dimensions are visual approximations. These scene checks remain open where the references do not resolve an identity or a current finish:

- [x] Bereg foreground and the neighbouring mapped Bereg family; Magellan's separate reviewed orange paint.
- [x] Sibgata Khakima 3 and adjacent 7; the 5/5A family is explicitly inferred.
- [x] Sovremennik foreground at 40, 42, 44, 46, 50, 52 and 60; the user-identified warm courtyard group uses a separate inferred family.
- [x] Savin House and mapped lower wings; Savin Family/Premier have independent shared variants.
- [ ] Refine the obscured rear faces and exact paint boundaries of the warm 31–43 courtyard group using closer photographs.
- [ ] Complete the other buildings in the wide river photographs: Ak Bars sports hall (`way/83289908`), the hospital (`way/856858879` and `856858878`), and the small distant buildings obscured behind the foreground projects. The demolished old Riviera entertainment centre in the 2018 reference must not be rebuilt from that photograph.

Parts inherit a reviewed parent's appearance unless the part has its own reviewed observation or is explicitly glazed. The compiler subtracts ground-level mapped parts from the outline with polygon-clipping, retaining the uncovered main body. A small annex must not erase the rest of a building. Chetaeva 27A is the regression example: the nine-storey north arm remains beside its separately mapped five-storey east wing, with the same reviewed masonry family.

## Reference scenes

Each scene includes its surrounding buildings, in accordance with AGENTS.md. Distant material classifications remain provisional where the reference does not resolve the cladding.

| Scene | Mapped identities / current appearance |
| --- | --- |
| [Bakhetle exterior](https://www.rp.ru/project/2005/538/) and [day photograph](https://images.cdn-cian.ru/images/40/543/111/1113450477-6.jpg) | `way/80373334`: cylindrical blue-green glazing, silver panels, brown glazed bays and roof lantern. Yamasheva 69 (`80373324`): pale panels and dark red plinth; 71 (`144377106`) and 73 (`144377107`): pale/terracotta panels and balcony strips, reviewed in separate address photographs. Distant housing uses the citywide classification. |
| [Kishmish / Musina 29/2](https://kazan.ugosti.com/kishmish_2) and [street photograph](https://core-pht-proxy.maps.yandex.ru/v1/photos/download?photo_id=f_SSSUezaBxoOX2OAo4-Ow&image_size=XXXL) | `way/263308228`: the separate glazed Kishmish corner toward Yamasheva, with orange fascia, yellow signs and a shallow canopy. `way/129741570`: the adjoining low commercial row, including Samsa No. 1; its precise sign layout remains provisional. `way/83053308`: separate six-storey garage, white brick, narrow red bands, small ventilation windows and mapped rounded ends. Background apartment facades use the panel/mineral classification; exact paint remains provisional. |
| [Tandem contractor photograph](https://enkirf.com/projects/TRK-Tandem-g-Kazan.html) and [parking-side panorama](https://static.kinoafisha.info/k/malls/1920x1080/upload/malls/photos/115/02b8a9b074e79505c83123de70cedc53.jpg) | `way/58971260`, including its complete un-parted body: red/beige panels, ribbon glazing, striped base, central entry and roof sign, glazed stair tower with conical roof. The photograph's background apartment buildings use the citywide material classification. |
| Chetaeva 27A, 27 and Gymnasium 155 | `995160395` / `83289897`: white/red brick; `83289890`: pale mint panels, white balcony bands, ochre inserts; `83289956` / `329628169`: pale school panels and grey plinth. Photograph URLs are recorded on each observation. |
| Chistopolskaya pilot | 47 (`82960356`), 49 (`82960295`), 51 (`82960346`): reviewed grey/ochre panels, blue-green inserts and pale balcony strips. 53 (`83289849`) still needs a sufficiently clear separate reference; its present facade is inferred, not marked reviewed. |

Envelope dimensions of the three commercial landmarks are estimates from photographs and mapped footprints. Signage reflects the recognisable building names; Bakhetle's present supermarket anchor is Eurospar. These models are not architectural surveys. Reference photographs are linked for traceability; their image files are not distributed in the game.

## Repeated schools

`tools/kazan-building-typologies.mjs` compares the physical dimensions and a normalized occupancy mask of each three/four-storey flat-roofed school with Gymnasium 155. Rotation and reflection are allowed; construction year is not a match criterion. The shared classroom facade has panel joints, larger school windows and a separate plinth. The initial template matches eight mapped schools: Gymnasium 155 and schools 143, 150, 161, 169, 171, Gymnasium 175 and Lyceum 149. Each sibling's entrance photographs were checked; blue-green, grey, ochre and modern blue-grey/gold paint are separate parameters. In particular the older pink image of Lyceum 149 is superseded by the clearer ochre/cream entrance and winter photographs.

The exact catalogue series is unverified. Geometry-based matches retain their reference identity and similarity score, while unreviewed paint remains marked inferred. A similar-sized historic school or a two-storey school does not inherit this family. School-specific photographs and OSM identities are recorded in the observation manifest.

## Small structures and the Musina correction

No missing-height rule assigns a kiosk facade. A retail-pavilion model requires an explicit kiosk tag or a reviewed typology. Four small outlines opposite Kishmish (`393313266`, `406564303`, `406564435`, `406564572`) were corrected after the user's local review: the former 12 m default is replaced by an estimated 3.5 m single storey, with a street-facing window, door frame, fascia and canopy. Tenant names are not invented.

For otherwise untyped small outlines below 160 m², missing height evidence now gives a low-rise estimate of 3.5–4 m rather than 12 m. These remain neutral `small-building` structures, not reviewed kiosks. Mapped height, mapped floors, reviewed height and available satellite estimates continue to take precedence; raised buildings and mapped parts are excluded from this area fallback. The actual four-storey neighbour and six-storey Musina garage keep their mapped heights.

Kishmish occupies the separate northern corner footprint `263308228`, toward Yamasheva. Its signs, wraparound glazing, canopy and arrival point belong to that building. Samsa No. 1 is immediately south in the adjoining shopping row `129741570`. The user's local correction, the exterior photograph and the two businesses' published positions distinguish these neighboring premises.
