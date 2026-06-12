import { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import BadgeLevelCell from '../../../components/admin/BadgeLevelCell';
import SortableTable from '../../../components/admin/SortableTable';

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

function NavTabs({ active }) {
  return (
    <div style={{
      display: 'flex',
      gap: '8px',
      marginBottom: '24px',
      borderBottom: '1px solid var(--ar-border)',
      paddingBottom: '12px',
      flexWrap: 'wrap',
    }}>
      {TABS.map(tab => {
        const isActive = tab.href === active;
        return (
          <Link key={tab.href} href={tab.href} style={{
            padding: '8px 16px',
            background: isActive ? 'var(--ar-card)' : 'transparent',
            border: isActive ? '1px solid var(--ar-border)' : '1px solid transparent',
            borderRadius: '6px',
            color: isActive ? 'var(--ar-text)' : 'var(--ar-text-muted)',
            textDecoration: 'none',
            fontWeight: isActive ? 600 : 500,
            fontSize: '14px',
          }}>
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

function Tile({ label, value, hint }) {
  return (
    <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
      <div className="ar-admin-kpi-label">{label}</div>
      <div className="ar-admin-kpi-value">{value}</div>
      {hint ? <div className="ar-admin-kpi-period">{hint}</div> : null}
    </div>
  );
}

function formatNumber(n) {
  if (n == null) return '-';
  return Number(n).toLocaleString('en-GB');
}

function formatDate(iso) {
  if (!iso) return '-';
  try { return new Date(iso).toLocaleString('en-GB'); } catch { return iso; }
}

function Sparkline({ values, width = 140, height = 36, color }) {
  if (!Array.isArray(values) || values.length < 2) {
    return <div style={{ height, fontSize: 11, color: 'var(--ar-text-muted)' }}>no data</div>;
  }
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = (max - min) || 1;
  const dx = width / (values.length - 1);
  const points = values.map((v, i) => {
    const x = (i * dx).toFixed(1);
    const y = (height - ((v - min) / range) * height).toFixed(1);
    return `${x},${y}`;
  }).join(' ');
  const lastIdx = values.length - 1;
  const lastX = (lastIdx * dx).toFixed(1);
  const lastY = (height - ((values[lastIdx] - min) / range) * height).toFixed(1);
  const fillPoints = `0,${height} ${points} ${lastX},${height}`;
  return (
    <svg width="100%" height={height} viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <polygon points={fillPoints} fill={color} opacity="0.15" />
      <polyline points={points} fill="none" stroke={color} strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r="2.5" fill={color} />
    </svg>
  );
}

function computeSparkStats(values) {
  if (!Array.isArray(values) || values.length === 0) {
    return { avg: 0, last: 0, deltaPct: 0, total: 0 };
  }
  const nums = values.map((v) => Number(v) || 0);
  const total = nums.reduce((a, b) => a + b, 0);
  const avg = total / nums.length;
  const last = nums[nums.length - 1];
  const prevWeek = nums.length >= 2 ? nums[nums.length - 2] : last;
  // Week-over-week (latest vs the immediately preceding week), same order as the
  // sparkline (oldest → newest). Positive ↑ when last week beat the prior week.
  let deltaPct = 0;
  if (prevWeek > 0) deltaPct = Math.round(((last - prevWeek) / prevWeek) * 100);
  else if (prevWeek <= 0 && last > 0) deltaPct = 100;

  return { avg, last, deltaPct, total };
}

function deltaBadgeStyle(deltaPct) {
  if (deltaPct > 0) return { color: '#4ade80', arrow: '↑' };
  if (deltaPct < 0) return { color: '#f87171', arrow: '↓' };
  return { color: 'var(--ar-text-muted)', arrow: '→' };
}

function SparkTile({ label, values, color, fractionDigits = 1 }) {
  const { avg, last, deltaPct } = computeSparkStats(values);
  const badge = deltaBadgeStyle(deltaPct);
  const avgDisplay = Number.isFinite(avg) ? avg.toFixed(fractionDigits) : '0';
  return (
    <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
      <div className="ar-admin-kpi-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div className="ar-admin-kpi-value">{avgDisplay}</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: badge.color }}>
          {badge.arrow} {Math.abs(deltaPct)}%
        </div>
      </div>
      <div style={{ marginTop: 6 }}>
        <Sparkline values={values} color={color} />
      </div>
      <div className="ar-admin-kpi-period" style={{ marginTop: 4 }}>
        Avg / week · last: {last}
      </div>
    </div>
  );
}

const PERIOD_LABELS = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
};

function ActivationTargetTile({ label, metric, targetPct, trendValues, noisy, stretchHint }) {
  const hit = metric?.hit ?? 0;
  const total = metric?.total ?? 0;
  const currentPct = metric?.pct ?? 0;
  const { deltaPct } = computeSparkStats(trendValues || []);
  const badge = deltaBadgeStyle(deltaPct);
  const vsTarget = currentPct - targetPct;
  const vsColor = vsTarget >= 0 ? '#4ade80' : '#f87171';

  return (
    <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
      <div className="ar-admin-kpi-label">{label}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <div className="ar-admin-kpi-value">{currentPct}%</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: badge.color }}>
          {badge.arrow} {Math.abs(deltaPct)}%
        </div>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 2 }}>
        Target: <strong style={{ color: '#E57200' }}>{targetPct}%</strong> (provisional)
        <span style={{ marginLeft: 6, color: vsColor, fontWeight: 600 }}>
          ({vsTarget >= 0 ? '+' : ''}{vsTarget.toFixed(1)} pp)
        </span>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 4 }}>
        <strong>{formatNumber(hit)}</strong> / {formatNumber(total)} trials
      </div>
      {stretchHint ? (
        <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 4 }}>{stretchHint}</div>
      ) : null}
      {noisy ? (
        <div style={{ fontSize: 11, color: '#fbbf24', marginTop: 4 }}>Small sample - noisy</div>
      ) : null}
      <div style={{ marginTop: 6 }}>
        <Sparkline values={trendValues} color="#E57200" />
      </div>
      <div className="ar-admin-kpi-period" style={{ marginTop: 4 }}>
        28-day signup cohort trend (last {trendValues?.length || 0} buckets)
      </div>
    </div>
  );
}

