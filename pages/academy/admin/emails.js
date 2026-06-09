import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { EMAIL_STAGES } from '../../../lib/emailStages';

function mapStageForUi(stage) {
  const preview = stage.preview || {};
  const params = { ...(preview.params || {}) };
  delete params.sendEmail;
  return {
    key: stage.key,
    shortLabel: stage.shortLabel,
    displayName: stage.displayName,
    enabled: stage.enabled === true,
    testModeOnly: stage.testModeOnly === true,
    triggerSummary: stage.triggerSummary || '',
    sentBy: stage.sentBy,
    schedule: stage.schedule,
    description: stage.description,
    webhook: preview.webhook || '/api/admin/triggered-email-webhook',
    params,
  };
}

const STAGES = EMAIL_STAGES.map(mapStageForUi);

const STAGE_KEYS = STAGES.map((s) => s.key);
const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));
const TRIAL_TILE_STAGES = STAGES.filter((s) => !s.key.startsWith('paid-'));
const PAID_TILE_STAGES = STAGES.filter((s) => s.key.startsWith('paid-'));
const MANUAL_TILE_KEY = 'manual-batch';
const TILE_SEND_LOOKBACK_MS = 7 * DAY_MS;
const TILE_GRID_STYLE = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
  gap: 12,
};

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

const SNAPSHOT_MERGE_TAGS = [
  'firstName', 'currentBadge', 'modulesOpened', 'modulesOpenedPhrase',
  'modulesToNextBadge', 'modulesToNextBadgePhrase', 'examsToNextBadge',
  'percentToNextBadge', 'nextBadge', 'nextModuleTitle', 'nextModuleUrl',
  'trialDayNumber', 'trialDaysRemaining', 'daysSinceLastLogin', 'upgradeUrl',
];

function formatMergeTagHelp(mergeTags) {
  const all = (mergeTags || []).map((t) => t.tag);
  const snapshot = SNAPSHOT_MERGE_TAGS.filter((t) => all.includes(t));
  const legacy = all.filter((t) => !snapshot.includes(t));
  return `Snapshot/trigger tags: ${snapshot.join(', ')}. Legacy trial/rewind tags: ${legacy.join(', ')}.`;
}

const TEMPLATE_PREVIEW_VARS = Object.freeze({
  firstName: 'Alan',
  fullName: 'Alan Ranger',
  currentBadge: 'Enrolled',
  modulesOpened: 2,
  modulesOpenedPhrase: '2 modules',
  modulesToNextBadge: 1,
  modulesToNextBadgePhrase: '1 module',
  nextBadge: 'Foundation',
  nextModuleTitle: 'Shutter Speed',
  nextModuleUrl: 'https://www.alanranger.com/blog-on-photography/what-is-shutter-speed',
  trialDayNumber: 2,
  daysSinceLastLogin: 1,
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
  return {
    stages: Array.isArray(data.stages) ? data.stages : [],
    manualSends: data.manual_sends || null,
  };
}

async function loadTableRows(days = 'all', limit = 2000) {
  const res = await fetch(
    `/api/admin/emails-members?days=${encodeURIComponent(days)}&limit=${limit}`
  );
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

function StageTile({ stage, stats, statsLoadFailed, active, onClick, nowMs }) {
  const sent7d = statsLoadFailed ? '—' : (stats?.sent_last_7d ?? 0);
  const eligible = statsLoadFailed ? '—' : (stats?.eligible_today ?? '—');
  const sent24 = statsLoadFailed ? '—' : (stats?.sent_last_24h ?? 0);
  const nextSendAt = stats?.next_send_at;
  const nextLabel = nextSendAt
    ? `${formatDateTimeShort(nextSendAt)} · ${formatRelative(nextSendAt, nowMs)}`
    : (stage.sentBy === 'lapsed-trial-reengagement-webhook' ? 'Zapier (weekly)' : 'Daily trigger check');
  const borderColor = active ? 'var(--ar-accent, #4a7fff)' : 'var(--ar-border)';
  const statusLabel = stage.enabled
    ? 'LIVE'
    : (stage.testModeOnly ? 'TEST ONLY · no live send' : 'DISABLED · no copy yet');
  const statusColor = stage.enabled
    ? 'var(--ar-success, #0a0)'
    : 'var(--ar-text-muted)';
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
        opacity: stage.enabled ? 1 : 0.88,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>
          {stage.shortLabel.toUpperCase()}
        </div>
        <span style={{ fontSize: 10, fontWeight: 700, color: statusColor, whiteSpace: 'nowrap' }}>
          {statusLabel}
        </span>
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, lineHeight: 1 }}>
        {sent7d}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 4 }}>
        sent 7d · {sent24} sent 24h
      </div>
      <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 4, lineHeight: 1.4 }}>
        {eligible} match trigger today
      </div>
      <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 8, lineHeight: 1.4 }}>
        Next: {nextLabel}
      </div>
    </button>
  );
}

