/**
 * Lifecycle SMTP send with honest acceptance checks.
 *
 * Nodemailer generates `messageId` locally before Gmail has accepted anything.
 * Logging "sent" on a resolved promise alone produced phantom day-minus-1 rows
 * whose Message-IDs never appeared in Sent/All Mail. We only call a send real
 * when the primary `to` address is in `info.accepted` and the SMTP response
 * is a 250.
 */
const nodemailer = require("nodemailer");
const { LIFECYCLE_BCC } = require("./lifecycleEmailConfig");
const { htmlFromMarkdown, plainTextFromMarkdown } = require("./emailHtml");

function smtpConfig() {
  const user = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM || "";
  const pass = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD || "";
  const host = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
  const port = Number.parseInt(process.env.EMAIL_SMTP_PORT || "587", 10);
  return { user, pass, host, port, secure: port === 465 };
}

function normalizeAddr(value) {
  return String(value || "").trim().toLowerCase();
}

function acceptedIncludes(accepted, email) {
  const want = normalizeAddr(email);
  return (accepted || []).some((a) => normalizeAddr(a) === want);
}

/**
 * @returns {Promise<{
 *   messageId: string,
 *   accepted: string[],
 *   rejected: string[],
 *   response: string,
 * }>}
 */
async function sendLifecycleMail({ to, subject, bodyMd, bcc = LIFECYCLE_BCC }) {
  const cfg = smtpConfig();
  if (!cfg.user || !cfg.pass) {
    throw new Error("Email SMTP not configured (ORPHANED_EMAIL_FROM/PASSWORD)");
  }
  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const info = await transporter.sendMail({
    from: `"Alan Ranger Photography Academy" <${cfg.user}>`,
    to,
    bcc: bcc || undefined,
    subject,
    text: plainTextFromMarkdown(bodyMd),
    html: htmlFromMarkdown(bodyMd),
  });

  const accepted = info.accepted || [];
  const rejected = info.rejected || [];
  const response = String(info.response || "");

  if (!acceptedIncludes(accepted, to)) {
    const err = new Error(
      `SMTP did not accept primary recipient ${to}`
      + ` (accepted=${JSON.stringify(accepted)}; rejected=${JSON.stringify(rejected)}; response=${response})`
    );
    err.smtp = { accepted, rejected, response, messageId: info.messageId };
    throw err;
  }
  if (!/^250\b/.test(response)) {
    const err = new Error(`SMTP response was not 250 OK: ${response || "(empty)"}`);
    err.smtp = { accepted, rejected, response, messageId: info.messageId };
    throw err;
  }

  return {
    messageId: info.messageId,
    accepted,
    rejected,
    response,
  };
}

module.exports = {
  smtpConfig,
  sendLifecycleMail,
  acceptedIncludes,
  normalizeAddr,
};