function ActivationTargetsPanel({ data, period }) {
  if (!data?.cohort) return null;
  const periodLabel = PERIOD_LABELS[period] || String(period);
  const targets = data.provisional_targets || {};
  const trend = data.trend || {};

  const tiles = [
    {
      key: 'week1_modules_3',
      label: 'Week-1: opened >=3 modules',
      metric: data.cohort.week1_modules_3,
      target: targets.week1_modules_3 ?? 40,
      trend: trend.week1_modules_3,
      stretch: 'Stretch: >=5 modules in week 1',
    },
    {
      key: 'week1_logins_5',
      label: 'Week-1: >=5 logins',
      metric: data.cohort.week1_logins_5,
      target: targets.week1_logins_5 ?? 35,
      trend: trend.week1_logins_5,
      stretch: 'Stretch: >=10 logins in week 1',
    },
    {
      key: 'week2_active',
      label: 'Week-2: still active (days 8-14)',
      metric: data.cohort.week2_active,
      target: targets.week2_active ?? 50,
      trend: trend.week2_active,
      stretch: null,
    },
    {
      key: 'conversion',
      label: 'Cohort conversion %',
      metric: data.cohort.conversion,
      target: targets.cohort_conversion ?? 5,
      trend: trend.conversion,
      stretch: null,
      noisy: true,
    },
  ];

  return (
    <>
      <h2 style={{ marginTop: '24px' }}>Trial activation vs target</h2>
      <p style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 0, marginBottom: 8 }}>
        {data.cohort_definition}
      </p>
      <div className="ar-admin-card" style={{ padding: '12px 14px', marginBottom: 12, borderLeft: '4px solid #E57200' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#E57200', marginBottom: 6 }}>Provisional targets</div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--ar-text-muted)', lineHeight: 1.5 }}>
          {data.note}
        </p>
        <p style={{ margin: '8px 0 0', fontSize: 11, color: 'var(--ar-text-muted)', lineHeight: 1.45 }}>
          {data.reference_rates}
        </p>
      </div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginBottom: 10 }}>
        Period filter: <strong>{periodLabel}</strong>
        {typeof data.cohort_trials === 'number' ? (
          <> · <strong>{formatNumber(data.cohort_trials)}</strong> organic signups in window</>
        ) : null}
        {typeof data.mature_week1_trials === 'number' ? (
          <> · <strong>{formatNumber(data.mature_week1_trials)}</strong> mature for week-1 (7d+)</>
        ) : null}
        {period !== '90d' ? (
          <span style={{ display: 'block', marginTop: 4 }}>
            Tip: use <strong>Last 90 days</strong> for a more usable cohort sample.
          </span>
        ) : null}
      </div>
      <div className="ar-admin-kpi-grid">
        {tiles.map((t) => (
          <ActivationTargetTile
            key={t.key}
            label={t.label}
            metric={t.metric}
            targetPct={t.target}
            trendValues={t.trend}
            noisy={t.noisy}
            stretchHint={t.stretch}
          />
        ))}
      </div>
    </>
  );
}

