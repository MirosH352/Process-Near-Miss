class SqlFilterTool extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  connectedCallback() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          --sft-panel: var(--color-surface, #ffffff);
          --sft-text: var(--color-text-primary, #14213b);
          --sft-muted: var(--color-text-secondary, #71809a);
          --sft-line: var(--color-border, #e4eaf3);
          --sft-line-strong: #ced9e9;
          --sft-accent: var(--color-primary, #2865f5);
          --sft-accent-hover: var(--color-primary-hover, #1952d9);
          --sft-accent-soft: #edf3ff;
          --sft-success: var(--color-success, #149453);
          --sft-success-soft: #eef9f2;
          --sft-warning: var(--color-warning, #ed9509);
          --sft-warning-soft: #fff7e8;
          --sft-danger: var(--color-danger, #dc3044);
          --sft-danger-soft: #fff1f1;
          --sft-radius: var(--radius-control, 8px);
          --sft-card-radius: var(--radius-card, 12px);
          --sft-shadow: var(--shadow-card, 0 2px 5px rgb(29 54 96 / 2%));
          color: var(--sft-text);
          display: block;
          font-family: inherit;
          font-size: 14px;
          line-height: 1.55;
        }

        * {
          box-sizing: border-box;
        }

        button,
        textarea,
        input {
          font: inherit;
        }

        .sft-shell {
          display: grid;
          gap: 22px;
        }

        .sft-topbar {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 16px;
        }

        h2 {
          margin: 0 0 6px;
          color: var(--sft-text);
          font-size: clamp(1.8rem, 2.3vw, 2.3rem);
          line-height: 1.12;
          letter-spacing: -0.04em;
        }

        .sft-subtitle {
          margin: 0;
          color: var(--sft-muted);
          font-size: 0.9rem;
          line-height: 1.6;
        }

        .sft-grid {
          display: grid;
          grid-template-columns: minmax(300px, 380px) minmax(0, 1fr);
          gap: 22px;
          align-items: start;
        }

        .sft-panel {
          background: var(--sft-panel);
          border: 1px solid var(--sft-line);
          border-radius: var(--sft-card-radius);
          box-shadow: var(--sft-shadow);
          min-width: 0;
          overflow: hidden;
        }

        .sft-panel-header {
          padding: 20px 22px 0;
        }

        .sft-panel-header h3 {
          margin: 0;
          color: var(--sft-text);
          font-size: 1.05rem;
          line-height: 1.25;
          letter-spacing: -0.02em;
        }

        .sft-panel-body {
          padding: 20px 22px 22px;
        }

        .sft-field {
          display: grid;
          gap: 7px;
          margin-bottom: 16px;
        }

        label,
        .sft-field-title {
          color: #53637d;
          font-size: 0.75rem;
          font-weight: 650;
        }

        .sft-segmented {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 4px;
          padding: 4px;
          border: 1px solid var(--sft-line);
          border-radius: 10px;
          background: #f3f6fb;
        }

        .sft-segmented input {
          position: absolute;
          opacity: 0;
          pointer-events: none;
        }

        .sft-segmented label {
          display: flex;
          min-height: 34px;
          align-items: center;
          justify-content: center;
          border: 0;
          border-radius: 6px;
          background: transparent;
          color: #657a9c;
          cursor: pointer;
          text-align: center;
          padding: 7px 10px;
          font-size: 0.77rem;
          font-weight: 650;
          transition: background 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sft-segmented input:checked + label {
          background: var(--sft-accent);
          color: #fff;
          box-shadow: 0 2px 5px rgba(40, 101, 245, 0.15);
        }

        textarea {
          width: 100%;
          min-height: 164px;
          resize: vertical;
          border: 1px solid var(--sft-line);
          border-radius: var(--sft-radius);
          padding: 12px;
          color: var(--sft-text);
          background: #fff;
          outline: none;
          font-size: 0.86rem;
          line-height: 1.6;
          box-shadow: none;
          transition: border-color 180ms ease, box-shadow 180ms ease, background 180ms ease;
        }

        textarea:focus {
          border-color: var(--sft-accent);
          box-shadow: 0 0 0 4px rgba(40, 101, 245, 0.11);
        }

        .sft-hint {
          color: var(--sft-muted);
          font-size: 0.78rem;
          line-height: 1.65;
        }

        .sft-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          align-items: center;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid var(--sft-line);
        }

        .sft-btn {
          border: 1px solid transparent;
          border-radius: var(--sft-radius);
          min-height: 38px;
          padding: 9px 14px;
          cursor: pointer;
          font-size: 0.82rem;
          font-weight: 650;
          background: #fff;
          color: #53637d;
          box-shadow: none;
          transition: background 160ms ease, border-color 160ms ease, color 160ms ease, box-shadow 160ms ease;
        }

        .sft-btn-primary {
          background: var(--sft-accent);
          color: #fff;
          box-shadow: 0 3px 7px rgba(40, 101, 245, 0.11);
        }

        .sft-btn-primary:hover {
          background: var(--sft-accent-hover);
          box-shadow: 0 4px 10px rgba(40, 101, 245, 0.15);
        }

        .sft-btn-secondary {
          border-color: var(--sft-line);
        }

        .sft-btn-secondary:hover {
          border-color: var(--sft-line-strong);
          background: #f6f8fc;
          color: var(--sft-accent);
        }

        .sft-btn-danger {
          background: var(--sft-danger-soft);
          border-color: #f9e0e3;
          color: var(--sft-danger);
        }

        .sft-btn-danger:hover {
          border-color: #f3c5ca;
          background: #ffe9ec;
        }

        .sft-btn:focus-visible,
        .sft-segmented label:focus-visible,
        summary:focus-visible,
        textarea:focus-visible {
          outline: 3px solid #a5c3ff;
          outline-offset: 3px;
        }

        .sft-status {
          min-height: 40px;
          display: none;
          align-items: center;
          border-radius: 10px;
          padding: 11px 14px;
          border: 1px solid var(--sft-line);
          color: var(--sft-muted);
          background: #fff;
          font-size: 0.82rem;
          line-height: 1.5;
        }

        .sft-status.sft-visible {
          display: flex;
        }

        .sft-status.sft-ok {
          border-color: #d8eddf;
          color: var(--sft-success);
          background: var(--sft-success-soft);
        }

        .sft-status.sft-warn {
          border-color: #f3ebd8;
          color: #aa6c0a;
          background: var(--sft-warning-soft);
        }

        .sft-status.sft-error {
          border-color: #f4e3e4;
          color: var(--sft-danger);
          background: var(--sft-danger-soft);
        }

        .sft-outputs {
          display: grid;
          gap: 14px;
        }

        .sft-output-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-bottom: 8px;
        }

        .sft-output-head h4 {
          margin: 0;
          color: var(--sft-text);
          font-size: 0.95rem;
          letter-spacing: -0.02em;
        }

        .sft-output textarea {
          min-height: 178px;
          font-family: Consolas, "Courier New", monospace;
          font-size: 0.78rem;
          line-height: 1.45;
          white-space: pre-wrap;
          background: #fbfcff;
        }

        details {
          border-top: 1px solid var(--sft-line);
        }

        summary {
          cursor: pointer;
          padding: 14px 22px;
          color: #53637d;
          font-size: 0.82rem;
          font-weight: 650;
          transition: background 160ms ease, color 160ms ease;
        }

        summary:hover {
          background: #f6f8fc;
          color: var(--sft-accent);
        }

        .sft-template-grid {
          display: grid;
          gap: 14px;
          padding: 0 22px 22px;
        }

        .sft-template-grid textarea {
          min-height: 122px;
          font-family: Consolas, "Courier New", monospace;
          font-size: 13px;
        }

        @media (max-width: 860px) {
          .sft-grid {
            grid-template-columns: 1fr;
          }

          .sft-topbar {
            align-items: flex-start;
            flex-direction: column;
          }

          .sft-panel-header,
          .sft-panel-body,
          summary,
          .sft-template-grid {
            padding-left: 16px;
            padding-right: 16px;
          }
        }
      </style>

      <section class="sft-shell">
        <header class="sft-topbar">
          <div>
            <h2>Úprava SQL filtru pro službu zdarma</h2>
            <p class="sft-subtitle">Vlož produktové kódy, vyber skupinu a nástroj doplní nebo odebere hodnoty ve formátu <strong>'Produkt', 'další produkt'</strong>.</p>
          </div>
        </header>

        <div class="sft-grid">
          <div class="sft-panel">
            <div class="sft-panel-header">
              <h3>Nastavení úpravy</h3>
            </div>
            <div class="sft-panel-body">
              <div class="sft-field">
                <div class="sft-field-title">Typ filtru</div>
                <div class="sft-segmented" role="radiogroup" aria-label="Typ filtru">
                  <input type="radio" id="sft-type-appliances" name="sft-filter-type" value="appliances" checked>
                  <label for="sft-type-appliances">Vestavné spotřebiče</label>
                  <input type="radio" id="sft-type-tv" name="sft-filter-type" value="tv">
                  <label for="sft-type-tv">Televize</label>
                </div>
              </div>

              <div class="sft-field">
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
                <div class="sft-hint">Kódy můžou být na řádcích, oddělené čárkou, středníkem nebo mezerou. Apostrofy se doplní automaticky.</div>
              </div>

              <div class="sft-actions">
                <button class="sft-btn sft-btn-primary" data-action="run" type="button">Vygenerovat filtry</button>
                <button class="sft-btn sft-btn-secondary" data-action="clear" type="button">Vymazat kódy</button>
                <button class="sft-btn sft-btn-danger" data-action="reset" type="button">Obnovit výchozí filtry</button>
              </div>
            </div>
          </div>

          <div class="sft-panel">
            <div class="sft-panel-header">
              <h3>Výstup</h3>
            </div>
            <div class="sft-panel-body sft-outputs">
              <div class="sft-status" data-role="status" aria-live="polite"></div>

              <div class="sft-output">
                <div class="sft-output-head">
                  <h4>Filtr placené služby</h4>
                  <button class="sft-btn sft-btn-secondary" data-copy="paidOutput" type="button">Kopírovat</button>
                </div>
                <textarea data-role="paidOutput" readonly spellcheck="false"></textarea>
              </div>

              <div class="sft-output">
                <div class="sft-output-head">
                  <h4>Filtr služby zdarma</h4>
                  <button class="sft-btn sft-btn-secondary" data-copy="freeOutput" type="button">Kopírovat</button>
                </div>
                <textarea data-role="freeOutput" readonly spellcheck="false"></textarea>
              </div>
            </div>

            <details>
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
        paid: "(**[Segment 3] IN** ('Vestavné lednice', 'Vestavné mrazáky', 'Vestavné sušičky', 'Vestavné myčky standardní', 'Vestavné myčky úzké', 'Vestavné pračky', 'Vestavné vinotéky', 'Vestavné mikrovlnné trouby')  **and [Segment 3]** <> 'Plynové desky' **AND [Název produktu] NOT LIKE&#x20;**'%digestoř%' **AND** (**[Jméno Ext] NOT LIKE&#x20;**'%plyn%' **or ISNULL**(**[Jméno Ext]**, '') = '') **AND [SEO Prefix] NOT IN** ('Set trouba, deska a myčka', 'Set trouba, varná deska a mikrovlnná trouba') **AND ISNULL**(**[Produkt]**, '') **NOT IN** ('AMISET101') **OR [Produkt] IN** ('SIEPS001', 'BOKAV001', 'BOTR059', 'Mie437', 'Mie436', 'ELMAK001', 'BOTR017', 'SIMTR11', 'WHVK001', 'BECHL162') **OR [Segment 2] IN** ('Vestavné ohřívací zásuvky', 'Vestavné kávovary')) **AND [Webový příznak]** > 0 **AND [Produkt] NOT IN** ()",
        free: "**[Produkt] IN** ()"
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
    this.paidTemplate.value = this.filters[type].paid;
    this.freeTemplate.value = this.filters[type].free;
    this.paidOutput.value = "";
    this.freeOutput.value = "";
    this.setStatus("Vybraný filtr je připravený k úpravě.", "ok");
  }

  parseCodes(raw) {
    return raw
      .split(/[\s,;]+/)
      .map((code) => code.trim().replace(/^'+|'+$/g, ""))
      .filter(Boolean)
      .filter((code, index, list) => list.indexOf(code) === index);
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
    const codes = this.parseCodes(this.shadowRoot.querySelector("#sft-codes").value);
    const mode = this.selectedValue("sft-edit-mode");

    if (codes.length === 0) {
      this.paidOutput.value = "";
      this.freeOutput.value = "";
      this.setStatus("Vlož alespoň jeden produktový kód.", "warn");
      return;
    }

    try {
      const paidEdit = mode === "add"
        ? this.addCodes(this.paidTemplate.value, "notIn", codes)
        : this.removeCodes(this.paidTemplate.value, "notIn", codes);
      const freeEdit = mode === "add"
        ? this.addCodes(this.freeTemplate.value, "in", codes)
        : this.removeCodes(this.freeTemplate.value, "in", codes);

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
