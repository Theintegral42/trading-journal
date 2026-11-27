// Modèle de données — 100 % compatible avec le JSON de l'app Streamlit d'origine.
import { num, round2, parseDate, fmtDate } from "./util.js";
import { DEFAULT_ACCOUNTS, DEFAULT_CLASSES } from "./invest.js";
import { defaultPlan, normPlan } from "./plan.js";

export const COLUMNS = ["Date", "Symbole", "Setup", "Direction", "Risque", "RR", "Résultat", "PnL", "R", "Note"];
export const DEFAULT_TEMPLATE = "Date: {date}\n\nHTF Context: \nLevels: \n\nLong scenario if: \nShort scenario if: \n\nNote: \n";
export const HARDCODED_FIELDS = ["Scenario played", "Plan followed", "Result", "Observation"];

export function emptyData() {
  return {
    trade_logs: { Principal: [] },
    journals: {},
    weekly_news: {},
    journal_template: DEFAULT_TEMPLATE,
    trading_notes: { General: "" },
    log_targets: {},
    setup_options: ["Open", "Macro", "Sb"],
    risk_options: [0.25, 0.5, 0.75, 1],
    rr_options: [2, 3, 4, 5],
    log_linked: {},
    inv_journal: "",
    inv_transactions: [],
    inv_prices: {},
    inv_assets: {},
    inv_targets: {},
    inv_snapshots: [],
    inv_accounts: [...DEFAULT_ACCOUNTS],
    inv_classes: [...DEFAULT_CLASSES],
    plan: defaultPlan(),
    settings: { r_base: 1500 },
  };
}