function WeeklyTrends({ series, period }) {
  if (!series || !Array.isArray(series.weeks) || series.weeks.length === 0) return null;
  const tiles = [
    { label: 'Trial sign-ups / week',  values: series.trial_signups,   color: '#60a5fa' },
    { label: 'Conversions / week',     values: series.conversions,     color: '#4ade80' },
    { label: 'Module opens / week',    values: series.module_opens,    color: '#f5a623' },
    { label: 'Exam attempts / week',   values: series.exam_attempts,   color: '#c084fc' },
    { label: 'Logins / week',          values: series.logins,          color: '#22d3ee' },
    { label: 'Active members / week',  values: series.active_members,  color: '#f472b6' },
  ];
  const first = series.weeks[0];
  const last = series.weeks[series.weeks.length - 1];
  const periodLabel = PERIOD_LABELS[period] || String(period);
  return (
    <>
      <h2 style={{ marginTop: '8px' }}>Weekly Trends</h2>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginBottom: 10 }}>
        Uses the period filter (<strong>{periodLabel}</strong>): {series.weeks.length} completed UTC week bucket{series.weeks.length === 1 ? '' : 's'} ending {last}.
      </div>
      <div className="ar-admin-kpi-grid">
        {tiles.map(t => <SparkTile key={t.label} {...t} />)}
      </div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 6 }}>
        Range {first} → {last} · current in-progress week excluded · Δ% is week-over-week; the headline figure averages across the buckets above (not elsewhere on the page).
      </div>
    </>
  );
}

function DeltaInline({ delta, isPctPoints }) {
  const color = delta > 0 ? '#4ade80' : delta < 0 ? '#f87171' : 'var(--ar-text-muted)';
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
  const text = isPctPoints
    ? `${delta > 0 ? '+' : ''}${delta} pp`
    : `${arrow} ${Math.abs(delta)}%`;
  return (
    <div style={{ fontSize: 11, fontWeight: 600, color, marginTop: 2 }}>
      vs last mo: {text}
    </div>
  );
}

const EMAIL_SUMMARY_COLUMNS = [
  { key: 'today', label: 'Today' },
  { key: 'last_7d', label: '7d' },
  { key: 'last_30d', label: '30d' },
  { key: 'last_60d', label: '60d' },
  { key: 'last_90d', label: '90d' },
  { key: 'total', label: 'Total' },
];

const EMAIL_SUMMARY_ROWS = [
  { key: 'trials_scheduled', label: 'Trials · scheduled', hint: 'Nudges + Day -7 / -1 / +7' },
  { key: 'rewind_ladder', label: 'Trials · REWIND ladder', hint: 'Day +20 / +30 / +60 / +90' },
  { key: 'paid_lifecycle', label: 'Paid lifecycle', hint: 'Quiet ladder, badge, renewal' },
  { key: 'manual_batch', label: 'Manual / batch', hint: 'How sent — overlaps REWIND', accent: true },
  { key: 'lifecycle_total', label: 'Lifecycle total', hint: 'Scheduled + REWIND + Paid (excl. manual)', bold: true },
];

const STAGE_CATEGORY_ORDER = [
  { key: 'trials_scheduled', label: 'Trials · scheduled (cron)' },
  { key: 'rewind_ladder', label: 'Trials · REWIND ladder' },
  { key: 'paid_lifecycle', label: 'Paid lifecycle' },
];

