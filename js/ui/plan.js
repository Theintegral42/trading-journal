import { html, useState } from "../lib/preact-htm.js";
import { useStore, mutate, mainRows } from "../store.js";
import { dayOf, logNames } from "../data.js";
import { money, num, round2, todayStr, displayFactor, displaySymbol, baseCurrency } from "../util.js";
import { uid, tierRisk, balanceOf, analyze } from "../plan.js";
import { Icon, Card, Modal, Field, Select, TextArea, ChartCanvas, toast, confirmDialog } from "./components.js";

const GREEN = "#22c55e", BLUE = "#60a5fa", GREY = "#64748b", AMBER = "#fbbf24";
const tone = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

function Kpi({ label, value, tone: t = "", sub }) {
  return html`<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${t}">${value}</div>${sub && html`<div class="kpi-sub">${sub}</div>`}</div>`;
}

// Dessine le libellé de chaque palier sur le graphique (à droite de la ligne).
const tierLabels = {
  id: "tierLabels",
  afterDatasetsDraw(chart) {
    const { ctx, chartArea: a, scales } = chart;
    chart.data.datasets.forEach((ds) => {
      if (!ds._label) return;
      const y = scales.y.getPixelForValue(ds._value);
      if (y < a.top || y > a.bottom) return;
      ctx.save();
      ctx.font = "600 11px system-ui, sans-serif";
      ctx.textAlign = "right";
      ctx.fillStyle = ds._color;
      ctx.fillText(ds._label, a.right - 6, y - 5);
      ctx.restore();
    });
  },
};

