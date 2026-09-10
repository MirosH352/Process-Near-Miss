"use strict";
importScripts("/vendor/xlsx.full.min.js", "/check-core.js");

function readWorkbook(data, label) {
  const book = XLSX.read(data, { type: "array", sheetRows: CheckCore.MAX_ROWS + 101, cellHTML: false, cellFormula: false });
  let best = null;
  const failures = [];
  for (const name of book.SheetNames) {
    const sheet = book.Sheets[name];
    const range = XLSX.utils.decode_range(sheet["!fullref"] || sheet["!ref"] || "A1");
    if (range.e.r >= CheckCore.MAX_ROWS + 100 || range.e.c >= 200) {
      failures.push(`${name}: list přesahuje limit 50 000 řádků nebo 200 sloupců.`);
      continue;
    }
    try {
      const table = CheckCore.fromRows(XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true }), label);
      if (!best || table.score > best.score) best = { ...table, sheet: name };
    } catch (error) { failures.push(`${name}: ${error.message}`); }
  }
  if (!best) throw new Error(failures.join(" ").slice(0, 1200) || `${label}: soubor neobsahuje použitelný list.`);
  return best;
}

async function readSource(source, label) {
  if (source.text !== undefined) {
    if (source.text.length > 10 * 1024 * 1024) throw new Error(`${label}: vložený text je příliš velký (maximum 10 MB).`);
    return CheckCore.fromText(source.text, label);
  }
  const file = source.file;
  if (!file) throw new Error(`${label}: vyberte soubor.`);
  if (file.size > 10 * 1024 * 1024) throw new Error(`${label}: maximum je 10 MB na soubor.`);
  const data = await file.arrayBuffer();
  if (/\.xlsx?$/i.test(file.name)) return readWorkbook(data, label);
  if (!/\.(csv|tsv|txt)$/i.test(file.name)) throw new Error("Podporované soubory: XLSX, XLS, CSV, TSV a TXT.");
  let text;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(data); }
  catch { text = new TextDecoder("windows-1250").decode(data); }
  return CheckCore.fromText(text, label);
}

self.onmessage = async ({ data }) => {
  try {
    const expected = await readSource(data.expected, "Excel");
    const actual = await readSource(data.actual, "Aplikace");
    const result = CheckCore.compare(expected, actual);
    self.postMessage({ result, sources: [expected, actual].map((s) => ({ count: s.records.length, ignored: s.ignored, sheet: s.sheet })) });
  } catch (error) { self.postMessage({ error: error.message || "Soubor se nepodařilo přečíst." }); }
};
