const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Exercise the real application functions without bootstrapping a network session.
// These DOM doubles intentionally do not assert presentation or exact HTML structure.
function loadApp() {
  const nodes = new Map();
  function element(key = '') {
    if (nodes.has(key)) return nodes.get(key);
    const classes = new Set();
    const node = {
      dataset: {}, style: {}, value: '', hidden: false,
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, enabled) {
          const next = enabled === undefined ? !classes.has(name) : enabled;
          if (next) classes.add(name); else classes.delete(name);
          return next;
        },
      },
      addEventListener() {}, setAttribute() {}, removeAttribute() {},
      querySelector(selector) { return element(`${key} ${selector}`); },
      querySelectorAll() { return []; },
      appendChild() {}, append() {}, replaceChildren() {}, reset() {}, focus() {},
    };
    node.elements = new Proxy({}, { get: (_, field) => element(`${key}.${String(field)}`) });
    nodes.set(key, node);
    return node;
  }
  const storage = new Map();
  const requests = [];
  const browser = {
    location: new URL('http://localhost/?entry=42#home'),
    history: { replaceState(_state, _title, url) { browser.location = new URL(url); } },
    addEventListener() {}, setTimeout() {},
    CheckApp: { reset() {} },
  };
  const context = vm.createContext({
    URL, URLSearchParams, Intl, Date, console,
    document: {
      getElementById: element, querySelector: element, querySelectorAll() { return []; },
      createElement: element,
      addEventListener() {}, body: element('body'),
    },
    window: browser,
    localStorage: {
      getItem(key) { return storage.get(key) ?? null; },
      setItem(key, value) { storage.set(key, value); },
    },
    fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, status: 200, text: async () => '{"items":[]}' };
    },
  });
  const source = fs.readFileSync(path.join(__dirname, '../app.js'), 'utf8');
  assert.match(source, /^start\(\);\s*$/m, 'Application bootstrap must be recognizable for this harness.');
  vm.runInContext(source.replace(/^start\(\);\s*$/m, '') + `
    globalThis.contracts = {
      state, computeStats, getActiveIncidents, getVisibleItems, sortVisibleItems,
      nextStatus, setAppSection, getSectionFromHash, api, apiProtected,
      checklistStorageId, createDefaultChecklistState, loadChecklistState,
      saveChecklistState, getChecklistSections, getChecklistStats,
      getSelectedUserIds, openDetailFromUrl, setAvatarElement,
    };
  `, context, { filename: 'app.js' });
  return { ...context.contracts, context, browser, storage, requests, nodes };
}

const plain = value => JSON.parse(JSON.stringify(value));
const entry = (id, overrides = {}) => ({
  id, title: `Záznam ${id}`, description: '', entry_type: 'near_miss',
  severity: 'medium', status: 'new', area: 'Alzaboxy', area_label: 'Alzaboxy',
  created_at: '2026-09-01T10:00:00Z', updated_at: '2026-09-01T10:00:00Z',
  ...overrides,
});

test('dashboard totals include closed critical records and both terminal statuses', () => {
  const app = loadApp();
  const entries = [
    entry(1), entry(2, { status: 'in_progress', severity: 'incident' }),
    entry(3, { status: 'resolved' }), entry(4, { status: 'closed', severity: 'critical' }),
  ];
  assert.deepEqual(plain(app.computeStats(entries)), { total: 4, open: 2, resolved: 2, critical: 1 });
  assert.deepEqual(plain(app.computeStats([])), { total: 0, open: 0, resolved: 0, critical: 0 });
});

test('active incidents exclude terminal statuses and sort by priority then latest update', () => {
  const app = loadApp();
  const entries = [
    entry(1, { severity: 'incident', updated_at: '2026-09-10T10:00:00Z' }),
    entry(2, { severity: 'critical', updated_at: '2026-09-02T10:00:00Z' }),
    entry(3, { severity: 'critical', status: 'in_progress', updated_at: '2026-09-03T10:00:00Z' }),
    entry(4, { severity: 'critical', status: 'closed' }),
    entry(5, { severity: 'incident', status: 'resolved' }), entry(6, { severity: 'high' }),
  ];
  assert.deepEqual(plain(app.getActiveIncidents(entries).map(item => item.id)), [3, 2, 1]);
  assert.deepEqual(entries.map(item => item.id), [1, 2, 3, 4, 5, 6], 'Incident sorting must not reorder source data.');
});

test('search supports IDs, Czech labels, people and areas while filters combine', () => {
  const app = loadApp();
  app.state.items = [
    entry(42, { title: 'Chybějící AB', severity: 'critical', created_by_label: 'Miroslav Hilšer', problem_reporter_label: 'David Hejhal', culprit_label: 'Tomáš Franc' }),
    entry(7, { title: 'Druhá událost', entry_type: 'bug', status: 'closed', area: 'Pobočky', area_label: 'Pobočky' }),
  ];
  for (const query of [' 42 ', 'CHYBĚJÍCÍ', 'hilšer', 'hejhal', 'franc', 'ALZABOXY', 'near miss', 'kritická', 'nový']) {
    app.state.search = query;
    assert.deepEqual(plain(app.getVisibleItems().map(item => item.id)), [42], query);
  }
  app.state.search = '';
  Object.assign(app.state.filters, { type: 'bug', priority: 'medium', status: 'closed' });
  assert.deepEqual(plain(app.getVisibleItems().map(item => item.id)), [7]);
  app.state.filters.status = 'new';
  assert.equal(app.getVisibleItems().length, 0);
});

