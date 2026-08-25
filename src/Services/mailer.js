import { renderHtmlTemplate } from "./email";
import { emailJsConfigured, sendEmailJs } from "./emailjs";

const SMTP_SECURE_TOKEN =
  process.env.REACT_APP_SMTP_SECURE_TOKEN || "";

const MAIL_FROM =
  process.env.REACT_APP_MAIL_FROM || "";

const MAIL_FROM_NAME =
  process.env.REACT_APP_MAIL_FROM_NAME ||
  "Mischtisch Sachsen";

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

function textToHtml(text) {
  return escapeHtml(text || "").replace(/\r?\n/g, "<br />");
}

function getSmtpClient() {
  if (
    typeof window === "undefined" ||
    !window.Email ||
    typeof window.Email.send !== "function"
  ) {
    throw new Error(
      "SMTP.js wurde nicht geladen. Prüfen Sie public/index.html.",
    );
  }

  if (!SMTP_SECURE_TOKEN) {
    throw new Error(
      "REACT_APP_SMTP_SECURE_TOKEN fehlt.",
    );
  }

  if (!isValidEmail(MAIL_FROM)) {
    throw new Error(
      "REACT_APP_MAIL_FROM fehlt oder ist ungültig.",
    );
  }

  return window.Email;
}

async function deliverEmail({ to, subject, text, html }) {
  const client = getSmtpClient();

  const response = await client.send({
    SecureToken: SMTP_SECURE_TOKEN,
    To: to.trim(),
    From: MAIL_FROM.trim(),
    FromName: MAIL_FROM_NAME,
    Subject: subject,
    Body: html || textToHtml(text),
  });

  const message = String(response || "").trim();

  if (message.toUpperCase() !== "OK") {
    throw new Error(message || "SMTP.js konnte die E-Mail nicht versenden.");
  }

  return {
    success: true,
    message,
  };
}

export async function sendEmail({ to, subject, text, html }) {
  if (!isValidEmail(to)) {
    return {
      success: false,
      error: "Keine gültige Empfänger-E-Mail",
    };
  }

  if (!subject || (!text && !html)) {
    return {
      success: false,
      error: "Betreff sowie Text oder HTML sind erforderlich",
    };
  }

  try {
    return await deliverEmail({
      to,
      subject,
      text,
      html,
    });
  } catch (error) {
    console.error("SMTP.js send error:", error);

    return {
      success: false,
      error:
        error?.message ||
        "E-Mail konnte nicht versendet werden",
    };
  }
}

async function sendRegistrationMessage({
  type,
  recipient,
  subject,
  text,
  html,
}) {
  if (!isValidEmail(recipient)) {
    return {
      type,
      recipient: recipient || null,
      success: false,
      error: "Empfänger fehlt oder ist ungültig",
    };
  }

  const result = await sendEmail({
    to: recipient,
    subject,
    text,
    html,
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

  // Gemeinsame Textbausteine für SMTP- und EmailJS-Pfad.
  const hostLines = [
    `Guten Tag ${hostName || ""},`,
    "Ihre Registrierung wurde erfolgreich übermittelt.",
    `Registrierungsnummer: ${regCode}`,
    "Ihre Angaben werden nun geprüft.",
  ];
  const verificationLines = [
    "Eine neue Betriebsregistrierung wurde eingereicht.",
    `Betrieb: ${companyName || "—"}`,
    `Ansprechpartner: ${hostName || "—"}`,
    `E-Mail: ${email}`,
    // `Registrierungsnummer: ${regCode}`,
  ];
  const internalLines = [
    `Ein neuer Betrieb wurde registriert: ${companyName || "—"}`,
    `Ansprechpartner: ${hostName || "—"}`,
    `E-Mail-Adresse des Zugangs: ${accountEmail || email}`,
    `Registrierungsnummer: ${regCode}`,
    `Zugang erstellt am: ${
      credentialsCreatedAt || registrationDate || "—"
    }`,
  ];

  // EmailJS als Zustellquelle, sobald konfiguriert (eine gemeinsame Vorlage
  // für alle Mail-Typen); sonst läuft der SMTP.js-Fallback unten.
  if (emailJsConfigured) {
    return sendRegistrationEmailsViaEmailJs({ values: templateValues });
  }

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
        recipient: email,
        subject:
          `Ihre Registrierung bei Mischtisch Sachsen — ` +
          `${companyName || regCode}`,
        text: hostLines.join("\n\n"),
        html: hostHtml,
      }),
      sendRegistrationMessage({
        type: "verification",
        recipient: REGISTRATION_REVIEW_EMAIL,
        subject:
          `Prüfauftrag: Neue Betriebsregistrierung — ` +
          `${companyName || regCode}`,
        text: verificationLines.join("\n"),
        html: verificationHtml,
      }),
      sendRegistrationMessage({
        type: "internal",
        recipient: MAINCOMPANY_EMAIL,
        subject:
          `Interne Zugangsdaten: ${companyName || regCode} — ` +
          "Mischtisch Sachsen",
        text: internalLines.join("\n"),
        html: internalHtml,
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

async function sendRegistrationMessageViaEmailJs({
  type,
  recipient,
  ...params
}) {
  if (!isValidEmail(recipient)) {
    return {
      type,
      recipient: recipient || null,
      success: false,
      error: "Empfänger fehlt oder ist ungültig",
    };
  }

  const result = await sendEmailJs({ to: recipient, ...params });

  return {
    type,
    recipient,
    ...result,
  };
}

// EmailJS-Pfad: die fertigen HTML-Briefe (01–03) werden lokal gerendert und
// komplett an EmailJS geschickt — die Daten stecken bereits in der Vorlage.
async function sendRegistrationEmailsViaEmailJs({ values }) {
  const company = values.companyName || values.registrationNumber;

  let hostHtml = "", verificationHtml = "", internalHtml = "";
  try {
    [hostHtml, verificationHtml, internalHtml] = await Promise.all([
      renderHtmlTemplate("01_restaurant_registration_confirmation", values),
      renderHtmlTemplate("02_external_verification_request", values),
      renderHtmlTemplate("03_internal_generated_credentials", values),
    ]);
  } catch (error) {
    // Vorlage nicht verfügbar — keine leeren Briefe verschicken.
    console.error("Registration HTML template error:", error);
    return {
      success: false,
      error:
        error?.message ||
        "Registrierungs-E-Mail-Vorlagen konnten nicht geladen werden",
    };
  }

  const [hostEmail, verificationEmail, internalEmail] =
    await Promise.all([
      sendRegistrationMessageViaEmailJs({
        type: "host",
        recipient: values.email,
        subject:
          `Ihre Registrierung bei Mischtisch Sachsen — ${company}`,
        html: hostHtml,
        replyTo: values.email,
      }),
      sendRegistrationMessageViaEmailJs({
        type: "verification",
        recipient: REGISTRATION_REVIEW_EMAIL,
        subject:
          `Prüfauftrag: Neue Betriebsregistrierung — ${company}`,
        html: verificationHtml,
        replyTo: values.email,
      }),
      sendRegistrationMessageViaEmailJs({
        type: "internal",
        recipient: MAINCOMPANY_EMAIL,
        subject:
          `Interne Zugangsdaten: ${company} — Mischtisch Sachsen`,
        html: internalHtml,
        replyTo: values.email,
      }),
    ]);

  return {
    success:
      hostEmail.success &&
      verificationEmail.success &&
      internalEmail.success,
    regCode: values.registrationNumber,
    hostEmail,
    verificationEmail,
    internalEmail,
  };
}
