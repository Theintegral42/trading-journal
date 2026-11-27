// Jours "No-trade" : événements calculés ou issus de sources officielles + ajouts / modifications manuels.
// Les dates sont intégrées à l'app (pas de flux externe). Les ajouts, modifications et masquages de l'utilisateur
// sont stockés dans le plan (plan.ev_custom, plan.ev_over) et ne sont jamais écrasés par une mise à jour de l'app.
import { pad, parseDate, addDays, fmtDate } from "./util.js";

// level : "no" = jour à éviter, "closed" = marché fermé / séance écourtée (information)
export const KINDS = {
  fomc: { code: "FOMC", label: "FOMC", level: "no" },
  nfp: { code: "NFP", label: "NFP", level: "no" },
  jh: { code: "JH", label: "Jackson Hole", level: "no" },
  witching: { code: "Witch", label: "Triple witching", level: "no" },
  opex: { code: "OPEX", label: "OPEX", level: "no" },
  qend: { code: "Q-end", label: "Quarter end", level: "no" },
  yearend: { code: "Holiday", label: "Year-end", level: "no" },
  holiday: { code: "Closed", label: "Market closed", level: "closed" },
  early: { code: "½ day", label: "Early close", level: "closed" },
  custom: { code: "Note", label: "Custom", level: "no" },
};
const ORDER = Object.keys(KINDS);

// Jour 2 de chaque réunion (jour de la décision) — https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm
const FOMC = [
  "2025-01-29", "2025-03-19", "2025-05-07", "2025-06-18", "2025-07-30", "2025-09-17", "2025-10-29", "2025-12-10",
  "2026-01-28", "2026-03-18", "2026-04-29", "2026-06-17", "2026-07-29", "2026-09-16", "2026-10-28", "2026-12-09",
  "2027-01-27", "2027-03-17", "2027-04-28", "2027-06-09", "2027-07-28", "2027-09-15", "2027-10-27", "2027-11-17",
];
// Employment Situation (8h30 ET) — https://www.bls.gov/schedule/news_release/empsit.htm (calendrier publié jusqu'à fin 2027)
const NFP = [
  "2026-11-06", "2026-12-04", "2027-01-08", "2027-02-05", "2027-03-05", "2027-04-02", "2027-05-07",
  "2027-06-04", "2027-07-02", "2027-08-06", "2027-09-03", "2027-10-08", "2027-11-05", "2027-12-03",
];
// Symposium de Jackson Hole (Kansas City Fed) — 2027 pas encore annoncé : à ajouter à la main.
const JH = ["2026-08-27", "2026-08-28"];

const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const dow = (s) => parseDate(s).getDay(); // 0 = dimanche

function nthWeekday(y, m, wd, n) {
  const off = (wd - new Date(y, m - 1, 1).getDay() + 7) % 7;
  return ymd(y, m, 1 + off + 7 * (n - 1));
}
function lastWeekday(y, m, wd) {
  const last = new Date(y, m, 0);
  return ymd(y, m, last.getDate() - ((last.getDay() - wd + 7) % 7));
}
// Jour férié tombant un week-end : samedi -> vendredi (sauf jour de l'An), dimanche -> lundi.
function observed(y, m, d, satToFri = true) {
  const s = ymd(y, m, d);
  const w = dow(s);
  if (w === 6) return satToFri ? addDays(s, -1) : null;
  if (w === 0) return addDays(s, 1);
  return s;
}
function easter(y) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mo = Math.floor((h + l - 7 * m + 114) / 31), da = ((h + l - 7 * m + 114) % 31) + 1;
  return ymd(y, mo, da);
}

const holCache = new Map();
// Jours fériés NYSE / Nasdaq d'une année.
export function marketHolidays(y) {
  if (holCache.has(y)) return holCache.get(y);
  const list = [
    [observed(y, 1, 1, false), "New Year's Day"],
    [nthWeekday(y, 1, 1, 3), "Martin Luther King Jr. Day"],
    [nthWeekday(y, 2, 1, 3), "Presidents' Day"],
    [addDays(easter(y), -2), "Good Friday"],
    [lastWeekday(y, 5, 1), "Memorial Day"],
    [y >= 2022 ? observed(y, 6, 19) : null, "Juneteenth"],
    [observed(y, 7, 4), "Independence Day"],
    [nthWeekday(y, 9, 1, 1), "Labor Day"],
    [nthWeekday(y, 11, 4, 4), "Thanksgiving"],
    [observed(y, 12, 25), "Christmas Day"],
  ].filter(([d]) => d);
  holCache.set(y, list.map(([date, title]) => ({ date, title })));
  return holCache.get(y);
}
const isHoliday = (s) => marketHolidays(Number(s.slice(0, 4))).some((h) => h.date === s);
const isBusinessDay = (s) => dow(s) >= 1 && dow(s) <= 5 && !isHoliday(s);

