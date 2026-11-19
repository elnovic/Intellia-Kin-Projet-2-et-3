// Adresse de l'API. Remplacez-la par l'adresse donnée par Render
// (par exemple https://intellia-academie-api.onrender.com), sans barre finale.
window.IK_CONFIG = {
  apiBase:
    location.hostname === "localhost" || location.hostname === "127.0.0.1"
      ? "http://localhost:8000"
      : "https://intellia-academie-api.onrender.com",
};
