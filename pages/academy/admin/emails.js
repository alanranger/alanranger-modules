import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

// Inline stage config rather than fetching it — the admin UI knows every
// webhook URL and param set up-front. Keep in sync with lib/emailStages.js
// (which the webhooks themselves do NOT consume; it's only the admin map).

const TRIAL_WEBHOOK = '/api/admin/trial-expiry-reminder-webhook';
const REWIND_WEBHOOK = '/api/admin/lapsed-trial-reengagement-webhook';

const STAGES = [
  {
    key: 'day-minus-7',
    shortLabel: 'Day -7',
    displayName: 'Day -7 · Mid-trial reminder',
    sentBy: 'trial-expiry-reminder-webhook',
    schedule: {
      cadence: 'daily',
      timeOfDay: '09:00 Europe/London',
      mechanism: 'Vercel Cron (08:00 + 09:00 UTC with London-hour gate)',
    },
    description:
      'Halfway through the 14-day trial. Activity block, 5-step plan, full feature list, personal signed dashboard link.',
    webhook: TRIAL_WEBHOOK,
    params: { daysAhead: 7, forceDaysUntilExpiry: 7 },
  },
  {
    key: 'day-minus-1',
    shortLabel: 'Day -1',
    displayName: 'Day -1 · Final-day reminder',
    sentBy: 'trial-expiry-reminder-webhook',
    schedule: {
      cadence: 'daily',
      timeOfDay: '09:00 Europe/London',
      mechanism: 'Vercel Cron (08:00 + 09:00 UTC with London-hour gate)',
    },
    description:
      'Last day of the free trial. Activity block, quick wins, members-only resources, full feature list. No discount.',
    webhook: TRIAL_WEBHOOK,
    params: { daysAhead: 1, forceDaysUntilExpiry: 1 },
  },
  {
    key: 'day-plus-7',
    shortLabel: 'Day +7',
    displayName: 'Day +7 · SAVE20 offer',
    sentBy: 'trial-expiry-reminder-webhook',
    schedule: {
      cadence: 'daily',
      timeOfDay: '09:00 Europe/London',
      mechanism: 'Vercel Cron (08:00 + 09:00 UTC with London-hour gate)',
    },
    description:
      '7 days after trial expiry. SAVE20 code (£79 → £59). Offer valid Day +7 → Day +13.',
    webhook: TRIAL_WEBHOOK,
    params: { daysAhead: -7, forceDaysUntilExpiry: -7 },
  },
  {
    key: 'day-plus-20',
    shortLabel: 'Day +20',
    displayName: 'Day +20 · REWIND20 attempt 1',
    sentBy: 'lapsed-trial-reengagement-webhook',
    schedule: {
      cadence: 'weekly (Zapier)',
      timeOfDay: '—',
      mechanism: 'Zapier schedule. Gated server-side: 3-send cap + min days + min gap.',
    },
    description:
      'First REWIND20 outreach. Activity block, quick wins, members-only, feature list, REWIND20 code.',
    webhook: REWIND_WEBHOOK,
    params: {},
  },
  {
    key: 'day-plus-30',
    shortLabel: 'Day +30',
    displayName: 'Day +30 · REWIND20 attempt 2',
    sentBy: 'lapsed-trial-reengagement-webhook',
    schedule: {
      cadence: 'weekly (Zapier)',
      timeOfDay: '—',
      mechanism: 'Fires 10+ days after attempt 1 if still not converted.',
    },
    description: 'Second REWIND20 outreach (subject escalates). Same body as attempt 1.',
    webhook: REWIND_WEBHOOK,
    params: {},
  },
  {
    key: 'day-plus-60',
    shortLabel: 'Day +60',
    displayName: 'Day +60 · REWIND20 final attempt',
    sentBy: 'lapsed-trial-reengagement-webhook',
    schedule: {
      cadence: 'weekly (Zapier)',
      timeOfDay: '—',
      mechanism: 'Fires 30+ days after attempt 2. Max 3 attempts per member.',
    },
    description: 'Third and final REWIND20 outreach ("Final offer").',
    webhook: REWIND_WEBHOOK,
    params: {},
  },
];

const STAGE_KEYS = STAGES.map((s) => s.key);
const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

const TABS = [
  { href: '/academy/admin', label: 'Overview' },
  { href: '/academy/admin/members', label: 'Members' },
  { href: '/academy/admin/activity', label: 'Activity' },
  { href: '/academy/admin/exams', label: 'Exams' },
  { href: '/academy/admin/ghost', label: 'Ghost' },
  { href: '/academy/admin/qa', label: 'Q&A' },
  { href: '/academy/admin/engagement', label: 'Engagement' },
  { href: '/academy/admin/emails', label: 'Emails' },
];

// ─────────────────────────────────────────────────────────────────────────
// Small formatters
// ─────────────────────────────────────────────────────────────────────────

function formatDateShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' });
}

