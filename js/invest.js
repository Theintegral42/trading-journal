// Calculs du portefeuille d'investissement (méthode du coût moyen).
import { num, round2, todayStr, money } from "./util.js";

// ---------- devises ----------
// Chaque titre a sa devise (USD par défaut, ou CAD). En interne, les totaux sont calculés en USD
// (taux du jour USD->CAD), puis l'affichage peut être converti en CAD.
export const usdcad = (d) => {
  const r = Number(d.settings?.fx_usdcad);
  return r > 0 ? r : 0;
};
export const assetCur = (d, sym) => (d.inv_assets?.[sym]?.currency === "CAD" ? "CAD" : "USD");
export const hasCadAssets = (d) => Object.values(d.inv_assets || {}).some((a) => a?.currency === "CAD");
export function toUsd(d, sym, v) {
  if (assetCur(d, sym) !== "CAD") return v;
  const r = usdcad(d);
  return r ? v / r : v;
}
// Montant dans la devise native d'un titre (aucune conversion), ex. prix d'une action.
export const nat = (n, dec, cur) => {
  const s = money(Number(n) || 0, dec);
  return cur === "CAD" ? s.replace("$", "C$") : s;
};

export function fxOf(d) {
  const cur = d.settings.inv_currency === "CAD" ? "CAD" : "USD";
  const r = usdcad(d);
  return { cur, rate: cur === "CAD" && r ? r : 1, missing: (cur === "CAD" || hasCadAssets(d)) && !r, symbol: cur === "CAD" ? "C$" : "$" };
}
// Formateur d'affichage : n est en USD par défaut, ou en CAD si src = "CAD". Résultat dans la devise d'affichage.
export function moneyFx(d) {
  const { cur, rate } = fxOf(d);
  const r = usdcad(d);
  return (n, dec = 0, sign = false, src = "USD") => {
    let v = Number(n) || 0;
    if (src === "CAD" && r) v = v / r;
    const s = money(v * rate, dec, sign);
    return cur === "CAD" ? s.replace("$", "C$") : s;
  };
}

export const TYPES = ["Buy", "Sell", "Dividend"];
export const DEFAULT_ACCOUNTS = ["TFSA / CELI", "RRSP / REER", "Non-registered", "Other"];
export const DEFAULT_CLASSES = ["Equities", "ETF", "Bonds", "Real estate", "Gold", "Cash", "Other"];

export const normSymbol = (s) => String(s || "").trim().toUpperCase();
const sum = (arr, f) => arr.reduce((a, x) => a + f(x), 0);

// Montant en cash d'une transaction (achat = sortie, vente = entrée, dividende = montant saisi).
export function txTotal(t) {
  if (t.Type === "Dividend") return num(t.Amount);
  const gross = num(t.Quantity) * num(t.Price);
  return t.Type === "Buy" ? gross + num(t.Fees) : gross - num(t.Fees);
}

// Positions par symbole, calculées en rejouant les transactions dans l'ordre chronologique.
export function computePositions(data, account = null, upto = null) {
  const txs = data.inv_transactions
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (!account || t.Account === account) && (!upto || String(t.Date) <= upto))
    .sort((a, b) => String(a.t.Date).localeCompare(String(b.t.Date)) || a.i - b.i);
  const pos = new Map();
  for (const { t } of txs) {
    const sym = normSymbol(t.Symbol);
    if (!sym) continue;
    const p = pos.get(sym) ?? { symbol: sym, qty: 0, cost: 0, realized: 0, dividends: 0, fees: 0 };
    pos.set(sym, p);
    const q = num(t.Quantity), pr = num(t.Price), f = num(t.Fees);
    if (t.Type === "Buy") {
      p.qty += q;
      p.cost += q * pr + f;
      p.fees += f;
    } else if (t.Type === "Sell") {
      const avg = p.qty > 0 ? p.cost / p.qty : 0;
      p.realized += q * pr - f - avg * q;
      p.cost -= avg * q;
      p.qty -= q;
      p.fees += f;
      if (Math.abs(p.qty) < 1e-9) { p.qty = 0; p.cost = 0; }
    } else if (t.Type === "Dividend") {
      p.dividends += num(t.Amount);
    }
  }
  return [...pos.values()];
}

export function enrich(p, data) {
  const quote = data.inv_prices[p.symbol];
  const hasPrice = !!quote && Number.isFinite(Number(quote.price)) && quote.price !== "";
  const avg = p.qty > 0 ? p.cost / p.qty : 0;
  const price = hasPrice ? Number(quote.price) : avg; // sans prix : valorisé au coût
  const value = p.qty * price;
  // Champs sans suffixe = devise du titre ; champs en "U" = convertis en USD (pour les totaux).
  const currency = assetCur(data, p.symbol);
  const k = toUsd(data, p.symbol, 1);
  return {
    ...p, avg, price, hasPrice, priceDate: quote?.date || "", value, currency,
    pnl: value - p.cost,
    pnlPct: p.cost > 0 ? ((value - p.cost) / p.cost) * 100 : 0,
    class: data.inv_assets[p.symbol]?.class || "",
    valueU: value * k, costU: p.cost * k, pnlU: (value - p.cost) * k, realizedU: p.realized * k, dividendsU: p.dividends * k,
  };
}

// Tous les totaux renvoyés sont en USD (utiliser moneyFx pour l'affichage).
export function portfolio(data, account = null) {
  const all = computePositions(data, account).map((p) => enrich(p, data));
  const open = all.filter((p) => p.qty > 1e-9).sort((a, b) => b.valueU - a.valueU);
  const value = sum(open, (p) => p.valueU);
  const cost = sum(open, (p) => p.costU);
  open.forEach((p) => (p.weight = value ? (p.valueU / value) * 100 : 0));
  const realized = sum(all, (p) => p.realizedU);
  const dividends = sum(all, (p) => p.dividendsU);
  return {
    all, open, value, cost,
    fxMissing: !usdcad(data) && all.some((p) => p.currency === "CAD"),
    unrealized: value - cost,
    unrealizedPct: cost > 0 ? ((value - cost) / cost) * 100 : 0,
    realized, dividends,
    totalReturn: value - cost + realized + dividends,
    missingPrices: open.filter((p) => !p.hasPrice).length,
  };
}

// Valeur du portefeuille par classe d'actif (pour la répartition).
export function byClass(open) {
  const m = new Map();
  for (const p of open) m.set(p.class || "Unassigned", (m.get(p.class || "Unassigned") || 0) + p.valueU);
  return m;
}

// Enregistre la valeur du jour (utilisé pour la courbe de valeur du portefeuille).
export function snapshotToday(d) {
  const s = portfolio(d, null);
  if (s.value <= 0) return;
  const day = todayStr();
  d.inv_snapshots = d.inv_snapshots.filter((x) => x.date !== day);
  d.inv_snapshots.push({ date: day, value: round2(s.value), cost: round2(s.cost) });
  d.inv_snapshots.sort((a, b) => a.date.localeCompare(b.date));
}

// Capital investi (coût des positions ouvertes) après chaque date de transaction.
export function costSeries(data, account = null) {
  const dates = [...new Set(data.inv_transactions.filter((t) => !account || t.Account === account).map((t) => String(t.Date).slice(0, 10)))].sort();
  return dates.map((date) => ({ date, cost: round2(sum(computePositions(data, account, date).filter((p) => p.qty > 1e-9), (p) => toUsd(data, p.symbol, p.cost))) }));
}
