// Envoi d'e-mails par Resend (offre gratuite : 3 000 par mois, 100 par jour).
// Sans clé RESEND_API_KEY, aucun e-mail n'est envoyé : l'Académie le sait et
// propose de passer par l'équipe.

import { HttpError } from "./http.js";

export const emailEnabled = (config) => Boolean(config.resendApiKey);

export async function sendEmail(config, { to, subject, html, text }) {
  if (!emailEnabled(config)) throw new HttpError(503, "L'envoi d'e-mails n'est pas configuré.");
  let response;
  try {
    response = await (config.fetch || fetch)("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.resendApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: config.emailFrom, to: [to], subject, html, text }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.log(`Resend injoignable : ${err.message}`);
    throw new HttpError(502, "L'e-mail n'a pas pu être envoyé. Réessayez dans quelques minutes.");
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.log(`Resend a refusé l'envoi (${response.status}) : ${detail.slice(0, 300)}`);
    throw new HttpError(502, "L'e-mail n'a pas pu être envoyé. Réessayez dans quelques minutes.");
  }
}

const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** E-mail du code « mot de passe oublié ». */
export function resetCodeEmail({ name, code, minutes, academyUrl }) {
  const first = escapeHtml(String(name || "").split(" ")[0] || "");
  const text = `Bonjour ${first},

Voici votre code pour choisir un nouveau mot de passe sur l'Académie Intellia Kin :

${code}

Ce code est valable ${minutes} minutes. Saisissez-le sur la page « Mot de passe oublié ».

Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.

L'équipe Intellia Kin
${academyUrl}`;
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;max-width:520px;margin:auto;color:#0a2540;line-height:1.5">
  <p style="font-size:20px;font-weight:bold;margin:0 0 16px">Académie Intellia Kin</p>
  <p>Bonjour ${first},</p>
  <p>Voici votre code pour choisir un nouveau mot de passe :</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#eef6ff;border-radius:8px;padding:16px;text-align:center;margin:16px 0">${code}</p>
  <p>Ce code est valable <strong>${minutes} minutes</strong>. Saisissez-le sur la page « Mot de passe oublié ».</p>
  <p style="color:#555;font-size:14px">Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail : votre mot de passe actuel reste valable.</p>
  <p>L'équipe Intellia Kin<br><a href="${escapeHtml(academyUrl)}" style="color:#0066ff">${escapeHtml(academyUrl.replace(/^https?:\/\//, ""))}</a></p>
</div>`;
  return { subject: `${code} est votre code de l'Académie Intellia Kin`, text, html };
}