function EmailSendsCategorySummary({ summaryByCategory }) {
  const rows = useMemo(
    () => (summaryByCategory
      ? EMAIL_SUMMARY_ROWS.map((row) => ({
        key: row.key,
        label: row.label,
        hint: row.hint,
        accent: row.accent,
        bold: row.bold,
        ...(summaryByCategory[row.key] || {}),
      }))
      : []),
    [summaryByCategory]
  );
  if (!summaryByCategory) return null;
  const columns = [
    {
      key: 'label',
      label: 'Category',
      render: (row) => (
        <>
          <div style={{
            fontWeight: row.bold ? 700 : 600,
            color: row.accent ? 'var(--ar-accent, #4a7fff)' : 'inherit',
          }}
          >
            {row.label}
          </div>
          <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 2 }}>{row.hint}</div>
        </>
      ),
      sortValue: (row) => row.label,
    },
    ...EMAIL_SUMMARY_COLUMNS.map((col) => ({
      key: col.key,
      label: col.label,
      render: (row) => formatNumber(row[col.key] ?? 0),
      sortValue: (row) => row[col.key] ?? 0,
      style: { textAlign: 'right', fontVariantNumeric: 'tabular-nums' },
      thStyle: { textAlign: 'right' },
    })),
  ];

  return (
    <>
      <h2 style={{ marginTop: '8px' }}>Email sends by category</h2>
      <p style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 0, marginBottom: 10 }}>
        Same buckets as the Emails tab — from <code>academy_email_events</code> (cron/webhooks + manual batch tags).
      </p>
      <SortableTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.key}
        defaultSort="last_7d"
        defaultDir="desc"
        wrapperClassName="ar-admin-card"
        wrapperStyle={{ overflowX: 'auto' }}
        tableStyle={{ minWidth: 520 }}
      />
    </>
  );
}

const CATEGORY_LABEL_BY_KEY = Object.fromEntries(STAGE_CATEGORY_ORDER.map((c) => [c.key, c.label]));

const EMAIL_OUTCOME_COLUMNS = [
  {
    key: 'category',
    label: 'Category',
    sortValue: (s) => CATEGORY_LABEL_BY_KEY[s.category] || s.category,
    render: (s) => CATEGORY_LABEL_BY_KEY[s.category] || s.category,
  },
  {
    key: 'label',
    label: 'Stage',
    sortValue: (s) => s.label,
    render: (s) => (
      <>
        <strong>{s.label}</strong>
        {s.displayName && s.displayName !== s.label ? (
          <div style={{ fontSize: 11, color: 'var(--ar-text-muted)', marginTop: 2 }}>{s.displayName}</div>
        ) : null}
      </>
    ),
  },
  {
    key: 'sent_last_7d',
    label: 'Sent 7d',
    sortValue: (s) => s.sent_last_7d ?? 0,
    render: (s) => formatNumber(s.sent_last_7d ?? 0),
  },
  {
    key: 'emailed',
    label: 'Emailed',
    sortValue: (s) => s.periods?.rolling_90d?.emailed ?? 0,
    render: (s) => formatNumber(s.periods?.rolling_90d?.emailed),
  },
  {
    key: 'raw_sends_90d',
    label: 'Raw sends',
    sortValue: (s) => s.raw_sends_90d ?? 0,
    render: (s) => formatNumber(s.raw_sends_90d ?? 0),
  },
  {
    key: 'login_after_pct',
    label: 'Logged in after',
    sortValue: (s) => s.periods?.rolling_90d?.login_after_pct ?? -1,
    render: (s) => {
      const p = s.periods?.rolling_90d || {};
      return p.emailed ? `${p.login_after_pct}%` : '—';
    },
  },
  {
    key: 'module_after_pct',
    label: 'Opened module after',
    sortValue: (s) => s.periods?.rolling_90d?.module_after_pct ?? -1,
    render: (s) => {
      const p = s.periods?.rolling_90d || {};
      return p.emailed ? `${p.module_after_pct}%` : '—';
    },
  },
  {
    key: 'converted_after_pct',
    label: 'Converted after',
    sortValue: (s) => s.periods?.rolling_90d?.converted_after_pct ?? -1,
    render: (s) => {
      const p = s.periods?.rolling_90d || {};
      return p.emailed ? `${p.converted_after_pct}%` : '—';
    },
  },
];

