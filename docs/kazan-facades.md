# Kazan facade process

The original Manhattan generator in `js/buildings.js` has a small material library (buff masonry, red brick, brownstone and several curtain walls), neighborhood/avenue weights, and a reproducible seed per block. It creates a plausible architectural distribution; it does not recover every real building's paint from photographs. Kazan keeps the procedural-material approach while using the imported footprints and recorded appearance evidence.

`tools/kazan-facades.mjs` assigns a family to every mapped apartment/residential/dormitory outline. The initial build covers 8,701 outlines and inherited parts. Photographic observations take precedence over single mapped colours. Otherwise explicit OSM colours are retained, material tags select a material family, and construction era provides a preliminary panel classification. A construction year alone never adds red inserts. Unidentified mineral facades retain a neutral fallback and `facadeConfidence: low`; these are not photographically verified colours.

`facadeProfiles` in `tools/data/kazan-building-observations.json` holds reusable white brick, red brick, white/red brick, panel, painted panel, plaster and parking families. Per-building observations select a family and override dimensions, colours or accent widths. A new reference normally needs data changes rather than another building-specific shader. `js/kazan-facades.js` draws metric brick joints, panel joints, distinct paint zones, plinths, balcony glazing, window frames and night lighting. It shares cached materials and adds no window geometry or photograph downloads at runtime.

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
