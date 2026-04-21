import { useEffect, useState } from 'react';
import Link from 'next/link';

// Inline stage config rather than fetching it — the admin UI knows every
// webhook URL and param set up-front, and there's nothing to gain from a
// server round-trip. Keep this in sync with lib/emailStages.js (which the
// webhooks themselves do NOT consume; it's only the admin tab's map).

const TRIAL_WEBHOOK = '/api/admin/trial-expiry-reminder-webhook';
const REWIND_WEBHOOK = '/api/admin/lapsed-trial-reengagement-webhook';

const STAGES = [
  {
    key: 'day-minus-7',
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
    displayName: 'Day -1 · Final-day reminder',
    sentBy: 'trial-expiry-reminder-webhook',
    schedule: {
      cadence: 'daily',
      timeOfDay: '09:00 Europe/London',
      mechanism: 'Vercel Cron (08:00 + 09:00 UTC with London-hour gate)',
    },
    description:
      'Last day of the free trial. Activity block, three quick wins, members-only resources, full feature list, personal signed dashboard link. No discount.',
    webhook: TRIAL_WEBHOOK,
    params: { daysAhead: 1, forceDaysUntilExpiry: 1 },
  },
  {
    key: 'day-plus-7',
    displayName: 'Day +7 · SAVE20 offer',
    sentBy: 'trial-expiry-reminder-webhook',
    schedule: {
      cadence: 'daily',
      timeOfDay: '09:00 Europe/London',
      mechanism: 'Vercel Cron (08:00 + 09:00 UTC with London-hour gate)',
    },
    description:
      '7 days after trial expiry. SAVE20 code (£79 → £59). Activity block, quick wins, members-only resources. Offer valid 7 days from send (Day +7 → Day +13).',
    webhook: TRIAL_WEBHOOK,
    params: { daysAhead: -7, forceDaysUntilExpiry: -7 },
  },
  {
    key: 'day-plus-20',
    displayName: 'Day +20 · REWIND20 attempt 1',
    sentBy: 'lapsed-trial-reengagement-webhook',
    schedule: {
      cadence: 'weekly (Zapier)',
      timeOfDay: '—',
      mechanism: 'Currently scheduled by Zapier. Gated server-side: 3-send cap + min days + min gap.',
    },
    description:
      'First REWIND20 outreach. Activity block, three quick wins, members-only, feature list, REWIND20 code (£79 → £59), personal signed link with 7-day window.',
    webhook: REWIND_WEBHOOK,
    params: {},
  },
  {
    key: 'day-plus-30',
    displayName: 'Day +30 · REWIND20 attempt 2',
    sentBy: 'lapsed-trial-reengagement-webhook',
    schedule: {
      cadence: 'weekly (Zapier)',
      timeOfDay: '—',
      mechanism: 'Fires 10+ days after attempt 1 if still not converted.',
    },
    description:
      'Second REWIND20 outreach (subject line escalates). Same body as attempt 1.',
    webhook: REWIND_WEBHOOK,
    params: {},
  },
  {
    key: 'day-plus-60',
    displayName: 'Day +60 · REWIND20 final attempt',
    sentBy: 'lapsed-trial-reengagement-webhook',
    schedule: {
      cadence: 'weekly (Zapier)',
      timeOfDay: '—',
      mechanism: 'Fires 30+ days after attempt 2. Final send; max 3 attempts per member.',
    },
    description:
      'Third and final REWIND20 outreach (subject line: "Final offer"). Same body.',
    webhook: REWIND_WEBHOOK,
    params: {},
  },
];

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
      display: 'flex', gap: '8px', marginBottom: '24px',
      borderBottom: '1px solid var(--ar-border)', paddingBottom: '12px',
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

