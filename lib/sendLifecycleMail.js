/**
 * Lifecycle SMTP send with honest acceptance.
 *
 * Nodemailer generates messageId locally before Gmail has accepted anything.
 * SMTP accepted[] + 250 is the delivery truth for this mailbox.
 * Gmail Sent / All Mail Message-ID lookup is a soft bonus only — IMAP often
 * misses BCC'd Academy sends even when the recipient (and Outlook) got them.
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

async function softConfirmInMailbox(messageId) {
  try {
    return await confirmMessageIdInSent(messageId, {
      attempts: 2,
      delayMs: 900,
      mailboxes: ["sent", "all"],
    });
  } catch (err) {
    return { ok: false, found: false, error: err.message || String(err) };
  }
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

  const gmail = await softConfirmInMailbox(messageId);
  const deliveryStatus = gmail.ok && gmail.found ? "gmail_verified" : "smtp_accepted";

  return {
    messageId,
    accepted,
    rejected,
    response,
    deliveryStatus,
    gmailVerified: deliveryStatus === "gmail_verified",
    imapNote: gmail.ok && gmail.found ? null : (gmail.error || "not found in Sent/All Mail"),
  };
}

module.exports = {
  smtpConfig,
  sendLifecycleMail,
  acceptedIncludes,
  normalizeAddr,
};
