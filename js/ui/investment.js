import { html, useState } from "../lib/preact-htm.js";
import { useStore, mutate } from "../store.js";
import { TYPES, portfolio, byClass, snapshotToday, costSeries, normSymbol, txTotal } from "../invest.js";
import { money, num, round2, todayStr } from "../util.js";
import { refreshPrices } from "../quotes.js";
import { Icon, Card, Modal, Field, Segmented, Select, TextArea, Empty, ChartCanvas, toast, confirmDialog } from "./components.js";

const PALETTE = ["#60a5fa", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#22d3ee", "#fb923c", "#94a3b8", "#4ade80", "#f87171"];
const tone = (v) => (v > 0 ? "pos" : v < 0 ? "neg" : "");
const fmtQty = (q) => Number(num(q).toFixed(4)).toLocaleString("en-US");
const pct = (v, sign = false) => `${v > 0 && sign ? "+" : ""}${v.toFixed(1)}%`;
const GRID = "rgba(255,255,255,0.06)";
const tip = { backgroundColor: "#0b0d12", borderColor: "#2a2f3a", borderWidth: 1, padding: 10, titleColor: "#e6e9f0", bodyColor: "#c5cad6" };

function Kpi({ label, value, tone: t = "", sub }) {
  return html`<div class="kpi"><div class="kpi-label">${label}</div><div class="kpi-value ${t}">${value}</div>${sub && html`<div class="kpi-sub">${sub}</div>`}</div>`;
}

export function InvestmentView() {
  const s = useStore();
  const d = s.data;
  const [tab, setTab] = useState("overview");
  const [account, setAccount] = useState("All");
  const [form, setForm] = useState(null); // { index, row }
  const [modal, setModal] = useState(null);

  const acc = account === "All" ? null : account;
  const pf = portfolio(d, acc);
  const hasData = d.inv_transactions.length > 0;

  return html`<div class="page">
    <div class="page-head">
      <div><h1>Investment</h1><div class="muted">Portfolio, transactions and allocation</div></div>
      <div class="row gap wrap">
        <div class="segmented">
          ${[["overview", "Portfolio"], ["transactions", "Transactions"], ["allocation", "Allocation"], ["strategy", "Strategy"]].map(([id, label]) => html`<button class=${tab === id ? "active" : ""} onClick=${() => setTab(id)}>${label}</button>`)}
        </div>
        ${tab !== "strategy" && html`<button class="btn primary" onClick=${() => setForm({ index: null })}><${Icon} name="plus" size=${16} />Transaction</button>`}
      </div>
    </div>

    ${tab !== "strategy" && tab !== "allocation" && html`<div class="chips scroll">
      ${["All", ...d.inv_accounts].map((a) => html`<button class="chip ${account === a ? "active" : ""}" onClick=${() => setAccount(a)}>${a}</button>`)}
    </div>`}

    ${tab === "overview" && (hasData ? html`<${Overview} pf=${pf} acc=${acc} onPrices=${() => setModal("prices")} onLists=${() => setModal("lists")} />` : html`<${Card}><${Empty} icon="briefcase" title="Start your portfolio">Add your first transaction (a buy, a sell or a dividend). Positions, average cost, gains and allocation are calculated for you.<//><div class="center pad"><button class="btn primary" onClick=${() => setForm({ index: null })}><${Icon} name="plus" size=${16} />Add transaction</button></div><//>`)}
    ${tab === "transactions" && html`<${Transactions} account=${acc} onEdit=${(index) => setForm({ index, row: d.inv_transactions[index] })} />`}
    ${tab === "allocation" && html`<${Allocation} />`}
    ${tab === "strategy" && html`<${Card} title="Strategy & vision"><${TextArea} value=${d.inv_journal} minRows=${18} placeholder="Market vision, yearly plan, rules…" onInput=${(v) => mutate((x) => (x.inv_journal = v))} /><//>`}

    ${form && html`<${TxForm} initial=${form.row} onClose=${() => setForm(null)} onSave=${(row, cls) => {
      mutate((x) => {
        if (form.index == null) x.inv_transactions.push(row);
        else x.inv_transactions[form.index] = row;
        if (cls !== undefined && row.Symbol) (x.inv_assets[row.Symbol] ??= {}).class = cls;
      });
      toast(form.index == null ? "Transaction added" : "Transaction updated");
      setForm(null);
    }} />`}
    ${modal === "prices" && html`<${PricesModal} onClose=${() => setModal(null)} />`}
    ${modal === "lists" && html`<${ListsModal} onClose=${() => setModal(null)} />`}
  </div>`;
}

function Overview({ pf, acc, onPrices, onLists }) {
  const s = useStore();
  const d = s.data;
  const [by, setBy] = useState("class");

  const groups = by === "class" ? [...byClass(pf.open).entries()] : pf.open.map((p) => [p.symbol, p.value]);
  groups.sort((a, b) => b[1] - a[1]);

  // courbe de valeur : snapshots (valeur) + capital investi (calculé depuis les transactions)
  const cost = costSeries(d, acc);
  const snaps = acc ? [] : d.inv_snapshots;
  const labels = [...new Set([...cost.map((c) => c.date), ...snaps.map((x) => x.date)])].sort();
  let lastCost = 0;
  const costMap = Object.fromEntries(cost.map((c) => [c.date, c.cost]));
  const costLine = labels.map((l) => ((lastCost = costMap[l] ?? lastCost), lastCost));
  const snapMap = Object.fromEntries(snaps.map((x) => [x.date, x.value]));
  const valueLine = labels.map((l) => snapMap[l] ?? null);

  const setClass = (sym, cls) => mutate((x) => ((x.inv_assets[sym] ??= {}).class = cls));

  return html`<div class="stack">
    ${pf.missingPrices > 0 && html`<div class="banner warn"><${Icon} name="alert" size=${16} /><span>${pf.missingPrices} position(s) without a price are valued at cost. Update prices to see real gains.</span><button class="btn small" onClick=${onPrices}>Update prices</button></div>`}

    <div class="kpi-grid">
      <${Kpi} label="Portfolio value" value=${money(pf.value, 0)} />
      <${Kpi} label="Invested (cost)" value=${money(pf.cost, 0)} />
      <${Kpi} label="Unrealized P&L" value=${money(pf.unrealized, 0, true)} tone=${tone(pf.unrealized)} sub=${pct(pf.unrealizedPct, true)} />
      <${Kpi} label="Realized P&L" value=${money(pf.realized, 0, true)} tone=${tone(pf.realized)} />
      <${Kpi} label="Dividends" value=${money(pf.dividends, 0)} tone=${pf.dividends > 0 ? "pos" : ""} />
      <${Kpi} label="Total return" value=${money(pf.totalReturn, 0, true)} tone=${tone(pf.totalReturn)} sub="unrealized + realized + dividends" />
    </div>

    <div class="dash-grid">
      <${Card} title="Holdings" class="span-2" pad=${false} actions=${html`<button class="btn small" onClick=${onPrices}><${Icon} name="refresh" size=${14} />Update prices</button><button class="btn small ghost" onClick=${onLists}><${Icon} name="settings" size=${14} />Lists</button>`}>
        ${pf.open.length
          ? html`<div class="table-wrap"><table class="table responsive">
            <thead><tr><th>Symbol</th><th>Class</th><th class="num">Qty</th><th class="num">Avg cost</th><th class="num">Price</th><th class="num">Value</th><th class="num">P&L</th><th class="num">Weight</th></tr></thead>
            <tbody>${pf.open.map(
              (p) => html`<tr>
                <td data-label="Symbol" class="strong">${p.symbol}</td>
                <td data-label="Class"><select class="input mini" value=${p.class} onChange=${(e) => setClass(p.symbol, e.target.value)}><option value="" selected=${!p.class}>—</option>${d.inv_classes.map((c) => html`<option value=${c} selected=${p.class === c}>${c}</option>`)}</select></td>
                <td data-label="Qty" class="num">${fmtQty(p.qty)}</td>
                <td data-label="Avg cost" class="num">${money(p.avg, 2)}</td>
                <td data-label="Price" class="num ${p.hasPrice ? "" : "muted"}">${p.hasPrice ? money(p.price, 2) : "no price"}</td>
                <td data-label="Value" class="num strong">${money(p.value, 0)}</td>
                <td data-label="P&L" class="num ${tone(p.pnl)}">${money(p.pnl, 0, true)} <span class="small-t">${pct(p.pnlPct, true)}</span></td>
                <td data-label="Weight" class="num">${pct(p.weight)}</td>
              </tr>`
            )}</tbody></table></div>`
          : html`<${Empty} icon="briefcase" title="No open positions">All positions are closed for this filter.<//>`}
      <//>

      <${Card} title="Breakdown" actions=${html`<div class="segmented"><button class=${by === "class" ? "active" : ""} onClick=${() => setBy("class")}>Class</button><button class=${by === "symbol" ? "active" : ""} onClick=${() => setBy("symbol")}>Symbol</button></div>`}>
        ${groups.length
          ? html`<${ChartCanvas} type="doughnut" height=${280}
              data=${{ labels: groups.map((g) => g[0]), datasets: [{ data: groups.map((g) => round2(g[1])), backgroundColor: groups.map((_, i) => PALETTE[i % PALETTE.length]), borderColor: "#141821", borderWidth: 3 }] }}
              options=${{ cutout: "66%", plugins: { legend: { position: "bottom", labels: { boxWidth: 10, usePointStyle: true, color: "#c5cad6" } }, tooltip: { ...tip, callbacks: { label: (c) => `${c.label}: ${money(c.parsed, 0)} (${pf.value ? ((c.parsed / pf.value) * 100).toFixed(1) : 0}%)` } } } }} />`
          : html`<div class="muted">Nothing to show.</div>`}
      <//>

      <${Card} title="Portfolio value over time" class="span-2" actions=${acc && html`<span class="muted small-t">Value history is tracked for the whole portfolio</span>`}>
        ${labels.length > 1
          ? html`<${ChartCanvas} type="line" height=${260}
              data=${{ labels, datasets: [
                { label: "Value", data: valueLine, borderColor: "#60a5fa", backgroundColor: "rgba(96,165,250,0.12)", fill: true, spanGaps: true, tension: 0.25, pointRadius: 3, borderWidth: 2 },
                { label: "Invested", data: costLine, borderColor: "#94a3b8", borderDash: [6, 4], stepped: true, pointRadius: 0, borderWidth: 1.5 },
              ] }}
              options=${{ interaction: { mode: "index", intersect: false }, plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, color: "#c5cad6" } }, tooltip: { ...tip, callbacks: { label: (c) => `${c.dataset.label}: ${money(c.parsed.y, 0)}` } } }, scales: { x: { grid: { display: false }, ticks: { maxTicksLimit: 8 } }, y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => "$" + v.toLocaleString() } } } }} />
            ${!snaps.length && !acc && html`<div class="muted small-t" style="margin-top:8px">The blue line builds up each time you update prices (one point per day).</div>`}`
          : html`<div class="muted">Add transactions on several dates and update prices regularly to see the evolution.</div>`}
      <//>
    </div>
  </div>`;
}

function Transactions({ account, onEdit }) {
  const s = useStore();
  const d = s.data;
  const [type, setType] = useState("All");
  const [sym, setSym] = useState("All");
  const symbols = ["All", ...[...new Set(d.inv_transactions.map((t) => normSymbol(t.Symbol)).filter(Boolean))].sort()];
  const rows = d.inv_transactions
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => (type === "All" || t.Type === type) && (sym === "All" || normSymbol(t.Symbol) === sym) && (!account || t.Account === account))
    .sort((a, b) => String(b.t.Date).localeCompare(String(a.t.Date)) || b.i - a.i);

  const del = async (i) => {
    if (await confirmDialog({ title: "Delete transaction", message: "This transaction will be removed and positions recalculated.", confirmText: "Delete", danger: true })) mutate((x) => x.inv_transactions.splice(i, 1));
  };

  return html`<div class="stack">
    <div class="row gap wrap">
      <${Segmented} value=${type} options=${["All", ...TYPES]} onChange=${setType} />
      <${Select} value=${sym} options=${symbols} onChange=${setSym} aria-label="Symbol" />
    </div>
    <${Card} pad=${false}>
      ${rows.length
        ? html`<div class="table-wrap"><table class="table responsive">
          <thead><tr><th>Date</th><th>Type</th><th>Symbol</th><th>Account</th><th class="num">Qty</th><th class="num">Price</th><th class="num">Fees</th><th class="num">Total</th><th>Note</th><th></th></tr></thead>
          <tbody>${rows.map(({ t, i }) => html`<tr>
            <td data-label="Date">${String(t.Date).slice(0, 10)}</td>
            <td data-label="Type"><span class="pill ${t.Type === "Buy" ? "buy" : t.Type === "Sell" ? "sell" : ""}">${t.Type}</span></td>
            <td data-label="Symbol" class="strong">${normSymbol(t.Symbol)}</td>
            <td data-label="Account" class="muted">${t.Account || "—"}</td>
            <td data-label="Qty" class="num">${t.Type === "Dividend" ? "—" : fmtQty(t.Quantity)}</td>
            <td data-label="Price" class="num">${t.Type === "Dividend" ? "—" : money(t.Price, 2)}</td>
            <td data-label="Fees" class="num muted">${num(t.Fees) ? money(t.Fees, 2) : "—"}</td>
            <td data-label="Total" class="num strong ${t.Type === "Buy" ? "" : t.Type === "Sell" ? "" : "pos"}">${money(txTotal(t), 2)}</td>
            <td data-label="Note" class="note-cell ${t.Note ? "" : "hide-m"}">${t.Note || ""}</td>
            <td class="actions"><button class="icon-btn" aria-label="Edit" onClick=${() => onEdit(i)}><${Icon} name="edit" size=${16} /></button><button class="icon-btn" aria-label="Delete" onClick=${() => del(i)}><${Icon} name="trash" size=${16} /></button></td>
          </tr>`)}</tbody></table></div>`
        : html`<${Empty} icon="list" title="No transactions">${d.inv_transactions.length ? "Nothing matches these filters." : "Use the Transaction button to add one."}<//>`}
    <//>
  </div>`;
}

function Allocation() {
  const s = useStore();
  const d = s.data;
  const pf = portfolio(d, null);
  const actual = byClass(pf.open);
  const classes = [...new Set([...d.inv_classes, ...actual.keys(), ...Object.keys(d.inv_targets)])].filter((c) => c !== "Unassigned" || actual.has(c));
  const targetSum = classes.reduce((a, c) => a + num(d.inv_targets[c]), 0);
  const rows = classes.map((c) => {
    const val = actual.get(c) || 0;
    const act = pf.value ? (val / pf.value) * 100 : 0;
    const tgt = num(d.inv_targets[c]);
    const wanted = (tgt / 100) * pf.value;
    return { c, val, act, tgt, diff: act - tgt, move: wanted - val };
  });
  const shown = rows.filter((r) => r.val > 0 || r.tgt > 0);

  return html`<div class="stack">
    ${pf.value <= 0 && html`<div class="banner info"><${Icon} name="briefcase" size=${16} /><span>Add transactions first, and assign an asset class to each holding (Portfolio tab).</span></div>`}
    ${actual.has("Unassigned") && html`<div class="banner warn"><${Icon} name="alert" size=${16} /><span>Some holdings have no asset class. Assign one in the Portfolio tab.</span></div>`}
    <div class="dash-grid">
      <${Card} title="Target vs actual" class="span-2" pad=${false} actions=${html`<span class="small-t ${Math.abs(targetSum - 100) < 0.01 ? "pos" : "neg"}">Targets total ${targetSum.toFixed(0)}%</span>`}>
        <div class="table-wrap"><table class="table responsive">
          <thead><tr><th>Class</th><th class="num">Value</th><th class="num">Actual</th><th class="num">Target %</th><th class="num">Gap</th><th class="num">To rebalance</th></tr></thead>
          <tbody>${shown.length ? shown.map((r) => html`<tr>
            <td data-label="Class" class="strong">${r.c}</td>
            <td data-label="Value" class="num">${money(r.val, 0)}</td>
            <td data-label="Actual" class="num">${pct(r.act)}</td>
            <td data-label="Target %" class="num">${r.c === "Unassigned" ? "—" : html`<input class="input mini num-in" type="number" min="0" max="100" step="1" value=${r.tgt || ""} placeholder="0" onChange=${(e) => mutate((x) => (x.inv_targets[r.c] = num(e.target.value)))} />`}</td>
            <td data-label="Gap" class="num ${Math.abs(r.diff) < 1 ? "" : r.diff > 0 ? "neg" : "pos"}">${r.c === "Unassigned" ? "—" : pct(r.diff, true)}</td>
            <td data-label="To rebalance" class="num ${r.move > 0 ? "pos" : r.move < 0 ? "neg" : ""}">${r.c === "Unassigned" || !r.tgt ? "—" : `${r.move >= 0 ? "Buy" : "Sell"} ${money(Math.abs(r.move), 0)}`}</td>
          </tr>`) : html`<tr><td colspan="6" class="muted pad">No data yet.</td></tr>`}</tbody></table></div>
        <div class="muted small-t pad">Rebalancing amounts are indicative: they show what to buy or sell in each class to reach your target with the current portfolio value.</div>
      <//>
      <${Card} title="Actual vs target">
        ${shown.length
          ? html`<${ChartCanvas} type="bar" height=${280}
              data=${{ labels: shown.map((r) => r.c), datasets: [
                { label: "Actual %", data: shown.map((r) => round2(r.act)), backgroundColor: "rgba(96,165,250,0.8)", borderRadius: 5 },
                { label: "Target %", data: shown.map((r) => r.tgt), backgroundColor: "rgba(148,163,184,0.45)", borderRadius: 5 },
              ] }}
              options=${{ plugins: { legend: { labels: { usePointStyle: true, boxWidth: 8, color: "#c5cad6" } }, tooltip: tip }, scales: { x: { grid: { display: false } }, y: { grid: { color: GRID }, border: { display: false }, ticks: { callback: (v) => v + "%" } } } }} />`
          : html`<div class="muted">Nothing to show.</div>`}
      <//>
    </div>
  </div>`;
}

function TxForm({ initial, onClose, onSave }) {
  const s = useStore();
  const d = s.data;
  const editing = !!initial;
  const [f, setF] = useState(() =>
    initial
      ? { ...initial, Date: String(initial.Date).slice(0, 10) }
      : { Date: todayStr(), Type: "Buy", Symbol: "", Quantity: "", Price: "", Fees: "", Amount: "", Account: d.inv_accounts[0] || "", Note: "" }
  );
  const [cls, setCls] = useState(() => d.inv_assets[normSymbol(initial?.Symbol)]?.class ?? "");
  const set = (patch) => setF((p) => ({ ...p, ...patch }));
  const sym = normSymbol(f.Symbol);
  const known = sym && d.inv_assets[sym]?.class;
  const isDiv = f.Type === "Dividend";
  const total = txTotal({ ...f, Quantity: num(f.Quantity), Price: num(f.Price), Fees: num(f.Fees), Amount: num(f.Amount) });
  const symbols = [...new Set(d.inv_transactions.map((t) => normSymbol(t.Symbol)).filter(Boolean))];
  const valid = f.Date && sym && (isDiv ? num(f.Amount) > 0 : num(f.Quantity) > 0 && num(f.Price) >= 0 && f.Price !== "");

  return html`<${Modal} title=${editing ? "Edit transaction" : "Add transaction"} onClose=${onClose}>
    <div class="stack">
      <${Segmented} value=${f.Type} options=${TYPES} onChange=${(v) => set({ Type: v })} />
      <div class="form-grid" style="margin-bottom:0">
        <${Field} label="Date"><input type="date" class="input" value=${f.Date} onInput=${(e) => set({ Date: e.target.value })} /><//>
        <${Field} label="Symbol">
          <input class="input" list="dl-inv-sym" placeholder="e.g. VFV, AAPL" value=${f.Symbol} onInput=${(e) => set({ Symbol: e.target.value.toUpperCase() })} />
          <datalist id="dl-inv-sym">${symbols.map((x) => html`<option value=${x}></option>`)}</datalist>
        <//>
        <${Field} label="Account"><select class="input" value=${f.Account} onChange=${(e) => set({ Account: e.target.value })}><option value="" selected=${!f.Account}>—</option>${d.inv_accounts.map((a) => html`<option value=${a} selected=${f.Account === a}>${a}</option>`)}</select><//>
        <${Field} label="Asset class" hint=${known && cls === known ? "Already set for this symbol" : "Applies to this symbol"}><select class="input" value=${cls} onChange=${(e) => setCls(e.target.value)}><option value="" selected=${!cls}>—</option>${d.inv_classes.map((c) => html`<option value=${c} selected=${cls === c}>${c}</option>`)}</select><//>
        ${isDiv
          ? html`<${Field} label="Dividend amount ($)"><input class="input" inputmode="decimal" value=${f.Amount} onInput=${(e) => set({ Amount: e.target.value })} /><//>`
          : html`<${Field} label="Quantity"><input class="input" inputmode="decimal" value=${f.Quantity} onInput=${(e) => set({ Quantity: e.target.value })} /><//>
            <${Field} label="Price per unit ($)"><input class="input" inputmode="decimal" value=${f.Price} onInput=${(e) => set({ Price: e.target.value })} /><//>
            <${Field} label="Fees ($)"><input class="input" inputmode="decimal" placeholder="0" value=${f.Fees} onInput=${(e) => set({ Fees: e.target.value })} /><//>`}
      </div>
      <${Field} label="Note"><input class="input" value=${f.Note} onInput=${(e) => set({ Note: e.target.value })} /><//>
      <div class="row between"><span class="muted">Total <strong class="${f.Type === "Sell" || isDiv ? "pos" : ""}">${money(total, 2)}</strong></span>
        <div class="row gap"><button class="btn" onClick=${onClose}>Cancel</button>
        <button class="btn primary" disabled=${!valid} onClick=${() => onSave({
          Date: f.Date, Type: f.Type, Symbol: sym, Account: f.Account, Note: f.Note,
          Quantity: isDiv ? null : num(f.Quantity), Price: isDiv ? null : num(f.Price), Fees: isDiv ? 0 : num(f.Fees),
          Amount: round2(isDiv ? num(f.Amount) : txTotal({ ...f, Quantity: num(f.Quantity), Price: num(f.Price), Fees: num(f.Fees) })),
        }, cls)}>${editing ? "Save" : "Add"}</button></div></div>
    </div>
  <//>`;
}

function PricesModal({ onClose }) {
  const s = useStore();
  const d = s.data;
  const pf = portfolio(d, null);
  const [vals, setVals] = useState(() => Object.fromEntries(pf.open.map((p) => [p.symbol, p.hasPrice ? String(p.price) : ""])));
  const [key, setKey] = useState(d.settings.av_key || "");
  const [busy, setBusy] = useState(false);
  const auto = d.settings.av_auto !== false;
  const saveKey = () => mutate((x) => (x.settings.av_key = key.trim()));
  const fetchNow = async () => {
    saveKey();
    setBusy(true);
    await refreshPrices({ force: true });
    setBusy(false);
    onClose();
  };
  return html`<${Modal} title="Update prices" onClose=${onClose}>
    <div class="auto-box">
      <div class="strong">Automatic closing prices</div>
      <div class="muted small-t" style="margin:4px 0 10px">Free API key from <a href="https://www.alphavantage.co/support/#api-key" target="_blank" rel="noopener">alphavantage.co</a> (about 25 requests/day). Prices refresh once a day when you open the app. The key is saved in your OneDrive data, so it works on all your devices.</div>
      <div class="row gap">
        <input class="input" style="flex:1" placeholder="API key" value=${key} onInput=${(e) => setKey(e.target.value)} onBlur=${saveKey} />
        <button class="btn primary" disabled=${!key.trim() || busy} onClick=${fetchNow}>${busy ? "Fetching…" : "Fetch now"}</button>
      </div>
      <label class="row gap small-t" style="margin-top:10px;cursor:pointer"><input type="checkbox" checked=${auto} onChange=${(e) => mutate((x) => (x.settings.av_auto = e.target.checked))} /> Update automatically once a day</label>
    </div>
    <p class="muted" style="margin:16px 0 8px">Or enter prices by hand. Saving also records today's portfolio value for the history chart.</p>
    <div class="stack">
      ${pf.open.map((p) => html`<div class="price-row"><div><div class="strong">${p.symbol}</div><div class="muted small-t">${fmtQty(p.qty)} units · cost ${money(p.avg, 2)}${p.priceDate ? " · close " + p.priceDate : ""}</div>
        <input class="input mini" style="margin-top:6px;width:120px" placeholder=${"Ticker: " + p.symbol} title="Ticker used by the price provider (e.g. VFV.TRT for Toronto)" value=${d.inv_assets[p.symbol]?.ticker || ""} onChange=${(e) => mutate((x) => ((x.inv_assets[p.symbol] ??= {}).ticker = e.target.value.trim().toUpperCase()))} /></div>
        <input class="input" inputmode="decimal" placeholder="Price" value=${vals[p.symbol]} onInput=${(e) => setVals({ ...vals, [p.symbol]: e.target.value })} /></div>`)}
    </div>
    <div class="row end gap" style="margin-top:18px"><button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" onClick=${() => {
        mutate((x) => {
          for (const [sym, v] of Object.entries(vals)) {
            if (String(v).trim() === "" || !Number.isFinite(num(v, NaN))) continue;
            if (x.inv_prices[sym] && Number(x.inv_prices[sym].price) === num(v)) continue; // inchangé : on garde la date de clôture
            x.inv_prices[sym] = { price: num(v), date: todayStr(), fetched: todayStr() };
          }
          snapshotToday(x);
        });
        toast("Prices updated");
        onClose();
      }}>Save prices</button></div>
  <//>`;
}

function ListsModal({ onClose }) {
  const s = useStore();
  const d = s.data;
  const [accounts, setAccounts] = useState(d.inv_accounts.join(", "));
  const [classes, setClasses] = useState(d.inv_classes.join(", "));
  const list = (t) => t.split(",").map((x) => x.trim()).filter(Boolean);
  return html`<${Modal} title="Accounts & asset classes" onClose=${onClose} small=${true}>
    <p class="muted" style="margin-top:0">Comma separated lists used in the forms and the allocation view.</p>
    <div class="stack">
      <${Field} label="Accounts"><input class="input" value=${accounts} onInput=${(e) => setAccounts(e.target.value)} /><//>
      <${Field} label="Asset classes"><input class="input" value=${classes} onInput=${(e) => setClasses(e.target.value)} /><//>
    </div>
    <div class="row end gap" style="margin-top:18px"><button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" onClick=${() => { mutate((x) => { const a = list(accounts), c = list(classes); if (a.length) x.inv_accounts = a; if (c.length) x.inv_classes = c; }); toast("Lists updated"); onClose(); }}>Save</button></div>
  <//>`;
}
