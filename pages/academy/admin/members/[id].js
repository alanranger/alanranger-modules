// /pages/academy/admin/members/[id].js
// Member detail page with header card, engagement tiles, and activity stream

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

const ADMIN_KEY_STORAGE = 'ar_academy_admin_analytics_key';

export default function MemberDetail() {
  const router = useRouter();
  const { id } = router.query;
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activityPage, setActivityPage] = useState(1);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (id) {
      fetchMember();
    }
  }, [id, activityPage]);

  async function fetchMember() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/members/${id}?activity_page=${activityPage}&activity_limit=20`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMember(data);
    } catch (error) {
      console.error('Failed to fetch member:', error);
    } finally {
      setLoading(false);
    }
  }

  async function removeFromSupabase() {
    if (!member || !id) return;
    const ok = window.confirm(
      'Remove this person from Supabase only?\n\n' +
        'This deletes: member cache row, academy events, exam results, plan/trial/annual history rows for this Memberstack ID.\n\n' +
        'It does NOT delete the Memberstack account or change Stripe. Do that in Memberstack/Stripe first if needed.\n\n' +
        'Continue?'
    );
    if (!ok) return;

    const typed = window.prompt(`Type this email exactly to confirm:\n${member.email || ''}`);
    if (typed !== (member.email || '')) {
      if (typed != null) window.alert('Email did not match. Nothing was deleted.');
      return;
    }

    let key =
      typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(ADMIN_KEY_STORAGE) : null;
    if (!key) {
      key = window.prompt(
        'Enter AR_ANALYTICS_KEY (same value as Vercel env — used for sync-members / admin APIs):'
      );
      if (!key) return;
      sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/members/${id}`, {
        method: 'DELETE',
        headers: { 'x-ar-analytics-key': key },
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 401) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        window.alert(data.error || 'Unauthorized. Check AR_ANALYTICS_KEY and try again.');
        return;
      }
      if (!res.ok) {
        window.alert(data.error || `Request failed (${res.status})`);
        return;
      }
      window.alert(data.message || 'Removed from Supabase.');
      router.push('/academy/admin/members');
    } catch (e) {
      console.error(e);
      window.alert(e.message || 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  if (loading) {
    return (
      <div className="ar-admin-container">
        <div className="ar-admin-loading">Loading member details...</div>
      </div>
    );
  }

  if (!member) {
    return (
      <div className="ar-admin-container">
        <div className="ar-admin-card">
          <h2>Member not found</h2>
          <Link href="/academy/admin/members">← Back to Members</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="ar-admin-container">
      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '24px',
        borderBottom: '1px solid var(--ar-border)',
        paddingBottom: '12px'
      }}>
        <Link href="/academy/admin" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Overview
        </Link>
        <Link href="/academy/admin/members" style={{
          padding: '8px 16px',
          background: 'var(--ar-card)',
          border: '1px solid var(--ar-border)',
          borderRadius: '6px',
          color: 'var(--ar-text)',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '14px'
        }}>
          Members
        </Link>
        <Link href="/academy/admin/activity" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Activity
        </Link>
        <Link href="/academy/admin/exams" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Exams
        </Link>
      </div>

      {/* Back Button */}
      <div style={{ marginBottom: '24px' }}>
        <Link href="/academy/admin/members" style={{
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontSize: '14px'
        }}>
          ← Back to Members
        </Link>
      </div>

      {/* Header Card */}
      <div className="ar-admin-card" style={{ marginBottom: '24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Name</div>
            <div style={{ fontSize: '18px', fontWeight: 700, color: 'var(--ar-text)' }}>
              {member.name || '—'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Email</div>
            <div style={{ fontSize: '14px', color: 'var(--ar-text)' }}>{member.email || '—'}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Member ID</div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', fontFamily: 'monospace' }}>
              {member.member_id}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Plan</div>
            <div style={{ fontSize: '14px', color: 'var(--ar-text)' }}>
              {member.plan_name} {member.plan_type && `(${member.plan_type})`}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Status</div>
            <span style={{
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 600,
              background: member.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 
                         member.status === 'trialing' ? 'rgba(251, 191, 36, 0.2)' : 
                         'rgba(239, 68, 68, 0.2)',
              color: member.status === 'active' ? '#22c55e' : 
                     member.status === 'trialing' ? '#fbbf24' : '#ef4444'
            }}>
              {member.status}
            </span>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Signed Up</div>
            <div style={{ fontSize: '13px', color: 'var(--ar-text)' }}>{formatDate(member.signed_up)}</div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Last Seen</div>
            <div style={{ fontSize: '13px', color: 'var(--ar-text)' }}>{formatDate(member.last_seen)}</div>
          </div>
          {member.photography_style && (
            <div style={{ gridColumn: 'span 2' }}>
              <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginBottom: '4px' }}>Photography Style</div>
              <div style={{ fontSize: '14px', color: 'var(--ar-text)', marginBottom: '4px' }}>
                <strong style={{ color: 'var(--ar-orange)' }}>
                  {member.photography_style_percentage ? `${member.photography_style_percentage}% ` : ''}
                  {member.photography_style}
                </strong>
              </div>
              {member.photography_style_other_interests && (
                <div style={{ fontSize: '12px', color: 'var(--ar-text-muted)', marginTop: '4px' }}>
                  {member.photography_style_other_interests.split(',').map((interest, idx) => {
                    const trimmed = interest.trim();
                    // Filter out 0% interests
                    if (trimmed.includes(': 0%')) return null;
                    return (
                      <div key={idx} style={{ marginBottom: '2px' }}>
                        {trimmed}
                      </div>
                    );
                  }).filter(Boolean)}
                </div>
              )}
            </div>
          )}
        </div>
        <div
          style={{
            marginTop: '16px',
            paddingTop: '16px',
            borderTop: '1px solid var(--ar-border)',
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--ar-text-muted)', maxWidth: '520px' }}>
            <strong style={{ color: 'var(--ar-text)' }}>Supabase only:</strong> clearing cache and analytics
            rows does not remove Memberstack login. Use Memberstack (and Stripe if applicable) to fully
            close an account, then use this if you need a clean trial email or admin stats.
          </p>
          <button
            type="button"
            onClick={removeFromSupabase}
            disabled={deleting}
            style={{
              padding: '10px 18px',
              fontSize: '13px',
              fontWeight: 700,
              borderRadius: '8px',
              border: '1px solid rgba(239, 68, 68, 0.5)',
              background: 'rgba(239, 68, 68, 0.12)',
              color: '#f87171',
              cursor: deleting ? 'wait' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {deleting ? 'Removing…' : 'Remove from Supabase…'}
          </button>
        </div>
      </div>

      {/* Engagement Tiles */}
      <div className="ar-admin-kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
          <div className="ar-admin-kpi-label">Modules Opened</div>
          <div className="ar-admin-kpi-value">{member.engagement?.modules_opened_unique || 0}</div>
          <div className="ar-admin-kpi-period">Unique</div>
        </div>
        <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
          <div className="ar-admin-kpi-label">Total Opens</div>
          <div className="ar-admin-kpi-value">{member.engagement?.modules_opened_total || 0}</div>
          <div className="ar-admin-kpi-period">All time</div>
        </div>
        <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
          <div className="ar-admin-kpi-label">Exam Attempts</div>
          <div className="ar-admin-kpi-value">{member.engagement?.exams?.attempts || 0}</div>
          <div className="ar-admin-kpi-period">Total</div>
        </div>
        <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
          <div className="ar-admin-kpi-label">Exams Passed</div>
          <div className="ar-admin-kpi-value">{member.engagement?.exams?.passed || 0}</div>
          <div className="ar-admin-kpi-period">Pass rate: {member.engagement?.exams?.pass_rate || 0}%</div>
        </div>
        <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
          <div className="ar-admin-kpi-label">Bookmarks</div>
          <div className="ar-admin-kpi-value">{member.engagement?.bookmarks_count || 0}</div>
          <div className="ar-admin-kpi-period">Saved</div>
        </div>
      </div>

      {/* Most Opened Modules */}
      {member.engagement?.most_opened_modules && member.engagement.most_opened_modules.length > 0 && (
        <div className="ar-admin-card" style={{ marginBottom: '24px' }}>
          <h2 className="ar-admin-card-title">Most Opened Modules</h2>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--ar-border)' }}>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Module</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Category</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Opens</th>
                  <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Last Opened</th>
                </tr>
              </thead>
              <tbody>
                {member.engagement.most_opened_modules.map((module, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid var(--ar-border)' }}>
                    <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{module.title || module.path}</td>
                    <td style={{ padding: '12px', color: 'var(--ar-text-muted)' }}>{module.category || '—'}</td>
                    <td style={{ padding: '12px', color: 'var(--ar-orange)', fontWeight: 600 }}>{module.count}</td>
                    <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                      {formatDate(module.last_opened)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      <div className="ar-admin-card">
        <h2 className="ar-admin-card-title">Recent Activity</h2>
        {member.recent_activity && member.recent_activity.length > 0 ? (
          <>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ar-border)' }}>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Time</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Event</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Path</th>
                    <th style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600 }}>Title</th>
                  </tr>
                </thead>
                <tbody>
                  {member.recent_activity.map((activity, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--ar-border)' }}>
                      <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                        {formatDate(activity.created_at)}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{activity.event_type}</td>
                      <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px', fontFamily: 'monospace' }}>
                        {activity.path || '—'}
                      </td>
                      <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{activity.title || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {member.activity_pagination && member.activity_pagination.totalPages > 1 && (
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <button
                  onClick={() => setActivityPage(activityPage - 1)}
                  disabled={activityPage === 1}
                  className="ar-admin-btn-secondary"
                >
                  Previous
                </button>
                <span style={{ padding: '8px 16px', color: 'var(--ar-text-muted)' }}>
                  Page {activityPage} of {member.activity_pagination.totalPages}
                </span>
                <button
                  onClick={() => setActivityPage(activityPage + 1)}
                  disabled={activityPage >= member.activity_pagination.totalPages}
                  className="ar-admin-btn-secondary"
                >
                  Next
                </button>
              </div>
            )}
          </>
        ) : (
          <div style={{ padding: '24px', textAlign: 'center', color: 'var(--ar-text-muted)' }}>
            No recent activity
          </div>
        )}
      </div>
    </div>
  );
}
