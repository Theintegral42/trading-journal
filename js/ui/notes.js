import { html, useState } from "../lib/preact-htm.js";
import { useStore, mutate } from "../store.js";
import { renderMarkdown, money, num, todayStr } from "../util.js";
import { Icon, Card, Modal, Field, TextArea, Empty, toast, confirmDialog } from "./components.js";

export function NotesView() {
  const s = useStore();
  const notes = s.data.trading_notes;
  const names = Object.keys(notes);
  const [sel, setSel] = useState(names[0]);
  const cur = names.includes(sel) ? sel : names[0];
  const [edit, setEdit] = useState(false);
  const [modal, setModal] = useState(null);
  const text = notes[cur] || "";

  return html`<div class="page">
    <div class="page-head">
      <div><h1>Notes</h1><div class="muted">Setups, rules, conditions, schedules…</div></div>
      <div class="row gap wrap">
        <button class="btn" onClick=${() => setModal("new")}><${Icon} name="plus" size=${16} />New folder</button>
        <button class="btn ${edit ? "primary" : ""}" onClick=${() => setEdit(!edit)}><${Icon} name=${edit ? "eye" : "edit"} size=${16} />${edit ? "View" : "Edit"}</button>
      </div>
    </div>
    <div class="notes-layout">
      <div class="notes-list">
        ${names.map((n) => html`<button class="note-item ${n === cur ? "active" : ""}" onClick=${() => setSel(n)}><${Icon} name="folder" size=${16} /><span>${n}</span></button>`)}
      </div>
      <${Card}
        title=${cur}
        actions=${edit && html`<button class="btn small ghost" onClick=${() => setModal("rename")}><${Icon} name="edit" size=${14} />Rename</button>
          ${cur !== "General" && html`<button class="btn small danger-ghost" onClick=${async () => {
            if (await confirmDialog({ title: `Delete "${cur}"`, message: "This folder and its content will be deleted.", confirmText: "Delete", danger: true })) {
              mutate((d) => delete d.trading_notes[cur]);
              setSel(null);
            }
          }}><${Icon} name="trash" size=${14} /></button>`}`}
      >
        ${edit
          ? html`<${TextArea} value=${text} minRows=${18} placeholder="Markdown supported: **bold**, - lists, # titles" onInput=${(v) => mutate((d) => (d.trading_notes[cur] = v))} />`
          : text.trim()
          ? html`<div class="md" dangerouslySetInnerHTML=${{ __html: renderMarkdown(text) }}></div>`
          : html`<${Empty} icon="notes" title="Empty folder">Press Edit to start writing.<//>`}
      <//>
    </div>
    ${modal && html`<${FolderModal} mode=${modal} current=${cur} onClose=${() => setModal(null)} onDone=${(n) => (setSel(n), setEdit(true), setModal(null))} />`}
  </div>`;
}

function FolderModal({ mode, current, onClose, onDone }) {
  const s = useStore();
  const [name, setName] = useState(mode === "rename" ? current : "");
  const n = name.trim();
  const taken = n !== current && n in s.data.trading_notes;
  const save = () => {
    if (!n || taken) return;
    mutate((d) => {
      if (mode === "new") d.trading_notes[n] = "";
      else if (n !== current) {
        const rebuilt = {};
        for (const [k, v] of Object.entries(d.trading_notes)) rebuilt[k === current ? n : k] = v;
        d.trading_notes = rebuilt;
      }
    });
    onDone(n);
  };
  return html`<${Modal} title=${mode === "new" ? "New folder" : "Rename folder"} onClose=${onClose} small=${true}>
    <${Field} label="Name"><input class="input" autofocus value=${name} onInput=${(e) => setName(e.target.value)} onKeyDown=${(e) => e.key === "Enter" && save()} /><//>
    ${taken && html`<div class="neg small-t" style="margin-top:6px">This name already exists.</div>`}
    <div class="row end gap" style="margin-top:18px"><button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!n || taken} onClick=${save}>Save</button></div>
  <//>`;
}

