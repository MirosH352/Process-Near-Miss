const { test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../check-core.js');
const table = (rows) => core.fromRows([['Kód dopravce', 'Pořadí na trase'], ...rows]);

test('numeric normalization, AB filtering, case, missing and extra codes', () => {
  const a = table([['ab001', '01'], ['AB2', '2,5'], ['AB3', 3], ['AB4', 4], ['OTHER', 8]]);
  const b = table([['AB001', 1], ['AB2', 2.5], ['AB3', 8], ['AB5', 9]]);
  assert.equal(a.ignored, 1);
  assert.deepEqual(core.compare(a, b).counts, { ok: 2, mismatch: 1, missing: 1, extra: 1, duplicate: 0 });
});
test('time corrections are ignored and aliases/diacritics are recognized', () => {
  const a = core.fromText('Identifikator zakazky;Poradi zakazek;Korekce casu\nAB1;1;0');
  const b = core.fromText('Carrier code\tPořadí\tKorekce času\nAB1\t1\t900');
  assert.equal(core.compare(a, b).counts.ok, 1);
});
test('quoted CSV, embedded delimiters, BOM and line breaks', () => {
  const data = core.fromText('\uFEFF"Kód dopravce";"Pořadí na trase";"Popis"\r\n"AB1";"2,5";"místo; s \"\"uvozovkou\"\"\na řádkem"');
  assert.deepEqual(data.records, [{ code: 'AB1', order: '2,5' }]);
});
test('desktop fixed-width export with and without header', () => {
  const line = '123 Praha trasa AB123 Výdejní místo Praha 0 7';
  assert.deepEqual(core.fromText('Záhlaví exportu\n' + line).records, [{ code: 'AB123', order: '7' }]);
  assert.equal(core.fromText(line).records.length, 1);
  assert.throws(() => core.fromText(line + '\n123 Praha AB124 Místo 0 špatně'), /AB124/);
});
test('duplicates never produce a misleading OK or a Cartesian explosion', () => {
  const a = table([['AB1', 1], ['AB1', 1]]);
  assert.deepEqual(core.compare(a, a).counts, { ok: 0, mismatch: 0, missing: 0, extra: 0, duplicate: 1 });
});
test('empty sources, missing columns, oversized data and non-AB data fail clearly', () => {
  assert.throws(() => core.fromText(''), /vložte data/);
  assert.throws(() => core.fromRows([['Kód dopravce'], ['AB1']]), /sloupce/);
  assert.throws(() => table([['OTHER', 1]]), /nebyly nalezeny/);
  assert.throws(() => core.fromRows(Array.from({ length: 50101 }, () => ['AB1', 1])), /maximum/);
});
test('CSV output quotes values and neutralizes spreadsheet formulas', () => {
  const csv = core.toCSV([{ code: 'AB1', expected: '=1+1', actual: '@SUM(A1)', status: 'mismatch', detail: 'uvozovka " a; oddělovač' }]);
  assert.ok(csv.startsWith('\uFEFF'));
  assert.ok(csv.includes('"\'=1+1"'));
  assert.ok(csv.includes('"\'@SUM(A1)"'));
  assert.ok(csv.includes('uvozovka "" a; oddělovač'));
});
test('header can follow introductory rows; leading zeroes in codes are preserved', () => {
  const data = core.fromRows([['Report'], [], ['Kód dopravce', 'Pořadí na trase'], ['AB001', 1]]);
  assert.equal(data.records[0].code, 'AB001');
});