function ManualBatchTile({ manualSends, statsLoadFailed, active, onClick }) {
  const sent7d = statsLoadFailed ? '—' : (manualSends?.sent_last_7d ?? 0);
  const sent24 = statsLoadFailed ? '—' : (manualSends?.sent_last_24h ?? 0);
  const borderColor = active ? 'var(--ar-accent, #4a7fff)' : 'var(--ar-border)';
  return (
    <button
      type="button"
      onClick={() => onClick(MANUAL_TILE_KEY)}
      style={{
        textAlign: 'left',
        padding: '14px 14px 12px',
        background: 'var(--ar-card)',
        border: `1px solid ${borderColor}`,
        borderRadius: 8,
        minWidth: 0,
        cursor: 'pointer',
        color: 'inherit',
        font: 'inherit',
      }}
    >
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', fontWeight: 600, letterSpacing: 0.3 }}>
        MANUAL SENDS
      </div>
      <div style={{ fontSize: 28, fontWeight: 700, marginTop: 6, lineHeight: 1 }}>{sent7d}</div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 4 }}>
        sent 7d · {sent24} sent 24h
      </div>
      <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 8, lineHeight: 1.4 }}>
        Batch runs + corrected resends (logged send_source)
      </div>
    </button>
  );
}

function TileSection({ title, children }) {
  return (
    <section style={{ marginBottom: 24 }}>
      <h2 style={{
        fontSize: 15, fontWeight: 600, margin: '0 0 10px', color: 'var(--ar-text-muted)',
      }}
      >
        {title}
      </h2>
      <div style={TILE_GRID_STYLE}>{children}</div>
    </section>
  );
}

function StageTilesRow({ stats, manualSends, statsLoadFailed, activeKey, onTileClick, nowMs }) {
  const byKey = useMemo(() => {
    const m = {};
    (stats || []).forEach((s) => { m[s.key] = s; });
    return m;
  }, [stats]);

  function renderStageTile(stage) {
    return (
      <StageTile
        key={stage.key}
        stage={stage}
        stats={byKey[stage.key]}
        statsLoadFailed={statsLoadFailed}
        active={activeKey === stage.key}
        onClick={onTileClick}
        nowMs={nowMs}
      />
    );
  }

  return (
    <>
      <TileSection title="Trials">
        {TRIAL_TILE_STAGES.map(renderStageTile)}
        <ManualBatchTile
          manualSends={manualSends}
          statsLoadFailed={statsLoadFailed}
          active={activeKey === MANUAL_TILE_KEY}
          onClick={onTileClick}
        />
      </TileSection>
      <TileSection title="Paid">
        {PAID_TILE_STAGES.map(renderStageTile)}
      </TileSection>
    </>
  );
}

const SEND_BADGE_COLORS = {
  sent: 'var(--ar-success, #0a0)',
  failed: 'var(--ar-danger, #d33)',
};

function StageSendBadge({ ev }) {
  if (!ev) return <span style={{ color: 'var(--ar-text-muted)' }}>—</span>;
  const color = SEND_BADGE_COLORS[ev.status] || 'var(--ar-text-muted)';
  const titleParts = [`${ev.status}: ${ev.sent_at}`];
  if (ev.inferred) titleParts.push('inferred from trial history');
  if (ev.send_source && ev.send_source !== 'automated') titleParts.push(`source: ${ev.send_source}`);
  return (
    <span title={titleParts.join(' · ')} style={{ color, fontSize: 10, fontStyle: ev.inferred ? 'italic' : 'normal' }}>
      {formatDateShort(ev.sent_at)}{ev.inferred ? '*' : ''}
    </span>
  );
}

