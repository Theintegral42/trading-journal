// Plan de croissance du compte : paliers (compte cible -> risque max par trade), cases à cocher, progression.
import { num, round2 } from "./util.js";

// Paliers par défaut (modifiables dans l'app).
const DEFAULT_TIERS = [
  [15000, "Point de départ"],
  [20000, "Premier palier"],
  [30000, "Doubler le risque $"],
  [50000, "Palier confortable"],
  [75000, ""],
  [100000, "Gros palier"],
];

export const uid = () => Math.random().toString(36).slice(2, 9);

export function defaultPlan() {
  return {
    risk_pct: 5,
    start_balance: 15000,
    source: "Main", // "Main", un nom de log, ou "manual"
    manual_balance: 15000,
    rules: "",
    tiers: DEFAULT_TIERS.map(([target, label]) => ({ id: uid(), target, risk: null, label, done: false, date: "", note: "" })),
  };
}

export function normPlan(raw) {
  const base = defaultPlan();
  if (!raw || typeof raw !== "object") return base;
  const start = num(raw.start_balance, base.start_balance);
  const tiers = Array.isArray(raw.tiers)
    ? raw.tiers
        .filter((t) => t && Number.isFinite(Number(t.target)))
        .map((t) => ({
          id: t.id || uid(),
          target: num(t.target),
          risk: t.risk === null || t.risk === undefined || t.risk === "" ? null : num(t.risk),
          label: t.label || "",
          done: !!t.done,
          date: t.date || "",
          note: t.note || "",
        }))
    : base.tiers;
  return {
    risk_pct: num(raw.risk_pct, 5) || 5,
    start_balance: start,
    source: raw.source || "Main",
    manual_balance: num(raw.manual_balance, start),
    rules: raw.rules || "",
    tiers,
  };
}

// Risque max par trade d'un palier : valeur personnalisée, sinon % du compte cible.
export const tierRisk = (plan, t) => (t.risk != null ? t.risk : round2((t.target * plan.risk_pct) / 100));

// Solde du compte et courbe (solde de départ + P&L cumulé du log choisi). `rows` : trades triés par date.
export function balanceOf(plan, rows) {
  if (plan.source === "manual") return { balance: plan.manual_balance, series: [] };
  let bal = plan.start_balance;
  const series = [{ date: "", bal, pnl: 0 }];
  for (const r of rows) {
    const pnl = num(r.PnL);
    bal += pnl;
    series.push({ date: String(r.Date || "").slice(0, 10), bal: round2(bal), pnl });
  }
  return { balance: round2(bal), series };
}

// Situation par rapport aux paliers.
export function analyze(plan, balance) {
  const tiers = [...plan.tiers].sort((a, b) => a.target - b.target);
  const done = tiers.filter((t) => t.done);
  const current = done.length ? done[done.length - 1] : null; // dernier palier confirmé (coché)
  const next = tiers.find((t) => !t.done && (!current || t.target > current.target)) || null;
  const riskTier = current || tiers[0] || null; // sans palier coché : on applique le premier palier
  const from = current ? current.target : plan.start_balance;
  const pct = next && next.target > from ? Math.min(Math.max((balance - from) / (next.target - from), 0), 1) : next ? 0 : 1;
  const ready = tiers.filter((t) => !t.done && balance >= t.target); // atteints mais pas encore cochés
  return { tiers, current, next, riskTier, riskNow: riskTier ? tierRisk(plan, riskTier) : 0, pct, ready };
}
