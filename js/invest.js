// Calculs du portefeuille d'investissement (méthode du coût moyen).
import { num, round2, todayStr } from "./util.js";

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
  return {
    ...p, avg, price, hasPrice, priceDate: quote?.date || "", value,
    pnl: value - p.cost,
    pnlPct: p.cost > 0 ? ((value - p.cost) / p.cost) * 100 : 0,
    class: data.inv_assets[p.symbol]?.class || "",
  };
}

export function portfolio(data, account = null) {
  const all = computePositions(data, account).map((p) => enrich(p, data));
  const open = all.filter((p) => p.qty > 1e-9).sort((a, b) => b.value - a.value);
  const value = sum(open, (p) => p.value);
  const cost = sum(open, (p) => p.cost);
  open.forEach((p) => (p.weight = value ? (p.value / value) * 100 : 0));
  const realized = sum(all, (p) => p.realized);
  const dividends = sum(all, (p) => p.dividends);
  return {
    all, open, value, cost,
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
  for (const p of open) m.set(p.class || "Unassigned", (m.get(p.class || "Unassigned") || 0) + p.value);
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
  return dates.map((date) => ({ date, cost: round2(sum(computePositions(data, account, date).filter((p) => p.qty > 1e-9), (p) => p.cost)) }));
}
