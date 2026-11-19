// Adresses de l'API et de l'Académie publique. À ajuster si Render donne une autre adresse.
window.IK_CONFIG = {
  apiBase:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8000"
      : "https://intellia-academie-api.onrender.com",
  publicSite:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8080"
      : "https://academie.intelliakin.com",
};
