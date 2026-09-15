const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const source = fs.readFileSync(path.join(root, "sql-filter-tool.js"), "utf8");
const staticSource = fs.readFileSync(path.join(root, "static", "sql-filter-tool.js"), "utf8");

test("SQL filter tool source is mirrored to static assets", () => {
  assert.equal(staticSource, source);
});

test("default SQL templates do not include markdown artifacts", () => {
  const templateLines = source
    .split(/\r?\n/)
    .filter((line) => /^\s+(paid|free):\s+"/.test(line));

  assert.ok(templateLines.length >= 4);
  for (const line of templateLines) {
    assert.doesNotMatch(line, /\*\*/);
    assert.doesNotMatch(line, /&#x20;/i);
  }
});

test("generated SQL is cleaned before list edits run", () => {
  assert.match(source, /cleanSql\(sql\)/);
  assert.match(source, /replace\(\/\\\*\\\*\/g,\s*""\)/);
  assert.match(source, /this\.addCodes\(this\.cleanSql\(this\.paidTemplate\.value\)/);
  assert.match(source, /this\.addCodes\(this\.cleanSql\(this\.freeTemplate\.value\)/);
});

test("semicolon product mode is present in the UI", () => {
  assert.match(source, /value="semicolon"/);
  assert.match(source, /Oddělení produktů středníkem/);
  assert.match(source, /parseSemicolonProducts\(raw\)/);
});

test("semicolon parser handles a pasted markdown table column", () => {
  const parseSemicolonProducts = (raw) => {
    const normalized = raw.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[^>]+>/g, " ");
    const products = [];
    const seen = new Set();

    normalized.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }

      const cells = trimmed.includes("|") ? trimmed.split("|") : trimmed.split(/[\t,;]+/);
      cells.forEach((cell) => {
        const compact = cell.trim().replace(/\s+/g, "");
        if (!compact || /^:?-{3,}:?$/.test(compact)) {
          return;
        }

        const value = compact.replace(/^'+|'+$/g, "");
        if (value && !seen.has(value)) {
          seen.add(value);
          products.push(value);
        }
      });
    });

    return products;
  };

  const pasted = [
    "| 624 |",
    "| --- |",
    "| 520 |",
    "| 407 |",
    "| 331 |",
    "| 647 |",
    "| 648 |",
    "| 649 |",
    "| 650 |",
    "| 651 |",
    "| 652 |",
    "| 322 |",
    "| 288 |",
    "| 863 |",
    "| 2524 |",
    "| 491 |",
    "| 3518 |",
    "| 3533 |",
    "| 3534 |",
    "| 520 |",
    "| 3534 |",
  ].join("\n");

  assert.equal(
    parseSemicolonProducts(pasted).join(";"),
    "624;520;407;331;647;648;649;650;651;652;322;288;863;2524;491;3518;3533;3534"
  );
});