function formatDateTimeShort(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

function formatRelative(iso, nowMs) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return '—';
  const diff = t - nowMs;
  const hours = Math.round(diff / 3600000);
  if (hours < 1) return 'within the hour';
  if (hours < 24) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

function markdownToHtml(body) {
  if (!body) return '';
  return String(body)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

// HTML-escapes then applies minimal markdown-lite -> HTML so the iframe
// preview renders safely. Used by the template editor preview pane.
function markdownLiteToSafeHtml(body) {
  if (!body) return '';
  const escaped = String(body)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .replaceAll(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
}

// Client-side mirror of lib/emailTemplateDefaults.js renderTemplate. Kept
// locally so the editor preview doesn't require bundling the server lib.
function renderTemplateClient(source, vars) {
  if (typeof source !== 'string') return '';
  return source.replaceAll(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    if (!vars || !Object.hasOwn(vars, key)) return match;
    const value = vars[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

const TEMPLATE_PREVIEW_VARS = Object.freeze({
  firstName: 'Alan',
  fullName: 'Alan Ranger',
  expiryDate: 'Monday, 28 April 2026',
  upgradeUrl: 'https://example.com/upgrade?preview=1',
  dashboardUrl: 'https://example.com/dashboard?preview=1',
  unsubUrl: 'https://example.com/unsub?preview=1',
  activityBlock: '\n**Your Academy activity so far**\n\n- **Last logged in** 2 days ago\n- You\'ve logged in **6 times** during your trial\n- **3 modules** viewed\n- **2 of 30 practice packs** used so far\n- **1 of 15 exams** attempted so far\n',
  daysUntilExpiry: 7,
  daysLeft: 7,
  daysWord: 'days',
  daysLeftPhrase: '**7 days**',
  daysLapsed: 22,
  annualPriceGbp: 79,
  save20PriceGbp: 59,
  save20DiscountGbp: 20,
  couponCode: 'SAVE20',
});

// ─────────────────────────────────────────────────────────────────────────
// Data fetching (no third-party hooks; plain fetch)
// ─────────────────────────────────────────────────────────────────────────

async function loadStats() {
  const res = await fetch('/api/admin/emails-stats');
  if (!res.ok) throw new Error(`stats HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.stages) ? data.stages : [];
}

async function loadTableRows(days = 90) {
  const res = await fetch(`/api/admin/emails-members?days=${days}&limit=500`);
  if (!res.ok) throw new Error(`members-table HTTP ${res.status}`);
  const data = await res.json();
  return {
    rows: Array.isArray(data.rows) ? data.rows : [],
    attributionWindowDays: data.attribution_window_days || 14,
    generatedAt: data.generated_at,
  };
}

async function loadTemplates() {
  const res = await fetch('/api/admin/emails-templates');
  if (!res.ok) throw new Error(`templates HTTP ${res.status}`);
  const data = await res.json();
  return {
    stages: Array.isArray(data.stages) ? data.stages : [],
    mergeTags: Array.isArray(data.merge_tags) ? data.merge_tags : [],
  };
}

async function saveTemplate({ stageKey, subject, bodyMd, revert }) {
  const payload = revert
    ? { stage_key: stageKey, revert: true }
    : { stage_key: stageKey, subject, body_md: bodyMd };
  const res = await fetch('/api/admin/emails-templates-save', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.success === false) {
    throw new Error(data.error || `save HTTP ${res.status}`);
  }
  return data;
}

function buildWebhookUrl(stage, email, sendEmail) {
  const qs = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(stage.params).map(([k, v]) => [k, String(v)])
    ),
    testEmail: email,
    sendEmail: sendEmail ? 'true' : 'false',
  });
  return `${stage.webhook}?${qs.toString()}`;
}

function extractPreview(webhookData) {
  if (webhookData?.preview?.subject) return webhookData.preview;
  if (webhookData?.result?.preview?.subject) return webhookData.result.preview;
  if (webhookData?.email_content_preview?.subject) return webhookData.email_content_preview;
  return null;
}

async function fetchPreview(stage, email) {
  const res = await fetch(buildWebhookUrl(stage, email, false));
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `preview HTTP ${res.status}`);
  }
  const preview = extractPreview(data);
  if (!preview) {
    return {
      subject: '(preview unavailable — webhook did not return rendered copy)',
      body: JSON.stringify(data, null, 2),
      html: `<pre>${JSON.stringify(data, null, 2)}</pre>`,
    };
  }
  if (!preview.html && preview.body) {
    preview.html = markdownToHtml(preview.body);
  }
  return preview;
}

async function fireTestSend(stage, email) {
  const res = await fetch(buildWebhookUrl(stage, email, true));
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || data?.result?.error || `test-send HTTP ${res.status}`);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────
// Client-side eligibility check (keeps UI filter logic matched to webhooks)
// ─────────────────────────────────────────────────────────────────────────

const DAY_MS = 86400000;

const REWIND_ATTEMPT_BY_STAGE = {
  'day-plus-20': 1,
  'day-plus-30': 2,
  'day-plus-60': 3,
};

function computeDiffDays(row, nowMs) {
  if (!row?.trial_end_at) return null;
  const endMs = new Date(row.trial_end_at).getTime();
  if (!Number.isFinite(endMs)) return null;
  return (endMs - nowMs) / DAY_MS;
}

const TRIAL_DAYS_AHEAD = {
  'day-minus-7': 7,
  'day-minus-1': 1,
  'day-plus-7': -7,
};

function utcDateKey(ms) {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

function isEligibleForTrialReminder(row, stageKey, nowMs) {
  const daysAhead = TRIAL_DAYS_AHEAD[stageKey];
  if (daysAhead === undefined) return false;
  const endMs = new Date(row.trial_end_at).getTime();
  if (!Number.isFinite(endMs)) return false;
  // Match the cron webhook: trial_end_at falls on the same UTC calendar day
  // as (now + daysAhead). Day -1 fired today targets everyone whose trial
  // ends anywhere tomorrow; Day -7 targets +7d; Day +7 targets -7d.
  return utcDateKey(endMs) === utcDateKey(nowMs + daysAhead * DAY_MS);
}

function isEligibleForRewind(row, diffDays, attempt) {
  if (row.reengagement_opted_out) return false;
  const lapsedDays = -diffDays;
  if (lapsedDays < 20 || lapsedDays > 180) return false;
  return (row.reengagement_send_count || 0) === attempt - 1;
}

function isRowEligibleForStage(row, stageKey, nowMs) {
  if (!row || row.converted_at) return false;
  const rewindAttempt = REWIND_ATTEMPT_BY_STAGE[stageKey];
  if (rewindAttempt) {
    const diffDays = computeDiffDays(row, nowMs);
    if (diffDays === null) return false;
    return isEligibleForRewind(row, diffDays, rewindAttempt);
  }
  return isEligibleForTrialReminder(row, stageKey, nowMs);
}

// ─────────────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────────────

function NavTabs({ active }) {
  return (
    <div style={{
      display: 'flex', gap: 8, marginBottom: 24,
      borderBottom: '1px solid var(--ar-border)', paddingBottom: 12, flexWrap: 'wrap',
    }}>
      {TABS.map((tab) => {
        const isActive = tab.href === active;
        return (
          <Link key={tab.href} href={tab.href} style={{
            padding: '8px 16px',
            background: isActive ? 'var(--ar-card)' : 'transparent',
            border: isActive ? '1px solid var(--ar-border)' : '1px solid transparent',
            borderRadius: 6,
            color: isActive ? 'var(--ar-text)' : 'var(--ar-text-muted)',
            textDecoration: 'none',
            fontWeight: isActive ? 600 : 500,
            fontSize: 14,
          }}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function StageTile({ stage, stats, active, onClick, nowMs }) {
  const eligible = stats?.eligible_today ?? '—';
  const sent24 = stats?.sent_last_24h ?? 0;
  const nextSendAt = stats?.next_send_at;
  const nextLabel = nextSendAt
    ? `${formatDateTimeShort(nextSendAt)} · ${formatRelative(nextSendAt, nowMs)}`
    : 'Zapier (weekly)';
  const borderColor = active ? 'var(--ar-accent, #4a7fff)' : 'var(--ar-border)';
  return (
    <button
      type="button"
      onClick={() => onClick(stage.key)}
      style={{
        textAlign: 'left',
        padding: '14px 14px 12px',
        background: 'var(--ar-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>
        {stage.shortLabel.toUpperCase()}
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, lineHeight: 1 }}>
        {eligible}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 4 }}>
        eligible today · {sent24} sent 24h
      </div>
      <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 8, lineHeight: 1.4 }}>
        Next: {nextLabel}
      </div>
    </button>
  );
}

function StageTilesRow({ stats, activeKey, onTileClick, nowMs }) {
  const byKey = useMemo(() => {
    const m = {};
    (stats || []).forEach((s) => { m[s.key] = s; });
    return m;
  }, [stats]);
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
      gap: 12, marginBottom: 20,
    }}>
      {STAGES.map((s) => (
        <StageTile
          key={s.key}
          stage={s}
          stats={byKey[s.key]}
          active={activeKey === s.key}
          onClick={onTileClick}
          nowMs={nowMs}
        />
      ))}
    </div>
  );
}

const SEND_BADGE_COLORS = {
  sent: 'var(--ar-success, #0a0)',
  failed: 'var(--ar-danger, #d33)',
};

function StageSendBadge({ ev }) {
  if (!ev) return <span style={{ color: 'var(--ar-text-muted)' }}>—</span>;
  const color = SEND_BADGE_COLORS[ev.status] || 'var(--ar-text-muted)';
  return (
    <span title={`${ev.status}: ${ev.sent_at}`} style={{ color, fontSize: 12 }}>
      {formatDateShort(ev.sent_at)}
    </span>
  );
}

function ConversionCell({ row }) {
  if (row.converted_at) {
    const label = row.converted_within_window
      ? `Yes · via ${STAGE_BY_KEY[row.conversion_attributed_stage]?.shortLabel || row.conversion_attributed_stage}`
      : 'Yes · organic';
    const color = row.converted_within_window
      ? 'var(--ar-success, #0a0)'
      : 'var(--ar-text-muted)';
    return (
      <span style={{ color, fontSize: 12, fontWeight: row.converted_within_window ? 600 : 400 }}>
        {label}
      </span>
    );
  }
  if (row.reengagement_opted_out) {
    return <span style={{ color: 'var(--ar-danger, #d33)', fontSize: 12 }}>Unsubbed</span>;
  }
  return <span style={{ color: 'var(--ar-text-muted)', fontSize: 12 }}>No</span>;
}

function MembersTable({ rows, filterStage, onRowClick, attributionWindowDays }) {
  if (!rows) return null;
  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, color: 'var(--ar-text-muted)', fontSize: 14 }}>
        No members match the current filter.
      </div>
    );
  }
  return (
    <div style={{
      border: '1px solid var(--ar-border)', borderRadius: 8,
      overflow: 'auto', maxHeight: 600, background: 'var(--ar-card)',
    }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--ar-card)', zIndex: 1 }}>
          <tr style={{ borderBottom: '1px solid var(--ar-border)' }}>
            <th style={thStyle}>Member</th>
            <th style={thStyle}>Trial end</th>
            {STAGES.map((s) => (
              <th
                key={s.key}
                style={{
                  ...thStyle,
                  color: filterStage === s.key ? 'var(--ar-accent, #4a7fff)' : 'inherit',
                }}
              >
                {s.shortLabel}
              </th>
            ))}
            <th style={thStyle} title={`Attribution window: ${attributionWindowDays} days`}>
              Converted?
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.member_id}
              onClick={() => onRowClick?.(row)}
              style={{
                borderBottom: '1px solid var(--ar-border)',
                cursor: onRowClick ? 'pointer' : 'default',
              }}
            >
              <td style={tdStyle}>
                <div style={{ fontWeight: 600 }}>{row.name || '—'}</div>
                <div style={{ fontSize: 11, color: 'var(--ar-text-muted)' }}>{row.email}</div>
              </td>
              <td style={tdStyle}>{formatDateShort(row.trial_end_at)}</td>
              {STAGES.map((s) => (
                <td
                  key={s.key}
                  style={{
                    ...tdStyle,
                    background: filterStage === s.key ? 'rgba(74,127,255,0.08)' : 'transparent',
                  }}
                >
                  <StageSendBadge ev={row.sends?.[s.key]} />
                </td>
              ))}
              <td style={tdStyle}><ConversionCell row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thStyle = {
  padding: '10px 12px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 12,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  color: 'var(--ar-text-muted)',
};

const tdStyle = {
  padding: '10px 12px',
  verticalAlign: 'top',
};

function rowMatchesMemberSearch(row, searchEmail, searchName) {
  const e = searchEmail.trim().toLowerCase();
  const n = searchName.trim().toLowerCase();
  if (e && !(row.email || '').toLowerCase().includes(e)) return false;
  if (n && !(row.name || '').toLowerCase().includes(n)) return false;
  return true;
}

function MemberPicker({
  members,
  value,
  onChange,
  searchEmail,
  searchName,
  onSearchEmailChange,
  onSearchNameChange,
}) {
  const filtered = useMemo(
    () => members.filter((m) => rowMatchesMemberSearch(m, searchEmail, searchName)),
    [members, searchEmail, searchName],
  );
  const displayList = useMemo(() => {
    if (!value) return filtered;
    const has = filtered.some((m) => m.email === value);
    if (has) return filtered;
    const picked = members.find((m) => m.email === value);
    return picked ? [picked, ...filtered] : filtered;
  }, [filtered, value, members]);

  const inputStyle = {
    width: '100%',
    padding: '8px 10px',
    fontSize: 13,
    border: '1px solid var(--ar-border)',
    borderRadius: 6,
    background: 'var(--ar-card)',
    color: 'var(--ar-text)',
    boxSizing: 'border-box',
  };
  const smallLabel = { fontSize: 11, fontWeight: 600, color: 'var(--ar-text-muted)', display: 'block', marginBottom: 4 };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
        Preview / test against member
      </div>
      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end',
      }}>
        <div style={{ flex: '2 1 220px', minWidth: 0 }}>
          <label htmlFor="ar-email-member-picker" style={{ ...smallLabel, marginBottom: 4 }}>
            Member
          </label>
          <select
            id="ar-email-member-picker"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
              width: '100%', padding: '8px 10px', fontSize: 14,
              border: '1px solid var(--ar-border)', borderRadius: 6,
              background: 'var(--ar-card)', color: 'var(--ar-text)',
            }}
          >
            <option value="">— pick a member —</option>
            {displayList.map((m) => (
              <option key={m.member_id || m.email} value={m.email}>
                {m.email}{m.name ? ` · ${m.name}` : ''}
              </option>
            ))}
          </select>
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <label htmlFor="ar-email-filter-email" style={smallLabel}>Filter by email</label>
          <input
            id="ar-email-filter-email"
            type="search"
            autoComplete="off"
            placeholder="Contains…"
            value={searchEmail}
            onChange={(ev) => onSearchEmailChange(ev.target.value)}
            style={inputStyle}
          />
        </div>
        <div style={{ flex: '1 1 160px', minWidth: 0 }}>
          <label htmlFor="ar-email-filter-name" style={smallLabel}>Filter by name</label>
          <input
            id="ar-email-filter-name"
            type="search"
            autoComplete="off"
            placeholder="Contains…"
            value={searchName}
            onChange={(ev) => onSearchNameChange(ev.target.value)}
            style={inputStyle}
          />
        </div>
      </div>
      {(searchEmail.trim() || searchName.trim()) ? (
        <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 6 }}>
          {displayList.length} member{displayList.length === 1 ? '' : 's'} in dropdown (table below uses the same filters)
        </div>
      ) : null}
    </div>
  );
}

function PreviewPanel({ preview, stage, memberEmail, onTestSend, testState }) {
  if (!stage) {
    return (
      <div style={{ padding: 24, color: 'var(--ar-text-muted)', fontSize: 14 }}>
        Click a stage tile above, then pick a member to render its email.
      </div>
    );
  }
  if (!memberEmail) {
    return (
      <div style={{ padding: 24, color: 'var(--ar-text-muted)', fontSize: 14 }}>
        Pick a member to render this email against their real activity data.
      </div>
    );
  }
  if (preview?.loading) {
    return <div style={{ padding: 24, fontSize: 14 }}>Rendering preview…</div>;
  }
  if (preview?.error) {
    return (
      <div style={{ padding: 16, fontSize: 14, color: 'var(--ar-danger, #d33)' }}>
        Preview failed: {preview.error}
      </div>
    );
  }
  if (!preview?.data) return null;

  return (
    <div>
      <div style={{
        padding: 12, background: 'var(--ar-card)',
        border: '1px solid var(--ar-border)', borderRadius: 6, marginBottom: 12,
      }}>
        <div style={{ fontSize: 12, color: 'var(--ar-text-muted)' }}>Subject</div>
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>{preview.data.subject}</div>
      </div>
      <div style={{
        padding: 16, background: 'var(--ar-card)',
        border: '1px solid var(--ar-border)', borderRadius: 6,
        maxHeight: 500, overflow: 'auto', fontSize: 14, lineHeight: 1.55,
      }}>
        <div dangerouslySetInnerHTML={{ __html: preview.data.html || '' }} />
      </div>
      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          onClick={onTestSend}
          disabled={testState?.loading}
          style={{
            padding: '8px 16px', background: 'var(--ar-accent, #4a7fff)',
            color: 'white', border: 'none', borderRadius: 6, fontWeight: 600,
            cursor: testState?.loading ? 'wait' : 'pointer', fontSize: 14,
          }}
        >
          {testState?.loading ? 'Sending…' : `Send test to ${memberEmail}`}
        </button>
        {testState?.success ? (
          <span style={{ color: 'var(--ar-success, #0a0)', fontSize: 13 }}>
            ✓ Sent (BCC info@alanranger.com)
          </span>
        ) : null}
        {testState?.error ? (
          <span style={{ color: 'var(--ar-danger, #d33)', fontSize: 13 }}>
            {testState.error}
          </span>
        ) : null}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────
// Templates section (Phase 2: read-only viewer)
// ─────────────────────────────────────────────────────────────────────────

const SCHEDULE_DOW_LABELS = { mon: 'Mon', tue: 'Tue', wed: 'Wed', thu: 'Thu', fri: 'Fri', sat: 'Sat', sun: 'Sun' };

// Template cards use a dark code-editor aesthetic that matches the admin
// page's dark theme. Only the preview iframe stays white, because it is
// rendering a representation of the actual email (which will be delivered
// as a light-theme HTML document in the recipient's mail client).
const TPL_PALETTE = Object.freeze({
  cardBg: '#1f2937',
  cardText: '#f9fafb',
  cardBorder: '#4b5563',
  subtleBg: '#111827',
  subtleBorder: '#374151',
  labelMuted: '#e5e7eb',
  metaMuted: '#9ca3af',
  primary: '#3b82f6',
  primaryText: '#ffffff',
  danger: '#fca5a5',
});

function formatScheduleSummary(schedule) {
  if (!schedule) return 'No schedule row';
  const days = Array.isArray(schedule.send_days) ? schedule.send_days : [];
  const daysPart = days.length === 7
    ? 'daily'
    : days.map((d) => SCHEDULE_DOW_LABELS[d] || d).join('/');
  const parts = [
    schedule.enabled ? 'Enabled' : 'Disabled',
    `offset ${schedule.days_offset > 0 ? '+' : ''}${schedule.days_offset}d`,
    `${String(schedule.send_hour_london).padStart(2, '0')}:00 London`,
    daysPart,
  ];
  return parts.join(' · ');
}

function TemplateStatusBadge({ isOverridden }) {
  const bg = isOverridden ? '#fef3c7' : '#e5e7eb';
  const color = isOverridden ? '#92400e' : '#374151';
  const text = isOverridden ? 'Overridden' : 'Default';
  return (
    <span style={{
      background: bg, color, fontSize: 11, padding: '2px 8px',
      borderRadius: 4, fontWeight: 600, letterSpacing: 0.3,
    }}>{text}</span>
  );
}

function TemplateCard({ stage, expanded, onToggle, onUpdated }) {
  const [editing, setEditing] = useState(false);
  return (
    <div style={{
      border: `1px solid ${TPL_PALETTE.cardBorder}`, borderRadius: 6,
      marginBottom: 12, background: TPL_PALETTE.cardBg,
      color: TPL_PALETTE.cardText,
    }}>
      <button type="button" onClick={onToggle} style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        width: '100%', padding: '12px 16px', background: 'transparent',
        border: 'none', cursor: 'pointer', textAlign: 'left',
        color: TPL_PALETTE.cardText,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
          <span style={{ fontWeight: 600, color: TPL_PALETTE.cardText }}>{stage.label}</span>
          <TemplateStatusBadge isOverridden={stage.is_overridden} />
          <span style={{ fontSize: 12, color: TPL_PALETTE.metaMuted }}>
            {formatScheduleSummary(stage.schedule)}
          </span>
        </div>
        <span style={{ fontSize: 14, color: TPL_PALETTE.metaMuted }}>
          {expanded ? '−' : '+'}
        </span>
      </button>
      {expanded ? (
        <div style={{ padding: '0 16px 16px', borderTop: `1px solid ${TPL_PALETTE.subtleBorder}` }}>
          {editing ? (
            <TemplateEditor
              stage={stage}
              onCancel={() => setEditing(false)}
              onSaved={() => { setEditing(false); onUpdated?.(); }}
            />
          ) : (
            <TemplateBody stage={stage} onEdit={() => setEditing(true)} />
          )}
        </div>
      ) : null}
    </div>
  );
}

function TemplateBody({ stage, onEdit }) {
  const subject = stage.effective_subject || '(no subject)';
  const body = stage.effective_body_md || '(no body)';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <button type="button" onClick={onEdit} style={{
          padding: '6px 14px', background: TPL_PALETTE.primary,
          color: TPL_PALETTE.primaryText, border: 'none', borderRadius: 4,
          fontSize: 13, cursor: 'pointer', fontWeight: 500,
        }}>Edit</button>
      </div>
      <div style={{ marginTop: 12, fontSize: 12, color: TPL_PALETTE.labelMuted }}>
        <strong>Subject:</strong>
      </div>
      <div style={{
        padding: 8, background: TPL_PALETTE.subtleBg,
        border: `1px solid ${TPL_PALETTE.subtleBorder}`,
        borderRadius: 4, fontSize: 13, marginTop: 4, fontFamily: 'monospace',
        color: TPL_PALETTE.cardText,
      }}>{subject}</div>
      <div style={{ marginTop: 12, fontSize: 12, color: TPL_PALETTE.labelMuted }}>
        <strong>Body (markdown-lite with {'{{merge_tags}}'}):</strong>
      </div>
      <pre style={{
        padding: 12, background: TPL_PALETTE.subtleBg,
        borderRadius: 4, fontSize: 12, marginTop: 4, whiteSpace: 'pre-wrap',
        fontFamily: 'monospace', maxHeight: 400, overflow: 'auto',
        border: `1px solid ${TPL_PALETTE.subtleBorder}`,
        color: TPL_PALETTE.cardText,
      }}>{body}</pre>
      {stage.template_updated_at ? (
        <div style={{ fontSize: 11, color: TPL_PALETTE.metaMuted, marginTop: 8 }}>
          Last edited {formatDateTimeShort(stage.template_updated_at)}
          {stage.template_updated_by ? ` by ${stage.template_updated_by}` : ''}
        </div>
      ) : null}
    </div>
  );
}

function buildPreviewHtml(bodyMd) {
  const rendered = renderTemplateClient(bodyMd || '', TEMPLATE_PREVIEW_VARS);
  const htmlBody = markdownLiteToSafeHtml(rendered);
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    html, body { background: #e5e7eb; }
    body { font: 14px/1.55 -apple-system, Segoe UI, Roboto, sans-serif;
           color: #111827; padding: 16px; margin: 0; }
    strong { color: #000000; }
  </style></head><body>${htmlBody}</body></html>`;
}

function TemplateEditor({ stage, onCancel, onSaved }) {
  const initialSubject = stage.effective_subject || '';
  const initialBody = stage.effective_body_md || '';
  const [subject, setSubject] = useState(initialSubject);
  const [bodyMd, setBodyMd] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const previewSrc = useMemo(() => buildPreviewHtml(bodyMd), [bodyMd]);
  const isDirty = subject !== initialSubject || bodyMd !== initialBody;

  async function handleSave() {
    setSaving(true); setError(null);
    try {
      await saveTemplate({ stageKey: stage.stage_key, subject, bodyMd, revert: false });
      onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }
  async function handleRevert() {
    if (!window.confirm('Revert to the built-in default? Your override will be cleared.')) return;
    setSaving(true); setError(null);
    try {
      await saveTemplate({ stageKey: stage.stage_key, revert: true });
      onSaved?.();
    } catch (err) { setError(err.message); }
    finally { setSaving(false); }
  }

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ fontSize: 12, color: TPL_PALETTE.labelMuted, marginBottom: 4 }}>
        <strong>Subject:</strong>
      </div>
      <input
        type="text" value={subject} onChange={(e) => setSubject(e.target.value)}
        disabled={saving}
        style={{
          width: '100%', padding: '6px 10px', fontSize: 13, fontFamily: 'monospace',
          border: `1px solid ${TPL_PALETTE.cardBorder}`, borderRadius: 4,
          background: TPL_PALETTE.cardBg, color: TPL_PALETTE.cardText,
          boxSizing: 'border-box',
        }}
      />
      <div style={{ fontSize: 12, color: TPL_PALETTE.labelMuted, margin: '12px 0 4px' }}>
        <strong>Body (markdown-lite) + live preview:</strong>
      </div>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12,
        height: 420,
      }}>
        <textarea
          value={bodyMd} onChange={(e) => setBodyMd(e.target.value)}
          disabled={saving} spellCheck={false}
          style={{
            padding: 10, fontSize: 12, fontFamily: 'monospace',
            border: `1px solid ${TPL_PALETTE.cardBorder}`, borderRadius: 4,
            resize: 'none', background: TPL_PALETTE.subtleBg,
            color: TPL_PALETTE.cardText, boxSizing: 'border-box', overflow: 'auto',
          }}
        />
        <iframe
          title={`preview-${stage.stage_key}`}
          srcDoc={previewSrc}
          sandbox=""
          style={{
            border: `1px solid ${TPL_PALETTE.cardBorder}`, borderRadius: 4,
            background: '#e5e7eb', width: '100%', height: '100%',
          }}
        />
      </div>
      {error ? (
        <div style={{ marginTop: 8, color: TPL_PALETTE.danger, fontSize: 12 }}>
          {error}
        </div>
      ) : null}
      <div style={{ display: 'flex', gap: 8, marginTop: 12, alignItems: 'center' }}>
        <button type="button" onClick={handleSave} disabled={saving || !isDirty} style={{
          padding: '6px 16px', background: TPL_PALETTE.primary,
          color: TPL_PALETTE.primaryText, border: 'none', borderRadius: 4, fontSize: 13,
          cursor: saving || !isDirty ? 'not-allowed' : 'pointer',
          opacity: saving || !isDirty ? 0.6 : 1, fontWeight: 500,
        }}>{saving ? 'Saving…' : 'Save'}</button>
        <button type="button" onClick={onCancel} disabled={saving} style={{
          padding: '6px 16px', background: TPL_PALETTE.cardBg,
          color: TPL_PALETTE.cardText, border: `1px solid ${TPL_PALETTE.cardBorder}`,
          borderRadius: 4, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
        }}>Cancel</button>
        {stage.is_overridden ? (
          <button type="button" onClick={handleRevert} disabled={saving} style={{
            padding: '6px 16px', background: TPL_PALETTE.cardBg,
            color: TPL_PALETTE.danger,
            border: `1px solid ${TPL_PALETTE.danger}`,
            borderRadius: 4, fontSize: 13, cursor: saving ? 'not-allowed' : 'pointer',
            marginLeft: 'auto',
          }}>Revert to default</button>
        ) : null}
      </div>
    </div>
  );
}

function TemplatesSection({ templates, mergeTags, loadError, onTemplatesChanged }) {
  const [expanded, setExpanded] = useState({});
  if (loadError) {
    return (
      <div style={{ padding: 16, color: 'var(--ar-danger, #d33)', fontSize: 13 }}>
        Templates failed to load: {loadError}
      </div>
    );
  }
  if (!templates.length) {
    return <div style={{ padding: 16, fontSize: 13 }}>Loading templates…</div>;
  }
  return (
    <div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginBottom: 12 }}>
        The 6 email templates below are what the webhook renders (DB override if set,
        otherwise the built-in default). Click <em>Edit</em> on any card to change the
        subject or body; save takes effect on the next scheduled send.
        Supported merge tags: {mergeTags.map((t) => t.tag).join(', ')}.
      </div>
      {templates.map((stage) => (
        <TemplateCard
          key={stage.stage_key}
          stage={stage}
          expanded={Boolean(expanded[stage.stage_key])}
          onToggle={() => setExpanded((prev) => ({
            ...prev, [stage.stage_key]: !prev[stage.stage_key],
          }))}
          onUpdated={onTemplatesChanged}
        />
      ))}
    </div>
  );
}

export default function EmailsAdmin() {
  const [members, setMembers] = useState([]);
  const [stats, setStats] = useState([]);
  const [tableData, setTableData] = useState({ rows: [], attributionWindowDays: 14 });
  const [templates, setTemplates] = useState([]);
  const [mergeTags, setMergeTags] = useState([]);
  const [loadErrors, setLoadErrors] = useState({});

  const [filterStageKey, setFilterStageKey] = useState(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [memberSearchEmail, setMemberSearchEmail] = useState('');
  const [memberSearchName, setMemberSearchName] = useState('');
  const [preview, setPreview] = useState(null);
  const [testState, setTestState] = useState(null);

  const nowMs = useMemo(() => Date.now(), [tableData.generatedAt]);

  // Picker lists everyone in the 90-day table with an email (including converted)
  // so you can inspect sends for any member.
  useEffect(() => {
    const pickerMembers = (tableData.rows || [])
      .filter((r) => !!r.email)
      .map((r) => ({ member_id: r.member_id, email: r.email, name: r.name }))
      .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));
    setMembers(pickerMembers);
  }, [tableData.rows]);

  useEffect(() => {
    loadStats()
      .then(setStats)
      .catch((err) => setLoadErrors((e) => ({ ...e, stats: err.message })));
  }, []);

  useEffect(() => {
    loadTableRows(90)
      .then(setTableData)
      .catch((err) => setLoadErrors((e) => ({ ...e, table: err.message })));
  }, []);

  const refreshTemplates = useCallback(() => {
    loadTemplates()
      .then(({ stages, mergeTags: tags }) => {
        setTemplates(stages);
        setMergeTags(tags);
      })
      .catch((err) => setLoadErrors((e) => ({ ...e, templates: err.message })));
  }, []);

  useEffect(() => { refreshTemplates(); }, [refreshTemplates]);

  const selectedStage = filterStageKey ? STAGE_BY_KEY[filterStageKey] : null;

  useEffect(() => {
    if (!selectedStage || !memberEmail) {
      setPreview(null);
      return;
    }
    setPreview({ loading: true });
    fetchPreview(selectedStage, memberEmail)
      .then((data) => setPreview({ data }))
      .catch((err) => setPreview({ error: err.message }));
  }, [selectedStage?.key, memberEmail]);

  const filteredRows = useMemo(() => {
    if (!filterStageKey) return tableData.rows;
    return tableData.rows.filter(
      (r) => isRowEligibleForStage(r, filterStageKey, nowMs) || !!r.sends?.[filterStageKey]
    );
  }, [tableData.rows, filterStageKey, nowMs]);

  const displayRows = useMemo(
    () => filteredRows.filter((r) => rowMatchesMemberSearch(r, memberSearchEmail, memberSearchName)),
    [filteredRows, memberSearchEmail, memberSearchName],
  );

  async function handleTestSend() {
    if (!selectedStage || !memberEmail) return;
    setTestState({ loading: true });
    try {
      await fireTestSend(selectedStage, memberEmail);
      setTestState({ success: true });
    } catch (err) {
      setTestState({ error: err.message });
    }
  }

  const anyError = Object.entries(loadErrors).map(([k, v]) => `${k}: ${v}`).join(' · ');

  return (
    <div className="ar-admin-container" style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 16 }}>Email Campaigns</h1>
      <NavTabs active="/academy/admin/emails" />

      {anyError ? (
        <div style={{ padding: 12, color: 'var(--ar-danger, #d33)', fontSize: 13, marginBottom: 12 }}>
          {anyError}
        </div>
      ) : null}

      <div style={{ marginBottom: 12, fontSize: 13, color: 'var(--ar-text-muted)' }}>
        Click any tile to filter the members table to that stage. Row-level sends are
        logged to <code>academy_email_events</code>. REWIND20 attempt-1 history was backfilled
        from <code>academy_trial_history.reengagement_sent_at</code>. Trial reminders (Day -7/-1/+7)
        before {formatDateShort(new Date().toISOString())} were not logged and will appear blank.
        Conversion attribution = trial converted within 14 days of the last send.
      </div>

      <StageTilesRow
        stats={stats}
        activeKey={filterStageKey}
        onTileClick={(key) => {
          setFilterStageKey((prev) => (prev === key ? null : key));
          setTestState(null);
        }}
        nowMs={nowMs}
      />

      {filterStageKey ? (
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          <strong>{STAGE_BY_KEY[filterStageKey].displayName}</strong>
          {' · '}
          <button type="button" onClick={() => setFilterStageKey(null)} style={{
            background: 'transparent', border: '1px solid var(--ar-border)',
            borderRadius: 4, padding: '2px 8px', fontSize: 12, cursor: 'pointer',
            color: 'var(--ar-text)',
          }}>
            Clear filter
          </button>
        </div>
      ) : null}

      <div style={{
        display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 1.5fr', gap: 20,
        marginBottom: 24,
      }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            Preview this stage’s email
          </div>
          <MemberPicker
            members={members}
            value={memberEmail}
            onChange={(v) => { setMemberEmail(v); setTestState(null); }}
            searchEmail={memberSearchEmail}
            searchName={memberSearchName}
            onSearchEmailChange={setMemberSearchEmail}
            onSearchNameChange={setMemberSearchName}
          />
          {selectedStage ? (
            <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', lineHeight: 1.5 }}>
              <div><strong>Sent by:</strong> <code>{selectedStage.sentBy}</code></div>
              <div style={{ marginTop: 4 }}>
                <strong>Schedule:</strong> {selectedStage.schedule.cadence} · {selectedStage.schedule.timeOfDay}
              </div>
              <div style={{ marginTop: 4 }}>{selectedStage.description}</div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--ar-text-muted)' }}>
              Click a tile above to see its description and preview.
            </div>
          )}
        </div>
        <div>
          <PreviewPanel
            preview={preview}
            stage={selectedStage}
            memberEmail={memberEmail}
            onTestSend={handleTestSend}
            testState={testState}
          />
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>
            Members (last 90 days of trials)
          </h2>
          <span style={{ fontSize: 12, color: 'var(--ar-text-muted)' }}>
            {displayRows.length} row{displayRows.length === 1 ? '' : 's'}
            {filterStageKey ? ` · stage ${STAGE_BY_KEY[filterStageKey].shortLabel}` : ''}
            {(memberSearchEmail.trim() || memberSearchName.trim())
              ? ' · name/email filter'
              : ''}
          </span>
        </div>
        <MembersTable
          rows={displayRows}
          filterStage={filterStageKey}
          attributionWindowDays={tableData.attributionWindowDays}
          onRowClick={(row) => {
            if (row.email) {
              setMemberEmail(row.email);
              setTestState(null);
            }
          }}
        />
      </div>

      <div style={{ marginTop: 32 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>Templates</h2>
          <span style={{ fontSize: 12, color: 'var(--ar-text-muted)' }}>
            {templates.length} stage{templates.length === 1 ? '' : 's'}
          </span>
        </div>
        <TemplatesSection
          templates={templates}
          mergeTags={mergeTags}
          loadError={loadErrors.templates}
          onTemplatesChanged={refreshTemplates}
        />
      </div>
    </div>
  );
}
