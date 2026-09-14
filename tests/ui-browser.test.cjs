// Run only with tests/serve_check_preview.py (disposable database) on port 8011.
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const playwrightPath = process.env.PLAYWRIGHT_MODULE || path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const { chromium } = require(playwrightPath);
const XLSX = require('../vendor/xlsx.full.min.js');
const BASE = 'http://127.0.0.1:8011';
const PASSWORD = 'CheckPreview2026!';
const runId = `qa-${Date.now()}`;
const errors = [];
let browser;

async function login(page, email) {
  await page.goto(BASE);
  await page.locator('#loginForm').waitFor({ state: 'visible' });
  await page.locator('#loginForm [name=email]').fill(email);
  await page.locator('#loginForm [name=password]').fill(PASSWORD);
  await page.locator('#loginForm button[type=submit]').click();
  await page.locator('#recordsPanel').waitFor({ state: 'visible' });
  await page.waitForFunction(() => document.querySelector('#currentUserEmail').textContent !== '-');
}
async function confirm(page) {
  await page.locator('#confirmModal').waitFor({ state: 'visible' });
  await page.locator('#confirmAccept').click();
  await page.locator('#confirmModal').waitFor({ state: 'hidden' });
}
async function navigate(page, section) {
  await page.locator(`[data-app-tab="${section === 'home' ? 'records' : section}"]`).click();
  await page.locator(`#${section === 'home' ? 'records' : section === 'check-app' ? 'checkApp' : section}Panel`).waitFor({ state: 'visible' });
}
async function recordAction(page, id, action) {
  const row = page.locator(`#recordsTableBody tr[data-id="${id}"]`);
  await row.locator('.record-menu-trigger').click();
  await row.locator(`.${action}-button`).click();
}
async function newRecord(page, title, area, severity = 'medium') {
  await page.locator('#openEntryDrawer').click();
  await page.locator('#entryForm [name=title]').fill(title);
  await page.locator('#entryForm [name=description]').fill('Disposable browser regression test.');
  await page.locator('#entryForm [name=entry_type]').selectOption('near_miss');
  await page.locator('#entryForm [name=area]').selectOption(area);
  await page.locator('#entryForm [name=severity]').selectOption(severity);
  await page.locator('#entryForm button[type=submit]').click();
  await confirm(page);
  await page.locator('#createDrawer').waitFor({ state: 'hidden' });
  const row = page.locator('#recordsTableBody tr').filter({ has: page.locator('.record-title', { hasText: title }) });
  await row.waitFor({ state: 'attached' });
  return row.getAttribute('data-id');
}
async function step(name, action) {
  await action(); console.log(`PASS ${name}`);
}
function workbook() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Kód dopravce', 'Pořadí na trase'], ['AB1', 1], ['AB2', 2], ['AB3', 3],
  ]), 'Očekávaná data');
  return Buffer.from(XLSX.write(book, { type: 'buffer', bookType: 'xlsx' }));
}