function ManualSendBadge({ manualLast }) {
  if (!manualLast?.sent_at) return <span style={{ color: 'var(--ar-text-muted)' }}>—</span>;
  return (
    <span
      title={`${manualLast.send_source} · ${manualLast.stage_key} · ${manualLast.sent_at}`}
      style={{ color: 'var(--ar-accent, #4a7fff)', fontSize: 10 }}
    >
      {formatDateShort(manualLast.sent_at)}
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
      <span style={{ color, fontSize: 10, fontWeight: row.converted_within_window ? 600 : 400 }}>
        {label}
      </span>
    );
  }
  if (row.reengagement_opted_out) {
    return <span style={{ color: 'var(--ar-danger, #d33)', fontSize: 10 }}>Unsubbed</span>;
  }
  return <span style={{ color: 'var(--ar-text-muted)', fontSize: 10 }}>No</span>;
}

function rowHasAnySend(row) {
  if (row.manual_last_sent?.sent_at) return true;
  return STAGE_KEYS.some((k) => !!row.sends?.[k]?.sent_at);
}

function isSentWithinTileWindow(sentAt, nowMs) {
  if (!sentAt) return false;
  const ms = new Date(sentAt).getTime();
  if (!Number.isFinite(ms)) return false;
  return ms >= nowMs - TILE_SEND_LOOKBACK_MS;
}

function isManualSendEvent(ev) {
  if (!ev || ev.status !== 'sent' || ev.inferred) return false;
  if (ev.send_source === 'manual_batch' || ev.send_source === 'corrected_resend') return true;
  return ev.event_detail === 'corrected_resend_2026-06-09';
}

function rowMatchesTileFilter(row, filterKey, nowMs) {
  if (!filterKey) return true;
  if (filterKey === MANUAL_TILE_KEY) {
    if (isSentWithinTileWindow(row.manual_last_sent?.sent_at, nowMs)) return true;
    return STAGE_KEYS.some((k) => {
      const ev = row.sends?.[k];
      return isManualSendEvent(ev) && isSentWithinTileWindow(ev.sent_at, nowMs);
    });
  }
  const ev = row.sends?.[filterKey];
  if (!ev || ev.status !== 'sent' || ev.inferred) return false;
  return isSentWithinTileWindow(ev.sent_at, nowMs);
}

function tileFilterLabel(filterKey) {
  if (!filterKey) return '';
  if (filterKey === MANUAL_TILE_KEY) return 'Manual sends (7d)';
  return `${STAGE_BY_KEY[filterKey]?.shortLabel || filterKey} sent (7d)`;
}

