import { html, useState, useEffect, useRef } from "../lib/preact-htm.js";

const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  journal: '<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>',
  notes: '<path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5z"/><path d="M14 2v6h6M8 13h8M8 17h8M8 9h2"/>',
  briefcase: '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"/>',
  settings: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  left: '<path d="m15 18-6-6 6-6"/>',
  right: '<path d="m9 18 6-6-6-6"/>',
  cloud: '<path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  refresh: '<path d="M21 12a9 9 0 0 0-15-6.7L3 8M3 3v5h5M3 12a9 9 0 0 0 15 6.7L21 16M21 21v-5h-5"/>',
  more: '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21"/>',
  logo: '<path d="m22 7-8.5 8.5-5-5L2 17"/><path d="M16 7h6v6"/>',
  folder: '<path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.7-.9L9.6 3.9A2 2 0 0 0 7.9 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2z"/>',
  target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  wifioff: '<path d="M2 2l20 20M8.5 16.4a5 5 0 0 1 7 0M2 8.8a15 15 0 0 1 4.2-2.6M10.7 5.1A15 15 0 0 1 22 8.8M5 12.9a10 10 0 0 1 5.2-2.7M19 12.9a10 10 0 0 0-2.3-1.7M12 20h.01"/>',
};

export function Icon({ name, size = 18, class: cls = "" }) {
  return html`<svg class="icon ${cls}" width=${size} height=${size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" dangerouslySetInnerHTML=${{ __html: ICONS[name] || "" }}></svg>`;
}

// ---------- toasts & confirmations ----------
const bus = new Set();
let dialogState = { toasts: [], confirm: null };
const push = () => bus.forEach((f) => f({ ...dialogState }));

export function toast(message, kind = "ok") {
  const id = Math.random();
  dialogState.toasts = [...dialogState.toasts, { id, message, kind }];
  push();
  setTimeout(() => {
    dialogState.toasts = dialogState.toasts.filter((t) => t.id !== id);
    push();
  }, 3200);
}

export function confirmDialog({ title = "Confirm", message = "", confirmText = "Confirm", danger = false }) {
  return new Promise((resolve) => {
    dialogState.confirm = { title, message, confirmText, danger, resolve };
    push();
  });
}

export function DialogHost() {
  const [s, setS] = useState({ ...dialogState });
  useEffect(() => {
    bus.add(setS);
    return () => bus.delete(setS);
  }, []);
  const close = (v) => {
    const c = dialogState.confirm;
    dialogState.confirm = null;
    push();
    c?.resolve(v);
  };
  return html`
    <div class="toasts">
      ${s.toasts.map((t) => html`<div class="toast ${t.kind}" key=${t.id}><${Icon} name=${t.kind === "ok" ? "check" : "alert"} size=${16} /> ${t.message}</div>`)}
    </div>
    ${s.confirm &&
    html`<${Modal} title=${s.confirm.title} onClose=${() => close(false)} small=${true}>
      <p class="muted" style="margin:0 0 18px;white-space:pre-wrap">${s.confirm.message}</p>
      <div class="row end gap">
        <button class="btn" onClick=${() => close(false)}>Cancel</button>
        <button class="btn ${s.confirm.danger ? "danger" : "primary"}" onClick=${() => close(true)}>${s.confirm.confirmText}</button>
      </div>
    <//>`}
  `;
}

export function Modal({ title, onClose, children, small, wide }) {
  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return html`<div class="overlay" onMouseDown=${(e) => e.target === e.currentTarget && onClose?.()}>
    <div class="modal ${small ? "small" : ""} ${wide ? "wide" : ""}" role="dialog" aria-modal="true">
      <div class="modal-head"><h3>${title}</h3><button class="icon-btn" aria-label="Close" onClick=${onClose}><${Icon} name="x" /></button></div>
      <div class="modal-body">${children}</div>
    </div>
  </div>`;
}

export function Segmented({ value, options, onChange, size = "" }) {
  return html`<div class="segmented ${size}">
    ${options.map((o) => {
      const v = typeof o === "object" ? o.value : o;
      const l = typeof o === "object" ? o.label : o || "—";
      return html`<button type="button" class=${v === value ? "active " + String(v).toLowerCase() : ""} onClick=${() => onChange(v)}>${l}</button>`;
    })}
  </div>`;
}

export function Select({ value, options, onChange, class: cls = "", ...rest }) {
  return html`<select class="input ${cls}" value=${value} onChange=${(e) => onChange(e.target.value)} ...${rest}>
    ${options.map((o) => {
      const v = typeof o === "object" ? o.value : o;
      const l = typeof o === "object" ? o.label : o;
      return html`<option value=${v} selected=${String(v) === String(value)}>${l}</option>`;
    })}
  </select>`;
}

export function TextArea({ value, onInput, minRows = 3, class: cls = "", ...rest }) {
  const ref = useRef();
  const fit = () => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + 2 + "px";
  };
  useEffect(fit, [value]);
  return html`<textarea ref=${ref} class="input ta ${cls}" rows=${minRows} value=${value} onInput=${(e) => onInput(e.target.value)} ...${rest}></textarea>`;
}

export function Field({ label, children, hint }) {
  return html`<label class="field"><span class="field-label">${label}</span>${children}${hint && html`<span class="hint">${hint}</span>`}</label>`;
}

export function Card({ title, actions, children, class: cls = "", pad = true }) {
  return html`<section class="card ${cls}">
    ${(title || actions) && html`<header class="card-head"><h3>${title}</h3><div class="row gap">${actions}</div></header>`}
    <div class=${pad ? "card-body" : ""}>${children}</div>
  </section>`;
}

export function Empty({ icon = "list", title, children }) {
  return html`<div class="empty"><${Icon} name=${icon} size=${34} /><h4>${title}</h4><p class="muted">${children}</p></div>`;
}

export function ChartCanvas({ type, data, options, height = 280 }) {
  const ref = useRef();
  const chart = useRef();
  const sig = JSON.stringify([type, data, options?.plugins?.annotation ?? null]);
  useEffect(() => {
    if (!window.Chart) return;
    chart.current?.destroy();
    chart.current = new window.Chart(ref.current, { type, data, options: { responsive: true, maintainAspectRatio: false, ...options } });
    return () => chart.current?.destroy();
  }, [sig]);
  return html`<div class="chart-wrap" style=${{ height: height + "px" }}><canvas ref=${ref}></canvas></div>`;
}
