import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

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
        <table className="ar-admin-table">
          <thead>
            <tr>
              <th>Stage</th>
              <th>Emailed</th>
              <th>Raw sends</th>
              <th>Logged in after</th>
              <th>Opened module after</th>
              <th>Converted after</th>
            </tr>
          </thead>
          <tbody>
            {emailOutcomes.stages.map((s) => {
              const p = s.periods?.rolling_90d || {};
              return (
                <tr key={s.key}>
                  <td><strong>{s.label}</strong></td>
                  <td>{formatNumber(p.emailed)}</td>
                  <td>{formatNumber(s.raw_sends_90d ?? 0)}</td>
                  <td>{p.emailed ? `${p.login_after_pct}%` : '—'}</td>
                  <td>{p.emailed ? `${p.module_after_pct}%` : '—'}</td>
                  <td>{p.emailed ? `${p.converted_after_pct}%` : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details style={{ marginTop: 8, fontSize: 12, color: 'var(--ar-text-muted)' }}>
        <summary style={{ cursor: 'pointer' }}>{curLabel} month-to-date (why totals can look small)</summary>
        <div className="ar-admin-card" style={{ marginTop: 8 }}>
          <p style={{ margin: '0 0 10px', fontSize: 12 }}>
            MTD only counts sends in the current calendar month. Cron may have sent hundreds in prior months
            (e.g. REWIND batch in Apr 2026) — those appear in the 90-day table above, not here.
          </p>
          <table className="ar-admin-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>Emailed (MTD)</th>
                <th>Logged in after</th>
                <th>Opened module after</th>
                <th>Converted after</th>
              </tr>
            </thead>
            <tbody>
              {emailOutcomes.stages.map((s) => {
                const p = s.periods?.current_month || {};
                const d = s.deltas_vs_last_month || {};
                return (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td>
                      {formatNumber(p.emailed)}
                      {d.emailed !== 0 ? (
                        <div style={{ fontSize: 11, color: 'var(--ar-text-muted)' }}>
                          ({d.emailed > 0 ? '+' : ''}{d.emailed} vs {lastLabel})
                        </div>
                      ) : null}
                    </td>
                    <td>{p.emailed ? `${p.login_after_pct}%` : '—'}</td>
                    <td>{p.emailed ? `${p.module_after_pct}%` : '—'}</td>
                    <td>{p.emailed ? `${p.converted_after_pct}%` : '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
      <details style={{ marginTop: 8, fontSize: 12, color: 'var(--ar-text-muted)' }}>
        <summary style={{ cursor: 'pointer' }}>Last month vs month before (closed months)</summary>
        <div className="ar-admin-card" style={{ marginTop: 8 }}>
          <table className="ar-admin-table">
            <thead>
              <tr>
                <th>Stage</th>
                <th>{emailOutcomes.month_labels?.last_label}</th>
                <th>{emailOutcomes.month_labels?.prev_label}</th>
                <th>Δ emailed</th>
                <th>Δ login % (pp)</th>
              </tr>
            </thead>
            <tbody>
              {emailOutcomes.stages.map((s) => {
                const last = s.periods?.last_month || {};
                const prev = s.periods?.prev_month || {};
                const d2 = s.deltas_vs_prev_month || {};
                return (
                  <tr key={s.key}>
                    <td>{s.label}</td>
                    <td>{formatNumber(last.emailed)} · {last.login_after_pct}% login</td>
                    <td>{formatNumber(prev.emailed)} · {prev.login_after_pct}% login</td>
                    <td>{d2.emailed >= 0 ? '+' : ''}{d2.emailed}</td>
                    <td>{d2.login_after_pct >= 0 ? '+' : ''}{d2.login_after_pct} pp</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}

function EmailSendTrends({ trends }) {
  if (!trends?.weeks?.length) return null;
  const colors = {
    'day-minus-7': '#60a5fa',
    'day-minus-1': '#22d3ee',
    'day-plus-7': '#f5a623',
    'day-plus-20': '#c084fc',
  };
  const tiles = Object.entries(trends.by_stage || {}).map(([key, s]) => ({
    key,
    label: `${s.label} — sends / week`,
    values: s.sends,
    color: colors[key] || '#94a3b8',
  }));
  const loginTiles = Object.entries(trends.by_stage || {}).map(([key, s]) => ({
    key: `${key}-login`,
    label: `${s.label} — logins after send / week`,
    values: s.login_after,
    color: colors[key] || '#94a3b8',
  }));
  return (
    <>
      <h2 style={{ marginTop: '24px' }}>Email sends — 90-day trends</h2>
      <p style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 0 }}>
        Weekly buckets (UTC). Since {trends.since?.slice(0, 10) || '—'}.
        Sparkline headline is <strong>average sends per week</strong>, not the 90-day total (see table above for totals).
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
          <div className="ar-admin-card">
            <table className="ar-admin-table">
              <thead><tr><th>Category</th><th>Opens</th></tr></thead>
              <tbody>
                {(data.categories || []).map(c => (
                  <tr key={c.category || 'unknown'}>
                    <td>{c.category || '-'}</td>
                    <td>{formatNumber(c.opens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: '24px' }}>Top Modules (by opens)</h2>
          <div className="ar-admin-card">
            <table className="ar-admin-table">
              <thead>
                <tr><th>Path</th><th>Title</th><th>Opens</th><th>Unique Members</th></tr>
              </thead>
              <tbody>
                {(data.top_paths || []).map(p => (
                  <tr key={p.path}>
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>{p.path}</td>
                    <td>{p.title || '-'}</td>
                    <td>{formatNumber(p.opens)}</td>
                    <td>{formatNumber(p.unique_members)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: '24px' }}>Top Exam Modules</h2>
          <div className="ar-admin-card">
            <table className="ar-admin-table">
              <thead>
                <tr><th>Module</th><th>Attempts</th><th>Unique Members</th><th>Passed</th><th>Avg Score</th></tr>
              </thead>
              <tbody>
                {(exams.topModules || []).map(m => (
                  <tr key={m.module_id}>
                    <td>{m.module_id}</td>
                    <td>{formatNumber(m.attempts)}</td>
                    <td>{formatNumber(m.unique_members)}</td>
                    <td>{formatNumber(m.passed)}</td>
                    <td>{m.avg_score == null ? '-' : `${m.avg_score}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: '24px' }}>Top Engaged Members</h2>
          <div className="ar-admin-card">
            <table className="ar-admin-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Plan</th>
                  <th>Sessions</th>
                  <th>Active Days</th>
                  <th>Modules Opened</th>
                  <th>Total Opens</th>
                  <th>Logins</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {(data.top_members || []).map(m => (
                  <tr key={m.member_id}>
                    <td>{m.name || '-'}</td>
                    <td>{m.email || '-'}</td>
                    <td>{m.plan_name || '-'}</td>
                    <td>{formatNumber(m.sessions)}</td>
                    <td>{formatNumber(m.active_days)}</td>
                    <td>{formatNumber(m.modules_opened)}</td>
                    <td>{formatNumber(m.total_opens)}</td>
                    <td>{formatNumber(m.logins)}</td>
                    <td>{formatDate(m.last_seen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <h2 style={{ marginTop: '24px' }}>Weekly Trend</h2>
          <div className="ar-admin-card">
            <table className="ar-admin-table">
              <thead>
                <tr><th>Week of</th><th>Active Members</th><th>Login Sessions</th><th>Raw Logins</th><th>Module Opens</th></tr>
              </thead>
              <tbody>
                {(data.weekly || []).map(w => (
                  <tr key={w.week}>
                    <td>{w.week}</td>
                    <td>{formatNumber(w.active_members)}</td>
                    <td>{formatNumber(w.sessions)}</td>
                    <td>{formatNumber(w.logins)}</td>
                    <td>{formatNumber(w.module_opens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

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
