import { html, useState, useEffect } from "../lib/preact-htm.js";
import { store, useStore, mutate, setUI } from "../store.js";
import { HARDCODED_FIELDS, templateSections, composeNotes, journalFilled, dayOf, normDirection } from "../data.js";
import { todayStr, addDays, parseDate, weekKey, imgSrc, imageToB64, money, fmtR } from "../util.js";
import { Icon, Card, Modal, Segmented, TextArea, Empty, toast } from "./components.js";

function dateLabel(date) {
  return parseDate(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function JournalView() {
  const s = useStore();
  const d = s.data;
  const today = todayStr();
  const date = s.ui.date || today;
  const isToday = date === today;
  const day = d.journals[date];
  const [editing, setEditing] = useState(false);
  const [viewImg, setViewImg] = useState(false);
  const [showTpl, setShowTpl] = useState(false);
  const canEdit = isToday || editing;

  useEffect(() => setEditing(false), [date]);

  // Aujourd'hui : reprend l'image de news de la semaine si le jour n'en a pas encore
  useEffect(() => {
    if (!isToday) return;
    const wk = d.weekly_news[weekKey(date)];
    if (wk && !d.journals[date]?.news_image) mutate((dd) => ((dd.journals[date] ??= {}).news_image = wk));
  }, [date, isToday]);

  const saved = day?.fields || {};
  const top = templateSections(d.journal_template, date);
  const extras = Object.keys(saved).filter((k) => !top.includes(k) && !HARDCODED_FIELDS.includes(k) && String(saved[k] || "").trim());
  const sections = [...top, ...extras];
  const allSections = [...sections, ...HARDCODED_FIELDS];
  const filled = journalFilled(day, allSections);

  const setField = (name, val) =>
    mutate((dd) => {
      const dy = (dd.journals[date] ??= {});
      dy.fields = { ...(dy.fields || {}), [name]: val };
      dy.notes = composeNotes(allSections, dy.fields);
    });
  const setEmotions = (val) => mutate((dd) => ((dd.journals[date] ??= {}).emotions = val));

  const addImage = async (file) => {
    try {
      const b64 = await imageToB64(file);
      mutate((dd) => {
        (dd.journals[date] ??= {}).news_image = b64;
        dd.weekly_news[weekKey(date)] = b64;
      });
      toast("Image added");
    } catch (e) {
      toast("Unable to read this image", "err");
    }
  };

  // Coller une capture d'écran (Ctrl+V)
  useEffect(() => {
    if (!canEdit) return;
    const onPaste = (e) => {
      const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
      if (item) {
        e.preventDefault();
        addImage(item.getAsFile());
      }
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [canEdit, date]);

  const dayTrades = Object.entries(d.trade_logs).flatMap(([log, rows]) => rows.filter((r) => dayOf(r) === date).map((r) => ({ ...r, log })));
  const dayPnl = dayTrades.reduce((a, r) => a + (r.PnL || 0), 0);

  const dated = Object.keys(d.journals).sort().reverse().slice(0, 12);
  const strip = [...new Set([today, ...dated])].sort().reverse().slice(0, 10);

  const img = day?.news_image;
  const hasFields = Object.keys(saved).length > 0;

  const Label = ({ children }) => html`<div class="field-label blue">${children}</div>`;

  return html`<div class="page">
    <div class="page-head">
      <div>
        <h1>Journal</h1>
        <div class="muted">${dateLabel(date)}</div>
      </div>
      <div class="row gap wrap">
        <div class="row gap-s">
          <button class="icon-btn bordered" aria-label="Previous day" onClick=${() => setUI({ date: addDays(date, -1) })}><${Icon} name="left" /></button>
          <input type="date" class="input date" value=${date} max=${today} onChange=${(e) => e.target.value && setUI({ date: e.target.value })} />
          <button class="icon-btn bordered" aria-label="Next day" disabled=${isToday} onClick=${() => setUI({ date: addDays(date, 1) })}><${Icon} name="right" /></button>
        </div>
        ${!isToday && html`<button class="btn" onClick=${() => setUI({ date: today })}>Today</button>`}
        ${!isToday && html`<button class="btn ${editing ? "primary" : ""}" onClick=${() => setEditing(!editing)}><${Icon} name=${editing ? "eye" : "edit"} size=${16} />${editing ? "View" : "Edit"}</button>`}
      </div>
    </div>

    <div class="day-strip">
      ${strip.map((dt) => {
        const dj = d.journals[dt];
        const ok = journalFilled(dj, [...templateSections(d.journal_template, dt), ...Object.keys(dj?.fields || {})]);
        const [y, m, dd] = dt.split("-");
        return html`<button class="chip ${dt === date ? "active" : ""}" onClick=${() => setUI({ date: dt })}>
          <span class="dot ${ok ? "green" : dt === today ? "amber" : ""}"></span>${dt === today ? "Today" : `${dd}/${m}`}
        </button>`;
      })}
    </div>

    ${isToday &&
    html`<div class="banner ${filled ? "ok" : "warn"}"><${Icon} name=${filled ? "check" : "alert"} size=${16} />${filled ? "Journal filled for today" : "Journal not filled yet"}</div>`}

    <div class="journal-grid">
      <${Card}
        title="News"
        class="area-news"
        actions=${canEdit &&
        html`<label class="btn small"><${Icon} name="upload" size=${14} />${img ? "Replace" : "Add image"}<input type="file" accept="image/*" hidden onChange=${(e) => e.target.files[0] && addImage(e.target.files[0])} /></label>
          ${img && html`<button class="btn small danger-ghost" onClick=${() => mutate((dd) => delete dd.journals[date].news_image)}><${Icon} name="trash" size=${14} /></button>`}`}
      >
        ${img
          ? html`<img class="news-img" src=${imgSrc(img)} alt="News" onClick=${() => setViewImg(true)} />`
          : html`<div class="dropzone"><${Icon} name="image" size=${28} /><div>${canEdit ? "Add a screenshot (or paste with Ctrl+V)" : "No image saved for this day"}</div></div>`}
      <//>

      <${Card} title="Daily plan" class="area-plan" actions=${html`<button class="btn small ghost" onClick=${() => setShowTpl(true)}><${Icon} name="edit" size=${14} />Template</button>`}>
        ${canEdit
          ? html`<div class="stack">
              ${sections.map((sec) => html`<div><${Label}>${sec}<//><${TextArea} value=${saved[sec] || ""} minRows=${2} onInput=${(v) => setField(sec, v)} /></div>`)}
              <div class="grid3">
                ${[["Scenario played", ["", "Yes", "No"]], ["Plan followed", ["", "Yes", "No"]], ["Result", ["", "Win", "Lose"]]].map(
                  ([name, opts]) => html`<div><${Label}>${name}<//><${Segmented} value=${saved[name] || ""} options=${opts.map((o) => ({ value: o, label: o || "—" }))} onChange=${(v) => setField(name, v)} /></div>`
                )}
              </div>
              <div><${Label}>Observation<//><${TextArea} value=${saved.Observation || ""} minRows=${3} onInput=${(v) => setField("Observation", v)} /></div>
            </div>`
          : hasFields
          ? html`<div class="stack">
              ${allSections
                .filter((sec) => String(saved[sec] || "").trim())
                .map(
                  (sec) => html`<div><${Label}>${sec}<//>${["Scenario played", "Plan followed", "Result"].includes(sec)
                    ? html`<span class="pill ${String(saved[sec]).toLowerCase()}">${saved[sec]}</span>`
                    : html`<div class="readonly">${saved[sec]}</div>`}</div>`
                )}
              ${!allSections.some((sec) => String(saved[sec] || "").trim()) && html`<div class="muted">Nothing written for this day.</div>`}
            </div>`
          : day?.notes
          ? html`<div class="readonly">${day.notes.split("\n").map((l) => (l.trim().endsWith(":") && l.trim().length < 40 ? html`<div class="blue strong">${l}</div>` : html`<div>${l || html`<br />`}</div>`))}</div>`
          : html`<div class="muted">No notes for this day. ${"Press Edit to write one."}</div>`}
      <//>

      <div class="area-side stack">
        <${Card}
          title="Trades this day"
          actions=${dayTrades.length > 0 && html`<span class="${dayPnl >= 0 ? "pos" : "neg"} strong">${money(dayPnl, 0, true)}</span>`}
        >
          ${dayTrades.length
            ? html`<div class="mini-trades">${dayTrades.map(
                (t) => html`<div class="mini-trade"><div><div class="strong">${t.Symbole} · ${t.Setup || "—"} <span class="muted">${normDirection(t.Direction)}</span></div><div class="muted small-t">${t.log}</div></div>
                  <div class="right"><div class="strong ${t.PnL >= 0 ? "pos" : "neg"}">${money(t.PnL, 0, true)}</div><div class="muted small-t">${fmtR(t.R, true)}</div></div></div>`
              )}</div>`
            : html`<div class="muted">No trades logged for this day.</div>`}
        <//>

        <${Card} title="Emotions / personal notes">
          ${canEdit
            ? html`<${TextArea} value=${day?.emotions || ""} minRows=${8} placeholder="Empty your head here..." onInput=${setEmotions} />`
            : html`<div class="readonly">${day?.emotions || html`<span class="muted">No personal notes.</span>`}</div>`}
        <//>
      </div>
    </div>

    ${viewImg && html`<${Modal} title="News" wide=${true} onClose=${() => setViewImg(false)}><img class="full-img" src=${imgSrc(img)} alt="News" /><//>`}
    ${showTpl && html`<${TemplateEditor} onClose=${() => setShowTpl(false)} />`}
  </div>`;
}

function TemplateEditor({ onClose }) {
  const s = useStore();
  const [val, setVal] = useState(s.data.journal_template);
  const preview = templateSections(val, todayStr());
  return html`<${Modal} title="Journal template" onClose=${onClose}>
    <p class="muted" style="margin-top:0">Each line ending with <code>:</code> becomes a field. Use <code>{date}</code> for the date.</p>
    <${TextArea} value=${val} minRows=${10} onInput=${setVal} />
    <div class="chips" style="margin:12px 0">${preview.map((p) => html`<span class="chip static">${p}</span>`)}${!preview.length && html`<span class="muted">No fields detected.</span>`}</div>
    <div class="row end gap">
      <button class="btn" onClick=${onClose}>Cancel</button>
      <button class="btn primary" onClick=${() => (mutate((dd) => (dd.journal_template = val)), toast("Template saved"), onClose())}>Save template</button>
    </div>
  <//>`;
}
