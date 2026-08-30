/**
 * Lifecycle SMTP send with honest acceptance + Gmail Sent proof.
 *
 * Nodemailer generates messageId locally before Gmail has accepted anything.
 * SMTP accepted[] + 250 is necessary but not sufficient — we also require the
 * Message-ID to appear in Gmail Sent before callers may log status=sent.
 */
const nodemailer = require("nodemailer");
const { LIFECYCLE_BCC } = require("./lifecycleEmailConfig");
const { htmlFromMarkdown, plainTextFromMarkdown } = require("./emailHtml");
const { confirmMessageIdInSent } = require("./gmailSentVerify");

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
    from: '"Alan Ranger Photography Academy" <' + cfg.user + ">",
    to,
    bcc: bcc || undefined,
    subject,
    text: plainTextFromMarkdown(bodyMd),
    html: htmlFromMarkdown(bodyMd),
  });

  const accepted = info.accepted || [];
  const rejected = info.rejected || [];
  const response = String(info.response || "");
  const messageId = info.messageId;

  if (!acceptedIncludes(accepted, to)) {
    const err = new Error(
      "SMTP did not accept primary recipient " + to
        + " (accepted=" + JSON.stringify(accepted)
        + "; rejected=" + JSON.stringify(rejected)
        + "; response=" + response + ")"
    );
    err.smtp = { accepted, rejected, response, messageId };
    err.deliveryStatus = "smtp_rejected";
    throw err;
  }
  if (!/^250\b/.test(response)) {
    const err = new Error("SMTP response was not 250 OK: " + (response || "(empty)"));
    err.smtp = { accepted, rejected, response, messageId };
    err.deliveryStatus = "smtp_bad_response";
    throw err;
  }

  const gmail = await confirmMessageIdInSent(messageId);
  if (!gmail.ok || !gmail.found) {
    const err = new Error(
      "SMTP accepted " + to + " but Message-ID not found in Gmail Sent"
        + " (messageId=" + messageId + "; imap=" + (gmail.error || "not found") + ")"
    );
    err.smtp = { accepted, rejected, response, messageId };
    err.deliveryStatus = "not_in_gmail_sent";
    throw err;
  }

  return {
    messageId,
    accepted,
    rejected,
    response,
    gmailVerified: true,
  };
}

module.exports = {
  smtpConfig,
  sendLifecycleMail,
  acceptedIncludes,
  normalizeAddr,
};
