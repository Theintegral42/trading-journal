// État global + persistance locale + synchronisation OneDrive.
import { useState, useEffect } from "./lib/preact-htm.js";
import * as cloud from "./cloud.js";
import { idbGet, idbSet } from "./idb.js";
import { emptyData, normalize, serialize, parseJSONLoose, isEmptyData, computeMain } from "./data.js";
import { debounce, todayStr } from "./util.js";

export const store = {
  data: emptyData(),
  version: 0,
  ready: false,
  sync: { status: "local", msg: "", lastSync: null, etag: null, dirty: false, account: null, configured: false },
  conflict: null,
  ui: { section: "Trading", log: "Main", date: null, ...JSON.parse(localStorage.getItem("tj_ui") || "{}") },
};

const listeners = new Set();
const emit = () => listeners.forEach((f) => f());
export const subscribe = (f) => (listeners.add(f), () => listeners.delete(f));

export function useStore() {
  const [, set] = useState(0);
  useEffect(() => {
    const off = subscribe(() => set((x) => x + 1));
    set((x) => x + 1); // rattrape une mise à jour émise avant l'abonnement
    return off;
  }, []);
  return store;
}

export function setUI(patch) {
  Object.assign(store.ui, patch);
  localStorage.setItem("tj_ui", JSON.stringify({ section: store.ui.section, log: store.ui.log }));
  emit();
}

let mainCache = { v: -1, rows: [] };
export function mainRows() {
  if (mainCache.v !== store.version) mainCache = { v: store.version, rows: computeMain(store.data) };
  return mainCache.rows;
}

// ---------- persistance locale ----------
const persistLocal = debounce(() => {
  idbSet("state", { data: store.data, etag: store.sync.etag, dirty: store.sync.dirty, lastSync: store.sync.lastSync }).catch((e) => console.warn("IDB", e));
}, 500);

function setStatus(status, msg = "") {
  store.sync.status = status;
  store.sync.msg = msg;
  emit();
}

const schedulePush = debounce(() => syncNow(), 3000);

export function mutate(fn) {
  fn(store.data);
  store.version++;
  store.sync.dirty = true;
  if (store.sync.account) {
    if (!["conflict", "auth", "syncing"].includes(store.sync.status)) store.sync.status = "dirty";
    schedulePush();
  } else store.sync.status = "local";
  persistLocal();
  emit();
}

function replaceData(raw, { dirty }) {
  store.data = normalize(raw);
  store.version++;
  store.sync.dirty = dirty;
  persistLocal();
  emit();
}

// ---------- synchronisation ----------
let running = false;
let again = false;
const stamp = () => new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "");

async function pushNow(etag) {
  const v = store.version;
  const text = serialize(store.data);
  const item = await cloud.api.upload(text, etag);
  store.sync.etag = item.eTag;
  store.sync.lastSync = Date.now();
  if (store.version === v) store.sync.dirty = false;
  else again = true;
  persistLocal();
}

async function pullNow(meta) {
  const text = await cloud.api.download(meta);
  replaceData(parseJSONLoose(text), { dirty: false });
  store.sync.etag = meta.eTag;
  store.sync.lastSync = Date.now();
  persistLocal();
  return text;
}

async function dailyBackup(meta) {
  const day = todayStr();
  if (localStorage.getItem("tj_last_backup") === day) return;
  try {
    const text = await cloud.api.download(meta);
    await cloud.api.putBackup(`${day.replace(/-/g, "")}_daily.json`, text);
    localStorage.setItem("tj_last_backup", day);
  } catch (e) {
    console.warn("Backup quotidien impossible", e);
  }
}

