// /pages/academy/admin/ghost.js
// Ghost Login - View any member's dashboard as they see it
// v1.1.1 — badge level column (shared with all admin member tables)

import { useState, useEffect, Fragment } from 'react';
import Link from 'next/link';
import BadgeLevelCell from '../../../components/admin/BadgeLevelCell';

function GateRow({ label, met, children }) {
  return (
    <div style={{
      border: '1px solid var(--ar-border)',
      borderRadius: '8px',
      padding: '12px',
      marginBottom: '10px',
      background: met ? 'rgba(34, 197, 94, 0.08)' : 'rgba(255,255,255,0.02)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
        <strong style={{ color: 'var(--ar-text)' }}>{label}</strong>
        <span style={{
          fontSize: '12px',
          fontWeight: 700,
          color: met ? '#22c55e' : '#f59e0b',
        }}>
          {met ? 'Met' : 'Not met'}
        </span>
      </div>
      <div style={{ fontSize: '13px', color: 'var(--ar-text-muted)', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  );
}

function BadgeBreakdownPanel({ memberId, breakdown, badge, loading, error }) {
  if (loading) {
    return (
      <div style={{ padding: '16px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
        Loading full gate breakdown…
      </div>
    );
  }
  if (error) {
    return (
      <div style={{ padding: '16px', color: '#f87171', fontSize: '13px' }}>
        {error}
      </div>
    );
  }
  if (!breakdown) return null;

  const b = breakdown;
  return (
    <div style={{ padding: '16px 20px', background: 'rgba(0,0,0,0.15)', borderTop: '1px solid var(--ar-border)' }}>
      <div style={{ marginBottom: '12px', fontSize: '13px', color: 'var(--ar-text-muted)' }}>
        Full breakdown via <code>engagement-summary?window=all</code> + <code>lib/academy-badge-gates.js</code>.
        {' '}Current level: <strong style={{ color: 'var(--ar-text)' }}>{badge?.label || '—'}</strong>
        {badge?.paused ? ' (paused — 60-day decay)' : ''}.
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '10px' }}>
        <GateRow label="Foundation" met={b.foundation.met}>
          Modules opened: {b.foundation.modulesOpened} / {b.foundation.modulesTarget}<br />
          Active days (first 14): {b.foundation.activeDaysDegraded ? 'degraded' : b.foundation.activeDaysFirst14} / {b.foundation.activeDaysTarget}
        </GateRow>
        <GateRow label="Practitioner" met={b.practitioner.met}>
          Camera: {b.practitioner.cameraOpened} / {b.practitioner.cameraTarget}<br />
          Composition: {b.practitioner.compositionOpened} / {b.practitioner.compositionTarget}<br />
          PDF assignments: {b.practitioner.pdfAssignmentsOpened} / {b.practitioner.pdfAssignmentsTarget}<br />
          Exams passed: {b.practitioner.examsPassed} / {b.practitioner.examsPassedTarget}
        </GateRow>
        <GateRow label="Certified" met={b.certified.met}>
          Exams passed: {b.certified.examsPassed} / {b.certified.examsPassedTarget}<br />
          Total modules: {b.certified.totalModulesOpened} / {b.certified.totalModulesTarget}
        </GateRow>
        <GateRow label="Graduate" met={b.graduate.met}>
          Applied learning: {b.graduate.appliedLearningOpened ?? '—'}<br />
          Practice packs: {b.graduate.practicePacksOpened ?? '—'}<br />
          PDF assignments: {b.graduate.pdfAssignmentsOpened ?? '—'}<br />
          Active months: {b.graduate.distinctActiveMonthsAllTime ?? '—'}<br />
          Points: {b.graduate.points ?? '—'} / {b.graduate.pointsTarget}
          {b.graduate.requiresConversion ? ' (requires conversion)' : ''}
          {b.graduate.paused ? ' · paused' : ''}
        </GateRow>
        <GateRow label="Master" met={b.master.met}>
          Applied learning: {b.master.appliedLearningOpened ?? '—'}<br />
          Practice packs: {b.master.practicePacksOpened ?? '—'}<br />
          PDF assignments: {b.master.pdfAssignmentsOpened ?? '—'}<br />
          Active months: {b.master.distinctActiveMonthsAllTime ?? '—'}<br />
          Points: {b.master.points ?? '—'} / {b.master.pointsTarget}
          {b.master.requiresGraduate ? ' (requires Graduate)' : ''}
          {b.master.paused ? ' · paused' : ''}
        </GateRow>
      </div>
    </div>
  );
}

export default function GhostLogin() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [sortConfig, setSortConfig] = useState({ field: 'updated_at', direction: 'desc' });
  const [expandedId, setExpandedId] = useState(null);
  const [breakdownById, setBreakdownById] = useState({});

  useEffect(() => {
    fetchMembers();
  }, []);

  useEffect(() => {
    // Filter and sort members
    let filtered = members;
    
    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = members.filter(member => {
        const email = (member.email || '').toLowerCase();
        const name = (member.name || '').toLowerCase();
        const memberId = (member.member_id || '').toLowerCase();
        return email.includes(query) || name.includes(query) || memberId.includes(query);
      });
    }
    
    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let aVal = a[sortConfig.field];
      let bVal = b[sortConfig.field];
      
      // Handle nested fields
      if (sortConfig.field === 'plan') {
        aVal = a.plan_type || a.plan_name || '';
        bVal = b.plan_type || b.plan_name || '';
      } else if (sortConfig.field === 'last_login') {
        aVal = a.last_login || '';
        bVal = b.last_login || '';
      } else if (sortConfig.field === 'last_seen') {
        aVal = a.last_seen || '';
        bVal = b.last_seen || '';
      } else if (sortConfig.field === 'badge_level') {
        aVal = a.badge_label || 'Enrolled';
        bVal = b.badge_label || 'Enrolled';
      }
      
      // Handle null/undefined
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      
      // Handle dates
      if (sortConfig.field === 'last_login' || sortConfig.field === 'last_seen' || sortConfig.field === 'updated_at') {
        aVal = aVal ? new Date(aVal).getTime() : 0;
        bVal = bVal ? new Date(bVal).getTime() : 0;
      }
      
      // Handle strings
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (sortConfig.direction === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
    
    setFilteredMembers(sorted);
  }, [searchQuery, members, sortConfig]);

  function handleSort(field) {
    const direction = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    setSortConfig({ field, direction });
  }

  function getSortIcon(field) {
    if (sortConfig.field !== field) {
      return '↕️';
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  }

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  async function fetchMembers() {
    setLoading(true);
    try {
      // Fetch all members (we'll paginate in the UI)
      const res = await fetch("/api/admin/members?for_ghost=1&limit=2500");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      setMembers(data.members || []);
      setFilteredMembers(data.members || []);
    } catch (error) {
      console.error('Failed to fetch members:', error);
      alert('Failed to load members: ' + error.message);
    } finally {
      setLoading(false);
    }
  }

  function handleGhostLogin(member) {
    const params = new URLSearchParams();
    if (member.member_id) {
      params.set("ghost", member.member_id);
    } else if (member.email) {
      params.set("ghostEmail", member.email);
    }
    const dashboardUrl = `https://www.alanranger.com/academy/dashboard?${params.toString()}`;
    window.open(dashboardUrl, "_blank", "noopener,noreferrer");
  }

  async function toggleBreakdown(member) {
    const id = member.member_id;
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    if (breakdownById[id]?.breakdown || breakdownById[id]?.loading) return;

    setBreakdownById((prev) => ({
      ...prev,
      [id]: { loading: true, error: null, breakdown: null, badge: null },
    }));

    try {
      const res = await fetch(`/api/admin/member-badge-breakdown?memberId=${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setBreakdownById((prev) => ({
        ...prev,
        [id]: {
          loading: false,
          error: null,
          breakdown: data.breakdown,
          badge: data.badge,
        },
      }));
    } catch (err) {
      setBreakdownById((prev) => ({
        ...prev,
        [id]: { loading: false, error: err.message, breakdown: null, badge: null },
      }));
    }
  }

  function renderBadgeLevel(member) {
    return <BadgeLevelCell member={member} />;
  }

  return (
    <div className="ar-admin-container">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ar-text)', marginBottom: '8px' }}>
          👻 Ghost Login
        </h1>
        <p style={{ color: 'var(--ar-text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
          View any member&apos;s dashboard exactly as they see it — including canceled, expired, or trialing accounts
          (same list as <code style={{ fontSize: '13px' }}>ms_members_cache</code>, up to 2500). Click a row or use{' '}
          <strong>View Dashboard</strong> to open a new tab. Requires admin session.
        </p>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by email, name, or member ID..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{
            width: '100%',
            padding: '12px 16px',
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '8px',
            color: 'var(--ar-text)',
            fontSize: '14px',
            outline: 'none'
          }}
        />
      </div>

      {/* Navigation Tabs */}
      <div style={{ 
        display: 'flex', 
        gap: '8px', 
        marginBottom: '20px',
        borderBottom: '1px solid var(--ar-border)',
        paddingBottom: '10px'
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
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Members
        </Link>
        <Link href="/academy/admin/ghost" style={{
          padding: '8px 16px',
          background: 'var(--ar-card)',
          border: '1px solid var(--ar-border)',
          borderRadius: '6px',
          color: 'var(--ar-text)',
          textDecoration: 'none',
          fontWeight: 600,
          fontSize: '14px'
        }}>
          Ghost
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
        <Link href="/academy/admin/qa" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Q&A
        </Link>
        <Link href="/academy/admin/engagement" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Engagement
        </Link>
        <Link href="/academy/admin/emails" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Emails
        </Link>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ar-text-muted)' }}>
          Loading members...
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '16px', color: 'var(--ar-text-muted)', fontSize: '14px' }}>
            Showing {filteredMembers.length} of {members.length} members.
            {' '}Badge column uses Memberstack JSON + exams (Foundation active-days degraded for speed; expand a row for full breakdown).
          </div>

          {/* Members Table */}
          <div className="ar-admin-card">
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--ar-border)' }}>
                    <th style={{ 
                      padding: '12px 16px', 
                      textAlign: 'left', 
                      fontWeight: 700, 
                      color: 'var(--ar-text)',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }} onClick={() => handleSort('name')}>
                      Name {getSortIcon('name')}
                    </th>
                    <th style={{ 
                      padding: '12px 16px', 
                      textAlign: 'left', 
                      fontWeight: 700, 
                      color: 'var(--ar-text)',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }} onClick={() => handleSort('email')}>
                      Email {getSortIcon('email')}
                    </th>
                    <th style={{ 
                      padding: '12px 16px', 
                      textAlign: 'left', 
                      fontWeight: 700, 
                      color: 'var(--ar-text)',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }} onClick={() => handleSort('last_login')}>
                      Last Logged In {getSortIcon('last_login')}
                    </th>
                    <th style={{ 
                      padding: '12px 16px', 
                      textAlign: 'left', 
                      fontWeight: 700, 
                      color: 'var(--ar-text)',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }} onClick={() => handleSort('last_seen')}>
                      Last Seen {getSortIcon('last_seen')}
                    </th>
                    <th style={{ 
                      padding: '12px 16px', 
                      textAlign: 'left', 
                      fontWeight: 700, 
                      color: 'var(--ar-text)',
                      cursor: 'pointer',
                      userSelect: 'none'
                    }} onClick={() => handleSort('plan')}>
                      Plan {getSortIcon('plan')}
                    </th>
                    <th style={{
                      padding: '12px 16px',
                      textAlign: 'left',
                      fontWeight: 700,
                      color: 'var(--ar-text)',
                      cursor: 'pointer',
                      userSelect: 'none',
                    }} onClick={() => handleSort('badge_level')}>
                      Badge level {getSortIcon('badge_level')}
                    </th>
                    <th style={{ 
                      padding: '12px 16px', 
                      textAlign: 'right', 
                      fontWeight: 700, 
                      color: 'var(--ar-text)'
                    }}>
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMembers.length === 0 ? (
                    <tr>
                      <td colSpan="7" style={{ textAlign: 'center', padding: '40px', color: 'var(--ar-text-muted)' }}>
                        {searchQuery ? 'No members found matching your search.' : 'No members found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member) => {
                      const isExpanded = expandedId === member.member_id;
                      const detail = breakdownById[member.member_id];
                      return (
                        <Fragment key={member.member_id}>
                          <tr
                            style={{
                              borderBottom: isExpanded ? 'none' : '1px solid var(--ar-border)',
                              transition: 'background 0.2s ease',
                              cursor: 'pointer',
                              background: isExpanded ? 'rgba(229, 114, 0, 0.06)' : 'transparent',
                            }}
                            onClick={() => toggleBreakdown(member)}
                            onMouseEnter={(e) => {
                              if (!isExpanded) e.currentTarget.style.background = 'rgba(229, 114, 0, 0.05)';
                            }}
                            onMouseLeave={(e) => {
                              if (!isExpanded) e.currentTarget.style.background = 'transparent';
                            }}
                          >
                            <td style={{ padding: '12px 16px', color: 'var(--ar-text)', fontWeight: 600 }}>
                              {member.name || 'No name'}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--ar-text-muted)', fontSize: '14px' }}>
                              {member.email || 'No email'}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                              {formatDate(member.last_login)}
                            </td>
                            <td style={{ padding: '12px 16px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                              {formatDate(member.last_seen)}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {member.plan_type || member.plan_name || member.status ? (
                                <span style={{
                                  padding: '4px 8px',
                                  borderRadius: '4px',
                                  fontSize: '12px',
                                  fontWeight: 600,
                                  textTransform: 'capitalize',
                                  background: member.plan_type === 'annual' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                                  color: member.plan_type === 'annual' ? '#22c55e' : '#f59e0b'
                                }}>
                                  {(member.plan_type || member.plan_name || 'Unknown')} • {(member.status || 'Unknown')}
                                </span>
                              ) : (
                                <span style={{ color: 'var(--ar-text-muted)', fontSize: '13px' }}>—</span>
                              )}
                            </td>
                            <td style={{ padding: '12px 16px' }}>
                              {renderBadgeLevel(member)}
                            </td>
                            <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGhostLogin(member);
                                }}
                                style={{
                                  padding: '6px 12px',
                                  background: 'var(--ar-brand)',
                                  color: '#fff',
                                  border: 'none',
                                  borderRadius: '6px',
                                  fontSize: '12px',
                                  fontWeight: 700,
                                  cursor: 'pointer',
                                  whiteSpace: 'nowrap',
                                  transition: 'all 0.2s ease'
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#ff8c42';
                                  e.currentTarget.style.transform = 'translateY(-1px)';
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = 'var(--ar-brand)';
                                  e.currentTarget.style.transform = 'translateY(0)';
                                }}
                              >
                                👻 View Dashboard
                              </button>
                            </td>
                          </tr>
                          {isExpanded ? (
                            <tr key={`${member.member_id}-detail`}>
                              <td colSpan="7" style={{ padding: 0, borderBottom: '1px solid var(--ar-border)' }}>
                                <BadgeBreakdownPanel
                                  memberId={member.member_id}
                                  breakdown={detail?.breakdown}
                                  badge={detail?.badge}
                                  loading={detail?.loading}
                                  error={detail?.error}
                                />
                              </td>
                            </tr>
                          ) : null}
                        </Fragment>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
