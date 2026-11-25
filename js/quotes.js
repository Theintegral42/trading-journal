// Mise à jour automatique des prix (dernier cours de clôture) via Alpha Vantage.
// Clé gratuite : https://www.alphavantage.co/support/#api-key  (~25 requêtes / jour)
import { store, mutate } from "./store.js";
import { portfolio, snapshotToday, assetCur, hasCadAssets } from "./invest.js";
import { todayStr } from "./util.js";
import { toast } from "./ui/components.js";

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let running = false;
const failed = new Set();

// Heure de New York (bourse US) : { date: "YYYY-MM-DD", minutes }
function nowET() {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false })
      .formatToParts(new Date())
      .map((x) => [x.type, x.value])
  );
  return { date: `${p.year}-${p.month}-${p.day}`, minutes: (Number(p.hour) % 24) * 60 + Number(p.minute) };
}

export async function fetchClose(ticker, key) {
  const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(ticker)}&outputsize=compact&apikey=${encodeURIComponent(key)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("Network error " + res.status);
  const j = await res.json();
  if (j.Note || j.Information) {
    const e = new Error("Daily/rate limit reached (or invalid key)");
    e.limit = true;
    throw e;
  }
  if (j["Error Message"]) throw new Error(`Unknown ticker "${ticker}"`);
  const series = j["Time Series (Daily)"];
  if (!series) throw new Error("Unexpected response");
  const dates = Object.keys(series).sort().reverse();
  const et = nowET();
  // Séance du jour pas encore terminée (avant 16h05 ET) : on prend la clôture précédente.
  const date = dates.find((d) => !(d === et.date && et.minutes < 16 * 60 + 5));
  if (!date) throw new Error("No data");
  return { price: Number(series[date]["4. close"]), date };
}

// Taux USD -> CAD (Banque centrale européenne via Frankfurter, sans clé API).
let fxRunning = false;
export async function refreshFx({ manual = false } = {}) {
  if (fxRunning) return;
  fxRunning = true;
  try {
    let j;
    for (const url of ["https://api.frankfurter.dev/v1/latest?base=USD&symbols=CAD", "https://api.frankfurter.app/latest?from=USD&to=CAD"]) {
      try {
        const r = await fetch(url);
        if (r.ok) { j = await r.json(); break; }
      } catch {}
    }
    const rate = Number(j?.rates?.CAD);
    if (!(rate > 0)) throw new Error("Exchange rate unavailable");
    mutate((x) => { x.settings.fx_usdcad = rate; x.settings.fx_date = todayStr(); });
    if (manual) toast(`1 USD = ${rate.toFixed(4)} CAD`);
  } catch (e) {
    if (manual) toast(e.message + " — enter the rate by hand", "err");
  } finally {
    fxRunning = false;
  }
}

/**
 * Met à jour les prix des positions ouvertes.
 * force=false : une seule fois par jour et par symbole (mode automatique, silencieux).
 */
export async function refreshPrices({ force = false, quiet = false } = {}) {
  const d = store.data;
  const key = (d.settings.av_key || "").trim();
  if (!key) {
    if (!quiet) toast("Add your Alpha Vantage API key first", "err");
    return { updated: 0 };
  }
  if (running) return { updated: 0 };
  running = true;
  try {
    const today = todayStr();
    const syms = portfolio(d, null).open.map((p) => p.symbol).filter((s) => force || (d.inv_prices[s]?.fetched !== today && !failed.has(today + s)));
    if (!syms.length) return { updated: 0 };
    const got = {};
    const errors = [];
    for (let i = 0; i < syms.length; i++) {
      const sym = syms[i];
      try {
        // Titre canadien sans ticker personnalisé : suffixe Toronto (.TRT) ajouté automatiquement
        const ticker = d.inv_assets[sym]?.ticker || (assetCur(d, sym) === "CAD" && !sym.includes(".") ? sym + ".TRT" : sym);
        got[sym] = await fetchClose(ticker, key);
      } catch (e) {
        errors.push(`${sym}: ${e.message}`);
        failed.add(today + sym); // pas de nouvel essai automatique aujourd'hui (économise le quota)
        if (e.limit) break;
      }
      if (i < syms.length - 1) await wait(1300);
    }
    const n = Object.keys(got).length;
    if (n) {
      mutate((x) => {
        for (const [sym, q] of Object.entries(got)) x.inv_prices[sym] = { price: q.price, date: q.date, fetched: today };
        snapshotToday(x);
      });
    }
    if (!quiet || errors.length) {
      if (n) toast(`${n} price(s) updated`);
      if (errors.length) toast(errors[0] + (errors.length > 1 ? ` (+${errors.length - 1})` : ""), "err");
    } else if (n) toast(`Prices updated (${n})`);
    return { updated: n, errors };
  } catch (e) {
    if (!quiet) toast("Could not fetch prices: " + e.message, "err");
    return { updated: 0 };
  } finally {
    running = false;
  }
}

// Appelé au démarrage puis toutes les heures : ne fait quelque chose que si des prix n'ont pas été récupérés aujourd'hui.
export function startAutoRefresh() {
  const tick = () => {
    if (!store.ready || document.visibilityState !== "visible" || !navigator.onLine) return;
    if ((store.data.settings.inv_currency === "CAD" || hasCadAssets(store.data)) && store.data.settings.fx_date !== todayStr()) refreshFx();
    if (!store.data.settings.av_key || store.data.settings.av_auto === false) return;
    refreshPrices({ quiet: true });
  };
  setTimeout(tick, 6000); // laisse la synchro OneDrive se terminer d'abord
  setInterval(tick, 3600000);
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && setTimeout(tick, 3000));
}
