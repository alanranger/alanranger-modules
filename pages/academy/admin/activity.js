import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ActivityPage() {
  const router = useRouter();
  const { period = '30d', event_type, category, member_id, path, sort = 'created_at', order = 'desc' } = router.query;
  
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState(null);
  const [sortConfig, setSortConfig] = useState({ field: sort, direction: order });
  const [filters, setFilters] = useState({
    period: period,
    event_type: event_type || '',
    category: category || '',
    member_id: member_id || '',
    path: path || ''
  });

  useEffect(() => {
    fetchEvents();
    fetchKPIs();
  }, [router.query]);

  async function fetchEvents() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        period: filters.period,
        ...(filters.event_type && { event_type: filters.event_type }),
        ...(filters.category && { category: filters.category }),
        ...(filters.member_id && { member_id: filters.member_id }),
        ...(filters.path && { path: filters.path })
      });
      
      const res = await fetch(`/api/admin/activity?${params}`);
      const data = await res.json();
      setEvents(data);
    } catch (error) {
      console.error('Failed to fetch events:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchKPIs() {
    try {
      const res = await fetch('/api/admin/overview');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setKpis(data);
    } catch (error) {
      console.error('Failed to fetch KPIs:', error);
    }
  }

  function handleFilterChange(key, value) {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    router.push({
      pathname: '/academy/admin/activity',
      query: {
        ...Object.fromEntries(Object.entries(newFilters).filter(([_, v]) => v)),
        sort: sortConfig.field,
        order: sortConfig.direction
      }
    });
  }

  function handleSort(field) {
    const direction = sortConfig.field === field && sortConfig.direction === 'asc' ? 'desc' : 'asc';
    const newSortConfig = { field, direction };
    setSortConfig(newSortConfig);
    
    // Sort events locally
    const sorted = [...events].sort((a, b) => {
      let aVal = a[field];
      let bVal = b[field];
      
      // Handle null/undefined values
      if (aVal == null) aVal = '';
      if (bVal == null) bVal = '';
      
      // Handle dates
      if (field === 'created_at' || field === 'timestamp') {
        aVal = new Date(aVal).getTime();
        bVal = new Date(bVal).getTime();
      }
      
      // Handle strings
      if (typeof aVal === 'string') aVal = aVal.toLowerCase();
      if (typeof bVal === 'string') bVal = bVal.toLowerCase();
      
      if (direction === 'asc') {
        return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
      } else {
        return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
      }
    });
    
    setEvents(sorted);
    
    router.push({
      pathname: '/academy/admin/activity',
      query: {
        ...router.query,
        sort: field,
        order: direction
      }
    });
  }

  function getSortIcon(field) {
    if (sortConfig.field !== field) {
      return '↕️'; // Neutral
    }
    return sortConfig.direction === 'asc' ? '↑' : '↓';
  }

  function exportCSV() {
    const headers = ['Timestamp', 'Event Type', 'Name', 'Member ID', 'Email', 'Title', 'Path', 'Category'];
    const rows = events.map(e => [
      new Date(e.created_at).toLocaleString(),
      e.event_type,
      e.member_name || '',
      e.member_id || '',
      e.email || '',
      e.title || '',
      e.path || '',
      e.category || ''
    ]);
    
    const csv = [headers, ...rows].map(row => 
      row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
    ).join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `academy-activity-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  }

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 className="ar-admin-title">Activity Stream</h1>
            <p className="ar-admin-subtitle">All Academy events and user activity</p>
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
          <Link href="/academy/admin/activity" style={{
            padding: '8px 16px',
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '6px',
            color: 'var(--ar-text)',
            textDecoration: 'none',
            fontWeight: 600,
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
      </div>

      {/* Activity Metrics Tiles */}
      <div className="ar-admin-kpi-grid" style={{ marginBottom: '24px' }}>
        <Link href="/academy/admin/modules?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Avg Modules Opened</div>
          <div className="ar-admin-kpi-value">{kpis?.avgModulesOpened30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days per member</div>
        </Link>
        <Link href="/academy/admin/modules?period=30d&unique=true" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Unique Modules</div>
          <div className="ar-admin-kpi-value">{kpis?.uniqueModulesOpened30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/activity?event_type=bookmark_add&period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Bookmarks Added</div>
          <div className="ar-admin-kpi-value">{kpis?.bookmarks30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
      </div>

      <div className="ar-admin-filters">
        <select
          className="ar-admin-select"
          value={filters.period}
          onChange={(e) => handleFilterChange('period', e.target.value)}
        >
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
        </select>

        <select
          className="ar-admin-select"
          value={filters.event_type}
          onChange={(e) => handleFilterChange('event_type', e.target.value)}
        >
          <option value="">All Event Types</option>
          <option value="module_open">Module Open</option>
          <option value="bookmark_add">Bookmark Add</option>
          <option value="bookmark_remove">Bookmark Remove</option>
          <option value="exam_start">Exam Start</option>
          <option value="exam_submit">Exam Submit</option>
          <option value="login">Login</option>
        </select>

        <select
          className="ar-admin-select"
          value={filters.category}
          onChange={(e) => handleFilterChange('category', e.target.value)}
        >
          <option value="">All Categories</option>
          <option value="camera">Camera</option>
          <option value="gear">Gear</option>
          <option value="composition">Composition</option>
          <option value="genre">Genre</option>
        </select>

        <input
          type="text"
          className="ar-admin-input"
          placeholder="Member ID"
          value={filters.member_id}
          onChange={(e) => handleFilterChange('member_id', e.target.value)}
          style={{ minWidth: '200px' }}
        />

        <input
          type="text"
          className="ar-admin-input"
          placeholder="Path contains"
          value={filters.path}
          onChange={(e) => handleFilterChange('path', e.target.value)}
          style={{ minWidth: '200px' }}
        />

        <button className="ar-admin-btn" onClick={exportCSV}>
          Export CSV
        </button>
      </div>

      {loading ? (
        <div className="ar-admin-loading">Loading events...</div>
      ) : events.length === 0 ? (
        <div className="ar-admin-empty">No events found</div>
      ) : (
        <div className="ar-admin-card">
          <table className="ar-admin-table">
            <thead>
              <tr>
                <th 
                  onClick={() => handleSort('created_at')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Timestamp {getSortIcon('created_at')}
                </th>
                <th 
                  onClick={() => handleSort('event_type')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Event Type {getSortIcon('event_type')}
                </th>
                <th 
                  onClick={() => handleSort('member_name')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Name {getSortIcon('member_name')}
                </th>
                <th 
                  onClick={() => handleSort('member_id')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Member ID {getSortIcon('member_id')}
                </th>
                <th 
                  onClick={() => handleSort('email')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Email {getSortIcon('email')}
                </th>
                <th 
                  onClick={() => handleSort('title')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Title {getSortIcon('title')}
                </th>
                <th 
                  onClick={() => handleSort('path')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Path {getSortIcon('path')}
                </th>
                <th 
                  onClick={() => handleSort('category')}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  Category {getSortIcon('category')}
                </th>
                <th>Meta</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td>{event.event_type}</td>
                  <td>{event.member_name || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {event.member_id ? event.member_id.substring(0, 12) + '...' : '-'}
                  </td>
                  <td>{event.email || '-'}</td>
                  <td>{event.title || '-'}</td>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {event.path || '-'}
                  </td>
                  <td>{event.category || '-'}</td>
                  <td>
                    {Object.keys(event.meta || {}).length > 0 ? (
                      <details>
                        <summary style={{ cursor: 'pointer', color: 'var(--ar-orange)' }}>
                          View
                        </summary>
                        <pre style={{ marginTop: '8px', fontSize: '11px', color: 'var(--ar-text-muted)' }}>
                          {JSON.stringify(event.meta, null, 2)}
                        </pre>
                      </details>
                    ) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
