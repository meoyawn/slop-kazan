# Shared construction-date layer

The whole-city OSM PBF already retains construction-date tags; another request per house is unnecessary. `tools/kazan-building-dates.mjs` compiles those tags into `GEO.buildingDates` for every mapped source identity with evidence. The regional snapshot is2026-10-21T00:47:51Z, SHA-256 `0cb842ad557815d185603525a3590ea506632b7b1089a9e05da32b4bc1832452`, ODbL-1.0 / © OpenStreetMap contributors. Bulk acquisition and housing-register candidates are catalogued in [kazan-data-sources.md](kazan-data-sources.md).

The shared layer is independent of a style generator. Stalinka, XIX-, XVIII- and XVII-century classifiers can consume the same records without network queries or per-frame work. A year identifies an era; it does not establish architectural style. The explicit1928/constructivism record for way/91856481 illustrates retained independent architectural evidence.

## Data contract

- `records` has one typed OSM identity per record, even when several mapped outer polygons share that identity. Construction evidence retains the original field/text, bounds, precision and mapped/approximate qualifier. Exact years, ISO month/day dates, bounded ranges, decades, centuries/thirds and before/after bounds remain distinct. Approximate years do not acquire a fabricated error interval.
- Construction, reconstruction and renovation remain separate. Shop/building opening dates are not imported as construction evidence. Contradictory construction fields are retained and flagged, rather than selecting whichever year fits a style.
- Only explicit mapped part/parent relationships supply `inheritedParts`. Nearby buildings, campus membership and shared properties do not inherit another building's date. Missing records mean unknown dates. Unparsed source text remains available for subsequent reconciliation.
- Coverage distinguishes rendered principal polygons from unique source identities, includes the municipal polygon's holes and reports uses separately. These are mapped records, not a cadastral or housing census. The municipal test uses the outline anchor, consistently with the existing source audits.

Rebuild and inspect:

```sh
aube run geodata
node tools/audit-kazan-building-dates.mjs
node tools/audit-kazan-building-dates.mjs way/91856481
```

The audit writes `tools/data/kazan-building-date-coverage.json`; an identity argument prints its mapped status, direct/inherited construction evidence or an explicit unknown/conflicting/unparsed result.

## Checked local coverage

| Measure | Municipal boundary | Regional map |
| --- | ---: | ---: |
| Principal mapped polygons |102,639|168,188|
| Unique principal source identities |102,434|167,981|
| With source construction-date evidence |19,153|33,329|
| With parsed, non-conflicting construction evidence |19,149|33,321|
| Without construction dates |83,281|134,652|
| Entirely unparsed source dates |4|8|
| Coarse or approximate parsed dates |11|11|
| Exact-year/day/month1932–1959 era candidates |1,337|1,420|
| Part identities inheriting a mapped parent's date |1,384|1,401|

There are33,349 regional metadata records including parts, alterations and style-only evidence. Among municipal apartment polygons,5,818 of6,167 retain a source date (about94.3% of mapped polygon records). Unknown dates are concentrated in other uses and unspecific building records; coverage of the entire city's physical building stock is not claimed. The earlier preliminary19,279/1,339 counts were polygon records; the final identity-based counts remove repeated multi-outer identities.

The eight regional unparsed values, including terse/malformed years, localized dates and nonstandard historical-century strings, remain listed in the audit. Additional bulk housing/heritage imports and address/position joins remain source follow-ups, with conflicts and provenance retained. No separate housing-register dump has been imported yet. The four municipal unparsed dates and missing identities must not become invented years.

All236 tests pass. Compiler-level cases exercise date precision/ambiguity, identity deduplication, municipal holes, mapped-part inheritance, opening/renovation separation and contradictory dates while preserving source geometry. The real-city comparison confirms that every pre-existing geography field is unchanged: only `buildingDates` is added. Compressed geography grows185,845 bytes. The release build passes; all5,851 prepared geometry/image descriptors are identical to the accepted engine release. Checked release: main-BgIvEFnO.js, geography0b5868952f2da9df, prepared input1182bafa50b3577d/world3762499499a4d7e5. Publication is pending. It does not itself render Stalinka or historical facades.

Implementation0851cd0 is committed and pushed. Publication is pending and checked alongside the Stalinka classifier/generator; continue without waiting for CI. Bulk-register coverage and nonstandard date strings remain explicit follow-ups.
