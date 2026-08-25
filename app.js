const VIEW_MODE_KEY = "near-miss-tracker.viewMode";

const STATUS_OPTIONS = [
  ["new", "Nový"],
  ["in_progress", "V řešení"],
  ["resolved", "Vyřešeno"],
  ["closed", "Uzavřeno"],
];

const STATUS_META = {
  new: { label: "Nový", hint: "Nové záznamy, které čekají na zpracování." },
  in_progress: { label: "V řešení", hint: "Záznamy, na kterých se právě pracuje." },
  resolved: { label: "Vyřešeno", hint: "Případy uzavřené, ale stále dohledatelné." },
  closed: { label: "Uzavřeno", hint: "Uzavřené položky bez další akce." },
};

const TYPE_LABELS = {
  bug: "Chyba",
  near_miss: "Near Miss",
};

const PERSON_OPTIONS = [
  "Miroslav Hilšer",
  "David Hejhal",
  "Andrey Zhilstov",
  "Tomáš Franc",
  "Michael Gottwald",
  "Zelený mužíček",
];

const CHECKLIST_SECTIONS = [
  {
    title: "Před výjezdem",
    items: [
      {
        id: "route_plan",
        title: "Potvrdit trasu a pořadí zastávek",
        note: "Porovnej dnešní plán, pořadí bodů a časová okna.",
      },
      {
        id: "box_status",
        title: "Ověřit aktivní AlzaBoxy na trase",
        note: "Vyřaď boxy, které jsou mimo provoz, plné nebo nedostupné.",
      },
      {
        id: "capacity_check",
        title: "Zkontrolovat kapacitu a výměnu zásilek",
        note: "Zkontroluj objem zásilek a připravené doručení i vyzvednutí.",
      },
    ],
  },
  {
    title: "Na trase",
    items: [
      {
        id: "scan_before_departure",
        title: "Provést sken před odjezdem",
        note: "Ujisti se, že jsou všechny zásilky načtené do systému.",
      },
      {
        id: "navigation",
        title: "Mít připravenou navigaci a podklady",
        note: "Zkontroluj adresy, offline mapu a kontakty na dispečink.",
      },
      {
        id: "exceptions",
        title: "Zapsat výjimky okamžitě na místě",
        note: "U každého problému doplň důvod, čas a případně fotku.",
      },
      {
        id: "customer_contact",
        title: "Potvrdit kontakt při změně trasy",
        note: "Při zpoždění nebo odklonu informuj odpovědnou osobu.",
      },
    ],
  },
  {
    title: "Po návratu",
    items: [
      {
        id: "unresolved_shipments",
        title: "Předat nedoručené zásilky",
        note: "Nedoručené kusy předat na další směnu nebo do skladu.",
      },
      {
        id: "route_close",
        title: "Uzavřít trasu v systému",
        note: "Doplň stav, komentář a uzavři všechny otevřené výjimky.",
      },
      {
        id: "handover",
        title: "Předat souhrn o průběhu trasy",
        note: "Shrň odchylky, nedostupné boxy a doporučení pro další den.",
      },
    ],
  },
];

const CHECKLIST_STORAGE_KEY = "near-miss-tracker.checklist";

function createDefaultChecklistState() {
  const items = {};
  for (const section of CHECKLIST_SECTIONS) {
    for (const item of section.items) {
      items[item.id] = false;
    }
  }
  return {
    items,
    updatedAt: null,
  };
}

const SEVERITY_LABELS = {
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
  incident: "Incident",
  critical: "Kritická",
};

const DETAIL_ENTRY_QUERY_KEY = "entry";

const PLURAL_RULES = new Intl.PluralRules("cs-CZ");

const state = {
  user: null,
  csrfToken: null,
  needsBootstrap: false,
  items: [],
  users: [],
  search: "",
  checklist: createDefaultChecklistState(),
  filters: {
    status: "all",
    priority: "all",
    type: "all",
  },
  sort: {
    key: "created_at",
    direction: "desc",
  },
  viewMode: readViewMode(),
  appSection: "records",
  draggingEntryId: null,
  editingId: null,
  editingUserId: null,
  selectedUserIds: new Set(),
  detailItem: null,
  confirmResolver: null,
};

const authView = document.getElementById("authView");
const appView = document.getElementById("appView");
const bootstrapForm = document.getElementById("bootstrapForm");
const loginForm = document.getElementById("loginForm");
const bootstrapMessageEl = document.getElementById("bootstrapMessage");
const loginMessageEl = document.getElementById("loginMessage");
const currentUserEmailEl = document.getElementById("currentUserEmail");
const logoutButton = document.getElementById("logoutButton");
const passwordForm = document.getElementById("passwordForm");
const passwordMessageEl = document.getElementById("passwordMessage");
const userForm = document.getElementById("userForm");
const usersMessageEl = document.getElementById("usersMessage");
const usersTableBody = document.getElementById("usersTableBody");
const usersCountEl = document.getElementById("usersCount");
const usersSection = document.getElementById("usersSection");
const userEditModal = document.getElementById("userEditModal");
const userEditForm = document.getElementById("userEditForm");
const userEditMessageEl = document.getElementById("userEditMessage");
const usersSelectAllEl = document.getElementById("usersSelectAll");
const usersSelectedCountEl = document.getElementById("usersSelectedCount");
const bulkActivateUsersButton = document.getElementById("bulkActivateUsers");
const bulkDeactivateUsersButton = document.getElementById("bulkDeactivateUsers");
const form = document.getElementById("entryForm");
const createDrawer = document.getElementById("createDrawer");
const openDrawerButton = document.getElementById("openEntryDrawer");
const drawerCloseButtons = document.querySelectorAll("[data-close-entry-drawer]");
const boardCard = document.querySelector(".board-card");
const recordsSection = document.getElementById("recordsSection");
const boardEl = document.getElementById("board");
const emptyStateEl = document.getElementById("emptyState");
const tableEmptyStateEl = document.getElementById("tableEmptyState");
const messageEl = document.getElementById("formMessage");
const searchInput = document.getElementById("searchInput");
const statusFilterEl = document.getElementById("statusFilter");
const priorityFilterEl = document.getElementById("priorityFilter");
const typeFilterEl = document.getElementById("typeFilter");
const recordsToolbarCountEl = document.getElementById("recordsToolbarCount");
const recordsCountEl = document.getElementById("recordsCount");
const totalCountEl = document.getElementById("totalCount");
const openCountEl = document.getElementById("openCount");
const resolvedCountEl = document.getElementById("resolvedCount");
const criticalCountEl = document.getElementById("criticalCount");
const recordsTableBody = document.getElementById("recordsTableBody");
const editModal = document.getElementById("editModal");
const editForm = document.getElementById("editForm");
const editMessageEl = document.getElementById("editMessage");
const confirmModal = document.getElementById("confirmModal");
const confirmTextEl = document.getElementById("confirmText");
const confirmAcceptBtn = document.getElementById("confirmAccept");
const detailModal = document.getElementById("detailModal");
const detailTitleEl = document.getElementById("detailTitle");
const detailSubtitleEl = document.getElementById("detailSubtitle");
const detailBadgesEl = document.getElementById("detailBadges");
const detailIdEl = document.getElementById("detailId");
const detailTypeEl = document.getElementById("detailType");
const detailPriorityEl = document.getElementById("detailPriority");
const detailAreaEl = document.getElementById("detailArea");
const detailStatusEl = document.getElementById("detailStatus");
const detailProblemReporterEl = document.getElementById("detailProblemReporter");
const detailDescriptionEl = document.getElementById("detailDescription");
const detailCreatedAtEl = document.getElementById("detailCreatedAt");
const detailUpdatedAtEl = document.getElementById("detailUpdatedAt");
const detailHasDescriptionEl = document.getElementById("detailHasDescription");
const detailEditBtn = document.getElementById("detailEdit");
const appTabButtons = document.querySelectorAll(".app-tab-button");
const recordsPanel = document.getElementById("recordsPanel");
const checklistPanel = document.getElementById("checklistPanel");
const adminPanel = document.getElementById("adminPanel");
const checklistGroupsEl = document.getElementById("checklistGroups");
const checklistPercentEl = document.getElementById("checklistPercent");
const checklistCounterEl = document.getElementById("checklistCounter");
const checklistProgressBarEl = document.getElementById("checklistProgressBar");
const checklistStatusTextEl = document.getElementById("checklistStatusText");
const checklistUpdatedAtEl = document.getElementById("checklistUpdatedAt");
const resetChecklistButton = document.getElementById("resetChecklistButton");
const toastRegion = document.getElementById("toastRegion");
const viewButtons = document.querySelectorAll(".view-button");
const sortButtons = document.querySelectorAll(".sort-button");

