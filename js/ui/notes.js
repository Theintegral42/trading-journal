import { html, useState } from "../lib/preact-htm.js";
import { useStore, mutate } from "../store.js";
import { renderMarkdown } from "../util.js";
import { Icon, Card, Modal, Field, TextArea, Empty, confirmDialog } from "./components.js";

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