(async () => {
  browser = await chromium.launch({ channel: 'msedge', headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, acceptDownloads: true });
  const page = await context.newPage();
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => errors.push(error.message));
  await step('admin login and dashboard', async () => {
    await login(page, 'preview@example.test');
    await page.locator('[data-app-tab=admin]').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#workspaceHeader').isVisible(), true);
  });
  let idA, idB;
  await step('create records and global KPI/active-incident counts', async () => {
    const totalBefore = Number(await page.locator('#totalCount').textContent());
    const activeBefore = Number(await page.locator('#activeIncidentCount').textContent());
    idA = await newRecord(page, `${runId} Alpha`, 'AlzaBoxy', 'critical');
    idB = await newRecord(page, `${runId} Beta`, 'Pobočky');
    await page.waitForFunction(total => Number(document.querySelector('#totalCount').textContent) === total, totalBefore + 2);
    assert.equal(Number(await page.locator('#activeIncidentCount').textContent()), activeBefore + 1);
  });
  await step('search, area, priority and status filters combine', async () => {
    await page.locator('#searchInput').fill(runId);
    await page.locator('#areaFilter').selectOption('AlzaBoxy');
    assert.equal(await page.locator('#recordsTableBody tr').count(), 1);
    await page.locator('#priorityFilter').selectOption('medium');
    assert.equal(await page.locator('#recordsTableBody tr').count(), 0);
    await page.locator('#priorityFilter').selectOption('all');
    await page.locator('#areaFilter').selectOption('all');
    await page.locator('#statusFilter').selectOption('closed');
    assert.equal(await page.locator('#recordsTableBody tr').count(), 0);
    await page.locator('#statusFilter').selectOption('all');
    assert.equal(await page.locator('#recordsTableBody tr').count(), 2);
  });
  await step('record menu moves and edits records with confirmation', async () => {
    await recordAction(page, idA, 'move');
    await page.locator(`#recordsTableBody tr[data-id="${idA}"] .status-in_progress`).waitFor();
    await recordAction(page, idA, 'edit');
    await page.locator('#editForm [name=title]').fill(`${runId} Edited`);
    await page.locator('#editForm [name=status]').selectOption('resolved');
    await page.locator('#editForm button[type=submit]').click();
    await confirm(page);
    await page.locator('#editModal').waitFor({ state: 'hidden' });
    await page.locator(`#recordsTableBody tr[data-id="${idA}"] .status-resolved`).waitFor();
    assert.match(await page.locator(`#recordsTableBody tr[data-id="${idA}"] .record-title`).textContent(), /Edited/);
  });
  await step('record detail keyboard access and URL deep link', async () => {
    await page.locator(`#recordsTableBody tr[data-id="${idA}"]`).focus();
    await page.keyboard.press('Enter');
    await page.locator('#detailModal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#detailTitle').textContent(), /Edited/);
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/?entry=${idB}#records`);
    await page.locator('#detailModal').waitFor({ state: 'visible' });
    assert.match(await page.locator('#detailTitle').textContent(), /Beta/);
    await page.keyboard.press('Escape');
    await page.goto(`${BASE}/#home`);
    await page.locator('#recordsPanel').waitFor({ state: 'visible' });
  });
  await step('board/table view preference survives reload', async () => {
    await page.locator('[data-view=table]').click();
    assert.equal(await page.locator('.board-card').isVisible(), false);
    await page.reload();
    await page.locator('#recordsSection').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.board-card').isVisible(), false);
    await page.locator('[data-view=split]').click();
    assert.equal(await page.locator('.board-card').isVisible(), true);
  });
  await step('checklist toggle persists and reset is confirmed', async () => {
    await navigate(page, 'checklist');
    const first = page.locator('#checklistGroups input[type=checkbox]').first();
    await first.check();
    await page.reload();
    await page.locator('#checklistPanel').waitFor({ state: 'visible' });
    assert.equal(await first.isChecked(), true);
    await page.locator('#resetChecklistButton').click();
    await confirm(page);
    assert.equal(await first.isChecked(), false);
  });
  const accountEmail = `${runId}@example.test`;
  await step('admin add-user drawer and edit/deactivate/reactivate account', async () => {
    await navigate(page, 'admin');
    await page.locator('#openUserDrawer').click();
    await page.locator('#userForm [name=email]').fill(accountEmail);
    await page.locator('#userForm [name=password]').fill(PASSWORD);
    await page.locator('#userForm [name=role]').selectOption('user');
    await page.locator('#userForm button[type=submit]').click();
    await page.locator('#userCreateDrawer').waitFor({ state: 'hidden' });
    let accountRow = page.locator('#usersTableBody tr').filter({ hasText: accountEmail });
    await accountRow.locator('.user-edit-button').click();
    await page.locator('#userEditForm [name=is_active]').selectOption('0');
    await page.locator('#userEditForm button[type=submit]').click();
    await confirm(page);
    await page.locator('#userEditModal').waitFor({ state: 'hidden' });
    assert.equal(await accountRow.locator('.col-status').textContent(), 'Ne');
    await accountRow.locator('input[type=checkbox]').check();
    await page.locator('#bulkActivateUsers').click();
    await confirm(page);
    await page.waitForFunction(email => [...document.querySelectorAll('#usersTableBody tr')].find(row => row.textContent.includes(email))?.querySelector('.col-status').textContent === 'Ano', accountEmail);
  });
  await step('Check APP real workbook worker, results, filters, CSV and invalidation', async () => {
    await navigate(page, 'check-app');
    await page.locator('#checkExpectedFile').setInputFiles({ name: 'expected.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook() });
    await page.locator('#checkActualText').fill('Kód dopravce;Pořadí na trase\nAB1;1\nAB2;9\nAB4;4');
    await page.locator('#checkCompare').click();
    await page.locator('#checkResults').waitFor({ state: 'visible' });
    assert.equal(await page.locator('#checkResultRows tr').count(), 4);
    await page.locator('#checkFilter').selectOption('issues');
    assert.equal(await page.locator('#checkResultRows tr').count(), 3);
    await page.locator('#checkSearch').fill('ab2');
    assert.equal(await page.locator('#checkResultRows tr').count(), 1);
    const downloadEvent = page.waitForEvent('download');
    await page.locator('#checkExport').click();
    const download = await downloadEvent;
    const csv = fs.readFileSync(await download.path(), 'utf8');
    for (const code of ['AB1', 'AB2', 'AB3', 'AB4']) assert.ok(csv.includes(code), 'Export contains whole report despite filters.');
    await page.locator('#checkActualText').fill('changed');
    assert.equal(await page.locator('#checkResults').isVisible(), false);
    await page.locator('#checkActualMode').selectOption('file');
    assert.equal(await page.locator('#checkActualText').isDisabled(), true);
    assert.equal(await page.locator('#checkActualFile').isEnabled(), true);
    await page.locator('#checkActualFile').setInputFiles({ name: 'actual.csv', mimeType: 'text/csv', buffer: Buffer.from('Kód dopravce;Pořadí na trase\nAB1;1\nAB2;2\nAB3;3') });
    await page.locator('#checkCompare').click();
    await page.locator('#checkResults').waitFor({ state: 'visible' });
    assert.match(await page.locator('#checkResultTitle').textContent(), /souhlasí/);
    await page.locator('#checkReset').click();
    assert.equal(await page.locator('#checkResults').isVisible(), false);
    assert.equal(await page.locator('#checkActualText').inputValue(), '');
  });
  await step('delete test records via confirmation', async () => {
    await navigate(page, 'home');
    for (const id of [idA, idB]) {
      await recordAction(page, id, 'delete');
      await confirm(page);
      await page.locator(`#recordsTableBody tr[data-id="${id}"]`).waitFor({ state: 'detached' });
    }
  });
  await step('standard user login, unavailable admin route and backend permissions', async () => {
    const readerContext = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
    const reader = await readerContext.newPage();
    reader.on('pageerror', error => errors.push(error.message));
    await login(reader, 'reader@example.test');
    assert.equal(await reader.locator('[data-app-tab=admin]').isVisible(), false);
    await reader.goto(`${BASE}/#admin`);
    await reader.locator('#recordsPanel').waitFor({ state: 'visible' });
    assert.equal(await reader.locator('#adminPanel').isVisible(), false);
    assert.equal((await reader.request.get(`${BASE}/api/users`)).status(), 403);
    await navigate(reader, 'check-app');
    assert.equal(await reader.locator('#checkForm').isVisible(), true);
    await readerContext.close();
  });
  assert.deepEqual(errors, [], 'No browser JavaScript errors during functional QA.');
  console.log('PASS no browser JavaScript errors');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { await browser?.close(); });