// Le JSON écrit par Python contient des NaN (invalides en JS) → on les remplace par null
// sans toucher au contenu des chaînes (les images base64 peuvent contenir "NaN").
const TOKENS = /"[^"\\]*(?:\\.[^"\\]*)*"|-?Infinity|NaN/g;
export function parseJSONLoose(text) {
  if (/NaN|Infinity/.test(text)) text = text.replace(TOKENS, (m) => (m[0] === '"' ? m : "null"));
  return JSON.parse(text);
}

export function normDirection(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "buy" || s === "achat" || s === "long") return "Buy";
  if (s === "sell" || s === "vente" || s === "short") return "Sell";
  return "";
}

export const dayOf = (row) => String(row.Date ?? "").slice(0, 10);

function normalizeDate(v) {
  if (v instanceof Date && !isNaN(v)) return fmtDate(v);
  const s = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  const t = Date.parse(s);
  return isNaN(t) ? s : fmtDate(new Date(t));
}

export function computeR(pnl, risk, base = 1500) {
  return risk ? round2(num(pnl) / (num(risk) * base)) : 0;
}

export function normRow(r, base = 1500) {
  const row = { ...r };
  row.Date = normalizeDate(r.Date);
  for (const c of ["Symbole", "Setup", "Direction", "Résultat", "Note"]) row[c] = r[c] == null || (typeof r[c] === "number" && isNaN(r[c])) ? "" : String(r[c]);
  row.Symbole = row.Symbole || "NQ";
  row.Risque = r.Risque == null || r.Risque === "" ? null : num(r.Risque, null);
  row.RR = r.RR == null || r.RR === "" ? null : num(r.RR, null);
  row.PnL = num(r.PnL);
  row.R = r.R == null || r.R === "" ? computeR(row.PnL, row.Risque, base) : num(r.R);
  if (!row.Résultat) row.Résultat = row.PnL > 0 ? "W" : row.PnL < 0 ? "L" : "";
  return row;
}

export function normalize(raw) {
  const d = emptyData();
  const base = num(raw?.settings?.r_base, 1500) || 1500;
  d.settings = { ...d.settings, ...(raw.settings || {}), r_base: base };
  d.trade_logs = {};
  for (const [k, v] of Object.entries(raw.trade_logs || {})) {
    if (k === "Main") continue; // Main est recalculé à partir des autres logs
    d.trade_logs[k] = (Array.isArray(v) ? v : []).map((r) => normRow(r, base));
  }
  if (!Object.keys(d.trade_logs).length) d.trade_logs = { Principal: [] };
  d.journals = raw.journals && typeof raw.journals === "object" ? raw.journals : {};
  d.weekly_news = raw.weekly_news || {};
  d.journal_template = raw.journal_template || DEFAULT_TEMPLATE;
  d.trading_notes = raw.trading_notes && Object.keys(raw.trading_notes).length ? raw.trading_notes : { General: "" };
  d.log_targets = raw.log_targets || {};
  if (raw.setup_options?.length) d.setup_options = raw.setup_options;
  if (raw.risk_options?.length) d.risk_options = raw.risk_options.map(Number);
  if (raw.rr_options?.length) d.rr_options = raw.rr_options.map(Number);
  d.log_linked = raw.log_linked || {};
  d.inv_journal = raw.inv_journal || "";
  d.inv_transactions = Array.isArray(raw.inv_transactions) ? raw.inv_transactions : [];
  // migration : l'ancienne liste de positions devient des achats
  if (!d.inv_transactions.length && Array.isArray(raw.inv_positions)) {
    d.inv_transactions = raw.inv_positions
      .filter((p) => p && p.Symbol)
      .map((p) => ({ Date: String(p.Date || "").slice(0, 10), Type: "Buy", Symbol: String(p.Symbol).toUpperCase(), Quantity: num(p.Quantity), Price: num(p.Price), Fees: 0, Amount: round2(num(p.Quantity) * num(p.Price)), Account: "", Note: p.Note || "" }));
  }
  d.inv_prices = raw.inv_prices && typeof raw.inv_prices === "object" ? raw.inv_prices : {};
  d.inv_assets = raw.inv_assets && typeof raw.inv_assets === "object" ? raw.inv_assets : {};
  d.inv_targets = raw.inv_targets && typeof raw.inv_targets === "object" ? raw.inv_targets : {};
  d.inv_snapshots = Array.isArray(raw.inv_snapshots) ? raw.inv_snapshots : [];
  if (raw.inv_accounts?.length) d.inv_accounts = raw.inv_accounts;
  if (raw.inv_classes?.length) d.inv_classes = raw.inv_classes;
  d.plan = normPlan(raw.plan);
  return d;
}

// Log "Main" : union des logs inclus (doublons exacts entre logs retirés), trié par date.
export function computeMain(data) {
  const taken = new Map();
  const rows = [];
  for (const [name, list] of Object.entries(data.trade_logs)) {
    if (name === "Main" || data.log_linked[name] === false) continue;
    const local = new Map();
    for (const r of list) {
      const key = JSON.stringify(COLUMNS.map((c) => r[c] ?? null));
      const c = (local.get(key) || 0) + 1;
      local.set(key, c);
      if (c > (taken.get(key) || 0)) {
        taken.set(key, c);
        rows.push(r);
      }
    }
  }
  return rows.map((r, i) => ({ r, i })).sort((a, b) => dayOf(a.r).localeCompare(dayOf(b.r)) || a.i - b.i).map((x) => x.r);
}

export function withCumulative(rows) {
  let cum = 0;
  return rows.map((r) => {
    cum += num(r.PnL);
    return { ...r, "Cumulative PnL": round2(cum) };
  });
}

export function getLogRows(data, name) {
  return name === "Main" ? computeMain(data) : data.trade_logs[name] || [];
}

export function logNames(data) {
  return ["Main", ...Object.keys(data.trade_logs).filter((k) => k !== "Main")];
}

// Sérialisation au format historique (compatible avec l'ancienne app Python).
export function serialize(data) {
  const trade_logs = { Main: withCumulative(computeMain(data)) };
  for (const [k, rows] of Object.entries(data.trade_logs)) {
    trade_logs[k] = rows.some((r) => "Cumulative PnL" in r) ? withCumulative(rows) : rows;
  }
  return JSON.stringify({
    trade_logs,
    journals: data.journals,
    weekly_news: data.weekly_news,
    journal_template: data.journal_template,
    trading_notes: data.trading_notes,
    log_targets: data.log_targets,
    setup_options: data.setup_options,
    risk_options: data.risk_options,
    rr_options: data.rr_options,
    log_linked: data.log_linked,
    inv_journal: data.inv_journal,
    inv_transactions: data.inv_transactions,
    inv_prices: data.inv_prices,
    inv_assets: data.inv_assets,
    inv_targets: data.inv_targets,
    inv_snapshots: data.inv_snapshots,
    inv_accounts: data.inv_accounts,
    inv_classes: data.inv_classes,
    plan: data.plan,
    settings: data.settings,
  });
}

export function isEmptyData(d) {
  const noTrades = Object.values(d.trade_logs).every((l) => !l.length);
  return noTrades && !Object.keys(d.journals).length && Object.values(d.trading_notes).every((t) => !t) && !d.inv_transactions.length && !d.inv_journal;
}

// ---------- Journal ----------
export function templateSections(tpl, date) {
  return String(tpl || "")
    .replace(/\{date\}/g, date)
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.endsWith(":"))
    .map((l) => l.slice(0, -1).trim())
    .filter((s) => s && !HARDCODED_FIELDS.includes(s) && s.toLowerCase() !== "date");
}

