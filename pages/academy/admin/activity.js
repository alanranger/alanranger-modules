import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ActivityPage() {
  const router = useRouter();
  const { period = '30d', event_type, category, member_id, path } = router.query;
  
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    period: period,
    event_type: event_type || '',
    category: category || '',
    member_id: member_id || '',
    path: path || ''
  });

  useEffect(() => {
    fetchEvents();
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

  function handleFilterChange(key, value) {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    router.push({
      pathname: '/academy/admin/activity',
      query: Object.fromEntries(
        Object.entries(newFilters).filter(([_, v]) => v)
      )
    });
  }

  function exportCSV() {
    const headers = ['Timestamp', 'Event Type', 'Member ID', 'Email', 'Title', 'Path', 'Category'];
    const rows = events.map(e => [
      new Date(e.created_at).toLocaleString(),
      e.event_type,
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
        <Link href="/academy/admin" style={{ color: 'var(--ar-orange)', textDecoration: 'none', marginBottom: '16px', display: 'inline-block' }}>
          ← Back to Dashboard
        </Link>
        <h1 className="ar-admin-title">Activity Stream</h1>
        <p className="ar-admin-subtitle">All Academy events and user activity</p>
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
                <th>Timestamp</th>
                <th>Event Type</th>
                <th>Member ID</th>
                <th>Email</th>
                <th>Title</th>
                <th>Path</th>
                <th>Category</th>
                <th>Meta</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td>{new Date(event.created_at).toLocaleString()}</td>
                  <td>{event.event_type}</td>
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
