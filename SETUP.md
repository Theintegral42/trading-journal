# Mise en route — Trading Journal (PWA)

Cette app est un site 100 % statique : elle tourne dans le navigateur, n'a **aucun serveur** et stocke tes données dans **ton OneDrive** (dossier d'application dédié). Ton PC n'a pas besoin d'être allumé.

Il y a 3 étapes, à faire une seule fois (≈ 15 min) :

1. Inscrire l'app auprès de Microsoft (gratuit) pour autoriser la connexion OneDrive
2. Mettre le site en ligne (gratuit)
3. Importer tes données existantes

---

## 1. Inscrire l'app dans Microsoft Entra (gratuit)

1. Va sur <https://entra.microsoft.com> et connecte-toi avec le **compte Microsoft qui contient ton OneDrive**.
   (Si Microsoft propose de créer un « tenant » / répertoire gratuit, accepte.)
2. **Identité → Applications → Inscriptions d'applications → Nouvelle inscription**.
   - **Nom** : `Trading Journal` (c'est aussi le nom du dossier créé dans OneDrive)
   - **Types de comptes pris en charge** : *Comptes dans un annuaire organisationnel **et comptes Microsoft personnels***
   - **URI de redirection** : plateforme **Application monopage (SPA)**, valeur = l'adresse de ton site (voir étape 2), par ex. `https://TON-PSEUDO.github.io/trading-journal/`
     (avec le `/` final, exactement comme l'adresse du site)
3. Clique **Inscrire**, puis copie l'**ID d'application (client)** (format `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).
4. **Autorisations de l'API → Ajouter une autorisation → Microsoft Graph → Autorisations déléguées** et vérifie/ajoute :
   - `Files.ReadWrite.AppFolder` — accès **uniquement** au dossier dédié `OneDrive/Applications/Trading Journal`
   - `User.Read` (déjà présent)
   Aucun consentement administrateur n'est nécessaire.
5. Colle l'ID dans `web/js/config.js` (champ `clientId`), **ou** attends et saisis-le dans l'app (Réglages → Compte) sur chaque appareil.

> Tu peux ajouter plusieurs URI de redirection (ex. aussi `http://localhost:8765/web/` pour tester sur ton PC avec `Lancer Journal (web).bat`).

## 2. Mettre le site en ligne

### Option A — GitHub Pages (gratuit, le plus simple)

1. Crée un compte sur <https://github.com>, puis **New repository** → nom `trading-journal`, **Public**.
   *Le dépôt ne contient que le code, jamais tes données.*
2. **Add file → Upload files** : glisse **le contenu du dossier `web/`** (index.html, css, js, icons, sw.js, manifest.webmanifest…). **Ne mets jamais `trading_journal_data.json`.**
3. **Commit changes**, puis **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `/ (root)` → Save**.
4. Après 1–2 minutes, ton site est à `https://TON-PSEUDO.github.io/trading-journal/`.
   Utilise exactement cette adresse comme URI de redirection à l'étape 1.

### Option B — Code privé : Cloudflare Pages ou Netlify (gratuit)

- Netlify : <https://app.netlify.com/drop> → glisse le dossier `web/`. Tu obtiens une adresse `https://xxxx.netlify.app/` à mettre en URI de redirection.
- Cloudflare Pages : *Workers & Pages → Create → Pages → Upload assets*.

## 3. Première connexion et import des données

1. Ouvre le site sur ton PC → **Sign in with Microsoft** → accepte la permission.
2. Bandeau « Nothing in OneDrive yet » → **Settings → Backup & export → Import JSON** → choisis
   `Trading app\trading_journal_data.json` (ton fichier actuel, converti automatiquement).
3. Les données sont envoyées dans `OneDrive › Applications › Trading Journal › trading_journal_data.json`.
   Ce fichier est synchronisé par OneDrive sur tous tes appareils (et reste lisible/exportable).

Sur téléphone / tablette / autre PC : ouvre l'adresse du site, connecte-toi avec le même compte Microsoft. Les données se chargent automatiquement.

### Installer comme une vraie app
- **iPhone / iPad (Safari)** : Partager → *Sur l'écran d'accueil*. Connecte-toi **depuis l'app installée**.
- **Android (Chrome)** : menu ⋮ → *Installer l'application*.
- **PC (Chrome / Edge)** : icône « Installer » dans la barre d'adresse.

---

## Comment ça se synchronise

- Chaque modification est enregistrée sur l'appareil immédiatement (fonctionne **hors-ligne**), puis envoyée à OneDrive ~3 s après ta dernière frappe, et à la fermeture de l'onglet.
- Au retour dans l'app, elle vérifie si un autre appareil a modifié le fichier et le récupère.
- **Conflit** (même fichier modifié sur deux appareils sans sync entre-temps) : l'app te demande quelle version garder ; l'autre est sauvegardée dans `OneDrive › Applications › Trading Journal › backups`.
- Une sauvegarde automatique du fichier est faite chaque jour dans `backups/` (les 14 dernières sont conservées).
- La session Microsoft expire parfois (≈ 24 h) : un bandeau propose de se reconnecter, tes modifications restent sur l'appareil.

## Confidentialité

- Le site n'a pas de serveur : tes données vont **directement du navigateur à Microsoft**.
- La permission `Files.ReadWrite.AppFolder` limite l'accès à un seul dossier.
- Tout le monde peut ouvrir l'adresse du site, mais sans ton compte Microsoft il n'y voit aucune donnée.
- Le client ID n'est pas un secret.

## Mettre à jour l'app plus tard

Remplace les fichiers dans le dépôt GitHub (Upload files, même noms). Les appareils prennent la nouvelle version au prochain chargement.
