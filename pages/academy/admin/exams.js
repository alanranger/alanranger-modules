import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';

export default function ExamsPage() {
  const router = useRouter();
  const { period = '30d', metric } = router.query;
  
  const [exams, setExams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    fetchExams();
    fetchStats();
  }, [router.query]);

  async function fetchExams() {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/exams?period=${period}`);
      const data = await res.json();
      setExams(data);
    } catch (error) {
      console.error('Failed to fetch exams:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchStats() {
    try {
      const res = await fetch(`/api/admin/exams/stats?period=${period}`);
      const data = await res.json();
      setStats(data);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  }

  return (
    <div className="ar-admin-container">
      <div className="ar-admin-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '24px' }}>
          <div>
            <h1 className="ar-admin-title">Exam Analytics</h1>
            <p className="ar-admin-subtitle">Exam attempts, pass rates, and performance</p>
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
            background: 'var(--ar-card)',
            border: '1px solid var(--ar-border)',
            borderRadius: '6px',
            color: 'var(--ar-text)',
            textDecoration: 'none',
            fontWeight: 600,
            fontSize: '14px'
          }}>
            Exams
          </Link>
        </div>
      </div>

      {stats && (
        <div className="ar-admin-kpi-grid" style={{ marginBottom: '32px' }}>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Total Attempts</div>
            <div className="ar-admin-kpi-value">{stats.total_attempts}</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Passed</div>
            <div className="ar-admin-kpi-value">{stats.passed}</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Failed</div>
            <div className="ar-admin-kpi-value">{stats.failed}</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Pass Rate</div>
            <div className="ar-admin-kpi-value">{stats.pass_rate}%</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
          <div className="ar-admin-kpi-tile" style={{ cursor: 'default' }}>
            <div className="ar-admin-kpi-label">Avg Score</div>
            <div className="ar-admin-kpi-value">{stats.avg_score}%</div>
            <div className="ar-admin-kpi-period">{period}</div>
          </div>
        </div>
      )}

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
        <div className="ar-admin-loading">Loading exams...</div>
      ) : exams.length === 0 ? (
        <div className="ar-admin-empty">No exam results found</div>
      ) : (
        <div className="ar-admin-card">
          <table className="ar-admin-table">
            <thead>
              <tr>
                <th>Member ID</th>
                <th>Email</th>
                <th>Module ID</th>
                <th>Score</th>
                <th>Passed</th>
                <th>Attempt</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((exam) => (
                <tr key={exam.id}>
                  <td style={{ fontFamily: 'monospace', fontSize: '12px' }}>
                    {exam.memberstack_id?.substring(0, 12)}...
                  </td>
                  <td>{exam.email || '-'}</td>
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
      )}
    </div>
  );
}