test('table sorting respects severity/status ordering and keeps original data intact', () => {
  const app = loadApp();
  const entries = [entry(1, { severity: 'incident', status: 'closed' }), entry(2, { severity: 'critical', status: 'resolved' }), entry(3, { severity: 'low' })];
  app.state.sort = { key: 'severity', direction: 'desc' };
  assert.deepEqual(plain(app.sortVisibleItems(entries).map(item => item.id)), [2, 1, 3]);
  app.state.sort = { key: 'status', direction: 'asc' };
  assert.deepEqual(plain(app.sortVisibleItems(entries).map(item => item.id)), [3, 2, 1]);
  assert.deepEqual(entries.map(item => item.id), [1, 2, 3]);
  assert.deepEqual(['new', 'in_progress', 'resolved', 'closed'].map(app.nextStatus), ['in_progress', 'resolved', 'closed', 'new']);
});

test('area filter distinguishes an unfilled area and combines with text and type', () => {
  const app = loadApp();
  app.state.items = [entry(1, { area: null, area_label: 'Nevyplněno' }), entry(2), entry(3, { area: null, entry_type: 'bug' })];
  app.state.filters.area = '';
  app.state.filters.type = 'near_miss';
  assert.deepEqual(plain(app.getVisibleItems().map(item => item.id)), [1]);
  app.state.filters.type = 'all';
  app.state.filters.area = 'Alzaboxy';
  assert.deepEqual(plain(app.getVisibleItems().map(item => item.id)), [2]);
  app.state.search = 'absent record';
  assert.equal(app.getVisibleItems().length, 0);
});

test('admin navigation remains role gated and route changes preserve entry links', () => {
  const app = loadApp();
  app.state.user = { role: 'user' };
  app.setAppSection('admin');
  assert.equal(app.state.appSection, 'home');
  app.setAppSection('check-app');
  assert.equal(app.state.appSection, 'check-app');
  app.setAppSection('instalace');
  assert.equal(app.state.appSection, 'instalace');
  app.browser.location.hash = '#instalace';
  assert.equal(app.getSectionFromHash(), 'instalace');
  assert.equal(app.browser.location.searchParams.get('entry'), '42');
  app.state.user = { role: 'admin' };
  app.setAppSection('admin');
  assert.equal(app.state.appSection, 'admin');
  app.setAppSection('unknown');
  assert.equal(app.state.appSection, 'home');
});

test('entry deep links match numeric IDs against URL text', () => {
  const app = loadApp();
  let opened;
  app.context.captureDetail = item => { opened = item; };
  vm.runInContext('openDetailModal = captureDetail;', app.context);
  app.state.items = [entry(42)];
  assert.equal(app.openDetailFromUrl(), true);
  assert.equal(opened.id, 42);
});

test('API requests retain CSRF protection, credentials and meaningful failures', async () => {
  const app = loadApp();
  app.state.csrfToken = 'test-token';
  await app.api('/api/entries');
  await app.api('/api/entries/42', { method: 'PATCH', body: JSON.stringify({ status: 'resolved' }) });
  assert.equal(app.requests[0].options.credentials, 'same-origin');
  assert.equal(app.requests[0].options.headers['X-CSRF-Token'], undefined);
  assert.equal(app.requests[1].options.headers['X-CSRF-Token'], 'test-token');
  assert.equal(app.requests[1].options.headers['Content-Type'], 'application/json');
  let expired = false;
  app.context.expireSession = () => { expired = true; };
  vm.runInContext('handleSessionExpired = expireSession;', app.context);
  app.context.fetch = async () => ({ ok: false, status: 401, text: async () => '{"error":"Přihlášení vypršelo"}' });
  await assert.rejects(app.apiProtected('/api/entries'), error => error.status === 401 && error.message === 'Přihlášení vypršelo');
  assert.equal(expired, true);
});

test('checklist progress is isolated by user and page and ignores obsolete item IDs', () => {
  const app = loadApp();
  app.state.user = { email: 'one@example.test' };
  app.state.checklist = app.createDefaultChecklistState();
  const sections = app.getChecklistSections();
  const firstId = sections[0].items[0].id;
  app.state.checklist.items[firstId] = true;
  app.state.checklist.items.obsolete = true;
  app.saveChecklistState();
  assert.equal(app.getChecklistStats().completed, 1);
  assert.equal(app.loadChecklistState().items[firstId], true);
  assert.equal(app.loadChecklistState('drop-1-0').items[firstId], undefined);
  app.state.user.email = 'two@example.test';
  assert.equal(app.loadChecklistState().items[firstId], false);
  app.storage.set(app.checklistStorageId(), 'broken json');
  assert.equal(app.loadChecklistState().items[firstId], false);
});

test('bulk user selection only includes IDs from currently loaded accounts', () => {
  const app = loadApp();
  app.state.users = [{ id: 1 }, { id: 2 }];
  app.state.selectedUserIds = new Set([2, 999]);
  assert.deepEqual(plain(app.getSelectedUserIds()), [2]);
});

test('avatars render as images and fall back to the user icon without CSS URLs', () => {
  const app = loadApp();
  const avatar = app.nodes.get('.user-avatar');
  let child;
  avatar.replaceChildren = node => { child = node; };
  avatar.dataset.icon = 'user';

  app.setAvatarElement(avatar, 'data:image/png;base64,AA==');

  assert.equal(avatar.classList.contains('has-image'), true);
  assert.equal(avatar.style.backgroundImage, '');
  assert.equal(child.src, 'data:image/png;base64,AA==');
  assert.equal(child.alt, '');
  assert.equal(child.loading, 'lazy');

  app.setAvatarElement(avatar, null);
  assert.equal(avatar.classList.contains('has-image'), false);
  assert.equal(avatar.style.backgroundImage, '');
  assert.match(avatar.innerHTML, /svg/);
});
