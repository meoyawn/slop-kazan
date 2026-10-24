# Kazan water and shoreline contact

The user requested that water meet its bank, starting at Чёрное озеро and applying citywide. Bottom relief and underwater detail are outside this task.

The old renderer placed all547 mapped water bodies at `y=0`, the approximate53 m reservoir datum. Source water way/96239630 in park way/40371211 (Чёрное озеро) instead has shoreline DEM samples around18–19 m above that datum. A low-resolution transparent hole in the terrain texture could not close this height difference.

`js/kazan-water.js` calculates one horizontal surface per mapped body. It samples the original DEM along the source shoreline at approximately30 m intervals, uses the median, and retains the reservoir datum when that estimate is within3 m of zero. Available numeric mapped elevations take precedence. The current source bodies have no mapped `ele`; all present levels are procedural estimates, not surveyed water levels. Чёрное озеро resolves to18.4 m above the scene datum. Keep seasonal levels, dams and uncertain source shorelines as explicit accuracy follow-ups.

The system cuts actual visible terrain at mapped water polygons, preserving islands. Every resulting shoreline vertex uses the same water level; ordinary terrain vertices retain their heights. It removes covered terrain faces and replaces the texture alpha cutout with an exact geometric edge. The same constrained facets drive ground paths, road ribbons and walking-height queries. Bridges keep their separate road grades. Coarse distant terrain follows the same rule. This changes shoreline contact without modelling a lake bottom or applying a named-lake patch.

Polygon operations are indexed into256 m cells and run during geometry preparation; changed facets and compact classification flags are cached. Existing spatial batching and one shared procedural water material remain in use. There are no new per-lake textures, lights or frame animations. Startup/FPS acceptance still requires an isolated native browser measurement; no60 FPS claim is made.

Verification:

- The real-data regression fails on the preceding configuration because Чёрное озеро remains on the reservoir zero plane. The fixed test raycasts bank facets and compares ground-road and walking heights at Чёрное озеро, Глубокое and Нижний Кабан.
- An independent geometric case preserves exact land/island area across a spatial-cell boundary, removes covered terrain and closes both island and outer shores.
- Full184-test suite and production build pass before remote integration. Implementation `d6e2e49` is pushed through `0706f50`, retaining remote facade-instance changes through `7e1a4df`; the integrated185-test suite and release `assets/main-Bgq7B95D.js` pass. Publication/native acceptance is pending.
- Actual production terrain constructor and railway ground-height sampler:444 detailed terrain sections,5,270,490 retained triangles from5,816,472 original triangles,3,406,991 vertices, zero invalid coordinates and82,297 cached shoreline facets.87 real-geometry rays across Чёрное озеро, Глубокое, Нижний Кабан, Малое Чуйково, Светлое and the reservoir, including available coarse terrain, have zero misses and at most0.032 m contact difference (the existing terrain offset is0.03 m).
- Native Chrome screenshot/Runtime commands currently fail or time out on the existing game tab. No browser/server restart or second game tab was used. Native appearance, movement, isolated startup/FPS and production-byte publication checks remain explicit follow-ups.
