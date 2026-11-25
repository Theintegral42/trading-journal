import { html, useState } from "../lib/preact-htm.js";
import { store, useStore, mutate, setUI, mainRows } from "../store.js";
import { COLUMNS, normRow, normDirection, computeR, dayOf, logNames, withCumulative } from "../data.js";
import { todayStr, money, num, parseCSV, readFileText, readFileBuffer, loadScript } from "../util.js";
import { Icon, Card, Modal, Segmented, Field, Empty, toast, confirmDialog } from "./components.js";

export function currentLog(s) {
  return logNames(s.data).includes(s.ui.log) ? s.ui.log : "Main";
}

export function LogPicker({ withNew = false, onNew }) {
  const s = useStore();
  const cur = currentLog(s);
  return html`<div class="chips scroll">
    ${logNames(s.data).map((n) => html`<button class="chip ${n === cur ? "active" : ""}" onClick=${() => setUI({ log: n })}>${n === "Main" && html`<${Icon} name="folder" size=${14} />`}${n}</button>`)}
    ${withNew && html`<button class="chip add" onClick=${onNew}><${Icon} name="plus" size=${14} />New log</button>`}
  </div>`;
}

export function TradeLogView() {
  const s = useStore();
  const d = s.data;
  const log = currentLog(s);
  const isMain = log === "Main";
  const rows = isMain ? mainRows() : d.trade_logs[log] || [];
  const [form, setForm] = useState(null); // { index, row }
  const [modal, setModal] = useState(null); // 'new' | 'rename' | 'lists' | 'import'
  const [pending, setPending] = useState(null);
  const [limit, setLimit] = useState(150);
  const base = d.settings.r_base;

  const cum = withCumulative(rows);
  const view = cum.map((r, i) => ({ ...r, _i: i })).reverse();
  const linked = d.log_linked[log] !== false;
  const total = rows.reduce((a, r) => a + num(r.PnL), 0);

  const saveTrade = (row, index) => {
    mutate((dd) => {
      const list = (dd.trade_logs[log] ??= []);
      if (index == null) list.push(row);
      else list[index] = row;
    });
    toast(index == null ? "Trade added" : "Trade updated");
  };

  const delTrade = async (i) => {
    if (await confirmDialog({ title: "Delete trade", message: "This trade will be permanently removed from this log.", confirmText: "Delete", danger: true })) {
      mutate((dd) => dd.trade_logs[log].splice(i, 1));
    }
  };

  const deleteLog = async () => {
    if (!(await confirmDialog({ title: `Delete "${log}"`, message: `All ${rows.length} trades in this log will be deleted. Make sure you have a backup.`, confirmText: "Delete log", danger: true }))) return;
    mutate((dd) => {
      delete dd.trade_logs[log];
      delete dd.log_targets[log];
      delete dd.log_linked[log];
    });
    setUI({ log: "Main" });
  };

  const onFile = async (file) => {
    if (!file) return;
    try {
      let recs;
      if (/\.xlsx?$/i.test(file.name)) {
        if (!window.XLSX) await loadScript(new URL("../lib/xlsx.mini.min.js", import.meta.url).href);
        const wb = window.XLSX.read(await readFileBuffer(file), { type: "array", cellDates: true });
        recs = window.XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "", raw: true });
      } else recs = parseCSV(await readFileText(file));
      const mapped = recs
        .map((r) => {
          const o = {};
          for (const [k, v] of Object.entries(r)) {
            const key = k.trim();
            const alias = { "PnL ($)": "PnL", "R Réel": "R", "R Reel": "R", Pnl: "PnL", Symbol: "Symbole", Risk: "Risque", Result: "Résultat", Resultat: "Résultat" }[key] || key;
            o[alias] = v;
          }
          return o;
        })
        .filter((r) => r.Date && String(r.Date).trim() !== "")
        .map((r) => {
          const row = normRow(r, base);
          delete row.Log;
          return row;
        });
      if (!mapped.length) throw new Error("No trades found (expected columns: " + COLUMNS.join(", ") + ")");
      setPending({ rows: mapped, name: file.name });
      setModal("import");
    } catch (e) {
      toast(e.message || "Import failed", "err");
    }
  };

  return html`<div class="page">
    <div class="page-head">
      <div>
        <h1>Trade Log</h1>
        <div class="muted">${rows.length} trades · <span class=${total >= 0 ? "pos" : "neg"}>${money(total, 0, true)}</span></div>
      </div>
      <div class="row gap wrap">
        ${!isMain &&
        html`<label class="btn"><${Icon} name="upload" size=${16} />Import<input type="file" accept=".csv,.xlsx,.xls" hidden onChange=${(e) => (onFile(e.target.files[0]), (e.target.value = ""))} /></label>
          <button class="btn primary" onClick=${() => setForm({ index: null })}><${Icon} name="plus" size=${16} />Add trade</button>`}
      </div>
    </div>

    <${LogPicker} withNew=${true} onNew=${() => setModal("new")} />

    ${isMain
      ? html`<div class="banner info"><${Icon} name="folder" size=${16} />Main is read-only: it combines all logs that have “Include in Main” enabled.</div>`
      : html`<div class="toolbar">
          <label class="switch"><input type="checkbox" checked=${linked} onChange=${(e) => mutate((dd) => (dd.log_linked[log] = e.target.checked))} /><span></span>Include in Main</label>
          <div class="row gap-s wrap">
            <button class="btn small ghost" onClick=${() => setModal("lists")}><${Icon} name="settings" size=${14} />Lists</button>
            <button class="btn small ghost" onClick=${() => setModal("rename")}><${Icon} name="edit" size=${14} />Rename</button>
            <button class="btn small danger-ghost" onClick=${deleteLog}><${Icon} name="trash" size=${14} />Delete</button>
          </div>
        </div>`}

    ${rows.length === 0
      ? html`<${Card}><${Empty} title="No trades yet">${isMain ? "Create a log and add trades to see them here." : "Add your first trade or import a CSV/Excel file."}<//><//>`
      : html`<${Card} pad=${false}>
          <div class="table-wrap">
            <table class="table responsive">
              <thead><tr><th>#</th><th>Date</th><th>Setup</th><th>Dir</th><th class="num">Risk</th><th class="num">RR</th><th>Result</th><th class="num">PnL</th><th class="num">R</th><th class="num">Cumulative</th><th>Note</th>${!isMain && html`<th></th>`}</tr></thead>
              <tbody>
                ${view.slice(0, limit).map((r) => {
                  const dir = normDirection(r.Direction);
                  return html`<tr key=${r._i}>
                    <td data-label="#" class="muted hide-m">${r._i + 1}</td>
                    <td data-label="Date">${dayOf(r)}</td>
                    <td data-label="Setup">${r.Setup || "—"}</td>
                    <td data-label="Dir">${dir ? html`<span class="pill ${dir.toLowerCase()}">${dir}</span>` : "—"}</td>
                    <td data-label="Risk" class="num">${r.Risque ?? "—"}</td>
                    <td data-label="RR" class="num">${r.RR ?? "—"}</td>
                    <td data-label="Result"><span class="pill ${r["Résultat"] === "W" ? "win" : r["Résultat"] === "L" ? "lose" : ""}">${r["Résultat"] || "—"}</span></td>
                    <td data-label="PnL" class="num strong ${r.PnL >= 0 ? "pos" : "neg"}">${money(r.PnL, 2, true)}</td>
                    <td data-label="R" class="num ${r.R >= 0 ? "pos" : "neg"}">${num(r.R).toFixed(2)}</td>
                    <td data-label="Cumulative" class="num muted hide-m">${money(r["Cumulative PnL"], 0)}</td>
                    <td data-label="Note" class="note-cell ${r.Note ? "" : "hide-m"}">${r.Note || ""}</td>
                    ${!isMain && html`<td class="actions"><button class="icon-btn" aria-label="Edit" onClick=${() => setForm({ index: r._i, row: rows[r._i] })}><${Icon} name="edit" size=${16} /></button><button class="icon-btn" aria-label="Delete" onClick=${() => delTrade(r._i)}><${Icon} name="trash" size=${16} /></button></td>`}
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>
          ${view.length > limit && html`<div class="center pad"><button class="btn" onClick=${() => setLimit(limit + 150)}>Show more (${view.length - limit})</button></div>`}
        <//>`}

    ${form && html`<${TradeForm} initial=${form.row} onClose=${() => setForm(null)} onSave=${(row) => (saveTrade(row, form.index), setForm(null))} />`}
    ${modal === "new" && html`<${NameModal} title="New trade log" onClose=${() => setModal(null)} onSave=${(n) => (mutate((dd) => (dd.trade_logs[n] = [])), setUI({ log: n }), setModal(null))} />`}
    ${modal === "rename" &&
    html`<${NameModal} title="Rename log" initial=${log} onClose=${() => setModal(null)} onSave=${(n) => {
      if (n === log) return setModal(null);
      mutate((dd) => {
        const rebuilt = {};
        for (const [k, v] of Object.entries(dd.trade_logs)) rebuilt[k === log ? n : k] = v;
        dd.trade_logs = rebuilt;
        for (const key of ["log_targets", "log_linked"]) if (log in dd[key]) { dd[key][n] = dd[key][log]; delete dd[key][log]; }
      });
      setUI({ log: n });
      setModal(null);
    }} />`}
    ${modal === "lists" && html`<${ListsModal} onClose=${() => setModal(null)} />`}
    ${modal === "import" &&
    pending &&
    html`<${Modal} title="Import trades" onClose=${() => setModal(null)} small=${true}>
      <p><strong>${pending.rows.length}</strong> trades found in <em>${pending.name}</em>.<br /><span class="muted">Target log: ${log} (${rows.length} existing trades)</span></p>
      <div class="stack">
        <button class="btn primary block" onClick=${() => (mutate((dd) => (dd.trade_logs[log] = [...(dd.trade_logs[log] || []), ...pending.rows])), toast(`${pending.rows.length} trades added`), setModal(null))}>Add to existing trades</button>
        <button class="btn block danger-ghost" onClick=${() => (mutate((dd) => (dd.trade_logs[log] = pending.rows)), toast(`Log replaced (${pending.rows.length} trades)`), setModal(null))}>Replace all trades in this log</button>
      </div>
    <//>`}
  </div>`;
}

function NameModal({ title, initial = "", onClose, onSave }) {
  const s = useStore();
  const [name, setName] = useState(initial);
  const n = name.trim();
  const taken = n !== initial && (n === "Main" || n in s.data.trade_logs);
  return html`<${Modal} title=${title} onClose=${onClose} small=${true}>
    <${Field} label="Name"><input class="input" autofocus value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === "Enter" && n && !taken && onSave(n)} /><//>
    ${taken && html`<div class="neg small-t" style="margin-top:6px">This name is already used.</div>`}
    <div class="row end gap" style="margin-top:18px"><button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!n || taken} onClick=${() => onSave(n)}>Save</button></div>
  <//>`;
}