export function PlanView() {
  const s = useStore();
  const d = s.data;
  const plan = d.plan;
  const [edit, setEdit] = useState(null); // { id | null }
  const [settings, setSettings] = useState(false);

  const src = plan.source === "none" || plan.source === "manual" || plan.source === "Main" || d.trade_logs[plan.source] ? plan.source : "none";
  const track = src !== "none"; // false : pas de solde, on avance en cochant les paliers
  const rows = (src === "manual" || src === "none" ? [] : src === "Main" ? mainRows() : d.trade_logs[src] || [])
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => dayOf(r))
    .sort((a, b) => dayOf(a.r).localeCompare(dayOf(b.r)) || a.i - b.i)
    .map((x) => x.r);
  const { balance, series } = balanceOf({ ...plan, source: src }, rows);
  const an = analyze(plan, balance);
  const F = displayFactor();
  const growth = plan.start_balance ? ((balance - plan.start_balance) / plan.start_balance) * 100 : 0;
  const doneCount = an.tiers.filter((t) => t.done).length;
  const ready = track ? an.ready[an.ready.length - 1] : null; // plus haut palier atteint mais pas encore coché

  const toggle = (id) =>
    mutate((x) => {
      const t = x.plan.tiers.find((t) => t.id === id);
      t.done = !t.done;
      t.date = t.done ? todayStr() : "";
    });
  const remove = async (t) => {
    if (await confirmDialog({ title: "Delete milestone", message: `Remove the ${money(t.target, 0)} milestone?`, confirmText: "Delete", danger: true })) mutate((x) => (x.plan.tiers = x.plan.tiers.filter((y) => y.id !== t.id)));
  };

  // --- graphique : courbe du solde + lignes des paliers pertinents ---
  const minBal = series.length ? Math.min(...series.map((p) => p.bal)) : balance;
  const upper = Math.max(an.next ? an.next.target : 0, balance);
  const shown = an.tiers.filter((t) => t.target >= minBal * 0.9 && t.target <= upper);
  const labels = series.map((_, i) => (i === 0 ? "Start" : i));
  const datasets = [
    {
      label: "Balance", data: series.map((p) => round2(p.bal * F)), borderColor: BLUE, borderWidth: 2.5, tension: 0.25, fill: true,
      pointRadius: series.length > 60 ? 0 : 3, pointBackgroundColor: BLUE, pointBorderColor: "#141821",
      backgroundColor: (c) => {
        const a = c.chart.chartArea;
        if (!a) return "transparent";
        const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
        g.addColorStop(0, "rgba(96,165,250,0.32)");
        g.addColorStop(1, "rgba(96,165,250,0)");
        return g;
      },
    },
    ...shown.map((t) => {
      const color = t.done ? GREEN : an.next && t.id === an.next.id ? AMBER : GREY;
      return {
        label: "tier", data: series.map(() => round2(t.target * F)), borderColor: color, borderDash: [6, 5], borderWidth: 1.5, pointRadius: 0, fill: false,
        _label: `${money(t.target, 0)} · risk ${money(tierRisk(plan, t), 0)}`, _value: round2(t.target * F), _color: color,
      };
    }),
  ];

  return html`<div class="page">
    <div class="page-head">
      <div><h1>Plan</h1><div class="muted">Scale your account milestone by milestone</div></div>
      <div class="row gap wrap">
        <button class="btn" onClick=${() => setSettings(true)}><${Icon} name="settings" size=${16} />Plan settings</button>
        <button class="btn primary" onClick=${() => setEdit({ id: null })}><${Icon} name="plus" size=${16} />Milestone</button>
      </div>
    </div>

    ${ready && html`<div class="banner ok"><${Icon} name="target" size=${16} /><span>Your balance reached <strong>${money(ready.target, 0)}</strong>${ready.label ? " (" + ready.label + ")" : ""}. Tick it to unlock a max risk of <strong>${money(tierRisk(plan, ready), 0)}</strong> per trade.</span><button class="btn small" onClick=${() => toggle(ready.id)}>Mark as reached</button></div>`}

    <div class="kpi-grid">
      ${track && html`<${Kpi} label="Account balance" value=${money(balance, 0)} sub=${`${growth >= 0 ? "+" : ""}${growth.toFixed(1)}% since ${money(plan.start_balance, 0)}`} tone=${tone(growth)} />`}
      <${Kpi} label="Max risk / trade now" value=${money(an.riskNow, 0)} sub=${an.riskTier ? (track ? `${balance ? ((an.riskNow / balance) * 100).toFixed(1) : 0}% of balance · ` : "") + `${money(an.riskTier.target, 0)} milestone` : "Add a milestone"} />
      <${Kpi} label="Current milestone" value=${an.current ? money(an.current.target, 0) : "—"} sub=${an.current ? an.current.label || "Reached" : "None ticked yet"} />
      <${Kpi} label="Next milestone" value=${an.next ? money(an.next.target, 0) : "Done"} sub=${an.next ? (track ? (balance >= an.next.target ? `Reached — tick it to unlock risk ${money(tierRisk(plan, an.next), 0)}` : `${money(an.next.target - balance, 0)} to go · risk ${money(tierRisk(plan, an.next), 0)}`) : `Risk ${money(tierRisk(plan, an.next), 0)} once ticked`) : "All milestones reached"} />
      ${!track && html`<${Kpi} label="Milestones reached" value=${`${doneCount} / ${an.tiers.length}`} sub=${an.tiers.length ? `${((doneCount / an.tiers.length) * 100).toFixed(0)}% of the plan` : ""} />`}
    </div>

    ${track && an.next && html`<div class="card plan-progress">
      <div class="row between wrap gap-s"><strong>Progress to ${money(an.next.target, 0)}</strong><span class="strong">${(an.pct * 100).toFixed(0)}%</span></div>
      <div class="bar"><span style=${{ width: an.pct * 100 + "%" }}></span></div>
      <div class="row between small-t muted"><span>${money(an.current ? an.current.target : plan.start_balance, 0)}</span><span>${money(an.next.target, 0)}</span></div>
    </div>`}
    ${!track && an.tiers.length > 0 && html`<div class="card plan-progress">
      <div class="row between wrap gap-s"><strong>Plan progress</strong><span class="strong">${doneCount} / ${an.tiers.length}</span></div>
      <div class="bar"><span style=${{ width: (doneCount / an.tiers.length) * 100 + "%" }}></span></div>
    </div>`}

    <div class="dash-grid">
      <${Card} title="Milestones" class="span-2" pad=${false}>
        ${an.tiers.length
          ? html`<div class="tiers">${an.tiers.map((t) => {
              const isNext = an.next && t.id === an.next.id;
              const reached = track && !t.done && balance >= t.target;
              const cls = t.done ? "done" : reached ? "ready" : isNext ? "next" : "locked";
              return html`<div class="tier ${cls}">
                <button class="tick ${t.done ? "on" : ""}" aria-label=${t.done ? "Untick milestone" : "Tick milestone"} aria-pressed=${t.done} onClick=${() => toggle(t.id)}>${t.done && html`<${Icon} name="check" size=${18} />`}</button>
                <div class="tier-main">
                  <div class="tier-target">${money(t.target, 0)}</div>
                  <div class="muted small-t">Max risk <strong>${money(tierRisk(plan, t), 0)}</strong>${t.risk != null ? " (custom)" : ` (${plan.risk_pct}%)`}</div>
                </div>
                <div class="tier-body">
                  <div class="strong">${t.label || html`<span class="muted">No title</span>`}</div>
                  ${t.note && html`<div class="muted small-t tier-note">${t.note}</div>`}
                  ${t.done && t.date && html`<div class="muted small-t">Reached ${t.date}</div>`}
                  ${track && isNext && !reached && html`<div class="bar thin"><span style=${{ width: an.pct * 100 + "%" }}></span></div>`}
                </div>
                <span class="pill ${t.done ? "buy" : reached ? "warn" : isNext ? "info" : ""}">${t.done ? "Reached" : reached ? "Confirm" : isNext ? "Next" : "Locked"}</span>
                <div class="actions"><button class="icon-btn" aria-label="Edit" onClick=${() => setEdit({ id: t.id })}><${Icon} name="edit" size=${16} /></button><button class="icon-btn" aria-label="Delete" onClick=${() => remove(t)}><${Icon} name="trash" size=${16} /></button></div>
              </div>`;
            })}</div>`
          : html`<div class="pad muted">No milestones yet. Use the Milestone button to add your first one.</div>`}
      <//>

      <${Card} title="Rules & conditions" actions=${html`<span class="muted small-t">When to scale up, when to step back</span>`}>
        <${TextArea} value=${plan.rules} minRows=${8} placeholder="e.g. Only move to the next tier after 2 consecutive green months. Drop back one tier if drawdown exceeds 10%." onInput=${(v) => mutate((x) => (x.plan.rules = v))} />
      <//>

      ${track && html`<${Card} title="Balance vs milestones" class="span-2">
        ${series.length > 1
          ? html`<${ChartCanvas} type="line" height=${300} plugins=${[tierLabels]}
              data=${{ labels, datasets }}
              options=${{
                interaction: { mode: "index", intersect: false },
                layout: { padding: { top: 8 } },
                plugins: {
                  legend: { display: false },
                  tooltip: { backgroundColor: "#0b0d12", borderColor: "#2a2f3a", borderWidth: 1, padding: 10, displayColors: false, filter: (i) => i.datasetIndex === 0,
                    callbacks: { title: (i) => (i[0].dataIndex === 0 ? "Start" : `Trade #${i[0].dataIndex} · ${series[i[0].dataIndex].date}`), label: (c) => `Balance ${money(c.parsed.y / F, 0)}  (trade ${money(series[c.dataIndex].pnl, 0, true)})` } },
                },
                scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: "rgba(255,255,255,0.06)" }, border: { display: false }, suggestedMax: upper * F * 1.06, ticks: { callback: (v) => displaySymbol() + v.toLocaleString() } } },
              }} />`
          : html`<div class="muted">${src === "manual" ? "The balance is entered by hand, so there is no curve. Pick a trade log in Plan settings to see it." : "Add trades to your log to see your balance move toward the next milestone."}</div>`}
      <//>`}
    </div>

    ${edit && html`<${TierModal} id=${edit.id} onClose=${() => setEdit(null)} />`}
    ${settings && html`<${PlanSettings} onClose=${() => setSettings(false)} />`}
  </div>`;
}

function TierModal({ id, onClose }) {
  const s = useStore();
  const plan = s.data.plan;
  const existing = id ? plan.tiers.find((t) => t.id === id) : null;
  const [f, setF] = useState(() => ({ target: existing ? String(existing.target) : "", risk: existing && existing.risk != null ? String(existing.risk) : "", label: existing?.label || "", note: existing?.note || "" }));
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const autoRisk = num(f.target) > 0 ? round2((num(f.target) * plan.risk_pct) / 100) : 0;
  const valid = num(f.target) > 0;
  const cur = baseCurrency();
  const save = () => {
    const row = { target: num(f.target), risk: String(f.risk).trim() === "" ? null : num(f.risk), label: f.label.trim(), note: f.note.trim() };
    mutate((x) => {
      if (existing) Object.assign(x.plan.tiers.find((t) => t.id === id), row);
      else x.plan.tiers.push({ id: uid(), done: false, date: "", ...row });
    });
    toast(existing ? "Milestone updated" : "Milestone added");
    onClose();
  };
  return html`<${Modal} title=${existing ? "Edit milestone" : "Add milestone"} onClose=${onClose} small=${true}>
    <div class="stack">
      <${Field} label=${`Target account (${cur})`}><input class="input" inputmode="decimal" placeholder="e.g. 20000" value=${f.target} onInput=${(e) => set({ target: e.target.value })} /><//>
      <${Field} label=${`Max risk per trade (${cur})`} hint=${`Leave empty to use ${plan.risk_pct}% of the target${autoRisk ? " = " + money(autoRisk, 0) : ""}`}><input class="input" inputmode="decimal" placeholder=${autoRisk ? String(autoRisk) : "auto"} value=${f.risk} onInput=${(e) => set({ risk: e.target.value })} /><//>
      <${Field} label="Title"><input class="input" placeholder="e.g. First milestone" value=${f.label} onInput=${(e) => set({ label: e.target.value })} /><//>
      <${Field} label="Note"><input class="input" placeholder="Optional" value=${f.note} onInput=${(e) => set({ note: e.target.value })} /><//>
    </div>
    <div class="row end gap" style="margin-top:18px"><button class="btn" onClick=${onClose}>Cancel</button><button class="btn primary" disabled=${!valid} onClick=${save}>${existing ? "Save" : "Add"}</button></div>
  <//>`;
}

