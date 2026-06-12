import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import SortableTable from '../../../../components/admin/SortableTable';

export default function MembersPage() {
  const router = useRouter();
  const { period = '30d' } = router.query;
  
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMember, setSelectedMember] = useState(null);
  const [memberDetails, setMemberDetails] = useState(null);
  const [activeNowCount, setActiveNowCount] = useState(0);
  const [activeNowLoading, setActiveNowLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    fetchMembers();
  }, [router.query]);

  // Fetch active now count and set up polling every 5 minutes
  useEffect(() => {
    fetchActiveNow();
    
    // Set up polling every 5 minutes (300000 ms)
    const pollInterval = setInterval(() => {
      fetchActiveNow();
    }, 5 * 60 * 1000);

    // Cleanup interval on unmount
    return () => clearInterval(pollInterval);
  }, []);

  async function fetchMembers() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/members?period=${period}`);
      const data = await res.json();
      setMembers(data);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchActiveNow() {
    setActiveNowLoading(true);
    try {
      const res = await fetch('/api/admin/members/active-now');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setActiveNowCount(data.count || 0);
      setLastUpdated(data.last_updated ? new Date(data.last_updated) : new Date());
    } catch (error) {
      console.error('Failed to fetch active now count:', error);
    } finally {
      setActiveNowLoading(false);
    }
  }

  async function fetchMemberDetails(memberId) {
    try {
      const res = await fetch(`/api/admin/members/detail?memberId=${encodeURIComponent(memberId)}&period=${period}`);
      const data = await res.json();
      setMemberDetails(data);
    } catch (error) {
      console.error('Failed to fetch member details:', error);
    }
  }

  function handleRowClick(memberId) {
    if (selectedMember === memberId) {
      setSelectedMember(null);
      setMemberDetails(null);
    } else {
      setSelectedMember(memberId);
      fetchMemberDetails(memberId);
    }
  }

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <Link href="/academy/admin" style={{ color: 'var(--ar-orange)', textDecoration: 'none', marginBottom: '16px', display: 'inline-block' }}>
          ← Back to Dashboard
        </Link>
        <h1 className="ar-admin-title">Member Analytics</h1>
        <p className="ar-admin-subtitle">Member activity and engagement</p>
      </div>

      {/* Active Now Tile */}
      <div className="ar-admin-kpi-grid" style={{ marginBottom: '24px' }}>
        <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
          <div className="ar-admin-kpi-label">Logged In Right Now</div>
          <div className="ar-admin-kpi-value">
            {activeNowLoading ? '...' : activeNowCount}
          </div>
          <div className="ar-admin-kpi-period">
            {lastUpdated 
              ? `Updated ${lastUpdated.toLocaleTimeString()}`
              : 'Refreshing every 5 minutes'
            }
          </div>
        </div>
      </div>

      <div className="ar-admin-filters">
        <select
          className="ar-admin-select"
          value={period}
          onChange={(e) => router.push({ query: { ...router.query, period: e.target.value } })}
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>
      </div>

      {loading ? (
        <div className="ar-admin-loading">Loading members...</div>
      ) : members.length === 0 ? (
        <div className="ar-admin-empty">No members found</div>
      ) : (
        <>
          <SortableTable
            columns={[
              {
                key: 'member_id',
                label: 'Member ID',
                sortValue: (m) => m.member_id || '',
                render: (m) => (
                  <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {m.member_id?.substring(0, 12)}...
                  </span>
                ),
              },
              { key: 'email', label: 'Email', sortValue: (m) => m.email || '' },
              { key: 'event_count', label: 'Events', sortValue: (m) => m.event_count ?? 0 },
              { key: 'module_opens', label: 'Module Opens', sortValue: (m) => m.module_opens ?? 0 },
              {
                key: 'unique_modules_opened',
                label: 'Unique Modules',
                sortValue: (m) => m.unique_modules_opened ?? 0,
              },
              {
                key: 'last_seen_at',
                label: 'Last Seen',
                sortValue: (m) => m.last_seen_at || '',
                render: (m) => (m.last_seen_at ? new Date(m.last_seen_at).toLocaleString() : '-'),
              },
            ]}
            rows={members}
            rowKey={(m) => m.member_id}
            defaultSort="last_seen_at"
            defaultDir="desc"
            wrapperClassName="ar-admin-card"
            onRowClick={(m) => handleRowClick(m.member_id)}
          />

          {selectedMember && memberDetails && (
            <div className="ar-admin-card" style={{ marginTop: '24px' }}>
              <h2 className="ar-admin-card-title">
                Details: {memberDetails.email || selectedMember}
              </h2>
              
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Recent Events
                </h3>
                <SortableTable
                  columns={[
                    {
                      key: 'created_at',
                      label: 'Timestamp',
                      sortValue: (e) => e.created_at || '',
                      render: (e) => new Date(e.created_at).toLocaleString(),
                    },
                    { key: 'event_type', label: 'Event Type', sortValue: (e) => e.event_type || '' },
                    { key: 'title', label: 'Title', sortValue: (e) => e.title || '' },
                    {
                      key: 'path',
                      label: 'Path',
                      sortValue: (e) => e.path || '',
                      render: (e) => (
                        <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{e.path || '-'}</span>
                      ),
                    },
                  ]}
                  rows={memberDetails.recent_events || []}
                  rowKey={(e) => e.id}
                  defaultSort="created_at"
                  defaultDir="desc"
                />
              </div>

              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Modules Opened
                </h3>
                <SortableTable
                  columns={[
                    {
                      key: 'module',
                      label: 'Module',
                      sortValue: (m) => m.title || m.path || '',
                      render: (m) => m.title || m.path,
                    },
                    { key: 'opens', label: 'Opens', sortValue: (m) => m.opens ?? 0 },
                    {
                      key: 'last_at',
                      label: 'Last Opened',
                      sortValue: (m) => m.last_at || '',
                      render: (m) => new Date(m.last_at).toLocaleString(),
                    },
                  ]}
                  rows={memberDetails.modules_opened || []}
                  rowKey={(m, i) => m.path || m.title || i}
                  defaultSort="opens"
                  defaultDir="desc"
                />
              </div>

              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Exam Summary
                </h3>
                <SortableTable
                  columns={[
                    { key: 'module_id', label: 'Module ID', sortValue: (e) => e.module_id || '' },
                    {
                      key: 'score_percent',
                      label: 'Score',
                      sortValue: (e) => e.score_percent ?? -1,
                      render: (e) => `${e.score_percent}%`,
                    },
                    {
                      key: 'passed',
                      label: 'Passed',
                      sortValue: (e) => (e.passed ? 1 : 0),
                      render: (e) => (e.passed ? '✓' : '✗'),
                    },
                    { key: 'attempt', label: 'Attempt', sortValue: (e) => e.attempt ?? 0 },
                    {
                      key: 'created_at',
                      label: 'Date',
                      sortValue: (e) => e.created_at || '',
                      render: (e) => new Date(e.created_at).toLocaleString(),
                    },
                  ]}
                  rows={memberDetails.exams || []}
                  rowKey={(e) => e.id}
                  defaultSort="created_at"
                  defaultDir="desc"
                />
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
