import { html, useState } from "../lib/preact-htm.js";
import { useStore, mutate, mainRows } from "../store.js";
import { computeStats, groupStats, periodFilter, dayOf, normDirection } from "../data.js";
import { money, fmtR, num, pad, parseDate, round2, compactMoney } from "../util.js";
import { Icon, Card, Select, Empty, ChartCanvas } from "./components.js";
import { LogPicker, currentLog } from "./tradelog.js";

const GREEN = "#22c55e", RED = "#ef4444", BLUE = "#60a5fa", GRID = "rgba(255,255,255,0.06)";
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function Kpi({ label, value, tone = "", sub }) {
  return html`<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${tone}">${value}</div>${sub && html`<div class="kpi-sub">${sub}</div>`}</div>`;
}

const tone = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");

export function DashboardView() {
  const s = useStore();
  const d = s.data;
  const log = currentLog(s);
  const [period, setPeriod] = useState("All");
  const [setup, setSetup] = useState("All");
  const [dir, setDir] = useState("All");
  const [month, setMonth] = useState(null);

  const all = (log === "Main" ? mainRows() : d.trade_logs[log] || []).filter((r) => dayOf(r));
  const sorted = all.map((r, i) => ({ r, i })).sort((a, b) => dayOf(a.r).localeCompare(dayOf(b.r)) || a.i - b.i).map((x) => x.r);
  const setups = ["All", ...[...new Set(sorted.map((r) => r.Setup).filter(Boolean))].sort()];
  let rows = periodFilter(sorted, period);
  if (setup !== "All") rows = rows.filter((r) => r.Setup === setup);
  if (dir !== "All") rows = rows.filter((r) => normDirection(r.Direction) === dir);
  const st = computeStats(rows);
  const allStats = computeStats(sorted);

  const target = log !== "Main" ? num(d.log_targets[log], 9000) : 0;
  const progress = target > 0 ? Math.min(Math.max(allStats.total / target, 0), 1) : 0;

  let cum = 0, peak = 0;
  const eq = rows.map((r) => (cum += num(r.PnL)));
  const dd = rows.map((r, i) => ((peak = Math.max(peak, eq[i])), eq[i] - peak));

  const header = html`<div class="page-head">
    <div><h1>Dashboard</h1><div class="muted">${log}${setup !== "All" ? " · " + setup : ""}${period !== "All" ? " · " + period : ""}</div></div>
    <div class="row gap wrap">
      <${Select} value=${period} onChange=${setPeriod} options=${["All", "This Week", "This Month", "Last 30 days", "YTD"]} aria-label="Period" />
      <${Select} value=${setup} onChange=${setSetup} options=${setups} aria-label="Setup" />
      <${Select} value=${dir} onChange=${setDir} options=${["All", "Buy", "Sell"]} aria-label="Direction" />
    </div>
  </div>`;

  if (!sorted.length || !rows.length) {
    return html`<div class="page">${header}<${LogPicker} />
      <${Card}><${Empty} icon="dashboard" title=${sorted.length ? "No trades match the filters" : "No trades in this log"}>${sorted.length ? "Try another period, setup or direction." : "Add trades in the Trade Log tab to see your statistics."}<//><//></div>`;
  }

  // --- calendrier ---
  const months = [...new Set(rows.map((r) => dayOf(r).slice(0, 7)))].sort();
  const calMonth = month && months.includes(month) ? month : months[months.length - 1];
  const mi = months.indexOf(calMonth);

  // --- séries mensuelles ---
  const byMonth = groupStats(rows, (r) => dayOf(r).slice(0, 7)).sort((a, b) => a.key.localeCompare(b.key));
  const bySetup = groupStats(rows, (r) => r.Setup).sort((a, b) => b.pnl - a.pnl);
  const byWd = groupStats(rows, (r) => WEEKDAYS[(parseDate(dayOf(r)).getDay() + 6) % 7]).sort((a, b) => WEEKDAYS.indexOf(a.key) - WEEKDAYS.indexOf(b.key));

  const axis = { grid: { color: GRID }, border: { display: false }, ticks: { color: "#8b93a7" } };
  const tip = { backgroundColor: "#0b0d12", borderColor: "#2a2f3a", borderWidth: 1, padding: 10, titleColor: "#e6e9f0", bodyColor: "#c5cad6", displayColors: false };

  return html`<div class="page">
    ${header}
    <${LogPicker} />

    ${log !== "Main" &&
    html`<div class="card target">
      <div class="row between wrap gap">
        <div class="row gap-s"><${Icon} name="target" size=${18} /><strong>Target</strong><span class="muted">${money(allStats.total, 0)} / ${money(target, 0)}</span></div>
        <div class="row gap-s"><span class="muted small-t">Target ($)</span><input class="input narrow" type="number" step="500" value=${target} onChange=${(e) => mutate((x) => (x.log_targets[log] = num(e.target.value)))} /></div>
      </div>
      <div class="progress"><div class="bar ${allStats.total < 0 ? "neg" : ""}" style=${{ width: progress * 100 + "%" }}></div></div>
      <div class="muted small-t">${(progress * 100).toFixed(0)}% reached</div>
    </div>`}

    <div class="kpi-grid">
      <${Kpi} label="Net P&L" value=${money(st.total, 0, true)} tone=${tone(st.total)} />
      <${Kpi} label="Win rate" value=${st.wr.toFixed(1) + "%"} sub=${`${st.wins}W · ${st.losses}L`} />
      <${Kpi} label="Profit factor" value=${st.pf === Infinity ? "∞" : st.pf.toFixed(2)} />
      <${Kpi} label="Expectancy" value=${money(st.expectancy, 0, true)} tone=${tone(st.expectancy)} />
      <${Kpi} label="Max drawdown" value=${money(st.maxDd, 0)} tone=${st.maxDd < 0 ? "neg" : ""} />
      <${Kpi} label="ATH" value=${money(st.ath, 0)} tone="pos" />
      <${Kpi} label="Trades" value=${st.n} sub=${`Streak ${st.maxWinStreak}W / ${st.maxLossStreak}L`} />
      <${Kpi} label="Total R" value=${fmtR(st.totalR, true)} tone=${tone(st.totalR)} />
      <${Kpi} label="Avg R" value=${fmtR(st.avgR, true)} tone=${tone(st.avgR)} />
      <${Kpi} label="Avg win / loss" value=${`${money(st.avgWin, 0)} / ${money(st.avgLoss, 0)}`} />
      <${Kpi} label="Best / worst R" value=${`${st.bestR.toFixed(2)} / ${st.worstR.toFixed(2)}`} />
    </div>

    <div class="dash-grid">
      <${Card} title="Equity curve" class="span-2">
        <${ChartCanvas}
          type="line"
          height=${300}
          data=${{
            labels: rows.map((r, i) => i + 1),
            datasets: [
              {
                data: eq,
                borderColor: BLUE,
                borderWidth: 2,
                pointRadius: rows.length > 80 ? 0 : 3,
                pointHoverRadius: 5,
                pointBackgroundColor: BLUE,
                tension: 0.25,
                fill: true,
                backgroundColor: (c) => {
                  const a = c.chart.chartArea;
                  if (!a) return "transparent";
                  const g = c.chart.ctx.createLinearGradient(0, a.top, 0, a.bottom);
                  g.addColorStop(0, "rgba(96,165,250,0.35)");
                  g.addColorStop(1, "rgba(96,165,250,0)");
                  return g;
                },
              },
            ],
          }}
          options=${{
            interaction: { mode: "index", intersect: false },
            plugins: {
              legend: { display: false },
              tooltip: { ...tip, callbacks: { title: (i) => `Trade #${i[0].label} · ${dayOf(rows[i[0].dataIndex])}`, label: (c) => `Equity ${money(c.parsed.y, 0)}  (trade ${money(rows[c.dataIndex].PnL, 0, true)})` } },
            },
            scales: { x: { ...axis, grid: { display: false }, ticks: { ...axis.ticks, maxTicksLimit: 8 } }, y: { ...axis, ticks: { ...axis.ticks, callback: (v) => "$" + v.toLocaleString() } } },
          }}
        />
      <//>

      <${Card} title="Calendar" actions=${html`<button class="icon-btn" disabled=${mi <= 0} onClick=${() => setMonth(months[mi - 1])} aria-label="Previous month"><${Icon} name="left" /></button><button class="icon-btn" disabled=${mi >= months.length - 1} onClick=${() => setMonth(months[mi + 1])} aria-label="Next month"><${Icon} name="right" /></button>`}>
        <${CalendarGrid} month=${calMonth} rows=${rows} />
      <//>

      <${Card} title="Drawdown">
        <${ChartCanvas}
          type="line"
          height=${200}
          data=${{ labels: rows.map((r, i) => i + 1), datasets: [{ data: dd, borderColor: RED, borderWidth: 1.5, pointRadius: 0, fill: true, backgroundColor: "rgba(239,68,68,0.18)", tension: 0.2 }] }}
          options=${{ plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: (c) => money(c.parsed.y, 0) } } }, scales: { x: { display: false }, y: { ...axis, ticks: { ...axis.ticks, callback: (v) => "$" + v.toLocaleString() } } } }}
        />
      <//>

      <${Card} title="R by month">
        <${ChartCanvas}
          type="bar"
          height=${200}
          data=${{ labels: byMonth.map((m) => m.key), datasets: [{ data: byMonth.map((m) => round2(m.r)), backgroundColor: byMonth.map((m) => (m.r >= 0 ? "rgba(34,197,94,0.75)" : "rgba(239,68,68,0.75)")), borderRadius: 6, maxBarThickness: 38 }] }}
          options=${{ plugins: { legend: { display: false }, tooltip: { ...tip, callbacks: { label: (c) => fmtR(c.parsed.y, true) } } }, scales: { x: { ...axis, grid: { display: false } }, y: axis } }}
        />
      <//>

      <${Card} title="By setup"><${GroupTable} data=${bySetup} /><//>
      <${Card} title="By weekday"><${GroupTable} data=${byWd} /><//>
      <${Card} title="By month"><${GroupTable} data=${[...byMonth].reverse()} /><//>
    </div>
  </div>`;
}

function GroupTable({ data }) {
  const max = Math.max(1, ...data.map((x) => Math.abs(x.pnl)));
  return html`<div class="table-wrap"><table class="table compact">
    <thead><tr><th></th><th class="num">Trades</th><th class="num">WR</th><th class="num">PnL</th><th class="num">R</th></tr></thead>
    <tbody>${data.map(
      (x) => html`<tr><td class="strong">${x.key}</td><td class="num">${x.trades}</td><td class="num">${x.wr.toFixed(0)}%</td>
        <td class="num ${tone(x.pnl)}"><div class="bar-cell"><span style=${{ width: (Math.abs(x.pnl) / max) * 100 + "%" }} class=${x.pnl >= 0 ? "g" : "r"}></span><b>${money(x.pnl, 0, true)}</b></div></td>
        <td class="num ${tone(x.r)}">${x.r.toFixed(2)}</td></tr>`
    )}</tbody></table></div>`;
}

function CalendarGrid({ month, rows }) {
  const [y, m] = month.split("-").map(Number);
  const first = new Date(y, m - 1, 1);
  const daysIn = new Date(y, m, 0).getDate();
  const offset = (first.getDay() + 6) % 7;
  const byDay = {};
  rows.forEach((r) => {
    const k = dayOf(r);
    if (k.slice(0, 7) === month) {
      const o = (byDay[k] ??= { pnl: 0, n: 0 });
      o.pnl += num(r.PnL);
      o.n++;
    }
  });
  const max = Math.max(1, ...Object.values(byDay).map((v) => Math.abs(v.pnl)));
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let dnum = 1; dnum <= daysIn; dnum++) cells.push(dnum);
  while (cells.length % 7) cells.push(null);
  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  const monthTotal = Object.values(byDay).reduce((a, v) => a + v.pnl, 0);
  return html`<div>
    <div class="cal-title"><strong>${first.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</strong><span class="${monthTotal >= 0 ? "pos" : "neg"} strong">${money(monthTotal, 0, true)}</span></div>
    <div class="cal">
      ${["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su", "Week"].map((h) => html`<div class="cal-h">${h}</div>`)}
      ${weeks.map((w) => {
        const wt = w.reduce((a, dn) => a + (dn ? byDay[`${month}-${pad(dn)}`]?.pnl || 0 : 0), 0);
        const any = w.some((dn) => dn && byDay[`${month}-${pad(dn)}`]);
        return [
          ...w.map((dn) => {
            if (!dn) return html`<div class="cal-c empty"></div>`;
            const v = byDay[`${month}-${pad(dn)}`];
            const a = v ? 0.18 + 0.55 * (Math.abs(v.pnl) / max) : 0;
            const bg = v ? (v.pnl >= 0 ? `rgba(34,197,94,${a})` : `rgba(239,68,68,${a})`) : "";
            return html`<div class="cal-c ${v ? (v.pnl >= 0 ? "w" : "l") : ""}" style=${{ background: bg }} title=${v ? `${v.n} trade(s)` : ""}>
              <span class="cal-d">${dn}</span>${v && html`<span class="cal-p">${compactMoney(v.pnl)}</span>`}</div>`;
          }),
          html`<div class="cal-c week ${any ? (wt >= 0 ? "pos" : "neg") : ""}">${any ? compactMoney(wt) : ""}</div>`,
        ];
      })}
    </div>
  </div>`;
}