function ListsModal({ onClose }) {
  const s = useStore();
  const d = s.data;
  const [setups, setSetups] = useState(d.setup_options.join(", "));
  const [risks, setRisks] = useState(d.risk_options.join(", "));
  const [rrs, setRrs] = useState(d.rr_options.join(", "));
  const list = (t) => t.split(",").map((x) => x.trim()).filter(Boolean);
  return html`<${Modal} title="Lists" onClose=${onClose} small=${true}>
    <p class="muted" style="margin-top:0">Comma separated values used in the trade form.</p>
    <div class="stack">
      <${Field} label="Setups"><input class="input" value=${setups} onInput=${(e) => setSetups(e.target.value)} /><//>
      <${Field} label="Risk (%)"><input class="input" value=${risks} onInput=${(e) => setRisks(e.target.value)} /><//>
      <${Field} label="RR"><input class="input" value=${rrs} onInput=${(e) => setRrs(e.target.value)} /><//>
    </div>
    <div class="row end gap" style="margin-top:18px">
      <button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" onClick=${() => {
        mutate((dd) => {
          dd.setup_options = list(setups);
          const r = list(risks).map(Number).filter(Number.isFinite);
          const q = list(rrs).map(Number).filter(Number.isFinite);
          if (r.length) dd.risk_options = r;
          if (q.length) dd.rr_options = q;
        });
        toast("Lists updated");
        onClose();
      }}>Save</button>
    </div>
  <//>`;
}