function EmailOutcomesTable({ emailOutcomes }) {
  if (!emailOutcomes?.stages?.length) return null;
  const curLabel = emailOutcomes.month_labels?.current_label || 'Current month';
  const lastLabel = emailOutcomes.month_labels?.last_label || 'Last month';
  const logSince = emailOutcomes.logging?.logging_since?.slice(0, 10) || '—';
  const allTime = emailOutcomes.logging?.all_time_logged_sends;
  const t90 = emailOutcomes.totals_90d || {};
  return (
    <>
      <h2 style={{ marginTop: '8px' }}>Email lifecycle — post-send outcomes</h2>
      <p style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 0, marginBottom: 10 }}>
        From <code>academy_email_events</code> (Vercel cron/webhooks). Logging since <strong>{logSince}</strong>
        {typeof allTime === 'number' ? <> · <strong>{formatNumber(allTime)}</strong> logged sends all-time</> : null}
        {t90.raw_sends != null ? (
          <> · <strong>{formatNumber(t90.raw_sends)}</strong> raw sends in last 90 days</>
        ) : null}
        . {emailOutcomes.logging?.note || ''} {emailOutcomes.note || ''}
        {emailOutcomes.debug?.events_loaded != null ? (
          <> Loaded <strong>{formatNumber(emailOutcomes.debug.events_loaded)}</strong> login/module events for{' '}
          <strong>{formatNumber(emailOutcomes.debug.members_with_events)}</strong> emailed members.</>
        ) : null}
      </p>
      <div className="ar-admin-card">
        <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--ar-text-muted)', marginBottom: 8 }}>
          Last 90 days (since {t90.since || '—'}) — primary view
        </div>
        <SortableTable
          columns={EMAIL_OUTCOME_COLUMNS}
          rows={emailOutcomes.stages}
          rowKey={(s) => s.key}
          defaultSort="sent_last_7d"
          defaultDir="desc"
        />
      </div>
      <details style={{ marginTop: 8, fontSize: 12, color: 'var(--ar-text-muted)' }}>
        <summary style={{ cursor: 'pointer' }}>{curLabel} month-to-date (why totals can look small)</summary>
        <div className="ar-admin-card" style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12 }}>
            MTD only counts sends in the current calendar month. Cron may have sent hundreds in prior months
            (e.g. REWIND batch in Apr 2026) — those appear in the 90-day table above, not here.
          </p>
          <SortableTable
            columns={[
              { key: 'label', label: 'Stage', sortValue: (s) => s.label },
              {
                key: 'emailed_mtd',
                label: 'Emailed (MTD)',
                sortValue: (s) => s.periods?.current_month?.emailed ?? 0,
                render: (s) => {
                  const p = s.periods?.current_month || {};
                  const d = s.deltas_vs_last_month || {};
                  return (
                    <>
                      {formatNumber(p.emailed)}
                      {d.emailed !== 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--ar-text-muted)' }}>
                          ({d.emailed > 0 ? '+' : ''}{d.emailed} vs {lastLabel})
                        </div>
                      ) : null}
                    </>
                  );
                },
              },
              {
                key: 'login_mtd',
                label: 'Logged in after',
                sortValue: (s) => s.periods?.current_month?.login_after_pct ?? -1,
                render: (s) => {
                  const p = s.periods?.current_month || {};
                  return p.emailed ? `${p.login_after_pct}%` : '—';
                },
              },
              {
                key: 'module_mtd',
                label: 'Opened module after',
                sortValue: (s) => s.periods?.current_month?.module_after_pct ?? -1,
                render: (s) => {
                  const p = s.periods?.current_month || {};
                  return p.emailed ? `${p.module_after_pct}%` : '—';
                },
              },
              {
                key: 'convert_mtd',
                label: 'Converted after',
                sortValue: (s) => s.periods?.current_month?.converted_after_pct ?? -1,
                render: (s) => {
                  const p = s.periods?.current_month || {};
                  return p.emailed ? `${p.converted_after_pct}%` : '—';
                },
              },
            ]}
            rows={emailOutcomes.stages}
            rowKey={(s) => s.key}
            defaultSort="emailed_mtd"
            defaultDir="desc"
          />
        </div>
      </details>
      <details style={{ marginTop: 8, fontSize: 12, color: 'var(--ar-text-muted)' }}>
        <summary style={{ cursor: 'pointer' }}>Last month vs month before (closed months)</summary>
        <div className="ar-admin-card" style={{ marginTop: 8 }}>
          <SortableTable
            columns={[
              { key: 'label', label: 'Stage', sortValue: (s) => s.label },
              {
                key: 'last_month',
                label: emailOutcomes.month_labels?.last_label || 'Last month',
                sortValue: (s) => s.periods?.last_month?.emailed ?? 0,
                render: (s) => {
                  const last = s.periods?.last_month || {};
                  return `${formatNumber(last.emailed)} · ${last.login_after_pct}% login`;
                },
              },
              {
                key: 'prev_month',
                label: emailOutcomes.month_labels?.prev_label || 'Prev month',
                sortValue: (s) => s.periods?.prev_month?.emailed ?? 0,
                render: (s) => {
                  const prev = s.periods?.prev_month || {};
                  return `${formatNumber(prev.emailed)} · ${prev.login_after_pct}% login`;
                },
              },
              {
                key: 'delta_emailed',
                label: 'Δ emailed',
                sortValue: (s) => s.deltas_vs_prev_month?.emailed ?? 0,
                render: (s) => {
                  const d2 = s.deltas_vs_prev_month || {};
                  return `${d2.emailed >= 0 ? '+' : ''}${d2.emailed}`;
                },
              },
              {
                key: 'delta_login',
                label: 'Δ login % (pp)',
                sortValue: (s) => s.deltas_vs_prev_month?.login_after_pct ?? 0,
                render: (s) => {
                  const d2 = s.deltas_vs_prev_month || {};
                  return `${d2.login_after_pct >= 0 ? '+' : ''}${d2.login_after_pct} pp`;
                },
              },
            ]}
            rows={emailOutcomes.stages}
            rowKey={(s) => s.key}
            defaultSort="last_month"
            defaultDir="desc"
          />
        </div>
      </details>
    </>
  );
}

