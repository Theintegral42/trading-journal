export const pad = (n) => String(n).padStart(2, "0");
export const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayStr = () => fmtDate(new Date());

export function parseDate(s) {
  const [y, m, d] = String(s).slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(s, n) {
  const d = parseDate(s);
  d.setDate(d.getDate() + n);
  return fmtDate(d);
}

// Clé de semaine ISO (ex. 2026-W48) — identique à la logique Python d'origine.
export function weekKey(s) {
  const date = parseDate(s);
  const target = new Date(date.valueOf());
  const dayNr = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3); // jeudi de la semaine
  const year = target.getFullYear();
  const firstThursday = new Date(year, 0, 4);
  const ftDay = (firstThursday.getDay() + 6) % 7;
  firstThursday.setDate(firstThursday.getDate() - ftDay + 3);
  const week = 1 + Math.round((target - firstThursday) / 604800000);
  return `${year}-W${pad(week)}`;
}

export function num(v, def = 0) {
  if (v === null || v === undefined || v === "") return def;
  const x = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  return Number.isFinite(x) ? x : def;
}

export const round2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;

// ---------- devise d'affichage globale ----------
// Les données de trading sont saisies dans une devise de base (USD par défaut). money() les convertit
// automatiquement vers la devise choisie (USD / CAD). `factor` est calculé par le store (voir applyDisplay).
let DISP = { cur: "USD", base: "USD", factor: 1 };
export function setDisplay(cur, base, factor) {
  DISP = { cur, base, factor: factor > 0 ? factor : 1 };
}
export const displayCurrency = () => DISP.cur;
export const baseCurrency = () => DISP.base;
export const displayFactor = () => DISP.factor;
export const displaySymbol = () => (DISP.cur === "CAD" ? "C$" : "$");

// Formatage brut, sans conversion.
export function moneyRaw(n, dec = 0, sign = false) {
  const v = Number(n) || 0;
  const s = Math.abs(v).toLocaleString("en-US", { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const prefix = v < 0 ? "-" : sign && v > 0 ? "+" : "";
  return `${prefix}$${s}`;
}

// Montant de trading (devise de base) affiché dans la devise choisie.
export function money(n, dec = 0, sign = false) {
  const s = moneyRaw((Number(n) || 0) * DISP.factor, dec, sign);
  return DISP.cur === "CAD" ? s.replace("$", "C$") : s;
}

// Montant abrégé pour les petites cellules : 1830 -> +1.8k
export function compactMoney(n) {
  const v = (Number(n) || 0) * DISP.factor;
  const a = Math.abs(v);
  const s = a >= 1000 ? (a / 1000).toFixed(a >= 10000 ? 0 : 1) + "k" : String(Math.round(a));
  return (v < 0 ? "-" : v > 0 ? "+" : "") + s;
}

export function fmtR(n, sign = false) {
  const v = Number(n) || 0;
  return `${v > 0 && sign ? "+" : ""}${v.toFixed(2)}R`;
}

export function debounce(fn, ms) {
  let t;
  const wrapped = (...a) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
  wrapped.flush = (...a) => {
    clearTimeout(t);
    fn(...a);
  };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

export function downloadFile(name, text, mime = "application/json") {
  const blob = new Blob([text], { type: mime + ";charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function readFileText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function readFileBuffer(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(file);
  });
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

export function imgSrc(b64) {
  if (!b64) return "";
  if (b64.startsWith("data:")) return b64;
  let mime = "image/png";
  if (b64.startsWith("/9j/")) mime = "image/jpeg";
  else if (b64.startsWith("R0lGOD")) mime = "image/gif";
  else if (b64.startsWith("UklGR")) mime = "image/webp";
  return `data:${mime};base64,${b64}`;
}

// Réduit/compresse une image et renvoie du base64 sans préfixe.
export async function imageToB64(file, maxW = 1800) {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxW / bmp.width);
  const w = Math.round(bmp.width * scale);
  const h = Math.round(bmp.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  canvas.getContext("2d").drawImage(bmp, 0, 0, w, h);
  let url = file.type === "image/png" && file.size < 350000 ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.86);
  return url.split(",")[1];
}

// Mini rendu markdown (sûr : tout est échappé avant) pour les notes.
export function renderMarkdown(src) {
  const lines = escapeHtml(src || "").split("\n");
  const out = [];
  let inList = false;
  const inline = (t) =>
    t
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  const closeList = () => {
    if (inList) {
      out.push("</ul>");
      inList = false;
    }
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      closeList();
      out.push(`<h${m[1].length + 1}>${inline(m[2])}</h${m[1].length + 1}>`);
    } else if ((m = line.match(/^\s*[-*•]\s+(.*)$/))) {
      if (!inList) {
        out.push("<ul>");
        inList = true;
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if (/^---+$/.test(line)) {
      closeList();
      out.push("<hr/>");
    } else if (line.trim() === "") {
      closeList();
      out.push("<div class='md-gap'></div>");
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  return out.join("");
}

// Parser CSV minimal (guillemets, séparateur , ou ;)
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const first = text.split(/\r?\n/)[0] || "";
  const delim = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [], cur = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(cur); cur = ""; }
    else if (c === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else if (c !== "\r") cur += c;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  const clean = rows.filter((r) => r.some((x) => String(x).trim() !== ""));
  if (!clean.length) return [];
  const head = clean[0].map((h) => h.trim());
  return clean.slice(1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])));
}

export function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("Impossible de charger " + src));
    document.head.appendChild(s);
  });
}