function PlanSettings({ onClose }) {
  const s = useStore();
  const d = s.data;
  const plan = d.plan;
  const [f, setF] = useState({ risk_pct: String(plan.risk_pct), start_balance: String(plan.start_balance), source: plan.source, manual_balance: String(plan.manual_balance) });
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const cur = baseCurrency();
  const sources = [{ value: "none", label: "No balance — I tick milestones myself" }, ...logNames(d).map((n) => ({ value: n, label: n === "Main" ? "Main (all linked logs)" : n })), { value: "manual", label: "Manual (I type my balance)" }];
  const track = f.source !== "none";
  return html`<${Modal} title="Plan settings" onClose=${onClose} small=${true}>
    <div class="stack">
      <${Field} label="Risk per trade (% of the milestone account)" hint="Default max risk of each milestone. You can still set a custom amount per milestone."><input class="input" inputmode="decimal" value=${f.risk_pct} onInput=${(e) => set({ risk_pct: e.target.value })} /><//>
      <${Field} label="Balance source" hint=${track ? "Balance = starting balance + total P&L of the log you pick." : "The plan only follows the milestones you tick. No account balance is shown."}><${Select} value=${f.source} options=${sources} onChange=${(v) => set({ source: v })} /><//>
      ${track && html`<${Field} label=${`Starting balance (${cur})`}><input class="input" inputmode="decimal" value=${f.start_balance} onInput=${(e) => set({ start_balance: e.target.value })} /><//>`}
      ${f.source === "manual" && html`<${Field} label=${`Current balance (${cur})`}><input class="input" inputmode="decimal" value=${f.manual_balance} onInput=${(e) => set({ manual_balance: e.target.value })} /><//>`}
    </div>
    <div class="row end gap" style="margin-top:18px"><button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" onClick=${() => {
        mutate((x) => {
          x.plan.risk_pct = num(f.risk_pct, 5) || 5;
          x.plan.start_balance = num(f.start_balance, 0);
          x.plan.source = f.source;
          x.plan.source_set = true;
          x.plan.manual_balance = num(f.manual_balance, x.plan.start_balance);
        });
        toast("Plan updated");
        onClose();
      }}>Save</button></div>
  <//>`;
}