const autoCache = new Map();
// Événements automatiques d'une année.
export function autoEvents(y) {
  if (autoCache.has(y)) return autoCache.get(y);
  const out = [];
  const add = (kind, date, title, note = "") => out.push({ key: `${kind}:${date}`, kind, date, title, note, auto: true });
  FOMC.filter((d) => d.startsWith(y + "-")).forEach((d) => add("fomc", d, "No-trade — FOMC", "Rate decision, statement 2:00 pm ET"));
  NFP.filter((d) => d.startsWith(y + "-")).forEach((d) => add("nfp", d, "No-trade — NFP", "Jobs report 8:30 am ET"));
  JH.filter((d) => d.startsWith(y + "-")).forEach((d) => add("jh", d, "No-trade — Jackson Hole", "Kansas City Fed symposium"));
  for (let m = 1; m <= 12; m++) {
    let fri = nthWeekday(y, m, 5, 3); // 3e vendredi : expiration des options
    if (isHoliday(fri)) fri = addDays(fri, -1);
    if (m % 3 === 0) add("witching", fri, "No-trade — Triple witching", "Quarterly options / futures expiration");
    else add("opex", fri, "No-trade — OPEX", "Monthly options expiration");
    if (m % 3 === 0) {
      let last = ymd(y, m, new Date(y, m, 0).getDate());
      while (!isBusinessDay(last)) last = addDays(last, -1);
      add("qend", last, "No-trade — Quarter end", "Quarter-end rebalancing");
    }
  }
  for (let d = 24; d <= 31; d++) {
    const s = ymd(y, 12, d);
    if (isBusinessDay(s)) add("yearend", s, "No-trade — Year-end holidays", "Thin liquidity");
  }
  marketHolidays(y).forEach((h) => add("holiday", h.date, `Market closed — ${h.title}`));
  const tg = nthWeekday(y, 11, 4, 4);
  add("early", addDays(tg, 1), "Early close (1:00 pm ET)", "Day after Thanksgiving");
  autoCache.set(y, out);
  return out;
}

// Événements entre deux dates (incluses), avec modifications de l'utilisateur appliquées.
// includeHidden : renvoie aussi les événements masqués (flag `hidden`), pour l'écran de gestion.
export function eventsInRange(plan, from, to, { includeHidden = false } = {}) {
  const over = (plan && plan.ev_over) || {};
  const list = [];
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) list.push(...autoEvents(y));
  (plan && plan.ev_custom ? plan.ev_custom : []).forEach((c) => list.push({ key: "c:" + c.id, id: c.id, kind: "custom", date: c.date, title: c.title, note: c.note || "", auto: false }));
  const res = [];
  for (const e of list) {
    if (e.date < from || e.date > to) continue;
    const o = over[e.key] || {};
    const ev = { ...e, hidden: !!o.hidden, edited: !!(o.title || o.note), title: o.title || e.title, note: o.note !== undefined && o.note !== "" ? o.note : e.note };
    if (ev.hidden && !includeHidden) continue;
    res.push(ev);
  }
  return res.sort((a, b) => a.date.localeCompare(b.date) || ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind));
}

// Regroupe par jour : { "2026-12-09": [event, ...] }
export function eventsByDay(plan, from, to) {
  const map = {};
  eventsInRange(plan, from, to).forEach((e) => (map[e.date] ||= []).push(e));
  return map;
}

export const isNoTrade = (evs) => !!evs && evs.some((e) => KINDS[e.kind].level === "no");

export const monthRange = (month) => {
  const [y, m] = month.split("-").map(Number);
  return [`${month}-01`, ymd(y, m, new Date(y, m, 0).getDate())];
};
export const daysFromToday = (s) => Math.round((parseDate(s) - parseDate(fmtDate(new Date()))) / 86400000);
