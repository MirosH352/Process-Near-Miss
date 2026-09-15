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
