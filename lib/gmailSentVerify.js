/**
 * Optional Gmail IMAP lookup for Academy lifecycle mail (same mailbox as SMTP).
 *
 * Soft evidence only: SMTP 250 + accepted[] is the send truth. Message-ID in
 * Sent / All Mail is a bonus when Gmail exposes it; many BCC'd sends never
 * show up reliably via IMAP even when recipients got the mail.
 */

function imapAuth() {
  const user = process.env.ORPHANED_EMAIL_FROM || process.env.EMAIL_FROM;
  const pass = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD;
  return { user, pass };
}

function normMid(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^<|>$/g, "");
}

async function openMailbox(client, which) {
  if (which === "all") {
    try {
      await client.mailboxOpen("[Gmail]/All Mail");
    } catch (_e) {
      await client.mailboxOpen("INBOX");
    }
    return;
  }
  try {
    await client.mailboxOpen("[Gmail]/Sent Mail");
  } catch (_e) {
    await client.mailboxOpen("Sent");
  }
}

async function withImap(fn, mailbox = "sent") {
  const { user, pass } = imapAuth();
  if (!user || !pass) {
    return { ok: false, error: "ORPHANED_EMAIL_FROM/PASSWORD missing", result: null };
  }
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
    await openMailbox(client, mailbox);
    const result = await fn(client);
    await client.logout();
    return { ok: true, error: null, result };
  } catch (err) {
    try {
      if (client) await client.logout();
    } catch (_e) {
      /* ignore */
    }
    return { ok: false, error: err.message || String(err), result: null };
  }
}

async function verifyGmailSent(recipients, sinceDate) {
  const wanted = [...new Set((recipients || []).map((e) => String(e || "").toLowerCase()).filter(Boolean))];
  const counts = Object.fromEntries(wanted.map((e) => [e, 0]));
  const wrapped = await withImap(async (client) => {
    for (const email of wanted) {
      const uids = await client.search({ since: sinceDate, to: email }, { uid: true });
      counts[email] = uids ? [...uids].length : 0;
    }
    return counts;
  }, "sent");
  if (!wrapped.ok) return { ok: false, error: wrapped.error, counts };
  return { ok: true, error: null, counts: wrapped.result || counts };
}

async function scanRecentForMessageId(client, want) {
  const recent = [...(await client.search({ since: new Date(Date.now() - 2 * 86400000) }, { uid: true }) || [])];
  const slice = recent.slice(-120);
  if (!slice.length) return false;
  for await (const msg of client.fetch({ uid: slice }, { envelope: true, uid: true })) {
    if (normMid(msg.envelope && msg.envelope.messageId) === want) return true;
  }
  return false;
}

async function messageIdInMailbox(messageId, mailbox) {
  const want = normMid(messageId);
  if (!want) return { ok: false, found: false, error: "empty messageId" };
  const bracketed = "<" + want + ">";
  const wrapped = await withImap(async (client) => {
    for (const raw of [bracketed, want]) {
      try {
        const hit = await client.search({ header: { "message-id": raw } }, { uid: true });
        if (hit && [...hit].length) {
          // Header search alone can false-positive; confirm envelope when possible.
          const uids = [...hit].slice(-5);
          for await (const msg of client.fetch({ uid: uids }, { envelope: true, uid: true })) {
            if (normMid(msg.envelope && msg.envelope.messageId) === want) return true;
          }
        }
      } catch (_e) {
        /* fall through */
      }
    }
    return scanRecentForMessageId(client, want);
  }, mailbox);
  if (!wrapped.ok) return { ok: false, found: false, error: wrapped.error };
  return { ok: true, found: !!wrapped.result, error: null };
}

async function messageIdInGmailSent(messageId) {
  return messageIdInMailbox(messageId, "sent");
}

async function confirmMessageIdInSent(messageId, opts = {}) {
  const attempts = opts.attempts || 3;
  const delayMs = opts.delayMs || 1200;
  const mailboxes = opts.mailboxes || ["sent"];
  let last = { ok: false, found: false, error: "not attempted" };
  for (let i = 0; i < attempts; i += 1) {
    for (const box of mailboxes) {
      last = await messageIdInMailbox(messageId, box);
      if (last.ok && last.found) return last;
    }
    if (i + 1 < attempts) await new Promise((r) => setTimeout(r, delayMs));
  }
  return last;
}

function collectEnvelopeEmails(envelope) {
  const out = [];
  for (const field of ["to", "cc", "bcc"]) {
    for (const item of (envelope && envelope[field]) || []) {
      if (item.address) out.push(String(item.address).toLowerCase());
      else if (item.mailbox && item.host) {
        out.push((item.mailbox + "@" + item.host).toLowerCase());
      }
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

module.exports = {
  verifyGmailSent,
  messageIdInGmailSent,
  messageIdInMailbox,
  confirmMessageIdInSent,
  collectEnvelopeEmails,
  countFoundFor,
  normMid,
};
