import { html } from "../lib/preact-htm.js";
import { store, useStore, mutate } from "../store.js";
import { Segmented } from "./components.js";
import { refreshFx } from "../quotes.js";
import { todayStr } from "../util.js";

// Change la devise d'affichage de toute l'app (USD / CAD) et récupère le taux du jour si nécessaire.
export function setDisplayCurrency(cur) {
  mutate((x) => (x.settings.inv_currency = cur));
  const st = store.data.settings;
  if (cur === "CAD" && (!(Number(st.fx_usdcad) > 0) || st.fx_date !== todayStr())) refreshFx({ manual: true });
}

export function CurrencySwitch() {
  const s = useStore();
  const cur = s.data.settings.inv_currency === "CAD" ? "CAD" : "USD";
  return html`<div class="cur-switch" title="Display currency"><${Segmented} value=${cur} options=${["USD", "CAD"]} onChange=${setDisplayCurrency} /></div>`;
}