export function composeNotes(sections, fields) {
  return sections.map((s) => `${s}:\n${fields[s] || ""}`).join("\n\n");
}

export function journalFilled(day, sections) {
  if (!day) return false;
  const f = day.fields || {};
  return [...sections, ...HARDCODED_FIELDS].some((s) => String(f[s] || "").trim());
}

// ---------- Stats ----------
export function computeStats(rows) {
  const n = rows.length;
  let cum = 0, peak = 0, maxDd = 0, ath = 0;
  let wins = 0, sumWin = 0, sumLoss = 0, nLoss = 0, grossWin = 0, grossLoss = 0;
  let totalR = 0, bestR = -Infinity, worstR = Infinity;
  let streakW = 0, streakL = 0, maxW = 0, maxL = 0;
  for (const r of rows) {
    const p = num(r.PnL), R = num(r.R);
    cum += p;
    ath = Math.max(ath, cum);
    peak = Math.max(peak, cum);
    maxDd = Math.min(maxDd, cum - peak);
    totalR += R;
    bestR = Math.max(bestR, R);
    worstR = Math.min(worstR, R);
    if (p > 0) { grossWin += p; } else if (p < 0) { grossLoss += p; }
    if (r["Résultat"] === "W") {
      wins++; sumWin += p; streakW++; streakL = 0; maxW = Math.max(maxW, streakW);
    } else {
      nLoss++; sumLoss += p; streakL++; streakW = 0; maxL = Math.max(maxL, streakL);
    }
  }
  const losses = n - wins;
  const wr = n ? (wins / n) * 100 : 0;
  const avgWin = wins ? sumWin / wins : 0;
  const avgLoss = losses ? sumLoss / losses : 0;
  return {
    n, wins, losses, wr, total: cum, ath, maxDd,
    totalR, avgR: n ? totalR / n : 0,
    bestR: n ? bestR : 0, worstR: n ? worstR : 0,
    avgWin, avgLoss,
    pf: grossLoss !== 0 ? Math.abs(grossWin / grossLoss) : grossWin > 0 ? Infinity : 0,
    expectancy: n ? (wr / 100) * avgWin + (1 - wr / 100) * avgLoss : 0,
    maxWinStreak: maxW, maxLossStreak: maxL,
  };
}

export function groupStats(rows, keyFn) {
  const g = new Map();
  rows.forEach((r) => {
    const k = keyFn(r);
    if (k == null || k === "") return;
    if (!g.has(k)) g.set(k, []);
    g.get(k).push(r);
  });
  return [...g.entries()].map(([key, list]) => {
    const wins = list.filter((r) => r["Résultat"] === "W").length;
    return { key, trades: list.length, wr: (wins / list.length) * 100, pnl: list.reduce((a, r) => a + num(r.PnL), 0), r: list.reduce((a, r) => a + num(r.R), 0) };
  });
}

export function periodFilter(rows, period) {
  if (period === "All") return rows;
  const now = new Date();
  const today = fmtDate(now);
  return rows.filter((r) => {
    const d = dayOf(r);
    if (!d) return false;
    if (period === "This Week") {
      const dt = parseDate(d);
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
      return dt >= start && d <= today;
    }
    if (period === "This Month") return d.slice(0, 7) === today.slice(0, 7);
    if (period === "Last 30 days") return parseDate(d) >= new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30);
    if (period === "YTD") return d.slice(0, 4) === today.slice(0, 4);
    return true;
  });
}
