import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

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
          <div className="ar-admin-card">
            <table className="ar-admin-table">
              <thead>
                <tr>
                  <th>Member ID</th>
                  <th>Email</th>
                  <th>Events</th>
                  <th>Module Opens</th>
                  <th>Unique Modules</th>
                  <th>Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr 
                    key={member.member_id}
                    onClick={() => handleRowClick(member.member_id)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                      {member.member_id?.substring(0, 12)}...
                    </td>
                    <td>{member.email || '-'}</td>
                    <td>{member.event_count}</td>
                    <td>{member.module_opens}</td>
                    <td>{member.unique_modules_opened}</td>
                    <td>
                      {member.last_seen_at 
                        ? new Date(member.last_seen_at).toLocaleString()
                        : '-'
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {selectedMember && memberDetails && (
            <div className="ar-admin-card" style={{ marginTop: '24px' }}>
              <h2 className="ar-admin-card-title">
                Details: {memberDetails.email || selectedMember}
              </h2>
              
              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Recent Events
                </h3>
                <table className="ar-admin-table">
                  <thead>
                    <tr>
                      <th>Timestamp</th>
                      <th>Event Type</th>
                      <th>Title</th>
                      <th>Path</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberDetails.recent_events?.map((event) => (
                      <tr key={event.id}>
                        <td>{new Date(event.created_at).toLocaleString()}</td>
                        <td>{event.event_type}</td>
                        <td>{event.title || '-'}</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                          {event.path || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Modules Opened
                </h3>
                <table className="ar-admin-table">
                  <thead>
                    <tr>
                      <th>Module</th>
                      <th>Opens</th>
                      <th>Last Opened</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberDetails.modules_opened?.map((module, idx) => (
                      <tr key={idx}>
                        <td>{module.title || module.path}</td>
                        <td>{module.opens}</td>
                        <td>{new Date(module.last_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div>
                <h3 style={{ fontSize: '16px', marginBottom: '12px', color: 'var(--ar-orange)' }}>
                  Exam Summary
                </h3>
                <table className="ar-admin-table">
                  <thead>
                    <tr>
                      <th>Module ID</th>
                      <th>Score</th>
                      <th>Passed</th>
                      <th>Attempt</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {memberDetails.exams?.map((exam) => (
                      <tr key={exam.id}>
                        <td>{exam.module_id}</td>
                        <td>{exam.score_percent}%</td>
                        <td>{exam.passed ? '✓' : '✗'}</td>
                        <td>{exam.attempt}</td>
                        <td>{new Date(exam.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
