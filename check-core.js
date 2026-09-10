/* Check APP comparison rules. Shared by the browser worker and Node tests. */
(function (root) {
  "use strict";
  const MAX_ROWS = 50000;
  const ALIASES = {
    code: ["Kód dopravce", "Dopravce", "Carrier code", "Identifikátor zakázky"],
    order: ["Pořadí na trase", "Pořadí", "Pořadí v trase", "Pořadí zakázek"],
    place: ["Výdejní místo", "Startovní místo", "Start", "Místo", "Zastávka"],
    group: ["Skupina výdejních míst", "Skupina výdejních míst (id)", "Skupina výdejních míst - kód"],
  };
  const normalize = (value) => String(value ?? "").trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/[\s_]+/g, " ").replace(/[^0-9a-z ]/g, "").trim();

  function column(headers, key) {
    for (const alias of ALIASES[key]) {
      const target = normalize(alias);
      const exact = headers.findIndex((h) => normalize(h) === target);
      if (exact >= 0) return exact;
    }
    // Match descriptive headers, but never treat a lone generic word as a prefix.
    for (const alias of ALIASES[key].filter((a) => a.includes(" "))) {
      const target = normalize(alias);
      const match = headers.findIndex((h) => normalize(h).startsWith(target + " "));
      if (match >= 0) return match;
    }
    return -1;
  }

  function fromRows(rows, label = "Data") {
    if (rows.length > MAX_ROWS + 100) throw new Error(`${label}: maximum je ${MAX_ROWS.toLocaleString("cs-CZ")} řádků.`);
    const headerIndex = rows.slice(0, 100).findIndex((r) => column(r, "code") >= 0 && column(r, "order") >= 0);
    if (headerIndex < 0) throw new Error(`${label}: chybí sloupce Kód dopravce a/nebo Pořadí na trase. Vložte tabulku včetně záhlaví.`);
    const headers = rows[headerIndex];
    if (rows.length - headerIndex - 1 > MAX_ROWS) throw new Error(`${label}: maximum je ${MAX_ROWS} datových řádků.`);
    const codeIndex = column(headers, "code"), orderIndex = column(headers, "order");
    const records = [], ignored = [];
    for (const [index, row] of rows.slice(headerIndex + 1).entries()) {
      if (!row.some((v) => String(v ?? "").trim())) continue;
      const code = String(row[codeIndex] ?? "").trim().toUpperCase();
      if (!/^AB\d+$/.test(code)) { ignored.push(index); continue; }
      records.push({ code, order: String(row[orderIndex] ?? "").trim() });
    }
    if (!records.length) throw new Error(`${label}: nebyly nalezeny položky s kódem AB a číslicemi (např. AB1234).`);
    return { records, ignored: ignored.length, score: 5 + (column(headers, "place") >= 0 ? 2 : 0) + (column(headers, "group") >= 0 ? 1 : 0) };
  }

  function delimited(text, delimiter) {
    const rows = [], row = [];
    let cell = "", quoted = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"' && (quoted || !cell.length)) {
        if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = !quoted;
      } else if (!quoted && (c === delimiter || c === "\n" || c === "\r")) {
        row.push(cell); cell = "";
        if (c !== delimiter) {
          rows.push(row.splice(0));
          if (c === "\r" && text[i + 1] === "\n") i++;
          if (rows.length > MAX_ROWS + 100) throw new Error(`Maximum je ${MAX_ROWS} řádků.`);
        }
      } else cell += c;
    }
    if (quoted) throw new Error("V textu chybí uzavírací uvozovky.");
    row.push(cell); rows.push(row);
    return rows;
  }

  function fromText(text, label = "Vložená data") {
    text = text.replace(/^\uFEFF/, "").trim();
    if (!text) throw new Error(`${label}: vložte data nebo vyberte soubor.`);
    let lastError;
    for (const delimiter of ["\t", ";", "|", ","]) {
      try { return fromRows(delimited(text, delimiter), label); } catch (error) { lastError = error; }
    }
    // Original desktop export: group ID, group name, AB code, place, correction, order.
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    const records = [];
    let ignored = 0;
    for (const line of lines) {
      const tokens = line.trim().split(/\s+/);
      const index = tokens.findIndex((t) => /^AB\d+$/i.test(t));
      if (index < 0) { ignored++; continue; }
      if (index < 2 || tokens.length < index + 4 || !tokens.slice(-2).every((t) => /^-?\d+(?:[.,]\d+)?$/.test(t))) {
        throw new Error(`${label}: řádek s ${tokens[index]} nemá očekávaný formát. Použijte export CSV nebo tabulku se záhlavím.`);
      }
      records.push({ code: tokens[index].toUpperCase(), order: tokens.at(-1) });
    }
    if (records.length > MAX_ROWS) throw new Error(`Maximum je ${MAX_ROWS} řádků.`);
    if (!records.length) throw lastError;
    return { records, ignored, score: 5 };
  }

  function comparable(value) {
    const numeric = value.replace(/\s/g, "").replace(",", ".");
    return numeric && /^-?\d+(?:\.\d+)?$/.test(numeric) ? Number(numeric) : value;
  }

  function compare(expected, actual) {
    const group = (records) => {
      const map = new Map();
      for (const row of records) {
        if (!map.has(row.code)) map.set(row.code, []);
        map.get(row.code).push(row.order);
      }
      return map;
    };
    const left = group(expected.records), right = group(actual.records);
    const counts = { ok: 0, mismatch: 0, missing: 0, extra: 0, duplicate: 0 };
    const rows = [...new Set([...left.keys(), ...right.keys()])].map((code) => {
      const a = left.get(code) || [], b = right.get(code) || [];
      let status = "ok", detail = "Pořadí souhlasí.";
      if (a.length > 1 || b.length > 1) {
        status = "duplicate"; detail = `Kód se opakuje: Excel ${a.length}×, aplikace ${b.length}×. Zkontrolujte duplicity.`;
      } else if (!a.length) { status = "extra"; detail = "Řádek je jen v aplikaci."; }
      else if (!b.length) { status = "missing"; detail = "Řádek je jen v Excelu."; }
      else if (comparable(a[0]) !== comparable(b[0])) { status = "mismatch"; detail = "Pořadí na trase se liší."; }
      counts[status]++;
      return { code, expected: a.join(" / "), actual: b.join(" / "), status, detail };
    });
    return { rows, counts };
  }

  const labels = { ok: "OK", mismatch: "NESHODA", missing: "CHYBÍ V APLIKACI", extra: "NAVÍC V APLIKACI", duplicate: "DUPLICITA" };
  function toCSV(rows) {
    const escape = (value) => {
      let text = String(value ?? "");
      // Do not let imported cell values become Excel formulas in an exported report.
      if (/^[\s]*[=+\-@]/.test(text)) text = "'" + text;
      return '"' + text.replace(/"/g, '""') + '"';
    };
    return "\uFEFF" + [["Kód dopravce", "Pořadí Excel", "Pořadí aplikace", "Stav", "Rozdíly"],
      ...rows.map((r) => [r.code, r.expected, r.actual, labels[r.status], r.detail])]
      .map((row) => row.map(escape).join(";")).join("\r\n");
  }
  const api = { MAX_ROWS, fromRows, fromText, compare, toCSV, labels };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.CheckCore = api;
})(globalThis);
