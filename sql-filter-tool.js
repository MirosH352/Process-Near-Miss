class SqlFilterTool extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <link rel="stylesheet" href="./sql-filter-tool.css">

      <section class="sft-shell">
        <header class="sft-topbar">
          <div>
            <h2>Úprava SQL filtru pro službu zdarma</h2>
            <p class="sft-subtitle">Vlož produktové kódy, vyber skupinu a nástroj doplní nebo odebere hodnoty ve formátu <strong>'Produkt', 'další produkt'</strong>.</p>
          </div>
        </header>

        <section class="sft-guide" aria-labelledby="sft-console-guide-title">
          <div class="sft-guide-copy">
            <p class="sft-kicker">OBRÁZKOVÝ NÁVOD</p>
            <h3 id="sft-console-guide-title">Kde v konzoli nastavit filtr</h3>
            <p>Filtr na instalace se nastavuje v modulu <strong>Logistika - Administrace doprav</strong>, v záložce <strong>Dopravy a platby</strong> a podzáložce <strong>Nastavení služeb</strong>.</p>
            <ol class="sft-guide-steps">
              <li>Najdi dvojici služeb podle typu instalace.</li>
              <li>Otevři službu full price nebo hlavní placenou službu a vlož filtr placené služby.</li>
              <li>Otevři službu low price nebo testovací službu za 0 Kč a vlož filtr služby zdarma.</li>
              <li>Změny ulož a zkontroluj, že se v katalogovém filtru zobrazí správný začátek SQL.</li>
            </ol>
          </div>
          <figure class="sft-guide-image">
            <img src="./assets/console-service-filter.png" alt="Konzole Alza v modulu Logistika - Administrace doprav, záložka Dopravy a platby a Nastavení služeb se službami Vestavné spotřebiče full price a low price">
            <figcaption>Ukázka služeb v konzoli pro vestavné spotřebiče.</figcaption>
          </figure>
          <div class="sft-service-map" aria-label="Přehled služeb a filtrů">
            <article>
              <h4>Vestavné spotřebiče</h4>
              <dl>
                <div>
                  <dt>Vestavné spotřebiče full price</dt>
                  <dd>Vložit filtr začínající <code>([Segment 3] IN ...</code></dd>
                </div>
                <div>
                  <dt>Vestavné spotřebiče low price</dt>
                  <dd>Vložit filtr začínající <code>[Produkt] IN ...</code></dd>
                </div>
              </dl>
            </article>
            <article>
              <h4>Montáž TV na zeď</h4>
              <dl>
                <div>
                  <dt>TV na zeď</dt>
                  <dd>Vložit filtr začínající <code>([Segment 1] = 'Televize' ...</code></dd>
                </div>
                <div>
                  <dt>Test TV za 0,-</dt>
                  <dd>Vložit filtr začínající <code>[Produkt] IN ...</code></dd>
                </div>
              </dl>
            </article>
          </div>
        </section>

        <div class="sft-grid">
          <div class="sft-panel">
            <div class="sft-panel-header">
              <h3>Nastavení úpravy</h3>
            </div>
            <div class="sft-panel-body">
              <div class="sft-field">
                <div class="sft-field-title">Typ filtru</div>
                <div class="sft-segmented sft-segmented-filter-type" role="radiogroup" aria-label="Typ filtru">
                  <input type="radio" id="sft-type-appliances" name="sft-filter-type" value="appliances" checked>
                  <label for="sft-type-appliances">Vestavné spotřebiče</label>
                  <input type="radio" id="sft-type-tv" name="sft-filter-type" value="tv">
                  <label for="sft-type-tv">Televize</label>
                  <input type="radio" id="sft-type-semicolon" name="sft-filter-type" value="semicolon">
                  <label for="sft-type-semicolon">Oddělení produktů středníkem</label>
                </div>
              </div>

              <div class="sft-field" data-role="actionField">
                <div class="sft-field-title">Akce</div>
                <div class="sft-segmented" role="radiogroup" aria-label="Akce">
                  <input type="radio" id="sft-mode-add" name="sft-edit-mode" value="add" checked>
                  <label for="sft-mode-add">Přidat zdarma</label>
                  <input type="radio" id="sft-mode-remove" name="sft-edit-mode" value="remove">
                  <label for="sft-mode-remove">Odebrat zdarma</label>
                </div>
              </div>

              <div class="sft-field">
                <label for="sft-codes">Produktové kódy</label>
                <textarea id="sft-codes" spellcheck="false" placeholder="ABC123&#10;XYZ456&#10;Nebo: ABC123, XYZ456"></textarea>
                <div class="sft-hint" data-role="codesHint">Kódy můžou být na řádcích, oddělené čárkou, středníkem nebo mezerou. Apostrofy se doplní automaticky.</div>
              </div>

              <div class="sft-actions">
                <button class="sft-btn sft-btn-primary" data-action="run" type="button" data-role="runButton">Vygenerovat filtry</button>
                <button class="sft-btn sft-btn-secondary" data-action="clear" type="button">Vymazat kódy</button>
                <button class="sft-btn sft-btn-danger" data-action="reset" type="button" data-role="resetButton">Obnovit výchozí filtry</button>
              </div>
            </div>
          </div>

          <div class="sft-panel">
            <div class="sft-panel-header">
              <h3>Výstup</h3>
            </div>
            <div class="sft-panel-body sft-outputs">
              <div class="sft-status" data-role="status" aria-live="polite"></div>

              <div class="sft-output" data-role="paidOutputSection">
                <div class="sft-output-head">
                  <h4 data-role="paidOutputTitle">Filtr placené služby</h4>
                  <button class="sft-btn sft-btn-secondary" data-copy="paidOutput" type="button">Kopírovat</button>
                </div>
                <textarea data-role="paidOutput" readonly spellcheck="false"></textarea>
              </div>

              <div class="sft-output">
                <div class="sft-output-head">
                  <h4 data-role="freeOutputTitle">Filtr služby zdarma</h4>
                  <button class="sft-btn sft-btn-secondary" data-copy="freeOutput" type="button">Kopírovat</button>
                </div>
                <textarea data-role="freeOutput" readonly spellcheck="false"></textarea>
              </div>
            </div>

            <details data-role="templatesDetails">
              <summary>Výchozí filtry, které se upravují</summary>
              <div class="sft-template-grid">
                <div class="sft-field">
                  <label for="sft-paid-template">Placená služba</label>
                  <textarea id="sft-paid-template" data-role="paidTemplate" spellcheck="false"></textarea>
                </div>
                <div class="sft-field">
                  <label for="sft-free-template">Služba zdarma</label>
                  <textarea id="sft-free-template" data-role="freeTemplate" spellcheck="false"></textarea>
                </div>
              </div>
            </details>
          </div>
        </div>
      </section>
    `;

    this.filters = {
      appliances: {
        paid: "([Segment 3] IN ('Vestavné lednice', 'Vestavné mrazáky', 'Vestavné sušičky', 'Vestavné myčky standardní', 'Vestavné myčky úzké', 'Vestavné pračky', 'Vestavné vinotéky', 'Vestavné mikrovlnné trouby')  and [Segment 3] <> 'Plynové desky' AND [Název produktu] NOT LIKE '%digestoř%' AND ([Jméno Ext] NOT LIKE '%plyn%' or ISNULL([Jméno Ext], '') = '') AND [SEO Prefix] NOT IN ('Set trouba, deska a myčka', 'Set trouba, varná deska a mikrovlnná trouba') AND ISNULL([Produkt], '') NOT IN ('AMISET101') OR [Produkt] IN ('SIEPS001', 'BOKAV001', 'BOTR059', 'Mie437', 'Mie436', 'ELMAK001', 'BOTR017', 'SIMTR11', 'WHVK001', 'BECHL162') OR [Segment 2] IN ('Vestavné ohřívací zásuvky', 'Vestavné kávovary')) AND [Webový příznak] > 0 AND [Produkt] NOT IN ()",
        free: "[Produkt] IN ()"
      },
      tv: {
        paid: "[Segment 1] = 'Televize' AND ISNULL([Webový příznak], 0) <> -1 AND [Produkt] NOT IN ()",
        free: "[Produkt] IN ()"
      }
    };

    this.paidTemplate = this.shadowRoot.querySelector('[data-role="paidTemplate"]');
    this.freeTemplate = this.shadowRoot.querySelector('[data-role="freeTemplate"]');
    this.paidOutput = this.shadowRoot.querySelector('[data-role="paidOutput"]');
    this.freeOutput = this.shadowRoot.querySelector('[data-role="freeOutput"]');
    this.statusBox = this.shadowRoot.querySelector('[data-role="status"]');
    this.actionField = this.shadowRoot.querySelector('[data-role="actionField"]');
    this.codesHint = this.shadowRoot.querySelector('[data-role="codesHint"]');
    this.runButton = this.shadowRoot.querySelector('[data-role="runButton"]');
    this.resetButton = this.shadowRoot.querySelector('[data-role="resetButton"]');
    this.paidOutputSection = this.shadowRoot.querySelector('[data-role="paidOutputSection"]');
    this.freeOutputTitle = this.shadowRoot.querySelector('[data-role="freeOutputTitle"]');
    this.templatesDetails = this.shadowRoot.querySelector('[data-role="templatesDetails"]');

    this.shadowRoot.querySelectorAll('input[name="sft-filter-type"]').forEach((input) => {
      input.addEventListener("change", () => this.loadTemplates(input.value));
    });

    this.shadowRoot.querySelector('[data-action="run"]').addEventListener("click", () => this.generate());
    this.shadowRoot.querySelector('[data-action="clear"]').addEventListener("click", () => this.clearCodes());
    this.shadowRoot.querySelector('[data-action="reset"]').addEventListener("click", () => this.loadTemplates(this.selectedValue("sft-filter-type")));

    this.shadowRoot.querySelectorAll("[data-copy]").forEach((button) => {
      button.addEventListener("click", () => this.copyTextarea(button.dataset.copy));
    });

    this.loadTemplates("appliances");
  }

  selectedValue(name) {
    return this.shadowRoot.querySelector(`input[name="${name}"]:checked`).value;
  }

  setStatus(message, type) {
    this.statusBox.textContent = message;
    this.statusBox.className = `sft-status sft-visible sft-${type || ""}`.trim();
  }

  loadTemplates(type) {
    const isSemicolonMode = type === "semicolon";
    this.actionField.classList.toggle("sft-hidden", isSemicolonMode);
    this.resetButton.classList.toggle("sft-hidden", isSemicolonMode);
    this.paidOutputSection.classList.toggle("sft-hidden", isSemicolonMode);
    this.templatesDetails.hidden = isSemicolonMode;
    this.freeOutputTitle.textContent = isSemicolonMode ? "Produkty oddělené středníkem" : "Filtr služby zdarma";
    this.runButton.textContent = isSemicolonMode ? "Oddělit středníkem" : "Vygenerovat filtry";
    this.codesHint.textContent = isSemicolonMode
      ? "Produkty vlož na samostatné řádky nebo odděl čárkou/středníkem. Mezery uvnitř hodnot se odstraní jako ve vzorci DOSADIT(TEXTJOIN(...); \" \"; \"\")."
      : "Kódy můžou být na řádcích, oddělené čárkou, středníkem nebo mezerou. Apostrofy se doplní automaticky.";
    this.paidTemplate.value = isSemicolonMode ? "" : this.filters[type].paid;
    this.freeTemplate.value = isSemicolonMode ? "" : this.filters[type].free;
    this.paidOutput.value = "";
    this.freeOutput.value = "";
    this.setStatus(isSemicolonMode ? "Vlož produkty a nástroj je spojí středníkem." : "Vybraný filtr je připravený k úpravě.", "ok");
  }

  parseCodes(raw) {
    return raw
      .split(/[\s,;]+/)
      .map((code) => code.trim().replace(/^'+|'+$/g, ""))
      .filter(Boolean)
      .filter((code, index, list) => list.indexOf(code) === index);
  }

  cleanSql(sql) {
    return sql.replace(/\*\*/g, "").replace(/&#x20;/gi, " ");
  }

  parseSemicolonProducts(raw) {
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
  }

  findProductListBounds(sql, mode) {
    const keyword = mode === "notIn" ? "NOT IN" : "IN";
    const pattern = new RegExp("\\[Produkt\\]\\s*" + keyword.replace(" ", "\\s+") + "\\s*(?:\\*\\*)?\\s*\\(", "gi");
    let match;
    let lastMatch = null;

    while ((match = pattern.exec(sql)) !== null) {
      lastMatch = {
        open: pattern.lastIndex - 1,
        listStart: pattern.lastIndex
      };
    }

    if (!lastMatch) {
      throw new Error(`Ve filtru se nepodařilo najít část [Produkt] ${keyword} (...).`);
    }

    const close = this.findClosingParenthesis(sql, lastMatch.open);
    if (close === -1) {
      throw new Error("Seznam produktů nemá nalezenou uzavírací závorku.");
    }

    return {
      listStart: lastMatch.listStart,
      close
    };
  }

  findClosingParenthesis(sql, openIndex) {
    let inQuote = false;

    for (let index = openIndex + 1; index < sql.length; index += 1) {
      const char = sql[index];
      const next = sql[index + 1];

      if (char === "'" && next === "'") {
        index += 1;
        continue;
      }

      if (char === "'") {
        inQuote = !inQuote;
        continue;
      }

      if (!inQuote && char === ")") {
        return index;
      }
    }

    return -1;
  }

  readListValues(listContent) {
    const values = [];
    const pattern = /'((?:''|[^'])*)'/g;
    let match;

    while ((match = pattern.exec(listContent)) !== null) {
      values.push(match[1].replace(/''/g, "'"));
    }

    return values;
  }

  escapeSqlValue(value) {
    return value.replace(/'/g, "''");
  }

  addCodes(sql, listMode, codes) {
    const bounds = this.findProductListBounds(sql, listMode);
    const before = sql.slice(0, bounds.close);
    const after = sql.slice(bounds.close);
    const listContent = sql.slice(bounds.listStart, bounds.close);
    const existing = this.readListValues(listContent);
    const additions = codes.filter((code) => !existing.includes(code));

    if (additions.length === 0) {
      return {
        sql,
        changed: 0
      };
    }

    const separator = listContent.trim().length > 0 ? ", " : "";
    const inserted = separator + additions.map((code) => `'${this.escapeSqlValue(code)}'`).join(", ");

    return {
      sql: before + inserted + after,
      changed: additions.length
    };
  }

  removeCodes(sql, listMode, codes) {
    const bounds = this.findProductListBounds(sql, listMode);
    const before = sql.slice(0, bounds.listStart);
    const after = sql.slice(bounds.close);
    const listContent = sql.slice(bounds.listStart, bounds.close);
    const existing = this.readListValues(listContent);
    const kept = existing.filter((code) => !codes.includes(code));

    if (kept.length === existing.length) {
      return {
        sql,
        changed: 0
      };
    }

    const rebuilt = kept.map((code) => `'${this.escapeSqlValue(code)}'`).join(", ");

    return {
      sql: before + rebuilt + after,
      changed: existing.length - kept.length
    };
  }

  generate() {
    const filterType = this.selectedValue("sft-filter-type");
    const rawCodes = this.shadowRoot.querySelector("#sft-codes").value;
    const codes = this.parseCodes(rawCodes);
    const mode = this.selectedValue("sft-edit-mode");

    if (filterType === "semicolon") {
      const products = this.parseSemicolonProducts(rawCodes);
      this.paidOutput.value = "";
      this.freeOutput.value = products.join(";");
      this.setStatus(
        products.length === 0 ? "Vlož alespoň jeden produkt." : `Hotovo: spojeno ${products.length} produktů středníkem.`,
        products.length === 0 ? "warn" : "ok"
      );
      return;
    }

    if (codes.length === 0) {
      this.paidOutput.value = "";
      this.freeOutput.value = "";
      this.setStatus("Vlož alespoň jeden produktový kód.", "warn");
      return;
    }

    try {
      const paidEdit = mode === "add"
        ? this.addCodes(this.cleanSql(this.paidTemplate.value), "notIn", codes)
        : this.removeCodes(this.cleanSql(this.paidTemplate.value), "notIn", codes);
      const freeEdit = mode === "add"
        ? this.addCodes(this.cleanSql(this.freeTemplate.value), "in", codes)
        : this.removeCodes(this.cleanSql(this.freeTemplate.value), "in", codes);

      this.paidOutput.value = paidEdit.sql;
      this.freeOutput.value = freeEdit.sql;

      const actionText = mode === "add" ? "přidáno" : "odebráno";
      const warning = paidEdit.changed === 0 && freeEdit.changed === 0
        ? " Nic se nezměnilo, zadané kódy už byly ve správném stavu nebo v seznamech nejsou."
        : "";

      this.setStatus(`Hotovo: ${actionText} v placeném filtru ${paidEdit.changed}x a ve filtru zdarma ${freeEdit.changed}x.${warning}`, warning ? "warn" : "ok");
    } catch (error) {
      this.paidOutput.value = "";
      this.freeOutput.value = "";
      this.setStatus(error.message, "error");
    }
  }

  clearCodes() {
    this.shadowRoot.querySelector("#sft-codes").value = "";
    this.paidOutput.value = "";
    this.freeOutput.value = "";
    this.setStatus("Kódy jsou vymazané.", "ok");
  }

  async copyTextarea(role) {
    const textarea = this.shadowRoot.querySelector(`[data-role="${role}"]`);
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);

    try {
      await navigator.clipboard.writeText(textarea.value);
      this.setStatus("Filtr je zkopírovaný do schránky.", "ok");
    } catch {
      document.execCommand("copy");
      this.setStatus("Filtr je označený a zkopírovaný pomocí záložní metody.", "ok");
    }
  }
}

customElements.define("sql-filter-tool", SqlFilterTool);