const ICONS = {
  logo:
    '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="5" fill="currentColor" opacity="0.18"/><path d="M8 13.2 11.1 10l2.1 2.1L16.9 8.4" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 7.75h8.25" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" opacity="0.55"/></svg>',
  user:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 21a8 8 0 1 0-16 0"/><circle cx="12" cy="8" r="4"/></svg>',
  dashboard:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/></svg>',
  grid:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="13" width="7" height="7" rx="1.5"/><rect x="14" y="13" width="7" height="7" rx="1.5"/></svg>',
  columns:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="4" height="16" rx="1.5"/><rect x="10" y="4" width="4" height="16" rx="1.5"/><rect x="17" y="4" width="4" height="16" rx="1.5"/></svg>',
  table:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M9 4v16"/><path d="M15 4v16"/></svg>',
  alert:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.29 3.86 1.82 18a1.5 1.5 0 0 0 1.29 2.25h17.78A1.5 1.5 0 0 0 22.18 18L13.71 3.86a1.5 1.5 0 0 0-2.42 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>',
  check:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m9 12 2 2 4-4"/></svg>',
  search:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  edit:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m18 2 4 4-11 11H7v-4L18 2Z"/><path d="m14 6 4 4"/></svg>',
  trash:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4.5A1.5 1.5 0 0 1 9.5 3h5A1.5 1.5 0 0 1 16 4.5V6"/><path d="M6 6l1 14h10l1-14"/><path d="M10 11v5"/><path d="M14 11v5"/></svg>',
  move:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v18"/><path d="m8 7 4-4 4 4"/><path d="m8 17 4 4 4-4"/></svg>',
  plus:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 5v14"/><path d="M5 12h14"/></svg>',
};

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function api(path, options = {}) {
  const hasBody = options.body !== undefined && options.body !== null;
  const method = String(options.method || "GET").toUpperCase();
  const headers = {
    ...(hasBody ? { "Content-Type": "application/json" } : {}),
    ...(options.headers || {}),
  };
  if (!SAFE_METHODS.has(method) && state.csrfToken) {
    headers["X-CSRF-Token"] = state.csrfToken;
  }
  return fetch(path, {
    credentials: "same-origin",
    ...options,
    headers,
  }).then(async (response) => {
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
      const error = new Error(payload?.error || `Chyba HTTP ${response.status}`);
      error.status = response.status;
      error.payload = payload;
      throw error;
    }

    return payload;
  });
}