export function InvestmentView() {
  const s = useStore();
  const d = s.data;
  const [tab, setTab] = useState("journal");
  const pos = d.inv_positions;
  const invested = pos.reduce((a, p) => a + num(p.Quantity) * num(p.Price), 0);
  const [form, setForm] = useState(null);

  return html`<div class="page">
    <div class="page-head">
      <div><h1>Investment</h1><div class="muted">Market vision, yearly strategy, positions</div></div>
      <div class="segmented"><button class=${tab === "journal" ? "active" : ""} onClick=${() => setTab("journal")}>Journal</button><button class=${tab === "positions" ? "active" : ""} onClick=${() => setTab("positions")}>Positions</button></div>
    </div>
    ${tab === "journal"
      ? html`<${Card} title="Strategy & vision"><${TextArea} value=${d.inv_journal} minRows=${18} placeholder="Market vision, yearly plan…" onInput=${(v) => mutate((x) => (x.inv_journal = v))} /><//>`
      : html`<${Card} title="Positions" actions=${html`<span class="muted">Invested ${money(invested, 0)}</span><button class="btn small primary" onClick=${() => setForm({ i: null, row: { Date: todayStr(), Symbol: "", Quantity: "", Price: "", Note: "" } })}><${Icon} name="plus" size=${14} />Add</button>`} pad=${false}>
          ${pos.length
            ? html`<div class="table-wrap"><table class="table responsive"><thead><tr><th>Date</th><th>Symbol</th><th class="num">Quantity</th><th class="num">Price</th><th class="num">Value</th><th>Note</th><th></th></tr></thead><tbody>
              ${pos.map((p, i) => html`<tr><td data-label="Date">${p.Date}</td><td data-label="Symbol" class="strong">${p.Symbol}</td><td data-label="Quantity" class="num">${p.Quantity}</td><td data-label="Price" class="num">${p.Price}</td><td data-label="Value" class="num">${money(num(p.Quantity) * num(p.Price), 0)}</td><td data-label="Note" class="note-cell">${p.Note}</td>
                <td class="actions"><button class="icon-btn" aria-label="Edit" onClick=${() => setForm({ i, row: { ...p } })}><${Icon} name="edit" size=${16} /></button><button class="icon-btn" aria-label="Delete" onClick=${() => mutate((x) => x.inv_positions.splice(i, 1))}><${Icon} name="trash" size=${16} /></button></td></tr>`)}
            </tbody></table></div>`
            : html`<${Empty} icon="briefcase" title="No positions">Add your first position.<//>`}
        <//>`}
    ${form && html`<${PositionForm} init=${form.row} onClose=${() => setForm(null)} onSave=${(row) => (mutate((x) => (form.i == null ? x.inv_positions.push(row) : (x.inv_positions[form.i] = row))), setForm(null))} />`}
  </div>`;
}

function PositionForm({ init, onClose, onSave }) {
  const [f, setF] = useState(init);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return html`<${Modal} title="Position" onClose=${onClose}>
    <div class="form-grid">
      <${Field} label="Date"><input type="date" class="input" value=${f.Date} onInput=${set("Date")} /><//>
      <${Field} label="Symbol"><input class="input" value=${f.Symbol} onInput=${set("Symbol")} /><//>
      <${Field} label="Quantity"><input class="input" inputmode="decimal" value=${f.Quantity} onInput=${set("Quantity")} /><//>
      <${Field} label="Price"><input class="input" inputmode="decimal" value=${f.Price} onInput=${set("Price")} /><//>
    </div>
    <${Field} label="Note"><input class="input" value=${f.Note} onInput=${set("Note")} /><//>
    <div class="row end gap" style="margin-top:18px"><button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" onClick=${() => onSave(f)}>Save</button></div>
  <//>`;
}
