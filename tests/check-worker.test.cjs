const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const XLSX = require('../vendor/xlsx.full.min.js');
const CheckCore = require('../check-core.js');
const context = vm.createContext({ XLSX, CheckCore, TextDecoder, self: {}, importScripts() {} });
vm.runInContext(fs.readFileSync(path.join(__dirname, '../check-worker.js'), 'utf8'), context);
function workbook(type = 'xlsx') {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['Poznámka'], ['Testovací sešit']]), 'Info');
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Kód dopravce', 'Výdejní místo', 'Skupina výdejních míst', 'Pořadí na trase'],
    ['AB1', 'Praha', 'Trasa 1', 1], ['AB2', 'Brno', 'Trasa 1', 2], ['AB3', 'Zlín', 'Trasa 1', 3],
    ['AB4', 'Plzeň', 'Trasa 1', 4], ['AB4', 'Plzeň', 'Trasa 1', 4], ['OTHER', 'Mimo kontrolu', '', 9],
  ]), 'Očekávaná data');
  return XLSX.write(book, { type: 'buffer', bookType: type });
}
for (const format of ['xlsx', 'xls']) test(`reads real ${format}, chooses matching sheet and keeps Czech names`, () => {
  const result = context.readWorkbook(workbook(format), 'Excel');
  assert.equal(result.sheet, 'Očekávaná data');
  assert.equal(result.records.length, 5);
  assert.equal(result.ignored, 1);
});
test('rejects invalid workbooks and over-wide sheets', () => {
  assert.throws(() => context.readWorkbook(Buffer.from('invalid'), 'Excel'), /sloupce|list/);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, { '!ref': 'A1:GS2', A1: { t: 's', v: 'Kód dopravce' } }, 'Too wide');
  assert.throws(() => context.readWorkbook(XLSX.write(book, { type: 'buffer' }), 'Excel'), /200 sloupců/);
});
test('reads Windows-1250 CSV without losing column matching', async () => {
  const text = 'Kód dopravce;Pořadí na trase\nAB1;1';
  const bytes = Uint8Array.from([...text].map(c => ({ ó: 0xF3, ř: 0xF8, í: 0xED })[c] ?? c.charCodeAt(0)));
  const result = await context.readSource({ file: { name: 'export.csv', size: bytes.length, arrayBuffer: async () => bytes.buffer } }, 'CSV');
  assert.equal(result.records[0].code, 'AB1');
});
test('worker reports readable errors and rejects oversized input', async () => {
  let message;
  context.self.postMessage = data => { message = data; };
  await context.self.onmessage({ data: { expected: { text: '' }, actual: { text: '' } } });
  assert.match(message.error, /vložte data/);
  await assert.rejects(context.readSource({ file: { size: 11 * 1024 * 1024 } }, 'Excel'), /10 MB/);
});
if (process.argv.includes('--fixtures')) {
  const dir = path.join(__dirname, '../.check-preview'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'expected.xlsx'), workbook());
  fs.writeFileSync(path.join(dir, 'expected.xls'), workbook('xls'));
  fs.writeFileSync(path.join(dir, 'actual.csv'), '\uFEFFKód dopravce;Pořadí na trase\r\nAB1;1\r\nAB2;9\r\nAB4;4\r\nAB5;5');
}