function TradeForm({ initial, onClose, onSave }) {
  const s = useStore();
  const d = s.data;
  const base = d.settings.r_base;
  const editing = !!initial;
  const [f, setF] = useState(() =>
    initial
      ? { ...initial, Direction: normDirection(initial.Direction) || "Buy", Risque: initial.Risque ?? "", RR: initial.RR ?? "", PnL: initial.PnL }
      : { Date: todayStr(), Symbole: "NQ", Setup: d.setup_options[0] || "", Direction: "Buy", Risque: d.risk_options[0] ?? "", RR: d.rr_options[0] ?? "", Résultat: "W", PnL: "", R: "", Note: "" }
  );
  const [rTouched, setRTouched] = useState(editing && initial.Risque == null);
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const pnl = num(f.PnL);
  const autoR = computeR(pnl, f.Risque, base);
  const rVal = rTouched ? f.R : autoR;

  return html`<${Modal} title=${editing ? "Edit trade" : "Add trade"} onClose=${onClose}>
    <div class="form-grid">
      <${Field} label="Date"><input type="date" class="input" value=${f.Date} onInput=${(e) => set({ Date: e.target.value })} /><//>
      <${Field} label="Symbol"><input class="input" value=${f.Symbole} onInput=${(e) => set({ Symbole: e.target.value })} /><//>
      <${Field} label="Setup">
        <input class="input" list="dl-setup" value=${f.Setup} onInput=${(e) => set({ Setup: e.target.value })} />
        <datalist id="dl-setup">${d.setup_options.map((o) => html`<option value=${o}></option>`)}</datalist>
      <//>
      <${Field} label="Direction"><${Segmented} value=${f.Direction} options=${["Buy", "Sell"]} onChange=${(v) => set({ Direction: v })} /><//>
      <${Field} label="Risk (%)">
        <input class="input" inputmode="decimal" list="dl-risk" value=${f.Risque} onInput=${(e) => set({ Risque: e.target.value })} />
        <datalist id="dl-risk">${d.risk_options.map((o) => html`<option value=${o}></option>`)}</datalist>
      <//>
      <${Field} label="RR">
        <input class="input" inputmode="decimal" list="dl-rr" value=${f.RR} onInput=${(e) => set({ RR: e.target.value })} />
        <datalist id="dl-rr">${d.rr_options.map((o) => html`<option value=${o}></option>`)}</datalist>
      <//>
      <${Field} label="PnL ($)"><input class="input" inputmode="decimal" placeholder="e.g. 1250 or -480" value=${f.PnL} onInput=${(e) => set({ PnL: e.target.value, Résultat: num(e.target.value) > 0 ? "W" : num(e.target.value) < 0 ? "L" : f.Résultat })} /><//>
      <${Field} label="Result"><${Segmented} value=${f.Résultat} options=${[{ value: "W", label: "Win" }, { value: "L", label: "Loss" }]} onChange=${(v) => set({ Résultat: v })} /><//>
      <${Field} label="R" hint=${rTouched ? "Manual value" : `Auto: PnL / (risk × ${base})`}><input class="input" inputmode="decimal" value=${rVal} onInput=${(e) => (setRTouched(true), set({ R: e.target.value }))} /><//>
    </div>
    <${Field} label="Note"><input class="input" value=${f.Note} onInput=${(e) => set({ Note: e.target.value })} /><//>
    <div class="row end gap" style="margin-top:18px">
      <button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" disabled=${!f.Date} onClick=${() => {
        const row = {
          ...(initial || {}),
          Date: f.Date,
          Symbole: f.Symbole || "NQ",
          Setup: f.Setup,
          Direction: f.Direction,
          Risque: f.Risque === "" ? null : num(f.Risque),
          RR: f.RR === "" ? null : num(f.RR),
          Résultat: f.Résultat,
          PnL: pnl,
          R: rTouched ? num(f.R) : autoR,
          Note: f.Note,
        };
        onSave(row);
      }}>${editing ? "Save changes" : "Add trade"}</button>
    </div>
  <//>`;
}
