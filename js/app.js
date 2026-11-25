import { html, render, useState, useEffect } from "./lib/preact-htm.js";
import { store, useStore, init, resolveConflict, signIn, importBackup, syncNow } from "./store.js";
import { isEmptyData } from "./data.js";
import { Icon, DialogHost, Modal, toast } from "./ui/components.js";
import { SyncPill, SettingsView } from "./ui/settings.js";
import { DashboardView } from "./ui/dashboard.js";
import { JournalView } from "./ui/journal.js";
import { TradeLogView } from "./ui/tradelog.js";
import { NotesView } from "./ui/notes.js";
import { InvestmentView } from "./ui/investment.js";
import { startAutoRefresh } from "./quotes.js";
import { readFileText } from "./util.js";
import { getClientId } from "./config.js";

const PAGES = [
  { id: "dashboard", label: "Dashboard", icon: "dashboard", view: DashboardView },
  { id: "journal", label: "Journal", icon: "journal", view: JournalView },
  { id: "trades", label: "Trade Log", icon: "list", view: TradeLogView },
  { id: "notes", label: "Notes", icon: "notes", view: NotesView },
  { id: "invest", label: "Investment", icon: "briefcase", view: InvestmentView },
  { id: "settings", label: "Settings", icon: "settings", view: SettingsView },
];

function currentPage() {
  const h = location.hash.replace(/^#\/?/, "");
  return PAGES.find((p) => p.id === h) ? h : localStorage.getItem("tj_page") || "dashboard";
}

function Welcome({ onLocal }) {
  const configured = !!getClientId();
  return html`<div class="welcome">
    <div class="welcome-card">
      <div class="logo big"><${Icon} name="logo" size=${30} /></div>
      <h1>Trading Journal</h1>
      <p class="muted">Your journal, trades and stats in one place — stored in your own OneDrive and available on every device.</p>
      <div class="stack">
        ${configured
          ? html`<button class="btn primary block lg" onClick=${() => signIn()}><${Icon} name="cloud" size=${18} />Sign in with Microsoft</button>`
          : html`<div class="banner warn left"><${Icon} name="alert" size=${16} /><span>OneDrive sync is not configured yet. Follow <code>SETUP.md</code>, then add your client ID in Settings.</span></div>`}
        <label class="btn block lg"><${Icon} name="upload" size=${18} />Import my existing data (JSON)<input type="file" accept=".json" hidden onChange=${async (e) => {
          const f = e.target.files[0];
          if (!f) return;
          try {
            importBackup(await readFileText(f));
            localStorage.setItem("tj_local_only", "1");
            onLocal();
            toast("Data imported");
          } catch (err) {
            toast(err.message, "err");
          }
        }} /></label>
        <button class="btn ghost block" onClick=${() => (localStorage.setItem("tj_local_only", "1"), onLocal())}>Continue without sync (this device only)</button>
      </div>
    </div>
  </div>`;
}

function ConflictModal() {
  const c = store.conflict;
  if (!c) return null;
  return html`<${Modal} title="Sync conflict" onClose=${() => {}} small=${true}>
    <p class="muted" style="margin-top:0">Your data was modified on another device <em>and</em> on this one since the last sync. Choose which version to keep — the other one is saved as a backup in your OneDrive <code>backups</code> folder.</p>
    <div class="stack">
      <button class="btn primary block" onClick=${() => resolveConflict("theirs")}>Use the OneDrive version</button>
      <button class="btn block" onClick=${() => resolveConflict("mine")}>Keep this device's version</button>
    </div>
  <//>`;
}

function App() {
  const s = useStore();
  const [page, setPage] = useState(currentPage());
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const on = () => setPage(currentPage());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  const go = (id) => {
    localStorage.setItem("tj_page", id);
    history.replaceState(null, "", "#/" + id);
    setPage(id);
    window.scrollTo(0, 0);
  };

  if (!s.ready) return html`<div class="splash"><${Icon} name="logo" size=${34} /></div>`;

  const showWelcome = !s.hasLocalData && !s.sync.account && !localStorage.getItem("tj_local_only") && !started;
  if (showWelcome) return html`<${Welcome} onLocal=${() => setStarted(true)} /><${DialogHost} />`;

  const View = (PAGES.find((p) => p.id === page) || PAGES[0]).view;
  const authErr = sessionStorage.getItem("tj_auth_error");
  const emptyCloud = s.sync.account && s.sync.status === "synced" && s.sync.etag == null && isEmptyData(s.data);

  return html`<div class="app">
    <aside class="sidebar">
      <div class="brand"><div class="logo"><${Icon} name="logo" size=${20} /></div><span>Trading Journal</span></div>
      <nav>
        ${PAGES.filter((p) => p.id !== "settings").map((p) => html`<button class="nav-item ${page === p.id ? "active" : ""}" onClick=${() => go(p.id)}><${Icon} name=${p.icon} />${p.label}</button>`)}
      </nav>
      <div class="sidebar-foot">
        <${SyncPill} onClick=${() => (s.sync.account ? syncNow() : go("settings"))} />
        <button class="nav-item ${page === "settings" ? "active" : ""}" onClick=${() => go("settings")}><${Icon} name="settings" />Settings</button>
      </div>
    </aside>

    <header class="topbar">
      <div class="brand"><div class="logo"><${Icon} name="logo" size=${18} /></div><span>${(PAGES.find((p) => p.id === page) || PAGES[0]).label}</span></div>
      <${SyncPill} onClick=${() => (s.sync.account ? syncNow() : go("settings"))} />
    </header>

    <main class="main">
      ${s.sync.status === "auth" && html`<div class="banner err"><${Icon} name="alert" size=${16} /><span>Your Microsoft session expired. Your changes are safe on this device.</span><button class="btn small" onClick=${() => signIn()}>Sign in</button></div>`}
      ${s.sync.status === "error" && html`<div class="banner err"><${Icon} name="alert" size=${16} /><span>Sync error: ${s.sync.msg}</span><button class="btn small" onClick=${() => syncNow()}>Retry</button></div>`}
      ${s.sync.status === "offline" && html`<div class="banner warn"><${Icon} name="wifioff" size=${16} />You're offline. Changes are kept on this device and will sync automatically.</div>`}
      ${authErr && html`<div class="banner err"><${Icon} name="alert" size=${16} /><span>Sign-in failed: ${authErr}</span><button class="btn small" onClick=${() => (sessionStorage.removeItem("tj_auth_error"), setPage(page))}>Dismiss</button></div>`}
      ${emptyCloud && html`<div class="banner info"><${Icon} name="cloud" size=${16} /><span>Connected. Nothing in OneDrive yet — import your existing data in <button class="link" onClick=${() => go("settings")}>Settings</button>, or just start writing.</span></div>`}
      <${View} />
    </main>

    <nav class="tabbar">
      ${PAGES.map((p) => html`<button class="tab ${page === p.id ? "active" : ""}" aria-label=${p.label} onClick=${() => go(p.id)}><${Icon} name=${p.icon} size=${22} /><span>${p.label.replace("Trade Log", "Trades").replace("Investment", "Invest")}</span></button>`)}
    </nav>
    <${ConflictModal} />
    <${DialogHost} />
  </div>`;
}

if (window.Chart) {
  Chart.defaults.color = "#8b93a7";
  Chart.defaults.font.family = getComputedStyle(document.documentElement).getPropertyValue("--font") || "system-ui";
  Chart.defaults.borderColor = "rgba(255,255,255,0.06)";
}

render(html`<${App} />`, document.getElementById("root"));
init().then(startAutoRefresh);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch((e) => console.warn("SW", e)));
}
