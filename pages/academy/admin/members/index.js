// /pages/academy/admin/members/index.js
// Members directory page with filters and table

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function MembersDirectory() {
  const router = useRouter();
  const { sort = 'updated_at', order = 'desc' } = router.query;
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 0 });
  const [sortConfig, setSortConfig] = useState({ field: sort, direction: order });
  
  // Filters
  const [planFilter, setPlanFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [lastSeenFilter, setLastSeenFilter] = useState('');

  useEffect(() => {
    // Read filters from URL query params
    const { plan, status, search, last_seen, page, sort, order } = router.query;
    if (plan) setPlanFilter(plan);
    if (status) setStatusFilter(status);
    if (search) setSearchQuery(search);
    if (last_seen) setLastSeenFilter(last_seen);
    if (page) setPagination(prev => ({ ...prev, page: parseInt(page) }));
    if (sort) {
      setSortConfig({ field: sort, direction: order || 'desc' });
    } else {
      // Default sort if not specified
      setSortConfig({ field: 'updated_at', direction: 'desc' });
    }
    
    fetchMembers();
  }, [router.query]);

  useEffect(() => {
    fetchMembers();
  }, [pagination.page]);

  async function fetchMembers() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('page', pagination.page);
      params.append('limit', pagination.limit);
      if (planFilter) params.append('plan', planFilter);
      if (statusFilter) params.append('status', statusFilter);
      if (searchQuery) params.append('search', searchQuery);
      if (lastSeenFilter) params.append('last_seen', lastSeenFilter);
      // Add sort parameters for server-side sorting
      if (sortConfig.field) {
        params.append('sort', sortConfig.field);
        params.append('order', sortConfig.direction);
      }

      const res = await fetch(`/api/admin/members?${params.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      
      const data = await res.json();
      // Members are already sorted on the server, no need for client-side sorting
      setMembers(data.members || []);
      setPagination(data.pagination || pagination);
    } catch (error) {
      console.error('Failed to fetch members:', error);
    } finally {
      setLoading(false);
    }
  }

  function handleFilterChange() {
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...(planFilter && { plan: planFilter }),
        ...(statusFilter && { status: statusFilter }),
        ...(searchQuery && { search: searchQuery }),
        ...(lastSeenFilter && { last_seen: lastSeenFilter }),
        sort: sortConfig.field,
        order: sortConfig.direction
      }
    });
    fetchMembers();
  }

  function handleSort(field) {
    const direction = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    const newSortConfig = { field, direction };
    setSortConfig(newSortConfig);
    
    // Reset to page 1 when sorting changes
    setPagination(prev => ({ ...prev, page: 1 }));
    
    // Update URL to persist sort
    router.push({
      pathname: '/academy/admin/members',
      query: {
        ...router.query,
        sort: field,
        order: direction,
        page: 1 // Reset to page 1
      }
    }, undefined, { shallow: false }); // Use shallow: false to ensure proper navigation
    
    // fetchMembers will be called by useEffect when router.query changes
  }

  function getSortIcon(field) {
    if (sortConfig.field !== field) {
      return '↕️'; // Neutral
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  }

  function formatDate(dateString) {
    if (!dateString) return 'Never';
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 className="ar-admin-title">Members Directory</h1>
            <p className="ar-admin-subtitle">View and filter all academy members</p>
          </div>
        </div>

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
        <Link href="/academy/admin/ghost" style={{
          padding: '8px 16px',
          background: 'transparent',
          border: '1px solid transparent',
          borderRadius: '6px',
          color: 'var(--ar-text-muted)',
          textDecoration: 'none',
          fontWeight: 500,
          fontSize: '14px'
        }}>
          Ghost
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

        {/* Filters */}
        <div className="ar-admin-card" style={{ marginBottom: '24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Plan</label>
              <select
                value={planFilter}
                onChange={(e) => setPlanFilter(e.target.value)}
                onBlur={handleFilterChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              >
                <option value="">All Plans</option>
                <option value="trial">Trial</option>
                <option value="paid">Paid</option>
                <option value="annual">Annual</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Status</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                onBlur={handleFilterChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              >
                <option value="">All Status</option>
                <option value="active">Active</option>
                <option value="trialing">Trialing</option>
                <option value="canceled">Canceled</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Last Seen</label>
              <select
                value={lastSeenFilter}
                onChange={(e) => setLastSeenFilter(e.target.value)}
                onBlur={handleFilterChange}
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              >
                <option value="">Any Time</option>
                <option value="24h">Last 24h</option>
                <option value="7d">Last 7d</option>
                <option value="30d">Last 30d</option>
                <option value="never">Never</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '6px', fontSize: '12px', color: 'var(--ar-text-muted)' }}>Search</label>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleFilterChange()}
                placeholder="Name or email..."
                style={{
                  width: '100%',
                  padding: '8px',
                  background: 'var(--ar-bg)',
                  border: '1px solid var(--ar-border)',
                  borderRadius: '6px',
                  color: 'var(--ar-text)',
                  fontSize: '14px'
                }}
              />
            </div>
          </div>
        </div>

        {/* Members Table */}
        {loading ? (
          <div className="ar-admin-loading">Loading members...</div>
        ) : (
          <div className="ar-admin-card">
            <div style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h2 className="ar-admin-card-title">Members ({pagination.total})</h2>
            </div>
            
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--ar-border)' }}>
                    <th 
                      onClick={() => handleSort('name')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Name {getSortIcon('name')}
                    </th>
                    <th 
                      onClick={() => handleSort('email')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Email {getSortIcon('email')}
                    </th>
                    <th 
                      onClick={() => handleSort('plan_name')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Plan {getSortIcon('plan_name')}
                    </th>
                    <th 
                      onClick={() => handleSort('status')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Status {getSortIcon('status')}
                    </th>
                    <th 
                      onClick={() => handleSort('plan_expiry_date')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Expires {getSortIcon('plan_expiry_date')}
                    </th>
                    <th 
                      onClick={() => handleSort('signed_up')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Signed Up {getSortIcon('signed_up')}
                    </th>
                    <th 
                      onClick={() => handleSort('last_seen')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Last Seen {getSortIcon('last_seen')}
                    </th>
                    <th 
                      onClick={() => handleSort('modules_opened_unique')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Modules {getSortIcon('modules_opened_unique')}
                    </th>
                    <th 
                      onClick={() => handleSort('exams_attempted')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Exams {getSortIcon('exams_attempted')}
                    </th>
                    <th 
                      onClick={() => handleSort('bookmarks_count')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Bookmarks {getSortIcon('bookmarks_count')}
                    </th>
                    <th 
                      onClick={() => handleSort('photography_style')}
                      style={{ padding: '12px', textAlign: 'left', fontSize: '12px', color: 'var(--ar-text-muted)', fontWeight: 600, cursor: 'pointer', userSelect: 'none' }}
                    >
                      Type {getSortIcon('photography_style')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {members.length === 0 ? (
                    <tr>
                      <td colSpan="11" style={{ padding: '24px', textAlign: 'center', color: 'var(--ar-text-muted)' }}>
                        No members found
                      </td>
                    </tr>
                  ) : (
                    members.map((member) => (
                      <tr 
                        key={member.member_id}
                        onClick={() => router.push(`/academy/admin/members/${member.member_id}`)}
                        style={{
                          borderBottom: '1px solid var(--ar-border)',
                          cursor: 'pointer',
                          transition: 'background 0.2s'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 165, 0, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{member.name || '—'}</td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{member.email || '—'}</td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{member.plan_name}</td>
                        <td style={{ padding: '12px' }}>
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
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {member.plan_expiry_date ? formatDate(member.plan_expiry_date) : '—'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {formatDate(member.signed_up)}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {formatDate(member.last_seen)}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                          {member.modules_opened_unique} / {member.modules_opened_total}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>
                          {member.exams_attempted > 0 ? `${member.exams_passed} / ${member.exams_attempted}` : '0 / 0'}
                        </td>
                        <td style={{ padding: '12px', color: 'var(--ar-text)' }}>{member.bookmarks_count}</td>
                        <td style={{ padding: '12px', color: 'var(--ar-text-muted)', fontSize: '13px' }}>
                          {member.photography_style || '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pagination.totalPages > 1 && (
              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'center', gap: '8px' }}>
                <button
                  onClick={() => {
                    setPagination({ ...pagination, page: pagination.page - 1 });
                    fetchMembers();
                  }}
                  disabled={pagination.page === 1}
                  className="ar-admin-btn-secondary"
                >
                  Previous
                </button>
                <span style={{ padding: '8px 16px', color: 'var(--ar-text-muted)' }}>
                  Page {pagination.page} of {pagination.totalPages}
                </span>
                <button
                  onClick={() => {
                    setPagination({ ...pagination, page: pagination.page + 1 });
                    fetchMembers();
                  }}
                  disabled={pagination.page >= pagination.totalPages}
                  className="ar-admin-btn-secondary"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