function sortValueForColumn(row, column) {
  if (column === 'member') return (row.name || row.email || '').toLowerCase();
  if (column === 'trial_end') {
    const ms = row.trial_end_at ? new Date(row.trial_end_at).getTime() : NaN;
    return Number.isFinite(ms) ? ms : 0;
  }
  if (column === 'manual') {
    const ms = row.manual_last_sent?.sent_at
      ? new Date(row.manual_last_sent.sent_at).getTime()
      : NaN;
    return Number.isFinite(ms) ? ms : 0;
  }
  if (column === 'converted') {
    if (row.converted_at) return new Date(row.converted_at).getTime();
    if (row.reengagement_opted_out) return -1;
    return 0;
  }
  const ev = row.sends?.[column];
  const ms = ev?.sent_at ? new Date(ev.sent_at).getTime() : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

function sortMemberRows(rows, column, dir) {
  const mult = dir === 'desc' ? -1 : 1;
  return [...rows].sort((a, b) => {
    const av = sortValueForColumn(a, column);
    const bv = sortValueForColumn(b, column);
    if (typeof av === 'string' && typeof bv === 'string') {
      return av.localeCompare(bv) * mult;
    }
    if (av === bv) return 0;
    return (av < bv ? -1 : 1) * mult;
  });
}

function SortableTh({ column, label, sortColumn, sortDir, onSort, style, title }) {
  const active = sortColumn === column;
  const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
  return (
    <th
      style={{ ...style, cursor: 'pointer', userSelect: 'none' }}
      title={title || `Sort by ${label}`}
      onClick={() => onSort(column)}
    >
      {label}{arrow}
    </th>
  );
}

function MembersTable({
  rows,
  filterStage,
  filterManual,
  onRowClick,
  attributionWindowDays,
  sortColumn,
  sortDir,
  onSort,
}) {
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
      overflowX: 'hidden', overflowY: 'auto', maxHeight: 620, background: 'var(--ar-card)',
    }}>
      <table style={{
        width: '100%', borderCollapse: 'collapse', fontSize: 11,
        tableLayout: 'fixed',
      }}>
        <thead style={{ position: 'sticky', top: 0, background: 'var(--ar-card)', zIndex: 1 }}>
          <tr style={{ borderBottom: '1px solid var(--ar-border)' }}>
            <SortableTh
              column="member"
              label="Member"
              sortColumn={sortColumn}
              sortDir={sortDir}
              onSort={onSort}
              style={memberThStyle}
            />
            <SortableTh
              column="trial_end"
              label="Trial end"
              sortColumn={sortColumn}
              sortDir={sortDir}
              onSort={onSort}
              style={compactThStyle}
            />
            {STAGES.map((s) => (
              <SortableTh
                key={s.key}
                column={s.key}
                label={s.shortLabel}
                sortColumn={sortColumn}
                sortDir={sortDir}
                onSort={onSort}
                style={{
                  ...compactThStyle,
                  color: filterStage === s.key ? 'var(--ar-accent, #4a7fff)' : 'inherit',
                }}
              />
            ))}
            <SortableTh
              column="manual"
              label="Manual"
              sortColumn={sortColumn}
              sortDir={sortDir}
              onSort={onSort}
              style={{
                ...compactThStyle,
                color: filterManual ? 'var(--ar-accent, #4a7fff)' : 'inherit',
              }}
              title="Last manual batch or corrected resend"
            />
            <SortableTh
              column="converted"
              label="Conv?"
              sortColumn={sortColumn}
              sortDir={sortDir}
              onSort={onSort}
              style={compactThStyle}
              title={`Attribution window: ${attributionWindowDays} days`}
            />
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
              <td style={memberTdStyle}>
                <div style={{
                  fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                >
                  {row.name || '—'}
                </div>
                <div style={{
                  fontSize: 10, color: 'var(--ar-text-muted)',
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
                >
                  {row.email}
                </div>
              </td>
              <td style={compactTdStyle}>{formatDateShort(row.trial_end_at)}</td>
              {STAGES.map((s) => (
                <td
                  key={s.key}
                  style={{
                    ...compactTdStyle,
                    background: filterStage === s.key ? 'rgba(74,127,255,0.08)' : 'transparent',
                  }}
                >
                  <StageSendBadge ev={row.sends?.[s.key]} />
                </td>
              ))}
              <td
                style={{
                  ...compactTdStyle,
                  background: filterManual ? 'rgba(74,127,255,0.08)' : 'transparent',
                }}
              >
                <ManualSendBadge manualLast={row.manual_last_sent} />
              </td>
              <td style={compactTdStyle}><ConversionCell row={row} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const memberThStyle = {
  padding: '8px 6px',
  textAlign: 'left',
  fontWeight: 600,
  fontSize: 11,
  textTransform: 'uppercase',
  letterSpacing: 0.3,
  color: 'var(--ar-text-muted)',
  width: '13%',
};

const compactThStyle = {
  padding: '5px 2px',
  textAlign: 'center',
  fontWeight: 600,
  fontSize: 9,
  textTransform: 'uppercase',
  letterSpacing: 0.2,
  color: 'var(--ar-text-muted)',
  lineHeight: 1.15,
  wordBreak: 'break-word',
};

const memberTdStyle = {
  padding: '6px 6px',
  verticalAlign: 'top',
  overflow: 'hidden',
};

const compactTdStyle = {
  padding: '4px 2px',
  verticalAlign: 'middle',
  textAlign: 'center',
  fontSize: 10,
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
  const hourPart = `${String(schedule.send_hour_london).padStart(2, '0')}:00 London`;
  if (schedule.stage_type === 'trigger') {
    return [schedule.enabled ? 'Enabled' : 'Disabled', hourPart, daysPart, 'trigger'].join(' · ');
  }
  const parts = [schedule.enabled ? 'Enabled' : 'Disabled'];
  if (schedule.days_offset != null) {
    parts.push(`offset ${schedule.days_offset > 0 ? '+' : ''}${schedule.days_offset}d`);
  }
  parts.push(hourPart, daysPart);
  return parts.join(' · ');
}

function StageTemplateStatusBadge({ stageMeta }) {
  if (!stageMeta) return null;
  if (stageMeta.enabled) {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ar-success, #0a0)' }}>
        LIVE
      </span>
    );
  }
  if (stageMeta.testModeOnly) {
    return (
      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ar-text-muted)' }}>
        TEST ONLY
      </span>
    );
  }
  return (
    <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--ar-text-muted)' }}>
      DISABLED
    </span>
  );
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, color: TPL_PALETTE.cardText }}>
            {stage.stage_meta?.displayName || stage.label}
          </span>
          <StageTemplateStatusBadge stageMeta={stage.stage_meta} />
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
        All {templates.length} registered stages — DB override wins over built-in default.
        Click <em>Edit</em> on any card to change subject/body; save applies on the next send.
        {' '}{formatMergeTagHelp(mergeTags)}
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
  const [manualSends, setManualSends] = useState(null);
  const [tableData, setTableData] = useState({ rows: [], attributionWindowDays: 14 });
  const [templates, setTemplates] = useState([]);
  const [mergeTags, setMergeTags] = useState([]);
  const [loadErrors, setLoadErrors] = useState({});

  const [filterStageKey, setFilterStageKey] = useState(null);
  const [tableLookback, setTableLookback] = useState('all');
  const [tableShowFilter, setTableShowFilter] = useState('all');
  const [tablePageSize, setTablePageSize] = useState(50);
  const [tablePage, setTablePage] = useState(0);
  const [sortColumn, setSortColumn] = useState('member');
  const [sortDir, setSortDir] = useState('asc');
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
      .then(({ stages, manualSends: manual }) => {
        setStats(stages);
        setManualSends(manual);
      })
      .catch((err) => setLoadErrors((e) => ({ ...e, stats: err.message })));
  }, []);

  useEffect(() => {
    loadTableRows(tableLookback, 2000)
      .then((data) => {
        setTableData(data);
        setTablePage(0);
      })
      .catch((err) => setLoadErrors((e) => ({ ...e, table: err.message })));
  }, [tableLookback]);

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
    let rows = tableData.rows || [];
    if (tableShowFilter === 'emailed') {
      rows = rows.filter((r) => rowHasAnySend(r));
    } else if (tableShowFilter === 'tile' && filterStageKey) {
      rows = rows.filter((r) => rowMatchesTileFilter(r, filterStageKey, nowMs));
    }
    return rows;
  }, [tableData.rows, tableShowFilter, filterStageKey, nowMs]);

  const searchedRows = useMemo(
    () => filteredRows.filter((r) => rowMatchesMemberSearch(r, memberSearchEmail, memberSearchName)),
    [filteredRows, memberSearchEmail, memberSearchName],
  );

  const sortedRows = useMemo(
    () => sortMemberRows(searchedRows, sortColumn, sortDir),
    [searchedRows, sortColumn, sortDir],
  );

  const totalPages = useMemo(() => {
    if (!tablePageSize || tablePageSize <= 0) return 1;
    return Math.max(1, Math.ceil(sortedRows.length / tablePageSize));
  }, [sortedRows.length, tablePageSize]);

  const pagedRows = useMemo(() => {
    if (!tablePageSize || tablePageSize <= 0) return sortedRows;
    const start = tablePage * tablePageSize;
    return sortedRows.slice(start, start + tablePageSize);
  }, [sortedRows, tablePage, tablePageSize]);

  function handleSort(column) {
    setTablePage(0);
    if (sortColumn === column) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortColumn(column);
      setSortDir('asc');
    }
  }

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
        Click any tile to filter the members table to that tile&apos;s <strong>7-day send count</strong> (logged
        events only — not inferred history). Large number = sends (7d) from{' '}
        <code>academy_email_events</code>. Smaller line = who matches the trigger today (not the same as sent).
        Italic dates with * are inferred from <code>academy_trial_history</code> when no event row exists (REWIND attempt history).
        Trial reminders (Day -7/-1/+7) before logging began may still appear blank. Manual column = last batch/corrected send.
        Conversion attribution = trial converted within 14 days of the last send.
      </div>

      <StageTilesRow
        stats={stats}
        manualSends={manualSends}
        statsLoadFailed={!!loadErrors.stats}
        activeKey={filterStageKey}
        onTileClick={(key) => {
          setFilterStageKey((prev) => {
            const next = prev === key ? null : key;
            setTableShowFilter(next ? 'tile' : 'all');
            return next;
          });
          setTablePage(0);
          setTestState(null);
        }}
        nowMs={nowMs}
      />

      {filterStageKey ? (
        <div style={{ marginBottom: 16, fontSize: 13 }}>
          <strong>{tileFilterLabel(filterStageKey)}</strong>
          {filterStageKey !== MANUAL_TILE_KEY && STAGE_BY_KEY[filterStageKey] ? (
            <span style={{ color: 'var(--ar-text-muted)' }}>
              {' '}
              · {STAGE_BY_KEY[filterStageKey].displayName}
            </span>
          ) : null}
          {' · '}
          <button
            type="button"
            onClick={() => { setFilterStageKey(null); setTableShowFilter('all'); }}
            style={{
              background: 'transparent', border: '1px solid var(--ar-border)',
              borderRadius: 4, padding: '2px 8px', fontSize: 12, cursor: 'pointer',
              color: 'var(--ar-text)',
            }}
          >
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
              {selectedStage.triggerSummary ? (
                <div style={{ marginTop: 4 }}>
                  <strong>Trigger:</strong> {selectedStage.triggerSummary}
                </div>
              ) : null}
              {!selectedStage.enabled ? (
                <div style={{ marginTop: 6, color: 'var(--ar-text-muted)' }}>
                  {selectedStage.testModeOnly
                    ? 'Test mode only — use Preview / Test send; no live cron send yet.'
                    : 'Disabled — scaffold only; will not send until enabled.'}
                </div>
              ) : null}
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
        <div style={{
          display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12, marginBottom: 10,
        }}
        >
          <h2 style={{ fontSize: 18, margin: 0 }}>Members</h2>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            Lookback
            <select
              value={tableLookback}
              onChange={(e) => setTableLookback(e.target.value)}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              <option value="all">All time</option>
              <option value="90">90 days</option>
              <option value="180">180 days</option>
              <option value="365">365 days</option>
            </select>
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            Show
            <select
              value={tableShowFilter}
              onChange={(e) => { setTableShowFilter(e.target.value); setTablePage(0); }}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              <option value="all">All members</option>
              <option value="emailed">Emailed only</option>
              <option value="tile">Tile filter (7d sends)</option>
            </select>
          </label>
          <label style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
            Rows
            <select
              value={String(tablePageSize)}
              onChange={(e) => {
                setTablePageSize(parseInt(e.target.value, 10) || 50);
                setTablePage(0);
              }}
              style={{ fontSize: 12, padding: '4px 8px' }}
            >
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="200">200</option>
              <option value="500">500</option>
              <option value="0">All</option>
            </select>
          </label>
          {filterStageKey ? (
            <button
              type="button"
              onClick={() => { setFilterStageKey(null); setTableShowFilter('all'); }}
              style={{
                background: 'transparent', border: '1px solid var(--ar-border)',
                borderRadius: 4, padding: '4px 8px', fontSize: 12, cursor: 'pointer',
              }}
            >
              Clear tile filter
            </button>
          ) : null}
          <span style={{ fontSize: 12, color: 'var(--ar-text-muted)' }}>
            {sortedRows.length} matching · showing {pagedRows.length}
            {filterStageKey && tableShowFilter === 'tile' ? ` · ${tileFilterLabel(filterStageKey)}` : ''}
          </span>
        </div>
        {totalPages > 1 ? (
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, fontSize: 12 }}>
            <button
              type="button"
              disabled={tablePage <= 0}
              onClick={() => setTablePage((p) => Math.max(0, p - 1))}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              Previous
            </button>
            <span style={{ color: 'var(--ar-text-muted)', alignSelf: 'center' }}>
              Page {tablePage + 1} of {totalPages}
            </span>
            <button
              type="button"
              disabled={tablePage >= totalPages - 1}
              onClick={() => setTablePage((p) => Math.min(totalPages - 1, p + 1))}
              style={{ padding: '4px 10px', fontSize: 12 }}
            >
              Next
            </button>
          </div>
        ) : null}
        <MembersTable
          rows={pagedRows}
          filterStage={filterStageKey !== MANUAL_TILE_KEY ? filterStageKey : null}
          filterManual={filterStageKey === MANUAL_TILE_KEY}
          attributionWindowDays={tableData.attributionWindowDays}
          sortColumn={sortColumn}
          sortDir={sortDir}
          onSort={handleSort}
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