export async function syncNow() {
  if (!store.sync.account) return;
  if (running) {
    again = true;
    return;
  }
  running = true;
  schedulePush.cancel();
  setStatus("syncing");
  try {
    do {
      again = false;
      const meta = await cloud.api.getMeta();
      const local = store.sync.dirty || (store.sync.etag == null && !isEmptyData(store.data));
      if (!meta) {
        if (local) await pushNow(null);
        else store.sync.etag = null;
      } else if (meta.eTag === store.sync.etag) {
        if (store.sync.dirty) await pushNow(meta.eTag);
        else dailyBackup(meta);
      } else if (!local) {
        await pullNow(meta);
        dailyBackup(meta);
      } else {
        const remoteText = await cloud.api.download(meta);
        store.conflict = { remoteText, meta };
        setStatus("conflict", "Different changes on OneDrive and on this device");
        return;
      }
    } while (again);
    store.sync.lastSync = Date.now();
    setStatus("synced");
  } catch (e) {
    if (e instanceof cloud.AuthRequired) setStatus("auth", "Session expired — sign in again");
    else if (e instanceof cloud.Offline || !navigator.onLine) setStatus("offline", "Offline — changes are kept on this device");
    else if (e instanceof cloud.Conflict) {
      try {
        const meta = await cloud.api.getMeta();
        const remoteText = await cloud.api.download(meta);
        store.conflict = { remoteText, meta };
        setStatus("conflict", "The file was modified elsewhere");
      } catch (e2) {
        setStatus("error", e2.message);
      }
    } else {
      console.error(e);
      setStatus("error", e.message || String(e));
    }
  } finally {
    running = false;
  }
}

export async function resolveConflict(choice) {
  const c = store.conflict;
  if (!c) return;
  setStatus("syncing");
  try {
    if (choice === "mine") {
      await cloud.api.putBackup(`${stamp()}_conflict-onedrive.json`, c.remoteText).catch(() => {});
      await pushNow(c.meta.eTag);
    } else {
      await cloud.api.putBackup(`${stamp()}_conflict-appareil.json`, serialize(store.data)).catch(() => {});
      replaceData(parseJSONLoose(c.remoteText), { dirty: false });
      store.sync.etag = c.meta.eTag;
      store.sync.lastSync = Date.now();
      persistLocal();
    }
    store.conflict = null;
    setStatus("synced");
  } catch (e) {
    store.conflict = null;
    setStatus("error", e.message);
    syncNow();
  }
}

// ---------- import / export ----------
export function exportText() {
  return serialize(store.data);
}

export function importBackup(text) {
  const raw = parseJSONLoose(text);
  if (!raw || typeof raw !== "object" || !raw.trade_logs) throw new Error("Invalid file: this is not a Trading Journal backup.");
  replaceData(raw, { dirty: true });
  if (store.sync.account) {
    store.sync.status = "dirty";
    syncNow();
  } else store.sync.status = "local";
  emit();
}

export const signIn = () => cloud.signIn();
export const signOut = async () => {
  await cloud.signOut();
};

// ---------- démarrage ----------
export async function init() {
  const saved = await idbGet("state").catch(() => null);
  if (saved?.data) {
    store.data = normalize(saved.data);
    store.sync.etag = saved.etag ?? null;
    store.sync.dirty = !!saved.dirty;
    store.sync.lastSync = saved.lastSync ?? null;
  }
  store.hasLocalData = !!saved?.data;
  store.sync.configured = cloud.isConfigured();
  try {
    store.sync.account = await cloud.initAuth();
  } catch (e) {
    console.warn("Auth init", e);
  }
  store.sync.status = store.sync.account ? (store.sync.dirty ? "dirty" : "synced") : "local";
  store.ready = true;
  emit();

  if (store.sync.account) syncNow();

  const poll = () => {
    if (document.visibilityState === "visible" && store.sync.account && !["conflict", "auth"].includes(store.sync.status)) syncNow();
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      persistLocal.flush();
      if (store.sync.dirty && store.sync.account) schedulePush.flush();
    } else poll();
  });
  window.addEventListener("online", poll);
  window.addEventListener("pagehide", () => persistLocal.flush());
  setInterval(poll, 60000);
}