function EmailSendTrends({ trends }) {
  if (!trends?.weeks?.length) return null;
  const colors = {
    trials_scheduled: '#60a5fa',
    rewind_ladder: '#c084fc',
    paid_lifecycle: '#f5a623',
  };
  const tiles = Object.entries(trends.by_category || {}).map(([key, s]) => ({
    key,
    label: `${s.label} — sends / week`,
    values: s.sends,
    color: colors[key] || '#94a3b8',
  }));
  const loginTiles = Object.entries(trends.by_category || {}).map(([key, s]) => ({
    key: `${key}-login`,
    label: `${s.label} — logins after send / week`,
    values: s.login_after,
    color: colors[key] || '#94a3b8',
  }));
  return (
    <>
      <h2 style={{ marginTop: '24px' }}>Email sends — 90-day trends (by category)</h2>
      <p style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 0 }}>
        Weekly buckets (UTC). Since {trends.since?.slice(0, 10) || '—'}.
        Grouped by the same categories as the Emails tab. Sparkline headline is <strong>average sends per week</strong>.
      </p>
      <div className="ar-admin-kpi-grid">
        {tiles.map((t) => <SparkTile key={t.key} label={t.label} values={t.values} color={t.color} fractionDigits={0} />)}
      </div>
      <div className="ar-admin-kpi-grid" style={{ marginTop: 12 }}>
        {loginTiles.map((t) => <SparkTile key={t.key} label={t.label} values={t.values} color={t.color} fractionDigits={0} />)}
      </div>
    </>
  );
}

function DistributionBar({ buckets }) {
  const total = buckets.reduce((s, b) => s + b.value, 0) || 1;
  return (
    <div style={{ display: 'flex', width: '100%', height: '14px', borderRadius: '6px', overflow: 'hidden', background: 'var(--ar-border)' }}>
      {buckets.map(b => (
        <div key={b.label}
          title={`${b.label}: ${b.value}`}
          style={{ width: `${(b.value / total) * 100}%`, background: b.color }}
        />
      ))}
    </div>
  );
}

