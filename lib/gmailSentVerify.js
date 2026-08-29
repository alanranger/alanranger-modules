/**
 * Read Gmail Sent for last-24h Academy lifecycle mail (same mailbox as SMTP).
 * Uses IMAP with the existing ORPHANED_EMAIL_* app password — no extra OAuth.
 */

async function verifyGmailSent(recipients, sinceDate) {
  const user = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
  const pass = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
  if (!user || !pass) {
    return { ok: false, error: "ORPHANED_EMAIL_FROM/PASSWORD missing", counts: {} };
  }
  const wanted = [...new Set((recipients || []).map((e) => String(e || "").toLowerCase()).filter(Boolean))];
  const counts = Object.fromEntries(wanted.map((e) => [e, 0]));
  let client;
  try {
    const { ImapFlow } = require("imapflow");
    client = new ImapFlow({
      host: process.env.EMAIL_IMAP_HOST || "imap.gmail.com",
      port: 993,
      secure: true,
      auth: { user, pass },
      logger: false,
    });
    await client.connect();
    try {
      await client.mailboxOpen("[Gmail]/Sent Mail");
    } catch (_e) {
      await client.mailboxOpen("Sent");
    }
    for (const email of wanted) {
      const uids = await client.search({ since: sinceDate, to: email }, { uid: true });
      counts[email] = uids ? [...uids].length : 0;
    }
    await client.logout();
    return { ok: true, error: null, counts };
  } catch (err) {
    try {
      if (client) await client.logout();
    } catch (_e) {
      /* ignore */
    }
    return { ok: false, error: err.message || String(err), counts };
  }
}

function collectEnvelopeEmails(envelope) {
  const out = [];
  for (const field of ["to", "cc", "bcc"]) {
    for (const item of envelope?.[field] || []) {
      if (item.mailbox && item.host) out.push(`${item.mailbox}@${item.host}`.toLowerCase());
    }
  }
  return out;
}

function countFoundFor(emails, counts) {
  const seen = new Set();
  let n = 0;
  for (const email of emails || []) {
    const key = String(email).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if ((counts[key] || 0) > 0) n += 1;
  }
  return n;
}

module.exports = { verifyGmailSent, collectEnvelopeEmails, countFoundFor };