function markdownToHtml(body) {
  if (!body) return '';
  return String(body)
    .replace(/\n/g, '<br>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
}

function extractPreview(webhookData) {
  if (webhookData?.preview?.subject) return webhookData.preview;
  if (webhookData?.result?.preview?.subject) return webhookData.result.preview;
  if (webhookData?.email_content_preview?.subject) return webhookData.email_content_preview;
  return null;
}

async function loadMembers() {
  const res = await fetch('/api/admin/members?limit=500');
  if (!res.ok) throw new Error(`members HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.members) ? data.members : [];
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

async function fetchPreview(stage, email) {
  const res = await fetch(buildWebhookUrl(stage, email, false));
  const data = await res.json();
  if (!res.ok || data?.success === false) {
    throw new Error(data?.error || `preview HTTP ${res.status}`);
  }
  const preview = extractPreview(data);
  if (!preview) {
    // Build a synthetic preview so REWIND20 stages (where the webhook body
    // only returns a skipped dry-run without preview in some legacy shapes)
    // still render usefully.
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

function ScheduleLine({ schedule }) {
  if (!schedule) return null;
  return (
    <div style={{ fontSize: 13, color: 'var(--ar-text-muted)', marginTop: 4 }}>
      <strong>Schedule:</strong> {schedule.cadence} · {schedule.timeOfDay}
      <br />
      <span style={{ fontSize: 12 }}>{schedule.mechanism}</span>
    </div>
  );
}

function StageCard({ stage, selected, onSelect }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(stage)}
      style={{
        textAlign: 'left',
        padding: '14px 16px',
        width: '100%',
        background: selected ? 'var(--ar-card)' : 'transparent',
        border: `1px solid ${selected ? 'var(--ar-accent, #4a7fff)' : 'var(--ar-border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        marginBottom: 10,
        color: 'inherit',
        font: 'inherit',
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 15 }}>{stage.displayName}</div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 4 }}>
        Sent by <code>{stage.sentBy}</code>
      </div>
      <div style={{ fontSize: 13, marginTop: 8 }}>{stage.description}</div>
      <ScheduleLine schedule={stage.schedule} />
    </button>
  );
}

function MemberPicker({ members, value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label htmlFor="ar-email-member-picker" style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
        Preview / test against member:
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
        {members.map((m) => (
          <option key={m.member_id || m.email} value={m.email}>
            {m.email}{m.name ? ` · ${m.name}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}

function PreviewPanel({ preview, stage, memberEmail, onTestSend, testState }) {
  if (!stage) {
    return (
      <div style={{ padding: 24, color: 'var(--ar-text-muted)', fontSize: 14 }}>
        Select a stage on the left to preview its email.
      </div>
    );
  }
  if (!memberEmail) {
    return (
      <div style={{ padding: 24, color: 'var(--ar-text-muted)', fontSize: 14 }}>
        Pick a member above to render this email against their real activity data.
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
        <div style={{ fontSize: 15, fontWeight: 600, marginTop: 4 }}>
          {preview.data.subject}
        </div>
      </div>

      <div style={{
        padding: 16, background: 'var(--ar-card)',
        border: '1px solid var(--ar-border)', borderRadius: 6,
        maxHeight: 600, overflow: 'auto', fontSize: 14, lineHeight: 1.55,
      }}>
        <div dangerouslySetInnerHTML={{ __html: preview.data.html || '' }} />
      </div>

      <div style={{ marginTop: 16, display: 'flex', gap: 12, alignItems: 'center' }}>
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

export default function EmailsAdmin() {
  const [members, setMembers] = useState([]);
  const [selectedStage, setSelectedStage] = useState(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [preview, setPreview] = useState(null);
  const [testState, setTestState] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    loadMembers()
      .then(setMembers)
      .catch((err) => setLoadError(err.message));
  }, []);

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

  return (
    <div className="ar-admin-container" style={{ padding: 24 }}>
      <h1 style={{ marginBottom: 16 }}>Email Campaigns</h1>
      <NavTabs active="/academy/admin/emails" />

      {loadError ? (
        <div style={{ padding: 12, color: 'var(--ar-danger, #d33)' }}>
          Failed to load members list: {loadError}
        </div>
      ) : null}

      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--ar-text-muted)' }}>
        Phase 1 (view-only). Each stage shows the real rendered email against any
        member you pick. Test-sends BCC <code>info@alanranger.com</code>. Editing copy
        and timing arrives in Phase 2.
      </div>

      <MemberPicker members={members} value={memberEmail} onChange={(v) => {
        setMemberEmail(v);
        setTestState(null);
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--ar-text-muted)', marginBottom: 10 }}>
            {STAGES.length} stages configured
          </div>
          {STAGES.map((s) => (
            <StageCard
              key={s.key}
              stage={s}
              selected={selectedStage?.key === s.key}
              onSelect={(stage) => {
                setSelectedStage(stage);
                setTestState(null);
              }}
            />
          ))}
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
    </div>
  );
}
