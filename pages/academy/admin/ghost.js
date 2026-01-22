// /pages/academy/admin/ghost.js
// Ghost Login - View any member's dashboard as they see it

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function GhostLogin() {
  const router = useRouter();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filteredMembers, setFilteredMembers] = useState([]);
  const [sortConfig, setSortConfig] = useState({ field: 'updated_at', direction: 'desc' });

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
        aVal = a.plan_summary?.plan_type || '';
        bVal = b.plan_summary?.plan_type || '';
      } else if (sortConfig.field === 'last_login') {
        aVal = a.last_login || '';
        bVal = b.last_login || '';
      } else if (sortConfig.field === 'last_seen') {
        aVal = a.last_seen || '';
        bVal = b.last_seen || '';
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
      const res = await fetch('/api/admin/members?limit=1000');
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
    // Open dashboard in new tab with ghost parameter
    const dashboardUrl = `https://www.alanranger.com/academy/dashboard?ghostEmail=${encodeURIComponent(member.email || '')}`;
    window.open(dashboardUrl, '_blank', 'noopener,noreferrer');
  }

  return (
    <div className="ar-admin-container">
      <div style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: 800, color: 'var(--ar-text)', marginBottom: '8px' }}>
          👻 Ghost Login
        </h1>
        <p style={{ color: 'var(--ar-text-muted)', fontSize: '14px', lineHeight: '1.6' }}>
          View any member's dashboard exactly as they see it. Click on a member to open their dashboard in a new tab.
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
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--ar-text-muted)' }}>
          Loading members...
        </div>
      ) : (
        <>
          <div style={{ marginBottom: '16px', color: 'var(--ar-text-muted)', fontSize: '14px' }}>
            Showing {filteredMembers.length} of {members.length} members
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
                      <td colSpan="6" style={{ textAlign: 'center', padding: '40px', color: 'var(--ar-text-muted)' }}>
                        {searchQuery ? 'No members found matching your search.' : 'No members found.'}
                      </td>
                    </tr>
                  ) : (
                    filteredMembers.map((member) => (
                      <tr
                        key={member.member_id}
                        style={{
                          borderBottom: '1px solid var(--ar-border)',
                          transition: 'background 0.2s ease',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'rgba(229, 114, 0, 0.05)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
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
                          {member.plan_summary ? (
                            <span style={{
                              padding: '4px 8px',
                              borderRadius: '4px',
                              fontSize: '12px',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              background: member.plan_summary.plan_type === 'annual' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(245, 158, 11, 0.2)',
                              color: member.plan_summary.plan_type === 'annual' ? '#22c55e' : '#f59e0b'
                            }}>
                              {member.plan_summary.plan_type || 'Unknown'} • {member.plan_summary.status || 'Unknown'}
                            </span>
                          ) : (
                            <span style={{ color: 'var(--ar-text-muted)', fontSize: '13px' }}>—</span>
                          )}
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
                    ))
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
