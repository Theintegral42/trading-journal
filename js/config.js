// Configuration de l'app.
//
// clientId : "Application (client) ID" de ton inscription d'app Azure (voir SETUP.md).
// Tu peux soit le coller ici avant de déployer, soit le saisir une fois dans
// Réglages > Compte (il est alors mémorisé dans le navigateur de l'appareil).
export const CONFIG = {
  clientId: "8396617f-578b-475f-92c9-8666ceac24b9",
  // "common" accepte comptes Microsoft personnels + professionnels/scolaires.
  authority: "https://login.microsoftonline.com/common",
  // Nom du fichier de données dans le dossier d'application OneDrive
  // (OneDrive > Applications > <nom de ton app Azure>).
  fileName: "trading_journal_data.json",
  backupsFolder: "backups",
  keepBackups: 14,
  appVersion: "2.8.1",
};

export function getClientId() {
  return CONFIG.clientId || localStorage.getItem("tj_client_id") || "";
}