async function apiProtected(path, options = {}) {
  try {
    return await api(path, options);
  } catch (error) {
    if (error.status === 401) {
      handleSessionExpired();
    }
    throw error;
  }
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function checklistStorageId() {
  const email = state.user?.email || "guest";
  return `${CHECKLIST_STORAGE_KEY}.${email}`;
}

function loadChecklistState() {
  const defaults = createDefaultChecklistState();
  try {
    const raw = localStorage.getItem(checklistStorageId());
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    const items = { ...defaults.items, ...(parsed?.items || {}) };
    return {
      items,
      updatedAt: parsed?.updatedAt || null,
    };
  } catch {
    return defaults;
  }
}

function saveChecklistState() {
  try {
    localStorage.setItem(checklistStorageId(), JSON.stringify(state.checklist));
  } catch {
    // Ignore storage failures.
  }
}

function getChecklistStats() {
  const total = CHECKLIST_SECTIONS.reduce((count, section) => count + section.items.length, 0);
  const completed = CHECKLIST_SECTIONS.reduce(
    (count, section) => count + section.items.filter((item) => Boolean(state.checklist.items[item.id])).length,
    0
  );
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
  return {
    total,
    completed,
    remaining: total - completed,
    percent,
  };
}

function renderChecklist() {
  if (!checklistGroupsEl) return;

  const stats = getChecklistStats();
  checklistPercentEl.textContent = `${stats.percent} %`;
  checklistCounterEl.textContent = `${stats.completed} / ${stats.total} hotovo`;
  checklistProgressBarEl.style.width = `${stats.percent}%`;

  if (stats.total === 0) {
    checklistStatusTextEl.textContent = "Checklist zatím nemá žádné položky.";
  } else if (stats.remaining === 0) {
    checklistStatusTextEl.textContent = "Všechno je hotové. Trasa je připravená.";
  } else if (stats.remaining === 1) {
    checklistStatusTextEl.textContent = "Chybí už jen 1 bod ke splnění checklistu.";
  } else {
    checklistStatusTextEl.textContent = `Zbývá doplnit ${stats.remaining} bodů checklistu.`;
  }

  checklistUpdatedAtEl.textContent = state.checklist.updatedAt
    ? `Naposledy uloženo: ${formatDate(state.checklist.updatedAt)}`
    : "Ještě neuloženo";

  checklistGroupsEl.innerHTML = "";

  for (const section of CHECKLIST_SECTIONS) {
    const sectionNode = document.createElement("section");
    sectionNode.className = "checklist-group";

    const header = document.createElement("div");
    header.className = "checklist-group-head";
    const title = document.createElement("h3");
    title.textContent = section.title;
    const counter = document.createElement("span");
    const sectionCompleted = section.items.filter((item) => Boolean(state.checklist.items[item.id])).length;
    counter.textContent = `${sectionCompleted} / ${section.items.length}`;
    header.append(title, counter);
    sectionNode.appendChild(header);

    const list = document.createElement("div");
    list.className = "checklist-items";

    for (const item of section.items) {
      const checked = Boolean(state.checklist.items[item.id]);
      const label = document.createElement("label");
      label.className = "checklist-item";
      label.dataset.checked = checked ? "true" : "false";

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = checked;
      checkbox.setAttribute("aria-label", item.title);
      checkbox.addEventListener("change", () => {
        state.checklist.items[item.id] = checkbox.checked;
        state.checklist.updatedAt = new Date().toISOString();
        saveChecklistState();
        renderChecklist();
      });

      const content = document.createElement("div");
      content.className = "checklist-item-content";
      const itemTitle = document.createElement("strong");
      itemTitle.textContent = item.title;
      const itemNote = document.createElement("span");
      itemNote.textContent = item.note;
      content.append(itemTitle, itemNote);

      label.append(checkbox, content);
      list.appendChild(label);
    }

    sectionNode.appendChild(list);
    checklistGroupsEl.appendChild(sectionNode);
  }
}

function resetChecklist() {
  state.checklist = createDefaultChecklistState();
  saveChecklistState();
  renderChecklist();
}

function formatPerson(value) {
  return value || "Nevyplněno";
}

function populatePersonSelect(selectEl, value) {
  selectEl.innerHTML = "";
  const emptyOption = document.createElement("option");
  emptyOption.value = "";
  emptyOption.textContent = "Nevyplněno";
  selectEl.appendChild(emptyOption);

  for (const person of PERSON_OPTIONS) {
    const option = document.createElement("option");
    option.value = person;
    option.textContent = person;
    selectEl.appendChild(option);
  }

  selectEl.value = value || "";
}

function readViewMode() {
  try {
    const value = localStorage.getItem(VIEW_MODE_KEY);
    return ["split", "kanban", "table"].includes(value) ? value : "split";
  } catch {
    return "split";
  }
}

function writeViewMode(viewMode) {
  try {
    localStorage.setItem(VIEW_MODE_KEY, viewMode);
  } catch {
    // Ignore storage failures.
  }
}

function resetSearch() {
  state.search = "";
  if (searchInput) {
    searchInput.value = "";
  }
}

function syncBodyLock() {
  const editOpen = !editModal.classList.contains("hidden");
  const userEditOpen = !userEditModal.classList.contains("hidden");
  const confirmOpen = !confirmModal.classList.contains("hidden");
  const detailOpen = !detailModal.classList.contains("hidden");
  const drawerOpen = !createDrawer.classList.contains("hidden");
  document.body.classList.toggle("modal-open", editOpen || userEditOpen || confirmOpen || detailOpen || drawerOpen);
}

function setMessage(text, kind = "info") {
  messageEl.textContent = text;
  messageEl.dataset.kind = kind;
}

function setEditMessage(text, kind = "info") {
  editMessageEl.textContent = text;
  editMessageEl.dataset.kind = kind;
}

function setLoginMessage(text, kind = "info") {
  loginMessageEl.textContent = text;
  loginMessageEl.dataset.kind = kind;
}

function setBootstrapMessage(text, kind = "info") {
  bootstrapMessageEl.textContent = text;
  bootstrapMessageEl.dataset.kind = kind;
}

function setUsersMessage(text, kind = "info") {
  usersMessageEl.textContent = text;
  usersMessageEl.dataset.kind = kind;
}

function setUserEditMessage(text, kind = "info") {
  userEditMessageEl.textContent = text;
  userEditMessageEl.dataset.kind = kind;
}

function setPasswordMessage(text, kind = "info") {
  passwordMessageEl.textContent = text;
  passwordMessageEl.dataset.kind = kind;
}

function getSelectedUserIds() {
  return state.users.filter((user) => state.selectedUserIds.has(user.id)).map((user) => user.id);
}

function syncUserSelectionUI() {
  const selectedIds = getSelectedUserIds();
  const selectedCount = selectedIds.length;
  const totalCount = state.users.length;

  if (usersSelectedCountEl) {
    usersSelectedCountEl.textContent = `${selectedCount} vybraných`;
  }
  if (usersSelectAllEl) {
    usersSelectAllEl.checked = totalCount > 0 && selectedCount === totalCount;
    usersSelectAllEl.indeterminate = selectedCount > 0 && selectedCount < totalCount;
  }
  if (bulkActivateUsersButton) {
    bulkActivateUsersButton.disabled = selectedCount === 0;
  }
  if (bulkDeactivateUsersButton) {
    bulkDeactivateUsersButton.disabled = selectedCount === 0;
  }
}

function clearUserSelection() {
  state.selectedUserIds = new Set();
  syncUserSelectionUI();
}

function setUserSelection(userId, selected) {
  if (selected) {
    state.selectedUserIds.add(userId);
  } else {
    state.selectedUserIds.delete(userId);
  }
  syncUserSelectionUI();
}

function showToast(message, kind = "info") {
  if (!toastRegion || !message) return;
  const toast = document.createElement("div");
  toast.className = `toast toast-${kind}`;
  toast.textContent = message;
  toastRegion.appendChild(toast);
  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

function hydrateIcons(root = document) {
  root.querySelectorAll("[data-icon]").forEach((node) => {
    const icon = node.getAttribute("data-icon");
    node.innerHTML = ICONS[icon] || "";
  });
}

function shortId(id) {
  return String(id).slice(0, 8);
}

function priorityRank(severity) {
  return {
    low: 1,
    medium: 2,
    high: 3,
    incident: 4,
    critical: 5,
  }[severity] || 0;
}

function statusRank(status) {
  return STATUS_OPTIONS.findIndex(([value]) => value === status) + 1 || 0;
}

function matchesSearch(item, query) {
  if (!query) return true;
  const haystack = [
    item.id,
    item.title,
    item.description,
    item.created_by_label,
    item.area,
    item.area_label,
    item.problem_reporter_label,
    item.culprit_label,
    TYPE_LABELS[item.entry_type],
    SEVERITY_LABELS[item.severity],
    STATUS_META[item.status]?.label,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function matchesFilters(item) {
  if (state.filters.status !== "all" && item.status !== state.filters.status) return false;
  if (state.filters.priority !== "all" && item.severity !== state.filters.priority) return false;
  if (state.filters.type !== "all" && item.entry_type !== state.filters.type) return false;
  return true;
}

function getVisibleItems() {
  const query = state.search.trim().toLowerCase();
  return state.items.filter((item) => matchesSearch(item, query) && matchesFilters(item));
}

function compareItems(a, b, key) {
  if (key === "title") return a.title.localeCompare(b.title, "cs-CZ");
  if (key === "severity") return priorityRank(a.severity) - priorityRank(b.severity);
  if (key === "status") return statusRank(a.status) - statusRank(b.status);
  if (key === "created_at" || key === "updated_at") {
    return new Date(a[key]).getTime() - new Date(b[key]).getTime();
  }
  return 0;
}

function sortVisibleItems(items) {
  const factor = state.sort.direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => factor * compareItems(a, b, state.sort.key));
}

function formatCountLabel(count, forms) {
  const form = PLURAL_RULES.select(count);
  if (form === "one") return forms.one.replace("{count}", String(count));
  if (form === "few") return forms.few.replace("{count}", String(count));
  return forms.many.replace("{count}", String(count));
}

function formatResultsCount(count) {
  return formatCountLabel(count, {
    one: "{count} výsledek",
    few: "{count} výsledky",
    many: "{count} výsledků",
  });
}

function formatRecordCount(count) {
  return formatCountLabel(count, {
    one: "{count} záznam",
    few: "{count} záznamy",
    many: "{count} záznamů",
  });
}

function formatUserCount(count) {
  return formatCountLabel(count, {
    one: "{count} účet",
    few: "{count} účty",
    many: "{count} účtů",
  });
}

function computeStats(items) {
  const total = items.length;
  const open = items.filter((item) => ["new", "in_progress"].includes(item.status)).length;
  const resolved = items.filter((item) => ["resolved", "closed"].includes(item.status)).length;
  const critical = items.filter((item) => item.severity === "critical").length;
  return { total, open, resolved, critical };
}

function updateStats(items) {
  const stats = computeStats(items);
  totalCountEl.textContent = stats.total;
  openCountEl.textContent = stats.open;
  resolvedCountEl.textContent = stats.resolved;
  criticalCountEl.textContent = stats.critical;
}

function setViewMode(viewMode) {
  state.viewMode = viewMode;
  writeViewMode(viewMode);
  updateViewModeUI();
}

function updateViewModeUI() {
  viewButtons.forEach((button) => {
    const active = button.dataset.view === state.viewMode;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", active ? "true" : "false");
  });

  const showBoard = state.viewMode !== "table";
  const showTable = state.viewMode !== "kanban";
  boardCard.hidden = !showBoard;
  recordsSection.hidden = !showTable;
}

function updateSortIndicators() {
  sortButtons.forEach((button) => {
    const active = button.dataset.sortKey === state.sort.key;
    button.classList.toggle("active", active);
    button.setAttribute("aria-sort", active ? (state.sort.direction === "asc" ? "ascending" : "descending") : "none");
    const indicator = button.querySelector(".sort-indicator");
    if (!indicator) return;
    indicator.textContent = active ? (state.sort.direction === "asc" ? "↑" : "↓") : "↕";
  });
}

function nextStatus(status) {
  const index = STATUS_OPTIONS.findIndex(([value]) => value === status);
  if (index === -1) {
    return STATUS_OPTIONS[0][0];
  }
  return STATUS_OPTIONS[(index + 1) % STATUS_OPTIONS.length][0];
}

function closeEntryDrawer() {
  createDrawer.classList.add("hidden");
  createDrawer.setAttribute("aria-hidden", "true");
  setMessage("");
  syncBodyLock();
}

function openEntryDrawer() {
  createDrawer.classList.remove("hidden");
  createDrawer.setAttribute("aria-hidden", "false");
  setMessage("");
  syncBodyLock();
  window.setTimeout(() => form.elements.title.focus(), 0);
}

function closeEditModal() {
  state.editingId = null;
  editModal.classList.add("hidden");
  editModal.setAttribute("aria-hidden", "true");
  editForm.reset();
  setEditMessage("");
  syncBodyLock();
}

function openEditModal(item) {
  state.editingId = item.id;
  editForm.elements.title.value = item.title;
  editForm.elements.description.value = item.description || "";
  editForm.elements.entry_type.value = item.entry_type;
  editForm.elements.severity.value = item.severity;
  editForm.elements.area.value = item.area || "";
  populatePersonSelect(editForm.elements.problem_reporter, item.problem_reporter);
  populatePersonSelect(editForm.elements.culprit, item.culprit);
  editForm.elements.status.value = item.status;
  editModal.classList.remove("hidden");
  editModal.setAttribute("aria-hidden", "false");
  setEditMessage("");
  syncBodyLock();
  window.setTimeout(() => editForm.elements.title.focus(), 0);
}

function closeUserEditModal() {
  state.editingUserId = null;
  userEditModal.classList.add("hidden");
  userEditModal.setAttribute("aria-hidden", "true");
  userEditForm.reset();
  setUserEditMessage("");
  syncBodyLock();
}

function openUserEditModal(user) {
  state.editingUserId = user.id;
  userEditForm.elements.email.value = user.email;
  userEditForm.elements.role.value = user.role;
  userEditForm.elements.is_active.value = user.is_active ? "1" : "0";
  if (userEditForm.elements.new_password) {
    userEditForm.elements.new_password.value = "";
  }
  userEditModal.classList.remove("hidden");
  userEditModal.setAttribute("aria-hidden", "false");
  setUserEditMessage("");
  syncBodyLock();
  window.setTimeout(() => userEditForm.elements.email.focus(), 0);
}

function closeDetailModal() {
  state.detailItem = null;
  detailModal.classList.add("hidden");
  detailModal.setAttribute("aria-hidden", "true");
  syncBodyLock();
}

function openDetailModal(item) {
  state.detailItem = item;
  detailTitleEl.textContent = item.title;
  detailSubtitleEl.textContent = `${TYPE_LABELS[item.entry_type]} • ${STATUS_META[item.status].label} • Oblast: ${item.area_label} • Zadavatel: ${formatPerson(item.problem_reporter)}`;
  detailIdEl.textContent = item.id;
  detailTypeEl.textContent = TYPE_LABELS[item.entry_type];
  detailPriorityEl.textContent = SEVERITY_LABELS[item.severity];
  detailAreaEl.textContent = item.area_label;
  detailStatusEl.textContent = STATUS_META[item.status].label;
  detailProblemReporterEl.textContent = formatPerson(item.problem_reporter);
  detailDescriptionEl.textContent = item.description || "Bez popisu.";
  detailCreatedAtEl.textContent = formatDate(item.created_at);
  detailUpdatedAtEl.textContent = formatDate(item.updated_at);
  detailHasDescriptionEl.textContent = item.description?.trim() ? "Ano" : "Ne";
  detailBadgesEl.innerHTML = `
    <span class="badge type-badge">${TYPE_LABELS[item.entry_type]}</span>
    <span class="badge priority-badge priority-${item.severity}">Priorita ${SEVERITY_LABELS[item.severity]}</span>
    <span class="badge area-badge">${item.area_label}</span>
    <span class="badge status-badge status-${item.status}">${STATUS_META[item.status].label}</span>
  `;
  detailModal.classList.remove("hidden");
  detailModal.setAttribute("aria-hidden", "false");
  syncBodyLock();
  window.setTimeout(() => detailEditBtn.focus(), 0);
}

function openDetailFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const entryId = params.get(DETAIL_ENTRY_QUERY_KEY);
  if (!entryId) return false;

  const item = state.items.find((entry) => String(entry.id) === String(entryId));
  if (!item) return false;

  openDetailModal(item);
  return true;
}
function openConfirm(message, confirmLabel = "Potvrdit") {
  confirmTextEl.textContent = message;
  confirmAcceptBtn.textContent = confirmLabel;
  confirmModal.classList.remove("hidden");
  confirmModal.setAttribute("aria-hidden", "false");
  syncBodyLock();

  return new Promise((resolve) => {
    state.confirmResolver = resolve;
  });
}

function closeConfirm(result) {
  confirmModal.classList.add("hidden");
  confirmModal.setAttribute("aria-hidden", "true");
  confirmTextEl.textContent = "";
  if (state.confirmResolver) {
    const resolver = state.confirmResolver;
    state.confirmResolver = null;
    resolver(result);
  }
  syncBodyLock();
}

async function askConfirmation(message, confirmLabel = "Potvrdit") {
  return openConfirm(message, confirmLabel);
}

function handleSessionExpired() {
  state.user = null;
  state.csrfToken = null;
  state.items = [];
  state.users = [];
  state.checklist = createDefaultChecklistState();
  clearUserSelection();
  state.appSection = "records";
  closeEditModal();
  closeUserEditModal();
  resetSearch();
  currentUserEmailEl.textContent = "-";
  setPasswordMessage("");
  setUsersMessage("");
  appView.classList.add("hidden");
  authView.classList.remove("hidden");
  showLoginMode();
  setLoginMessage("Vaše session vypršela. Přihlas se znovu.", "error");
}

function showBootstrapMode() {
  bootstrapForm.classList.remove("hidden");
  loginForm.classList.add("hidden");
  setBootstrapMessage("");
  setLoginMessage("");
}

function showLoginMode() {
  loginForm.classList.remove("hidden");
  bootstrapForm.classList.add("hidden");
  setLoginMessage("");
  setBootstrapMessage("");
}

function updateRoleVisibility() {
  const isAdmin = state.user?.role === "admin";
  appTabButtons.forEach((button) => {
    if (button.dataset.appTab === "admin") {
      button.classList.toggle("hidden", !isAdmin);
    }
  });
  if (!isAdmin && state.appSection === "admin") {
    state.appSection = "records";
  }
  setAppSection(state.appSection);
}

function setAppSection(section) {
  const isAdmin = state.user?.role === "admin";
  const allowedSections = new Set(["records", "checklist"]);
  if (isAdmin) {
    allowedSections.add("admin");
  }
  state.appSection = allowedSections.has(section) ? section : "records";

  recordsPanel.classList.toggle("hidden", state.appSection !== "records");
  checklistPanel.classList.toggle("hidden", state.appSection !== "checklist");
  adminPanel.classList.toggle("hidden", state.appSection !== "admin");

  appTabButtons.forEach((button) => {
    const active = button.dataset.appTab === state.appSection;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
}

function renderAuthState() {
  authView.classList.toggle("hidden", false);
  appView.classList.toggle("hidden", true);
  state.appSection = "records";
  resetSearch();
  recordsPanel.classList.remove("hidden");
  checklistPanel.classList.add("hidden");
  adminPanel.classList.add("hidden");
  if (state.needsBootstrap) {
    showBootstrapMode();
  } else {
    showLoginMode();
  }
}

function enterApp(user, csrfToken = null) {
  state.user = user;
  if (csrfToken) {
    state.csrfToken = csrfToken;
  }
  currentUserEmailEl.textContent = user.email;
  state.checklist = loadChecklistState();
  authView.classList.add("hidden");
  appView.classList.remove("hidden");
  resetSearch();
  updateRoleVisibility();
  setAppSection(state.appSection);
  updateViewModeUI();
  renderChecklist();
  hydrateIcons();
}

function renderBoard(visibleItems) {
  boardEl.innerHTML = "";
  emptyStateEl.hidden = visibleItems.length > 0;

  for (const [status] of STATUS_OPTIONS) {
    const items = visibleItems.filter((item) => item.status === status);
    boardEl.appendChild(columnTemplate(status, items));
  }

  hydrateIcons(boardEl);
}

function renderTable(visibleItems) {
  const sorted = sortVisibleItems(visibleItems);
  recordsTableBody.innerHTML = "";
  tableEmptyStateEl.hidden = sorted.length > 0;
  recordsToolbarCountEl.textContent = formatResultsCount(sorted.length);
  recordsCountEl.textContent = formatRecordCount(sorted.length);
  updateSortIndicators();

  if (sorted.length === 0) {
    return;
  }

  for (const item of sorted) {
    recordsTableBody.appendChild(tableRowTemplate(item));
  }
}

function renderUsers() {
  usersTableBody.innerHTML = "";
  usersCountEl.textContent = formatUserCount(state.users.length);
  if (state.users.length === 0) {
    syncUserSelectionUI();
    return;
  }

  for (const user of state.users) {
    const row = document.createElement("tr");
    const selectCell = document.createElement("td");
    selectCell.className = "col-select";
    const selectCheckbox = document.createElement("input");
    selectCheckbox.className = "user-select-checkbox";
    selectCheckbox.type = "checkbox";
    selectCheckbox.setAttribute("aria-label", `Vybrat uživatele ${user.email}`);
    selectCheckbox.checked = state.selectedUserIds.has(user.id);
    selectCell.appendChild(selectCheckbox);

    const emailCell = document.createElement("td");
    emailCell.className = "col-title";
    const emailStrong = document.createElement("strong");
    emailStrong.textContent = user.email;
    emailCell.appendChild(emailStrong);

    const roleCell = document.createElement("td");
    roleCell.className = "col-type";
    const roleBadge = document.createElement("span");
    roleBadge.className = "badge type-badge";
    roleBadge.textContent = user.role_label || user.role;
    roleCell.appendChild(roleBadge);

    const activeCell = document.createElement("td");
    activeCell.className = "col-status";
    const activeBadge = document.createElement("span");
    activeBadge.className = `badge ${user.is_active ? "status-resolved" : "status-closed"}`;
    activeBadge.textContent = user.is_active ? "Ano" : "Ne";
    activeCell.appendChild(activeBadge);

    const createdCell = document.createElement("td");
    createdCell.className = "col-created";
    createdCell.textContent = formatDate(user.created_at);

    const updatedCell = document.createElement("td");
    updatedCell.className = "col-updated";
    updatedCell.textContent = formatDate(user.updated_at);

    const actionsCell = document.createElement("td");
    actionsCell.className = "col-actions";
    const actionsWrap = document.createElement("div");
    actionsWrap.className = "user-actions";
    const editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "icon-button secondary user-edit-button";
    editButton.dataset.userId = String(user.id);
    editButton.textContent = "Upravit";
    actionsWrap.appendChild(editButton);
    actionsCell.appendChild(actionsWrap);

    row.append(selectCell, emailCell, roleCell, activeCell, createdCell, updatedCell, actionsCell);

    selectCheckbox.addEventListener("change", () => {
      setUserSelection(user.id, selectCheckbox.checked);
    });

    editButton.addEventListener("click", () => {
      openUserEditModal(user);
    });

    usersTableBody.appendChild(row);
  }

  syncUserSelectionUI();
}

function render() {
  const visibleItems = getVisibleItems();
  updateStats(state.items);
  renderBoard(visibleItems);
  renderTable(visibleItems);
  renderChecklist();
  if (state.user?.role === "admin") {
    renderUsers();
  }
}

function bindEntryActions(container, item) {
  const moveButton = container.querySelector(".move-button");
  const editButton = container.querySelector(".edit-button");
  const deleteButton = container.querySelector(".delete-button");

  if (moveButton) {
    moveButton.addEventListener("click", async () => {
      try {
        const status = nextStatus(item.status);
        await apiProtected(`/api/entries/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        await loadAppData();
        setMessage(`Záznam přesunut do stavu "${STATUS_META[status].label}".`, "success");
      } catch (error) {
        if (error.status !== 401) {
          setMessage(error.message, "error");
        }
      }
    });
  }

  if (editButton) {
    editButton.addEventListener("click", () => {
      openEditModal(item);
    });
  }

  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      const confirmed = await askConfirmation(
        `Opravdu smazat záznam "${item.title}"? Tuto akci nelze vrátit zpět.`,
        "Smazat"
      );
      if (!confirmed) return;

      try {
        await apiProtected(`/api/entries/${item.id}`, { method: "DELETE" });
        if (state.editingId === item.id) closeEditModal();
        await loadAppData();
        setMessage("Záznam byl smazán.", "success");
      } catch (error) {
        if (error.status !== 401) {
          setMessage(error.message, "error");
        }
      }
    });
  }
}

function bindRecordOpen(container, item) {
  container.classList.add("record-openable");
  container.tabIndex = 0;
  container.setAttribute("role", "button");
  container.setAttribute("aria-label", `Zobrazit detail záznamu ${item.title}`);
  container.title = "Kliknutím otevřete detail";

  const openDetail = () => openDetailModal(item);

  container.addEventListener("click", (event) => {
    if (event.target.closest("button, a, input, select, textarea, label")) return;
    openDetail();
  });

  container.addEventListener("keydown", (event) => {
    if (event.target !== container) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openDetail();
    }
  });
}

function cardTemplate(item, columnStatus = item.status) {
  const article = document.createElement("article");
  article.className = `entry status-${item.status}`;
  article.draggable = true;
  article.dataset.id = item.id;

  const statusBadge = item.status === columnStatus ? "" : `<span class="badge status-badge status-${item.status}">${STATUS_META[item.status].label}</span>`;

  article.innerHTML = `
    <div class="entry-top">
      <div class="entry-title-wrap">
        <div class="badges">
          <span class="badge type-badge">${TYPE_LABELS[item.entry_type]}</span>
          <span class="badge priority-badge priority-${item.severity}">Priorita ${SEVERITY_LABELS[item.severity]}</span>
          <span class="badge area-badge">${item.area_label}</span>
          ${statusBadge}
        </div>
        <h3 class="entry-title"></h3>
      </div>
    </div>
    <p class="entry-description"></p>
    <div class="entry-meta">
      <span class="entry-meta-inline">Zadavatel: ${formatPerson(item.problem_reporter)}</span>
    </div>
    <div class="entry-footer">
      <div class="timestamps">
        <span class="created-at"></span>
        <span class="updated-at"></span>
      </div>
      <div class="entry-actions">
        <button class="icon-button secondary move-button" type="button" title="Přesunout záznam" aria-label="Přesunout záznam" data-icon="move"></button>
        <button class="icon-button secondary edit-button" type="button" title="Upravit záznam" aria-label="Upravit záznam" data-icon="edit"></button>
        <button class="icon-button danger delete-button" type="button" title="Smazat záznam" aria-label="Smazat záznam" data-icon="trash"></button>
      </div>
    </div>
  `;

  article.querySelector(".entry-title").textContent = item.title;
  article.querySelector(".entry-description").textContent = item.description || "Bez popisu.";
  article.querySelector(".entry-title").title = item.title;
  article.querySelector(".entry-description").title = item.description || "Bez popisu.";
  article.querySelector(".created-at").textContent = `Vytvořeno: ${formatDate(item.created_at)}`;
  article.querySelector(".updated-at").textContent = `Aktualizováno: ${formatDate(item.updated_at)}`;
  hydrateIcons(article);

  article.addEventListener("dragstart", (event) => {
    state.draggingEntryId = item.id;
    event.dataTransfer.setData("text/plain", item.id);
    event.dataTransfer.setData("text", item.id);
    event.dataTransfer.effectAllowed = "move";
    article.classList.add("dragging");
  });

  article.addEventListener("dragend", () => {
    state.draggingEntryId = null;
    article.classList.remove("dragging");
  });

  bindEntryActions(article, item);
  bindRecordOpen(article, item);

  return article;
}
function tableRowTemplate(item) {
  const row = document.createElement("tr");
  row.className = `record-row status-${item.status}`;
  row.dataset.id = item.id;
  row.innerHTML = `
    <td class="col-id"><span class="record-id"></span></td>
    <td class="col-title">
      <div class="record-title-wrap">
        <strong class="record-title"></strong>
        <span class="record-description"></span>
        <span class="record-meta"></span>
      </div>
    </td>
    <td class="col-type"><span class="badge type-badge">${TYPE_LABELS[item.entry_type]}</span></td>
    <td class="col-area"><span class="badge area-badge">${item.area_label}</span></td>
    <td class="col-priority"><span class="badge priority-badge priority-${item.severity}">Priorita ${SEVERITY_LABELS[item.severity]}</span></td>
    <td class="col-status"><span class="badge status-badge status-${item.status}">${STATUS_META[item.status].label}</span></td>
    <td class="col-created-by"><span class="placeholder-value"></span></td>
    <td class="col-created">${formatDate(item.created_at)}</td>
    <td class="col-updated">${formatDate(item.updated_at)}</td>
    <td class="col-actions">
      <div class="table-actions">
        <button class="icon-button secondary move-button" type="button" title="Přesunout záznam" aria-label="Přesunout záznam" data-icon="move"></button>
        <button class="icon-button secondary edit-button" type="button" title="Upravit záznam" aria-label="Upravit záznam" data-icon="edit"></button>
        <button class="icon-button danger delete-button" type="button" title="Smazat záznam" aria-label="Smazat záznam" data-icon="trash"></button>
      </div>
    </td>
  `;
  const idEl = row.querySelector(".record-id");
  const titleEl = row.querySelector(".record-title");
  const descriptionEl = row.querySelector(".record-description");
  const metaEl = row.querySelector(".record-meta");
  const createdByEl = row.querySelector(".placeholder-value");
  idEl.textContent = shortId(item.id);
  idEl.title = item.id;
  titleEl.textContent = item.title;
  titleEl.title = item.title;
  descriptionEl.textContent = item.description || "Bez popisu.";
  descriptionEl.title = item.description || "Bez popisu.";
  metaEl.textContent = `Zadavatel problému: ${formatPerson(item.problem_reporter)}`;
  createdByEl.textContent = item.created_by_label || "Systém";
  createdByEl.title = item.created_by_label || "Systém";
  hydrateIcons(row);
  bindEntryActions(row, item);
  bindRecordOpen(row, item);
  return row;
}

async function moveEntryToStatus(entryId, status, sourceLabel = "Stav přesunut") {
  const dragged = state.items.find((item) => String(item.id) === String(entryId));
  if (!dragged || dragged.status === status) return false;

  const previousStatus = dragged.status;
  dragged.status = status;
  dragged.updated_at = new Date().toISOString();
  render();
  showToast(`${dragged.title} přesunuto do ${STATUS_META[status].label}.`, "success");

  try {
    await apiProtected(`/api/entries/${entryId}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
    await loadAppData();
    setMessage(`${sourceLabel} do "${STATUS_META[status].label}".`, "success");
    return true;
  } catch (error) {
    dragged.status = previousStatus;
    dragged.updated_at = new Date().toISOString();
    render();
    showToast(error.message || "Přesun se nepodařil.", "error");
    if (error.status !== 401) {
      setMessage(error.message, "error");
    }
    return false;
  }
}

function columnTemplate(status, items) {
  const column = document.createElement("section");
  column.className = `kanban-column status-${status}`;
  column.dataset.status = status;

  column.innerHTML = `
    <header class="kanban-column-head">
      <div>
        <h3>${STATUS_META[status].label}</h3>
        <p>${STATUS_META[status].hint}</p>
      </div>
      <span class="kanban-count">${items.length}</span>
    </header>
    <div class="kanban-dropzone" data-dropzone="${status}"></div>
  `;

  const dropzone = column.querySelector(".kanban-dropzone");
  const activateDrop = (event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    column.classList.add("drag-over");
    dropzone.classList.add("drag-over");
  };
  const deactivateDrop = () => {
    column.classList.remove("drag-over");
    dropzone.classList.remove("drag-over");
  };

  const handleDrop = async (event) => {
    event.preventDefault();
    deactivateDrop();
    const id = event.dataTransfer.getData("text/plain") || event.dataTransfer.getData("text") || state.draggingEntryId;
    if (!id) return;
    await moveEntryToStatus(id, status);
  };

  dropzone.addEventListener("dragover", activateDrop);
  dropzone.addEventListener("dragenter", activateDrop);
  dropzone.addEventListener("dragleave", (event) => {
    if (!dropzone.contains(event.relatedTarget)) {
      deactivateDrop();
    }
  });
  dropzone.addEventListener("drop", handleDrop);

  column.addEventListener("dragover", activateDrop);
  column.addEventListener("dragenter", activateDrop);
  column.addEventListener("dragleave", (event) => {
    if (!column.contains(event.relatedTarget)) {
      deactivateDrop();
    }
  });
  column.addEventListener("drop", handleDrop);

  for (const item of items) {
    dropzone.appendChild(cardTemplate(item, status));
  }

  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "kanban-empty";
    empty.textContent = "V tomto stavu zatím nejsou žádné záznamy.";
    dropzone.appendChild(empty);
  }

  return column;
}

async function loadEntries() {
  const payload = await apiProtected("/api/entries");
  state.items = payload.items || [];
}

async function loadUsers() {
  const payload = await apiProtected("/api/users");
  state.users = payload.items || [];
}

async function loadAppData() {
  await loadEntries();
  if (state.user?.role === "admin") {
    await loadUsers();
  } else {
    state.users = [];
  }
  render();
  openDetailFromUrl();
}

async function bootstrapAuth() {
  const status = await api("/api/bootstrap/status");
  state.needsBootstrap = Boolean(status.needs_bootstrap);

  if (state.needsBootstrap) {
    authView.classList.remove("hidden");
    appView.classList.add("hidden");
    showBootstrapMode();
    return;
  }

  try {
    const payload = await api("/api/auth/me");
    enterApp(payload.user, payload.csrfToken);
    await loadAppData();
  } catch (error) {
    if (error.status === 401) {
      authView.classList.remove("hidden");
      appView.classList.add("hidden");
      showLoginMode();
      return;
    }
    throw error;
  }
}

bootstrapForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(bootstrapForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const submitButton = bootstrapForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    const response = await api("/api/bootstrap/admin", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.needsBootstrap = false;
    resetSearch();
    enterApp(response.user, response.csrfToken);
    await loadAppData();
    setBootstrapMessage("");
  } catch (error) {
    setBootstrapMessage(error.message, "error");
  } finally {
    bootstrapForm.querySelector("button[type='submit']").disabled = false;
  }
});

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(loginForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const submitButton = loginForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    const response = await api("/api/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    resetSearch();
    enterApp(response.user, response.csrfToken);
    await loadAppData();
    setLoginMessage("");
  } catch (error) {
    setLoginMessage(error.message, "error");
  } finally {
    loginForm.querySelector("button[type='submit']").disabled = false;
  }
});

logoutButton.addEventListener("click", async () => {
  try {
    await api("/api/auth/logout", { method: "POST" });
  } catch {
    // Logout should still clear the UI locally even if the session is already gone.
  }
  handleSessionExpired();
  setLoginMessage("Odhlášení proběhlo úspěšně.", "success");
});

appTabButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    if (button.classList.contains("hidden")) return;
    const target = button.dataset.appTab;
    if (target === "admin" && state.user?.role === "admin" && state.users.length === 0) {
      await loadUsers();
    }
    setAppSection(target);
    if (target === "admin") {
      renderUsers();
    }
  });
});

passwordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(passwordForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const submitButton = passwordForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    await apiProtected("/api/auth/change-password", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    passwordForm.reset();
    setPasswordMessage("Heslo bylo změněno.", "success");
  } catch (error) {
    if (error.status !== 401) {
      setPasswordMessage(error.message, "error");
    }
  } finally {
    passwordForm.querySelector("button[type='submit']").disabled = false;
  }
});

userForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(userForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const submitButton = userForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    await apiProtected("/api/users", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    userForm.reset();
    await loadUsers();
    renderUsers();
    setUsersMessage("Nový účet byl vytvořen.", "success");
  } catch (error) {
    if (error.status !== 401) {
      setUsersMessage(error.message, "error");
    }
  } finally {
    userForm.querySelector("button[type='submit']").disabled = false;
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const confirmed = await askConfirmation(
      `Uložit nový záznam "${String(payload.title || "").trim()}"?`,
      "Uložit"
    );
    if (!confirmed) return;

    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    await apiProtected("/api/entries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    form.elements.status.value = "new";
    form.elements.severity.value = "medium";
    closeEntryDrawer();
    await loadAppData();
    setMessage("Záznam byl uložen.", "success");
  } catch (error) {
    if (error.status !== 401) {
      setMessage(error.message, "error");
    }
  } finally {
    form.querySelector("button[type='submit']").disabled = false;
  }
});

editForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.editingId) {
    setEditMessage("Nebyl vybrán žádný záznam k úpravě.", "error");
    return;
  }

  const formData = new FormData(editForm);
  const payload = Object.fromEntries(formData.entries());

  try {
    const confirmed = await askConfirmation(
      `Uložit změny u záznamu "${String(payload.title || "").trim()}"?`,
      "Uložit"
    );
    if (!confirmed) return;

    const submitButton = editForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    await apiProtected(`/api/entries/${state.editingId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadAppData();
    closeEditModal();
    setMessage("Záznam byl upraven.", "success");
  } catch (error) {
    if (error.status !== 401) {
      setEditMessage(error.message, "error");
    }
  } finally {
    editForm.querySelector("button[type='submit']").disabled = false;
  }
});

openDrawerButton?.addEventListener("click", () => {
  openEntryDrawer();
});

drawerCloseButtons.forEach((button) => {
  button.addEventListener("click", () => {
    closeEntryDrawer();
  });
});

editModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-modal]")) {
    closeEditModal();
  }
});

userEditModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-user-modal]")) {
    closeUserEditModal();
  }
});

confirmModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-confirm-cancel]")) {
    closeConfirm(false);
  }
});

detailModal.addEventListener("click", (event) => {
  if (event.target.matches("[data-close-detail]")) {
    closeDetailModal();
  }
});


usersSelectAllEl?.addEventListener("change", () => {
  state.selectedUserIds = new Set(usersSelectAllEl.checked ? state.users.map((user) => user.id) : []);
  renderUsers();
});

async function runBulkUserStatusChange(isActive) {
  const selectedIds = getSelectedUserIds();
  if (selectedIds.length === 0) {
    setUsersMessage("Vyber alespoň jednoho uživatele.", "error");
    return;
  }

  const actionLabel = isActive ? "aktivovat" : "deaktivovat";
  const confirmed = await askConfirmation(
    `Opravdu ${actionLabel} ${selectedIds.length} vybraných uživatelů?`,
    "Potvrdit"
  );
  if (!confirmed) return;

  try {
    bulkActivateUsersButton.disabled = true;
    bulkDeactivateUsersButton.disabled = true;
    await apiProtected("/api/users/bulk-status", {
      method: "PATCH",
      body: JSON.stringify({ user_ids: selectedIds, is_active: isActive }),
    });
    clearUserSelection();
    await loadUsers();
    renderUsers();
    setUsersMessage(`Stav ${selectedIds.length} uživatelů byl upraven.`, "success");
  } catch (error) {
    if (error.status !== 401) {
      setUsersMessage(error.message, "error");
    }
  } finally {
    syncUserSelectionUI();
  }
}

bulkActivateUsersButton?.addEventListener("click", () => {
  runBulkUserStatusChange(true);
});

bulkDeactivateUsersButton?.addEventListener("click", () => {
  runBulkUserStatusChange(false);
});

userEditForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!state.editingUserId) {
    setUserEditMessage("Nebyl vybrán žádný uživatel k úpravě.", "error");
    return;
  }

  const formData = new FormData(userEditForm);
  const payload = Object.fromEntries(formData.entries());
  payload.is_active = payload.is_active === "1";
  payload.new_password = String(payload.new_password || "").trim();

  try {
    const confirmed = await askConfirmation(
      `Uložit změny pro uživatele "${String(payload.email || "").trim()}"?`,
      "Uložit"
    );
    if (!confirmed) return;

    const submitButton = userEditForm.querySelector("button[type='submit']");
    submitButton.disabled = true;
    await apiProtected(`/api/users/${state.editingUserId}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    await loadUsers();
    closeUserEditModal();
    renderUsers();
    setUsersMessage("Účet byl upraven.", "success");
  } catch (error) {
    if (error.status !== 401) {
      setUserEditMessage(error.message, "error");
    }
  } finally {
    userEditForm.querySelector("button[type='submit']").disabled = false;
  }
});

