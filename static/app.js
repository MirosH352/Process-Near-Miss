const state = {
  items: [],
  search: "",
};

const form = document.getElementById("entryForm");
const entriesEl = document.getElementById("entries");
const emptyStateEl = document.getElementById("emptyState");
const messageEl = document.getElementById("formMessage");
const template = document.getElementById("entryTemplate");
const searchInput = document.getElementById("searchInput");
const totalCountEl = document.getElementById("totalCount");
const openCountEl = document.getElementById("openCount");
const resolvedCountEl = document.getElementById("resolvedCount");

const statusOptions = [
  ["new", "Nový"],
  ["in_progress", "V řešení"],
  ["resolved", "Vyřešeno"],
  ["closed", "Uzavřeno"],
];

const statusClassMap = {
  new: "status-new",
  in_progress: "status-in_progress",
  resolved: "status-resolved",
  closed: "status-closed",
};

const statusTextMap = Object.fromEntries(statusOptions);

const typeTextMap = {
  bug: "Chyba",
  near_miss: "Near miss",
};

const personOptions = [
  "Miroslav Hilšer",
  "David Hejhal",
  "Andrey Zhilstov",
  "Tomáš Franc",
  "Michael Gottwald",
  "Zelený mužíček",
];

const severityTextMap = {
  low: "Nízká",
  medium: "Střední",
  high: "Vysoká",
  critical: "Kritická",
};

function formatPerson(value) {
  return value || "Nevyplněno";
}

function formatDate(value) {
  const date = new Date(value);
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function setMessage(text, kind = "info") {
  messageEl.textContent = text;
  messageEl.dataset.kind = kind;
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
    ...options,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = payload?.error || `Chyba HTTP ${response.status}`;
    throw new Error(error);
  }

  return payload;
}

function computeStats(items) {
  const total = items.length;
  const open = items.filter((item) => ["new", "in_progress"].includes(item.status)).length;
  const resolved = items.filter((item) => ["resolved", "closed"].includes(item.status)).length;
  return { total, open, resolved };
}

function updateStats(items) {
  const stats = computeStats(items);
  totalCountEl.textContent = stats.total;
  openCountEl.textContent = stats.open;
  resolvedCountEl.textContent = stats.resolved;
}

function render() {
  const query = state.search.trim().toLowerCase();
  const filtered = state.items.filter((item) => {
    if (!query) return true;
    return [
      item.title,
      item.description,
      item.entry_type_label,
      item.severity_label,
      item.status_label,
      item.problem_reporter_label,
      item.culprit_label,
    ]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });

  entriesEl.innerHTML = "";
  emptyStateEl.hidden = filtered.length > 0;
  updateStats(state.items);

  for (const item of filtered) {
    const node = template.content.firstElementChild.cloneNode(true);
    node.dataset.id = item.id;
    node.classList.add(statusClassMap[item.status]);

    node.querySelector(".type-badge").textContent = item.entry_type_label;
    const severityBadge = node.querySelector(".severity-badge");
    severityBadge.textContent = item.severity_label;
    severityBadge.classList.add(`severity-${item.severity}`);

    node.querySelector(".entry-title").textContent = item.title;
    node.querySelector(".entry-description").textContent = item.description || "Bez popisu.";
    const meta = node.querySelector(".entry-meta");
    if (meta) {
      meta.querySelector(".problem-reporter").textContent = `Zadavatel problému: ${formatPerson(item.problem_reporter)}`;
    }
    node.querySelector(".created-at").textContent = `Vytvořeno: ${formatDate(item.created_at)}`;
    node.querySelector(".updated-at").textContent = `Aktualizováno: ${formatDate(item.updated_at)}`;

    const statusSelect = node.querySelector(".status-select");
    statusSelect.innerHTML = "";
    for (const [value, label] of statusOptions) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = label;
      statusSelect.appendChild(option);
    }
    statusSelect.value = item.status;
    statusSelect.addEventListener("change", async () => {
      try {
        statusSelect.disabled = true;
        await api(`/api/entries/${item.id}`, {
          method: "PATCH",
          body: JSON.stringify({ status: statusSelect.value }),
        });
        await loadEntries();
        setMessage("Stav záznamu byl uložen.", "success");
      } catch (error) {
        statusSelect.value = item.status;
        setMessage(error.message, "error");
      } finally {
        statusSelect.disabled = false;
      }
    });

    node.querySelector(".delete-button").addEventListener("click", async () => {
      if (!confirm(`Opravdu smazat záznam "${item.title}"?`)) return;
      try {
        await api(`/api/entries/${item.id}`, { method: "DELETE" });
        await loadEntries();
        setMessage("Záznam byl smazán.", "success");
      } catch (error) {
        setMessage(error.message, "error");
      }
    });

    entriesEl.appendChild(node);
  }
}

async function loadEntries() {
  const payload = await api("/api/entries");
  state.items = payload.items || [];
  render();
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(form);
  const payload = Object.fromEntries(formData.entries());

  try {
    const submitButton = form.querySelector("button[type='submit']");
    submitButton.disabled = true;
    await api("/api/entries", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    form.reset();
    form.elements.status.value = "new";
    form.elements.severity.value = "medium";
    await loadEntries();
    setMessage("Záznam byl uložen.", "success");
  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    form.querySelector("button[type='submit']").disabled = false;
  }
});

searchInput.addEventListener("input", (event) => {
  state.search = event.target.value;
  render();
});

loadEntries().catch((error) => setMessage(error.message, "error"));
