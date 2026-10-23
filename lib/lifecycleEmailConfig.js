// Shared lifecycle email constants — all Academy automated send paths BCC Alan.
const LIFECYCLE_BCC = "info@alanranger.com";
const DASHBOARD_URL = "https://www.alanranger.com/academy/dashboard";
const MODULE_MAP_URL = "https://www.alanranger.com/academy/online-photography-course/";

/** Visible From for client-facing Academy automation (news subdomain). */
const LIFECYCLE_FROM_ADDRESS_DEFAULT = "hello@news.alanranger.com";
/** Gmail SMTP login — alias hello@news is authorised on this mailbox. */
const LIFECYCLE_SMTP_USER_DEFAULT = "info@alanranger.com";
const LIFECYCLE_FROM_NAME_DEFAULT = "Alan Ranger Photography";

function realPreviewSubjectPrefix(stageKey) {
  return `[REAL-PREVIEW – ${stageKey}]`;
}

/**
 * SMTP auth vs visible From are separate so bulk mail can leave info@'s reputation.
 * Auth: ORPHANED_EMAIL_SMTP_USER || EMAIL_SMTP_USER || info@
 * From: ORPHANED_EMAIL_FROM || EMAIL_FROM || hello@news…
 */
function lifecycleSmtpIdentity() {
  const pass = process.env.ORPHANED_EMAIL_PASSWORD || process.env.EMAIL_PASSWORD || "";
  const host = process.env.EMAIL_SMTP_HOST || "smtp.gmail.com";
  const port = Number.parseInt(process.env.EMAIL_SMTP_PORT || "587", 10);
  const user =
    process.env.ORPHANED_EMAIL_SMTP_USER
    || process.env.EMAIL_SMTP_USER
    || LIFECYCLE_SMTP_USER_DEFAULT;
  const fromAddress =
    process.env.ORPHANED_EMAIL_FROM
    || process.env.EMAIL_FROM
    || LIFECYCLE_FROM_ADDRESS_DEFAULT;
  const fromName =
    process.env.ORPHANED_EMAIL_FROM_NAME
    || LIFECYCLE_FROM_NAME_DEFAULT;
  return {
    user,
    pass,
    host,
    port,
    secure: port === 465,
    fromAddress,
    fromName,
    fromHeader: `"${fromName}" <${fromAddress}>`,
  };
}

module.exports = {
  LIFECYCLE_BCC,
  DASHBOARD_URL,
  MODULE_MAP_URL,
  LIFECYCLE_FROM_ADDRESS_DEFAULT,
  LIFECYCLE_SMTP_USER_DEFAULT,
  LIFECYCLE_FROM_NAME_DEFAULT,
  realPreviewSubjectPrefix,
  lifecycleSmtpIdentity,
};