export default function EngagementPage() {
  const router = useRouter();
  const period = router.query.period || 'all';
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/engagement?period=${encodeURIComponent(period)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [period]);

  const totals = data?.totals || {};
  const me = data?.member_engagement || {};
  const exams = data?.exams || {};
  const tracking = data?.tracking || {};
  const distBuckets = me.distribution ? [
    { label: 'No modules', value: me.distribution.none || 0, color: '#3a3a3a' },
    { label: 'Light (1-5)', value: me.distribution.light || 0, color: '#f5a623' },
    { label: 'Medium (6-20)', value: me.distribution.medium || 0, color: '#f57c23' },
    { label: 'Heavy (21-50)', value: me.distribution.heavy || 0, color: '#d94c1f' },
    { label: 'Super (50+)', value: me.distribution.super || 0, color: '#a3290f' },
  ] : [];

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <h1 className="ar-admin-title">Engagement</h1>
        <p className="ar-admin-subtitle">Academy usage metrics: logins, sessions, module opens, exams</p>
        <NavTabs active="/academy/admin/engagement" />
      </div>

      <div className="ar-admin-filters">
        <select
          className="ar-admin-select"
          value={period}
          onChange={(e) => router.push({ query: { ...router.query, period: e.target.value } })}
        >
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </div>

      {loading && <div className="ar-admin-loading">Loading engagement metrics…</div>}
      {error && <div className="ar-admin-empty">Error: {error}</div>}

      {!loading && !error && data && (
        <>
          <WeeklyTrends series={data.weekly_series} period={period} />

          <ActivationTargetsPanel data={data.activation_targets} period={period} />

          <EmailSendsCategorySummary summaryByCategory={data.email_outcomes?.summary_by_category} />
          <EmailOutcomesTable emailOutcomes={data.email_outcomes} />
          <EmailSendTrends trends={data.email_outcomes?.trends_90d} />

          <h2 style={{ marginTop: '24px' }}>Totals</h2>
          <div className="ar-admin-kpi-grid">
            <Tile label="Members in Cache" value={formatNumber(totals.total_members_in_cache)} hint="Synced from Memberstack" />
            <Tile label="Members with Events" value={formatNumber(totals.members_with_events)} hint={`${period === 'all' ? 'All time' : period}`} />
            <Tile label="Total Logins" value={formatNumber(totals.total_logins)} hint="Raw login events" />
            <Tile label="Login Sessions" value={formatNumber(totals.total_sessions)} hint=">30 min gap = new session" />
            <Tile label="Module Opens" value={formatNumber(totals.total_module_opens)} hint={`${formatNumber(totals.unique_modules_opened)} unique paths`} />
            <Tile label="Avg Sessions / Member" value={formatNumber(totals.avg_sessions_per_member)} />
            <Tile label="Avg Active Days / Member" value={formatNumber(totals.avg_active_days_per_member)} />
            <Tile label="Exam Attempts" value={formatNumber(exams.totalAttempts)} hint={`${formatNumber(exams.uniqueMembers)} unique members`} />
            <Tile label="Exam Pass Rate" value={exams.totalAttempts ? `${Math.round((exams.totalPassed / exams.totalAttempts) * 100)}%` : '-'} hint={`Avg score ${formatNumber(exams.avgScore)}`} />
          </div>

          <h2 style={{ marginTop: '24px' }}>Module Engagement Distribution</h2>
          <div className="ar-admin-card" style={{ padding: '16px' }}>
            <p style={{ marginTop: 0, color: 'var(--ar-text-muted)', fontSize: '13px' }}>
              How many unique modules each member has opened (all time).
            </p>
            <DistributionBar buckets={distBuckets} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginTop: '12px', fontSize: '13px' }}>
              {distBuckets.map(b => (
                <div key={b.label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: b.color, display: 'inline-block' }} />
                  <span>{b.label}: <strong>{b.value}</strong></span>
                </div>
              ))}
            </div>
          </div>

          <h2 style={{ marginTop: '24px' }}>Opens by Category</h2>
          <SortableTable
            columns={[
              { key: 'category', label: 'Category', sortValue: (c) => c.category || '' },
              { key: 'opens', label: 'Opens', sortValue: (c) => c.opens ?? 0, render: (c) => formatNumber(c.opens) },
            ]}
            rows={data.categories || []}
            rowKey={(c) => c.category || 'unknown'}
            defaultSort="opens"
            defaultDir="desc"
            wrapperClassName="ar-admin-card"
          />

          <h2 style={{ marginTop: '24px' }}>Top Modules (by opens)</h2>
          <SortableTable
            columns={[
              {
                key: 'path',
                label: 'Path',
                sortValue: (p) => p.path,
                render: (p) => <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.path}</span>,
              },
              { key: 'title', label: 'Title', sortValue: (p) => p.title || '' },
              { key: 'opens', label: 'Opens', sortValue: (p) => p.opens ?? 0, render: (p) => formatNumber(p.opens) },
              {
                key: 'unique_members',
                label: 'Unique Members',
                sortValue: (p) => p.unique_members ?? 0,
                render: (p) => formatNumber(p.unique_members),
              },
            ]}
            rows={data.top_paths || []}
            rowKey={(p) => p.path}
            defaultSort="opens"
            defaultDir="desc"
            wrapperClassName="ar-admin-card"
          />

          <h2 style={{ marginTop: '24px' }}>Top Exam Modules</h2>
          <SortableTable
            columns={[
              { key: 'module_id', label: 'Module', sortValue: (m) => m.module_id },
              { key: 'attempts', label: 'Attempts', sortValue: (m) => m.attempts ?? 0, render: (m) => formatNumber(m.attempts) },
              {
                key: 'unique_members',
                label: 'Unique Members',
                sortValue: (m) => m.unique_members ?? 0,
                render: (m) => formatNumber(m.unique_members),
              },
              { key: 'passed', label: 'Passed', sortValue: (m) => m.passed ?? 0, render: (m) => formatNumber(m.passed) },
              {
                key: 'avg_score',
                label: 'Avg Score',
                sortValue: (m) => m.avg_score ?? -1,
                render: (m) => (m.avg_score == null ? '-' : `${m.avg_score}%`),
              },
            ]}
            rows={exams.topModules || []}
            rowKey={(m) => m.module_id}
            defaultSort="attempts"
            defaultDir="desc"
            wrapperClassName="ar-admin-card"
          />

          <h2 style={{ marginTop: '24px' }}>Top Engaged Members</h2>
          <SortableTable
            columns={[
              { key: 'name', label: 'Name', sortValue: (m) => m.name || '' },
              { key: 'email', label: 'Email', sortValue: (m) => m.email || '' },
              {
                key: 'badge_level',
                label: 'Badge level',
                sortValue: (m) => m.badge_level || m.current_badge || '',
                render: (m) => <BadgeLevelCell member={m} compact />,
              },
              { key: 'plan_name', label: 'Plan', sortValue: (m) => m.plan_name || '' },
              { key: 'sessions', label: 'Sessions', sortValue: (m) => m.sessions ?? 0, render: (m) => formatNumber(m.sessions) },
              { key: 'active_days', label: 'Active Days', sortValue: (m) => m.active_days ?? 0, render: (m) => formatNumber(m.active_days) },
              {
                key: 'modules_opened',
                label: 'Modules Opened',
                sortValue: (m) => m.modules_opened ?? 0,
                render: (m) => formatNumber(m.modules_opened),
              },
              {
                key: 'total_opens',
                label: 'Total Opens',
                sortValue: (m) => m.total_opens ?? 0,
                render: (m) => formatNumber(m.total_opens),
              },
              { key: 'logins', label: 'Logins', sortValue: (m) => m.logins ?? 0, render: (m) => formatNumber(m.logins) },
              {
                key: 'last_seen',
                label: 'Last Seen',
                sortValue: (m) => m.last_seen || '',
                render: (m) => formatDate(m.last_seen),
              },
            ]}
            rows={data.top_members || []}
            rowKey={(m) => m.member_id}
            defaultSort="modules_opened"
            defaultDir="desc"
            wrapperClassName="ar-admin-card"
          />

          <h2 style={{ marginTop: '24px' }}>Weekly Trend</h2>
          <SortableTable
            columns={[
              { key: 'week', label: 'Week of', sortValue: (w) => w.week },
              {
                key: 'active_members',
                label: 'Active Members',
                sortValue: (w) => w.active_members ?? 0,
                render: (w) => formatNumber(w.active_members),
              },
              {
                key: 'sessions',
                label: 'Login Sessions',
                sortValue: (w) => w.sessions ?? 0,
                render: (w) => formatNumber(w.sessions),
              },
              { key: 'logins', label: 'Raw Logins', sortValue: (w) => w.logins ?? 0, render: (w) => formatNumber(w.logins) },
              {
                key: 'module_opens',
                label: 'Module Opens',
                sortValue: (w) => w.module_opens ?? 0,
                render: (w) => formatNumber(w.module_opens),
              },
            ]}
            rows={data.weekly || []}
            rowKey={(w) => w.week}
            defaultSort="week"
            defaultDir="desc"
            wrapperClassName="ar-admin-card"
          />

          <h2 style={{ marginTop: '24px' }}>Tile Tracking Diagnostics</h2>
          <div className="ar-admin-card" style={{ padding: '16px' }}>
            <p style={{ marginTop: 0, color: 'var(--ar-text-muted)', fontSize: '13px' }}>
              These counts reflect how many cached Memberstack JSON records contain <code>arAcademy.modules.opened</code>, <code>arAcademy.appliedLearning.opened</code> and <code>arAcademy.rps.opened</code>. If Applied or RPS are 0 while the front-end tiles appear ticked, persistence to Memberstack is failing (see notes in the summary).
            </p>
            <div className="ar-admin-kpi-grid">
              <Tile label="Cached Members" value={formatNumber(tracking.total_members)} />
              <Tile label="With Modules JSON" value={formatNumber(tracking.with_modules_json)} hint="arAcademy.modules.opened" />
              <Tile label="With Applied Learning JSON" value={formatNumber(tracking.with_applied_tiles)} hint="arAcademy.appliedLearning.opened" />
              <Tile label="With RPS JSON" value={formatNumber(tracking.with_rps_tiles)} hint="arAcademy.rps.opened" />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
