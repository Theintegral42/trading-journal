import { html, useState } from "../lib/preact-htm.js";
import { useStore, mutate, syncNow, signIn, signOut, exportText, importBackup, store } from "../store.js";
import { CONFIG, getClientId } from "../config.js";
import { dayOf, withCumulative, logNames } from "../data.js";
import { downloadFile, readFileText, todayStr, num } from "../util.js";
import { Icon, Card, Field, toast, confirmDialog } from "./components.js";

export const STATUS_LABEL = {
  local: ["Local only", "gray"],
  syncing: ["Syncing…", "blue"],
  synced: ["Synced", "green"],
  dirty: ["Saving…", "amber"],
  offline: ["Offline", "amber"],
  auth: ["Sign in again", "red"],
  conflict: ["Conflict", "red"],
  error: ["Sync error", "red"],
};

export function SyncPill({ onClick }) {
  const s = useStore();
  const [label, color] = STATUS_LABEL[s.sync.status] || STATUS_LABEL.local;
  return html`<button class="sync-pill ${color}" onClick=${onClick} title=${s.sync.msg || label}><span class="dot ${color}"></span>${label}</button>`;
}

export function SettingsView() {
  const s = useStore();
  const d = s.data;
  const [clientId, setClientId] = useState(getClientId());
  const acc = s.sync.account;
  const configured = !!getClientId();
  const day = todayStr().replace(/-/g, "");

  const exportCsv = () => {
    const cols = ["Log", "Date", "Symbole", "Setup", "Direction", "Risque", "RR", "Résultat", "PnL", "R", "Note"];
    const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [cols.join(",")];
    for (const n of logNames(d)) {
      const rows = n === "Main" ? [] : d.trade_logs[n];
      rows.forEach((r) => lines.push(cols.map((c) => esc(c === "Log" ? n : r[c])).join(",")));
    }
    downloadFile(`trades_${day}.csv`, lines.join("\n"), "text/csv");
  };
  const exportTxt = () => {
    let t = "";
    for (const [date, c] of Object.entries(d.journals).sort()) {
      t += `=== ${date} ===\n${c.notes || ""}\n`;
      if (c.emotions) t += `\n[Emotions]\n${c.emotions}\n`;
      t += "\n";
    }
    downloadFile(`journals_${day}.txt`, t, "text/plain");
  };

  return html`<div class="page narrow">
    <div class="page-head"><div><h1>Settings</h1><div class="muted">Account, sync and data</div></div></div>

    <${Card} title="Account & OneDrive sync">
      ${!configured
        ? html`<p class="muted" style="margin-top:0">To sync across devices, paste the <strong>Application (client) ID</strong> of your Azure app registration (see <code>SETUP.md</code>).</p>
          <${Field} label="Client ID"><input class="input" placeholder="00000000-0000-0000-0000-000000000000" value=${clientId} onInput=${(e) => setClientId(e.target.value.trim())} /><//>
          <div class="row end" style="margin-top:12px"><button class="btn primary" disabled=${!/^[0-9a-f-]{36}$/i.test(clientId)} onClick=${() => (localStorage.setItem("tj_client_id", clientId), location.reload())}>Save & reload</button></div>`
        : acc
        ? html`<div class="row between wrap gap">
              <div><div class="strong">${acc.name || acc.username}</div><div class="muted small-t">${acc.username}</div></div>
              <${SyncPill} onClick=${() => syncNow()} />
            </div>
            <div class="muted small-t" style="margin:10px 0">${s.sync.msg || (s.sync.lastSync ? "Last sync: " + new Date(s.sync.lastSync).toLocaleString() : "")}<br />Data file: <code>OneDrive › Apps › (your app) › ${CONFIG.fileName}</code></div>
            <div class="row gap wrap">
              <button class="btn" onClick=${() => syncNow()}><${Icon} name="refresh" size=${16} />Sync now</button>
              <button class="btn danger-ghost" onClick=${() => signOut()}><${Icon} name="logout" size=${16} />Sign out</button>
            </div>`
        : html`<p class="muted" style="margin-top:0">Sign in with your Microsoft account to store your data in your own OneDrive and use the app on every device.</p>
            <div class="row gap wrap"><button class="btn primary" onClick=${() => signIn()}><${Icon} name="cloud" size=${16} />Sign in with Microsoft</button>
            ${localStorage.getItem("tj_client_id") && html`<button class="btn ghost" onClick=${() => (localStorage.removeItem("tj_client_id"), location.reload())}>Change client ID</button>`}</div>`}
    <//>

    <${Card} title="Trading parameters">
      <${Field} label="R base ($ per 1% risk)" hint="R = PnL / (risk × base). Default 1500 (NQ)."><input class="input narrow" type="number" value=${d.settings.r_base} onChange=${(e) => mutate((x) => (x.settings.r_base = num(e.target.value, 1500) || 1500))} /><//>
    <//>

    <${Card} title="Backup & export">
      <div class="row gap wrap">
        <button class="btn" onClick=${() => downloadFile(`backup_${day}.json`, exportText())}><${Icon} name="download" size=${16} />Full backup (JSON)</button>
        <button class="btn" onClick=${exportCsv}><${Icon} name="download" size=${16} />Trades (CSV)</button>
        <button class="btn" onClick=${exportTxt}><${Icon} name="download" size=${16} />Journals (TXT)</button>
      </div>
      <hr />
      <p class="muted" style="margin-top:0">Import a full backup or your existing <code>trading_journal_data.json</code>. This replaces all data in the app${acc ? " and in OneDrive" : ""}.</p>
      <label class="btn"><${Icon} name="upload" size=${16} />Import JSON<input type="file" accept=".json,application/json" hidden onChange=${async (e) => {
        const f = e.target.files[0];
        e.target.value = "";
        if (!f) return;
        if (!(await confirmDialog({ title: "Replace all data?", message: `The current content will be replaced by "${f.name}".\nDownload a backup first if unsure.`, confirmText: "Replace", danger: true }))) return;
        try {
          importBackup(await readFileText(f));
          toast("Data imported");
        } catch (err) {
          toast(err.message, "err");
        }
      }} /></label>
    <//>

    <${Card} title="About">
      <div class="muted small-t">Trading Journal v${CONFIG.appVersion} · data stored in your OneDrive app folder (permission limited to that folder) · installable as an app from your browser menu.</div>
    <//>
  </div>`;
}