confirmAcceptBtn.addEventListener("click", () => {
  closeConfirm(true);
});

detailEditBtn.addEventListener("click", () => {
  if (!state.detailItem) return;
  const item = state.detailItem;
  closeDetailModal();
  openEditModal(item);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!confirmModal.classList.contains("hidden")) {
      closeConfirm(false);
    } else if (!detailModal.classList.contains("hidden")) {
      closeDetailModal();
    } else if (!userEditModal.classList.contains("hidden")) {
      closeUserEditModal();
    } else if (!editModal.classList.contains("hidden")) {
      closeEditModal();
    } else if (!createDrawer.classList.contains("hidden")) {
      closeEntryDrawer();
    }
  }
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

statusFilterEl.addEventListener("change", (event) => {
  state.filters.status = event.target.value;
  render();
});

priorityFilterEl.addEventListener("change", (event) => {
  state.filters.priority = event.target.value;
  render();
});

typeFilterEl.addEventListener("change", (event) => {
  state.filters.type = event.target.value;
  render();
});

viewButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setViewMode(button.dataset.view);
  });
});

sortButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const key = button.dataset.sortKey;
    if (state.sort.key === key) {
      state.sort.direction = state.sort.direction === "asc" ? "desc" : "asc";
    } else {
      state.sort.key = key;
      state.sort.direction = key === "title" || key === "status" ? "asc" : "desc";
    }
    render();
  });
});

resetChecklistButton?.addEventListener("click", async () => {
  const confirmed = await askConfirmation("Opravdu resetovat celý checklist?", "Resetovat");
  if (!confirmed) return;
  resetChecklist();
  showToast("Checklist byl vynulován.", "success");
});

async function start() {
  updateViewModeUI();
  updateSortIndicators();
  hydrateIcons();
  renderAuthState();
  try {
    await bootstrapAuth();
    if (state.user) {
      render();
    }
  } catch (error) {
    setLoginMessage(error.message, "error");
  }
}

start();

