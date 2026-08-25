import { renderHtmlTemplate } from "./email";
import { sendEmailJs } from "./emailjs";

const REGISTRATION_REVIEW_EMAIL =
  process.env.REACT_APP_REGISTRATION_REVIEW_EMAIL || "";

const MAINCOMPANY_EMAIL =
  process.env.REACT_APP_MAINCOMPANY_EMAIL || "";

const VERIFICATION_TEAM_NAME =
  process.env.REACT_APP_VERIFICATION_TEAM_NAME ||
  "Prüfteam Mischtisch Sachsen";

function isValidEmail(value) {
  return (
    typeof value === "string" &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
  );
}

// Empfängerliste parsen: kommagetrennte Zeichenkette in ein Array zerlegen,
// Einträge trimmen, Leereinträge verwerfen. Einzelne Empfänger bleiben gültig.
export function parseRecipients(value) {
  return String(value || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) =>
    ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character],
  );
}

export function textToHtml(text) {
  return escapeHtml(text || "").replace(/\r?\n/g, "<br />");
}

// Zustellung EINER Registrierungs-Mail über EmailJS (SMTP.js wurde entfernt —
// EmailJS ist der einzige Versandweg). recipient darf eine kommagetrennte
// Liste sein; jede Adresse wird einzeln geprüft, danach wird die Liste mit
// ", " wieder zusammengesetzt und EmailJS liefert an alle Empfänger.
async function sendRegistrationMessage({
  type,
  recipient,
  subject,
  text,
  html,
  replyTo = "",
}) {
  const recipients = parseRecipients(recipient);
  if (
    recipients.length === 0 ||
    recipients.some((address) => !isValidEmail(address))
  ) {
    return {
      type,
      recipient: recipient || null,
      success: false,
      error: "Empfänger fehlt oder ist ungültig",
    };
  }

  const result = await sendEmailJs({
    to: recipients.join(", "),
    subject,
    html: html || textToHtml(text),
    replyTo,
  });

  return {
    type,
    recipient,
    ...result,
  };
}

export async function sendRegistrationEmails(payload) {
  const {
    hostName,
    companyName,
    email,
    phone,
    street,
    postalCode,
    city,
    venueType,
    region,
    registrationDate,
    regCode,
    accountEmail,
    temporaryPassword,
    credentialsCreatedAt,
  } = payload || {};

  if (!isValidEmail(email)) {
    return {
      success: false,
      error: "Keine gültige Gastgeber-E-Mail",
    };
  }

  if (!regCode || typeof regCode !== "string") {
    return {
      success: false,
      error: "Registrierungsnummer fehlt",
    };
  }

  const templateValues = {
    hostName: hostName || "—",
    companyName: companyName || "—",
    email,
    phone: phone || "—",
    street: street || "—",
    postalCode: postalCode || "—",
    city: city || "—",
    venueType: venueType || "—",
    region: region || "—",
    registrationDate: registrationDate || "—",
    registrationNumber: regCode,
    verificationTeamName: VERIFICATION_TEAM_NAME,
    accountEmail: accountEmail || email,
    temporaryPassword: temporaryPassword || "—",
    credentialsCreatedAt:
      credentialsCreatedAt || registrationDate || "—",
  };

  // EmailJS ist der einzige Zustellweg (SMTP.js wurde entfernt): die fertigen
  // HTML-Briefe (01–03) werden lokal gerendert und komplett übergeben.
  const company =
    templateValues.companyName || templateValues.registrationNumber;
  let hostHtml = "";
  let verificationHtml = "";
  let internalHtml = "";

  try {
    [hostHtml, verificationHtml, internalHtml] =
      await Promise.all([
        renderHtmlTemplate(
          "01_restaurant_registration_confirmation",
          templateValues,
        ),
        renderHtmlTemplate(
          "02_external_verification_request",
          templateValues,
        ),
        renderHtmlTemplate(
          "03_internal_generated_credentials",
          templateValues,
        ),
      ]);
  } catch (error) {
    console.error("Registration template error:", error);

    return {
      success: false,
      error:
        error?.message ||
        "Registrierungs-E-Mail-Vorlagen konnten nicht geladen werden",
    };
  }

  const [hostEmail, verificationEmail, internalEmail] =
    await Promise.all([
      sendRegistrationMessage({
        type: "host",
        recipient: templateValues.email,
        subject:
          `Ihre Registrierung bei Mischtisch Sachsen — ${company}`,
        html: hostHtml,
        replyTo: templateValues.email,
      }),
      sendRegistrationMessage({
        type: "verification",
        recipient: REGISTRATION_REVIEW_EMAIL,
        subject:
          `Prüfauftrag: Neue Betriebsregistrierung — ${company}`,
        html: verificationHtml,
        replyTo: templateValues.email,
      }),
      sendRegistrationMessage({
        type: "internal",
        recipient: MAINCOMPANY_EMAIL,
        subject:
          `Interne Zugangsdaten: ${company} — Mischtisch Sachsen`,
        html: internalHtml,
        replyTo: templateValues.email,
      }),
    ]);

  return {
    success:
      hostEmail.success &&
      verificationEmail.success &&
      internalEmail.success,
    regCode,
    hostEmail,
    verificationEmail,
    internalEmail,
  };
}
