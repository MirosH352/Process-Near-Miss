/* Local-only Check APP UI. Spreadsheet parsing runs in a disposable worker. */
(function () {
  "use strict";
  const el = (id) => document.getElementById(id);
  const form = el("checkForm"), resultPanel = el("checkResults");
  let result = null, page = 0, worker = null, timer = null;
  const PAGE_SIZE = 100;
  function message(text, error = false) {
    el("checkMessage").textContent = text;
    el("checkMessage").classList.toggle("error", error);
  }
  function stop() {
    worker?.terminate(); worker = null;
    clearTimeout(timer); timer = null;
    el("checkCompare").disabled = false;
    el("checkCompare").textContent = "Porovnat pořadí";
    form.removeAttribute("aria-busy");
  }
  function invalidate() {
    stop(); result = null; page = 0;
    resultPanel.classList.add("hidden");
    el("checkResultRows").replaceChildren();
    el("checkStats").replaceChildren();
    el("checkExpectedInfo").textContent = "XLSX, XLS, CSV, TSV nebo TXT. List rozpoznáme automaticky.";
    el("checkActualInfo").textContent = "Podporujeme také textový výpis z původní Check APP.";
    message("");
  }
  function modeChanged() {
    const useFile = el("checkActualMode").value === "file";
    el("checkTextSource").classList.toggle("hidden", useFile);
    el("checkFileSource").classList.toggle("hidden", !useFile);
    el("checkActualFile").disabled = !useFile;
    el("checkActualFile").required = useFile;
    el("checkActualText").disabled = useFile;
    el("checkActualText").required = !useFile;
  }
  function reset() {
    invalidate(); form.reset(); modeChanged();
    el("checkFilter").value = "all"; el("checkSearch").value = "";
  }
  function renderRows() {
    if (!result) return;
    const filter = el("checkFilter").value, search = el("checkSearch").value.trim().toUpperCase();
    const rows = result.rows.filter((r) => r.code.includes(search) && (filter === "all" || (filter === "issues" ? r.status !== "ok" : r.status === "ok")));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    page = Math.min(page, pages - 1);
    const body = el("checkResultRows"); body.replaceChildren();
    for (const row of rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)) {
      const tr = document.createElement("tr");
      for (const value of [row.code, row.expected || "—", row.actual || "—", CheckCore.labels[row.status], row.detail]) {
        const td = document.createElement("td"); td.textContent = value; tr.append(td);
      }
      tr.children[3].className = `check-status check-status-${row.status}`;
      body.append(tr);
    }
    if (!rows.length) {
      const tr = document.createElement("tr"), td = document.createElement("td");
      td.colSpan = 5; td.textContent = "Žádné položky neodpovídají filtru."; tr.append(td); body.append(tr);
    }
    el("checkPageInfo").textContent = `${rows.length.toLocaleString("cs-CZ")} položek · strana ${page + 1} z ${pages}`;
    el("checkPrev").disabled = page === 0;
    el("checkNext").disabled = page >= pages - 1;
  }
  function showResults(payload) {
    result = payload.result;
    const problems = result.rows.length - result.counts.ok;
    el("checkResultTitle").textContent = problems ? `Položky ke kontrole: ${problems.toLocaleString("cs-CZ")}` : "Pořadí všech položek souhlasí";
    const stats = el("checkStats"); stats.replaceChildren();
    for (const [status, count] of Object.entries(result.counts)) {
      const box = document.createElement("div"), value = document.createElement("strong"), label = document.createElement("span");
      box.className = `check-stat check-status-${status}`;
      value.textContent = count.toLocaleString("cs-CZ"); label.textContent = CheckCore.labels[status]; box.append(value, label); stats.append(box);
    }
    payload.sources.forEach((source, i) => {
      el(i ? "checkActualInfo" : "checkExpectedInfo").textContent = `AB řádky: ${source.count.toLocaleString("cs-CZ")} · přeskočené řádky: ${source.ignored}${source.sheet ? ` · list: ${source.sheet}` : ""}`;
    });
    page = 0; el("checkFilter").value = "all"; el("checkSearch").value = "";
    resultPanel.classList.remove("hidden"); renderRows();
    message(`Porovnání dokončeno. Zkontrolováno ${result.rows.length.toLocaleString("cs-CZ")} AB kódů.`);
  }
  form.addEventListener("input", invalidate);
  form.addEventListener("change", invalidate);
  el("checkActualMode").addEventListener("change", modeChanged);
  el("checkReset").addEventListener("click", reset);
  form.addEventListener("submit", (event) => {
    event.preventDefault(); invalidate();
    const expectedFile = el("checkExpectedFile").files[0];
    const actualFile = el("checkActualFile").files[0];
    const useFile = el("checkActualMode").value === "file";
    if (!expectedFile || (useFile && !actualFile)) { message("Vyberte oba požadované soubory.", true); return; }
    if ([expectedFile, ...(useFile ? [actualFile] : [])].some((f) => f.size > 10 * 1024 * 1024)) {
      message("Maximum je 10 MB na soubor.", true); return;
    }
    if (!useFile && el("checkActualText").value.length > 10 * 1024 * 1024) {
      message("Vložený text je příliš velký (maximum 10 MB).", true); return;
    }
    try {
      worker = new Worker("/check-worker.js");
      el("checkCompare").disabled = true; el("checkCompare").textContent = "Porovnávám…"; form.setAttribute("aria-busy", "true");
      message("Načítám a porovnávám data…");
      worker.onmessage = ({ data }) => { stop(); if (data.error) message(data.error, true); else showResults(data); };
      worker.onerror = () => { stop(); message("Nástroj se nepodařilo spustit nebo přečíst soubor. Obnovte stránku a zkuste to znovu.", true); };
      timer = setTimeout(() => { stop(); message("Zpracování trvalo příliš dlouho. Zkuste menší soubor nebo export CSV.", true); }, 60000);
      worker.postMessage({ expected: { file: expectedFile }, actual: useFile ? { file: actualFile } : { text: el("checkActualText").value } });
    } catch { stop(); message("Prohlížeč nemohl spustit porovnání. Použijte aktuální prohlížeč Edge, Chrome nebo Firefox.", true); }
  });
  for (const id of ["checkFilter", "checkSearch"]) el(id).addEventListener("input", () => { page = 0; renderRows(); });
  el("checkPrev").addEventListener("click", () => { page--; renderRows(); });
  el("checkNext").addEventListener("click", () => { page++; renderRows(); });
  el("checkExport").addEventListener("click", () => {
    if (!result) return;
    const url = URL.createObjectURL(new Blob([CheckCore.toCSV(result.rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `check-app-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  window.CheckApp = { reset };
})();
