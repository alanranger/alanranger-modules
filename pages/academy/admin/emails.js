import { useEffect, useState } from 'react';
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

// ─── data loaders (kept tiny; complexity under 15 per function) ──────────

async function loadStages() {
  const res = await fetch('/api/admin/email-stages');
  if (!res.ok) throw new Error(`stages HTTP ${res.status}`);
  const data = await res.json();
  return data.stages || [];
}

async function loadMembers() {
  const res = await fetch('/api/admin/members?limit=500');
  if (!res.ok) throw new Error(`members HTTP ${res.status}`);
  const data = await res.json();
  return Array.isArray(data.members) ? data.members : [];
}

async function fetchPreview(stageKey, email) {
  const qs = new URLSearchParams({ key: stageKey, email });
  const res = await fetch(`/api/admin/email-stages?${qs.toString()}`);
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || `preview HTTP ${res.status}`);
  }
  return data;
}

async function fireTestSend(stageKey, email) {
  const qs = new URLSearchParams({ key: stageKey, email });
  const res = await fetch(`/api/admin/email-stages?${qs.toString()}`, { method: 'POST' });
  const data = await res.json();
  if (!res.ok || !data?.success) {
    throw new Error(data?.error || data?.result?.error || `test-send HTTP ${res.status}`);
  }
  return data;
}

// ─── presentational pieces ───────────────────────────────────────────────

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
    <div
      onClick={() => onSelect(stage)}
      style={{
        padding: '14px 16px',
        background: selected ? 'var(--ar-card)' : 'transparent',
        border: `1px solid ${selected ? 'var(--ar-accent, #4a7fff)' : 'var(--ar-border)'}`,
        borderRadius: 8,
        cursor: 'pointer',
        marginBottom: 10,
      }}
    >
      <div style={{ fontWeight: 600, fontSize: 15 }}>{stage.displayName}</div>
      <div style={{ fontSize: 12, color: 'var(--ar-text-muted)', marginTop: 4 }}>
        Sent by <code>{stage.sentBy}</code>
      </div>
      <div style={{ fontSize: 13, marginTop: 8 }}>{stage.description}</div>
      <ScheduleLine schedule={stage.schedule} />
    </div>
  );
}

function MemberPicker({ members, value, onChange }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ fontSize: 13, fontWeight: 600, display: 'block', marginBottom: 6 }}>
        Preview / test against member:
      </label>
      <select
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

// ─── main page ────────────────────────────────────────────────────────────

export default function EmailsAdmin() {
  const [stages, setStages] = useState([]);
  const [members, setMembers] = useState([]);
  const [selectedStage, setSelectedStage] = useState(null);
  const [memberEmail, setMemberEmail] = useState('');
  const [preview, setPreview] = useState(null);
  const [testState, setTestState] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    Promise.all([loadStages(), loadMembers()])
      .then(([s, m]) => {
        setStages(s);
        setMembers(m);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedStage || !memberEmail) {
      setPreview(null);
      return;
    }
    setPreview({ loading: true });
    fetchPreview(selectedStage.key, memberEmail)
      .then((data) => setPreview({ data: data.preview }))
      .catch((err) => setPreview({ error: err.message }));
  }, [selectedStage?.key, memberEmail]);

  async function handleTestSend() {
    if (!selectedStage || !memberEmail) return;
    setTestState({ loading: true });
    try {
      await fireTestSend(selectedStage.key, memberEmail);
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
          Failed to load: {loadError}
        </div>
      ) : null}

      <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--ar-text-muted)' }}>
        Phase 1 (view-only). Every stage shows the real rendered email against any
        member you pick. Test-send BCCs <code>info@alanranger.com</code>. Editing copy/timing
        arrives in Phase 2.
      </div>

      <MemberPicker members={members} value={memberEmail} onChange={(v) => {
        setMemberEmail(v);
        setTestState(null);
      }} />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(300px, 1fr) 2fr', gap: 24 }}>
        <div>
          <div style={{ fontSize: 13, color: 'var(--ar-text-muted)', marginBottom: 10 }}>
            {stages.length} stage{stages.length === 1 ? '' : 's'} configured
          </div>
          {stages.map((s) => (
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
