// Adresse de l'API (Worker Cloudflare), sans barre finale.
// En local : « npx wrangler dev » dans le dossier api écoute sur le port 8787.
window.IK_CONFIG = {
  apiBase:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8787"
      : "https://intellia-academie-api.intelliakin.workers.dev",
};
