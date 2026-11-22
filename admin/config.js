// Adresses de l'API (Worker Cloudflare) et de l'Académie publique, sans barre finale.
window.IK_CONFIG = {
  apiBase:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8787"
      : "https://intellia-academie-api.intelliakin.workers.dev",
  publicSite:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8080"
      : "https://academie.intelliakin.com",
};
