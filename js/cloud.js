// Connexion Microsoft (MSAL) + lecture/écriture du fichier JSON dans le dossier d'application OneDrive.
// Permission demandée : Files.ReadWrite.AppFolder (accès UNIQUEMENT à un dossier dédié, rien d'autre).
import { CONFIG, getClientId } from "./config.js";

const SCOPES = ["Files.ReadWrite.AppFolder", "User.Read"];
const GRAPH = "https://graph.microsoft.com/v1.0/me/drive/special/approot";

let pca = null;
let account = null;

export class AuthRequired extends Error {}
export class Conflict extends Error {}
export class Offline extends Error {}

export function isConfigured() {
  return !!getClientId();
}
export function getAccount() {
  return account;
}

export async function initAuth() {
  const clientId = getClientId();
  if (!clientId || !window.msal) return null;
  const redirectUri = location.origin + location.pathname.replace(/index\.html$/, "");
  pca = new window.msal.PublicClientApplication({
    auth: { clientId, authority: CONFIG.authority, redirectUri, postLogoutRedirectUri: redirectUri },
    cache: { cacheLocation: "localStorage" },
  });
  await pca.initialize();
  const res = await pca.handleRedirectPromise().catch((e) => {
    console.warn("Auth redirect error", e);
    sessionStorage.setItem("tj_auth_error", e.message || String(e));
    return null;
  });
  account = res?.account || pca.getActiveAccount() || pca.getAllAccounts()[0] || null;
  if (account) pca.setActiveAccount(account);
  return account;
}

export async function signIn() {
  if (!pca) throw new Error("Missing client ID (see Settings).");
  await pca.loginRedirect({ scopes: SCOPES, prompt: "select_account" });
}

export async function signOut() {
  if (!pca || !account) return;
  const acc = account;
  account = null;
  await pca.logoutRedirect({ account: acc });
}

async function getToken() {
  if (!pca || !account) throw new AuthRequired("Not signed in");
  try {
    const r = await pca.acquireTokenSilent({ scopes: SCOPES, account });
    return r.accessToken;
  } catch (e) {
    throw new AuthRequired(e.message || "Session expired");
  }
}

async function graph(path, opts = {}, retry = 2) {
  const token = await getToken();
  let res;
  try {
    res = await fetch(path.startsWith("http") ? path : GRAPH + path, {
      ...opts,
      headers: { Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    });
  } catch (e) {
    throw new Offline(e.message);
  }
  if ((res.status === 429 || res.status === 503) && retry > 0) {
    const wait = (parseInt(res.headers.get("Retry-After")) || 2) * 1000;
    await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
    return graph(path, opts, retry - 1);
  }
  if (res.status === 401) throw new AuthRequired("Unauthorized");
  return res;
}

const enc = (name) => encodeURIComponent(name);

export async function getMeta() {
  const res = await graph(`:/${enc(CONFIG.fileName)}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`OneDrive ${res.status}`);
  return res.json(); // { eTag, lastModifiedDateTime, size, @microsoft.graph.downloadUrl }
}

export async function download(meta) {
  const url = meta["@microsoft.graph.downloadUrl"];
  let res;
  try {
    res = url ? await fetch(url) : await graph(`:/${enc(CONFIG.fileName)}:/content`);
  } catch (e) {
    throw new Offline(e.message);
  }
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  return res.text();
}

// Écrit le fichier. Si etag est fourni, refuse l'écriture si le fichier a changé entre-temps.
export async function upload(text, etag) {
  const headers = { "Content-Type": "application/json" };
  if (etag) headers["If-Match"] = etag;
  const res = await graph(`:/${enc(CONFIG.fileName)}:/content`, { method: "PUT", headers, body: text });
  if (res.status === 412) throw new Conflict("The file was modified elsewhere");
  if (!res.ok) throw new Error(`OneDrive write failed (${res.status})`);
  return res.json();
}

export async function putBackup(name, text) {
  const res = await graph(`:/${enc(CONFIG.backupsFolder)}/${enc(name)}:/content`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: text,
  });
  if (!res.ok) throw new Error(`Backup failed (${res.status})`);
  await pruneBackups().catch(() => {});
}

async function pruneBackups() {
  const res = await graph(`:/${enc(CONFIG.backupsFolder)}:/children?$select=id,name&$top=200`);
  if (!res.ok) return;
  const items = (await res.json()).value || [];
  items.sort((a, b) => b.name.localeCompare(a.name));
  for (const it of items.slice(CONFIG.keepBackups)) {
    await graph(`/items/${it.id}`, { method: "DELETE" }).catch(() => {});
  }
}

// Single entry point for OneDrive access (replaceable in tests).
export const api = { getMeta, download, upload, putBackup };
