import { useState, useEffect } from 'react';
import Link from 'next/link';

export default function AdminDashboard() {
  const [kpis, setKpis] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchKPIs();
  }, []);

  async function fetchKPIs() {
    try {
      const res = await fetch('/api/admin/kpis');
      const data = await res.json();
      setKpis(data);
    } catch (error) {
      console.error('Failed to fetch KPIs:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="ar-admin-container">
        <div className="ar-admin-loading">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <h1 className="ar-admin-title">Admin Analytics Dashboard</h1>
        <p className="ar-admin-subtitle">Academy activity and engagement metrics</p>
      </div>

      {/* KPI Tiles Row 1 */}
      <div className="ar-admin-kpi-grid">
        <Link href="/academy/admin/activity?period=24h" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Active Members</div>
          <div className="ar-admin-kpi-value">{kpis?.activeMembers24h || 0}</div>
          <div className="ar-admin-kpi-period">24 hours</div>
        </Link>
        <Link href="/academy/admin/activity?period=7d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Active Members</div>
          <div className="ar-admin-kpi-value">{kpis?.activeMembers7d || 0}</div>
          <div className="ar-admin-kpi-period">7 days</div>
        </Link>
        <Link href="/academy/admin/activity?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Active Members</div>
          <div className="ar-admin-kpi-value">{kpis?.activeMembers30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/modules?period=24h" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Module Opens</div>
          <div className="ar-admin-kpi-value">{kpis?.moduleOpens24h || 0}</div>
          <div className="ar-admin-kpi-period">24 hours</div>
        </Link>
        <Link href="/academy/admin/modules?period=7d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Module Opens</div>
          <div className="ar-admin-kpi-value">{kpis?.moduleOpens7d || 0}</div>
          <div className="ar-admin-kpi-period">7 days</div>
        </Link>
        <Link href="/academy/admin/modules?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Module Opens</div>
          <div className="ar-admin-kpi-value">{kpis?.moduleOpens30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
      </div>

      {/* KPI Tiles Row 2 */}
      <div className="ar-admin-kpi-grid">
        <Link href="/academy/admin/modules?period=30d&unique=true" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Unique Modules Opened</div>
          <div className="ar-admin-kpi-value">{kpis?.uniqueModules30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/activity?event_type=bookmark_add&period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Bookmarks Added</div>
          <div className="ar-admin-kpi-value">{kpis?.bookmarks30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/exams?period=30d" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Exam Attempts</div>
          <div className="ar-admin-kpi-value">{kpis?.examAttempts30d || 0}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
        <Link href="/academy/admin/exams?period=30d&metric=pass_rate" className="ar-admin-kpi-tile">
          <div className="ar-admin-kpi-label">Pass Rate</div>
          <div className="ar-admin-kpi-value">{kpis?.passRate30d ? `${kpis.passRate30d}%` : '0%'}</div>
          <div className="ar-admin-kpi-period">30 days</div>
        </Link>
      </div>

      {/* Top Lists */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px', marginTop: '32px' }}>
        <div className="ar-admin-card">
          <h2 className="ar-admin-card-title">Top 20 Modules by Opens (30d)</h2>
          <TopModulesList />
        </div>
        <div className="ar-admin-card">
          <h2 className="ar-admin-card-title">Most Active Members (30d)</h2>
          <TopMembersList />
        </div>
      </div>
    </div>
  );
}

function TopModulesList() {
  const [modules, setModules] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/top-modules?limit=20&period=30d')
      .then(res => res.json())
      .then(data => {
        setModules(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch top modules:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="ar-admin-loading">Loading...</div>;
  if (modules.length === 0) return <div className="ar-admin-empty">No data available</div>;

  return (
    <table className="ar-admin-table">
      <thead>
        <tr>
          <th>Module</th>
          <th>Opens</th>
          <th>Unique</th>
        </tr>
      </thead>
      <tbody>
        {modules.map((module, idx) => (
          <tr key={idx}>
            <td>{module.title || module.path}</td>
            <td>{module.opens}</td>
            <td>{module.unique_openers}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TopMembersList() {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/admin/top-members?limit=20&period=30d')
      .then(res => res.json())
      .then(data => {
        setMembers(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch top members:', err);
        setLoading(false);
      });
  }, []);

  if (loading) return <div className="ar-admin-loading">Loading...</div>;
  if (members.length === 0) return <div className="ar-admin-empty">No data available</div>;

  return (
    <table className="ar-admin-table">
      <thead>
        <tr>
          <th>Member</th>
          <th>Events</th>
          <th>Modules</th>
        </tr>
      </thead>
      <tbody>
        {members.map((member, idx) => (
          <tr key={idx}>
            <td>{member.email || member.member_id || 'Unknown'}</td>
            <td>{member.event_count}</td>
            <td>{member.module_opens}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
