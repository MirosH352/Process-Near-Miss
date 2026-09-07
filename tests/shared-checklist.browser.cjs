const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { chromium } = require("playwright");

const server = spawn(process.env.PYTHON || "python", ["-u", "-c", [
  "import app, gc, json, sys, tempfile, threading",
  "from pathlib import Path",
  "with tempfile.TemporaryDirectory(dir='tests') as temp:",
  "    app.DB_PATH = Path(temp) / 'browser.sqlite3'",
  "    app.USE_POSTGRES = False",
  "    app.init_db()",
  "    for email in ('first@example.test', 'second@example.test'):",
  "        app.create_user(email, 'test-password')",
  "    server = app.ThreadingHTTPServer(('127.0.0.1', 0), app.AppHandler)",
  "    thread = threading.Thread(target=server.serve_forever, daemon=True)",
  "    thread.start()",
  "    print(json.dumps({'port': server.server_port}), flush=True)",
  "    sys.stdin.readline()",
  "    server.shutdown()",
  "    server.server_close()",
  "    thread.join()",
  "    gc.collect()",
].join("\n")], { cwd: path.resolve(__dirname, ".."), windowsHide: true });

server.stderr.pipe(process.stderr);
const apiPath = "**/api/checklists/incident-ved-docasne";
const firstItem = "#checklist-item-0-0 input";
const secondItem = "#checklist-item-0-1 input";
const errors = [];

async function waitForChecked(page, selector, checked) {
  await page.waitForFunction(({ selector, checked }) => {
    const input = document.querySelector(selector);
    return input && input.checked === checked && !input.disabled;
  }, { selector, checked }, { timeout: 15000 });
}

async function run() {
  const port = await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.once("exit", code => reject(new Error("Fixture exited: " + code)));
    server.stdout.once("data", data => resolve(JSON.parse(data.toString()).port));
  });
  const browser = await chromium.launch({ channel: process.env.BROWSER_CHANNEL || "msedge" });
  try {
    const contexts = await Promise.all([browser.newContext(), browser.newContext()]);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const [first, second] = pages;
    for (const [index, page] of pages.entries()) {
      page.on("pageerror", error => errors.push(error.message));
      await page.goto("http://127.0.0.1:" + port);
      await page.locator("#loginForm [name=email]").fill(index ? "second@example.test" : "first@example.test");
      await page.locator("#loginForm [name=password]").fill("test-password");
      await page.locator("#loginForm button[type=submit]").click();
      await page.locator("#openCrisisChecklist").click();
      await waitForChecked(page, firstItem, false);
      assert.equal(await page.locator("#checklistPageTitle").textContent(), "Krize CZTC1");
      assert.equal(await page.locator("#checklistPageDescription").isVisible(), false);
      assert.equal(await page.locator("#checklistSharing").isVisible(), true);
    }

    await first.locator(firstItem).check();
    await waitForChecked(second, firstItem, true);
    await second.locator(secondItem).check();
    await waitForChecked(first, secondItem, true);
    await first.reload();
    await waitForChecked(first, secondItem, true);
    console.log("OK: direct shortcut, two-user updates, polling and reload persistence.");

    // Delay an old poll until after a newer save has finished.
    let releasePoll;
    let pollStarted;
    const started = new Promise(resolve => { pollStarted = resolve; });
    const release = new Promise(resolve => { releasePoll = resolve; });
    let held = false;
    await first.route(apiPath, async route => {
      if (route.request().method() === "GET" && !held) {
        held = true;
        const response = await route.fetch();
        pollStarted();
        await release;
        await route.fulfill({ response });
      } else {
        await route.continue();
      }
    });
    await first.evaluate(() => window.dispatchEvent(new Event("online")));
    await started;
    await first.locator(firstItem).uncheck();
    await waitForChecked(first, firstItem, false);
    releasePoll();
    await first.unrouteAll({ behavior: "wait" });
    await waitForChecked(first, firstItem, false);
    await waitForChecked(second, firstItem, false);
    console.log("OK: a stale poll cannot undo a newer save.");

    await first.route(apiPath, route => route.abort());
    await first.locator(firstItem).click();
    await first.waitForFunction(() => document.querySelector("#checklistStatusText").textContent.includes("nepodařilo"));
    assert.equal(await first.locator(firstItem).isChecked(), false);
    assert.equal(await first.locator(firstItem).isDisabled(), true);
    await first.unrouteAll({ behavior: "wait" });
    await first.evaluate(() => window.dispatchEvent(new Event("online")));
    await waitForChecked(first, firstItem, false);
    console.log("OK: failed saves are not shown as completed and recover after reconnect.");

    await first.locator("#resetChecklistButton").click();
    assert.match(await first.locator("#confirmText").textContent(), /pro všechny/);
    await first.locator("#confirmAccept").click();
    await waitForChecked(second, secondItem, false);
    console.log("OK: reset is explicitly confirmed and shared.");

    await first.locator('[data-checklist-page="alzaboxy-a-trasy"]').click();
    await first.locator(firstItem).check();
    await second.locator('[data-checklist-page="alzaboxy-a-trasy"]').click();
    assert.equal(await second.locator(firstItem).isChecked(), false);
    assert.equal(await first.locator("#checklistSharing").isVisible(), false);
    assert.equal(await first.locator("#checklistPageDescription").isVisible(), true);
    console.log("OK: other checklists retain personal progress and descriptions.");

    await first.locator("#homeButton").click();
    for (const width of [1280, 900, 390]) {
      await first.setViewportSize({ width, height: 900 });
      assert.equal(await first.locator("#openCrisisChecklist").isVisible(), true);
      assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      await first.locator("#openCrisisChecklist").click();
      await waitForChecked(first, firstItem, false);
      assert.equal(await first.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      if (process.env.SCREENSHOT_DIR) {
        await first.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, "crisis-" + width + ".png"), fullPage: true });
      }
      await first.locator("#homeButton").click();
    }
    assert.deepEqual(errors, []);
    console.log("OK: desktop, tablet and mobile navigation; no browser errors.");
  } finally {
    await browser.close();
  }
}

run().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => server.stdin.end("\n"));
