import assert from 'node:assert/strict';
import fs from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';

const payload = fs.readFileSync(new URL('../js/kazan-geodata.json.gz', import.meta.url));
const geography = JSON.parse(gunzipSync(payload)), dates = geography.buildingDates;
assert.ok(dates, 'Compile the shared building-date layer first');
assert.equal(dates.source.extract.sha256, geography.source.extract.sha256, 'Date evidence must use the same whole-city source');
const records = new Map(dates.records.map((r) => [r.reference, r]));
assert.equal(records.size, dates.records.length, 'Source identities must be unique even when they have several retained outlines');
const inheritance = new Map(dates.inheritedParts.map((r) => [r.reference, r.parent]));
const mapped = new Set(geography.buildings.map((b) => `${b.osmType}/${b.id}`));
for (const [ref, parent] of inheritance) assert.ok(mapped.has(ref) && mapped.has(parent), 'Only mapped parent/part relationships supply inherited dates');
if (process.argv[2]) {
  const reference = process.argv[2], parent = inheritance.get(reference), record = records.get(parent || reference) || records.get(reference);
  console.log(JSON.stringify({ reference, mapped: mapped.has(reference), inheritedFrom: parent,
    status: !mapped.has(reference) ? 'not-mapped' : !record?.construction.length ? 'unknown' : record.conflict ? 'conflicting' : record.construction.some((e) => e.precision !== 'unparsed') ? 'source-evidence' : 'unparsed', evidence: record || null }, null, 2));
} else {
  const report = { geography: createHash('sha256').update(payload).digest('hex').slice(0, 16), source: dates.source,
    recordCount: records.size, inheritedPartReferences: inheritance.size, coverage: dates.coverage,
    conflicts: dates.records.filter((r) => r.conflict),
    unparsed: dates.records.filter((r) => r.construction.some((e) => e.precision === 'unparsed')),
    note: dates.note };
  fs.writeFileSync(new URL('data/kazan-building-date-coverage.json', import.meta.url), JSON.stringify(report, null, 2) + '\n');
  function summary({ byKind, ...coverage }) { return coverage; }
  console.log(JSON.stringify({ geography: report.geography, records: records.size, inheritedParts: inheritance.size,
    regional: summary(dates.coverage.regional), municipal: summary(dates.coverage.municipal) }, null, 2));
}
