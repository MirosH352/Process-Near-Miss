(() => {
  const banner = document.getElementById("alzaStatusBanner");
  const title = document.getElementById("alzaStatusTitle");
  const message = document.getElementById("alzaStatusMessage");
  const list = document.getElementById("alzaStatusServices");
  let timer = null;
  let controller = null;
  let generation = 0;
  function render(payload) {
    const services = payload.services || [];
    banner.classList.toggle("hidden", payload.available && services.length === 0);
    banner.classList.toggle("is-unavailable", !payload.available);
    title.textContent = payload.available ? "Alza eviduje aktivní incident" : "Stav služeb Alzy se nepodařilo ověřit";
    message.textContent = payload.available
      ? "Upozornění na všechny služby s aktivním problémem. Stav se kontroluje každou minutu."
      : "Aktuální stav ověřte na Alza Status.";
    if (!payload.available && payload.checkedAt) {
      message.textContent += ` Poslední úspěšná kontrola: ${new Date(payload.checkedAt).toLocaleString("cs-CZ")}. Níže je poslední známý stav.`;
    }
    list.replaceChildren();
    services.forEach((service) => {
      const row = document.createElement("li");
      row.textContent = `${service.name}${service.incidents.length ? `: ${service.incidents.join("; ")}` : " – aktivní problém"}`;
      list.appendChild(row);
    });
  }
  async function refresh(token) {
    if (document.hidden) {
      timer = setTimeout(() => refresh(token), 60000);
      return;
    }
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 12000);
    try {
      const response = await fetch("/api/alza-status", { credentials: "same-origin", cache: "no-store", signal: controller.signal });
      if (token !== generation) return;
      if (response.status === 401) { stop(); return; }
      if (!response.ok) throw new Error("Status unavailable");
      const payload = await response.json();
      if (token === generation) render(payload);
    } catch (error) {
      if (token === generation) {
        banner.classList.remove("hidden");
        banner.classList.add("is-unavailable");
        title.textContent = "Stav služeb Alzy se nepodařilo ověřit";
        message.textContent = "Aktuální stav ověřte na Alza Status. Případné uvedené incidenty jsou z poslední úspěšné kontroly.";
      }
    } finally {
      clearTimeout(timeout);
      if (token === generation) timer = setTimeout(() => refresh(token), 60000);
    }
  }
  function stop() {
    generation++;
    clearTimeout(timer);
    controller?.abort();
    banner.classList.add("hidden");
    list.replaceChildren();
  }
  window.AlzaStatus = { start() { stop(); refresh(generation); }, stop };
})();